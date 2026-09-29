const { test } = require('node:test');
const assert = require('node:assert/strict');
const Patient = require('../models/Patient');
const controller = require('./patientController');
const { ROLES } = require('../constants/roles');

const paymentId = '68d973568739990000000001';
const refundId = '68d973568739990000000002';

async function invoke(handler, patient, { body = {}, refund = false, files = [], patientWide = false } = {}) {
  const original = Patient.findById;
  Patient.findById = async () => patient;
  patient.save = async () => patient;
  patient.populate = async () => patient;
  const response = { status(code) { this.code = code; return this; }, json(data) { this.data = data; return this; } };
  try {
    await handler({
      params: { id: String(patient._id), ...(!patientWide ? { number: '1', paymentId } : {}), ...(refund ? { refundId } : {}) },
      body,
      files,
      user: { _id: '68d973568739990000000003', name: 'Accounts', role: ROLES.ACCOUNTANT },
    }, response, (error) => { throw error; });
    return response;
  } finally {
    Patient.findById = original;
  }
}

const makePatient = (refunds = []) => new Patient({
  patientName: 'Patient One',
  stages: [{ number: 1, totalAmount: 1000, payments: [{ _id: paymentId, amount: 1000, approvalStatus: 'approved', refunds }] }],
});

test('refund initiation reserves partial amount and rejects over-refund', async () => {
  const patient = makePatient([{ _id: refundId, amount: 400, reason: 'Excess', status: 'initiated' }]);
  const rejected = await invoke(controller.initiatePaymentRefund, patient, { body: { amount: 601, reason: 'Extra' } });
  assert.equal(rejected.code, 409);
  assert.equal(patient.stages[0].payments[0].refunds.length, 1);
  const accepted = await invoke(controller.initiatePaymentRefund, patient, { body: { amount: 600, reason: 'Extra' } });
  assert.equal(accepted.data.success, true);
  assert.equal(patient.stages[0].payments[0].refunds.length, 2);
});

test('refund payout changes net only when paid and settlement retains history', async () => {
  const patient = makePatient([{ _id: refundId, amount: 250, reason: 'Duplicate', status: 'initiated' }]);
  const before = await invoke(controller.updatePaymentRefund, patient, { refund: true, body: { action: 'pay', paymentMode: 'invalid' } });
  assert.equal(before.code, 400);
  const paid = await invoke(controller.updatePaymentRefund, patient, { refund: true, body: { action: 'pay', paymentMode: 'online' }, files: [{ filename: 'refund-proof.jpg', originalname: 'proof.jpg' }] });
  assert.equal(paid.data.patient.stages[0].amountPaid, 750);
  assert.equal(paid.data.patient.stages[0].payments[0].refundedAmount, 250);
  assert.equal(paid.data.patient.stages[0].payments[0].refunds[0].referenceNumber, '');
  assert.equal(paid.data.patient.stages[0].payments[0].refunds[0].proofFiles[0].url, '/uploads/payments/refund-proof.jpg');
  const settled = await invoke(controller.updatePaymentRefund, patient, { refund: true, body: { action: 'settle' } });
  assert.equal(settled.data.patient.stages[0].amountPaid, 750);
  assert.equal(settled.data.patient.stages[0].payments[0].refunds[0].status, 'settled');
  assert.equal(settled.data.patient.stages[0].payments[0].refunds[0].proofFiles.length, 1);
});

test('cancelled payment remains in history but stops counting as paid', async () => {
  const patient = makePatient();
  const result = await invoke(controller.cancelStagePayment, patient, { body: { reason: 'Wrong entry' } });
  assert.equal(result.data.patient.stages[0].amountPaid, 0);
  assert.equal(result.data.patient.stages[0].payments[0].approvalStatus, 'cancelled');
  assert.equal(result.data.patient.stages[0].payments[0].cancellationReason, 'Wrong entry');
});

test('full patient refund covers payments across phases and excludes existing refund reservations', async () => {
  const patient = makePatient([{ amount: 200, reason: 'Earlier request', status: 'initiated' }]);
  patient.stages.push({ number: 2, payments: [{ amount: 500, approvalStatus: 'approved' }, { amount: 900, approvalStatus: 'pending' }] });
  const result = await invoke(controller.initiatePaymentRefund, patient, { patientWide: true, body: { refundMode: 'full', amount: 1300, reason: 'Full refund' } });
  assert.equal(result.data.success, true);
  assert.equal(patient.stages[0].payments[0].refunds[1].amount, 800);
  assert.equal(patient.stages[1].payments[0].refunds[0].amount, 500);
  assert.equal(patient.stages[1].payments[1].refunds.length, 0);
});

test('custom refund spans multiple payments and rejects amounts above the combined balance', async () => {
  const patient = makePatient();
  patient.stages[0].payments.push({ amount: 500, approvalStatus: 'approved' });
  const invalid = await invoke(controller.initiatePaymentRefund, patient, { patientWide: true, body: { amount: 1600, reason: 'Refund' } });
  assert.equal(invalid.code, 409);
  assert.equal(patient.stages[0].payments[0].refunds.length, 0);
  const result = await invoke(controller.initiatePaymentRefund, patient, { patientWide: true, body: { refundMode: 'custom', amount: 1200, reason: 'Partial refund' } });
  assert.equal(result.data.success, true);
  assert.equal(patient.stages[0].payments[0].refunds[0].amount, 1000);
  assert.equal(patient.stages[0].payments[1].refunds[0].amount, 200);
});
