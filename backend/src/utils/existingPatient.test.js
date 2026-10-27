const { test } = require('node:test');
const assert = require('node:assert/strict');
const Patient = require('../models/Patient');
const PurchaseOrder = require('../models/PurchaseOrder');
const Management = require('../models/AppointmentManagementEntry');
const PatientIdCounter = require('../models/PatientIdCounter');
const SalesSheetAudit = require('../models/SalesSheetAudit');
const { PATIENT_TYPE_ID, EXISTING_PATIENT_ID_FIELD, applyExistingPatient, nextPhaseOf } = require('./existingPatient');
const { SALES_IDS, RECEPTION_IDS } = require('./receptionFlow');
const { createConvertedPatient } = require('./convertPatient');
const receptionFlow = require('../controllers/receptionFlowController');
const { phaseAge } = require('./phaseAge');

const OID = 'a'.repeat(24);
const PATIENT_OID = 'c'.repeat(24);
const stubAll = async (stubs, fn) => {
  const saved = stubs.map(([target, name, value]) => { const old = target[name]; target[name] = value; return [target, name, old]; });
  try { return await fn(); } finally { saved.forEach(([target, name, old]) => { target[name] = old; }); }
};
// Patient.findOne(...) can be awaited directly or followed by .select().
const query = (doc) => { const q = Promise.resolve(doc); q.select = () => q; return q; };
const findByCodeStub = (doc) => (filter) => query(doc && filter.patientCode.test(doc.patientCode) ? doc : null);

test('sales: an Existing patient needs a real old Patient ID, saved as the CRM spells it; New never keeps one', async () => {
  await stubAll([[Patient, 'findOne', findByCodeStub({ patientCode: 'A-3046' })]], async () => {
    const found = await applyExistingPatient({ [PATIENT_TYPE_ID]: 'Existing', [EXISTING_PATIENT_ID_FIELD]: ' a-3046 ' });
    assert.equal(found[EXISTING_PATIENT_ID_FIELD], 'A-3046');
    await assert.rejects(applyExistingPatient({ [PATIENT_TYPE_ID]: 'Existing', [EXISTING_PATIENT_ID_FIELD]: '' }), /Enter the Old Patient ID/);
    await assert.rejects(applyExistingPatient({ [PATIENT_TYPE_ID]: 'Existing', [EXISTING_PATIENT_ID_FIELD]: 'Z-1' }), /No patient found with Patient ID Z-1/);
    const draft = await applyExistingPatient({ [PATIENT_TYPE_ID]: 'Existing', [EXISTING_PATIENT_ID_FIELD]: '' }, { requireId: false });
    assert.equal(draft[EXISTING_PATIENT_ID_FIELD], '');
    const fresh = await applyExistingPatient({ [PATIENT_TYPE_ID]: 'New', [EXISTING_PATIENT_ID_FIELD]: 'A-3046' });
    assert.equal(fresh[EXISTING_PATIENT_ID_FIELD], '');
  });
});

test('next phase: the one after the last phase bought (phase fields or a purchase order); none when all are used', async () => {
  const patient = { _id: PATIENT_OID, stages: [{ number: 1, purchaseOrder: 'PO-1' }, { number: 2, totalAmount: 30000 }, { number: 3 }] };
  await stubAll([[PurchaseOrder, 'distinct', async () => []]], async () => assert.equal(await nextPhaseOf(patient), 3));
  await stubAll([[PurchaseOrder, 'distinct', async () => [4]]], async () => assert.equal(await nextPhaseOf(patient), 5));
  await stubAll([[PurchaseOrder, 'distinct', async () => [6]]], async () => assert.equal(await nextPhaseOf(patient), null));
  await stubAll([[PurchaseOrder, 'distinct', async () => []]], async () => assert.equal(await nextPhaseOf({ _id: PATIENT_OID, stages: [] }), 1));
});

const arrivalEntry = (salesValues) => ({
  _id: OID, appointmentCode: 'APT-9', appointmentDate: '2026-10-27', values: new Map(),
  salesValues: new Map(Object.entries({ [SALES_IDS.patientName]: 'Aahil', ...salesValues })),
});
const runArrival = async (entry, patient) => {
  const state = { counter: 0, stored: '' };
  const res = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; } };
  let error = null;
  await stubAll([
    [Management, 'findById', async () => entry],
    [Management, 'updateOne', async (filter, update) => { const v = update.$set[`values.${RECEPTION_IDS.patientId}`]; if (v) state.stored = v; return { modifiedCount: 1 }; }],
    [Management, 'exists', async () => null], [Patient, 'exists', async () => null],
    [Patient, 'findOne', findByCodeStub(patient)],
    [PatientIdCounter, 'findOneAndUpdate', async () => { state.counter += 1; return { seq: state.counter }; }],
    [SalesSheetAudit, 'create', async () => ({})],
  ], () => receptionFlow.markArrival({ params: { id: OID }, body: { status: 'Arrived', time: '11:00' }, user: { _id: 'u1', name: 'Prachi', role: 'receptionist' }, app: { get: () => null } }, res, (e) => { error = e; }));
  return { res, error, state };
};

test('arrival: an existing patient keeps the old Patient ID and no new one is generated', async () => {
  const { res, error, state } = await runArrival(arrivalEntry({ [PATIENT_TYPE_ID]: 'Existing', [EXISTING_PATIENT_ID_FIELD]: 'A-3046' }), { patientCode: 'A-3046', stages: [] });
  assert.equal(error, null);
  assert.equal(res.body.patientId, 'A-3046');
  assert.equal(res.body.existing, true);
  assert.equal(res.body.generated, false);
  assert.equal(state.stored, 'A-3046');
  assert.equal(state.counter, 0, 'the daily Patient ID counter is not used');
  const missing = await runArrival(arrivalEntry({ [PATIENT_TYPE_ID]: 'Existing', [EXISTING_PATIENT_ID_FIELD]: '' }), null);
  assert.match(missing.error.message, /existing patient.*Old Patient ID/);
  assert.equal(missing.state.stored, '', 'no Patient ID is set when the old one is missing');
  const fresh = await runArrival(arrivalEntry({ [PATIENT_TYPE_ID]: 'New' }), null);
  assert.equal(fresh.res.body.generated, true);
  assert.match(fresh.res.body.patientId, /^A-\d{6}-11$/);
});

test('convert: a returning patient gets the next phase, its PO and payment; no second patient is made', async () => {
  const saved = [];
  const pos = [];
  const patient = {
    _id: PATIENT_OID, patientCode: 'A-3046', patientName: 'Aahil', age: '6', isActive: false, currentStage: 2,
    stages: [{ number: 1, age: '5', purchaseOrder: 'PO-1111', packageName: 'Autism / Phase 1', payments: [] }, { number: 2, purchaseOrder: 'PO-2222', payments: [{ amount: 5 }] }, { number: 3, payments: [] }],
    activityLog: [],
    save: async () => { saved.push(true); },
  };
  let created = false;
  const result = await stubAll([
    [Patient, 'findOne', findByCodeStub(patient)],
    [Patient, 'create', async () => { created = true; return {}; }],
    [PurchaseOrder, 'distinct', async () => [1, 2]],
    [PurchaseOrder, 'exists', async () => null],
    [PurchaseOrder, 'create', async (doc) => { const po = { _id: 'p'.repeat(24), events: [], paymentIds: [], ...doc, save: async () => {} }; pos.push(po); return po; }],
  ], () => createConvertedPatient({
    existingPatientCode: 'A-3046',
    input: { patientCode: 'A-3046', age: '7', postCounselor: 'b'.repeat(24), consultationDate: '2026-10-27' },
    fee: 30000,
    values: { mode: 'Cash', amountReceivedNow: 10000, cashHandedTo: 'Prachi', orderedTreatment: 'Autism / ADHD / Phase 3', supplyOrder: '', medicineReadyDate: '2026-11-05' },
    totals: {}, source: 'post_counseling', user: { name: 'Abhishek', role: 'post_counselor' },
  }));
  assert.equal(created, false, 'no new patient');
  assert.equal(result.existing, true);
  assert.equal(result.phase, 3);
  const phase = patient.stages.find((stage) => stage.number === 3);
  assert.equal(phase.purchaseOrder, result.poNumber);
  assert.equal(phase.totalAmount, 30000);
  assert.equal(phase.packageName, 'Autism / ADHD / Phase 3');
  assert.equal(phase.payments.length, 1);
  assert.equal(phase.payments[0].amount, 10000);
  assert.equal(String(phase.postCounselor), 'b'.repeat(24));
  assert.equal(pos[0].phase, 3);
  assert.equal(pos[0].patientCode, 'A-3046');
  assert.equal(patient.stages[1].purchaseOrder, 'PO-2222', 'the earlier phases are left as they were');
  assert.equal(patient.isActive, true, 'a closed patient is reopened');
  assert.equal(patient.currentStage, 2, 'the current phase changes only when the team activates the new one');
  assert.ok(patient.activityLog.some((row) => /Returning patient: Phase 3 bought/.test(row.action)));
  assert.equal(saved.length, 1);
  // Each phase keeps the age told at its visit; the patient's age is the latest one.
  assert.equal(phase.age, '7');
  assert.equal(patient.age, '7');
  assert.equal(patient.stages[0].age, '5', 'Phase 1 keeps the age it was bought at');
  assert.equal(phaseAge(patient, 1), '5');
  assert.equal(phaseAge(patient, 2), '6', 'Phase 2 was bought at 6 and keeps it; it does not jump to the new age');
  assert.ok(patient.activityLog.some((row) => row.action === 'Age updated for Phase 3' && row.details === 'From 6 to 7'));
});

test('phase ages: phases bought earlier keep their age when the patient age changes later', () => {
  const { setPhaseAge, freezePhaseAges } = require('./phaseAge');
  // An older patient: no phase has its own age yet.
  const patient = { age: '5', currentStage: 1, stages: [{ number: 1, purchaseOrder: 'PO-1' }, { number: 2 }, { number: 3 }] };
  assert.equal(phaseAge(patient, 1), '5');
  // Phase 2 is bought a year later at age 6: Phase 1 stays 5.
  patient.stages[1].purchaseOrder = 'PO-2';
  assert.equal(setPhaseAge(patient, patient.stages[1], '6'), true);
  assert.equal(phaseAge(patient, 1), '5');
  assert.equal(phaseAge(patient, 2), '6');
  assert.equal(patient.age, '6');
  // Correcting an older phase does not change the patient's latest age.
  setPhaseAge(patient, patient.stages[0], '4.5');
  assert.equal(patient.age, '6');
  assert.equal(phaseAge(patient, 1), '4.5');
  // A phase that was never bought is not given an age.
  freezePhaseAges(patient);
  assert.equal(patient.stages[2].age, undefined);
});
