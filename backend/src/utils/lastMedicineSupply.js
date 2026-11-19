// Control Room: the LAST medicine that went out to every active patient, grouped by how much medicine it was
// (1 month, 45 days, 2 months, 6 months ...). Older supplies of a patient are not counted, only the newest one.
const { supplyOption, lengthText } = require('../constants/supplyPlans');

// Medicine "gone" = released by the Medicine Department to In Transit / courier (the request is then sent_to_courier).
const GONE = 'sent_to_courier';
const requestsOf = (stage) => [
  ...(stage.medicineRequests || []),
  ...(stage.medicineRequest?.status && stage.medicineRequest.status !== 'not_requested' ? [stage.medicineRequest] : []),
];
// When it went: delivered, else dispatched, else released.
const goneAt = (r) => r.courier?.deliveredAt || r.courier?.dispatchedAt || r.sentToCourierAt || r.madeAt || r.requestedAt || null;
// Whole months as months ("2 months"), any other length in days ("45 days"), as the clinic says it.
const categoryText = (days) => (days % 30 === 0 ? lengthText(days) : `${days} days`);
const time = (d) => (d ? new Date(d).getTime() : 0);
const iso = (d) => (d ? new Date(d).toISOString() : null);
const DELIVERY = { delivered: 'Delivered', dispatched: 'Dispatched', pending: 'Released, not dispatched', cancelled: 'Courier cancelled' };

// The newest gone request of each patient: [{ patient, stage, request, at }].
function latestGone(patients) {
  const out = [];
  for (const patient of patients) {
    let best = null;
    for (const stage of patient.stages || []) {
      for (const request of requestsOf(stage)) {
        if (request.status !== GONE) continue;
        const at = goneAt(request);
        if (!best || time(at) > time(best.at)) best = { patient, stage, request, at };
      }
    }
    if (best) out.push(best);
  }
  return out;
}

// Rows grouped by length. `planOf(patient, stage, request)` gives the supply actually made ({ plan, part }), when known
// from the fulfilment job or the purchase order; else the request's own plan is used.
function groupByLength(latest, planOf = () => null) {
  const groups = new Map();
  for (const { patient, stage, request, at } of latest) {
    const made = planOf(patient, stage, request) || {};
    const plan = made.plan || request.supplyPlan || '';
    const part = made.part || request.supplyPart || '';
    const option = plan ? supplyOption(plan, part || 'full') : null;
    const days = option ? Math.round(option.days || option.months * 30) : 0;
    const key = days ? `d${days}` : 'unknown';
    if (!groups.has(key)) groups.set(key, { key, days, label: days ? categoryText(days) : 'Supply not recorded', patients: [] });
    groups.get(key).patients.push({
      patientId: String(patient._id), patientName: patient.patientName || '', patientCode: patient.patientCode || '',
      phase: stage.number, supplyLabel: option?.label || '', poNumber: request.poNumber || '',
      sentAt: iso(at), delivery: DELIVERY[request.courier?.status] || DELIVERY.pending,
      deliveryMode: request.courier?.deliveryMode || '',
    });
  }
  const list = [...groups.values()];
  list.forEach((g) => g.patients.sort((a, b) => time(b.sentAt) - time(a.sentAt)));
  // Shortest supply first; "not recorded" last.
  return list.sort((a, b) => (a.days || Infinity) - (b.days || Infinity)).map((g) => ({ ...g, count: g.patients.length }));
}

module.exports = { latestGone, groupByLength, goneAt };
