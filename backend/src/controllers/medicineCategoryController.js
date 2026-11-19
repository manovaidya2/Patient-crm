const Patient = require('../models/Patient');
const PurchaseOrder = require('../models/PurchaseOrder');
const MedicineJob = require('../models/MedicineJob');
const { asyncHandler } = require('../middleware/errorHandler');
const { cached } = require('../utils/readCache');
const { STAGES } = require('../utils/medicineJobFlow');
const { latestMedicine, groupByLength, LIVE } = require('../utils/lastMedicineSupply');

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

module.exports = { getMedicineCategories };
