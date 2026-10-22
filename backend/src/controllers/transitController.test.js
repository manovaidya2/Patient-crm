const { test, afterEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const Patient = require('../models/Patient');
const User = require('../models/User');
const { runAction, getTransitReminders, completeExplanation, listExplanations, removeFromTransit, restoreToTransit } = require('./transitController');
const { buildTransitCase, isInTransit } = require('../utils/transitFlow');
afterEach(() => mock.restoreAll());
const user = { _id: new mongoose.Types.ObjectId(), name: 'Transit', role: 'in_transit' };
const now = () => new Date();
const future = () => new Date(Date.now() + 86400000);
const file = { filename: 'test.png', originalname: 'proof.png' };
test('patient saves detect concurrent changes rather than overwriting payment/release state', () => {
  assert.equal(Patient.schema.options.optimisticConcurrency, true);
});
const makePatient = (paid = 1000) => {
  const patient = new Patient({ patientName: 'Test', guardianName: 'Parent', category: 'autism_adhd', number: '9999999999', age: 10, approvalStatus: 'approved' });
  const stage = patient.stages[0];
  Object.assign(stage, { purchaseOrder: 'PO-1', totalAmount: 1000 });
  stage.transit.expectedReadyDate = future();
  if (paid) stage.payments.push({ amount: paid, approvalStatus: 'approved' });
  patient.save = async () => { await patient.validate(); return patient; };
  patient.populate = async () => patient;
  mock.method(Patient, 'findById', async () => patient);
  return { patient, stage };
};
const invoke = async (handler, patient, body = {}, who = user, files = []) => {
  let result, failure;
  await handler({ params: { patientId: String(patient._id), number: '1' }, body, files, user: who, query: {} },
    { json(v) { result = v; } }, e => { failure = e; });
  if (failure) throw failure;
  return result;
};
const act = async (patient, body, files = []) => (await invoke(runAction, patient, body, user, files)).item;
const request = patient => act(patient, { action: 'raise_request', medicines: 'Medicine A' }, [file]);
const made = stage => Object.assign(stage.medicineRequests[0], { status: 'made', madeAt: now(), madeByName: 'Medicine', medicineImages: [{ url: '/test.png' }] });
const release = stage => {
  made(stage);
  Object.assign(stage.medicineRequests[0], { status: 'sent_to_courier', sentToCourierAt: now(), sentToCourierByName: 'Medicine' });
  stage.transit.financialReleasedAt = now();
};
const confirmMode = async (patient, mode) => {
  await act(patient, { action: 'log_call', outcome: 'connected', notes: 'Delivery confirmed' });
  return act(patient, { action: 'confirm_mode', mode });
};
test('PO without a payment enters In Transit; request requires patient and submitted payment approval', async () => {
  const { patient, stage } = makePatient(0);
  assert.equal(isInTransit(stage), true);
  patient.approvalStatus = 'pending';
  await assert.rejects(() => request(patient), /Approve the patient/);
  patient.approvalStatus = 'approved';
  stage.payments.push({ amount: 100, approvalStatus: 'pending' });
  await assert.rejects(() => request(patient), /Verify submitted/);
  stage.payments[0].approvalStatus = 'approved';
  const item = await request(patient);
  assert.equal(item.step.key, 'accepted');
  assert.ok(item.medicine.readyByDate);
});
test('In Transit cannot accept or change Medicine Department preparation updates', async () => {
  const { patient } = makePatient();
  await request(patient);
  for (const action of ['accept_request', 'set_ready_by']) {
    await assert.rejects(() => act(patient, { action, readyByDate: future() }), e => e.statusCode === 403);
  }
});
test('dispatch can be scheduled during preparation, but requires release and full approved payment', async () => {
  const { patient, stage } = makePatient(500);
  await request(patient);
  await confirmMode(patient, 'porter');
  await act(patient, { action: 'schedule_dispatch', dispatchAt: future(), courierPartner: 'Porter', address: 'Delhi' });
  assert.ok(stage.transit.dispatchScheduledAt);
  const body = { action: 'dispatch', porterName: 'Ravi', receiverName: 'Parent', receiverPhone: '999', address: 'Delhi' };
  await assert.rejects(() => act(patient, body), /release/);
  release(stage);
  await assert.rejects(() => act(patient, body), /Full payment/);
  await assert.rejects(() => act(patient, { action: 'add_payment', amount: 500, paymentMode: 'online', utr: 'UTR1' }), /proof/);
  await act(patient, { action: 'add_payment', amount: 500, paymentMode: 'online', utr: 'UTR1' }, [file]);
  await assert.rejects(() => act(patient, body), /Full payment/);
  stage.payments[1].approvalStatus = 'approved';
  assert.equal((await act(patient, body)).courier.status, 'dispatched');
  await assert.rejects(() => act(patient, body), /already been dispatched/);
});

test('after "ready": one call fixes delivery and explanation; handover after release; PCC assigned after handover; the PCC completes it', async () => {
  const { patient, stage } = makePatient(500);
  await request(patient);
  made(stage);
  const schedule = { action: 'schedule_delivery', mode: 'pickup', visitAt: future(), explanationAt: future(), explanationMode: 'clinic' };
  await assert.rejects(() => act(patient, schedule), /connected call/);
  await act(patient, { action: 'log_call', outcome: 'not_reachable', notes: 'No answer', nextCallAt: future() });
  await act(patient, { action: 'log_call', outcome: 'connected', notes: 'Will collect on Friday' });
  await assert.rejects(() => act(patient, { ...schedule, explanationAt: '' }), /explanation date/);
  let item = await act(patient, schedule);
  assert.equal(item.mode, 'pickup');
  assert.ok(stage.transit.pickupScheduledAt && stage.medicineExplainDate && stage.transit.explanationScheduledAt);
  assert.equal(stage.transit.explanationMode, 'clinic');
  assert.equal(item.steps.find((s) => s.key === 'scheduled').state, 'done');
  assert.equal(item.step.key, 'payment', 'the balance comes next');
  assert.equal(item.nextAction, 'add_payment');
  // Switching to courier replaces the pickup plan.
  item = await act(patient, { action: 'schedule_delivery', mode: 'courier', dispatchAt: future(), courierPartner: 'DTDC', address: 'Delhi', explanationAt: future() });
  assert.equal(stage.transit.pickupScheduledAt, null);
  assert.ok(stage.transit.dispatchScheduledAt);
  assert.equal(item.steps.some((s) => s.key === 'received'), true);
  // Handover only after Medicine Department release (the parcel is packed there).
  stage.payments.push({ amount: 500, approvalStatus: 'approved' });
  await assert.rejects(() => act(patient, { action: 'dispatch', courierPartner: 'DTDC', trackingNumber: 'T1', receiverName: 'Parent', receiverPhone: '999', address: 'Delhi' }, [file]), /release/);
  release(stage);
  item = buildTransitCase(patient, stage);
  assert.equal(item.step.key, 'handover');
  assert.equal(item.nextAction, 'dispatch');
  // PCC only after handover.
  const doctor = { _id: new mongoose.Types.ObjectId(), name: 'Dr Asha', role: 'assistant_doctor' };
  mock.method(User, 'findOne', (query) => ({ select: () => ({ lean: async () => ([doctor].find((p) => String(p._id) === String(query._id) && p.role === query.role)) }) }));
  await assert.rejects(() => act(patient, { action: 'assign_pcc', assistantDoctorId: String(doctor._id) }), /hand over/);
  item = await act(patient, { action: 'dispatch', courierPartner: 'DTDC', trackingNumber: 'T1', receiverName: 'Parent', receiverPhone: '999', address: 'Delhi' }, [file]);
  assert.equal(item.step.key, 'received');
  item = await act(patient, { action: 'confirm_received', receivedByName: 'Parent', receivedAt: now() });
  assert.equal(item.step.key, 'pcc');
  assert.equal(item.pcc.assigned, false);
  item = await act(patient, { action: 'assign_pcc', assistantDoctorId: String(doctor._id) });
  assert.equal(item.pcc.assigned, true);
  assert.equal(String(patient.assignedDoctor), String(doctor._id));
  assert.ok(stage.medicineExplainDate, 'the explanation date fixed with the delivery plan is kept');
  assert.equal(item.step.key, 'explained');
  assert.equal(item.nextAction, null, 'the PCC completes the explanation, not In Transit');
  const result = await invoke(completeExplanation, patient, { completedAt: now(), notes: 'Explained doses and chits' }, doctor);
  assert.equal(result.item.activated, true);
  assert.equal(result.item.steps.at(-1).state, 'done');
  assert.equal(stage.status, 'in_progress');
});
test('self pickup requires schedule, release and full payment, then assigned doctor completion starts treatment', async () => {
  const { patient, stage } = makePatient();
  await request(patient);
  await confirmMode(patient, 'pickup');
  await act(patient, { action: 'schedule_visit', visitAt: future() });
  made(stage);
  await assert.rejects(() => act(patient, { action: 'confirm_received', receivedByName: 'Parent' }), /release/);
  release(stage);
  await act(patient, { action: 'confirm_received', receivedByName: 'Parent', receivedAt: now() });
  const doctor = { _id: new mongoose.Types.ObjectId(), name: 'Doctor', role: 'assistant_doctor' };
  const counselor = { _id: new mongoose.Types.ObjectId(), name: 'Counselor', role: 'post_counselor' };
  mock.method(User, 'findOne', query => ({ select: () => ({ lean: async () => [doctor, counselor].find(p => String(p._id) === String(query._id) && p.role === query.role) }) }));
  const item = await act(patient, { action: 'start_treatment', explanationAt: now(), assistantDoctorId: String(doctor._id), postCounselorId: String(counselor._id) });
  assert.equal(item.activated, false);
  assert.equal(item.step.key, 'explained');
  await assert.rejects(() => invoke(completeExplanation, patient, { completedAt: now(), notes: 'Done' }, { ...doctor, _id: new mongoose.Types.ObjectId() }), e => e.statusCode === 403);
  await assert.rejects(() => invoke(completeExplanation, patient, { completedAt: future(), notes: 'Done' }, doctor), /future/);
  const result = await invoke(completeExplanation, patient, { completedAt: now(), notes: 'Dosage and schedule explained' }, doctor);
  assert.equal(result.item.activated, true);
  assert.equal(stage.status, 'in_progress');
  assert.ok(stage.transit.explanationCompletedAt);
  await assert.rejects(() => invoke(completeExplanation, patient, { completedAt: now(), notes: 'Done' }, doctor), e => e.statusCode === 409);
});
test('hold and admin removal preserve records and block workflow writes', async () => {
  const { patient, stage } = makePatient();
  await request(patient);
  await act(patient, { action: 'hold', reason: 'Travelling' });
  await assert.rejects(() => act(patient, { action: 'log_call', outcome: 'connected', notes: 'x' }), /on hold/);
  await act(patient, { action: 'resume' });
  const admin = { ...user, role: 'admin' };
  await invoke(removeFromTransit, patient, { reason: 'Duplicate' }, admin);
  await assert.rejects(() => act(patient, { action: 'log_call', outcome: 'connected', notes: 'x' }), /removed/);
  await invoke(restoreToTransit, patient, {}, admin);
  assert.equal(stage.payments.length, 1);
  assert.equal(buildTransitCase(patient, stage).removed, null);
});

test('Medicine Department release endpoint rejects unpaid and pending payments, then releases once', async () => {
  const { updateMedicineRequestStatus } = require('./patientController');
  const { patient, stage } = makePatient(500);
  await request(patient); made(stage);
  const medicine = stage.medicineRequests[0];
  Object.assign(medicine, { packagedByName: 'Packing', chitsWrittenByName: 'Chits', lastMedicineCheckedByName: 'Checker' });
  const releaseViaDepartment = async () => {
    let result, status = 200;
    await updateMedicineRequestStatus({ params: { patientId: String(patient._id), number: '1' }, body: { status: 'sent_to_courier', requestId: medicine.requestId }, files: [], user: { ...user, role: 'medicine_department' } },
      { status(code) { status = code; return this; }, json(value) { result = value; } }, e => { throw e; });
    return { status, result };
  };
  assert.equal((await releaseViaDepartment()).status, 400);
  stage.payments.push({ amount: 500, approvalStatus: 'pending' });
  assert.equal((await releaseViaDepartment()).status, 400);
  stage.payments[1].approvalStatus = 'approved';
  assert.equal((await releaseViaDepartment()).status, 200);
  assert.ok(stage.transit.financialReleasedAt);
  assert.equal(medicine.status, 'sent_to_courier');
  assert.equal((await releaseViaDepartment()).status, 409);
});
test('deadline reminders go to In Transit and Medicine; explanation list and reminders are scoped to doctor', async () => {
  const { patient, stage } = makePatient();
  const doctor = { _id: new mongoose.Types.ObjectId(), role: 'assistant_doctor' };
  stage.transit.explanationDoctor = doctor._id;
  stage.transit.explanationScheduledAt = now();
  stage.medicineExplainDate = now();
  const patients = [patient.toObject()];
  mock.method(Patient, 'find', () => ({ select: () => ({ lean: async () => patients }) }));
  const reminders = async who => (await invoke(getTransitReminders, patient, {}, who)).reminders;
  assert.ok((await reminders(user)).some(r => r.type === 'medicine_due'));
  assert.deepEqual((await reminders({ ...user, role: 'medicine_department' })).map(r => r.type), ['medicine_due']);
  assert.deepEqual((await reminders(doctor)).map(r => r.type), ['explanation_today']);
  assert.equal((await reminders({ ...doctor, _id: new mongoose.Types.ObjectId() })).length, 0);
  assert.equal((await invoke(listExplanations, patient, {}, doctor)).items.length, 1);
  assert.equal((await invoke(listExplanations, patient, {}, { ...doctor, _id: new mongoose.Types.ObjectId() })).items.length, 0);
});
