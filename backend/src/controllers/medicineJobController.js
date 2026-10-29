const mongoose = require('mongoose');
const Patient = require('../models/Patient');
const PurchaseOrder = require('../models/PurchaseOrder');
const MedicineJob = require('../models/MedicineJob');
const StockItem = require('../models/StockItem');
const { asyncHandler } = require('../middleware/errorHandler');
const { ROLES } = require('../constants/roles');
const { STAGES: PHASES } = require('../constants/treatmentStages');
const { AGE_BANDS, supplyOption, ageBandFor } = require('../constants/supplyPlans');
const { formulationFor, stockNeeds, chitsFor, applyOverrides } = require('../constants/formulationMaster');
const { STAGES, STAGE_INDEX, buildJobView } = require('../utils/medicineJobFlow');
const { paymentSummary } = require('../utils/transitFlow');
const { phaseAge } = require('../utils/phaseAge');
const { canOverrideFixed, fixedSupplyPlan, fixedReadyDate } = require('../utils/medicineDelay');
const { patientDocuments } = require('../utils/patientDocuments');
const { handedOverRequestIds } = require('../utils/legacyHandover');
const { getMaster } = require('../utils/formulationMasterStore');
const { moveStock } = require('./stockController');

const JOB_ROLES = [ROLES.ADMIN, ROLES.DOCTOR, ROLES.MEDICINE_DEPARTMENT];
const JOB_VIEW_ROLES = [...JOB_ROLES, ROLES.IN_TRANSIT];
const fail = (message, statusCode = 400) => { throw Object.assign(new Error(message), { statusCode }); };
const clean = (v, max = 300) => String(v ?? '').trim().slice(0, max);
const parseJson = (value, fallback) => { if (value == null || value === '') return fallback; if (typeof value !== 'string') return value; try { return JSON.parse(value); } catch { return fallback; } };
const parseDay = (value, label) => { const t = clean(value, 40); if (!t) return null; const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(t) ? `${t}T00:00:00.000+05:30` : t); if (Number.isNaN(d.getTime())) fail(`Enter a valid ${label}`); return d; };
const fileItems = (files = []) => files.map((f) => ({ url: `/uploads/medicine/${f.filename}`, fileName: f.originalname }));
const event = (job, user, action, details = '') => job.events.push({ at: new Date(), action, details, byName: user.name, byRole: user.role });
const logActivity = (patient, user, action, details = '') => patient.activityLog.push({ action, details, actorName: user.name, actorRole: user.role });

const allRequests = (stage) => [...(stage.medicineRequests || []), ...(stage.medicineRequest && stage.medicineRequest.status && stage.medicineRequest.status !== 'not_requested' ? [stage.medicineRequest] : [])];
const findRequest = (stage, requestId) => allRequests(stage).find((r) => (r.requestId || 'legacy') === requestId) || null;

const loadPatientAndRequest = async (job) => {
  const patient = await Patient.findById(job.patient);
  if (!patient) fail('Patient not found', 404);
  const stage = patient.stages.find((s) => s.number === job.phase);
  const request = stage ? findRequest(stage, job.requestId) : null;
  if (!stage || !request) fail('The medicine request of this job was not found on the patient', 404);
  return { patient, stage, request };
};

const paymentOf = (patient, stage) => {
  const pay = paymentSummary(stage);
  return { totalAmount: pay.totalAmount, amountPaid: pay.amountPaid, remaining: pay.remaining, pendingCount: pay.pendingCount, patientApproved: (patient.approvalStatus || 'approved') === 'approved', hold: Boolean(stage.transit?.holdActive || stage.transit?.removedAt), releasable: (patient.approvalStatus || 'approved') === 'approved' && pay.remaining <= 0 && pay.pendingCount === 0 && !(stage.transit?.holdActive || stage.transit?.removedAt) };
};

const planSentFor = async (job, stage) => fixedSupplyPlan({ po: job.purchaseOrder ? await PurchaseOrder.findById(job.purchaseOrder).lean() : null, stage });
const isoOf = (value) => (value ? new Date(value).toISOString() : null);

// Step 0 of the job: the request as it came in from In Transit, with where each value came from.
const requestDetailsOf = ({ job, patient, stage, request, po }) => ({
  status: request.status || '',
  caseCategory: request.caseCategory || job.caseCategory || '',
  medicines: request.medicines || '',
  notes: request.notes || '',
  requestedAt: isoOf(request.requestedAt || job.requestedAt),
  requestedByName: request.requestedByName || job.requestedByName || '',
  readyByDate: isoOf(request.readyByDate || job.readyByDate),
  // Fixed by post counselling on the PO paper, or filled by In Transit when sending the request.
  readyByFixed: Boolean(fixedReadyDate({ po, stage })),
  readyBySetByName: request.readyBySetByName || '',
  readyBySetAt: isoOf(request.readyBySetAt),
  prescriptionFiles: [...(request.prescriptionFiles || []), ...(request.prescriptionUrl && !(request.prescriptionFiles || []).some((f) => f.url === request.prescriptionUrl) ? [{ url: request.prescriptionUrl, fileName: request.prescriptionFileName || 'Prescription' }] : [])],
  po: po ? { number: po.poNumber || '', source: po.source || '', createdByName: po.createdByName || '', createdAt: isoOf(po.createdAt), amount: po.amount || 0 } : null,
  patient: {
    age: phaseAge(patient, stage.number) || patient.age || '',
    gender: patient.gender || '',
    guardianName: patient.guardianName || patient.relativeName || '',
    city: patient.city || '',
  },
});

const respond = async (res, job, status = 200) => {
  const { patient, stage, request } = await loadPatientAndRequest(job);
  const poDoc = job.purchaseOrder ? await PurchaseOrder.findById(job.purchaseOrder).lean() : null;
  const sent = fixedSupplyPlan({ po: poDoc, stage });
  const missing = (sent.plan && !job.supplyPlan) || (sent.ageBand && !job.ageBand);
  if (missing && (job.currentStage || 0) <= STAGE_INDEX.review && job.status === 'open') {
    Object.assign(job, { supplyPlan: job.supplyPlan || sent.plan, supplyPart: job.supplyPart || sent.part, ageBand: job.ageBand || sent.ageBand });
    await applyFormulation(job);
    await job.save();
  }
  const stocks = await StockItem.find({ isActive: { $ne: false } }).lean();
  const master = job.ageBand ? await getMaster(job.ageBand) : null;
  // Which of them post counselling decided (those are read-only here, except for the admin).
  const fixedPlan = { supply: Boolean(sent.plan), ageBand: Boolean(sent.ageBand) };
  // The patient's whole file from the Records Room, read instead of a separate prescription.
  const documents = await patientDocuments(patient);
  res.status(status).json({ success: true, job: { ...buildJobView(job, { stocks, payment: paymentOf(patient, stage), master, includeEvents: true }), fixedPlan, patientDocuments: documents, request: requestDetailsOf({ job, patient, stage, request, po: poDoc }) } });
};

// The formulation sheet and supply belong to the formulation-check stage; only its owner (or the admin) changes them.
// Correcting the sheet for one patient is the doctor's call (or the admin's); the Medicine Department prepares from it.
const SHEET_EDIT_ROLES = [ROLES.ADMIN, ROLES.DOCTOR];
const needSheetOwner = (user) => { if (!STAGES[STAGE_INDEX.review].roles.includes(user.role)) fail(`The formulation sheet is handled by ${STAGES[STAGE_INDEX.review].roles.map((r) => r.replace(/_/g, ' ')).join(' / ')}`, 403); };

// Builds (or rebuilds) the formulation sheet, stock needs and chits of a job from its age band and supply using the
// current (doctor-edited) Formulation Master, or from an already corrected sheet when one is given.
const applyFormulation = async (job, sheet) => {
  const hasSupply = job.ageBand && job.supplyPlan && job.supplyPart;
  const formulation = sheet !== undefined ? sheet : (hasSupply ? formulationFor({ ageBand: job.ageBand, plan: job.supplyPlan, part: job.supplyPart }, await getMaster(job.ageBand)) : null);
  job.formulation = formulation;
  job.markModified('formulation');
  job.chits = formulation ? chitsFor(formulation, job.patientName) : [];
  job.consumption = formulation ? stockNeeds(formulation).map((n) => ({ code: n.code, name: n.name, unit: n.unit, planned: n.qty, actual: null, txId: null })) : [];
};

// @route PATCH /api/medicine-jobs/:id/formulation   body: { lines: [{ key, qty, dose, containers, packed, components:[{code, qty}] }], note }
// Corrects the sheet for this patient (wrong master value, doctor's change). Allowed until preparation starts; the
// master value stays beside each change. Stock needs and chits are rebuilt from the corrected sheet.
const editFormulation = asyncHandler(async (req, res) => {
  if (!SHEET_EDIT_ROLES.includes(req.user.role)) fail('Only the doctor or the admin corrects the formulation sheet', 403);
  const job = await MedicineJob.findById(req.params.id);
  if (!job) fail('Job not found', 404);
  if (job.status !== 'open') fail('The sheet cannot change once the medicine is ready');
  if ((job.currentStage || 0) > STAGE_INDEX.stock) fail('The sheet cannot change after preparation has started (stock is already drawn)');
  if (job.hold?.active) fail('Resume the job first', 409);
  const note = clean(req.body?.note, 500);
  if (!note) fail('Write why the sheet is being corrected (e.g. doctor\'s instruction)');
  const sheet = applyOverrides(job.formulation, req.body?.lines, { byName: req.user.name });
  const changed = sheet.lines.filter((l, i) => l !== job.formulation.lines[i]);
  if (!changed.length) fail('Nothing was changed');
  await applyFormulation(job, sheet);
  event(job, req.user, 'Formulation sheet corrected', `${changed.map((l) => `${l.name}: ${l.edited.changes.join(', ')}`).join(' | ')} - ${note}`);
  await job.save();
  await respond(res, job);
});

// Finds the job of a medicine request, creating it on first open. Used by the Medicine Requests page and by PO request.
const findOrCreateJob = async ({ patient, stage, request, po = null, user }) => {
  const requestId = request.requestId || 'legacy';
  let job = await MedicineJob.findOne({ patient: patient._id, phase: stage.number, requestId });
  if (job) return job;
  const poDoc = po || (request.purchaseOrderId ? await PurchaseOrder.findById(request.purchaseOrderId) : null);
  const sent = fixedSupplyPlan({ po: poDoc, stage });
  job = new MedicineJob({
    patient: patient._id, patientCode: patient.patientCode || '', patientName: patient.patientName, phase: stage.number, requestId,
    purchaseOrder: poDoc?._id || null, poNumber: request.poNumber || poDoc?.poNumber || '',
    supplyPlan: sent.plan || request.supplyPlan || poDoc?.supplyPlan || '', supplyPart: sent.part || request.supplyPart || poDoc?.supplyPart || '', ageBand: sent.ageBand || request.ageBand || poDoc?.ageBand || ageBandFor(phaseAge(patient, stage.number)) || '',
    medicines: request.medicines || '', caseCategory: request.caseCategory || '', requestNotes: request.notes || '', requestedAt: request.requestedAt || new Date(), requestedByName: request.requestedByName || '', readyByDate: request.readyByDate || null,
    status: request.status === 'sent_to_courier' ? 'released' : request.status === 'made' ? 'ready' : 'open',
    currentStage: request.status === 'sent_to_courier' ? STAGES.length : request.status === 'made' ? STAGE_INDEX.release : request.status === 'in_process' ? STAGE_INDEX.review : 0,
    events: [{ at: new Date(), action: 'Job opened', details: `Medicine request ${requestId}${request.poNumber ? ` | PO ${request.poNumber}` : ''}`, byName: user.name, byRole: user.role }],
  });
  if (request.status === 'in_process' || request.status === 'made' || request.status === 'sent_to_courier') {
    job.stages.push({ key: 'accept', doneAt: request.inProcessAt || request.requestedAt || new Date(), doneByName: request.inProcessByName || 'Existing record', checks: STAGES[0].checks.map(() => true), fields: { readyByDate: request.readyByDate }, notes: 'Accepted before the job system' });
  }
  await applyFormulation(job);
  await job.save();
  return job;
};

// @route POST /api/medicine-jobs/:id/rebuild
// Builds the sheet again from the current Formulation Master (after the doctor changed it). Allowed until preparation.
// Patient-specific corrections made on the old sheet are dropped, so the event says so.
const rebuildSheet = asyncHandler(async (req, res) => {
  needSheetOwner(req.user);
  const job = await MedicineJob.findById(req.params.id);
  if (!job) fail('Job not found', 404);
  if (job.status !== 'open') fail('The sheet cannot change once the medicine is ready');
  if ((job.currentStage || 0) > STAGE_INDEX.stock) fail('The sheet cannot change after preparation has started (stock is already drawn)');
  if (job.hold?.active) fail('Resume the job first', 409);
  if (!job.ageBand || !job.supplyPlan || !job.supplyPart) fail('Set the age group and supply first');
  const hadEdits = Boolean(job.formulation?.edited);
  await applyFormulation(job);
  event(job, req.user, 'Sheet rebuilt from the Formulation Master', `v${job.formulation.master.version}${hadEdits ? ' - earlier patient corrections on this sheet were dropped' : ''}`);
  await job.save();
  await respond(res, job);
});

// @route POST /api/medicine-jobs/for-request   body: { patientId, phase, requestId }
const openForRequest = asyncHandler(async (req, res) => {
  const { patientId, requestId } = req.body || {};
  const phase = parseInt(req.body?.phase, 10);
  if (!mongoose.Types.ObjectId.isValid(String(patientId)) || !PHASES.includes(phase)) fail('Patient and phase are required');
  const patient = await Patient.findById(patientId);
  if (!patient) fail('Patient not found', 404);
  const stage = patient.stages.find((s) => s.number === phase);
  const request = stage ? findRequest(stage, requestId || 'legacy') : null;
  if (!request) fail('Medicine request not found', 404);
  if (request.status === 'cancelled') fail('This medicine request is cancelled');
  const job = await findOrCreateJob({ patient, stage, request, user: req.user });
  await respond(res, job, 200);
});

// @route GET /api/medicine-jobs?status=open|ready|released|all
const listJobs = asyncHandler(async (req, res) => {
  const status = ['open', 'ready', 'released', 'cancelled', 'all'].includes(req.query.status) ? req.query.status : 'open';
  const filter = status === 'all' ? {} : { status };
  const jobs = await MedicineJob.find(filter).select('-events -formulation -chits -consumption').sort({ readyByDate: 1, createdAt: -1 }).limit(500).lean();
  const items = jobs.map((j) => buildJobView(j));
  // Chip counts (and how many wait for this role) across the open / ready / released lists.
  const all = await MedicineJob.find({ status: { $in: ['open', 'ready', 'released'] } }).select('status currentStage hold requestId').lean();
  const handedOver = await handedOverRequestIds([...all, ...jobs].filter((j) => j.status !== 'released').map((j) => j.requestId));
  const counts = { open: 0, ready: 0, released: 0, all: all.length, mine: { open: 0, ready: 0, released: 0, all: 0 } };
  all.forEach((j) => { counts[j.status] += 1; if (jobActionBy(j, handedOver).includes(req.user.role)) { counts.mine[j.status] += 1; counts.mine.all += 1; } });
  res.json({ success: true, counts, items: items.map((v, i) => ({ id: v.id, patientId: v.patientId, patientName: v.patientName, patientCode: v.patientCode, phase: v.phase, poNumber: v.poNumber, purchaseOrderId: v.purchaseOrderId, supplyLabel: v.supplyLabel, ageBandLabel: v.ageBandLabel, readyByDate: v.readyByDate, delay: v.delay, requestedAt: v.requestedAt, status: v.status, currentStage: v.currentStage, currentLabel: STAGES[v.currentStage]?.label || 'Released', progress: v.progress, hold: v.hold, urgency: v.urgency, totalStages: v.totalStages, actionBy: jobActionBy(jobs[i], handedOver), handedOverOldFlow: handedOver.has(String(jobs[i].requestId)) })) });
});

// Who has to act on a job now: the roles of its current stage (whoever resumes it while on hold; nobody once released).
// `handedOver` (optional): request ids whose medicine already reached the patient in the old flow; those jobs are done.
const jobActionBy = (job, handedOver) => {
  if (job.status === 'released' || job.status === 'cancelled') return [];
  if (handedOver?.has(String(job.requestId))) return [];
  if (job.hold?.active) return JOB_ROLES;
  return STAGES[job.currentStage || 0]?.roles || [];
};

// @route GET /api/medicine-jobs/:id
const getJob = asyncHandler(async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(String(req.params.id))) fail('Job not found', 404);
  const job = await MedicineJob.findById(req.params.id);
  if (!job) fail('Job not found', 404);
  await respond(res, job);
});

// @route PATCH /api/medicine-jobs/:id/supply   body: { ageBand, supplyKey }  (before preparation only)
const setSupply = asyncHandler(async (req, res) => {
  needSheetOwner(req.user);
  const job = await MedicineJob.findById(req.params.id);
  if (!job) fail('Job not found', 404);
  if ((job.currentStage || 0) > STAGE_INDEX.stock) fail('The supply cannot change after preparation has started');
  const ageBand = clean(req.body?.ageBand, 10);
  if (!AGE_BANDS[ageBand]) fail('Select the age group');
  const [plan, part] = String(req.body?.supplyKey || '').split(':');
  const option = supplyOption(plan, part);
  if (!option) fail('Select the medicine supply');
  // The supply (6 months / 1+5 / 2+4) and the age group were decided in post counselling.
  const { stage: jobStage } = await loadPatientAndRequest(job);
  const sent = await planSentFor(job, jobStage);
  if (sent.plan && (option.plan !== job.supplyPlan || option.part !== job.supplyPart) && !canOverrideFixed(req.user)) fail('The medicine supply is set by post counselling on the PO paper; only the admin can change it', 403);
  if (sent.ageBand && ageBand !== job.ageBand && !canOverrideFixed(req.user)) fail('The age group is set by post counselling on the PO paper; only the admin can change it', 403);
  Object.assign(job, { ageBand, supplyPlan: option.plan, supplyPart: option.part });
  await applyFormulation(job);
  event(job, req.user, 'Supply set', `${option.label} | ${AGE_BANDS[ageBand]}`);
  await job.save();
  await respond(res, job);
});

const requireOrder = (job, key) => {
  if (job.status === 'cancelled') fail('This job is cancelled');
  if (job.status === 'released') fail('This medicine is already released');
  if (job.hold?.active) fail(`This job is on hold: ${job.hold.reason}. Resume it first`, 409);
  const index = STAGE_INDEX[key];
  if (index === undefined) fail('Unknown stage');
  if (index < (job.currentStage || 0)) fail('This stage is already completed', 409);
  if (index > (job.currentStage || 0)) fail(`Complete "${STAGES[job.currentStage].label}" first`);
  return STAGES[index];
};

// @route POST /api/medicine-jobs/:id/stages/:key   (multipart: photoA[], photoB[]) body: checks (JSON), fields (JSON), notes, consumption (JSON), chits (JSON)
const completeStage = asyncHandler(async (req, res) => {
  const job = await MedicineJob.findById(req.params.id);
  if (!job) fail('Job not found', 404);
  const stage = requireOrder(job, req.params.key);
  if (!stage.roles.includes(req.user.role)) fail(`${stage.label} is done by ${stage.roles.map((r) => r.replace(/_/g, ' ')).join(' / ')}`, 403);
  const body = req.body || {};
  const checks = parseJson(body.checks, []);
  if (!Array.isArray(checks) || stage.checks.some((_, i) => checks[i] !== true)) fail('Tick every point of the checklist');
  const fields = parseJson(body.fields, {}) || {};
  for (const f of stage.fields) {
    const v = fields[f.key];
    if (f.required && (v === undefined || v === null || String(v).trim() === '')) fail(`${f.label} is required`);
    if (f.type === 'select' && v && !f.options.includes(v)) fail(`Select a valid ${f.label.toLowerCase()}`);
    if (f.type === 'number' && v !== undefined && v !== '' && !Number.isFinite(Number(v))) fail(`Enter a valid ${f.label.toLowerCase()}`);
  }
  const notes = clean(body.notes, 2000);
  const { patient, stage: phaseEntry, request } = await loadPatientAndRequest(job);
  const now = new Date();
  const record = { key: stage.key, doneAt: now, doneByName: req.user.name, doneByRole: req.user.role, checks: stage.checks.map(() => true), fields: {}, notes };
  stage.fields.forEach((f) => { record.fields[f.key] = f.type === 'number' ? Number(fields[f.key]) : clean(fields[f.key], f.type === 'textarea' ? 2000 : 300); });
  let detail = '';

  if (stage.key === 'accept') {
    // The ready date came with the request (fixed in post counselling); the Medicine Department cannot change it.
    const readyBy = job.readyByDate && !canOverrideFixed(req.user) ? new Date(job.readyByDate) : parseDay(fields.readyByDate, 'ready-by date');
    record.fields.readyByDate = readyBy.toISOString().slice(0, 10);
    job.readyByDate = readyBy;
    // Accepting keeps who filled the date (In Transit / post counselling); only a changed date (admin) records a new setter.
    const dateChanged = !request.readyBySetByName || new Date(request.readyByDate || 0).getTime() !== readyBy.getTime();
    Object.assign(request, { status: request.status === 'requested' ? 'in_process' : request.status, inProcessAt: request.inProcessAt || now, inProcessByName: request.inProcessByName || req.user.name, readyByDate: readyBy });
    if (dateChanged) Object.assign(request, { readyBySetByName: req.user.name, readyBySetAt: now });
    if (phaseEntry.transit) phaseEntry.transit.expectedReadyDate = readyBy;
    logActivity(patient, req.user, `Medicine request accepted for Phase ${job.phase}`, `Ready by ${readyBy.toISOString().slice(0, 10)}${job.poNumber ? ` | PO ${job.poNumber}` : ''}`);
    detail = `Ready by ${readyBy.toISOString().slice(0, 10)}`;
  }
  if (stage.key === 'review' && !job.formulation) fail('Set the age group and medicine supply first (the formulation sheet is built from them)');
  if (stage.key === 'stock') {
    const stocks = await StockItem.find({ isActive: { $ne: false } }).lean();
    const table = buildJobView(job, { stocks }).stockTable;
    const missing = table.filter((r) => r.status === 'missing');
    if (missing.length) fail(`Add these items in Stocks first: ${missing.map((r) => r.code).join(', ')}`);
    const short = table.filter((r) => r.status === 'short');
    if (short.length && !fields.shortageAccepted) fail(`Short in stock: ${short.map((r) => `${r.code} (${r.available} ${r.stockUnit} of ${r.needInStock})`).join(', ')}. Receive stock first or tick "shortage request raised" to continue`);
    record.fields.shortageAccepted = Boolean(fields.shortageAccepted);
  }
  if (stage.key === 'prepare') {
    // Draw the actual quantities from Stocks. Planned comes from the formulation; the preparer confirms or corrects each.
    const given = parseJson(body.consumption, []);
    const byCode = new Map((Array.isArray(given) ? given : []).map((c) => [String(c.code || '').toUpperCase(), c]));
    const lines = job.consumption.length ? job.consumption : [];
    if (!lines.length) fail('No formulation on this job - set the age group and supply first');
    const items = await StockItem.find({ code: { $in: lines.map((l) => l.code) }, isActive: { $ne: false } });
    const itemByCode = new Map(items.map((i) => [i.code, i]));
    const planned = [];
    for (const line of lines) {
      const item = itemByCode.get(line.code);
      if (!item) fail(`Stock item ${line.code} is missing`);
      const entered = byCode.get(line.code);
      let actual = entered && entered.actual !== '' && entered.actual != null ? Number(entered.actual) : null;
      if (actual == null) {
        if (item.unit === line.unit) actual = line.planned;
        else if (line.unit === 'spoon' && item.unit === 'g' && item.gramsPerSpoon) actual = line.planned * item.gramsPerSpoon;
        else if (line.unit === 'drop' && item.unit === 'ml' && item.dropsPerMl) actual = line.planned / item.dropsPerMl;
        else fail(`Enter the actual ${item.unit} used for ${line.name} (${line.code}): the ${line.unit} to ${item.unit} conversion is not set`);
      }
      if (!Number.isFinite(actual) || actual < 0) fail(`Enter a valid quantity for ${line.code}`);
      planned.push({ line, item, actual: Math.round(actual * 1000) / 1000 });
    }
    for (const p of planned) {
      if (p.actual > Number(p.item.currentStock || 0)) fail(`${p.item.name} (${p.item.code}): only ${p.item.currentStock} ${p.item.unit} in stock, ${p.actual} ${p.item.unit} needed`);
    }
    for (const p of planned) {
      if (p.actual === 0) { p.line.actual = 0; continue; }
      // eslint-disable-next-line no-await-in-loop
      const tx = await moveStock(p.item, { type: 'consume', quantity: p.actual, delta: -p.actual, user: req.user, refType: 'job', job: job._id, ref: `${job.poNumber || job.requestId} ${job.patientName}`, note: `Preparation for ${job.patientName} Phase ${job.phase}` });
      p.line.actual = p.actual; p.line.txId = tx._id; p.line.unit = p.item.unit;
    }
    job.markModified('consumption');
    detail = planned.map((p) => `${p.line.code} ${p.actual} ${p.item.unit}`).join(', ');
  }
  if (stage.key === 'fill') {
    const confirmed = new Set((parseJson(body.chits, []) || []).filter((c) => c && c.confirmed).map((c) => c.key));
    const pending = job.chits.filter((c) => !confirmed.has(c.key) && !c.confirmed);
    if (pending.length) fail(`Confirm every chit on its pack: ${pending.map((c) => `${c.name} ${c.n}/${c.of}`).join(', ')}`);
    job.chits.forEach((c) => { if (!c.confirmed) Object.assign(c, { confirmed: true, confirmedByName: req.user.name, confirmedAt: now }); });
    job.markModified('chits');
    Object.assign(request, { chitsWrittenByName: req.user.name });
    detail = `${job.chits.length} chit(s) confirmed`;
  }
  if (stage.key === 'qc') {
    if (fields.result === 'HOLD') {
      Object.assign(job.hold, { active: true, reason: `QC HOLD: ${clean(fields.findings, 500) || 'correction needed'}`, at: now, byName: req.user.name, stageKey: 'qc' });
      event(job, req.user, 'QC hold', clean(fields.findings, 500));
      await job.save();
      return respond(res, job);
    }
    Object.assign(request, { lastMedicineCheckedByName: req.user.name });
  }
  if (stage.key === 'doctor' && fields.result === 'HOLD') {
    // Back to QC after correction.
    job.currentStage = STAGE_INDEX.qc;
    job.stages = job.stages.filter((s) => !['qc', 'pack1'].includes(s.key));
    Object.assign(job.hold, { active: true, reason: `Doctor HOLD: ${clean(fields.remarks, 500)}`, at: now, byName: req.user.name, stageKey: 'doctor' });
    event(job, req.user, 'Doctor hold', clean(fields.remarks, 500));
    await job.save();
    return respond(res, job);
  }
  if (stage.key === 'photos') {
    const a = fileItems(req.files?.photoA || []);
    const b = fileItems(req.files?.photoB || []);
    if (!a.length && !job.photos.overview.length) fail('Upload Photo A (circular medicine overview)');
    job.photos.overview.push(...a);
    job.photos.papers.push(...b);
    detail = `${a.length} overview, ${b.length} paper photo(s)`;
  }
  if (stage.key === 'final') {
    const packer = job.stages.find((s) => s.key === 'pack2');
    const checker = clean(fields.checkerName, 120).toLowerCase();
    if (packer && [packer.doneByName].filter(Boolean).map((n) => n.trim().toLowerCase()).includes(checker)) fail('The final checker must be different from the Packing-2 operator');
    const prep = job.stages.find((s) => s.key === 'prepare');
    const photos = job.photos.overview || [];
    Object.assign(request, {
      status: 'made', madeAt: now, madeByName: prep?.fields?.preparerName || prep?.doneByName || req.user.name,
      packagedByName: job.stages.find((s) => s.key === 'pack2')?.doneByName || req.user.name,
      lastMedicineCheckedByName: clean(fields.checkerName, 120), packagingDetailsFilledByName: req.user.name, packagingDetailsFilledAt: now,
      medicineImageUrl: photos[0]?.url || request.medicineImageUrl || null, medicineImageFileName: photos[0]?.fileName || request.medicineImageFileName || '',
      medicineImages: [...(request.medicineImages || []), ...photos.filter((p) => !(request.medicineImages || []).some((m) => m.url === p.url))],
    });
    job.status = 'ready';
    logActivity(patient, req.user, `Medicine made for Phase ${job.phase}`, `Final check by ${clean(fields.checkerName, 120)}${job.poNumber ? ` | PO ${job.poNumber}` : ''}`);
    detail = 'Medicine READY - awaiting payment clearance and release';
  }
  if (stage.key === 'release') {
    const pay = paymentOf(patient, phaseEntry);
    if (!pay.patientApproved) fail('In Transit must approve the patient before release');
    if (pay.hold) fail('This phase is on hold or removed in In Transit', 409);
    if (pay.remaining > 0 || pay.pendingCount) fail(`Full verified payment is required before release (balance Rs ${pay.remaining}${pay.pendingCount ? `, ${pay.pendingCount} payment(s) pending verification` : ''})`);
    Object.assign(request, { status: 'sent_to_courier', sentToCourierAt: now, sentToCourierByName: req.user.name });
    if (!phaseEntry.transit) phaseEntry.transit = {};
    Object.assign(phaseEntry.transit, { financialReleasedAt: now, financialReleasedByName: req.user.name, financialReleaseNote: `Released by Medicine Department to ${clean(fields.handedTo, 120)}` });
    job.status = 'released';
    logActivity(patient, req.user, `Medicine released for Phase ${job.phase}`, `Handed to ${clean(fields.handedTo, 120)}${job.poNumber ? ` | PO ${job.poNumber}` : ''}`);
    detail = `Handed to ${clean(fields.handedTo, 120)}`;
  }

  job.stages = job.stages.filter((s) => s.key !== stage.key);
  job.stages.push(record);
  job.currentStage = STAGE_INDEX[stage.key] + 1;
  event(job, req.user, `${stage.n}. ${stage.label}`, detail || notes);
  await patient.save();
  await job.save();
  await respond(res, job);
});

// @route POST /api/medicine-jobs/:id/revert   body: { stage, reason }   (admin)
// Puts the job back to the start of a stage that was completed by mistake (that stage and every later one). Drawn
// stock returns through the ledger; the cleared records stay on the job (`reverts`).
const revertJob = asyncHandler(async (req, res) => {
  const job = await MedicineJob.findById(req.params.id);
  if (!job) fail('Job not found', 404);
  if (job.status === 'cancelled') fail('This job is cancelled');
  const key = clean(req.body?.stage, 20);
  const index = STAGE_INDEX[key];
  if (index === undefined) fail('Unknown stage');
  const reason = clean(req.body?.reason, 500);
  if (!reason) fail('Write why this stage is reverted');
  const { patient, stage: phaseEntry, request } = await loadPatientAndRequest(job);
  if (['dispatched', 'delivered'].includes(request.courier?.status)) fail('The medicine has already left: revert the handover on the purchase order page first');
  const now = new Date();
  const returnStock = async (line) => {
    const item = await StockItem.findOne({ code: line.code });
    if (!item) return;
    await moveStock(item, { type: 'return', quantity: line.actual, delta: Number(line.actual), user: req.user, refType: 'job', job: job._id, ref: `${job.poNumber || job.requestId} ${job.patientName}`, note: `Preparation reverted by admin for ${job.patientName} Phase ${job.phase}` });
  };
  const { revertJobTo } = require('../utils/revertFlow');
  const snapshot = await revertJobTo(job, index, { request, phaseEntry, returnStock, now });
  const labels = snapshot.stages.map((s) => STAGES[STAGE_INDEX[s.key]]?.label || s.key);
  job.reverts.push({ at: now, byName: req.user.name, byRole: req.user.role, step: key, reason, reverted: snapshot.stages.map((s) => s.key), snapshot });
  event(job, req.user, 'Reverted by admin', `${labels.join(', ')} - ${reason}`);
  logActivity(patient, req.user, `Medicine job reverted for Phase ${job.phase}`, `${labels.join(', ')} - ${reason}${job.poNumber ? ` | PO ${job.poNumber}` : ''}`);
  await patient.save();
  await job.save();
  await respond(res, job);
});

// @route POST /api/medicine-jobs/:id/hold   body: { reason }
const holdJob = asyncHandler(async (req, res) => {
  const job = await MedicineJob.findById(req.params.id);
  if (!job) fail('Job not found', 404);
  if (job.status === 'released') fail('This medicine is already released');
  const reason = clean(req.body?.reason, 500);
  if (!reason) fail('Write the reason for the hold');
  Object.assign(job.hold, { active: true, reason, at: new Date(), byName: req.user.name, stageKey: STAGES[job.currentStage]?.key || '' });
  event(job, req.user, 'Hold', reason);
  await job.save();
  await respond(res, job);
});

// @route POST /api/medicine-jobs/:id/resume   body: { note }
const resumeJob = asyncHandler(async (req, res) => {
  const job = await MedicineJob.findById(req.params.id);
  if (!job) fail('Job not found', 404);
  if (!job.hold?.active) fail('This job is not on hold');
  const note = clean(req.body?.note, 500);
  if (!note) fail('Write the corrective action taken');
  Object.assign(job.hold, { active: false, reason: '', at: null, byName: '', stageKey: '' });
  event(job, req.user, 'Resumed', note);
  await job.save();
  await respond(res, job);
});

// Post counselling changed the ready date / supply / age group before the request was accepted: the waiting job follows
// (and its formulation sheet is rebuilt for the new supply and age group).
const applyPlanToJob = async (job, { readyBy, plan, part, ageBand }, user, details) => {
  if (!job || (job.currentStage || 0) > 0) return;
  const sheetChanged = plan !== job.supplyPlan || part !== job.supplyPart || ageBand !== job.ageBand;
  Object.assign(job, { readyByDate: readyBy, supplyPlan: plan, supplyPart: part, ageBand });
  if (sheetChanged) await applyFormulation(job);
  event(job, user, 'Plan changed by post counselling', details);
  await job.save();
};

// @route GET /api/medicine-jobs/patient-file/:patientId   The patient's Records Room PDF(s), read with a medicine request.
const getPatientFile = asyncHandler(async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(String(req.params.patientId))) fail('Patient not found', 404);
  const patient = await Patient.findById(req.params.patientId).select('patientCode').lean();
  if (!patient) fail('Patient not found', 404);
  res.json({ success: true, documents: await patientDocuments(patient) });
});

module.exports = { getPatientFile, applyPlanToJob, jobActionBy, revertJob, JOB_ROLES, JOB_VIEW_ROLES, openForRequest, listJobs, getJob, setSupply, editFormulation, rebuildSheet, completeStage, holdJob, resumeJob, findOrCreateJob };
