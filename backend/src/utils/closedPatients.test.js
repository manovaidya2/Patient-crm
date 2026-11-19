const { test, afterEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const Patient = require('../models/Patient');
const { db, withoutClosedPatients, assertPatientOpen, CLOSED_MESSAGE } = require('./closedPatients');

afterEach(() => mock.restoreAll());
const connected = () => mock.method(db, 'ready', () => true);

test('the jobs of inactive patients leave every pending filter', async () => {
  const closed = new mongoose.Types.ObjectId();
  connected();
  mock.method(Patient, 'distinct', async (field, filter) => { assert.deepEqual([field, filter], ['_id', { isActive: false }]); return [closed]; });
  assert.deepEqual(await withoutClosedPatients({ status: 'open' }), { status: 'open', patient: { $nin: [closed] } });
  const other = new mongoose.Types.ObjectId();
  assert.deepEqual(await withoutClosedPatients({ patient: other }), { $and: [{ patient: other }, { patient: { $nin: [closed] } }] }, 'an own patient filter is kept');
});

test('no inactive patients: the filter is unchanged', async () => {
  connected();
  mock.method(Patient, 'distinct', async () => []);
  assert.deepEqual(await withoutClosedPatients({ status: 'ready' }), { status: 'ready' });
});

test('work on a job of an inactive patient is refused', async () => {
  connected();
  mock.method(Patient, 'exists', async (filter) => (filter.isActive === false ? { _id: filter._id } : null));
  await assert.rejects(assertPatientOpen({ patient: new mongoose.Types.ObjectId() }), (e) => e.message === CLOSED_MESSAGE && e.statusCode === 409);
  mock.restoreAll();
  connected();
  mock.method(Patient, 'exists', async () => null);
  await assertPatientOpen({ patient: new mongoose.Types.ObjectId() });
});
