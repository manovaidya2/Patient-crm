const { test, afterEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const Patient = require('../models/Patient');
const controller = require('./patientController');

afterEach(() => mock.restoreAll());

const adder = { _id: new mongoose.Types.ObjectId(), name: 'Abhishek', role: 'post_counselor' };
const other = { _id: new mongoose.Types.ObjectId(), name: 'Tanu', role: 'in_transit' };
const call = (handler, req) => new Promise((resolve, reject) => {
  const res = { statusCode: 200, status(c) { this.statusCode = c; return this; }, json(v) { resolve({ status: this.statusCode, ...v }); } };
  handler(req, res, reject);
});

test('the person who added a cancelled payment sees a red alert until they mark it checked', async () => {
  const patient = new Patient({ patientName: 'Aayush', patientCode: 'A-1', category: 'autism_adhd', number: '1' });
  const cancelledAt = new Date();
  patient.stages[0].payments.push(
    { amount: 5000, approvalStatus: 'cancelled', recordedBy: adder._id, recordedByName: adder.name, cancelledByName: 'Tanu', cancelledAt, cancellationReason: 'Duplicate', utr: 'UTR1' },
    // An older payment with the name only.
    { amount: 700, approvalStatus: 'cancelled', recordedByName: adder.name, cancelledByName: 'Tanu', cancelledAt },
    // Cancelled long ago, or by the same person, or still fine: no alert.
    { amount: 100, approvalStatus: 'cancelled', recordedBy: adder._id, cancelledByName: 'Tanu', cancelledAt: new Date(Date.now() - 60 * 86400000) },
    { amount: 200, approvalStatus: 'cancelled', recordedBy: adder._id, recordedByName: adder.name, cancelledByName: adder.name, cancelledAt },
    { amount: 300, approvalStatus: 'approved', recordedBy: adder._id },
  );
  patient.save = async () => patient;
  mock.method(Patient, 'find', () => ({ select: () => ({ lean: async () => [patient.toObject()] }) }));
  mock.method(Patient, 'findById', async () => patient);
  let res = await call(controller.getPaymentCancelAlerts, { user: adder, query: {} });
  assert.deepEqual(res.alerts.map((a) => a.amount).sort(), [5000, 700].sort());
  assert.equal(res.alerts.find((a) => a.amount === 5000).cancelledByName, 'Tanu');
  assert.equal(res.alerts.find((a) => a.amount === 5000).reason, 'Duplicate');
  // Someone else is not told about it and cannot check it.
  assert.equal((await call(controller.getPaymentCancelAlerts, { user: other, query: {} })).alerts.length, 0);
  const pay = patient.stages[0].payments[0];
  const params = { id: String(patient._id), number: '1', paymentId: String(pay._id) };
  assert.equal((await call(controller.checkPaymentCancelAlert, { user: other, params })).status, 403);
  await call(controller.checkPaymentCancelAlert, { user: adder, params });
  assert.ok(pay.cancelAlertCheckedAt, 'checked');
  res = await call(controller.getPaymentCancelAlerts, { user: adder, query: {} });
  assert.deepEqual(res.alerts.map((a) => a.amount), [700], 'a checked alert goes away');
});
