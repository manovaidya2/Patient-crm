const { test, afterEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs/promises');
const { Invoice, InvoiceCounter } = require('../models/Invoice');
const Patient = require('../models/Patient');
const { createInvoice, listInvoices, findPatients, getPdf } = require('./invoiceController');
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
