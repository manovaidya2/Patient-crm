const { test, afterEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const { ROLES } = require('../constants/roles');
const { canWrite, receiptFilter, normalizedValue, updateField, updateFee, prepareReceipt, getForm, updateSalesReceipt } = require('./appointmentFormController');
const { createReceipt } = require('./financialLedgerController');
const Sales = require('../models/SalesAppointment');
const Management = require('../models/AppointmentManagementEntry');
const Column = require('../models/SalesSheetColumn');
const Receipt = require('../models/ConsultationReceipt');
const Audit = require('../models/SalesSheetAudit');
const Bank = require('../models/BankAccount');
const { createAppointment, listAppointments, listManagedAppointments, logManagementCall, listManagementCalls, logSalesCall, listSalesCalls, listCalls, logCall, cancelAcceptance } = require('./salesSheetController');
const id = '507f1f77bcf86cd799439011';
const columnId = '507f1f77bcf86cd799439012';
const user = { _id: id, role: ROLES.SALES_TEAM, name: 'Sales member' };
const row = { _id: id, appointmentCode: 'APT-101', appointmentDate: '2026-10-02', createdBy: id, status: 'active', acceptedAt: null, values: new Map([[columnId, '99']]) };
const invoke = async (handler, req) => {
  let body, error, status = 200, advanced = false;
  await handler({ user, params: { sheet: 'sales', id }, body: {}, app: { get: () => null }, ...req }, { status(value) { status = value; return this; }, json(value) { body = value; } }, (err) => { error = err; advanced = !err; });
  return { body, error, status, advanced };
};
afterEach(() => mock.restoreAll());
test('reception cannot edit sales confirmation fields through appointment form', async () => {
  mock.method(Management, 'findById', async () => ({ ...row, sourceAppointment: id }));
  mock.method(Sales, 'findById', async () => row);
  mock.method(Column, 'findOne', async () => ({ _id: columnId, label: 'Confirmation notes', type: 'text', section: 'confirmation' }));
  const result = await invoke(updateField, { params: { sheet: 'management', id }, user: { ...user, role: ROLES.RECEPTIONIST }, body: { source: 'sales', columnId, value: 'Changed' } });
  assert.equal(result.error?.statusCode, 403);
});
test('sales can edit only owned active unaccepted rows; accountant stays read-only', () => {
  assert.equal(canWrite('sales', row, user), true);
  assert.equal(canWrite('sales', { ...row, createdBy: 'another' }, user), false);
  assert.equal(canWrite('sales', { ...row, acceptedAt: new Date() }, user), false);
  assert.equal(canWrite('sales', { ...row, status: 'rescheduled' }, user), false);
  assert.equal(canWrite('management', row, user), false);
  assert.equal(canWrite('management', row, { role: ROLES.RECEPTIONIST }), true);
  assert.equal(canWrite('management', row, { role: ROLES.ACCOUNTANT }), false);
});
test('sales advance remains the same receipt after acceptance; direct appointments use own ID', () => {
  assert.deepEqual(receiptFilter({ sheet: 'sales', row, root: id }), { $or: [{ salesAppointment: id }] });
  assert.deepEqual(receiptFilter({ sheet: 'management', row: { _id: 'management' }, root: id }), { $or: [{ salesAppointment: id }, { appointment: 'management' }] });
  assert.deepEqual(receiptFilter({ sheet: 'management', row }), { appointment: id });
});
test('field types validate options, calendar dates, required checkbox and file paths', () => {
  assert.equal(normalizedValue({ type: 'checkbox' }, '\u2611'), 'true');
  assert.equal(normalizedValue({ type: 'checkbox' }, 'false'), 'false');
  assert.throws(() => normalizedValue({ type: 'checkbox', required: true }, 'false'));
  assert.throws(() => normalizedValue({ type: 'date' }, '2026-02-30'));
  assert.throws(() => normalizedValue({ type: 'number' }, 'money'));
  assert.throws(() => normalizedValue({ type: 'file' }, 'javascript:alert(1)'));
  assert.throws(() => normalizedValue({ type: 'select', options: ['Yes'] }, 'No'));
  assert.equal(normalizedValue({ type: 'multi_select', options: ['A', 'B'] }, 'B, A'), 'A, B');
});
test('saving a field changes only its own map key and checks the previous value', async () => {
  mock.method(Sales, 'findById', async () => row);
  mock.method(Column, 'findOne', async () => ({ _id: columnId, label: 'Patient name', type: 'text' }));
  mock.method(Audit, 'create', async () => ({}));
  mock.method(Sales, 'findOneAndUpdate', async (condition, update) => {
    assert.equal(condition[`values.${columnId}`], '99');
    assert.equal(condition.acceptedAt, null);
    assert.equal(update.$set[`values.${columnId}`], 'Updated');
    assert.equal(update.$set.values, undefined);
    return row;
  });
  const result = await invoke(updateField, { body: { columnId, source: 'sales', previousValue: '99', value: 'Updated' } });
  assert.equal(result.error, undefined); assert.equal(result.body.value, 'Updated');
});
test('concurrent field changes return conflict without replacing other data', async () => {
  mock.method(Sales, 'findById', async () => row);
  mock.method(Column, 'findOne', async () => ({ type: 'text' }));
  mock.method(Sales, 'findOneAndUpdate', async () => null);
  const result = await invoke(updateField, { body: { columnId, source: 'sales', previousValue: 'old', value: 'new' } });
  assert.equal(result.error.statusCode, 409);
});
test('sales owner can set consultation fee after saving an unaccepted appointment', async () => {
  mock.method(Sales, 'findById', async () => ({ ...row, consultationFee: null }));
  mock.method(Sales, 'findOneAndUpdate', async (filter, update) => {
    assert.equal(String(filter._id), id);
    assert.equal(filter.consultationFee, null);
    assert.equal(update.$set.consultationFee, 599);
    assert.equal(update.$set.updatedByName, user.name);
    return { ...row, consultationFee: 599 };
  });
  mock.method(Audit, 'create', async () => ({}));
  const result = await invoke(updateFee, { body: { amount: '599', previousValue: null } });
  assert.equal(result.error, undefined);
  assert.equal(result.body.consultationFee, 599);
});
test('sales cannot change consultation fee after reception accepts the appointment', async () => {
  mock.method(Sales, 'findById', async () => ({ ...row, acceptedAt: new Date(), consultationFee: null }));
  const result = await invoke(updateFee, { body: { amount: '599', previousValue: null } });
  assert.equal(result.error.statusCode, 403);
});
test('receipt authorization rejects other sales staff before accepting uploads', async () => {
  mock.method(Sales, 'findById', async () => ({ ...row, createdBy: 'another' }));
  assert.equal((await invoke(prepareReceipt, {})).error.statusCode, 403);
});
test('saved pre-accept appointment accepts another sales payment as pending', async () => {
  mock.method(Receipt, 'findOne', async () => null);
  mock.method(Receipt, 'create', async (value) => { const doc = new Receipt(value); await doc.validate(); return doc; });
  const result = await invoke(createReceipt, { consultationTarget: { sheet: 'sales', row, root: id }, body: { patientName: 'Visitor', amount: '99', date: '2026-01-01', paymentMode: 'cash', cashReceivedByName: 'Front Desk', submissionKey: 'sales-advance-12345' } });
  assert.equal(result.error, undefined); assert.equal(result.body.receipt.status, 'pending');
  assert.equal(result.body.receipt.appointment, null); assert.equal(String(result.body.receipt.salesAppointment), id);
  assert.equal(result.body.receipt.collectionStage, 'advance');
  assert.equal(result.body.receipt.cashReceivedByName, 'Front Desk');
});
test('saved sales online payment requires both UTR and proof', async () => {
  mock.method(Receipt, 'findOne', async () => null);
  const consultationTarget = { sheet: 'sales', row, root: id };
  const body = { patientName: 'Visitor', amount: '99', date: '2026-01-01', paymentMode: 'online', reference: 'UTR-101', submissionKey: 'saved-online-payment-101' };
  const result = await invoke(createReceipt, { consultationTarget, body, files: [] });
  assert.equal(result.error.statusCode, 400);
  assert.match(result.error.message, /proof/i);
});
test('reception consultation payment requires cash receiver or online reference and proof', async () => {
  mock.method(Receipt, 'findOne', async () => null);
  const consultationTarget = { sheet: 'management', row: { ...row, _id: id }, root: null };
  const base = { patientName: 'Visitor', amount: '500', date: '2026-01-01', submissionKey: 'reception-payment-12345' };
  const cash = await invoke(createReceipt, { consultationTarget, body: { ...base, paymentMode: 'cash' } });
  assert.equal(cash.error.statusCode, 400);
  assert.match(cash.error.message, /received the cash/i);
  const online = await invoke(createReceipt, { consultationTarget, body: { ...base, paymentMode: 'online', reference: 'UTR-123' }, files: [] });
  assert.equal(online.error.statusCode, 400);
  assert.match(online.error.message, /proof/i);
});
test('consultation payment proof stores its dedicated upload URL', async () => {
  mock.method(Receipt, 'findOne', async () => null);
  mock.method(Receipt, 'create', async (value) => { const doc = new Receipt(value); await doc.validate(); return doc; });
  const result = await invoke(createReceipt, {
    consultationTarget: { sheet: 'sales', row, root: id },
    body: { patientName: 'Visitor', amount: '99', date: '2026-01-01', paymentMode: 'online', reference: 'UTR-102', submissionKey: 'saved-online-payment-102' },
    files: [{ filename: 'proof-102.jpg', originalname: 'payment.jpg' }],
  });
  assert.equal(result.error, undefined);
  assert.equal(result.body.receipt.files[0].url, '/uploads/consultation-fees/proof-102.jpg');
  assert.equal(result.body.receipt.files[0].fileName, 'payment.jpg');
});
test('legacy import reads stored amount, requires received confirmation and uses stable source key', async () => {
  mock.method(Column, 'findOne', async () => ({ _id: columnId, type: 'number', label: 'Advance' }));
  mock.method(Receipt, 'findOne', async () => null);
  mock.method(Receipt, 'create', async (value) => { const doc = new Receipt(value); await doc.validate(); return doc; });
  const body = { legacyColumnId: columnId, legacySource: 'sales', patientName: 'Visitor', amount: '9999', date: '2026-01-01', paymentMode: 'cash' };
  const consultationTarget = { sheet: 'sales', row, root: id };
  assert.equal((await invoke(createReceipt, { consultationTarget, body: { ...body } })).error.statusCode, 400);
  const result = await invoke(createReceipt, { consultationTarget, body: { ...body, confirmReceived: 'true' } });
  assert.equal(result.error, undefined); assert.equal(result.body.receipt.amount, 99);
  assert.equal(result.body.receipt.submissionKey, `sheet-import:${id}:sales:${columnId}`);
});
test('rescheduled appointments resolve receipts using the original sales account', async () => {
  const root = { ...row, _id: columnId };
  mock.method(Sales, 'findById', async (value) => String(value) === columnId ? root : { ...row, consultationAccount: columnId });
  const { loadTarget } = require('./appointmentFormController');
  const result = await loadTarget({ user, params: { sheet: 'sales', id } });
  assert.equal(String(result.root), columnId); assert.equal(result.owner._id, columnId);
});

test('sales online advance stores the selected bank on its consultation receipt', async () => {
  const bankId = '507f1f77bcf86cd799439013';
  mock.method(Column, 'find', () => ({ sort: () => ({ lean: async () => [] }) }));
  mock.method(Column, 'findOne', () => ({ lean: async () => null }));
  mock.method(Bank, 'findOne', async (filter) => {
    assert.deepEqual(filter, { _id: bankId, isActive: true });
    return { _id: bankId, name: 'Clinic Bank', displayName: 'Clinic Main Account' };
  });
  mock.method(Sales, 'create', async (value) => ({ _id: id, ...value, values: new Map(), status: 'active' }));
  mock.method(Receipt, 'create', async (value) => {
    const receipt = new Receipt(value);
    await receipt.validate();
    assert.equal(String(receipt.bank), bankId);
    assert.equal(receipt.bankName, 'Clinic Main Account');
    return receipt;
  });
  mock.method(Audit, 'create', async () => ({}));
  const result = await invoke(createAppointment, { body: {
    appointmentDate: '2026-10-02', consultationFee: 599, values: {},
    advance: { amount: 99, date: '2026-10-02', paymentMode: 'online', bank: bankId, reference: 'UTR-123', files: [{ url: '/uploads/records/proof.jpg', fileName: 'proof.jpg' }] },
  } });
  assert.equal(result.error, undefined);
  assert.equal(result.status, 201);
});

test('accepted appointment keeps its generated fields and linked call target in the form', async () => {
  const source = { ...row, createdAt: new Date('2026-10-02T10:00:00Z') };
  const management = { _id: columnId, appointmentCode: row.appointmentCode, appointmentDate: row.appointmentDate,
    sourceAppointment: id, entryAt: source.createdAt, acceptedAt: new Date('2026-10-02T12:00:00Z'),
    createdByName: 'Sales member', salesValues: new Map(), values: new Map(), updatedAt: new Date('2026-10-02T12:00:00Z') };
  mock.method(Management, 'findById', async () => management);
  mock.method(Sales, 'findById', async () => source);
  mock.method(Column, 'find', () => ({ sort: () => ({ lean: async () => [] }) }));
  const ManagementColumn = require('../models/AppointmentManagementColumn');
  mock.method(ManagementColumn, 'find', () => ({ sort: () => ({ lean: async () => [] }) }));
  mock.method(Receipt, 'find', () => ({ sort: () => ({ lean: async () => [] }) }));
  mock.method(Bank, 'find', () => ({ select: () => ({ sort: () => ({ lean: async () => [] }) }) }));
  const result = await invoke(getForm, { params: { sheet: 'management', id: columnId }, user: { ...user, role: ROLES.RECEPTIONIST } });
  assert.equal(result.error, undefined);
  assert.equal(result.body.appointmentCode, row.appointmentCode);
  assert.equal(result.body.entryAt.toISOString(), source.createdAt.toISOString());
  assert.deepEqual(result.body.callTarget, { id, sheet: 'sales' });
});

test('direct reception appointment logs and lists its own calls', async () => {
  const appointment = new Management({ _id: id, appointmentDate: '2026-10-02', appointmentCode: 'APT-102',
    createdBy: id, createdByName: 'Reception' });
  mock.method(Management, 'findOneAndUpdate', async (filter, update) => {
    assert.equal(String(filter._id), id);
    assert.equal(filter.sourceAppointment, null);
    appointment.numberOfCalls += update.$inc.numberOfCalls;
    appointment.callStatus = update.$set.callStatus;
    appointment.lastCallAt = update.$set.lastCallAt;
    appointment.lastCallNotes = update.$set.lastCallNotes;
    appointment.callHistory.push(update.$push.callHistory);
    return appointment;
  });
  mock.method(Audit, 'create', async () => ({}));
  const receptionist = { ...user, role: ROLES.RECEPTIONIST };
  const saved = await invoke(logManagementCall, { params: { id }, user: receptionist, body: { status: 'connected', notes: 'Confirmed visit' } });
  assert.equal(saved.error, undefined);
  assert.equal(saved.body.appointment.numberOfCalls, 1);
  mock.method(Management, 'findById', () => ({ select: () => ({ lean: async () => appointment.toObject() }) }));
  const history = await invoke(listManagementCalls, { params: { id }, user: receptionist });
  assert.equal(history.error, undefined);
  assert.equal(history.body.calls[0].notes, 'Confirmed visit');
});

test('sales calls have their own history and cannot be logged after acceptance', async () => {
  const appointment = new Sales({ _id: id, appointmentDate: '2026-10-02', appointmentCode: 'APT-103', createdBy: id });
  mock.method(Sales, 'findOneAndUpdate', async (filter, update) => {
    assert.equal(String(filter.createdBy), id);
    assert.equal(filter.acceptedAt, null);
    appointment.salesNumberOfCalls += update.$inc.salesNumberOfCalls;
    appointment.salesCallStatus = update.$set.salesCallStatus;
    appointment.salesLastCallAt = update.$set.salesLastCallAt;
    appointment.salesCallHistory.push(update.$push.salesCallHistory);
    return appointment;
  });
  mock.method(Audit, 'create', async () => ({}));
  const saved = await invoke(logSalesCall, { params: { id }, body: { status: 'connected', notes: 'Visit confirmed' } });
  assert.equal(saved.error, undefined);
  assert.equal(appointment.salesNumberOfCalls, 1);
  assert.equal(appointment.numberOfCalls, 0);
  mock.method(Sales, 'findById', () => ({ select: () => ({ lean: async () => appointment.toObject() }) }));
  const history = await invoke(listSalesCalls, { params: { id } });
  assert.equal(history.body.calls[0].notes, 'Visit confirmed');
  assert.equal(history.body.canLog, true);
  appointment.acceptedAt = new Date();
  assert.equal((await invoke(listSalesCalls, { params: { id } })).body.canLog, false);
  Sales.findOneAndUpdate.mock.mockImplementation(async () => null);
  assert.equal((await invoke(logSalesCall, { params: { id }, body: { status: 'connected', notes: 'Another call' } })).status, 409);
});

test('sales owner can view reception calls but only reception and admin can log them', async () => {
  const appointment = new Sales({ _id: id, appointmentDate: '2026-10-02', appointmentCode: 'APT-104', createdBy: id });
  appointment.numberOfCalls = 1;
  appointment.callHistory.push({ status: 'connected', notes: 'Reception confirmed visit', calledAt: new Date(), calledBy: id, calledByName: 'Reception' });
  mock.method(Sales, 'findById', () => ({ select: () => ({ lean: async () => appointment.toObject() }) }));
  const history = await invoke(listCalls, { params: { id } });
  assert.equal(history.error, undefined);
  assert.equal(history.body.calls[0].notes, 'Reception confirmed visit');
  assert.equal(history.body.canLog, false);
  const otherSales = await invoke(listCalls, { params: { id }, user: { ...user, _id: columnId } });
  assert.equal(otherSales.status, 403);
  const receptionist = await invoke(listCalls, { params: { id }, user: { ...user, role: ROLES.RECEPTIONIST } });
  assert.equal(receptionist.body.canLog, true);
  const denied = await invoke(logCall, { params: { id }, body: { status: 'connected', notes: 'Sales cannot log reception calls' } });
  assert.equal(denied.status, 403);
});

test('reception can cancel acceptance and return an untouched appointment to Sales', async () => {
  const acceptedAt = new Date('2026-10-02T12:00:00Z');
  mock.method(Management, 'findById', async () => ({ _id: columnId, sourceAppointment: id, appointmentCode: row.appointmentCode, values: new Map(), salesValues: row.values }));
  mock.method(Sales, 'findById', async () => ({ ...row, acceptedAt }));
  mock.method(Receipt, 'exists', async () => false);
  mock.method(Sales, 'findOneAndUpdate', async (filter, update) => {
    assert.equal(String(filter._id), id);
    assert.equal(filter.acceptedAt, acceptedAt);
    assert.equal(update.$set.acceptedAt, null);
    return { ...row, acceptedAt: null };
  });
  mock.method(Management, 'deleteOne', async (filter) => {
    assert.equal(String(filter._id), columnId);
    return { deletedCount: 1 };
  });
  mock.method(Audit, 'create', async () => ({}));
  const result = await invoke(cancelAcceptance, { params: { id: columnId }, user: { ...user, role: ROLES.RECEPTIONIST } });
  assert.equal(result.error, undefined);
  assert.equal(result.body.appointment.acceptedAt, null);
});

test('acceptance cannot be cancelled after reception details are entered', async () => {
  const entry = new Management({ _id: columnId, appointmentDate: '2026-10-02', createdBy: id, createdByName: 'Reception', sourceAppointment: id, values: { field: 'Recorded' }, salesValues: { [columnId]: '99' } });
  mock.method(Management, 'findById', async () => entry);
  mock.method(Sales, 'findById', async () => ({ ...row, acceptedAt: new Date() }));
  const result = await invoke(cancelAcceptance, { params: { id: columnId }, user: { ...user, role: ROLES.RECEPTIONIST } });
  assert.equal(result.status, 409);
});

test('sales can edit a pending advance, but not a verified or accepted payment', async () => {
  const receiptId = '507f1f77bcf86cd799439014';
  const payment = { amount: '100', date: '2026-10-02', paymentMode: 'online', reference: 'UTR-456',
    files: [{ url: '/uploads/records/proof.jpg', fileName: 'proof.jpg' }], bank: '', notes: 'Corrected reference' };
  mock.method(Sales, 'findById', async () => ({ ...row, consultationFee: 599 }));
  mock.method(Sales, 'exists', async () => true);
  mock.method(Receipt, 'findOneAndUpdate', async (filter, update) => {
    assert.equal(filter.status, 'pending');
    assert.equal(filter.collectionStage, 'advance');
    assert.equal(String(filter.salesAppointment), id);
    assert.equal(update.$set.reference, 'UTR-456');
    return { _id: receiptId, ...update.$set };
  });
  mock.method(Audit, 'create', async () => ({}));
  const saved = await invoke(updateSalesReceipt, { params: { sheet: 'sales', id, receiptId }, body: payment });
  assert.equal(saved.error, undefined);
  assert.equal(saved.body.receipt.amount, 100);
  Receipt.findOneAndUpdate.mock.mockImplementation(async () => null);
  assert.equal((await invoke(updateSalesReceipt, { params: { sheet: 'sales', id, receiptId }, body: payment })).error.statusCode, 409);
  Sales.exists.mock.mockImplementation(async () => false);
  assert.equal((await invoke(updateSalesReceipt, { params: { sheet: 'sales', id, receiptId }, body: payment })).error.statusCode, 409);
  Sales.findById.mock.mockImplementation(async () => ({ ...row, createdBy: columnId, consultationFee: 599 }));
  assert.equal((await invoke(updateSalesReceipt, { params: { sheet: 'sales', id, receiptId }, body: payment })).error.statusCode, 403);
});

test('appointment list shows consultation verification and sales calls from the original account', async () => {
  const replacement = { ...row, _id: columnId, consultationAccount: id, consultationFee: null,
    salesNumberOfCalls: 2, salesCallStatus: 'connected', numberOfCalls: 1, callStatus: 'follow_up',
    lastCallNotes: 'Reception follow-up', createdAt: new Date('2026-10-02T10:00:00Z') };
  mock.method(Sales, 'find', (filter) => filter._id
    ? { select: () => ({ lean: async () => [{ _id: id, consultationFee: 599 }] }) }
    : { select: () => ({ sort: async () => [replacement] }) });
  mock.method(Column, 'find', () => ({ select: () => ({ lean: async () => [] }) }));
  mock.method(Receipt, 'find', (filter) => {
    assert.deepEqual(filter.salesAppointment.$in, [id]);
    return { select: () => ({ lean: async () => [
      { salesAppointment: id, amount: 99, status: 'approved' },
      { salesAppointment: id, amount: 500, status: 'pending' },
    ] }) };
  });
  const result = await invoke(listAppointments, { query: { date: '2026-10-02' } });
  assert.equal(result.error, undefined);
  const listed = result.body.appointments[0];
  assert.equal(listed.consultationFee, 599);
  assert.deepEqual(listed.consultationPayments, { received: 599, verified: 99, pending: 500, receiptCount: 2, verifiedCount: 1 });
  assert.equal(listed.salesNumberOfCalls, 2);
  assert.equal(listed.salesCallStatus, 'connected');
  assert.equal(listed.numberOfCalls, 1);
  assert.equal(listed.callStatus, 'follow_up');
  assert.equal(listed.lastCallNotes, 'Reception follow-up');
});

test('management list summarizes linked sales and direct reception payments separately', async () => {
  const sourceId = '507f1f77bcf86cd799439015';
  const directId = '507f1f77bcf86cd799439016';
  const linked = { _id: columnId, appointmentDate: '2026-10-02', sourceAppointment: {
    _id: sourceId, consultationAccount: id, salesNumberOfCalls: 2, salesCallStatus: 'connected',
    numberOfCalls: 1, callStatus: 'follow_up', lastCallNotes: 'Call again',
  }, salesValues: new Map(), values: new Map(), createdBy: id, createdByName: 'Sales member' };
  const direct = { _id: directId, appointmentDate: '2026-10-02', consultationFee: 600,
    salesValues: new Map(), values: new Map(), createdBy: id, createdByName: 'Receptionist' };
  mock.method(Sales, 'find', (filter) => filter._id
    ? { select: () => ({ lean: async () => [{ _id: id, consultationFee: 599 }] }) }
    : { lean: async () => [] });
  mock.method(Management, 'find', () => ({ select: () => ({ populate: () => ({ sort: async () => [linked, direct] }) }) }));
  mock.method(Receipt, 'find', (filter) => {
    assert.equal(filter.$or.length, 2);
    return { select: () => ({ lean: async () => [
      { salesAppointment: id, amount: 99, status: 'approved' },
      { salesAppointment: id, amount: 500, status: 'pending' },
      { appointment: columnId, amount: 50, status: 'approved' },
      { appointment: directId, amount: 600, status: 'approved' },
    ] }) };
  });
  const result = await invoke(listManagedAppointments, { query: { date: '2026-10-02' }, user: { ...user, role: ROLES.RECEPTIONIST } });
  assert.equal(result.error, undefined);
  const [salesEntry, directEntry] = result.body.appointments;
  assert.equal(salesEntry.consultationFee, 599);
  assert.equal(salesEntry.consultationPayments.pending, 500);
  assert.equal(salesEntry.consultationPayments.received, 649);
  assert.equal(salesEntry.consultationPayments.verified, 149);
  assert.equal(salesEntry.numberOfCalls, 1);
  assert.equal(salesEntry.salesNumberOfCalls, 2);
  assert.equal(directEntry.consultationFee, 600);
  assert.equal(directEntry.consultationPayments.verified, 600);
  assert.equal(directEntry.consultationPayments.pending, 0);
});
