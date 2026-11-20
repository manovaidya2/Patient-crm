// A phase whose medicine comes in parts (a 6 month phase given as 1 + 5, 2 + 4, 3 + 3, 1 + 2 + 3 ...): every part has
// its own purchase order and medicine request. In Transit works each as a new round and the PO pages tell them apart.
// A later supply is not explained again: once the patient has it the PCC fills its medicine start date, and only then
// does the Care Schedule go on, from that day (careSupply.test.js). Nothing is dated by itself on the receipt.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const Patient = require('../models/Patient');
const PurchaseOrder = require('../models/PurchaseOrder');
const T = require('./transitFlow');
const S = require('./deliverySupply');
const D = require('./treatmentDelivery');
const { buildPoView, actionByOf } = require('./purchaseOrderFlow');
const { stampStart } = require('./careService');

const TICKS = ['dosDontsDiet', 'ayurvedicFormulations', 'panchakarmaKit', 'medicalHandHolding', 'progressTracking', 'sensoryGuidance', 'homeTherapyPlan', 'regularFollowUps', 'familyCounselling'];
const user = { name: 'Transit A', role: 'in_transit' };
const day = (value) => new Date(`${value}T00:00:00+05:30`);
const NOW = new Date('2026-11-11T06:00:00Z');

// First month handed over at the clinic and started on 12 Nov 2026.
const make = () => {
  const first = { requestId: 'r1', status: 'sent_to_courier', supplyPlan: '1+5', supplyPart: 'first', poNumber: 'PO-1', requestedAt: day('2026-11-01'), explainedAt: day('2026-11-11'), courier: { status: 'delivered', deliveredAt: day('2026-11-10'), deliveredByName: 'Transit A' } };
  const stage = {
    number: 1, purchaseOrder: 'PO-1', followUps: [], familySessions: [], payments: [], medicineRequests: [first],
    transit: {
      medicineStartDate: day('2026-11-12'), activatedAt: day('2026-11-11'), explanationCompletedAt: day('2026-11-11'), assignedAt: day('2026-11-09'),
      calls: [{ outcome: 'connected', at: day('2026-11-08'), notes: 'will collect' }], callsDoneAt: day('2026-11-08'), fulfilmentMode: 'pickup', fulfilmentSetAt: day('2026-11-08'), poPaperSignedAt: day('2026-11-10'),
    },
    delivery: { components: TICKS, componentsSource: 'paper' },
  };
  return { stage, first, patient: { _id: 'p1', patientName: 'Aarav', approvalStatus: 'approved', stages: [stage], activityLog: [] } };
};
const second = (extra = {}) => ({ requestId: 'r2', status: 'requested', supplyPlan: '1+5', supplyPart: 'rest', poNumber: 'PO-2', requestedAt: day('2026-11-25'), courier: { status: 'pending' }, ...extra });
const PO1 = { poNumber: 'PO-1', status: 'verified', supplyPlan: '1+5', supplyPart: 'first', medicineRequestId: 'r1', createdAt: day('2026-10-30') };
const PO2 = { poNumber: 'PO-2', status: 'pending', supplyPlan: '1+5', supplyPart: 'rest', medicineRequestId: '', createdAt: day('2026-11-24') };
const lastDay = (stage) => stage.followUps.map((f) => D.dayOf(f.dateTime)).sort().pop();

test('In Transit works the second supply as a new round; the first hand-over is kept', async () => {
  const { patient, stage } = make();
  assert.equal(T.refillOpen(stage), false);
  assert.equal(T.buildTransitCase(patient, stage, NOW).nextAction, null, 'a started phase is closed in In Transit');
  const request = second();
  stage.medicineRequests.push(request);
  assert.equal(T.refillOpen(stage), true);
  assert.equal(T.roundStale(stage), true, 'raised, round not begun yet');
  assert.equal(T.roundTransit(stage).fulfilmentMode, '', 'readers already see an empty round');
  assert.equal(T.roundOwnerKey(stage), 'r1');
  assert.equal(T.beginSupplyRound(stage, request, user, NOW), true);
  assert.equal(T.beginSupplyRound(stage, request, user, NOW), false, 'a round begins once');
  assert.equal(stage.transit.supplyRound, 2);
  assert.equal(stage.transit.roundRequestId, 'r2');
  assert.equal(stage.transit.fulfilmentMode, '');
  assert.deepEqual(stage.transit.calls, []);
  assert.equal(stage.transit.rounds.length, 1);
  assert.deepEqual([stage.transit.rounds[0].requestId, stage.transit.rounds[0].poNumber, stage.transit.rounds[0].fulfilmentMode, stage.transit.rounds[0].calls.length], ['r1', 'PO-1', 'pickup', 1]);
  assert.ok(stage.transit.activatedAt && stage.transit.explanationCompletedAt, 'explanation and start date belong to the phase');
  assert.equal(T.startRequestOf(stage).requestId, 'r1');
  const item = T.buildTransitCase(patient, stage, NOW);
  assert.equal(item.refill, true);
  assert.equal(item.supplyRound, 2);
  assert.equal(item.pastRounds.length, 1);
  assert.ok(item.steps.filter((s) => ['pcc', 'explained', 'start'].includes(s.key)).every((s) => s.state === 'done'), 'no second explanation');
  assert.equal(item.steps.find((s) => s.state === 'current').key, 'accepted');
  assert.equal(T.roundOf(stage, 'r1').archived, true);
  assert.equal(T.roundOf(stage, 'r1').fulfilmentMode, 'pickup');
  assert.equal(T.roundOf(stage, 'r2').archived, false);
  assert.equal(T.roundOf(stage, 'r2').n, 2);
});

test('a request raised on a screen that did not begin the round is caught by the next In Transit save', () => {
  const { stage } = make();
  stage.medicineRequests.push(second());
  assert.equal(T.roundOf(stage, 'r2').fulfilmentMode, '', 'its round starts empty');
  assert.equal(T.roundOf(stage, 'r1').archived, true);
  assert.equal(T.roundOf(stage, 'r1').fulfilmentMode, 'pickup', 'the first supply keeps its hand-over');
  assert.equal(T.ensureSupplyRound(stage, user, NOW), true);
  assert.equal(T.ensureSupplyRound(stage, user, NOW), false);
  assert.equal(stage.transit.rounds.length, 1);
});

test('a request that only replaces a cancelled one keeps the round', () => {
  const { stage, first } = make();
  first.courier = { status: 'pending' };
  stage.transit.activatedAt = null;
  const again = second({ supplyPart: 'first', poNumber: 'PO-1' });
  first.status = 'cancelled';
  stage.medicineRequests.push(again);
  assert.equal(T.beginSupplyRound(stage, again, user, NOW), false);
  assert.equal(stage.transit.fulfilmentMode, 'pickup');
  assert.equal(stage.transit.rounds, undefined);
});

// ---- The start date of a later supply ----------------------------------------------------------------------------
const pcc = { name: 'Dr Asha', role: 'assistant_doctor' };
const receive = (request, value) => Object.assign(request, { status: 'sent_to_courier', courier: { status: 'delivered', deliveredAt: day(value), deliveredByName: 'Transit A' } });
// What saving "Medicine start date of this supply" on the Medicine Explanations page does to the phase.
const fill = (patient, stage, request, value, now, { note = null, months, days } = {}) => {
  stampStart(stage, T.requestKey(request), value, pcc, now, note);
  return startDelivery(patient, stage, pcc, now, { request, months, days });
};
const number = (stage) => stage.followUps.forEach((f, i) => { if (!f._id) f._id = `e${i}`; });
const standing = ({ later, needed, pending, done, date }) => ({ later, needed, pending, done, date });
const partsOf = (stage) => stage.delivery.parts.map((p) => [p.requestId, p.poNumber, p.months, p.startDate, p.offsetDays, p.source || 'transit']);
// A phase whose first purchase order carries `plan` months (C3 = 3 months), started on 12 Nov 2026.
const started = async (plan) => {
  const made = make();
  Object.assign(made.first, { supplyPlan: plan, supplyPart: 'full' });
  await startDelivery(made.patient, made.stage, user, NOW);
  return made;
};
const custom = (requestId, poNumber, plan, requested) => second({ requestId, poNumber, supplyPlan: plan, supplyPart: 'full', requestedAt: day(requested) });

function twoPoCase() {
  const patient = new Patient({ patientName: 'Aarav', patientCode: 'A-1', guardianName: 'P', category: 'autism_adhd', number: '1', age: '7', approvalStatus: 'approved' });
  const stage = patient.stages[0];
  Object.assign(stage, { purchaseOrder: 'PO-1', totalAmount: 42000, status: 'in_progress', medicineExplainDate: day('2026-11-11') });
  stage.payments.push({ amount: 10000, approvalStatus: 'approved', approvedAt: day('2026-10-31') });
  stage.medicineRequests.push({ requestId: 'r1', status: 'sent_to_courier', requestedAt: day('2026-11-01'), inProcessAt: day('2026-11-02'), madeAt: day('2026-11-05'), sentToCourierAt: day('2026-11-09'), explainedAt: day('2026-11-11'), poNumber: 'PO-1', supplyPlan: '1+5', supplyPart: 'first', courier: { status: 'delivered', deliveryMode: 'self', receivedByName: 'Parent', deliveredAt: day('2026-11-10'), deliveredByName: 'Transit A' } });
  Object.assign(stage.transit, {
    enteredAt: day('2026-10-30'), callsDoneAt: day('2026-11-08'), callsDoneByName: 'Transit A', fulfilmentMode: 'pickup', fulfilmentSetAt: day('2026-11-08'), fulfilmentSetByName: 'Transit A', pickupScheduledAt: day('2026-11-10'),
    poPaperSignedAt: day('2026-11-10'), assignedAt: day('2026-11-09'), assignedByName: 'Transit A', explanationCompletedAt: day('2026-11-11'), explanationCompletedByName: 'Dr Asha', activatedAt: day('2026-11-11'), activatedByName: 'Dr Asha', medicineStartDate: day('2026-11-12'),
  });
  stage.transit.calls.push({ outcome: 'connected', at: day('2026-11-08'), notes: 'will collect', byName: 'Transit A' });
  const po1 = new PurchaseOrder({ poNumber: 'PO-1', generated: true, patient: patient._id, phase: 1, status: 'verified', detailsVerifiedAt: day('2026-10-31'), paymentVerifiedAt: day('2026-10-31'), verifiedAt: day('2026-10-31'), paymentIds: [stage.payments[0]._id], medicineRequestId: 'r1', supplyPlan: '1+5', supplyPart: 'first', amount: 10000 });
  stage.payments.push({ amount: 32000, approvalStatus: 'approved', approvedAt: day('2026-11-25') });
  const po2 = new PurchaseOrder({ poNumber: 'PO-2', generated: true, patient: patient._id, phase: 1, status: 'verified', detailsVerifiedAt: day('2026-11-25'), paymentVerifiedAt: day('2026-11-25'), verifiedAt: day('2026-11-25'), paymentIds: [stage.payments[1]._id], medicineRequestId: 'r2', supplyPlan: '1+5', supplyPart: 'rest', amount: 32000 });
  stage.medicineRequests.push({ requestId: 'r2', status: 'requested', requestedAt: day('2026-11-25'), poNumber: 'PO-2', supplyPlan: '1+5', supplyPart: 'rest', courier: { status: 'pending' } });
  T.beginSupplyRound(stage, stage.medicineRequests[1], user, day('2026-11-25'));
  return { patient, stage, po1, po2 };
}

const viewOf = (po, patient) => buildPoView(po, patient.toObject(), {});
const step = (view, key) => view.steps.find((s) => s.key === key);

test('PO pages: the first PO keeps its finished hand-over, the second PO shows only its own', () => {
  const c = twoPoCase();
  const first = viewOf(c.po1, c.patient);
  const next = viewOf(c.po2, c.patient);
  assert.equal(first.refill, false);
  assert.equal(first.supplyRound, 1);
  assert.equal(first.isPhaseCurrentRequest, false);
  assert.ok(['calls', 'scheduled', 'handover', 'pcc', 'explained', 'started'].every((key) => step(first, key).done), 'nothing of the first hand-over is lost');
  assert.equal(step(first, 'started').label, 'Medicine start date');
  assert.equal(next.refill, true);
  assert.equal(next.supplyRound, 2);
  assert.equal(next.isPhaseCurrentRequest, true);
  assert.equal(step(next, 'calls').done, false, 'its own calls start empty');
  assert.equal(step(next, 'scheduled').done, false);
  assert.equal(step(next, 'handover').done, false);
  assert.ok(step(next, 'pcc').done && step(next, 'pcc').phaseFact, 'the PCC is a fact of the phase');
  assert.ok(step(next, 'explained').done && step(next, 'explained').phaseFact, 'no second explanation');
  assert.equal(step(next, 'explained').text, 'Already explained with the first supply of this phase');
  assert.equal(step(next, 'started').label, 'Medicine start date of this supply');
  assert.equal(step(next, 'started').done, false);
  assert.equal(step(next, 'started').startDue, false, 'nothing to fill before the patient has it');
});

