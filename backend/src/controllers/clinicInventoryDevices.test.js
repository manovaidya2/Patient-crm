const { test } = require('node:test');
const assert = require('node:assert/strict');
const Model = require('../models/ClinicInventory');
const controller = require('./clinicInventoryController');

const run = async (handler, req) => {
  const res = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(data) { this.data = data; return this; } };
  await handler({ user: { name: 'Reception', role: 'receptionist' }, params: {}, query: {}, body: {}, ...req }, res, (error) => { throw error; });
  return res;
};
// findOne(...) can be awaited directly or with .select(); `answers` gives one result per call.
const mockFindOne = (answers) => { const calls = []; Model.findOne = (filter) => { calls.push(filter); const value = answers.shift() ?? null; return Object.assign(Promise.resolve(value), { select: () => Promise.resolve(value) }); }; return calls; };

test('a mobile is saved with its brand, SIM, number, both IMEIs and assignee; wrong details and a repeated IMEI are refused', async (t) => {
  const { findOne, create } = Model;
  t.after(() => Object.assign(Model, { findOne, create }));
  let created = null;
  Model.create = async (doc) => { created = doc; return new Model(doc); };

  assert.equal((await run(controller.createClinicInventoryItem, { body: { kind: 'mobile', imei1: '123456789012345' } })).data.message, 'Mobile brand is required');
  assert.equal((await run(controller.createClinicInventoryItem, { body: { kind: 'mobile', brand: 'Samsung', imei1: '1234' } })).data.message, 'An IMEI number has 15 digits');
  mockFindOne([{ name: 'Vivo mobile (9876500000)' }]);
  assert.equal((await run(controller.createClinicInventoryItem, { body: { kind: 'mobile', brand: 'Samsung', imei1: '123456789012345' } })).data.message, 'This IMEI is already saved on Vivo mobile (9876500000)');

  const calls = mockFindOne([null]);
  const res = await run(controller.createClinicInventoryItem, { body: { kind: 'mobile', brand: 'Samsung', simCompany: 'Jio', phoneNumber: '98765 43210', imei1: '12345 6789012345', imei2: '543210987654321', assignee: 'Riya' } });
  assert.equal(res.statusCode, 201);
  assert.deepEqual(calls[0].$or, [{ 'device.imei1': '123456789012345' }, { 'device.imei2': '123456789012345' }, { 'device.imei1': '543210987654321' }, { 'device.imei2': '543210987654321' }]);
  assert.equal(created.name, 'Samsung mobile (98765 43210)');
  assert.deepEqual(res.data.item.device, { brand: 'Samsung', simCompany: 'Jio', phoneNumber: '98765 43210', imei1: '123456789012345', imei2: '543210987654321', assignee: 'Riya', deviceId: '' });
  assert.equal(res.data.item.kind, 'mobile');
  assert.deepEqual(res.data.item.assignments.map((a) => [a.assignee, a.assignedByName]), [['Riya', 'Reception']]);
});

test('a laptop needs its device ID and brand; a new assignee is recorded; stock entries are not allowed on devices', async (t) => {
  const { findOne, create } = Model;
  t.after(() => Object.assign(Model, { findOne, create }));
  assert.equal((await run(controller.createClinicInventoryItem, { body: { kind: 'laptop', brand: 'Dell' } })).data.message, 'Device ID is required');

  const laptop = new Model({ name: 'Dell laptop (LP-01)', kind: 'laptop', device: { brand: 'Dell', deviceId: 'LP-01', assignee: 'Riya' }, assignments: [{ assignee: 'Riya', assignedByName: 'Admin' }] });
  laptop.save = async () => laptop;
  mockFindOne([laptop, null]);
  const res = await run(controller.updateClinicInventoryItem, { params: { id: String(laptop._id) }, body: { assignee: 'Aman', deviceId: 'LP-02' } });
  assert.equal(res.statusCode, 200);
  assert.equal(res.data.item.name, 'Dell laptop (LP-02)');
  assert.deepEqual(res.data.item.assignments.map((a) => a.assignee), ['Aman', 'Riya']);
  assert.equal(laptop.editedByName, 'Reception');

  mockFindOne([laptop]);
  const stock = await run(controller.addClinicInventoryTransaction, { params: { id: String(laptop._id) }, body: { type: 'add', quantity: 1 } });
  assert.deepEqual([stock.statusCode, stock.data.message], [400, 'Mobiles and laptops have no stock count']);
});

test('items saved before the tabs show under Others, and the totals count each tab', async (t) => {
  const { find } = Model;
  t.after(() => { Model.find = find; });
  const old = new Model({ name: 'Paper roll', currentStock: 2, lowStockAt: 3 });
  old.set('kind', undefined, { strict: false });
  const docs = [old, new Model({ name: 'Samsung mobile', kind: 'mobile', device: { brand: 'Samsung' } }), new Model({ name: 'Dell laptop (LP-01)', kind: 'laptop', device: { brand: 'Dell', deviceId: 'LP-01' } })];
  let filter = null;
  Model.find = (f) => { filter = f; return { sort: async () => docs }; };
  const res = await run(controller.listClinicInventory, { query: { search: 'LP-01' } });
  assert.deepEqual(res.data.items.map((i) => i.kind), ['other', 'mobile', 'laptop']);
  assert.deepEqual(res.data.totals, { items: 1, lowStock: 1, kinds: { mobile: 1, laptop: 1, other: 1 } });
  assert.ok(filter.$or.some((c) => c['device.deviceId']) && filter.$or.some((c) => c['device.imei1']));
});
