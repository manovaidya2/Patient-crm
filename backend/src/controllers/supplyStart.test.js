// The medicine start date of a later supply of a running phase, as the pages call it: the PCC closes the explanation
// as "already explained" or "skipped" and fills the day on the Medicine Explanations page; "no further supply" closes
// a phase on the Treatment Delivery page. (No database: real documents, saved by validation only.)
const { test, afterEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const Patient = require('../models/Patient');
const { setMedicineStart, listExplanations } = require('./transitController');
const { startDelivery, getPlan, closeSupply, getWorklist, setupPlan, saveSettings } = require('./deliveryController');
const T = require('../utils/transitFlow');
const D = require('../utils/treatmentDelivery');
afterEach(() => mock.restoreAll());

const TICKS = ['dosDontsDiet', 'ayurvedicFormulations', 'panchakarmaKit', 'medicalHandHolding', 'progressTracking', 'sensoryGuidance', 'homeTherapyPlan', 'regularFollowUps', 'familyCounselling'];
const pcc = { _id: new mongoose.Types.ObjectId(), name: 'Dr Asha', role: 'assistant_doctor' };
const otherPcc = { _id: new mongoose.Types.ObjectId(), name: 'Dr Other', role: 'assistant_doctor' };
const admin = { _id: new mongoose.Types.ObjectId(), name: 'Admin', role: 'admin' };
const doctor = { _id: new mongoose.Types.ObjectId(), name: 'Dr Mehta', role: 'doctor' };
const transit = { _id: new mongoose.Types.ObjectId(), name: 'Transit A', role: 'in_transit' };
// The handlers work on the real clock (a start date is at most 60 days ahead), so every day is counted from today.
const today = D.dayOf(new Date());
const ago = (days) => D.addDays(today, -days);
const day = (value) => new Date(`${value}T00:00:00+05:30`);

// A 6 month phase whose first month was handed over 42 days ago and started 40 days ago; its plan is running.
const makeCase = async () => {
  const patient = new Patient({ patientName: 'Aarav', patientCode: 'A-1', guardianName: 'Parent', category: 'autism_adhd', number: '9999999999', age: 7, approvalStatus: 'approved', assignedDoctor: pcc._id });
  const stage = patient.stages[0];
  Object.assign(stage, { purchaseOrder: 'PO-1', totalAmount: 42000, status: 'in_progress', date: day(ago(40)), medicineExplainDate: day(ago(41)) });
  stage.payments.push({ amount: 42000, approvalStatus: 'approved', approvedAt: day(ago(50)) });
  stage.medicineRequests.push({ requestId: 'r1', status: 'sent_to_courier', requestedAt: day(ago(50)), madeAt: day(ago(45)), sentToCourierAt: day(ago(43)), explainedAt: day(ago(41)), poNumber: 'PO-1', supplyPlan: '1+5', supplyPart: 'first', courier: { status: 'delivered', deliveryMode: 'self', receivedByName: 'Parent', deliveredAt: day(ago(42)), deliveredByName: 'Transit A' } });
  Object.assign(stage.transit, {
    enteredAt: day(ago(51)), callsDoneAt: day(ago(44)), fulfilmentMode: 'pickup', fulfilmentSetAt: day(ago(44)), pickupScheduledAt: day(ago(42)), poPaperSignedAt: day(ago(42)),
    assignedAt: day(ago(43)), explanationDoctor: pcc._id, explanationScheduledAt: day(ago(41)), explanationCompletedAt: day(ago(41)), explanationCompletedByName: 'Dr Asha',
    activatedAt: day(ago(41)), activatedByName: 'Dr Asha', medicineStartDate: day(ago(40)),
  });
  stage.delivery = { components: TICKS, componentsSource: 'paper' };
  assert.equal((await startDelivery(patient, stage, pcc, day(ago(41)))).status, 'created');
  patient.save = async () => { await patient.validate(); return patient; };
  patient.populate = async () => patient;
  // loadStage awaits the document; the plan page reads it lean through select / populate.
  mock.method(Patient, 'findById', () => {
    let lean = false;
    const query = { select: () => query, populate: () => query, lean: () => { lean = true; return query; }, then: (ok, no) => Promise.resolve(lean ? patient.toObject() : patient).then(ok, no) };
    return query;
  });
  mock.method(Patient, 'find', () => ({ select: () => ({ lean: async () => [patient.toObject()] }) }));
  return { patient, stage };
};
// The purchase order of the remaining months: requested 15 days ago, worked by In Transit as a new round.
const addSecond = (stage, extra = {}) => {
  stage.medicineRequests.push({ requestId: 'r2', status: 'requested', requestedAt: day(ago(15)), poNumber: 'PO-2', supplyPlan: '1+5', supplyPart: 'rest', courier: { status: 'pending' }, ...extra });
  const request = stage.medicineRequests[stage.medicineRequests.length - 1];
  T.beginSupplyRound(stage, request, transit, day(ago(15)));
  return request;
};
const receive = (request, value) => {
  Object.assign(request, { status: 'sent_to_courier', madeAt: day(ago(8)), sentToCourierAt: day(ago(5)) });
  request.courier = { status: 'delivered', deliveryMode: 'self', receivedByName: 'Parent', deliveredAt: day(value), deliveredByName: 'Transit A' };
  return request;
};
const invoke = async (handler, patient, body = {}, who = pcc, query = {}) => {
  let result, failure;
  await handler({ params: { patientId: String(patient._id), number: '1' }, body, files: [], user: who, query }, { json(v) { result = v; } }, (e) => { failure = e; });
  if (failure) throw failure;
  return result;
};
const listed = async (patient, status) => (await invoke(listExplanations, patient, {}, pcc, status ? { status } : {})).items;
const partsOf = (stage) => stage.delivery.parts.map((p) => [p.requestId, p.months, p.startDate]);

test('the start date of a later supply is only for the PCC of the phase, and only once the patient has the medicine', async () => {
  const { patient, stage } = await makeCase();
  addSecond(stage);
  await assert.rejects(invoke(setMedicineStart, patient, { requestId: 'r2', startDate: today }, otherPcc), (e) => e.statusCode === 403 && /Only the PCC of this explanation/.test(e.message));
  await assert.rejects(invoke(setMedicineStart, patient, { requestId: 'r2', startDate: today }), /Confirm that the patient received this medicine first/);
  await assert.rejects(invoke(setMedicineStart, patient, { requestId: 'nope', startDate: today }), (e) => e.statusCode === 404 && /This supply is not found on the phase/.test(e.message));
  assert.deepEqual(partsOf(stage), [['r1', 1, ago(40)]]);
  assert.equal((await listed(patient)).length, 0, 'nothing for the PCC to do before the receipt');
  assert.equal((await listed(patient, 'done')).length, 1);
});

test('the PCC skips the explanation and fills the start date: the plan goes on, the phase start is not touched', async () => {
  const { patient, stage } = await makeCase();
  const request = receive(addSecond(stage), ago(3));
  const sessions = stage.followUps.length;
  // The received supply is pending work on the Medicine Explanations page.
  const pending = await listed(patient);
  assert.equal(pending.length, 1);
  const s = pending[0].supplyStart;
  assert.deepEqual([s.later, s.pending, s.requestId, s.poNumber, s.months, s.startDate, s.monthsLeft, s.previousStart], [true, true, 'r2', 'PO-2', 5, null, 5, ago(40)]);
  assert.equal((await listed(patient, 'done')).length, 0);
  const body = { requestId: 'r2', note: 'starts on Monday', explanation: 'skipped', explanationNote: 'parent knows the doses' };
  await assert.rejects(invoke(setMedicineStart, patient, { ...body, startDate: '' }), /Choose the medicine start date of this supply/);
  await assert.rejects(invoke(setMedicineStart, patient, { ...body, startDate: ago(5) }), new RegExp(`cannot be before the medicine was received \\(${ago(3)}\\)`));
  await assert.rejects(invoke(setMedicineStart, patient, { ...body, startDate: D.addDays(today, 61) }), /at most 60 days ahead/);
  await assert.rejects(invoke(setMedicineStart, patient, { ...body, startDate: ago(2), note: 'x'.repeat(501) }), /Keep the note under 500 characters/);
  assert.deepEqual(partsOf(stage), [['r1', 1, ago(40)]], 'a refused date changes nothing');
  assert.equal(request.medicineStartDate ?? null, null);
  const saved = await invoke(setMedicineStart, patient, { ...body, startDate: ago(2) });
  assert.deepEqual([saved.delivery.status, saved.delivery.months, saved.delivery.monthsLeft], ['extended', 5, 0]);
  assert.match(saved.delivery.notice, new RegExp(`the next 5 months of the plan are scheduled from ${ago(2)}`));
  assert.deepEqual(partsOf(stage), [['r1', 1, ago(40)], ['r2', 5, ago(2)]]);
  assert.ok(stage.followUps.length > sessions, 'the sessions of the remaining months are made');
  // The supply keeps who dated it and how its explanation was closed.
  assert.equal(request.medicineStartDate.toISOString(), day(ago(2)).toISOString());
  assert.deepEqual([request.medicineStartSetByName, request.medicineStartNote, request.explanationSkipReason, request.explanationSkipNote, request.explanationSkippedByName], ['Dr Asha', 'starts on Monday', 'skipped', 'parent knows the doses', 'Dr Asha']);
  assert.ok(request.explanationSkippedAt instanceof Date);
  const done = saved.item.supplyStart;
  assert.deepEqual([done.pending, done.startDate, done.setBy, done.note, done.skipReason, done.skippedBy, done.skipNote], [false, day(ago(2)).toISOString(), 'Dr Asha', 'starts on Monday', 'skipped', 'Dr Asha', 'parent knows the doses']);
  // The treatment start of the phase is the first supply's.
  assert.equal(stage.transit.medicineStartDate.toISOString(), day(ago(40)).toISOString());
  assert.equal(stage.date.toISOString(), day(ago(40)).toISOString());
  assert.equal(stage.status, 'in_progress');
  assert.ok(patient.activityLog.some((entry) => JSON.stringify(entry).includes(`Medicine start date of the next supply (PO-2): ${ago(2)} (explanation skipped: parent knows the doses) | starts on Monday`)));
  assert.equal((await listed(patient)).length, 0, 'done for the PCC');
  assert.equal((await listed(patient, 'done')).length, 1);
  // "Change start date": only the day moves; the way the explanation was closed stays as it was.
  const count = stage.followUps.length;
  const skippedAt = request.explanationSkippedAt;
  const moved = await invoke(setMedicineStart, patient, { requestId: 'r2', startDate: ago(1), note: '' }, admin);
  assert.equal(moved.delivery.status, 'moved');
  assert.deepEqual(partsOf(stage), [['r1', 1, ago(40)], ['r2', 5, ago(1)]]);
  assert.equal(stage.followUps.length, count, 'no session is made twice');
  assert.deepEqual([request.explanationSkipReason, request.explanationSkipNote, request.explanationSkippedByName, request.medicineStartSetByName], ['skipped', 'parent knows the doses', 'Dr Asha', 'Admin']);
  assert.equal(request.explanationSkippedAt, skippedAt);
  assert.ok(patient.activityLog.some((entry) => JSON.stringify(entry).includes(`Medicine start date of the next supply (PO-2) changed: ${ago(2)} -> ${ago(1)}`)));
  await assert.rejects(invoke(setMedicineStart, patient, { requestId: 'r2', startDate: ago(4) }), /cannot be before the medicine was received/);
});

test('"already explained" is the default way the explanation of a later supply is closed', async () => {
  const { patient, stage } = await makeCase();
  const request = receive(addSecond(stage), ago(3));
  const saved = await invoke(setMedicineStart, patient, { requestId: 'r2', startDate: today });
  assert.equal(saved.delivery.status, 'extended');
  assert.deepEqual([request.explanationSkipReason, request.explanationSkipNote, request.explanationSkippedByName], ['already_explained', '', 'Dr Asha']);
  assert.equal(saved.item.supplyStart.skipReason, 'already_explained');
  assert.ok(patient.activityLog.some((entry) => JSON.stringify(entry).includes(`Medicine start date of the next supply (PO-2): ${today} (already explained with the first supply)`)));
  const explained = saved.item.steps.find((step) => step.key === 'explained');
  assert.equal(explained.text, 'Already explained with the first supply of this phase');
});

test('a supply whose months are not on record: the PCC tells the months together with the start date', async () => {
  const { patient, stage } = await makeCase();
  receive(addSecond(stage, { supplyPlan: '', supplyPart: '' }), ago(3));
  assert.equal((await listed(patient))[0].supplyStart.months, 0);
  await assert.rejects(invoke(setMedicineStart, patient, { requestId: 'r2', startDate: ago(2) }), /The months of this supply are not on record\. Choose how many months of medicine it is\./);
  assert.deepEqual(partsOf(stage), [['r1', 1, ago(40)]]);
  const saved = await invoke(setMedicineStart, patient, { requestId: 'r2', startDate: ago(2), months: 3 });
  assert.deepEqual([saved.delivery.status, saved.delivery.months, saved.delivery.monthsLeft], ['extended', 3, 2]);
  assert.match(saved.delivery.notice, /2 months of the phase still wait for medicine/);
  assert.deepEqual(partsOf(stage), [['r1', 1, ago(40)], ['r2', 3, ago(2)]]);
});

test('Treatment Delivery page: the next supply, "no further supply" with a reason, and reopening', async () => {
  const { patient, stage } = await makeCase();
  const planOf = async (who = pcc) => (await invoke(getPlan, patient, {}, who)).plan;
  let plan = await planOf();
  assert.deepEqual([plan.delivery.supplyClosed, plan.delivery.canCloseSupply, plan.nextSupply.monthsLeft, plan.nextSupply.suggest.startDate], [null, true, 5, '']);
  await assert.rejects(invoke(getPlan, patient, {}, otherPcc), (e) => e.statusCode === 403);
  await assert.rejects(invoke(closeSupply, patient, { closed: true, note: 'x' }), /Write why no further supply is coming in this phase/);
  await assert.rejects(invoke(closeSupply, patient, { closed: false }), /This phase is not closed/);
  const closed = await invoke(closeSupply, patient, { closed: true, note: 'parent stopped after one month' });
  assert.equal(closed.message, 'Closed: the phase ends with the 1 month of medicine on record.');
  assert.deepEqual([closed.plan.delivery.supplyClosed.byName, closed.plan.delivery.supplyClosed.note, closed.plan.delivery.canCloseSupply, closed.plan.nextSupply], ['Dr Asha', 'parent stopped after one month', false, null]);
  assert.deepEqual(closed.plan.alerts.filter((alert) => alert.type === 'supply'), []);
  await assert.rejects(invoke(closeSupply, patient, { closed: true, note: 'again' }), /already closed as "no further supply"/);
  // Medicine raised on a screen that did not reopen the phase: nothing is dated while it is closed.
  stage.medicineRequests.push({ requestId: 'r2', status: 'requested', requestedAt: day(ago(15)), poNumber: 'PO-2', supplyPlan: '1+5', supplyPart: 'rest', courier: { status: 'pending' } });
  receive(stage.medicineRequests[1], ago(3));
  await assert.rejects(invoke(setMedicineStart, patient, { requestId: 'r2', startDate: ago(2) }), /closed as "no further supply"\. Reopen it on the Treatment Delivery page first/);
  const reopened = await invoke(closeSupply, patient, { closed: false }, admin);
  assert.equal(reopened.message, 'Reopened: the plan waits for the next supply again.');
  assert.equal(reopened.plan.delivery.supplyClosed, null);
  assert.deepEqual([reopened.plan.nextSupply.stage, reopened.plan.nextSupply.owner, reopened.plan.nextSupply.suggest.requestId], ['received', 'PCC', 'r2']);
  await assert.rejects(invoke(closeSupply, patient, { closed: true, note: 'parent stopped' }), /The next supply of this phase is already requested \(PO-2\)/);
  assert.equal((await invoke(setMedicineStart, patient, { requestId: 'r2', startDate: ago(2) })).delivery.status, 'extended');
  plan = await planOf(admin);
  assert.deepEqual([plan.nextSupply, plan.delivery.canCloseSupply], [null, false]);
  await assert.rejects(invoke(closeSupply, patient, { closed: true, note: 'nothing more' }), /Every month of this plan already has its medicine/);
});

test('the Doctor: every patient on Treatment Delivery and the PCC work on it, not the Admin corrections or the settings', async () => {
  const { patient } = await makeCase();
  const filters = [];
  mock.method(Patient, 'find', (filter) => {
    filters.push(filter);
    const query = { select: () => query, populate: () => query, lean: async () => [patient.toObject()] };
    return query;
  });
  const rows = (await invoke(getWorklist, patient, {}, doctor)).rows;
  assert.deepEqual([rows.length, rows[0].patientName, 'assignedDoctor' in filters[0]], [1, 'Aarav', false], 'the whole worklist, not only own patients');
  await invoke(getWorklist, patient, {}, pcc);
  assert.equal(String(filters[1].assignedDoctor), String(pcc._id), 'a PCC still sees only their own patients');
  const plan = (await invoke(getPlan, patient, {}, doctor)).plan;
  assert.deepEqual([plan.canAct, plan.isAdmin], [true, false]);
  const closed = await invoke(closeSupply, patient, { closed: true, note: 'parent stopped after one month' }, doctor);
  assert.deepEqual([closed.plan.delivery.supplyClosed.byName, closed.plan.canAct], ['Dr Mehta', true]);
  await assert.rejects(invoke(setupPlan, patient, { components: TICKS.slice(0, 3) }, doctor), (e) => e.statusCode === 403 && /Only the Admin or the Manager corrects the ticks/.test(e.message));
  await assert.rejects(invoke(saveSettings, patient, { rules: {} }, doctor), (e) => e.statusCode === 403 && /Only the Admin changes the Treatment Delivery settings/.test(e.message));
  await assert.rejects(invoke(getPlan, patient, {}, otherPcc), (e) => e.statusCode === 403, 'another PCC still has no access');
});
