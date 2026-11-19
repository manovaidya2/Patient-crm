// A patient marked inactive is closed: their medicine work leaves every pending queue, sidebar badge, alarm and My Day
// list. Nothing is deleted or cancelled: reactivating the patient brings the same jobs back where they were.
const mongoose = require('mongoose');
const Patient = require('../models/Patient');

// Without a database (unit tests) nothing is looked up; tests replace `db.ready`.
const db = { ready: () => mongoose.connection.readyState === 1 };
const CLOSED_MESSAGE = 'This patient is inactive. Reactivate the patient first';

// Ids of the inactive patients (none without a database, as in unit tests).
const closedPatientIds = async () => (db.ready() ? Patient.distinct('_id', { isActive: false }) : []);

// A MedicineJob filter without the jobs of inactive patients.
const withoutClosedPatients = async (filter = {}) => {
  const ids = await closedPatientIds();
  if (!ids.length) return filter;
  return filter.patient ? { $and: [filter, { patient: { $nin: ids } }] } : { ...filter, patient: { $nin: ids } };
};

// Refuses work on a job whose patient is inactive.
const assertPatientOpen = async (job) => {
  if (!job?.patient || !db.ready()) return;
  if (await Patient.exists({ _id: job.patient, isActive: false })) throw Object.assign(new Error(CLOSED_MESSAGE), { statusCode: 409 });
};

module.exports = { db, CLOSED_MESSAGE, closedPatientIds, withoutClosedPatients, assertPatientOpen };
