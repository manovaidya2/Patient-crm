const { test } = require('node:test');
const assert = require('node:assert/strict');
const controller = require('./packageNotBoughtController');
const PackageNotBoughtPatient = require('../models/PackageNotBoughtPatient');
const Management = require('../models/AppointmentManagementEntry');
const Patient = require('../models/Patient');
const ConsultationReceipt = require('../models/ConsultationReceipt');
const SalesAppointment = require('../models/SalesAppointment');
const User = require('../models/User');

const ID = 'c'.repeat(24);
const PATIENT_ID = 'd'.repeat(24);
const ENTRY_ID = 'e'.repeat(24);
const USER_ID = 'f'.repeat(24);
const makeRes = () => ({ statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; } });
const makeRow = (extra = {}) => ({
  _id: ID, patientName: 'Riddhima', parentName: 'Rajnish', fatherNumber: '8800611900', motherNumber: '6265219550', age: '4', status: 'open', followUps: [],
  packageDetails: { approvedProgramFee: 42000, paymentPlan: '2 Parts' }, async save() { this.saved = true; }, ...extra,
});
const paper = (extra = {}) => ({ mode: 'Online', amountReceivedNow: '10000', utrReference: 'UTR-1', poNo: 'PO-9', poDate: '2026-10-19', orderedTreatment: 'Autism / Phase 1', ...extra });

const run = async (body, stubs, req = {}) => {
  const restore = [];
  const stub = (target, name, fn) => { const old = target[name]; target[name] = fn; restore.push(() => { target[name] = old; }); };
  const log = { patients: [], deleted: false, entryUpdates: [], io: [] };
  for (const [path, fn] of Object.entries(stubs)) {
    const [model, name] = path.split('.');
    stub({ PNB: PackageNotBoughtPatient, Patient, Management }[model], name, fn);
  }
  stub(ConsultationReceipt, 'updateMany', async () => ({}));
  stub(User, 'findOne', async () => ({ _id: USER_ID, name: 'Abhishek' }));
  stub(SalesAppointment, 'find', () => ({ select: () => ({ lean: async () => [] }) }));
  if (!stubs['Patient.create']) {
    stub(Patient, 'create', async (doc) => {
      const created = { _id: PATIENT_ID, ...doc, stages: doc.stages.map((stage) => ({ ...stage, payments: [...(stage.payments || [])] })), activityLog: [...doc.activityLog], save: async () => {}, deleteOne: async () => { log.deleted = true; } };
      log.patients.push(created);
      return created;
    });
  }
  const io = { to(room) { log.io.push(room); return this; }, emit(event) { log.io.push(event); } };
  const res = makeRes(); let error = null;
  try { await controller.markPackageNotBoughtConverted({ params: { id: ID }, body, user: { _id: USER_ID, name: 'Abhishek', role: 'post_counselor' }, app: { get: () => io }, ...req }, res, (e) => { error = e; }); } finally { restore.forEach((fn) => fn()); }
  return { res, error, log };
};
const base = (row) => ({
  'PNB.findById': async () => row,
  'PNB.findOneAndUpdate': async () => row,
  'PNB.updateOne': async () => ({}),
  'Patient.findOne': async () => null,
});

test('convert needs the PO paper: PO number and payment mode, and creates nothing without them', async () => {
  const noPaper = await run({ patientCode: 'R-3440', category: 'autism_adhd' }, base(makeRow()));
  assert.equal(noPaper.error.statusCode, 400);
  assert.equal(noPaper.log.patients.length, 0);
  const noPo = await run({ patientCode: 'R-3440', category: 'autism_adhd', purchase: paper({ poNo: '' }) }, base(makeRow()));
  assert.match(noPo.error.message, /PO number/);
  const noMode = await run({ patientCode: 'R-3440', category: 'autism_adhd', purchase: paper({ mode: '' }) }, base(makeRow()));
  assert.match(noMode.error.message, /payment mode/);
  assert.equal(noMode.log.patients.length, 0);
});

test('convert creates the patient with the Phase 1 package, PO and the payment from the PO paper, and starts In Transit', async () => {
  const row = makeRow();
  const { res, error, log } = await run({ patientCode: 'r-3440', category: 'autism_adhd', conversionDetails: 'bought', purchase: paper({ transactionId: 'T-5', paymentNotes: 'first part' }) }, base(row));
  assert.equal(error, null);
  const patient = log.patients[0];
  assert.equal(patient.patientCode, 'R-3440');
  assert.equal(patient.number, '8800611900', "father's number comes from the record");
  assert.equal(patient.alternateNumber, '6265219550');
  assert.equal(patient.guardianName, 'Rajnish');
  assert.match(patient.activityLog[0].details, /Package Not Bought/);
  const phase = patient.stages.find((stage) => stage.number === 1);
  assert.equal(phase.purchaseOrder, 'PO-9');
  assert.equal(phase.packageName, 'Autism / Phase 1');
  assert.equal(phase.totalAmount, 42000);
  assert.equal(phase.payments.length, 1);
  assert.equal(phase.payments[0].amount, 10000);
  assert.equal(phase.payments[0].utr, 'UTR-1');
  assert.equal(phase.payments[0].transactionId, 'T-5');
  assert.equal(phase.payments[0].approvalStatus, 'pending');
  assert.equal(String(row.convertedPatient), PATIENT_ID);
  assert.equal(res.body.inTransit, true, 'a PO number with a payment starts In Transit');
  assert.equal(res.body.patientId, PATIENT_ID);
});

test('convert without any payment received still enters In Transit', async () => {
  const { res, error, log } = await run({ patientCode: 'R-1', category: 'autism_adhd', purchase: paper({ amountReceivedNow: '' }) }, base(makeRow()));
  assert.equal(error, null);
  assert.equal(log.patients[0].stages.find((stage) => stage.number === 1).payments.length, 0);
  assert.equal(res.body.inTransit, true);
});

test('convert of a record without a package asks for the approved program fee', async () => {
  const fresh = () => makeRow({ packageDetails: undefined });
  const none = await run({ patientCode: 'R-1', category: 'autism_adhd', purchase: paper() }, base(fresh()));
  assert.equal(none.res.statusCode, 400);
  assert.match(none.res.body.message, /approved program fee/);
  const typed = await run({ patientCode: 'R-1', category: 'autism_adhd', approvedProgramFee: '30,000', purchase: paper() }, base(fresh()));
  assert.equal(typed.error, null);
  assert.equal(typed.log.patients[0].stages.find((stage) => stage.number === 1).totalAmount, 30000);
  const tooMuch = await run({ patientCode: 'R-1', category: 'autism_adhd', approvedProgramFee: '5000', purchase: paper({ amountReceivedNow: '9000' }) }, base(fresh()));
  assert.match(tooMuch.error.message, /cannot be more/);
});

test('convert: an already converted record does not create another patient', async () => {
  let created = false;
  const done = await run({ patientCode: 'R-1', category: 'autism_adhd', purchase: paper() }, { ...base(makeRow({ status: 'converted' })), 'Patient.create': async () => { created = true; return {}; } });
  assert.equal(done.res.statusCode, 400);
  const lost = await run({ patientCode: 'R-1', category: 'autism_adhd', purchase: paper() }, { ...base(makeRow()), 'PNB.findOneAndUpdate': async () => null, 'Patient.create': async () => { created = true; return {}; } });
  assert.equal(lost.res.statusCode, 400);
  assert.equal(created, false, 'a second click that lost the race creates nothing');
});

test('convert: missing patient details are reported before anything is created, and a duplicate ID leaves the record open', async () => {
  let claimed = false;
  const missing = await run({ patientCode: 'R-3440', category: 'autism_adhd', purchase: paper() }, { ...base(makeRow({ parentName: '' })), 'PNB.findOneAndUpdate': async () => { claimed = true; return makeRow(); } });
  assert.equal(missing.res.statusCode, 400);
  assert.match(missing.res.body.message, /guardianName/);
  assert.equal(claimed, false);
  assert.equal(missing.log.patients.length, 0);
  let reopened = null;
  const dupe = await run({ patientCode: 'R-3440', category: 'autism_adhd', guardianName: 'X', purchase: paper() }, { ...base(makeRow()), 'Patient.findOne': async () => ({ _id: 'exists' }), 'PNB.updateOne': async (filter, update) => { reopened = update.$set; return {}; } });
  assert.match(dupe.error.message, /already exists/);
  assert.equal(reopened.status, 'open');
});

const registeredEntry = (extra = {}) => ({
  _id: ENTRY_ID, appointmentCode: 'APT-1', appointmentDate: '2026-10-18', sourceAppointment: undefined,
  values: new Map([['6abb6329297d3a5387593670', 'R-3440']]), salesValues: new Map(),
  registration: { status: 'sent', postCounselor: USER_ID, postCounselorName: 'Abhishek', consultationDate: '2026-10-18', fields: new Map(Object.entries({ patientName: 'Riddhima', age: '4', category: 'autism_adhd', fatherName: 'Rajnish', motherName: 'Sonam', fatherNumber: '8800611900', motherNumber: '6265219550', city: 'Delhi', pinCode: '110021', patientHistoryBy: 'Mother' })) },
  ...extra,
});

test('convert of a record from post-counselling needs only the PO paper: the patient comes from its registration', async () => {
  const updates = [];
  const row = makeRow({ sourceEntry: ENTRY_ID, patientId: 'R-3440', category: 'autism_adhd', parentName: '' });
  const { error, res, log } = await run({ purchase: paper() }, {
    ...base(row),
    'Management.findById': async () => registeredEntry(),
    'Management.updateOne': async (filter, update) => { updates.push(update.$set); return {}; },
  });
  assert.equal(error, null);
  const patient = log.patients[0];
  assert.equal(patient.patientCode, 'R-3440', 'the Patient ID is the one reception generated');
  assert.equal(patient.patientName, 'Riddhima');
  assert.equal(patient.guardianName, 'Rajnish');
  assert.equal(patient.number, '8800611900');
  assert.equal(patient.city, 'Delhi', 'child & family details come along');
  assert.equal(patient.stages.find((stage) => stage.number === 1).postCounselor, USER_ID, 'the post counselor stays the same');
  assert.equal(updates[0]['postCounseling.outcome.kind'], 'converted');
  assert.equal(String(updates[0]['postCounseling.outcome.patient']), PATIENT_ID);
  assert.equal(updates[0]['postCounseling.purchase'].values.poNo, 'PO-9');
  assert.ok(log.io.includes('post-counseling:changed'), 'the Post Counseling pages refresh live');
  assert.equal(res.body.inTransit, true);
});

test('the PO paper form is opened with the approved fee and the prefilled plan', async () => {
  const restore = [];
  const stub = (target, name, fn) => { const old = target[name]; target[name] = fn; restore.push(() => { target[name] = old; }); };
  stub(PackageNotBoughtPatient, 'findById', async () => makeRow({ fatherName: undefined }));
  const res = makeRes();
  try { await controller.getPurchaseForm({ params: { id: ID }, user: { name: 'Abhishek' } }, res, (e) => { throw e; }); } finally { restore.forEach((fn) => fn()); }
  assert.equal(res.body.fee, 42000);
  assert.equal(res.body.feeKnown, true);
  assert.equal(res.body.values.plan, '2 Parts');
  assert.equal(res.body.values.counsellorWitness, 'Abhishek');
  assert.equal(res.body.registration.fatherNumber, '8800611900');
  assert.ok(res.body.definitions.sectionF.length > 5);
  assert.deepEqual(res.body.needs, ['patientCode', 'category'], 'an older record without a Patient ID or category has to be asked for them');
});

test('the PO paper form needs nothing extra for a record that came from post-counselling', async () => {
  const restore = [];
  const stub = (target, name, fn) => { const old = target[name]; target[name] = fn; restore.push(() => { target[name] = old; }); };
  stub(PackageNotBoughtPatient, 'findById', async () => makeRow({ sourceEntry: ENTRY_ID }));
  stub(Management, 'findById', async () => registeredEntry());
  const res = makeRes();
  try { await controller.getPurchaseForm({ params: { id: ID }, user: { name: 'Abhishek' } }, res, (e) => { throw e; }); } finally { restore.forEach((fn) => fn()); }
  assert.deepEqual(res.body.needs, []);
  assert.equal(res.body.prefill.patientCode, 'R-3440');
  assert.equal(res.body.registration.fatherNumber, '8800611900');
});
