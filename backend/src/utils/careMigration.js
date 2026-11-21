// Moving old patients onto the Care Schedule with the database (the plan of each phase is utils/careConvert.js).
// Used by the "Move old patients" tab (preview / move) and, for everyone, on every server start (config/db.js), so
// a phase still on the old follow-ups is moved whatever database the server runs on. Safe to run again: a phase
// already on the Care Schedule is never touched twice and an existing session is never made twice.
const mongoose = require('mongoose');
const { planConversion, conversionUpdate } = require('./careConvert');

const OLD_FIELDS = 'patientName patientCode assignedDoctor stages.number stages.date stages.medicineTakenDate stages.medicineMonthsGiven stages.purchaseOrder '
  + 'stages.transit.medicineStartDate stages.transit.explanationDoctor stages.carePlan stages.medicineRequest.requestId stages.medicineRequest.supplyPlan stages.medicineRequest.supplyPart stages.medicineRequest.courier.status '
  + 'stages.medicineRequests.requestId stages.medicineRequests.supplyPlan stages.medicineRequests.supplyPart stages.medicineRequests.courier.status '
  + 'stages.followUps._id stages.followUps.status stages.followUps.dateTime stages.followUps.followUpType stages.familySessions._id stages.familySessions.status stages.familySessions.dateTime stages.familySessions.followUpType';

// Active patients with an old follow-up / family session still open.
const oldPatients = async (ids = null) => {
  const Patient = require('../models/Patient');
  const filter = { isActive: { $ne: false }, $or: [{ 'stages.followUps.status': { $in: ['scheduled', 'sent'] } }, { 'stages.familySessions.status': { $in: ['scheduled', 'sent'] } }] };
  if (ids) filter._id = { $in: ids };
  return Patient.find(filter).select(OLD_FIELDS).populate('assignedDoctor', 'name').lean();
};

// The preview rows, phase by phase.
const previewRows = (patients, now = new Date()) => patients.flatMap((p) => (p.stages || []).map((stage) => {
  const plan = planConversion(stage, now);
  if (!plan.ok && /No open/.test(plan.reason || '')) return null;
  return {
    patientId: String(p._id), patientName: p.patientName, patientCode: p.patientCode || '', phase: stage.number, pccName: p.assignedDoctor?.name || '',
    ok: plan.ok, over: Boolean(plan.over), reason: plan.reason || '', start: plan.anchor?.day || '', startFrom: plan.anchor?.source || '', days: plan.length?.days || 0, lengthFrom: plan.length?.source || '', end: plan.end || '',
    items: (plan.items || []).map((i) => ({ code: i.code, day: i.day, date: i.targetDate, carried: i.carry ? i.carry.at : null })), close: (plan.close || []).length, kept: plan.kept || 0,
  };
})).filter(Boolean);

// Move one phase: its new sessions first (so a run stopped half-way is finished by the next one), then the phase.
const movePhase = async ({ patient, stage, plan, user, now }) => {
  const CareSession = require('../models/CareSession');
  const Patient = require('../models/Patient');
  const ownerId = stage.transit?.explanationDoctor || patient.assignedDoctor?._id || null;
  const ownerName = String(ownerId) === String(patient.assignedDoctor?._id)
    ? patient.assignedDoctor?.name || ''
    : ownerId ? (await require('../models/User').findById(ownerId).select('name').lean())?.name || '' : '';
  const existing = new Set((await CareSession.find({ patient: patient._id, phase: stage.number }).select('code').lean()).map((s) => s.code));
  const docs = plan.items.filter((item) => !existing.has(item.code)).map((item) => ({
    patient: patient._id, patientName: patient.patientName, patientCode: patient.patientCode || '', phase: stage.number, kind: item.kind, seq: item.seq, code: item.code, title: item.title, day: item.day,
    supplyKey: 'converted', targetDate: item.targetDate, callAt: item.carry ? item.carry.at : null, status: item.carry ? 'scheduled' : 'pending',
    owner: ownerId, ownerName, assignee: ownerId, assigneeName: ownerName,
    log: [{ at: now, byName: user.name, text: `Moved from the old follow-ups: day ${item.day} = ${item.targetDate} (start ${plan.anchor.day}, ${plan.anchor.source})${item.carry ? `; call time kept from the old entry of ${item.carry.from}` : ''}` }],
  }));
  if (docs.length) await CareSession.insertMany(docs, { ordered: false }).catch((error) => { if (error.code !== 11000 && !error.writeErrors) throw error; });
  const { filter, update, options } = conversionUpdate({ phase: stage.number, plan, user, now, poNumber: stage.purchaseOrder || '' });
  const done = await Patient.updateOne({ _id: patient._id, ...filter }, update, options);
  return { made: docs.length, moved: done.modifiedCount === 1 };
};

// Move every old phase (all: true) or the chosen ones ([{ patientId, phase }]). -> { results, moved, sessions, closed }
// `ready`: whether the database is connected (replaced in tests).
const moveOldPatients = async ({ user, all = false, wanted = [], now = new Date(), ready = () => mongoose.connection.readyState === 1 }) => {
  if (!ready()) return { results: [], moved: 0, sessions: 0, closed: 0 };
  const ids = all ? null : [...new Set(wanted.filter((w) => mongoose.isValidObjectId(w?.patientId)).map((w) => String(w.patientId)))];
  if (!all && !ids.length) return { results: [], moved: 0, sessions: 0, closed: 0 };
  const results = [];
  for (const patient of await oldPatients(ids)) {
    for (const stage of patient.stages || []) {
      if (!all && !wanted.some((w) => String(w.patientId) === String(patient._id) && Number(w.phase) === stage.number)) continue;
      const plan = planConversion(stage, now);
      const base = { patientId: String(patient._id), patientName: patient.patientName, phase: stage.number };
      if (!plan.ok) { if (!/No open/.test(plan.reason || '')) results.push({ ...base, ok: false, reason: plan.reason }); continue; }
      try {
        const { made, moved } = await movePhase({ patient, stage, plan, user, now });
        results.push({ ...base, ok: moved, made, closed: moved ? plan.close.length : 0, over: Boolean(plan.over), reason: moved ? '' : 'Already moved' });
      } catch (error) {
        results.push({ ...base, ok: false, reason: error.message });
      }
    }
  }
  const ok = results.filter((r) => r.ok);
  return { results, moved: ok.length, sessions: ok.reduce((n, r) => n + (r.made || 0), 0), closed: ok.reduce((n, r) => n + (r.closed || 0), 0) };
};

module.exports = { oldPatients, previewRows, movePhase, moveOldPatients, OLD_FIELDS };
