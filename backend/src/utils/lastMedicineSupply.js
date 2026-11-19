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

// Every patient once, in their phase: the patient's current phase, or the phase of their latest medicine when that is
// further on. The row carries that phase's latest medicine; without one, `request` is null and `earlier` is the
// latest medicine of an earlier phase (if any).
function patientPhaseRows(patients) {
  const latest = new Map(latestMedicine(patients).map((l) => [l.patient, l]));
  return patients.map((patient) => {
    const best = latest.get(patient) || null;
    const phase = Math.max(Number(patient.currentStage) || 1, best ? Number(best.stage.number) : 0);
    if (best && Number(best.stage.number) === phase) return best;
    return { patient, stage: { number: phase }, request: null, at: null, earlier: best };
  });
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
  for (const { patient, stage, request, earlier } of latest) {
    if (!request) {
      // No medicine in this phase yet.
      if (!groups.has(NONE.key)) groups.set(NONE.key, { ...NONE, days: 0, patients: [] });
      const last = earlier ? lengthOf(...(() => { const m = planOf(patient, earlier.stage, earlier.request) || {}; return [m.plan || earlier.request.supplyPlan || '', m.part || earlier.request.supplyPart || '']; })()) : null;
      groups.get(NONE.key).patients.push({
        patientId: String(patient._id), patientName: patient.patientName || '', patientCode: patient.patientCode || '',
        program: PROGRAM[patient.category] || '', phase: stage.number, supplyLabel: '', poNumber: '',
        none: true, gone: false, status: 'No medicine request yet', requestedAt: null, sentAt: null, deliveryMode: '',
        last: earlier ? { phase: earlier.stage.number, supplyLabel: last.option?.label || 'Supply not recorded', status: statusOf(earlier.request, jobOf(patient, earlier.stage, earlier.request)).status, at: iso(goneAt(earlier.request) || earlier.request.requestedAt) } : null,
      });
      continue;
    }
    const made = planOf(patient, stage, request) || {};
    const plan = made.plan || request.supplyPlan || '';
    const part = made.part || request.supplyPart || '';
    const { option, key, label, order, days } = lengthOf(plan, part);
    if (!groups.has(key)) groups.set(key, { key, days, order, label, patients: [] });
    const { gone, status } = statusOf(request, jobOf(patient, stage, request));
    groups.get(key).patients.push({
      patientId: String(patient._id), patientName: patient.patientName || '', patientCode: patient.patientCode || '',
      program: PROGRAM[patient.category] || '', phase: stage.number, supplyLabel: option?.label || '', poNumber: request.poNumber || '',
      gone, status, requestedAt: iso(request.requestedAt), sentAt: gone ? iso(goneAt(request)) : null,
      deliveryMode: request.courier?.deliveryMode || '',
    });
  }
  const list = [...groups.values()];
  list.forEach((g) => g.patients.sort((a, b) => time(b.sentAt || b.requestedAt) - time(a.sentAt || a.requestedAt)));
  // Full 6 months, 1 + 5, 2 + 4, then the custom ones (shortest first); "not recorded" last.
  return list.sort((a, b) => a.order - b.order)
    .map((g) => ({ ...g, count: g.patients.length, gone: g.patients.filter((p) => p.gone).length }));
}

// The category of a supply, as the PO paper picks it: Full 6 months, 1 + 5 months, 2 + 4 months, or Custom with its
// length (Custom: 3 months, Custom: 45 days ...). The part (first 1 month / next 5 months) stays in `option.label`.
const PLAN_CATEGORY = { '6M': ['Full 6 months', 1], '1+5': ['1 + 5 months', 2], '2+4': ['2 + 4 months', 3] };
const PROGRAM = { autism_adhd: 'Autism / ADHD', mental_health: 'Mental Health' };
// The patients of a phase with no medicine request in it yet: always the last category.
const NONE = { key: 'none', label: 'No medicine yet', order: 2e9 };
const lengthOf = (plan, part) => {
  const option = plan ? supplyOption(plan, part || 'full') : null;
  const days = option ? Math.round(option.days || option.months * 30) : 0;
  if (!option) return { option: null, days: 0, key: 'unknown', label: 'Supply not recorded', order: 1e9 };
  const fixed = PLAN_CATEGORY[plan];
  if (fixed) return { option, days, key: plan, label: fixed[0], order: fixed[1] };
  return { option, days, key: `C${days}`, label: `Custom: ${categoryText(days)}`, order: 10 + days };
};

module.exports = { patientPhaseRows, latestMedicine, groupByLength, goneAt, LIVE, lengthOf, categoryText, requestsOf, PROGRAM };
