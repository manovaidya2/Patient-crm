const { test } = require('node:test');
const assert = require('node:assert/strict');
const Patient = require('../models/Patient');
const controller = require('./patientController');
const { CATEGORIES } = require('../constants/patientCategories');
const { ROLES } = require('../constants/roles');

const makePatient = () => new Patient({
  patientName: 'Attachment Patient',
  patientCode: 'ATT-1',
  category: CATEGORIES.AUTISM_ADHD,
  age: '8',
  number: '9999999999',
  guardianName: 'Guardian',
  stages: [{
    number: 1,
    medicineRequest: {
      status: 'made',
      medicineImageUrl: '/uploads/medicine/wrong.jpg',
      medicineImageFileName: 'wrong.jpg',
      medicineImages: [
        { url: '/uploads/medicine/wrong.jpg', fileName: 'wrong.jpg' },
        { url: '/uploads/medicine/right.jpg', fileName: 'right.jpg' },
      ],
    },
  }],
});

const invoke = async (patient, url) => {
  const original = Patient.findById;
  Patient.findById = async () => patient;
  patient.save = async () => patient;
  patient.populate = async () => patient;
  const response = {
    status(code) { this.code = code; return this; },
    json(data) { this.data = data; return this; },
  };
  try {
    await controller.deletePatientAttachment({
      params: { id: String(patient._id) },
      body: { url },
      user: { _id: '68d973568739990000000003', name: 'Admin', role: ROLES.ADMIN },
    }, response, (error) => { throw error; });
    return response;
  } finally {
    Patient.findById = original;
  }
};

test('deletes only the selected patient attachment and clears its legacy URL', async () => {
  const patient = makePatient();
  const response = await invoke(patient, '/uploads/medicine/wrong.jpg');
  const request = patient.stages[0].medicineRequest;
  assert.equal(response.data.success, true);
  assert.equal(request.medicineImageUrl, null);
  assert.deepEqual(request.medicineImages.map((file) => file.url), ['/uploads/medicine/right.jpg']);
  assert.equal(patient.activityLog.at(-1).action, 'Uploaded attachment deleted');
});

test('rejects paths outside the managed uploads directory', async () => {
  const response = await invoke(makePatient(), '../../backend/.env');
  assert.equal(response.code, 400);
  assert.equal(response.data.success, false);
});
