const { test } = require('node:test');
const assert = require('node:assert/strict');
const { paymentDueByCategory } = require('./paymentDueByCategory');

const pay = (amount, approvalStatus = 'approved', extra = {}) => ({ amount, approvalStatus, date: new Date('2026-11-01'), ...extra });

test('phases with payment due, grouped by the category of their supply', () => {
  const patients = [
    // 1+5 first on a PO, 10,000 of 42,000 paid: 32,000 due.
    { _id: 'a', patientName: 'Aarav', patientCode: 'A-1', stages: [{ number: 1, totalAmount: 42000, payments: [pay(10000)], medicineRequests: [] }] },
    // Fully paid (a refund paid out brings it back to due 2,000); a pending payment is not counted as paid.
    { _id: 'b', patientName: 'Bela', patientCode: 'B-1', stages: [{ number: 1, totalAmount: 20000, payments: [pay(20000, 'approved', { refunds: [{ amount: 2000, status: 'paid' }] }), pay(5000, 'pending')], medicineRequests: [{ requestId: 'r1', status: 'requested', supplyPlan: 'C0m45d', supplyPart: 'full', requestedAt: new Date() }] }] },
    // Fully paid: not listed.
    { _id: 'c', patientName: 'Chirag', patientCode: 'C-1', stages: [{ number: 2, totalAmount: 30000, payments: [pay(30000)], medicineRequests: [] }] },
    // Due, but no supply anywhere.
    { _id: 'd', patientName: 'Dev', patientCode: 'D-1', stages: [{ number: 2, totalAmount: 15000, payments: [], medicineRequests: [] }] },
  ];
  const posOf = (id, phase) => (id === 'a' && phase === 1 ? [{ poNumber: 'PO-1', supplyPlan: '1+5', supplyPart: 'first', createdAt: new Date() }] : []);
  const groups = paymentDueByCategory(patients, { posOf });
  assert.deepEqual(groups.map((g) => [g.label, g.count, g.totalDue]), [['1 month', 1, 32000], ['45 days', 1, 2000], ['Supply not recorded', 1, 15000]]);
  const bela = groups[1].patients[0];
  assert.deepEqual([bela.paidAmount, bela.dueAmount, bela.pendingApprovalAmount, bela.supplyLabel], [18000, 2000, 5000, 'Custom: 45 days']);
  assert.deepEqual([groups[0].patients[0].poNumber, groups[0].patients[0].phase], ['PO-1', 1]);
});

test('the fulfilment job plan of the newest request wins (the doctor can correct it)', () => {
  const patients = [{ _id: 'a', patientName: 'Aarav', stages: [{ number: 1, totalAmount: 1000, payments: [], medicineRequests: [{ requestId: 'r1', status: 'in_process', supplyPlan: '6M', supplyPart: 'full', requestedAt: new Date() }] }] }];
  const groups = paymentDueByCategory(patients, { jobPlanOf: () => ({ plan: '2+4', part: 'first' }) });
  assert.equal(groups[0].label, '2 months');
});
