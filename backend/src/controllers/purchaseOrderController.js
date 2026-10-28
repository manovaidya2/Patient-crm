const crypto = require('crypto');
const mongoose = require('mongoose');
const Patient = require('../models/Patient');
const PurchaseOrder = require('../models/PurchaseOrder');
const BankAccount = require('../models/BankAccount');
const { asyncHandler } = require('../middleware/errorHandler');
const { ROLES } = require('../constants/roles');
const { STAGES } = require('../constants/treatmentStages');
const { supplyOption, supplyOptionByLabel, AGE_BANDS, ageBandByLabel, ageBandFor } = require('../constants/supplyPlans');
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
const { fixedReadyDate, canOverrideFixed } = require('../utils/medicineDelay');
const { patientDocuments } = require('../utils/patientDocuments');
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
  const documents = await patientDocuments(patient);
  res.status(status).json({ success: true, purchaseOrder: { ...buildPoView(po, patient.toObject ? patient.toObject() : patient, { includeEvents: true, job }), patientDocuments: documents } });
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
    recordedByName: user.name, approvalStatus: 'pending',
  };
};

// Every PO with its patient, as list views (used by the list and by the sidebar task counts).
const loadPoViews = async (filter = { patient: { $ne: null } }) => {
  const pos = await PurchaseOrder.find(filter).select('-events').sort({ createdAt: -1 }).limit(2000).lean();
  const patientIds = [...new Set(pos.map((po) => String(po.patient)))];
  const patients = await Patient.find({ _id: { $in: patientIds } })
    .select('patientName patientCode number age category approvalStatus currentStage isActive stages.number stages.totalAmount stages.payments stages.transit stages.medicineRequest stages.medicineRequests stages.medicineExplainDate')
    .lean();
  const byId = new Map(patients.map((p) => [String(p._id), p]));
  return pos.filter((po) => byId.has(String(po.patient))).map((po) => buildPoView(po, byId.get(String(po.patient))));
};

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
  const mine = items.filter((item) => item.actionBy.includes(req.user.role));
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
    if (changed && po.medicineReadyDate && !admin) fail('The medicine ready date is set by post counselling on the PO paper; only the admin can change it', 403);
    if (changed) { po.medicineReadyDate = next; changes.push(`ready by ${next ? next.toISOString().slice(0, 10) : '-'}`); }
  }
  if (body.notes !== undefined) po.notes = longText(body.notes);
  const paper = fileItems(filesOf(req, 'paper'));
  if (paper.length) { po.paperImages.push(...paper); changes.push(`${paper.length} PO image(s)`); }
  const resubmitted = po.status === 'rejected';
  // A corrected PO is checked from the start again.
  if (resubmitted) Object.assign(po, { status: 'pending', detailsVerifiedAt: null, detailsVerifiedByName: '' });
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
  Object.assign(po, { detailsVerifiedAt: now, detailsVerifiedByName: req.user.name });
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
  Object.assign(po, { status: 'verified', paymentVerifiedAt: now, paymentVerifiedByName: req.user.name, verifiedAt: now, verifiedByName: req.user.name, rejectedAt: null, rejectedByName: '', rejectReason: '' });
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
  if (![ROLES.ADMIN, ROLES.POST_COUNSELOR].includes(req.user.role)) fail('Only the Post Counselor can change the ready date, supply and age group', 403);
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
  const medicines = longText(body.medicines);
  if (!medicines) fail('Medicine details are required');
  const fixedDate = fixedReadyDate({ po });
  const readyBy = fixedDate && !canOverrideFixed(req.user) ? new Date(fixedDate) : (parseDay(body.readyByDate, 'medicine ready-by date', { required: !fixedDate }) || new Date(fixedDate));
  // No prescription upload any more: the Medicine Department reads the patient's Records Room PDF.
  const files = fileItems(filesOf(req, 'prescription'), 'prescriptions');
  const now = new Date();
  const requestId = crypto.randomUUID();
  stage.medicineRequests.push({
    requestId, status: 'requested', medicines, notes: longText(body.notes),
    purchaseOrderId: po._id, poNumber: po.poNumber, supplyPlan: supply.plan, supplyPart: supply.part, ageBand,
    prescriptionUrl: files[0]?.url || null, prescriptionFileName: files[0]?.fileName || '', prescriptionFiles: files,
    requestedAt: now, requestedByName: req.user.name, readyByDate: readyBy, readyBySetAt: now, readyBySetByName: req.user.name,
  });
  stage.transit.expectedReadyDate = readyBy;
  if (!stage.transit.enteredAt) stage.transit.enteredAt = now;
  if (!String(stage.purchaseOrder || '').trim()) stage.purchaseOrder = po.poNumber;
  const detail = `PO ${po.poNumber} | ${supply.label} | ${AGE_BANDS[ageBand]} | ${medicines}`;
  logActivity(patient, req.user, `Medicine requested for Phase ${po.phase}`, `${detail} | Request: ${requestId}`);
  Object.assign(po, { supplyPlan: supply.plan, supplyPart: supply.part, ageBand, medicineRequestId: requestId, medicineRequestedAt: now, medicineRequestedByName: req.user.name });
  if (!po.medicineReadyDate) po.medicineReadyDate = readyBy;
  event(po, req.user, existing ? 'Medicine requested again' : 'Medicine requested', `${supply.label} | ${AGE_BANDS[ageBand]} | ready by ${readyBy.toISOString().slice(0, 10)}`);
  await patient.save();
  await po.save();
  // The Medicine Department job (12 fulfilment stages) opens with the request; never let it block the request itself.
  try {
    const { findOrCreateJob } = require('./medicineJobController');
    await findOrCreateJob({ patient, stage, request: stage.medicineRequests[stage.medicineRequests.length - 1], po, user: req.user });
  } catch (error) { console.error(`Medicine job could not be opened for ${po.poNumber}: ${error.message}`); }
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
  PO_VIEW_ROLES, PO_CREATE_ROLES, PO_VERIFY_ROLES,
  loadPoViews, revertStep, listPurchaseOrders, getPurchaseOrder, getPurchaseOrderForm, uploadPaperFiles, createPurchaseOrder, updatePurchaseOrder, addPurchaseOrderPayment,
  verifyDetails, verifyPayment, rejectPurchaseOrder, requestMedicine, activatePhase, updatePlan,
};
