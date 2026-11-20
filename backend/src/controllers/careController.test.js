// Care Schedule with the database mocked: the schedule made from the medicine start date (1 + 5 months), the call
// system (call time, at most two reschedules, attempts, missed, cancel), the Manager's cover, the form and the
// doctor alert.
const { test, mock, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const CareSession = require('../models/CareSession');
const AdviceRequest = require('../models/AdviceRequest');
const User = require('../models/User');
const service = require('../utils/careService');
const c = require('./careController');

afterEach(() => mock.restoreAll());
const id = () => new mongoose.Types.ObjectId();
const chain = (rows) => { const q = { select: () => q, sort: () => q, limit: () => q, lean: async () => rows }; return q; };
const pcc = { _id: id(), name: 'PCC Neha', role: 'assistant_doctor' };
const manager = { _id: id(), name: 'Manager Ravi', role: 'manager' };
const call = async (handler, req) => {
  let body = null; let status = 200; let error = null;
  const res = { status(code) { status = code; return this; }, json(data) { body = data; return this; } };
  await handler({ app: { get: () => null }, query: {}, params: {}, body: {}, ...req }, res, (e) => { error = e; });
  return { body, status, error };
};
const aSession = (extra = {}) => {
  const doc = new CareSession({
    patient: id(), patientName: 'Aarav', patientCode: 'A-1', phase: 1, kind: 'followup', seq: 2, code: 'FU-02', title: 'Medical Follow-up 02', day: 20,
    targetDate: '2026-12-10', owner: pcc._id, ownerName: pcc.name, assignee: pcc._id, assigneeName: pcc.name, ...extra,
  });
  mock.method(doc, 'save', async () => doc);
  mock.method(CareSession, 'findById', async () => doc);
  return doc;
};
const later = (days, hour = '11:00') => new Date(`${new Date(Date.now() + days * 86400000 + 19800000).toISOString().slice(0, 10)}T${hour}:00+05:30`);
const notWednesday = (days) => { let d = days; while (later(d).getUTCDay() === 3 || new Date(later(d).getTime() + 19800000).getUTCDay() === 3) d += 1; return later(d); };

test('1 + 5 months: the first month schedules day 10, 15, 20; the second supply goes on from its own start date', async () => {
  const inserted = [];
  mock.method(CareSession, 'find', () => chain([]));
  mock.method(CareSession, 'insertMany', async (docs) => { inserted.push(...docs); return docs; });
  const first = { requestId: 'r1', status: 'sent_to_courier', supplyPlan: '1+5', supplyPart: 'first', poNumber: 'PO-1', explainedAt: new Date('2026-11-19'), courier: { status: 'delivered', deliveredAt: new Date('2026-11-18') } };
  const stage = { number: 1, purchaseOrder: 'PO-1', medicineRequests: [first], transit: { medicineStartDate: new Date('2026-11-20T00:00:00+05:30'), activatedAt: new Date(), explanationDoctor: pcc._id }, markModified() {} };
  const patient = { _id: id(), patientName: 'Aarav', patientCode: 'A-1', assignedDoctor: { _id: pcc._id, name: pcc.name } };

  const made = await service.startCarePlan({ patient, stage, user: pcc, firstSave: true });
  assert.equal(made.status, 'created');
  assert.deepEqual(stage.carePlan.parts.map((p) => [p.requestId, p.days, p.startDate, p.offsetDays]), [['r1', 30, '2026-11-20', 0]]);
  assert.deepEqual(inserted.map((s) => `${s.code}@${s.targetDate}`), ['FU-01@2026-11-30', 'FS-01@2026-12-05', 'FU-02@2026-12-10']);
  assert.equal(inserted[0].assigneeName, pcc.name);

  inserted.length = 0;
  const second = { requestId: 'r2', status: 'sent_to_courier', supplyPlan: '1+5', supplyPart: 'rest', poNumber: 'PO-2', courier: { status: 'delivered', deliveredAt: new Date('2026-12-18') } };
  stage.medicineRequests.push(second);
  stage.carePlan.markModified = () => {};
  const next = await service.continueCarePlan({ patient, stage, request: second, day: '2026-12-20', user: pcc });
  assert.equal(next.status, 'continued');
  assert.deepEqual(stage.carePlan.parts.map((p) => [p.requestId, p.days, p.offsetDays]), [['r1', 30, 0], ['r2', 150, 30]]);
  assert.equal(inserted.length, 10);
  assert.equal(inserted[0].code, 'FU-03');
  assert.equal(inserted[0].targetDate, '2027-01-09', 'day 50 = 20 days after the second start (2026-12-20)');
});

test('an old phase (start date saved before the Care Schedule) gets nothing; months not on record make no schedule', async () => {
  mock.method(CareSession, 'insertMany', async () => assert.fail('nothing is inserted'));
  const stage = { number: 1, medicineRequests: [{ requestId: 'r1', status: 'sent_to_courier', explainedAt: new Date(), courier: { status: 'delivered' } }], transit: { medicineStartDate: new Date('2026-11-20T00:00:00+05:30') } };
  const patient = { _id: id(), patientName: 'Old' };
  assert.equal((await service.startCarePlan({ patient, stage, user: pcc, firstSave: false })).status, 'old_phase');
  assert.equal((await service.startCarePlan({ patient, stage, user: pcc, firstSave: true })).status, 'no_length');
  assert.equal(stage.carePlan, undefined);
});

test('a corrected start date moves the open sessions (and a call time not yet rescheduled)', async () => {
  const doc = aSession({ code: 'FU-01', day: 10, targetDate: '2026-11-30', supplyKey: 'r1', callAt: new Date('2026-11-30T05:30:00Z'), status: 'scheduled' });
  mock.method(CareSession, 'find', async () => [doc]);
  const stage = { number: 1, carePlan: { parts: [{ requestId: 'r1', days: 30, startDate: '2026-11-20', offsetDays: 0 }] }, transit: { medicineStartDate: new Date('2026-11-23T00:00:00+05:30') }, medicineRequests: [], markModified() {} };
  const moved = await service.startCarePlan({ patient: { _id: doc.patient }, stage, user: pcc, firstSave: false });
  assert.equal(moved.status, 'moved');
  assert.equal(doc.targetDate, '2026-12-03');
  assert.equal(new Date(doc.callAt).toISOString(), '2026-12-03T05:30:00.000Z');
});

test('call time, then at most two reschedules (with a reason); after that only complete, missed or cancel', async () => {
  const doc = aSession();
  const set = await call(c.setCallTime, { params: { id: String(doc._id) }, body: { callAt: notWednesday(3).toISOString() }, user: pcc });
  assert.equal(set.error, null);
  assert.equal(set.body.session.status, 'scheduled');
  assert.match((await call(c.setCallTime, { params: { id: String(doc._id) }, body: { callAt: notWednesday(4).toISOString() }, user: pcc })).error.message, /Reschedule/);
  assert.match((await call(c.reschedule, { params: { id: String(doc._id) }, body: { callAt: notWednesday(4).toISOString() }, user: pcc })).error.message, /why/);
  for (const n of [4, 6]) assert.equal((await call(c.reschedule, { params: { id: String(doc._id) }, body: { callAt: notWednesday(n).toISOString(), reason: 'Parent busy' }, user: pcc })).error, null);
  const third = await call(c.reschedule, { params: { id: String(doc._id) }, body: { callAt: notWednesday(8).toISOString(), reason: 'again' }, user: pcc });
  assert.match(third.error.message, /already rescheduled 2 times/);
  assert.equal(c.viewOf(doc.toObject()).state, 'alert');
  const wed = new Date(later(1)); while (new Date(wed.getTime() + 19800000).getUTCDay() !== 3) wed.setTime(wed.getTime() + 86400000);
  assert.match((await call(c.setCallTime, { params: { id: String(aSession()._id) }, body: { callAt: wed.toISOString() }, user: pcc })).error.message, /Wednesday/);
});

test('calls not connected are recorded; missed by parents needs a reason; someone else\'s session is refused', async () => {
  const doc = aSession();
  assert.equal((await call(c.addAttempt, { params: { id: String(doc._id) }, body: { outcome: 'not_connected', note: 'rang out' }, user: pcc })).body.session.attempts, 1);
  assert.match((await call(c.markMissed, { params: { id: String(doc._id) }, body: {}, user: pcc })).error.message, /why/);
  assert.match((await call(c.markMissed, { params: { id: String(doc._id) }, body: { reason: 'Other' }, user: pcc })).error.message, /Write the reason/);
  const missed = await call(c.markMissed, { params: { id: String(doc._id) }, body: { reason: 'Parent busy / travelling', note: 'out of town' }, user: pcc });
  assert.equal(missed.body.session.status, 'missed');
  assert.equal(missed.body.session.missedReason, 'Parent busy / travelling — out of town');
  assert.match((await call(c.cancelSession, { params: { id: String(doc._id) }, body: { reason: 'x' }, user: pcc })).error.message, /already missed/);
  const other = { _id: id(), name: 'PCC Two', role: 'assistant_doctor' };
  assert.equal((await call(c.addAttempt, { params: { id: String(aSession()._id) }, body: { outcome: 'busy' }, user: other })).error.statusCode, 403);
});

test('the Manager gives a session to another person (PCC on leave), and back; the PCC cannot', async () => {
  const doc = aSession();
  const cover = { _id: id(), name: 'PCC Cover', role: 'assistant_doctor', isActive: true };
  mock.method(User, 'findById', (userId) => chain(String(userId) === String(pcc._id) ? { ...pcc, isActive: true } : cover));
  assert.equal((await call(c.assignSession, { params: { id: String(doc._id) }, body: { userId: String(cover._id), reason: 'leave' }, user: pcc })).error.statusCode, 403);
  assert.match((await call(c.assignSession, { params: { id: String(doc._id) }, body: { userId: String(cover._id) }, user: manager })).error.message, /why/);
  const given = await call(c.assignSession, { params: { id: String(doc._id) }, body: { userId: String(cover._id), reason: 'PCC on leave' }, user: manager });
  assert.equal(given.body.session.assigneeName, 'PCC Cover');
  assert.equal(given.body.session.covered, true);
  assert.equal(given.body.session.ownerName, pcc.name, 'the case owner stays');
  const back = await call(c.assignSession, { params: { id: String(doc._id) }, body: { userId: String(pcc._id) }, user: manager });
  assert.equal(back.body.session.covered, false);
});

test('Mark done needs the filled form; an Emergency answer sends the doctor an urgent advice request once', async () => {
  const doc = aSession();
  const advices = [];
  mock.method(AdviceRequest, 'create', async (data) => { advices.push(data); return { _id: id(), ...data }; });
  const answers = { response: 'Available → Start', mode: 'Call', spokeWith: 'Mother', safety: 'New Concern', triage: 'Emergency', concern: { symptom: { value: 'seizure' } }, medRoutine: 'All Regular', support: 'No Further Support Needed' };
  const early = await call(c.completeSession, { params: { id: String(doc._id) }, body: { answers }, user: pcc });
  assert.match(early.error.message, /Final Status/);
  assert.equal(doc.status, 'pending', 'not done');
  const draft = await call(c.saveForm, { params: { id: String(doc._id) }, body: { answers }, user: pcc });
  assert.deepEqual(draft.body.sentToDoctor, ['Emergency']);
  assert.equal(advices.length, 1);
  assert.equal(advices[0].isUrgent, true);
  assert.match(advices[0].query, /FU-02.*Emergency/s);
  assert.match(advices[0].query, /seizure/);
  const done = await call(c.completeSession, { params: { id: String(doc._id) }, body: { answers: { ...answers, final: 'Urgent Clinical Escalation' } }, user: pcc });
  assert.equal(done.error, null);
  assert.equal(done.body.session.status, 'completed');
  assert.equal(advices.length, 1, 'the same Emergency is not sent twice');
  assert.equal(doc.form.templateKey, 'MV-FU-02');
  assert.equal(doc.form.answers.final, 'Urgent Clinical Escalation');
});
