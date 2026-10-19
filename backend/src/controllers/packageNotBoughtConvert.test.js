const { test } = require('node:test');
const assert = require('node:assert/strict');
const controller = require('./packageNotBoughtController');
const PackageNotBoughtPatient = require('../models/PackageNotBoughtPatient');
const Patient = require('../models/Patient');

const ID = 'c'.repeat(24);
const PATIENT_ID = 'd'.repeat(24);
const makeRes = () => ({ statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; } });
const makeRow = (extra = {}) => ({
  _id: ID, patientName: 'Riddhima', parentName: 'Rajnish', fatherNumber: '8800611900', motherNumber: '6265219550', age: '4', status: 'open', followUps: [], async save() { this.saved = true; }, ...extra,
});
const run = async (body, stubs) => {
  const restore = Object.entries(stubs).map(([path, fn]) => { const [model, name] = path.split('.'); const target = { PNB: PackageNotBoughtPatient, Patient }[model]; const old = target[name]; target[name] = fn; return () => { target[name] = old; }; });
  const res = makeRes(); let error = null;
  try { await controller.markPackageNotBoughtConverted({ params: { id: ID }, body, user: { _id: 'u1', name: 'Abhishek', role: 'post_counselor' } }, res, (e) => { error = e; }); } finally { restore.forEach((fn) => fn()); }
  return { res, error };
};

test('convert creates the patient from the record and links it', async () => {
  const row = makeRow();
  let created = null; let claim = null;
  const { res, error } = await run({ patientCode: 'r-3440', category: 'autism_adhd', conversionDetails: 'bought' }, {
    'PNB.findById': async () => row,
    'PNB.findOneAndUpdate': async (filter, update) => { claim = { filter, update }; return row; },
    'Patient.findOne': async () => null,
    'Patient.create': async (doc) => { created = doc; return { _id: PATIENT_ID, ...doc }; },
  });
  assert.equal(error, null);
  assert.equal(created.patientCode, 'R-3440');
  assert.equal(created.patientName, 'Riddhima');
  assert.equal(created.number, '8800611900', "father's number comes from the record");
  assert.equal(created.alternateNumber, '6265219550');
  assert.equal(created.guardianName, 'Rajnish');
  assert.equal(created.approvalStatus, 'pending');
  assert.match(created.activityLog[0].details, /Package Not Bought/);
  assert.deepEqual(claim.filter.status, { $ne: 'converted' });
  assert.equal(String(row.convertedPatient), PATIENT_ID);
  assert.equal(res.body.patientId, PATIENT_ID);
});

test('convert: an already converted record does not create another patient', async () => {
  let created = false;
  const { res } = await run({ patientCode: 'R-1', category: 'autism_adhd' }, {
    'PNB.findById': async () => makeRow({ status: 'converted' }),
    'Patient.create': async () => { created = true; return {}; },
  });
  assert.equal(res.statusCode, 400);
  assert.equal(created, false);
  const lost = await run({ patientCode: 'R-1', category: 'autism_adhd' }, {
    'PNB.findById': async () => makeRow(),
    'PNB.findOneAndUpdate': async () => null,
    'Patient.create': async () => { created = true; return {}; },
  });
  assert.equal(lost.res.statusCode, 400);
  assert.equal(created, false, 'a second click that lost the race creates nothing');
});

test('convert: bad details leave the record open', async () => {
  let reopened = null;
  const { error } = await run({ patientCode: 'R-3440', category: 'autism_adhd' }, {
    'PNB.findById': async () => makeRow({ parentName: '' }),
    'PNB.findOneAndUpdate': async () => makeRow(),
    'PNB.updateOne': async (filter, update) => { reopened = update.$set; return {}; },
    'Patient.findOne': async () => null,
  });
  assert.equal(error.statusCode, 400);
  assert.match(error.message, /Father\/Mother name/);
  assert.equal(reopened.status, 'open');

  const dupe = await run({ patientCode: 'R-3440', category: 'autism_adhd', guardianName: 'X' }, {
    'PNB.findById': async () => makeRow(),
    'PNB.findOneAndUpdate': async () => makeRow(),
    'PNB.updateOne': async () => ({}),
    'Patient.findOne': async () => ({ _id: 'exists' }),
  });
  assert.match(dupe.error.message, /already exists/);
});
