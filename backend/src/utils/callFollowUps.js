// Calls with the patient on In Transit's steps: the delivery schedule call (step "calls"), and also while scheduling
// the delivery ("scheduled") and on the dispatch / handover day ("handover"). A call that does not connect sets when
// to call again - a follow-up - which reminds In Transit at that time and counts the days it is late until the next
// call is logged (or the step is done). Each logged call keeps how many days after its follow-up it was made.
// A connected call can set a follow-up too ("I will tell you later"); there it is optional, on the others required.
const DAY = 86400000;
const CALL_STEPS = ['calls', 'scheduled', 'handover'];
const CALL_STEP_LABELS = { calls: 'Call for delivery schedule', scheduled: 'Schedule delivery', handover: 'Dispatch / handover' };
// Outcomes where the follow-up is optional.
const CLOSING = ['connected', 'wrong_number'];

const istDay = (value) => new Date(value).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
// Whole calendar days (India time) from `from` to `to`; 0 on the same day.
const daysLate = (from, to) => Math.max(0, Math.round((Date.parse(istDay(to)) - Date.parse(istDay(from))) / DAY));
const stepOf = (call) => call.step || 'calls';
const lastCallOf = (calls, step) => [...(calls || [])].filter((c) => stepOf(c) === step).sort((a, b) => new Date(b.at) - new Date(a.at))[0] || null;

// When a call is logged on `step`: the follow-up it answers (the last call's "call again at") and how late it is.
const lateness = (calls, step, now = new Date()) => {
  const last = lastCallOf(calls, step);
  if (!last || !last.nextCallAt) return { dueAt: null, lateDays: 0 };
  const due = new Date(last.nextCallAt);
  return { dueAt: due, lateDays: due < now ? daysLate(due, now) : 0 };
};

// The open follow-up of each step that is not done yet: { step, label, dueAt, overdue, lateDays }.
const openFollowUps = (calls, doneByStep = {}, now = new Date()) => CALL_STEPS.map((step) => {
  if (doneByStep[step]) return null;
  const last = lastCallOf(calls, step);
  if (!last || !last.nextCallAt) return null;
  const due = new Date(last.nextCallAt);
  const overdue = due <= now;
  return { step, label: CALL_STEP_LABELS[step], dueAt: due.toISOString(), overdue, lateDays: overdue ? daysLate(due, now) : 0 };
}).filter(Boolean);

// Every follow-up ever set (each call with a "call again at"), with what became of it:
//  done     - the next call on that step was made (doneAt, lateDays as kept on that call)
//  closed   - the step got done without another call
//  upcoming / due / late - still open (late: lateDays so far)
const followUpHistory = (calls, doneByStep = {}, now = new Date()) => {
  const sorted = [...(calls || [])].sort((a, b) => new Date(a.at) - new Date(b.at));
  return sorted.filter((c) => c.nextCallAt).map((call) => {
    const step = stepOf(call);
    const due = new Date(call.nextCallAt);
    const next = sorted.find((c) => stepOf(c) === step && new Date(c.at) > new Date(call.at));
    const base = { step, label: CALL_STEP_LABELS[step], dueAt: due.toISOString(), setAt: new Date(call.at).toISOString(), setByName: call.byName || '', outcome: call.outcome, notes: call.notes || '' };
    if (next) return { ...base, status: 'done', doneAt: new Date(next.at).toISOString(), doneByName: next.byName || '', doneOutcome: next.outcome, lateDays: next.lateDays ?? (new Date(next.at) > due ? daysLate(due, next.at) : 0) };
    if (doneByStep[step]) return { ...base, status: 'closed', lateDays: 0 };
    const overdue = due <= now;
    const lateDays = overdue ? daysLate(due, now) : 0;
    return { ...base, status: !overdue ? 'upcoming' : lateDays ? 'late' : 'due', lateDays };
  });
};

module.exports = { CALL_STEPS, CALL_STEP_LABELS, CLOSING, daysLate, lateness, openFollowUps, followUpHistory, stepOf };
