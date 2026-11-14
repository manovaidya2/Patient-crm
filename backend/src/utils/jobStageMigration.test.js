const { test, afterEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const MedicineJob = require('../models/MedicineJob');
const { STAGES, STAGE_INDEX } = require('./medicineJobFlow');
const { STAGES_VERSION, migrateJobStages } = require('./jobStageMigration');

afterEach(() => mock.restoreAll());
const completed = (key) => ({ key, doneAt: new Date(), fields: {} });

function database(jobs) {
  const updates = new Map();
  mock.method(MedicineJob.collection, 'find', () => ({ project: () => ({ toArray: async () => jobs }) }));
  mock.method(MedicineJob.collection, 'updateOne', async (filter, update) => { updates.set(filter._id, update.$set); });
  return updates;
}

test('old jobs awaiting the doctor return to the assigned PCC final verification', async () => {
  const stages = STAGES.filter((s) => s.key !== 'release').map((s) => completed(s.key));
  const updates = database([{ _id: 'waiting', stagesVersion: 7, status: 'open', currentStage: 11, stages }]);
  await migrateJobStages();
  const result = updates.get('waiting');
  assert.equal(result.stagesVersion, STAGES_VERSION);
  assert.equal(result.currentStage, STAGE_INDEX.final);
  assert.ok(!result.stages.some((s) => s.key === 'final'));
  assert.ok(result.stages.some((s) => s.key === 'pack2'));
});

test('ready and released jobs retain their status and move to the active release index', async () => {
  const updates = database([
    { _id: 'ready', stagesVersion: 7, status: 'ready', currentStage: 12, stages: [completed('doctor')] },
    { _id: 'released', stagesVersion: 7, status: 'released', currentStage: 13, stages: [completed('doctor'), completed('release')] },
  ]);
  await migrateJobStages();
  assert.equal(updates.get('ready').currentStage, STAGE_INDEX.release);
  assert.equal(updates.get('released').currentStage, STAGES.length);
  assert.ok(updates.get('ready').stages.some((s) => s.key === 'doctor'), 'historical verification is retained');
  assert.equal(updates.get('ready').status, undefined, 'migration does not change readiness');
});

test('open jobs follow completed stage keys after QC is disabled and keep active correction holds', async () => {
  const stages = STAGES.slice(0, STAGE_INDEX.pack2).map((s) => completed(s.key));
  const updates = database([{ _id: 'held', stagesVersion: 7, status: 'open', currentStage: 9, stages,
    hold: { active: true, stageKey: 'doctor', reason: 'Doctor HOLD: Seal leaking' } }]);
  await migrateJobStages();
  assert.equal(updates.get('held').currentStage, STAGE_INDEX.pack2);
  assert.equal(updates.get('held').hold.active, true);
  assert.equal(updates.get('held').hold.stageKey, 'final');
  assert.equal(updates.get('held').hold.reason, 'Doctor HOLD: Seal leaking');
});
