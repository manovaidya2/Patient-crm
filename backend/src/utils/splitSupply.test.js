// A phase whose medicine comes in parts (a 6 month phase given as 1 + 5, 2 + 4, 3 + 3, 1 + 2 + 3 ...): every part has
// its own purchase order and medicine request. In Transit works each as a new round and the PO pages tell them apart.
// A later supply is not explained again: once the patient has it the PCC fills its medicine start date, and only then
// does the Treatment Delivery plan go on, from that day. Nothing is dated by itself on the receipt.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const Patient = require('../models/Patient');
const PurchaseOrder = require('../models/PurchaseOrder');
const T = require('./transitFlow');
const S = require('./deliverySupply');
const D = require('./treatmentDelivery');
const { buildPoView, actionByOf } = require('./purchaseOrderFlow');
const { startDelivery, supplyReceived, stampStart } = require('../controllers/deliveryController');

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

test('the plan is made for the first month only and tells that five months are still to come', async () => {
  const { patient, stage } = make();
  const result = await startDelivery(patient, stage, user, NOW);
  assert.equal(result.status, 'created');
  assert.deepEqual(stage.delivery.parts.map((p) => [p.requestId, p.poNumber, p.months, p.startDate]), [['r1', 'PO-1', 1, '2026-11-12']]);
  assert.equal(stage.delivery.planMonths, 6);
  assert.ok(lastDay(stage) <= '2026-12-12', 'no session beyond the medicine in hand');
  const next = S.nextSupplyOf({ stage, pos: [PO1], now: NOW });
  assert.equal(next.stage, 'no_po');
  assert.equal(next.monthsLeft, 5);
  assert.equal(next.runsOut, '2026-12-11');
  assert.equal(next.level, 'info', 'a month of medicine left: nothing to chase yet');
  assert.equal(S.nextSupplyOf({ stage, pos: null, now: NOW }).stage, 'unknown');
});

test('the tracker follows the second purchase order: made, verified, requested, prepared, released, received', async () => {
  const { patient, stage } = make();
  await startDelivery(patient, stage, user, NOW);
  const at = (pos, now = NOW) => S.nextSupplyOf({ stage, pos, now });
  assert.equal(at([PO1, PO2]).stage, 'po_made');
  assert.equal(at([PO1, PO2]).poNumber, 'PO-2');
  assert.equal(at([PO1, PO2]).months, 5);
  assert.equal(at([PO1, { ...PO2, status: 'rejected' }]).stage, 'po_sent_back');
  assert.equal(at([PO1, { ...PO2, status: 'verified' }]).stage, 'paid');
  assert.equal(at([PO1, { ...PO2, status: 'cancelled' }]).stage, 'no_po');
  const request = second();
  stage.medicineRequests.push(request);
  const pos = [PO1, { ...PO2, status: 'verified', medicineRequestId: 'r2' }];
  assert.equal(at(pos).stage, 'requested');
  assert.equal(at(pos).owner, 'Medicine Department');
  request.status = 'in_process';
  assert.equal(at(pos).stage, 'preparing');
  request.status = 'made';
  assert.equal(at(pos).stage, 'ready');
  request.status = 'sent_to_courier';
  assert.equal(at(pos).stage, 'released');
  request.courier = { status: 'dispatched', dispatchedAt: day('2026-12-05') };
  assert.equal(at(pos).stage, 'dispatched');
  assert.deepEqual(at(pos).steps.filter((s) => s.done).map((s) => s.key), ['po', 'paid', 'requested', 'ready', 'sent']);
  // Urgency: nothing requested 12 days before the medicine ends is amber, 2 days before it is red.
  stage.medicineRequests.pop();
  assert.equal(at([PO1], day('2026-11-30')).level, 'amber');
  assert.equal(at([PO1], day('2026-12-10')).level, 'red');
  assert.equal(at([PO1], day('2026-12-20')).level, 'red');
  assert.match(at([PO1], day('2026-12-20')).headline, /finished on 2026-12-11 \(9 days ago\)/);
});

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

test('the receipt of the second supply dates nothing: the plan waits for the PCC to fill its medicine start date', async () => {
  const { patient, stage } = make();
  await startDelivery(patient, stage, user, NOW);
  const before = stage.followUps.length;
  const request = second();
  stage.medicineRequests.push(request);
  T.beginSupplyRound(stage, request, user, NOW);
  assert.equal((await supplyReceived(patient, stage, user, day('2026-11-26'))).status, 'none', 'not with the patient yet');
  assert.equal(T.pendingStart(stage), null);
  assert.deepEqual(standing(T.supplyStartOf(stage, request)), { later: true, needed: true, pending: false, done: false, date: null });
  receive(request, '2026-12-08');
  const told = await supplyReceived(patient, stage, user, day('2026-12-08'));
  assert.deepEqual([told.status, told.requestId, told.poNumber], ['start_due', 'r2', 'PO-2']);
  assert.match(told.notice, /the patient has the next supply \(PO-2\)\. The PCC fills its medicine start date on the Medicine Explanations page \(no new explanation\)/);
  assert.deepEqual(partsOf(stage), [['r1', 'PO-1', 1, '2026-11-12', 0, 'transit']], 'the receipt puts no supply on the plan');
  assert.equal(stage.followUps.length, before, 'and makes no session');
  assert.equal(request.medicineStartDate, undefined, 'no date is chosen for the patient');
  assert.equal(T.pendingStart(stage).requestId, 'r2');
  assert.equal(T.refillOpen(stage), true, 'the phase stays open until the start date is filled');
  assert.deepEqual(standing(T.supplyStartOf(stage, request)), { later: true, needed: true, pending: true, done: false, date: null });
  const next = S.nextSupplyOf({ stage, pos: [PO1, PO2], now: day('2026-12-08') });
  assert.deepEqual([next.stage, next.owner, next.months, next.monthsLeft, next.level], ['received', 'PCC', 5, 5, 'amber']);
  assert.deepEqual(next.suggest, { days: 150, months: 5, startDate: '', earliest: '2026-12-12', poNumber: 'PO-2', requestId: 'r2' });
  assert.match(next.text, /the PCC fills its medicine start date on the Medicine Explanations page \(no new explanation\)/);
  // The case the Medicine Explanations page reads.
  const item = T.buildTransitCase(patient, stage, day('2026-12-08'));
  assert.equal(item.refill, true);
  const s = item.supplyStart;
  assert.deepEqual([s.later, s.pending, s.requestId, s.poNumber, s.months, s.startDate, s.monthsLeft, s.runsOut, s.previousStart], [true, true, 'r2', 'PO-2', 5, null, 5, '2026-12-11', '2026-11-12']);
  assert.equal(s.receivedAt, day('2026-12-08').toISOString());
  const explained = item.steps.find((x) => x.key === 'explained');
  const start = item.steps.find((x) => x.key === 'start');
  assert.deepEqual([explained.complete, explained.text], [true, 'Already explained with the first supply of this phase']);
  assert.deepEqual([start.label, start.complete], ['Medicine start date of this supply', false]);
  // Days after the medicine in hand ended and still no date: red.
  assert.equal(S.nextSupplyOf({ stage, pos: null, now: day('2026-12-20') }).level, 'red');
  assert.equal(S.autoStartDay({ startDate: '2026-11-12', months: 1 }, day('2026-12-01')), '2026-12-12');
  assert.equal(S.autoStartDay({ startDate: '2026-11-12', months: 1 }, day('2026-12-20')), '2026-12-20');
});

test('the PCC fills the start date of the second supply: the plan goes on from that day, once', async () => {
  const { patient, stage } = make();
  await startDelivery(patient, stage, user, NOW);
  const before = stage.followUps.length;
  const request = second();
  stage.medicineRequests.push(request);
  T.beginSupplyRound(stage, request, user, NOW);
  receive(request, '2026-12-08');
  const result = await fill(patient, stage, request, '2026-12-14', day('2026-12-09'), { note: 'parent starts on Monday' });
  assert.deepEqual([result.status, result.months, result.monthsLeft], ['extended', 5, 0]);
  assert.match(result.notice, /the next 5 months of the plan are scheduled from 2026-12-14/);
  assert.deepEqual(partsOf(stage), [['r1', 'PO-1', 1, '2026-11-12', 0, 'transit'], ['r2', 'PO-2', 5, '2026-12-14', 30, 'transit']]);
  assert.ok(stage.followUps.length > before, 'sessions of the remaining five months are made');
  assert.ok(lastDay(stage) > '2027-03-01' && lastDay(stage) <= '2027-05-20');
  assert.equal(new Set(stage.followUps.map((f) => f.delivery.key)).size, stage.followUps.length, 'nothing is made twice');
  assert.equal(S.nextSupplyOf({ stage, pos: [PO1, PO2], now: day('2026-12-09') }), null, 'the whole plan has its medicine');
  assert.equal(T.pendingStart(stage), null);
  assert.equal(T.refillOpen(stage), false, 'In Transit is done with the phase again');
  const own = T.supplyStartOf(stage, request);
  assert.deepEqual(standing(own), { later: true, needed: false, pending: false, done: true, date: day('2026-12-14') });
  assert.deepEqual([own.onPlan, own.by, own.note], [true, 'Dr Asha', 'parent starts on Monday']);
  assert.equal((await supplyReceived(patient, stage, user, day('2026-12-09'))).status, 'none');
  // Saved again: nothing changes.
  const count = stage.followUps.length;
  assert.equal((await fill(patient, stage, request, '2026-12-14', day('2026-12-09'))).status, 'unchanged');
  assert.equal(stage.followUps.length, count);
  assert.equal(stage.delivery.parts.length, 2);
  // Corrected: only this supply moves.
  number(stage);
  const moved = await fill(patient, stage, request, '2026-12-16', day('2026-12-10'));
  assert.equal(moved.status, 'moved');
  assert.match(moved.notice, /follows the new start date of this supply/);
  assert.deepEqual(stage.delivery.parts.map((p) => p.startDate), ['2026-11-12', '2026-12-16']);
  assert.equal(stage.followUps.length, count, 'a corrected date makes no session twice');
  // The start date of the phase is still the first supply's: saving it again is not a new supply, and correcting it
  // does not carry the date a person filled for the second supply.
  assert.equal((await startDelivery(patient, stage, user, day('2026-12-10'))).status, 'unchanged');
  number(stage);
  stage.transit.medicineStartDate = day('2026-11-14');
  assert.equal((await startDelivery(patient, stage, user, day('2026-12-10'))).status, 'moved');
  assert.deepEqual(stage.delivery.parts.map((p) => p.startDate), ['2026-11-14', '2026-12-16']);
});

test('both supplies handed over before the first start date: only the first is planned, the second still waits for its own date', async () => {
  const { patient, stage } = make();
  const request = second();
  stage.medicineRequests.push(receive(request, '2026-11-10'));
  const result = await startDelivery(patient, stage, user, NOW);
  assert.equal(result.status, 'created');
  assert.match(result.notice, /the patient has the next supply \(PO-2\)\. The PCC fills its medicine start date/);
  assert.deepEqual(partsOf(stage), [['r1', 'PO-1', 1, '2026-11-12', 0, 'transit']]);
  assert.equal(T.pendingStart(stage).requestId, 'r2');
  // The parent starts the second bottle a few days before the first one ends: the day they tell is taken as it is.
  assert.equal((await fill(patient, stage, request, '2026-12-09', day('2026-12-01'))).status, 'extended');
  assert.deepEqual(stage.delivery.parts.map((p) => [p.months, p.startDate]), [[1, '2026-11-12'], [5, '2026-12-09']]);
});

test('any split of the six months: 1 + 2 + 3, each supply on its own purchase order and its own start date', async () => {
  const { patient, stage } = await started('C1');
  assert.equal(stage.delivery.planMonths, 6, 'the plan is as long as the phase, whatever the first purchase order carries');
  assert.equal(stage.delivery.phaseDays, 180);
  assert.equal(S.nextSupplyOf({ stage, pos: null, now: NOW }).monthsLeft, 5);
  // Second purchase order: two months.
  const two = custom('r2', 'PO-2', 'C2', '2026-11-25');
  stage.medicineRequests.push(two);
  T.beginSupplyRound(stage, two, user, day('2026-11-25'));
  receive(two, '2026-12-08');
  const a = await fill(patient, stage, two, '2026-12-12', day('2026-12-09'));
  assert.deepEqual([a.status, a.months, a.monthsLeft], ['extended', 2, 3]);
  assert.match(a.notice, /the next 2 months of the plan are scheduled from 2026-12-12.* 3 months of the phase still wait for medicine\./);
  assert.ok(lastDay(stage) <= D.addDays('2026-12-12', 61), 'no session beyond the medicine in hand');
  assert.equal(T.refillOpen(stage), false);
  const pos = [{ ...PO1, supplyPlan: 'C1', supplyPart: 'full' }, { ...PO2, status: 'verified', supplyPlan: 'C2', supplyPart: 'full', medicineRequestId: 'r2' }];
  const waiting = S.nextSupplyOf({ stage, pos, now: day('2026-12-09') });
  assert.deepEqual([waiting.stage, waiting.monthsLeft, waiting.runsOut], ['no_po', 3, D.addDays('2026-12-12', 59)]);
  // Third purchase order: the last three months.
  const three = custom('r3', 'PO-3', 'C3', '2027-02-01');
  stage.medicineRequests.push(three);
  T.beginSupplyRound(stage, three, user, day('2027-02-01'));
  assert.deepEqual(S.openSupplies(stage).map((r) => r.requestId), ['r3']);
  assert.equal(T.refillOpen(stage), true);
  receive(three, '2027-02-05');
  assert.equal(T.pendingStart(stage).requestId, 'r3');
  const b = await fill(patient, stage, three, '2027-02-10', day('2027-02-06'));
  assert.deepEqual([b.status, b.months, b.monthsLeft], ['extended', 3, 0]);
  assert.deepEqual(partsOf(stage), [['r1', 'PO-1', 1, '2026-11-12', 0, 'transit'], ['r2', 'PO-2', 2, '2026-12-12', 30, 'transit'], ['r3', 'PO-3', 3, '2027-02-10', 90, 'transit']]);
  assert.equal(new Set(stage.followUps.map((f) => f.delivery.key)).size, stage.followUps.length, 'nothing is made twice');
  assert.equal(D.supplyDone(stage.delivery), true);
  assert.equal(D.phaseEndDay(stage.delivery), D.addDays('2027-02-10', 89));
  assert.equal(S.nextSupplyOf({ stage, pos: null, now: day('2027-02-06') }), null);
  // Medicine beyond the six months of the phase is not put on this plan.
  const extra = custom('r4', 'PO-4', 'C2', '2027-04-01');
  stage.medicineRequests.push(receive(extra, '2027-04-05'));
  assert.equal(T.pendingStart(stage), null);
  assert.equal((await supplyReceived(patient, stage, user, day('2027-04-05'))).status, 'none');
  assert.equal((await fill(patient, stage, extra, '2027-04-06', day('2027-04-05'))).status, 'covered');
  assert.equal(stage.delivery.parts.length, 3);
});

test('other splits: 3 + 3, 2 + 4, and a supply larger than what the phase still needs is cut to the phase', async () => {
  const next = async (firstPlan, plan, part = 'full') => {
    const { patient, stage } = await started(firstPlan);
    const request = second({ supplyPlan: plan, supplyPart: part });
    stage.medicineRequests.push(receive(request, D.addDays('2026-11-12', 20)));
    const startDay = D.addDays('2026-11-12', D.coveredDays(stage.delivery.parts));
    const result = await fill(patient, stage, request, startDay, day(D.addDays('2026-11-12', 21)));
    return [stage.delivery.planMonths, stage.delivery.parts.map((p) => p.months), result.status, result.monthsLeft];
  };
  assert.deepEqual(await next('C3', 'C3'), [6, [3, 3], 'extended', 0]);
  assert.deepEqual(await next('C4', 'C3'), [6, [4, 2], 'extended', 0]);
  assert.deepEqual(await next('C2', 'C1'), [6, [2, 1], 'extended', 3]);
  // The sold split 2 + 4.
  const { patient, stage, first } = make();
  first.supplyPlan = '2+4';
  await startDelivery(patient, stage, user, NOW);
  const rest = second({ supplyPlan: '2+4' });
  stage.medicineRequests.push(receive(rest, '2027-01-08'));
  assert.equal((await fill(patient, stage, rest, '2027-01-11', day('2027-01-09'))).status, 'extended');
  assert.deepEqual(stage.delivery.parts.map((p) => [p.months, p.startDate]), [[2, '2026-11-12'], [4, '2027-01-11']]);
});

test('two supplies with the patient: the older one is dated first', async () => {
  const { patient, stage } = await started('C1');
  const two = custom('r2', 'PO-2', 'C2', '2026-11-25');
  const three = custom('r3', 'PO-3', 'C3', '2026-11-28');
  stage.medicineRequests.push(receive(two, '2026-12-08'), receive(three, '2026-12-09'));
  assert.equal(T.pendingStart(stage).requestId, 'r2');
  await fill(patient, stage, two, '2026-12-12', day('2026-12-09'));
  assert.equal(T.pendingStart(stage).requestId, 'r3');
  assert.equal(T.refillOpen(stage), true);
  await fill(patient, stage, three, '2027-02-10', day('2027-02-06'));
  assert.equal(T.pendingStart(stage), null);
  assert.deepEqual(stage.delivery.parts.map((p) => p.months), [1, 2, 3]);
});

test('months not on record: nothing is scheduled until the PCC tells the months of the supply', async () => {
  const blank = async () => {
    const made = make();
    await startDelivery(made.patient, made.stage, user, NOW);
    const request = second({ supplyPlan: '', supplyPart: '' });
    made.stage.medicineRequests.push(receive(request, '2026-12-08'));
    return { ...made, request };
  };
  const a = await blank();
  const next = S.nextSupplyOf({ stage: a.stage, pos: null, now: day('2026-12-08') });
  assert.equal(next.stage, 'received');
  assert.match(next.text, /its length is not on record: the PCC fills its months \/ days/);
  assert.deepEqual([next.suggest.months, next.suggest.startDate, next.suggest.requestId], [5, '', 'r2']);
  assert.equal(T.buildTransitCase(a.patient, a.stage, day('2026-12-08')).supplyStart.months, 0, 'the page asks for the months');
  await assert.rejects(fill(a.patient, a.stage, a.request, '2026-12-12', day('2026-12-09')), /The length of this supply is not on record\. Enter its months \/ days of medicine\./);
  assert.equal(a.stage.delivery.parts.length, 1);
  const b = await blank();
  const result = await fill(b.patient, b.stage, b.request, '2026-12-12', day('2026-12-09'), { months: 3 });
  assert.deepEqual([result.status, result.months, result.monthsLeft], ['extended', 3, 2]);
  const c = await blank();
  assert.equal((await fill(c.patient, c.stage, c.request, '2026-12-12', day('2026-12-09'), { months: 9 })).months, 5, 'never more than the phase still needs');
  const e = await blank();
  const inDays = await fill(e.patient, e.stage, e.request, '2026-12-12', day('2026-12-09'), { months: 1, days: 15 });
  assert.deepEqual([inDays.status, inDays.days, inDays.leftDays], ['extended', 45, 105], 'months and days: 1 month 15 days');
  assert.match(inDays.notice, /the next 1 month 15 days of the plan are scheduled from 2026-12-12\. .*3 months 15 days of the phase still wait for medicine\./);
  const f = await blank();
  await assert.rejects(fill(f.patient, f.stage, f.request, '2026-12-12', day('2026-12-09'), { months: 12, days: 5 }), /The length of this supply is not on record/, 'more than 12 months is not a length');
});

test('a supply in days: an Autism phase given as 45 days, then 4 months 15 days', async () => {
  const { patient, stage, first } = make();
  Object.assign(first, { supplyPlan: 'C0m45d', supplyPart: 'full' });
  assert.equal((await startDelivery(patient, stage, user, NOW)).status, 'created');
  const d = stage.delivery;
  assert.deepEqual([d.phaseDays, d.parts[0].days, d.parts[0].months], [180, 45, 1.5], 'the phase of the settings, 45 days in hand');
  assert.ok(lastDay(stage) <= '2026-12-26', 'no session beyond the 45 days in hand');
  const next = S.nextSupplyOf({ stage, pos: null, now: NOW });
  assert.deepEqual([next.leftDays, next.leftText, next.runsOut], [135, '4 months 15 days', '2026-12-26']);
  assert.match(next.text, /the remaining 4 months 15 days/);
  const request = custom('r2', 'PO-2', 'C4m15d', '2026-12-10');
  stage.medicineRequests.push(receive(request, '2026-12-20'));
  assert.equal(T.buildTransitCase(patient, stage, day('2026-12-21')).supplyStart.lengthText, '4 months 15 days');
  const result = await fill(patient, stage, request, '2026-12-27', day('2026-12-21'));
  assert.deepEqual([result.status, result.days, result.leftDays], ['extended', 135, 0]);
  assert.match(result.notice, /the next 4 months 15 days of the plan are scheduled from 2026-12-27/);
  assert.deepEqual(d.parts.map((p) => [p.requestId, p.days, p.offsetDays, p.startDate]), [['r1', 45, 0, '2026-11-12'], ['r2', 135, 45, '2026-12-27']]);
  assert.equal(D.supplyDone(d), true);
  assert.equal(D.phaseEndDay(d), D.addDays('2026-12-27', 134), 'day 180 of the phase is the last day of the second supply');
  assert.ok(lastDay(stage) <= D.phaseEndDay(d));
});

test('a Mental Health custom package of 45 days is the whole phase: follow-ups and tasks fit in its 45 days', async () => {
  const { patient, stage, first } = make();
  patient.category = 'mental_health';
  Object.assign(first, { supplyPlan: 'C0m45d', supplyPart: 'full' });
  assert.equal((await startDelivery(patient, stage, user, NOW)).status, 'created');
  const d = stage.delivery;
  assert.deepEqual([d.phaseDays, d.planMonths, D.supplyDone(d), D.phaseEndDay(d)], [45, 1.5, true, '2026-12-26']);
  assert.ok(lastDay(stage) <= '2026-12-26', 'everything inside the 45 days');
  const followUps = stage.followUps.filter((f) => f.delivery?.template === 'fu');
  assert.equal(followUps.length, D.followUpCount(45, D.cleanRules(d.rules)), 'follow-ups scaled to 45 days');
  assert.ok(followUps.length >= 2 && followUps.length < 15);
  assert.equal(d.tasks.find((t) => t.key === 'task:phaseReview').day, 45, 'the phase review on its last day');
  assert.equal(S.nextSupplyOf({ stage, pos: null, now: NOW }), null, 'no further supply is waited for');
  // A fixed plan stays a 6 month phase for Mental Health too; Autism / ADHD custom supplies are parts of the phase.
  assert.equal(D.isWholePackage({ supplyPlan: '1+5', supplyPart: 'first' }, 'mental_health'), false);
  assert.equal(D.isWholePackage({ supplyPlan: 'C0m45d', supplyPart: 'full' }, 'autism_adhd'), false);
  assert.equal(D.planLengthOf({ supplyPlan: 'C2', supplyPart: 'full', days: 60, planDays: 60 }, {}, 'mental_health'), 60);
  assert.equal(D.planLengthOf({ supplyPlan: 'C2', supplyPart: 'full', days: 60, planDays: 60 }, {}, 'autism_adhd'), 180);
});

test('"no further supply": a closed phase asks for nothing, and a new medicine request reopens it', async () => {
  const { patient, stage } = make();
  await startDelivery(patient, stage, user, NOW);
  Object.assign(stage.delivery, { supplyClosedAt: day('2026-12-01'), supplyClosedByName: 'Dr Asha', supplyClosedNote: 'parent stopped after one month' });
  assert.equal(D.supplyDone(stage.delivery), true);
  assert.equal(D.phaseEndDay(stage.delivery), '2026-12-11', 'the phase ends with the medicine on record');
  assert.equal(S.nextSupplyOf({ stage, pos: [PO1], now: day('2026-12-10') }), null);
  assert.deepEqual(D.alertsOf({ delivery: stage.delivery, sessions: [], now: day('2026-12-10'), supply: null }).filter((a) => a.type === 'supply'), []);
  assert.equal(T.refillOpen(stage), false);
  // Medicine after all: the request reopens the plan; who closed it and why stay on record.
  const request = second({ requestedAt: day('2026-12-15') });
  stage.medicineRequests.push(request);
  assert.equal(T.beginSupplyRound(stage, request, user, day('2026-12-15')), true);
  assert.equal(stage.delivery.supplyClosedAt, null);
  assert.equal(stage.delivery.supplyClosedNote, 'parent stopped after one month');
  assert.equal(S.nextSupplyOf({ stage, pos: null, now: day('2026-12-15') }).stage, 'requested');
  receive(request, '2026-12-20');
  assert.equal((await supplyReceived(patient, stage, user, day('2026-12-20'))).status, 'start_due');
  assert.equal((await fill(patient, stage, request, '2026-12-21', day('2026-12-20'))).status, 'extended');
  assert.deepEqual(stage.delivery.parts.map((p) => [p.months, p.startDate]), [[1, '2026-11-12'], [5, '2026-12-21']]);
});

test('a supply added by hand is not taken a second time on its receipt', async () => {
  const { patient, stage } = make();
  await startDelivery(patient, stage, user, NOW);
  const request = second();
  stage.medicineRequests.push(request);
  // Added by hand and named (the tracker sends the request id).
  stage.delivery.parts.push({ requestId: 'r2', poNumber: 'PO-2', months: 5, startDate: '2026-12-12', offsetDays: 30, source: 'manual', addedAt: day('2026-11-26') });
  Object.assign(request, { status: 'sent_to_courier', courier: { status: 'delivered', deliveredAt: day('2026-12-08') } });
  assert.deepEqual(S.openSupplies(stage), []);
  assert.equal((await supplyReceived(patient, stage, user, day('2026-12-08'))).status, 'none');
  // Added by hand without a name, in a plan of three supplies: an older request is not the next supply.
  const three = make();
  three.stage.delivery.planMonths = 6;
  Object.assign(three.stage.delivery, { phaseDays: 180, parts: [{ requestId: 'r1', months: 1, startDate: '2026-11-12', offsetDays: 0, addedAt: day('2026-11-11') }, { requestId: '', months: 2, startDate: '2026-12-12', offsetDays: 30, source: 'manual', addedAt: day('2026-12-10') }] });
  three.stage.medicineRequests.push(second({ status: 'sent_to_courier', courier: { status: 'delivered', deliveredAt: day('2026-12-08') } }));
  assert.deepEqual(S.openSupplies(three.stage), [], 'requested and received before the hand-added supply: that is the same medicine');
  three.stage.medicineRequests.push(second({ requestId: 'r3', requestedAt: day('2027-01-20') }));
  assert.deepEqual(S.openSupplies(three.stage).map((r) => r.requestId), ['r3']);
});

test('alerts: the plan tells where the next supply stands, and stays quiet while there is time', async () => {
  const { patient, stage } = make();
  await startDelivery(patient, stage, user, NOW);
  const alerts = (now, pos = [PO1]) => D.alertsOf({ delivery: stage.delivery, sessions: [], now, supply: S.nextSupplyOf({ stage, pos, now }) }).filter((a) => a.type === 'supply');
  assert.deepEqual(alerts(NOW), []);
  const amber = alerts(day('2026-11-30'));
  assert.equal(amber[0].level, 'amber');
  assert.match(amber[0].text, /runs till 2026-12-11 \(11 days left\)\. The purchase order for the remaining 5 months of medicine is not made yet/);
  assert.equal(alerts(day('2026-12-10'), [PO1, PO2])[0].level, 'red');
  assert.match(alerts(day('2026-12-10'), [PO1, PO2])[0].text, /PO-2 is made/);
  const plain = D.alertsOf({ delivery: stage.delivery, sessions: [], now: day('2026-12-10'), supply: null }).filter((a) => a.type === 'supply');
  assert.equal(plain.length, 1, 'without the tracker the plain reminder stays');
  assert.match(plain[0].text, /runs till 2026-12-11\. The rest of the plan is scheduled when the PCC fills the medicine start date of the next supply/);
});

// ---- The purchase order pages (real documents) -------------------------------------------------------------------
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

test('PO pages: the second PO waits for its own medicine start date, then tells the day and the months', async () => {
  const c = twoPoCase();
  const request = c.stage.medicineRequests[1];
  Object.assign(c.stage.transit, { callsDoneAt: day('2026-12-01'), fulfilmentMode: 'pickup', fulfilmentSetAt: day('2026-12-01'), pickupScheduledAt: day('2026-12-08'), poPaperSignedAt: day('2026-12-08') });
  Object.assign(request, { status: 'sent_to_courier', inProcessAt: day('2026-11-26'), madeAt: day('2026-12-02'), sentToCourierAt: day('2026-12-07') });
  request.courier = { status: 'delivered', deliveryMode: 'self', receivedByName: 'Parent', deliveredAt: day('2026-12-08'), deliveredByName: 'Transit A' };
  c.stage.delivery = { components: TICKS, componentsSource: 'paper' };
  const made = await startDelivery(c.patient, c.stage, user, day('2026-12-08'));
  assert.equal(made.status, 'created');
  assert.match(made.notice, /the patient has the next supply \(PO-2\)\. The PCC fills its medicine start date/);
  assert.deepEqual(c.stage.delivery.parts.map((p) => [p.requestId, p.months, p.startDate, p.source]), [['r1', 1, '2026-11-12', 'transit']]);
  // Received, no start date yet: the PO is not complete and the PCC is the one to act.
  let next = viewOf(c.po2, c.patient);
  assert.ok(['calls', 'scheduled', 'handover'].every((key) => step(next, key).done));
  assert.deepEqual([step(next, 'started').done, step(next, 'started').startDue], [false, true]);
  assert.match(step(next, 'started').waitText, /The patient has this medicine: the PCC fills its medicine start date on the Medicine Explanations page \(no new explanation\)/);
  assert.deepEqual(actionByOf(c.po2, 'started', false, step(next, 'started')), ['admin', 'assistant_doctor']);
  assert.deepEqual(actionByOf(c.po1, 'started', false, step(viewOf(c.po1, c.patient), 'started')), []);
  const open = T.buildTransitCase(c.patient.toObject(), c.patient.toObject().stages[0], day('2026-12-09'));
  assert.deepEqual([open.refill, open.supplyStart.pending, open.supplyStart.poNumber, open.supplyStart.months], [true, true, 'PO-2', 5]);
  // The PCC closes the explanation as skipped and fills the day.
  const now = day('2026-12-09');
  stampStart(c.stage, 'r2', '2026-12-12', pcc, now, 'starts when the first bottle ends');
  Object.assign(request, { explanationSkipReason: 'skipped', explanationSkipNote: 'parent knows the doses', explanationSkippedAt: now, explanationSkippedByName: 'Dr Asha' });
  assert.equal((await startDelivery(c.patient, c.stage, pcc, now, { request })).status, 'extended');
  assert.deepEqual(c.stage.delivery.parts.map((p) => [p.requestId, p.months, p.startDate, p.source]), [['r1', 1, '2026-11-12', 'transit'], ['r2', 5, '2026-12-12', 'transit']]);
  assert.equal(c.patient.validateSync(), undefined, 'everything written fits the schema');
  next = viewOf(c.po2, c.patient);
  assert.deepEqual([step(next, 'started').done, step(next, 'started').startDue], [true, false]);
  assert.equal(step(next, 'started').text, 'Starts 12 Dec 2026 (5 months of medicine)');
  assert.equal(step(next, 'started').by, 'Dr Asha');
  assert.equal(step(next, 'explained').text, 'Explanation skipped for this supply: parent knows the doses');
  assert.equal(step(next, 'explained').by, 'Dr Asha');
  assert.ok(['calls', 'scheduled', 'handover', 'started'].every((key) => step(viewOf(c.po1, c.patient), key).done));
  const closed = T.buildTransitCase(c.patient.toObject(), c.patient.toObject().stages[0], day('2026-12-10'));
  assert.equal(closed.nextAction, null, 'In Transit has nothing left on the phase');
  assert.deepEqual([closed.supplyStart.pending, closed.supplyStart.skipReason, closed.supplyStart.setBy], [false, 'skipped', 'Dr Asha']);
  assert.equal(closed.supplyStart.startDate, day('2026-12-12').toISOString());
});
