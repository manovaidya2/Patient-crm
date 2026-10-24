// Medicine that reached the patient through the old flow (before the 12-stage fulfilment job) is complete, even
// though its request still says "made" or its job never reached "released". Nothing is changed in the data;
// these helpers only keep such requests and jobs out of the pending counts and orange highlights.
const Patient = require('../models/Patient');
const MedicineJob = require('../models/MedicineJob');

const HANDED_OVER = ['dispatched', 'delivered'];

// The parcel was dispatched or delivered (old flow records it on the request itself).
const isHandedOver = (request) => HANDED_OVER.includes(request?.courier?.status);

const requestsOf = (stage) => {
  const list = [...(stage?.medicineRequests || [])];
  if (stage?.medicineRequest?.requestId && !list.some((r) => r.requestId === stage.medicineRequest.requestId)) list.push(stage.medicineRequest);
  return list;
};

// Of these request ids, the ones whose medicine has already been handed over.
const handedOverRequestIds = async (requestIds) => {
  const ids = [...new Set((requestIds || []).filter(Boolean).map(String))];
  if (!ids.length) return new Set();
  const patients = await Patient.find({ $or: [{ 'stages.medicineRequests.requestId': { $in: ids } }, { 'stages.medicineRequest.requestId': { $in: ids } }] })
    .select('stages.medicineRequest stages.medicineRequests').lean();
  const out = new Set();
  patients.forEach((p) => (p.stages || []).forEach((st) => requestsOf(st).forEach((r) => {
    if (ids.includes(String(r.requestId)) && isHandedOver(r)) out.add(String(r.requestId));
  })));
  return out;
};

// Request ids that have a fulfilment job still open or ready (new flow, not yet released).
const activeJobRequestIds = async () => {
  const jobs = await MedicineJob.find({ status: { $in: ['open', 'ready'] } }).select('requestId').lean();
  return new Set(jobs.map((j) => String(j.requestId)));
};

// A "made" request still needs the Medicine Department only when it came through a fulfilment job that is not
// released yet and its medicine has not been handed over. Old-flow "made" requests (no job) are complete.
const madeStillPending = (request, activeJobIds) =>
  request?.status === 'made' && !isHandedOver(request) && activeJobIds.has(String(request.requestId));

module.exports = { isHandedOver, handedOverRequestIds, activeJobRequestIds, madeStillPending };
