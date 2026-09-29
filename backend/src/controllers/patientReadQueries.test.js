const { test } = require('node:test');
const assert = require('node:assert/strict');
const Patient = require('../models/Patient');
const controller = require('./patientController');
const { ROLES } = require('../constants/roles');

async function invoke(handler, { query = {}, role = ROLES.ADMIN, patients = [] } = {}) {
  const original = Patient.find;
  const captured = {};
  Patient.find = (filter) => {
    captured.filter = filter;
    const result = {
      select(fields) { captured.fields = fields; return this; },
      populate() { return this; },
      sort() { return this; },
      lean() { captured.lean = true; return this; },
      then(resolve, reject) { return Promise.resolve(patients).then(resolve, reject); },
    };
    return result;
  };
  const response = { status(code) { this.code = code; return this; }, json(data) { this.data = data; } };
  try {
    await handler({ query, user: { _id: 'staff-1', role } }, response, (error) => { throw error; });
    return { ...captured, response };
  } finally { Patient.find = original; }
}

test('medicine reads filter legacy and multiple requests in Mongo and exclude unrelated stages data', async () => {
  const result = await invoke(controller.listMedicineRequests, {
    query: { status: 'made' },
    patients: [{ _id: 'p1', patientName: 'Test', stages: [{ number: 1, medicineRequest: { status: 'made' }, medicineRequests: [{ requestId: 'r2', status: 'made' }, { status: 'requested' }] }] }],
  });
  assert.deepEqual(result.filter.$or, [
    { 'stages.medicineRequest.status': { $in: ['made'] } },
    { 'stages.medicineRequests.status': { $in: ['made'] } },
  ]);
  assert.equal(result.fields.split(' ').includes('stages'), false);
  assert.equal(result.lean, true);
  assert.equal(result.response.data.rows.length, 2);
  assert.deepEqual(result.response.data.rows.map((row) => row.requestId), ['legacy', 'r2']);
});

test('courier list keeps its status selection and checks sent-to-courier in Mongo', async () => {
  const result = await invoke(controller.listCourierRequests, {
    query: { status: 'delivered' },
    patients: [{ _id: 'p1', stages: [{ number: 1, medicineRequests: [
      { requestId: 'r1', status: 'sent_to_courier', courier: { status: 'delivered' } },
      { requestId: 'r2', status: 'sent_to_courier', courier: { status: 'pending' } },
    ] }] }],
  });
  assert.equal(result.filter.$or[0]['stages.medicineRequest.status'], 'sent_to_courier');
  assert.equal(result.response.data.rows.length, 1);
  assert.equal(result.response.data.rows[0].requestId, 'r1');
});

test('schedule range uses same-entry date bounds and retains staff permissions', async () => {
  const query = { from: '2026-09-28T00:00:00Z', to: '2026-09-28T23:59:59Z' };
  const result = await invoke(controller.getFollowUps, { query, role: ROLES.ASSISTANT_DOCTOR });
  assert.equal(result.filter.assignedDoctor, 'staff-1');
  assert.deepEqual(result.filter.approvalStatus, { $ne: 'pending' });
  assert.deepEqual(result.filter['stages.followUps'].$elemMatch.dateTime, { $gte: new Date(query.from), $lte: new Date(query.to) });
  assert.equal(result.fields.includes('stages.familySessions'), false);
  const all = await invoke(controller.getFamilySessions);
  assert.deepEqual(all.filter['stages.familySessions.0'], { $exists: true });
});

test('approval queue selects only approval fields and retains totals', async () => {
  const result = await invoke(controller.getPendingApprovals, {
    patients: [{ _id: 'p1', patientCode: 'P1', patientName: 'Test', currentStage: 1, approvalStatus: 'pending', stages: [{ number: 1, totalAmount: 100, payments: [{ amount: 30, approvalStatus: 'approved' }, { amount: 20, approvalStatus: 'pending' }] }] }],
  });
  assert.equal(result.fields.includes('stages.payments'), true);
  assert.equal(result.fields.includes('activityLog'), false);
  const patient = result.response.data.patients[0];
  assert.equal(patient.stages[0].amountPaid, 30);
  assert.equal(patient.stages[0].remainingAmount, 70);
  assert.equal(patient.pendingPayments.length, 1);
  assert.equal(patient.stages[0].medicineRequest, undefined);
});

test('refund register keeps payout history and status totals across filters', async () => {
  const patients = [{
    _id: 'patient-1', patientName: 'Patient One', number: '9876543210',
    stages: [{ number: 1, payments: [{ _id: 'payment-1', amount: 1000, refunds: [
      { _id: 'refund-1', amount: 200, reason: 'Duplicate charge', status: 'paid', createdAt: new Date('2026-09-01'), paidAt: new Date('2026-09-02'), paidByName: 'Accounts' },
      { _id: 'refund-2', amount: 100, reason: 'Package change', status: 'initiated', createdAt: new Date('2026-09-03') },
    ] }] }],
  }];
  const result = await invoke(controller.getRefundsLedger, { patients, query: { status: 'paid' } });
  assert.equal(result.response.data.total, 1);
  assert.equal(result.response.data.refunds[0].reason, 'Duplicate charge');
  assert.equal(result.response.data.refunds[0].paidByName, 'Accounts');
  assert.deepEqual(result.response.data.totals, { initiated: 100, paid: 200, settled: 0 });
  assert.equal(result.fields.includes('stages.familySessions'), false);
});

test('payment ledger reports gross, refunded and net amounts separately', async () => {
  const patients = [{ _id: 'patient-1', patientName: 'Patient One', stages: [{ number: 1, payments: [
    { _id: 'payment-1', amount: 1000, approvalStatus: 'approved', date: new Date('2026-09-01'), refunds: [
      { amount: 200, status: 'paid' }, { amount: 100, status: 'initiated' },
    ] },
    { _id: 'payment-2', amount: 500, approvalStatus: 'cancelled', date: new Date('2026-09-01') },
  ] }] }];
  const result = await invoke(controller.getPaymentsLedger, { patients });
  assert.equal(result.response.data.totalAmount, 1000);
  assert.equal(result.response.data.totalRefunded, 200);
  assert.equal(result.response.data.totalNet, 800);
  assert.equal(result.response.data.payments.length, 1);
});
