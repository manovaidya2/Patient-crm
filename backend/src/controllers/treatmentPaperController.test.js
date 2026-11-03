const { test, afterEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const InventorySetting = require('../models/InventorySetting');
const { assertPaperPcc } = require('./treatmentPaperController');

afterEach(() => mock.restoreAll());
const aditi = { _id: new mongoose.Types.ObjectId(), name: 'Aditi', role: 'assistant_doctor' };
const neha = { _id: new mongoose.Types.ObjectId(), name: 'Neha', role: 'assistant_doctor' };
const setting = (value) => mock.method(InventorySetting, 'findOne', () => ({ lean: async () => (value ? { value } : null) }));

test('treatment papers go only to the PCC chosen in Settings; none chosen means no PCC gets them', async () => {
  setting(null);
  await assert.rejects(assertPaperPcc(aditi), /has not chosen/);
  mock.restoreAll();
  setting({ id: String(aditi._id), name: 'Aditi' });
  await assert.doesNotReject(assertPaperPcc(aditi));
  await assert.rejects(assertPaperPcc(neha), /Aditi makes the treatment papers/);
  await assert.doesNotReject(assertPaperPcc({ _id: new mongoose.Types.ObjectId(), role: 'admin' }), 'the admin can always step in');
});
