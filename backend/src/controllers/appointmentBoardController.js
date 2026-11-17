const mongoose = require('mongoose');
const Management = require('../models/AppointmentManagementEntry');
const SalesSheetAudit = require('../models/SalesSheetAudit');
const User = require('../models/User');
const Patient = require('../models/Patient');
const MedicineJob = require('../models/MedicineJob');
const { releaseView } = require('../utils/medicineRelease');
const { appointmentMedicine } = require('../utils/appointmentMedicine');
const { appointmentTreatment } = require('../utils/appointmentTreatment');
const { appointmentSessions } = require('../utils/appointmentSessions');
const { loadAppointmentConsultations } = require('../utils/appointmentConsultations');
const { loadAppointmentRecords } = require('../utils/appointmentRecords');
const { asyncHandler } = require('../middleware/errorHandler');
const { ROLES, isAdminLike } = require('../constants/roles');
const { SALES_IDS, RECEPTION_IDS } = require('../utils/receptionFlow');

// "Appointments": one row per appointment of the chosen dates (the ones Sales confirmed and sent to Reception, and the
// ones Reception added), following the visit: Patient ID (and when it was made), arrival, released by Reception to a
// PCC, registration sent to the Post Counselor, history started / taken (ticked by any PCC), and the package bought.
// The release, PCC history ticks and Medicine Department OPD ticks are set here; other columns use existing records.
const RELEASE_TIME_COLUMN = '6aba54d27172140c6badb055'; // Reception details "Release Time", kept in step
const fail = (message, statusCode = 400) => { throw Object.assign(new Error(message), { statusCode }); };
const day = (v) => /^\d{4}-\d{2}-\d{2}$/.test(String(v || ''));
const istToday = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
const istTime = (d) => new Date(d).toLocaleTimeString('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' });
const mapValue = (map, id) => String((map?.get ? map.get(id) : map?.[id]) ?? '');
const iso = (v) => (v ? new Date(v).toISOString() : null);
const emitChanged = (req) => req.app?.get?.('io')?.emit('appointments-board:changed', {});

// After the package: the purchase order made on the conversion and where it is now (the same view the PO page shows).
const MED_STATUS = { requested: 'Requested', in_process: 'Being prepared', made: 'Ready', sent_to_courier: 'Released to In Transit', cancelled: 'Cancelled' };
const PO_STATUS = { pending: 'Waiting for verification', verified: 'Verified', rejected: 'Sent back', cancelled: 'Cancelled' };
const progressOf = (po, job = null) => {
  if (!po) return null;
  const step = (key) => po.steps.find((s) => s.key === key) || null;
  const done = (key) => { const s = step(key); return s && s.state === 'done' ? { at: s.at || null, by: s.by || '', text: s.text || '' } : null; };
  const pay = po.poPayment || {};
  const medicineStep = step('ready');
  const transitNow = po.steps.find((s) => s.branch === 'transit' && s.state === 'current');
  const scheduled = done('scheduled');
  const handover = done('handover');
  const received = done('received');
  const pickup = po.courier?.deliveryMode === 'self' || /pickup/i.test(scheduled?.text || '');
  const release = job ? releaseView(job) : null;
  const handoverDetails = po.handover || {};
  const payments = [...new Map([...(handoverDetails.approvedPayments || []), ...(po.phasePendingPayments || []), ...(po.payments || [])].map((payment) => [payment.id, payment])).values()];
  const readyNotDelivered = require('./purchaseOrderController').readyNotDeliveredFrom([po])[0] || null;
  const deliveryMode = handoverDetails.mode || (po.courier?.deliveryMode === 'self' ? 'pickup' : po.courier?.deliveryMode) || '';
  const delivered = po.courier?.status === 'delivered' || Boolean(received) || (pickup && Boolean(handover));
  const sent = delivered || po.courier?.status === 'dispatched' || Boolean(handover);
  const scheduleState = delivered ? 'delivered' : sent ? 'on_the_way' : scheduled ? 'scheduled' : 'not_scheduled';
  const releaseLabels = { awaiting_request: 'Waiting for release request', requested: 'Release requested — awaiting Medicine Department', accepted: 'Release request accepted', released: 'Medicine released', cancelled: 'Release request cancelled' };
  const timeline = [];
  const event = (label, at, byName, note = '') => { if (at) timeline.push({ label, at: iso(at), byName: byName || '', note }); };
  event('PO payment verified', po.paymentVerifiedAt, po.paymentVerifiedByName);
  for (const call of handoverDetails.calls || []) event(`Call: ${(call.outcome || '').replace(/_/g, ' ')}`, call.at, call.byName, call.notes);
  event('Delivery calls completed', handoverDetails.callsDoneAt, handoverDetails.callsDoneByName);
  event('PO paper signed by patient', handoverDetails.poPaperSignedAt, handoverDetails.poPaperSignedByName, handoverDetails.poPaperSignedNote);
  event('PCC assigned', handoverDetails.pcc?.at, handoverDetails.pcc?.byName, handoverDetails.pcc?.name);
  event('PCC acknowledged', handoverDetails.pcc?.ackAt, handoverDetails.pcc?.ackByName);
  event('Delivery delay noted', handoverDetails.stuckNote?.at, handoverDetails.stuckNote?.byName, handoverDetails.stuckNote?.text);
  for (const key of ['scheduled', 'handover', 'received', 'explained', 'started']) {
    const completed = done(key);
    if (completed) event(step(key).label || ({ scheduled: 'Delivery scheduled', handover: 'Dispatched / handed over', received: 'Patient receipt confirmed', explained: 'Medicine explained', started: 'Treatment started' })[key], completed.at, completed.by, completed.text);
  }
  if (release) {
    event('Payment reviewed for release', release.transitPaymentVerifiedAt, release.transitPaymentVerifiedByName);
    event('Release requested', release.requestedAt, release.requestedByName, release.requestNote);
    event('Payment checked & release accepted', release.acceptedAt, release.acceptedByName);
    event('Medicine released', release.releasedAt, release.releasedByName, release.releaseNotes);
    for (const cancellation of release.cancellations) event('Release request cancelled', cancellation.at, cancellation.byName, cancellation.reason);
    event('Release request reopened', release.reopenedAt, release.reopenedByName);
    event(release.followupLabel || 'Follow-up updated', release.statusUpdatedAt, release.statusUpdatedByName);
    for (const extension of release.extensions) event('Release deadline extended', extension.at, extension.byName, `${extension.days} day(s)${extension.reason ? ` · ${extension.reason}` : ''}`);
  }
  timeline.sort((a, b) => new Date(a.at) - new Date(b.at));
  return {
    po: { id: po.id, number: po.poNumber, status: po.status, statusLabel: PO_STATUS[po.status] || po.status, total: pay.totalAmount || 0, paid: pay.amountPaid || 0, balance: pay.remaining || 0, pending: pay.pendingCount || 0 },
    medicineDepartment: appointmentMedicine(job),
    inTransit: {
      patientApproval: { status: po.approvalStatus || 'unknown', at: null, byName: '' },
      selfPickup: { selected: deliveryMode === 'pickup', state: deliveryMode === 'pickup' ? scheduleState : 'not_selected', at: handoverDetails.pickupAt || null },
      porterCourier: { selected: Boolean(deliveryMode && deliveryMode !== 'pickup'), state: deliveryMode && deliveryMode !== 'pickup' ? scheduleState : 'not_selected', at: handoverDetails.dispatchAt || null, partner: handoverDetails.courier?.partner || handoverDetails.plannedCourier || po.courier?.courierPartner || '', tracking: handoverDetails.courier?.tracking || po.courier?.trackingNumber || '' },
      readyNotDelivered: readyNotDelivered ? { waitingDays: readyNotDelivered.waitingDays, madeAt: readyNotDelivered.madeAt, reasons: readyNotDelivered.reasons, note: readyNotDelivered.note } : null,
      current: transitNow?.label || '',
      payment: { state: pay.pendingCount ? 'pending' : po.paymentVerifiedAt ? 'verified' : 'not_verified', paid: pay.amountPaid || 0, balance: pay.remaining || 0, pendingCount: pay.pendingCount || 0 },
      payments,
      release: release ? { state: release.state, label: releaseLabels[release.state], jobId: String(job._id), followup: release.followupLabel, deadlineAt: release.deadlineAt, daysLeft: release.daysLeft, overdue: release.overdue } : null,
      callFollowUps: po.callFollowUps || [],
      paperSigned: Boolean(handoverDetails.poPaperSignedAt),
      phaseOnHold: Boolean(po.phaseHold), phaseRemoved: Boolean(po.phaseRemoved),
      plan: {
        mode: handoverDetails.mode || '', pickupAt: handoverDetails.pickupAt || null, dispatchAt: handoverDetails.dispatchAt || null,
        courier: handoverDetails.plannedCourier || '', address: handoverDetails.plannedAddress || '', note: handoverDetails.planNote || handoverDetails.pickupNote || '',
        pcc: handoverDetails.pcc?.name || '', explanationAt: handoverDetails.explanationAt || null, explanationMode: handoverDetails.explanationMode || '',
        receiver: handoverDetails.courier?.receivedByName || '', courierNote: handoverDetails.courier?.notes || '',
        packageImages: handoverDetails.courier?.packageImages || [], deliveryProofImages: handoverDetails.courier?.deliveryProofImages || [],
      },
      timeline,
    },
    medicine: po.medicine ? {
      status: po.medicine.status, label: MED_STATUS[po.medicine.status] || po.medicine.status,
      // Before it is ready: the fulfilment step it is on (formulation, packing, quality check ...).
      detail: po.medicine.status === 'made' || po.medicine.status === 'sent_to_courier' ? '' : (medicineStep?.waitText || ''),
      readyBy: po.medicine.readyByDate || null, madeAt: po.medicine.madeAt || null,
    } : { status: '', label: po.status === 'verified' ? 'Not requested yet' : '', detail: '' },
    delivery: {
      state: received || (pickup && handover) ? 'delivered' : handover ? 'on_the_way' : scheduled ? 'scheduled' : po.medicine ? 'not_scheduled' : '',
      text: scheduled?.text || '', scheduledAt: scheduled?.at || null, sentAt: handover?.at || null, deliveredAt: (received || (pickup ? handover : null))?.at || null,
      scheduledByName: scheduled?.by || '', sentByName: handover?.by || '', deliveredByName: (received || (pickup ? handover : null))?.by || '',
      via: po.courier ? [po.courier.courierPartner, po.courier.trackingNumber].filter(Boolean).join(' / ') : '',
      now: transitNow ? transitNow.label : '',
    },
    explainedAt: done('explained')?.at || null,
    startedAt: done('started')?.at || null,
  };
};

const rowOf = (entry, idAt, user, po = null, job = null, patient = null) => {
  const flow = entry.visitFlow || {};
  const pc = entry.postCounseling || {};
  const reg = entry.registration || {};
  const regFields = reg.fields ? (reg.fields.get ? Object.fromEntries(reg.fields) : reg.fields) : {};
  const purchase = pc.purchase || {};
  const converted = pc.outcome?.kind === 'converted';
  const fee = Number(purchase.totals?.approvedProgramFee || pc.record?.totals?.approvedProgramFee || 0);
  const paid = Number(purchase.values?.amountReceivedNow || 0);
  const approval = patient ? { status: patient.approvalStatus || 'approved', at: iso(patient.approvedAt), byName: patient.approvedByName || '' } : po ? { status: po.approvalStatus || 'unknown', at: null, byName: '' } : { status: 'unknown', at: null, byName: '' };
  const progress = progressOf(po, job);
  if (progress) progress.inTransit.patientApproval = approval;
  return {
    id: String(entry._id),
    appointmentDate: entry.appointmentDate,
    appointmentCode: entry.appointmentCode || '',
    patientName: regFields.patientName || mapValue(entry.salesValues, SALES_IDS.patientName),
    phone: mapValue(entry.salesValues, SALES_IDS.fatherNumber),
    tokenNumber: entry.tokenNumber || null,
    patientId: mapValue(entry.values, RECEPTION_IDS.patientId),
    patientIdAt: iso(idAt),
    arrivalStatus: mapValue(entry.values, RECEPTION_IDS.arrivalStatus),
    arrivalTime: mapValue(entry.values, RECEPTION_IDS.arrivalTime),
    release: flow.releasedAt ? { toId: String(flow.releasedTo || ''), toName: flow.releasedToName || '', at: iso(flow.releasedAt), byName: flow.releasedByName || '' } : null,
    registration: reg.status === 'sent' ? { at: iso(reg.sentAt), to: reg.postCounselorName || '', byName: reg.sentByName || '' } : reg.status === 'draft' ? { draft: true } : null,
    historyStarted: flow.historyStartedAt ? { at: iso(flow.historyStartedAt), byName: flow.historyStartedByName || '' } : null,
    historyTaken: flow.historyTakenAt ? { at: iso(flow.historyTakenAt), byName: flow.historyTakenByName || '' } : null,
    opdStarted: flow.opdStartedAt ? { at: iso(flow.opdStartedAt), byName: flow.opdStartedByName || '' } : null,
    opdCompleted: flow.opdCompletedAt ? { at: iso(flow.opdCompletedAt), byName: flow.opdCompletedByName || '' } : null,
    postCounsellingStarted: flow.postCounsellingStartedAt ? { at: iso(flow.postCounsellingStartedAt), byName: flow.postCounsellingStartedByName || '' } : null,
    postCounsellingCompleted: flow.postCounsellingCompletedAt ? { at: iso(flow.postCounsellingCompletedAt), byName: flow.postCounsellingCompletedByName || '' } : null,
    outcome: pc.outcome?.kind || '',
    package: converted ? {
      treatment: purchase.values?.orderedTreatment || '', supply: purchase.values?.supplyOrder || '', plan: purchase.plan || pc.record?.e?.paymentPlan || '',
      fee, paid, due: Number(purchase.totals?.outstandingBalance ?? Math.max(fee - paid, 0)), at: iso(pc.outcome?.at), byName: pc.outcome?.byName || '',
    } : null,
    poNumber: purchase.values?.poNo || '',
    ...(progress || {}),
    ...(patient || po ? { patientApproval: approval } : {}),
    ...(patient ? { treatment: appointmentTreatment(patient, po?.phase) } : {}),
    ...(patient ? { followUpSessions: appointmentSessions(patient, po?.phase) } : {}),
    // Who may do what on this row.
    canRelease: isAdminLike(user) || user.role === ROLES.RECEPTIONIST,
    canMarkHistory: isAdminLike(user) || user.role === ROLES.ASSISTANT_DOCTOR,
    canMarkOpd: isAdminLike(user) || user.role === ROLES.MEDICINE_DEPARTMENT,
    canMarkPostCounselling: isAdminLike(user) || user.role === ROLES.POST_COUNSELOR,
  };
};

// @route GET /api/appointments-board?from=&to=   (one day by default: today)
const listBoard = asyncHandler(async (req, res) => {
  const from = day(req.query.from) ? req.query.from : istToday();
  const to = day(req.query.to) && req.query.to >= from ? req.query.to : from;
  const entries = await Management.find({ appointmentDate: { $gte: from, $lte: to }, status: { $ne: 'cancelled' } })
    .select('appointmentDate appointmentCode tokenNumber salesValues values registration postCounseling visitFlow entryAt createdAt sourceAppointment consultationFee')
    .populate('sourceAppointment', 'consultationAccount consultationFee')
    .sort({ appointmentDate: 1, tokenNumber: 1, entryAt: 1 }).lean();
  // When the Patient ID was made: the arrival audit (Reception "Arrival marked" with a Patient ID).
  const audits = entries.length && mongoose.connection.readyState === 1 ? await SalesSheetAudit.find({ rowId: { $in: entries.map((e) => e._id) }, action: { $in: ['Arrival marked', 'Online consultation marked'] } })
    .select('rowId createdAt details').sort({ createdAt: 1 }).lean() : [];
  const idAt = new Map();
  audits.forEach((a) => { if (!idAt.has(String(a.rowId)) && /Patient ID|existing patient/.test(a.details || '')) idAt.set(String(a.rowId), a.createdAt); });
  // The POs made on these conversions (the PO number is written into the post-counselling purchase).
  const poNumbers = [...new Set(entries.map((e) => e.postCounseling?.purchase?.values?.poNo).filter(Boolean))];
  const { loadPoViews } = require('./purchaseOrderController');
  const pos = poNumbers.length && mongoose.connection.readyState === 1 ? await loadPoViews({ poNumber: { $in: poNumbers } }, { includeHandover: true }) : [];
  const poOf = new Map(pos.map((po) => [po.poNumber, po]));
  // Fetch the existing release/payment confirmations for these POs only; no new In Transit workflow is created here.
  const jobs = pos.length ? await MedicineJob.find({ purchaseOrder: { $in: pos.map((po) => po.id) } })
    .select('-formulation -reverts').sort({ createdAt: -1 }).lean() : [];
  const jobOf = new Map();
  jobs.forEach((job) => { if (!jobOf.has(String(job.purchaseOrder))) jobOf.set(String(job.purchaseOrder), job); });
  // Approval is the patient's own intake status, independently of whether a PO has been made yet.
  const patientCodes = [...new Set(entries.map((entry) => mapValue(entry.values, RECEPTION_IDS.patientId)).filter(Boolean))];
  const patients = patientCodes.length && mongoose.connection.readyState === 1 ? await Patient.find({ patientCode: { $in: patientCodes } }).select('patientCode approvalStatus approvedAt approvedByName currentStage isActive inactiveReason inactivatedAt inactivatedByName stages.number stages.status stages.date stages.notes stages.transit.activatedAt stages.transit.activatedByName stages.transit.medicineStartDate stages.transit.medicineStartSetAt stages.transit.medicineStartSetByName stages.transit.medicineStartNote stages.medicineExplainDate stages.transit.explanationMode stages.transit.explanationCompletedAt stages.transit.explanationCompletedByName stages.transit.explanationNote stages.transit.holdActive stages.transit.holdReason stages.transit.holdAt stages.transit.holdByName stages.transit.removedAt stages.transit.removedByName stages.transit.removedReason assignedDoctor stages.followUps stages.familySessions').populate('assignedDoctor', 'name').lean() : [];
  const patientOf = new Map(patients.map((patient) => [patient.patientCode, patient]));
  const [consultationPayments, recordRooms] = mongoose.connection.readyState === 1 ? await Promise.all([
    loadAppointmentConsultations(entries),
    loadAppointmentRecords(entries.map((entry) => ({ id: entry._id, appointmentCode: entry.appointmentCode, patientCode: mapValue(entry.values, RECEPTION_IDS.patientId), patientRef: patientOf.get(mapValue(entry.values, RECEPTION_IDS.patientId))?._id || null }))),
  ]) : [new Map(), new Map()];
  const rows = entries.map((e) => {
    const po = poOf.get(e.postCounseling?.purchase?.values?.poNo) || null;
    return { ...rowOf(e, idAt.get(String(e._id)) || null, req.user, po, po ? jobOf.get(po.id) || null : null, patientOf.get(mapValue(e.values, RECEPTION_IDS.patientId)) || null), consultationPayment: consultationPayments.get(String(e._id)) || null, recordRoom: recordRooms.get(String(e._id)) || null };
  })
    .sort((a, b) => (a.appointmentDate.localeCompare(b.appointmentDate)) || ((a.tokenNumber || 9999) - (b.tokenNumber || 9999)));
  const pccs = await User.find({ role: ROLES.ASSISTANT_DOCTOR, isActive: { $ne: false } }).select('name').sort({ name: 1 }).lean();
  res.json({ success: true, from, to, rows, pccs: pccs.map((u) => ({ id: String(u._id), name: u.name })) });
});

const loadEntry = async (req) => {
  if (!mongoose.Types.ObjectId.isValid(String(req.params.id))) fail('Invalid appointment');
  const entry = await Management.findById(req.params.id);
  if (!entry) fail('Appointment not found', 404);
  return entry;
};
const audit = (req, entry, action, details) => SalesSheetAudit.create({ sheet: 'management', rowId: entry._id, appointmentCode: entry.appointmentCode, action, details, changedBy: req.user._id, changedByName: req.user.name }).catch(() => {});

// @route POST /api/appointments-board/:id/release  { pccId }   Reception releases the patient to a PCC (history).
const releasePatient = asyncHandler(async (req, res) => {
  if (!(isAdminLike(req.user) || req.user.role === ROLES.RECEPTIONIST)) fail('Only Reception releases the patient', 403);
  const entry = await loadEntry(req);
  if (!mapValue(entry.values, RECEPTION_IDS.patientId)) fail('Mark the arrival first (the Patient ID is made there)');
  if (!mongoose.Types.ObjectId.isValid(String(req.body.pccId))) fail('Choose the PCC');
  const pcc = await User.findOne({ _id: req.body.pccId, role: ROLES.ASSISTANT_DOCTOR, isActive: { $ne: false } }).select('name').lean();
  if (!pcc) fail('Choose an active PCC');
  if (entry.visitFlow?.historyStartedAt && String(entry.visitFlow.releasedTo) !== String(pcc._id)) fail('History has already started with another PCC', 409);
  const now = new Date();
  entry.visitFlow = { ...(entry.visitFlow?.toObject ? entry.visitFlow.toObject() : entry.visitFlow || {}), releasedTo: pcc._id, releasedToName: pcc.name, releasedAt: now, releasedByName: req.user.name };
  entry.values.set(RELEASE_TIME_COLUMN, istTime(now));
  await entry.save();
  await audit(req, entry, 'Released to PCC', `${pcc.name} at ${istTime(now)}`);
  emitChanged(req);
  res.json({ success: true, row: rowOf(entry.toObject(), null, req.user) });
});

// @route POST /api/appointments-board/:id/history  { step: 'started' | 'taken', done: true|false }
// Any PCC (or the admin / manager) ticks it once the patient has arrived; the time and who ticked are stamped.
const markHistory = asyncHandler(async (req, res) => {
  const entry = await loadEntry(req);
  const flow = entry.visitFlow || {};
  if (!isAdminLike(req.user) && req.user.role !== ROLES.ASSISTANT_DOCTOR) fail('Only a PCC marks the history', 403);
  if (!mapValue(entry.values, RECEPTION_IDS.patientId)) fail('Mark the arrival first (the Patient ID is made there)');
  const step = req.body.step === 'taken' ? 'taken' : 'started';
  const done = req.body.done !== false && req.body.done !== 'false';
  const [atKey, byKey] = step === 'taken' ? ['historyTakenAt', 'historyTakenByName'] : ['historyStartedAt', 'historyStartedByName'];
  if (done && step === 'taken' && !flow.historyStartedAt) fail('Tick "History start" first');
  if (!done && step === 'started' && flow.historyTakenAt) fail('Untick "History taken" first');
  if (!done && flow[atKey] && req.body.edit !== true) fail('Use Edit and Save to change a saved status', 409);
  if (!done && !isAdminLike(req.user) && flow[atKey] && Date.now() - new Date(flow[atKey]).getTime() > 30 * 60000) fail('Only the admin can undo this after 30 minutes', 403);
  if (Boolean(flow[atKey]) === done && !(done && req.body.edit === true && req.body.refreshTimestamp === true)) return res.json({ success: true, row: rowOf(entry.toObject(), null, req.user) });
  const now = new Date();
  entry.visitFlow = { ...(flow.toObject ? flow.toObject() : flow), [atKey]: done ? now : null, [byKey]: done ? req.user.name : '' };
  await entry.save();
  await audit(req, entry, done ? `History ${step}` : `History ${step} undone`, done ? `at ${istTime(now)}` : '');
  emitChanged(req);
  res.json({ success: true, row: rowOf(entry.toObject(), null, req.user) });
});

// OPD ticks belong to the Medicine Department; they keep the same arrival/order/undo rules as history.
const markOpd = asyncHandler(async (req, res) => {
  if (!isAdminLike(req.user) && req.user.role !== ROLES.MEDICINE_DEPARTMENT) fail('Only the Medicine Department marks OPD start and completion', 403);
  const entry = await loadEntry(req);
  const flow = entry.visitFlow || {};
  if (!mapValue(entry.values, RECEPTION_IDS.patientId)) fail('Mark the arrival first (the Patient ID is made there)');
  const step = req.body?.step;
  if (!['started', 'completed'].includes(step)) fail('Choose OPD start or OPD complete');
  const done = req.body.done !== false && req.body.done !== 'false';
  const [atKey, byKey] = step === 'completed' ? ['opdCompletedAt', 'opdCompletedByName'] : ['opdStartedAt', 'opdStartedByName'];
  if (done && step === 'completed' && !flow.opdStartedAt) fail('Tick "OPD start" first');
  if (!done && step === 'started' && flow.opdCompletedAt) fail('Untick "OPD complete" first');
  if (!done && flow[atKey] && req.body.edit !== true) fail('Use Edit and Save to change a saved status', 409);
  if (!done && !isAdminLike(req.user) && flow[atKey] && Date.now() - new Date(flow[atKey]).getTime() > 30 * 60000) fail('Only the admin can undo this after 30 minutes', 403);
  // A repeated checkbox save must preserve the actual first tick and its operator.
  if (Boolean(flow[atKey]) === done && !(done && req.body.edit === true && req.body.refreshTimestamp === true)) return res.json({ success: true, row: rowOf(entry.toObject(), null, req.user) });
  const now = new Date();
  entry.visitFlow = { ...(flow.toObject ? flow.toObject() : flow), [atKey]: done ? now : null, [byKey]: done ? req.user.name : '' };
  await entry.save();
  await audit(req, entry, done ? `OPD ${step}` : `OPD ${step} undone`, `Appointment ${entry.appointmentCode} · ${now.toISOString()}`);
  emitChanged(req);
  res.json({ success: true, row: rowOf(entry.toObject(), null, req.user) });
});

const markPostCounselling = asyncHandler(async (req, res) => {
  if (!isAdminLike(req.user) && req.user.role !== ROLES.POST_COUNSELOR) fail('Only a Post Counselor marks post counselling start and completion', 403);
  const entry = await loadEntry(req);
  const flow = entry.visitFlow || {};
  if (!mapValue(entry.values, RECEPTION_IDS.patientId)) fail('Mark the arrival first (the Patient ID is made there)');
  const step = req.body?.step;
  if (!['started', 'completed'].includes(step)) fail('Choose Post Counselling start or complete');
  const done = req.body.done !== false && req.body.done !== 'false';
  const [atKey, byKey] = step === 'completed' ? ['postCounsellingCompletedAt', 'postCounsellingCompletedByName'] : ['postCounsellingStartedAt', 'postCounsellingStartedByName'];
  if (done && step === 'completed' && !flow.postCounsellingStartedAt) fail('Tick "Post Counselling start" first');
  if (!done && step === 'started' && flow.postCounsellingCompletedAt) fail('Untick "Post Counselling complete" first');
  if (!done && flow[atKey] && req.body.edit !== true) fail('Use Edit and Save to change a saved status', 409);
  if (!done && !isAdminLike(req.user) && flow[atKey] && Date.now() - new Date(flow[atKey]).getTime() > 30 * 60000) fail('Only the admin can undo this after 30 minutes', 403);
  if (Boolean(flow[atKey]) === done && !(done && req.body.edit === true && req.body.refreshTimestamp === true)) return res.json({ success: true, row: rowOf(entry.toObject(), null, req.user) });
  const now = new Date();
  entry.visitFlow = { ...(flow.toObject ? flow.toObject() : flow), [atKey]: done ? now : null, [byKey]: done ? req.user.name : '' };
  await entry.save();
  await audit(req, entry, done ? `Post counselling ${step}` : `Post counselling ${step} undone`, `Appointment ${entry.appointmentCode} · ${now.toISOString()}`);
  emitChanged(req);
  res.json({ success: true, row: rowOf(entry.toObject(), null, req.user) });
});

module.exports = { listBoard, releasePatient, markHistory, markOpd, markPostCounselling, rowOf, progressOf };
