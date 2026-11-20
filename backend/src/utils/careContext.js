// What the CRM fills in a follow-up / family session form (the `from` keys of careTemplates/blocks.js): the patient,
// the medicine record, the open issues and the other sessions of the schedule. Built when the form is opened.
const mongoose = require('mongoose');
const C = require('./careSchedule');

const dbUp = () => mongoose.connection.readyState === 1;
const fmt = (day) => (day ? new Date(`${day}T00:00:00Z`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '');
const fmtAt = (value) => (value ? new Date(value).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' }) : '');
const NONE = 'CRM में दर्ज नहीं';
const STATUS_TEXT = { pending: 'Pending (time not set)', scheduled: 'Scheduled', completed: 'Completed', missed: 'Missed by parents', cancelled: 'Cancelled' };

// The prescription slots of the forms (M1 ... M6) from the formulation sheet lines of the medicine job.
const slotOf = (line) => {
  const key = String(line.key || '');
  if (key === 'shivaLeh') return 'M2';
  if (key === 'mix') return 'M3';
  if (key === 'sirup') return 'M4';
  if (key === 'nasya') return 'M5';
  if (key === 'oil' || key === 'abhyang') return 'M6';
  if (/खाली पेट|empty/i.test(String(line.when || '')) || /ghrit/i.test(key)) return 'M1';
  return '';
};
const prescriptionOf = (formulation) => {
  const lines = (formulation?.lines || []).filter((line) => line && line.packed !== false);
  const med = {};
  lines.forEach((line) => {
    const slot = slotOf(line);
    if (slot) med[slot] = [med[slot], line.label].filter(Boolean).join(' + ');
  });
  const text = lines.map((line) => [line.label, line.when ? `(${line.when})` : '', line.dose ? `— ${String(line.dose).slice(0, 140)}` : ''].filter(Boolean).join(' ')).join('\n');
  return { med, text };
};

// The open issues of the patient: the unresolved rows of every earlier task register, the open doctor requests.
const openIssuesOf = (sessions, advice, current) => {
  const rows = [];
  sessions.filter((s) => String(s._id) !== String(current._id) && s.form?.answers).forEach((s) => {
    (Array.isArray(s.form.answers.tasks) ? s.form.answers.tasks : []).forEach((task, i) => {
      if (task && task.issue && task.status !== 'Resolved') rows.push(`${s.code}-T${i + 1}: ${task.issue}${task.owner ? ` → ${task.owner}` : ''}${task.due ? ` (due ${task.due})` : ''} [${task.status || 'Open'}]`);
    });
  });
  advice.filter((a) => !a.resolvedAt).forEach((a) => rows.push(`Doctor advice ${a.status === 'requested' ? 'awaited' : 'given, not closed'}: ${String(a.query || '').slice(0, 120)}`));
  return rows.join('\n');
};

// Agreed home actions of a family session (its 'homeActions' table: rows a1, a2 in FS-01 / 02 / 03).
const actionsOf = (session) => {
  const table = session?.form?.answers?.homeActions;
  if (!table || typeof table !== 'object') return '';
  return Object.values(table).map((cells, i) => {
    const c = cells && typeof cells === 'object' ? cells : {};
    if (!String(c.activity || '').trim()) return '';
    const who = c.person || c.caregiver || '';
    return `Action ${String(i + 1).padStart(2, '0')}: ${c.activity}${c.frequency ? ` · ${c.frequency}` : ''}${who ? ` (${who})` : ''}`;
  }).filter(Boolean).join('\n');
};

const buildContext = async (session, user) => {
  const Patient = require('../models/Patient');
  const CareSession = require('../models/CareSession');
  const patient = dbUp() ? await Patient.findById(session.patient)
    .select('patientName patientCode age guardianName relativeName number category stages.number stages.age stages.transit.medicineStartDate stages.transit.explanationCompletedAt stages.transit.explanationCompletedByName stages.carePlan stages.poPaper stages.notes')
    .lean() : null;
  const stage = (patient?.stages || []).find((s) => s.number === session.phase) || {};
  const [sessions, job, advice] = dbUp() ? await Promise.all([
    CareSession.find({ patient: session.patient, phase: session.phase }).select('code status targetDate callAt completedAt form.answers').lean(),
    require('../models/MedicineJob').findOne({ patient: session.patient, phase: session.phase, formulation: { $ne: null } }).sort({ createdAt: -1 }).select('formulation').lean(),
    require('../models/AdviceRequest').find({ patient: session.patient, resolvedAt: null }).select('query status resolvedAt').lean(),
  ]) : [[], null, []];
  const byCode = new Map(sessions.map((s) => [s.code, s]));
  const { med, text } = prescriptionOf(job?.formulation);
  const start = stage.transit?.medicineStartDate ? C.dayOf(stage.transit.medicineStartDate) : '';
  const plan = stage.carePlan || {};
  const covered = C.coveredDays(plan.parts || []);
  const last = (plan.parts || [])[(plan.parts || []).length - 1];
  const supplyEnd = last ? C.addDays(last.startDate, Number(last.days || 0)) : '';
  const parentName = patient?.guardianName || patient?.relativeName || '';
  const age = stage.age || patient?.age || '';
  const due = C.dueDayOf(session);
  const values = {
    sessionRef: `${session.code} · ${String(session._id).slice(-6).toUpperCase()}`,
    patientCode: patient?.patientCode || session.patientCode || '',
    today: fmt(C.dayOf(new Date())),
    counsellor: user?.name || '',
    patientName: patient?.patientName || session.patientName || '',
    childAge: age,
    parentName,
    patientNameAge: [patient?.patientName, age].filter(Boolean).join(' / '),
    patientNameStart: [patient?.patientName, start ? fmt(start) : ''].filter(Boolean).join(' / '),
    treatmentStart: start ? fmt(start) : '',
    dueDate: fmt(due),
    prescription: text,
    medicineSchedule: text,
    explanation: stage.transit?.explanationCompletedAt ? `Completed${stage.transit.explanationCompletedByName ? ` (${stage.transit.explanationCompletedByName})` : ''}` : 'Pending',
    pendingComplaint: advice.length ? `Yes — ${advice.length} open doctor quer${advice.length === 1 ? 'y' : 'ies'}` : 'No',
    openIssues: openIssuesOf(sessions, advice, session),
    nextDispatch: supplyEnd ? `Medicine in hand till ${fmt(supplyEnd)}${covered < C.PHASE_DAYS ? ` (next supply needed for the remaining ${C.PHASE_DAYS - covered} days)` : ''}` : '',
    journeyGoal: '', journeyPurpose: '', goals: '', trackerSummary: '',
    homeTherapy: actionsOf([...sessions].filter((s) => s.code.startsWith('FS') && s.status === 'completed').pop()),
    issuedPapers: (job?.formulation?.papers || []).map((p) => (typeof p === 'string' ? p : p?.label || p?.name || '')).filter(Boolean).join(', '),
    clinicalConcerns: stage.poPaper?.values?.problem || stage.poPaper?.values?.complaint || stage.notes || '',
    initialConcerns: stage.poPaper?.values?.problem || '',
    doctorAssessment: stage.poPaper?.values?.diagnosis || '',
    sessionStaff: [fmt(due), session.assigneeName || session.ownerName].filter(Boolean).join(' · '),
  };
  Object.entries(med).forEach(([slot, name]) => { values[`med:${slot}`] = name; });
  ['M1', 'M2', 'M3', 'M4', 'M5', 'M6'].forEach((slot) => { if (!values[`med:${slot}`] && job?.formulation) values[`med:${slot}`] = 'Not Prescribed'; });
  const sessionsInfo = Object.fromEntries(C.PLAN.map((item) => {
    const s = byCode.get(item.code);
    const day = s ? C.dueDayOf(s) : '';
    return [item.code, {
      status: s ? STATUS_TEXT[s.status] || s.status : 'Not scheduled (no medicine for this day yet)',
      date: day ? fmt(day) : '', at: s?.callAt ? fmtAt(s.callAt) : '',
      final: s?.form?.answers?.final || '', actions: s ? actionsOf(s) : '', scheduled: Boolean(s), done: s?.status === 'completed',
    }];
  }));
  return { values, sessions: sessionsInfo, none: NONE };
};

// The value of one `from` key ('status:FS-01', 'date:DT-01', 'med:M1', 'patientName' ...).
const valueOf = (context, from) => {
  const [kind, code] = String(from || '').split(':');
  if (code && context.sessions[code] && kind !== 'med') {
    const s = context.sessions[code];
    if (kind === 'status') return s.status;
    if (kind === 'date') return s.at || s.date;
    if (kind === 'statusDate') return [s.status, s.at || s.date].filter(Boolean).join(' — ');
    if (kind === 'finalOf') return s.final;
    if (kind === 'actions') return s.actions;
  }
  return context.values[from] ?? '';
};

module.exports = { buildContext, valueOf, prescriptionOf, slotOf, openIssuesOf };
