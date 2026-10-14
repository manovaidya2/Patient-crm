const { test, afterEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const MedicineInventory = require('../models/MedicineInventory');
const InventoryCounter = require('../models/InventoryCounter');
const controller = require('./medicineInventoryController');

afterEach(() => mock.restoreAll());

const doc = (extra = {}) => {
  const item = new MedicineInventory({ name: 'Brahmi taila', unit: 'ml', category: 'तैल', currentStock: 3000, lowStockAt: 1000, reorderLevel: 1500, maxLevel: 8000, ...extra });
  item.save = mock.fn(async () => item);
  return item;
};
const run = async (handler, req) => {
  const res = { statusCode: 200, body: null, status(code) { this.statusCode = code; return this; }, json(value) { this.body = value; } };
  let failure;
  await handler({ query: {}, body: {}, params: {}, user: { _id: new mongoose.Types.ObjectId(), name: 'Store', role: 'medicine_department' }, ...req }, res, (e) => { failure = e; });
  return { res, failure };
};
const mockFind = (docs) => mock.method(MedicineInventory, 'find', async (filter) => {
  if (filter?.category) return docs.filter((d) => d.category === filter.category);
  const ids = (filter?._id?.$in || []).map(String);
  return docs.filter((d) => ids.includes(String(d._id)));
});

test('an entry with one bad line saves nothing and names the line', async () => {
  const oil = doc();
  const herb = doc({ name: 'Brahmi', unit: 'gram', currentStock: 100 });
  mockFind([oil, herb]);
  const reserve = mock.method(InventoryCounter, 'reserve', async () => 6001);
  const { failure } = await run(controller.addEntry, { body: { act: 'use', subType: 'Clinic use', lines: [{ itemId: String(oil._id), mode: 'loose', qty: 100 }, { itemId: String(herb._id), mode: 'loose', qty: 500 }] } });
  assert.match(failure.message, /Line 2 \(Brahmi\)/);
  assert.equal(failure.errors.length, 1);
  assert.equal(oil.save.mock.callCount(), 0);
  assert.equal(herb.save.mock.callCount(), 0);
  assert.equal(reserve.mock.callCount(), 0);
});

test('a good entry numbers every ledger row, saves each medicine once, and patient orders need a reference', async () => {
  const oil = doc();
  const herb = doc({ name: 'Brahmi', unit: 'gram', currentStock: 1000 });
  mockFind([oil, herb]);
  mock.method(InventoryCounter, 'reserve', async () => 6001);
  const body = { act: 'use', subType: 'Patient order (MED)', lines: [{ itemId: String(oil._id), mode: 'loose', qty: 100 }, { itemId: String(herb._id), mode: 'loose', qty: 50 }] };
  assert.match((await run(controller.addEntry, { body })).failure.message, /MED ID/);
  const { res, failure } = await run(controller.addEntry, { body: { ...body, ref: 'MED-776 · MNV-1' } });
  assert.equal(failure, undefined);
  assert.deepEqual(res.body.created.map((c) => c.txId), ['TX-6001', 'TX-6002']);
  assert.equal(oil.currentStock, 2900);
  assert.equal(herb.currentStock, 950);
  assert.equal(oil.transactions.at(-1).ref, 'MED-776 · MNV-1');
  assert.equal(oil.save.mock.callCount(), 1);
});

test('pack takes empty bottles from the packing-material item', async () => {
  const oil = doc({ packSizes: [100] });
  const bottles = doc({ name: 'Bottle 100 ml', unit: 'piece', category: 'Packing सामग्री', containerKind: 'Bottle', containerSize: 100, containerUnit: 'ml', currentStock: 50 });
  mockFind([oil, bottles]);
  mock.method(InventoryCounter, 'reserve', async () => 7001);
  const { res, failure } = await run(controller.addEntry, { body: { act: 'pack', ref: 'PK-1', lines: [{ itemId: String(oil._id), mode: 100, qty: 10 }] } });
  assert.equal(failure, undefined);
  assert.equal(oil.packs[0].count, 10);
  assert.equal(oil.currentStock, 3000);
  assert.equal(bottles.currentStock, 40);
  assert.equal(res.body.created.length, 2);
  assert.equal(bottles.save.mock.callCount(), 1);
});

test('admin approves a waiting adjustment through the ledger and the stock changes', async () => {
  const oil = doc();
  mockFind([oil]);
  mock.method(InventoryCounter, 'reserve', async () => 8001);
  await run(controller.addEntry, { body: { act: 'adjust', subType: 'Expired', lines: [{ itemId: String(oil._id), mode: 'loose', qty: 500, dir: '-' }] } });
  const txn = oil.transactions.at(-1);
  assert.equal(txn.status, 'pending');
  assert.equal(oil.currentStock, 3000);
  mock.method(MedicineInventory, 'findById', async () => oil);
  const { res } = await run(controller.decideTransaction, { params: { itemId: String(oil._id), txnId: String(txn._id) }, body: { decision: 'approve' }, user: { _id: new mongoose.Types.ObjectId(), name: 'Admin', role: 'admin' } });
  assert.equal(res.body.transaction.status, 'approved');
  assert.equal(oil.currentStock, 2500);
});

test('bottle size master: add a size, refuse a duplicate, and refuse removing a size a medicine still uses', async () => {
  const InventorySetting = require('../models/InventorySetting');
  let saved = null;
  mock.method(InventorySetting, 'findOne', () => ({ lean: async () => (saved ? { value: saved } : null) }));
  mock.method(InventorySetting, 'findOneAndUpdate', async (_f, update) => { saved = update.$set.value; return { value: saved }; });
  const used = doc({ packSizes: [100] });
  mock.method(MedicineInventory, 'find', () => ({ select: async () => [used] }));

  const added = await run(controller.addPackSize, { body: { unit: 'ml', size: 250 } });
  assert.equal(added.failure, undefined);
  assert.ok(added.res.body.packSizeMaster.ml.includes(250));
  assert.deepEqual(added.res.body.packSizeMaster.ml, [...added.res.body.packSizeMaster.ml].sort((a, b) => a - b));
  assert.match((await run(controller.addPackSize, { body: { unit: 'ml', size: 250 } })).failure.message, /already in the list/);
  assert.match((await run(controller.addPackSize, { body: { unit: 'litre', size: 5 } })).failure.message, /ml or gram/);
  assert.match((await run(controller.addPackSize, { body: { unit: 'ml', size: -3 } })).failure.message, /valid bottle size/);
  assert.match((await run(controller.removePackSize, { query: { unit: 'ml', size: 100 } })).failure.message, /still use this size/);
  mock.method(MedicineInventory, 'find', () => ({ select: async () => [] }));
  const removed = await run(controller.removePackSize, { query: { unit: 'ml', size: 250 } });
  assert.equal(removed.res.body.packSizeMaster.ml.includes(250), false);
});

test('admin / doctor delete hides the medicine but is refused while it is a recipe ingredient or has an adjustment waiting', async () => {
  const herb = doc({ name: 'Brahmi', unit: 'gram', currentStock: 100 });
  mock.method(MedicineInventory, 'findById', async () => herb);
  let usedBy = [{ name: 'Brahmi taila' }];
  mock.method(MedicineInventory, 'find', () => ({ select: async () => usedBy }));
  const refused = await run(controller.deleteInventoryItem, { params: { id: String(herb._id) } });
  assert.match(refused.failure.message, /ingredient in the recipe of Brahmi taila/);
  assert.equal(herb.isActive, true);
  usedBy = [];
  herb.transactions.push({ type: 'adjust', quantity: 5, previousStock: 100, newStock: 100, status: 'pending' });
  assert.match((await run(controller.deleteInventoryItem, { params: { id: String(herb._id) } })).failure.message, /waiting for approval/);
  herb.transactions[0].status = 'rejected';
  const { res, failure } = await run(controller.deleteInventoryItem, { params: { id: String(herb._id) }, user: { _id: new mongoose.Types.ObjectId(), name: 'Dr Rao', role: 'doctor' } });
  assert.equal(failure, undefined);
  assert.equal(res.body.stockLeft, 100);
  assert.equal(herb.isActive, false);
  assert.equal(herb.deletedByName, 'Dr Rao');
  assert.equal(herb.transactions.length, 1); // ledger history is kept
  assert.match((await run(controller.deleteInventoryItem, { params: { id: String(herb._id) } })).failure.message, /not found/);
});
