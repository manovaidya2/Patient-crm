// In-transit tracking for one phase, from "PO + payment added" to "treatment started".
//
// Nothing here is stored as a status. Each step is worked out from the fields the other screens
// already write (payments, medicine request, courier) plus the small `stage.transit` record, so an
// update on the Medicine / Courier / Patient pages shows up here and the other way round.

const MEDICINE_ACTIVE = ['requested', 'in_process', 'made', 'sent_to_courier'];
const SHIPPED_MODES = ['porter', 'courier'];
const MODE_LABEL = { pickup: 'Self pickup', porter: 'Porter', courier: 'Courier' };
const DAY = 86400000;

const GROUPS = [
  { key: 'order', label: 'Order' },
  { key: 'medicine', label: 'Medicine' },
  { key: 'contact', label: 'Patient contact' },
  { key: 'handover', label: 'Handover' },
  { key: 'treatment', label: 'Treatment start' },
];

const num = (value) => Number(value || 0);
const iso = (value) => (value ? new Date(value).toISOString() : null);
const plain = (value) => (value?.toObject ? value.toObject() : value) || {};
const refOf = (value) => (value ? { id: String(value._id || value), name: value.name || '' } : null);
const shortDay = (value) => new Date(value).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });
const startOfDay = (value) => new Date(`${new Date(value).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })}T00:00:00+05:30`);

// Newest medicine request of the phase that is still alive (not cancelled / not empty).
function pickRequest(stage) {
  const candidates = [...(stage.medicineRequests || []), stage.medicineRequest]
    .filter((request) => request && MEDICINE_ACTIVE.includes(request.status));
  if (!candidates.length) return null;
  return candidates.reduce((best, request) => (new Date(request.requestedAt || 0) >= new Date(best.requestedAt || 0) ? request : best));
}

function paymentSummary(stage) {
  const payments = stage.payments || [];
  const approved = payments.filter((p) => (p.approvalStatus || 'approved') === 'approved');
  const pending = payments.filter((p) => p.approvalStatus === 'pending');
  const refunded = (p) => (p.refunds || []).filter((r) => ['paid', 'settled'].includes(r.status)).reduce((s, r) => s + num(r.amount), 0);
  const amountPaid = approved.reduce((sum, p) => sum + num(p.amount) - refunded(p), 0);
  return {
    count: payments.length,
    approvedCount: approved.length,
    pendingCount: pending.length,
    pendingAmount: pending.reduce((sum, p) => sum + num(p.amount), 0),
    totalAmount: num(stage.totalAmount),
    amountPaid,
    remaining: Math.max(num(stage.totalAmount) - amountPaid, 0),
    firstPaymentAt: payments.reduce((min, p) => (!min || new Date(p.createdAt || p.date) < new Date(min) ? (p.createdAt || p.date) : min), null),
  };
}

// A phase is "in transit" once the purchase order and at least one payment are in Patient Details.
const isInTransit = (stage) => Boolean(String(stage?.purchaseOrder || '').trim());

function fulfilmentMode(stage, request) {
  const t = plain(stage.transit);
  if (t.fulfilmentMode) return t.fulfilmentMode;
  const courier = plain(request?.courier);
  if (courier.status === 'delivered' && courier.deliveryMode === 'self') return 'pickup';
  if (request && (request.status === 'sent_to_courier' || ['dispatched', 'delivered'].includes(courier.status))) return courier.deliveryMode === 'porter' ? 'porter' : 'courier';
  return '';
}

// The automatic reminder fires at the start of the day before the ready-by date.
const reminderDate = (readyBy) => (readyBy ? new Date(startOfDay(readyBy).getTime() - DAY) : null);

function buildSteps({ patient, stage, t, request, courier, pay, mode, calls }) {
  const made = Boolean(request && ['made', 'sent_to_courier'].includes(request.status));
  const accepted = Boolean(request && ['in_process', 'made', 'sent_to_courier'].includes(request.status));
  const released = request?.status === 'sent_to_courier';
  const delivered = courier.status === 'delivered';
  const dispatched = ['dispatched', 'delivered'].includes(courier.status);
  const approved = (patient.approvalStatus || 'approved') === 'approved';
  const readyBy = request?.readyByDate || t.expectedReadyDate;
  const steps = [
    { key: 'po', group: 'order', label: 'Converted / purchase order received', done: true, at: iso(t.enteredAt || patient.createdAt), text: `PO ${stage.purchaseOrder}` },
    { key: 'verified', group: 'order', label: 'Medicine payment verified', done: pay.pendingCount === 0, waitText: 'Verify the submitted payments below', text: `${pay.approvedCount} verified / ${pay.pendingCount} pending` },
    { key: 'approved', group: 'order', label: 'Patient approved', done: approved, waitText: 'Review patient details and approve the patient below' },
    { key: 'raised', group: 'medicine', label: 'Medicine requested', done: Boolean(request), action: 'raise_request', by: request?.requestedByName, at: iso(request?.requestedAt) },
    { key: 'accepted', group: 'medicine', label: 'Preparation started', done: accepted, waitText: 'Waiting for Medicine Department', by: request?.inProcessByName, at: iso(request?.inProcessAt), text: readyBy ? `Ready by ${shortDay(readyBy)}` : '' },
    { key: 'made', group: 'medicine', label: 'Medicine ready', done: made, waitText: 'Medicine Department is preparing the order', by: request?.madeByName, at: iso(request?.madeAt) },
    { key: 'payment', group: 'handover', label: 'Full payment approved', done: pay.remaining <= 0 && pay.pendingCount === 0, action: pay.pendingCount ? null : 'add_payment', waitText: 'Verify pending payments below', text: `Approved Rs ${pay.amountPaid} / Balance Rs ${pay.remaining}` },
    { key: 'released', group: 'handover', label: 'Released by Medicine Department', done: released, waitText: 'Medicine Department must release this order after full payment', by: t.financialReleasedByName || request?.sentToCourierByName, at: iso(t.financialReleasedAt || request?.sentToCourierAt) },
    { key: 'mode', group: 'contact', label: 'Delivery method confirmed', done: Boolean(mode), action: 'confirm_mode', text: MODE_LABEL[mode] || '' },
    { key: 'plan', group: 'contact', label: mode === 'pickup' ? 'Pickup scheduled' : 'Dispatch scheduled', done: Boolean(mode === 'pickup' ? t.pickupScheduledAt : t.dispatchScheduledAt) || dispatched, action: mode === 'pickup' ? 'schedule_visit' : 'schedule_dispatch', at: iso(mode === 'pickup' ? t.pickupScheduledAt : t.dispatchScheduledAt) },
  ];
  if (SHIPPED_MODES.includes(mode)) steps.push({ key: 'dispatched', group: 'handover', label: 'Dispatched', done: dispatched, action: 'dispatch', by: courier.dispatchedByName, at: iso(courier.dispatchedAt), text: [courier.courierPartner, courier.trackingNumber].filter(Boolean).join(' / ') });
  steps.push(
    { key: 'received', group: 'handover', label: mode === 'pickup' ? 'Collected at clinic' : 'Received by patient', done: delivered, action: 'confirm_received', by: courier.deliveredByName, at: iso(courier.deliveredAt), text: courier.receivedByName },
    { key: 'explanation', group: 'treatment', label: 'Assistant doctor and explanation scheduled', done: Boolean(t.explanationScheduledAt), action: 'start_treatment', by: t.explanationScheduledByName, at: iso(stage.medicineExplainDate) },
    { key: 'explained', group: 'treatment', label: 'Medicine explanation completed', done: Boolean(t.explanationCompletedAt), waitText: 'Assigned Assistant Doctor completes the explanation', by: t.explanationCompletedByName, at: iso(t.explanationCompletedAt) },
    { key: 'start', group: 'treatment', label: 'Treatment started', done: Boolean(t.activatedAt), by: t.activatedByName, at: iso(t.activatedAt) },
  );
  steps.forEach((step, index) => { step.n = index + 1; step.complete = step.done; });
  return steps;
}

function buildTransitCase(patient, stage, now = new Date()) {
  const t = plain(stage.transit);
  const request = pickRequest(stage);
  const courier = plain(request?.courier);
  const pay = paymentSummary(stage);
  const mode = fulfilmentMode(stage, request);
  const calls = (t.calls || []).map((call) => ({ ...plain(call), at: iso(call.at), nextCallAt: iso(call.nextCallAt) }))
    .sort((a, b) => new Date(b.at) - new Date(a.at));
  const steps = buildSteps({ patient, stage, t, request, courier, pay, mode, calls, now });
  const activated = Boolean(t.activatedAt);
  const currentIndex = activated ? steps.length - 1 : steps.findIndex((step) => !step.complete);
  const current = steps[Math.max(currentIndex, 0)];
  steps.forEach((step, index) => {
    step.state = activated || step.complete ? 'done' : index === currentIndex ? 'current' : 'todo';
  });
  const groups = GROUPS.map((group) => {
    const inGroup = steps.filter((step) => step.group === group.key);
    const state = inGroup.every((s) => s.state === 'done') ? 'done' : inGroup.some((s) => s.state === 'current') ? 'current' : 'todo';
    return { ...group, state, doneCount: inGroup.filter((s) => s.state === 'done').length, total: inGroup.length };
  });
  const readyBy = request?.readyByDate || t.expectedReadyDate || null;
  const lastCall = calls[0];
  const today = startOfDay(now);
  const readyDays = readyBy && !['made', 'sent_to_courier'].includes(request?.status) ? Math.round((startOfDay(readyBy) - today) / DAY) : null;

  // Things that need someone today.
  const alerts = [];
  if (!activated) {
    if (readyDays != null && readyDays <= 1) alerts.push({ type: readyDays < 0 ? 'danger' : 'warning', text: readyDays < 0 ? `Medicine ready-by date passed ${-readyDays} day(s) ago` : `Medicine ready-by date is ${readyDays === 0 ? 'today' : 'tomorrow'}` });
    if (lastCall && lastCall.outcome !== 'connected' && lastCall.nextCallAt && new Date(lastCall.nextCallAt) <= now) alerts.push({ type: 'warning', text: 'Call-back is due' });
    if (t.pickupScheduledAt && !['delivered'].includes(courier.status) && startOfDay(t.pickupScheduledAt).getTime() === today.getTime()) alerts.push({ type: 'info', text: 'Patient visit is today' });
    if (t.dispatchScheduledAt && !['dispatched', 'delivered'].includes(courier.status) && startOfDay(t.dispatchScheduledAt) <= today) alerts.push({ type: 'warning', text: 'Scheduled dispatch is due' });
    if (t.explanationScheduledAt && !t.explanationCompletedAt && stage.medicineExplainDate && startOfDay(stage.medicineExplainDate) <= today) alerts.push({ type: 'warning', text: 'Medicine explanation is due' });
    if (t.holdActive) alerts.push({ type: 'danger', text: `On hold: ${t.holdReason}` });
  }

  return {
    key: `${patient._id}-${stage.number}`,
    patientId: String(patient._id),
    patientName: patient.patientName,
    patientCode: patient.patientCode || '',
    patientPhone: patient.number || '',
    guardianName: patient.guardianName || patient.relativeName || '',
    stage: stage.number,
    purchaseOrder: stage.purchaseOrder || '',
    approvalStatus: patient.approvalStatus || 'approved',
    packageName: stage.packageName || '',
    poPaper: stage.poPaper || null,
    expectedReadyDate: iso(t.expectedReadyDate),
    patientDetails: { age: patient.age, category: patient.category, address: patient.address, centerName: patient.centerName, centerId: patient.centerId },
    payment: pay,
    payments: (stage.payments || []).map((p) => ({
      id: String(p._id || ''), amount: num(p.amount), date: iso(p.date), mode: p.paymentMode || 'online',
      status: p.approvalStatus || 'approved', reference: p.utr || p.transactionId || p.receivedBy || '',
      recordedByName: p.recordedByName || '', approvedByName: p.approvedByName || '',
      files: [...(p.screenshotFiles || []), ...(p.screenshotUrl && !(p.screenshotFiles || []).some(f => f.url === p.screenshotUrl) ? [{ url: p.screenshotUrl, fileName: 'Payment proof' }] : [])],
    })).sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0)),
    group: activated ? 'treatment' : current.group,
    step: { n: current.n, key: current.key, label: activated ? 'Treatment started' : current.label, waitText: current.waitText || '' },
    nextAction: activated || current.auto || current.placeholder ? null : (current.action || null),
    // Before the mode is chosen the handover is one placeholder for four real steps.
    totalSteps: steps.length,
    progress: Math.round((steps.filter((s) => s.state === 'done').length / steps.length) * 100),
    steps,
    groups,
    alerts,
    needsAttention: alerts.some((a) => a.type !== 'info') || Boolean(t.holdActive),
    // Sorting helpers for the queue: how urgent, and the next date someone has to act on.
    priority: alerts.some((a) => a.type === 'danger') ? 0 : alerts.some((a) => a.type === 'warning') ? 1 : alerts.length ? 2 : 3,
    dueAt: iso([lastCall && lastCall.outcome !== 'connected' ? lastCall.nextCallAt : null, courier.status !== 'delivered' ? t.pickupScheduledAt : null, readyDays != null ? readyBy : null]
      .filter(Boolean).map((v) => new Date(v)).sort((a, b) => a - b)[0] || null),
    enteredAt: iso(t.enteredAt || stage.poPaper?.savedAt || patient.createdAt || pay.firstPaymentAt),
    removed: t.removedAt ? { at: iso(t.removedAt), by: t.removedByName, reason: t.removedReason } : null,
    onHold: Boolean(t.holdActive),
    hold: t.holdActive ? { reason: t.holdReason, at: iso(t.holdAt), by: t.holdByName } : null,
    activated,
    mode,
    calls,
    medicine: request ? {
      requestId: request.requestId || 'legacy',
      status: request.status,
      medicines: request.medicines || '',
      notes: request.notes || '',
      prescriptionFiles: request.prescriptionFiles || [],
      requestedByName: request.requestedByName || '',
      acceptedByName: request.inProcessByName || '',
      madeByName: request.madeByName || '',
      madeAt: iso(request.madeAt),
      medicineImages: [...(request.medicineImages || []), ...(request.medicineImageUrl && !(request.medicineImages || []).some((f) => f.url === request.medicineImageUrl) ? [{ url: request.medicineImageUrl, fileName: request.medicineImageFileName }] : [])],
      readyByDate: iso(readyBy),
      readyBySetByName: request.readyBySetByName || '',
      reminderOn: iso(reminderDate(readyBy)),
      readyDays,
      packagedByName: request.packagedByName || '',
      chitsWrittenByName: request.chitsWrittenByName || '',
      lastMedicineCheckedByName: request.lastMedicineCheckedByName || '',
      packagingDetailsFilledByName: request.packagingDetailsFilledByName || '',
      packagingDetailsFilledAt: iso(request.packagingDetailsFilledAt),
    } : null,
    courier: request ? {
      status: courier.status || 'pending', deliveryMode: courier.deliveryMode || '',
      receiverName: courier.receiverName || '', receiverPhone: courier.receiverPhone || '', address: courier.address || '',
      courierPartner: courier.courierPartner || '', trackingNumber: courier.trackingNumber || '',
      packageImages: courier.packageImages || [], deliveryProofImages: courier.deliveryProofImages || [],
      receivedByName: courier.receivedByName || '', deliveredAt: iso(courier.deliveredAt), dispatchedAt: iso(courier.dispatchedAt), notes: courier.notes || '',
    } : null,
    visit: { at: iso(t.pickupScheduledAt), note: t.pickupNote || '' },
    deliveryPlan: { at: iso(t.dispatchScheduledAt), courier: t.plannedCourier || '', address: t.plannedAddress || '', note: t.deliveryPlanNote || '' },
    releasedAt: request?.status === 'sent_to_courier' ? iso(request.sentToCourierAt) : null,
    explanation: { at: iso(stage.medicineExplainDate), mode: t.explanationMode, completedAt: iso(t.explanationCompletedAt), completedBy: t.explanationCompletedByName, note: t.explanationNote, ackAt: iso(t.explanationAckAt), ackByName: t.explanationAckByName || '' },
    assignments: { assistantDoctor: refOf(patient.assignedDoctor), postCounselor: refOf(stage.postCounselor), psychologist: refOf(patient.assignedPsychologist) },
    updatedAt: iso(patient.updatedAt),
  };
}

module.exports = { GROUPS, SHIPPED_MODES, MODE_LABEL, isInTransit, buildTransitCase, pickRequest, paymentSummary, fulfilmentMode, reminderDate };
