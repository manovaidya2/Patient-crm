const { test } = require('node:test');
const assert = require('node:assert/strict');
const { inventoryView, applyLine, decidePending, looseStock, packedStock } = require('./medicineStock');

let nextId = 1;
const item = (extra = {}) => ({
  _id: String(nextId++), name: 'Oil', unit: 'ml', currentStock: 0, lowStockAt: 1000, reorderLevel: 1500, maxLevel: 4000,
  packs: [], packSizes: [], transactions: [], expiryDate: null, emergency: false, ...extra,
});
const container = (size, count, kind = 'Bottle', unit = 'ml') => item({ name: `${kind} ${size}`, unit: 'piece', currentStock: count, containerSize: size, containerUnit: unit, containerKind: kind });
const run = (act, target, line, { user = { name: 'Store', role: 'medicine_department' }, subType = '', ref = '', meta = {}, containers = [], items = [] } = {}) => {
  const ctx = {
    rows: [], user, subType, ref, note: '', now: new Date(), meta,
    byId: (id) => [target, ...items, ...containers].find((i) => i._id === id) || null,
    findContainer: (it, size) => containers.find((c) => c.containerSize === size && c.containerUnit === (it.unit === 'gram' ? 'g' : 'ml')) || null,
  };
  applyLine(act, target, line, ctx);
  return ctx.rows.map((r) => r.entry);
};

test('status: out, critical, emergency-at-reorder, reorder, over, expired', () => {
  assert.equal(inventoryView(item({ currentStock: 0 })).status, 'out');
  assert.equal(inventoryView(item({ currentStock: 900 })).status, 'critical');
  assert.equal(inventoryView(item({ currentStock: 1000 })).status, 'reorder');
  assert.equal(inventoryView(item({ currentStock: 1400 })).status, 'reorder');
  assert.equal(inventoryView(item({ currentStock: 1400, emergency: true })).status, 'critical');
  assert.equal(inventoryView(item({ currentStock: 2000 })).status, 'ok');
  assert.equal(inventoryView(item({ currentStock: 5000 })).status, 'over');
  assert.equal(inventoryView(item({ currentStock: 2000, expiryDate: new Date(Date.now() - 86400000) })).status, 'expired');
  const soon = inventoryView(item({ currentStock: 2000, expiryDate: new Date(Date.now() + 30 * 86400000) }));
  assert.equal(soon.expiring, true);
  assert.equal(soon.needsAttention, true);
});

test('suggested order is max minus stock only when below reorder; days to last uses the number typed on the medicine, else real use', () => {
  assert.equal(inventoryView(item({ currentStock: 1200 })).suggestedOrder, 2800);
  assert.equal(inventoryView(item({ currentStock: 3000 })).suggestedOrder, 0);
  const used = item({ currentStock: 3000 });
  // first used 10 days ago, 300 then and 300 today => 600 over 10 days = 60 a day; the 60-day-old use is ignored
  used.transactions.push({ type: 'consume', quantity: 300, status: 'done', createdAt: new Date(Date.now() - 10 * 86400000 + 1000) });
  used.transactions.push({ type: 'consume', quantity: 300, status: 'done', createdAt: new Date() });
  used.transactions.push({ type: 'consume', quantity: 900, status: 'done', createdAt: new Date(Date.now() - 60 * 86400000) });
  const view = inventoryView(used);
  assert.equal(view.dailyUse, 60);
  assert.equal(view.daysToLast, 50);
  assert.equal(view.dailyUseSource, 'history');
  assert.equal(view.dailyUseDays, 10);
  assert.equal(new Date(view.lastsUntil).toISOString().slice(0, 10), new Date(Date.now() + 50 * 86400000).toISOString().slice(0, 10));
  // a brand-new medicine with one big use is not averaged over 1 day: at least 7 days
  const fresh = item({ currentStock: 700 });
  fresh.transactions.push({ type: 'consume', quantity: 700, status: 'done', createdAt: new Date() });
  assert.equal(inventoryView(fresh).dailyUse, 100);
  const typed = inventoryView(item({ currentStock: 1000, avgDailyUse: 50 }));
  assert.equal(typed.daysToLast, 20);
  assert.equal(typed.dailyUseSource, 'manual');
  // a typed number wins over what history says: 1600 g at 150 g a day = 10 days, not 56
  const sarasvat = item({ unit: 'gram', currentStock: 1600, avgDailyUse: 150 });
  sarasvat.transactions.push({ type: 'consume', quantity: 200, status: 'done', createdAt: new Date(Date.now() - 6 * 86400000) });
  assert.equal(inventoryView(sarasvat).daysToLast, 10);
  sarasvat.avgDailyUse = 0; // cleared: back to the real use (200 over 7 days)
  assert.equal(inventoryView(sarasvat).dailyUseSource, 'history');
  assert.equal(inventoryView(sarasvat).daysToLast, 56);
  assert.equal(inventoryView(item({ currentStock: 100 })).daysToLast, null);
});

test('stock in: loose, whole bottles, expiry, batch; clears a purchase request once above reorder', () => {
  const oil = item({ currentStock: 500, purchaseRequest: { raisedAt: new Date() } });
  run('in', oil, { mode: 'loose', qty: 1500 }, { meta: { expiryDate: '2027-05-01', batchNo: 'B1' } });
  assert.equal(oil.currentStock, 2000);
  assert.equal(oil.purchaseRequest, null);
  const rows = run('in', oil, { mode: 100, qty: 12 }, { subType: 'Purchase (supplier bill)' });
  assert.equal(oil.currentStock, 3200);
  assert.equal(oil.packs[0].count, 12);
  assert.equal(rows[0].delta, 1200);
  assert.equal(looseStock(oil), 2000);
  assert.throws(() => run('in', oil, { mode: 'loose', qty: 0 }), /valid quantity/);
  assert.throws(() => run('in', item({ unit: 'tablet' }), { mode: 100, qty: 1 }), /ml \/ gram/);
});

test('in-house production uses up the raw herbs in the recipe and blocks when a herb is short', () => {
  const herb = item({ _id: 'h1', name: 'Brahmi', unit: 'gram', currentStock: 1000 });
  const taila = item({ _id: 't1', name: 'Taila', currentStock: 0, recipe: { per: 1000, ingredients: [{ item: 'h1', qty: 250 }] } });
  const rows = run('in', taila, { mode: 'loose', qty: 2000 }, { subType: 'In-house production (batch)', ref: 'BT-1', items: [herb] });
  assert.equal(taila.currentStock, 2000);
  assert.equal(herb.currentStock, 500);
  assert.equal(rows.length, 2);
  assert.equal(rows[1].delta, -500);
  assert.match(rows[1].ref, /BT-1 \(Taila\)/);
  assert.throws(() => run('in', taila, { mode: 'loose', qty: 4000 }, { subType: 'In-house production (batch)', items: [herb] }), /needs 1000 g Brahmi/);
});

test('use takes loose stock or whole bottles and says to pack first when bottles are short', () => {
  const oil = item({ currentStock: 1500, packs: [{ size: 100, count: 5 }] });
  assert.equal(looseStock(oil), 1000);
  assert.throws(() => run('use', oil, { mode: 'loose', qty: 1200 }), /only 1000 ml loose/);
  run('use', oil, { mode: 'loose', qty: 300 });
  assert.equal(oil.currentStock, 1200);
  const rows = run('use', oil, { mode: 100, qty: 2 }, { ref: 'MED-1' });
  assert.equal(rows[0].delta, -200);
  assert.equal(oil.packs[0].count, 3);
  assert.equal(oil.currentStock, 1000);
  assert.throws(() => run('use', oil, { mode: 100, qty: 9 }), /Pack first/);
});

test('pack fills bottles from loose, uses up empty containers only when they are tracked, and blocks when tracked ones are short', () => {
  const oil = item({ currentStock: 3000 });
  const bottles = container(100, 30);
  const rows = run('pack', oil, { mode: 100, qty: 12 }, { containers: [bottles], ref: 'PK-1' });
  assert.equal(packedStock(oil), 1200);
  assert.equal(looseStock(oil), 1800);
  assert.equal(oil.currentStock, 3000);
  assert.equal(bottles.currentStock, 18);
  assert.equal(rows.length, 2);
  assert.equal(rows[1].delta, -12);
  assert.throws(() => run('pack', oil, { mode: 100, qty: 17 }, { containers: [container(100, 5)] }), /only 5 empty/);
  // no packing item for this size = empty bottles are not counted, packing still works
  const untracked = run('pack', oil, { mode: 150, qty: 2 }, { containers: [bottles] });
  assert.equal(untracked.length, 1);
  assert.equal(oil.packs.find((p) => p.size === 150).count, 2);
  assert.throws(() => run('pack', oil, { mode: 500, qty: 10 }, { containers: [container(500, 20)] }), /needs 5000 ml, but only 1500 is loose/);
  assert.throws(() => run('pack', oil, { mode: 'loose', qty: 1 }, { containers: [bottles] }), /choose the bottle size/);
});

test('adjust needs a reason; big or risky ones wait for approval unless an approver enters them', () => {
  const stock = () => item({ currentStock: 1000 });
  assert.throws(() => run('adjust', stock(), { mode: 'loose', qty: 10, dir: '-' }), /Reason is required/);
  const small = stock();
  const ok = run('adjust', small, { mode: 'loose', qty: 40, dir: '-' }, { subType: 'Breakage / टूट-फूट' });
  assert.equal(ok[0].status, 'done');
  assert.equal(small.currentStock, 960);
  const big = stock();
  const pending = run('adjust', big, { mode: 'loose', qty: 200, dir: '-' }, { subType: 'Physical count difference' });
  assert.equal(pending[0].status, 'pending');
  assert.equal(big.currentStock, 1000);
  const expired = stock();
  assert.equal(run('adjust', expired, { mode: 'loose', qty: 1, dir: '-' }, { subType: 'Expired' })[0].status, 'pending');
  const byDoctor = stock();
  const direct = run('adjust', byDoctor, { mode: 'loose', qty: 200, dir: '-' }, { subType: 'Expired', user: { name: 'Dr', role: 'doctor' } });
  assert.equal(direct[0].status, 'approved');
  assert.equal(byDoctor.currentStock, 800);
  const up = stock();
  run('adjust', up, { mode: 'loose', qty: 30, dir: '+' }, { subType: 'Physical count difference' });
  assert.equal(up.currentStock, 1030);
});

test('approving a waiting adjustment changes stock once; rejecting leaves it alone', () => {
  const oil = item({ currentStock: 1000 });
  const [row] = run('adjust', oil, { mode: 'loose', qty: 200, dir: '-' }, { subType: 'Expired' });
  const txn = { ...row };
  decidePending(oil, txn, 'approve', { name: 'Dr', role: 'doctor' });
  assert.equal(oil.currentStock, 800);
  assert.equal(txn.status, 'approved');
  assert.equal(txn.newStock, 800);
  assert.throws(() => decidePending(oil, txn, 'approve', { name: 'Dr', role: 'doctor' }), /not waiting/);
  const other = item({ currentStock: 1000 });
  const waiting = { ...run('adjust', other, { mode: 'loose', qty: 200, dir: '-' }, { subType: 'Expired' })[0] };
  decidePending(other, waiting, 'reject', { name: 'Dr', role: 'doctor' });
  assert.equal(other.currentStock, 1000);
  assert.equal(waiting.status, 'rejected');
  assert.equal(waiting.delta, 0);
});
