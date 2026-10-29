const { test, afterEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const MedicineJob = require('../models/MedicineJob');
const Patient = require('../models/Patient');
const { STAGES, STAGE_INDEX } = require('./medicineJobFlow');
const { settleOldJobs } = require('./oldRequestJobs');

afterEach(() => mock.restoreAll());

const jobOf = (extra) => {
  const job = new MedicineJob({ patient: new mongoose.Types.ObjectId(), patientName: 'Old', phase: 1, requestId: 'r1', status: 'open', currentStage: 0, ...extra });
  job.save = async () => job;
  return job;
};

test('old jobs go on from where they are: earlier steps with no record are marked done in the old flow', async () => {
  // Opened at "made": only "accept" recorded, now at release.
  const made = jobOf({ status: 'ready', currentStage: STAGE_INDEX.release, stages: [{ key: 'accept', doneAt: new Date('2026-10-15'), doneByName: 'Tanu' }] });
  // In process, past stock but its formulation step was added later.
  const midway = jobOf({ currentStage: STAGE_INDEX.fill, stages: ['accept', 'review', 'stock', 'prepare'].map((key) => ({ key, doneAt: new Date(), doneByName: 'Tanu' })) });
  // Old flow, medicine already delivered: closed.
  const delivered = jobOf({ requestId: 'r2', status: 'ready', currentStage: STAGE_INDEX.release, stages: [{ key: 'accept', doneAt: new Date(), doneByName: 'Tanu' }] });
  mock.method(MedicineJob, 'find', async () => [made, midway, delivered]);
  mock.method(Patient, 'findById', (id) => ({ select: () => ({ lean: async () => ({ stages: [{ number: 1, medicineRequests: [{ requestId: String(id) === String(delivered.patient) ? 'r2' : 'r1', courier: { status: String(id) === String(delivered.patient) ? 'delivered' : 'pending' } }] }] }) }) }));
  const result = await settleOldJobs();
  assert.deepEqual(result, { filled: 3, closed: 1 });
  assert.deepEqual(made.stages.map((s) => s.key).sort(), STAGES.slice(0, STAGE_INDEX.release).map((s) => s.key).sort(), 'all steps before release are there');
  assert.equal(made.currentStage, STAGE_INDEX.release, 'still at release: it goes on from there');
  assert.ok(made.stages.filter((s) => s.key !== 'accept').every((s) => s.snapshot?.oldFlow && s.doneByName === 'Old request'));
  assert.ok(midway.stages.some((s) => s.key === 'formula' && s.snapshot?.oldFlow), 'the missing formulation step is filled');
  assert.equal(midway.currentStage, STAGE_INDEX.fill);
  assert.equal(delivered.status, 'released');
  assert.equal(delivered.stages.length, STAGES.length);
  // Running again changes nothing.
  assert.deepEqual(await settleOldJobs(), { filled: 0, closed: 0 });
});
