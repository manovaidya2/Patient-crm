const { test } = require('node:test');
const assert = require('node:assert/strict');
const { daysLate, medicineDelays, fixedReadyDate } = require('./medicineDelay');

const expected = new Date('2026-11-05T00:00:00.000+05:30');

test('days late are whole India-time days after the expected date; early or on time is 0', () => {
  assert.equal(daysLate(expected, new Date('2026-11-05T23:30:00.000+05:30')), 0);
  assert.equal(daysLate(expected, new Date('2026-11-04T10:00:00.000+05:30')), 0);
  assert.equal(daysLate(expected, new Date('2026-11-08T01:00:00.000+05:30')), 3);
  assert.equal(daysLate(null, new Date()), null);
});

test('Medicine Department delay is counted to when the medicine was made; In Transit delay to when it was released', () => {
  const d = medicineDelays({ expected, madeAt: new Date('2026-11-07T12:00:00.000+05:30'), releasedAt: new Date('2026-11-09T12:00:00.000+05:30') });
  assert.deepEqual([d.medicine.done, d.medicine.daysLate, d.transit.done, d.transit.daysLate], [true, 2, true, 4]);
  // Not made yet: the delay so far keeps running.
  const running = medicineDelays({ expected, now: new Date('2026-11-06T09:00:00.000+05:30') });
  assert.deepEqual([running.medicine.done, running.medicine.daysLate, running.transit.daysLate], [false, 1, 1]);
  assert.equal(medicineDelays({ expected: null }), null, 'no delay without an expected date');
});

test('the fixed date comes from the PO, else from the PO paper kept on the phase', () => {
  assert.equal(fixedReadyDate({ po: { medicineReadyDate: expected } }), expected);
  assert.equal(fixedReadyDate({ stage: { poPaper: { values: { medicineReadyDate: '2026-11-05' } } } }).toISOString(), expected.toISOString());
  assert.equal(fixedReadyDate({ stage: {} }), null);
});

test('the supply and age group post counselling sent come from the PO, else from its PO paper; none for older requests', () => {
  const { fixedSupplyPlan } = require('./medicineDelay');
  assert.deepEqual(fixedSupplyPlan({ po: { supplyPlan: '1+5', supplyPart: 'first', ageBand: '4-12' } }), { plan: '1+5', part: 'first', ageBand: '4-12' });
  assert.deepEqual(fixedSupplyPlan({ stage: { poPaper: { values: { supplyOrder: 'Full 6 months', ageGroup: 'Above 12 - 70 years' } } } }), { plan: '6M', part: 'full', ageBand: '12-70' });
  assert.deepEqual(fixedSupplyPlan({ po: null, stage: {} }), { plan: '', part: '', ageBand: '' }, 'an old request without a PO paper stays open to choose');
});

test('the PO paper works the age group out from the age; it is never picked by hand', () => {
  const { cleanPurchase } = require('./purchaseOrderRecord');
  assert.equal(cleanPurchase({ patientAge: '6', ageGroup: 'Above 70 years' }, 1000).values.ageGroup, 'Above 4 - 12 years');
  assert.equal(cleanPurchase({ patientAge: '13 years' }, 1000).values.ageGroup, 'Above 12 - 70 years');
  assert.equal(cleanPurchase({ patientAge: '2' }, 1000).values.ageGroup, '0 - 3 years', 'below 3 years: 0-3 (its formulation is made for the child)');
});
