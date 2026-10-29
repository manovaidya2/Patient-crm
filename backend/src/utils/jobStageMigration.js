// Keeps older medicine jobs in the right place when the stage list changes. Runs once per job on startup
// (stagesVersion marks the jobs already on the current list).
//  v1 -> v2: the doctor's formulation step (stage 3) was added. A job already past the formulation check counts it as
//            done ("before this step existed") and its stored stage number moves one up.
//  v2 -> v3: "Medicine dose papers" (step 9) now comes before "Doctor verification" (step 10). A job waiting on the papers
//            with the doctor already done goes back to the papers; the doctor verifies again after them.
//  v3 -> v4: the parcel weight (Packing-2) is entered in kg, no longer in grams; saved weights are divided by 1000.
const MedicineJob = require('../models/MedicineJob');
const { STAGES, STAGE_INDEX } = require('./medicineJobFlow');

const STAGES_VERSION = 4;

const migrateJobStages = async () => {
  const old = await MedicineJob.collection.find({ $or: [{ stagesVersion: { $exists: false } }, { stagesVersion: { $lt: STAGES_VERSION } }] })
    .project({ currentStage: 1, stages: 1, stagesVersion: 1 }).toArray();
  let moved = 0;
  for (const job of old) {
    const version = job.stagesVersion || 1;
    let stages = [...(job.stages || [])];
    let current = job.currentStage || 0;
    const events = [];
    if (version < 2 && current > STAGE_INDEX.review) {
      const review = stages.find((s) => s.key === 'review');
      stages.push({ key: 'formula', doneAt: review?.doneAt || new Date(), doneByName: 'Existing job', doneByRole: '', checks: STAGES[STAGE_INDEX.formula].checks.map(() => true), fields: {}, notes: 'Already past the formulation check when the doctor step was added' });
      current += 1;
    }
    if (version < 3) {
      const keys = new Set(stages.map((s) => s.key));
      if (keys.has('doctor') && !keys.has('photos') && current === STAGE_INDEX.doctor) {
        stages = stages.filter((s) => s.key !== 'doctor');
        current = STAGE_INDEX.photos;
        events.push({ at: new Date(), action: 'Doctor verification moved after the dose papers', details: 'The doctor now verifies Pack QC, Packing-1 and the dose papers together, so this job\'s doctor check is asked again after the papers', byName: 'System', byRole: '' });
      }
    }
    let reweighed = false;
    if (version < 4) {
      stages = stages.map((s) => {
        const grams = Number(s.fields?.weight);
        if (s.key !== 'pack2' || !Number.isFinite(grams)) return s;
        reweighed = true;
        return { ...s, fields: { ...s.fields, weight: grams / 1000 } };
      });
    }
    const changed = reweighed || current !== (job.currentStage || 0) || stages.length !== (job.stages || []).length;
    if (changed) moved += 1;
    const update = { $set: { stagesVersion: STAGES_VERSION, ...(changed ? { stages, currentStage: current } : {}) } };
    if (events.length) update.$push = { events: { $each: events } };
    await MedicineJob.collection.updateOne({ _id: job._id }, update);
  }
  return moved;
};

module.exports = { STAGES_VERSION, migrateJobStages };
