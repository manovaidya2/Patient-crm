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

test('payment modes are optional for the revised bill while invalid values are rejected', () => {
  for (const paymentModes of [['invalid'], 'cash']) assert.throws(() => validateReceipt({ ...sample(), paymentModes }), { statusCode: 400 });
  assert.deepEqual(validateReceipt({ ...sample(), paymentModes: [] }).paymentModes, []);
  assert.deepEqual(validateReceipt({ ...sample(), paymentModes: undefined }).paymentModes, []);
  assert.equal(validateReceipt({ ...sample(), paymentModes: ['cash'], cashCollectedBy: '' }).cashCollectedBy, '');
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

test('renders the original receipt template with black entered values on one A4 page', async () => {
  const pdf = await renderReceipt('MV-PP-2026-000001', validateReceipt(sample()));
  const text = pdf.toString('latin1');
  assert.ok(text.startsWith('%PDF-'));
  assert.equal((text.match(/\/Type \/Page\b/g) || []).length, 1);
  assert.match(text, /\/Subtype \/Image/);
  assert.match(text, /\/FontFile2/);
  assert.ok(pdf.length > 150000);
});

test('renders an aligned extra billing row only when a card charge is entered', async () => {
  const base = await renderReceipt('MV-PP-2026-000002', validateReceipt(sample()));
  const charged = await renderReceipt('MV-PP-2026-000002', validateReceipt({ ...sample(), cardCharge: '300' }));
  assert.equal((charged.toString('latin1').match(/\/Type \/Page\b/g) || []).length, 1);
  assert.notDeepEqual(charged, base);
  assert.ok(charged.length > 150000);
});

test('renders a one-page colored receipt without changing the print layout', async () => {
  const details = validateReceipt(sample());
  const blackWhite = await renderReceipt('MV-PP-2026-000003', details, 'black-white');
  const color = await renderReceipt('MV-PP-2026-000003', details, 'color');
  assert.ok(color.toString('latin1').startsWith('%PDF-'));
  assert.equal((color.toString('latin1').match(/\/Type \/Page\b/g) || []).length, 1);
  assert.notDeepEqual(color, blackWhite);
});

test('keeps the colored receipt on one page when a card-charge row is present', async () => {
  const color = await renderReceipt('MV-PP-2026-000004', validateReceipt({ ...sample(), cardCharge: '300' }), 'color');
  assert.equal((color.toString('latin1').match(/\/Type \/Page\b/g) || []).length, 1);
});
