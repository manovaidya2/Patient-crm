const { test } = require('node:test');
const assert = require('node:assert/strict');
const controller = require('./receptionFlowController');
const Management = require('../models/AppointmentManagementEntry');
const PatientIdCounter = require('../models/PatientIdCounter');
const Patient = require('../models/Patient');
const User = require('../models/User');
const SalesSheetAudit = require('../models/SalesSheetAudit');
const { SALES_IDS, RECEPTION_IDS, patientIdFor, istDate, categoryFromCase, missingForSend } = require('../utils/receptionFlow');

const OID = 'a'.repeat(24);
const COUNSELOR = 'b'.repeat(24);
const makeRes = () => ({ statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; } });
const call = async (handler, req) => {
  const res = makeRes();
  let error = null;
  await handler({ params: { id: OID }, body: {}, user: { _id: 'u1', name: 'Prachi', role: 'receptionist' }, app: { get: () => null }, ...req }, res, (e) => { error = e; });
  return { res, error };
};
const entry = (values = {}, extra = {}) => ({
  _id: OID, appointmentCode: 'APT-1', appointmentDate: '2026-10-17',
  values: new Map(Object.entries(values)),
  salesValues: new Map(Object.entries({ [SALES_IDS.patientName]: 'vyom', [SALES_IDS.age]: '3', [SALES_IDS.guardianName]: 'rashmi', [SALES_IDS.relationship]: 'mother', [SALES_IDS.gender]: 'Male', [SALES_IDS.city]: 'ghaziabad', [SALES_IDS.state]: 'delhi', [SALES_IDS.fatherOccupation]: 'job', [SALES_IDS.fatherNumber]: '85870 38851', [SALES_IDS.caseCategory]: 'Autism' })),
  ...extra,
});
const withStubs = async (stubs, fn) => {
  const saved = stubs.map(([target, name, value]) => { const old = target[name]; target[name] = value; return [target, name, old]; });
  const audit = SalesSheetAudit.create; SalesSheetAudit.create = async () => ({});
  try { return await fn(); } finally { saved.forEach(([target, name, old]) => { target[name] = old; }); SalesSheetAudit.create = audit; }
};

test('patient id: first letter + ddmmyy + serial starting at 11', () => {
  assert.equal(patientIdFor('vyom', '2026-10-17', 11), 'V-171026-11');
  assert.equal(patientIdFor('  ayaan', '2026-01-05', 12), 'A-050126-12');
  assert.equal(patientIdFor('123', '2026-01-05', 11), 'X-050126-11');
  assert.match(istDate(new Date('2026-10-17T20:00:00Z')), /^2026-10-18$/);
});

test('category and required fields', () => {
  assert.equal(categoryFromCase('Autism + ADHD'), 'autism_adhd');
  assert.equal(categoryFromCase('Mental Health'), 'mental_health');
  assert.equal(categoryFromCase('Other'), '');
  assert.deepEqual(missingForSend({ patientName: 'a', age: '', category: 'autism_adhd', patientHistoryBy: '' }), ['Age']);
  assert.deepEqual(missingForSend({ patientName: 'a', age: '3', category: 'autism_adhd', patientHistoryBy: '' }), []);
});

test('arrival: needs a time when Arrived', async () => {
  await withStubs([[Management, 'findById', async () => entry()]], async () => {
    const { error } = await call(controller.markArrival, { body: { status: 'Arrived', time: '' } });
    assert.equal(error.statusCode, 400);
    const bad = await call(controller.markArrival, { body: { status: 'Gone' } });
    assert.equal(bad.error.statusCode, 400);
  });
});

test('arrival: Arrived + time generates the Patient ID once', async () => {
  const state = { writes: [], seq: 0, stored: '' };
  const stubs = [
    [Management, 'findById', async () => entry({ ...(state.stored ? { [RECEPTION_IDS.patientId]: state.stored } : {}) })],
    [Management, 'updateOne', async (filter, update) => {
      state.writes.push(update.$set);
      const key = `values.${RECEPTION_IDS.patientId}`;
      if (update.$set[key]) { if (state.stored) return { modifiedCount: 0 }; state.stored = update.$set[key]; }
      return { modifiedCount: 1 };
    }],
    [Management, 'exists', async () => null], [Patient, 'exists', async () => null],
    [PatientIdCounter, 'findOneAndUpdate', async () => ({ seq: ++state.seq })],
  ];
  await withStubs(stubs, async () => {
    const first = await call(controller.markArrival, { body: { status: 'Arrived', time: '10:30' } });
    assert.equal(first.error, null);
    assert.equal(first.res.body.generated, true);
    assert.match(first.res.body.patientId, /^V-\d{6}-11$/);
    const second = await call(controller.markArrival, { body: { status: 'Arrived', time: '10:45' } });
    assert.equal(second.res.body.generated, false);
    assert.equal(second.res.body.patientId, first.res.body.patientId);
    assert.equal(state.seq, 1, 'the counter is not used again for the same appointment');
  });
});

test('arrival: Arriving does not create a Patient ID', async () => {
  let counterUsed = false;
  await withStubs([
    [Management, 'findById', async () => entry()],
    [Management, 'updateOne', async () => ({ modifiedCount: 1 })],
    [PatientIdCounter, 'findOneAndUpdate', async () => { counterUsed = true; return { seq: 1 }; }],
  ], async () => {
    const { res } = await call(controller.markArrival, { body: { status: 'Arriving' } });
    assert.equal(res.body.patientId, '');
    assert.equal(counterUsed, false);
  });
});

test('registration: sales details come in pre-filled, saved edits win', async () => {
  await withStubs([[Management, 'findById', async () => entry({ [RECEPTION_IDS.patientId]: 'V-171026-11' })]], async () => {
    const { res } = await call(controller.getRegistration, {});
    const fields = res.body.registration.fields;
    assert.equal(res.body.registration.patientId, 'V-171026-11');
    assert.equal(fields.patientName, 'vyom');
    assert.equal(fields.motherName, 'rashmi');
    assert.equal(fields.fatherName, '');
    assert.equal(fields.primaryCaregiver, 'rashmi - mother');
    assert.equal(fields.gender, 'Male');
    assert.equal(fields.city, 'ghaziabad');
    assert.equal(fields.fatherOccupation, 'job');
    assert.ok(res.body.registration.fieldDefs.some((definition) => definition.key === 'pinCode'));
    assert.equal(fields.fatherNumber, '8587038851');
    assert.equal(fields.category, 'autism_adhd');
  });
  const saved = entry({ [RECEPTION_IDS.patientId]: 'V-171026-11' }, { registration: { status: 'draft', fields: new Map([['patientName', 'Vyom Sharma']]) } });
  await withStubs([[Management, 'findById', async () => saved]], async () => {
    const { res } = await call(controller.getRegistration, {});
    assert.equal(res.body.registration.fields.patientName, 'Vyom Sharma');
    assert.equal(res.body.registration.fields.age, '3');
  });
});

test('send: needs arrival, required fields, an active Post Counselor, and only works once', async () => {
  const fields = { patientName: 'vyom', age: '3', category: 'autism_adhd', patientHistoryBy: 'Mother' };
  await withStubs([[Management, 'findById', async () => entry()]], async () => {
    assert.equal((await call(controller.sendRegistration, { body: { fields, postCounselorId: COUNSELOR } })).error.statusCode, 400);
  });
  const arrived = entry({ [RECEPTION_IDS.patientId]: 'V-171026-11' });
  await withStubs([[Management, 'findById', async () => arrived]], async () => {
    const noAge = await call(controller.sendRegistration, { body: { fields: { ...fields, age: '' }, postCounselorId: COUNSELOR } });
    assert.match(noAge.error.message, /Age/);
    assert.equal((await call(controller.sendRegistration, { body: { fields, postCounselorId: 'nope' } })).error.statusCode, 400);
  });
  let sentDoc = null;
  const sentOnce = { first: true };
  await withStubs([
    [Management, 'findById', async () => arrived],
    [User, 'findOne', () => ({ select: () => ({ lean: async () => ({ _id: COUNSELOR, name: 'Abhishek' }) }) })],
    [Management, 'findOneAndUpdate', async (filter, update) => {
      assert.deepEqual(filter['registration.status'], { $ne: 'sent' });
      if (!sentOnce.first) return null;
      sentOnce.first = false;
      sentDoc = update.$set.registration;
      return entry({ [RECEPTION_IDS.patientId]: 'V-171026-11' }, { registration: { ...sentDoc, fields: new Map(Object.entries(sentDoc.fields)) } });
    }],
  ], async () => {
    const emitted = [];
    const io = { to(room) { emitted.push(room); return this; }, emit(event) { emitted.push(event); } };
    const ok = await call(controller.sendRegistration, { body: { fields, postCounselorId: COUNSELOR }, app: { get: () => io } });
    assert.equal(ok.error, null);
    assert.ok(emitted.includes(`post-counseling:user:${COUNSELOR}`) && emitted.includes('post-counseling:all') && emitted.includes('post-counseling:changed'), 'the counselor is told live');
    assert.equal(sentDoc.status, 'sent');
    assert.equal(sentDoc.postCounselorName, 'Abhishek');
    assert.equal(sentDoc.consultationDate, istDate());
    const again = await call(controller.sendRegistration, { body: { fields, postCounselorId: COUNSELOR } });
    assert.equal(again.error.statusCode, 409);
  });
});

test('post counseling list: a counselor only sees their own patients', async () => {
  let seenFilter = null;
  const sentEntry = entry({ [RECEPTION_IDS.patientId]: 'V-171026-11' }, { registration: { status: 'sent', postCounselor: COUNSELOR, postCounselorName: 'Abhishek', sentAt: new Date(), consultationDate: '2026-10-17', fields: new Map(Object.entries({ patientName: 'vyom', age: '3', category: 'autism_adhd', patientHistoryBy: 'Mother' })) } });
  await withStubs([[Management, 'find', (filter) => { seenFilter = filter; return { sort: () => ({ limit: async () => [sentEntry] }) }; }]], async () => {
    const mine = await call(controller.listPostCounselingPatients, { query: {}, user: { _id: COUNSELOR, role: 'post_counselor', name: 'Abhishek' } });
    assert.equal(seenFilter['registration.postCounselor'], COUNSELOR);
    assert.equal(mine.res.body.patients[0].patientId, 'V-171026-11');
    assert.equal(mine.res.body.patients[0].consultationDate, '2026-10-17');
    await call(controller.listPostCounselingPatients, { query: {}, user: { _id: 'admin', role: 'admin', name: 'Admin' } });
    assert.equal(seenFilter['registration.postCounselor'], undefined);
    const search = await call(controller.listPostCounselingPatients, { query: { q: 'zzz' }, user: { _id: 'admin', role: 'admin', name: 'Admin' } });
    assert.equal(search.res.body.patients.length, 0);
  });
});
