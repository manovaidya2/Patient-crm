const crypto = require('crypto');
const Patient = require('../models/Patient');
const User = require('../models/User');
const { ROLES } = require('../constants/roles');
const { asyncHandler } = require('../middleware/errorHandler');
const { buildTransitCase, isInTransit, pickRequest, paymentSummary, SHIPPED_MODES, MODE_LABEL } = require('../utils/transitFlow');

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

const LIST_FIELDS = 'patientName patientCode number guardianName relativeName assignedDoctor assignedPsychologist updatedAt isActive '
  + 'stages.number stages.purchaseOrder stages.totalAmount stages.payments stages.postCounselor stages.medicineExplainDate '
  + 'stages.transit stages.medicineRequest stages.medicineRequests';
const TRANSIT_FILTER = {
  isActive: { $ne: false },
  stages: { $elemMatch: { purchaseOrder: { $exists: true, $ne: '' }, 'payments.0': { $exists: true } } },
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
  const patients = await Patient.find(TRANSIT_FILTER).select(LIST_FIELDS).sort({ updatedAt: -1 }).limit(500).populate(POPULATE).lean();
  const now = new Date();
  let items = patients.flatMap((patient) => (patient.stages || []).filter(isInTransit).map((stage) => buildTransitCase(patient, stage, now)));
  const q = clean(req.query.q, 100).toLowerCase();
  if (q) items = items.filter((item) => [item.patientName, item.patientCode, item.purchaseOrder, item.patientPhone].some((v) => String(v || '').toLowerCase().includes(q)));
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
    .filter((entry) => String(entry.action || '').includes(tag) || String(entry.details || '').includes(tag))
    .slice(-60).reverse()
    .map((entry) => ({ action: entry.action, details: entry.details, by: entry.actorName, role: entry.actorRole, at: entry.createdAt || entry.at || null }));
  res.json({ success: true, item: buildTransitCase(patient, stage), events });
});

// @desc    People who can be assigned when treatment starts
// @route   GET /api/transit/staff
const listStaff = asyncHandler(async (req, res) => {
  const users = await User.find({ role: { $in: [ROLES.ASSISTANT_DOCTOR, ROLES.POST_COUNSELOR, ROLES.PSYCHOLOGIST] }, isActive: { $ne: false } })
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
  raise_request({ stage, request, body, req, now }) {
    if (request) fail('A medicine request is already running for this phase');
    const medicines = required(body.medicines, 'Medicine details', 2000);
    const files = fileItems(req);
    if (!files.length) fail('Prescription image or document is required');
    stage.medicineRequests.push({
      requestId: crypto.randomUUID(), status: 'requested', medicines, notes: clean(body.notes, 2000),
      prescriptionUrl: files[0].url, prescriptionFileName: files[0].fileName, prescriptionFiles: files,
      requestedAt: now, requestedByName: req.user.name,
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
    const amount = Number(body.amount);
    if (!amount || amount <= 0) fail('Enter a valid payment amount');
    const paymentMode = body.paymentMode;
    if (!['cash', 'online'].includes(paymentMode)) fail('Select cash or online');
    const files = fileItems(req);
    const utr = paymentMode === 'online' ? required(body.utr, 'UTR / reference', 120) : '';
    const receivedBy = paymentMode === 'cash' ? required(body.receivedBy, 'Cash received by', 120) : '';
    stage.payments.push({
      amount, date: body.date ? parseDate(body.date, 'payment date') : new Date(), paymentMode, utr, receivedBy,
      notes: clean(body.notes, 2000), screenshotUrl: files[0]?.url || null, screenshotFiles: files,
      recordedByName: req.user.name, approvalStatus: 'pending',
    });
    return `Payment added: Rs ${amount} via ${paymentMode} - pending accounts approval`;
  },
  schedule_visit({ stage, body, req }) {
    if (stage.transit.fulfilmentMode !== 'pickup') fail('Delivery mode is not self pickup');
    const visitAt = parseDate(body.visitAt, 'visit date and time');
    Object.assign(stage.transit, { pickupScheduledAt: visitAt, pickupNote: clean(body.note, 300), pickupScheduledByName: req.user.name });
    return `Visit scheduled for ${visitAt.toISOString()}`;
  },
  dispatch({ stage, request, body, req, now }) {
    needRequest(request);
    const mode = stage.transit.fulfilmentMode;
    if (!SHIPPED_MODES.includes(mode)) fail('Delivery mode must be porter or courier');
    if (paymentSummary(stage).remaining > 0) fail('Full payment must be confirmed before sending the medicine');
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
    const receivedByName = required(body.receivedByName, 'Received by', 120);
    const proof = files.length ? { deliveryProofUrl: files[0].url, deliveryProofFileName: files[0].fileName, deliveryProofImages: [...(courier.deliveryProofImages || []), ...files] } : {};
    const notes = clean(body.notes, 500);
    if (SHIPPED_MODES.includes(mode)) {
      if (courier.status !== 'dispatched') fail('Send the medicine before confirming it was received');
      Object.assign(request, { courier: { ...courier, status: 'delivered', receivedByName, notes: notes || courier.notes || '', deliveredAt: receivedAt, deliveredByName: req.user.name, ...proof } });
      return `Medicine received by ${receivedByName}`;
    }
    if (mode !== 'pickup') fail('Confirm the delivery mode first');
    if (!stage.transit.pickupScheduledAt) fail('Schedule the visit first');
    if (!isMade(request)) fail('The medicine is not ready yet');
    Object.assign(request, { courier: { ...courier, status: 'delivered', deliveryMode: 'self', receiverName: receivedByName, receiverPhone: clean(body.receiverPhone, 30), receivedByName, notes, deliveredAt: receivedAt, deliveredByName: req.user.name, ...proof } });
    return `Medicine collected at clinic by ${receivedByName}`;
  },
  async start_treatment({ patient, stage, request, body, req, now }) {
    if (!request || courierOf(request).status !== 'delivered') fail('The medicine must reach the patient first');
    if (paymentSummary(stage).remaining > 0) fail('Full payment must be received first');
    const explanationAt = parseDate(body.explanationAt, 'medicine explanation date and time');
    const doctor = await staffMember(body.assistantDoctorId, ROLES.ASSISTANT_DOCTOR, 'assistant doctor');
    const counselor = await staffMember(body.postCounselorId, ROLES.POST_COUNSELOR, 'post counselor');
    const psychologist = await staffMember(body.psychologistId, ROLES.PSYCHOLOGIST, 'psychologist');
    if (!doctor) fail('Select the assistant doctor');
    if (!counselor && !stage.postCounselor) fail('Select the post counselor');
    patient.assignedDoctor = doctor._id;
    if (counselor) stage.postCounselor = counselor._id;
    if (psychologist) patient.assignedPsychologist = psychologist._id;
    stage.medicineExplainDate = explanationAt;
    Object.assign(stage.transit, {
      explanationScheduledAt: now, explanationScheduledByName: req.user.name, explanationAckAt: null, explanationAckByName: '',
      assignedAt: now, assignedByName: req.user.name, activatedAt: now, activatedByName: req.user.name,
    });
    return `Treatment started | Explanation ${explanationAt.toISOString()} | Assistant doctor: ${doctor.name}${counselor ? ` | Post counselor: ${counselor.name}` : ''}${psychologist ? ` | Psychologist: ${psychologist.name}` : ''}`;
  },
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
  if (!stage || !isInTransit(stage)) fail('This phase is not in transit (purchase order and a payment are required)', 404);
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
  const { patient, stage } = await loadStage(req);
  if (stage.transit.removedAt) fail('This case was removed from In Transit');
  if (stage.transit.activatedAt) fail('Treatment has already started for this phase');
  if (stage.transit.holdActive && action !== 'resume') fail('This case is on hold. Resume it first');
  const summary = await ACTIONS[action]({ patient, stage, request: pickRequest(stage), body: req.body, req, now: new Date() });
  logActivity(patient, req.user, stage.number, summary);
  await respondWithCase(res, patient, stage.number);
});

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
  if (req.user.role === ROLES.POST_COUNSELOR && String(stage.postCounselor || '') !== String(req.user._id)) fail('This phase is assigned to another post counselor', 403);
  Object.assign(stage.transit, { explanationAckAt: new Date(), explanationAckByName: req.user.name });
  logActivity(patient, req.user, stage.number, 'Post counselor saw the explanation schedule');
  await respondWithCase(res, patient, stage.number);
});

// Calendar-day difference in the server's timezone (clinic local time).
const dayDiff = (target, now = new Date()) => {
  const a = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const d = new Date(target);
  return Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate()) - a) / 86400000);
};
const dueText = (days) => (days === 1 ? 'tomorrow' : days === 0 ? 'today' : `${-days} day(s) overdue`);
const fmt = (value) => new Date(value).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' });

// @desc    Reminders: medicine ready-by date, explanation schedule, call-backs, visits
// @route   GET /api/transit/reminders
const getTransitReminders = asyncHandler(async (req, res) => {
  const { role } = req.user;
  const me = String(req.user._id);
  const patients = await Patient.find({
    isActive: { $ne: false },
    $or: [
      { 'stages.medicineRequests.readyByDate': { $ne: null } },
      { 'stages.medicineRequest.readyByDate': { $ne: null } },
      { 'stages.transit.explanationScheduledAt': { $ne: null } },
      { 'stages.transit.calls.nextCallAt': { $ne: null } },
      { 'stages.transit.pickupScheduledAt': { $ne: null } },
    ],
  }).select('patientName patientCode stages.number stages.purchaseOrder stages.payments.amount stages.postCounselor stages.medicineExplainDate stages.transit stages.medicineRequest stages.medicineRequests').lean();

  const now = new Date();
  const reminders = [];
  const forCounselor = (stage) => role !== ROLES.POST_COUNSELOR || !stage.postCounselor || String(stage.postCounselor) === me;
  patients.forEach((patient) => (patient.stages || []).forEach((stage) => {
    const t = stage.transit || {};
    const base = { patientId: String(patient._id), patientName: patient.patientName, patientCode: patient.patientCode || '', stage: stage.number };
    if (t.holdActive || t.removedAt) return;
    // 1) Medicine ready-by date: the automatic reminder starts the day before.
    const request = pickRequest(stage);
    if (!t.activatedAt && request && ['requested', 'in_process'].includes(request.status) && request.readyByDate && forCounselor(stage)) {
      const days = dayDiff(request.readyByDate, now);
      if (days <= 1) {
        reminders.push({
          ...base, id: `prep-${patient._id}-${stage.number}-${request.requestId || 'legacy'}-${new Date(request.readyByDate).toISOString().slice(0, 10)}-${days}`,
          type: 'medicine_due', dateTime: request.readyByDate,
          title: days < 0 ? 'Medicine preparation overdue' : `Medicine preparation last date is ${dueText(days)}`,
          message: `${patient.patientName} (Phase ${stage.number}) - medicine must be ready ${dueText(days)}.`,
        });
      }
    }
    if (role === ROLES.MEDICINE_DEPARTMENT) return;
    // 2) Explanation scheduled at treatment start: the assigned post counselor must see it.
    const mine = role === ROLES.POST_COUNSELOR && stage.postCounselor && String(stage.postCounselor) === me;
    if (stage.medicineExplainDate && t.explanationScheduledAt && new Date(stage.medicineExplainDate) >= new Date(now.getTime() - 86400000)) {
      if (mine && !t.explanationAckAt) {
        reminders.push({ ...base, id: `explain-new-${patient._id}-${stage.number}-${new Date(stage.medicineExplainDate).getTime()}`, type: 'explanation_scheduled', ack: true, dateTime: stage.medicineExplainDate, title: 'Medicine explanation scheduled', message: `${patient.patientName} (Phase ${stage.number}) - medicine explanation on ${fmt(stage.medicineExplainDate)}. You are the assigned post counselor.` });
      } else if ((mine || role === ROLES.RECEPTIONIST) && dayDiff(stage.medicineExplainDate, now) === 0) {
        reminders.push({ ...base, id: `explain-today-${patient._id}-${stage.number}-${new Date(stage.medicineExplainDate).getTime()}`, type: 'explanation_today', dateTime: stage.medicineExplainDate, title: 'Medicine explanation today', message: `${patient.patientName} (Phase ${stage.number}) at ${fmt(stage.medicineExplainDate)}.` });
      }
    }
    if (t.activatedAt || !isInTransit(stage)) return;
    // 3) Patient asked to be called back.
    const last = [...(t.calls || [])].sort((a, b) => new Date(b.at) - new Date(a.at))[0];
    if (last && last.outcome !== 'connected' && last.nextCallAt && new Date(last.nextCallAt) <= now && forCounselor(stage)) {
      reminders.push({ ...base, id: `call-${patient._id}-${stage.number}-${new Date(last.nextCallAt).getTime()}`, type: 'call_due', dateTime: last.nextCallAt, title: 'Call the patient again', message: `${patient.patientName} (Phase ${stage.number}) - last call: ${last.outcome.replace('_', ' ')}. ${last.notes || ''}` });
    }
    // 4) Self pickup visit today.
    const delivered = courierOf(request || {}).status === 'delivered';
    if (t.pickupScheduledAt && !delivered && dayDiff(t.pickupScheduledAt, now) === 0 && (role === ROLES.RECEPTIONIST || forCounselor(stage))) {
      reminders.push({ ...base, id: `visit-${patient._id}-${stage.number}-${new Date(t.pickupScheduledAt).getTime()}`, type: 'visit_today', dateTime: t.pickupScheduledAt, title: 'Patient coming today for medicine', message: `${patient.patientName} (Phase ${stage.number}) at ${fmt(t.pickupScheduledAt)}.` });
    }
  }));
  reminders.sort((a, b) => new Date(a.dateTime) - new Date(b.dateTime));
  res.json({ success: true, count: reminders.length, reminders });
});

module.exports = { listTransit, getTransitCase, listStaff, runAction, removeFromTransit, restoreToTransit, ackExplanation, getTransitReminders };
