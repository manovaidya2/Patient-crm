const Patient = require('../models/Patient');
const PurchaseOrder = require('../models/PurchaseOrder');
const MedicineJob = require('../models/MedicineJob');
const { asyncHandler } = require('../middleware/errorHandler');
const { cached } = require('../utils/readCache');
const { STAGES } = require('../utils/medicineJobFlow');
const { latestMedicine, groupByLength, LIVE } = require('../utils/lastMedicineSupply');
const { paymentDueByCategory } = require('../utils/paymentDueByCategory');

const LIVE_FILTER = { $or: [{ 'stages.medicineRequests.status': { $in: LIVE } }, { 'stages.medicineRequest.status': { $in: LIVE } }] };
const REQUEST_FIELDS = ['requestId', 'status', 'supplyPlan', 'supplyPart', 'poNumber', 'purchaseOrderId', 'requestedAt', 'inProcessAt', 'madeAt', 'sentToCourierAt', 'courier.status', 'courier.deliveryMode', 'courier.dispatchedAt', 'courier.deliveredAt'];
const FIELDS = ['patientName', 'patientCode', 'stages.number',
  ...REQUEST_FIELDS.map((f) => `stages.medicineRequests.${f}`), ...REQUEST_FIELDS.map((f) => `stages.medicineRequest.${f}`)].join(' ');

const build = async () => {
  const patients = await Patient.find({ isActive: { $ne: false }, ...LIVE_FILTER }).select(FIELDS).lean();
  const latest = latestMedicine(patients);
  // The supply actually made: the fulfilment job's (the doctor can correct it), else the purchase order's.
  const jobs = latest.length ? await MedicineJob.find({ patient: { $in: latest.map((l) => l.patient._id) }, status: { $ne: 'cancelled' } }).select('patient phase requestId supplyPlan supplyPart status currentStage hold.active').lean() : [];
  const byKey = new Map(jobs.map((j) => [`${j.patient}|${j.phase}|${j.requestId}`, j]));
  const jobFor = (patient, stage, request) => byKey.get(`${patient._id}|${stage.number}|${request.requestId || 'legacy'}`);
  const poIds = latest.map((l) => l.request.purchaseOrderId).filter(Boolean);
  const pos = poIds.length ? await PurchaseOrder.find({ _id: { $in: poIds } }).select('supplyPlan supplyPart').lean() : [];
  const poOf = new Map(pos.map((p) => [String(p._id), p]));
  const planOf = (patient, stage, request) => {
    const job = jobFor(patient, stage, request);
    if (job?.supplyPlan) return { plan: job.supplyPlan, part: job.supplyPart };
    const po = request.purchaseOrderId ? poOf.get(String(request.purchaseOrderId)) : null;
    return po?.supplyPlan ? { plan: po.supplyPlan, part: po.supplyPart } : null;
  };
  const jobOf = (patient, stage, request) => {
    const job = jobFor(patient, stage, request);
    if (!job) return null;
    const step = STAGES[job.currentStage || 0];
    return { status: job.status, hold: Boolean(job.hold?.active), stageLabel: step ? `Step ${job.currentStage + 1}: ${step.label}` : '' };
  };
  const categories = groupByLength(latest, planOf, jobOf);
  return { success: true, total: latest.length, categories };
};

// @route GET /api/patients/medicine-categories
// Active patients by the length of their latest medicine (requested, being made or gone), with the phase.
const getMedicineCategories = asyncHandler(async (req, res) => {
  res.json(await cached('medicine-categories', build));
});

// @route GET /api/patients/payment-due-categories
// Active patients whose phase still has payment due, by the category of that phase's supply (1 month, 6 months ...).
const PAY_FIELDS = ['patientName', 'patientCode', 'stages.number', 'stages.totalAmount', 'stages.payments.amount', 'stages.payments.approvalStatus',
  'stages.payments.refunds.amount', 'stages.payments.refunds.status', 'stages.payments.date', 'stages.payments.createdAt',
  ...['requestId', 'status', 'supplyPlan', 'supplyPart', 'poNumber', 'requestedAt'].flatMap((x) => [`stages.medicineRequests.${x}`, `stages.medicineRequest.${x}`])].join(' ');
const buildDue = async () => {
  const patients = await Patient.find({ isActive: { $ne: false }, 'stages.totalAmount': { $gt: 0 } }).select(PAY_FIELDS).lean();
  const ids = patients.map((p) => p._id);
  const [pos, jobs] = ids.length ? await Promise.all([
    PurchaseOrder.find({ patient: { $in: ids }, status: { $nin: ['cancelled', 'rejected'] } }).select('patient phase poNumber supplyPlan supplyPart createdAt').lean(),
    MedicineJob.find({ patient: { $in: ids }, status: { $ne: 'cancelled' } }).select('patient phase requestId supplyPlan supplyPart').lean(),
  ]) : [[], []];
  const posBy = new Map();
  pos.forEach((po) => { const k = `${po.patient}|${po.phase}`; if (!posBy.has(k)) posBy.set(k, []); posBy.get(k).push(po); });
  const jobBy = new Map(jobs.map((j) => [`${j.patient}|${j.phase}|${j.requestId}`, j]));
  const categories = paymentDueByCategory(patients, {
    posOf: (id, phase) => posBy.get(`${id}|${phase}`) || [],
    jobPlanOf: (id, phase, requestId) => { const j = jobBy.get(`${id}|${phase}|${requestId}`); return j?.supplyPlan ? { plan: j.supplyPlan, part: j.supplyPart } : null; },
  });
  return { success: true, total: categories.reduce((s, c) => s + c.count, 0), totalDue: categories.reduce((s, c) => s + c.totalDue, 0), categories };
};
const getPaymentDueCategories = asyncHandler(async (req, res) => {
  res.json(await cached('payment-due-categories', buildDue));
});

module.exports = { getMedicineCategories, getPaymentDueCategories };
