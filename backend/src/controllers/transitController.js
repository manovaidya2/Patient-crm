const crypto = require('crypto');
const mongoose = require('mongoose');
const Patient = require('../models/Patient');
const PurchaseOrder = require('../models/PurchaseOrder');
const User = require('../models/User');
const { ROLES } = require('../constants/roles');
const { asyncHandler } = require('../middleware/errorHandler');
const { buildTransitCase, isInTransit, pickRequest, paymentSummary, SHIPPED_MODES, MODE_LABEL } = require('../utils/transitFlow');
const { parseUtrEntries, resolveUtrs } = require('../utils/utrEntries');

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
  let items = patients.flatMap((patient) => (patient.stages || []).filter(isInTransit).map((stage) => buildTransitCase(patient, stage, now)));
  const q = clean(req.query.q, 100).toLowerCase();
  if (q) items = items.filter((item) => [item.patientName, item.patientCode, item.purchaseOrder, item.patientPhone].some((v) => String(v || '').toLowerCase().includes(q)));
  if (req.query.date) items = items.filter(item => item.enteredAt && new Date(item.enteredAt).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }) === req.query.date);
  const isAdmin = req.user.role === ROLES.ADMIN;
  // Removed cases are only listed for admin (so they can be restored).
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
  res.json({ success: true, item: buildTransitCase(patient, stage), events });
});

// @desc    People who can be assigned when treatment starts
// @route   GET /api/transit/staff
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
const needRequest = (request) => { if (!request) fail('Raise the medicine request first'); return request; };

// Each action writes into the same fields the Medicine, Courier and Patient pages use.
const ACTIONS = {
  raise_request({ patient, stage, request, body, req, now }) {
    if ((patient.approvalStatus || 'approved') !== 'approved') fail('Approve the patient first');
    if (paymentSummary(stage).pendingCount) fail('Verify submitted payments first');
    if (request) fail('A medicine request is already running for this phase');
    const medicines = required(body.medicines, 'Medicine details', 2000);
    const files = fileItems(req);
    if (!files.length) fail('Prescription image or document is required');
    const readyByDate = parseDate(body.readyByDate || stage.transit.expectedReadyDate, 'medicine ready-by date');
    stage.transit.expectedReadyDate = readyByDate;
    stage.medicineRequests.push({
      requestId: crypto.randomUUID(), status: 'requested', medicines, notes: clean(body.notes, 2000),
      prescriptionUrl: files[0].url, prescriptionFileName: files[0].fileName, prescriptionFiles: files,
      requestedAt: now, requestedByName: req.user.name,
      readyByDate, readyBySetAt: now, readyBySetByName: req.user.name,
    });
    return `Medicine request raised: ${medicines}`;
  },
  accept_request({ request, body, req, now }) {
    needRequest(request);
    if (request.status !== 'requested') fail('This request is already accepted');
    const readyBy = parseDate(body.readyByDate, 'medicine ready-by date');
    Object.assign(request, { status: 'in_process', inProcessAt: now, inProcessByName: req.user.name, readyByDate: readyBy, readyBySetByName: req.user.name, readyBySetAt: now });
    return `Medicine request accepted - ready by ${day(readyBy)}`;
  },
  set_ready_by({ request, body, req, now }) {
    needRequest(request);
    if (!['requested', 'in_process'].includes(request.status)) fail('The medicine is already made');
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
    stage.transit.calls.push({ at: now, outcome, notes, nextCallAt, byName: req.user.name });
    return `Call: ${outcome.replace('_', ' ')} - ${notes}`;
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
  add_payment({ stage, body, req }) {
    const paymentMode = body.paymentMode;
    if (!['cash', 'online'].includes(paymentMode)) fail('Select cash or online');
    // Several same-day transfers (UTRs) make up one payment: its amount is their total.
    const utrs = resolveUtrs({ entries: paymentMode === 'online' ? parseUtrEntries(body.utrEntries) : [], amount: Number(body.amount), utr: body.utr, transactionId: body.transactionId });
    const amount = Number(utrs.amount);
    if (!Number.isFinite(amount) || amount <= 0) fail('Enter a valid payment amount');
    const files = fileItems(req);
    if (paymentMode === 'online' && !files.length) fail('Payment proof is required for an online payment');
    const utr = paymentMode === 'online' ? required(utrs.utr, 'UTR / reference', 1000) : '';
    const receivedBy = paymentMode === 'cash' ? required(body.receivedBy, 'Cash received by', 120) : '';
    stage.payments.push({
      amount, date: body.date ? parseDate(body.date, 'payment date') : new Date(), paymentMode, utr, receivedBy,
      transactionId: paymentMode === 'online' ? clean(utrs.transactionId, 1000) : '', utrEntries: paymentMode === 'online' ? utrs.utrEntries : [],
      notes: clean(body.notes, 2000), screenshotUrl: files[0]?.url || null, screenshotFiles: files,
      recordedByName: req.user.name, approvalStatus: 'pending',
    });
    return `Payment added: Rs ${amount} via ${paymentMode}${utrs.utrEntries.length ? ` (${utrs.utrEntries.length} transfers)` : ''} - pending accounts approval`;
  },
  // After the medicine is ready: how the patient gets it (self pickup / porter / courier) with its date, and the
  // medicine explanation date - fixed on the call with the patient. One action, so nothing is half planned.
  schedule_delivery({ stage, request, body, req, now }) {
    const { mode } = body;
    if (!MODE_LABEL[mode]) fail('Choose self pickup, porter or courier');
    if (!(stage.transit.calls || []).some((c) => c.outcome === 'connected')) fail('Log a connected call with the patient first');
    const courier = request ? courierOf(request) : {};
    if (['dispatched', 'delivered'].includes(courier.status) && stage.transit.fulfilmentMode !== mode) fail('The medicine has already left; the mode cannot change now');
    const explanationAt = parseDate(body.explanationAt, 'medicine explanation date and time');
    const explanationMode = ['phone', 'video', 'clinic'].includes(body.explanationMode) ? body.explanationMode : 'phone';
    const t = stage.transit;
    Object.assign(t, { fulfilmentMode: mode, fulfilmentSetAt: now, fulfilmentSetByName: req.user.name });
    let plan;
    if (mode === 'pickup') {
      const visitAt = parseDate(body.visitAt, 'pickup date and time');
      Object.assign(t, { pickupScheduledAt: visitAt, pickupNote: clean(body.note, 300), pickupScheduledByName: req.user.name, dispatchScheduledAt: null });
      plan = `self pickup ${visitAt.toISOString()}`;
    } else {
      if (['dispatched', 'delivered'].includes(courier.status)) { plan = `${MODE_LABEL[mode]} already sent`; } else {
        const at = parseDate(body.dispatchAt, 'planned dispatch date');
        Object.assign(t, { dispatchScheduledAt: at, plannedCourier: required(body.courierPartner, 'Courier / porter', 120), plannedAddress: required(body.address, 'Delivery address', 500), deliveryPlanNote: clean(body.note, 500), pickupScheduledAt: null, pickupNote: '' });
        plan = `${MODE_LABEL[mode]} dispatch ${at.toISOString()} via ${t.plannedCourier}`;
      }
    }
    const rescheduled = Boolean(stage.medicineExplainDate) && new Date(stage.medicineExplainDate).getTime() !== explanationAt.getTime();
    stage.medicineExplainDate = explanationAt;
    Object.assign(t, { explanationScheduledAt: now, explanationScheduledByName: req.user.name, explanationMode, ...(rescheduled ? { explanationAckAt: null, explanationAckByName: '' } : {}) });
    return `Delivery scheduled: ${plan} | medicine explanation ${explanationAt.toISOString()} (${explanationMode})`;
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
  dispatch({ stage, request, body, req, now }) {
    needRequest(request);
    const mode = stage.transit.fulfilmentMode;
    if (!SHIPPED_MODES.includes(mode)) fail('Delivery mode must be porter or courier');
    if (!stage.transit.dispatchScheduledAt) fail('Schedule dispatch first');
    if (request.status !== 'sent_to_courier') fail('Medicine Department must release the medicine first');
    if (['dispatched', 'delivered'].includes(courierOf(request).status)) fail('This medicine has already been dispatched');
    if (paymentSummary(stage).remaining > 0 || paymentSummary(stage).pendingCount) fail('Full payment must be approved before sending the medicine');
    if (!isMade(request)) fail('The medicine is not ready yet');
    const files = fileItems(req);
    const courier = courierOf(request);
    const existing = courier.packageImages || [];
    if (mode === 'courier' && !files.length && !existing.length) fail('Package photo is required for courier');
    const partner = mode === 'porter' ? `Porter - ${required(body.porterName, 'Porter name', 100)}` : required(body.courierPartner, 'Courier partner', 120);
    const tracking = mode === 'porter' ? [clean(body.porterPhone, 30), clean(body.trackingNumber, 100)].filter(Boolean).join(' / ') : required(body.trackingNumber, 'Tracking number', 120);
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
  confirm_received({ stage, request, body, req, now }) {
    needRequest(request);
    const mode = stage.transit.fulfilmentMode;
    const courier = courierOf(request);
    const files = fileItems(req);
    const receivedAt = body.receivedAt ? parseDate(body.receivedAt, 'received time') : now;
    if (receivedAt > now) fail('Received time cannot be in the future');
    if (request.status !== 'sent_to_courier') fail('Medicine Department must release the medicine first');
    if (paymentSummary(stage).remaining > 0 || paymentSummary(stage).pendingCount) fail('Full payment must be approved before handover');
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
  // After handover: In Transit assigns the PCC (Patient Care Coordinator, role assistant_doctor) who explains the medicine; the explanation date was
  // fixed with the delivery plan and can be adjusted here. The PCC then completes it on the Medicine Explanations page.
  async assign_pcc({ patient, stage, request, body, req, now }) {
    if (stage.transit.explanationCompletedAt) fail('Explanation is already completed', 409);
    if (!request || !['dispatched', 'delivered'].includes(courierOf(request).status)) fail('Dispatch or hand over the medicine first');
    if (paymentSummary(stage).remaining > 0 || paymentSummary(stage).pendingCount) fail('Full payment must be approved first');
    const explanationAt = body.explanationAt ? parseDate(body.explanationAt, 'medicine explanation date and time') : stage.medicineExplainDate;
    if (!explanationAt) fail('Set the medicine explanation date and time');
    const doctor = await staffMember(body.assistantDoctorId, ROLES.ASSISTANT_DOCTOR, 'PCC');
    const counselor = await staffMember(body.postCounselorId, ROLES.POST_COUNSELOR, 'post counselor');
    if (!doctor) fail('Select the PCC (Patient Care Coordinator)');
    const changedDoctor = String(stage.transit.explanationDoctor || patient.assignedDoctor || '') !== String(doctor._id);
    const changedDate = !stage.medicineExplainDate || new Date(stage.medicineExplainDate).getTime() !== new Date(explanationAt).getTime();
    patient.assignedDoctor = doctor._id;
    if (counselor) stage.postCounselor = counselor._id;
    stage.medicineExplainDate = explanationAt;
    Object.assign(stage.transit, {
      explanationScheduledAt: stage.transit.explanationScheduledAt || now, explanationScheduledByName: stage.transit.explanationScheduledByName || req.user.name,
      ...(changedDoctor || changedDate ? { explanationAckAt: null, explanationAckByName: '' } : {}),
      assignedAt: now, assignedByName: req.user.name, explanationDoctor: doctor._id,
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
  res.json({ success: true, item: buildTransitCase(saved, saved.stages.find((s) => s.number === stageNumber)) });
};

// @desc    Do one in-transit step
// @route   PATCH /api/transit/:patientId/:number   body: { action, ...fields }
const runAction = asyncHandler(async (req, res) => {
  const { action } = req.body;
  if (!ACTIONS[action]) fail('Unknown in-transit action');
  if (['accept_request', 'set_ready_by'].includes(action) && req.user.role !== ROLES.ADMIN) fail('Medicine Department owns preparation updates', 403);
  const { patient, stage } = await loadStage(req);
  if (stage.transit.removedAt) fail('This case was removed from In Transit');
  if (stage.transit.activatedAt) fail('Treatment has already started for this phase');
  if (stage.transit.holdActive && action !== 'resume') fail('This case is on hold. Resume it first');
  const summary = await ACTIONS[action]({ patient, stage, request: pickRequest(stage), body: req.body, req, now: new Date() });
  logActivity(patient, req.user, stage.number, summary);
  await respondWithCase(res, patient, stage.number);
  await notePoEvent(stage, req.user, summary);
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
  if (req.user.role !== ROLES.ADMIN && String(stage.transit.explanationDoctor || patient.assignedDoctor || '') !== String(req.user._id)) fail('This explanation is assigned to another doctor', 403);
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
    if (req.user.role !== ROLES.ADMIN && explanationOwner(patient, stage) !== String(req.user._id)) continue;
    const item = buildTransitCase(patient, stage);
    items.push(item);
  }
  if (req.query.date) items = items.filter(item => item.explanation.at && clinicDay(item.explanation.at) === req.query.date);
  if (req.query.status === 'done') items = items.filter(item => item.explanation.completedAt);
  else if (req.query.status !== 'all') items = items.filter(item => !item.explanation.completedAt);
  items.sort((a, b) => new Date(a.explanation.at) - new Date(b.explanation.at));
  res.json({ success: true, items });
});

const completeExplanation = asyncHandler(async (req, res) => {
  const { patient, stage } = await loadStage(req);
  const t = stage.transit;
  if (req.user.role !== ROLES.ADMIN && explanationOwner(patient, stage) !== String(req.user._id)) fail('This explanation belongs to another doctor', 403);
  if (t.holdActive || t.removedAt) fail('This case is on hold or removed');
  if (!t.explanationScheduledAt || !stage.medicineExplainDate) fail('Schedule the explanation first');
  if (t.explanationCompletedAt || t.activatedAt) fail('Explanation already completed', 409);
  const request = pickRequest(stage);
  if (!request || courierOf(request).status !== 'delivered') fail('Confirm medicine receipt before completing explanation');
  const pay = paymentSummary(stage);
  if (pay.remaining > 0 || pay.pendingCount) fail('Full payment must be approved');
  const completedAt = parseDate(req.body.completedAt, 'actual explanation completion time');
  if (completedAt > new Date() || completedAt < new Date(request.courier.deliveredAt)) fail('Completion time must be after medicine receipt and not in the future');
  const note = required(req.body.notes, 'Explanation notes', 2000);
  Object.assign(t, { explanationCompletedAt: completedAt, explanationCompletedByName: req.user.name, explainedByName: req.user.name, explanationNote: note, activatedAt: completedAt, activatedByName: req.user.name });
  stage.status = 'in_progress';
  stage.date = completedAt;
  const summary = `Medicine explanation completed; treatment started | ${note}`;
  logActivity(patient, req.user, stage.number, summary);
  await respondWithCase(res, patient, stage.number);
  await notePoEvent(stage, req.user, summary);
});

const getTransitReminders = asyncHandler(async (req, res) => {
  const patients = await Patient.find(TRANSIT_FILTER).select(LIST_FIELDS).lean();
  const now = new Date(), reminders = [], role = req.user.role;
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

module.exports = { explanationOwner, listTransit, getTransitCase, listStaff, runAction, removeFromTransit, restoreToTransit, ackExplanation, getTransitReminders, listExplanations, completeExplanation };
