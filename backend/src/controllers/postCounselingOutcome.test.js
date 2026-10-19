const { test } = require('node:test');
const assert = require('node:assert/strict');
const controller = require('./postCounselingRecordController');
const Management = require('../models/AppointmentManagementEntry');
const PackageNotBoughtPatient = require('../models/PackageNotBoughtPatient');
const Patient = require('../models/Patient');
const SalesSheetAudit = require('../models/SalesSheetAudit');
const User = require('../models/User');
const ConsultationReceipt = require('../models/ConsultationReceipt');
const SalesAppointment = require('../models/SalesAppointment');
const { cleanRecord } = require('../utils/postCounselingRecord');
const { cleanPurchase, totals } = require('../utils/purchaseOrderRecord');

const OID = 'a'.repeat(24);
const COUNSELOR = 'b'.repeat(24);
const PATIENT_OID = 'c'.repeat(24);
const PNB_OID = 'd'.repeat(24);
const counselor = { _id: COUNSELOR, role: 'post_counselor', name: 'Abhishek' };

test('purchase: totals are worked out and a bad amount is refused', () => {
  const card = cleanPurchase({ mode: 'Card (+3%)', amountReceivedNow: '10000', plan: '2 Parts', part1Amount: '10000' }, 42000);
  assert.equal(card.totals.cardCharge, 300);
  assert.equal(card.totals.outstandingBalance, 32000);
  assert.equal(card.totals.poValue, 42000);
  assert.equal(card.totals.partPayment, 10000);
  assert.equal(totals({ mode: 'Cash', amountReceivedNow: 5000 }, 42000).cardCharge, 0);
  assert.throws(() => cleanPurchase({ amountReceivedNow: '50000' }, 42000), /cannot be more/);
  assert.throws(() => cleanPurchase({ paymentTime: '25:99' }, 42000), /time/);
  const cash = cleanPurchase({ mode: 'Cash', utrReference: 'x', cashHandedTo: 'Prachi', amountReceivedNow: 1000 }, 42000);
  assert.equal(cash.values.utrReference, '', 'a UTR does not belong to a cash payment');
});

const record = () => cleanRecord({ components: { selected: ['dosDontsDiet', 'ayurvedicFormulations', 'panchakarmaKit'], ayurvedicPrice: '68000' }, e: { concession: '62000', paymentPlan: '2 Parts' }, b: { decision: 'Proceeding' } });
const baseFields = { patientName: 'Riddhima', age: '4', category: 'autism_adhd', fatherName: 'Rajnish', motherName: 'Sonam', fatherNumber: '8800611900', motherNumber: '6265219550', city: 'Delhi', pinCode: '110021', patientHistoryBy: 'Mother' };
const makeEntry = (extra = {}) => {
  const rec = record();
  const purchase = cleanPurchase({ mode: 'Online', amountReceivedNow: '10000', utrReference: '166901178274', poNo: 'PO-9', poDate: '2026-10-18', orderedTreatment: 'Autism / Phase 1', paymentTime: '15:10', paymentVerifiedBy: 'Accounts', transactionId: 'TXN-77', payToBank: 'b1'.padEnd(24, '0'), paymentDate: '2026-10-19', paymentNotes: 'first part', screenshots: [{ url: '/uploads/payments/1-2.png', fileName: 'proof.png' }, { url: 'https://evil.test/x.png', fileName: 'bad' }] }, rec.totals.approvedProgramFee);
  purchase.values.payToBankName = 'Manovaidya Ayurveda';
  return {
    _id: OID, appointmentCode: 'APT-1', appointmentDate: '2026-10-18',
    values: new Map([['6abb6329297d3a5387593670', 'R-3440']]), salesValues: new Map(),
    sourceAppointment: 's'.repeat(24),
    registration: { status: 'sent', postCounselor: COUNSELOR, postCounselorName: 'Abhishek', consultationDate: '2026-10-18', sentByName: 'Prachi', fields: new Map(Object.entries(baseFields)) },
    postCounseling: { savedAt: new Date(), record: rec, purchase: { savedAt: new Date(), values: purchase.values, totals: purchase.totals } },
    ...extra,
  };
};
const run = async (handler, body, entry, options = {}) => {
  const restore = [];
  const stub = (target, name, fn) => { const old = target[name]; target[name] = fn; restore.push(() => { target[name] = old; }); };
  const log = { claims: [], updates: [], patients: [], deleted: false, pnb: [], receiptLinks: [] };
  stub(Management, 'findById', async () => entry);
  stub(Management, 'findOneAndUpdate', async (filter, update) => { log.claims.push({ filter, update }); return options.claim === null ? null : entry; });
  stub(Management, 'updateOne', async (filter, update) => { log.updates.push(update); return {}; });
  stub(SalesSheetAudit, 'create', async () => ({}));
  stub(Patient, 'findOne', async () => null);
  stub(ConsultationReceipt, 'updateMany', async (filter, update) => { log.receiptLinks.push({ filter, update }); return {}; });
  stub(SalesAppointment, 'find', () => ({ select: () => ({ lean: async () => [{ _id: 's'.repeat(24), consultationAccount: 'k'.repeat(24) }] }) }));
  stub(User, 'findOne', async () => ({ _id: COUNSELOR, name: 'Abhishek' }));
  stub(Patient, 'create', async (doc) => {
    const created = { _id: PATIENT_OID, ...doc, stages: doc.stages.map((stage) => ({ ...stage, payments: [...(stage.payments || [])] })), activityLog: [...doc.activityLog], save: async () => {}, deleteOne: async () => { log.deleted = true; } };
    log.patients.push(created);
    return created;
  });
  stub(PackageNotBoughtPatient, 'create', async (doc) => { log.pnb.push(doc); return { _id: PNB_OID, ...doc }; });
  const res = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(payload) { this.body = payload; } };
  let error = null;
  try { await handler({ params: { id: OID }, body, user: counselor, app: { get: () => null } }, res, (e) => { error = e; }); } finally { restore.forEach((fn) => fn()); }
  return { res, error, log };
};

test('convert: creates the patient with registration details, Phase 1 package, PO and the payment received', async () => {
  const { res, error, log } = await run(controller.convertToPatient, {}, makeEntry());
  assert.equal(error, null);
  const patient = log.patients[0];
  assert.equal(patient.patientCode, 'R-3440');
  assert.equal(patient.patientName, 'Riddhima');
  assert.equal(patient.number, '8800611900');
  assert.equal(patient.alternateNumber, '6265219550');
  assert.equal(patient.guardianName, 'Rajnish');
  assert.equal(patient.city, 'Delhi', 'child & family details go to the patient');
  assert.equal(patient.pinCode, '110021');
  const phase = patient.stages.find((stage) => stage.number === 1);
  assert.equal(phase.packageName, 'Autism / Phase 1');
  assert.equal(phase.purchaseOrder, 'PO-9');
  assert.equal(phase.totalAmount, 42000);
  assert.equal(phase.postCounselor, COUNSELOR);
  assert.equal(phase.payments.length, 1);
  assert.equal(phase.payments[0].amount, 10000);
  assert.equal(phase.payments[0].paymentMode, 'online');
  assert.equal(phase.payments[0].utr, '166901178274');
  assert.equal(phase.payments[0].transactionId, 'TXN-77');
  assert.equal(phase.payments[0].payToBankName, 'Manovaidya Ayurveda');
  assert.equal(String(phase.payments[0].payToBank), 'b1'.padEnd(24, '0'));
  assert.deepEqual(phase.payments[0].screenshotFiles, [{ url: '/uploads/payments/1-2.png', fileName: 'proof.png' }], 'only uploaded screenshots are kept');
  assert.equal(phase.payments[0].screenshotUrl, '/uploads/payments/1-2.png');
  assert.equal(new Date(phase.payments[0].date).toISOString().slice(0, 10), '2026-10-19');
  assert.match(phase.payments[0].notes, /first part/);
  assert.equal(phase.payments[0].approvalStatus, 'pending');
  assert.match(phase.payments[0].notes, /PO PO-9/);
  assert.deepEqual(log.claims[0].filter['postCounseling.outcome.kind'], { $in: [null, ''] });
  assert.equal(log.claims[0].update.$set['postCounseling.outcome.kind'], 'converted');
  assert.equal(res.body.patientId, PATIENT_OID);
  // the consultation fee (e.g. Rs 599) paid against the appointment now belongs to the patient
  const link = log.receiptLinks[0];
  assert.deepEqual(link.filter.$or[0], { appointment: OID });
  assert.deepEqual(link.filter.$or[1], { salesAppointment: { $in: ['s'.repeat(24), 'k'.repeat(24)] } });
  assert.equal(link.filter.patient, null, 'receipts already linked to someone are left alone');
  assert.equal(String(link.update.$set.patient), PATIENT_OID);
  assert.equal(link.update.$set.patientCode, 'R-3440');
});

test('convert: a cash payment is saved as cash, and no payment is made when nothing was received', async () => {
  const entry = makeEntry();
  entry.postCounseling.purchase.values = { ...entry.postCounseling.purchase.values, mode: 'Cash', utrReference: '', cashHandedTo: 'Prachi', amountReceivedNow: 5000 };
  const cash = await run(controller.convertToPatient, {}, entry);
  const payment = cash.log.patients[0].stages.find((stage) => stage.number === 1).payments[0];
  assert.equal(payment.paymentMode, 'cash');
  assert.equal(payment.receivedBy, 'Prachi');
  assert.equal(payment.payToBank, null, 'a cash payment has no bank');
  assert.deepEqual(payment.screenshotFiles, []);
  const zero = makeEntry();
  zero.postCounseling.purchase.values = { ...zero.postCounseling.purchase.values, amountReceivedNow: '' };
  const none = await run(controller.convertToPatient, {}, zero);
  assert.equal(none.log.patients[0].stages.find((stage) => stage.number === 1).payments.length, 0);
});

test('convert: a second press, or missing steps, create nothing', async () => {
  const lost = await run(controller.convertToPatient, {}, makeEntry(), { claim: null });
  assert.equal(lost.error.statusCode, 409);
  assert.equal(lost.log.patients.length, 0);
  const noPurchase = await run(controller.convertToPatient, {}, makeEntry({ postCounseling: { savedAt: new Date(), record: record() } }));
  assert.match(noPurchase.error.message, /purchase order/i);
  const noRecord = await run(controller.convertToPatient, {}, makeEntry({ postCounseling: undefined }));
  assert.match(noRecord.error.message, /record first/);
  const otherEntry = makeEntry();
  otherEntry.registration.postCounselor = 'f'.repeat(24);
  const other = await run(controller.convertToPatient, {}, otherEntry);
  assert.equal(other.error.statusCode, 403);
});

test('convert: a problem with the details frees the decision again and leaves no patient behind', async () => {
  const entry = makeEntry();
  entry.registration.fields = new Map(Object.entries({ patientName: 'Riddhima', age: '4', category: 'autism_adhd', fatherNumber: '8800611900' }));
  const { error, log } = await run(controller.convertToPatient, {}, entry);
  assert.match(error.message, /Father\/Mother name/);
  assert.equal(log.patients.length, 0);
  assert.equal(log.updates.some((update) => update.$set?.['postCounseling.outcome.kind'] === null), true, 'the claim is released');
  const fixed = await run(controller.convertToPatient, { guardianName: 'Rajnish' }, entry);
  assert.equal(fixed.error, null, 'the father/mother name can be supplied when converting');
});

test('not purchased: needs a reason, then creates the Package Not Bought record with the package details', async () => {
  const none = await run(controller.markNotPurchased, {}, makeEntry());
  assert.match(none.error.message, /why/i);
  const withoutPurchase = makeEntry({ postCounseling: { savedAt: new Date(), record: record() } });
  const { res, error, log } = await run(controller.markNotPurchased, { reason: 'Needs time', followUpDate: '2026-10-25' }, withoutPurchase);
  assert.equal(error, null);
  const row = log.pnb[0];
  assert.equal(row.patientName, 'Riddhima');
  assert.equal(row.patientId, 'R-3440');
  assert.equal(row.parentName, 'Rajnish');
  assert.equal(row.fatherNumber, '8800611900');
  assert.equal(row.reason, 'Needs time');
  assert.equal(row.followUps.length, 1);
  assert.equal(row.packageDetails.approvedProgramFee, 42000);
  assert.equal(row.packageDetails.referenceValue, 104000);
  assert.deepEqual(row.packageDetails.components.map((item) => item.price), [18000, 68000, 18000]);
  assert.equal(row.profile.city, 'Delhi');
  assert.equal(log.claims[0].update.$set['postCounseling.outcome.kind'], 'not_purchased');
  assert.equal(res.body.packageNotBoughtId, PNB_OID);
  const again = await run(controller.markNotPurchased, { reason: 'x' }, withoutPurchase, { claim: null });
  assert.equal(again.error.statusCode, 409);
  assert.equal(again.log.pnb.length, 0);
});
