// Sessions made on the earlier Care Schedule plan move to the plan of 2026-11-26 (asked by the user: "purana v isi dates
// k according shift ho jaaye"). Runs on every server start; only phases on the Care Schedule that still have sessions of
// the earlier plan are touched, and a phase already moved is never touched again.
//   Follow-ups: day 20, 50, 80, 110, 140, 170 were FU-02 ... FU-07 and are now FU-01 ... FU-06 (same day, same date,
//   same call time / calls / form). The day-10 follow-up (old FU-01) is not in the plan: an open one is closed, and its
//   code becomes "FU-01·D10" so the new FU-01 can take the name. The day-180 tracker (DT-03) is done in the clinic now:
//   the same, as "DT-03·D180". Family sessions, DT-01 and DT-02 kept their days and are not touched.
//   The foundation week (FCF-01 ... FCF-07) is added for the days still ahead of the phase's first supply.
// A form saved on an earlier template keeps it (careTemplates/index.js templateForSession); an open session opens with
// the new form of its new code.
const mongoose = require('mongoose');
const C = require('./careSchedule');

const OLD_FOLLOWUP = { 10: null, 20: 'FU-01', 50: 'FU-02', 80: 'FU-03', 110: 'FU-04', 140: 'FU-05', 170: 'FU-06' };
const OLD_TRACKER = { 60: 'DT-01', 120: 'DT-02', 180: null };
const SYSTEM = 'System (new Care Schedule plan)';

// A session of the earlier plan that still has to move: an FU / DT code whose day is not that code's day in the plan.
const needsMove = (s) => /^(FU|DT)-0\d$/.test(String(s.code || '')) && C.isLegacySession(s);
// Where it goes: { code } for its new code, { retired } for a day no longer in the plan.
const targetOf = (s) => {
  const map = s.kind === 'tracker' ? OLD_TRACKER : OLD_FOLLOWUP;
  if (!(Number(s.day) in map)) return null;
  const code = map[Number(s.day)];
  return code ? { code } : { retired: `${s.code}·D${s.day}` };
};

// The moves for one phase's sessions, in an order that never needs a code still in use: the retired ones first, then
// the others by day (each takes the code the one before it just gave up). -> [{ session, code, retired }]
const movesOf = (sessions) => {
  const moving = sessions.filter(needsMove).map((session) => ({ session, ...targetOf(session) })).filter((m) => m.code || m.retired);
  return [...moving.filter((m) => m.retired), ...moving.filter((m) => m.code).sort((a, b) => Number(a.session.day) - Number(b.session.day))];
};

// The foundation sessions still ahead (dated today or later) that the phase does not have yet.
const foundationToAdd = ({ part, sessions, skip = [], today, holidays }) => {
  if (!part || Number(part.offsetDays || 0) !== 0) return [];
  const have = new Set(sessions.map((s) => s.code));
  return C.itemsForPart({ startDate: part.startDate, offsetDays: 0, days: Number(part.days || 0), skip, holidays })
    .filter((item) => item.kind === 'foundation' && !have.has(item.code) && item.targetDate >= today);
};

const replanSessions = async ({ now = new Date(), ready = () => mongoose.connection.readyState === 1, log = () => {} } = {}) => {
  const out = { phases: 0, renamed: 0, closed: 0, added: 0 };
  if (!ready()) return out;
  const CareSession = require('../models/CareSession');
  const Patient = require('../models/Patient');
  const today = C.dayOf(now);
  const holidays = await require('./careService').clinicHolidays();
  const old = await CareSession.find({ code: { $regex: /^(FU|DT)-0\d$/ } }).select('patient phase code day').lean();
  const phases = [...new Map(old.filter(needsMove).map((s) => [`${s.patient}:${s.phase}`, { patient: s.patient, phase: s.phase }])).values()];
  for (const { patient, phase } of phases) {
    const sessions = await CareSession.find({ patient, phase });
    const moves = movesOf(sessions);
    if (!moves.length) continue;
    for (const { session, code, retired } of moves) {
      const before = `${session.code} (day ${session.day})`;
      if (retired) {
        session.code = retired;
        session.title = `${session.title} (earlier plan, day ${session.day})`;
        if (C.isOpen(session)) {
          const reason = session.kind === 'tracker' ? 'The day-180 tracker is done in the clinic (new plan of 2026-11-26)' : 'No follow-up on day 10 in the new plan of 2026-11-26';
          Object.assign(session, { status: 'cancelled', cancelledAt: now, cancelReason: reason, cancelledByName: SYSTEM });
          session.closed = { reason: 'Not in the new plan', details: reason, missed: false, at: now, byName: SYSTEM, attempts: C.missedCalls(session).length };
          (session.reminders || []).forEach((r) => { if (!r.doneAt) Object.assign(r, { doneAt: now, doneByName: SYSTEM }); });
          out.closed += 1;
        }
        session.log.push({ at: now, byName: SYSTEM, text: `${before} is not in the new plan: now ${retired}${session.status === 'cancelled' && session.cancelledByName === SYSTEM ? ', closed' : ''}` });
      } else {
        const item = C.PLAN_BY_CODE[code];
        Object.assign(session, { code, seq: item.seq, title: item.title });
        session.log.push({ at: now, byName: SYSTEM, text: `New plan of 2026-11-26: ${before} is now ${code}` });
      }
      await session.save();
      out.renamed += 1;
    }
    // The foundation week for the days still ahead.
    const stage = ((await Patient.findById(patient).select('stages.number stages.carePlan').lean())?.stages || []).find((s) => s.number === phase);
    const part = (stage?.carePlan?.parts || []).find((p) => Number(p.offsetDays || 0) === 0);
    const skip = await require('./careService').foundationSkips({ patientId: patient, phase });
    const owner = sessions.find((s) => s.owner) || sessions[0];
    const docs = foundationToAdd({ part, sessions: await CareSession.find({ patient, phase }).select('code').lean(), skip, today, holidays }).map((item) => ({
      patient, patientName: owner.patientName, patientCode: owner.patientCode || '', phase,
      kind: item.kind, seq: item.seq, code: item.code, title: item.title, day: item.day, supplyKey: part.requestId, targetDate: item.targetDate,
      owner: owner.owner, ownerName: owner.ownerName, assignee: owner.owner, assigneeName: owner.ownerName,
      log: [{ at: now, byName: SYSTEM, text: `Foundation session added with the new plan: ${item.targetDate} (from the medicine start date ${part.startDate})` }],
    }));
    if (docs.length) await CareSession.insertMany(docs, { ordered: false }).catch((error) => { if (error.code !== 11000 && !error.writeErrors) throw error; });
    out.added += docs.length;
    out.phases += 1;
  }
  if (out.phases) log(`Care Schedule new plan: ${out.phases} phase(s), ${out.renamed} session(s) renamed (${out.closed} closed: day 10 / day 180), ${out.added} foundation session(s) added`);
  return out;
};

module.exports = { replanSessions, movesOf, needsMove, targetOf, foundationToAdd, OLD_FOLLOWUP, OLD_TRACKER };
