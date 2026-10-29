const { test } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const { paymentsOfPo, poPaymentSummary, paymentForRequestFrom } = require('./poPayment');

const id = () => new mongoose.Types.ObjectId();

test('each PO of a phase is paid on its own; payments on no PO belong only to a lone PO', () => {
  const [a, b, c, loose] = [id(), id(), id(), id()];
  const stage = {
    number: 1, totalAmount: 42000,
    payments: [
      { _id: a, amount: 5000, approvalStatus: 'approved' },
      { _id: b, amount: 39000, approvalStatus: 'approved' },
      { _id: c, amount: 3000, approvalStatus: 'pending' },
      { _id: loose, amount: 700, approvalStatus: 'approved' },
    ],
  };
  const first = { _id: id(), poNumber: 'PO-4651', amount: 42000, paymentIds: [a] };
  const second = { _id: id(), poNumber: 'PO-7165', amount: 39000, paymentIds: [b, c], medicineRequestId: 'r2' };
  const both = [first, second];
  // Two POs: no merging - PO-4651 has only its Rs 5000, PO-7165 its own; the loose payment is on neither.
  assert.deepEqual(paymentsOfPo(stage, first, both).map((p) => p.amount), [5000]);
  assert.deepEqual(paymentsOfPo(stage, second, both).map((p) => p.amount), [39000, 3000]);
  const one = poPaymentSummary(stage, first, both);
  assert.equal(one.amountPaid, 5000);
  assert.equal(one.remaining, 37000);
  const two = poPaymentSummary(stage, second, both);
  assert.equal(two.remaining, 0);
  assert.equal(two.pendingCount, 1, 'its own pending payment keeps it from "full payment"');
  // The request's PO decides release / dispatch; a request without a PO falls back to the whole phase.
  assert.equal(paymentForRequestFrom(both, stage, { requestId: 'r2' }).totalAmount, 39000);
  assert.equal(paymentForRequestFrom(both, stage, { requestId: 'old' }).totalAmount, 42000);
  // A lone PO (older phases) also counts the payments on no PO; a PO without a value uses the phase total.
  assert.deepEqual(paymentsOfPo(stage, first, [first]).map((p) => p.amount), [5000, 39000, 3000, 700]);
  assert.equal(poPaymentSummary(stage, { ...first, amount: 0, paymentIds: [] }, []).totalAmount, 42000);
});
