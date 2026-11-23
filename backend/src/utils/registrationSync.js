// The Admin corrects a registration after the Post Counselor saved the record (receptionFlowController.saveRegistration):
// what the registration put elsewhere follows the correction -
//   - the PO paper of post counselling (guardian name / mobile),
//   - the appointment's and the sales sheet's patient name and father / mother numbers,
//   - the patient made from it (name, category, numbers, guardian, profile, centre; the age of this visit's phase), and
//     the patient's name on their purchase orders, medicine fulfilment jobs, Records Room ... (utils/patientNameCopies),
//   - the Package Not Bought record made from it.
// Each place changes only where it still has what the old registration gave it: a value changed there since is that
// place's own and is kept. Issued bills (invoices, consultation receipts) are not changed.
const mongoose = require('mongoose');
const { PROFILE_KEYS } = require('./patientProfile');
const { CATEGORY_LABEL, SALES_IDS } = require('./receptionFlow');
const { setPhaseAge } = require('./phaseAge');
const { syncPatientNameCopies } = require('./patientNameCopies');

const s = (value) => String(value ?? '').trim();
const getPath = (obj, key) => key.split('.').reduce((value, part) => (value == null ? undefined : value.get ? value.get(part) : value[part]), obj);

// What a registration gives each place - the same rules as when the patient / Package Not Bought record was made.
const patientValuesOf = (f = {}) => ({
  patientName: f.patientName, category: f.category, number: f.fatherNumber || f.whatsappNumber || f.motherNumber,
  guardianName: f.fatherName || f.motherName || f.primaryCaregiver, alternateNumber: f.motherNumber, relativeName: f.relativeName,
  patientHistoryBy: f.patientHistoryBy, centerName: f.centerName, centerId: f.centerId,
  ...Object.fromEntries(PROFILE_KEYS.map((key) => [key, f[key]])),
});
const notBoughtValuesOf = (f = {}) => ({
  patientName: f.patientName, parentName: f.fatherName || f.motherName || f.primaryCaregiver, fatherNumber: f.fatherNumber || f.whatsappNumber,
  motherNumber: f.motherNumber, age: f.age, program: CATEGORY_LABEL[f.category] || '', category: f.category,
  ...Object.fromEntries(PROFILE_KEYS.map((key) => [`profile.${key}`, f[key]])),
});
const purchaseValuesOf = (f = {}) => ({ guardianName: f.fatherName || f.motherName, guardianMobile: f.fatherNumber || f.motherNumber });
const salesValuesOf = (f = {}) => ({ [SALES_IDS.patientName]: f.patientName, [SALES_IDS.fatherNumber]: f.fatherNumber, [SALES_IDS.motherNumber]: f.motherNumber });
// Never emptied by a correction (the record needs them).
const PATIENT_REQUIRED = ['patientName', 'category', 'number', 'guardianName'];

// The changes for one place: { key: new value } for every value the registration changed that the place still has
// as the old registration gave it. read(key) gives the place's current value.
const followChanges = (read, before, after, { required = [] } = {}) => {
  const set = {};
  for (const [key, raw] of Object.entries(after)) {
    const next = s(raw);
    const prev = s(before[key]);
    if (next === prev) continue;
    if (!next && required.includes(key)) continue;
    if (s(read(key)) === prev) set[key] = next;
  }
  return set;
};
const prefixed = (prefix, set) => Object.fromEntries(Object.entries(set).map(([key, value]) => [`${prefix}${key}`, value]));

// The patient made from this visit: the fields, the age of this visit's phase, and the name on their other records.
const syncPatient = async ({ patientId, phaseNumber, before, after, user, models }) => {
  const patient = await models.Patient.findById(patientId);
  if (!patient) return [];
  const done = [];
  const set = followChanges((key) => patient.get(key), patientValuesOf(before), patientValuesOf(after), { required: PATIENT_REQUIRED });
  for (const [key, value] of Object.entries(set)) patient.set(key, value);
  const changed = Object.keys(set);
  // The age told at this visit is the age of its phase (and the patient's latest age when it is their latest phase).
  const stage = (patient.stages || []).find((st) => st.number === Number(phaseNumber));
  if (stage && s(after.age) && s(after.age) !== s(before.age) && s(stage.age || patient.age) === s(before.age) && setPhaseAge(patient, stage, after.age)) changed.push('age');
  if (changed.length) {
    patient.activityLog.push({ action: 'Registration corrected by Admin', details: `Changed from the registration: ${changed.join(', ')}`, actorName: user.name, actorRole: user.role || '' });
    await patient.save();
    done.push(`Patient record (${changed.join(', ')})`);
  }
  // The patient now has the registration's name (changed here, or already on the patient page): their purchase
  // orders, medicine fulfilment jobs, Records Room ... carry it too - also fixing ones left with an older name.
  if (s(patient.patientName) === s(after.patientName)) done.push(...await syncPatientNameCopies(patient, models));
  return done;
};

// entry: the visit (as loaded before the correction); before / after: the registration fields.
// Returns { updated: [what changed], failed: [what could not be changed] } - the registration itself is already saved.
const syncRegistration = async ({ entry, before, after, user, models = {} }) => {
  const m = {
    ...models,
    Management: models.Management || require('../models/AppointmentManagementEntry'),
    SalesAppointment: models.SalesAppointment || require('../models/SalesAppointment'),
    Patient: models.Patient || require('../models/Patient'),
    PurchaseOrder: models.PurchaseOrder || require('../models/PurchaseOrder'),
    MedicineJob: models.MedicineJob || require('../models/MedicineJob'),
    RecordRoom: models.RecordRoom || require('../models/RecordRoom'),
    PackageNotBought: models.PackageNotBought || require('../models/PackageNotBoughtPatient'),
  };
  const updated = [];
  const failed = [];
  const step = async (label, fn) => { try { const done = await fn(); if (Array.isArray(done)) updated.push(...done); else if (done) updated.push(label); } catch (error) { failed.push(`${label}: ${error.message}`); } };
  const pc = entry.postCounseling || {};
  const outcome = pc.outcome || {};

  // The PO paper (post counselling).
  const paper = pc.purchase?.values;
  if (paper) {
    await step('PO paper', async () => {
      const set = followChanges((key) => getPath(paper, key), purchaseValuesOf(before), purchaseValuesOf(after));
      if (!Object.keys(set).length) return false;
      await m.Management.updateOne({ _id: entry._id }, { $set: prefixed('postCounseling.purchase.values.', set) });
      return true;
    });
  }
  // The appointment's sales details, and the sales sheet row it came from.
  await step('Appointment details', async () => {
    const set = followChanges((key) => getPath(entry.salesValues, key), salesValuesOf(before), salesValuesOf(after));
    if (!Object.keys(set).length) return false;
    await m.Management.updateOne({ _id: entry._id }, { $set: prefixed('salesValues.', set) });
    return true;
  });
  if (entry.sourceAppointment && mongoose.isValidObjectId(String(entry.sourceAppointment?._id || entry.sourceAppointment))) {
    await step('Sales sheet', async () => {
      const row = await m.SalesAppointment.findById(entry.sourceAppointment?._id || entry.sourceAppointment).select('values').lean();
      if (!row) return false;
      const set = followChanges((key) => getPath(row.values, key), salesValuesOf(before), salesValuesOf(after));
      if (!Object.keys(set).length) return false;
      await m.SalesAppointment.updateOne({ _id: row._id }, { $set: prefixed('values.', set) });
      return true;
    });
  }
  // The Package Not Bought record made from this visit (and the patient it was converted into later).
  let patientId = outcome.kind === 'converted' ? outcome.patient : null;
  if (outcome.kind === 'not_purchased' && outcome.packageNotBought) {
    await step('Package Not Bought record', async () => {
      const row = await m.PackageNotBought.findById(outcome.packageNotBought).lean();
      if (!row) return false;
      if (row.convertedPatient) patientId = row.convertedPatient;
      const set = followChanges((key) => getPath(row, key), notBoughtValuesOf(before), notBoughtValuesOf(after), { required: ['patientName'] });
      if (!Object.keys(set).length) return false;
      await m.PackageNotBought.updateOne({ _id: row._id }, { $set: { ...set, updatedByName: user.name } });
      return true;
    });
  }
  if (patientId) {
    let phaseNumber = Number(after.phase || before.phase) || 1;
    await step('Patient record', async () => {
      if (paper?.poNo) {
        const po = await m.PurchaseOrder.findOne({ poNumber: paper.poNo }).select('phase').lean();
        if (po?.phase) phaseNumber = po.phase;
      }
      return syncPatient({ patientId, phaseNumber, before, after, user, models: m });
    });
  }
  return { updated, failed };
};

module.exports = { syncRegistration, followChanges, patientValuesOf, notBoughtValuesOf, purchaseValuesOf, salesValuesOf };
