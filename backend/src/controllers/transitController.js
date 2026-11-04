const { CALL_STEPS, CALL_STEP_LABELS, lateness, followUpHistory } = require('../utils/callFollowUps');
const crypto = require('crypto');
const mongoose = require('mongoose');
const Patient = require('../models/Patient');
const PurchaseOrder = require('../models/PurchaseOrder');
const User = require('../models/User');
const { ROLES, isAdminLike } = require('../constants/roles');
const { asyncHandler } = require('../middleware/errorHandler');
const { buildTransitCase, isInTransit, pickRequest, paymentSummary, SHIPPED_MODES, MODE_LABEL } = require('../utils/transitFlow');
const { parseUtrEntries, resolveUtrs } = require('../utils/utrEntries');
const { fixedReadyDate, canOverrideFixed } = require('../utils/medicineDelay');
const { patientDocuments } = require('../utils/patientDocuments');
const { paymentForRequest, paymentForRequestFrom, phasePurchaseOrders, poOfRequest, linkPaymentToPo, paymentCleared } = require('../utils/poPayment');
// The case with the payment status of its medicine request's PO (other POs of the phase are paid on their own).
const caseOf = async (patient, stage, now = new Date()) => buildTransitCase(patient, stage, now, { payment: await paymentForRequest(patient, stage, pickRequest(stage)) });

const fail = (message, statusCode = 400) => { throw Object.assign(new Error(message), { statusCode }); };
const clean = (value, max = 300) => String(value ?? '').trim().replace(/[\r\n\t]+/g, ' ').slice(0, max);
const required = (value, label, max) => { const v = clean(value, max); if (!v) fail(`${label} is required`); return v; };
const parseDate = (value, label) => {
  const d = new Date(value);
  if (!value || Number.isNaN(d.getTime())) fail(`Enter a valid ${label}`);
  return d;
};
const courierOf = (request) => (request.toObject ? request.toObject() : request).courier || {};
const fileItems = (req) => (req.files || []).map((file) => ({ url: `/uploads/transit/${file.filename}`, fileName: file.originalname }));
const isMade = (request) => Boolean(request && ['made', 'sent_to_courier'].includes(request.status));
const CALL_OUTCOMES = ['connected', 'not_reachable', 'busy', 'call_back', 'wrong_number'];
const day = (value) => value.toISOString().slice(0, 10);

const LIST_FIELDS = 'patientName patientCode number guardianName relativeName age category address centerName centerId approvalStatus createdAt assignedDoctor assignedPsychologist updatedAt isActive '
  + 'stages.number stages.age stages.purchaseOrder stages.totalAmount stages.payments stages.postCounselor stages.medicineExplainDate '
  + 'stages.transit stages.poPaper stages.packageName stages.medicineRequest stages.medicineRequests';
const TRANSIT_FILTER = {
  isActive: { $ne: false },
  stages: { $elemMatch: { purchaseOrder: { $exists: true, $ne: '' } } },
};
const POPULATE = [
  { path: 'assignedDoctor', select: 'name' },
  { path: 'assignedPsychologist', select: 'name' },
  { path: 'stages.postCounselor', select: 'name' },
];
const VIEWS = ['all', 'attention', 'order', 'medicine', 'contact', 'handover', 'treatment', 'hold', 'started', 'removed'];
const matchesView = (item, view) => {
  if (view === 'removed') return Boolean(item.removed);
  if (item.removed) return false;
  if (view === 'started') return item.activated;
  if (view === 'hold') return item.onHold;
  if (item.activated) return view === 'all';
  if (view === 'attention') return item.needsAttention;
  return view === 'all' || (!item.onHold && item.group === view);
};

// @desc    The in-transit queue: every phase between "PO + payment" and "treatment started"
// @route   GET /api/transit?view=&q=
const listTransit = asyncHandler(async (req, res) => {
  const patients = await Patient.find(TRANSIT_FILTER).select(LIST_FIELDS).sort({ createdAt: -1 }).populate(POPULATE).lean();
  const now = new Date();
  const PurchaseOrderModel = require('../models/PurchaseOrder');
  const allPos = mongoose.connection.readyState === 1 ? await PurchaseOrderModel.find({ patient: { $in: patients.map((p) => p._id) } }).select('patient phase poNumber amount paymentIds medicineRequestId status carriedForwardAmount').lean() : [];
  let items = patients.flatMap((patient) => (patient.stages || []).filter(isInTransit).map((stage) => buildTransitCase(patient, stage, now, { payment: paymentForRequestFrom(allPos.filter((o) => String(o.patient) === String(patient._id) && o.phase === stage.number), stage, pickRequest(stage)) })));
  const q = clean(req.query.q, 100).toLowerCase();
  if (q) items = items.filter((item) => [item.patientName, item.patientCode, item.purchaseOrder, item.patientPhone].some((v) => String(v || '').toLowerCase().includes(q)));
  if (req.query.date) items = items.filter(item => item.enteredAt && new Date(item.enteredAt).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }) === req.query.date);
  const isAdmin = isAdminLike(req.user);
  // Removed cases are only listed for admin / manager (so they can be restored).
  if (!isAdmin) items = items.filter((item) => !item.removed);
  const counts = Object.fromEntries(VIEWS.map((view) => [view, items.filter((item) => matchesView(item, view)).length]));
  let view = VIEWS.includes(req.query.view) ? req.query.view : 'all';
  if (view === 'removed' && !isAdmin) view = 'all';
  // Hide finished cases from "all" unless asked: the queue is for work still to do.
  const visible = items.filter((item) => matchesView(item, view) && (view === 'started' || !item.activated));
  counts.all = items.filter((item) => !item.activated && !item.removed).length;
  // Most urgent first, then whatever is due soonest, then the oldest case.
  visible.sort((a, b) => a.priority - b.priority
    || (a.dueAt ? new Date(a.dueAt) : Infinity) - (b.dueAt ? new Date(b.dueAt) : Infinity)
    || new Date(a.enteredAt || 0) - new Date(b.enteredAt || 0));
  res.json({ success: true, counts, items: visible });
});

// @desc    One case with its activity feed
// @route   GET /api/transit/:patientId/:number
const getTransitCase = asyncHandler(async (req, res) => {
  const patient = await Patient.findById(req.params.patientId).select(`${LIST_FIELDS} activityLog`).populate(POPULATE).lean();
  if (!patient) fail('Patient not found', 404);
  const number = parseInt(req.params.number, 10);
  const stage = (patient.stages || []).find((s) => s.number === number);
  if (!stage || !isInTransit(stage)) fail('This phase is not in transit', 404);
  const tag = `Phase ${number}`;
  const events = (patient.activityLog || [])
    .filter((entry) => String(entry.action || '').includes(tag) || String(entry.details || '').includes(tag) || entry.action === 'Patient approved')
    .reverse()
    .map((entry) => ({ action: entry.action, details: entry.details, by: entry.actorName, role: entry.actorRole, at: entry.createdAt || entry.at || null }));
  res.json({ success: true, item: await caseOf(patient, stage), events });
});

// @desc    People who can be assigned when treatment starts
// @route   GET /api/transit/staff
const { assertWorkingDay, pccEvents, OFF_WEEKDAYS, AFTERNOON_WEEKDAYS, AFTERNOON_FROM_HOUR } = require('../utils/pccCalendar');
// @desc    A PCC's calendar (follow-ups, family sessions, medicine explanations) and their days off
// @route   GET /api/transit/staff/:id/calendar?from=YYYY-MM-DD&days=28
const getPccCalendar = asyncHandler(async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(String(req.params.id))) fail('Invalid PCC');
  if (req.user.role === ROLES.ASSISTANT_DOCTOR && String(req.params.id) !== String(req.user._id)) fail('You can see only your own calendar', 403);
  const pcc = await User.findOne({ _id: req.params.id, role: ROLES.ASSISTANT_DOCTOR }).select('name').lean();
  if (!pcc) fail('PCC not found', 404);
  const fromText = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.from || '')) ? req.query.from : new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  const days = Math.min(Math.max(parseInt(req.query.days, 10) || 28, 1), 62);
  const from = new Date(`${fromText}T00:00:00.000+05:30`);
  const to = new Date(from.getTime() + days * 86400000);
  res.json({ success: true, pcc: { id: String(pcc._id), name: pcc.name }, from: fromText, days, offWeekdays: OFF_WEEKDAYS, afternoonWeekdays: AFTERNOON_WEEKDAYS, afternoonFromHour: AFTERNOON_FROM_HOUR, events: await pccEvents(pcc._id, from, to) });
});

const listStaff = asyncHandler(async (req, res) => {
  const users = await User.find({ role: { $in: [ROLES.ASSISTANT_DOCTOR, ROLES.POST_COUNSELOR] }, isActive: { $ne: false } })
    .select('name role').sort({ name: 1 }).lean();
  res.json({ success: true, staff: users.map((u) => ({ id: String(u._id), name: u.name, role: u.role })) });
});

const logActivity = (patient, user, stageNumber, details) => patient.activityLog.push({ action: `In transit - Phase ${stageNumber}`, details, actorName: user.name, actorRole: user.role });
const staffMember = async (id, role, label) => {
  if (!id) return null;
  const user = await User.findOne({ _id: id, role, isActive: { $ne: false } }).select('name').lean();
  if (!user) fail(`Selected ${label} was not found`);
  return user;
};
// The PCC (Patient Care Coordinator, role assistant_doctor) who explains the medicine on the scheduled date. A new PCC
// or date asks the PCC to acknowledge it again.
const setPcc = ({ patient, stage, doctor, explanationAt, req, now }) => {
  const changedDoctor = String(stage.transit.explanationDoctor || patient.assignedDoctor || '') !== String(doctor._id);
  const changedDate = !stage.medicineExplainDate || new Date(stage.medicineExplainDate).getTime() !== new Date(explanationAt).getTime();
  patient.assignedDoctor = doctor._id;
  Object.assign(stage.transit, {
    ...(changedDoctor || changedDate ? { explanationAckAt: null, explanationAckByName: '' } : {}),
    assignedAt: now, assignedByName: req.user.name, explanationDoctor: doctor._id,
  });
};
const needRequest = (request) => { if (!request) fail('Raise the medicine request first'); return request; };

// Each action writes into the same fields the Medicine, Courier and Patient pages use.
const ACTIONS = {
  raise_request({ patient, stage, request, body, req, now }) {
    if ((patient.approvalStatus || 'approved') !== 'approved') fail('Approve the patient first');
    if (paymentSummary(stage).pendingCount) fail('Verify submitted payments first');
    if (request) fail('A medicine request is already running for this phase');
    // Optional: the Medicine Department works from the master sheet and the patient file.
    const medicines = clean(body.medicines, 2000);
    // No prescription upload any more: the Medicine Department reads the patient's Records Room PDF.
    const files = fileItems(req);
    // The ready date fixed in post counselling goes to the Medicine Department as it is.
    const fixed = fixedReadyDate({ stage }) || stage.transit.expectedReadyDate;
    const readyByDate = fixed && !canOverrideFixed(req.user) ? new Date(fixed) : parseDate(body.readyByDate || fixed, 'medicine ready-by date');
    stage.transit.expectedReadyDate = readyByDate;
    stage.medicineRequests.push({
      requestId: crypto.randomUUID(), status: 'requested', medicines, notes: clean(body.notes, 2000),
      prescriptionUrl: files[0]?.url || null, prescriptionFileName: files[0]?.fileName || '', prescriptionFiles: files,
      requestedAt: now, requestedByName: req.user.name,
      readyByDate, readyBySetAt: now, readyBySetByName: req.user.name,
    });
    return `Medicine request raised${medicines ? `: ${medicines}` : ''}`;
  },
  accept_request({ request, body, req, now }) {
    needRequest(request);
    if (request.status !== 'requested') fail('This request is already accepted');
    const readyBy = request.readyByDate && !canOverrideFixed(req.user) ? new Date(request.readyByDate) : parseDate(body.readyByDate, 'medicine ready-by date');
    Object.assign(request, { status: 'in_process', inProcessAt: now, inProcessByName: req.user.name, readyByDate: readyBy, readyBySetByName: req.user.name, readyBySetAt: now });
    return `Medicine request accepted - ready by ${day(readyBy)}`;
  },
  set_ready_by({ request, body, req, now }) {
    needRequest(request);
    if (!['requested', 'in_process'].includes(request.status)) fail('The medicine is already made');
    if (!canOverrideFixed(req.user)) fail('The medicine ready date is set by post counselling on the PO paper; only the admin can change it', 403);
    const readyBy = parseDate(body.readyByDate, 'medicine ready-by date');
    Object.assign(request, { readyByDate: readyBy, readyBySetByName: req.user.name, readyBySetAt: now });
    return `Medicine ready-by date changed to ${day(readyBy)}`;
  },
  log_call({ stage, body, req, now }) {
    const { outcome } = body;
    if (!CALL_OUTCOMES.includes(outcome)) fail('Select the call result');
    const notes = required(body.notes, 'Call notes', 2000);
    const nextCallAt = body.nextCallAt ? parseDate(body.nextCallAt, 'next call time') : null;
    if (!['connected', 'wrong_number'].includes(outcome) && !nextCallAt) fail('Set when to call again');
    if (nextCallAt && nextCallAt < now) fail('The next call time cannot be in the past');
    // The step the call is on: the delivery schedule call, scheduling the delivery, or the dispatch / handover day.
    const step = CALL_STEPS.includes(body.step) ? body.step : 'calls';
    const { dueAt, lateDays } = lateness(stage.transit.calls, step, now);
    stage.transit.calls.push({ at: now, outcome, notes, nextCallAt, byName: req.user.name, step, dueAt, lateDays });
    return `Call (${CALL_STEP_LABELS[step]}): ${outcome.replace('_', ' ')} - ${notes}${lateDays ? ` (${lateDays} day${lateDays === 1 ? '' : 's'} late)` : ''}`;
  },
  // Step 1: the delivery schedule call. In Transit keeps logging calls until one connects, then marks it done and the
  // case moves to "Delivery scheduled".
  // "Why is it stuck": In Transit's note on a ready medicine not delivered yet (empty clears it).
  stuck_note({ stage, body, req, now }) {
    const note = String(body.note || '').trim();
    if (note.length > 1000) fail('Keep the note under 1000 characters');
    Object.assign(stage.transit, { stuckNote: note, stuckNoteAt: note ? now : null, stuckNoteByName: note ? req.user.name : '' });
    return note ? `Not delivered yet - reason: ${note}` : 'Not-delivered reason cleared';
  },
  finish_calls({ stage, req, now }) {
    const t = stage.transit;
    if (!(t.calls || []).some((c) => c.outcome === 'connected')) fail('Log a connected call with the patient first');
    if (t.callsDoneAt) fail('The delivery schedule call is already marked done', 409);
    Object.assign(t, { callsDoneAt: now, callsDoneByName: req.user.name });
    return 'Delivery schedule call done';
  },
  // "Verify full payment" also needs this tick: the PO paper is signed by the patient.
  async po_paper_signed({ patient, stage, request, body, req, now }) {
    const courier = request ? courierOf(request) : {};
    if (['dispatched', 'delivered'].includes(courier.status)) fail('The medicine has already been handed over / dispatched');
    const signed = body.signed === true || body.signed === 'true';
    // The note saved with the tick: the months of medicine going, the payment it went for, the balance left on the PO.
    let note = '';
    if (signed && request) {
      const phasePos = await phasePurchaseOrders(patient._id, stage.number);
      const po = poOfRequest(phasePos, request);
      const pay = await paymentForRequest(patient, stage, request);
      if (!paymentCleared(pay)) fail(pay.pendingCount ? 'Verify the pending payment(s) of this PO first' : 'Add and verify a payment of this PO first');
      const option = require('../constants/supplyPlans').supplyOption(po?.supplyPlan || request.supplyPlan, po?.supplyPart || request.supplyPart);
      const rs = (n) => `Rs ${Number(n || 0).toLocaleString('en-IN')}`;
      const what = option ? `${option.months} month${option.months === 1 ? '' : 's'} of medicine (${option.label})` : 'Medicine';
      note = `${what} given for ${rs(pay.amountPaid)} paid of ${rs(pay.totalAmount)}; balance ${rs(pay.remaining)}${po ? ` on ${po.poNumber}` : ''}`;
      request.supplyNote = note;
    } else if (request) request.supplyNote = '';
    Object.assign(stage.transit, signed ? { poPaperSignedAt: now, poPaperSignedByName: req.user.name, poPaperSignedNote: note } : { poPaperSignedAt: null, poPaperSignedByName: '', poPaperSignedNote: '' });
    return signed ? `PO paper signed by the patient${note ? ` | ${note}` : ''}` : 'PO paper signed: tick removed';
  },
  confirm_mode({ stage, request, body, req, now }) {
    const { mode } = body;
    if (!MODE_LABEL[mode]) fail('Choose self pickup, porter or courier');
    if (!(stage.transit.calls || []).some((c) => c.outcome === 'connected')) fail('Log a connected call with the patient first');
    if (request && ['dispatched', 'delivered'].includes(courierOf(request).status) && stage.transit.fulfilmentMode !== mode) fail('The medicine has already left; the mode cannot change now');
    Object.assign(stage.transit, { fulfilmentMode: mode, fulfilmentSetAt: now, fulfilmentSetByName: req.user.name, pickupNote: mode === 'pickup' ? stage.transit.pickupNote : '' });
    if (mode !== 'pickup') stage.transit.pickupScheduledAt = null;
    return `Patient confirmed: ${MODE_LABEL[mode]}${body.note ? ` - ${clean(body.note, 300)}` : ''}`;
  },
  async add_payment({ patient, stage, request, body, req }) {
    const paymentMode = body.paymentMode;
    if (!['cash', 'online', 'split'].includes(paymentMode)) fail('Select cash, online or split');
    // Paid partly online / cash / card the same day: one payment of the total.
    const split = paymentMode === 'split' ? require('../utils/splitPayment').resolveSplit(body.splits) : null;
    // Several same-day transfers (UTRs) make up one payment: its amount is their total.
    const utrs = resolveUtrs({ entries: paymentMode === 'online' ? parseUtrEntries(body.utrEntries) : [], amount: Number(body.amount), utr: body.utr, transactionId: body.transactionId });
    const amount = split ? split.amount : Number(utrs.amount);
    if (!Number.isFinite(amount) || amount <= 0) fail('Enter a valid payment amount');
    const files = fileItems(req);
    if ((paymentMode === 'online' || split?.needsProof) && !files.length) fail('Payment proof is required for an online payment');
    const utr = paymentMode === 'online' ? required(utrs.utr, 'UTR / reference', 1000) : split ? split.utr : '';
    const receivedBy = paymentMode === 'cash' ? required(body.receivedBy, 'Cash received by', 120) : split ? split.receivedBy : '';
    stage.payments.push({
      amount, date: body.date ? parseDate(body.date, 'payment date') : new Date(), paymentMode, utr, receivedBy,
      transactionId: paymentMode === 'online' ? clean(utrs.transactionId, 1000) : '', utrEntries: paymentMode === 'online' ? utrs.utrEntries : [], splits: split ? split.splits : [],
      notes: clean(body.notes, 2000), screenshotUrl: files[0]?.url || null, screenshotFiles: files,
      recordedByName: req.user.name, recordedBy: req.user._id, approvalStatus: 'pending',
    });
    // It pays for the medicine In Transit is handling: goes on that request's PO.
    const po = poOfRequest(await phasePurchaseOrders(patient._id, stage.number), request);
    if (po) await linkPaymentToPo(po._id, stage.payments[stage.payments.length - 1]._id);
    return `Payment added: Rs ${amount} via ${split ? `split (${require('../utils/splitPayment').splitText(split)})` : paymentMode}${utrs.utrEntries.length ? ` (${utrs.utrEntries.length} transfers)` : ''} - pending accounts approval`;
  },
  // Step 2: only the estimated date - self pickup (the day the patient comes) or porter / courier (the day it goes).
  // Porter or courier, its name and the address are filled at dispatch.
  // The case then shows on the Self Pickup Schedule or the Porter / Courier Schedule page. The medicine explanation date
  // and the PCC are fixed at the "Medicine explanation & PCC scheduled" step (older clients may still send them here).
  async schedule_delivery({ patient, stage, request, body, req, now }) {
    const mode = body.deliveryType === 'pickup' ? 'pickup' : body.deliveryType === 'shipped' ? (['porter', 'courier'].includes(body.mode) ? body.mode : 'shipped') : body.mode;
    if (!MODE_LABEL[mode]) fail('Choose self pickup or porter / courier');
    if (!(stage.transit.calls || []).some((c) => c.outcome === 'connected')) fail('Log a connected call with the patient first');
    if (!stage.transit.callsDoneAt && !stage.transit.fulfilmentSetAt) fail('Mark the delivery schedule call done first');
    const courier = request ? courierOf(request) : {};
    // The date and the mode can change until the handover / dispatch; after that the schedule is final.
    if (['dispatched', 'delivered'].includes(courier.status)) fail('The medicine has already been handed over / dispatched; the schedule cannot change now');
    const withExplanation = Boolean(body.explanationAt || body.assistantDoctorId);
    const explanationAt = withExplanation ? parseDate(body.explanationAt, 'medicine explanation date and time') : null;
    assertWorkingDay(explanationAt);
    const explanationMode = ['phone', 'video', 'clinic'].includes(body.explanationMode) ? body.explanationMode : 'phone';
    const doctor = withExplanation ? await staffMember(body.assistantDoctorId, ROLES.ASSISTANT_DOCTOR, 'PCC') : null;
    if (withExplanation && !doctor) fail('Select the PCC (Patient Care Coordinator) who explains the medicine');
    const t = stage.transit;
    if (!t.callsDoneAt) Object.assign(t, { callsDoneAt: now, callsDoneByName: req.user.name });
    Object.assign(t, { fulfilmentMode: mode, fulfilmentSetAt: now, fulfilmentSetByName: req.user.name });
    let plan;
    if (mode === 'pickup') {
      const visitAt = parseDate(body.visitAt, 'estimated self pickup date');
      Object.assign(t, { pickupScheduledAt: visitAt, pickupNote: clean(body.note, 300), pickupScheduledByName: req.user.name, dispatchScheduledAt: null });
      plan = `self pickup ${visitAt.toISOString()}`;
    } else {
      if (['dispatched', 'delivered'].includes(courier.status)) { plan = `${MODE_LABEL[mode]} already sent`; } else {
        const at = parseDate(body.dispatchAt, 'estimated delivery date');
        Object.assign(t, { dispatchScheduledAt: at, plannedCourier: clean(body.courierPartner, 120), plannedAddress: clean(body.address, 500), deliveryPlanNote: clean(body.note, 500), pickupScheduledAt: null, pickupNote: '' });
        plan = `${MODE_LABEL[mode]} estimated ${at.toISOString()}${t.plannedCourier ? ` via ${t.plannedCourier}` : ''}`;
      }
    }
    if (!withExplanation) return `Delivery scheduled: ${plan}`;
    setPcc({ patient, stage, doctor, explanationAt, req, now });
    stage.medicineExplainDate = explanationAt;
    Object.assign(t, { explanationScheduledAt: now, explanationScheduledByName: req.user.name, explanationMode });
    return `Delivery scheduled: ${plan} | medicine explanation ${explanationAt.toISOString()} (${explanationMode}) with PCC ${doctor.name}`;
  },
  schedule_visit({ stage, body, req }) {
    if (stage.transit.fulfilmentMode !== 'pickup') fail('Delivery mode is not self pickup');
    const visitAt = parseDate(body.visitAt, 'visit date and time');
    Object.assign(stage.transit, { pickupScheduledAt: visitAt, pickupNote: clean(body.note, 300), pickupScheduledByName: req.user.name });
    return `Visit scheduled for ${visitAt.toISOString()}`;
  },
  schedule_dispatch({ stage, request, body, req }) {
    if (!SHIPPED_MODES.includes(stage.transit.fulfilmentMode)) fail('Confirm courier or porter first');
    if (request && ['dispatched', 'delivered'].includes(courierOf(request).status)) fail('Already dispatched');
    const at = parseDate(body.dispatchAt, 'planned dispatch date');
    Object.assign(stage.transit, { dispatchScheduledAt: at, plannedCourier: required(body.courierPartner, 'Courier / porter', 120), plannedAddress: required(body.address, 'Delivery address', 500), deliveryPlanNote: clean(body.note, 500) });
    return `Dispatch planned for ${at.toISOString()} by ${req.user.name}`;
  },
  // Step 11: on the day, porter or courier is picked (when only "porter / courier" was scheduled) with the delivery details.
  async dispatch({ patient, stage, request, body, req, now }) {
    needRequest(request);
    let mode = stage.transit.fulfilmentMode;
    if (!SHIPPED_MODES.includes(mode)) fail('Delivery mode must be porter or courier');
    if (['porter', 'courier'].includes(body.sendBy)) mode = body.sendBy;
    if (mode === 'shipped') fail('Choose porter or courier');
    if (!stage.transit.dispatchScheduledAt) fail('Schedule dispatch first');
    if (request.status !== 'sent_to_courier') fail('Medicine Department must release the medicine first');
    if (['dispatched', 'delivered'].includes(courierOf(request).status)) fail('This medicine has already been dispatched');
    const pay = await paymentForRequest(patient, stage, request);
    if (!paymentCleared(pay)) fail(pay.pendingCount ? 'Verify the pending payment(s) of this PO before sending the medicine' : 'A verified payment of this PO is needed before sending the medicine');
    if (!stage.transit.poPaperSignedAt) fail('Tick "PO paper signed by patient" at Verify payment first');
    if (!isMade(request)) fail('The medicine is not ready yet');
    const files = fileItems(req);
    const courier = courierOf(request);
    const existing = courier.packageImages || [];
    if (mode === 'courier' && !files.length && !existing.length) fail('Package photo is required for courier');
    const partner = mode === 'porter' ? `Porter - ${required(body.porterName, 'Porter name', 100)}` : required(body.courierPartner, 'Courier partner', 120);
    const tracking = mode === 'porter' ? [clean(body.porterPhone, 30), clean(body.trackingNumber, 100)].filter(Boolean).join(' / ') : required(body.trackingNumber, 'Tracking number', 120);
    stage.transit.fulfilmentMode = mode;
    Object.assign(request, {
      status: 'sent_to_courier', sentToCourierAt: request.sentToCourierAt || now, sentToCourierByName: request.sentToCourierByName || req.user.name,
      courier: {
        ...courier, status: 'dispatched', deliveryMode: mode,
        receiverName: required(body.receiverName, 'Receiver name', 120), receiverPhone: required(body.receiverPhone, 'Receiver phone', 30),
        address: required(body.address, 'Address', 500), courierPartner: partner, trackingNumber: tracking,
        notes: clean(body.notes, 500), dispatchedAt: now, dispatchedByName: req.user.name,
        ...(files.length ? { packageImageUrl: files[0].url, packageImageFileName: files[0].fileName, packageImages: [...existing, ...files] } : {}),
      },
    });
    return `Sent by ${MODE_LABEL[mode]}: ${partner}${tracking ? ` | ${tracking}` : ''}`;
  },
  async confirm_received({ patient, stage, request, body, req, now }) {
    needRequest(request);
    const mode = stage.transit.fulfilmentMode;
    const courier = courierOf(request);
    const files = fileItems(req);
    const receivedAt = body.receivedAt ? parseDate(body.receivedAt, 'received time') : now;
    if (receivedAt > now) fail('Received time cannot be in the future');
    if (request.status !== 'sent_to_courier') fail('Medicine Department must release the medicine first');
    const pay = await paymentForRequest(patient, stage, request);
    if (!paymentCleared(pay)) fail(pay.pendingCount ? 'Verify the pending payment(s) of this PO before handover' : 'A verified payment of this PO is needed before handover');
    if (mode === 'pickup' && !stage.transit.poPaperSignedAt) fail('Tick "PO paper signed by patient" at Verify payment first');
    if (courier.status === 'delivered') fail('Receipt already recorded');
    const receivedByName = required(body.receivedByName, 'Received by', 120);
    const proof = files.length ? { deliveryProofUrl: files[0].url, deliveryProofFileName: files[0].fileName, deliveryProofImages: [...(courier.deliveryProofImages || []), ...files] } : {};
    const notes = clean(body.notes, 500);
    if (SHIPPED_MODES.includes(mode)) {
      if (courier.status !== 'dispatched') fail('Send the medicine before confirming it was received');
      if (courier.dispatchedAt && receivedAt < new Date(courier.dispatchedAt)) fail('Received time cannot be before dispatch');
      Object.assign(request, { courier: { ...courier, status: 'delivered', receivedByName, notes: notes || courier.notes || '', deliveredAt: receivedAt, deliveredByName: req.user.name, ...proof } });
      return `Medicine received by ${receivedByName}`;
    }
    if (mode !== 'pickup') fail('Confirm the delivery mode first');
    if (!stage.transit.pickupScheduledAt) fail('Schedule the visit first');
    if (!isMade(request)) fail('The medicine is not ready yet');
    Object.assign(request, { courier: { ...courier, status: 'delivered', deliveryMode: 'self', receiverName: receivedByName, receiverPhone: clean(body.receiverPhone, 30), receivedByName, notes, deliveredAt: receivedAt, deliveredByName: req.user.name, ...proof } });
    return `Medicine collected at clinic by ${receivedByName}`;
  },
  // In Transit assigns (or changes) the PCC (Patient Care Coordinator, role assistant_doctor) who explains the medicine,
  // usually with the delivery schedule; the explanation date can be adjusted here. The PCC completes it on the Medicine
  // Explanations page once the medicine is received and fully paid.
  async assign_pcc({ patient, stage, body, req, now }) {
    if (stage.transit.explanationCompletedAt) fail('Explanation is already completed', 409);
    const explanationAt = body.explanationAt ? parseDate(body.explanationAt, 'medicine explanation date and time') : stage.medicineExplainDate;
    // A newly picked date may not fall on the PCCs' day off (Wednesday).
    if (body.explanationAt) assertWorkingDay(explanationAt);
    if (!explanationAt) fail('Set the medicine explanation date and time');
    const doctor = await staffMember(body.assistantDoctorId, ROLES.ASSISTANT_DOCTOR, 'PCC');
    const counselor = await staffMember(body.postCounselorId, ROLES.POST_COUNSELOR, 'post counselor');
    if (!doctor) fail('Select the PCC (Patient Care Coordinator)');
    setPcc({ patient, stage, doctor, explanationAt, req, now });
    if (counselor) stage.postCounselor = counselor._id;
    stage.medicineExplainDate = explanationAt;
    Object.assign(stage.transit, {
      explanationScheduledAt: stage.transit.explanationScheduledAt || now, explanationScheduledByName: stage.transit.explanationScheduledByName || req.user.name,
      explanationMode: ['phone', 'video', 'clinic'].includes(body.explanationMode) ? body.explanationMode : (stage.transit.explanationMode || 'phone'),
    });
    return `PCC assigned: ${doctor.name} | medicine explanation ${new Date(explanationAt).toISOString()}${counselor ? ` | post counselor ${counselor.name}` : ''}`;
  },
  // Older name of assign_pcc (kept for existing clients).
  start_treatment(context) { return ACTIONS.assign_pcc(context); },
  hold({ stage, body, req, now }) {
    Object.assign(stage.transit, { holdActive: true, holdReason: required(body.reason, 'Reason', 300), holdAt: now, holdByName: req.user.name });
    return `Exception / hold: ${stage.transit.holdReason}`;
  },
  resume({ stage }) {
    if (!stage.transit.holdActive) fail('This case is not on hold');
    stage.transit.holdActive = false;
    return 'Resumed from hold';
  },
};

const loadStage = async (req) => {
  const patient = await Patient.findById(req.params.patientId);
  if (!patient) fail('Patient not found', 404);
  const stage = (patient.stages || []).find((s) => s.number === parseInt(req.params.number, 10));
  if (!stage || !isInTransit(stage)) fail('This phase is not in transit (purchase order required)', 404);
  if (!stage.transit) stage.transit = {};
  return { patient, stage };
};
const respondWithCase = async (res, patient, stageNumber) => {
  await patient.save();
  await patient.populate(POPULATE);
  const saved = patient.toObject();
  res.json({ success: true, item: await caseOf(saved, saved.stages.find((s) => s.number === stageNumber)) });
};

// @desc    Do one in-transit step
// @route   PATCH /api/transit/:patientId/:number   body: { action, ...fields }
const runAction = asyncHandler(async (req, res) => {
  const { action } = req.body;
  if (!ACTIONS[action]) fail('Unknown in-transit action');
  if (['accept_request', 'set_ready_by'].includes(action) && !isAdminLike(req.user)) fail('Medicine Department owns preparation updates', 403);
  const { patient, stage } = await loadStage(req);
  if (stage.transit.removedAt) fail('This case was removed from In Transit');
  if (stage.transit.activatedAt) fail('Treatment has already started for this phase');
  if (stage.transit.holdActive && !['resume', 'stuck_note'].includes(action)) fail('This case is on hold. Resume it first');
  const summary = await ACTIONS[action]({ patient, stage, request: pickRequest(stage), body: req.body, req, now: new Date() });
  logActivity(patient, req.user, stage.number, summary);
  await respondWithCase(res, patient, stage.number);
  await notePoEvent(stage, req.user, summary);
  require('../realtime/salesSheetSocket').emitTransitChanged(req.app, patient._id, stage.number);
});

// Every In Transit action is also noted on the purchase order of the phase's current medicine request, so the PO
// page's activity shows the whole story with times. Best effort: the patient record is already saved.
const notePoEvent = async (stage, user, details) => {
  const request = pickRequest(stage);
  if (!request?.requestId || mongoose.connection.readyState !== 1) return;
  try {
    await PurchaseOrder.updateOne({ medicineRequestId: request.requestId }, { $push: { events: { at: new Date(), action: 'In Transit', details, byName: user.name, byRole: user.role } } });
  } catch (error) { console.error(`PO event not noted: ${error.message}`); }
};

// @desc    Admin takes a phase out of In Transit (patient data is not touched) or brings it back
// @route   DELETE /api/transit/:patientId/:number      body: { reason }
// @route   POST   /api/transit/:patientId/:number/restore
const removeFromTransit = asyncHandler(async (req, res) => {
  const { patient, stage } = await loadStage(req);
  if (stage.transit.removedAt) fail('This case is already removed from In Transit');
  const reason = clean(req.body?.reason, 300);
  Object.assign(stage.transit, { removedAt: new Date(), removedByName: req.user.name, removedReason: reason });
  logActivity(patient, req.user, stage.number, `Removed from In Transit${reason ? ` - ${reason}` : ''}`);
  await respondWithCase(res, patient, stage.number);
});
const restoreToTransit = asyncHandler(async (req, res) => {
  const { patient, stage } = await loadStage(req);
  if (!stage.transit.removedAt) fail('This case is not removed');
  Object.assign(stage.transit, { removedAt: null, removedByName: '', removedReason: '' });
  logActivity(patient, req.user, stage.number, 'Restored to In Transit');
  await respondWithCase(res, patient, stage.number);
});

// @desc    Post counselor confirms they have seen the explanation schedule
// @route   POST /api/transit/:patientId/:number/ack-explanation
const ackExplanation = asyncHandler(async (req, res) => {
  const { patient, stage } = await loadStage(req);
  if (!stage.medicineExplainDate) fail('No explanation is scheduled for this phase');
  if (!isAdminLike(req.user) && String(stage.transit.explanationDoctor || patient.assignedDoctor || '') !== String(req.user._id)) fail('This explanation is assigned to another doctor', 403);
  Object.assign(stage.transit, { explanationAckAt: new Date(), explanationAckByName: req.user.name });
  logActivity(patient, req.user, stage.number, 'PCC saw the explanation schedule');
  await respondWithCase(res, patient, stage.number);
});

const clinicDay = value => new Date(value).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
const dayDiff = (target, now = new Date()) => Math.round((Date.parse(clinicDay(target)) - Date.parse(clinicDay(now))) / 86400000);
const explanationOwner = (patient, stage) => String(stage.transit?.explanationDoctor || patient.assignedDoctor?._id || patient.assignedDoctor || '');

const listExplanations = asyncHandler(async (req, res) => {
  const patients = await Patient.find({ isActive: { $ne: false }, 'stages.transit.explanationScheduledAt': { $type: 'date' } })
    .select(LIST_FIELDS).lean();
  let items = [];
  for (const patient of patients) for (const stage of patient.stages || []) {
    if (!stage.transit?.explanationScheduledAt || stage.transit.removedAt) continue;
    if (!isAdminLike(req.user) && explanationOwner(patient, stage) !== String(req.user._id)) continue;
    const item = await caseOf(patient, stage);
    items.push(item);
  }
  const MedicineJob = require('../models/MedicineJob');
  const jobs = items.length && mongoose.connection.readyState === 1 ? await MedicineJob.find({ patient: { $in: items.map((i) => i.patientId) } }).select('patient phase requestId photos').lean() : [];
  const docsOf = new Map(await Promise.all([...new Set(items.map((i) => i.patientId))].map(async (id) => [id, await patientDocuments(patients.find((p) => String(p._id) === id))])));
  // The PO of each medicine, so the PCC can open the post-counselling record behind it.
  const poNumbers = [...new Set(items.map((i) => i.medicine?.poNumber).filter(Boolean))];
  const pos = poNumbers.length && mongoose.connection.readyState === 1 ? await PurchaseOrder.find({ poNumber: { $in: poNumbers } }).select('poNumber source').lean() : [];
  items = items.map((item) => {
    const po = pos.find((p) => p.poNumber === item.medicine?.poNumber);
    item = { ...item, poId: po ? String(po._id) : null, poFromConversion: po?.source === 'conversion' };
    const job = jobs.find((j) => String(j.patient) === item.patientId && j.phase === item.stage && j.requestId === item.medicine?.requestId);
    return { ...item, treatmentPapers: { overview: job?.photos?.overview || [], paperSets: job?.photos?.paperSets || [], papers: job?.photos?.papers || [] }, patientDocuments: docsOf.get(item.patientId) || [] };
  });
  if (req.query.date) items = items.filter(item => item.explanation.at && clinicDay(item.explanation.at) === req.query.date);
  if (req.query.status === 'done') items = items.filter(item => item.explanation.completedAt);
  else if (req.query.status !== 'all') items = items.filter(item => !item.explanation.completedAt);
  items.sort((a, b) => new Date(a.explanation.at) - new Date(b.explanation.at));
  res.json({ success: true, items });
});

// @route POST /api/transit/:patientId/:number/reschedule-explanation  { explanationAt, reason, note }
// The PCC moves their own explanation to another slot of theirs (e.g. the call was not picked up that day). The same
// slot rules as assigning (no Wednesday; Saturday, Sunday and Tuesday from 2 pm). Every move is kept.
const RESCHEDULE_REASONS = { not_picked: 'Call not picked up', patient_request: 'Patient asked for another time', other: 'Other' };
const rescheduleExplanation = asyncHandler(async (req, res) => {
  const { patient, stage } = await loadStage(req);
  const t = stage.transit;
  if (!isAdminLike(req.user) && explanationOwner(patient, stage) !== String(req.user._id)) fail('This explanation belongs to another PCC', 403);
  if (t.holdActive || t.removedAt) fail('This case is on hold or removed');
  if (!t.explanationScheduledAt || !stage.medicineExplainDate) fail('The explanation is not scheduled yet');
  if (t.explanationCompletedAt || t.activatedAt) fail('The explanation is already completed', 409);
  const to = parseDate(req.body.explanationAt, 'new explanation date & time');
  if (to < new Date()) fail('Choose a time in the future');
  assertWorkingDay(to);
  const reason = RESCHEDULE_REASONS[req.body.reason] ? req.body.reason : 'not_picked';
  const note = String(req.body.note || '').trim();
  if (note.length > 1000) fail('Keep the note under 1000 characters');
  const from = stage.medicineExplainDate;
  if (!t.explanationReschedules) t.explanationReschedules = [];
  t.explanationReschedules.push({ from, to, reason, note, at: new Date(), byName: req.user.name });
  stage.medicineExplainDate = to;
  const summary = `Medicine explanation rescheduled (${RESCHEDULE_REASONS[reason]}): ${clinicDay(from)} -> ${new Date(to).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}${note ? ` | ${note}` : ''}`;
  logActivity(patient, req.user, stage.number, summary);
  await respondWithCase(res, patient, stage.number);
  await notePoEvent(stage, req.user, summary);
  require('../realtime/salesSheetSocket').emitTransitChanged(req.app, patient._id, stage.number);
});

const completeExplanation = asyncHandler(async (req, res) => {
  const { patient, stage } = await loadStage(req);
  const t = stage.transit;
  if (!isAdminLike(req.user) && explanationOwner(patient, stage) !== String(req.user._id)) fail('This explanation belongs to another doctor', 403);
  if (t.holdActive || t.removedAt) fail('This case is on hold or removed');
  if (!t.explanationScheduledAt || !stage.medicineExplainDate) fail('Schedule the explanation first');
  if (t.explanationCompletedAt || t.activatedAt) fail('Explanation already completed', 409);
  const request = pickRequest(stage);
  if (!request || courierOf(request).status !== 'delivered') fail('Confirm medicine receipt before completing explanation');
  const pay = await paymentForRequest(patient, stage, request);
  if (!paymentCleared(pay)) fail('Verify the payment of this PO first');
  const completedAt = parseDate(req.body.completedAt, 'actual explanation completion time');
  if (completedAt > new Date() || completedAt < new Date(request.courier.deliveredAt)) fail('Completion time must be after medicine receipt and not in the future');
  const note = required(req.body.notes, 'Explanation notes', 2000);
  Object.assign(t, { explanationCompletedAt: completedAt, explanationCompletedByName: req.user.name, explainedByName: req.user.name, explanationNote: note, activatedAt: completedAt, activatedByName: req.user.name });
  Object.assign(request, { explanationDate: stage.medicineExplainDate || null, explainedAt: completedAt, explainedByName: req.user.name });
  stage.status = 'in_progress';
  stage.date = completedAt;
  const summary = `Medicine explanation completed; treatment started | ${note}`;
  logActivity(patient, req.user, stage.number, summary);
  await respondWithCase(res, patient, stage.number);
  await notePoEvent(stage, req.user, summary);
  require('../realtime/salesSheetSocket').emitTransitChanged(req.app, patient._id, stage.number);
});

// @route GET /api/transit/follow-ups?status=open|done|all&mine=1   ("In Transit Follow-ups" page)
// Every follow-up call In Transit set on the delivery schedule call, scheduling and dispatch / handover steps: open ones
// (upcoming, due, late by N days) and finished ones (done on time / N days late, or closed when the step got done).
const OPEN_FOLLOW_UP = ['upcoming', 'due', 'late'];
const listFollowUps = asyncHandler(async (req, res) => {
  const patients = await Patient.find({ isActive: { $ne: false }, 'stages.transit.calls.nextCallAt': { $type: 'date' } })
    .select('patientName patientCode number stages.number stages.purchaseOrder stages.transit stages.medicineRequest stages.medicineRequests').lean();
  const now = new Date();
  let rows = [];
  for (const patient of patients) for (const stage of patient.stages || []) {
    const t = stage.transit || {};
    if (!(t.calls || []).some((c) => c.nextCallAt) || t.removedAt) continue;
    const request = pickRequest(stage);
    const handedOver = ['dispatched', 'delivered'].includes(courierOf(request || {}).status);
    const mode = require('../utils/transitFlow').fulfilmentMode(stage, request);
    const done = {
      calls: Boolean(t.callsDoneAt || t.fulfilmentSetAt) || handedOver,
      scheduled: (Boolean(mode) && Boolean(t.pickupScheduledAt || t.dispatchScheduledAt)) || handedOver,
      handover: handedOver,
    };
    followUpHistory(t.calls, done, now).forEach((f) => rows.push({
      id: `${patient._id}-${stage.number}-${f.setAt}`, patientId: String(patient._id), patientName: patient.patientName, patientCode: patient.patientCode || '',
      phone: patient.number ? String(patient.number) : '', phase: stage.number, poNumber: request?.poNumber || stage.purchaseOrder || '', ...f,
    }));
  }
  const poNumbers = [...new Set(rows.map((r) => r.poNumber).filter(Boolean))];
  const pos = poNumbers.length && mongoose.connection.readyState === 1 ? await PurchaseOrder.find({ poNumber: { $in: poNumbers } }).select('poNumber').lean() : [];
  const poIdOf = new Map(pos.map((po) => [po.poNumber, String(po._id)]));
  rows = rows.map((r) => ({ ...r, poId: poIdOf.get(r.poNumber) || null }));
  if (req.query.mine === '1') rows = rows.filter((r) => r.setByName === req.user.name);
  const summary = ['upcoming', 'due', 'late', 'done', 'closed'].reduce((acc, key) => ({ ...acc, [key]: rows.filter((r) => r.status === key).length }), {});
  const status = req.query.status || 'open';
  if (status === 'open') rows = rows.filter((r) => OPEN_FOLLOW_UP.includes(r.status));
  else if (status === 'done') rows = rows.filter((r) => !OPEN_FOLLOW_UP.includes(r.status));
  rows.sort((a, b) => (OPEN_FOLLOW_UP.includes(a.status) && OPEN_FOLLOW_UP.includes(b.status)
    ? new Date(a.dueAt) - new Date(b.dueAt)
    : new Date(b.doneAt || b.dueAt) - new Date(a.doneAt || a.dueAt)));
  res.json({ success: true, rows, summary });
});

const getTransitReminders = asyncHandler(async (req, res) => {
  const patients = await Patient.find(TRANSIT_FILTER).select(LIST_FIELDS).lean();
  const now = new Date(), reminders = [], role = isAdminLike(req.user) ? ROLES.ADMIN : req.user.role;
  for (const patient of patients) for (const stage of patient.stages || []) {
    if (!isInTransit(stage)) continue;
    const t = stage.transit || {}, request = pickRequest(stage);
    if (t.holdActive || t.removedAt || t.activatedAt) continue;
    const base = { patientId: String(patient._id), patientName: patient.patientName, patientCode: patient.patientCode, stage: stage.number };
    const add = (type, dateTime, title, message) => reminders.push({ ...base, id: `${type}-${patient._id}-${stage.number}-${clinicDay(dateTime)}-${clinicDay(now)}`, type, dateTime, title, message });
    const ready = request?.readyByDate || t.expectedReadyDate;
    if ([ROLES.ADMIN, ROLES.IN_TRANSIT, ROLES.MEDICINE_DEPARTMENT].includes(role) && ready && !isMade(request) && dayDiff(ready, now) <= 1) {
      const days = dayDiff(ready, now);
      add('medicine_due', ready, days < 0 ? 'Medicine preparation overdue' : `Urgent: medicine due ${days === 1 ? 'tomorrow' : 'today'}`, `${patient.patientName}: medicine ready-by deadline ${clinicDay(ready)}`);
    }
    if (role === ROLES.MEDICINE_DEPARTMENT) continue;
    if (role === ROLES.ASSISTANT_DOCTOR) {
      if (explanationOwner(patient, stage) === String(req.user._id) && stage.medicineExplainDate && t.explanationScheduledAt && !t.explanationCompletedAt && dayDiff(stage.medicineExplainDate, now) <= 0) add('explanation_today', stage.medicineExplainDate, 'Medicine explanation due', `${patient.patientName}: scheduled ${new Date(stage.medicineExplainDate).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}`);
      continue;
    }
    const last = [...(t.calls || [])].sort((a,b) => new Date(b.at)-new Date(a.at))[0];
    if (last?.nextCallAt && last.outcome !== 'connected' && new Date(last.nextCallAt) <= now) add('call_due', last.nextCallAt, 'Patient call-back due', `${patient.patientName}: ${last.notes}`);
    const courier = courierOf(request || {});
    if (t.pickupScheduledAt && courier.status !== 'delivered' && dayDiff(t.pickupScheduledAt, now) <= 0) add('visit_today', t.pickupScheduledAt, 'Self-pickup due', patient.patientName);
    if (t.dispatchScheduledAt && !['dispatched','delivered'].includes(courier.status) && dayDiff(t.dispatchScheduledAt, now) <= 0) add('dispatch_due', t.dispatchScheduledAt, 'Scheduled dispatch due', patient.patientName);
    if (request?.status === 'made') add('medicine_ready', request.madeAt || now, 'Medicine ready', `${patient.patientName}: confirm full payment and Medicine Department release`);
  }
  reminders.sort((a,b) => new Date(a.dateTime)-new Date(b.dateTime));
  res.json({ success: true, count: reminders.length, reminders });
});

module.exports = { explanationOwner, listTransit, getTransitCase, listStaff, getPccCalendar, runAction, removeFromTransit, restoreToTransit, ackExplanation, getTransitReminders, listExplanations, completeExplanation, rescheduleExplanation, listFollowUps };
