const Patient = require('../models/Patient');
const PurchaseOrder = require('../models/PurchaseOrder');
const MedicineJob = require('../models/MedicineJob');
const { asyncHandler } = require('../middleware/errorHandler');
const { cached } = require('../utils/readCache');
const { latestGone, groupByLength } = require('../utils/lastMedicineSupply');

const GONE_FILTER = { $or: [{ 'stages.medicineRequests.status': 'sent_to_courier' }, { 'stages.medicineRequest.status': 'sent_to_courier' }] };
const REQUEST_FIELDS = ['requestId', 'status', 'supplyPlan', 'supplyPart', 'poNumber', 'purchaseOrderId', 'sentToCourierAt', 'madeAt', 'requestedAt', 'courier.status', 'courier.deliveryMode', 'courier.dispatchedAt', 'courier.deliveredAt'];
const FIELDS = ['patientName', 'patientCode', 'stages.number',
  ...REQUEST_FIELDS.map((f) => `stages.medicineRequests.${f}`), ...REQUEST_FIELDS.map((f) => `stages.medicineRequest.${f}`)].join(' ');

const build = async () => {
  const patients = await Patient.find({ isActive: { $ne: false }, ...GONE_FILTER }).select(FIELDS).lean();
  const latest = latestGone(patients);
  // The supply actually made: the fulfilment job's (the doctor can correct it), else the purchase order's.
  const jobs = latest.length ? await MedicineJob.find({ patient: { $in: latest.map((l) => l.patient._id) } }).select('patient phase requestId supplyPlan supplyPart').lean() : [];
  const jobOf = new Map(jobs.map((j) => [`${j.patient}|${j.phase}|${j.requestId}`, j]));
  const poIds = latest.map((l) => l.request.purchaseOrderId).filter(Boolean);
  const pos = poIds.length ? await PurchaseOrder.find({ _id: { $in: poIds } }).select('supplyPlan supplyPart').lean() : [];
  const poOf = new Map(pos.map((p) => [String(p._id), p]));
  const planOf = (patient, stage, request) => {
    const job = jobOf.get(`${patient._id}|${stage.number}|${request.requestId || 'legacy'}`);
    if (job?.supplyPlan) return { plan: job.supplyPlan, part: job.supplyPart };
    const po = request.purchaseOrderId ? poOf.get(String(request.purchaseOrderId)) : null;
    return po?.supplyPlan ? { plan: po.supplyPlan, part: po.supplyPart } : null;
  };
  const categories = groupByLength(latest, planOf);
  return { success: true, total: latest.length, categories };
};

// @route GET /api/patients/medicine-categories
// Active patients by the length of the last medicine that went to them (1 month, 45 days, 6 months ...), with the phase.
const getMedicineCategories = asyncHandler(async (req, res) => {
  res.json(await cached('medicine-categories', build));
});

module.exports = { getMedicineCategories };
