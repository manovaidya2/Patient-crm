const { test } = require('node:test');
const assert = require('node:assert/strict');
const { buildPoView } = require('./purchaseOrderFlow');
const { requestWithCompletedRelease } = require('./medicineRelease');
const { buildTransitCase } = require('./transitFlow');

function fixture() {
  const request = { requestId: 'request-1', status: 'made', requestedAt: '2026-11-02T12:20:00Z', madeAt: '2026-11-13T09:36:00Z', courier: {} };
  return {
    po: { _id: 'po-1', patient: 'patient-1', phase: 1, status: 'verified', medicineRequestId: request.requestId, paymentIds: [], amount: 39000, supplyPlan: 'full', supplyPart: 'full' },
    patient: { _id: 'patient-1', approvalStatus: 'approved', stages: [{ number: 1, totalAmount: 39000, medicineRequests: [request], payments: [], transit: { roundRequestId: request.requestId, fulfilmentMode: 'pickup', pickupScheduledAt: '2026-11-19T09:30:00Z' } }] },
    job: { _id: 'job-1', requestId: request.requestId, status: 'ready', currentStage: 10, stages: [{ key: 'release', doneAt: '2026-11-02T12:20:00Z', doneByName: 'Old request' }] },
  };
}

test('a saved fulfilment release completes the PO release and removes the false handover blocker even with stale job/request counters', () => {
  const { po, patient, job } = fixture();
  const before = JSON.stringify(patient);
  const view = buildPoView(po, patient, { job });
  const release = view.steps.find((step) => step.key === 'released');
  assert.equal(release.state, 'done');
  assert.equal(release.at, '2026-11-02T12:20:00.000Z');
  assert.equal(release.by, 'Old request');
  const handover = view.steps.find((step) => step.key === 'handover');
  assert.equal(handover.waitsOnMedicine, false);
  assert.doesNotMatch(handover.waitText, /Waiting for Medicine Department/);
  assert.equal(handover.done, false, 'release does not falsely mark handover done');
  assert.equal(view.medicine.status, 'sent_to_courier');
  assert.equal(view.medicine.releasedAt, release.at);
  assert.equal(JSON.stringify(patient), before, 'view reconciliation does not rewrite clinical records');
});

test('unreleased, reverted, cancelled and different-request jobs must not mark this PO as released', () => {
  for (const jobOverride of [{ stages: [], status: 'ready' }, { status: 'cancelled' }, { requestId: 'other-request' }]) {
    const { po, patient, job } = fixture();
    Object.assign(job, jobOverride);
    assert.equal(buildPoView(po, patient, { job }).steps.find((step) => step.key === 'released').done, false);
  }
  const { po, patient, job } = fixture();
  patient.stages[0].medicineRequests[0].status = 'cancelled';
  assert.equal(buildPoView(po, patient, { job }).medicine.status, 'cancelled');
});

test('release reconciliation is idempotent and does not invent timestamps for a status-only legacy release', () => {
  const request = { requestId: 'request-1', status: 'made' };
  const job = { requestId: 'request-1', status: 'released', stages: [] };
  const resolved = requestWithCompletedRelease(request, job);
  assert.equal(resolved.status, 'sent_to_courier');
  assert.equal(resolved.sentToCourierAt, null);
  assert.equal(resolved.sentToCourierByName, '');
  assert.deepEqual(requestWithCompletedRelease(resolved, job), resolved);
});

test('handover details use the same completed release as the PO and keep pickup confirmation pending', () => {
  const { patient, job } = fixture();
  const stage = patient.stages[0];
  Object.assign(stage.transit, { callsDoneAt: '2026-11-02', assignedAt: '2026-11-02', poPaperSignedAt: '2026-11-02' });
  stage.medicineExplainDate = '2026-11-19';
  const before = JSON.stringify(patient);
  const payment = { totalAmount: 1000, amountPaid: 1000, remaining: 0, pendingCount: 0, approvedCount: 1 };
  const view = buildTransitCase(patient, stage, new Date('2026-11-16'), { job, payment });
  assert.equal(view.medicine.status, 'sent_to_courier');
  assert.equal(view.steps.find((s) => s.key === 'released').state, 'done');
  assert.equal(view.steps.find((s) => s.key === 'handover').state, 'current');
  assert.equal(view.nextAction, 'confirm_received');
  assert.equal(view.courier.status === 'delivered', false);
  assert.equal(view.poPaperSigned.done, true);
  assert.equal(JSON.stringify(patient), before, 'reading the confirmation form must not rewrite request or handover records');
  for (const override of [{ stages: [], status: 'ready' }, { status: 'cancelled' }, { requestId: 'other-request' }]) {
    const blocked = buildTransitCase(patient, stage, new Date('2026-11-16'), { payment, job: { ...job, ...override } });
    assert.equal(blocked.medicine.status, 'made');
    assert.notEqual(blocked.nextAction, 'confirm_received');
  }
});
