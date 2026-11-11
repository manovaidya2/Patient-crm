const { test } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const AdviceRequest = require('../models/AdviceRequest');
const Patient = require('../models/Patient');
const controller = require('./adviceController');

// A patient query from raising to solving: the PCC raises it, the doctor answers, the PCC sends it to the patient,
// follows up and solves it once the patient is satisfied. Every step is in the timeline with its time.
const pcc = { _id: new mongoose.Types.ObjectId(), name: 'Aditi', role: 'assistant_doctor' };
const otherPcc = { _id: new mongoose.Types.ObjectId(), name: 'Neha', role: 'assistant_doctor' };
const doctor = { _id: new mongoose.Types.ObjectId(), name: 'Dr Sharma', role: 'doctor' };

const setup = () => {
  const patient = new Patient({ patientName: 'Aarav', patientCode: 'A-1', guardianName: 'P', category: 'autism_adhd', number: '1', age: '7', approvalStatus: 'approved', assignedDoctor: pcc._id });
  patient.stages[0].number = 1;
  patient.save = async () => patient;
  let entry = null;
  const emitted = [];
  const io = { to: (room) => ({ emit: (event, payload) => emitted.push({ room, event, payload }) }) };
  const saved = [[AdviceRequest, 'findById', AdviceRequest.findById], [AdviceRequest, 'create', AdviceRequest.create], [Patient, 'findById', Patient.findById]];
  AdviceRequest.create = async (d) => { entry = new AdviceRequest(d); entry.save = async () => entry; entry.populate = async () => entry; return entry; };
  AdviceRequest.findById = async () => entry;
  Patient.findById = async () => patient;
  const run = async (handler, user, body = {}, params = { id: 'x' }) => {
    let out = null; let status = 200; let failure = null;
    await handler({ params, body, user, query: {}, app: { get: () => io } }, { status(c) { status = c; return this; }, json(b) { out = b; } }, (e) => { failure = e; });
    if (failure) throw failure;
    return { status, ...out };
  };
  return { patient, emitted, run, entry: () => entry, undo: () => saved.forEach(([t, n, old]) => { t[n] = old; }) };
};

test('a patient query goes raised -> answered -> sent -> follow-up -> solved, every step timestamped', async () => {
  const s = setup();
  try {
    const raised = await s.run(controller.createAdviceRequest, pcc, { query: 'Child not sleeping after the night dose', stage: 1 }, { patientId: 'p' });
    assert.equal(raised.status, 201);
    assert.equal(raised.advice.progress, 'with_doctor');
    assert.ok(s.emitted.some((e) => e.room === 'advice:doctors' && e.event === 'advice:changed'), 'the doctor list refreshes at once');
    // Nothing to send or follow up before the doctor answers; the PCC can ring the doctor.
    await assert.rejects(s.run(controller.markSentToPatient, pcc, { via: 'whatsapp' }), /not answered yet/);
    await assert.rejects(s.run(controller.ringDoctorAlarm, otherPcc, {}), /another PCC/);
    const rung = await s.run(controller.ringDoctorAlarm, pcc, { note: 'Parent is calling again' });
    assert.equal(rung.advice.alarms.length, 1);
    assert.ok(s.emitted.some((e) => e.room === 'advice:doctors' && e.event === 'advice:alarm'), "the doctor's alarm rings");
    await assert.rejects(s.run(controller.ringDoctorAlarm, pcc, {}), /less than a minute/);
    // The doctor's alarm list.
    const findSaved = AdviceRequest.find;
    AdviceRequest.find = () => ({ populate: () => ({ sort: () => ({ limit: () => ({ lean: async () => [{ ...s.entry().toObject(), patient: { _id: s.patient._id, patientName: 'Aarav', patientCode: 'A-1' } }] }) }) }) });
    try {
      const alarms = await s.run(controller.doctorAdviceAlarms, doctor);
      assert.deepEqual(alarms.alarms.map((a) => [a.patientName, a.rings, a.lastAlarmBy]), [['Aarav', 1, 'Aditi']]);
    } finally { AdviceRequest.find = findSaved; }

    const answered = await s.run(controller.respondToAdviceRequest, doctor, { advice: 'Give the night dose at 9 pm' });
    assert.equal(answered.advice.progress, 'to_send');
    assert.ok(s.emitted.some((e) => e.room === `enquiry:user:${pcc._id}` && e.event === 'advice:changed'), 'the PCC sees the answer at once');
    await assert.rejects(s.run(controller.ringDoctorAlarm, pcc, {}), /already answered/);
    await assert.rejects(s.run(controller.addQueryFollowUp, pcc, { outcome: 'satisfied' }), /Send the doctor's answer/);
    await assert.rejects(s.run(controller.markSentToPatient, pcc, { via: 'pigeon' }), /how the answer was sent/);

    const sent = await s.run(controller.markSentToPatient, pcc, { via: 'whatsapp', note: 'Sent the voice note too' });
    assert.equal(sent.advice.progress, 'follow_up');
    assert.equal(sent.advice.sentViaLabel, 'WhatsApp');
    assert.ok(new Date(sent.advice.nextFollowUpAt) > new Date(Date.now() + 23 * 3600 * 1000), 'the follow-up is due a day later by default');
    await assert.rejects(s.run(controller.resolveQuery, pcc, {}), /Take the follow-up first/);
    await assert.rejects(s.run(controller.addQueryFollowUp, pcc, { outcome: 'not_reachable' }), /when to call/);
    const later = new Date(Date.now() + 3 * 3600 * 1000).toISOString();
    let v = await s.run(controller.addQueryFollowUp, pcc, { outcome: 'not_reachable', nextAt: later });
    assert.equal(v.advice.nextFollowUpAt.toISOString(), later);
    assert.equal(v.advice.resolvedAt, null);
    v = await s.run(controller.addQueryFollowUp, pcc, { outcome: 'satisfied', note: 'Sleeping well now', solve: true, solveNote: 'Closed' });
    assert.equal(v.advice.progress, 'solved');
    assert.equal(v.advice.nextFollowUpAt, null);
    await assert.rejects(s.run(controller.addQueryFollowUp, pcc, { outcome: 'satisfied' }), /already solved/);

    const steps = v.advice.timeline.map((t) => t.action);
    assert.deepEqual(steps, ['Query raised', "Rang the doctor's alarm", 'Doctor answered', 'Sent to the patient', 'Follow-up', 'Follow-up', 'Query solved']);
    assert.ok(v.advice.timeline.every((t) => t.at instanceof Date && t.byName), 'each step has its time and who did it');
    assert.ok(s.patient.activityLog.some((a) => /Patient query solved after follow-up/.test(a.action)), "the patient's activity log has it");
  } finally { s.undo(); }
});

test('not satisfied: the PCC asks the doctor again; the earlier answer stays in the rounds', async () => {
  const s = setup();
  try {
    await s.run(controller.createAdviceRequest, pcc, { query: 'Rash on the arm', stage: 1 }, { patientId: 'p' });
    await s.run(controller.respondToAdviceRequest, doctor, { advice: 'Apply coconut oil' });
    await s.run(controller.markSentToPatient, pcc, { via: 'call' });
    await assert.rejects(s.run(controller.addQueryFollowUp, pcc, { outcome: 'not_satisfied' }), /not satisfied with/);
    await s.run(controller.addQueryFollowUp, pcc, { outcome: 'not_satisfied', note: 'Rash is spreading' });
    await assert.rejects(s.run(controller.resolveQuery, pcc, {}), /satisfied/);
    const again = await s.run(controller.askDoctorAgain, pcc, { query: 'Rash spreading after oil - what next?', isUrgent: true });
    assert.equal(again.advice.progress, 'with_doctor');
    assert.equal(again.advice.isUrgent, true);
    assert.equal(again.advice.advice, '');
    assert.deepEqual(again.advice.rounds.map((r) => [r.query, r.advice, r.sentViaLabel, r.followUps.length]), [['Rash on the arm', 'Apply coconut oil', 'On call', 1]]);
    assert.equal(again.advice.timeline.at(-1).action, 'Asked the doctor again (emergency)');
  } finally { s.undo(); }
});
