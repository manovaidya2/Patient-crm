// Treatment Delivery: what a phase promises on the Treatment & PO paper (section D ticks: delivery scope / session
// commitment), laid out on the calendar from the medicine start date - the dedicated sessions, the follow-ups with the
// reviews that ride on them, and the PCC's tasks towards the next phase.
// Only rules here, no database, so every rule can be tested. The controller (deliveryController.js) applies them.
const { COMPONENTS } = require('./postCounselingRecord');
const { supplyOption, customMonths, SUPPLY_PLANS } = require('../constants/supplyPlans');
const { AFTERNOON_WEEKDAYS, AFTERNOON_FROM_HOUR } = require('./pccCalendar');

const COMPONENT_KEYS = COMPONENTS.map((component) => component.key);
const COMPONENT_LABEL = Object.fromEntries(COMPONENTS.map((component) => [component.key, component.label]));
const fail = (message, statusCode = 400) => Object.assign(new Error(message), { statusCode });
const text = (value, max = 500) => String(value ?? '').trim().slice(0, max);

// Day numbers are counted from the medicine start date (day 1) for a 6 month (180 day) phase. A shorter or longer
// phase keeps the first fortnight as it is and stretches the rest in proportion.
const DEFAULT_RULES = {
  followUpsPerSixMonths: 15,
  firstFollowUpDay: 14,
  lastFollowUpGap: 4,
  dietGuidanceDay: 3,
  panchakarmaDay: 5,
  sensoryDay: 7,
  plansDay: 10,
  dietReviewDay: 90,
  doctorReviewDays: [45, 105, 165],
  reviewPrepDay: 150,
  bookNextDay: 165,
  nextCounsellingDay: 175,
  closedWeekdays: [3],
  defaultHour: 11,
  rescheduleLimit: 4,
  confirmWindowDays: 14,
  nextPhaseAlertDays: 30,
  catchUpDays: 14,
  // A phase runs this many months whatever months of medicine each purchase order carries (1 + 5, 2 + 4, 1 + 2 + 3 ...).
  phaseMonths: 6,
};
const RULE_LIMITS = {
  followUpsPerSixMonths: [1, 40], firstFollowUpDay: [2, 60], lastFollowUpGap: [0, 30], dietGuidanceDay: [1, 14], panchakarmaDay: [1, 14],
  sensoryDay: [1, 14], plansDay: [1, 14], dietReviewDay: [15, 180], reviewPrepDay: [15, 180], bookNextDay: [15, 180], nextCounsellingDay: [15, 180],
  defaultHour: [8, 19], rescheduleLimit: [0, 20], confirmWindowDays: [1, 60], nextPhaseAlertDays: [1, 90], catchUpDays: [0, 60], phaseMonths: [1, 12],
};
const cleanRules = (input = {}) => {
  const source = input && typeof input === 'object' ? input : {};
  const rules = { ...DEFAULT_RULES };
  Object.entries(RULE_LIMITS).forEach(([key, [min, max]]) => {
    const n = Math.round(Number(source[key]));
    if (source[key] !== '' && source[key] != null && Number.isFinite(n) && n >= min && n <= max) rules[key] = n;
  });
  const reviews = (Array.isArray(source.doctorReviewDays) ? source.doctorReviewDays : []).map((d) => Math.round(Number(d))).filter((d) => Number.isFinite(d) && d >= 15 && d <= 180);
  rules.doctorReviewDays = reviews.length === 3 ? [...reviews].sort((a, b) => a - b) : [...DEFAULT_RULES.doctorReviewDays];
  const closed = [...new Set((Array.isArray(source.closedWeekdays) ? source.closedWeekdays : DEFAULT_RULES.closedWeekdays).map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))];
  // Never every day of the week: the calendar must always have a working day to land on.
  rules.closedWeekdays = closed.length <= 5 ? closed.sort((a, b) => a - b) : [...DEFAULT_RULES.closedWeekdays];
  return rules;
};

// by: who conducts it. Every session is the patient's PCC's work; the three treatment reviews are the doctor's.
const TEMPLATES = {
  diet1: { title: "Diet & do's/don'ts guidance", by: 'pcc', mode: 'Video', duration: 40, steps: ['Approved diet paper version opened', "Do's & don'ts list explained", 'Two food changes agreed for the first fortnight', 'Parent teach-back on the diet chart'] },
  diet2: { title: 'Diet review', by: 'pcc', mode: 'Video', duration: 30, steps: ['Food log reviewed', 'Barriers and exceptions noted', 'Plan update (doctor-approved only)', 'Next steps agreed with parent'] },
  panch: { title: 'Panchakarma / home kit demonstration', by: 'pcc', mode: 'Clinic / video', duration: 45, steps: ['Doctor approval and contraindication screen checked', 'Oil / procedure demonstrated step by step', 'Parent performs it once while observed', 'Adverse signs to report explained'] },
  sens: { title: 'Sensory / neurotouch initial guidance', by: 'pcc', mode: 'Video', duration: 40, steps: ['Sensory triggers identified with parent', '2-3 neurotouch techniques demonstrated', 'Child response noted', 'Home routine assigned'] },
  plans: { title: 'Written plans handover', by: 'pcc', mode: 'Video', duration: 50, steps: [] },
  medc: { title: 'Doctor treatment review', by: 'doctor', mode: 'Video', duration: 20, steps: ['Tracker results since last review checked', 'Medicine response and concerns reviewed', 'Goal progress noted', 'Plan changes signed by doctor (if any)'] },
  fam: { title: 'Family counselling session', by: 'pcc', mode: 'Video', duration: 50, steps: ['Family roles and caregiver goals', 'Concerns raised by family', 'Mutually agreed action', 'Further session needed?'] },
  fu: { title: 'Follow-up', by: 'pcc', mode: 'Phone', duration: 25, steps: ['Last homework reviewed', 'Medicine adherence and missed doses', 'New concerns and red-flag check'] },
};
const PLAN_COMPONENTS = ['homeTherapyPlan', 'behaviourRoutinePlan', 'functionalSkills'];
const PLAN_STEPS = {
  homeTherapyPlan: 'Home Therapy plan handed over (level + 3-5 activities)',
  behaviourRoutinePlan: 'Behaviour / Routine plan handed over',
  functionalSkills: 'Functional Skills plan handed over',
};
// What rides on every follow-up when the component is ticked ("review within follow-ups", "integrated guidance").
const FOLLOW_UP_LINES = {
  panchakarmaKit: 'Panchakarma / home kit review',
  homeTherapyPlan: 'Home therapy implementation check',
  behaviourRoutinePlan: 'Behaviour / routine plan review',
  functionalSkills: 'Functional skills monitoring',
  sensoryGuidance: 'Sensory routine follow-through',
  parentTraining: 'Parent training: demonstrate and teach-back',
};
const TASKS = {
  reviewPrep: 'Phase review prep: collect missing trackers',
  bookNext: 'Book next-phase doctor consultation',
  nextCounselling: 'Next-phase counselling and approval',
  phaseReview: 'Phase review: patient stays active',
};
const FAMILY_LIMIT = 3;
const MISS_REASONS = ['Parent did not answer (3 attempts)', 'Parent asked to reschedule', 'Child unwell', 'Staff unavailable'];
const UNDERSTANDING = { good: 'Good', partial: 'Partial', repeat: 'Needs repeat' };
const RECORDING = { recorded: 'Recorded (consented)', declined: 'Consent declined', unsupported: 'Not supported', failed: 'Recording failed' };

// ---- Supply -> phase length -------------------------------------------------------------------------------------
// The whole plan the purchase order belongs to (6 months for 6M / 1+5 / 2+4, the chosen months for a custom plan)...
const planMonthsOf = (supplyPlan) => customMonths(supplyPlan) || (SUPPLY_PLANS[supplyPlan] ? 6 : 0);
// ...and the months of medicine this one purchase order actually supplies.
const partMonthsOf = (supplyPlan, supplyPart) => supplyOption(supplyPlan, supplyPart)?.months || 0;
// How long the plan of a phase is when it is made from one supply ({ months, planMonths, supplyPart }): the phase
// length of the settings, or longer when the purchase order says so. The medicine can come in any combination of
// months on later purchase orders; each adds its months to the same plan. A "rest" supply with no plan before it (the
// phase started before this page existed) is planned on its own.
const planLengthOf = (supply = {}, rules) => (supply.supplyPart === 'rest'
  ? Number(supply.months || 0)
  : Math.max(cleanRules(rules).phaseMonths, Number(supply.planMonths || 0), Number(supply.months || 0)));
const cleanComponents = (list) => COMPONENT_KEYS.filter((key) => (Array.isArray(list) ? list : []).includes(key));

// ---- Days ------------------------------------------------------------------------------------------------------
const DAY = 86400000;
const dayOf = (value) => new Date(new Date(value).getTime() + 19800000).toISOString().slice(0, 10); // clinic (India) day
const addDays = (day, n) => new Date(Date.parse(`${day}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);
const diffDays = (a, b) => Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / DAY);
const weekdayOf = (day) => new Date(`${day}T00:00:00Z`).getUTCDay();
const atHour = (day, hour) => new Date(`${day}T${String(hour).padStart(2, '0')}:00:00+05:30`);
const validDay = (day) => /^\d{4}-\d{2}-\d{2}$/.test(String(day || '')) && !Number.isNaN(Date.parse(`${day}T00:00:00Z`));

const scaleDay = (day, phaseDays) => (day <= 14 ? Math.min(day, phaseDays) : Math.min(phaseDays, Math.max(15, Math.round((day * phaseDays) / 180))));
const followUpCount = (phaseDays, rules) => Math.max(1, Math.round((rules.followUpsPerSixMonths * phaseDays) / 180));
const followUpDays = (phaseDays, rules) => {
  const n = followUpCount(phaseDays, rules);
  const first = Math.min(rules.firstFollowUpDay, phaseDays);
  const last = Math.max(first, phaseDays - rules.lastFollowUpGap);
  return Array.from({ length: n }, (_, i) => (n === 1 ? first : Math.round(first + (i * (last - first)) / (n - 1))));
};

// ---- The plan of one phase -------------------------------------------------------------------------------------
// Every item has a stable key, so making the plan again never repeats what is already on the calendar.
// Nothing is made for a component that is not ticked.
const buildPlan = (components, phaseDays, rulesInput) => {
  const rules = cleanRules(rulesInput);
  const has = (key) => components.includes(key);
  const items = [];
  const session = (key, template, day, extra = {}) => items.push({
    key, kind: 'session', list: 'followUps', template, title: TEMPLATES[template].title, day: scaleDay(day, phaseDays),
    components: [], seq: 0, total: 0, monthly: false, ...extra,
  });
  const withParent = (list) => (has('parentTraining') ? [...list, 'parentTraining'] : list);

  if (has('dosDontsDiet')) {
    session('diet:1', 'diet1', rules.dietGuidanceDay, { components: withParent(['dosDontsDiet']), seq: 1, total: 2 });
    session('diet:2', 'diet2', rules.dietReviewDay, { components: withParent(['dosDontsDiet']), seq: 2, total: 2 });
  }
  if (has('panchakarmaKit')) session('panch', 'panch', rules.panchakarmaDay, { components: withParent(['panchakarmaKit']) });
  if (has('sensoryGuidance')) session('sens', 'sens', rules.sensoryDay, { components: withParent(['sensoryGuidance']) });
  const plans = PLAN_COMPONENTS.filter(has);
  // The written plans are handed over together in one session.
  if (plans.length) session('plans', 'plans', rules.plansDay, { components: withParent(plans) });
  if (has('medicalHandHolding')) {
    rules.doctorReviewDays.forEach((day, i) => session(`medc:${i + 1}`, 'medc', day, { title: `Doctor treatment review ${i + 1} of 3`, components: ['medicalHandHolding'], seq: i + 1, total: 3 }));
  }
  if (has('regularFollowUps')) {
    const days = followUpDays(phaseDays, rules);
    // The follow-up nearest each 30 day mark also carries the monthly progress documentation.
    const monthly = new Set();
    if (has('progressTracking')) {
      for (let mark = 30; mark <= phaseDays; mark += 30) {
        let best = 0;
        days.forEach((day, i) => { if (Math.abs(day - mark) < Math.abs(days[best] - mark)) best = i; });
        monthly.add(best);
      }
    }
    const riding = Object.keys(FOLLOW_UP_LINES).filter(has);
    days.forEach((day, i) => items.push({
      key: `fu:${i + 1}`, kind: 'session', list: 'followUps', template: 'fu',
      title: `Follow-up ${i + 1}${monthly.has(i) ? ' + monthly progress' : ''}`, day,
      components: ['regularFollowUps', ...riding, ...(monthly.has(i) ? ['progressTracking'] : [])], seq: i + 1, total: days.length, monthly: monthly.has(i),
    }));
  }
  const task = (key, day) => items.push({ key: `task:${key}`, kind: 'task', title: TASKS[key], day });
  task('reviewPrep', scaleDay(rules.reviewPrepDay, phaseDays));
  task('bookNext', scaleDay(rules.bookNextDay, phaseDays));
  task('nextCounselling', scaleDay(rules.nextCounsellingDay, phaseDays));
  task('phaseReview', phaseDays);
  return items.sort((a, b) => a.day - b.day);
};

// What is saved on the calendar entry for a plan item.
const sessionInfo = (item) => {
  const template = TEMPLATES[item.template];
  return {
    auto: true, key: item.key, template: item.template, title: item.title, components: item.components || [], day: item.day,
    seq: item.seq || 0, total: item.total || 0, monthly: Boolean(item.monthly), role: template.by, mode: template.mode, duration: template.duration,
  };
};

// ---- The calendar ----------------------------------------------------------------------------------------------
// The supply can come in parts (1 + 5 months). Each part covers its days of the plan from its own start date:
// parts = [{ startDate: 'YYYY-MM-DD', months, offsetDays }]. Day 1 of a part is its start date.
const coveredDays = (parts = []) => parts.reduce((sum, part) => sum + Number(part.months || 0) * 30, 0);
const dateOfDay = (day, parts = []) => {
  const part = parts.find((p) => day > Number(p.offsetDays || 0) && day <= Number(p.offsetDays || 0) + Number(p.months || 0) * 30);
  return part && validDay(part.startDate) ? addDays(part.startDate, day - 1 - Number(part.offsetDays || 0)) : null;
};
// No more medicine is awaited for this plan: every month of it has started, or the PCC closed the phase with the
// medicine on record ("no further supply in this phase").
const supplyDone = (delivery) => Boolean(delivery?.phaseDays) && (coveredDays(delivery.parts) >= delivery.phaseDays || Boolean(delivery.supplyClosedAt));
const isClosed = (day, rules, holidays) => rules.closedWeekdays.includes(weekdayOf(day)) || Boolean(holidays?.has(day));
const nextWorkingDay = (day, { rules, holidays, taken } = {}) => {
  let next = day;
  for (let i = 0; i < 120 && (isClosed(next, rules, holidays) || taken?.has(next)); i += 1) next = addDays(next, 1);
  return next;
};
// Saturday, Sunday and Tuesday the PCCs take sessions only from 2 pm (utils/pccCalendar.js).
const hourFor = (day, rules) => (AFTERNOON_WEEKDAYS.includes(weekdayOf(day)) ? Math.max(rules.defaultHour, AFTERNOON_FROM_HOUR) : rules.defaultHour);

// Puts plan items on dates. Closed days and holidays are skipped and a patient gets one session a day (`taken` = the
// days this patient already has something). An item whose day has passed moves to the next working day; when it is
// more than `catchUpDays` old it is left out (the plan was made late) unless its key is in `keep`.
// Items beyond the supply in hand come back in `later`: they are made when the next supply starts.
const layout = (items, { parts, rules: rulesInput, holidays = new Set(), taken = new Set(), today, keep = new Set() }) => {
  const rules = cleanRules(rulesInput);
  const used = new Set(taken);
  const out = { sessions: [], tasks: [], skipped: [], later: [] };
  [...items].sort((a, b) => a.day - b.day).forEach((item) => {
    const planned = dateOfDay(item.day, parts);
    if (!planned) { out.later.push(item); return; }
    if (item.kind === 'task') {
      const due = nextWorkingDay(planned < today ? today : planned, { rules, holidays });
      out.tasks.push({ ...item, dueDate: atHour(due, rules.defaultHour) });
      return;
    }
    const late = diffDays(today, planned);
    if (late > rules.catchUpDays && !keep.has(item.key)) { out.skipped.push({ key: item.key, title: item.title, day: item.day, reason: `Its day (${planned}) had passed when the plan was made` }); return; }
    const day = nextWorkingDay(late >= 0 ? addDays(today, 1) : planned, { rules, holidays, taken: used });
    used.add(day);
    out.sessions.push({ ...item, dateTime: atHour(day, hourFor(day, rules)) });
  });
  return out;
};

// ---- A session on the calendar ---------------------------------------------------------------------------------
// tentative -> confirmed -> done; missed and rescheduled on the way. Only scheduled / completed / cancelled are
// stored (constants/scheduleStatuses.js); the rest is read from the delivery marks.
const stateOf = (entry, now = new Date()) => {
  const d = entry.delivery || {};
  if (entry.status === 'cancelled') return d.rescheduledTo ? 'rescheduled' : 'cancelled';
  if (entry.status === 'completed' || entry.status === 'sent') return 'done';
  if (d.missedAt) return 'missed';
  const past = new Date(entry.dateTime) < now;
  if (d.confirmedAt) return past ? 'form_due' : 'confirmed';
  return past ? 'overdue' : 'tentative';
};
const STATE_LABELS = { tentative: 'Tentative', confirmed: 'Confirmed', done: 'Done', missed: 'Missed', rescheduled: 'Rescheduled', cancelled: 'Cancelled', form_due: 'Form due', overdue: 'Date passed' };
const isOpen = (entry) => !['completed', 'cancelled', 'sent'].includes(entry.status);
// Still free to follow a corrected medicine start date: nobody confirmed it, moved it or marked it missed.
const isMovable = (entry) => Boolean(entry.delivery?.auto) && entry.status === 'scheduled' && !entry.delivery.confirmedAt && !entry.delivery.missedAt && !entry.delivery.movedAt;

// The session console: every line must be answered Done or N/A before the session can be closed.
const checklistFor = (delivery = {}, ticked = []) => {
  const template = TEMPLATES[delivery.template];
  if (!template) return [];
  const lines = [{ key: 'pre', section: 'pre', text: 'Patient identity and consent confirmed' }];
  template.steps.forEach((step, i) => lines.push({ key: `s${i + 1}`, section: 'sop', text: step }));
  if (delivery.template === 'plans') {
    PLAN_COMPONENTS.filter((key) => (delivery.components || []).includes(key)).forEach((key) => lines.push({ key: `p:${key}`, section: 'sop', text: PLAN_STEPS[key] }));
    lines.push({ key: 's:demo', section: 'sop', text: 'First activity of each plan demonstrated, trackers issued' });
  }
  if (delivery.template === 'fu') {
    Object.keys(FOLLOW_UP_LINES).filter((key) => (delivery.components || []).includes(key)).forEach((key) => lines.push({ key: `i:${key}`, section: 'integrated', text: FOLLOW_UP_LINES[key] }));
    if (delivery.monthly) lines.push({ key: 'mon', section: 'integrated', text: 'Monthly progress documented (tracker received and checked)' });
  } else if (ticked.includes('parentTraining') && delivery.template !== 'medc') {
    lines.push({ key: 'tb', section: 'teachback', text: 'Parent teach-back: the parent showed the task back' });
  }
  return lines;
};

// The closing form of a session. Throws with the first thing still missing.
const cleanSubmission = (lines, body = {}) => {
  const answers = new Map((Array.isArray(body.checklist) ? body.checklist : []).map((row) => [String(row?.key || ''), row]));
  const checklist = lines.map((line) => {
    const row = answers.get(line.key) || {};
    const answer = row.answer === 'done' ? 'done' : row.answer === 'na' ? 'na' : '';
    if (!answer) throw fail(`Mark "${line.text}" as Done or N/A`);
    return { ...line, answer, reason: text(row.reason, 300) };
  });
  const close = body.close && typeof body.close === 'object' ? body.close : {};
  if (close.redFlag !== true && close.redFlag !== false) throw fail('Answer the red flag question: Yes or No');
  const concern = text(close.concern, 1000);
  if (close.redFlag && concern.length < 5) throw fail('Write the red flag concern for the doctor');
  if (!UNDERSTANDING[close.understanding]) throw fail('Choose the parent understanding');
  if (!RECORDING[close.recording]) throw fail('Choose the recording status');
  return { checklist, close: { redFlag: close.redFlag, concern: close.redFlag ? concern : '', understanding: close.understanding, homeTask: text(close.homeTask, 1000), recording: close.recording } };
};
// One line for the old lists (Follow Ups page, patient history), so a done session reads complete there too.
const summaryOf = (checklist, close) => [
  `Checklist: ${checklist.filter((line) => line.answer === 'done').length} done, ${checklist.filter((line) => line.answer === 'na').length} N/A`,
  `Parent understanding: ${UNDERSTANDING[close.understanding]}`,
  close.homeTask ? `Home task: ${close.homeTask}` : '',
  `Recording: ${RECORDING[close.recording]}`,
  close.redFlag ? `RED FLAG: ${close.concern}` : 'No red flag',
].filter(Boolean).join(' | ');

// ---- Promise tracker -------------------------------------------------------------------------------------------
// Promised against delivered, per ticked component. `sessions` = this phase's delivery entries (follow-ups and family
// sessions) as { state, delivery }; `familyDone` / `familyBooked` count every family session of the phase.
const trackerOf = ({ components = [], sessions = [], followUpsPromised = 0, planMonths = 0, explanationDone = false, familyDone = 0, familyBooked = 0, queries = null }) => {
  const live = sessions.filter((s) => !['cancelled', 'rescheduled'].includes(s.state));
  const done = live.filter((s) => s.state === 'done');
  const of = (list, ...templates) => list.filter((s) => templates.includes(s.delivery?.template));
  const answered = (key) => done.filter((s) => (s.delivery?.checklist || []).some((line) => line.key === key && line.answer === 'done')).length;
  const row = (key, extra) => ({ key, label: COMPONENT_LABEL[key], scope: COMPONENTS.find((c) => c.key === key).scope, promised: null, delivered: 0, booked: 0, note: '', ...extra });
  const dedicated = (key, promised, ...templates) => row(key, { promised, delivered: of(done, ...templates).length, booked: of(live, ...templates).length });
  const plan = (key) => {
    const handed = answered(`p:${key}`) > 0;
    return row(key, { promised: 1, delivered: handed ? 1 : 0, booked: of(live, 'plans').length ? 1 : 0, note: `Written plan ${handed ? 'handed over' : 'not handed over yet'} · reviewed in ${answered(`i:${key}`)} follow-up(s)` });
  };
  const build = {
    dosDontsDiet: () => dedicated('dosDontsDiet', 2, 'diet1', 'diet2'),
    ayurvedicFormulations: () => row('ayurvedicFormulations', { promised: 1, delivered: explanationDone ? 1 : 0, booked: 1, note: 'Medicine explanation session; doubts go through Patient Queries' }),
    panchakarmaKit: () => ({ ...dedicated('panchakarmaKit', 1, 'panch'), note: `Reviewed in ${answered('i:panchakarmaKit')} follow-up(s)` }),
    medicalHandHolding: () => dedicated('medicalHandHolding', 3, 'medc'),
    progressTracking: () => row('progressTracking', { promised: planMonths || null, delivered: answered('mon'), booked: live.filter((s) => s.delivery?.monthly).length, note: 'Monthly documentation inside follow-ups' }),
    sensoryGuidance: () => ({ ...dedicated('sensoryGuidance', 1, 'sens'), note: `Followed through in ${answered('i:sensoryGuidance')} follow-up(s); more sessions on request` }),
    homeTherapyPlan: () => plan('homeTherapyPlan'),
    behaviourRoutinePlan: () => plan('behaviourRoutinePlan'),
    familyCounselling: () => row('familyCounselling', { promised: FAMILY_LIMIT, delivered: familyDone, booked: familyBooked, note: `Up to ${FAMILY_LIMIT}, booked when the family needs one` }),
    regularFollowUps: () => row('regularFollowUps', { promised: followUpsPromised || null, delivered: of(done, 'fu').length, booked: of(live, 'fu').length }),
    parentTraining: () => row('parentTraining', { delivered: answered('i:parentTraining') + answered('tb'), note: 'Teach-back inside the scheduled sessions' }),
    functionalSkills: () => plan('functionalSkills'),
    querySupport: () => row('querySupport', { delivered: queries?.solved || 0, booked: queries?.total || 0, note: queries ? `${queries.total} quer${queries.total === 1 ? 'y' : 'ies'} raised, ${queries.solved} solved` : 'Helpline: Patient Queries' }),
  };
  return cleanComponents(components).map((key) => build[key]());
};

// ---- Where the phase stands ------------------------------------------------------------------------------------
// The last day of the phase, known once no more medicine is awaited (a phase closed early ends with its medicine).
const phaseEndDay = (delivery) => (supplyDone(delivery) ? dateOfDay(Math.min(delivery.phaseDays, coveredDays(delivery.parts)), delivery.parts) : null);
// Delivered: the whole supply has started and nothing of the plan is still open.
const isDelivered = (delivery, sessions) => {
  if (!supplyDone(delivery)) return false;
  const auto = sessions.filter((s) => s.delivery?.auto);
  return auto.length > 0 && auto.every((s) => !isOpen(s));
};
const nextPhaseOpen = (delivery) => !delivery?.nextPhase?.decision;

// Everything that needs a person now: [{ type, level: 'red' | 'amber', text, sessionId?, taskKey?, at }].
// supply: where the next supply of medicine stands (utils/deliverySupply.js nextSupplyOf), when the caller read it.
const alertsOf = ({ delivery, sessions = [], now = new Date(), rules: rulesInput, supply }) => {
  const rules = cleanRules(rulesInput);
  const alerts = [];
  if (!delivery?.parts?.length) return alerts;
  const today = dayOf(now);
  const add = (type, level, message, extra = {}) => alerts.push({ type, level, text: message, ...extra });
  sessions.filter((s) => s.delivery?.key).forEach((s) => {
    const state = stateOf(s, now);
    const base = { sessionId: String(s._id || s.id), at: s.dateTime };
    const title = s.delivery.title || 'Session';
    if (state === 'missed') add('missed', 'red', `${title}: missed and not rescheduled`, base);
    else if (state === 'form_due') add('form', 'red', `${title}: confirmed and over, session form not filled`, base);
    else if (state === 'overdue') add('overdue', 'red', `${title}: date passed, neither done nor rescheduled`, base);
    else if (state === 'tentative' && diffDays(dayOf(s.dateTime), today) <= 7) add('confirm', 'amber', `${title}: tentative, due within 7 days. Confirm it with the parent`, base);
  });
  (delivery.tasks || []).filter((task) => !task.doneAt && task.dueDate && dayOf(task.dueDate) <= today)
    .forEach((task) => add('task', dayOf(task.dueDate) < today ? 'red' : 'amber', `PCC task due: ${task.title}`, { taskKey: task.key, at: task.dueDate }));
  const covered = coveredDays(delivery.parts);
  const awaited = !supplyDone(delivery);
  if (awaited && supply) {
    if (supply.level !== 'info') add('supply', supply.level, `${supply.headline}. ${supply.text}`, { at: supply.runsOut ? atHour(supply.runsOut, rules.defaultHour) : now, supplyStage: supply.stage });
  } else if (awaited) {
    const runsOut = dateOfDay(covered, delivery.parts);
    if (runsOut && diffDays(runsOut, today) <= 10) add('supply', diffDays(runsOut, today) < 0 ? 'red' : 'amber', `Medicine in hand runs till ${runsOut}. The rest of the plan is scheduled when the PCC fills the medicine start date of the next supply`, { at: atHour(runsOut, rules.defaultHour) });
  }
  const end = phaseEndDay(delivery);
  const next = delivery.nextPhase || null;
  if (next?.decision === 'time' && next.followUpAt && new Date(next.followUpAt) <= now) add('next_phase', 'red', 'Next phase: the parent asked for time and the call back date has come. Choose again', { at: next.followUpAt });
  else if (!next?.decision && isDelivered(delivery, sessions)) add('next_phase', 'red', 'Treatment delivery is complete. Choose the next phase option: book the appointment, parent needs time, or not continuing', { at: end ? atHour(end, rules.defaultHour) : now });
  else if (!next?.decision && end && diffDays(end, today) <= rules.nextPhaseAlertDays) add('next_phase', diffDays(end, today) <= 7 ? 'red' : 'amber', `Phase ends on ${end}. The next-phase consultation must be booked`, { at: atHour(end, rules.defaultHour) });
  return alerts;
};

const progressOf = (sessions, now = new Date()) => {
  const auto = sessions.filter((s) => s.delivery?.key && !['cancelled', 'rescheduled'].includes(stateOf(s, now)));
  return { total: auto.length, done: auto.filter((s) => stateOf(s, now) === 'done').length };
};

module.exports = {
  COMPONENT_KEYS, COMPONENT_LABEL, DEFAULT_RULES, RULE_LIMITS, TEMPLATES, PLAN_COMPONENTS, FOLLOW_UP_LINES, TASKS, FAMILY_LIMIT, MISS_REASONS, UNDERSTANDING, RECORDING, STATE_LABELS,
  cleanRules, cleanComponents, planMonthsOf, partMonthsOf, planLengthOf, supplyDone, dayOf, addDays, diffDays, weekdayOf, atHour, validDay, scaleDay, followUpCount, followUpDays,
  buildPlan, sessionInfo, coveredDays, dateOfDay, isClosed, nextWorkingDay, hourFor, layout, stateOf, isOpen, isMovable, checklistFor, cleanSubmission, summaryOf,
  trackerOf, phaseEndDay, isDelivered, nextPhaseOpen, alertsOf, progressOf,
};
