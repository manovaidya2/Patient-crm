const crypto = require('crypto');
const mongoose = require('mongoose');
const Patient = require('../models/Patient');
const PurchaseOrder = require('../models/PurchaseOrder');
const BankAccount = require('../models/BankAccount');
const { asyncHandler } = require('../middleware/errorHandler');
const { ROLES, isAdminLike } = require('../constants/roles');
const { STAGES } = require('../constants/treatmentStages');
const { supplyOption, supplyOptionByLabel, supplyLabel, AGE_BANDS, ageBandByLabel, ageBandFor } = require('../constants/supplyPlans');
const { setPhaseAge } = require('../utils/phaseAge');
const purchase = require('../utils/purchaseOrderRecord');
const { assertPurchaseComplete, withBankName, paymentFromPaper } = require('../utils/convertPatient');
const { createWithPoNumber } = require('../utils/poNumber');
const { parseUtrEntries, resolveUtrs } = require('../utils/utrEntries');
const { buildPoView, STAGE_KEYS, isPendingStage, findRequest } = require('../utils/purchaseOrderFlow');

const PO_VIEW_ROLES = [ROLES.ADMIN, ROLES.DOCTOR, ROLES.MANAGER, ROLES.POST_COUNSELOR, ROLES.IN_TRANSIT];
const PO_CREATE_ROLES = [ROLES.ADMIN, ROLES.DOCTOR, ROLES.POST_COUNSELOR, ROLES.IN_TRANSIT];
const PO_VERIFY_ROLES = [ROLES.ADMIN, ROLES.DOCTOR, ROLES.IN_TRANSIT];

const fail = (message, statusCode = 400) => { throw Object.assign(new Error(message), { statusCode }); };
const clean = (value, max = 300) => String(value ?? '').trim().replace(/[\r\n\t]+/g, ' ').slice(0, max);
// The checklist lines ticked on a verification step.
const checksOf = (body) => (Array.isArray(body?.checks) ? body.checks.map((c) => clean(c, 250)).filter(Boolean).slice(0, 10) : []);
const longText = (value, max = 2000) => String(value ?? '').trim().slice(0, max);
const fileItems = (files = [], folder = 'purchase-orders') => files.map((file) => ({ url: `/uploads/${folder}/${file.filename}`, fileName: file.originalname }));
// Single-field uploads give an array, multi-field uploads give { field: [...] }.
const filesOf = (req, field) => (Array.isArray(req.files) ? req.files : (req.files?.[field] || []));
const parseDay = (value, label, { required = false } = {}) => {
  const text = clean(value, 40);
  if (!text) { if (required) fail(`Enter the ${label}`); return null; }
  const d = /^\d{4}-\d{2}-\d{2}$/.test(text) ? new Date(`${text}T00:00:00.000+05:30`) : new Date(text);
  if (Number.isNaN(d.getTime())) fail(`Enter a valid ${label}`);
  return d;
};
const amountOf = (value, label, { min = 0 } = {}) => {
  const raw = String(value ?? '').replace(/,/g, '').trim();
  if (raw === '') return 0;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < min || n > 100000000) fail(`Enter a valid ${label}`);
  return Math.round(n * 100) / 100;
};
const parseSupply = (body, { required = false } = {}) => {
  const [plan, part] = body.supplyKey ? String(body.supplyKey).split(':') : [body.supplyPlan, body.supplyPart];
  if (!plan && !part) { if (required) fail('Select the supply category (6 months / 1+5 / 2+4)'); return null; }
  const option = supplyOption(plan, part);
  if (!option) fail('Select a valid supply category');
  return option;
};
const { fixedReadyDate, readyDateFromPostCounselling, canOverrideFixed } = require('../utils/medicineDelay');
const { patientDocuments } = require('../utils/patientDocuments');
const { emitMedicineJobChanged } = require('../realtime/salesSheetSocket');
const { cleanCaseCategory, patientCaseCategory } = require('../utils/caseCategory');
const event = (po, user, action, details = '') => po.events.push({ at: new Date(), action, details, byName: user.name, byRole: user.role });
const logActivity = (patient, user, action, details = '') => patient.activityLog.push({ action, details, actorName: user.name, actorRole: user.role });

const loadPo = async (id) => {
  if (!mongoose.Types.ObjectId.isValid(String(id))) fail('Purchase order not found', 404);
  const po = await PurchaseOrder.findById(id);
  if (!po) fail('Purchase order not found', 404);
  return po;
};
const loadPatient = async (id) => {
  const patient = await Patient.findById(id);
  if (!patient) fail('Patient not found', 404);
  return patient;
};
// Older patients may be missing a phase entry; add the empty one instead of failing.
const stageOf = (patient, number) => {
  let stage = patient.stages.find((s) => s.number === number);
  if (!stage) {
    patient.stages.push({ number });
    stage = patient.stages.find((s) => s.number === number);
  }
  if (!stage.transit) stage.transit = {};
  return stage;
};
// The PO details page also shows the Medicine Department's progress on this PO's request.
const respond = async (res, po, patient, status = 200) => {
  let job = null;
  if (po.medicineRequestId) {
    try { const MedicineJob = require('../models/MedicineJob'); job = await MedicineJob.findOne({ patient: po.patient, phase: po.phase, requestId: po.medicineRequestId }).lean(); } catch { job = null; }
  }
  const [documents, caseCategory] = await Promise.all([patientDocuments(patient), patientCaseCategory(patient)]);
  // The other POs of the phase: each PO is paid on its own.
  const phasePos = mongoose.connection.readyState === 1 ? await PurchaseOrder.find({ patient: po.patient, phase: po.phase }).select('poNumber amount paymentIds medicineRequestId status').lean() : [];
  res.status(status).json({ success: true, purchaseOrder: { ...buildPoView(po, patient.toObject ? patient.toObject() : patient, { includeEvents: true, job, phasePos }), patientDocuments: documents, patientCaseCategory: caseCategory } });
};

// Validates the payment typed on a PO form. Returns null when no payment was entered.
const paymentFromBody = async (body, files, user, poNumber) => {
  const mode = body.paymentMode;
  // Several same-day transfers (UTRs) make up one payment: its amount is their total.
  const utrs = resolveUtrs({ entries: mode === 'online' ? parseUtrEntries(body.utrEntries) : [], amount: null, utr: body.utr, transactionId: body.transactionId });
  const amount = utrs.utrEntries.length ? utrs.amount : amountOf(body.paymentAmount, 'payment amount');
  if (!amount) return null;
  if (!['cash', 'online'].includes(mode)) fail('Select cash or online for the payment');
  let bank = { payToBank: null, payToBankName: '' };
  if (mode === 'online') {
    if (!clean(utrs.utr, 120) && !utrs.utrEntries.length) fail('Enter the UTR / reference of the online payment');
    if (!files.length) fail('Attach the payment screenshot');
    const bankId = clean(body.payToBank, 24);
    if (bankId) {
      if (!mongoose.Types.ObjectId.isValid(bankId)) fail('Select a valid bank');
      const found = await BankAccount.findOne({ _id: bankId, isActive: true }).lean();
      if (!found) fail('Select an active bank');
      bank = { payToBank: found._id, payToBankName: found.displayName || found.name };
    }
  } else if (!clean(body.receivedBy, 120)) fail('Enter who received the cash');
  const items = fileItems(files);
  return {
    _id: new mongoose.Types.ObjectId(),
    amount, date: parseDay(body.paymentDate, 'payment date') || new Date(), paymentMode: mode,
    ...bank,
    utr: mode === 'online' ? clean(utrs.utr, 1000) : '',
    transactionId: mode === 'online' ? clean(utrs.transactionId, 1000) : '',
    utrEntries: mode === 'online' ? utrs.utrEntries : [],
    receivedBy: mode === 'cash' ? clean(body.receivedBy, 120) : '',
    notes: [`PO ${poNumber}`, longText(body.paymentNotes, 1500)].filter(Boolean).join(' | '),
    screenshotUrl: items[0]?.url || null, screenshotFiles: items,
    recordedByName: user.name, recordedBy: user._id || null, approvalStatus: 'pending',
  };
};

// Every PO with its patient, as list views (used by the list and by the sidebar task counts).
const loadPoViews = async (filter = { patient: { $ne: null } }, { includeHandover = false } = {}) => {
  const pos = await PurchaseOrder.find(filter).select('-events').sort({ createdAt: -1 }).limit(2000).lean();
  const patientIds = [...new Set(pos.map((po) => String(po.patient)))];
  const patients = await Patient.find({ _id: { $in: patientIds } })
    .select(`patientName patientCode number age category approvalStatus currentStage isActive stages.number stages.totalAmount stages.payments stages.transit stages.medicineRequest stages.medicineRequests stages.medicineExplainDate${includeHandover ? ' guardianName relativeName address city assignedDoctor' : ''}`)
    .populate(includeHandover ? { path: 'assignedDoctor', select: 'name' } : [])
    .lean();
  const byId = new Map(patients.map((p) => [String(p._id), p]));
  const MedicineJob = require('../models/MedicineJob');
  const jobs = await MedicineJob.find({ patient: { $in: patientIds } }).select('patient phase requestId currentStage status hold').lean();
  const jobOf = new Map(jobs.map((j) => [`${j.patient}-${j.phase}-${j.requestId}`, j]));
  return pos.filter((po) => byId.has(String(po.patient)))
    .map((po) => buildPoView(po, byId.get(String(po.patient)), { includeHandover, job: po.medicineRequestId ? jobOf.get(`${po.patient}-${po.phase}-${po.medicineRequestId}`) || null : null, phasePos: pos.filter((o) => String(o.patient) === String(po.patient) && o.phase === po.phase) }));
};

// Courier Requests / Delivered Couriers: every PO whose medicine In Transit has scheduled (courier, porter or self
// pickup with its expected date), read from the PO's In Transit timeline. It is "to send" until it is dispatched or
// collected, then it is under "delivered" (on the way until the patient's receipt is confirmed).
const MED_LABEL = { requested: 'Waiting for Medicine Dept', in_process: 'Being prepared', made: 'Medicine ready', sent_to_courier: 'Released by Medicine Dept' };
const courierHandovers = async () => {
  const views = await loadPoViews({ status: 'verified', medicineRequestId: { $nin: ['', null] } }, { includeHandover: true });
  // A PO whose medicine already left but is no longer the phase's current request keeps its own courier record.
  const earlier = views.filter((v) => !v.isPhaseCurrentRequest && v.medicine && ['dispatched', 'delivered'].includes(v.courier?.status)).map((v) => ({
    poId: v.id, poNumber: v.poNumber, patientId: v.patientId, patientName: v.patientName, patientCode: v.patientCode, patientPhone: v.patientPhone, phase: v.phase, supplyLabel: v.supplyLabel,
    section: 'delivered', received: v.courier.status === 'delivered', mode: v.courier.deliveryMode === 'self' ? 'pickup' : v.courier.deliveryMode || 'courier', expectedAt: null,
    medicine: { status: v.medicine.status, label: MED_LABEL[v.medicine.status] || v.medicine.status, readyByDate: v.medicine.readyByDate, requestedAt: v.medicine.requestedAt },
    payment: v.poPayment, nextStep: null, delay: v.delay,
    courier: { status: v.courier.status, partner: v.courier.courierPartner, tracking: v.courier.trackingNumber, receivedByName: v.courier.receivedByName, deliveredAt: v.courier.deliveredAt, dispatchedAt: v.courier.dispatchedAt, packageImages: [], deliveryProofImages: [] },
  }));
  return [...earlier, ...views.filter((v) => v.isPhaseCurrentRequest && v.handover?.mode && v.medicine && v.medicine.status !== 'cancelled'
    && (v.steps.find((s) => s.key === 'scheduled')?.done || ['dispatched', 'delivered'].includes(v.handover.courier.status)))
    .map((v) => {
      const h = v.handover;
      const pickup = h.mode === 'pickup';
      const sent = pickup ? h.courier.status === 'delivered' : ['dispatched', 'delivered'].includes(h.courier.status);
      const transitNow = v.steps.find((s) => s.branch === 'transit' && s.state === 'current');
      return {
        poId: v.id, poNumber: v.poNumber, patientId: v.patientId, patientName: v.patientName, patientCode: v.patientCode, patientPhone: v.patientPhone, phase: v.phase, supplyLabel: v.supplyLabel,
        section: sent ? 'delivered' : 'pending', received: h.courier.status === 'delivered',
        mode: h.mode, expectedAt: pickup ? h.pickupAt : h.dispatchAt, plannedCourier: h.plannedCourier, plannedAddress: h.plannedAddress, planNote: pickup ? h.pickupNote : h.planNote,
        scheduledByName: h.setByName, scheduledAt: h.setAt, explanationAt: h.explanationAt, explanationMode: h.explanationMode, pcc: h.pcc.name,
        medicine: { status: v.medicine.status, label: MED_LABEL[v.medicine.status] || v.medicine.status, readyByDate: v.medicine.readyByDate, requestedAt: v.medicine.requestedAt },
        payment: v.poPayment,
        nextStep: transitNow ? { label: transitNow.label, waitText: transitNow.waitText || '' } : null,
        delay: v.delay, courier: h.courier,
      };
    })].sort((a, b) => new Date(a.expectedAt || 0) - new Date(b.expectedAt || 0));
};

// @route GET /api/courier/handovers?section=pending|delivered
const listCourierHandovers = asyncHandler(async (req, res) => {
  const section = req.query.section === 'delivered' ? 'delivered' : 'pending';
  const rows = (await courierHandovers()).filter((r) => r.section === section);
  if (section === 'delivered') rows.sort((a, b) => new Date(b.courier.deliveredAt || b.courier.dispatchedAt || 0) - new Date(a.courier.deliveredAt || a.courier.dispatchedAt || 0));
  res.json({ success: true, count: rows.length, rows });
});

// @route GET /api/purchase-orders?stage=&q=&patient=
const listPurchaseOrders = asyncHandler(async (req, res) => {
  const filter = {};
  if (req.query.patient) {
    if (!mongoose.Types.ObjectId.isValid(String(req.query.patient))) fail('Invalid patient');
    filter.patient = req.query.patient;
  } else filter.patient = { $ne: null };
  let items = await loadPoViews(filter);
  const q = clean(req.query.q, 100).toLowerCase();
  if (q) items = items.filter((item) => [item.poNumber, item.patientName, item.patientCode, item.patientPhone].some((v) => String(v || '').toLowerCase().includes(q)));
  const counts = Object.fromEntries(STAGE_KEYS.map((key) => [key, items.filter((item) => item.stageKey === key).length]));
  counts.all = items.length;
  counts.pending = items.filter((item) => isPendingStage(item.stageKey)).length;
  // Of those, how many wait for the signed-in role (orange marks on the page).
  // The Manager's own steps are the Admin's (the step lists name the Admin only).
  const myRole = isAdminLike(req.user) ? ROLES.ADMIN : req.user.role;
  const mine = items.filter((item) => item.actionBy.includes(myRole));
  const mineCounts = Object.fromEntries(STAGE_KEYS.map((key) => [key, mine.filter((item) => item.stageKey === key).length]));
  mineCounts.all = mine.length;
  mineCounts.pending = mine.length;
  counts.mine = mineCounts;
  const stage = STAGE_KEYS.includes(req.query.stage) || req.query.stage === 'pending' ? req.query.stage : '';
  if (stage === 'pending') items = items.filter((item) => isPendingStage(item.stageKey));
  else if (stage) items = items.filter((item) => item.stageKey === stage);
  res.json({ success: true, counts, items });
});

// @route GET /api/purchase-orders/:id
const getPurchaseOrder = asyncHandler(async (req, res) => {
  const po = await loadPo(req.params.id);
  const patient = await Patient.findById(po.patient).populate('assignedDoctor', 'name').lean();
  if (!patient) fail('Patient not found', 404);
  await respond(res, po, patient);
});

// @route GET /api/purchase-orders/form?patient=&phase=
// The PO paper (sections F, G, H) prefilled for a new purchase order of an existing patient.
const getPurchaseOrderForm = asyncHandler(async (req, res) => {
  const patient = await Patient.findById(req.query.patient).lean();
  if (!patient) fail('Patient not found', 404);
  const phase = STAGES.includes(parseInt(req.query.phase, 10)) ? parseInt(req.query.phase, 10) : (patient.currentStage || 1);
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  const registration = {
    category: patient.category, fatherName: patient.fatherName || patient.guardianName || '', motherName: patient.motherName || '',
    fatherNumber: patient.number || '', motherNumber: patient.alternateNumber || '',
  };
  const values = purchase.defaults({ record: null, registration, counselorName: req.user.name, today });
  values.orderedTreatment = `${patient.category === 'mental_health' ? 'Mental Health' : 'Autism / ADHD'} / Phase ${phase}`;
  res.json({ success: true, definitions: purchase.definitions(), values, contacts: registration, phase });
});

// @route POST /api/purchase-orders/upload   (multipart: screenshot[]) - PO paper images and payment screenshots
const uploadPaperFiles = asyncHandler(async (req, res) => {
  const files = (req.files || []).map((file) => ({ url: `/uploads/payments/${file.filename}`, fileName: file.originalname }));
  if (!files.length) fail('Choose an image first');
  res.status(201).json({ success: true, files });
});

// @route POST /api/purchase-orders   body: { patientId, phase, fee, purchase: <PO paper values> }
// A new purchase order for any phase of an existing patient, filled on the same PO paper as at conversion (payment
// collection, EMI, PO & consent, PO image, payment screenshots or cash details). The number is generated here. The
// amount received becomes a pending phase payment linked to this PO, exactly like the payment saved at conversion.
const createPurchaseOrder = asyncHandler(async (req, res) => {
  const body = req.body || {};
  const patient = await loadPatient(body.patientId);
  if (patient.isActive === false) fail('This patient is closed. Reactivate the patient first');
  const phase = parseInt(body.phase, 10);
  if (!STAGES.includes(phase)) fail('Select the phase');
  const fee = amountOf(body.fee, 'PO value / approved fee');
  if (!(fee > 0)) fail('Enter the PO value (approved fee)');
  const cleaned = purchase.cleanPurchase(body.purchase, fee);
  assertPurchaseComplete(cleaned.values);
  const supply = supplyOptionByLabel(cleaned.values.supplyOrder);
  if (!supply) fail('Select the medicine supply on this PO (6 months / 1+5 / 2+4)');
  const paper = await withBankName(cleaned.values);
  const readyBy = parseDay(paper.medicineReadyDate, 'medicine ready date');
  const received = Number(paper.amountReceivedNow || 0);
  // In Transit verifies the payment from these, so a received amount must come with its proof.
  if (received > 0 && ['Online', 'Card (+3%)'].includes(paper.mode)) {
    if (!clean(paper.utrReference, 120)) fail('Enter the UTR / payment reference of the amount received');
    if (!(paper.screenshots || []).length) fail('Attach the payment screenshot');
  }
  if (received > 0 && paper.mode === 'Cash' && !clean(paper.cashReceiver || paper.cashHandedTo, 120)) fail('Enter who received the cash');

  const po = await createWithPoNumber(PurchaseOrder, {
    patient: patient._id, patientCode: patient.patientCode || '', patientName: patient.patientName,
    phase, supplyPlan: supply.plan, supplyPart: supply.part, ageBand: ageBandByLabel(paper.ageGroup),
    packageName: clean(paper.orderedTreatment, 200), amount: fee, medicineReadyDate: readyBy, notes: longText(paper.paymentNotes),
    paperImages: paper.paperImages || [], status: 'pending', source: 'manual', createdByName: req.user.name, createdByRole: req.user.role,
    events: [{ at: new Date(), action: 'PO created', details: `Phase ${phase} | ${supply.label} | Rs ${fee}${received > 0 ? ` | Rs ${received} received (${paper.mode})` : ''}`, byName: req.user.name, byRole: req.user.role }],
  });
  try {
    const values = { ...paper, poNo: po.poNumber };
    po.paperValues = { ...values, totals: cleaned.totals };
    const stage = stageOf(patient, phase);
    const payment = paymentFromPaper(values, { cardCharge: cleaned.totals.cardCharge, user: req.user });
    if (payment) {
      stage.payments.push(payment);
      po.paymentIds.push(payment._id);
      event(po, req.user, 'Payment added', `Rs ${payment.amount} via ${paper.mode} - pending verification`);
      logActivity(patient, req.user, `Payment added for Phase ${phase}`, `${payment.amount} via ${paper.mode} — PO ${po.poNumber}, pending accounts approval`);
    }
    // Keep the phase fields the older screens read in step with its first purchase order.
    if (!String(stage.purchaseOrder || '').trim()) stage.purchaseOrder = po.poNumber;
    if (!Number(stage.totalAmount || 0)) stage.totalAmount = fee;
    if (!stage.packageName && po.packageName) stage.packageName = po.packageName;
    if (!stage.poPaper) stage.poPaper = { values, totals: { ...cleaned.totals, approvedProgramFee: fee }, savedAt: new Date(), savedByName: req.user.name, source: 'purchase_order' };
    if (!stage.transit.enteredAt) stage.transit.enteredAt = new Date();
    if (readyBy && !stage.transit.expectedReadyDate) stage.transit.expectedReadyDate = readyBy;
    logActivity(patient, req.user, `Purchase order created for Phase ${phase}`, `${po.poNumber} | ${supply.label} | Rs ${fee}`);
    await patient.save();
    await po.save();
  } catch (error) {
    await PurchaseOrder.deleteOne({ _id: po._id }).catch(() => {});
    throw error;
  }
  await respond(res, po, patient, 201);
});

// @route PATCH /api/purchase-orders/:id   (multipart: paper[])
// Correct a PO before it is verified. A rejected PO goes back to In Transit for checking again.
const updatePurchaseOrder = asyncHandler(async (req, res) => {
  const po = await loadPo(req.params.id);
  if (!['pending', 'rejected'].includes(po.status)) fail('A verified purchase order cannot be edited');
  const body = req.body || {};
  const changes = [];
  const supply = parseSupply(body);
  const admin = canOverrideFixed(req.user);
  const supplyChanged = supply && (supply.plan !== po.supplyPlan || supply.part !== po.supplyPart);
  // The supply and the ready date come from post counselling: In Transit cannot change them.
  if (supplyChanged && po.supplyPlan && !admin) fail('The medicine supply is set by post counselling on the PO paper; only the admin can change it', 403);
  if (supplyChanged) { po.supplyPlan = supply.plan; po.supplyPart = supply.part; changes.push(supply.label); }
  if (body.packageName !== undefined) po.packageName = clean(body.packageName, 200);
  if (body.amount !== undefined) { po.amount = amountOf(body.amount, 'PO amount'); changes.push(`Rs ${po.amount}`); }
  if (body.medicineReadyDate !== undefined) {
    const next = parseDay(body.medicineReadyDate, 'medicine ready date');
    const changed = String(next?.getTime() || '') !== String(po.medicineReadyDate ? new Date(po.medicineReadyDate).getTime() : '');
    if (changed && po.medicineReadyDate && readyDateFromPostCounselling(po) && !admin) fail('The medicine ready date is set by post counselling on the PO paper; only the admin can change it', 403);
    if (changed) { po.medicineReadyDate = next; changes.push(`ready by ${next ? next.toISOString().slice(0, 10) : '-'}`); }
  }
  if (body.notes !== undefined) po.notes = longText(body.notes);
  const paper = fileItems(filesOf(req, 'paper'));
  if (paper.length) { po.paperImages.push(...paper); changes.push(`${paper.length} PO image(s)`); }
  const resubmitted = po.status === 'rejected';
  // A corrected PO is checked from the start again.
  if (resubmitted) Object.assign(po, { status: 'pending', detailsVerifiedAt: null, detailsVerifiedByName: '', detailsChecks: [] });
  event(po, req.user, resubmitted ? 'Corrected and sent for verification again' : 'PO updated', changes.join(' | '));
  await po.save();
  const patient = await Patient.findById(po.patient).populate('assignedDoctor', 'name').lean();
  await respond(res, po, patient);
});

// @route POST /api/purchase-orders/:id/payments   (multipart: screenshot[])
const addPurchaseOrderPayment = asyncHandler(async (req, res) => {
  const po = await loadPo(req.params.id);
  if (['rejected', 'cancelled'].includes(po.status)) fail('Correct the purchase order first');
  const patient = await loadPatient(po.patient);
  const payment = await paymentFromBody(req.body || {}, filesOf(req, 'screenshot'), req.user, po.poNumber);
  if (!payment) fail('Enter the payment amount');
  stageOf(patient, po.phase).payments.push(payment);
  po.paymentIds.push(payment._id);
  event(po, req.user, 'Payment added', `Rs ${payment.amount} via ${payment.paymentMode} - pending verification`);
  logActivity(patient, req.user, `Payment added for Phase ${po.phase}`, `${payment.amount} via ${payment.paymentMode === 'cash' ? 'Cash' : 'Online'} — PO ${po.poNumber}, pending accounts approval`);
  await patient.save();
  await po.save();
  await respond(res, po, patient, 201);
});

// @route POST /api/purchase-orders/:id/verify-details
// Step 1 of In Transit's check: the PO paper and the patient details are correct. A patient still waiting for
// accounts approval is approved with it (same as "Approve patient" on Patient Details).
const verifyDetails = asyncHandler(async (req, res) => {
  const po = await loadPo(req.params.id);
  if (po.status !== 'pending') fail(po.status === 'verified' ? 'This purchase order is already verified' : 'Only a purchase order waiting for verification can be verified', 409);
  if (po.detailsVerifiedAt) fail('The PO details are already verified. Verify the payment next', 409);
  const patient = await loadPatient(po.patient);
  const now = new Date();
  if ((patient.approvalStatus || 'approved') === 'pending') {
    Object.assign(patient, { approvalStatus: 'approved', approvedByName: req.user.name, approvedAt: now });
    logActivity(patient, req.user, 'Patient approved', `Cleared with purchase order ${po.poNumber}`);
  }
  Object.assign(po, { detailsVerifiedAt: now, detailsVerifiedByName: req.user.name, detailsChecks: checksOf(req.body) });
  event(po, req.user, 'PO details verified', clean(req.body?.note, 300));
  logActivity(patient, req.user, `Purchase order details verified for Phase ${po.phase}`, po.poNumber);
  await patient.save();
  await po.save();
  await respond(res, po, patient);
});

// @route POST /api/purchase-orders/:id/verify-payment
// Step 2: the payment proof matches. The PO's pending payments are approved; they are already in the PO phase's
// payments (an extra payment in that phase), so the phase balance and the ledgers count them from now on.
const verifyPayment = asyncHandler(async (req, res) => {
  const po = await loadPo(req.params.id);
  if (po.status !== 'pending') fail(po.status === 'verified' ? 'This purchase order is already verified' : 'Only a purchase order waiting for verification can be verified', 409);
  if (!po.detailsVerifiedAt) fail('Verify the PO details first');
  const patient = await loadPatient(po.patient);
  const stage = stageOf(patient, po.phase);
  const ids = new Set(po.paymentIds.map(String));
  const now = new Date();
  let approved = 0;
  let amount = 0;
  for (const payment of stage.payments) {
    if (ids.has(String(payment._id)) && payment.approvalStatus === 'pending') {
      Object.assign(payment, { approvalStatus: 'approved', approvedByName: req.user.name, approvedAt: now });
      logActivity(patient, req.user, `Payment approved for Phase ${po.phase}`, `${payment.amount} via ${payment.paymentMode === 'cash' ? 'Cash' : 'Online'} — PO ${po.poNumber}`);
      approved += 1;
      amount += Number(payment.amount || 0);
    }
  }
  Object.assign(po, { status: 'verified', paymentVerifiedAt: now, paymentVerifiedByName: req.user.name, paymentChecks: checksOf(req.body), verifiedAt: now, verifiedByName: req.user.name, rejectedAt: null, rejectedByName: '', rejectReason: '' });
  event(po, req.user, 'Payment verified', [approved ? `${approved} payment(s), Rs ${amount} added to Phase ${po.phase} payments` : 'No payment on this PO', clean(req.body?.note, 300)].filter(Boolean).join(' | '));
  logActivity(patient, req.user, `Purchase order verified for Phase ${po.phase}`, `${po.poNumber}${approved ? ` | Rs ${amount} verified` : ''}`);
  await patient.save();
  await po.save();
  await respond(res, po, patient);
});

// @route POST /api/purchase-orders/:id/reject   body: { reason }
const rejectPurchaseOrder = asyncHandler(async (req, res) => {
  const po = await loadPo(req.params.id);
  if (po.status !== 'pending') fail('Only a purchase order waiting for verification can be rejected', 409);
  const reason = clean(req.body?.reason, 500);
  if (!reason) fail('Enter why the purchase order is rejected');
  Object.assign(po, { status: 'rejected', rejectedAt: new Date(), rejectedByName: req.user.name, rejectReason: reason });
  event(po, req.user, 'PO rejected', reason);
  await po.save();
  const patient = await Patient.findById(po.patient).populate('assignedDoctor', 'name').lean();
  await respond(res, po, patient);
});

// @route PATCH /api/purchase-orders/:id/plan   { medicineReadyDate, supplyKey, ageBand }
// The ready date, supply and age group are decided in post counselling. Only the Post Counselor (or the admin) changes
// them again, and only until the Medicine Department accepts the medicine request. Everything that carries them follows:
// the PO, its PO paper, the phase's expected date, a waiting medicine request and its job.
const updatePlan = asyncHandler(async (req, res) => {
  if (!isAdminLike(req.user) && req.user.role !== ROLES.POST_COUNSELOR) fail('Only the Post Counselor can change the ready date, supply and age group', 403);
  const po = await loadPo(req.params.id);
  if (po.status === 'cancelled') fail('This purchase order is cancelled');
  const patient = await loadPatient(po.patient);
  const stage = stageOf(patient, po.phase);
  const request = po.medicineRequestId ? findRequest(stage, po.medicineRequestId) : null;
  const MedicineJob = require('../models/MedicineJob');
  const job = request ? await MedicineJob.findOne({ patient: patient._id, phase: po.phase, requestId: po.medicineRequestId }) : null;
  const accepted = (request && !['requested', 'cancelled'].includes(request.status)) || (job && (job.currentStage || 0) > 0);
  if (accepted) fail('The Medicine Department has already accepted this request, so the ready date, supply and age group cannot change now', 409);

  const body = req.body || {};
  const readyBy = body.medicineReadyDate !== undefined ? parseDay(body.medicineReadyDate, 'medicine ready date', { required: true }) : po.medicineReadyDate;
  const supply = body.supplyKey ? parseSupply(body) : supplyOption(po.supplyPlan, po.supplyPart);
  const newAge = body.patientAge !== undefined ? clean(body.patientAge, 30) : '';
  if (body.patientAge !== undefined && !ageBandFor(newAge)) fail('Enter the patient age (from 3 years)');
  const ageBand = body.patientAge !== undefined ? ageBandFor(newAge) : po.ageBand;
  const dayOf = (d) => (d ? new Date(d).toISOString().slice(0, 10) : '');
  const changes = [];
  if (dayOf(readyBy) !== dayOf(po.medicineReadyDate)) changes.push(`ready date ${dayOf(po.medicineReadyDate) || '-'} -> ${dayOf(readyBy)}`);
  if (supply && (supply.plan !== po.supplyPlan || supply.part !== po.supplyPart)) changes.push(`supply -> ${supply.label}`);
  if ((ageBand || '') !== (po.ageBand || '')) changes.push(`age group -> ${AGE_BANDS[ageBand] || '-'}`);
  if (!changes.length) return respond(res, po, patient);

  Object.assign(po, { medicineReadyDate: readyBy, ageBand: ageBand || '', ...(supply ? { supplyPlan: supply.plan, supplyPart: supply.part } : {}) });
  // The paper keeps the date as yyyy-mm-dd (India day) and the supply / age group by their labels.
  const paperDay = readyBy ? new Date(new Date(readyBy).getTime() + 330 * 60000).toISOString().slice(0, 10) : '';
  const paperPatch = { medicineReadyDate: paperDay, ...(supply ? { supplyOrder: supply.label } : {}), ageGroup: AGE_BANDS[ageBand] || '', ...(newAge ? { patientAge: newAge } : {}) };
  if (newAge && setPhaseAge(patient, stage, newAge)) changes.push(`age -> ${newAge}`);
  po.paperValues = { ...(po.paperValues || {}), ...paperPatch };
  po.markModified('paperValues');
  if (stage.poPaper?.values && stage.purchaseOrder === po.poNumber) {
    stage.poPaper = { ...stage.poPaper, values: { ...stage.poPaper.values, ...paperPatch } };
    patient.markModified('stages');
  }
  if (readyBy) stage.transit.expectedReadyDate = readyBy;
  if (request && request.status === 'requested') {
    Object.assign(request, { readyByDate: readyBy, readyBySetByName: req.user.name, readyBySetAt: new Date(), ageBand: ageBand || request.ageBand, ...(supply ? { supplyPlan: supply.plan, supplyPart: supply.part } : {}) });
  }
  const details = changes.join(' | ');
  event(po, req.user, 'Plan changed by post counselling', details);
  logActivity(patient, req.user, `Phase ${po.phase} plan changed (PO ${po.poNumber})`, details);
  await patient.save();
  await po.save();
  if (job && supply) {
    const { applyPlanToJob } = require('./medicineJobController');
    await applyPlanToJob(job, { readyBy, plan: supply.plan, part: supply.part, ageBand }, req.user, details);
    emitMedicineJobChanged(req.app, job._id);
  }
  await respond(res, po, patient);
});

// @route POST /api/purchase-orders/:id/medicine-request   (multipart: prescription[])
// One medicine request per purchase order, sent to Medicine Department with the supply category and age band.
const requestMedicine = asyncHandler(async (req, res) => {
  const po = await loadPo(req.params.id);
  if (po.status !== 'verified') fail(po.detailsVerifiedAt ? 'Verify the payment of this PO first' : 'Verify the PO details and the payment first');
  const patient = await loadPatient(po.patient);
  if (patient.isActive === false) fail('This patient is closed');
  if ((patient.approvalStatus || 'approved') !== 'approved') fail('Approve the patient first');
  const stage = stageOf(patient, po.phase);
  if (stage.transit.holdActive || stage.transit.removedAt) fail('This phase is on hold or removed in In Transit', 409);
  const existing = findRequest(stage, po.medicineRequestId);
  if (existing && existing.status !== 'cancelled') fail('Medicine is already requested for this purchase order', 409);
  const ids = new Set(po.paymentIds.map(String));
  if (stage.payments.some((p) => ids.has(String(p._id)) && p.approvalStatus === 'pending')) fail('Verify the pending payment of this PO first');

  const body = req.body || {};
  // The supply and the ready date were fixed in post counselling (PO paper); In Transit only passes them on.
  const fixedSupply = po.supplyPlan && po.supplyPart ? supplyOption(po.supplyPlan, po.supplyPart) : null;
  const supply = fixedSupply && !canOverrideFixed(req.user) ? fixedSupply : parseSupply(body, { required: !fixedSupply }) || fixedSupply;
  const ageBand = po.ageBand && AGE_BANDS[po.ageBand] && !canOverrideFixed(req.user) ? po.ageBand : clean(body.ageBand, 10);
  if (!AGE_BANDS[ageBand]) fail('Select the age group');
  // No medicine list typed here any more: the Medicine Department works from the master sheet and the patient file.
  const medicines = longText(body.medicines);
  // The case category, picked on the form (it comes pre-selected from the patient's Sales case category).
  if (body.caseCategory && !cleanCaseCategory(body.caseCategory)) fail('Select Autism, ADHD, Autism + ADHD or Mental Health');
  const caseCategory = cleanCaseCategory(body.caseCategory) || await patientCaseCategory(patient);
  const fixedDate = fixedReadyDate({ po });
  const readyBy = fixedDate && !canOverrideFixed(req.user) ? new Date(fixedDate) : (parseDay(body.readyByDate, 'medicine ready-by date', { required: !fixedDate }) || new Date(fixedDate));
  // No prescription upload any more: the Medicine Department reads the patient's Records Room PDF.
  const files = fileItems(filesOf(req, 'prescription'), 'prescriptions');
  const now = new Date();
  const requestId = crypto.randomUUID();
  stage.medicineRequests.push({
    requestId, status: 'requested', medicines, notes: longText(body.notes),
    purchaseOrderId: po._id, poNumber: po.poNumber, supplyPlan: supply.plan, supplyPart: supply.part, ageBand, caseCategory,
    prescriptionUrl: files[0]?.url || null, prescriptionFileName: files[0]?.fileName || '', prescriptionFiles: files,
    requestedAt: now, requestedByName: req.user.name, readyByDate: readyBy, readyBySetAt: now, readyBySetByName: req.user.name,
  });
  stage.transit.expectedReadyDate = readyBy;
  if (!stage.transit.enteredAt) stage.transit.enteredAt = now;
  if (!String(stage.purchaseOrder || '').trim()) stage.purchaseOrder = po.poNumber;
  const detail = [`PO ${po.poNumber}`, caseCategory, supply.label, AGE_BANDS[ageBand], medicines].filter(Boolean).join(' | ');
  logActivity(patient, req.user, `Medicine requested for Phase ${po.phase}`, `${detail} | Request: ${requestId}`);
  Object.assign(po, { supplyPlan: supply.plan, supplyPart: supply.part, ageBand, medicineRequestId: requestId, medicineRequestedAt: now, medicineRequestedByName: req.user.name });
  if (!po.medicineReadyDate || !readyDateFromPostCounselling(po)) po.medicineReadyDate = readyBy;
  event(po, req.user, existing ? 'Medicine requested again' : 'Medicine requested', [caseCategory, supply.label, AGE_BANDS[ageBand], `ready by ${readyBy.toISOString().slice(0, 10)}`].filter(Boolean).join(' | '));
  await patient.save();
  await po.save();
  // The Medicine Department job (12 fulfilment stages) opens with the request; never let it block the request itself.
  try {
    const { findOrCreateJob } = require('./medicineJobController');
    const job = await findOrCreateJob({ patient, stage, request: stage.medicineRequests[stage.medicineRequests.length - 1], po, user: req.user });
    emitMedicineJobChanged(req.app, job._id);
  } catch (error) { console.error(`Medicine job could not be opened for ${po.poNumber}: ${error.message}`); }
  await respond(res, po, patient);
});

// @route PATCH /api/purchase-orders/:id/medicine-request   body: same fields as the request
// In Transit corrects its medicine request until Medicine Department accepts it (the job is still at "Order accepted").
// What post counselling fixed (supply, age group, ready date) stays as it is, as when the request was sent.
const updateMedicineRequest = asyncHandler(async (req, res) => {
  const po = await loadPo(req.params.id);
  const patient = await loadPatient(po.patient);
  const stage = stageOf(patient, po.phase);
  const request = findRequest(stage, po.medicineRequestId);
  if (!request || request.status === 'cancelled') fail('There is no medicine request on this PO to edit', 404);
  if (request.status !== 'requested') fail('Medicine Department has already accepted this request; it cannot be edited now', 409);
  const MedicineJob = require('../models/MedicineJob');
  const job = await MedicineJob.findOne({ patient: po.patient, phase: po.phase, requestId: request.requestId || 'legacy' });
  if (job && (job.currentStage || 0) > 0) fail('Medicine Department has already accepted this request; it cannot be edited now', 409);
  const body = req.body || {};
  // Fixed by post counselling = written on the PO paper (the PO itself also gets the supply In Transit picked).
  const fixedSupply = readyDateFromPostCounselling(po) ? supplyOptionByLabel(po.paperValues?.supplyOrder) : null;
  const supply = fixedSupply && !canOverrideFixed(req.user) ? fixedSupply : parseSupply(body, { required: false }) || supplyOption(request.supplyPlan, request.supplyPart);
  if (!supply) fail('Select the medicine supply');
  const paperAge = readyDateFromPostCounselling(po) ? ageBandByLabel(po.paperValues?.ageGroup) : '';
  const ageBand = paperAge && !canOverrideFixed(req.user) ? paperAge : clean(body.ageBand, 10) || request.ageBand;
  if (!AGE_BANDS[ageBand]) fail('Select the age group');
  if (body.caseCategory && !cleanCaseCategory(body.caseCategory)) fail('Select Autism, ADHD, Autism + ADHD or Mental Health');
  const caseCategory = cleanCaseCategory(body.caseCategory) || request.caseCategory;
  const fixedDate = fixedReadyDate({ po });
  const readyBy = fixedDate && !canOverrideFixed(req.user) ? new Date(fixedDate) : (parseDay(body.readyByDate, 'medicine ready-by date', { required: false }) || request.readyByDate);
  const notes = body.notes !== undefined ? longText(body.notes) : request.notes;
  const medicines = body.medicines !== undefined ? longText(body.medicines) : request.medicines;
  // What changed, for the PO activity and the job.
  const day = (d) => (d ? new Date(d).toISOString().slice(0, 10) : '-');
  const short = (t) => { const v = String(t || '').trim(); return v ? (v.length > 80 ? `${v.slice(0, 80)}...` : v) : '-'; };
  const changes = [
    supply.plan !== request.supplyPlan || supply.part !== request.supplyPart ? `supply ${supplyLabel(request.supplyPlan, request.supplyPart) || '-'} -> ${supply.label}` : '',
    ageBand !== request.ageBand ? `age group ${AGE_BANDS[request.ageBand] || '-'} -> ${AGE_BANDS[ageBand]}` : '',
    caseCategory !== request.caseCategory ? `category ${request.caseCategory || '-'} -> ${caseCategory}` : '',
    day(readyBy) !== day(request.readyByDate) ? `ready by ${day(request.readyByDate)} -> ${day(readyBy)}` : '',
    (notes || '') !== (request.notes || '') ? `notes "${short(request.notes)}" -> "${short(notes)}"` : '',
    (medicines || '') !== (request.medicines || '') ? `medicines "${short(request.medicines)}" -> "${short(medicines)}"` : '',
  ].filter(Boolean);
  if (!changes.length) fail('Nothing was changed');
  const now = new Date();
  const dateChanged = day(readyBy) !== day(request.readyByDate);
  Object.assign(request, { supplyPlan: supply.plan, supplyPart: supply.part, ageBand, caseCategory, notes, medicines, readyByDate: readyBy, ...(dateChanged ? { readyBySetAt: now, readyBySetByName: req.user.name } : {}), editedAt: now, editedByName: req.user.name });
  if (dateChanged) stage.transit.expectedReadyDate = readyBy;
  Object.assign(po, { supplyPlan: supply.plan, supplyPart: supply.part, ageBand });
  if (dateChanged && (!po.medicineReadyDate || !readyDateFromPostCounselling(po))) po.medicineReadyDate = readyBy;
  logActivity(patient, req.user, `Medicine request edited for Phase ${po.phase}`, `PO ${po.poNumber} | ${changes.join(' | ')}`);
  event(po, req.user, 'Medicine request edited', changes.join(' | '));
  await patient.save();
  await po.save();
  if (job) {
    const { applyPlanToJob } = require('./medicineJobController');
    await applyPlanToJob(job, { readyBy, plan: supply.plan, part: supply.part, ageBand, extra: { caseCategory, requestNotes: notes || '', medicines: medicines || '' } }, req.user, changes.join(' | '), 'Request edited by In Transit');
    emitMedicineJobChanged(req.app, job._id);
  }
  await respond(res, po, patient);
});

// @route POST /api/purchase-orders/:id/activate-phase
// Makes this PO's phase the patient's current phase (e.g. Phase 2 bought after Phase 1).
// Returns stock drawn by a job's preparation when that stage is reverted (ledger "return" rows, never a silent edit).
const stockReturner = (job, user) => async (line) => {
  const StockItem = require('../models/StockItem');
  const { moveStock } = require('./stockController');
  const item = await StockItem.findOne({ code: line.code });
  if (!item) return;
  await moveStock(item, { type: 'return', quantity: line.actual, delta: Number(line.actual), user, refType: 'job', job: job._id, ref: `${job.poNumber || job.requestId} ${job.patientName}`, note: `Preparation reverted by admin for ${job.patientName} Phase ${job.phase}` });
};

// @route POST /api/purchase-orders/:id/revert   body: { step, reason }   (admin)
// Undoes a timeline step - and every later step - when it was done by mistake. The cleared records are kept on the
// PO (`reverts`), drawn stock is returned through the ledger, and the activity shows who reverted what and why.
const revertStep = asyncHandler(async (req, res) => {
  const po = await loadPo(req.params.id);
  const step = clean(req.body?.step, 40);
  const reason = clean(req.body?.reason, 500);
  if (!reason) fail('Write why this step is reverted');
  if (['rejected', 'cancelled'].includes(po.status)) fail('A rejected / cancelled PO has nothing to revert');
  const patient = await loadPatient(po.patient);
  const stage = stageOf(patient, po.phase);
  const request = findRequest(stage, po.medicineRequestId);
  const MedicineJob = require('../models/MedicineJob');
  const job = request ? await MedicineJob.findOne({ patient: po.patient, phase: po.phase, requestId: request.requestId || 'legacy' }) : null;
  const before = buildPoView(po, patient.toObject(), { job: job ? job.toObject() : null });
  const now = new Date();
  const { revertPoFrom } = require('../utils/revertFlow');
  const { reverted, snapshot } = await revertPoFrom(step, { po, patient, stage, request, job, steps: before.steps, returnStock: job ? stockReturner(job, req.user) : async () => {}, reason, user: req.user, now });
  const labels = reverted.map((k) => before.steps.find((s) => s.key === k)?.label || k);
  po.reverts.push({ at: now, byName: req.user.name, byRole: req.user.role, step, reason, reverted, snapshot });
  event(po, req.user, 'Reverted by admin', `${labels.join(', ')} - ${reason}`);
  logActivity(patient, req.user, `Phase ${po.phase} steps reverted (PO ${po.poNumber})`, `${labels.join(', ')} - ${reason}`);
  if (job) {
    job.events.push({ at: now, action: 'Reverted by admin', details: `${labels.join(', ')} - ${reason}`, byName: req.user.name, byRole: req.user.role });
    await job.save();
  }
  await patient.save();
  await po.save();
  await respond(res, po, patient);
});

// @route DELETE /api/purchase-orders/:id   body: { reason }   (admin)
// Deletes a purchase order with everything on it: its medicine request, its medicine job (drawn stock goes back to
// Stocks), the In Transit handover of that request, and the payments attached to it. A full copy is kept as a
// DeletedRecord first, so it can be looked up or put back; uploaded files stay on disk.
const deletePurchaseOrder = asyncHandler(async (req, res) => {
  const po = await loadPo(req.params.id);
  const reason = clean(req.body?.reason, 500);
  if (!reason) fail('Write why this purchase order is deleted');
  const patient = await loadPatient(po.patient);
  const stage = stageOf(patient, po.phase);
  const request = findRequest(stage, po.medicineRequestId);
  const MedicineJob = require('../models/MedicineJob');
  const job = request ? await MedicineJob.findOne({ patient: po.patient, phase: po.phase, requestId: request.requestId || 'legacy' }) : null;
  const linked = new Set((po.paymentIds || []).map(String));
  const payments = (stage.payments || []).filter((p) => linked.has(String(p._id)));
  if (payments.some((p) => (p.refunds || []).length)) fail('A payment on this PO has refund history; it cannot be deleted. Settle it in Patient Details first.', 409);
  const copy = (value) => JSON.parse(JSON.stringify(value?.toObject ? value.toObject() : value ?? null));
  const now = new Date();
  // Everything as it was, before any change.
  const data = { purchaseOrder: copy(po), medicineRequest: copy(request), medicineJob: copy(job), payments: payments.map(copy), phaseTransit: copy(stage.transit), medicineExplainDate: stage.medicineExplainDate || null, phasePurchaseOrder: stage.purchaseOrder || '' };
  // Undo the done steps first (stock returned, handover cleared, request and job cancelled), the same way an admin revert does.
  if (po.status !== 'rejected' && po.status !== 'cancelled') {
    const before = buildPoView(po, patient.toObject(), { job: job ? job.toObject() : null });
    const { revertPoFrom } = require('../utils/revertFlow');
    try {
      await revertPoFrom('details', { po, patient, stage, request, job, steps: before.steps, returnStock: job ? stockReturner(job, req.user) : async () => {}, reason: `PO deleted: ${reason}`, user: req.user, now });
    } catch (error) { if (!/Nothing to revert/.test(error.message)) throw error; }
  }
  // Then remove the records themselves.
  if (request) {
    if (stage.medicineRequest && (stage.medicineRequest.requestId || 'legacy') === (request.requestId || 'legacy') && !(stage.medicineRequests || []).includes(request)) stage.medicineRequest = { status: 'not_requested' };
    else stage.medicineRequests = (stage.medicineRequests || []).filter((r) => (r.requestId || 'legacy') !== (request.requestId || 'legacy'));
  }
  stage.payments = (stage.payments || []).filter((p) => !linked.has(String(p._id)));
  // The phase keeps the number of another PO it still has, if any.
  const others = await PurchaseOrder.find({ patient: po.patient, phase: po.phase, _id: { $ne: po._id } }).sort({ createdAt: -1 }).select('poNumber').lean();
  if (stage.purchaseOrder === po.poNumber) stage.purchaseOrder = others[0]?.poNumber || '';
  const total = payments.reduce((sum, p) => sum + Number(p.amount || 0), 0);
  logActivity(patient, req.user, `Purchase order ${po.poNumber} deleted (Phase ${po.phase})`, `${reason}${request ? ' | medicine request removed' : ''}${job ? ' | medicine job removed' : ''}${payments.length ? ` | ${payments.length} payment(s) removed (Rs ${total})` : ''}`);
  const DeletedRecord = require('../models/DeletedRecord');
  await DeletedRecord.create({ kind: 'purchase_order', refId: String(po._id), label: po.poNumber, patient: patient._id, patientName: patient.patientName || '', phase: po.phase, reason, deletedByName: req.user.name, deletedByRole: req.user.role, deletedAt: now, data });
  await patient.save();
  if (job) { await MedicineJob.deleteOne({ _id: job._id }); emitMedicineJobChanged(req.app, job._id); }
  await PurchaseOrder.deleteOne({ _id: po._id });
  res.json({ success: true, deleted: { poNumber: po.poNumber, medicineRequest: Boolean(request), medicineJob: Boolean(job), payments: payments.length, paymentAmount: total } });
});

const activatePhase = asyncHandler(async (req, res) => {
  const po = await loadPo(req.params.id);
  if (po.status !== 'verified') fail('Verify the purchase order first');
  const patient = await loadPatient(po.patient);
  if ((patient.currentStage || 1) === po.phase) fail(`Phase ${po.phase} is already the current phase`, 409);
  const from = patient.currentStage || 1;
  patient.currentStage = po.phase;
  logActivity(patient, req.user, `Phase ${po.phase} activated`, `Current phase changed from Phase ${from} to Phase ${po.phase} (PO ${po.poNumber})`);
  event(po, req.user, 'Phase activated', `Phase ${from} -> Phase ${po.phase}`);
  await patient.save();
  await po.save();
  await respond(res, po, patient);
});

module.exports = {
  courierHandovers, listCourierHandovers,
  PO_VIEW_ROLES, PO_CREATE_ROLES, PO_VERIFY_ROLES,
  loadPoViews, revertStep, deletePurchaseOrder, listPurchaseOrders, getPurchaseOrder, getPurchaseOrderForm, uploadPaperFiles, createPurchaseOrder, updatePurchaseOrder, addPurchaseOrderPayment,
  verifyDetails, verifyPayment, rejectPurchaseOrder, requestMedicine, updateMedicineRequest, activatePhase, updatePlan,
};
