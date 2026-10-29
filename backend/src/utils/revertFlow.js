// Admin-only undo of timeline steps. Every step is derived from stored records, so reverting a step means clearing the
// records that made it "done" - and, because the steps are sequential, every later step with it (reverting
// "Medicine ready" also undoes release, handover, PCC and explanation). Nothing is lost: what gets cleared is returned
// as a snapshot that the caller stores on the PO / job (`reverts[]`), and drawn stock goes back through the ledger.
const { STAGES, STAGE_INDEX } = require('./medicineJobFlow');

const fail = (message, statusCode = 400) => { throw Object.assign(new Error(message), { statusCode }); };
const plain = (value) => JSON.parse(JSON.stringify(value?.toObject ? value.toObject() : value ?? null));
const take = (obj, keys) => Object.fromEntries(keys.map((k) => [k, plain(obj?.[k])]));
const clear = (obj, keys) => keys.forEach((k) => { obj[k] = k.endsWith('At') || k.endsWith('Date') || k === 'explanationDoctor' ? null : typeof obj[k] === 'boolean' ? false : ''; });
const SHIPPED = ['dispatched', 'delivered'];

// ---- medicine job ----------------------------------------------------------------------------------------------

// Puts the job back to the start of `stageIndex`: later stage records go, stock drawn at preparation is returned,
// chits / photos / hold are reset and the medicine request's status follows. Returns the snapshot of what was cleared.
async function revertJobTo(job, stageIndex, { request = null, phaseEntry = null, returnStock = async () => {}, now = new Date() } = {}) {
  if (!STAGES[stageIndex]) fail('Unknown stage');
  const removed = job.stages.filter((s) => (STAGE_INDEX[s.key] ?? -1) >= stageIndex);
  if (!removed.length) fail(`"${STAGES[stageIndex].label}" is not done yet`);
  const gone = new Set(removed.map((s) => s.key));
  const snapshot = { stages: removed.map(plain), currentStage: job.currentStage, status: job.status };
  job.stages = job.stages.filter((s) => (STAGE_INDEX[s.key] ?? -1) < stageIndex);
  job.markModified('stages');
  if (gone.has('prepare') && (job.consumption || []).some((c) => c.txId)) {
    snapshot.consumption = plain(job.consumption);
    for (const line of job.consumption) {
      // eslint-disable-next-line no-await-in-loop
      if (line.txId && Number(line.actual) > 0) await returnStock(line);
      line.actual = null; line.txId = null;
    }
    job.markModified('consumption');
  }
  if (gone.has('fill') && (job.chits || []).some((c) => c.confirmed)) {
    snapshot.chits = plain(job.chits);
    job.chits.forEach((c) => { c.confirmed = false; c.confirmedByName = ''; c.confirmedAt = null; });
    job.markModified('chits');
  }
  if (gone.has('photos') && ((job.photos?.overview || []).length || (job.photos?.papers || []).length || (job.photos?.paperSets || []).length)) {
    snapshot.photos = plain(job.photos);
    job.photos = { overview: [], papers: [], paperSets: [] };
  }
  if (job.hold?.active) { snapshot.hold = plain(job.hold); Object.assign(job.hold, { active: false, reason: '', at: null, byName: '', stageKey: '' }); }
  if (request) {
    snapshot.request = take(request, ['status', 'madeAt', 'madeByName', 'packagedByName', 'lastMedicineCheckedByName', 'packagingDetailsFilledByName', 'packagingDetailsFilledAt', 'sentToCourierAt', 'sentToCourierByName', 'inProcessAt', 'inProcessByName']);
    if (gone.has('release') && request.status === 'sent_to_courier') {
      request.status = 'made';
      clear(request, ['sentToCourierAt', 'sentToCourierByName']);
      if (phaseEntry?.transit) { snapshot.transit = take(phaseEntry.transit, ['financialReleasedAt', 'financialReleasedByName', 'financialReleaseNote']); clear(phaseEntry.transit, ['financialReleasedAt', 'financialReleasedByName', 'financialReleaseNote']); }
    }
    if (gone.has('final') && request.status === 'made') {
      request.status = 'in_process';
      clear(request, ['madeAt', 'madeByName', 'packagedByName', 'lastMedicineCheckedByName', 'packagingDetailsFilledByName', 'packagingDetailsFilledAt']);
    }
    if (gone.has('accept') && request.status === 'in_process') {
      request.status = 'requested';
      clear(request, ['inProcessAt', 'inProcessByName']);
    }
  }
  job.status = gone.has('final') ? 'open' : gone.has('release') ? 'ready' : job.status;
  job.currentStage = stageIndex;
  snapshot.at = now;
  return snapshot;
}

// ---- purchase order --------------------------------------------------------------------------------------------

// Timeline order; reverting a step reverts every later done step first.
const PO_REVERT_ORDER = ['details', 'payment', 'requested', 'accepted', 'ready', 'scheduled', 'fullpay', 'released', 'handover', 'received', 'pcc', 'explained', 'started'];

const courierOf = (request) => { if (!request.courier) request.courier = {}; return request.courier; };
const toPending = (payment, snapshot) => { snapshot.push(take(payment, ['_id', 'approvalStatus', 'approvedAt', 'approvedByName'])); payment.approvalStatus = 'pending'; payment.approvedAt = null; payment.approvedByName = ''; };

const PO_REVERTS = {
  // Explanation done + treatment started are written together, so one revert clears both.
  async explained({ stage }) {
    const t = stage.transit;
    if (!t?.explanationCompletedAt && !t?.activatedAt) return null;
    const keys = ['explanationCompletedAt', 'explanationCompletedByName', 'explainedByName', 'explanationNote', 'activatedAt', 'activatedByName'];
    const snapshot = { transit: take(t, keys), stage: take(stage, ['status', 'date']) };
    const startedByExplanation = stage.status === 'in_progress' && stage.date && t.explanationCompletedAt && Math.abs(new Date(stage.date).getTime() - new Date(t.explanationCompletedAt).getTime()) < 1000;
    clear(t, keys);
    if (startedByExplanation) { stage.status = 'not_started'; stage.date = null; }
    return snapshot;
  },
  async started(ctx) { return PO_REVERTS.explained(ctx); },
  async pcc({ stage }) {
    const t = stage.transit;
    if (!t?.assignedAt && !t?.explanationDoctor) return null;
    const keys = ['assignedAt', 'assignedByName', 'explanationDoctor', 'explanationAckAt', 'explanationAckByName'];
    const snapshot = { transit: take(t, keys) };
    clear(t, keys);
    return snapshot;
  },
  async received({ request }) {
    const courier = courierOf(request);
    if (courier.status !== 'delivered') return null;
    const keys = ['status', 'deliveredAt', 'deliveredByName', 'receivedByName', 'deliveryProofUrl', 'deliveryProofFileName', 'deliveryProofImages'];
    const snapshot = { courier: take(courier, keys) };
    Object.assign(courier, { status: courier.deliveryMode === 'self' ? 'pending' : 'dispatched', deliveredAt: null, deliveredByName: '', receivedByName: '', deliveryProofUrl: null, deliveryProofFileName: '', deliveryProofImages: [] });
    request.markModified?.('courier');
    return snapshot;
  },
  async handover(ctx) {
    const courier = courierOf(ctx.request);
    if (!SHIPPED.includes(courier.status)) return null;
    const delivered = courier.status === 'delivered' ? await PO_REVERTS.received(ctx) : null;
    const keys = ['status', 'dispatchedAt', 'dispatchedByName', 'courierPartner', 'trackingNumber', 'packageImageUrl', 'packageImageFileName', 'packageImages', 'notes'];
    const snapshot = { courier: take(courier, keys), ...(delivered ? { delivered } : {}) };
    Object.assign(courier, { status: 'pending', dispatchedAt: null, dispatchedByName: '', courierPartner: '', trackingNumber: '', packageImageUrl: null, packageImageFileName: '', packageImages: [], notes: '' });
    ctx.request.markModified?.('courier');
    return snapshot;
  },
  async released(ctx) {
    const { request, job, stage } = ctx;
    if (request.status !== 'sent_to_courier') return null;
    if (job && job.stages.some((s) => s.key === 'release')) return revertJobTo(job, STAGE_INDEX.release, { request, phaseEntry: stage, returnStock: ctx.returnStock, now: ctx.now });
    const snapshot = { request: take(request, ['status', 'sentToCourierAt', 'sentToCourierByName']), transit: take(stage.transit, ['financialReleasedAt', 'financialReleasedByName', 'financialReleaseNote']) };
    request.status = 'made'; clear(request, ['sentToCourierAt', 'sentToCourierByName']);
    clear(stage.transit, ['financialReleasedAt', 'financialReleasedByName', 'financialReleaseNote']);
    return snapshot;
  },
  // Payments verified after the PO's own payment verification (the balance) go back to pending.
  async fullpay({ po, stage }) {
    const since = po.paymentVerifiedAt ? new Date(po.paymentVerifiedAt).getTime() : 0;
    const linked = new Set((po.paymentIds || []).map(String));
    const later = (stage.payments || []).filter((p) => (p.approvalStatus || 'approved') === 'approved' && !linked.has(String(p._id)) && p.approvedAt && new Date(p.approvedAt).getTime() > since);
    if (!later.length) return null;
    const snapshot = { payments: [] };
    later.forEach((p) => toPending(p, snapshot.payments));
    return snapshot;
  },
  async scheduled({ stage }) {
    const t = stage.transit;
    if (!t?.fulfilmentMode && !stage.medicineExplainDate) return null;
    const keys = ['fulfilmentMode', 'fulfilmentSetAt', 'fulfilmentSetByName', 'pickupScheduledAt', 'pickupNote', 'pickupScheduledByName', 'dispatchScheduledAt', 'plannedCourier', 'plannedAddress', 'deliveryPlanNote', 'explanationScheduledAt', 'explanationScheduledByName', 'explanationMode', 'explanationAckAt', 'explanationAckByName'];
    const snapshot = { transit: take(t, keys), stage: take(stage, ['medicineExplainDate']) };
    clear(t, keys);
    stage.medicineExplainDate = null;
    return snapshot;
  },
  async ready(ctx) {
    const { request, job, stage } = ctx;
    if (!['made', 'sent_to_courier'].includes(request.status)) return null;
    if (job && job.stages.some((s) => s.key === 'final')) return revertJobTo(job, STAGE_INDEX.final, { request, phaseEntry: stage, returnStock: ctx.returnStock, now: ctx.now });
    const keys = ['status', 'madeAt', 'madeByName', 'packagedByName', 'lastMedicineCheckedByName', 'packagingDetailsFilledByName', 'packagingDetailsFilledAt'];
    const snapshot = { request: take(request, keys) };
    request.status = 'in_process'; clear(request, keys.slice(1));
    return snapshot;
  },
  async accepted(ctx) {
    const { request, job, stage } = ctx;
    if (!['in_process', 'made', 'sent_to_courier'].includes(request.status)) return null;
    if (job && job.stages.length) return revertJobTo(job, 0, { request, phaseEntry: stage, returnStock: ctx.returnStock, now: ctx.now });
    const snapshot = { request: take(request, ['status', 'inProcessAt', 'inProcessByName']) };
    request.status = 'requested'; clear(request, ['inProcessAt', 'inProcessByName']);
    return snapshot;
  },
  // The request itself is withdrawn (kept as cancelled); the job, if any, is cancelled with it.
  async requested({ po, request, job, reason, user, now }) {
    if (!request || request.status === 'cancelled') return null;
    const snapshot = { request: plain(request), medicineRequestId: po.medicineRequestId, jobStatus: job?.status || null };
    Object.assign(request, { status: 'cancelled', cancelledAt: now, cancelledByName: user.name, cancelReason: `Reverted by admin: ${reason}` });
    po.medicineRequestId = '';
    if (job) job.status = 'cancelled';
    return snapshot;
  },
  async payment({ po, stage }) {
    if (!po.paymentVerifiedAt && po.status !== 'verified') return null;
    const keys = ['status', 'paymentVerifiedAt', 'paymentVerifiedByName', 'verifiedAt', 'verifiedByName'];
    const snapshot = { po: { ...take(po, keys), paymentChecks: [...(po.paymentChecks || [])] }, payments: [] };
    const linked = new Set((po.paymentIds || []).map(String));
    (stage.payments || []).filter((p) => linked.has(String(p._id)) && (p.approvalStatus || 'approved') === 'approved').forEach((p) => toPending(p, snapshot.payments));
    po.status = 'pending'; clear(po, ['paymentVerifiedAt', 'paymentVerifiedByName', 'verifiedAt', 'verifiedByName']); po.paymentChecks = [];
    return snapshot;
  },
  async details({ po }) {
    if (!po.detailsVerifiedAt) return null;
    const snapshot = { po: { ...take(po, ['detailsVerifiedAt', 'detailsVerifiedByName']), detailsChecks: [...(po.detailsChecks || [])] } };
    clear(po, ['detailsVerifiedAt', 'detailsVerifiedByName']); po.detailsChecks = [];
    return snapshot;
  },
};

// Reverts `stepKey` and every later step that is done, latest first. `steps` is the PO view's step list.
async function revertPoFrom(stepKey, ctx) {
  const index = PO_REVERT_ORDER.indexOf(stepKey);
  if (index < 0) fail(stepKey === 'created' ? 'The PO itself cannot be reverted; reject or cancel it instead' : 'This step cannot be reverted');
  const done = new Set((ctx.steps || []).filter((s) => s.done).map((s) => s.key));
  if (!done.has(stepKey)) fail('This step is not done yet');
  if (['requested', 'accepted', 'ready', 'released', 'handover', 'received', 'explained', 'started'].some((k) => done.has(k)) && !ctx.request) fail('The medicine request of this PO was not found');
  const reverted = []; const snapshot = {};
  for (const key of PO_REVERT_ORDER.slice(index).filter((k) => done.has(k)).reverse()) {
    // eslint-disable-next-line no-await-in-loop
    const part = await PO_REVERTS[key](ctx);
    if (part) { snapshot[key] = part; reverted.push(key); }
  }
  if (!reverted.length) fail('Nothing to revert for this step');
  return { reverted, snapshot };
}

module.exports = { revertJobTo, revertPoFrom, PO_REVERT_ORDER };
