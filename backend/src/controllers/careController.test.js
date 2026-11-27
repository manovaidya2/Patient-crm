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

test('1 + 5 months: the first month schedules the foundation week, day 15 and 20; the second supply goes on from its own start date', async () => {
  const inserted = [];
  mock.method(CareSession, 'find', () => chain([]));
  mock.method(CareSession, 'insertMany', async (docs) => { inserted.push(...docs); return docs; });
  const first = { requestId: 'r1', status: 'sent_to_courier', supplyPlan: '1+5', supplyPart: 'first', poNumber: 'PO-1', explainedAt: new Date('2026-11-19'), courier: { status: 'delivered', deliveredAt: new Date('2026-11-18') } };
  const stage = { number: 1, purchaseOrder: 'PO-1', medicineRequests: [first], transit: { medicineStartDate: new Date('2026-11-20T00:00:00+05:30'), activatedAt: new Date(), explanationDoctor: pcc._id }, markModified() {} };
  const patient = { _id: id(), patientName: 'Aarav', patientCode: 'A-1', assignedDoctor: { _id: pcc._id, name: pcc.name } };

  const made = await service.startCarePlan({ patient, stage, user: pcc, firstSave: true });
  assert.equal(made.status, 'created');
  assert.deepEqual(stage.carePlan.parts.map((p) => [p.requestId, p.days, p.startDate, p.offsetDays]), [['r1', 30, '2026-11-20', 0]]);
  // Friday 2026-11-20: the foundation week on consecutive working days (Wednesday 25 skipped), then day 15 and 20.
  assert.deepEqual(inserted.map((s) => `${s.code}@${s.targetDate}`), ['FCF-01@2026-11-20', 'FCF-02@2026-11-21', 'FCF-03@2026-11-22', 'FCF-04@2026-11-23', 'FCF-05@2026-11-24', 'FCF-06@2026-11-26', 'FCF-07@2026-11-27', 'FS-01@2026-12-05', 'FU-01@2026-12-10']);
  assert.equal(inserted[0].kind, 'foundation');
  assert.equal(inserted[0].assigneeName, pcc.name);

  inserted.length = 0;
  const second = { requestId: 'r2', status: 'sent_to_courier', supplyPlan: '1+5', supplyPart: 'rest', poNumber: 'PO-2', courier: { status: 'delivered', deliveredAt: new Date('2026-12-18') } };
  stage.medicineRequests.push(second);
  stage.carePlan.markModified = () => {};
  const next = await service.continueCarePlan({ patient, stage, request: second, day: '2026-12-20', user: pcc });
  assert.equal(next.status, 'continued');
  assert.deepEqual(stage.carePlan.parts.map((p) => [p.requestId, p.days, p.offsetDays]), [['r1', 30, 0], ['r2', 150, 30]]);
  assert.equal(inserted.length, 9, 'FU-02 … FU-06, FS-02, FS-03, DT-01, DT-02');
  assert.equal(inserted[0].code, 'FU-02');
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

test('a corrected start date moves the open sessions (and a call time not yet rescheduled); an earlier-plan session keeps its own day', async () => {
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

test('Call details: when the call was made, picked up (minutes, what was said) or not; only missed calls count as not connected', async () => {
  const doc = aSession();
  const at = new Date(Date.now() - 2 * 3600000);
  const missed = await call(c.addAttempt, { params: { id: String(doc._id) }, body: { outcome: 'busy', calledAt: at.toISOString(), note: 'cut the call' }, user: pcc });
  assert.equal(missed.error, null);
  const talked = await call(c.addAttempt, { params: { id: String(doc._id) }, body: { outcome: 'connected', minutes: '12.5', note: 'Sleep better, appetite low' }, user: pcc });
  const s = talked.body.session;
  assert.deepEqual([s.attempts, s.calls, s.talked], [1, 2, 1]);
  assert.equal(s.lastAttempt.outcome, 'busy');
  assert.equal(new Date(s.attemptsList[0].calledAt).toISOString(), at.toISOString());
  assert.deepEqual([s.attemptsList[1].connected, s.attemptsList[1].duration, s.attemptsList[1].note], [true, '12 min 30 sec', 'Sleep better, appetite low']);
  assert.match(doc.log.slice(-1)[0].text, /^Call 2 \(.+\): Picked up — talked, 12 min 30 sec — Sleep better/);
  assert.equal((await call(c.addAttempt, { params: { id: String(doc._id) }, body: { outcome: 'connected' }, user: pcc })).body.session.attemptsList[2].duration, '', 'minutes are optional');
  assert.match((await call(c.addAttempt, { params: { id: String(doc._id) }, body: {}, user: pcc })).error.message, /picked up/);
  assert.match((await call(c.addAttempt, { params: { id: String(doc._id) }, body: { outcome: 'connected', calledAt: new Date(Date.now() + 3600000).toISOString() }, user: pcc })).error.message, /future/);
  assert.match((await call(c.addAttempt, { params: { id: String(doc._id) }, body: { outcome: 'connected', minutes: '-3' }, user: pcc })).error.message, /minutes/);
  const closed = await call(c.closeSession, { params: { id: String(doc._id) }, body: { reason: 'Other', details: 'Talked, session done on WhatsApp' }, user: pcc });
  assert.equal(closed.body.session.closed.attempts, 1, 'only the call that did not connect');
});

test('Call details from the staff phones: the calls 10 min around the time on this patient\'s numbers, with recordings; the ticked ones saved with the note', async () => {
  const PhoneCall = require('../models/PhoneCall');
  const Patient = require('../models/Patient');
  const phoneCalls = require('./phoneCallController');
  const doc = aSession();
  const at = new Date(Date.now() - 3600000);
  mock.method(Patient, 'findById', () => chain({ number: '+91 98765 43210', alternateNumber: '', whatsappNumber: '9876543210' }));
  const whose = [{ patient: doc.patient, label: "Father's mobile" }];
  const missed = { _id: id(), startedAt: new Date(at.getTime() - 4 * 60000), direction: 'outgoing', durationSec: 0, userName: 'Sachin', phoneNumber: '9876543210', matches: whose, recording: {} };
  const talked = { _id: id(), startedAt: new Date(at.getTime() + 60000), direction: 'outgoing', durationSec: 754, userName: 'Sachin', phoneNumber: '9876543210', matches: whose, recording: { file: '2026-11/x.webm', size: 90000 } };
  let asked = null;
  mock.method(PhoneCall, 'find', (q) => { asked = q; const rows = [missed, talked]; return chain(q._id ? rows.filter((r) => q._id.$in.map(String).includes(String(r._id))) : rows); });
  const fetch = () => call(c.sessionPhoneCalls, { params: { id: String(doc._id) }, query: { at: at.toISOString() }, user: pcc });
  const found = await fetch();
  assert.equal(found.error, null);
  assert.deepEqual(asked.$or, [{ patients: doc.patient }, { phoneTail: { $in: ['9876543210'] } }], 'the patient\'s calls, or any call on one of their numbers');
  assert.deepEqual([asked.startedAt.$gte.getTime(), asked.startedAt.$lte.getTime()], [at.getTime() - 600000 - 6 * 3600000, at.getTime() + 600000], 'started up to 10 min after (and long calls that started earlier)');
  assert.deepEqual(found.body.calls.map((x) => [x.directionLabel, x.duration, x.whose, x.userName, x.recording, x.savedHere]), [
    ['Outgoing', '', "Father's mobile", 'Sachin', false, false],
    ['Outgoing', '12 min 34 sec', "Father's mobile", 'Sachin', true, false],
  ]);

  // Going on within 10 minutes of the time: a long talk that started 40 min before and ended 5 min before counts; a
  // call that ended 20 min before, or starts 15 min after, does not. Several times at once (call time, "Call" pressed, now).
  const long = { ...talked, _id: id(), startedAt: new Date(at.getTime() - 40 * 60000), durationSec: 35 * 60 };
  const ended = { ...missed, _id: id(), startedAt: new Date(at.getTime() - 30 * 60000), durationSec: 600 };
  const later = { ...missed, _id: id(), startedAt: new Date(at.getTime() + 15 * 60000) };
  mock.method(PhoneCall, 'find', () => chain([long, ended, later]));
  assert.deepEqual((await fetch()).body.calls.map((x) => x.id), [String(long._id)]);
  const both = await call(c.sessionPhoneCalls, { params: { id: String(doc._id) }, query: { around: `${at.toISOString()},${new Date(at.getTime() + 20 * 60000).toISOString()}` }, user: pcc });
  assert.deepEqual(both.body.calls.map((x) => x.id), [String(long._id), String(later._id)]);
  assert.match((await call(c.sessionPhoneCalls, { params: { id: String(doc._id) }, query: { around: 'not-a-time' }, user: pcc })).error.message, /call time/);
  mock.method(PhoneCall, 'find', (q) => { asked = q; const rows = [missed, talked]; return chain(q._id ? rows.filter((r) => q._id.$in.map(String).includes(String(r._id))) : rows); });

  // Both ticked: the one not picked up as not connected, the one talked on with its duration and the note.
  const saved = await call(c.addAttempt, { params: { id: String(doc._id) }, body: { phoneCallIds: [String(talked._id), String(missed._id)], note: 'Sleep better, appetite low' }, user: pcc });
  assert.equal(saved.error, null);
  const s = saved.body.session;
  assert.deepEqual([s.calls, s.talked], [2, 1]);
  assert.deepEqual(s.attemptsList.map((a) => [a.outcome, a.durationSec, a.note, a.phoneUser, a.phoneDirection, a.phoneRecording, new Date(a.calledAt).getTime()]), [
    ['not_connected', null, '', 'Sachin', 'outgoing', false, missed.startedAt.getTime()],
    ['connected', 754, 'Sleep better, appetite low', 'Sachin', 'outgoing', true, talked.startedAt.getTime()],
  ]);
  assert.match(doc.log.slice(-1)[0].text, /^Phone calls saved: .+Outgoing, not picked up \(Sachin's phone\); .+Outgoing, 12 min 34 sec \(Sachin's phone\) — Sleep better/);

  // Fetched again: already saved; saving one again is refused. A call that is not this patient's is refused.
  assert.deepEqual((await fetch()).body.calls.map((x) => x.savedHere), [true, true]);
  assert.match((await call(c.addAttempt, { params: { id: String(doc._id) }, body: { phoneCallIds: [String(talked._id)] }, user: pcc })).error.message, /already saved/);
  mock.method(PhoneCall, 'find', () => chain([]));
  assert.match((await call(c.addAttempt, { params: { id: String(doc._id) }, body: { phoneCallIds: [String(id())] }, user: pcc })).error.message, /not of this patient/);

  // The recording: only a call of this patient; someone else's session is refused.
  const sent = [];
  mock.method(phoneCalls, 'sendRecording', async (req, res, callId) => { sent.push(String(callId)); });
  mock.method(PhoneCall, 'findOne', () => chain({ _id: talked._id }));
  await call(c.sessionCallRecording, { params: { id: String(doc._id), callId: String(talked._id) }, user: pcc });
  assert.deepEqual(sent, [String(talked._id)]);
  mock.method(PhoneCall, 'findOne', () => chain(null));
  assert.equal((await call(c.sessionCallRecording, { params: { id: String(doc._id), callId: String(id()) }, user: pcc })).error.statusCode, 404);
  // Saving needs the session to be yours (another PCC only reads it).
  const other = { _id: id(), name: 'PCC Two', role: 'assistant_doctor' };
  assert.equal((await call(c.addAttempt, { params: { id: String(aSession()._id) }, body: { phoneCallIds: [String(talked._id)] }, user: other })).error.statusCode, 403);
});

test('the call time makes its own reminder 10 minutes before; a reschedule moves it; a recorded call stops it; it pops up for the assignee', async () => {
  const doc = aSession();
  const first = notWednesday(3);
  await call(c.setCallTime, { params: { id: String(doc._id) }, body: { callAt: first.toISOString() }, user: pcc });
  const own = () => doc.reminders.filter((r) => r.kind === 'call');
  assert.equal(own().length, 1);
  assert.equal(own()[0].at.getTime(), first.getTime() - 10 * 60000);
  assert.match(own()[0].note, /^Call the parent — call time /);
  const next = notWednesday(5);
  await call(c.reschedule, { params: { id: String(doc._id) }, body: { callAt: next.toISOString(), reason: 'Parent busy' }, user: pcc });
  assert.equal(own().length, 1, 'moved, not a second one');
  assert.equal(own()[0].at.getTime(), next.getTime() - 10 * 60000);
  await call(c.addAttempt, { params: { id: String(doc._id) }, body: { outcome: 'busy' }, user: pcc });
  assert.equal(own()[0].doneAt, null, 'a call that did not connect before the reminder starts leaves it on');
  // The call is in 5 minutes: the reminder is on.
  const soon = new Date(Date.now() + 5 * 60000);
  own()[0].at = new Date(soon.getTime() - 10 * 60000);
  doc.callAt = soon;
  const popping = c.remindersOf([doc.toObject()]);
  assert.deepEqual(popping.map((r) => [r.kind, r.code, r.sessionId]), [['call', 'FU-02', String(doc._id)]]);
  await call(c.addAttempt, { params: { id: String(doc._id) }, body: { outcome: 'not_connected' }, user: pcc });
  assert.ok(own()[0].doneAt, 'a call recorded after it started stops it');
  assert.equal(c.remindersOf([doc.toObject()]).length, 0);
  // A call time set before these reminders were kept: the same reminder until a call is recorded.
  const old = aSession({ callAt: soon, status: 'scheduled' }).toObject();
  assert.equal(c.remindersOf([old])[0].kind, 'call');
  assert.equal(c.remindersOf([{ ...old, callAt: new Date(Date.now() + 30 * 60000) }]).length, 0, 'not yet: 30 minutes ahead');
  assert.equal(c.remindersOf([{ ...old, attempts: [{ at: new Date(), outcome: 'busy' }] }]).length, 0);
  // Their own reminders pop up too.
  const mineToo = aSession({ reminders: [{ at: new Date(Date.now() - 60000), note: 'Call after 6 pm' }] }).toObject();
  assert.deepEqual(c.remindersOf([mineToo]).map((r) => [r.kind, r.note]), [['note', 'Call after 6 pm']]);
});

test('development tracker: no call time or form; "tracker sent" (date & time), then the filled tracker link completes it', async () => {
  const doc = aSession({ kind: 'tracker', seq: 1, code: 'DT-01', title: 'Development Tracker 01', day: 60, targetDate: '2099-01-05' });
  assert.equal(c.viewOf(doc.toObject()).state, 'upcoming', 'not "set call time"');
  assert.match((await call(c.setCallTime, { params: { id: String(doc._id) }, body: { callAt: notWednesday(3).toISOString() }, user: pcc })).error.message, /no call time or form/);
  assert.match((await call(c.completeSession, { params: { id: String(doc._id) }, body: { answers: {} }, user: pcc })).error.message, /no call time or form/);
  assert.match((await call(c.trackerFilled, { params: { id: String(doc._id) }, body: { link: 'https://forms.example.com/r/1' }, user: pcc })).error.message, /First record when the tracker was sent/);
  assert.match((await call(c.trackerSent, { params: { id: String(doc._id) }, body: {}, user: pcc })).error.message, /Choose when/);
  assert.match((await call(c.trackerSent, { params: { id: String(doc._id) }, body: { sentAt: new Date(Date.now() + 3600000).toISOString() }, user: pcc })).error.message, /future/);
  const sentAt = new Date(Date.now() - 3600000);
  const sent = await call(c.trackerSent, { params: { id: String(doc._id) }, body: { sentAt: sentAt.toISOString() }, user: pcc });
  assert.equal(sent.error, null);
  assert.deepEqual([sent.body.session.state, sent.body.session.stateLabel, new Date(sent.body.session.tracker.sentAt).toISOString()], ['tracker_sent', 'Tracker sent · waiting', sentAt.toISOString()]);
  assert.match((await call(c.trackerFilled, { params: { id: String(doc._id) }, body: { link: 'not a link' }, user: pcc })).error.message, /Paste the link/);
  const done = await call(c.trackerFilled, { params: { id: String(doc._id) }, body: { link: 'https://forms.example.com/r/1' }, user: pcc });
  assert.deepEqual([done.body.session.status, done.body.session.final, done.body.session.tracker.filledLink, done.body.session.completedByName], ['completed', 'Tracker filled', 'https://forms.example.com/r/1', pcc.name]);
  assert.equal(new Date(done.body.session.tracker.sentAt).toISOString(), sentAt.toISOString(), 'the sent time is kept');
  assert.match((await call(c.trackerSent, { params: { id: String(aSession()._id) }, body: { sentAt: sentAt.toISOString() }, user: pcc })).error.message, /Only a development tracker/);
  // An old tracker with a call time: no call reminder pops up for it.
  const old = aSession({ kind: 'tracker', code: 'DT-01', callAt: new Date(Date.now() + 60000), status: 'scheduled' }).toObject();
  assert.equal(c.remindersOf([old]).length, 0);
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

test('Mark done saves the form as filled (nothing is required); an Emergency answer sends the doctor an urgent advice request once', async () => {
  const doc = aSession();
  const advices = [];
  mock.method(AdviceRequest, 'create', async (data) => { advices.push(data); return { _id: id(), ...data }; });
  const answers = { response: 'Busy → Schedule Again', safety: 'New Concern', triage: 'Emergency', concern: { symptom: { value: 'seizure' } } };
  const draft = await call(c.saveForm, { params: { id: String(doc._id) }, body: { answers }, user: pcc });
  assert.deepEqual(draft.body.sentToDoctor, ['Emergency']);
  assert.equal(advices.length, 1);
  assert.equal(advices[0].isUrgent, true);
  assert.match(advices[0].query, /FU-02.*Emergency/s);
  assert.match(advices[0].query, /seizure/);
  assert.equal(draft.body.session.status, 'pending', 'a draft is not done');
  const done = await call(c.completeSession, { params: { id: String(doc._id) }, body: { answers }, user: pcc });
  assert.equal(done.error, null, 'no Final Status / required answer is asked for');
  assert.equal(done.body.session.status, 'completed');
  assert.equal(advices.length, 1, 'the same Emergency is not sent twice');
  assert.equal(doc.form.templateKey, 'MV-FU-02');
});

test('the forms are served without "required" marks', async () => {
  const doc = aSession();
  mock.method(require('../models/Patient'), 'findById', () => chain({ patientName: 'Aarav', number: '9999999999', guardianName: 'Mother' }));
  const res = await call(c.getSession, { params: { id: String(doc._id) }, user: pcc });
  assert.equal(res.error, null);
  assert.equal(res.body.template.sections.flatMap((s) => s.blocks).filter((b) => b.req).length, 0);
  assert.deepEqual([res.body.contact.phone, res.body.contact.parent], ['9999999999', 'Mother']);
});
test('reminders: added with a note, a due one puts the session in pending work, marked done', async () => {
  const doc = aSession({ targetDate: '2027-02-10' });
  assert.match((await call(c.addReminder, { params: { id: String(doc._id) }, body: { at: new Date().toISOString() }, user: pcc })).error.message, /what the reminder/);
  const added = await call(c.addReminder, { params: { id: String(doc._id) }, body: { at: new Date(Date.now() - 60000).toISOString(), note: 'Call after 6 pm' }, user: pcc });
  assert.equal(added.body.session.reminders.length, 1);
  assert.equal(added.body.session.reminderDue, true);
  assert.equal(c.viewOf(doc.toObject()).state, 'needs_time', 'the session itself is not late (no call time yet, due in February)');
  const done = await call(c.updateReminder, { params: { id: String(doc._id), reminderId: String(doc.reminders[0]._id) }, body: { done: true }, user: pcc });
  assert.equal(done.body.session.reminderDue, false);
  assert.ok(done.body.session.reminders[0].doneAt);
});

test('ask the doctor from the session: an advice request linked to the session', async () => {
  const doc = aSession();
  const advices = [];
  mock.method(AdviceRequest, 'create', async (data) => { advices.push(data); return { _id: id(), ...data }; });
  assert.match((await call(c.askDoctor, { params: { id: String(doc._id) }, body: {}, user: pcc })).error.message, /question/);
  const asked = await call(c.askDoctor, { params: { id: String(doc._id) }, body: { query: 'Child not sleeping since the new medicine', urgent: true }, user: pcc });
  assert.equal(asked.error, null);
  assert.equal(advices[0].isUrgent, true);
  assert.match(advices[0].query, /^FU-02 Medical Follow-up 02 \(day 20\): Child not sleeping/);
  assert.equal(asked.body.session.doctorRequests.length, 1);
});

test('Close: a reason and the details are required; "missed by patient" closes it as missed with the calls made, others as closed', async () => {
  const doc = aSession();
  await call(c.addAttempt, { params: { id: String(doc._id) }, body: { outcome: 'not_connected' }, user: pcc });
  await call(c.addAttempt, { params: { id: String(doc._id) }, body: { outcome: 'switched_off' }, user: pcc });
  assert.match((await call(c.closeSession, { params: { id: String(doc._id) }, body: { details: 'no answer' }, user: pcc })).error.message, /why/);
  assert.match((await call(c.closeSession, { params: { id: String(doc._id) }, body: { reason: 'Missed by patient — no answer to calls' }, user: pcc })).error.message, /details/);
  const closed = await call(c.closeSession, { params: { id: String(doc._id) }, body: { reason: 'Missed by patient — no answer to calls', details: '2 calls, WhatsApp sent, no reply' }, user: pcc });
  assert.equal(closed.body.session.status, 'missed');
  assert.equal(closed.body.session.stateLabel, 'Closed · Missed by patient');
  assert.deepEqual([closed.body.session.closed.attempts, closed.body.session.closed.details], [2, '2 calls, WhatsApp sent, no reply']);
  const other = aSession();
  const done = await call(c.closeSession, { params: { id: String(other._id) }, body: { reason: 'Treatment stopped / patient inactive', details: 'Parents stopped the treatment' }, user: pcc });
  assert.deepEqual([done.body.session.status, done.body.session.stateLabel], ['cancelled', 'Closed']);
  const reopened = await call(c.reopenSession, { params: { id: String(other._id) }, body: { reason: 'Closed by mistake' }, user: manager });
  assert.equal(reopened.body.session.closed, null);
});

test('reassign request: the PCC asks (with why), the Manager declines with a note or assigns (which closes the request)', async () => {
  const doc = aSession();
  const cover = { _id: id(), name: 'PCC Cover', role: 'assistant_doctor', isActive: true };
  mock.method(User, 'findById', () => chain(cover));
  assert.match((await call(c.requestReassign, { params: { id: String(doc._id) }, body: {}, user: pcc })).error.message, /why/);
  const asked = await call(c.requestReassign, { params: { id: String(doc._id) }, body: { reason: 'On leave that day', suggestedUserId: String(cover._id) }, user: pcc });
  assert.equal(asked.body.session.reassignAsked, true);
  assert.equal(asked.body.session.reassignRequest.suggestedName, 'PCC Cover');
  assert.match((await call(c.requestReassign, { params: { id: String(doc._id) }, body: { reason: 'again' }, user: pcc })).error.message, /already waiting/);
  assert.equal((await call(c.declineReassign, { params: { id: String(doc._id) }, body: { note: 'x' }, user: pcc })).error.statusCode, 403);
  const declined = await call(c.declineReassign, { params: { id: String(doc._id) }, body: { note: 'Leave is the next day, keep it' }, user: manager });
  assert.deepEqual([declined.body.session.reassignAsked, declined.body.session.reassignRequest.status], [false, 'declined']);
  await call(c.requestReassign, { params: { id: String(doc._id) }, body: { reason: 'Leave moved', suggestedUserId: String(cover._id) }, user: pcc });
  const given = await call(c.assignSession, { params: { id: String(doc._id) }, body: { userId: String(cover._id), reason: 'Leave moved' }, user: manager });
  assert.equal(given.body.session.assigneeName, 'PCC Cover');
  assert.deepEqual([given.body.session.reassignRequest.status, given.body.session.reassignRequest.note], ['done', 'Assigned to PCC Cover']);
});

test('another PCC reads a colleague\'s session (read only); acting on it is refused until it is assigned to them', async () => {
  const doc = aSession({ status: 'completed' });
  const other = { _id: id(), name: 'PCC Two', role: 'assistant_doctor' };
  mock.method(require('../models/Patient'), 'findById', () => chain({ patientName: 'Aarav' }));
  const seen = await call(c.getSession, { params: { id: String(doc._id) }, user: other });
  assert.equal(seen.error, null);
  assert.equal(seen.body.canAct, false);
  assert.equal((await call(c.addAttempt, { params: { id: String(aSession()._id) }, body: { outcome: 'busy' }, user: other })).error.statusCode, 403);
  const theirs = aSession({ assignee: other._id, assigneeName: other.name });
  assert.equal((await call(c.addAttempt, { params: { id: String(theirs._id) }, body: { outcome: 'busy' }, user: other })).error, null, 'assigned to them: they work it');
});

test('handwritten notes: kept on the session and added at the end of the patient\'s newest Records Room entry (one is made when there is none)', async () => {
  const RecordRoom = require('../models/RecordRoom');
  const recordRoom = require('./recordRoomController');
  const doc = aSession();
  mock.method(require('../models/Patient'), 'findById', () => chain({ patientName: 'Aarav', patientCode: 'A-1' }));
  mock.method(require('../models/AppointmentManagementEntry'), 'find', () => chain([]));
  const older = new RecordRoom({ patientName: 'Aarav', patientId: 'A-1', pdfUpdatedAt: new Date('2026-01-01'), documents: [{ url: '/uploads/records/a.jpg', fileName: 'a.jpg' }] });
  const newer = new RecordRoom({ patientName: 'Aarav', patientId: 'A-1', pdfUpdatedAt: new Date('2026-10-01'), documents: [{ url: '/uploads/records/b.jpg', fileName: 'b.jpg' }] });
  [older, newer].forEach((r) => mock.method(r, 'save', async () => r));
  mock.method(RecordRoom, 'find', async () => [older, newer]);
  mock.method(recordRoom, 'rebuildPdf', async (record) => { Object.assign(record, { pdfUrl: `/uploads/records/record-room-${record._id}.pdf`, pdfName: 'Aarav record room (2 pages).pdf', pdfPageCount: record.documents.length }); });
  const files = [{ filename: '111-note.jpg', originalname: 'IMG_1.jpg', mimetype: 'image/jpeg', path: '/tmp/none' }];
  const res = await call(c.uploadNotes, { params: { id: String(doc._id) }, files, user: pcc });
  assert.equal(res.error, null);
  assert.equal(newer.documents.length, 2, 'added to the newest entry');
  assert.equal(older.documents.length, 1);
  assert.match(newer.documents[1].fileName, /^Handwritten note - FU-02 Medical Follow-up 02/);
  assert.equal(res.body.session.notes.length, 1);
  assert.equal(res.body.session.notes[0].recordRoomPdf, newer.pdfUrl);
  assert.equal(res.body.recordRoom.pages, 2);

  mock.method(RecordRoom, 'find', async () => []);
  const madeSave = mock.method(RecordRoom.prototype, 'save', async function save() { return this; });
  const fresh = await call(c.uploadNotes, { params: { id: String(doc._id) }, files, user: pcc });
  assert.equal(fresh.error, null);
  assert.equal(madeSave.mock.callCount(), 1, 'a Records Room entry is made for the patient');
  assert.equal(fresh.body.session.notes.length, 2);
  assert.match((await call(c.uploadNotes, { params: { id: String(doc._id) }, files: [], user: pcc })).error.message, /photo/);
});

test('a session is given to a PCC only (not a counsellor, doctor or manager)', async () => {
  const doc = aSession();
  mock.method(User, 'findById', () => chain({ _id: id(), name: 'Pragya', role: 'post_counselor', isActive: true }));
  assert.match((await call(c.assignSession, { params: { id: String(doc._id) }, body: { userId: String(id()), reason: 'leave' }, user: manager })).error.message, /PCC only/);
  assert.match((await call(c.requestReassign, { params: { id: String(doc._id) }, body: { reason: 'leave', suggestedUserId: String(id()) }, user: pcc })).error.message, /Suggest a PCC/);
});

test('calendar: only the sessions given to that PCC (a reassigned one shows on the new PCC\'s calendar, not the old one\'s)', async () => {
  let filter = null;
  mock.method(User, 'findById', () => chain({ _id: pcc._id, name: pcc.name, role: 'assistant_doctor' }));
  mock.method(CareSession, 'find', (f) => { filter = f; return chain([]); });
  mock.method(require('../models/Patient'), 'find', () => chain([]));
  const res = await call(c.calendar, { query: { month: '2026-12' }, user: pcc });
  assert.equal(res.error, null);
  assert.equal(String(filter.assignee), String(pcc._id));
  assert.equal(filter.$or, undefined, 'not the sessions they only own');
  assert.equal(res.body.days.length, 31);
});
