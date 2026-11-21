// Care Schedule with the database: making the schedule when the PCC fills a medicine start date, moving it when the
// date is corrected, and the PCC leave look-up. The rules are in careSchedule.js.
const mongoose = require('mongoose');
const C = require('./careSchedule');
const { requestKey, startRequestOf, MEDICINE_ACTIVE } = require('./transitFlow');

const dbUp = () => mongoose.connection.readyState === 1;
const plain = (value) => (value?.toObject ? value.toObject() : value || {});

// The days of medicine one supply gives: its medicine request, else its purchase order, else what the PCC typed
// (`asked`: { months, days }) when neither has it.
const supplyLengthOf = async (stage, request, asked = {}) => {
  let days = C.supplyDays(request?.supplyPlan, request?.supplyPart);
  const poNumber = request?.poNumber || stage.purchaseOrder || '';
  if (!days && poNumber && dbUp()) {
    const po = await require('../models/PurchaseOrder').findOne({ poNumber }).select('supplyPlan supplyPart').lean();
    if (po) days = C.supplyDays(po.supplyPlan, po.supplyPart);
  }
  if (!days) {
    const typed = Math.round(Number(asked.months || 0)) * 30 + Math.round(Number(asked.days || 0));
    if (typed > 0 && typed <= 360) days = typed;
  }
  return { days, poNumber };
};

// The PCC who owns the patient's sessions: the explanation PCC of the phase, else the patient's PCC.
const ownerOf = async (patient, stage) => {
  const id = stage.transit?.explanationDoctor || patient.assignedDoctor?._id || patient.assignedDoctor || null;
  if (!id) return { id: null, name: '' };
  const name = patient.assignedDoctor?.name && String(patient.assignedDoctor._id) === String(id)
    ? patient.assignedDoctor.name
    : dbUp() ? (await require('../models/User').findById(id).select('name').lean())?.name || '' : '';
  return { id, name };
};

// Insert the sessions one supply schedules (an existing code of the phase is never made twice).
const insertSessions = async ({ patient, stage, part, owner, user, now }) => {
  const CareSession = require('../models/CareSession');
  const items = C.itemsForPart(part);
  if (!items.length) return 0;
  const existing = await CareSession.find({ patient: patient._id, phase: stage.number, code: { $in: items.map((i) => i.code) } }).select('code').lean();
  const have = new Set(existing.map((s) => s.code));
  const docs = items.filter((item) => !have.has(item.code)).map((item) => ({
    patient: patient._id, patientName: patient.patientName, patientCode: patient.patientCode || '', phase: stage.number,
    kind: item.kind, seq: item.seq, code: item.code, title: item.title, day: item.day, supplyKey: part.requestId, targetDate: item.targetDate,
    owner: owner.id, ownerName: owner.name, assignee: owner.id, assigneeName: owner.name,
    log: [{ at: now, byName: user?.name || '', text: `Scheduled for ${item.targetDate} (day ${item.day}) from the medicine start date ${part.startDate}` }],
  }));
  if (docs.length) await CareSession.insertMany(docs, { ordered: false }).catch((error) => { if (error.code !== 11000 && !error.writeErrors) throw error; });
  return docs.length;
};

// The call time's own reminder (kind "call"): made when the call time is set and moved with it. It starts 10 minutes
// before the call and pops up for the person the session is given to until a call is recorded, it is marked done or
// the session is closed. One per session.
const syncCallReminder = (session, byName = '') => {
  if (!session?.callAt) return null;
  const fields = { at: new Date(new Date(session.callAt).getTime() - C.CALL_LEAD_MS), note: `Call the parent — call time ${C.istText(session.callAt)}`, doneAt: null, doneByName: '' };
  const own = (session.reminders || []).find((r) => r.kind === 'call');
  if (own) { Object.assign(own, fields); return own; }
  session.reminders.push({ ...fields, kind: 'call', byName: byName || 'Automatic', createdAt: new Date() });
  return session.reminders[session.reminders.length - 1];
};

// A corrected start date moves the open sessions of that supply (a call time already set moves with it, unless it was
// rescheduled with the parent).
const moveSessions = async ({ patient, stage, part, before, user, now }) => {
  const CareSession = require('../models/CareSession');
  const shift = C.diffDays(part.startDate, before);
  if (!shift) return 0;
  const sessions = await CareSession.find({ patient: patient._id, phase: stage.number, supplyKey: part.requestId, status: { $in: C.OPEN } });
  const target = new Map(C.itemsForPart(part).map((item) => [item.code, item.targetDate]));
  for (const session of sessions) {
    const day = target.get(session.code);
    if (!day) continue;
    session.targetDate = day;
    if (session.callAt && !session.reschedules.length) {
      const moved = C.workingDay(C.addDays(C.dayOf(session.callAt), shift));
      const time = new Date(session.callAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Kolkata' });
      session.callAt = C.atTime(moved, time);
      syncCallReminder(session, user?.name);
    }
    session.log.push({ at: now, byName: user?.name || '', text: `Moved to ${day}: medicine start date changed ${before} -> ${part.startDate}` });
    await session.save();
  }
  return sessions.length;
};

// The first supply of a phase got its medicine start date (Medicine Explanations). A phase whose start date is filled
// for the first time from now on gets its Care Schedule; a corrected date moves it. A phase that started before the
// Care Schedule (its date was saved earlier, no plan) keeps its old follow-ups and gets nothing here.
// Returns { status, notice } for the screen.
const startCarePlan = async ({ patient, stage, user, now = new Date(), firstSave, asked = {} }) => {
  const day = C.dayOf(stage.transit.medicineStartDate);
  const request = startRequestOf(stage);
  const plan = stage.carePlan;
  if (plan?.parts?.length) {
    const part = plan.parts[0];
    if (part.startDate === day) return { status: 'unchanged', notice: '' };
    const before = part.startDate;
    part.startDate = day;
    stage.markModified('carePlan');
    const moved = await moveSessions({ patient, stage, part: plain(part), before, user, now });
    return { status: 'moved', notice: `${moved} follow-up${moved === 1 ? '' : 's'} / session${moved === 1 ? '' : 's'} moved with the new start date` };
  }
  if (!firstSave) return { status: 'old_phase', notice: '' };
  const { days, poNumber } = await supplyLengthOf(stage, request, asked);
  if (!days) return { status: 'no_length', notice: 'The months of medicine are not on the purchase order, so the follow-up schedule could not be made. Ask the admin to check the PO.' };
  const part = { requestId: requestKey(request) || 'legacy', poNumber, days, startDate: day, offsetDays: 0, addedAt: now, addedByName: user?.name || '' };
  stage.carePlan = { startedAt: now, startedByName: user?.name || '', phaseDays: C.PHASE_DAYS, parts: [part] };
  const owner = await ownerOf(patient, stage);
  const made = await insertSessions({ patient, stage, part, owner, user, now });
  return { status: 'created', notice: `Care Schedule made: ${made} follow-up${made === 1 ? '' : 's'} / session${made === 1 ? '' : 's'} / tracker${made === 1 ? '' : 's'} from ${day}` };
};

// A later supply of a phase on the Care Schedule got its start date (new or corrected): the schedule goes on with the
// days after the earlier supplies, dated from this supply's start.
const continueCarePlan = async ({ patient, stage, request, day, user, now = new Date(), asked = {} }) => {
  const plan = stage.carePlan;
  if (!plan?.parts?.length) return { status: 'no_plan', notice: '' };
  const key = requestKey(request);
  const index = plan.parts.findIndex((p) => p.requestId === key);
  if (index >= 0) {
    const part = plan.parts[index];
    if (part.startDate === day) return { status: 'unchanged', notice: '' };
    const before = part.startDate;
    part.startDate = day;
    stage.markModified('carePlan');
    const moved = await moveSessions({ patient, stage, part: plain(part), before, user, now });
    return { status: 'moved', notice: `${moved} follow-up${moved === 1 ? '' : 's'} / session${moved === 1 ? '' : 's'} moved with the new start date` };
  }
  const { days, poNumber } = await supplyLengthOf(stage, request, asked);
  if (!days) C.fail('How many months / days of medicine is this supply? It is not on its purchase order.');
  const part = { requestId: key, poNumber, days, startDate: day, offsetDays: C.coveredDays(plan.parts), addedAt: now, addedByName: user?.name || '' };
  plan.parts.push(part);
  stage.markModified('carePlan');
  const owner = await ownerOf(patient, stage);
  const made = await insertSessions({ patient, stage, part, owner, user, now });
  return { status: 'continued', notice: made ? `${made} more follow-up${made === 1 ? '' : 's'} / session${made === 1 ? '' : 's'} scheduled from ${day}` : 'No follow-up falls in the days of this supply' };
};

// A later supply keeps the day the patient starts it on its medicine request (the first supply's is stage.transit).
const stampStart = (stage, key, day, user, now, note = null) => [...(stage.medicineRequests || []), stage.medicineRequest]
  .filter((request) => request && MEDICINE_ACTIVE.includes(request.status) && requestKey(request) === key)
  .forEach((request) => Object.assign(request, {
    medicineStartDate: new Date(`${day}T00:00:00+05:30`), medicineStartSetAt: now, medicineStartSetByName: user?.name || '', ...(note === null ? {} : { medicineStartNote: note }),
  }));

// ---- PCC leave ------------------------------------------------------------------------------------------------------
// Leave days of these users between two days: Map(userId -> [{ id, from, to, status, source, reason }]) - the leave
// marked on the PCC's calendar (by the PCC or the Manager), and HR leave requests (approved or still pending) of the
// HR employee linked to the user.
const leavesOf = async (userIds, from, to) => {
  const ids = [...new Set((userIds || []).filter(Boolean).map(String))];
  const out = new Map();
  if (!ids.length || !dbUp()) return out;
  const add = (user, leave) => { if (!out.has(user)) out.set(user, []); out.get(user).push(leave); };
  const marked = await require('../models/StaffLeave').find({ user: { $in: ids }, removedAt: null, from: { $lte: to }, to: { $gte: from } }).select('user from to reason createdByName').lean();
  marked.forEach((l) => add(String(l.user), { id: String(l._id), from: l.from, to: l.to, status: 'approved', source: 'calendar', reason: l.reason || '', by: l.createdByName || '' }));
  const employees = await require('../models/HrEmployee').find({ user: { $in: ids } }).select('_id user').lean();
  if (!employees.length) return out;
  const userOf = new Map(employees.map((e) => [String(e._id), String(e.user)]));
  const leaves = await require('../models/HrLeaveRequest').find({
    employee: { $in: employees.map((e) => e._id) }, status: { $in: ['approved', 'pending'] }, startDate: { $lte: to }, endDate: { $gte: from },
  }).select('employee startDate endDate status leaveType').lean();
  leaves.forEach((leave) => add(userOf.get(String(leave.employee)), { id: String(leave._id), from: leave.startDate, to: leave.endDate, status: leave.status, source: 'hr', reason: leave.leaveType || '' }));
  return out;
};
const leaveOn = (leaves, userId, day) => (leaves.get(String(userId || '')) || []).find((l) => l.from <= day && l.to >= day) || null;

module.exports = { supplyLengthOf, ownerOf, insertSessions, moveSessions, startCarePlan, continueCarePlan, stampStart, leavesOf, leaveOn, syncCallReminder };
