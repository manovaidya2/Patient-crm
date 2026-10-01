const { test } = require('node:test');
const assert = require('node:assert/strict');
const Model = require('../models/ClinicInventory');
const { deleteClinicInventoryItem } = require('./clinicInventoryController');
const { ROLES } = require('../constants/roles');
test('admin-only deletion preserves history and records actor/time', async () => {
  const original = Model.findOneAndUpdate;
  let calls = 0;
  Model.findOneAndUpdate = async (filter, update) => {
    calls++;
    assert.equal(filter.deletedAt, null);
    assert.ok(update.$set.deletedAt instanceof Date);
    assert.equal(update.$set.deletedByName, 'Admin');
    assert.equal(update.$set.transactions, undefined);
    return { _id: 'test' };
  };
  const response = () => ({ statusCode: 200, status(code) { this.statusCode = code; return this; }, json(data) { this.data = data; } });
  try {
    const denied = response();
    await deleteClinicInventoryItem({ params: { id: 'test' }, user: { role: ROLES.RECEPTIONIST } }, denied, (err) => { throw err; });
    assert.equal(denied.statusCode, 403); assert.equal(calls, 0);
    const accepted = response();
    await deleteClinicInventoryItem({ params: { id: 'test' }, user: { role: ROLES.ADMIN, name: 'Admin' } }, accepted, (err) => { throw err; });
    assert.equal(accepted.data.success, true); assert.equal(calls, 1);
    Model.findOneAndUpdate = async () => null;
    const missing = response();
    await deleteClinicInventoryItem({ params: { id: 'test' }, user: { role: ROLES.ADMIN } }, missing, (err) => { throw err; });
    assert.equal(missing.statusCode, 404);
  } finally { Model.findOneAndUpdate = original; }
});
