// Jobs opened before the doctor's formulation step (stage 3) was added keep their place: their stored stage number
// moves one up past the new step, which is recorded as done ("before this step existed") so nothing waits on it.
// Runs once per job (stagesVersion marks the jobs already on the current stage list).
const MedicineJob = require('../models/MedicineJob');
const { STAGES, STAGE_INDEX } = require('./medicineJobFlow');

const STAGES_VERSION = 2;

const migrateJobStages = async () => {
  const old = await MedicineJob.collection.find({ stagesVersion: { $exists: false } }).project({ currentStage: 1, stages: 1 }).toArray();
  let moved = 0;
  for (const job of old) {
    const update = { $set: { stagesVersion: STAGES_VERSION } };
    // Past the formulation check already: the new step counts as done and the job keeps its stage.
    if ((job.currentStage || 0) > STAGE_INDEX.review) {
      const review = (job.stages || []).find((s) => s.key === 'review');
      update.$inc = { currentStage: 1 };
      update.$push = { stages: { key: 'formula', doneAt: review?.doneAt || new Date(), doneByName: 'Existing job', doneByRole: '', checks: STAGES[STAGE_INDEX.formula].checks.map(() => true), fields: {}, notes: 'Already past the formulation check when the doctor step was added' } };
      moved += 1;
    }
    await MedicineJob.collection.updateOne({ _id: job._id }, update);
  }
  return moved;
};

module.exports = { STAGES_VERSION, migrateJobStages };
