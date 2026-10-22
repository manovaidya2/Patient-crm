// What one purchase order looks like on screen: its payments, its medicine request and the pipeline from
// "PO created" to "Treatment started". Nothing here is stored; every step is read from the records the other screens
// already write (payments, medicine request, courier, phase transit), so all views agree.
const { paymentSummary, pickRequest, MODE_LABEL } = require('./transitFlow');
const { supplyLabel, ageBandFor, AGE_BANDS } = require('../constants/supplyPlans');
const purchaseRecord = require('./purchaseOrderRecord');

// Older verified POs have no details/payment timestamps; for them "verified" means both steps were done.
const detailsVerified = (po) => Boolean(po.detailsVerifiedAt) || po.status === 'verified';

// The PO paper exactly as it was filled (sections F, G, H), for the PO details page.
const PAPER_SECTIONS = [['F', 'Payment collection & instalment plan', 'sectionF'], ['G', 'EMI details', 'sectionG'], ['H', 'Purchase order & patient / guardian consent', 'sectionH']];
const paperValue = (field, value, values) => {
  if (value === undefined || value === null || value === '' || value === false) return '';
  if (field.type === 'check') return 'Yes';
  if (field.type === 'money') return `Rs ${Number(value).toLocaleString('en-IN')}`;
  if (field.type === 'bank') return values.payToBankName || 'Selected';
  return String(value);
};
function paperView(values) {
  if (!values || typeof values !== 'object') return null;
  const defs = purchaseRecord.definitions();
  const sections = PAPER_SECTIONS.map(([letter, title, key]) => ({
    letter, title,
    rows: defs[key].filter((f) => f.type !== 'files').map((f) => ({ label: f.label, value: paperValue(f, values[f.key], values) })).filter((r) => r.value),
    files: defs[key].filter((f) => f.type === 'files').map((f) => ({ label: f.label, files: Array.isArray(values[f.key]) ? values[f.key] : [] })).filter((x) => x.files.length),
  })).filter((s) => s.rows.length || s.files.length);
  const t = values.totals || {};
  const totals = [['Approved program fee', t.approvedProgramFee], ['Card charge (3%)', t.cardCharge], ['Outstanding balance', t.outstandingBalance]]
    .filter(([, v]) => v !== undefined && v !== null).map(([label, v]) => ({ label, value: `Rs ${Number(v || 0).toLocaleString('en-IN')}` }));
  return { sections, totals };
}

const iso = (value) => (value ? new Date(value).toISOString() : null);
const plain = (value) => (value?.toObject ? value.toObject() : value) || {};
const num = (value) => Number(value || 0);

const GROUPS = [
  { key: 'verification', label: 'PO & payment' },
  { key: 'medicine', label: 'Medicine Dept' },
  { key: 'handover', label: 'Handover' },
  { key: 'treatment', label: 'Treatment' },
];

// Filter buckets for the Purchase Orders page, in pipeline order.
const STAGE_KEYS = ['verification', 'request', 'medicine', 'handover', 'treatment', 'started', 'rejected'];
// Everything not finished yet (the default list of the Purchase Orders page).
const isPendingStage = (key) => key !== 'started';

const refunded = (p) => (p.refunds || []).filter((r) => ['paid', 'settled'].includes(r.status)).reduce((s, r) => s + num(r.amount), 0);
const fileList = (p) => [...(p.screenshotFiles || []), ...(p.screenshotUrl && !(p.screenshotFiles || []).some((f) => f.url === p.screenshotUrl) ? [{ url: p.screenshotUrl, fileName: 'Payment proof' }] : [])];

const formatPayment = (p) => ({
  id: String(p._id || ''),
  amount: num(p.amount),
  netAmount: (p.approvalStatus || 'approved') === 'approved' ? num(p.amount) - refunded(p) : 0,
  date: iso(p.date),
  createdAt: iso(p.createdAt || p.date),
  mode: p.paymentMode || 'online',
  status: p.approvalStatus || 'approved',
  utr: p.utr || '',
  transactionId: p.transactionId || '',
  receivedBy: p.receivedBy || '',
  bank: p.payToBankName || '',
  notes: p.notes || '',
  recordedByName: p.recordedByName || '',
  approvedByName: p.approvedByName || '',
  approvedAt: iso(p.approvedAt),
  cancellationReason: p.cancellationReason || '',
  files: fileList(p),
});

const allRequests = (stage) => [...(stage.medicineRequests || []), ...(stage.medicineRequest && stage.medicineRequest.status && stage.medicineRequest.status !== 'not_requested' ? [stage.medicineRequest] : [])];
const findRequest = (stage, requestId) => {
  if (!requestId) return null;
  return allRequests(stage).find((r) => (r.requestId || 'legacy') === requestId) || null;
};

const shortDay = (value) => new Date(value).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });

function buildSteps({ po, request, courier, linked, transitOwner, t, stage, pay, patient }) {
  const status = request?.status;
  const accepted = ['in_process', 'made', 'sent_to_courier'].includes(status);
  const made = ['made', 'sent_to_courier'].includes(status);
  const released = status === 'sent_to_courier';
  const dispatched = ['dispatched', 'delivered'].includes(courier.status);
  const delivered = courier.status === 'delivered';
  // The delivery plan, packaging and PCC belong to the phase's current request (In Transit works one request at a time).
  const mode = transitOwner ? (t.fulfilmentMode || (courier.deliveryMode === 'self' ? 'pickup' : dispatched ? (courier.deliveryMode || 'courier') : '')) : (courier.deliveryMode === 'self' ? 'pickup' : dispatched ? courier.deliveryMode : '');
  const selfPickup = mode === 'pickup';
  const planDate = transitOwner ? (selfPickup ? t.pickupScheduledAt : t.dispatchScheduledAt) : null;
  const explanationAt = transitOwner ? stage.medicineExplainDate : null;
  const pccName = transitOwner ? (patient.assignedDoctor?.name || '') : '';
  const pccAssigned = transitOwner && Boolean(t.assignedAt || t.explanationDoctor);
  const steps = [
    { key: 'created', group: 'verification', label: 'PO created', done: true, at: iso(po.createdAt), by: po.createdByName, text: { conversion: 'From post-counselling conversion', manual: 'Added manually', legacy: 'Existing PO (before this system)' }[po.source] || '' },
    {
      key: 'details', group: 'verification', label: po.status === 'rejected' ? 'PO rejected' : 'PO details verified',
      done: detailsVerified(po), failed: po.status === 'rejected' || po.status === 'cancelled',
      at: iso(po.status === 'rejected' ? po.rejectedAt : (po.detailsVerifiedAt || po.verifiedAt)), by: po.status === 'rejected' ? po.rejectedByName : (po.detailsVerifiedByName || po.verifiedByName),
      text: po.status === 'rejected' ? po.rejectReason : '', waitText: 'In Transit checks the PO paper and patient details',
    },
    {
      key: 'payment', group: 'verification', label: 'Payment verified',
      done: po.status === 'verified',
      at: iso(po.paymentVerifiedAt || po.verifiedAt), by: po.paymentVerifiedByName || po.verifiedByName,
      text: linked.count ? `${linked.approvedCount} verified / ${linked.pendingCount} pending | Rs ${linked.verifiedAmount} in Phase ${po.phase} payments` : 'No payment on this PO',
      waitText: linked.count ? 'In Transit matches the payment proof and verifies it' : 'In Transit confirms there is no payment on this PO',
    },
    { key: 'requested', group: 'medicine', label: 'Medicine requested', done: Boolean(request), failed: status === 'cancelled', at: iso(request?.requestedAt), by: request?.requestedByName, text: status === 'cancelled' ? `Cancelled: ${request.cancelReason || ''}` : [supplyLabel(po.supplyPlan, po.supplyPart), AGE_BANDS[po.ageBand]].filter(Boolean).join(' | '), waitText: 'In Transit sends the request to Medicine Department' },
    { key: 'accepted', group: 'medicine', label: 'Accepted by Medicine Dept', done: accepted, at: iso(request?.inProcessAt), by: request?.inProcessByName, text: request?.readyByDate ? `Ready by ${new Date(request.readyByDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' })}` : '', waitText: 'Waiting for Medicine Department' },
    { key: 'ready', group: 'medicine', label: 'Medicine ready', done: made, at: iso(request?.madeAt), by: request?.madeByName, waitText: 'Medicine is being prepared' },
    // After "ready": In Transit calls the patient, fixes the delivery and explanation dates, collects the balance;
    // Medicine Department releases the packed parcel; In Transit hands over and assigns the PCC; the PCC explains and treatment starts.
    {
      key: 'scheduled', group: 'handover', label: 'Delivery & explanation scheduled', done: Boolean(mode) && (Boolean(planDate) || dispatched) && Boolean(explanationAt),
      at: iso(transitOwner ? t.fulfilmentSetAt : null), by: transitOwner ? t.fulfilmentSetByName : '',
      text: [MODE_LABEL[mode], planDate ? `${selfPickup ? 'pickup' : 'dispatch'} ${shortDay(planDate)}` : '', explanationAt ? `explanation ${shortDay(explanationAt)}` : ''].filter(Boolean).join(' · '),
      waitText: 'In Transit calls the patient, fixes self pickup / courier date and the medicine explanation date',
    },
    { key: 'fullpay', group: 'handover', label: 'Full payment verified', done: pay.remaining <= 0 && pay.pendingCount === 0, text: `Verified Rs ${pay.amountPaid} / Balance Rs ${pay.remaining}`, waitText: pay.pendingCount ? 'In Transit verifies the pending payments' : `In Transit collects the balance of Rs ${pay.remaining} and verifies it` },
    { key: 'released', group: 'handover', label: 'Released by Medicine Dept', done: released, at: iso(request?.sentToCourierAt), by: request?.sentToCourierByName, waitText: 'Medicine Department releases the parcel once the full payment is verified' },
    { key: 'handover', group: 'handover', label: selfPickup ? 'Collected at clinic' : 'Dispatched', done: dispatched || (selfPickup && delivered), at: iso(courier.dispatchedAt || (selfPickup ? courier.deliveredAt : null)), by: courier.dispatchedByName || (selfPickup ? courier.deliveredByName : ''), text: selfPickup ? (courier.receivedByName ? `Collected by ${courier.receivedByName}` : '') : [courier.courierPartner, courier.trackingNumber].filter(Boolean).join(' / '), waitText: selfPickup ? 'In Transit hands the parcel over at the clinic' : 'In Transit dispatches by courier / porter' },
    ...(selfPickup ? [] : [{ key: 'received', group: 'handover', label: 'Received by patient', done: delivered, at: iso(courier.deliveredAt), by: courier.deliveredByName, text: courier.receivedByName ? `Received by ${courier.receivedByName}` : '', waitText: 'In Transit confirms the delivery' }]),
    { key: 'pcc', group: 'treatment', label: 'PCC assigned', done: pccAssigned, at: iso(transitOwner ? t.assignedAt : null), by: transitOwner ? t.assignedByName : '', text: pccName, waitText: 'In Transit assigns the PCC who explains the medicine' },
    { key: 'explained', group: 'treatment', label: 'Medicine explained', done: transitOwner && Boolean(t.explanationCompletedAt), at: iso(transitOwner ? t.explanationCompletedAt : null), by: transitOwner ? t.explanationCompletedByName : '', text: explanationAt ? `Scheduled ${shortDay(explanationAt)}${t.explanationMode ? ` (${t.explanationMode})` : ''}` : '', waitText: 'The PCC completes it on the Medicine Explanations page' },
    { key: 'started', group: 'treatment', label: 'Treatment started', done: transitOwner && Boolean(t.activatedAt), at: iso(transitOwner ? t.activatedAt : null), by: transitOwner ? t.activatedByName : '' },
  ];
  const currentIndex = steps.findIndex((s) => !s.done);
  steps.forEach((s, i) => {
    s.n = i + 1;
    s.state = s.failed ? 'failed' : s.done ? 'done' : i === currentIndex ? 'current' : 'todo';
  });
  return steps;
}

function stageKeyOf(po, steps) {
  if (['rejected', 'cancelled'].includes(po.status)) return 'rejected';
  const done = (key) => steps.find((s) => s.key === key)?.done;
  if (po.status !== 'verified') return 'verification';
  if (!done('requested') || steps.find((s) => s.key === 'requested')?.failed) return 'request';
  if (!done('ready')) return 'medicine';
  if (!done('handover') || (steps.some((s) => s.key === 'received') && !done('received'))) return 'handover';
  if (!done('started')) return 'treatment';
  return 'started';
}

// Who has to act on this PO right now (derived from the current step, so it clears itself once the step is done).
const TRANSIT = ['admin', 'in_transit'];
const VERIFY = ['admin', 'doctor', 'in_transit'];
const MED = ['admin', 'doctor', 'medicine_department'];
function actionByOf(po, stepKey, canRequest) {
  if (po.status === 'rejected') return ['admin', 'doctor', 'post_counselor', 'in_transit'];
  if (po.status === 'cancelled') return [];
  switch (stepKey) {
    case 'details': case 'payment': return VERIFY;
    // Also when blocked (patient approval, payment): clearing the blocker is In Transit's work too.
    case 'requested': return VERIFY;
    case 'accepted': case 'ready': case 'released': return MED;
    case 'scheduled': case 'fullpay': case 'handover': case 'received': case 'pcc': return TRANSIT;
    case 'explained': return ['admin', 'assistant_doctor'];
    default: return [];
  }
}

function buildPoView(poDoc, patientDoc, { includeEvents = false, job = null } = {}) {
  const po = plain(poDoc);
  const patient = plain(patientDoc);
  const stage = (patient.stages || []).find((s) => s.number === po.phase) || {};
  const t = plain(stage.transit);
  const ids = new Set((po.paymentIds || []).map(String));
  const payments = (stage.payments || []).filter((p) => ids.has(String(p._id))).map(formatPayment)
    .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  const linked = {
    count: payments.length,
    approvedCount: payments.filter((p) => p.status === 'approved').length,
    pendingCount: payments.filter((p) => p.status === 'pending').length,
    pendingAmount: payments.filter((p) => p.status === 'pending').reduce((s, p) => s + p.amount, 0),
    verifiedAmount: payments.reduce((s, p) => s + p.netAmount, 0),
  };
  const request = findRequest(stage, po.medicineRequestId);
  const req = plain(request);
  const courier = plain(req.courier);
  const current = pickRequest(stage);
  const transitOwner = Boolean(request && current && (current.requestId || 'legacy') === (req.requestId || 'legacy'));
  const phasePay = paymentSummary(stage);
  const steps = buildSteps({ po, request: request ? req : null, courier, linked, transitOwner, t, stage, pay: phasePay, patient });
  const current_ = steps.find((s) => s.state === 'current' || s.state === 'failed');
  const groups = GROUPS.map((g) => {
    const inGroup = steps.filter((s) => s.group === g.key);
    const state = inGroup.some((s) => s.state === 'failed') ? 'failed' : inGroup.every((s) => s.state === 'done') ? 'done' : inGroup.some((s) => s.state === 'current') ? 'current' : 'todo';
    return { ...g, state, doneCount: inGroup.filter((s) => s.state === 'done').length, total: inGroup.length };
  });
  const stageKey = stageKeyOf(po, steps);
  const reqStatus = request ? req.status : '';
  const canRequestMedicine = po.status === 'verified' && (!request || reqStatus === 'cancelled');
  // Said on the page when the request button is not offered, so nobody wonders why.
  const requestBlockedReason = canRequestMedicine
    ? ((patient.approvalStatus || 'approved') !== 'approved' ? 'Approve the patient first' : t.removedAt ? `Phase ${po.phase} was removed from In Transit${t.removedByName ? ` by ${t.removedByName}` : ''}${t.removedReason ? ` (${t.removedReason})` : ''} - the admin can restore it` : t.holdActive ? `Phase ${po.phase} is on hold${t.holdReason ? `: ${t.holdReason}` : ''} - resume it to continue` : '')
    : po.status === 'rejected' ? 'This PO is rejected. It must be corrected and verified again'
      : po.status !== 'verified' ? (detailsVerified(po) ? 'Verify the payment of this PO first' : 'Verify the PO details first, then the payment')
        : `Medicine is already requested for this PO (${reqStatus.replace(/_/g, ' ')})`;
  return {
    id: String(po._id),
    poNumber: po.poNumber,
    generated: Boolean(po.generated),
    source: po.source,
    status: po.status,
    stageKey,
    patientId: String(patient._id || po.patient || ''),
    patientName: patient.patientName || po.patientName || '',
    patientCode: patient.patientCode || po.patientCode || '',
    patientPhone: patient.number || '',
    patientAge: patient.age || '',
    category: patient.category || '',
    approvalStatus: patient.approvalStatus || 'approved',
    currentStage: patient.currentStage || 1,
    isActive: patient.isActive !== false,
    phase: po.phase,
    supplyPlan: po.supplyPlan || '',
    supplyPart: po.supplyPart || '',
    supplyLabel: supplyLabel(po.supplyPlan, po.supplyPart),
    ageBand: po.ageBand || '',
    suggestedAgeBand: ageBandFor(patient.age),
    packageName: po.packageName || '',
    amount: num(po.amount),
    medicineReadyDate: iso(po.medicineReadyDate),
    notes: po.notes || '',
    paperImages: po.paperImages || [],
    createdAt: iso(po.createdAt),
    createdByName: po.createdByName || '',
    verifiedAt: iso(po.verifiedAt),
    verifiedByName: po.verifiedByName || '',
    detailsVerified: detailsVerified(po),
    detailsVerifiedAt: iso(po.detailsVerifiedAt || (po.status === 'verified' ? po.verifiedAt : null)),
    detailsVerifiedByName: po.detailsVerifiedByName || (po.status === 'verified' ? po.verifiedByName : '') || '',
    paymentVerifiedAt: iso(po.paymentVerifiedAt || (po.status === 'verified' ? po.verifiedAt : null)),
    paymentVerifiedByName: po.paymentVerifiedByName || (po.status === 'verified' ? po.verifiedByName : '') || '',
    guardianName: patient.guardianName || patient.relativeName || '',
    alternateNumber: patient.alternateNumber || '',
    address: [patient.address, patient.city, patient.state, patient.pinCode].filter(Boolean).join(', '),
    isPhaseCurrentRequest: transitOwner,
    rejectedAt: iso(po.rejectedAt),
    rejectedByName: po.rejectedByName || '',
    rejectReason: po.rejectReason || '',
    payments,
    linkedPayment: linked,
    phasePayment: { totalAmount: phasePay.totalAmount, amountPaid: phasePay.amountPaid, remaining: phasePay.remaining, pendingCount: phasePay.pendingCount },
    phaseHold: Boolean(t.holdActive), phaseRemoved: Boolean(t.removedAt),
    medicine: request ? {
      requestId: req.requestId || 'legacy',
      status: req.status,
      medicines: req.medicines || '',
      notes: req.notes || '',
      readyByDate: iso(req.readyByDate),
      requestedAt: iso(req.requestedAt),
      requestedByName: req.requestedByName || '',
      prescriptionFiles: [...(req.prescriptionFiles || []), ...(req.prescriptionUrl && !(req.prescriptionFiles || []).some((f) => f.url === req.prescriptionUrl) ? [{ url: req.prescriptionUrl, fileName: req.prescriptionFileName || 'Prescription' }] : [])],
      medicineImages: req.medicineImages || [],
      cancelReason: req.cancelReason || '',
    } : null,
    courier: request ? { status: courier.status || 'pending', deliveryMode: courier.deliveryMode || '', courierPartner: courier.courierPartner || '', trackingNumber: courier.trackingNumber || '', receivedByName: courier.receivedByName || '', deliveredAt: iso(courier.deliveredAt), dispatchedAt: iso(courier.dispatchedAt) } : null,
    canRequestMedicine: canRequestMedicine && !requestBlockedReason,
    requestBlockedReason,
    // A paused (on hold / removed) phase is still pending: In Transit resumes it, the admin restores it.
    actionBy: (t.holdActive || t.removedAt) && po.status === 'verified' && current_ ? TRANSIT : actionByOf(po, current_?.key, canRequestMedicine && !requestBlockedReason),
    steps,
    groups,
    step: current_ ? { key: current_.key, label: current_.label, waitText: current_.waitText || '', state: current_.state } : { key: 'started', label: 'Treatment started', state: 'done' },
    progress: Math.round((steps.filter((s) => s.state === 'done').length / steps.length) * 100),
    ...(includeEvents ? { events: [...(po.events || [])].reverse().map((e) => ({ ...plain(e), at: iso(e.at) })), paper: paperView(po.paperValues), medicineJob: job ? require('./medicineJobFlow').jobSummary(job) : null } : {}),
  };
}

module.exports = { buildPoView, GROUPS, STAGE_KEYS, isPendingStage, findRequest, formatPayment, actionByOf };
