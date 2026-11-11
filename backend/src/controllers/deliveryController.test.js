const test = require('node:test');
const assert = require('node:assert/strict');
const { startDelivery, applyPlan } = require('./deliveryController');
const D = require('../utils/treatmentDelivery');

// Plain objects stand in for the patient document (no database in these tests: default rules, no holidays).
const TICKS = ['dosDontsDiet', 'ayurvedicFormulations', 'panchakarmaKit', 'medicalHandHolding', 'progressTracking', 'sensoryGuidance', 'homeTherapyPlan', 'regularFollowUps', 'familyCounselling'];
const user = { name: 'PCC A', role: 'assistant_doctor' };
const day = (value) => new Date(`${value}T00:00:00+05:30`);
const make = ({ plan = '2+4', part = 'first', components = TICKS } = {}) => {
  const stage = {
    number: 1, purchaseOrder: 'PO-1', followUps: [], familySessions: [], transit: { medicineStartDate: day('2026-11-12') },
    medicineRequest: { requestId: 'r1', status: 'sent_to_courier', supplyPlan: plan, supplyPart: part, poNumber: 'PO-1', requestedAt: day('2026-11-01') },
    ...(components ? { delivery: { components, componentsSource: 'paper' } } : {}),
  };
  return { stage, patient: { _id: 'p1', stages: [stage], activityLog: [] } };
};
const NOW = new Date('2026-11-11T06:00:00Z');
const keys = (stage) => stage.followUps.map((f) => f.delivery?.key);
const number = (stage) => stage.followUps.forEach((f, i) => { if (!f._id) f._id = `e${i}`; });

test('the start date makes the plan for the supply in hand only', async () => {
  const { patient, stage } = make();
  const result = await startDelivery(patient, stage, user, NOW);
  assert.equal(result.status, 'created');
  assert.equal(result.created, stage.followUps.length);
  assert.ok(result.later > 0);
  assert.equal(stage.delivery.planMonths, 6);
  assert.equal(stage.delivery.phaseDays, 180);
  assert.deepEqual(stage.delivery.parts.map((p) => [p.requestId, p.months, p.startDate, p.offsetDays]), [['r1', 2, '2026-11-12', 0]]);
  assert.ok(stage.followUps.every((f) => f.status === 'scheduled' && f.delivery.auto && D.dayOf(f.dateTime) <= '2027-01-11'));
  assert.ok(keys(stage).includes('diet:1') && keys(stage).includes('fu:1') && !keys(stage).includes('fu:15'));
  assert.equal(new Set(stage.followUps.map((f) => D.dayOf(f.dateTime))).size, stage.followUps.length, 'one session a day');
  assert.ok(stage.followUps.every((f) => D.weekdayOf(D.dayOf(f.dateTime)) !== 3), 'never on the closed Wednesday');
  assert.equal(stage.delivery.followUpsPromised, 15);
  assert.equal(patient.activityLog.length, 1);
});

test('saving the same start date again changes nothing; a corrected date moves only untouched sessions', async () => {
  const { patient, stage } = make();
  await startDelivery(patient, stage, user, NOW);
  number(stage);
  const count = stage.followUps.length;
  assert.equal((await startDelivery(patient, stage, user, NOW)).status, 'unchanged');
  const confirmed = stage.followUps[0];
  confirmed.delivery.confirmedAt = NOW;
  const kept = new Date(confirmed.dateTime).getTime();
  stage.transit.medicineStartDate = day('2026-11-16');
  const result = await startDelivery(patient, stage, user, NOW);
  assert.equal(result.status, 'moved');
  assert.equal(stage.followUps.length, count, 'nothing is made twice');
  assert.equal(new Date(confirmed.dateTime).getTime(), kept, 'a confirmed session stays');
  assert.equal(result.moved, count - 1);
  assert.equal(stage.delivery.parts[0].startDate, '2026-11-16');
  assert.equal(stage.delivery.parts.length, 1);
});

test('a correction made after the next request was raised is still a correction, not the next supply', async () => {
  const { patient, stage } = make();
  await startDelivery(patient, stage, user, NOW);
  number(stage);
  stage.medicineRequests = [stage.medicineRequest];
  stage.medicineRequest = { requestId: 'r2', status: 'requested', supplyPlan: '2+4', supplyPart: 'rest', poNumber: 'PO-2', requestedAt: day('2026-11-20') };
  stage.transit.medicineStartDate = day('2026-11-14');
  const result = await startDelivery(patient, stage, user, NOW);
  assert.equal(result.status, 'moved');
  assert.equal(stage.delivery.parts.length, 1);
  assert.equal(stage.delivery.parts[0].requestId, 'r1');
});

test('the next supply continues the plan from its own start date, with the PCC tasks at the end', async () => {
  const { patient, stage } = make();
  await startDelivery(patient, stage, user, NOW);
  number(stage);
  const first = stage.followUps.length;
  const later = new Date('2027-01-12T06:00:00Z');
  stage.medicineRequests = [stage.medicineRequest];
  stage.medicineRequest = { requestId: 'r2', status: 'sent_to_courier', supplyPlan: '2+4', supplyPart: 'rest', poNumber: 'PO-2', requestedAt: day('2027-01-02') };
  stage.transit.medicineStartDate = day('2027-01-14');
  const result = await startDelivery(patient, stage, user, later);
  assert.equal(result.status, 'extended');
  assert.equal(result.later, 0);
  assert.equal(stage.followUps.length, first + result.created);
  assert.deepEqual(stage.delivery.parts.map((p) => [p.requestId, p.months, p.startDate, p.offsetDays]), [['r1', 2, '2026-11-12', 0], ['r2', 4, '2027-01-14', 60]]);
  assert.equal(new Set(keys(stage)).size, stage.followUps.length, 'every plan item once');
  assert.ok(keys(stage).includes('fu:15') && keys(stage).includes('medc:3'));
  assert.deepEqual(stage.delivery.tasks.map((t) => t.key), ['task:reviewPrep', 'task:bookNext', 'task:nextCounselling', 'task:phaseReview']);
  number(stage);
  assert.equal((await startDelivery(patient, stage, user, later)).status, 'unchanged');
});

test('without the section D ticks or the supply months no session is made and the phase asks for set-up', async () => {
  const noTicks = make({ components: null });
  const a = await startDelivery(noTicks.patient, noTicks.stage, user, NOW);
  assert.equal(a.status, 'needs_components');
  assert.equal(noTicks.stage.followUps.length, 0);
  assert.equal(noTicks.stage.delivery.setupNeededWhy, 'components');
  const noMonths = make({ plan: '', part: '' });
  const b = await startDelivery(noMonths.patient, noMonths.stage, user, NOW);
  assert.equal(b.status, 'needs_months');
  assert.equal(noMonths.stage.followUps.length, 0);
  assert.deepEqual(noMonths.stage.delivery.components, TICKS);
});

test('unticked components make nothing; manual follow-ups are left alone and their day is not reused', async () => {
  const { patient, stage } = make({ plan: '6M', part: 'full', components: ['regularFollowUps'] });
  stage.followUps.push({ _id: 'manual', dateTime: D.atHour('2026-11-26', 11), status: 'scheduled', followUpType: 'sfs', notes: 'short follow-up' });
  const result = await startDelivery(patient, stage, user, NOW);
  assert.equal(result.status, 'created');
  const auto = stage.followUps.filter((f) => f.delivery);
  assert.ok(auto.length >= 15 && auto.every((f) => f.delivery.template === 'fu'));
  assert.ok(!auto.some((f) => D.dayOf(f.dateTime) === '2026-11-26'));
  assert.equal(stage.followUps[0].notes, 'short follow-up');
  assert.equal(stage.followUps[0].delivery, undefined);
});

test('a cancelled plan session does not come back when the plan is applied again', async () => {
  const { patient, stage } = make({ plan: '6M', part: 'full' });
  await startDelivery(patient, stage, user, NOW);
  number(stage);
  const count = stage.followUps.length;
  Object.assign(stage.followUps[2], { status: 'cancelled', cancelReason: 'not needed' });
  const result = applyPlan(patient, stage, { byName: 'Admin', now: NOW });
  assert.equal(result.created, 0);
  assert.equal(stage.followUps.length, count);
});
