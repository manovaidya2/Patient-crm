const { test } = require('node:test');
const assert = require('node:assert/strict');
const { latestGone, groupByLength } = require('./lastMedicineSupply');

const gone = (requestId, plan, part, at, extra = {}) => ({ requestId, status: 'sent_to_courier', supplyPlan: plan, supplyPart: part, sentToCourierAt: new Date(at), courier: { status: 'pending' }, ...extra });
const patient = (id, name, stages) => ({ _id: id, patientName: name, patientCode: id.toUpperCase(), stages });

test('only the last medicine that went to each patient is counted, grouped by its length', () => {
  const patients = [
    // 1 month went first, then the 5 months: only the 5 months counts.
    patient('a', 'Aarav', [{ number: 1, medicineRequests: [gone('r1', '1+5', 'first', '2026-09-01'), gone('r2', '1+5', 'rest', '2026-10-05')] }]),
    // Phase 2 is newer than phase 1.
    patient('b', 'Bela', [{ number: 1, medicineRequests: [gone('r1', '6M', 'full', '2026-03-01')] }, { number: 2, medicineRequests: [gone('r3', 'C0m45d', 'full', '2026-11-01', { courier: { status: 'delivered', deliveredAt: new Date('2026-11-03') } })] }]),
    patient('c', 'Chirag', [{ number: 1, medicineRequests: [gone('r1', 'C1', 'full', '2026-11-10'), { requestId: 'r2', status: 'requested', supplyPlan: '6M', supplyPart: 'full', requestedAt: new Date('2026-11-15') }] }]),
    patient('d', 'Dev', [{ number: 1, medicineRequests: [gone('r1', '1+5', 'first', '2026-11-12')] }]),
    patient('e', 'Esha', [{ number: 1, medicineRequests: [{ requestId: 'r1', status: 'made', supplyPlan: '6M', supplyPart: 'full' }] }]),
    patient('f', 'Farah', [{ number: 1, medicineRequest: gone('', '', '', '2026-08-01'), medicineRequests: [] }]),
  ];
  const latest = latestGone(patients);
  assert.deepEqual(latest.map((l) => [l.patient.patientName, l.request.requestId || 'legacy']), [['Aarav', 'r2'], ['Bela', 'r3'], ['Chirag', 'r1'], ['Dev', 'r1'], ['Farah', 'legacy']], 'nothing gone yet: not listed');
  const groups = groupByLength(latest);
  assert.deepEqual(groups.map((g) => [g.label, g.count]), [['1 month', 2], ['45 days', 1], ['5 months', 1], ['Supply not recorded', 1]]);
  const oneMonth = groups[0].patients;
  assert.deepEqual(oneMonth.map((p) => [p.patientName, p.supplyLabel, p.phase]), [['Dev', '1+5: First 1 month', 1], ['Chirag', 'Custom: 1 month', 1]], 'newest first');
  const bela = groups[1].patients[0];
  assert.deepEqual([bela.phase, bela.delivery, bela.sentAt], [2, 'Delivered', '2026-11-03T00:00:00.000Z']);
});

test('the supply actually made (fulfilment job / PO) wins over the request', () => {
  const latest = latestGone([patient('a', 'Aarav', [{ number: 1, medicineRequests: [gone('r1', '', '', '2026-11-01')] }])]);
  const groups = groupByLength(latest, () => ({ plan: '2+4', part: 'first' }));
  assert.deepEqual([groups[0].label, groups[0].patients[0].supplyLabel], ['2 months', '2+4: First 2 months']);
});
