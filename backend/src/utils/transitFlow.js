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
const startOfDay = (value) => { const d = new Date(value); return new Date(d.getFullYear(), d.getMonth(), d.getDate()); };

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
const isInTransit = (stage) => Boolean(String(stage?.purchaseOrder || '').trim()) && (stage.payments || []).length > 0;

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

function buildSteps({ stage, t, request, courier, pay, mode, calls, now }) {
  const made = Boolean(request && ['made', 'sent_to_courier'].includes(request.status));
  const accepted = Boolean(request && ['in_process', 'made', 'sent_to_courier'].includes(request.status));
  const dispatched = ['dispatched', 'delivered'].includes(courier.status);
  const delivered = courier.status === 'delivered';
  const readyBy = request?.readyByDate || t.expectedReadyDate || null;
  const remindOn = reminderDate(readyBy);
  const connected = calls.filter((c) => c.outcome === 'connected');
  const lastCall = calls[0];
  const paid = pay.remaining <= 0;
  // Made, photo, packing and chits are filled by the medicine department on its own page; this step only reads them.
  const packing = request?.packagedByName ? `Packing ${request.packagedByName}, chits ${request.chitsWrittenByName || '-'}, checked ${request.lastMedicineCheckedByName || '-'}` : '';
  const madeStep = {
    by: request?.madeByName, at: iso(request?.madeAt),
    text: [request?.madeByName ? `Made by ${request.madeByName}` : '', packing].filter(Boolean).join(' | '),
    waitText: 'Waiting for the medicine department to mark the medicine made (with photo) and fill packing / chits details. It updates here automatically.',
  };
  // Once enough money is recorded the step only waits for accounts to verify it, instead of asking again.
  const awaitingVerification = !paid && pay.pendingAmount >= pay.remaining;
  const paymentDetail = paid
    ? { text: `Fully paid (Rs ${pay.amountPaid})` }
    : {
      text: `Balance Rs ${pay.remaining}${pay.pendingCount ? ` - Rs ${pay.pendingAmount} waiting for accounts` : ''}`,
      ...(awaitingVerification ? { action: null, waitText: `Rs ${pay.pendingAmount} recorded. Waiting for accounts to verify it; the step completes automatically after verification.` } : {}),
    };

  // `evidence` = really happened on another screen; lets earlier steps count as done.
  const steps = [
    { key: 'po', group: 'order', label: 'PO & payment received', done: true, at: iso(pay.firstPaymentAt), text: `PO ${stage.purchaseOrder}` },
    { key: 'verified', group: 'order', label: 'Payment verified by accounts', done: pay.approvedCount > 0, waitText: 'Waiting for accounts to verify the payment', text: pay.approvedCount ? `${pay.approvedCount} payment(s) verified` : (pay.pendingCount ? `${pay.pendingCount} payment(s) waiting` : '') },
    { key: 'raised', group: 'medicine', label: 'Medicine request raised', done: Boolean(request), evidence: Boolean(request), action: 'raise_request', by: request?.requestedByName, at: iso(request?.requestedAt), text: request?.medicines },
    { key: 'accepted', group: 'medicine', label: 'Accepted - ready-by date set', done: accepted || made, evidence: accepted, action: 'accept_request', by: request?.inProcessByName, at: iso(request?.inProcessAt), text: readyBy ? `Medicine ready by ${shortDay(readyBy)}` : '' },
    {
      key: 'reminder', group: 'medicine', label: 'Ready-date reminder', auto: true,
      done: made || Boolean(remindOn && now >= remindOn), evidence: made,
      waitText: remindOn ? `Automatic reminder on ${shortDay(remindOn)} to post counselor, reception and medicine department. Then call the patient.` : 'Set the ready-by date first',
      at: iso(remindOn), text: remindOn ? (now >= remindOn ? 'Reminder sent automatically' : 'Scheduled automatically') : '',
    },
    { key: 'call', group: 'contact', label: 'Call the patient', done: connected.length > 0, action: 'log_call', by: lastCall?.byName, at: lastCall?.at, text: calls.length ? `${calls.length} call(s), ${connected.length} connected` : '' },
    { key: 'mode', group: 'contact', label: 'Delivery mode confirmed', done: Boolean(mode), action: 'confirm_mode', by: t.fulfilmentSetByName, at: iso(t.fulfilmentSetAt), text: MODE_LABEL[mode] || '' },
  ];

  if (SHIPPED_MODES.includes(mode)) {
    steps.push(
      { key: 'payment', group: 'handover', label: 'Full payment confirmed', done: paid, carry: false, action: 'add_payment', ...paymentDetail, awaitingVerification },
      { key: 'made', group: 'handover', label: 'Medicine ready (medicine department)', done: made, evidence: made, ...madeStep },
      { key: 'dispatched', group: 'handover', label: `Sent by ${MODE_LABEL[mode].toLowerCase()}`, done: dispatched, evidence: dispatched, action: 'dispatch', by: courier.dispatchedByName, at: iso(courier.dispatchedAt), text: [courier.courierPartner, courier.trackingNumber].filter(Boolean).join(' / ') },
      { key: 'received', group: 'handover', label: 'Received by patient', done: delivered, evidence: delivered, action: 'confirm_received', by: courier.deliveredByName, at: iso(courier.deliveredAt), text: courier.receivedByName ? `Received by ${courier.receivedByName}` : '' },
    );
  } else if (mode === 'pickup') {
    steps.push(
      { key: 'visit', group: 'handover', label: 'Visit scheduled', done: Boolean(t.pickupScheduledAt) || delivered, action: 'schedule_visit', by: t.pickupScheduledByName, at: iso(t.pickupScheduledAt), text: t.pickupNote || '' },
      { key: 'made', group: 'handover', label: 'Medicine ready (medicine department)', done: made, evidence: made, ...madeStep },
      { key: 'received', group: 'handover', label: 'Collected at clinic', done: delivered, evidence: delivered, action: 'confirm_received', by: courier.deliveredByName, at: iso(courier.deliveredAt), text: courier.receivedByName ? `Collected by ${courier.receivedByName}` : '' },
      { key: 'payment', group: 'handover', label: 'Full payment received', done: paid, carry: false, action: 'add_payment', ...paymentDetail, awaitingVerification },
    );
  } else {
    steps.push({ key: 'handover', group: 'handover', label: 'Handover (depends on delivery mode)', done: false, placeholder: true });
  }
  steps.push({
    key: 'start', group: 'treatment', label: 'Explanation scheduled & doctor assigned - treatment started', done: Boolean(t.activatedAt), carry: false, action: 'start_treatment',
    by: t.activatedByName, at: iso(t.activatedAt),
  });

  // Medicine facts (raised / accepted / made) only prove the order and medicine steps; a dispatch or
  // delivery recorded on the courier pages also proves the patient was contacted.
  const provesStep = (proof, step) => proof.evidence && (step.group === 'order' || step.group === 'medicine' || ['dispatched', 'received'].includes(proof.key));
  steps.forEach((step, index) => {
    step.n = index + 1;
    step.complete = step.done || (step.carry !== false && !step.placeholder && steps.slice(index + 1).some((later) => provesStep(later, step)));
  });
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
  const steps = buildSteps({ stage, t, request, courier, pay, mode, calls, now });
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
    payment: pay,
    payments: (stage.payments || []).map((p) => ({
      id: String(p._id || ''), amount: num(p.amount), date: iso(p.date), mode: p.paymentMode || 'online',
      status: p.approvalStatus || 'approved', reference: p.utr || p.transactionId || p.receivedBy || '',
      recordedByName: p.recordedByName || '', approvedByName: p.approvedByName || '',
    })).sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0)),
    group: activated ? 'treatment' : current.group,
    step: { n: current.n, key: current.key, label: activated ? 'Treatment started' : current.label, waitText: current.waitText || '' },
    nextAction: activated || current.auto || current.placeholder ? null : (current.action || null),
    // Before the mode is chosen the handover is one placeholder for four real steps.
    totalSteps: steps.length + (mode ? 0 : 3),
    progress: Math.round((steps.filter((s) => s.state === 'done').length / steps.length) * 100),
    steps,
    groups,
    alerts,
    needsAttention: alerts.some((a) => a.type !== 'info') || Boolean(t.holdActive),
    // Sorting helpers for the queue: how urgent, and the next date someone has to act on.
    priority: alerts.some((a) => a.type === 'danger') ? 0 : alerts.some((a) => a.type === 'warning') ? 1 : alerts.length ? 2 : 3,
    dueAt: iso([lastCall && lastCall.outcome !== 'connected' ? lastCall.nextCallAt : null, courier.status !== 'delivered' ? t.pickupScheduledAt : null, readyDays != null ? readyBy : null]
      .filter(Boolean).map((v) => new Date(v)).sort((a, b) => a - b)[0] || null),
    enteredAt: iso(pay.firstPaymentAt),
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
    explanation: { at: iso(stage.medicineExplainDate), ackAt: iso(t.explanationAckAt), ackByName: t.explanationAckByName || '' },
    assignments: { assistantDoctor: refOf(patient.assignedDoctor), postCounselor: refOf(stage.postCounselor), psychologist: refOf(patient.assignedPsychologist) },
    updatedAt: iso(patient.updatedAt),
  };
}

module.exports = { GROUPS, SHIPPED_MODES, MODE_LABEL, isInTransit, buildTransitCase, pickRequest, paymentSummary, fulfilmentMode, reminderDate };
