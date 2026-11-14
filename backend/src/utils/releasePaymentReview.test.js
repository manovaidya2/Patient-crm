const { test } = require('node:test');
const assert = require('node:assert/strict');
const { releasePaymentReview } = require('./releasePaymentReview');

test('all payment history is visible but only the current PO payments are included in release verification', () => {
  const stage = { number: 1, totalAmount: 5000, payments: [
    { _id: 'payment-a', amount: 1000, approvalStatus: 'pending', screenshotUrl: '/proof.png', screenshotFiles: [{ url: '/proof.png', fileName: 'proof.png' }] },
    { _id: 'payment-b', amount: 500, approvalStatus: 'pending' },
  ] };
  const patient = { stages: [stage, { number: 2, totalAmount: 2000, payments: [{ _id: 'payment-c', amount: 500, approvalStatus: 'approved' }] }] };
  const pos = [{ _id: 'po-a', amount: 2000, paymentIds: ['payment-a'], medicineRequestId: 'r1' }, { _id: 'po-b', amount: 3000, paymentIds: ['payment-b'] }];
  const review = releasePaymentReview(patient, stage, { requestId: 'r1' }, pos);
  assert.equal(review.payments.length, 3);
  assert.deepEqual(review.payments.filter((p) => p.forRelease).map((p) => p.id), ['payment-a']);
  assert.equal(review.payments[0].screenshots.length, 1, 'legacy and multi-file proof are deduplicated');
  assert.equal(review.summary.totalAmount, 2000);
  stage.payments[1].amount += 50;
  assert.equal(releasePaymentReview(patient, stage, { requestId: 'r1' }, pos).fingerprint, review.fingerprint, 'another PO does not invalidate this release review');
  stage.payments[0].amount += 50;
  assert.notEqual(releasePaymentReview(patient, stage, { requestId: 'r1' }, pos).fingerprint, review.fingerprint);
});
