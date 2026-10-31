// Stock rules for the medicine inventory: levels, status, loose vs filled bottles, and every stock movement.
// currentStock is always the TOTAL in the item's unit. "Loose" = total minus what is already filled into bottles / jars.
// Every movement returns ledger rows; nothing here edits or deletes an old row.

const EXPIRY_WARN_DAYS = 90;
const ML_SIZES = [5, 10, 50, 100, 150, 200, 450, 500];
const G_SIZES = [100, 250, 500, 1000];
// Ayurvedic "kalpana" categories: the base unit a medicine of that kind is counted in, and the sizes it is filled into.
const CATEGORY_CONFIG = [
  { hi: 'एकल द्रव्य', en: 'Single herbs', unit: 'gram', sizes: [] },
  { hi: 'चूर्ण', en: 'Churna', unit: 'gram', sizes: [] },
  { hi: 'वटी / गुटिका', en: 'Vati / Gutika', unit: 'tablet', sizes: [] },
  { hi: 'गुग्गुलु', en: 'Guggulu', unit: 'tablet', sizes: [] },
  { hi: 'रस औषधि', en: 'Rasaushadhi', unit: 'tablet', sizes: [] },
  { hi: 'भस्म / पिष्टी', en: 'Bhasma / Pishti', unit: 'gram', sizes: [] },
  { hi: 'काथ', en: 'Kwath', unit: 'gram', sizes: [] },
  { hi: 'आसव / अरिष्ट', en: 'Asava / Arishta', unit: 'ml', sizes: ML_SIZES },
  { hi: 'तैल', en: 'Taila (oils)', unit: 'ml', sizes: ML_SIZES },
  { hi: 'घृत', en: 'Ghrita', unit: 'ml', sizes: ML_SIZES },
  { hi: 'अवलेह / रसायन', en: 'Avaleha / Rasayana', unit: 'gram', sizes: G_SIZES },
  { hi: 'अर्क / सिरप', en: 'Arka / Syrup', unit: 'ml', sizes: ML_SIZES },
  { hi: 'Packing सामग्री', en: 'Bottle / Jar / Label', unit: 'piece', sizes: [] },
];
const DEFAULT_CATEGORIES = CATEGORY_CONFIG.map((c) => c.hi);
const PACKING_CATEGORY = 'Packing सामग्री';
const ITEM_TYPES = ['Classical', 'Proprietary', 'Raw herb', 'Packaging'];
const PACKABLE_UNITS = ['ml', 'gram'];
const CONTAINER_KINDS = ['Bottle', 'Vial', 'Jar', 'Pouch', 'Label'];
const PACK_KINDS = ['Bottle', 'Vial', 'Jar'];
const TRANSACTION_TYPES = ['add', 'consume', 'adjust', 'pack'];
const APPROVER_ROLES = ['admin', 'manager', 'doctor'];
const ADJUST_APPROVAL_PERCENT = 0.05;
const RISKY_ADJUST_REASONS = [/^expired/i, /^damage/i];

const round = (value) => Math.round(Number(value || 0) * 1000) / 1000;
const fail = (message) => { throw Object.assign(new Error(message), { statusCode: 400 }); };
const plain = (value) => (value?.toObject ? value.toObject() : value);
const sizeUnitOf = (unit) => (unit === 'gram' ? 'g' : unit === 'ml' ? 'ml' : '');
const unitText = (unit) => (unit === 'gram' ? 'g' : unit);
const kindFor = (unit, size) => (unit === 'gram' ? 'Jar' : size <= 15 ? 'Vial' : 'Bottle');
const packLabel = (size, unit) => `${round(size)} ${unitText(unit)} ${kindFor(unit, size)}`;
const sameSize = (a, b) => Math.abs(Number(a) - Number(b)) < 1e-9;

const packedStock = (item) => round((item.packs || []).reduce((sum, p) => sum + Number(p.size || 0) * Number(p.count || 0), 0));
const looseStock = (item) => round(Math.max(Number(item.currentStock || 0) - packedStock(item), 0));
const packCount = (item, size) => (item.packs || []).find((p) => sameSize(p.size, size))?.count || 0;
const supportedSizes = (item) => [...new Set([...(item.packSizes || []), ...(item.packs || []).filter((p) => p.count > 0).map((p) => p.size)].map(round))].sort((a, b) => b - a);

// Daily use = the number typed on the medicine ("Roz ka average use"), if there is one. Left empty, it is worked out from
// what was really used in the last 30 days divided by the days that period covers.
// A medicine first used 10 days ago is averaged over 10 days (not 30), with at least 7 days so one big day does not
// look like a daily habit. With no use yet, the rough number typed when the medicine was added is used.
const DAY_MS = 86400000;
function dailyUse(item, now = new Date()) {
  if (Number(item.avgDailyUse) > 0) return { value: Number(item.avgDailyUse), source: 'manual', days: 0 };
  const from = now.getTime() - 30 * DAY_MS;
  const used = (item.transactions || [])
    .filter((t) => t.type === 'consume' && ['done', 'approved', undefined].includes(t.status) && new Date(t.createdAt || 0).getTime() >= from);
  const total = used.reduce((sum, t) => sum + Number(t.quantity || 0), 0);
  if (total > 0) {
    const first = Math.min(...used.map((t) => new Date(t.createdAt || 0).getTime()));
    const days = Math.min(30, Math.max(7, Math.ceil((now.getTime() - first) / DAY_MS)));
    return { value: total / days, source: 'history', days };
  }
  return { value: null, source: '', days: 0 };
}

function inventoryView(item, now = new Date()) {
  const unit = item.unit;
  const stock = round(item.currentStock);
  const min = Number(item.lowStockAt || 0);
  const reorder = Number(item.reorderLevel || 0);
  const max = Number(item.maxLevel || 0);
  const expiryDays = item.expiryDate ? Math.ceil((new Date(item.expiryDate).getTime() - now.getTime()) / 86400000) : null;
  const expiring = expiryDays != null && expiryDays <= EXPIRY_WARN_DAYS;
  const out = stock <= 0;
  // An emergency medicine is critical as soon as it reaches the reorder level.
  const critical = !out && ((min > 0 && stock < min) || (item.emergency && reorder > 0 && stock < reorder));
  const reorderDue = !out && !critical && reorder > 0 && stock < reorder;
  const over = max > 0 && stock > max;
  const status = out ? 'out' : critical ? 'critical' : reorderDue ? 'reorder' : expiryDays != null && expiryDays < 0 ? 'expired' : over ? 'over' : 'ok';
  const use = dailyUse(item, now);
  const sizes = supportedSizes(item);
  return {
    stock, loose: looseStock(item), packed: packedStock(item),
    status, out, critical: out || critical, reorderDue, over, expiring, expiryDays,
    needsAttention: out || critical || reorderDue || expiring,
    daysToLast: use.value ? Math.floor(stock / use.value) : null,
    dailyUse: use.value ? round(use.value) : null,
    dailyUseSource: use.source,
    dailyUseDays: use.days || 0,
    // The date the current stock runs out if use stays the same.
    lastsUntil: use.value ? new Date(now.getTime() + Math.floor(stock / use.value) * DAY_MS).toISOString() : null,
    suggestedOrder: stock < reorder ? round(Math.max(max - stock, 0)) : 0,
    packs: sizes.map((size) => {
      const rec = (item.packs || []).find((p) => sameSize(p.size, size));
      return { id: rec ? String(rec._id) : '', size, kind: kindFor(unit, size), count: rec?.count || 0, label: packLabel(size, unit), amount: round(size * (rec?.count || 0)) };
    }),
    packLabels: sizes.map((size) => packLabel(size, unit)),
  };
}

// ---------- one movement at a time ----------
const parseQty = (value, label, { integer = false } = {}) => {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) fail(`Enter a valid ${label}`);
  if (integer && !Number.isInteger(n)) fail(`${label} must be a whole number`);
  return round(n);
};
const parseDate = (value) => {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) fail('Enter a valid expiry date');
  return d;
};
const ensurePackable = (item) => { if (!PACKABLE_UNITS.includes(item.unit)) fail(`${item.name}: bottle sizes are available for ml / gram items only`); };
const ensurePack = (item, size) => {
  let pack = (item.packs || []).find((p) => sameSize(p.size, size));
  if (!pack) { item.packs.push({ size, kind: kindFor(item.unit, size), count: 0 }); pack = item.packs[item.packs.length - 1]; }
  if (!(item.packSizes || []).some((s) => sameSize(s, size))) item.packSizes.push(size);
  return pack;
};
const parseMode = (item, line) => {
  if (line.mode === 'loose' || line.mode === undefined || line.mode === '') return { size: 1, loose: true };
  ensurePackable(item);
  return { size: parsePositiveSize(line.mode), loose: false };
};
const parsePositiveSize = (value) => { const n = Number(value); if (!(n > 0)) fail('Choose a valid bottle size'); return round(n); };

const rowBase = (item, type, ctx, fields) => ({
  type, subType: ctx.subType || '', previousStock: round(item.currentStock), ref: ctx.ref || '', notes: ctx.note || '',
  recordedByName: ctx.user.name, recordedByRole: ctx.user.role, status: 'done', createdAt: ctx.now, ...fields,
});
const pushRow = (ctx, item, entry) => ctx.rows.push({ item, entry });
const lineDetail = (item, line, size, qty) => (size === 1 ? `Loose ${qty} ${unitText(item.unit)}` : `${qty} × ${packLabel(size, item.unit)}`);

// Adjust that really changes stock (also used when an approver accepts a waiting adjustment).
function adjustMutation(item, { size, qty, sign }) {
  const previousStock = round(item.currentStock);
  if (size === 1) {
    if (sign < 0 && looseStock(item) + 1e-9 < qty) fail(`${item.name}: only ${looseStock(item)} ${unitText(item.unit)} loose stock is available`);
    item.currentStock = round(previousStock + sign * qty);
  } else {
    const pack = ensurePack(item, size);
    if (sign < 0 && pack.count < qty) fail(`${item.name}: only ${pack.count} filled ${packLabel(size, item.unit)} available`);
    pack.count += sign * qty;
    item.currentStock = round(previousStock + sign * qty * size);
  }
  return { previousStock, newStock: item.currentStock, delta: round(item.currentStock - previousStock) };
}

function needsApproval(item, base, ctx) {
  if (APPROVER_ROLES.includes(ctx.user.role)) return false;
  return base > Number(item.currentStock || 0) * ADJUST_APPROVAL_PERCENT || RISKY_ADJUST_REASONS.some((re) => re.test(ctx.subType || ''));
}

// Applies one entry line to an item, appending ledger rows to ctx.rows. Throws a plain message on any rule break.
function applyLine(act, item, line, ctx) {
  const { size, loose } = parseMode(item, line);
  const qty = parseQty(line.qty, 'quantity', { integer: !loose });
  const base = round(qty * size);

  if (act === 'in') {
    const previousStock = round(item.currentStock);
    if (loose) item.currentStock = round(previousStock + qty);
    else { ensurePack(item, size).count += qty; item.currentStock = round(previousStock + base); }
    const expiry = parseDate(ctx.meta?.expiryDate);
    if (expiry) item.expiryDate = expiry;
    if (ctx.meta?.batchNo) item.batchNo = String(ctx.meta.batchNo).trim().slice(0, 60);
    if (item.purchaseRequest && item.currentStock >= Number(item.reorderLevel || 0)) item.purchaseRequest = null;
    pushRow(ctx, item, rowBase(item, 'add', ctx, { previousStock, quantity: base, delta: base, newStock: item.currentStock, batchNo: item.batchNo, detail: `${ctx.subType ? `${ctx.subType.split(' (')[0]} · ` : ''}${lineDetail(item, line, size, qty)}` }));
    // In-house production uses up the raw herbs listed in the recipe.
    if (/^in-house/i.test(ctx.subType || '') && item.recipe?.ingredients?.length) {
      item.recipe.ingredients.forEach((ing) => {
        const raw = ctx.byId(String(ing.item));
        if (!raw) fail(`${item.name}: a recipe ingredient no longer exists`);
        const need = round((ing.qty * base) / (item.recipe.per || 1));
        if (looseStock(raw) + 1e-9 < need) fail(`${item.name}: production needs ${need} ${unitText(raw.unit)} ${raw.name}, but only ${looseStock(raw)} is loose`);
        const before = round(raw.currentStock);
        raw.currentStock = round(before - need);
        pushRow(ctx, raw, rowBase(raw, 'consume', ctx, { previousStock: before, quantity: need, delta: -need, newStock: raw.currentStock, subType: 'Production', detail: 'Production consumption (recipe)', ref: `${ctx.ref || 'Batch'} (${item.name})` }));
      });
    }
    return;
  }

  if (act === 'use') {
    const previousStock = round(item.currentStock);
    if (loose) {
      if (looseStock(item) + 1e-9 < qty) fail(`${item.name}: only ${looseStock(item)} ${unitText(item.unit)} loose stock is available${packedStock(item) ? ' (use whole bottles for filled bottles)' : ''}`);
      item.currentStock = round(previousStock - qty);
    } else {
      const pack = (item.packs || []).find((p) => sameSize(p.size, size));
      if (!pack || pack.count < qty) fail(`${item.name}: only ${pack?.count || 0} filled ${packLabel(size, item.unit)} available. Pack first or use loose stock`);
      pack.count -= qty;
      item.currentStock = round(previousStock - base);
    }
    pushRow(ctx, item, rowBase(item, 'consume', ctx, { previousStock, quantity: base, delta: -base, newStock: item.currentStock, detail: lineDetail(item, line, size, qty) }));
    return;
  }

  if (act === 'adjust') {
    const sign = line.dir === '+' ? 1 : -1;
    if (!ctx.subType) fail('Reason is required for an adjustment');
    const detail = `${lineDetail(item, line, size, qty)}${ctx.note ? ` · ${ctx.note}` : ''}`;
    if (needsApproval(item, base, ctx)) {
      pushRow(ctx, item, rowBase(item, 'adjust', ctx, { quantity: base, delta: sign * base, newStock: round(item.currentStock), status: 'pending', reason: ctx.subType, detail, payload: { size, qty, sign } }));
      return;
    }
    const m = adjustMutation(item, { size, qty, sign });
    pushRow(ctx, item, rowBase(item, 'adjust', ctx, { ...m, quantity: base, reason: ctx.subType, detail, status: APPROVER_ROLES.includes(ctx.user.role) ? 'approved' : 'done', decidedByName: ctx.user.name, decidedAt: ctx.now }));
    return;
  }

  // pack: loose -> filled bottles; uses up the matching empty containers
  ensurePackable(item);
  if (loose) fail(`${item.name}: choose the bottle size to fill`);
  if (looseStock(item) + 1e-9 < base) fail(`${item.name}: filling ${qty} × ${packLabel(size, item.unit)} needs ${base} ${unitText(item.unit)}, but only ${looseStock(item)} is loose`);
  // Empty bottles / jars are counted only if someone made a Packing सामग्री item for that size; if so they must be enough.
  const container = ctx.findContainer(item, size);
  if (container && Number(container.currentStock) < qty) fail(`${item.name}: only ${round(container.currentStock)} empty ${packLabel(size, item.unit)} left in the packing stock. Add empty bottles first (Stock In)`);
  const previousStock = round(item.currentStock);
  ensurePack(item, size).count += qty;
  pushRow(ctx, item, rowBase(item, 'pack', ctx, { previousStock, quantity: base, delta: 0, newStock: previousStock, detail: `Loose ${base} ${unitText(item.unit)} → ${qty} × ${packLabel(size, item.unit)}` }));
  if (!container) return;
  const before = round(container.currentStock);
  container.currentStock = round(before - qty);
  pushRow(ctx, container, rowBase(container, 'consume', ctx, { previousStock: before, quantity: qty, delta: -qty, newStock: container.currentStock, subType: 'Packing', detail: 'Empty containers used for packing', ref: `${ctx.ref || 'Packing'} (${item.name})` }));
}

// Accepts or rejects a waiting adjustment. Returns nothing; mutates the item and the ledger row.
function decidePending(item, txn, decision, user, now = new Date()) {
  if (txn.status !== 'pending') fail('This entry is not waiting for approval');
  if (decision === 'approve') {
    const p = txn.payload || {};
    const m = adjustMutation(item, { size: p.size || 1, qty: p.qty, sign: p.sign });
    Object.assign(txn, { ...m, status: 'approved', decidedByName: user.name, decidedAt: now });
  } else {
    Object.assign(txn, { status: 'rejected', delta: 0, newStock: txn.previousStock, decidedByName: user.name, decidedAt: now });
  }
}

module.exports = {
  EXPIRY_WARN_DAYS, ML_SIZES, G_SIZES, CATEGORY_CONFIG, DEFAULT_CATEGORIES, PACKING_CATEGORY, ITEM_TYPES, PACKABLE_UNITS, CONTAINER_KINDS, PACK_KINDS,
  TRANSACTION_TYPES, APPROVER_ROLES,
  round, plain, packedStock, looseStock, packCount, packLabel, kindFor, sizeUnitOf, unitText, supportedSizes, sameSize, dailyUse, inventoryView,
  applyLine, decidePending, needsApproval, parseDate, parseQty,
};
