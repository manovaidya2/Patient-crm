// A child's age changes between phases, so each phase keeps the age the patient had when it was bought.
// patient.age stays the latest age. A phase without its own age falls back to patient.age.
const { phaseInUse } = require('./existingPatient');

const cleanAge = (value) => String(value ?? '').trim().slice(0, 30);

const phaseAge = (patient, phaseNumber) => {
  const stage = (patient?.stages || []).find((s) => s.number === Number(phaseNumber));
  return cleanAge(stage?.age) || cleanAge(patient?.age);
};

// Call before patient.age changes: phases already bought keep the age they were shown with until now.
const freezePhaseAges = (patient) => {
  const current = cleanAge(patient.age);
  if (!current) return;
  (patient.stages || []).forEach((stage) => {
    if (phaseInUse(stage) && !cleanAge(stage.age)) stage.age = current;
  });
};

// Sets the age of a phase; the patient's own age follows when this is their latest phase with an age.
// Returns true when something changed.
const setPhaseAge = (patient, stage, value) => {
  const age = cleanAge(value);
  if (!age || age === cleanAge(stage.age)) return false;
  freezePhaseAges(patient);
  stage.age = age;
  const latest = Math.max(0, ...(patient.stages || []).filter((s) => cleanAge(s.age)).map((s) => s.number));
  if (stage.number >= latest) patient.age = age;
  return true;
};

// One-time fill for patients from before phases had their own age: every phase in use without an age gets the
// patient's age. Only empty phase ages are filled, so running it again changes nothing.
const notEmpty = (path) => ({ $gt: [{ $strLenCP: { $trim: { input: { $toString: { $ifNull: [path, ''] } } } } }, 0] });
const backfillPhaseAges = async (PatientModel) => {
  const Patient = PatientModel || require('../models/Patient');
  const inUse = {
    $or: [
      notEmpty('$$s.purchaseOrder'), notEmpty('$$s.packageName'),
      { $gt: [{ $ifNull: ['$$s.totalAmount', 0] }, 0] },
      { $gt: [{ $size: { $ifNull: ['$$s.payments', []] } }, 0] },
      { $ne: [{ $ifNull: ['$$s.poPaper', null] }, null] },
    ],
  };
  const result = await Patient.collection.updateMany(
    { age: { $nin: [null, ''] }, stages: { $elemMatch: { age: { $in: [null, ''] } } } },
    [{
      $set: {
        stages: {
          $map: {
            input: '$stages',
            as: 's',
            in: { $cond: [{ $and: [{ $not: [notEmpty('$$s.age')] }, inUse] }, { $mergeObjects: ['$$s', { age: { $trim: { input: { $toString: '$age' } } } }] }, '$$s'] },
          },
        },
      },
    }],
  );
  return result.modifiedCount || 0;
};

module.exports = { cleanAge, phaseAge, freezePhaseAges, setPhaseAge, backfillPhaseAges };
