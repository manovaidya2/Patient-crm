const test = require('node:test');
const assert = require('node:assert/strict');
const { resolveSplit, bankAmountOf, modeLabelOf } = require('./splitPayment');

test('a split payment adds up its parts and keeps their references', () => {
  const r = resolveSplit(JSON.stringify([
    { mode: 'online', amount: '10,000', utr: 'UTR1' },
    { mode: 'cash', amount: 10000, receivedBy: 'Ramesh' },
    { mode: 'card', amount: 12000, reference: 'APP77' },
  ]));
  assert.equal(r.amount, 32000);
  assert.equal(r.utr, 'UTR1, APP77');
  assert.equal(r.receivedBy, 'Ramesh');
  assert.equal(r.needsProof, true);
  const payment = { paymentMode: 'split', amount: r.amount, splits: r.splits };
  assert.equal(bankAmountOf(payment), 22000, 'online + card reach the bank, cash does not');
  assert.equal(modeLabelOf(payment), 'Split: Online Rs 10,000 (UTR1) + Cash Rs 10,000 (Ramesh) + Card Rs 12,000 (APP77)');
});

test('a split payment is checked part by part', () => {
  assert.throws(() => resolveSplit([{ mode: 'cash', amount: 5, receivedBy: 'A' }]), /at least two parts/);
  assert.throws(() => resolveSplit([{ mode: 'online', amount: 5 }, { mode: 'cash', amount: 5, receivedBy: 'A' }]), /UTR/);
  assert.throws(() => resolveSplit([{ mode: 'card', amount: 5 }, { mode: 'cash', amount: 5 }]), /received the cash/);
  assert.throws(() => resolveSplit([{ mode: 'cheque', amount: 5 }, { mode: 'cash', amount: 5, receivedBy: 'A' }]), /online, cash or card/);
  const cardAndCash = resolveSplit([{ mode: 'card', amount: 5 }, { mode: 'cash', amount: 5, receivedBy: 'A' }]);
  assert.equal(cardAndCash.needsProof, false, 'a card slip is optional');
});

test('plain payments keep their bank amount', () => {
  assert.equal(bankAmountOf({ paymentMode: 'online', amount: 100 }), 100);
  assert.equal(bankAmountOf({ paymentMode: 'cash', amount: 100 }), 0);
  assert.equal(modeLabelOf({ paymentMode: 'cash' }), 'Cash');
});

test('the PO paper takes a split "amount received now" and the payment keeps its parts', () => {
  const purchase = require('./purchaseOrderRecord');
  const { paymentFromPaper } = require('./convertPatient');
  const { values } = purchase.cleanPurchase({ mode: 'Split', splits: [{ mode: 'online', amount: '10000', ref: 'UTR9' }, { mode: 'cash', amount: '5000', ref: 'Ramesh' }], screenshots: [] }, 40000);
  assert.equal(values.amountReceivedNow, 15000);
  assert.equal(values.utrReference, 'UTR9');
  const payment = paymentFromPaper(values, { user: { name: 'PC' } });
  assert.equal(payment.paymentMode, 'split');
  assert.equal(payment.amount, 15000);
  assert.equal(payment.receivedBy, 'Ramesh');
  assert.equal(payment.splits.length, 2);
});
