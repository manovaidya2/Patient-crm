const { test } = require('node:test');
const assert = require('node:assert/strict');
const { paymentDueByCategory } = require('./paymentDueByCategory');

const pay = (amount, approvalStatus = 'approved', extra = {}) => ({ amount, approvalStatus, date: new Date('2026-11-01'), ...extra });
const po = (poNumber, plan, part, extra = {}) => ({ poNumber, supplyPlan: plan, supplyPart: part, createdAt: new Date('2026-11-01'), ...extra });
const request = (requestId, plan, part, extra = {}) => ({ requestId, status: 'in_process', supplyPlan: plan, supplyPart: part, requestedAt: new Date('2026-11-02'), ...extra });

test('every phase with payment due, in the category of its supply: any PO first, else its medicine request', () => {
  const patients = [
    // 1+5 first on its PO, 10,000 of 42,000 paid: 32,000 due.
    { _id: 'a', patientName: 'Aarav', patientCode: 'A-1', category: 'autism_adhd', stages: [{ number: 1, totalAmount: 42000, payments: [pay(10000)] }] },
    // A refund paid out brings it back to due 2,000; a pending payment is not counted as paid. Custom 45 days on the PO.
    { _id: 'b', patientName: 'Bela', patientCode: 'B-1', category: 'mental_health', stages: [{ number: 1, totalAmount: 20000, payments: [pay(20000, 'approved', { refunds: [{ amount: 2000, status: 'paid' }] }), pay(5000, 'pending')] }] },
    // Fully paid: not listed.
    { _id: 'c', patientName: 'Chirag', patientCode: 'C-1', stages: [{ number: 2, totalAmount: 30000, payments: [pay(30000)] }] },
    // No PO: the medicine request's supply.
    { _id: 'd', patientName: 'Dev', patientCode: 'D-1', stages: [{ number: 2, totalAmount: 15000, payments: [], medicineRequests: [request('r1', '2+4', 'first')] }] },
    // A PO with no supply and no request: not recorded.
    { _id: 'e', patientName: 'Esha', patientCode: 'E-1', stages: [{ number: 1, totalAmount: 9000, payments: [] }] },
  ];
  const posOf = (id, phase) => ({ 'a|1': [po('PO-1', '1+5', 'first')], 'b|1': [po('PO-2', 'C0m45d', 'full')], 'e|1': [po('PO-5', '', '')] })[`${id}|${phase}`] || [];
  const groups = paymentDueByCategory(patients, { posOf });
  assert.deepEqual(groups.map((g) => [g.label, g.count, g.totalDue]), [['1 + 5 months', 1, 32000], ['2 + 4 months', 1, 15000], ['Custom: 45 days', 1, 2000], ['Supply not recorded', 1, 9000]]);
  const bela = groups[2].patients[0];
  assert.deepEqual([bela.paidAmount, bela.dueAmount, bela.pendingApprovalAmount, bela.supplyLabel, bela.program, bela.supplySource], [18000, 2000, 5000, 'Custom: 45 days', 'Mental Health', 'Purchase order']);
  assert.deepEqual([groups[1].patients[0].supplySource, groups[0].patients[0].poNumber], ['Medicine request', 'PO-1']);
});

test('an older PO with the supply only on its paper is read from the paper; the fulfilment job plan wins over the request', () => {
  const paperOnly = paymentDueByCategory([{ _id: 'a', patientName: 'Aarav', stages: [{ number: 1, totalAmount: 1000, payments: [] }] }], { posOf: () => [po('PO-9', '', '', { paperValues: { supplyOrder: '1+5: Next 5 months' } })] });
  assert.deepEqual([paperOnly[0].label, paperOnly[0].patients[0].supplyLabel], ['1 + 5 months', '1+5: Next 5 months']);
  const corrected = paymentDueByCategory([{ _id: 'b', patientName: 'Bela', stages: [{ number: 1, totalAmount: 1000, payments: [], medicineRequests: [request('r1', '6M', 'full')] }] }], { jobPlanOf: () => ({ plan: '2+4', part: 'first' }) });
  assert.equal(corrected[0].label, '2 + 4 months');
});
