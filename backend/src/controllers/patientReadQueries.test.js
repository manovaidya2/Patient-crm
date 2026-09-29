const { test } = require('node:test');
const assert = require('node:assert/strict');
const Patient = require('../models/Patient');
const controller = require('./patientController');
const { ROLES } = require('../constants/roles');

async function invoke(handler, { query = {}, role = ROLES.ADMIN, patients = [] } = {}) {
  const original = Patient.find;
  const originalCount = Patient.countDocuments;
  const captured = {};
  Patient.countDocuments = async (filter) => { captured.countFilter = filter; return patients.length; };
  Patient.find = (filter) => {
    captured.filter = filter;
    const result = {
      select(fields) { captured.fields = fields; return this; },
      populate() { return this; },
      sort() { return this; },
      skip(value) { captured.skip = value; return this; },
      limit(value) { captured.limit = value; return this; },
      lean() { captured.lean = true; return this; },
      then(resolve, reject) { return Promise.resolve(patients).then(resolve, reject); },
    };
    return result;
  };
  const response = { status(code) { this.code = code; return this; }, json(data) { this.data = data; } };
  try {
    await handler({ query, user: { _id: 'staff-1', role } }, response, (error) => { throw error; });
    return { ...captured, response };
  } finally { Patient.find = original; Patient.countDocuments = originalCount; }
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

test('bank detail matches dashboard count and amount for the selected paid date', async () => {
  const patients = [{ _id: 'p1', patientName: 'Test', stages: [{ number: 1, payments: [
    { _id: 'a', amount: 100, paymentMode: 'online', payToBank: 'bank-1', date: new Date('2026-09-29T12:00:00'), approvalStatus: 'approved' },
    { _id: 'b', amount: 200, paymentMode: 'online', payToBank: 'bank-1', date: new Date('2026-09-28T12:00:00'), approvalStatus: 'approved' },
    { _id: 'c', amount: 300, paymentMode: 'online', payToBank: 'bank-1', date: new Date('2026-09-29T12:00:00'), approvalStatus: 'pending' },
    { _id: 'd', amount: 400, paymentMode: 'cash', payToBank: 'bank-1', date: new Date('2026-09-29T12:00:00'), approvalStatus: 'approved' },
  ] }] }];
  const dashboard = await invoke(controller.getDashboardStats, { patients, query: { followUpDate: '2026-09-29', bankFilter: 'date', bankDate: '2026-09-29' } });
  const detail = await invoke(controller.getPaymentsLedger, { patients, query: { bankId: 'bank-1', from: '2026-09-29', to: '2026-09-29' } });
  const bank = dashboard.response.data.bankPaymentSummary.rows.find((row) => row.bankId === 'bank-1');
  assert.equal(detail.response.data.total, bank.count);
  assert.equal(detail.response.data.totalAmount, bank.amount);
  assert.equal(bank.count, 1);
  const all = await invoke(controller.getDashboardStats, { patients, query: { followUpDate: '2026-09-29' } });
  assert.equal(all.response.data.bankPaymentSummary.range, 'all');
  assert.equal(all.response.data.bankPaymentSummary.rows[0].count, 2);
  assert.equal(all.response.data.bankPaymentSummary.rows[0].amount, 300);
});

test('missing amount filter combines with consultation date and staff scope before pagination', async () => {
  const result = await invoke(controller.getPatients, {
    role: ROLES.ASSISTANT_DOCTOR,
    query: { amountStatus: 'missing', consultationDate: '2026-09-29', search: 'Patient', page: 2, limit: 10 },
    patients: [{ _id: 'p1', patientName: 'Patient', currentStage: 2, stages: [{ number: 1, totalAmount: 49000 }, { number: 2 }] }],
  });
  assert.equal(result.filter.assignedDoctor, 'staff-1');
  assert.equal(result.filter.$expr.$and.length, 2);
  assert.ok(result.filter.$expr.$and[1].$lte);
  assert.ok(result.filter.$or);
  assert.deepEqual(result.countFilter, result.filter);
  assert.equal(result.skip, 10);
  assert.ok(result.fields.includes('stages.totalAmount'));
  assert.equal(result.response.data.patients[0].totalAmount, 0);
});

test('amount column uses current phase and invalid amount filters are rejected', async () => {
  const result = await invoke(controller.getPatients, {
    query: { amountStatus: 'added' },
    patients: [{ _id: 'p1', currentStage: 2, stages: [{ number: 1, totalAmount: 100 }, { number: 2, totalAmount: 49000 }] }],
  });
  assert.ok(result.filter.$expr.$gt);
  assert.equal(result.response.data.patients[0].totalAmount, 49000);
  const invalid = await invoke(controller.getPatients, { query: { amountStatus: 'bad' } });
  assert.equal(invalid.response.code, 400);
});
