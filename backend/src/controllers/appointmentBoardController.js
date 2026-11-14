const mongoose = require('mongoose');
const Management = require('../models/AppointmentManagementEntry');
const SalesSheetAudit = require('../models/SalesSheetAudit');
const User = require('../models/User');
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
const progressOf = (po) => {
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
  return {
    po: { id: po.id, number: po.poNumber, status: po.status, statusLabel: PO_STATUS[po.status] || po.status, total: pay.totalAmount || 0, paid: pay.amountPaid || 0, balance: pay.remaining || 0, pending: pay.pendingCount || 0 },
    medicine: po.medicine ? {
      status: po.medicine.status, label: MED_STATUS[po.medicine.status] || po.medicine.status,
      // Before it is ready: the fulfilment step it is on (formulation, packing, quality check ...).
      detail: po.medicine.status === 'made' || po.medicine.status === 'sent_to_courier' ? '' : (medicineStep?.waitText || ''),
      readyBy: po.medicine.readyByDate || null, madeAt: po.medicine.madeAt || null,
    } : { status: '', label: po.status === 'verified' ? 'Not requested yet' : '', detail: '' },
    delivery: {
      state: received || (pickup && handover) ? 'delivered' : handover ? 'on_the_way' : scheduled ? 'scheduled' : po.medicine ? 'not_scheduled' : '',
      text: scheduled?.text || '', scheduledAt: scheduled?.at || null, sentAt: handover?.at || null, deliveredAt: (received || (pickup ? handover : null))?.at || null,
      via: po.courier ? [po.courier.courierPartner, po.courier.trackingNumber].filter(Boolean).join(' / ') : '',
      now: transitNow ? transitNow.label : '',
    },
    explainedAt: done('explained')?.at || null,
    startedAt: done('started')?.at || null,
  };
};

const rowOf = (entry, idAt, user, po = null) => {
  const flow = entry.visitFlow || {};
  const pc = entry.postCounseling || {};
  const reg = entry.registration || {};
  const regFields = reg.fields ? (reg.fields.get ? Object.fromEntries(reg.fields) : reg.fields) : {};
  const purchase = pc.purchase || {};
  const converted = pc.outcome?.kind === 'converted';
  const fee = Number(purchase.totals?.approvedProgramFee || pc.record?.totals?.approvedProgramFee || 0);
  const paid = Number(purchase.values?.amountReceivedNow || 0);
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
    ...(progressOf(po) || {}),
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
    .select('appointmentDate appointmentCode tokenNumber salesValues values registration postCounseling visitFlow entryAt createdAt')
    .sort({ appointmentDate: 1, tokenNumber: 1, entryAt: 1 }).lean();
  // When the Patient ID was made: the arrival audit (Reception "Arrival marked" with a Patient ID).
  const audits = entries.length && mongoose.connection.readyState === 1 ? await SalesSheetAudit.find({ rowId: { $in: entries.map((e) => e._id) }, action: { $in: ['Arrival marked', 'Online consultation marked'] } })
    .select('rowId createdAt details').sort({ createdAt: 1 }).lean() : [];
  const idAt = new Map();
  audits.forEach((a) => { if (!idAt.has(String(a.rowId)) && /Patient ID|existing patient/.test(a.details || '')) idAt.set(String(a.rowId), a.createdAt); });
  // The POs made on these conversions (the PO number is written into the post-counselling purchase).
  const poNumbers = [...new Set(entries.map((e) => e.postCounseling?.purchase?.values?.poNo).filter(Boolean))];
  const { loadPoViews } = require('./purchaseOrderController');
  const pos = poNumbers.length && mongoose.connection.readyState === 1 ? await loadPoViews({ poNumber: { $in: poNumbers } }) : [];
  const poOf = new Map(pos.map((po) => [po.poNumber, po]));
  const rows = entries.map((e) => rowOf(e, idAt.get(String(e._id)) || null, req.user, poOf.get(e.postCounseling?.purchase?.values?.poNo) || null))
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
  if (!done && !isAdminLike(req.user) && flow[atKey] && Date.now() - new Date(flow[atKey]).getTime() > 30 * 60000) fail('Only the admin can undo this after 30 minutes', 403);
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
  if (!done && !isAdminLike(req.user) && flow[atKey] && Date.now() - new Date(flow[atKey]).getTime() > 30 * 60000) fail('Only the admin can undo this after 30 minutes', 403);
  // A repeated checkbox save must preserve the actual first tick and its operator.
  if (Boolean(flow[atKey]) === done) return res.json({ success: true, row: rowOf(entry.toObject(), null, req.user) });
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
  if (!done && !isAdminLike(req.user) && flow[atKey] && Date.now() - new Date(flow[atKey]).getTime() > 30 * 60000) fail('Only the admin can undo this after 30 minutes', 403);
  if (Boolean(flow[atKey]) === done) return res.json({ success: true, row: rowOf(entry.toObject(), null, req.user) });
  const now = new Date();
  entry.visitFlow = { ...(flow.toObject ? flow.toObject() : flow), [atKey]: done ? now : null, [byKey]: done ? req.user.name : '' };
  await entry.save();
  await audit(req, entry, done ? `Post counselling ${step}` : `Post counselling ${step} undone`, `Appointment ${entry.appointmentCode} · ${now.toISOString()}`);
  emitChanged(req);
  res.json({ success: true, row: rowOf(entry.toObject(), null, req.user) });
});

module.exports = { listBoard, releasePatient, markHistory, markOpd, markPostCounselling, rowOf, progressOf };
