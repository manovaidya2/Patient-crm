const { test } = require('node:test');
const assert = require('node:assert/strict');
const { consultationSummary } = require('./appointmentConsultations');

test('OPD consultation payments match the appointment and its rescheduled sales account without double counting', () => {
  const entry = { _id: 'appointment-2', consultationFee: 1500, sourceAppointment: { _id: 'sales-2', consultationAccount: 'sales-root', consultationFee: 1800 } };
  const receipts = [
    { _id: 'cash', salesAppointment: 'sales-root', amount: 500, paymentMode: 'cash', status: 'approved', collectionStage: 'advance', cashReceivedByName: 'Sales A', date: '2026-11-13T10:00:00Z', recordedByName: 'Sales A' },
    { _id: 'online', appointment: 'appointment-2', salesAppointment: 'sales-root', amount: 1000, paymentMode: 'online', status: 'pending', bankName: 'Clinic bank', reference: 'UTR-1', files: [{ url: '/uploads/proof.jpg' }], date: '2026-11-14T10:00:00Z' },
    { _id: 'split', appointment: 'appointment-2', amount: 300, paymentMode: 'split', splits: [{ mode: 'cash', amount: 100 }, { mode: 'online', amount: 200, utr: 'UTR-2' }], status: 'approved', approvedByName: 'Doctor', approvedAt: '2026-11-14T11:00:00Z', date: '2026-11-14T09:00:00Z' },
    { _id: 'cancelled', appointment: 'appointment-2', amount: 900, paymentMode: 'cash', status: 'cancelled', cancellationReason: 'Duplicate', date: '2026-11-14T08:00:00Z' },
    { _id: 'unrelated', appointment: 'appointment-other', salesAppointment: 'sales-other', patientName: 'Same name', amount: 99000, paymentMode: 'online', status: 'approved', date: '2026-11-14T08:00:00Z' },
  ];
  const before = JSON.stringify(receipts);
  const view = consultationSummary(entry, receipts, new Map([['sales-root', 2000]]));
  assert.equal(view.fee, 2000, 'the shared sales account fee matches Appointment Management');
  assert.equal(view.received, 1800);
  assert.equal(view.verified, 800);
  assert.equal(view.pending, 1000);
  assert.equal(view.due, 200);
  assert.deepEqual(view.byMode, { cash: 600, online: 1200, card: 0 });
  assert.equal(view.payments.length, 4, 'cancelled receipt history remains visible, unrelated receipts stay excluded');
  const online = view.payments.find((payment) => payment.id === 'online');
  assert.equal(online.utr, 'UTR-1');
  assert.equal(online.files[0].url, '/uploads/proof.jpg');
  assert.equal(view.payments.find((payment) => payment.id === 'cash').collectionStage, 'Sales advance');
  assert.equal(view.payments.find((payment) => payment.id === 'split').approvedByName, 'Doctor');
  assert.equal(JSON.stringify(receipts), before, 'the OPD sheet is read-only');
});

test('manual appointment fees and missing fee values never pick up another appointment payment', () => {
  const receipts = [{ _id: 'receipt-1', appointment: 'manual-1', amount: 500, paymentMode: 'cash', status: 'pending', date: '2026-11-14T10:00:00Z' }];
  const view = consultationSummary({ _id: 'manual-1', consultationFee: 1000 }, receipts);
  assert.equal(view.received, 500);
  assert.equal(view.verified, 0);
  assert.equal(view.pending, 500);
  assert.equal(view.due, 500);
  const unknown = consultationSummary({ _id: 'other' }, receipts);
  assert.equal(unknown.fee, null);
  assert.equal(unknown.due, null, 'an unknown fee is not reported as paid in full');
  assert.equal(unknown.payments.length, 0);
});
