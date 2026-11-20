// Care Schedule (from 2026-11-20; replaces Treatment Delivery): the medical follow-ups, family sessions and
// development trackers of a phase, laid out from the medicine start date the PCC fills after the explanation.
//   Medical follow-ups   FU-01 ... FU-07  day 10, 20, 50, 80, 110, 140, 170
//   Family sessions      FS-01 ... FS-03  day 15, 105, 165
//   Development trackers DT-01 ... DT-03  day 60, 120, 180
// Only the days the supplied medicine covers are scheduled: 1 month (30 days) -> FU-01, FS-01, FU-02; 3 months ->
// up to FU-04 and DT-01; 6 months -> all 13. A later supply of the phase (its own PO) goes on from its own start date
// with the days after the earlier supplies. Nothing falls on a Wednesday (clinic closed): such a day moves to Thursday.
// Pure rules - no database, no clock of its own - so every rule is tested (careSchedule.test.js).
const { supplyOption } = require('../constants/supplyPlans');

const PHASE_DAYS = 180;
const RESCHEDULE_LIMIT = 2;
const OFF_WEEKDAYS = [3]; // Wednesday
const KIND_LABEL = { followup: 'Medical Follow-up', family: 'Family Session', tracker: 'Development Tracker' };
const PREFIX = { followup: 'FU', family: 'FS', tracker: 'DT' };
const PLAN = [
  ['followup', 1, 10], ['family', 1, 15], ['followup', 2, 20], ['followup', 3, 50], ['tracker', 1, 60], ['followup', 4, 80],
  ['family', 2, 105], ['followup', 5, 110], ['tracker', 2, 120], ['followup', 6, 140], ['family', 3, 165], ['followup', 7, 170], ['tracker', 3, 180],
].map(([kind, seq, day]) => ({ kind, seq, day, code: `${PREFIX[kind]}-${String(seq).padStart(2, '0')}`, title: `${KIND_LABEL[kind]} ${String(seq).padStart(2, '0')}` }));
const PLAN_BY_CODE = Object.fromEntries(PLAN.map((item) => [item.code, item]));

const fail = (message, statusCode = 400) => { throw Object.assign(new Error(message), { statusCode }); };

// ---- Days (clinic = India time) ---------------------------------------------------------------------------------
const DAY = 86400000;
const dayOf = (value) => new Date(new Date(value).getTime() + 19800000).toISOString().slice(0, 10);
const addDays = (day, n) => new Date(Date.parse(`${day}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);
const diffDays = (a, b) => Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / DAY);
const weekdayOf = (day) => new Date(`${day}T00:00:00Z`).getUTCDay();
const validDay = (day) => /^\d{4}-\d{2}-\d{2}$/.test(String(day || '')) && !Number.isNaN(Date.parse(`${day}T00:00:00Z`));
const isOffDay = (day) => OFF_WEEKDAYS.includes(weekdayOf(day));
// A Wednesday moves to Thursday.
const workingDay = (day) => { let d = day; while (isOffDay(d)) d = addDays(d, 1); return d; };
const atTime = (day, hhmm = '11:00') => new Date(`${day}T${hhmm}:00+05:30`);

// ---- Supplies ----------------------------------------------------------------------------------------------------
// The days of medicine one supply (its request / purchase order) gives: 6M 180, 1+5 first 30 / rest 150, custom its own.
const supplyDays = (supplyPlan, supplyPart) => supplyOption(supplyPlan, supplyPart || 'full')?.days || 0;
const coveredDays = (parts = []) => Math.max(0, ...parts.map((p) => Number(p.offsetDays || 0) + Number(p.days || 0)));
const supplyDone = (plan) => Boolean(plan?.parts?.length) && coveredDays(plan.parts) >= Number(plan.phaseDays || PHASE_DAYS);

// The sessions one supply schedules: the plan days after `offsetDays`, up to the days it covers (never past day 180),
// each dated from the supply's own start date.
const itemsForPart = ({ startDate, offsetDays = 0, days }) => {
  if (!validDay(startDate) || !(days > 0)) return [];
  const end = Math.min(PHASE_DAYS, offsetDays + days);
  return PLAN.filter((item) => item.day > offsetDays && item.day <= end)
    .map((item) => ({ ...item, targetDate: workingDay(addDays(startDate, item.day - offsetDays)) }));
};

// ---- Call time ---------------------------------------------------------------------------------------------------
// Why this call time cannot be used ('' when it can).
const callTimeProblem = (value, now = new Date()) => {
  const at = new Date(value);
  if (!value || Number.isNaN(at.getTime())) return 'Choose the date and time of the call';
  if (isOffDay(dayOf(at))) return 'The clinic is closed on Wednesday. Choose another day.';
  if (at.getTime() < now.getTime() - 15 * 60000) return 'The call time cannot be in the past';
  if (at.getTime() > now.getTime() + 200 * DAY) return 'The call time is too far ahead';
  return '';
};

// ---- State ------------------------------------------------------------------------------------------------------
const OPEN = ['pending', 'scheduled'];
const isOpen = (session) => OPEN.includes(session?.status);
// Where a session stands for the lists (the first that applies):
// done / missed / cancelled; alert (both reschedules used: complete, mark missed or cancel); overdue (call time or day
// passed); today; needs_time (no call time yet); upcoming.
const stateOf = (session, now = new Date()) => {
  if (!session) return '';
  if (session.status === 'completed') return 'done';
  if (session.status === 'missed') return 'missed';
  if (session.status === 'cancelled') return 'cancelled';
  if ((session.reschedules || []).length >= RESCHEDULE_LIMIT) return 'alert';
  const today = dayOf(now);
  const day = session.callAt ? dayOf(session.callAt) : session.targetDate;
  if (session.callAt ? new Date(session.callAt) < now : day < today) return 'overdue';
  if (day === today) return 'today';
  if (!session.callAt) return 'needs_time';
  return 'upcoming';
};
const STATE_LABEL = {
  done: 'Done', missed: 'Missed by parents', cancelled: 'Cancelled', alert: 'Action needed', overdue: 'Overdue', today: 'Today', needs_time: 'Set call time', upcoming: 'Scheduled',
};
const dueDayOf = (session) => (session?.callAt ? dayOf(session.callAt) : session?.targetDate || '');

module.exports = {
  PHASE_DAYS, RESCHEDULE_LIMIT, OFF_WEEKDAYS, KIND_LABEL, PLAN, PLAN_BY_CODE, OPEN, STATE_LABEL,
  fail, dayOf, addDays, diffDays, weekdayOf, validDay, isOffDay, workingDay, atTime,
  supplyDays, coveredDays, supplyDone, itemsForPart, callTimeProblem, isOpen, stateOf, dueDayOf,
};
