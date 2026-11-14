const { test, afterEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const InventorySetting = require('../models/InventorySetting');
const MedicineJob = require('../models/MedicineJob');
const { assertPaperPcc, assertKindPcc, getPaperPcc, pendingPaperCount, saveSetting } = require('./treatmentPaperController');

afterEach(() => mock.restoreAll());
const aditi = { _id: new mongoose.Types.ObjectId(), name: 'Aditi', role: 'assistant_doctor' };
const neha = { _id: new mongoose.Types.ObjectId(), name: 'Neha', role: 'assistant_doctor' };
const setting = (value) => mock.method(InventorySetting, 'findOne', () => ({ lean: async () => (value ? { value } : null) }));

test('Medicine Department makes treatment papers regardless of the saved PCC assignment', async () => {
  setting({ id: String(aditi._id), name: 'Aditi' });
  await assert.doesNotReject(assertPaperPcc({ role: 'medicine_department' }));
  await assert.rejects(assertPaperPcc(aditi), /Medicine Department/);
  await assert.rejects(assertPaperPcc(neha), /Medicine Department/);
  await assert.doesNotReject(assertPaperPcc({ _id: new mongoose.Types.ObjectId(), role: 'admin' }), 'the admin can always step in');
  assert.equal(await getPaperPcc(), null);
  mock.method(MedicineJob, 'countDocuments', async () => 3);
  assert.equal(await pendingPaperCount({ role: 'medicine_department' }), 3);
  assert.equal(await pendingPaperCount(aditi), 0);
});

test('final check still belongs to the PCC chosen in Settings', async () => {
  setting({ id: String(aditi._id), name: 'Aditi' });
  await assert.doesNotReject(assertKindPcc('final', aditi));
  await assert.rejects(assertKindPcc('final', neha), /Aditi does the final medicine check/);
});

test('treatment-paper assignment cannot be changed while paused', async () => {
  const write = mock.method(InventorySetting, 'findOneAndUpdate', async () => { throw Error('Must not write'); });
  let failure;
  await saveSetting({ query: { kind: 'papers' }, body: { pccId: String(aditi._id) }, user: { role: 'admin' } }, {}, (err) => { failure = err; });
  assert.equal(failure.statusCode, 409);
  assert.equal(write.mock.callCount(), 0);
});
