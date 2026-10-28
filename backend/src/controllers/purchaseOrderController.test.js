const { test, afterEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const Patient = require('../models/Patient');
const PurchaseOrder = require('../models/PurchaseOrder');
const controller = require('./purchaseOrderController');
const { nextPoNumber, createWithPoNumber } = require('../utils/poNumber');
const { buildPoView } = require('../utils/purchaseOrderFlow');
const { migrateLegacyPurchaseOrders } = require('../utils/purchaseOrderMigration');
const { ageBandFor, supplyOption, SUPPLY_OPTIONS } = require('../constants/supplyPlans');

afterEach(() => mock.restoreAll());
const transit = { _id: new mongoose.Types.ObjectId(), name: 'Transit', role: 'in_transit' };
const counselor = { _id: new mongoose.Types.ObjectId(), name: 'Counselor', role: 'post_counselor' };
const file = { filename: 'proof.png', originalname: 'proof.png' };

const makePatient = (extra = {}) => {
  const patient = new Patient({ patientName: 'Aarav', patientCode: 'A-221026-11', guardianName: 'Parent', category: 'autism_adhd', number: '9999999999', age: '7', approvalStatus: 'pending', ...extra });
  patient.save = async () => { await patient.validate(); return patient; };
  mock.method(Patient, 'findById', (id) => {
    const result = Promise.resolve(String(id) === String(patient._id) ? patient : null);
    result.lean = async () => (String(id) === String(patient._id) ? patient.toObject() : null);
    result.populate = () => result;
    return result;
  });
  return patient;
};
// An in-memory PurchaseOrder collection: create/findById/exists/deleteOne work on real documents.
const memoryPos = () => {
  const docs = [];
  mock.method(PurchaseOrder, 'exists', async (filter) => docs.find((d) => Object.entries(filter).every(([k, v]) => String(d[k]) === String(v))) || null);
  mock.method(PurchaseOrder, 'create', async (data) => {
    if (data.generated && docs.some((d) => d.generated && d.poNumber === data.poNumber)) throw Object.assign(new Error('dup'), { code: 11000, keyPattern: { poNumber: 1 } });
    const doc = new PurchaseOrder(data);
    doc.save = async () => { await doc.validate(); return doc; };
    docs.push(doc);
    return doc;
  });
  mock.method(PurchaseOrder, 'findById', async (id) => docs.find((d) => String(d._id) === String(id)) || null);
  mock.method(PurchaseOrder, 'deleteOne', async ({ _id }) => { const i = docs.findIndex((d) => String(d._id) === String(_id)); if (i >= 0) docs.splice(i, 1); });
  return docs;
};
const call = async (handler, { params = {}, body = {}, files, user = transit } = {}) => {
  let payload; let status = 200; let failure;
  await handler({ params, body, files, user, query: {} }, { status(c) { status = c; return this; }, json(v) { payload = v; } }, (e) => { failure = e; });
  if (failure) throw failure;
  return { status, ...payload };
};

test('PO numbers are PO- plus 4 digits, never repeat, and move to 5 digits only when 4 digits are used up', async () => {
  const taken = new Set();
  const Model = { exists: async ({ poNumber }) => taken.has(poNumber) };
  for (let i = 0; i < 200; i += 1) {
    const n = await nextPoNumber(Model);
    assert.match(n, /^PO-[1-9]\d{3}$/);
    assert.ok(!taken.has(n), 'a used number is never handed out again');
    taken.add(n);
  }
  const full = { exists: async ({ poNumber }) => /^PO-\d{4}$/.test(poNumber) };
  assert.match(await nextPoNumber(full), /^PO-\d{5}$/);
  // Two people racing for the same number: the unique index refuses one and it simply takes another number.
  let attempts = 0;
  const racing = { exists: async () => false, create: async (d) => { attempts += 1; if (attempts === 1) throw Object.assign(new Error('dup'), { code: 11000, keyPattern: { poNumber: 1 } }); return d; } };
  const created = await createWithPoNumber(racing, { phase: 1 });
  assert.equal(attempts, 2);
  assert.equal(created.generated, true);
});

test('supply categories and age bands follow the Formulation Master', () => {
  assert.deepEqual(SUPPLY_OPTIONS.map((o) => `${o.key}=${o.months}`), ['6M:full=6', '1+5:first=1', '1+5:rest=5', '2+4:first=2', '2+4:rest=4']);
  assert.equal(supplyOption('1+5', 'full'), null, 'a part must belong to its plan');
  assert.deepEqual(['3', '4', '4.5', '12', '13 years', '70', '71', '2', ''].map(ageBandFor), ['3-4', '3-4', '4-12', '4-12', '12-70', '12-70', '70+', '', '']);
});

const shot = { url: '/uploads/payments/1-2.png', fileName: 'proof.png' };
// A new PO is filled on the same PO paper as at conversion.
const paperBody = (patient, { phase = '1', fee = '42000', supplyKey = '6M:full', ...values } = {}) => ({
  patientId: String(patient._id), phase, fee,
  purchase: { mode: 'Cash', supplyOrder: SUPPLY_OPTIONS.find((o) => o.key === supplyKey)?.label || '', poDate: '2026-10-22', orderedTreatment: `Autism / Phase ${phase}`, ...values },
});

test('creating a PO from the PO paper generates the number, saves the payment as pending and links it', async () => {
  const patient = makePatient();
  const docs = memoryPos();
  const res = await call(controller.createPurchaseOrder, {
    user: counselor,
    body: paperBody(patient, { phase: '2', fee: '12000', supplyKey: '1+5:first', mode: 'Online', amountReceivedNow: '5000', utrReference: 'UTR-77', transactionId: 'T-1', screenshots: [shot], paperImages: [shot], medicineReadyDate: '2026-11-02', poNo: 'PO-typed' }),
  });
  assert.equal(res.status, 201);
  const po = res.purchaseOrder;
  assert.match(po.poNumber, /^PO-\d{4}$/, 'a typed PO number is ignored: it is generated');
  assert.equal(po.status, 'pending');
  assert.equal(po.supplyLabel, '1+5: First 1 month');
  assert.equal(po.paperImages.length, 1);
  assert.equal(po.amount, 12000);
  const stage = patient.stages.find((s) => s.number === 2);
  assert.equal(stage.payments.length, 1);
  assert.equal(stage.payments[0].approvalStatus, 'pending');
  assert.equal(stage.payments[0].utr, 'UTR-77');
  assert.deepEqual(stage.payments[0].screenshotFiles.map((f) => f.url), [shot.url]);
  assert.match(stage.payments[0].notes, new RegExp(po.poNumber));
  assert.equal(String(docs[0].paymentIds[0]), String(stage.payments[0]._id));
  assert.equal(docs[0].paperValues.poNo, po.poNumber, 'the whole PO paper is kept with the PO');
  assert.equal(stage.purchaseOrder, po.poNumber, 'the phase points at its first PO so the older screens keep working');
  assert.equal(stage.poPaper.values.poNo, po.poNumber, 'Patient Details shows the PO paper of the phase');
  assert.equal(stage.totalAmount, 12000);
  assert.equal(po.steps.find((s) => s.key === 'details').state, 'current', 'In Transit checks the PO details first');
});

test('a cash payment needs who received it; online needs UTR and screenshot; nothing is created otherwise', async () => {
  const patient = makePatient();
  const docs = memoryPos();
  await assert.rejects(call(controller.createPurchaseOrder, { body: paperBody(patient, { mode: 'Online', amountReceivedNow: '5000' }) }), /UTR/);
  await assert.rejects(call(controller.createPurchaseOrder, { body: paperBody(patient, { mode: 'Online', amountReceivedNow: '5000', utrReference: 'U-1' }) }), /screenshot/);
  await assert.rejects(call(controller.createPurchaseOrder, { body: paperBody(patient, { mode: 'Cash', amountReceivedNow: '5000' }) }), /cash/);
  await assert.rejects(call(controller.createPurchaseOrder, { body: paperBody(patient, { supplyKey: '' }) }), /medicine supply/);
  await assert.rejects(call(controller.createPurchaseOrder, { body: paperBody(patient, { mode: '' }) }), /payment mode/);
  await assert.rejects(call(controller.createPurchaseOrder, { body: paperBody(patient, { amountReceivedNow: '50000' }) }), /cannot be more/);
  assert.equal(docs.length, 0, 'no PO number is used up');
  assert.equal(patient.stages[0].payments.length, 0);
  const cash = (await call(controller.createPurchaseOrder, { body: paperBody(patient, { amountReceivedNow: '5000', cashReceiver: 'Prachi' }) })).purchaseOrder;
  assert.equal(cash.payments[0].mode, 'cash');
  assert.equal(cash.payments[0].receivedBy, 'Prachi');
});

test('In Transit verifies the PO details first, then the payment; the payment counts in the PO phase', async () => {
  const patient = makePatient();
  memoryPos();
  // Phase 1 already has an older verified payment; the new PO's payment is added next to it.
  patient.stages[0].payments.push({ amount: 2000, approvalStatus: 'approved' });
  const created = (await call(controller.createPurchaseOrder, { body: paperBody(patient, { amountReceivedNow: '10000', cashReceiver: 'Prachi' }) })).purchaseOrder;
  await assert.rejects(call(controller.verifyPayment, { params: { id: created.id } }), /details first/);
  const details = (await call(controller.verifyDetails, { params: { id: created.id } })).purchaseOrder;
  assert.equal(details.status, 'pending');
  assert.equal(details.detailsVerified, true);
  assert.equal(patient.approvalStatus, 'approved', 'the patient is approved with the PO details');
  assert.equal(patient.stages[0].payments[1].approvalStatus, 'pending', 'the payment waits for its own check');
  assert.equal(details.steps.find((s) => s.key === 'payment').state, 'current');
  assert.match(details.requestBlockedReason, /payment/);
  await assert.rejects(call(controller.verifyDetails, { params: { id: created.id } }), /already verified/);
  const verified = (await call(controller.verifyPayment, { params: { id: created.id } })).purchaseOrder;
  assert.equal(verified.status, 'verified');
  assert.equal(verified.paymentVerifiedByName, 'Transit');
  assert.equal(patient.stages[0].payments.length, 2, 'an additional payment in the same phase');
  assert.equal(patient.stages[0].payments[1].approvalStatus, 'approved');
  assert.equal(verified.phasePayment.amountPaid, 12000, 'both payments count for the phase');
  assert.equal(verified.steps.find((s) => s.key === 'requested').state, 'current');
  assert.equal(verified.canRequestMedicine, true);
  await assert.rejects(call(controller.verifyPayment, { params: { id: created.id } }), /already verified/);
});

const verifyBoth = async (id) => { await call(controller.verifyDetails, { params: { id } }); await call(controller.verifyPayment, { params: { id } }); };

test('a rejected PO needs a reason and goes back to verification once corrected', async () => {
  const patient = makePatient();
  memoryPos();
  const created = (await call(controller.createPurchaseOrder, { body: paperBody(patient) })).purchaseOrder;
  await assert.rejects(call(controller.rejectPurchaseOrder, { params: { id: created.id }, body: {} }), /why/);
  const rejected = (await call(controller.rejectPurchaseOrder, { params: { id: created.id }, body: { reason: 'Wrong amount' } })).purchaseOrder;
  assert.equal(rejected.stageKey, 'rejected');
  await assert.rejects(call(controller.requestMedicine, { params: { id: created.id } }), /Verify the PO details/);
  const fixed = (await call(controller.updatePurchaseOrder, { params: { id: created.id }, body: { amount: '40000' }, user: counselor })).purchaseOrder;
  assert.equal(fixed.status, 'pending');
  assert.equal(fixed.amount, 40000);
});

test('medicine request: one per PO, with supply category, age band and ready date (no prescription upload)', async () => {
  const patient = makePatient({ approvalStatus: 'approved' });
  memoryPos();
  const created = (await call(controller.createPurchaseOrder, { body: paperBody(patient, { supplyKey: '1+5:first' }) })).purchaseOrder;
  await verifyBoth(created.id);
  const body = { supplyKey: '1+5:first', ageBand: '4-12', medicines: 'Medhya ghrit, Shiva-leh', readyByDate: '2026-11-02' };
  await assert.rejects(call(controller.requestMedicine, { params: { id: created.id }, body: { ...body, ageBand: '' }, files: [file] }), /age group/);
  const res = (await call(controller.requestMedicine, { params: { id: created.id }, body, files: [] })).purchaseOrder;
  const request = patient.stages[0].medicineRequests[0];
  assert.equal(request.status, 'requested');
  assert.equal(request.poNumber, created.poNumber);
  assert.equal(request.supplyPlan, '1+5');
  assert.equal(request.supplyPart, 'first');
  assert.equal(request.ageBand, '4-12');
  assert.equal(String(request.purchaseOrderId), created.id);
  assert.equal(res.medicine.requestId, request.requestId);
  assert.equal(res.stageKey, 'medicine');
  assert.equal(res.steps.find((s) => s.key === 'accepted').state, 'current');
  assert.ok(patient.activityLog.some((e) => e.action === 'Medicine requested for Phase 1'), 'shows in the phase activity used by In Transit');
  await assert.rejects(call(controller.requestMedicine, { params: { id: created.id }, body, files: [file] }), /already requested/);
});

test('In Transit can make the PO phase the current phase', async () => {
  const patient = makePatient({ approvalStatus: 'approved' });
  memoryPos();
  const created = (await call(controller.createPurchaseOrder, { body: paperBody(patient, { phase: '2' }) })).purchaseOrder;
  await assert.rejects(call(controller.activatePhase, { params: { id: created.id } }), /Verify/);
  await verifyBoth(created.id);
  await call(controller.activatePhase, { params: { id: created.id } });
  assert.equal(patient.currentStage, 2);
});

test('the pipeline follows the medicine request and courier records', () => {
  const patient = new Patient({ patientName: 'B', guardianName: 'P', category: 'autism_adhd', number: '1', age: '5' }).toObject();
  const stage = patient.stages[0];
  stage.medicineRequests = [{ requestId: 'r1', status: 'sent_to_courier', requestedAt: new Date(), inProcessAt: new Date(), madeAt: new Date(), sentToCourierAt: new Date(), courier: { status: 'delivered', deliveryMode: 'courier', dispatchedAt: new Date(), deliveredAt: new Date() } }];
  const view = buildPoView({ _id: new mongoose.Types.ObjectId(), poNumber: 'PO-1234', phase: 1, status: 'verified', medicineRequestId: 'r1', paymentIds: [], createdAt: new Date() }, patient);
  assert.deepEqual(view.steps.filter((s) => s.state === 'done').map((s) => s.key), ['created', 'details', 'payment', 'requested', 'accepted', 'ready', 'fullpay', 'released', 'handover', 'received']);
  assert.equal(view.stageKey, 'treatment');
  assert.equal(view.suggestedAgeBand, '4-12');
});

test('migration imports old phase POs once, without touching the patient', async () => {
  const patientId = new mongoose.Types.ObjectId();
  const paymentId = new mongoose.Types.ObjectId();
  const patients = [{ _id: patientId, patientName: 'Old', approvalStatus: 'approved', stages: [
    { number: 1, purchaseOrder: '123', totalAmount: 42000, packageName: 'Autism', payments: [{ _id: paymentId, amount: 42000, approvalStatus: 'approved' }], transit: {}, poPaper: { values: { paperImages: [{ url: '/uploads/payments/a.png', fileName: 'a' }] } }, medicineRequests: [{ requestId: 'r9', status: 'made', requestedAt: new Date() }] },
    { number: 2, purchaseOrder: '', payments: [] },
  ] }];
  const created = [];
  const Model = { exists: async (f) => created.some((d) => String(d.patient) === String(f.patient) && d.phase === f.phase), create: async (d) => { created.push(d); return d; } };
  const PatientModel = { find: () => ({ select: () => ({ lean: async () => patients }) }) };
  assert.equal((await migrateLegacyPurchaseOrders({ Patient: PatientModel, PurchaseOrder: Model })).created, 1);
  assert.equal((await migrateLegacyPurchaseOrders({ Patient: PatientModel, PurchaseOrder: Model })).created, 0, 'running again creates nothing');
  const po = created[0];
  assert.equal(po.poNumber, '123', 'the old number is kept as it was');
  assert.equal(po.generated, false);
  assert.equal(po.source, 'legacy');
  assert.equal(po.status, 'verified');
  assert.equal(po.medicineRequestId, 'r9');
  assert.deepEqual(po.paymentIds, [paymentId]);
  assert.equal(po.paperImages.length, 1);
});

test('actionBy names the role whose turn it is, and empties once the step is done', () => {
  const { actionByOf } = require('../utils/purchaseOrderFlow');
  const { jobActionBy } = require('./medicineJobController');
  assert.deepEqual(actionByOf({ status: 'pending' }, 'details', false), ['admin', 'doctor', 'in_transit']);
  assert.ok(actionByOf({ status: 'verified' }, 'requested', false).includes('in_transit'), 'a blocked request is still for In Transit to clear');
  assert.ok(actionByOf({ status: 'verified' }, 'ready', false).includes('medicine_department'));
  assert.ok(actionByOf({ status: 'verified' }, 'scheduled', false).includes('in_transit'));
  assert.deepEqual(actionByOf({ status: 'verified' }, 'explained', false), ['admin', 'assistant_doctor']);
  assert.deepEqual(actionByOf({ status: 'verified' }, undefined, false), [], 'treatment started: nobody');
  assert.ok(actionByOf({ status: 'rejected' }, 'details', false).includes('post_counselor'));
  assert.ok(jobActionBy({ status: 'open', currentStage: 0 }).includes('medicine_department'));
  assert.deepEqual(jobActionBy({ status: 'released', currentStage: 12 }), []);
});

const admin = { _id: new mongoose.Types.ObjectId(), name: 'Super Admin', role: 'admin' };

test('ready date and supply come from post counselling: In Transit cannot change them and passes them on', async () => {
  const patient = makePatient({ approvalStatus: 'approved' });
  memoryPos();
  const created = (await call(controller.createPurchaseOrder, { body: paperBody(patient, { supplyKey: '1+5:first', medicineReadyDate: '2026-11-05' }) })).purchaseOrder;
  await assert.rejects(call(controller.updatePurchaseOrder, { params: { id: created.id }, body: { supplyKey: '6M:full' } }), /supply is set by post counselling/);
  await assert.rejects(call(controller.updatePurchaseOrder, { params: { id: created.id }, body: { medicineReadyDate: '2026-11-20' } }), /ready date is set by post counselling/);
  // Sending the same values is not a change.
  await call(controller.updatePurchaseOrder, { params: { id: created.id }, body: { supplyKey: '1+5:first', medicineReadyDate: '2026-11-05' } });
  await verifyBoth(created.id);
  // In Transit sends a different supply and date: the request still carries the ones from the PO paper.
  await call(controller.requestMedicine, { params: { id: created.id }, body: { supplyKey: '6M:full', ageBand: '4-12', medicines: 'As per master', readyByDate: '2026-12-01' }, files: [file] });
  const request = patient.stages[0].medicineRequests[0];
  assert.equal(`${request.supplyPlan}:${request.supplyPart}`, '1+5:first');
  assert.equal(request.readyByDate.toISOString(), new Date('2026-11-05T00:00:00.000+05:30').toISOString());
});

test('the admin can still correct the ready date and supply', async () => {
  const patient = makePatient({ approvalStatus: 'approved' });
  memoryPos();
  const created = (await call(controller.createPurchaseOrder, { body: paperBody(patient, { supplyKey: '1+5:first', medicineReadyDate: '2026-11-05' }) })).purchaseOrder;
  const fixed = (await call(controller.updatePurchaseOrder, { params: { id: created.id }, body: { supplyKey: '6M:full', medicineReadyDate: '2026-11-08' }, user: admin })).purchaseOrder;
  assert.equal(fixed.supplyPlan, '6M');
  assert.match(fixed.medicineReadyDate, /^2026-11-0[78]/);
});

const postCounselor = { _id: new mongoose.Types.ObjectId(), name: 'Abhishek', role: 'post_counselor' };

test('only the Post Counselor changes the ready date, supply and age group, and only until the request is accepted', async () => {
  const MedicineJob = require('../models/MedicineJob');
  const oldFindOne = MedicineJob.findOne;
  MedicineJob.findOne = (...args) => { const q = Promise.resolve(null); q.lean = async () => null; return q; };
  try {
    const patient = makePatient({ approvalStatus: 'approved' });
    memoryPos();
    const created = (await call(controller.createPurchaseOrder, { body: paperBody(patient, { supplyKey: '1+5:first', medicineReadyDate: '2026-11-05', patientAge: '6' }) })).purchaseOrder;
    assert.equal(created.ageBand, '4-12', 'the age group comes from the PO paper');
    await assert.rejects(call(controller.updatePlan, { params: { id: created.id }, body: { medicineReadyDate: '2026-11-09' } }), /Only the Post Counselor/);
    await verifyBoth(created.id);
    // In Transit cannot pick another age group either.
    await call(controller.requestMedicine, { params: { id: created.id }, body: { ageBand: '12-70', medicines: 'As per master' }, files: [file] });
    const request = patient.stages[0].medicineRequests[0];
    assert.equal(request.ageBand, '4-12');
    // Before the Medicine Department accepts: the Post Counselor changes them, and the waiting request follows.
    const changed = (await call(controller.updatePlan, { params: { id: created.id }, body: { medicineReadyDate: '2026-11-09', supplyKey: '6M:full', patientAge: '20' }, user: postCounselor })).purchaseOrder;
    assert.equal(changed.supplyPlan, '6M');
    assert.equal(changed.ageBand, '12-70');
    assert.equal(request.readyByDate.toISOString(), new Date('2026-11-09T00:00:00.000+05:30').toISOString());
    assert.equal(request.supplyPlan, '6M');
    assert.equal(request.ageBand, '12-70');
    assert.ok(patient.activityLog.some((e) => /plan changed/.test(e.action)));
    // Once the Medicine Department accepts, the plan is fixed for the Post Counselor too.
    request.status = 'in_process';
    await assert.rejects(call(controller.updatePlan, { params: { id: created.id }, body: { medicineReadyDate: '2026-11-20' }, user: postCounselor }), /already accepted/);
  } finally {
    MedicineJob.findOne = oldFindOne;
  }
});
