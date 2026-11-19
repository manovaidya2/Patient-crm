const { test } = require('node:test');
const assert = require('node:assert/strict');
const { latestMedicine, groupByLength, lengthOf } = require('./lastMedicineSupply');

const req = (requestId, plan, part, at, status = 'sent_to_courier', extra = {}) => ({ requestId, status, supplyPlan: plan, supplyPart: part, requestedAt: new Date(at), sentToCourierAt: status === 'sent_to_courier' ? new Date(at) : null, courier: { status: 'pending' }, ...extra });
const patient = (id, name, stages, category = 'autism_adhd') => ({ _id: id, patientName: name, patientCode: id.toUpperCase(), category, stages });

test('categories as the PO paper picks the supply: Full 6 months, 1 + 5, 2 + 4, Custom with its length', () => {
  assert.deepEqual(['6M:full', '1+5:first', '1+5:rest', '2+4:first', '2+4:rest', 'C3:full', 'C0m45d:full', 'C1m15d:full', ':'].map((k) => lengthOf(...k.split(':')).label),
    ['Full 6 months', '1 + 5 months', '1 + 5 months', '2 + 4 months', '2 + 4 months', 'Custom: 3 months', 'Custom: 45 days', 'Custom: 45 days', 'Supply not recorded']);
});

test('the latest medicine of each patient - being made or gone - by its supply category, with the program', () => {
  const patients = [
    // 1 month went first, then the 5 months: only the 5 months counts (still a 1 + 5 supply).
    patient('a', 'Aarav', [{ number: 1, medicineRequests: [req('r1', '1+5', 'first', '2026-09-01'), req('r2', '1+5', 'rest', '2026-10-05')] }]),
    // Phase 2 is newer than phase 1; delivered; a Mental Health 45 day package.
    patient('b', 'Bela', [{ number: 1, medicineRequests: [req('r1', '6M', 'full', '2026-03-01')] }, { number: 2, medicineRequests: [req('r3', 'C0m45d', 'full', '2026-11-01', 'sent_to_courier', { courier: { status: 'delivered', deliveredAt: new Date('2026-11-03') } })] }], 'mental_health'),
    // A newer request still being made counts (not the older gone one).
    patient('c', 'Chirag', [{ number: 1, medicineRequests: [req('r1', 'C1', 'full', '2026-10-10'), req('r2', '6M', 'full', '2026-11-15', 'in_process')] }]),
    patient('d', 'Dev', [{ number: 1, medicineRequests: [req('r1', '1+5', 'first', '2026-11-12', 'requested')] }]),
    // Cancelled only: not listed.
    patient('e', 'Esha', [{ number: 1, medicineRequests: [req('r1', '6M', 'full', '2026-11-12', 'cancelled')] }]),
    patient('f', 'Farah', [{ number: 1, medicineRequest: req('', '', '', '2026-08-01'), medicineRequests: [] }]),
    patient('g', 'Gita', [{ number: 1, medicineRequests: [req('r1', 'C3', 'full', '2026-11-02')] }]),
  ];
  const latest = latestMedicine(patients);
  assert.deepEqual(latest.map((l) => [l.patient.patientName, l.request.requestId || 'legacy']), [['Aarav', 'r2'], ['Bela', 'r3'], ['Chirag', 'r2'], ['Dev', 'r1'], ['Farah', 'legacy'], ['Gita', 'r1']]);
  const jobOf = (p) => (p.patientName === 'Chirag' ? { status: 'open', stageLabel: 'Step 4: Stock match' } : null);
  const groups = groupByLength(latest, () => null, jobOf);
  assert.deepEqual(groups.map((g) => [g.label, g.count, g.gone]), [['Full 6 months', 1, 0], ['1 + 5 months', 2, 1], ['Custom: 45 days', 1, 1], ['Custom: 3 months', 1, 1], ['Supply not recorded', 1, 1]]);
  const oneFive = groups[1].patients;
  assert.deepEqual(oneFive.map((p) => [p.patientName, p.supplyLabel, p.gone, p.status]), [['Dev', '1+5: First 1 month', false, 'Requested'], ['Aarav', '1+5: Next 5 months', true, 'Released, not dispatched']], 'newest first, with its part');
  const bela = groups[2].patients[0];
  assert.deepEqual([bela.program, bela.phase, bela.status, bela.sentAt], ['Mental Health', 2, 'Delivered', '2026-11-03T00:00:00.000Z']);
  assert.deepEqual([groups[0].patients[0].status, groups[0].patients[0].program], ['Step 4: Stock match', 'Autism / ADHD']);
});

test('the supply actually made (fulfilment job / PO) wins over the request', () => {
  const latest = latestMedicine([patient('a', 'Aarav', [{ number: 1, medicineRequests: [req('r1', '', '', '2026-11-01')] }])]);
  const groups = groupByLength(latest, () => ({ plan: '2+4', part: 'first' }));
  assert.deepEqual([groups[0].label, groups[0].patients[0].supplyLabel], ['2 + 4 months', '2+4: First 2 months']);
});

test('every patient in their phase: a phase without medicine shows "No medicine yet" with the earlier one', () => {
  const { patientPhaseRows } = require('./lastMedicineSupply');
  const patients = [
    // Phase 3 now, medicine only in phase 2 (delivered): no medicine yet in phase 3.
    { ...patient('a', 'Aarav', [{ number: 2, medicineRequests: [req('r1', '6M', 'full', '2026-06-01', 'sent_to_courier', { courier: { status: 'delivered', deliveredAt: new Date('2026-06-05') } })] }]), currentStage: 3 },
    // Phase 4, never any medicine.
    { ...patient('b', 'Bela', []), currentStage: 4 },
    // Phase 1 in the profile but the medicine is of phase 2: phase 2.
    { ...patient('c', 'Chirag', [{ number: 2, medicineRequests: [req('r1', '1+5', 'first', '2026-11-01', 'in_process')] }]), currentStage: 1 },
  ];
  const groups = groupByLength(patientPhaseRows(patients));
  const rows = groups.flatMap((g) => g.patients.map((p) => [p.patientName, p.phase, g.label, p.none || false]));
  assert.deepEqual(rows, [['Chirag', 2, '1 + 5 months', false], ['Aarav', 3, 'No medicine yet', true], ['Bela', 4, 'No medicine yet', true]]);
  const aarav = groups.at(-1).patients.find((p) => p.patientName === 'Aarav');
  assert.deepEqual(aarav.last, { phase: 2, supplyLabel: 'Full 6 months', status: 'Delivered', at: '2026-06-05T00:00:00.000Z' });
  assert.equal(groups.at(-1).patients.find((p) => p.patientName === 'Bela').last, null);
});
