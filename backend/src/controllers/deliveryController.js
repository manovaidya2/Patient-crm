// Treatment Delivery: the plan of a phase on the calendar (rules in utils/treatmentDelivery.js).
// The plan is made when the PCC saves the medicine start date (transitController.setMedicineStart -> startDelivery):
// the sessions of the ticked section D components and the follow-ups go into the phase's follow-up list, so every
// existing page (Follow Ups, PCC calendar, reminders, My Day) already shows them. They are confirmed, rescheduled,
// marked missed and closed (session console) only here; short follow-ups are still added by hand the old way.
// Once the phase is delivered the next-phase options open: book the appointment, parent needs time, not continuing.
const mongoose = require('mongoose');
const Patient = require('../models/Patient');
const DeliverySetting = require('../models/DeliverySetting');
const { asyncHandler } = require('../middleware/errorHandler');
const { ROLES, isAdminLike } = require('../constants/roles');
const { cached } = require('../utils/readCache');
const { COMPONENTS } = require('../utils/postCounselingRecord');
const { MEDICINE_ACTIVE, startRequestOf, requestKey } = require('../utils/transitFlow');
const S = require('../utils/deliverySupply');
const { slotProblem } = require('../utils/pccCalendar');
const D = require('../utils/treatmentDelivery');

const DAY_MS = 86400000;
const LISTS = ['followUps', 'familySessions'];
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const fail = (message, statusCode = 400) => { throw Object.assign(new Error(message), { statusCode }); };
const text = (value, max = 500) => String(value ?? '').trim().slice(0, max);
const iso = (value) => (value ? new Date(value).toISOString() : null);
const dbUp = () => mongoose.connection.readyState === 1;
const when = (value) => new Date(value).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true });
const plain = (value) => (value?.toObject ? value.toObject() : value);

// ---- Settings, holidays -----------------------------------------------------------------------------------------
const loadRules = async () => D.cleanRules(dbUp() ? (await DeliverySetting.findOne({ key: 'rules' }).lean())?.value : null);
const loadHolidays = async () => {
  if (!dbUp()) return new Set();
  const rows = await require('../models/HrHoliday').find({ isActive: true }).select('date').lean();
  return new Set(rows.map((row) => row.date));
};

// ---- Who may act --------------------------------------------------------------------------------------------------
// The Admin, the Manager and the Doctor on every patient, a PCC on their own patients. The corrections kept for the
// Admin / Manager (ticks of a running plan, a start date from Medicine Explanations, reschedules over the limit, "not
// needed", early next-phase decision) and the settings (Admin) stay theirs: the Doctor does the PCC's work.
const seesAll = (user) => isAdminLike(user) || user.role === ROLES.DOCTOR;
const pccIdOf = (patient) => String(patient.assignedDoctor?._id || patient.assignedDoctor || '');
const mayAct = (user, patient) => seesAll(user)
  || (user.role === ROLES.ASSISTANT_DOCTOR && pccIdOf(patient) === String(user._id) && (patient.approvalStatus || 'approved') === 'approved' && patient.isActive !== false);

const load = async (req) => {
  const { patientId, number } = req.params;
  if (!mongoose.isValidObjectId(patientId)) fail('Patient not found', 404);
  const patient = await Patient.findById(patientId);
  if (!patient) fail('Patient not found', 404);
  if (!mayAct(req.user, patient)) fail('This patient is not assigned to you', 403);
  const stage = (patient.stages || []).find((s) => s.number === Number(number));
  if (!stage) fail('Phase not found', 404);
  return { patient, stage };
};
const planOf = (stage) => (stage.delivery?.parts?.length ? stage.delivery : fail('This phase has no Treatment Delivery plan yet. Set it up first.'));
const log = (patient, user, number, details) => patient.activityLog?.push({ action: 'Treatment Delivery', details: `Phase ${number}: ${details}`, actorName: user?.name || 'System', actorRole: user?.role || '' });
const changed = (req, patient, number) => req.app?.get?.('io')?.to(require('../realtime/salesSheetSocket').MEDICINE_JOBS_ROOM).emit('delivery:changed', { patientId: String(patient._id), phase: Number(number) });

// ---- The plan's entries -------------------------------------------------------------------------------------------
const ensure = (stage) => {
  if (!stage.delivery) stage.delivery = {};
  const d = stage.delivery;
  ['components', 'parts', 'tasks', 'skipped', 'nextPhaseHistory'].forEach((key) => { if (!d[key]) d[key] = []; });
  return d;
};
const planEntries = (stage) => LISTS.flatMap((list) => (stage[list] || []).filter((entry) => entry.delivery?.key).map((entry) => ({ entry, list })));
const findEntry = (stage, id) => planEntries(stage).find(({ entry }) => String(entry._id) === String(id)) || fail('This session is not in the plan', 404);
// The days this patient already has something on the calendar (any phase): one session a day.
const takenDays = (patient, exceptIds = new Set()) => new Set((patient.stages || []).flatMap((stage) => LISTS.flatMap((list) => (stage[list] || [])
  .filter((entry) => entry.status === 'scheduled' && !exceptIds.has(String(entry._id))).map((entry) => D.dayOf(entry.dateTime)))));

// Puts on the calendar what the plan says and is not there yet. Nothing already on record is made twice (the keys
// are stable), a cancelled session does not come back, and when a supply's start date was corrected (`shiftPart`)
// only the sessions nobody confirmed, moved or marked missed follow the new date.
const applyPlan = (patient, stage, { byName = '', holidays = new Set(), now = new Date(), keep = new Set(), shiftPart = null } = {}) => {
  const d = ensure(stage);
  const rules = D.cleanRules(d.rules);
  const items = D.buildPlan(d.components, d.phaseDays, rules);
  const from = Number(shiftPart?.offsetDays || 0);
  const inShift = (day) => Boolean(shiftPart) && day > from && day <= from + Number(shiftPart.months || 0) * 30;
  const entries = planEntries(stage).map(({ entry }) => entry);
  const onRecord = new Set(entries.filter((entry) => !entry.delivery.droppedAt).map((entry) => entry.delivery.key));
  const movable = new Map(entries.filter((entry) => D.isMovable(entry) && inShift(entry.delivery.day)).map((entry) => [entry.delivery.key, entry]));
  const skipped = new Set(d.skipped.map((item) => item.key));
  const tasks = new Map(d.tasks.map((task) => [task.key, task]));
  const todo = items.filter((item) => {
    if (item.kind === 'task') return !tasks.has(item.key) || (!tasks.get(item.key).doneAt && inShift(item.day));
    if (movable.has(item.key)) return true;
    return !onRecord.has(item.key) && (!skipped.has(item.key) || keep.has(item.key));
  });
  const laid = D.layout(todo, {
    parts: d.parts, rules, holidays, today: D.dayOf(now), keep: new Set([...keep, ...movable.keys()]),
    taken: takenDays(patient, new Set([...movable.values()].map((entry) => String(entry._id)))),
  });
  const result = { created: 0, moved: 0, skipped: 0, later: laid.later.filter((item) => item.kind === 'session').length };
  laid.sessions.forEach((item) => {
    const entry = movable.get(item.key);
    if (entry) {
      if (new Date(entry.dateTime).getTime() !== item.dateTime.getTime()) { entry.dateTime = item.dateTime; result.moved += 1; }
      return;
    }
    stage.followUps.push({ dateTime: item.dateTime, status: 'scheduled', followUpType: 'normal', notes: '', createdByName: 'Treatment plan', delivery: D.sessionInfo(item) });
    result.created += 1;
  });
  laid.tasks.forEach((item) => {
    const task = tasks.get(item.key);
    if (task) task.dueDate = item.dueDate;
    else d.tasks.push({ key: item.key, title: item.title, day: item.day, dueDate: item.dueDate });
  });
  laid.skipped.forEach((item) => { if (!skipped.has(item.key)) { d.skipped.push(item); result.skipped += 1; } });
  const nowOn = new Set(planEntries(stage).filter(({ entry }) => !entry.delivery.droppedAt).map(({ entry }) => entry.delivery.key));
  if (d.skipped.some((item) => nowOn.has(item.key))) d.skipped = d.skipped.filter((item) => !nowOn.has(item.key));
  d.followUpsPromised = items.filter((item) => item.template === 'fu').length;
  if (!d.generatedAt) { d.generatedAt = now; d.generatedByName = byName; }
  return result;
};

// The ticks were corrected on a running plan: open sessions take the new wording, and a session whose component is
// no longer ticked is cancelled unless it was already confirmed with the parent (then it stays for a person to decide).
const syncTicks = (stage, { byName, now }) => {
  const d = stage.delivery;
  const byKey = new Map(D.buildPlan(d.components, d.phaseDays, d.rules).filter((item) => item.kind === 'session').map((item) => [item.key, item]));
  const out = { dropped: 0, kept: 0 };
  planEntries(stage).forEach(({ entry }) => {
    if (!entry.delivery.auto || !D.isOpen(entry)) return;
    const item = byKey.get(entry.delivery.key);
    if (item) { Object.assign(entry.delivery, { title: item.title, components: item.components, monthly: Boolean(item.monthly), seq: item.seq || 0, total: item.total || 0 }); return; }
    if (entry.delivery.confirmedAt) { out.kept += 1; return; }
    Object.assign(entry, { status: 'cancelled', cancelReason: 'Its component was unticked when the plan was corrected', cancelledAt: now, cancelledByName: byName });
    entry.delivery.droppedAt = now;
    out.dropped += 1;
  });
  return out;
};

// ---- What the phase was sold with ----------------------------------------------------------------------------------
// One supply of the phase: its medicine request, else that request's purchase order. Without a request named it is
// the supply the medicine start date belongs to (the first one of the phase, also after the next one was requested).
const supplyOf = async (stage, request = startRequestOf(stage)) => {
  let supplyPlan = request?.supplyPlan || '';
  let supplyPart = request?.supplyPart || '';
  const poNumber = request?.poNumber || stage.purchaseOrder || '';
  if (!D.partMonthsOf(supplyPlan, supplyPart) && dbUp() && poNumber) {
    const po = await require('../models/PurchaseOrder').findOne({ poNumber }).select('supplyPlan supplyPart').lean();
    if (po) { supplyPlan = po.supplyPlan || ''; supplyPart = po.supplyPart || ''; }
  }
  return {
    requestId: String(request?.requestId || 'legacy'), poNumber, supplyPlan, supplyPart,
    months: D.partMonthsOf(supplyPlan, supplyPart), planMonths: D.planMonthsOf(supplyPlan),
  };
};
// The section D ticks: kept on the phase since conversion; for a phase converted earlier, read from its Treatment & PO paper.
const ticksOf = async (patient, stage) => {
  const own = D.cleanComponents(stage.delivery?.components);
  if (own.length) return { components: own, source: stage.delivery.componentsSource || 'paper' };
  if (!dbUp() || !stage.purchaseOrder) return { components: [], source: '' };
  const entry = await require('../models/AppointmentManagementEntry')
    .findOne({ 'postCounseling.outcome.patient': patient._id, 'postCounseling.purchase.values.poNo': stage.purchaseOrder }).select('postCounseling.record').lean();
  const components = D.cleanComponents(entry?.postCounseling?.record?.components?.selected);
  return { components, source: components.length ? 'paper' : '' };
};

const noticeOf = (result) => [
  result.created || !(result.moved || result.later || result.skipped) ? `${result.created} session${result.created === 1 ? '' : 's'} put on the calendar` : '',
  result.moved ? `${result.moved} moved with the new start date` : '',
  result.later ? `${result.later} more come when the next supply starts` : '',
  result.skipped ? `${result.skipped} left out because their day had already passed (they can be scheduled by hand)` : '',
].filter(Boolean).join(', ');

// A later supply of the phase (its own purchase order, any months) got its medicine start date, new or corrected
// (`request.medicineStartDate`): the plan goes on with it from that day. `askedMonths` counts only when the months of
// the supply are not on record. Throws, and nothing is saved, when the months are missing.
const continueDelivery = async (patient, stage, user, now, request, askedMonths = 0) => {
  const d = stage.delivery;
  if (!request.medicineStartDate) return { status: 'no_start', notice: '' };
  if (!d?.parts?.length || !d.phaseDays) return { status: 'no_plan', notice: '' };
  const startDay = D.dayOf(request.medicineStartDate);
  const [supply, holidays] = await Promise.all([supplyOf(stage, request), loadHolidays()]);
  const byName = user?.name || '';
  const part = d.parts.find((p) => p.requestId === supply.requestId);
  if (part) {
    if (part.startDate === startDay) return { status: 'unchanged', notice: '' };
    const before = part.startDate;
    part.startDate = startDay;
    const result = applyPlan(patient, stage, { byName, holidays, now, shiftPart: part });
    result.moved += followParts(patient, stage, d.parts.indexOf(part), before, { byName, holidays, now });
    log(patient, user, stage.number, `start date of the supply${supply.poNumber ? ` ${supply.poNumber}` : ''} corrected: ${before} -> ${startDay}; ${result.moved} session(s) moved`);
    return { status: 'moved', ...result, notice: `Treatment Delivery plan follows the new start date of this supply: ${result.moved} session${result.moved === 1 ? '' : 's'} moved${result.created ? `, ${result.created} added` : ''}. Sessions already confirmed, moved or done were not touched.` };
  }
  if (D.supplyDone(d)) return { status: 'covered', notice: '' };
  const covered = D.coveredDays(d.parts);
  const left = Math.ceil((d.phaseDays - covered) / 30);
  const own = supply.months || wholeNumber(askedMonths, 1, 12);
  if (!own) fail('The months of this supply are not on record. Choose how many months of medicine it is.');
  const months = Math.min(own, left);
  d.parts.push({ requestId: supply.requestId, poNumber: supply.poNumber, months, startDate: startDay, offsetDays: covered, source: 'transit', addedAt: now, addedByName: byName });
  Object.assign(d, { setupNeededAt: null, setupNeededWhy: '' });
  const result = applyPlan(patient, stage, { byName, holidays, now });
  const still = left - months;
  log(patient, user, stage.number, `next supply${supply.poNumber ? ` ${supply.poNumber}` : ''} of ${months} month(s) starts on ${startDay}: ${noticeOf(result)}`);
  return {
    status: 'extended', ...result, months, monthsLeft: still,
    notice: `Treatment Delivery: the next ${months} month${months === 1 ? '' : 's'} of the plan ${months === 1 ? 'is' : 'are'} scheduled from ${startDay}. ${noticeOf(result)}.${still > 0 ? ` ${still} month${still === 1 ? '' : 's'} of the phase still wait${still === 1 ? 's' : ''} for medicine.` : ''}`,
  };
};

// Called when a medicine start date is saved (new or corrected). Returns { status, notice } for the screen.
// Without `request` it is the start date of the phase (the first supply, stage.transit): the plan is made from it.
// With `request` it is the start date of that later supply: the plan goes on with it (continueDelivery).
const startDelivery = async (patient, stage, user, now = new Date(), { request = null, months: askedMonths = 0 } = {}) => {
  if (request) return continueDelivery(patient, stage, user, now, request, askedMonths);
  if (!stage.transit?.medicineStartDate) return { status: 'no_start', notice: '' };
  const startDay = D.dayOf(stage.transit.medicineStartDate);
  const [supply, ticks, rules, holidays] = await Promise.all([supplyOf(stage), ticksOf(patient, stage), loadRules(), loadHolidays()]);
  const byName = user?.name || '';
  const needs = (why, notice) => {
    const d = ensure(stage);
    if (ticks.components.length && !d.components.length) Object.assign(d, { components: ticks.components, componentsSource: ticks.source, componentsSetAt: now, componentsSetByName: byName });
    Object.assign(d, { setupNeededAt: d.setupNeededAt || now, setupNeededWhy: why });
    return { status: `needs_${why}`, notice };
  };

  if (stage.delivery?.parts?.length) {
    const d = stage.delivery;
    const alive = new Set([...(stage.medicineRequests || []), stage.medicineRequest].filter((r) => r && MEDICINE_ACTIVE.includes(r.status)).map((r) => String(r.requestId || 'legacy')));
    // Same supply: its start date was corrected. A supply whose request was cancelled and raised again is that same
    // supply too, and so is a date that falls in the first half of the supply already running (the next supply
    // cannot start that early: it is a correction made after the next request was raised).
    const last = d.parts[d.parts.length - 1];
    let part = d.parts.find((p) => p.requestId === supply.requestId);
    const replaced = part ? null : d.parts.find((p) => p.source === 'transit' && !alive.has(p.requestId));
    if (replaced) part = Object.assign(replaced, { requestId: supply.requestId, poNumber: supply.poNumber || replaced.poNumber });
    if (!part && last.source === 'transit' && startDay < D.addDays(last.startDate, Math.floor(last.months * 15))) part = last;
    if (part) {
      if (part.startDate === startDay) return { status: 'unchanged', notice: '' };
      const before = part.startDate;
      part.startDate = startDay;
      const result = applyPlan(patient, stage, { byName, holidays, now, shiftPart: part });
      result.moved += followParts(patient, stage, d.parts.indexOf(part), before, { byName, holidays, now });
      log(patient, user, stage.number, `plan moved to the start date ${startDay}: ${noticeOf(result)}`);
      return { status: 'moved', ...result, notice: `Treatment Delivery plan follows the new start date: ${result.moved} session${result.moved === 1 ? '' : 's'} moved${result.created ? `, ${result.created} added` : ''}. Sessions already confirmed, moved or done were not touched.` };
    }
    const covered = D.coveredDays(d.parts);
    if (D.supplyDone(d)) return { status: 'covered', notice: '' };
    if (!supply.months) return needs('months', 'Treatment Delivery: the months of this supply are not on record. Add the supply on the Treatment Delivery page so the rest of the plan is scheduled.');
    const months = Math.min(supply.months, Math.ceil((d.phaseDays - covered) / 30));
    d.parts.push({ requestId: supply.requestId, poNumber: supply.poNumber, months, startDate: startDay, offsetDays: covered, source: 'transit', addedAt: now, addedByName: byName });
    Object.assign(d, { setupNeededAt: null, setupNeededWhy: '' });
    const result = applyPlan(patient, stage, { byName, holidays, now });
    log(patient, user, stage.number, `next supply of ${months} month(s) started on ${startDay}: ${noticeOf(result)}`);
    return { status: 'extended', ...result, notice: `Treatment Delivery: the next ${months} month(s) of the plan are scheduled. ${noticeOf(result)}.` };
  }

  if (!ticks.components.length) return needs('components', 'Treatment Delivery: the section D ticks of this phase are not on record, so no sessions were made. Set the plan up on the Treatment Delivery page.');
  if (!supply.months) return needs('months', 'Treatment Delivery: the months of medicine supplied are not on record, so no sessions were made. Set the plan up on the Treatment Delivery page.');
  // The plan is as long as the phase (settings: 6 months), whatever months this purchase order carries; the later
  // purchase orders of the phase add theirs. A phase whose first supply started before this page existed ("rest"
  // with no plan before it): only the supply that starts now is planned.
  const planMonths = D.planLengthOf(supply, rules);
  const result = createPlan(patient, stage, { components: ticks.components, source: ticks.source, startDay, months: supply.months, planMonths, requestId: supply.requestId, poNumber: supply.poNumber, partSource: 'transit', byName, rules, holidays, now });
  log(patient, user, stage.number, `plan made from the start date ${startDay} (${supply.months} of ${planMonths} month(s)): ${noticeOf(result)}`);
  // The next supply was already with the patient when the treatment started (both handed over together): its start
  // date is asked for at once.
  const more = await supplyReceived(patient, stage, user, now);
  return { status: 'created', ...result, notice: `Treatment Delivery plan made: ${noticeOf(result)}.${more.notice ? ` ${more.notice}` : ''}` };
};

// A supply's start date moved (`before` -> its new date). Older plans continued by themselves on the receipt of the
// next supply (source 'receipt'): those supplies, when nobody corrected them by hand, keep following the supply
// before them. A supply whose start date a person filled never moves by itself. Returns the sessions moved.
const followParts = (patient, stage, index, before, { byName, holidays, now }) => {
  const d = stage.delivery;
  const requests = S.aliveRequests(stage);
  let moved = 0;
  let previousBefore = before;
  for (let i = index + 1; i < d.parts.length; i += 1) {
    const part = d.parts[i];
    const previous = d.parts[i - 1];
    if (part.source !== 'receipt') break;
    const request = requests.find((item) => requestKey(item) === part.requestId);
    const receivedAt = plain(request?.courier)?.deliveredAt || null;
    if (part.startDate !== S.autoStartDay({ startDate: previousBefore, months: previous.months }, receivedAt)) break;
    const next = S.autoStartDay(previous, receivedAt);
    if (next === part.startDate) break;
    previousBefore = part.startDate;
    part.startDate = next;
    moved += applyPlan(patient, stage, { byName, holidays, now, shiftPart: part }).moved;
  }
  return moved;
};

// The next supply of a running plan reached the patient (receipt / pickup confirmed). Nothing is dated or scheduled
// here: the PCC fills the medicine start date of that supply on the Medicine Explanations page (it is not explained
// again) and the plan goes on from that day (continueDelivery). This only tells the screen so. Called after every
// save that can confirm a receipt; changes nothing, so it is safe to call again.
const supplyReceived = async (patient, stage) => {
  const d = stage?.delivery;
  if (!d?.parts?.length || !d.phaseDays || D.supplyDone(d)) return { status: 'none', notice: '' };
  const request = S.receivedSupplies(stage)[0];
  if (!request) return { status: 'none', notice: '' };
  return {
    status: 'start_due', requestId: requestKey(request), poNumber: request.poNumber || '',
    notice: `Treatment Delivery: the patient has the next supply${request.poNumber ? ` (${request.poNumber})` : ''}. The PCC fills its medicine start date on the Medicine Explanations page (no new explanation); the rest of the plan is scheduled from that day.`,
  };
};

// Every alive copy of one medicine request (the same request can sit in medicineRequests[] and in medicineRequest).
const requestCopies = (stage, key) => [...(stage.medicineRequests || []), stage.medicineRequest]
  .filter((request) => request && MEDICINE_ACTIVE.includes(request.status) && requestKey(request) === key);
// A later supply keeps the day the patient starts it on its medicine request (the first supply's is stage.transit).
const stampStart = (stage, key, day, user, now, note = null) => requestCopies(stage, key).forEach((request) => Object.assign(request, {
  medicineStartDate: new Date(`${day}T00:00:00+05:30`), medicineStartSetAt: now, medicineStartSetByName: user?.name || '', ...(note === null ? {} : { medicineStartNote: note }),
}));

// The purchase orders of the phase, for the next-supply tracker (null when they cannot be read).
const PO_FIELDS = 'patient phase poNumber status supplyPlan supplyPart medicineRequestId createdAt';
const needsSupply = (stage) => Boolean(stage.delivery?.parts?.length && stage.delivery.phaseDays) && !D.supplyDone(stage.delivery);
const phasePos = async (patientId, phase) => (dbUp()
  ? require('../models/PurchaseOrder').find({ patient: patientId, phase, status: { $ne: 'cancelled' } }).select(PO_FIELDS).lean()
  : null);

const createPlan = (patient, stage, { components, source, startDay, months, planMonths, requestId, poNumber, partSource, byName, rules, holidays, now }) => {
  const d = ensure(stage);
  Object.assign(d, {
    components, componentsSource: d.componentsSource || source || 'manual', componentsSetAt: d.componentsSetAt || now, componentsSetByName: d.componentsSetByName || byName,
    setupNeededAt: null, setupNeededWhy: '', planMonths, phaseDays: planMonths * 30, rules,
  });
  d.parts.push({ requestId, poNumber, months, startDate: startDay, offsetDays: 0, source: partSource, addedAt: now, addedByName: byName });
  return applyPlan(patient, stage, { byName, holidays, now });
};

// ---- Views ----------------------------------------------------------------------------------------------------------
const sessionView = (entry, list, ticked, now) => {
  const d = entry.delivery;
  const state = D.stateOf(entry, now);
  return {
    id: String(entry._id), list, dateTime: iso(entry.dateTime), status: entry.status, state, stateLabel: D.STATE_LABELS[state],
    key: d.key, template: d.template, title: d.title || 'Session', auto: Boolean(d.auto), onRequest: Boolean(d.onRequest), role: d.role || 'pcc', mode: d.mode || '', duration: d.duration || 0,
    day: d.day || 0, monthly: Boolean(d.monthly), components: (d.components || []).map((key) => ({ key, label: D.COMPONENT_LABEL[key] || key })),
    confirmedAt: iso(d.confirmedAt), confirmedByName: d.confirmedByName || '', movedAt: iso(d.movedAt),
    missedAt: iso(d.missedAt), missReason: d.missReason || '', missedByName: d.missedByName || '',
    rescheduledFrom: d.rescheduledFrom || '', rescheduledTo: d.rescheduledTo || '', rescheduleReason: d.rescheduleReason || '',
    notes: entry.notes || '', createdByName: entry.createdByName || '',
    lines: D.isOpen(entry) ? D.checklistFor(d, ticked) : [],
    checklist: (d.checklist || []).map((line) => ({ key: line.key, text: line.text, section: line.section, answer: line.answer, reason: line.reason || '' })),
    close: d.close || null, adviceId: d.adviceId || '',
    completedAt: iso(entry.completedAt), completedByName: entry.completedByName || '', completedByRole: entry.completedByRole || '', completionDetails: entry.completionDetails || '',
    cancelReason: entry.cancelReason || '', cancelledAt: iso(entry.cancelledAt), cancelledByName: entry.cancelledByName || '',
  };
};

// Where a phase stands: none (older phase, no plan) / waiting (ticks on record, medicine not started) /
// setup (start date saved, a person must set the plan up) / running / delivered.
const statusOf = (stage, entries) => {
  const d = stage.delivery;
  if (!d?.parts?.length) {
    if (d?.setupNeededAt) return 'setup';
    if (!d) return 'none';
    return stage.transit?.medicineStartDate ? 'setup' : 'waiting';
  }
  return D.isDelivered(d, entries) ? 'delivered' : 'running';
};
const STATUS_LABELS = { none: 'No plan', waiting: 'Waiting for the medicine start date', setup: 'Set-up needed', running: 'Running', delivered: 'Delivered' };

const nextPhaseOf = (d, entries, rules, now) => {
  const end = D.phaseEndDay(d);
  const delivered = D.isDelivered(d, entries);
  const decision = d.nextPhase?.decision ? d.nextPhase : null;
  return {
    due: delivered || Boolean(end && D.diffDays(end, D.dayOf(now)) <= rules.nextPhaseAlertDays),
    delivered, endDate: end, opensOn: end ? D.addDays(end, -rules.nextPhaseAlertDays) : null, decision,
    callBackDue: Boolean(decision?.decision === 'time' && decision.followUpAt && new Date(decision.followUpAt) <= now),
    history: d.nextPhaseHistory || [],
  };
};

const planView = async (patient, number, user, now = new Date()) => {
  const stage = (patient.stages || []).find((s) => s.number === Number(number));
  if (!stage) fail('Phase not found', 404);
  const d = stage.delivery || null;
  const [supply, ticks, current] = await Promise.all([supplyOf(stage), ticksOf(patient, stage), d?.rules ? null : loadRules()]);
  const rules = D.cleanRules(d?.rules || current);
  const pairs = planEntries(stage);
  const entries = pairs.map(({ entry }) => entry);
  const sessions = pairs.map(({ entry, list }) => sessionView(entry, list, d?.components || [], now)).sort((a, b) => new Date(a.dateTime) - new Date(b.dateTime));
  const status = statusOf(stage, entries);
  const hasPlan = Boolean(d?.parts?.length);
  let queries = null;
  if (hasPlan && dbUp()) {
    const rows = await require('../models/AdviceRequest').find({ patient: patient._id, stage: stage.number }).select('resolvedAt').lean();
    queries = { total: rows.length, solved: rows.filter((row) => row.resolvedAt).length };
  }
  const family = (stage.familySessions || []);
  const famKeys = new Set(pairs.filter(({ entry }) => entry.delivery.template === 'fam' && !(entry.status === 'cancelled' && !entry.delivery.rescheduledTo)).map(({ entry }) => entry.delivery.key));
  const startDate = stage.transit?.medicineStartDate ? D.dayOf(stage.transit.medicineStartDate) : '';
  const nextSupply = needsSupply(stage) ? S.nextSupplyOf({ stage, pos: await phasePos(patient._id, stage.number), now }) : null;
  return {
    patient: { id: String(patient._id), name: patient.patientName, code: patient.patientCode || '', phone: String(patient.number || ''), pccId: pccIdOf(patient), pccName: patient.assignedDoctor?.name || '' },
    phase: stage.number, purchaseOrder: stage.purchaseOrder || '', status, statusLabel: STATUS_LABELS[status],
    canAct: mayAct(user, patient), isAdmin: isAdminLike(user),
    setup: {
      needed: status === 'setup' || status === 'none', why: d?.setupNeededWhy || '',
      components: ticks.components, source: ticks.source, startDate, months: supply.months, planMonths: supply.months ? D.planLengthOf(supply, rules) : rules.phaseMonths,
      options: COMPONENTS.map((c) => ({ key: c.key, label: c.label, scope: c.scope })),
    },
    delivery: hasPlan ? {
      components: d.components.map((key) => ({ key, label: D.COMPONENT_LABEL[key] || key })), componentsSource: d.componentsSource || '', componentsSetAt: iso(d.componentsSetAt), componentsSetByName: d.componentsSetByName || '',
      planMonths: d.planMonths, phaseDays: d.phaseDays, coveredDays: D.coveredDays(d.parts), endDate: D.phaseEndDay(d), followUpsPromised: d.followUpsPromised || 0,
      // "No further supply in this phase": the phase ends with the medicine on record.
      supplyClosed: d.supplyClosedAt ? { at: iso(d.supplyClosedAt), byName: d.supplyClosedByName || '', note: d.supplyClosedNote || '' } : null,
      canCloseSupply: !d.supplyClosedAt && D.coveredDays(d.parts) < d.phaseDays,
      parts: d.parts.map((part, index) => ({ index, requestId: part.requestId || '', poNumber: part.poNumber || '', months: part.months, startDate: part.startDate, endDate: D.addDays(part.startDate, part.months * 30 - 1), offsetDays: part.offsetDays || 0, source: part.source || 'transit', addedAt: iso(part.addedAt), addedByName: part.addedByName || '' })),
      generatedAt: iso(d.generatedAt), generatedByName: d.generatedByName || '',
      reschedulesUsed: d.reschedulesUsed || 0, rescheduleLimit: rules.rescheduleLimit, confirmWindowDays: rules.confirmWindowDays,
      skipped: (d.skipped || []).map((item) => ({ key: item.key, title: item.title, day: item.day, reason: item.reason || '' })),
    } : null,
    sessions,
    manual: LISTS.flatMap((list) => (stage[list] || []).filter((entry) => !entry.delivery?.key).map((entry) => ({ id: String(entry._id), list, dateTime: iso(entry.dateTime), status: entry.status, followUpType: entry.followUpType || 'normal', notes: String(entry.notes || '').slice(0, 200), completedAt: iso(entry.completedAt) })))
      .sort((a, b) => new Date(a.dateTime) - new Date(b.dateTime)),
    tasks: hasPlan ? (d.tasks || []).map((task) => ({ key: task.key, title: task.title, day: task.day, dueDate: iso(task.dueDate), doneAt: iso(task.doneAt), doneByName: task.doneByName || '', note: task.note || '', due: !task.doneAt && Boolean(task.dueDate) && D.dayOf(task.dueDate) <= D.dayOf(now) })) : [],
    tracker: hasPlan ? D.trackerOf({
      components: d.components, sessions: entries.map((entry) => ({ state: D.stateOf(entry, now), delivery: entry.delivery })), followUpsPromised: d.followUpsPromised, planMonths: d.planMonths,
      explanationDone: Boolean(stage.transit?.explanationCompletedAt), familyDone: family.filter((entry) => entry.status === 'completed').length, familyBooked: family.filter((entry) => entry.status !== 'cancelled').length, queries,
    }) : [],
    alerts: hasPlan ? D.alertsOf({ delivery: d, sessions: entries, now, rules, supply: nextSupply }) : [],
    // The medicine came in parts: where the next part stands (PO -> payment -> medicine -> receipt). Null once covered.
    nextSupply,
    progress: D.progressOf(entries, now),
    nextPhase: hasPlan ? nextPhaseOf(d, entries, rules, now) : null,
    family: { used: famKeys.size, limit: D.FAMILY_LIMIT, ticked: Boolean(d?.components?.includes('familyCounselling')) },
    sensoryTicked: Boolean(d?.components?.includes('sensoryGuidance')),
    options: { missReasons: D.MISS_REASONS, understanding: D.UNDERSTANDING, recording: D.RECORDING, closedWeekdays: rules.closedWeekdays, defaultHour: rules.defaultHour },
  };
};

const respond = async (req, res, patient, number, extra = {}) => {
  await patient.save();
  await patient.populate('assignedDoctor', 'name');
  changed(req, patient, number);
  res.json({ success: true, plan: await planView(patient.toObject(), number, req.user), ...extra });
};

// ---- Lists ----------------------------------------------------------------------------------------------------------
const ENTRY_FIELDS = ['_id', 'dateTime', 'status', 'delivery.key', 'delivery.title', 'delivery.template', 'delivery.auto', 'delivery.monthly', 'delivery.confirmedAt', 'delivery.missedAt', 'delivery.rescheduledTo'];
// What the plan reads of a medicine request: which supply it is and how far it got.
const REQUEST_FIELDS = ['requestId', 'status', 'requestedAt', 'supplyPlan', 'supplyPart', 'poNumber', 'explainedAt', 'madeAt', 'sentToCourierAt', 'medicineStartDate', 'courier.status', 'courier.deliveredAt', 'courier.dispatchedAt']
  .flatMap((field) => [`stages.medicineRequest.${field}`, `stages.medicineRequests.${field}`]).join(' ');
const LIST_FIELDS = ['patientName patientCode number assignedDoctor approvalStatus isActive stages.number stages.purchaseOrder stages.transit.medicineStartDate stages.delivery', REQUEST_FIELDS,
  ...LISTS.flatMap((list) => ENTRY_FIELDS.map((field) => `stages.${list}.${field}`))].join(' ');

// One row per phase that has a plan (or waits for one), for this person: everything of the Admin / Manager / Doctor,
// own patients of a PCC.
const worklistRows = (user) => cached(`delivery:worklist:${seesAll(user) ? 'all' : user._id}`, async () => {
  const filter = { isActive: { $ne: false }, 'stages.delivery': { $exists: true } };
  if (!seesAll(user)) filter.assignedDoctor = user._id;
  const patients = await Patient.find(filter).select(LIST_FIELDS).populate('assignedDoctor', 'name').lean();
  const now = new Date();
  const rows = [];
  // One read for the purchase orders of every plan that still waits for a supply.
  const waiting = patients.filter((patient) => (patient.stages || []).some(needsSupply)).map((patient) => patient._id);
  const poRows = waiting.length && dbUp() ? await require('../models/PurchaseOrder').find({ patient: { $in: waiting }, status: { $ne: 'cancelled' } }).select(PO_FIELDS).lean() : null;
  const posOf = (patient, stage) => (poRows ? poRows.filter((po) => String(po.patient) === String(patient._id) && po.phase === stage.number) : null);
  for (const patient of patients) for (const stage of patient.stages || []) {
    const d = stage.delivery;
    if (!d) continue;
    const entries = planEntries(stage).map(({ entry }) => entry);
    const status = statusOf(stage, entries);
    const hasPlan = Boolean(d.parts?.length);
    const rules = D.cleanRules(d.rules);
    const open = entries.filter((entry) => D.isOpen(entry)).sort((a, b) => new Date(a.dateTime) - new Date(b.dateTime));
    const brief = (entry) => { const state = D.stateOf(entry, now); return { id: String(entry._id), title: entry.delivery.title || 'Session', at: iso(entry.dateTime), state, stateLabel: D.STATE_LABELS[state] }; };
    const nextSupply = needsSupply(stage) ? S.nextSupplyOf({ stage, pos: posOf(patient, stage), now }) : null;
    rows.push({
      patientId: String(patient._id), patientName: patient.patientName, patientCode: patient.patientCode || '', phone: String(patient.number || ''), pccName: patient.assignedDoctor?.name || '',
      phase: stage.number, purchaseOrder: stage.purchaseOrder || '', status, statusLabel: STATUS_LABELS[status], setupNeededAt: iso(d.setupNeededAt), setupNeededWhy: d.setupNeededWhy || '',
      startDate: d.parts?.[0]?.startDate || (stage.transit?.medicineStartDate ? D.dayOf(stage.transit.medicineStartDate) : ''), endDate: hasPlan ? D.phaseEndDay(d) : null,
      planMonths: d.planMonths || 0, coveredMonths: Math.round(D.coveredDays(d.parts) / 30),
      progress: D.progressOf(entries, now), alerts: hasPlan ? D.alertsOf({ delivery: d, sessions: entries, now, rules, supply: nextSupply }) : [],
      nextSupply: nextSupply ? { stage: nextSupply.stage, level: nextSupply.level, text: nextSupply.text, headline: nextSupply.headline, daysLeft: nextSupply.daysLeft, monthsLeft: nextSupply.monthsLeft, poNumber: nextSupply.poNumber, owner: nextSupply.owner } : null,
      open: open.map(brief), nextPhase: hasPlan ? { ...nextPhaseOf(d, entries, rules, now), history: undefined } : null,
    });
  }
  return rows.sort((a, b) => a.patientName.localeCompare(b.patientName));
}, { ttl: 60 * 1000 });

// @route GET /api/delivery/worklist
const getWorklist = asyncHandler(async (req, res) => {
  res.json({ success: true, rows: await worklistRows(req.user), today: D.dayOf(new Date()) });
});

// Open delivery work of this person (sidebar count, My Day): plans to set up, sessions to confirm in the next 7 days,
// missed sessions to reschedule, session forms due, PCC tasks due and next-phase decisions waiting.
// A session whose date simply passed is already counted as a late follow-up on the Follow Ups page.
const WORK_TYPES = new Set(['missed', 'form', 'confirm', 'task']);
const deliveryWork = async (user) => {
  const out = [];
  (await worklistRows(user)).forEach((row) => {
    const base = { patientId: row.patientId, patientName: row.patientName, patientCode: row.patientCode, phase: row.phase };
    if (row.status === 'setup') out.push({ ...base, id: `${row.patientId}-${row.phase}-setup`, what: 'Set up the Treatment Delivery plan', due: row.setupNeededAt, level: 'red' });
    row.alerts.filter((alert) => WORK_TYPES.has(alert.type) || (['next_phase', 'supply'].includes(alert.type) && alert.level === 'red'))
      .forEach((alert) => out.push({ ...base, id: `${row.patientId}-${row.phase}-${alert.type}-${alert.sessionId || alert.taskKey || ''}`, what: alert.text, due: alert.at || null, level: alert.level }));
  });
  return out;
};

// @route GET /api/delivery/patients/:patientId/:number
const getPlan = asyncHandler(async (req, res) => {
  const { patientId, number } = req.params;
  if (!mongoose.isValidObjectId(patientId)) fail('Patient not found', 404);
  const patient = await Patient.findById(patientId)
    .select(`patientName patientCode number assignedDoctor approvalStatus isActive stages.number stages.purchaseOrder stages.delivery stages.followUps stages.familySessions stages.transit.medicineStartDate stages.transit.explanationCompletedAt ${REQUEST_FIELDS}`)
    .populate('assignedDoctor', 'name').lean();
  if (!patient) fail('Patient not found', 404);
  if (!mayAct(req.user, patient)) fail('This patient is not assigned to you', 403);
  res.json({ success: true, plan: await planView(patient, number, req.user) });
});

// ---- Set-up ---------------------------------------------------------------------------------------------------------
const wholeNumber = (value, min, max) => { const n = Number(value); return Number.isInteger(n) && n >= min && n <= max ? n : 0; };

// @route POST /api/delivery/patients/:patientId/:number/setup   { components, startDate?, months?, planMonths? }
// Makes the plan of a phase that has none (ticks or months were not on record, or an older phase), or corrects the
// ticks of a running plan (Admin / Manager).
const setupPlan = asyncHandler(async (req, res) => {
  const { patient, stage } = await load(req);
  const components = D.cleanComponents(req.body.components);
  if (!components.length) fail('Tick at least one component of section D');
  const now = new Date();
  const byName = req.user.name;
  const [supply, rules, holidays] = await Promise.all([supplyOf(stage), loadRules(), loadHolidays()]);
  if (stage.delivery?.parts?.length) {
    if (!isAdminLike(req.user)) fail('Only the Admin or the Manager corrects the ticks of a running plan', 403);
    const d = stage.delivery;
    Object.assign(d, { components, componentsSource: 'manual', componentsSetAt: now, componentsSetByName: byName });
    const sync = syncTicks(stage, { byName, now });
    const result = applyPlan(patient, stage, { byName, holidays, now });
    const summary = `ticks corrected (${components.map((key) => D.COMPONENT_LABEL[key]).join(', ')}): ${result.created} session(s) added, ${sync.dropped} cancelled${sync.kept ? `, ${sync.kept} already confirmed left for you to decide` : ''}`;
    log(patient, req.user, stage.number, summary);
    return respond(req, res, patient, stage.number, { message: `Plan updated: ${result.created} session(s) added, ${sync.dropped} cancelled${sync.kept ? `. ${sync.kept} confirmed session(s) of unticked components are still on the calendar: mark them not needed if they should go.` : '.'}` });
  }
  const transitDay = stage.transit?.medicineStartDate ? D.dayOf(stage.transit.medicineStartDate) : '';
  const startDay = transitDay || String(req.body.startDate || '');
  if (!D.validDay(startDay)) fail('Choose the medicine start date');
  if (D.diffDays(startDay, D.dayOf(now)) > 60) fail('The start date can be at most 60 days ahead');
  const months = supply.months || wholeNumber(req.body.months, 1, 12);
  if (!months) fail('Enter the months of medicine supplied (1 to 12)');
  const derived = supply.months ? D.planLengthOf(supply, rules) : 0;
  const planMonths = derived || wholeNumber(req.body.planMonths, months, 12) || Math.max(months, rules.phaseMonths);
  const result = createPlan(patient, stage, {
    components, source: 'manual', startDay, months, planMonths, requestId: transitDay ? supply.requestId : '', poNumber: supply.poNumber,
    partSource: transitDay ? 'transit' : 'manual', byName, rules, holidays, now,
  });
  Object.assign(stage.delivery, { components, componentsSource: 'manual', componentsSetAt: now, componentsSetByName: byName });
  log(patient, req.user, stage.number, `plan set up from ${startDay} (${months} of ${planMonths} month(s)): ${noticeOf(result)}`);
  return respond(req, res, patient, stage.number, { message: `Plan made: ${noticeOf(result)}.` });
});

// @route POST /api/delivery/patients/:patientId/:number/parts   { startDate, months } | { index, startDate }
// The next supply of medicine started (when its start date did not come through the Medicine Explanations page),
// or the start date of a supply added here is corrected.
const savePart = asyncHandler(async (req, res) => {
  const { patient, stage } = await load(req);
  const d = planOf(stage);
  const now = new Date();
  const startDay = String(req.body.startDate || '');
  if (!D.validDay(startDay)) fail('Choose the start date of this supply');
  if (D.diffDays(startDay, D.dayOf(now)) > 60) fail('The start date can be at most 60 days ahead');
  const holidays = await loadHolidays();
  if (req.body.index !== undefined && req.body.index !== null && req.body.index !== '') {
    const index = Number(req.body.index);
    const part = d.parts[index];
    if (!part) fail('Supply not found');
    if (!['manual', 'receipt'].includes(part.source) && !isAdminLike(req.user)) fail('This start date comes from the Medicine Explanations page. Correct it there.');
    if (index > 0 && startDay <= d.parts[index - 1].startDate) fail('This supply cannot start before the earlier one');
    if (d.parts[index + 1] && startDay >= d.parts[index + 1].startDate) fail('This supply cannot start after the next one');
    const before = part.startDate;
    part.startDate = startDay;
    if (part.requestId && part.requestId !== requestKey(startRequestOf(stage))) stampStart(stage, part.requestId, startDay, req.user, now);
    const result = applyPlan(patient, stage, { byName: req.user.name, holidays, now, shiftPart: part });
    result.moved += followParts(patient, stage, index, before, { byName: req.user.name, holidays, now });
    log(patient, req.user, stage.number, `start date of supply ${index + 1} corrected: ${before} -> ${startDay}; ${result.moved} session(s) moved`);
    return respond(req, res, patient, stage.number, { message: `Start date corrected. ${result.moved} session(s) moved; sessions already confirmed, moved or done were not touched.` });
  }
  const covered = D.coveredDays(d.parts);
  if (covered >= d.phaseDays) fail(`The ${d.planMonths} month(s) of this plan are already covered by the supplies on record`);
  if (d.supplyClosedAt) fail('This phase is closed as "no further supply". Reopen it first.');
  const left = Math.ceil((d.phaseDays - covered) / 30);
  const months = wholeNumber(req.body.months, 1, 12);
  if (!months) fail('Enter the months of medicine in this supply');
  if (months > left) fail(`Only ${left} month(s) of the plan are left`);
  if (startDay <= d.parts[d.parts.length - 1].startDate) fail('The next supply cannot start before the earlier one');
  // The request this supply is (sent by the tracker), so its start date is not asked for again on Medicine Explanations.
  const named = S.openSupplies(stage).find((request) => requestKey(request) === text(req.body.requestId, 80));
  d.parts.push({ requestId: named ? requestKey(named) : '', poNumber: text(req.body.poNumber, 80) || named?.poNumber || '', months, startDate: startDay, offsetDays: covered, source: 'manual', addedAt: now, addedByName: req.user.name });
  if (named) stampStart(stage, requestKey(named), startDay, req.user, now);
  Object.assign(d, { setupNeededAt: null, setupNeededWhy: '' });
  const result = applyPlan(patient, stage, { byName: req.user.name, holidays, now });
  log(patient, req.user, stage.number, `next supply of ${months} month(s) added from ${startDay}: ${noticeOf(result)}`);
  return respond(req, res, patient, stage.number, { message: `Next supply added: ${noticeOf(result)}.` });
});

// @route POST /api/delivery/patients/:patientId/:number/supply-closed   { closed: true, note } | { closed: false }
// "No further supply in this phase": the months of the phase that have no medicine are not waited for any more (the
// parent stopped, or the phase was sold shorter). The phase then ends with the medicine on record and its next-phase
// options open. Nothing is removed, and it can be reopened; a new medicine request of the phase reopens it by itself.
const closeSupply = asyncHandler(async (req, res) => {
  const { patient, stage } = await load(req);
  const d = planOf(stage);
  const now = new Date();
  if (req.body.closed === false || req.body.closed === 'false') {
    if (!d.supplyClosedAt) fail('This phase is not closed');
    log(patient, req.user, stage.number, `"no further supply" reopened (it was closed by ${d.supplyClosedByName || 'someone'}${d.supplyClosedNote ? `: ${d.supplyClosedNote}` : ''})`);
    d.supplyClosedAt = null;
    return respond(req, res, patient, stage.number, { message: 'Reopened: the plan waits for the next supply again.' });
  }
  const covered = D.coveredDays(d.parts);
  if (covered >= d.phaseDays) fail('Every month of this plan already has its medicine');
  if (d.supplyClosedAt) fail('This phase is already closed as "no further supply"');
  const open = S.openSupplies(stage)[0];
  if (open) fail(`The next supply of this phase is already requested${open.poNumber ? ` (${open.poNumber})` : ''}. Fill its medicine start date, or cancel that request first.`);
  const note = text(req.body.note, 500);
  if (note.length < 3) fail('Write why no further supply is coming in this phase');
  Object.assign(d, { supplyClosedAt: now, supplyClosedByName: req.user.name, supplyClosedNote: note });
  const months = Math.round(covered / 30);
  log(patient, req.user, stage.number, `closed as "no further supply" with ${months} of ${d.planMonths} month(s) of medicine: ${note}`);
  return respond(req, res, patient, stage.number, { message: `Closed: the phase ends with the ${months} month${months === 1 ? '' : 's'} of medicine on record.` });
});

// ---- Sessions -------------------------------------------------------------------------------------------------------
// A date a person chooses for a session: from now on, a working day, and no other plan session of the patient that day.
const checkSlot = async (patient, value, { rules, now, exceptId = '' }) => {
  const at = new Date(value);
  if (!value || Number.isNaN(at.getTime())) fail('Choose the date and time');
  if (at.getTime() < now.getTime() - 10 * 60000) fail('Choose a date and time from now on');
  if (at.getTime() > now.getTime() + 400 * DAY_MS) fail('Choose a date within the coming year');
  const day = D.dayOf(at);
  if (rules.closedWeekdays.includes(D.weekdayOf(day))) fail(`${WEEKDAYS[D.weekdayOf(day)]} is a closed day. Choose another day.`);
  if ((await loadHolidays()).has(day)) fail(`${day} is a holiday. Choose another day.`);
  const problem = slotProblem(at);
  if (problem) fail(problem.replace(' for the medicine explanation', ''));
  const clash = (patient.stages || []).flatMap((stage) => planEntries(stage)).map(({ entry }) => entry)
    .find((entry) => entry.status === 'scheduled' && String(entry._id) !== String(exceptId) && D.dayOf(entry.dateTime) === day);
  if (clash) fail(`"${clash.delivery.title}" is already on ${day} for this patient. One session a day: choose another day.`);
  return at;
};
const BASE_INFO = ['auto', 'key', 'template', 'title', 'components', 'day', 'seq', 'total', 'monthly', 'role', 'mode', 'duration', 'onRequest'];

// @route POST /api/delivery/patients/:patientId/:number/confirm   { entryIds: [] } | { window: true }
// Tentative -> confirmed: the date was told to the parent.
const confirmSessions = asyncHandler(async (req, res) => {
  const { patient, stage } = await load(req);
  const d = planOf(stage);
  const now = new Date();
  const rules = D.cleanRules(d.rules);
  const ids = new Set((Array.isArray(req.body.entryIds) ? req.body.entryIds : []).map(String));
  const until = now.getTime() + rules.confirmWindowDays * DAY_MS;
  const picked = planEntries(stage).map(({ entry }) => entry).filter((entry) => D.stateOf(entry, now) === 'tentative'
    && (req.body.window ? new Date(entry.dateTime).getTime() <= until : ids.has(String(entry._id))));
  if (!picked.length) fail(req.body.window ? `No tentative session in the next ${rules.confirmWindowDays} days` : 'Choose a tentative session to confirm');
  picked.forEach((entry) => Object.assign(entry.delivery, { confirmedAt: now, confirmedByName: req.user.name }));
  log(patient, req.user, stage.number, `${picked.length} session(s) confirmed with the parent: ${picked.map((entry) => `${entry.delivery.title} (${when(entry.dateTime)})`).join('; ').slice(0, 900)}`);
  return respond(req, res, patient, stage.number, { message: `${picked.length} session(s) confirmed` });
});

// @route POST /api/delivery/patients/:patientId/:number/sessions/:entryId/missed   { reason }
const markMissed = asyncHandler(async (req, res) => {
  const { patient, stage } = await load(req);
  planOf(stage);
  const { entry } = findEntry(stage, req.params.entryId);
  const now = new Date();
  if (!D.isOpen(entry)) fail('This session is already closed');
  if (entry.delivery.missedAt) fail('This session is already marked missed. Reschedule it.');
  if (D.dayOf(entry.dateTime) > D.dayOf(now)) fail('A session can be marked missed on its day or later. To change its date, reschedule it.');
  const reason = text(req.body.reason, 300);
  if (!reason) fail('Choose why the session was missed');
  Object.assign(entry.delivery, { missedAt: now, missReason: reason, missedByName: req.user.name });
  log(patient, req.user, stage.number, `"${entry.delivery.title}" (${when(entry.dateTime)}) marked missed: ${reason}`);
  return respond(req, res, patient, stage.number, { message: 'Marked missed. Reschedule it now.' });
});

// @route POST /api/delivery/patients/:patientId/:number/sessions/:entryId/reschedule   { dateTime, reason, confirmed? }
// A tentative date simply moves. A confirmed or missed session keeps its record: it is closed as rescheduled and a
// new linked session is made; that counts towards the phase's reschedule limit.
const rescheduleSession = asyncHandler(async (req, res) => {
  const { patient, stage } = await load(req);
  const d = planOf(stage);
  const { entry, list } = findEntry(stage, req.params.entryId);
  const now = new Date();
  const rules = D.cleanRules(d.rules);
  if (!D.isOpen(entry)) fail('This session is already closed');
  const at = await checkSlot(patient, req.body.dateTime, { rules, now, exceptId: entry._id });
  const reason = text(req.body.reason, 300);
  const confirmed = req.body.confirmed ? { confirmedAt: now, confirmedByName: req.user.name } : {};
  const before = when(entry.dateTime);
  if (!entry.delivery.confirmedAt && !entry.delivery.missedAt) {
    entry.dateTime = at;
    Object.assign(entry.delivery, { movedAt: now, ...(reason ? { rescheduleReason: reason } : {}), ...confirmed });
    log(patient, req.user, stage.number, `"${entry.delivery.title}" moved: ${before} -> ${when(at)}${reason ? ` | ${reason}` : ''}`);
    return respond(req, res, patient, stage.number, { message: `Moved to ${when(at)}` });
  }
  if (!reason) fail('Write the reason for rescheduling');
  if ((d.reschedulesUsed || 0) >= rules.rescheduleLimit && !isAdminLike(req.user)) fail(`All ${rules.rescheduleLimit} reschedules of this phase are used. Ask the Admin or the Manager to reschedule this session.`, 403);
  const info = plain(entry.delivery);
  stage[list].push({
    dateTime: at, status: 'scheduled', followUpType: entry.followUpType || 'normal', notes: entry.notes || '', createdByName: req.user.name,
    delivery: { ...Object.fromEntries(BASE_INFO.map((key) => [key, info[key]])), rescheduledFrom: String(entry._id), rescheduleReason: reason, movedAt: now, ...confirmed },
  });
  const fresh = stage[list][stage[list].length - 1];
  Object.assign(entry, { status: 'cancelled', cancelReason: `Rescheduled to ${when(at)}: ${reason}`, cancelledAt: now, cancelledByName: req.user.name });
  entry.delivery.rescheduledTo = String(fresh._id);
  d.reschedulesUsed = (d.reschedulesUsed || 0) + 1;
  log(patient, req.user, stage.number, `"${info.title}" rescheduled: ${before} -> ${when(at)} | ${reason} (reschedule ${d.reschedulesUsed} of ${rules.rescheduleLimit})`);
  return respond(req, res, patient, stage.number, { message: `Rescheduled to ${when(at)} (${d.reschedulesUsed} of ${rules.rescheduleLimit} reschedules used)` });
});

// @route POST /api/delivery/patients/:patientId/:number/sessions/:entryId/complete   { checklist: [{ key, answer, reason }], close }
// The session console: every line Done or N/A, then the closing form. A red flag goes to the doctor as an urgent query.
const completeSession = asyncHandler(async (req, res) => {
  const { patient, stage } = await load(req);
  const d = stage.delivery || fail('This phase has no Treatment Delivery plan yet');
  const { entry } = findEntry(stage, req.params.entryId);
  const now = new Date();
  if (!D.isOpen(entry)) fail('This session is already closed');
  if (D.dayOf(entry.dateTime) > D.dayOf(now)) fail(`This session is on ${when(entry.dateTime)}. If it was taken earlier, move its date to today first.`);
  const lines = D.checklistFor(entry.delivery, d.components || []);
  const { checklist, close } = D.cleanSubmission(lines, req.body);
  let adviceId = '';
  if (close.redFlag) {
    const query = `RED FLAG in "${entry.delivery.title}" (Phase ${stage.number}): ${close.concern}`;
    const advice = await require('../models/AdviceRequest').create({
      patient: patient._id, stage: stage.number, query, askedAt: now, isUrgent: true,
      requestedBy: req.user._id, requestedByName: req.user.name, requestedByRole: req.user.role,
      timeline: [{ at: now, action: 'Query raised (emergency)', details: query.slice(0, 1000), byName: req.user.name, byRole: req.user.role }],
    });
    adviceId = String(advice._id);
    const io = req.app?.get?.('io');
    ['advice:doctors', `enquiry:user:${req.user._id}`, 'enquiry:admins', 'enquiry:managers'].forEach((room) => io?.to(room).emit('advice:changed', { id: adviceId }));
  }
  entry.delivery.checklist = checklist;
  entry.delivery.close = { ...close, at: now, byName: req.user.name, byRole: req.user.role };
  if (adviceId) entry.delivery.adviceId = adviceId;
  Object.assign(entry, { status: 'completed', completedAt: now, completedByName: req.user.name, completedByRole: req.user.role, completionDetails: D.summaryOf(checklist, close) });
  log(patient, req.user, stage.number, `"${entry.delivery.title}" done. ${entry.completionDetails}`.slice(0, 1500));
  return respond(req, res, patient, stage.number, { message: close.redFlag ? 'Session closed. The red flag was sent to the doctor as an urgent query.' : 'Session closed', adviceId });
});

// @route POST /api/delivery/patients/:patientId/:number/sessions/:entryId/cancel   { reason }   (Admin / Manager)
const cancelSession = asyncHandler(async (req, res) => {
  if (!isAdminLike(req.user)) fail('Only the Admin or the Manager marks a plan session not needed', 403);
  const { patient, stage } = await load(req);
  const { entry } = findEntry(stage, req.params.entryId);
  if (!D.isOpen(entry)) fail('This session is already closed');
  const reason = text(req.body.reason, 300);
  if (reason.length < 5) fail('Write why this session is not needed');
  Object.assign(entry, { status: 'cancelled', cancelReason: reason, cancelledAt: new Date(), cancelledByName: req.user.name });
  log(patient, req.user, stage.number, `"${entry.delivery.title}" (${when(entry.dateTime)}) marked not needed: ${reason}`);
  return respond(req, res, patient, stage.number, { message: 'Marked not needed. It stays on record.' });
});

// @route POST /api/delivery/patients/:patientId/:number/on-request   { kind: 'family' | 'sensory', dateTime, note }
// Family counselling (up to 3 in a phase) and an extra sensory session are booked when the family needs one.
const bookOnRequest = asyncHandler(async (req, res) => {
  const { patient, stage } = await load(req);
  const d = planOf(stage);
  const now = new Date();
  const kind = req.body.kind === 'family' ? 'family' : req.body.kind === 'sensory' ? 'sensory' : fail('Choose the session to book');
  const component = kind === 'family' ? 'familyCounselling' : 'sensoryGuidance';
  if (!d.components.includes(component)) fail(`${D.COMPONENT_LABEL[component]} is not ticked on this phase's Treatment & PO paper`);
  const template = kind === 'family' ? 'fam' : 'sens';
  const prefix = kind === 'family' ? 'fam:' : 'sens:x';
  const same = planEntries(stage).map(({ entry }) => entry).filter((entry) => entry.delivery.key.startsWith(prefix));
  const live = new Set(same.filter((entry) => !(entry.status === 'cancelled' && !entry.delivery.rescheduledTo)).map((entry) => entry.delivery.key));
  if (kind === 'family' && live.size >= D.FAMILY_LIMIT) fail(`All ${D.FAMILY_LIMIT} family counselling sessions of this phase are used`);
  const n = new Set(same.map((entry) => entry.delivery.key)).size + 1;
  const at = await checkSlot(patient, req.body.dateTime, { rules: D.cleanRules(d.rules), now });
  const base = D.TEMPLATES[template];
  const title = kind === 'family' ? `Family counselling session ${live.size + 1} of ${D.FAMILY_LIMIT}` : 'Sensory guidance: extra session (on request)';
  const list = kind === 'family' ? 'familySessions' : 'followUps';
  stage[list].push({
    dateTime: at, status: 'scheduled', followUpType: 'normal', notes: text(req.body.note, 500), createdByName: req.user.name,
    delivery: { auto: false, onRequest: true, key: `${prefix}${n}`, template, title, components: [component], role: base.by, mode: base.mode, duration: base.duration, confirmedAt: now, confirmedByName: req.user.name },
  });
  log(patient, req.user, stage.number, `"${title}" booked for ${when(at)}`);
  return respond(req, res, patient, stage.number, { message: `${title} booked for ${when(at)}` });
});

// @route POST /api/delivery/patients/:patientId/:number/add   { key, dateTime? }
// A plan item that was left out because its day had passed when the plan was made is scheduled now.
const addSkipped = asyncHandler(async (req, res) => {
  const { patient, stage } = await load(req);
  const d = planOf(stage);
  const now = new Date();
  const key = String(req.body.key || '');
  if (!d.skipped.some((item) => item.key === key)) fail('This item is not waiting to be scheduled');
  const at = req.body.dateTime ? await checkSlot(patient, req.body.dateTime, { rules: D.cleanRules(d.rules), now }) : null;
  applyPlan(patient, stage, { byName: req.user.name, holidays: await loadHolidays(), now, keep: new Set([key]) });
  const made = planEntries(stage).map(({ entry }) => entry).find((entry) => entry.delivery.key === key && entry.status === 'scheduled');
  if (!made) fail('This item belongs to a supply that has not started yet');
  if (at) Object.assign(made, { dateTime: at });
  if (at) made.delivery.movedAt = now;
  made.createdByName = req.user.name;
  log(patient, req.user, stage.number, `"${made.delivery.title}" (left out earlier) scheduled for ${when(made.dateTime)}`);
  return respond(req, res, patient, stage.number, { message: `${made.delivery.title} scheduled for ${when(made.dateTime)}` });
});

// @route POST /api/delivery/patients/:patientId/:number/tasks/:key/done   { note }
const completeTask = asyncHandler(async (req, res) => {
  const { patient, stage } = await load(req);
  const d = planOf(stage);
  const task = d.tasks.find((t) => t.key === req.params.key) || fail('Task not found', 404);
  if (task.doneAt) fail('This task is already done');
  Object.assign(task, { doneAt: new Date(), doneByName: req.user.name, note: text(req.body.note, 500) });
  log(patient, req.user, stage.number, `task done: ${task.title}${task.note ? ` | ${task.note}` : ''}`);
  return respond(req, res, patient, stage.number, { message: 'Task done' });
});

// ---- Next phase -----------------------------------------------------------------------------------------------------
// Books the next-phase appointment with the same handler as "Book next appointment" on the patient page, so the
// booking lands on the Appointments sheet exactly the same way.
const runBooking = (req, patientId, body) => new Promise((resolve, reject) => {
  const bookingReq = Object.create(req);
  bookingReq.params = { id: String(patientId) };
  bookingReq.body = body && typeof body === 'object' ? body : {};
  let code = 200;
  const res = {
    status(value) { code = value; return this; },
    json(payload) {
      if (code >= 400 || !payload?.success) reject(Object.assign(new Error(payload?.message || 'The appointment could not be booked'), { statusCode: code >= 400 ? code : 400 }));
      else resolve(payload.appointment);
    },
  };
  Promise.resolve(require('./salesSheetController').bookAppointmentForPatient(bookingReq, res, reject)).catch(reject);
});

// @route POST /api/delivery/patients/:patientId/:number/next-phase
//   { decision: 'book', booking: { appointmentDate, time, mode, leadType, caseCategory, note } }
//   { decision: 'time', followUpAt, note }      the parent needs time: a call back is put on the follow-up list
//   { decision: 'stop', reason }                not continuing
// A phase is never closed silently: every decision keeps who and when, and an earlier one moves to the history.
const decideNextPhase = asyncHandler(async (req, res) => {
  const { patient, stage } = await load(req);
  const d = planOf(stage);
  const now = new Date();
  const rules = D.cleanRules(d.rules);
  const state = nextPhaseOf(d, planEntries(stage).map(({ entry }) => entry), rules, now);
  if (!state.due && !isAdminLike(req.user)) fail(`The next-phase options open in the last ${rules.nextPhaseAlertDays} days of the phase, or once the treatment delivery is complete`);
  const decision = ['book', 'time', 'stop'].includes(req.body.decision) ? req.body.decision : fail('Choose what happens next: book the appointment, parent needs time, or not continuing');
  const record = { decision, at: now, byName: req.user.name, byRole: req.user.role, note: text(req.body.note, 1000), deliveredWhenDecided: state.delivered };
  let message = '';
  if (decision === 'book') {
    const booked = await runBooking(req, patient._id, req.body.booking);
    Object.assign(record, { appointmentId: booked.id, appointmentCode: booked.appointmentCode, appointmentDate: booked.appointmentDate, note: text(req.body.booking?.note, 1000) });
    const task = d.tasks.find((t) => t.key === 'task:bookNext');
    if (task && !task.doneAt) Object.assign(task, { doneAt: now, doneByName: req.user.name, note: `Appointment ${booked.appointmentCode} booked for ${booked.appointmentDate}` });
    message = `Next-phase appointment ${booked.appointmentCode} booked for ${booked.appointmentDate}`;
  } else if (decision === 'time') {
    const at = new Date(req.body.followUpAt);
    if (!req.body.followUpAt || Number.isNaN(at.getTime())) fail('Choose when to call the parent back');
    if (at <= now) fail('The call back must be in the future');
    if (at.getTime() > now.getTime() + 180 * DAY_MS) fail('The call back can be at most 6 months ahead');
    stage.followUps.push({ dateTime: at, status: 'scheduled', followUpType: 'sfs', notes: `Next phase: the parent asked for time. Call back and decide.${record.note ? ` ${record.note}` : ''}`.slice(0, 500), createdByName: req.user.name });
    Object.assign(record, { followUpAt: at, followUpEntryId: String(stage.followUps[stage.followUps.length - 1]._id) });
    message = `Call back set for ${when(at)}. It is on the follow-up list.`;
  } else {
    const reason = text(req.body.reason, 1000);
    if (reason.length < 5) fail('Write why the parent is not continuing');
    record.reason = reason;
    message = 'Saved: not continuing to the next phase';
  }
  if (d.nextPhase?.decision) d.nextPhaseHistory.push(d.nextPhase);
  d.nextPhase = record;
  stage.markModified?.('delivery.nextPhase');
  const what = { book: `appointment ${record.appointmentCode} booked for ${record.appointmentDate}`, time: `parent needs time, call back ${record.followUpAt ? when(record.followUpAt) : ''}`, stop: `not continuing: ${record.reason}` }[decision];
  log(patient, req.user, stage.number, `next phase - ${what}${record.note && decision !== 'stop' ? ` | ${record.note}` : ''}`);
  return respond(req, res, patient, stage.number, { message });
});

// ---- Settings -------------------------------------------------------------------------------------------------------
// @route GET /api/delivery/settings
const getSettings = asyncHandler(async (req, res) => {
  const doc = await DeliverySetting.findOne({ key: 'rules' }).lean();
  res.json({ success: true, rules: D.cleanRules(doc?.value), defaults: D.DEFAULT_RULES, limits: D.RULE_LIMITS, canEdit: req.user.role === ROLES.ADMIN, updatedByName: doc?.updatedByName || '', updatedAt: iso(doc?.updatedAt) });
});
// @route PUT /api/delivery/settings   { rules }   (Admin). Plans already made keep the rules they were made with.
const saveSettings = asyncHandler(async (req, res) => {
  if (req.user.role !== ROLES.ADMIN) fail('Only the Admin changes the Treatment Delivery settings', 403);
  const input = req.body.rules && typeof req.body.rules === 'object' ? req.body.rules : fail('Nothing to save');
  Object.entries(D.RULE_LIMITS).forEach(([key, [min, max]]) => {
    // A screen from before the phase length was a setting does not send it: the saved (or default) length stays.
    if (key === 'phaseMonths' && (input[key] === '' || input[key] == null)) return;
    const n = Number(input[key]);
    if (input[key] === '' || input[key] == null || !Number.isInteger(n) || n < min || n > max) fail(`"${key}" must be a whole number from ${min} to ${max}`);
  });
  const reviews = Array.isArray(input.doctorReviewDays) ? input.doctorReviewDays.map(Number) : [];
  if (reviews.length !== 3 || reviews.some((day) => !Number.isInteger(day) || day < 15 || day > 180) || new Set(reviews).size !== 3) fail('Enter three different doctor review days between 15 and 180');
  const closed = Array.isArray(input.closedWeekdays) ? [...new Set(input.closedWeekdays.map(Number))] : [];
  if (closed.some((day) => !Number.isInteger(day) || day < 0 || day > 6) || closed.length > 5) fail('Choose at most five closed weekdays');
  if (Number(input.firstFollowUpDay) >= 180 - Number(input.lastFollowUpGap)) fail('The first follow-up day must come before the last one');
  const saved = input.phaseMonths === '' || input.phaseMonths == null ? (await DeliverySetting.findOne({ key: 'rules' }).lean())?.value?.phaseMonths : input.phaseMonths;
  const rules = D.cleanRules({ ...input, phaseMonths: saved, doctorReviewDays: reviews, closedWeekdays: closed });
  const doc = await DeliverySetting.findOneAndUpdate({ key: 'rules' }, { $set: { value: rules, updatedByName: req.user.name } }, { upsert: true, new: true, setDefaultsOnInsert: true }).lean();
  res.json({ success: true, rules, defaults: D.DEFAULT_RULES, limits: D.RULE_LIMITS, canEdit: true, updatedByName: doc?.updatedByName || req.user.name, updatedAt: iso(doc?.updatedAt), message: 'Settings saved. They apply to plans made from now on.' });
});

module.exports = {
  startDelivery, supplyReceived, stampStart, applyPlan, deliveryWork, worklistRows,
  getWorklist, getPlan, setupPlan, savePart, closeSupply, confirmSessions, markMissed, rescheduleSession, completeSession, cancelSession, bookOnRequest, addSkipped, completeTask, decideNextPhase,
  getSettings, saveSettings,
};
