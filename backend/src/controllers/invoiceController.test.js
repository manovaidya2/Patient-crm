const { test, afterEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs/promises');
const { Invoice, InvoiceCounter } = require('../models/Invoice');
const Patient = require('../models/Patient');
const { InvoiceSettings, DEFAULT_PARTICULARS, DEFAULT_STATUSES } = require('../models/InvoiceSettings');
const { createInvoice, listInvoices, findPatients, getPdf, getSettings, updateSettings } = require('./invoiceController');
const invoiceRouter = require('../routes/invoiceRoutes');
const id = '507f1f77bcf86cd799439011';
const details = { patientName: 'Test Patient', date: '2026-10-05', totalPayable: '599', amountReceived: '99', outstanding: '500', paymentModes: ['online'] };
const user = { _id: id, name: 'Accountant', role: 'accountant' };
async function invoke(handler, overrides = {}) {
  let body, error, status = 200;
  const req = { user, params: {}, query: {}, body: { type: 'part-payment', submissionKey: 'sample-submission-123', details }, ...overrides };
  const res = { status(code) { status = code; return this; }, json(value) { body = value; return this; } };
  await handler(req, res, (err) => { error = err; });
  return { body, error, status };
}
afterEach(() => mock.restoreAll());

function stubSave() {
  mock.method(Invoice, 'findOne', () => ({ lean: async () => null }));
  mock.method(Invoice, 'init', async () => {});
  mock.method(InvoiceCounter, 'findOneAndUpdate', async (filter, change, options) => {
    assert.equal(change.$inc.sequence, 1); assert.equal(options.new, true);
    return { sequence: 12 };
  });
  mock.method(fs, 'mkdir', async () => {});
  mock.method(fs, 'writeFile', async (name, data) => { assert.match(name, /uploads[\\/]invoices[\\/]Part-payment-receipt/); assert.ok(data.toString('latin1').startsWith('%PDF')); });
  mock.method(fs, 'unlink', async () => {});
  mock.method(Invoice, 'create', async (doc) => doc);
}

test('creates numbered persistent PDF and snapshot, without altering patient/payments', async () => {
  stubSave();
  const result = await invoke(createInvoice);
  assert.equal(result.error, undefined);
  assert.equal(result.status, 201);
  assert.match(result.body.invoice.invoiceNumber, /^MV-PP-\d{4}-000012$/);
  assert.equal(result.body.invoice.details.amountReceived, 99);
  assert.equal(result.body.invoice.patient, null);
  assert.equal(result.body.invoice.createdByName, 'Accountant');
  assert.equal(fs.writeFile.mock.callCount(), 1);
});

test('retries return existing receipt without consuming another number', async () => {
  mock.method(Invoice, 'findOne', (filter) => {
    assert.equal(filter.submissionKey, `${id}:sample-submission-123`);
    return { lean: async () => ({ _id: id, invoiceNumber: 'MV-PP-2026-000001' }) };
  });
  const result = await invoke(createInvoice);
  assert.equal(result.body.invoice.invoiceNumber, 'MV-PP-2026-000001');
});

test('rejects missing patient link, malformed requests, and unsupported types', async () => {
  stubSave();
  mock.method(Patient, 'exists', async () => null);
  for (const body of [{ type: 'prescription' }, { type: 'part-payment', submissionKey: 'short' }, { type: 'part-payment', submissionKey: 'valid-submission-123', details, patient: id }]) {
    const result = await invoke(createInvoice, { body }); assert.equal(result.error.statusCode, 400);
  }
  assert.equal(fs.writeFile.mock.callCount(), 0);
});

test('cleans generated file if database save fails', async () => {
  stubSave();
  mock.method(Invoice, 'create', async () => { throw new Error('database failure'); });
  const result = await invoke(createInvoice);
  assert.equal(result.error.message, 'database failure');
  assert.equal(fs.unlink.mock.callCount(), 1);
});

test('concurrent duplicate submissions return winning receipt and remove unused PDF', async () => {
  stubSave();
  let queries = 0;
  mock.method(Invoice, 'findOne', () => ({ lean: async () => ++queries === 1 ? null : { _id: id, invoiceNumber: 'original' } }));
  mock.method(Invoice, 'create', async () => { throw Object.assign(new Error('duplicate'), { code: 11000 }); });
  const result = await invoke(createInvoice);
  assert.equal(result.body.invoice.invoiceNumber, 'original');
  assert.equal(fs.unlink.mock.callCount(), 1);
});

test('list search escapes regex metacharacters, supports date range and pagination', async () => {
  mock.method(Invoice, 'countDocuments', async () => 26);
  mock.method(Invoice, 'find', (filter) => {
    assert.equal(filter.$or[0].invoiceNumber.source, 'A\\+');
    assert.deepEqual(filter.date, { $gte: '2026-10-01', $lte: '2026-10-05' });
    return { sort: () => ({ skip: (n) => { assert.equal(n, 25); return { limit: () => ({ lean: async () => [] }) }; } }) };
  });
  const result = await invoke(listInvoices, { query: { q: 'A+', from: '2026-10-01', to: '2026-10-05', page: '2' } });
  assert.equal(result.error, undefined);
  assert.equal(result.body.pages, 2);
});

test('patient lookup returns only basic editable details, with relative fallback', async () => {
  mock.method(Patient, 'find', () => ({ select: () => ({ sort: () => ({ limit: () => ({ lean: async () => [{ _id: id, patientName: 'Example', patientCode: 'P1', relativeName: 'Parent', age: '6' }] }) }) }) }));
  const result = await invoke(findPatients, { query: { q: 'Example' } });
  assert.equal(result.body.patients[0].guardianName, 'Parent');
  assert.equal(result.body.patients[0].gender, '');
});

test('invalid PDF ids return not found', async () => {
  const result = await invoke(getPdf, { params: { id: '../private' } });
  assert.equal(result.status, 404);
});

test('invoice routes allow admin, accountant, post counselor and doctor but deny reception', () => {
  const accessMiddleware = invoiceRouter.stack[1].handle;
  for (const role of ['sales_team', 'psychologist', 'medicine_department', 'admin', 'accountant', 'receptionist', 'post_counselor', 'doctor']) {
    let status, permitted = false;
    accessMiddleware({ user: { role } }, { status(n) { status = n; return this; }, json() {} }, () => { permitted = true; });
    assert.equal(permitted, ['admin', 'accountant', 'post_counselor', 'doctor'].includes(role));
    if (!permitted) assert.equal(status, 403);
  }
});

test('final bill creation calculates totals, uses own number series, and persists its PDF', async () => {
  stubSave();
  mock.method(InvoiceSettings, 'findById', () => ({ lean: async () => null }));
  fs.writeFile.mock.restore();
  let savedPath;
  mock.method(fs, 'writeFile', async (name, data) => { savedPath = name; assert.ok(data.toString('latin1').startsWith('%PDF')); });
  InvoiceCounter.findOneAndUpdate.mock.restore();
  mock.method(InvoiceCounter, 'findOneAndUpdate', async (filter) => { assert.match(filter._id, /^final-bill-/); return { sequence: 12 }; });
  const bill = {
    date: '2026-10-05', patientName: 'Test Patient',
    items: [{ amount: '599', duration: '05/10/2026' }, { amount: '43000', duration: 'Six Months' }, { amount: '450', duration: '05/10/2026' }],
    payments: [{ date: '2026-10-05', particulars: 'Consultation Fee', received: '599' }, { date: '2026-10-05', particulars: 'Final Instalment', received: '43450' }],
    paymentStatus: 'FULLY PAID', totalPayable: 1, amountReceived: 1,
  };
  const result = await invoke(createInvoice, { body: { type: 'final-bill', submissionKey: 'final-bill-key-12345', details: bill } });
  assert.equal(result.error, undefined);
  assert.match(result.body.invoice.invoiceNumber, /^MV-FB-\d{4}-000012$/);
  assert.equal(result.body.invoice.details.amountReceived, 44049);
  assert.equal(result.body.invoice.details.outstanding, 0);
  assert.match(savedPath, /uploads[\\/]invoices[\\/]Final-bill-MV-FB-/);
});

test('settings default correctly and admin changes are validated', async () => {
  mock.method(InvoiceSettings, 'findById', () => ({ lean: async () => null }));
  const defaults = await invoke(getSettings);
  assert.deepEqual(defaults.body.paymentParticulars, DEFAULT_PARTICULARS);
  assert.deepEqual(defaults.body.paymentStatuses, DEFAULT_STATUSES);
  for (const paymentParticulars of [[], ['Same', 'same'], ['']]) {
    const result = await invoke(updateSettings, { body: { paymentParticulars, paymentStatuses: ['PAID'] } });
    assert.equal(result.error.statusCode, 400);
  }
  mock.method(InvoiceSettings, 'findByIdAndUpdate', async (id, update) => {
    assert.equal(id, 'final-bill');
    assert.deepEqual(update.$set.paymentParticulars, ['Card', 'Cash']);
    return update.$set;
  });
  const saved = await invoke(updateSettings, { body: { paymentParticulars: [' Card ', 'Cash'], paymentStatuses: ['PAID'] } });
  assert.deepEqual(saved.body.paymentParticulars, ['Card', 'Cash']);
});

test('invoice settings writes are admin-only at the route', () => {
  const route = invoiceRouter.stack.find((layer) => layer.route?.path === '/settings' && layer.route.methods.put);
  const guard = route.route.stack[0].handle;
  for (const role of ['admin', 'doctor', 'accountant', 'post_counselor']) {
    let permitted = false, status;
    guard({ user: { role } }, { status(n) { status = n; return this; }, json() {} }, () => { permitted = true; });
    assert.equal(permitted, role === 'admin');
    if (role !== 'admin') assert.equal(status, 403);
  }
});
