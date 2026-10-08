const { test, afterEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs/promises');
const path = require('path');
const { Invoice, InvoiceCounter } = require('../models/Invoice');
const Patient = require('../models/Patient');
const { InvoiceSettings, DEFAULT_PARTICULARS, DEFAULT_STATUSES } = require('../models/InvoiceSettings');
const { createInvoice, updateInvoice, deleteInvoice, listInvoices, findPatients, getPdf, getSettings, updateSettings } = require('./invoiceController');
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
  assert.equal(result.body.invoice.pdfStyle, 'black-white');
  assert.equal(result.body.invoice.createdByName, 'Accountant');
  assert.equal(fs.writeFile.mock.callCount(), 1);
});

test('saves a selected color PDF style and uses an identifiable filename', async () => {
  stubSave();
  const result = await invoke(createInvoice, { body: { type: 'part-payment', submissionKey: 'color-submission-123', pdfStyle: 'color', details } });
  assert.equal(result.error, undefined);
  assert.equal(result.body.invoice.pdfStyle, 'color');
  assert.match(result.body.invoice.fileName, /-Color\.pdf$/);
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
  for (const body of [{ type: 'prescription' }, { type: 'part-payment', submissionKey: 'short' }, { type: 'part-payment', submissionKey: 'valid-submission-123', pdfStyle: 'neon', details }, { type: 'part-payment', submissionKey: 'valid-submission-123', details, patient: id }]) {
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

test('invoice routes allow admin, accountant, post counselor, doctor and receptionist', () => {
  const accessMiddleware = invoiceRouter.stack[1].handle;
  for (const role of ['sales_team', 'psychologist', 'medicine_department', 'admin', 'accountant', 'receptionist', 'post_counselor', 'doctor']) {
    let status, permitted = false;
    accessMiddleware({ user: { role } }, { status(n) { status = n; return this; }, json() {} }, () => { permitted = true; });
    assert.equal(permitted, ['admin', 'accountant', 'post_counselor', 'doctor', 'receptionist'].includes(role));
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
  for (const role of ['admin', 'doctor', 'accountant', 'post_counselor', 'receptionist']) {
    let permitted = false, status;
    guard({ user: { role } }, { status(n) { status = n; return this; }, json() {} }, () => { permitted = true; });
    assert.equal(permitted, role === 'admin');
    if (role !== 'admin') assert.equal(status, 403);
  }
});

test('saved bill edit keeps its number and stores prior PDF revision', async () => {
  const original = { _id: id, type: 'part-payment', invoiceNumber: 'MV-PP-2026-000001', revision: 1, details: { ...details, amountReceived: 99 }, fileName: 'Part-payment-receipt-MV-PP-2026-000001-Test-Patient.pdf', patient: null };
  mock.method(Invoice, 'findById', () => ({ lean: async () => original }));
  mock.method(fs, 'mkdir', async () => {});
  let generated;
  mock.method(fs, 'writeFile', async (filePath, data, options) => { generated = filePath; assert.equal(options.flag, 'wx'); assert.ok(data.toString('latin1').startsWith('%PDF-')); });
  mock.method(Invoice, 'findOneAndUpdate', (filter, changes) => {
    assert.equal(filter.revision, 1);
    assert.equal(changes.$set.revision, 2);
    assert.equal(changes.$set.details.amountReceived, 200);
    assert.equal(changes.$push.revisionHistory.fileName, original.fileName);
    assert.equal(changes.$push.revisionHistory.details.amountReceived, 99);
    return { lean: async () => ({ ...original, ...changes.$set, revisionHistory: [changes.$push.revisionHistory] }) };
  });
  const result = await invoke(updateInvoice, { params: { id }, user: { ...user, role: 'admin' }, body: { type: 'part-payment', expectedRevision: 1, details: { ...details, amountReceived: 200, outstanding: 399 } } });
  assert.equal(result.error, undefined);
  assert.equal(result.body.invoice.invoiceNumber, original.invoiceNumber);
  assert.equal(result.body.invoice.revision, 2);
  assert.equal(result.body.invoice.revisionHistory[0].revision, 1);
  assert.match(generated, /-v2-[a-f0-9]{8}\.pdf$/);
});

test('stale revisions are refused before generating a PDF', async () => {
  mock.method(Invoice, 'findById', () => ({ lean: async () => ({ _id: id, revision: 2, type: 'part-payment' }) }));
  mock.method(fs, 'writeFile', async () => { throw new Error('Should not write'); });
  const result = await invoke(updateInvoice, { params: { id }, body: { expectedRevision: 1, details } });
  assert.equal(result.status, 409);
  assert.equal(fs.writeFile.mock.callCount(), 0);
});

test('concurrent edit conflict removes new PDF and preserves previous revision', async () => {
  const original = { _id: id, revision: 1, type: 'part-payment', invoiceNumber: 'MV-PP-2026-000001', details, fileName: 'previous.pdf' };
  mock.method(Invoice, 'findById', () => ({ lean: async () => original }));
  mock.method(fs, 'mkdir', async () => {});
  mock.method(fs, 'writeFile', async () => {});
  mock.method(fs, 'unlink', async () => {});
  mock.method(Invoice, 'findOneAndUpdate', () => ({ lean: async () => null }));
  const result = await invoke(updateInvoice, { params: { id }, body: { expectedRevision: 1, details } });
  assert.equal(result.status, 409);
  assert.equal(fs.unlink.mock.callCount(), 1);
});

test('edit route allows only admin, while readers can still view both bill pages', () => {
  const route = invoiceRouter.stack.find((layer) => layer.route?.path === '/:id' && layer.route.methods.put);
  const guard = route.route.stack[0].handle;
  for (const role of ['admin', 'doctor', 'accountant', 'post_counselor', 'receptionist']) {
    let allowed = false;
    guard({ user: { role } }, { status() { return this; }, json() {} }, () => { allowed = true; });
    assert.equal(allowed, role === 'admin');
  }
});

test('delete route is admin-only', () => {
  const route = invoiceRouter.stack.find((layer) => layer.route?.path === '/:id' && layer.route.methods.delete);
  const guard = route.route.stack[0].handle;
  for (const role of ['admin', 'doctor', 'accountant', 'post_counselor', 'receptionist']) {
    let allowed = false, status;
    guard({ user: { role } }, { status(code) { status = code; return this; }, json() {} }, () => { allowed = true; });
    assert.equal(allowed, role === 'admin');
    if (role !== 'admin') assert.equal(status, 403);
  }
});

test('admin deletes a saved bill and all current and revision PDFs', async () => {
  const invoice = {
    _id: id,
    invoiceNumber: 'MV-FB-2026-000001',
    fileName: 'Final-bill-current.pdf',
    revisionHistory: [
      { revision: 1, fileName: 'Final-bill-v1.pdf' },
      { revision: 2, fileName: 'Final-bill-v2.pdf' },
    ],
  };
  mock.method(Invoice, 'findOneAndDelete', (filter) => {
    assert.equal(String(filter._id), id);
    return { lean: async () => invoice };
  });
  const removed = [];
  mock.method(fs, 'unlink', async (filePath) => { removed.push(filePath); });
  const result = await invoke(deleteInvoice, { params: { id }, user: { ...user, role: 'admin' } });
  assert.equal(result.error, undefined);
  assert.equal(result.body.invoiceNumber, invoice.invoiceNumber);
  assert.deepEqual(removed.map((filePath) => path.basename(filePath)).sort(), ['Final-bill-current.pdf', 'Final-bill-v1.pdf', 'Final-bill-v2.pdf']);
});

test('deleting a missing bill returns not found without touching files', async () => {
  mock.method(Invoice, 'findOneAndDelete', () => ({ lean: async () => null }));
  mock.method(fs, 'unlink', async () => {});
  const result = await invoke(deleteInvoice, { params: { id }, user: { ...user, role: 'admin' } });
  assert.equal(result.status, 404);
  assert.equal(fs.unlink.mock.callCount(), 0);
});

test('editing an older Final Bill keeps a now-retired payment option valid', async () => {
  const oldDetails = {
    date: '2026-10-05', patientName: 'Sample',
    items: [{ amount: 599 }, { amount: 43000 }, { amount: 450 }],
    payments: [{ date: '2026-10-05', particulars: 'Old Payment Option', received: 599 }],
    paymentStatus: 'PARTIALLY PAID',
  };
  mock.method(Invoice, 'findById', () => ({ lean: async () => ({ _id: id, type: 'final-bill', revision: 1, invoiceNumber: 'MV-FB-2026-000001', fileName: 'old.pdf', details: oldDetails }) }));
  mock.method(InvoiceSettings, 'findById', () => ({ lean: async () => ({ paymentParticulars: ['New Payment Option'], paymentStatuses: ['PARTIALLY PAID'] }) }));
  mock.method(fs, 'mkdir', async () => {});
  mock.method(fs, 'writeFile', async () => {});
  mock.method(Invoice, 'findOneAndUpdate', (_filter, changes) => ({ lean: async () => ({ _id: id, type: 'final-bill', invoiceNumber: 'MV-FB-2026-000001', ...changes.$set, revisionHistory: [changes.$push.revisionHistory] }) }));
  const result = await invoke(updateInvoice, { params: { id }, body: { expectedRevision: 1, details: { ...oldDetails, patientName: 'Edited Sample' } } });
  assert.equal(result.error, undefined);
  assert.equal(result.body.invoice.details.payments[0].particulars, 'Old Payment Option');
  assert.equal(result.body.invoice.revision, 2);
});

test('previous PDF version is selected from stored revision history', async () => {
  mock.method(Invoice, 'findById', () => ({ lean: async () => ({ _id: id, type: 'part-payment', invoiceNumber: 'MV-PP-2026-000001', fileName: 'current.pdf', details, revisionHistory: [{ revision: 1, fileName: 'original.pdf', details }] }) }));
  mock.method(fs, 'access', async () => {});
  let downloaded;
  await getPdf({ params: { id, revision: '1' } }, {
    set() { return this; },
    download(_path, name) { downloaded = name; },
    status() { return this; },
    json() {},
  }, (error) => { throw error; });
  assert.equal(downloaded, 'original.pdf');
});
