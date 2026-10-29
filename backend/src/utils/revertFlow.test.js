const { test } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const Patient = require('../models/Patient');
const PurchaseOrder = require('../models/PurchaseOrder');
const MedicineJob = require('../models/MedicineJob');
const { buildPoView } = require('./purchaseOrderFlow');
const { STAGES, STAGE_INDEX } = require('./medicineJobFlow');
const { formulationFor, chitsFor, stockNeeds } = require('../constants/formulationMaster');
const { revertJobTo, revertPoFrom } = require('./revertFlow');

const user = { name: 'Super Admin', role: 'admin' };
const ago = (minutes) => new Date(Date.now() - minutes * 60000);
const explainedAt = ago(10);

// A phase that went all the way: PO verified, request made and released, collected at the clinic, PCC assigned,
// explanation done and treatment started - with the job's twelve stages and stock drawn at preparation.
function finishedCase() {
  const patient = new Patient({ patientName: 'Aarav', patientCode: 'A-1', guardianName: 'P', category: 'autism_adhd', number: '1', age: '7', approvalStatus: 'approved' });
  const stage = patient.stages[0];
  Object.assign(stage, { purchaseOrder: 'PO-4821', totalAmount: 42000, status: 'in_progress', date: explainedAt, medicineExplainDate: ago(20) });
  stage.payments.push({ amount: 10000, approvalStatus: 'approved', approvedAt: ago(200), approvedByName: 'Transit' });
  stage.payments.push({ amount: 32000, approvalStatus: 'approved', approvedAt: ago(60), approvedByName: 'Transit' });
  stage.medicineRequests.push({
    requestId: 'r1', status: 'sent_to_courier', medicines: 'Medhya ghrit', requestedAt: ago(180), requestedByName: 'Transit', inProcessAt: ago(170), inProcessByName: 'Meena',
    madeAt: ago(90), madeByName: 'Meena', sentToCourierAt: ago(50), sentToCourierByName: 'Meena', poNumber: 'PO-4821', supplyPlan: '1+5', supplyPart: 'first', ageBand: '4-12',
    courier: { status: 'delivered', deliveryMode: 'self', receivedByName: 'Parent', deliveredAt: ago(40), deliveredByName: 'Transit' },
  });
  Object.assign(stage.transit, {
    enteredAt: ago(200), fulfilmentMode: 'pickup', fulfilmentSetAt: ago(100), fulfilmentSetByName: 'Transit', pickupScheduledAt: ago(45), explanationScheduledAt: ago(100), explanationScheduledByName: 'Transit', explanationMode: 'clinic',
    financialReleasedAt: ago(50), financialReleasedByName: 'Meena', assignedAt: ago(35), assignedByName: 'Transit', explanationDoctor: new mongoose.Types.ObjectId(),
    explanationCompletedAt: explainedAt, explanationCompletedByName: 'Dr Asha', explanationNote: 'Explained', activatedAt: explainedAt, activatedByName: 'Dr Asha',
  });
  const po = new PurchaseOrder({ poNumber: 'PO-4821', generated: true, patient: patient._id, phase: 1, status: 'verified', detailsVerifiedAt: ago(190), detailsVerifiedByName: 'Transit', paymentVerifiedAt: ago(185), paymentVerifiedByName: 'Transit', verifiedAt: ago(185), verifiedByName: 'Transit', paymentIds: [stage.payments[0]._id], medicineRequestId: 'r1', supplyPlan: '1+5', supplyPart: 'first', ageBand: '4-12' });
  const f = formulationFor({ ageBand: '4-12', plan: '1+5', part: 'first' });
  const job = new MedicineJob({
    patient: patient._id, patientName: 'Aarav', patientCode: 'A-1', phase: 1, requestId: 'r1', poNumber: 'PO-4821', supplyPlan: '1+5', supplyPart: 'first', ageBand: '4-12', status: 'released', currentStage: STAGES.length,
    stages: STAGES.map((s, i) => ({ key: s.key, doneAt: ago(160 - i * 5), doneByName: i === STAGE_INDEX.doctor ? 'Dr Garg' : 'Meena', doneByRole: 'medicine_department', checks: s.checks.map(() => true), fields: {} })),
    formulation: f, chits: chitsFor(f, 'Aarav').map((c) => ({ ...c, confirmed: true, confirmedByName: 'Meena', confirmedAt: ago(120) })),
    consumption: stockNeeds(f).map((n) => ({ code: n.code, name: n.name, unit: n.unit, planned: n.qty, actual: n.qty, txId: new mongoose.Types.ObjectId() })),
    photos: { overview: [{ url: '/a.png', fileName: 'a.png' }], papers: [] },
  });
  return { patient, stage, request: stage.medicineRequests[0], po, job };
}
const stepsOf = ({ po, patient, job }) => buildPoView(po, patient.toObject(), { job: job.toObject() }).steps;
const doneKeys = (c) => stepsOf(c).filter((s) => s.done).map((s) => s.key);

test('the finished case has every step done', () => {
  const c = finishedCase();
  assert.deepEqual(doneKeys(c), ['created', 'details', 'payment', 'requested', 'accepted', 'ready', 'released', 'scheduled', 'pcc', 'fullpay', 'handover', 'explained', 'started']);
});

test('reverting "Medicine ready" undoes everything after it, keeps preparation, and records what was cleared', async () => {
  const c = finishedCase();
  const returned = [];
  const ctx = { ...c, steps: stepsOf(c), returnStock: async (line) => returned.push(line.code), reason: 'Wrong parcel', user, now: new Date() };
  const { reverted, snapshot } = await revertPoFrom('ready', ctx);
  assert.deepEqual(reverted, ['started', 'pcc', 'handover', 'released', 'fullpay', 'scheduled', 'ready']);
  assert.equal(c.request.status, 'in_process');
  assert.equal(c.request.courier.status, 'pending');
  assert.equal(c.stage.transit.activatedAt, null);
  assert.equal(c.stage.status, 'not_started', 'treatment start written by the explanation is undone');
  assert.equal(c.stage.transit.explanationDoctor, null);
  assert.equal(c.stage.transit.fulfilmentMode, '');
  assert.equal(c.stage.medicineExplainDate, null);
  assert.equal(c.stage.payments[1].approvalStatus, 'pending', 'the balance payment goes back to pending');
  assert.equal(c.stage.payments[0].approvalStatus, 'approved', "the PO's own verified payment stays");
  assert.equal(c.job.status, 'open');
  assert.equal(c.job.currentStage, STAGE_INDEX.final);
  assert.equal(c.job.stages.length, STAGE_INDEX.final);
  assert.equal(c.job.consumption[0].txId !== null, true, 'preparation is before "ready": stock stays drawn');
  assert.deepEqual(returned, []);
  assert.equal(snapshot.started.transit.explanationNote, 'Explained');
  assert.deepEqual(snapshot.released.stages.map((s) => s.key), ['release'], 'the release record is kept in the snapshot');
  assert.deepEqual(snapshot.ready.stages.map((s) => s.key), ['final'], 'the final-check record is kept in the snapshot');
  assert.equal(snapshot.fullpay.payments.length, 1);
  assert.deepEqual(doneKeys(c), ['created', 'details', 'payment', 'requested', 'accepted']);
  // The final check is open again on the Medicine Dept track, for In Transit to confirm.
  assert.equal(stepsOf(c).find((s) => s.key === 'ready').state, 'current');
  assert.match(stepsOf(c).find((s) => s.key === 'ready').waitText, /In Transit confirms/);
});

test('reverting "PO details verified" takes the whole case back: request cancelled, job cancelled, stock returned, payments pending', async () => {
  const c = finishedCase();
  const returned = [];
  const ctx = { ...c, steps: stepsOf(c), returnStock: async (line) => returned.push(line.code), reason: 'Wrong patient', user, now: new Date() };
  const { reverted } = await revertPoFrom('details', ctx);
  assert.equal(reverted.at(-1), 'details');
  assert.equal(c.po.status, 'pending');
  assert.equal(c.po.detailsVerifiedAt, null);
  assert.equal(c.po.medicineRequestId, '');
  assert.equal(c.request.status, 'cancelled');
  assert.match(c.request.cancelReason, /Reverted by admin: Wrong patient/);
  assert.equal(c.job.status, 'cancelled');
  assert.equal(c.job.stages.length, 0);
  assert.ok(returned.includes('MEDHYA-GHRIT') && returned.length === c.job.consumption.length, 'every drawn line is returned to stock');
  assert.ok(c.job.consumption.every((l) => l.txId === null && l.actual === null));
  assert.ok(c.job.chits.every((ch) => !ch.confirmed));
  assert.equal(c.job.photos.overview.length, 0);
  assert.ok(c.stage.payments.every((p) => p.approvalStatus === 'pending'));
  assert.deepEqual(doneKeys(c), ['created']);
});

test('guards: not-done steps, the PO itself, and job stages after handover', async () => {
  const c = finishedCase();
  const ctx = { ...c, steps: stepsOf(c), returnStock: async () => {}, reason: 'x', user, now: new Date() };
  await assert.rejects(revertPoFrom('created', ctx), /cannot be reverted/);
  await assert.rejects(revertPoFrom('nope', ctx), /cannot be reverted/);
  const fresh = finishedCase();
  fresh.request.status = 'requested'; fresh.request.madeAt = null; fresh.request.sentToCourierAt = null; fresh.request.inProcessAt = null; fresh.job.stages = []; fresh.job.status = 'open'; fresh.job.currentStage = 0;
  await assert.rejects(revertPoFrom('ready', { ...fresh, steps: stepsOf(fresh), returnStock: async () => {}, reason: 'x', user, now: new Date() }), /not done yet/);
  await assert.rejects(revertJobTo(fresh.job, STAGE_INDEX.prepare, {}), /not done yet/);
});

test('a job stage revert returns stock and resets chits; the request status follows', async () => {
  const c = finishedCase();
  c.request.status = 'made'; c.request.sentToCourierAt = null; c.request.courier.status = 'pending';
  c.job.status = 'ready'; c.job.stages = c.job.stages.filter((s) => s.key !== 'release'); c.job.currentStage = STAGE_INDEX.release;
  const returned = [];
  const snapshot = await revertJobTo(c.job, STAGE_INDEX.prepare, { request: c.request, phaseEntry: c.stage, returnStock: async (line) => returned.push(line.code) });
  assert.equal(c.job.currentStage, STAGE_INDEX.prepare);
  assert.equal(c.job.status, 'open');
  assert.equal(c.request.status, 'in_process');
  assert.equal(c.request.madeAt, null);
  assert.equal(returned.length, c.job.consumption.length);
  assert.ok(c.job.chits.every((ch) => !ch.confirmed));
  assert.equal(snapshot.stages.map((s) => s.key)[0], 'prepare');
  assert.equal(snapshot.consumption.length, c.job.consumption.length);
  assert.equal(snapshot.request.status, 'made');
});
