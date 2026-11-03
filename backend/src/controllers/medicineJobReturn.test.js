const { test, afterEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const MedicineJob = require('../models/MedicineJob');
const PurchaseOrder = require('../models/PurchaseOrder');
const Patient = require('../models/Patient');
const controller = require('./medicineJobController');

afterEach(() => mock.restoreAll());
const med = { _id: new mongoose.Types.ObjectId(), name: 'Tanu', role: 'medicine_department' };
const transit = { _id: new mongoose.Types.ObjectId(), name: 'Ravi', role: 'in_transit' };
const call = (handler, user, { params = {}, body = {} } = {}) => new Promise((resolve, reject) => {
  const res = { statusCode: 200, status(c) { this.statusCode = c; return this; }, json(v) { resolve({ status: this.statusCode, ...v }); } };
  handler({ user, params, body, app: { get: () => null } }, res, reject);
});

test('the Medicine Department sends an unclear request back to In Transit; it waits on In Transit and cannot be accepted', async () => {
  const job = new MedicineJob({ patient: new mongoose.Types.ObjectId(), patientName: 'Aarav', phase: 1, requestId: 'r1', status: 'open', currentStage: 0, purchaseOrder: new mongoose.Types.ObjectId() });
  mock.method(MedicineJob, 'findById', async () => job);
  mock.method(MedicineJob.prototype, 'save', async function save() { return this; });
  let poEvent = null;
  mock.method(PurchaseOrder, 'updateOne', async (filter, change) => { poEvent = change.$push.events; });
  // respond() loads much more; stop right after the save.
  const respondStop = new Error('responded');
  mock.method(PurchaseOrder, 'findById', () => { throw respondStop; });
  mock.method(Patient, 'findOne', () => { throw respondStop; });
  mock.method(Patient, 'findById', () => { throw respondStop; });
  await assert.rejects(call(controller.returnToTransit, transit, { params: { id: 'x' }, body: { reason: 'Dose unclear' } }), /Only the Medicine Department/);
  await assert.rejects(call(controller.returnToTransit, med, { params: { id: 'x' }, body: { reason: '' } }), /what is unclear/);
  await assert.rejects(call(controller.returnToTransit, med, { params: { id: 'x' }, body: { reason: 'Supply not clear: 6 months or 1+5?' } }), /responded|Patient|Cannot/);
  assert.equal(job.returned.reason, 'Supply not clear: 6 months or 1+5?');
  assert.equal(job.returns.length, 1);
  assert.equal(poEvent.action, 'Medicine request sent back');
  assert.deepEqual(controller.jobActionBy(job, new Set()), ['admin', 'in_transit'], 'In Transit has to act now');
  await assert.rejects(call(controller.returnToTransit, med, { params: { id: 'x' }, body: { reason: 'again' } }), /already with In Transit/);
  await assert.rejects(call(controller.completeStage, med, { params: { id: 'x', key: 'accept' }, body: { checks: '[]' } }), /sent back to In Transit|Tick every point/);
});
