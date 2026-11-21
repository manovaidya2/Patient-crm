// The numbers of the Patient 360° page and the PCC report. Pure: the controller (insightsController.js) loads the
// records and these work them out, so every rule is tested (insights.test.js).
const C = require('./careSchedule');
const { customDays, SUPPLY_PLANS } = require('../constants/supplyPlans');
const { CATEGORY_LABELS } = require('../constants/patientCategories');

const plain = (value) => (value?.toObject ? value.toObject() : value || {});
const time = (value) => (value ? new Date(value).getTime() || 0 : 0);
const PROGRAMME_WORD = { autism_adhd: 'autism', mental_health: 'mental wellness', other: 'programme' };
const planDaysOf = (plan) => customDays(plan) || (SUPPLY_PLANS[plan] ? 180 : 0);

// ---- Patient 360° -------------------------------------------------------------------------------------------------
const requestsOf = (stage) => {
  const seen = new Set();
  return [...(stage.medicineRequests || []), stage.medicineRequest].filter((r) => {
    if (!r || !r.status || r.status === 'cancelled' || seen.has(r.requestId || 'legacy')) return false;
    seen.add(r.requestId || 'legacy');
    return true;
  }).sort((a, b) => time(a.requestedAt) - time(b.requestedAt));
};
const REQUEST_LABEL = { requested: 'Requested', in_process: 'Preparing', made: 'Ready', sent_to_courier: 'Released' };
// Where the phase's medicine stands (its newest request): Requested -> Preparing -> Ready -> Released -> Dispatched ->
// Delivered -> Started (the PCC filled its start date).
const medicineOf = (stage) => {
  const requests = requestsOf(stage);
  const t = plain(stage.transit);
  const last = requests[requests.length - 1];
  if (!last) return t.medicineStartDate ? 'Started' : 'Not requested';
  const courier = plain(last.courier).status;
  const first = requests[0];
  const started = last.medicineStartDate || (last === first && t.medicineStartDate);
  if (courier === 'delivered') return started ? 'Started' : 'Delivered';
  if (courier === 'dispatched') return 'Dispatched';
  return REQUEST_LABEL[last.status] || 'Requested';
};
// "6 month autism", "45 day mental wellness" - from the phase's supply plan (else the months given).
const programmeOf = (patient, stage) => {
  const requests = requestsOf(stage);
  const plan = requests.find((r) => r.supplyPlan)?.supplyPlan || '';
  const days = planDaysOf(plan) || Number(stage.medicineMonthsGiven || 0) * 30;
  const word = PROGRAMME_WORD[patient.category] || 'programme';
  if (!days) return stage.packageName || '';
  return days % 30 === 0 ? `${days / 30} month ${word}` : `${days} day ${word}`;
};
const paidOf = (stage) => (stage.payments || []).filter((p) => (p.approvalStatus || 'approved') === 'approved')
  .reduce((sum, p) => sum + Number(p.amount || 0) - (p.refunds || []).filter((r) => ['paid', 'settled'].includes(r.status)).reduce((n, r) => n + Number(r.amount || 0), 0), 0);
// The day the phase ends: its start + the plan's length (the old schedule's length for a moved phase).
const phaseEndOf = (stage) => {
  const plan = plain(stage.carePlan);
  const first = (plan.parts || [])[0];
  const requests = requestsOf(stage);
  const planDays = planDaysOf(requests.find((r) => r.supplyPlan)?.supplyPlan || '');
  if (first?.startDate) {
    const length = plan.convertedFrom ? Number(first.days || 0) : planDays || C.coveredDays(plan.parts) || C.PHASE_DAYS;
    return C.addDays(first.startDate, length);
  }
  const start = plain(stage.transit).medicineStartDate;
  return start ? C.addDays(C.dayOf(start), planDays || C.PHASE_DAYS) : '';
};

// One row of the Patient 360° table. sessions: the patient's CareSessions (any phase).
const patient360Row = (patient, sessions = [], now = new Date()) => {
  const stage = (patient.stages || []).find((s) => s.number === patient.currentStage) || (patient.stages || [])[0] || {};
  const own = sessions.filter((s) => s.phase === stage.number);
  const today = C.dayOf(now);
  const open = own.filter(C.isOpen).sort((a, b) => C.dueDayOf(a).localeCompare(C.dueDayOf(b)));
  const next = open[0];
  const total = Number(stage.totalAmount || 0);
  const due = Math.max(0, total - paidOf(stage));
  return {
    id: String(patient._id), name: patient.patientName, code: patient.patientCode || '', category: patient.category || '', categoryLabel: CATEGORY_LABELS[patient.category] || '',
    phone: patient.number || '', active: patient.isActive !== false, phase: stage.number || patient.currentStage || 1,
    programme: programmeOf(patient, stage), medicine: medicineOf(stage),
    sessions: { done: own.filter((s) => s.status === 'completed').length, total: own.filter((s) => s.status !== 'cancelled').length, missed: own.filter((s) => s.status === 'missed').length },
    onSchedule: Boolean(plain(stage.carePlan).parts?.length),
    next: next ? { id: String(next._id), day: C.dueDayOf(next), title: next.title, code: next.code, overdue: C.dueDayOf(next) < today, callAt: next.callAt || null } : null,
    overdue: open.filter((s) => C.dueDayOf(s) < today).length,
    due, total,
    pcc: patient.assignedDoctor?.name || '', postCounselor: plain(stage.postCounselor).name || '',
    phaseEnds: phaseEndOf(stage),
  };
};

// ---- PCC report ---------------------------------------------------------------------------------------------------
// For each PCC, the sessions given to them that fell due between `from` and `to` (and by today): done on time / late,
// missed, closed, still overdue; reschedules, calls not connected, form time, doctor alerts, covers; plus what is due
// in the next 7 days, explanations completed and queries raised in the range, their patients and leave days.
const pccReportRows = ({ pccs, sessions, patientsByPcc = new Map(), explanations = new Map(), queries = new Map(), leaveDays = new Map(), from, to, now = new Date() }) => {
  const today = C.dayOf(now);
  const until = to < today ? to : today;
  const week = C.addDays(today, 7);
  const rows = pccs.map((u) => {
    const id = String(u._id);
    const mine = sessions.filter((s) => String(s.assignee) === id);
    const due = mine.filter((s) => { const d = C.dueDayOf(s); return d >= from && d <= until && s.status !== 'cancelled'; });
    const done = due.filter((s) => s.status === 'completed');
    const onTime = done.filter((s) => C.dayOf(s.completedAt || now) <= C.dueDayOf(s));
    const formTimes = done.map((s) => Number(s.form?.durationSec || 0)).filter((n) => n > 0 && n < 6 * 3600);
    const rate = (n) => (due.length ? Math.round((n / due.length) * 100) : null);
    return {
      id, name: u.name,
      patients: patientsByPcc.get(id) || 0,
      due: due.length, done: done.length, onTime: onTime.length, late: done.length - onTime.length,
      missed: due.filter((s) => s.status === 'missed').length,
      closed: mine.filter((s) => s.status === 'cancelled' && C.dueDayOf(s) >= from && C.dueDayOf(s) <= until).length,
      overdue: mine.filter((s) => C.isOpen(s) && C.dueDayOf(s) < today).length,
      upcoming: mine.filter((s) => C.isOpen(s) && C.dueDayOf(s) >= today && C.dueDayOf(s) <= week).length,
      noCallTime: mine.filter((s) => C.isOpen(s) && !s.callAt && C.dueDayOf(s) <= week).length,
      reschedules: due.reduce((n, s) => n + (s.reschedules || []).length, 0),
      notConnected: due.reduce((n, s) => n + C.missedCalls(s).length, 0),
      doctorAlerts: due.reduce((n, s) => n + (s.doctorRequests || []).length, 0),
      covers: done.filter((s) => s.owner && String(s.owner) !== id).length,
      avgFormMinutes: formTimes.length ? Math.round(formTimes.reduce((a, b) => a + b, 0) / formTimes.length / 60) : null,
      completionRate: rate(done.length), onTimeRate: rate(onTime.length),
      explanations: explanations.get(id) || 0, queries: queries.get(id) || 0, leaveDays: leaveDays.get(id) || 0,
    };
  });
  const sum = (key) => rows.reduce((n, r) => n + (r[key] || 0), 0);
  const team = {
    patients: sum('patients'), due: sum('due'), done: sum('done'), onTime: sum('onTime'), late: sum('late'), missed: sum('missed'), closed: sum('closed'),
    overdue: sum('overdue'), upcoming: sum('upcoming'), noCallTime: sum('noCallTime'), reschedules: sum('reschedules'), notConnected: sum('notConnected'),
    doctorAlerts: sum('doctorAlerts'), covers: sum('covers'), explanations: sum('explanations'), queries: sum('queries'), leaveDays: sum('leaveDays'),
  };
  team.completionRate = team.due ? Math.round((team.done / team.due) * 100) : null;
  team.onTimeRate = team.due ? Math.round((team.onTime / team.due) * 100) : null;
  return { rows, team };
};
// Leave days of a PCC inside the range (the days their leaves cover).
const daysInRange = (leaves = [], from, to) => {
  const days = new Set();
  leaves.forEach((l) => { for (let d = l.from < from ? from : l.from; d <= (l.to > to ? to : l.to); d = C.addDays(d, 1)) days.add(d); });
  return days.size;
};

module.exports = { patient360Row, medicineOf, programmeOf, phaseEndOf, paidOf, pccReportRows, daysInRange };
