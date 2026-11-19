const { test } = require('node:test');
const assert = require('node:assert/strict');
const { latestMedicine, groupByLength } = require('./lastMedicineSupply');

const req = (requestId, plan, part, at, status = 'sent_to_courier', extra = {}) => ({ requestId, status, supplyPlan: plan, supplyPart: part, requestedAt: new Date(at), sentToCourierAt: status === 'sent_to_courier' ? new Date(at) : null, courier: { status: 'pending' }, ...extra });
const patient = (id, name, stages) => ({ _id: id, patientName: name, patientCode: id.toUpperCase(), stages });

test('the latest medicine of each patient - being made or gone - grouped by its length', () => {
  const patients = [
    // 1 month went first, then the 5 months: only the 5 months counts.
    patient('a', 'Aarav', [{ number: 1, medicineRequests: [req('r1', '1+5', 'first', '2026-09-01'), req('r2', '1+5', 'rest', '2026-10-05')] }]),
    // Phase 2 is newer than phase 1; delivered.
    patient('b', 'Bela', [{ number: 1, medicineRequests: [req('r1', '6M', 'full', '2026-03-01')] }, { number: 2, medicineRequests: [req('r3', 'C0m45d', 'full', '2026-11-01', 'sent_to_courier', { courier: { status: 'delivered', deliveredAt: new Date('2026-11-03') } })] }]),
    // A newer request still being made counts (not the older gone one).
    patient('c', 'Chirag', [{ number: 1, medicineRequests: [req('r1', 'C1', 'full', '2026-10-10'), req('r2', '6M', 'full', '2026-11-15', 'in_process')] }]),
    patient('d', 'Dev', [{ number: 1, medicineRequests: [req('r1', '1+5', 'first', '2026-11-12', 'requested')] }]),
    // Cancelled only: not listed.
    patient('e', 'Esha', [{ number: 1, medicineRequests: [req('r1', '6M', 'full', '2026-11-12', 'cancelled')] }]),
    patient('f', 'Farah', [{ number: 1, medicineRequest: req('', '', '', '2026-08-01'), medicineRequests: [] }]),
  ];
  const latest = latestMedicine(patients);
  assert.deepEqual(latest.map((l) => [l.patient.patientName, l.request.requestId || 'legacy']), [['Aarav', 'r2'], ['Bela', 'r3'], ['Chirag', 'r2'], ['Dev', 'r1'], ['Farah', 'legacy']]);
  const jobOf = (p) => (p.patientName === 'Chirag' ? { status: 'open', stageLabel: 'Step 4: Stock match' } : null);
  const groups = groupByLength(latest, () => null, jobOf);
  assert.deepEqual(groups.map((g) => [g.label, g.count, g.gone]), [['1 month', 1, 0], ['45 days', 1, 1], ['5 months', 1, 1], ['6 months', 1, 0], ['Supply not recorded', 1, 1]]);
  const [dev] = groups[0].patients;
  assert.deepEqual([dev.patientName, dev.supplyLabel, dev.gone, dev.status, dev.sentAt], ['Dev', '1+5: First 1 month', false, 'Requested', null]);
  const bela = groups[1].patients[0];
  assert.deepEqual([bela.phase, bela.status, bela.sentAt], [2, 'Delivered', '2026-11-03T00:00:00.000Z']);
  assert.equal(groups[3].patients[0].status, 'Step 4: Stock match', 'the fulfilment step it is at');
});

test('the supply actually made (fulfilment job / PO) wins over the request', () => {
  const latest = latestMedicine([patient('a', 'Aarav', [{ number: 1, medicineRequests: [req('r1', '', '', '2026-11-01')] }])]);
  const groups = groupByLength(latest, () => ({ plan: '2+4', part: 'first' }));
  assert.deepEqual([groups[0].label, groups[0].patients[0].supplyLabel], ['2 months', '2+4: First 2 months']);
});
