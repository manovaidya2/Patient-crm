// The Admin corrects a registration after post counselling: the correction follows to the PO paper, the appointment and
// sales sheet, the patient (and the name on their other records) and Package Not Bought - only where a place still has
// what the old registration gave it. The database is replaced by small fakes.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const Patient = require('../models/Patient');
const { SALES_IDS } = require('./receptionFlow');
const { syncRegistration, followChanges } = require('./registrationSync');
const { syncPatientNameCopies, COPIES } = require('./patientNameCopies');

const id = () => new mongoose.Types.ObjectId();
const admin = { _id: id(), name: 'Admin Asha', role: 'admin' };
const before = { phase: '1', patientName: 'Aarav', nameMatchesAadhaar: 'Yes', age: '5', category: 'autism_adhd', fatherName: 'Rahul', fatherNumber: '9000000001', motherNumber: '9000000002', city: 'Pune' };
const after = { ...before, patientName: 'Aarav Sharma', fatherNumber: '9000000009', motherNumber: '9000000003', age: '6', city: 'Mumbai' };
// The records that keep the patient's name: each answers how many it changed (and what it was asked).
const nameCopies = (counts = {}, asked = []) => Object.fromEntries(COPIES.map(([name]) => [name, { updateMany: async (q, u) => { asked.push([name, q, u.$set]); return { modifiedCount: counts[name] || 0 }; } }]));

test('a place follows the registration only where it still has the old value; required values are never emptied', () => {
  const place = { name: 'Aarav', mobile: '9111111111', city: 'Pune', note: 'x' };
  const set = followChanges((key) => place[key], { name: 'Aarav', mobile: '9000000001', city: 'Pune', note: 'x' }, { name: 'Aarav S', mobile: '9000000009', city: '', note: 'x' }, { required: ['city'] });
  assert.deepEqual(set, { name: 'Aarav S' }, 'mobile was changed there (kept); city would be emptied (required); note did not change');
});

test('converted patient: the PO paper, appointment, sales sheet, patient (with the phase age) and the name on their records follow', async () => {
  const patientId = id(); const salesId = id(); const entryId = id();
  const patient = new Patient({
    patientName: 'Aarav', patientCode: 'A-1', category: 'autism_adhd', age: '5', number: '9000000001', alternateNumber: '9111111111', guardianName: 'Rahul', city: 'Pune',
    stages: [{ number: 1, age: '5', purchaseOrder: 'PO-1', packageName: 'Autism / Phase 1' }],
  });
  patient._id = patientId;
  let patientSaved = 0;
  patient.save = async () => { patientSaved += 1; return patient; };
  const calls = [];
  const asked = [];
  const models = {
    ...nameCopies({ PurchaseOrder: 2, MedicineJob: 1 }, asked),
    Management: { updateOne: async (q, u) => { calls.push(['entry', u.$set]); return { modifiedCount: 1 }; } },
    SalesAppointment: {
      findById: () => ({ select: () => ({ lean: async () => ({ _id: salesId, values: { [SALES_IDS.patientName]: 'Aarav', [SALES_IDS.fatherNumber]: '90000 00001' } }) }) }),
      updateOne: async (q, u) => { calls.push(['sales', u.$set]); return { modifiedCount: 1 }; },
    },
    Patient: { findById: async () => patient },
    PurchaseOrder: { ...nameCopies({ PurchaseOrder: 2 }, asked).PurchaseOrder, findOne: () => ({ select: () => ({ lean: async () => ({ phase: 1 }) }) }) },
    PackageNotBought: { findById: () => assert.fail('not a Package Not Bought visit') },
  };
  const entry = {
    _id: entryId, sourceAppointment: salesId,
    salesValues: new Map([[SALES_IDS.patientName, 'Aarav']]),
    postCounseling: { savedAt: new Date(), purchase: { values: { guardianName: 'Rahul', guardianMobile: '9000000001', poNo: 'PO-1' } }, outcome: { kind: 'converted', patient: patientId } },
  };
  const result = await syncRegistration({ entry, before, after, user: admin, models });
  assert.deepEqual(result.failed, []);
  assert.deepEqual(calls, [
    ['entry', { 'postCounseling.purchase.values.guardianMobile': '9000000009' }],
    ['entry', { [`salesValues.${SALES_IDS.patientName}`]: 'Aarav Sharma' }],
    ['sales', { [`values.${SALES_IDS.patientName}`]: 'Aarav Sharma' }],
  ], 'the sales father number was written differently there: kept');
  assert.deepEqual([patient.patientName, patient.number, patient.city, patient.alternateNumber, patient.stages[0].age, patient.age],
    ['Aarav Sharma', '9000000009', 'Mumbai', '9111111111', '6', '6'], 'the alternate number was changed on the patient page: kept');
  assert.equal(patientSaved, 1);
  assert.match(patient.activityLog.slice(-1)[0].action, /Registration corrected by Admin/);
  assert.deepEqual(asked.map(([name, q, set]) => [name, String(q.patient), q.patientName, set.patientName]), COPIES.map(([name]) => [name, String(patientId), { $ne: 'Aarav Sharma' }, 'Aarav Sharma']), 'every record of the patient with another name');
  assert.deepEqual(result.updated, ['PO paper', 'Appointment details', 'Sales sheet', 'Patient record (patientName, number, city, age)', 'Name on 2 purchase orders', 'Name on 1 medicine fulfilment jobs']);
});

test('the name was already changed on the patient page: saving the registration again brings the purchase order and the medicine job up to it', async () => {
  const patient = new Patient({ patientName: 'Geetharth Kaushik', patientCode: 'G-221126-20', category: 'autism_adhd', age: '3 yrs', number: '9560505830', guardianName: 'Kaushik', stages: [{ number: 1, age: '3 yrs', purchaseOrder: 'PO-5600' }] });
  patient.save = async () => assert.fail('nothing of the patient itself changes');
  const asked = [];
  const models = {
    ...nameCopies({ PurchaseOrder: 1, MedicineJob: 1 }, asked),
    Management: { updateOne: async () => assert.fail('nothing of the visit changes') },
    Patient: { findById: async () => patient },
  };
  models.PurchaseOrder.findOne = () => ({ select: () => ({ lean: async () => ({ phase: 1 }) }) });
  const fields = { phase: '1', patientName: 'Geetharth Kaushik', age: '3 yrs', category: 'autism_adhd', fatherNumber: '9560505830' };
  const entry = { _id: id(), salesValues: new Map(), postCounseling: { savedAt: new Date(), purchase: { values: { poNo: 'PO-5600' } }, outcome: { kind: 'converted', patient: patient._id } } };
  const result = await syncRegistration({ entry, before: fields, after: fields, user: admin, models });
  assert.deepEqual(result, { updated: ['Name on 1 purchase orders', 'Name on 1 medicine fulfilment jobs'], failed: [] });
  assert.deepEqual(asked.find(([name]) => name === 'MedicineJob')[2], { patientName: 'Geetharth Kaushik' });
});

test('a name change on the patient page goes to their other records; issued bills are not among them', async () => {
  const asked = [];
  const done = await syncPatientNameCopies({ _id: id(), patientName: ' Aarav Sharma ' }, nameCopies({ RecordRoom: 3 }, asked));
  assert.deepEqual(done, ['Name on 3 Records Room entries']);
  assert.deepEqual(asked[0][1].patientName, { $ne: 'Aarav Sharma' });
  assert.ok(!COPIES.some(([name]) => ['Invoice', 'ConsultationReceipt', 'DeletedRecord'].includes(name)));
  assert.deepEqual(await syncPatientNameCopies({ _id: id(), patientName: '' }, nameCopies()), [], 'never blanks a name');
});

test('Package Not Bought: its record follows; nothing changed - nothing written', async () => {
  const rowId = id();
  let set = null;
  const models = {
    Management: { updateOne: async () => assert.fail('nothing of the appointment changes here') },
    PackageNotBought: {
      findById: () => ({ lean: async () => ({ _id: rowId, patientName: 'Aarav', parentName: 'Rahul', fatherNumber: '9000000001', motherNumber: '9000000002', age: '5', program: 'Autism / ADHD', category: 'autism_adhd', profile: { city: 'Pune' } }) }),
      updateOne: async (q, u) => { set = u.$set; return { modifiedCount: 1 }; },
    },
  };
  const entry = { _id: id(), salesValues: new Map(), postCounseling: { savedAt: new Date(), outcome: { kind: 'not_purchased', packageNotBought: rowId } } };
  const result = await syncRegistration({ entry, before, after: { ...after, patientName: 'Aarav' }, user: admin, models });
  assert.deepEqual(set, { fatherNumber: '9000000009', motherNumber: '9000000003', age: '6', 'profile.city': 'Mumbai', updatedByName: 'Admin Asha' });
  assert.deepEqual(result.updated, ['Package Not Bought record']);
  const none = await syncRegistration({ entry: { ...entry, postCounseling: { savedAt: new Date() } }, before, after: before, user: admin, models });
  assert.deepEqual(none, { updated: [], failed: [] });
});
