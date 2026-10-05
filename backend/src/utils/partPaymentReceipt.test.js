const { test } = require('node:test');
const assert = require('node:assert/strict');
const { validateReceipt, renderReceipt, receiptFileName } = require('./partPaymentReceipt');

const sample = () => ({ patientName: 'Test Patient', patientCode: 'P-123', guardianName: 'Guardian', age: '9', gender: 'Male', date: '2026-10-05', totalPayable: '49000', amountReceived: '10000', outstanding: '39000', paymentModes: ['online'], reference: '123456789012' });

test('receipt snapshots preserve editable patient values and all manual amounts', () => {
  const input = { ...sample(), patientName: ' Updated Name ', consultationFee: '599.50', adjustment: '100', paymentModes: ['cash', 'online', 'cash'], cashCollectedBy: 'Reception', poVerified: 'yes', instalments: [{ amount: '39000', dueDate: '2026-11-01', status: 'pending' }] };
  const result = validateReceipt(input);
  assert.equal(result.patientName, 'Updated Name');
  assert.equal(result.totalPayable, 49000);
  assert.equal(result.consultationFee, 599.5);
  assert.equal(result.amountReceived, 10000);
  assert.deepEqual(result.paymentModes, ['cash', 'online']);
  assert.equal(result.instalments.length, 3);
  assert.equal(result.instalments[0].dueDate, '2026-11-01');
  assert.equal(input.patientName, ' Updated Name ');
});

test('requires valid date, name and explicit totals including zero', () => {
  for (const patch of [{ patientName: '' }, { date: '' }, { date: '2026-02-30' }, { totalPayable: '' }, { amountReceived: '' }, { outstanding: '' }, { time: '25:88' }]) {
    assert.throws(() => validateReceipt({ ...sample(), ...patch }), { statusCode: 400 });
  }
  assert.equal(validateReceipt({ ...sample(), outstanding: 0 }).outstanding, 0);
  assert.throws(() => validateReceipt(null), { statusCode: 400 });
});

test('rejects malformed amounts and input objects instead of coercing them', () => {
  for (const value of [-1, 'NaN', Infinity, '2.345', '1e5', true, {}, '1000000000']) assert.throws(() => validateReceipt({ ...sample(), amountReceived: value }), { statusCode: 400 });
  assert.throws(() => validateReceipt({ ...sample(), patientName: { $ne: '' } }), { statusCode: 400 });
  assert.throws(() => validateReceipt({ ...sample(), reference: 'x'.repeat(81) }), { statusCode: 400 });
});

test('validates payment boxes and cash recipient without requiring online references', () => {
  for (const paymentModes of [[], ['invalid'], 'cash']) assert.throws(() => validateReceipt({ ...sample(), paymentModes }), { statusCode: 400 });
  assert.throws(() => validateReceipt({ ...sample(), paymentModes: ['cash'] }), /Cash collected by/);
  assert.equal(validateReceipt({ ...sample(), reference: '' }).reference, '');
});

test('instalments validate date, status and template capacity', () => {
  for (const instalments of [[{ dueDate: '2026-02-30' }], [{ status: 'bad' }], [{ amount: '-1' }], [{}, {}, {}, {}], ['bad'], {}]) assert.throws(() => validateReceipt({ ...sample(), instalments }), { statusCode: 400 });
  assert.throws(() => validateReceipt({ ...sample(), poVerified: 'bad' }), { statusCode: 400 });
});

test('filenames retain receipt type and number without path traversal', () => {
  const name = receiptFileName('MV-PP-2026-000001', '../Test / Patient');
  assert.equal(name, 'Part-payment-receipt-MV-PP-2026-000001-Test-Patient.pdf');
  assert.equal(/[\\/]/.test(name), false);
});

test('renders a single A4 PDF with embedded receipt template and font', async () => {
  const pdf = await renderReceipt('MV-PP-2026-000001', validateReceipt(sample()));
  const text = pdf.toString('latin1');
  assert.ok(text.startsWith('%PDF-'));
  assert.equal((text.match(/\/Type \/Page\b/g) || []).length, 1);
  assert.match(text, /\/Subtype \/Image/);
  assert.match(text, /\/FontFile2/);
  assert.ok(pdf.length > 150000);
});
