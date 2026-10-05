const { test } = require('node:test');
const assert = require('node:assert/strict');
const { validateFinalBill, renderFinalBill } = require('./finalBill');
const { DEFAULT_PARTICULARS, DEFAULT_STATUSES } = require('../models/InvoiceSettings');
const settings = { paymentParticulars: DEFAULT_PARTICULARS, paymentStatuses: DEFAULT_STATUSES };
const sample = () => ({
  date: '2026-10-05', patientName: 'A Sample Patient', patientCode: 'P-100', age: '5', gender: 'Female', guardianName: 'Guardian',
  items: [{ amount: '599', duration: '05/10/2026' }, { amount: '43000', duration: 'Six Months' }, { amount: '450', duration: '05/10/2026' }],
  payments: [
    { date: '2026-09-27', particulars: 'Consultation Fee', received: '599' },
    { date: '2026-09-27', particulars: 'First Instalment - Card', received: '15000' },
    { date: '2026-10-05', particulars: 'Card Processing Charge', received: '450' },
    { date: '2026-10-05', particulars: 'Final Instalment', received: '28000' },
  ], paymentStatus: 'FULLY PAID', issuedBy: 'Billing Desk',
});

test('calculates sample invoice and payment total in paise without trusting submitted totals', async () => {
  const d = await validateFinalBill({ ...sample(), totalPayable: 1, amountReceived: 1, amountInWords: 'Wrong' }, settings);
  assert.equal(d.totalPayable, 44049);
  assert.equal(d.amountReceived, 44049);
  assert.equal(d.outstanding, 0);
  assert.equal(d.amountInWords, 'Rupees Forty-Four Thousand Forty-Nine Only');
  assert.deepEqual(d.items.map((item) => item.description), ['Consultation Fee', 'Customized Ayurvedic Formulations', 'Card Processing Charge']);
});

test('decimal payments remain exact; partial bills show outstanding and paise in English', async () => {
  const input = sample(); input.payments = [{ date: '2026-10-05', particulars: 'Consultation Fee', received: '599.50' }]; input.paymentStatus = 'PARTIALLY PAID';
  const d = await validateFinalBill(input, settings);
  assert.equal(d.amountReceived, 599.5);
  assert.equal(d.outstanding, 43449.5);
  assert.equal(d.amountInWords, 'Rupees Five Hundred Ninety-Nine and Fifty Paise Only');
});

test('rejects invalid amounts, dates, arbitrary payment particulars and misleading status', async () => {
  const variants = [
    { items: [{ amount: '-1' }, {}, {}] },
    { items: [{ amount: '599' }, { amount: '43000' }, { amount: '' }] },
    { items: [{ amount: '599' }, { amount: '43000' }, { amount: '450.123' }] },
    { payments: [{ date: '2026-02-30', particulars: 'Consultation Fee', received: '599' }] },
    { payments: [{ date: '2026-10-05', particulars: 'Unconfigured', received: '599' }] },
    { paymentStatus: 'UNPAID' },
    { paymentStatus: 'PARTIALLY PAID' },
    { date: '2026-02-30' },
  ];
  for (const values of variants) await assert.rejects(validateFinalBill({ ...sample(), ...values }, settings), { statusCode: 400 });
});

test('renders supplied form sections and wraps many payment rows onto later pages', async () => {
  const d = await validateFinalBill(sample(), settings);
  const one = (await renderFinalBill('MV-FB-2026-000001', d)).toString('latin1');
  assert.equal((one.match(/\/Type \/Page\b/g) || []).length, 1);
  const many = await validateFinalBill({ ...sample(), payments: Array.from({ length: 35 }, () => ({ date: '2026-10-05', particulars: 'Consultation Fee', received: '1' })), paymentStatus: 'PARTIALLY PAID' }, settings);
  const pdf = (await renderFinalBill('MV-FB-2026-000002', many)).toString('latin1');
  assert.ok((pdf.match(/\/Type \/Page\b/g) || []).length >= 2);
  assert.ok(pdf.startsWith('%PDF-'));
});
