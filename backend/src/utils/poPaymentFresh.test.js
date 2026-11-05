const { test } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const { paymentsOfPo, poPaymentSummary, earlierPhaseBalance } = require('./poPayment');

// Payments whose ids carry the time they were added.
const at = (iso) => mongoose.Types.ObjectId.createFromTime(Math.floor(new Date(iso).getTime() / 1000));
const pay = (iso, amount, approvalStatus = 'approved') => ({ _id: at(iso), amount, approvalStatus });

// Phase 1 paid without any PO: Rs 5,000 + Rs 15,000 of Rs 39,000 (like Mohd. sibtain).
const stage = () => ({ number: 1, totalAmount: 39000, payments: [pay('2026-10-06T10:00:00Z', 5000), pay('2026-10-20T10:00:00Z', 15000)] });

test('the earlier no-PO payments of a phase are offered as a balance to take into a new PO', () => {
  assert.deepEqual(earlierPhaseBalance(stage(), []), { total: 39000, paid: 20000, pending: 0, balance: 19000, payments: 2 });
  const carried = { ...stage(), earlierBalanceCarried: { poId: 'x', poNumber: 'PO-1' } };
  assert.equal(earlierPhaseBalance(carried, []), null, 'taken once only');
  const legacy = { _id: at('2026-10-01T00:00:00Z'), poNumber: 'PO-OLD', amount: 39000, paymentIds: [], status: 'verified', createdAt: new Date('2026-10-01') };
  assert.equal(earlierPhaseBalance(stage(), [legacy]), null, 'an older PO already holds those payments');
});

test('a New PO starts at Rs 0 paid: earlier phase payments are not its own; its own and later ones are', () => {
  const s = stage();
  const po = { _id: at('2026-11-05T09:00:00Z'), poNumber: 'PO-NEW', amount: 19000, paymentIds: [], ownPaymentsOnly: true, createdAt: new Date('2026-11-05T09:00:00Z'), status: 'pending' };
  assert.equal(poPaymentSummary(s, po, [po]).amountPaid, 0);
  assert.equal(poPaymentSummary(s, po, [po]).remaining, 19000);
  // Paid on the PO (linked), and a later payment added on the phase without choosing a PO.
  const linked = pay('2026-11-06T10:00:00Z', 9000);
  const later = pay('2026-11-07T10:00:00Z', 1000);
  s.payments.push(linked, later);
  po.paymentIds = [linked._id];
  assert.deepEqual(paymentsOfPo(s, po, [po]).map((p) => p.amount), [9000, 1000]);
  assert.equal(poPaymentSummary(s, po, [po]).remaining, 9000);
  // An older PO (made before this change) still counts the phase's payments as before.
  const old = { ...po, ownPaymentsOnly: false, paymentIds: [] };
  assert.equal(poPaymentSummary(s, old, [old]).amountPaid, 30000);
});
