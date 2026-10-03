const { test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { mock } = require('node:test');
const Receipt = require('../models/ConsultationReceipt');
const Appointment = require('../models/AppointmentManagementEntry');
const Patient = require('../models/Patient');
const { day, ledgerMatch, ledgerPipeline, createReceipt, reviewReceipt, deleteReceipt, getLedger } = require('./financialLedgerController');
const id = '507f1f77bcf86cd799439011';
const user = { _id: id, name: 'Accountant' };
const invoke = async (handler, body = {}, extra = {}) => {
  let data, error, status = 200;
  await handler({ body, user, params: { id }, query: {}, ...extra }, { status(value) { status = value; return this; }, json(value) { data = value; } }, (value) => { error = value; });
  return { data, error, status };
};
afterEach(() => mock.restoreAll());

test('strict calendar dates reject impossible and malformed dates', () => {
  for (const value of ['2026-02-30', '2026-13-01', 'not-a-date', '', '2026-1-1']) assert.throws(() => day(value), /valid date/);
  assert.equal(day('2024-02-29').toISOString(), '2024-02-29T00:00:00.000Z');
});
test('ledger filters combine type, status, date, patient, mode and literal search', () => {
  const match = ledgerMatch({ kind: 'treatment', status: 'pending', from: '2026-09-01', to: '2026-09-30', mode: 'cash', patientId: id, search: 'Name (A)+' });
  assert.equal(match.kind, 'treatment'); assert.equal(match.status, 'pending'); assert.equal(match.paymentMode, 'cash');
  assert.equal(String(match.patientId), id);
  assert.equal(match.date.$lt.toISOString(), '2026-10-01T00:00:00.000Z');
  const regex = new RegExp(match.$or[0].patientName.$regex, 'i');
  assert.equal(regex.test('Name (A)+'), true); assert.equal(regex.test('Name AAAAA'), false);
});
test('invalid query filters fail closed', () => {
  for (const query of [{ kind: 'invalid' }, { status: 'invalid' }, { mode: 'invalid' }, { patientId: 'bad' }, { from: '2026-10-02', to: '2026-10-01' }]) assert.throws(() => ledgerMatch(query));
});
test('treatment is read from patients; consultation is unioned, not duplicated', () => {
  const all = ledgerPipeline();
  assert.equal(all.at(-1).$unionWith.coll, Receipt.collection.name);
  assert.equal(ledgerPipeline('treatment').some((stage) => stage.$unionWith), false);
  assert.deepEqual(ledgerPipeline('consultation')[0], { $match: { _id: null } });
  assert.equal(all.find((stage) => stage.$project).$project.patientApproval, '$approvalStatus');
});
test('bank transaction ID and UTR are separate from MongoDB document identity', () => {
  const projection = ledgerPipeline('treatment').find((stage) => stage.$project).$project;
  assert.equal(projection._id, '$stages.payments._id');
  assert.deepEqual(projection.transactionId, { $ifNull: ['$stages.payments.transactionId', ''] });
  assert.deepEqual(projection.utr, { $ifNull: ['$stages.payments.utr', ''] });
  const match = ledgerMatch({ search: '663864822579' });
  assert.ok(match.$or.some((clause) => clause.transactionId));
  assert.ok(match.$or.some((clause) => clause.utr));
});
test('summary and pagination use the same filtered dataset', async () => {
  mock.method(Patient, 'aggregate', async (pipeline) => {
    assert.equal(pipeline.at(-2).$match.status, 'pending');
    const facet = pipeline.at(-1).$facet;
    assert.equal(facet.rows[1].$skip, 25); assert.equal(facet.rows[2].$limit, 25);
    return [{ rows: [], summary: [{ count: 35, pending: 500, approved: 0, refunded: 0 }] }];
  });
  const result = await invoke(getLedger, {}, { query: { status: 'pending', page: '2' } });
  assert.equal(result.data.pages, 2); assert.equal(result.data.summary.pending, 500);
});
const input = { appointment: id, patientName: 'Visitor', amount: '600', date: '2026-01-01', paymentMode: 'cash', submissionKey: 'receipt-submission-12345' };
test('manual receipt supports 99, 500, 599, 600 and partial amounts, always pending', async () => {
  mock.method(Receipt, 'findOne', async () => null);
  mock.method(Appointment, 'findById', () => ({ select: async () => ({ _id: id, appointmentCode: 'APT-101' }) }));
  mock.method(Receipt, 'create', async (value) => {
    const doc = new Receipt(value);
    await doc.validate();
    assert.equal(doc.status, 'pending'); assert.equal(doc.appointmentCode, 'APT-101'); assert.equal(doc.recordedByName, user.name);
    return doc;
  });
  for (const amount of ['99', '500', '599', '600', '12.25']) {
    const result = await invoke(createReceipt, { ...input, amount, status: 'approved', approvedByName: 'Forged' });
    assert.equal(result.error, undefined); assert.equal(result.data.receipt.amount, Number(amount)); assert.equal(result.data.receipt.approvedByName, '');
  }
});
test('invalid money and future dates are rejected', async () => {
  mock.method(Receipt, 'findOne', async () => null);
  for (const amount of ['0', '-1', 'NaN', '1.234', '100000001']) {
    const result = await invoke(createReceipt, { ...input, amount }); assert.equal(result.error?.statusCode, 400);
  }
  const result = await invoke(createReceipt, { ...input, date: '2999-01-01' }); assert.equal(result.error?.statusCode, 400);
});
test('replayed submission returns the original receipt without another write', async () => {
  mock.method(Receipt, 'findOne', async () => ({ _id: id, amount: 600 }));
  const create = mock.method(Receipt, 'create', async () => { throw Error('must not create'); });
  const result = await invoke(createReceipt, input);
  assert.equal(result.data.receipt.amount, 600); assert.equal(create.mock.callCount(), 0);
});
test('approval conditionally updates only pending receipts', async () => {
  mock.method(Receipt, 'findOneAndUpdate', async (filter, update) => {
    assert.deepEqual(filter, { _id: id, status: 'pending' });
    assert.equal(update.$set.approvedByName, user.name); assert.equal(update.$set.status, 'approved');
    return { _id: id, ...update.$set };
  });
  const result = await invoke(reviewReceipt, { action: 'approve' }); assert.equal(result.data.receipt.status, 'approved');
});
test('concurrent approval or cancellation returns conflict', async () => {
  mock.method(Receipt, 'findOneAndUpdate', async () => null);
  const result = await invoke(reviewReceipt, { action: 'approve' }); assert.equal(result.status, 409);
});
test('cancellation requires a reason and records actor and timestamp', async () => {
  assert.equal((await invoke(reviewReceipt, { action: 'cancel' })).error?.statusCode, 400);
  mock.method(Receipt, 'findOneAndUpdate', async (filter, update) => {
    assert.equal(filter.status, 'pending'); assert.equal(update.$set.cancellationReason, 'Duplicate receipt');
    assert.equal(update.$set.cancelledByName, user.name); assert.ok(update.$set.cancelledAt instanceof Date);
    return update.$set;
  });
  assert.equal((await invoke(reviewReceipt, { action: 'cancel', reason: 'Duplicate receipt' })).data.receipt.status, 'cancelled');
});

test('admin deletion removes approved consultation receipts', async () => {
  mock.method(Receipt, 'findByIdAndDelete', async (receiptId) => {
    assert.equal(receiptId, id);
    return { _id: id, status: 'approved' };
  });
  const result = await invoke(deleteReceipt);
  assert.equal(result.data.success, true);
});

test('deleting a missing consultation receipt returns not found', async () => {
  mock.method(Receipt, 'findByIdAndDelete', async () => null);
  const result = await invoke(deleteReceipt);
  assert.equal(result.status, 404);
});
