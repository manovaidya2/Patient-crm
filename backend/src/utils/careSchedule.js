// Care Schedule (from 2026-11-20; replaces Treatment Delivery): the foundation sessions, medical follow-ups, family
// sessions and development trackers of a phase, laid out from the medicine start date the PCC fills after the
// explanation. The plan of 2026-11-26 (the clinic's new templates):
//   Foundation sessions  FCF-01 ... FCF-07  day 1-7: one a day on consecutive working days from the start date (day 1 =
//                        the start date); a session that does not apply (FCF-04 with no nasya / oil / abhyang, FCF-05
//                        closed as not prescribed) gives its day to the next one
//   Family sessions      FS-01 ... FS-03  day 15, 105, 165
//   Medical follow-ups   FU-01 ... FU-06  day 20, 50, 80, 110, 140, 170
//   Development trackers DT-01, DT-02    day 60, 120 (the day-180 tracker and the final review are in the clinic)
// Sessions made on the earlier plan (FU-01 on day 10 ... FU-07, DT-03) are kept as they are (isLegacySession).
// Only the days the supplied medicine covers are scheduled: 1 month (30 days) -> FCF-01 ... FCF-07, FS-01, FU-01;
// 6 months -> all 18. A later supply of the phase (its own PO) goes on from its own start date with the days after the
// earlier supplies. Nothing falls on a Wednesday (clinic closed): such a day moves to Thursday.
// Pure rules - no database, no clock of its own - so every rule is tested (careSchedule.test.js).
const { supplyOption } = require('../constants/supplyPlans');

const PHASE_DAYS = 180;
const RESCHEDULE_LIMIT = 2;
const OFF_WEEKDAYS = [3]; // Wednesday
const KIND_LABEL = { foundation: 'Foundation Session', followup: 'Medical Follow-up', family: 'Family Session', tracker: 'Development Tracker' };
const PREFIX = { foundation: 'FCF', followup: 'FU', family: 'FS', tracker: 'DT' };
const KINDS = Object.keys(KIND_LABEL);
const FOUNDATION_NAMES = ['Welcome & Care Journey Orientation', 'Customised Medicine', 'Nutrition & Lifestyle', 'Panchakarma Home Care', 'Sensory & Verbal Imitation Therapy', 'Home Activity Training', 'Parent Guidance & Daily Routine'];
const PLAN = [
  ...FOUNDATION_NAMES.map((name, i) => ['foundation', i + 1, i + 1]),
  ['family', 1, 15], ['followup', 1, 20], ['followup', 2, 50], ['tracker', 1, 60], ['followup', 3, 80],
  ['family', 2, 105], ['followup', 4, 110], ['tracker', 2, 120], ['followup', 5, 140], ['family', 3, 165], ['followup', 6, 170],
].map(([kind, seq, day]) => ({
  kind, seq, day, code: `${PREFIX[kind]}-${String(seq).padStart(2, '0')}`,
  title: kind === 'foundation' ? `Foundation ${String(seq).padStart(2, '0')} · ${FOUNDATION_NAMES[seq - 1]}` : `${KIND_LABEL[kind]} ${String(seq).padStart(2, '0')}`,
}));
const PLAN_BY_CODE = Object.fromEntries(PLAN.map((item) => [item.code, item]));
const FOUNDATION_CODES = PLAN.filter((item) => item.kind === 'foundation').map((item) => item.code);
// A session made on the earlier plan (FU-01 day 10 ... FU-07 day 170, DT-03 day 180): its code is not in the plan or
// has another day there. It keeps its day and its earlier template.
const isLegacySession = (session) => { const item = PLAN_BY_CODE[session?.code]; return !item || Number(item.day) !== Number(session?.day); };
// The foundation session closed because it does not apply to the child (the Close reason in careController).
const NOT_APPLICABLE = 'Not applicable — not prescribed';
const notApplicable = (session) => session?.status === 'cancelled' && session?.closed?.reason === NOT_APPLICABLE;

const fail = (message, statusCode = 400) => { throw Object.assign(new Error(message), { statusCode }); };

// ---- Days (clinic = India time) ---------------------------------------------------------------------------------
const DAY = 86400000;
const dayOf = (value) => new Date(new Date(value).getTime() + 19800000).toISOString().slice(0, 10);
const addDays = (day, n) => new Date(Date.parse(`${day}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);
const diffDays = (a, b) => Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / DAY);
const weekdayOf = (day) => new Date(`${day}T00:00:00Z`).getUTCDay();
const validDay = (day) => /^\d{4}-\d{2}-\d{2}$/.test(String(day || '')) && !Number.isNaN(Date.parse(`${day}T00:00:00Z`));
// The clinic is closed on Wednesdays and on the HR holidays (`holidays`: a Set of YYYY-MM-DD, careService.clinicHolidays).
const isOffDay = (day, holidays) => OFF_WEEKDAYS.includes(weekdayOf(day)) || Boolean(holidays?.has?.(day));
// A closed day moves to the next open day (a Wednesday to Thursday, a holiday to the day after).
const workingDay = (day, holidays) => { let d = day; for (let i = 0; i < 60 && isOffDay(d, holidays); i += 1) d = addDays(d, 1); return d; };
const atTime = (day, hhmm = '11:00') => new Date(`${day}T${hhmm}:00+05:30`);

// ---- Supplies ----------------------------------------------------------------------------------------------------
// The days of medicine one supply (its request / purchase order) gives: 6M 180, 1+5 first 30 / rest 150, custom its own.
const supplyDays = (supplyPlan, supplyPart) => supplyOption(supplyPlan, supplyPart || 'full')?.days || 0;
const coveredDays = (parts = []) => Math.max(0, ...parts.map((p) => Number(p.offsetDays || 0) + Number(p.days || 0)));
const supplyDone = (plan) => Boolean(plan?.parts?.length) && coveredDays(plan.parts) >= Number(plan.phaseDays || PHASE_DAYS);

// The sessions one supply schedules: the plan days after `offsetDays`, up to the days it covers (never past day 180),
// each dated from the supply's own start date. The foundation sessions (first supply only) take consecutive working
// days from the start date itself; `skip`: foundation codes that do not apply (their day goes to the next one);
// `holidays`: the clinic's holidays (closed like a Wednesday).
const itemsForPart = ({ startDate, offsetDays = 0, days, skip = [], holidays }) => {
  if (!validDay(startDate) || !(days > 0)) return [];
  const end = Math.min(PHASE_DAYS, offsetDays + days);
  let last = '';
  return PLAN.filter((item) => item.day > offsetDays && item.day <= end && !(item.kind === 'foundation' && skip.includes(item.code)))
    .map((item) => {
      if (item.kind !== 'foundation') return { ...item, targetDate: workingDay(addDays(startDate, item.day - offsetDays), holidays) };
      last = last ? workingDay(addDays(last, 1), holidays) : workingDay(startDate, holidays);
      return { ...item, targetDate: last };
    });
};

// ---- Call time ---------------------------------------------------------------------------------------------------
// Why this call time cannot be used ('' when it can).
const callTimeProblem = (value, now = new Date(), holidays) => {
  const at = new Date(value);
  if (!value || Number.isNaN(at.getTime())) return 'Choose the date and time of the call';
  if (isOffDay(dayOf(at))) return 'The clinic is closed on Wednesday. Choose another day.';
  if (isOffDay(dayOf(at), holidays)) return 'The clinic is closed that day (holiday). Choose another day.';
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
  // A development tracker has no call and no form: it is sent to the parents, then their filled tracker's link is
  // pasted (that completes it). Due by its day until it is sent; then it waits for the filled tracker.
  if (session.kind === 'tracker') {
    if (session.tracker?.sentAt) return 'tracker_sent';
    const due = dueDayOf(session); const today = dayOf(now);
    return due < today ? 'overdue' : due === today ? 'today' : 'upcoming';
  }
  if ((session.reschedules || []).length >= RESCHEDULE_LIMIT) return 'alert';
  const today = dayOf(now);
  const day = session.callAt ? dayOf(session.callAt) : session.targetDate;
  if (session.callAt ? new Date(session.callAt) < now : day < today) return 'overdue';
  if (day === today) return 'today';
  if (!session.callAt) return 'needs_time';
  return 'upcoming';
};
const STATE_LABEL = {
  done: 'Done', missed: 'Closed · Missed by patient', cancelled: 'Closed', alert: 'Action needed', overdue: 'Overdue', today: 'Today', needs_time: 'Set call time', upcoming: 'Scheduled', tracker_sent: 'Tracker sent · waiting',
};
// The call time's own reminder starts this long before the call (utils/careService.syncCallReminder).
const CALL_LEAD_MS = 10 * 60000;
const istText = (date) => new Date(date).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });
// The calls of a session that did not connect (the same list also keeps the calls that connected).
const missedCalls = (session) => (session?.attempts || []).filter((a) => a.outcome !== 'connected');
const dueDayOf = (session) => (session?.callAt ? dayOf(session.callAt) : session?.targetDate || '');

module.exports = {
  PHASE_DAYS, RESCHEDULE_LIMIT, OFF_WEEKDAYS, KIND_LABEL, KINDS, PLAN, PLAN_BY_CODE, FOUNDATION_CODES, OPEN, STATE_LABEL, NOT_APPLICABLE,
  isLegacySession, notApplicable,
  fail, dayOf, addDays, diffDays, weekdayOf, validDay, isOffDay, workingDay, atTime,
  supplyDays, coveredDays, supplyDone, itemsForPart, callTimeProblem, isOpen, stateOf, dueDayOf, missedCalls, CALL_LEAD_MS, istText,
};
