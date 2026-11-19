// Control Room: the LATEST medicine of every active patient - requested, being made or gone - grouped by how much
// medicine it is (1 month, 45 days, 2 months, 6 months ...). Older supplies of a patient are not counted.
const { supplyOption, lengthText } = require('../constants/supplyPlans');

// Every request that is on its way or gone (a cancelled one is not a supply).
const LIVE = ['requested', 'in_process', 'made', 'sent_to_courier'];
const GONE = 'sent_to_courier';
const requestsOf = (stage) => [
  ...(stage.medicineRequests || []),
  ...(stage.medicineRequest?.status && stage.medicineRequest.status !== 'not_requested' ? [stage.medicineRequest] : []),
];
// When it went: delivered, else dispatched, else released.
const goneAt = (r) => r.courier?.deliveredAt || r.courier?.dispatchedAt || r.sentToCourierAt || null;
// Which supply is the newest: the one asked for last (a gone one without a request date counts from when it went).
const newestAt = (r) => r.requestedAt || r.sentToCourierAt || r.madeAt || r.inProcessAt || null;
// Whole months as months ("2 months"), any other length in days ("45 days"), as the clinic says it.
const categoryText = (days) => (days % 30 === 0 ? lengthText(days) : `${days} days`);
const time = (d) => (d ? new Date(d).getTime() : 0);
const iso = (d) => (d ? new Date(d).toISOString() : null);
const DELIVERY = { delivered: 'Delivered', dispatched: 'Dispatched', pending: 'Released, not dispatched', cancelled: 'Courier cancelled' };
const REQUEST_STATUS = { requested: 'Requested', in_process: 'Being prepared', made: 'Ready, not released' };

// The newest live request of each patient: [{ patient, stage, request, at }].
function latestMedicine(patients) {
  const out = [];
  for (const patient of patients) {
    let best = null;
    for (const stage of patient.stages || []) {
      for (const request of requestsOf(stage)) {
        if (!LIVE.includes(request.status)) continue;
        const at = newestAt(request);
        if (!best || time(at) > time(best.at)) best = { patient, stage, request, at };
      }
    }
    if (best) out.push(best);
  }
  return out;
}

// Where the medicine is now. `job` (optional): { status, stageLabel, hold } of its fulfilment job.
function statusOf(request, job) {
  if (request.status === GONE) return { gone: true, status: DELIVERY[request.courier?.status] || DELIVERY.pending };
  if (job?.hold) return { gone: false, status: 'On hold in fulfilment' };
  if (job?.status === 'ready') return { gone: false, status: 'Ready, not released' };
  if (job?.status === 'open' && job.stageLabel) return { gone: false, status: job.stageLabel };
  return { gone: false, status: REQUEST_STATUS[request.status] || 'Requested' };
}

// Rows grouped by length. `planOf(patient, stage, request)` gives the supply actually made ({ plan, part }) from the
// fulfilment job or the purchase order; `jobOf` the job's state. Else the request's own plan is used.
function groupByLength(latest, planOf = () => null, jobOf = () => null) {
  const groups = new Map();
  for (const { patient, stage, request } of latest) {
    const made = planOf(patient, stage, request) || {};
    const plan = made.plan || request.supplyPlan || '';
    const part = made.part || request.supplyPart || '';
    const option = plan ? supplyOption(plan, part || 'full') : null;
    const days = option ? Math.round(option.days || option.months * 30) : 0;
    const key = days ? `d${days}` : 'unknown';
    if (!groups.has(key)) groups.set(key, { key, days, label: days ? categoryText(days) : 'Supply not recorded', patients: [] });
    const { gone, status } = statusOf(request, jobOf(patient, stage, request));
    groups.get(key).patients.push({
      patientId: String(patient._id), patientName: patient.patientName || '', patientCode: patient.patientCode || '',
      phase: stage.number, supplyLabel: option?.label || '', poNumber: request.poNumber || '',
      gone, status, requestedAt: iso(request.requestedAt), sentAt: gone ? iso(goneAt(request)) : null,
      deliveryMode: request.courier?.deliveryMode || '',
    });
  }
  const list = [...groups.values()];
  list.forEach((g) => g.patients.sort((a, b) => time(b.sentAt || b.requestedAt) - time(a.sentAt || a.requestedAt)));
  // Shortest supply first; "not recorded" last.
  return list.sort((a, b) => (a.days || Infinity) - (b.days || Infinity))
    .map((g) => ({ ...g, count: g.patients.length, gone: g.patients.filter((p) => p.gone).length }));
}

// Days and category label of a supply plan ('' when unknown).
const lengthOf = (plan, part) => { const option = plan ? supplyOption(plan, part || 'full') : null; const days = option ? Math.round(option.days || option.months * 30) : 0; return { option, days, label: days ? categoryText(days) : 'Supply not recorded', key: days ? `d${days}` : 'unknown' }; };

module.exports = { latestMedicine, groupByLength, goneAt, LIVE, lengthOf, categoryText, requestsOf };
