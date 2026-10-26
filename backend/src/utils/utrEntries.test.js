const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parseUtrEntries, resolveUtrs } = require('./utrEntries');
const { cleanPurchase } = require('./purchaseOrderRecord');
const { paymentFromPaper } = require('./convertPatient');

const five = JSON.stringify([1, 2, 3, 4, 5].map((n) => ({ utr: `UTR${n}`, transactionId: n === 1 ? 'T1' : '', amount: '2000' })));

test('several same-day UTRs make one payment whose amount is their total', () => {
  const r = resolveUtrs({ entries: parseUtrEntries(five), amount: 999, utr: '', transactionId: '' });
  assert.equal(r.amount, 10000);
  assert.equal(r.utr, 'UTR1, UTR2, UTR3, UTR4, UTR5');
  assert.equal(r.transactionId, 'T1');
  assert.equal(r.utrEntries.length, 5);
  assert.deepEqual(r.utrEntries[0], { utr: 'UTR1', transactionId: 'T1', amount: 2000 });
});

test('one UTR works exactly as before', () => {
  const r = resolveUtrs({ entries: parseUtrEntries('[{"utr":"ABC","transactionId":"","amount":""}]'), amount: 5000, utr: 'ignored', transactionId: '' });
  assert.deepEqual(r, { amount: 5000, utr: 'ABC', transactionId: '', utrEntries: [] });
  const plain = resolveUtrs({ entries: [], amount: 5000, utr: 'XYZ', transactionId: 'T9' });
  assert.deepEqual(plain, { amount: 5000, utr: 'XYZ', transactionId: 'T9', utrEntries: [] });
});

test('every transfer needs its UTR and amount; bad amounts and empty rows are handled', () => {
  assert.throws(() => resolveUtrs({ entries: parseUtrEntries('[{"utr":"A","amount":"1000"},{"utr":"B","amount":""}]') }), /amount for transfer 2/);
  assert.throws(() => resolveUtrs({ entries: parseUtrEntries('[{"utr":"A","amount":"1000"},{"utr":"","amount":"500"}]') }), /UTR or transaction ID for transfer 2/);
  assert.throws(() => parseUtrEntries('[{"utr":"A","amount":"-5"}]'), /valid amount/);
  assert.deepEqual(parseUtrEntries('[{"utr":"","transactionId":"","amount":""}]'), []);
});

test('the PO paper keeps several UTRs and the amount received is their total; convert carries them to the payment', () => {
  const paper = cleanPurchase({ mode: 'Online', amountReceivedNow: '1', utrEntries: five }, 42000);
  assert.equal(paper.values.amountReceivedNow, 10000);
  assert.equal(paper.values.utrReference, 'UTR1, UTR2, UTR3, UTR4, UTR5');
  assert.equal(paper.values.utrEntries.length, 5);
  const cash = cleanPurchase({ mode: 'Cash', amountReceivedNow: '5000', cashHandedTo: 'Prachi', utrEntries: five }, 42000);
  assert.deepEqual(cash.values.utrEntries, []);
  const payment = paymentFromPaper(paper.values, { cardCharge: 0, user: { name: 'Abhishek' } });
  assert.equal(payment.amount, 10000);
  assert.equal(payment.utrEntries.length, 5);
  assert.equal(payment.utr, 'UTR1, UTR2, UTR3, UTR4, UTR5');
});
