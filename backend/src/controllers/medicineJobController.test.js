const { test, afterEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const Patient = require('../models/Patient');
const MedicineJob = require('../models/MedicineJob');
const StockItem = require('../models/StockItem');
const StockTransaction = require('../models/StockTransaction');
const controller = require('./medicineJobController');
const { formulationFor, stockNeeds, chitsFor } = require('../constants/formulationMaster');
const { STAGES, buildJobView, jobSummary } = require('../utils/medicineJobFlow');
const { SAMPLE_STOCKS, seedSampleStocks } = require('../utils/stockSeed');

afterEach(() => mock.restoreAll());
const med = { _id: new mongoose.Types.ObjectId(), name: 'Meena', role: 'medicine_department' };
const med2 = { _id: new mongoose.Types.ObjectId(), name: 'Prachi', role: 'medicine_department' };
const doctor = { _id: new mongoose.Types.ObjectId(), name: 'Dr Garg', role: 'doctor' };
const transit = { _id: new mongoose.Types.ObjectId(), name: 'Transit', role: 'in_transit' };
const manager = { _id: new mongoose.Types.ObjectId(), name: 'Manager', role: 'manager' };
const pcc = { _id: new mongoose.Types.ObjectId(), name: 'Aditi', role: 'assistant_doctor' };
const otherPcc = { _id: new mongoose.Types.ObjectId(), name: 'Neha', role: 'assistant_doctor' };
const InventorySetting = require('../models/InventorySetting');
const file = { filename: 'a.png', originalname: 'photoA.png' };

test('formulation master: six-month totals split into parts exactly as the packing table', () => {
  const full = formulationFor({ ageBand: '3-4', plan: '6M', part: 'full' });
  const by = (f, key) => f.lines.find((l) => l.key === key);
  assert.equal(by(full, 'ghrit').qty, 225); assert.equal(by(full, 'ghrit').bottles, 3);
  assert.equal(by(full, 'shivaLeh').qty, 150); assert.deepEqual(by(full, 'shivaLeh').containers, [180]);
  assert.equal(by(full, 'oil').qty, 300);
  assert.equal(by(full, 'nasya').packed, false, 'no nasya under 4 years');
  assert.equal(full.papers.length, 5, 'treatment papers go with the first supply');
  const first = formulationFor({ ageBand: '3-4', plan: '1+5', part: 'first' });
  assert.equal(by(first, 'ghrit').qty, 37.5);
  assert.deepEqual(by(first, 'mix').components.map((c) => c.qty), [2.5, 7.5, 7.5, 1, 1]);
  assert.equal(by(first, 'mix').components[0].grams, 0.75);
  const rest = formulationFor({ ageBand: '12-70', plan: '1+5', part: 'rest' });
  assert.equal(by(rest, 'ghrit').qty, 750); assert.equal(by(rest, 'shivaLeh').qty, 450);
  assert.deepEqual(by(rest, 'shivaLeh').containers, [75, 75]);
  assert.equal(rest.papers.length, 0, 'papers are not repeated on the second supply');
  assert.equal(rest.lines.some((l) => l.key === 'abhyang'), false, 'abhyang oil only on the first supply');
  const big = formulationFor({ ageBand: '12-70', plan: '6M', part: 'full' });
  assert.deepEqual(by(big, 'shivaLeh').containers, [60, 60, 60]);
  assert.equal(by(big, 'nasya').qty, 720);
  assert.equal(formulationFor({ ageBand: '2', plan: '6M', part: 'full' }), null);
  const needs = stockNeeds(first);
  assert.equal(needs.find((n) => n.code === 'BT-100').qty, 3, 'one bottle per liquid for a 1-month supply');
  assert.equal(needs.find((n) => n.code === 'RY-33').qty, 7.5);
  const chits = chitsFor(big, 'Aarav');
  assert.equal(chits.filter((c) => c.itemKey === 'shivaLeh').length, 3);
  assert.equal(chits.find((c) => c.itemKey === 'mix').dose, '2-3 चुटकी दवाई + 3-4 घूँट गुनगुने पानी के साथ लीजिए।');
});

test('sample stocks seed only once, every formulation code is covered', async () => {
  const created = [];
  const Item = { exists: async () => created.length > 0, create: async (d) => { created.push(d); return { _id: new mongoose.Types.ObjectId(), ...d }; } };
  const Tx = { create: async () => ({}) };
  assert.equal((await seedSampleStocks({ StockItem: Item, StockTransaction: Tx })).created, SAMPLE_STOCKS.length);
  assert.equal((await seedSampleStocks({ StockItem: Item, StockTransaction: Tx })).created, 0);
  const codes = new Set(created.map((c) => c.code));
  const needed = stockNeeds(formulationFor({ ageBand: '12-70', plan: '6M', part: 'full' })).map((n) => n.code);
  needed.forEach((code) => assert.ok(codes.has(code), `${code} missing from the sample stocks`));
});

// ---- in-memory models for the job flow ----
const stockDocs = () => SAMPLE_STOCKS.map((s) => {
  const doc = new StockItem({ ...s, currentStock: s.opening });
  doc.save = async () => doc;
  return doc;
});
function setup({ paid = 42000, approval = 'approved' } = {}) {
  const patient = new Patient({ patientName: 'Aarav', patientCode: 'A-1', guardianName: 'P', category: 'autism_adhd', number: '1', age: '7', approvalStatus: approval });
  const stage = patient.stages[0];
  Object.assign(stage, { purchaseOrder: 'PO-4821', totalAmount: 42000 });
  if (paid) stage.payments.push({ amount: paid, approvalStatus: 'approved' });
  stage.medicineRequests.push({ requestId: 'r1', status: 'requested', medicines: 'As per master', requestedAt: new Date(), requestedByName: 'Transit', readyByDate: new Date(Date.now() + 3 * 86400000), poNumber: 'PO-4821', supplyPlan: '1+5', supplyPart: 'first', ageBand: '4-12' });
  patient.save = async () => patient;
  mock.method(Patient, 'findById', async () => patient);
  const stocks = stockDocs();
  // A new medicine on a formulation goes into Stocks.
  mock.method(StockItem, 'create', async (d) => { const doc = new StockItem(d); doc.save = async () => doc; stocks.push(doc); return doc; });
  const txs = [];
  mock.method(StockItem, 'find', (filter = {}) => {
    const codes = filter.code?.$in;
    const rows = stocks.filter((s) => !codes || codes.includes(s.code));
    const result = Promise.resolve(rows);
    result.lean = async () => rows.map((r) => r.toObject());
    return result;
  });
  mock.method(StockTransaction, 'create', async (d) => { const t = { _id: new mongoose.Types.ObjectId(), ...d }; txs.push(t); return t; });
  const jobs = [];
  mock.method(MedicineJob, 'findOne', async (f) => jobs.find((j) => String(j.patient) === String(f.patient) && j.phase === f.phase && j.requestId === f.requestId) || null);
  mock.method(MedicineJob, 'findById', async (id) => jobs.find((j) => String(j._id) === String(id)) || null);
  // The alarm list reads the open jobs (find().select().lean()).
  mock.method(MedicineJob, 'find', () => ({ select: () => ({ lean: async () => jobs.filter((j) => j.status === 'open').map((j) => j.toObject()) }) }));
  const origSave = MedicineJob.prototype.save;
  mock.method(MedicineJob.prototype, 'save', async function save() { await this.validate(); if (!jobs.includes(this)) jobs.push(this); return this; });
  return { patient, stage, stocks, txs, jobs, origSave };
}
const call = async (handler, { params = {}, body = {}, files, user = med } = {}) => {
  let payload; let status = 200; let failure;
  await handler({ params, body, files, user, query: {} }, { status(c) { status = c; return this; }, json(v) { payload = v; } }, (e) => { failure = e; });
  if (failure) throw failure;
  return { status, ...payload };
};
const open = (patient) => call(controller.openForRequest, { body: { patientId: String(patient._id), phase: 1, requestId: 'r1' } });
const allTrue = (key) => JSON.stringify(STAGES.find((s) => s.key === key).checks.map(() => true));
const complete = (jobId, key, fields = {}, extra = {}, user = med) => call(controller.completeStage, { params: { id: jobId, key }, body: { checks: allTrue(key), fields: JSON.stringify(fields), ...extra }, user, files: extra.files });

test('opening a request creates the job with the formulation, stock needs and chits of its supply', async () => {
  const { patient } = setup();
  const { job } = await open(patient);
  assert.equal(job.status, 'open');
  assert.equal(job.currentKey, 'accept');
  assert.equal(job.supplyLabel, '1+5: First 1 month');
  assert.equal(job.formulation.days, 30);
  assert.equal(job.stockTable.find((r) => r.code === 'MEDHYA-GHRIT').needInStock, 75);
  assert.equal(job.stockTable.find((r) => r.code === 'SHIVA-LEH').status, 'manual', 'spoons to grams is pending validation');
  assert.equal(job.chits.length, 6);
  assert.equal(job.payment.releasable, true);
  const again = await open(patient);
  assert.equal(again.job.id, job.id, 'opening again returns the same job');
});

test('Medicine Department completes treatment papers without a PCC assignment', async () => {
  const { patient, jobs } = setup();
  const { job } = await open(patient);
  jobs[0].currentStage = STAGES.findIndex((s) => s.key === 'photos');
  mock.method(InventorySetting, 'findOne', () => { throw Error('Treatment papers must not read PCC assignment'); });
  await assert.rejects(complete(job.id, 'photos', {}, {}, pcc), /done by/);
  const result = await complete(job.id, 'photos', { givenAt: new Date().toISOString() }, {
    papers: JSON.stringify([{ name: 'Medicine paper', slot: 0 }]),
    files: { paper_0: [file] },
  }, med);
  assert.equal(result.job.currentKey, 'pack2');
  assert.equal(result.job.photos.paperSets[0].name, 'Medicine paper');
  assert.equal(result.job.stages.find((s) => s.key === 'photos').doneByName, med.name);
});

test('the eleven stages run in order; assigned PCC verification makes medicine ready; release needs payment', async () => {
  const { patient, stage, stocks, txs } = setup({ paid: 10000 });
  const { job } = await open(patient);
  const id = job.id;
  await assert.rejects(complete(id, 'formula', {}, {}, doctor), /Complete "Accept Order" first/);
  await assert.rejects(call(controller.completeStage, { params: { id, key: 'accept' }, body: { checks: '[true,false]', fields: '{}' } }), /Tick every point/);
  await assert.rejects(complete(id, 'accept', {}), /ready by is required/i);
  await assert.rejects(complete(id, 'accept', { readyByDate: '2026-11-02' }, {}, transit), /done by/);
  const fixedDate = stage.medicineRequests[0].readyByDate.toISOString();
  let v = (await complete(id, 'accept', { readyByDate: '2026-11-02' })).job;
  // The doctor makes the formulation next; the Medicine Department waits.
  assert.equal(v.currentKey, 'formula');
  assert.equal(stage.medicineRequests[0].status, 'in_process', 'the request shows "in process" to In Transit');
  assert.equal(stage.medicineRequests[0].readyByDate.toISOString(), fixedDate, 'the date fixed in post counselling stays; the department cannot change it');
  await assert.rejects(complete(id, 'formula', {}, {}, med), /done by/);
  await assert.rejects(complete(id, 'review', {}), /Complete "Prescription & formulation \(Doctor\)" first/);
  v = (await complete(id, 'formula', { remarks: 'Sheet is right' }, {}, doctor)).job;
  // Then the Medicine Department gets the doctor's formulation.
  assert.equal(v.currentKey, 'review');
  await assert.rejects(complete(id, 'review', {}, {}, doctor), /done by/);
  v = (await complete(id, 'review')).job;
  v = (await complete(id, 'stock', {})).job;
  // Preparation: SHIVA-LEH needs an actual (spoon -> gram not set); everything else follows the sheet.
  await assert.rejects(complete(id, 'prepare', {}), /SHIVA-LEH/);
  const before = stocks.find((s) => s.code === 'MEDHYA-GHRIT').currentStock;
  v = (await complete(id, 'prepare', {}, { consumption: JSON.stringify([{ code: 'SHIVA-LEH', actual: 60 }, { code: 'BUDDHI-GHRIT', actual: 3 }]) })).job;
  assert.equal(stocks.find((s) => s.code === 'MEDHYA-GHRIT').currentStock, before - 75, 'Medhya ghrit reduced by the sheet quantity');
  assert.equal(stocks.find((s) => s.code === 'SHIVA-LEH').currentStock, 3000 - 60);
  assert.equal(stocks.find((s) => s.code === 'BUDDHI-GHRIT').currentStock, 500 - 3, 'nasya drawn by the ml the preparer entered');
  assert.equal(stocks.find((s) => s.code === 'BT-100').currentStock, 200 - 3, 'bottles consumed too');
  assert.equal(txs.filter((t) => t.type === 'consume').length, v.consumption.filter((c) => c.actual > 0).length);
  assert.ok(v.consumption.every((c) => c.actual === 0 || c.txId), 'every consumed line has its ledger row');
  // Chits must all be confirmed.
  await assert.rejects(complete(id, 'fill', {}), /Confirm every chit/);
  v = (await complete(id, 'fill', {}, { chits: JSON.stringify(v.chits.map((c) => ({ key: c.key, confirmed: true }))) })).job;
  assert.ok(v.chits.every((c) => c.confirmed));
  // Step 7 Packing-1 (Medicine Department) with the photo of all medicines together, step 8 the quality check by the Manager.
  await assert.rejects(complete(id, 'pack1', {}, { files: {} }), /all medicines together/);
  v = (await complete(id, 'pack1', {}, { files: { photoA: [file] } })).job;
  assert.equal(v.photos.overview.length, 1);
  // QC is disabled; the Medicine Department makes the treatment papers next.
  assert.equal(v.currentKey, 'photos');
  mock.method(InventorySetting, 'findOne', () => ({ lean: async () => ({ value: { id: String(pcc._id), name: pcc.name } }) }));
  await assert.rejects(complete(id, 'photos', {}, { files: {} }, pcc), /done by/);
  await assert.rejects(complete(id, 'photos', {}, { files: {} }), /given to the Medicine Department at is required/);
  const given = { givenAt: new Date().toISOString() };
  await assert.rejects(complete(id, 'photos', { givenAt: new Date(Date.now() + 86400000).toISOString() }, { files: {} }), /cannot be in the future/);
  await assert.rejects(complete(id, 'photos', given, { files: {} }), /Add the treatment papers/);
  // Papers are named on the page; each needs its pages.
  await assert.rejects(complete(id, 'photos', given, { papers: JSON.stringify([{ name: '', slot: 0 }]) }), /name of each paper/);
  await assert.rejects(complete(id, 'photos', given, { papers: JSON.stringify([{ name: 'Diet Plan', slot: 0 }]) }), /Upload the pages of "Diet Plan"/);
  v = (await complete(id, 'photos', given, { papers: JSON.stringify([{ name: 'Medicine Paper', slot: 0 }, { name: 'Diet Plan', slot: 1 }]), files: { paper_0: [file, file, file], paper_1: [file] } })).job;
  assert.deepEqual(v.photos.paperSets.map((p) => p.name), ['Medicine Paper', 'Diet Plan']);
  assert.equal(v.photos.paperSets[0].files.length, 3, 'every page of a paper is kept');
  // Step 10 Packing-2, the parcel with the treatment papers (Medicine Department).
  assert.equal(v.currentKey, 'pack2');
  v = (await complete(id, 'pack2', { boxCode: 'BX-55 (5x5)', weight: 0.85 })).job;
  // Step 11 the final verification check, by the PCC chosen in Settings; nobody else.
  assert.equal(v.currentKey, 'final');
  await assert.rejects(complete(id, 'final', {}, {}, med2), /done by/);
  await assert.rejects(complete(id, 'final', {}, {}, transit), /done by/);
  await assert.rejects(complete(id, 'final', {}, {}, otherPcc), /Aditi does the final medicine check/);
  // "No" at the final check: the PCC sends it back (a hold); Medicine Department fixes it and resumes.
  await assert.rejects(call(controller.holdJob, { params: { id }, body: { reason: 'x' }, user: transit }), /done by the Manager now/);
  v = (await call(controller.holdJob, { params: { id }, body: { reason: 'Final check not OK: seal broken' }, user: pcc })).job;
  assert.equal(v.hold.reason, 'Final check not OK: seal broken');
  await assert.rejects(complete(id, 'final', {}, {}, pcc), /on hold/);
  v = (await call(controller.resumeJob, { params: { id }, body: { note: 'Resealed' } })).job;
  await assert.rejects(complete(id, 'final', {}, {}, pcc), /Decision is required/);
  await assert.rejects(complete(id, 'final', { result: 'HOLD' }, {}, pcc), /what has to be corrected/);
  await assert.rejects(complete(id, 'final', { result: 'PASS' }, { checks: '[]' }, pcc), /Tick every point/);
  v = (await complete(id, 'final', { result: 'HOLD' }, { checks: '[]', notes: 'Pouch 2 leaking' }, pcc)).job;
  assert.equal(v.hold.reason, 'Final check HOLD: Pouch 2 leaking');
  assert.equal(v.currentKey, 'pack2');
  await assert.rejects(complete(id, 'pack2', { boxCode: 'BX-55 (5x5)', weight: 0.85 }, {}, med2), /on hold/);
  v = (await call(controller.resumeJob, { params: { id }, body: { note: 'Pouch repacked' } })).job;
  v = (await complete(id, 'pack2', { boxCode: 'BX-55 (5x5)', weight: 0.9 }, {}, med2)).job;
  // The photo and the papers stay through the HOLD.
  assert.equal(v.photos.paperSets[0].files.length, 3);
  assert.equal(v.photos.overview.length, 1);
  v = (await complete(id, 'final', { result: 'PASS' }, {}, pcc)).job;
  assert.equal(v.status, 'ready');
  assert.equal(stage.medicineRequests[0].status, 'made', 'In Transit sees the medicine as made');
  assert.equal(stage.medicineRequests[0].lastMedicineCheckedByName, pcc.name);
  assert.equal(v.currentKey, 'release', 'no doctor final verification remains');
  assert.equal(v.finalVerification.result, 'PASS');
  assert.equal(v.finalVerification.doctorVerification, null, 'final PASS does not automatically confirm verification with the doctor');
  assert.equal(stage.medicineRequests[0].medicineImages.length, 1, 'Photo A becomes the medicine photo');
  // Release needs no pending payment; a verified part payment is enough (the balance can go to a next PO).
  await assert.rejects(complete(id, 'release', {}), /In Transit must request/);
  await assert.rejects(call(controller.updateReleaseRequest, { params: { id, action: 'request' }, user: transit }), /Verify the current payment details/);
  const review = await call(controller.getReleasePayments, { params: { id }, user: transit });
  v = (await call(controller.updateReleaseRequest, { params: { id, action: 'verify-payment' }, user: transit, body: { fingerprint: review.fingerprint, confirmed: true } })).job;
  assert.equal(v.releaseRequest.transitPaymentVerifiedByName, transit.name);
  v = (await call(controller.updateReleaseRequest, { params: { id, action: 'request' }, user: transit, body: { notes: 'Release requested by family' } })).job;
  assert.equal(v.releaseRequest.state, 'requested');
  assert.equal(v.releaseRequest.requestedByName, transit.name);
  assert.ok(v.releaseRequest.requestedAt);
  const medicineReview = await call(controller.getReleasePayments, { params: { id }, user: med });
  assert.equal(medicineReview.verified, true);
  assert.equal(medicineReview.verifiedByName, transit.name);
  assert.ok(medicineReview.verifiedAt);
  assert.ok(medicineReview.payments.length > 0);
  await assert.rejects(complete(id, 'release', {}), /verify payment and accept/);
  stage.payments.push({ amount: 5000, approvalStatus: 'pending' });
  await assert.rejects(call(controller.updateReleaseRequest, { params: { id, action: 'accept' } }), /Verify the pending payment/);
  stage.payments[stage.payments.length - 1].approvalStatus = 'approved';
  v = (await call(controller.updateReleaseRequest, { params: { id, action: 'accept' } })).job;
  assert.equal(v.releaseRequest.state, 'accepted');
  assert.equal(v.releaseRequest.acceptedByName, med.name);
  assert.ok(v.releaseRequest.acceptedAt);
  assert.equal(v.releaseRequest.requestedByName, transit.name, 'the request sender stays visible after acceptance');
  stage.payments.push({ amount: 1, approvalStatus: 'pending' });
  await assert.rejects(complete(id, 'release', {}), /Verify the pending payment/);
  stage.payments[stage.payments.length - 1].approvalStatus = 'approved';
  v = (await complete(id, 'release', {})).job;
  assert.equal(v.releaseRequest.state, 'released');
  assert.equal(v.status, 'released');
  assert.equal(stage.medicineRequests[0].status, 'sent_to_courier');
  assert.ok(stage.transit.financialReleasedAt);
  assert.equal(v.progress, 100);
  const summary = jobSummary(v);
  assert.equal(summary.stages.filter((s) => s.state === 'done').length, 11, 'In Transit sees all eleven active steps done');
});

test('stock stage refuses a shortage unless a shortage request is raised', async () => {
  const { patient, stocks } = setup();
  stocks.find((s) => s.code === 'RY-33').currentStock = 2;
  const { job } = await open(patient);
  await complete(job.id, 'accept', { readyByDate: '2026-11-02' });
  await complete(job.id, 'formula', {}, {}, doctor);
  await complete(job.id, 'review');
  await assert.rejects(complete(job.id, 'stock', {}), /Short in stock: RY-33/);
  const v = (await complete(job.id, 'stock', { shortageAccepted: true })).job;
  const matched = v.stages.find((s) => s.key === 'stock').snapshot.stockTable;
  assert.equal(matched.find((r) => r.code === 'RY-33').status, 'short', 'the done stage keeps the stock table as it was matched');
  assert.equal(v.currentKey, 'prepare');
  await assert.rejects(complete(job.id, 'prepare', {}, { consumption: JSON.stringify([{ code: 'SHIVA-LEH', actual: 10 }, { code: 'BUDDHI-GHRIT', actual: 1 }]) }), /only 2 tablet in stock/);
  assert.equal(stocks.find((s) => s.code === 'MEDHYA-GHRIT').currentStock, 5000, 'nothing is drawn when one line is short');
});

test('job view marks urgency from the ready date', () => {
  const now = new Date('2026-10-22T10:00:00+05:30');
  const base = { _id: new mongoose.Types.ObjectId(), patient: new mongoose.Types.ObjectId(), phase: 1, requestId: 'r', stages: [], currentStage: 0, status: 'open' };
  assert.equal(buildJobView({ ...base, readyByDate: new Date('2026-10-21') }, { now }).urgency.level, 'breached');
  assert.equal(buildJobView({ ...base, readyByDate: new Date('2026-10-22') }, { now }).urgency.level, 'critical');
  assert.equal(buildJobView({ ...base, readyByDate: new Date('2026-10-30') }, { now }).urgency.level, 'normal');
});

test('verification display preserves historical doctor records and does not mark an old partial checklist verified', () => {
  const doneAt = new Date();
  const base = { _id: new mongoose.Types.ObjectId(), stages: [{ key: 'final', doneAt, doneByName: 'Aditi', checks: [true, true, true, true, true], fields: {} }], status: 'ready' };
  assert.equal(buildJobView(base).finalVerification.doctorVerification, null);
  const legacy = buildJobView({ ...base, stages: [...base.stages, { key: 'doctor', doneAt, doneByName: doctor.name, doneByRole: doctor.role, fields: { result: 'PASS' } }] });
  assert.equal(legacy.finalVerification.doctorVerification.doneByName, doctor.name);
  assert.equal(legacy.finalVerification.doctorVerification.confirmedByPcc, false);
  assert.equal(buildJobView({ ...base, stages: [] }).finalVerification, null);
});

test('only the assigned final-check PCC confirms doctor verification explicitly; HOLD clears it', async () => {
  const { patient, jobs } = setup();
  const { job } = await open(patient);
  const id = job.id;
  mock.method(InventorySetting, 'findOne', () => ({ lean: async () => ({ value: { id: String(pcc._id), name: pcc.name } }) }));
  const confirm = (user, body) => call(controller.confirmDoctorVerification, { params: { id }, user, body });
  await assert.rejects(confirm(med, { doctorName: doctor.name, confirmed: true }), /Only the assigned/);
  await assert.rejects(confirm({ _id: new mongoose.Types.ObjectId(), name: 'Admin', role: 'admin' }, { doctorName: doctor.name, confirmed: true }), /Only the assigned/);
  await assert.rejects(confirm(manager, { doctorName: doctor.name, confirmed: true }), /Only the assigned/);
  await assert.rejects(confirm(otherPcc, { doctorName: doctor.name, confirmed: true }), /Aditi does the final medicine check/);
  await assert.rejects(confirm(pcc, { doctorName: doctor.name, confirmed: true }), /Complete Packing-2/);
  jobs[0].currentStage = STAGES.findIndex((s) => s.key === 'final');
  await assert.rejects(confirm(pcc, { confirmed: true }), /name of the doctor/);
  await assert.rejects(confirm(pcc, { doctorName: doctor.name, confirmed: false }), /Confirm that you verified/);
  const result = await confirm(pcc, { doctorName: doctor.name, confirmed: true, notes: 'Prescription and kit checked with doctor' });
  assert.equal(result.job.doctorVerification.confirmedByPcc, true);
  assert.equal(result.job.doctorVerification.doctorName, doctor.name);
  assert.equal(result.job.doctorVerification.doneByName, pcc.name);
  assert.ok(result.job.doctorVerification.doneAt);
  assert.equal(String(jobs[0].doctorVerification.confirmedBy), String(pcc._id));
  await assert.rejects(confirm(pcc, { doctorName: doctor.name, confirmed: true }), /already confirmed/);
  const held = await complete(id, 'final', { result: 'HOLD' }, { notes: 'Repack parcel' }, pcc);
  assert.equal(held.job.doctorVerification, null);
  assert.equal(held.job.currentKey, 'pack2');
});

test('assigned PCC can record doctor confirmation for an old completed and released job', async () => {
  const { patient, jobs } = setup();
  const { job } = await open(patient);
  jobs[0].status = 'released'; jobs[0].currentStage = STAGES.length;
  jobs[0].stages.push({ key: 'final', doneAt: new Date(), doneByName: 'Old request', snapshot: { oldFlow: true } });
  mock.method(InventorySetting, 'findOne', () => ({ lean: async () => ({ value: { id: String(pcc._id), name: pcc.name } }) }));
  const result = await call(controller.confirmDoctorVerification, { params: { id: job.id }, user: pcc, body: { doctorName: doctor.name, confirmed: true } });
  assert.equal(result.job.status, 'released');
  assert.equal(result.job.finalVerification.doctorVerification.confirmedByPcc, true);
  assert.equal(result.job.finalVerification.doctorVerification.doctorName, doctor.name);
});

test('Medicine Department requests box receipt and only the assigned final-check PCC receives it', async () => {
  const { patient, jobs } = setup();
  const { job } = await open(patient);
  let assigned = { id: String(pcc._id), name: pcc.name };
  mock.method(InventorySetting, 'findOne', () => ({ lean: async () => assigned ? { value: assigned } : null }));
  const change = (action, user, notes = '') => call(controller.updateBoxReceipt, { params: { id: job.id, action }, user, body: { notes } });
  await assert.rejects(change('request', transit), /Only the Medicine Department/);
  await assert.rejects(change('receive', med), /Only the assigned final-check PCC/);
  await assert.rejects(change('receive', transit), /Only the assigned final-check PCC/);
  await assert.rejects(change('receive', otherPcc), /Aditi does the final medicine check/);
  await assert.rejects(change('request', med), /final verification check first/);
  jobs[0].stages.push({ key: 'final', doneAt: new Date(), doneByName: pcc.name, fields: { result: 'PASS' } });
  jobs[0].status = 'ready'; jobs[0].currentStage = STAGES.findIndex((s) => s.key === 'release');
  await assert.rejects(change('receive', pcc), /must request box receipt first/);
  assigned = null;
  await assert.rejects(change('request', med), /Choose the final verification PCC/);
  assigned = { id: String(pcc._id), name: pcc.name };
  const requested = await change('request', med, 'Box ready at packing desk');
  assert.equal(requested.job.boxReceipt.status, 'pending');
  assert.equal(requested.job.boxReceipt.requestedByName, med.name);
  assert.equal(requested.job.boxReceipt.requestNote, 'Box ready at packing desk');
  assert.equal(requested.job.status, 'ready');
  assert.equal(requested.job.currentKey, 'release', 'receipt request does not bypass release or payment gates');
  assert.equal(String(jobs[0].boxReceipt.requestedBy), String(med._id));
  await assert.rejects(change('request', med), /already pending/);
  jobs[0].hold.active = true;
  await assert.rejects(change('receive', pcc), /Resume the job/);
  jobs[0].hold.active = false;
  const beforeReceipt = Date.now();
  const received = await change('receive', pcc, 'One sealed medicine box received');
  assert.equal(received.job.boxReceipt.status, 'received');
  assert.equal(received.job.boxReceipt.receivedByName, pcc.name);
  assert.equal(received.job.boxReceipt.receivedNote, 'One sealed medicine box received');
  assert.ok(received.job.boxReceipt.receivedAt);
  assert.ok(new Date(received.job.boxReceipt.receivedAt).getTime() >= beforeReceipt);
  assert.ok(new Date(received.job.boxReceipt.receivedAt).getTime() <= Date.now());
  assert.equal(received.job.status, 'ready', 'receiving does not release medicine');
  assert.ok(received.job.events.some((e) => e.action === 'Medicine box receipt requested'));
  assert.ok(received.job.events.some((e) => e.action === 'Medicine box received'));
  await assert.rejects(change('receive', pcc), /already been received/);
  await assert.rejects(change('request', med), /already been received/);
});

test('box receipt queue selects pending requests across all job statuses', async () => {
  let filter;
  mock.method(MedicineJob, 'find', (query) => {
    filter = query;
    return { select: () => ({ sort: () => ({ lean: async () => [{ _id: new mongoose.Types.ObjectId(), patientName: 'Aarav', phase: 1, boxReceipt: { requestedAt: new Date(), requestedByName: med.name } }] }) }) };
  });
  const result = await call(controller.listBoxReceipts, { user: transit });
  assert.deepEqual(filter.status, { $ne: 'cancelled' });
  assert.equal(filter['boxReceipt.receivedAt'], null);
  assert.deepEqual(filter['boxReceipt.requestedAt'], { $ne: null });
  assert.equal(result.items[0].boxReceipt.status, 'pending');
  assert.equal(result.items[0].patientName, 'Aarav');
});

test('pending box receipt belongs to the assigned final-check PCC until confirmed, including released jobs', () => {
  const base = { status: 'ready', currentStage: STAGES.findIndex((s) => s.key === 'release'), poNumber: 'PO-1', requestId: 'r1', boxReceipt: { requestedAt: new Date() } };
  assert.ok(controller.jobActionBy(base).includes('assistant_doctor'));
  assert.ok(controller.jobActionBy(base).includes('medicine_department'), 'the original release owner still sees their work');
  assert.ok(controller.jobActionBy({ ...base, status: 'released' }).includes('assistant_doctor'));
  assert.ok(controller.jobActionBy(base, new Set(['r1'])).includes('assistant_doctor'));
  assert.ok(!controller.jobActionBy(base).includes('in_transit'));
  const finalPcc = { id: String(pcc._id), name: pcc.name };
  assert.ok(controller.jobActionBy(base, new Set(), { user: pcc, finalPcc }).includes('assistant_doctor'));
  assert.ok(!controller.jobActionBy(base, new Set(), { user: otherPcc, finalPcc }).includes('assistant_doctor'));
  assert.ok(!controller.jobActionBy({ ...base, boxReceipt: { ...base.boxReceipt, receivedAt: new Date() } }).includes('assistant_doctor'));
  assert.deepEqual(controller.jobActionBy({ ...base, status: 'cancelled' }), []);
});

test('In Transit can update release status or extend an overdue final-verification deadline; cancellation is explicit', async () => {
  const { patient, jobs } = setup();
  const { job } = await open(patient);
  const id = job.id;
  const finalAt = new Date(Date.now() - 21 * 86400000);
  jobs[0].stages.push({ key: 'final', doneAt: finalAt, doneByName: pcc.name, fields: { result: 'PASS' } });
  jobs[0].status = 'ready'; jobs[0].currentStage = STAGES.findIndex((s) => s.key === 'release');
  const change = (action, body = {}, user = transit) => call(controller.updateReleaseRequest, { params: { id, action }, body, user });
  await assert.rejects(change('request', {}, med), /Only In Transit/);
  await assert.rejects(change('accept', {}, transit), /Only the Medicine Department/);
  await assert.rejects(change('request'), /20-day follow-up deadline/);
  await assert.rejects(change('status', { status: 'waiting_for_payment' }), /20-day follow-up deadline/);
  await assert.rejects(change('extend', { days: 7 }), /reason/);
  await assert.rejects(change('extend', { days: 0, notes: 'Wait' }), /1 to 365/);
  const extended = await change('extend', { days: 7, notes: 'Family asked to wait a week' });
  assert.equal(extended.job.releaseRequest.overdue, false);
  assert.equal(extended.job.releaseRequest.startedAt, finalAt.toISOString());
  assert.equal(extended.job.releaseRequest.extensions[0].byName, transit.name);
  const deadline = extended.job.releaseRequest.deadlineAt;
  const updated = await change('status', { status: 'waiting_for_payment', notes: 'Payment expected this week' });
  assert.equal(updated.job.releaseRequest.followupLabel, 'Waiting for payment');
  assert.equal(updated.job.releaseRequest.statusUpdatedByName, transit.name);
  assert.equal(updated.job.releaseRequest.deadlineAt, deadline, 'status changes do not silently reset the final-verification deadline');
  await assert.rejects(change('cancel', { notes: 'Cancel now' }), /once the release follow-up deadline passes/);
  jobs[0].releaseRequest.deadlineAt = new Date(Date.now() - 1000);
  const cancelled = await change('cancel', { notes: 'Family did not confirm within the deadline' });
  assert.equal(cancelled.job.releaseRequest.state, 'cancelled');
  assert.equal(cancelled.job.status, 'ready', 'cancelling release follow-up does not discard prepared medicine or payments');
  assert.ok(!controller.jobActionBy(jobs[0]).includes('in_transit'));
  assert.ok(cancelled.job.events.some((e) => e.action === 'Medicine release deadline extended'));
  assert.ok(cancelled.job.events.some((e) => e.action === 'Medicine release request cancelled'));
  const cancelledAt = cancelled.job.releaseRequest.cancelledAt;
  mock.method(MedicineJob, 'find', () => ({ select: () => ({ sort: () => ({ lean: async () => [jobs[0].toObject()] }) }) }));
  const queue = await call(controller.listReleaseRequests, { user: transit });
  assert.equal(queue.items.length, 1, 'cancelled release stays in the same queue');
  assert.equal(queue.items[0].releaseRequest.state, 'cancelled');
  assert.equal(queue.items[0].releaseRequest.cancellations[0].byName, transit.name);
  assert.equal(queue.items[0].releaseRequest.cancellations[0].at, cancelledAt);
  await assert.rejects(change('reopen', { days: 7, notes: 'Family confirmed' }, med), /Only In Transit/);
  await assert.rejects(change('reopen', { days: 7 }), /reason for requesting release again/);
  const reopened = await change('reopen', { days: 7, notes: 'Family confirmed collection; requesting again' });
  assert.equal(reopened.job.releaseRequest.state, 'awaiting_request');
  assert.equal(reopened.job.releaseRequest.overdue, false);
  assert.equal(reopened.job.releaseRequest.startedAt, finalAt.toISOString(), 'reopening preserves the original final verification date');
  assert.equal(reopened.job.releaseRequest.reopenedByName, transit.name);
  assert.equal(reopened.job.releaseRequest.cancellations[0].at, cancelledAt, 'cancellation history stays visible after reopening');
  assert.ok(controller.jobActionBy(jobs[0]).includes('in_transit'));
  await assert.rejects(change('request'), /Verify the current payment details/);
  const payment = await call(controller.getReleasePayments, { params: { id }, user: transit });
  await change('verify-payment', { fingerprint: payment.fingerprint, confirmed: true });
  const again = await change('request', { notes: 'New release request after payment review' });
  assert.equal(again.job.releaseRequest.state, 'requested');
  assert.equal(again.job.releaseRequest.requestedByName, transit.name);
  assert.equal(again.job.releaseRequest.cancellations[0].at, cancelledAt);
  assert.ok(again.job.events.some((e) => e.action === 'Medicine release request reopened'));
});

test('release request requires an explicit current payment review; screenshots and all phases are visible', async () => {
  const { patient, stage, jobs } = setup();
  const { job } = await open(patient);
  const id = job.id;
  jobs[0].stages.push({ key: 'final', doneAt: new Date(), doneByName: pcc.name });
  jobs[0].status = 'ready'; jobs[0].currentStage = STAGES.findIndex((s) => s.key === 'release');
  stage.payments.push({ amount: 2500, approvalStatus: 'pending', paymentMode: 'online', utr: 'UTR-123', payToBankName: 'Clinic bank', screenshotFiles: [{ url: '/uploads/payments/proof.png', fileName: 'proof.png' }] });
  const otherStage = patient.stages.find((s) => s.number !== stage.number);
  otherStage.payments.push({ amount: 800, approvalStatus: 'pending', paymentMode: 'cash' });
  const review = () => call(controller.getReleasePayments, { params: { id }, user: transit });
  const action = (name, body = {}, user = transit) => call(controller.updateReleaseRequest, { params: { id, action: name }, user, body });
  await assert.rejects(action('request'), /Verify the current payment details/);
  let details = await review();
  assert.equal(details.verified, false);
  assert.ok(details.payments.some((p) => p.forRelease && p.utr === 'UTR-123' && p.bank === 'Clinic bank' && p.screenshots[0].url === '/uploads/payments/proof.png'));
  assert.ok(details.payments.some((p) => p.phase === otherStage.number && !p.forRelease));
  await assert.rejects(action('verify-payment', { fingerprint: details.fingerprint, confirmed: false }), /Confirm that you checked/);
  await assert.rejects(action('verify-payment', { fingerprint: details.fingerprint, confirmed: true }, med), /Only In Transit/);
  const pending = stage.payments[stage.payments.length - 1];
  pending.screenshotFiles.push({ url: '/uploads/payments/proof-2.png', fileName: 'proof-2.png' });
  await assert.rejects(action('verify-payment', { fingerprint: details.fingerprint, confirmed: true }), /Payment details changed/);
  details = await review();
  await action('verify-payment', { fingerprint: details.fingerprint, confirmed: true });
  assert.equal(pending.approvalStatus, 'approved');
  assert.equal(pending.approvedByName, transit.name);
  assert.equal(otherStage.payments[otherStage.payments.length - 1].approvalStatus, 'pending', 'payments of other phases are not approved');
  assert.equal((await review()).verified, true);
  pending.amount += 100;
  assert.equal((await review()).verified, false);
  await assert.rejects(action('request'), /Verify the current payment details/);
  details = await review();
  await action('verify-payment', { fingerprint: details.fingerprint, confirmed: true });
  const requested = await action('request');
  assert.equal(requested.job.releaseRequest.state, 'requested');
  assert.ok(requested.job.events.some((e) => e.action === 'In Transit verified release payments'));
});

test('the formulation sheet can be corrected until preparation; master values stay beside the change', async () => {
  const { patient, stocks } = setup();
  const { job } = await open(patient);
  const edit = (lines, note = 'Doctor changed it', user = doctor) => call(controller.editFormulation, { params: { id: job.id }, body: { lines, note }, user });
  await assert.rejects(edit([{ key: 'ghrit', qty: 90 }], 'Changed', med), /Only the doctor or the admin/, 'the Medicine Department does not edit the sheet');
  await assert.rejects(edit([{ key: 'ghrit', qty: -1 }]), /valid/);
  await assert.rejects(edit([{ key: 'ghrit', qty: 75 }]), /Nothing was changed/);
  let v = (await edit([{ key: 'ghrit', qty: 120, dose: 'सुबह: 1 चम्मच' }, { key: 'shivaLeh', containers: '15, 15' }, { key: 'mix', components: [{ code: 'RY-33', qty: 20 }] }, { key: 'nasya', packed: false }])).job;
  const by = (key) => v.formulation.lines.find((l) => l.key === key);
  assert.equal(by('ghrit').qty, 120); assert.equal(by('ghrit').bottles, 2, 'bottles follow the new quantity');
  assert.equal(by('ghrit').original.qty, 75, 'the master value is kept');
  assert.deepEqual(by('ghrit').edited.changes, ['dose', 'quantity']);
  assert.deepEqual(by('shivaLeh').containers, [15, 15]);
  assert.equal(by('mix').components.find((c) => c.code === 'RY-33').qty, 20);
  assert.equal(by('mix').components.find((c) => c.code === 'RY-33').grams, 2.5);
  assert.equal(by('nasya').packed, false);
  assert.equal(v.formulation.edited, true);
  assert.equal(v.consumption.find((c) => c.code === 'MEDHYA-GHRIT').planned, 120, 'stock needs follow the corrected sheet');
  assert.equal(v.consumption.find((c) => c.code === 'RY-33').planned, 20);
  assert.equal(v.consumption.some((c) => c.code === 'BUDDHI-GHRIT'), false, 'an unpacked line is not drawn');
  assert.equal(v.chits.filter((c) => c.itemKey === 'shivaLeh').length, 2, 'chits follow the corrected packs');
  assert.equal(v.chits.find((c) => c.itemKey === 'ghrit').dose, 'सुबह: 1 चम्मच');
  assert.ok(v.events.some((e) => e.action === 'Formulation sheet corrected'));
  // Rebuilding from the Formulation Master drops the patient corrections and says so.
  await assert.rejects(call(controller.rebuildSheet, { params: { id: job.id } }), /handled by doctor/, 'the Medicine Department does not rebuild it');
  v = (await call(controller.rebuildSheet, { params: { id: job.id }, user: doctor })).job;
  assert.equal(v.formulation.edited, false);
  assert.equal(by('ghrit').qty, 75);
  assert.equal(v.masterOutdated, false);
  assert.match(v.events[0].details, /corrections on this sheet were dropped/);
  v = (await edit([{ key: 'ghrit', qty: 120 }, { key: 'nasya', packed: false }])).job;
  // After preparation the sheet is locked.
  await complete(job.id, 'accept', { readyByDate: '2026-11-02' });
  await complete(job.id, 'formula', {}, {}, doctor);
  await complete(job.id, 'review');
  await complete(job.id, 'stock', {});
  await complete(job.id, 'prepare', {}, { consumption: JSON.stringify([{ code: 'SHIVA-LEH', actual: 60 }]) });
  assert.equal(stocks.find((s) => s.code === 'MEDHYA-GHRIT').currentStock, 5000 - 120, 'the corrected quantity is what gets drawn');
  await assert.rejects(edit([{ key: 'ghrit', qty: 10 }]), /after preparation/);
});

test('the doctor adds or removes a medicine for this patient only; the master stays as it is', async () => {
  const { patient } = setup();
  const { job } = await open(patient);
  const edit = (lines, user = doctor) => call(controller.editFormulation, { params: { id: job.id }, body: { lines, note: 'Dr Garg for this child' }, user });
  const masterLines = job.formulation.lines.length;
  await assert.rejects(edit([{ add: true, name: '', unit: 'g', qty: 10 }]), /name of the medicine/);
  await assert.rejects(edit([{ add: true, name: 'Brahmi churna', unit: 'cup', qty: 10 }]), /unit/);
  let v = (await edit([{ add: true, name: 'Brahmi churna', when: 'सुबह', unit: 'g', qty: 30, dose: '1 चुटकी शहद के साथ' }, { key: 'oil', removed: true }])).job;
  const added = v.formulation.lines.find((l) => l.name === 'Brahmi churna');
  assert.ok(added?.added, 'the new medicine is on this sheet');
  assert.equal(v.formulation.lines.length, masterLines + 1);
  assert.equal(v.formulation.lines.find((l) => l.key === 'oil').removed, true, 'a removed master medicine stays visible, struck through');
  assert.equal(v.consumption.some((c) => c.code === 'MEDHYA-OIL'), false, 'a removed medicine is not drawn');
  assert.ok(v.chits.some((c) => c.name === 'Brahmi churna'), 'the added medicine gets its chit');
  // Restoring and dropping the added one again.
  v = (await edit([{ key: added.key, removed: true }, { key: 'oil', removed: false }])).job;
  assert.equal(v.formulation.lines.length, masterLines);
  assert.equal(v.formulation.lines.find((l) => l.key === 'oil').packed, true);
  // The master itself was not touched: a fresh sheet has the original medicines.
  const { formulationFor } = require('../constants/formulationMaster');
  assert.equal(formulationFor({ ageBand: '4-12', plan: '1+5', part: 'first' }).lines.some((l) => l.name === 'Brahmi churna'), false);
});

test('0 - 3 years has no master: the sheet starts empty, the doctor creates it for the child at step 2', async () => {
  const { patient, stage } = setup();
  stage.medicineRequests[0].ageBand = '0-3';
  const { job } = await open(patient);
  const id = job.id;
  assert.equal(job.formulation.custom, true);
  assert.equal(job.formulation.lines.length, 0);
  await complete(id, 'accept', { readyByDate: '2026-11-02' });
  const edit = (lines, user = doctor) => call(controller.editFormulation, { params: { id }, body: { lines }, user });
  await assert.rejects(edit([{ add: true, name: 'X', unit: 'g', qty: 1 }], med), /doctor or the admin/, 'the Medicine Department does not write it');
  await assert.rejects(complete(id, 'formula', {}, {}, doctor), /Add the medicines/);
  let v = (await edit([{ add: true, name: 'Shankhpushpi syrup', when: 'रात को खाने के बाद', unit: 'ml', qty: 60, dose: '1 ml' }])).job;
  assert.ok(v.chits.some((c) => c.name === 'Shankhpushpi syrup'));
  v = (await complete(id, 'formula', {}, {}, doctor)).job;
  assert.equal(v.currentKey, 'review', 'the Medicine Department gets it next');
  v = (await complete(id, 'review')).job;
  assert.equal(v.currentKey, 'stock', 'then the same process as every sheet');
});

test('a new medicine on a custom (0 - 3 years) formulation goes into Stocks with 100 units and is drawn at preparation', async () => {
  const { patient, stage, stocks, txs } = setup();
  stage.medicineRequests[0].ageBand = '0-3';
  const { job } = await open(patient);
  const id = job.id;
  await complete(id, 'accept', { readyByDate: '2026-11-02' });
  const edit = (lines) => call(controller.editFormulation, { params: { id }, body: { lines }, user: doctor });
  await assert.rejects(edit([{ add: true, name: 'X', unit: 'g', qty: 1, stockCode: 'NOPE-1' }]), /Not in Stocks: NOPE-1/);
  // "rtyuj" is not in Stocks; "medhya ghrit" is (same name, any case).
  let v = (await edit([{ add: true, name: 'rtyuj', unit: 'g', qty: 80 }, { add: true, name: 'medhya ghrit', unit: 'ml', qty: 20 }])).job;
  const added = stocks.find((s) => s.code === 'RTYUJ');
  assert.ok(added, 'the new medicine is added to Stocks');
  assert.deepEqual({ name: added.name, unit: added.unit, currentStock: added.currentStock }, { name: 'rtyuj', unit: 'g', currentStock: 100 });
  assert.equal(txs.filter((t) => t.type === 'add' && t.code === 'RTYUJ' && t.quantity === 100).length, 1, 'its 100 units are in the ledger');
  assert.equal(stocks.filter((s) => /MEDHYA-GHRIT/.test(s.code)).length, 1, 'a medicine already in Stocks is not added again');
  assert.deepEqual(v.formulation.lines.map((l) => l.stockCode), ['RTYUJ', 'MEDHYA-GHRIT']);
  assert.deepEqual(v.unlinked, []);
  assert.deepEqual(v.consumption.map((c) => [c.code, c.planned]), [['RTYUJ', 80], ['MEDHYA-GHRIT', 20]]);
  // Saving again does not add it twice.
  await edit([{ key: v.formulation.lines[0].key, dose: '1 spoon' }]);
  assert.equal(stocks.filter((s) => /^RTYUJ/.test(s.code)).length, 1);
  await complete(id, 'formula', {}, {}, doctor);
  await complete(id, 'review');
  await complete(id, 'stock', {});
  const ghrit = stocks.find((s) => s.code === 'MEDHYA-GHRIT');
  const before = ghrit.currentStock;
  v = (await complete(id, 'prepare', {})).job;
  assert.equal(v.currentKey, 'fill');
  assert.equal(added.currentStock, 20, '80 g drawn from the 100 added');
  assert.equal(ghrit.currentStock, before - 20);
});

test('an older sheet medicine with no Stocks item: the preparer picks one or records it as made without Stocks', async () => {
  const { patient, stage, stocks, txs, jobs } = setup();
  stage.medicineRequests[0].ageBand = '0-3';
  const { job } = await open(patient);
  const id = job.id;
  await complete(id, 'accept', { readyByDate: '2026-11-02' });
  await call(controller.editFormulation, { params: { id }, body: { lines: [{ add: true, name: 'rtyuj', unit: 'g', qty: 80 }, { add: true, name: 'Brahmi ghrit', unit: 'ml', qty: 20 }] }, user: doctor });
  // As saved before new medicines went into Stocks: no stock code, no stock need.
  const doc = jobs.find((j) => String(j._id) === id);
  doc.formulation = { ...doc.formulation, lines: doc.formulation.lines.map(({ stockCode, ...l }) => l) };
  doc.consumption = [];
  await complete(id, 'formula', {}, {}, doctor);
  await complete(id, 'review');
  let v = (await complete(id, 'stock', {})).job;
  assert.deepEqual(v.unlinked.map((u) => u.name), ['rtyuj', 'Brahmi ghrit']);
  assert.ok(v.stockOptions.some((o) => o.code === 'MEDHYA-GHRIT'), 'the preparer can pick from Stocks');
  const [rtyuj, brahmi] = v.unlinked;
  const ghrit = stocks.find((s) => s.code === 'MEDHYA-GHRIT');
  const before = ghrit.currentStock;
  const drawn = txs.filter((t) => t.type === 'consume').length;
  await assert.rejects(complete(id, 'prepare', {}, { unlinked: JSON.stringify([{ key: brahmi.key, code: 'NOPE-2' }]) }), /NOPE-2 \(for Brahmi ghrit\) is not in Stocks/);
  // Before the fix the step failed with "No formulation on this job".
  v = (await complete(id, 'prepare', {}, { unlinked: JSON.stringify([{ key: rtyuj.key, code: '', actual: null }, { key: brahmi.key, code: 'MEDHYA-GHRIT', actual: 18 }]) })).job;
  assert.equal(v.currentKey, 'fill');
  assert.equal(ghrit.currentStock, before - 18, 'the picked item is drawn by the actual entered');
  assert.equal(txs.filter((t) => t.type === 'consume').length, drawn + 1, 'nothing is drawn for the medicine made without Stocks');
  const made = v.consumption.find((c) => c.key === rtyuj.key);
  assert.deepEqual({ outside: made.outside, actual: made.actual, unit: made.unit, txId: made.txId }, { outside: true, actual: 80, unit: 'g', txId: null });
  assert.equal(v.consumption.find((c) => c.key === brahmi.key).code, 'MEDHYA-GHRIT');
});
test('an old request (before the fulfilment timeline, no PO): the admin and the doctor can fill every stage', async () => {
  const { patient, stage } = setup();
  Object.assign(stage.medicineRequests[0], { poNumber: '', ageBand: '', supplyPlan: '', supplyPart: '' });
  const { job } = await open(patient);
  assert.equal(job.oldFlow, true);
  assert.ok(job.stages.every((s) => s.roles.includes('doctor') && s.roles.includes('admin')), 'every stage is open to the doctor and the admin');
  const id = job.id;
  let v = (await complete(id, 'accept', { readyByDate: '2026-11-02' }, {}, doctor)).job;
  assert.equal(v.currentKey, 'formula');
  // The age group and supply missing on the old request are set by the doctor at the formulation step.
  await assert.rejects(complete(id, 'formula', {}, {}, doctor), /age group and medicine supply/);
  v = (await call(controller.setSupply, { params: { id }, body: { ageBand: '4-12', supplyKey: '1+5:first' }, user: doctor })).job;
  assert.ok(v.formulation.lines.length > 0);
  v = (await complete(id, 'formula', {}, {}, doctor)).job;
  assert.equal(v.currentKey, 'review');
  // A request on a PO keeps its owners: the doctor cannot do the Medicine Department's stage there.
  const { patient: p2 } = setup();
  const { job: onPo } = await call(controller.openForRequest, { body: { patientId: String(p2._id), phase: 1, requestId: 'r1' } });
  assert.equal(onPo.oldFlow, false);
  await assert.rejects(complete(onPo.id, 'accept', { readyByDate: '2026-11-02' }, {}, doctor), /done by/);
});
