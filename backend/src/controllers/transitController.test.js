const { test, afterEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const Patient = require('../models/Patient');
const User = require('../models/User');
const { runAction, getTransitReminders } = require('./transitController');

afterEach(() => mock.restoreAll());

const localDay = (offset = 0) => { const d = new Date(); d.setDate(d.getDate() + offset); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const makePatient = ({ total = 1000, paid = 1000 } = {}) => {
  const patient = new Patient({ patientName: 'Test Patient', category: 'autism_adhd', number: '9999999999', guardianName: 'Parent', age: 10 });
  const stage = patient.stages.find((s) => s.number === 1);
  Object.assign(stage, { purchaseOrder: 'PO-1', totalAmount: total });
  stage.payments.push({ amount: paid, approvalStatus: 'approved' });
  patient.save = async () => { await patient.validate(); return patient; };
  patient.populate = async () => patient;
  mock.method(Patient, 'findById', async () => patient);
  return { patient, stage };
};
const user = { _id: new mongoose.Types.ObjectId(), name: 'Tester', role: 'receptionist' };
const call = async (patient, body, files = []) => {
  const res = { body: null, json(value) { this.body = value; } };
  let failure;
  await runAction({ params: { patientId: String(patient._id), number: '1' }, body, files, user }, res, (error) => { failure = error; });
  if (failure) throw failure;
  return res.body.item;
};
const png = (name) => ({ filename: name, originalname: name });
const staff = (role) => ({ _id: new mongoose.Types.ObjectId(), name: `${role} user`, role });
const mockStaff = (people) => mock.method(User, 'findOne', (query) => ({
  select: () => ({ lean: async () => people.find((p) => String(p._id) === String(query._id) && p.role === query.role) || null }),
}));

// What the medicine department page writes when it marks the medicine made and fills packing.
const medicineDeptMarksMade = (stage) => Object.assign(stage.medicineRequests[0], { status: 'made', madeByName: 'Ravi', madeAt: new Date(), medicineImages: [{ url: '/m.png', fileName: 'm.png' }], packagedByName: 'A', chitsWrittenByName: 'B', lastMedicineCheckedByName: 'C' });

async function acceptAndCall(patient, readyBy) {
  await call(patient, { action: 'raise_request', medicines: 'Syrup A' }, [png('rx.png')]);
  await assert.rejects(() => call(patient, { action: 'accept_request' }), /ready-by date/);
  let item = await call(patient, { action: 'accept_request', readyByDate: readyBy });
  assert.equal(item.medicine.readyByDate.slice(0, 10), new Date(readyBy).toISOString().slice(0, 10));
  return item;
}

test('the reminder step waits for the day before the ready-by date, then the call step opens', async () => {
  const { patient } = makePatient();
  let item = await acceptAndCall(patient, localDay(5));
  assert.equal(item.step.key, 'reminder');
  assert.equal(item.nextAction, null);
  assert.match(item.step.waitText, /Automatic reminder on/);
  item = await call(patient, { action: 'set_ready_by', readyByDate: localDay(1) });
  assert.equal(item.step.key, 'call');
  assert.equal(item.nextAction, 'log_call');
});

test('porter: calls, confirm porter, full payment, medicine ready, sent, received, start treatment', async () => {
  const { patient, stage } = makePatient({ total: 2000, paid: 1000 });
  await acceptAndCall(patient, localDay(0));
  await assert.rejects(() => call(patient, { action: 'confirm_mode', mode: 'porter' }), /connected call/);
  await assert.rejects(() => call(patient, { action: 'log_call', outcome: 'busy', notes: 'Busy' }), /call again/);
  let item = await call(patient, { action: 'log_call', outcome: 'busy', notes: 'Busy', nextCallAt: new Date().toISOString() });
  assert.equal(item.step.key, 'call');
  item = await call(patient, { action: 'log_call', outcome: 'connected', notes: 'Send by porter' });
  assert.equal(item.calls.length, 2);
  item = await call(patient, { action: 'confirm_mode', mode: 'porter' });
  assert.equal(item.step.key, 'payment');
  assert.equal(item.nextAction, 'add_payment');
  item = await call(patient, { action: 'add_payment', amount: '1000', paymentMode: 'online', utr: 'UTR1' });
  assert.equal(item.step.key, 'payment');
  assert.equal(item.payment.pendingCount, 1);
  assert.equal(item.nextAction, null); // balance is covered, now it only waits for accounts
  assert.match(item.step.waitText, /Waiting for accounts/);
  assert.equal(item.payments.find((p) => p.status === 'pending').amount, 1000);
  stage.payments[1].approvalStatus = 'approved'; // accounts verifies
  item = await call(patient, { action: 'log_call', outcome: 'connected', notes: 'Payment confirmed' });
  assert.equal(item.step.key, 'made');
  assert.equal(item.nextAction, null); // only the medicine department marks it made
  await assert.rejects(() => call(patient, { action: 'mark_made', madeByName: 'Ravi' }), /Unknown/);
  medicineDeptMarksMade(stage);
  item = await call(patient, { action: 'log_call', outcome: 'connected', notes: 'Medicine ready' });
  assert.match(item.steps.find((s) => s.key === 'made').text, /Chits B/i);
  assert.equal(item.step.key, 'dispatched');
  await assert.rejects(() => call(patient, { action: 'dispatch', receiverName: 'R', receiverPhone: '1', address: 'A' }), /Porter name/);
  item = await call(patient, { action: 'dispatch', receiverName: 'R', receiverPhone: '1', address: 'A', porterName: 'Raju', porterPhone: '88' });
  assert.equal(item.courier.courierPartner, 'Porter - Raju');
  assert.equal(stage.medicineRequests[0].status, 'sent_to_courier');
  item = await call(patient, { action: 'confirm_received', receivedByName: 'Mother' });
  assert.equal(item.step.key, 'start');
  const doctor = staff('assistant_doctor');
  const counselor = staff('post_counselor');
  mockStaff([doctor, counselor]);
  await assert.rejects(() => call(patient, { action: 'start_treatment', explanationAt: new Date().toISOString() }), /assistant doctor/);
  item = await call(patient, { action: 'start_treatment', explanationAt: new Date().toISOString(), assistantDoctorId: String(doctor._id), postCounselorId: String(counselor._id) });
  assert.equal(item.activated, true);
  assert.equal(String(patient.assignedDoctor), String(doctor._id));
  assert.equal(String(stage.postCounselor), String(counselor._id));
  assert.ok(stage.medicineExplainDate);
  assert.ok(item.groups.every((g) => g.state === 'done'));
});

test('self pickup: schedule visit, medicine ready, collected, then full payment before treatment start', async () => {
  const { patient, stage } = makePatient({ total: 2000, paid: 1000 });
  await acceptAndCall(patient, localDay(0));
  await call(patient, { action: 'log_call', outcome: 'connected', notes: 'Will come' });
  let item = await call(patient, { action: 'confirm_mode', mode: 'pickup' });
  assert.equal(item.step.key, 'visit');
  item = await call(patient, { action: 'schedule_visit', visitAt: new Date().toISOString() });
  assert.equal(item.step.key, 'made');
  await assert.rejects(() => call(patient, { action: 'confirm_received', receivedByName: 'Father' }), /not ready/);
  medicineDeptMarksMade(stage);
  item = await call(patient, { action: 'confirm_received', receivedByName: 'Father' });
  assert.equal(item.step.key, 'payment');
  assert.equal(item.courier.deliveryMode, 'self');
  await assert.rejects(() => call(patient, { action: 'start_treatment', explanationAt: new Date().toISOString() }), /Full payment/);
  stage.payments[0].amount = 2000;
  item = await call(patient, { action: 'log_call', outcome: 'connected', notes: 'Paid at clinic' });
  assert.equal(item.step.key, 'start');
});

test('hold blocks actions until resumed', async () => {
  const { patient } = makePatient();
  await acceptAndCall(patient, localDay(0));
  assert.equal((await call(patient, { action: 'hold', reason: 'Patient travelling' })).onHold, true);
  await assert.rejects(() => call(patient, { action: 'log_call', outcome: 'connected', notes: 'x' }), /on hold/);
  assert.equal((await call(patient, { action: 'resume' })).onHold, false);
});

test('reminders: medicine due tomorrow for medicine dept, explanation notice only for the assigned counselor', async () => {
  const counselorId = new mongoose.Types.ObjectId();
  const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
  const later = new Date(); later.setDate(later.getDate() + 3);
  const patients = [{
    _id: new mongoose.Types.ObjectId(), patientName: 'Due Patient', stages: [
      { number: 1, purchaseOrder: 'PO', payments: [{ amount: 1 }], postCounselor: counselorId, transit: {}, medicineRequests: [{ requestId: 'r1', status: 'in_process', requestedAt: new Date(), readyByDate: tomorrow }] },
      { number: 2, purchaseOrder: 'PO2', payments: [{ amount: 1 }], postCounselor: counselorId, medicineExplainDate: later, transit: { explanationScheduledAt: new Date(), activatedAt: new Date() }, medicineRequests: [] },
    ],
  }];
  mock.method(Patient, 'find', () => ({ select: () => ({ lean: async () => patients }) }));
  const fetch = async (who) => {
    const res = { json(v) { this.body = v; } };
    await getTransitReminders({ user: who, query: {} }, res, (e) => { throw e; });
    return res.body.reminders;
  };
  const med = await fetch({ _id: new mongoose.Types.ObjectId(), role: 'medicine_department' });
  assert.deepEqual(med.map((r) => r.title), ['Medicine preparation last date is tomorrow']);
  const pc = await fetch({ _id: counselorId, role: 'post_counselor' });
  assert.deepEqual(pc.map((r) => r.type).sort(), ['explanation_scheduled', 'medicine_due']);
  assert.equal((await fetch({ _id: new mongoose.Types.ObjectId(), role: 'post_counselor' })).length, 0);
});

test('admin removes a case from In Transit and restores it; removed cases block actions', async () => {
  const { removeFromTransit, restoreToTransit } = require('./transitController');
  const { patient, stage } = makePatient();
  const admin = { _id: new mongoose.Types.ObjectId(), name: 'Admin', role: 'admin' };
  const run = async (handler, body = {}) => {
    const res = { json(v) { this.body = v; } };
    let failure;
    await handler({ params: { patientId: String(patient._id), number: '1' }, body, user: admin }, res, (e) => { failure = e; });
    if (failure) throw failure;
    return res.body.item;
  };
  const removed = await run(removeFromTransit, { reason: 'Duplicate entry' });
  assert.equal(removed.removed.reason, 'Duplicate entry');
  assert.equal(stage.payments.length, 1);
  await assert.rejects(() => call(patient, { action: 'log_call', outcome: 'connected', notes: 'x' }), /removed/);
  const restored = await run(restoreToTransit);
  assert.equal(restored.removed, null);
});
