const DAY_MS = 24 * 60 * 60 * 1000;
const FOLLOWUP_STATUSES = {
  waiting_for_payment: 'Waiting for payment',
  patient_not_ready: 'Patient not ready',
  waiting_for_collection: 'Waiting for collection',
  ready_to_request: 'Ready to request release',
};

function releaseView(job, now = new Date()) {
  const saved = job.releaseRequest || {};
  const final = (job.stages || []).find((s) => s.key === 'final' && s.doneAt);
  const startedAt = saved.startedAt || final?.doneAt;
  if (!startedAt) return null;
  const deadline = saved.deadlineAt ? new Date(saved.deadlineAt) : new Date(new Date(startedAt).getTime() + 20 * DAY_MS);
  const state = job.status === 'released' ? 'released' : saved.cancelledAt ? 'cancelled' : saved.acceptedAt ? 'accepted' : saved.requestedAt ? 'requested' : 'awaiting_request';
  const iso = (v) => v ? new Date(v).toISOString() : null;
  return {
    state, startedAt: iso(startedAt), deadlineAt: iso(deadline), daysLeft: Math.ceil((deadline - now) / DAY_MS),
    overdue: now >= deadline, needsTransitAction: job.status === 'ready' && state === 'awaiting_request',
    followupStatus: saved.followupStatus || '', followupLabel: FOLLOWUP_STATUSES[saved.followupStatus] || '',
    statusUpdatedAt: iso(saved.statusUpdatedAt), statusUpdatedByName: saved.statusUpdatedByName || '',
    transitPaymentVerifiedAt: iso(saved.transitPaymentVerifiedAt), transitPaymentVerifiedByName: saved.transitPaymentVerifiedByName || '',
    requestedAt: iso(saved.requestedAt), requestedByName: saved.requestedByName || '', requestNote: saved.requestNote || '',
    acceptedAt: iso(saved.acceptedAt), acceptedByName: saved.acceptedByName || '', paymentSnapshot: saved.paymentSnapshot || null,
    cancelledAt: iso(saved.cancelledAt), cancelledByName: saved.cancelledByName || '', cancelReason: saved.cancelReason || '',
    cancellations: ((saved.cancellations || []).length ? saved.cancellations : saved.cancelledAt ? [{ at: saved.cancelledAt, byName: saved.cancelledByName, reason: saved.cancelReason }] : [])
      .map((c) => ({ at: iso(c.at), byName: c.byName || '', reason: c.reason || '' })),
    reopenedAt: iso(saved.reopenedAt), reopenedByName: saved.reopenedByName || '',
    releasedAt: iso((job.stages || []).find((s) => s.key === 'release')?.doneAt),
    extensions: (saved.extensions || []).map((e) => ({ at: iso(e.at), byName: e.byName, days: e.days, previousDeadline: iso(e.previousDeadline), deadlineAt: iso(e.deadlineAt), reason: e.reason })),
  };
}

module.exports = { DAY_MS, FOLLOWUP_STATUSES, releaseView };
