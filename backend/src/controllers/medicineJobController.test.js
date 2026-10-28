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

test('the twelve stages run in order with their gates; preparation draws from stock; release needs full payment', async () => {
  const { patient, stage, stocks, txs } = setup({ paid: 10000 });
  const { job } = await open(patient);
  const id = job.id;
  await assert.rejects(complete(id, 'review'), /Complete "Order accepted" first/);
  await assert.rejects(call(controller.completeStage, { params: { id, key: 'accept' }, body: { checks: '[true,false]', fields: '{}' } }), /Tick every point/);
  await assert.rejects(complete(id, 'accept', {}), /ready by is required/i);
  await assert.rejects(complete(id, 'accept', { readyByDate: '2026-11-02' }, {}, transit), /done by/);
  const fixedDate = stage.medicineRequests[0].readyByDate.toISOString();
  let v = (await complete(id, 'accept', { readyByDate: '2026-11-02' })).job;
  assert.equal(v.currentKey, 'review');
  assert.equal(stage.medicineRequests[0].status, 'in_process', 'the request shows "in process" to In Transit');
  assert.equal(stage.medicineRequests[0].readyByDate.toISOString(), fixedDate, 'the date fixed in post counselling stays; the department cannot change it');
  v = (await complete(id, 'review', { formulaRef: 'Dr Garg 22 Oct' })).job;
  v = (await complete(id, 'stock', { batchRefs: 'MG-2610' })).job;
  // Preparation: SHIVA-LEH needs an actual (spoon -> gram not set); everything else follows the sheet.
  await assert.rejects(complete(id, 'prepare', { batchNo: 'B1', preparerName: 'Meena' }), /SHIVA-LEH/);
  const before = stocks.find((s) => s.code === 'MEDHYA-GHRIT').currentStock;
  v = (await complete(id, 'prepare', { batchNo: 'B1', preparerName: 'Meena' }, { consumption: JSON.stringify([{ code: 'SHIVA-LEH', actual: 60 }, { code: 'BUDDHI-GHRIT', actual: 3 }]) })).job;
  assert.equal(stocks.find((s) => s.code === 'MEDHYA-GHRIT').currentStock, before - 75, 'Medhya ghrit reduced by the sheet quantity');
  assert.equal(stocks.find((s) => s.code === 'SHIVA-LEH').currentStock, 3000 - 60);
  assert.equal(stocks.find((s) => s.code === 'BUDDHI-GHRIT').currentStock, 500 - 3, 'nasya drawn by the ml the preparer entered');
  assert.equal(stocks.find((s) => s.code === 'BT-100').currentStock, 200 - 3, 'bottles consumed too');
  assert.equal(txs.filter((t) => t.type === 'consume').length, v.consumption.filter((c) => c.actual > 0).length);
  assert.ok(v.consumption.every((c) => c.actual === 0 || c.txId), 'every consumed line has its ledger row');
  // Chits must all be confirmed.
  await assert.rejects(complete(id, 'fill', { unitLog: 'U1' }), /Confirm every chit/);
  v = (await complete(id, 'fill', { unitLog: 'U1' }, { chits: JSON.stringify(v.chits.map((c) => ({ key: c.key, confirmed: true }))) })).job;
  assert.ok(v.chits.every((c) => c.confirmed));
  // The Medicine Department does its own pack QC, the preparer's login included.
  v = (await complete(id, 'qc', { result: 'PASS' }, {}, med)).job;
  v = (await complete(id, 'pack1', { kitLocation: 'Tray 3' })).job;
  // Doctor only; a HOLD sends the kit back to QC.
  await assert.rejects(complete(id, 'doctor', { result: 'PASS', remarks: 'ok' }, {}, med), /done by/);
  v = (await complete(id, 'doctor', { result: 'HOLD', remarks: 'Pouch 2 leaking' }, {}, doctor)).job;
  assert.equal(v.hold.reason, 'Doctor HOLD: Pouch 2 leaking');
  assert.equal(v.currentKey, 'qc');
  await assert.rejects(complete(id, 'qc', { result: 'PASS' }, {}, med2), /on hold/);
  v = (await call(controller.resumeJob, { params: { id }, body: { note: 'Pouch repacked' } })).job;
  v = (await complete(id, 'qc', { result: 'PASS' }, {}, med2)).job;
  v = (await complete(id, 'pack1', { kitLocation: 'Tray 3' })).job;
  v = (await complete(id, 'doctor', { result: 'PASS', remarks: 'All matched' }, {}, doctor)).job;
  await assert.rejects(complete(id, 'photos', {}, { files: {} }), /Photo A/);
  v = (await complete(id, 'photos', {}, { files: { photoA: [file], photoB: [file] } })).job;
  assert.equal(v.photos.overview.length, 1);
  v = (await complete(id, 'pack2', { boxCode: 'BX-55 (5x5)', weight: 850 })).job;
  await assert.rejects(complete(id, 'final', { checkerName: 'Meena' }), /different from the Packing-2 operator/);
  v = (await complete(id, 'final', { checkerName: 'Prachi' }, {}, med2)).job;
  assert.equal(v.status, 'ready');
  assert.equal(stage.medicineRequests[0].status, 'made', 'In Transit sees the medicine as made');
  assert.equal(stage.medicineRequests[0].medicineImages.length, 1, 'Photo A becomes the medicine photo');
  // Release is blocked until In Transit verifies the full payment.
  await assert.rejects(complete(id, 'release', { handedTo: 'Rohit' }), /Full verified payment/);
  stage.payments.push({ amount: 32000, approvalStatus: 'approved' });
  v = (await complete(id, 'release', { handedTo: 'Rohit' })).job;
  assert.equal(v.status, 'released');
  assert.equal(stage.medicineRequests[0].status, 'sent_to_courier');
  assert.ok(stage.transit.financialReleasedAt);
  assert.equal(v.progress, 100);
  const summary = jobSummary(v);
  assert.equal(summary.stages.filter((s) => s.state === 'done').length, 12, 'In Transit sees all twelve steps done');
});

test('stock stage refuses a shortage unless a shortage request is raised', async () => {
  const { patient, stocks } = setup();
  stocks.find((s) => s.code === 'RY-33').currentStock = 2;
  const { job } = await open(patient);
  await complete(job.id, 'accept', { readyByDate: '2026-11-02' });
  await complete(job.id, 'review', { formulaRef: 'ok' });
  await assert.rejects(complete(job.id, 'stock', { batchRefs: 'x' }), /Short in stock: RY-33/);
  const v = (await complete(job.id, 'stock', { batchRefs: 'x', shortageAccepted: true })).job;
  assert.equal(v.currentKey, 'prepare');
  await assert.rejects(complete(job.id, 'prepare', { batchNo: 'B', preparerName: 'M' }, { consumption: JSON.stringify([{ code: 'SHIVA-LEH', actual: 10 }, { code: 'BUDDHI-GHRIT', actual: 1 }]) }), /only 2 tablet in stock/);
  assert.equal(stocks.find((s) => s.code === 'MEDHYA-GHRIT').currentStock, 5000, 'nothing is drawn when one line is short');
});

test('job view marks urgency from the ready date', () => {
  const now = new Date('2026-10-22T10:00:00+05:30');
  const base = { _id: new mongoose.Types.ObjectId(), patient: new mongoose.Types.ObjectId(), phase: 1, requestId: 'r', stages: [], currentStage: 0, status: 'open' };
  assert.equal(buildJobView({ ...base, readyByDate: new Date('2026-10-21') }, { now }).urgency.level, 'breached');
  assert.equal(buildJobView({ ...base, readyByDate: new Date('2026-10-22') }, { now }).urgency.level, 'critical');
  assert.equal(buildJobView({ ...base, readyByDate: new Date('2026-10-30') }, { now }).urgency.level, 'normal');
});

test('the formulation sheet can be corrected until preparation; master values stay beside the change', async () => {
  const { patient, stocks } = setup();
  const { job } = await open(patient);
  const edit = (lines, note = 'Doctor changed it', user = med) => call(controller.editFormulation, { params: { id: job.id }, body: { lines, note }, user });
  await assert.rejects(edit([{ key: 'ghrit', qty: 90 }], ''), /why/);
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
  v = (await call(controller.rebuildSheet, { params: { id: job.id } })).job;
  assert.equal(v.formulation.edited, false);
  assert.equal(by('ghrit').qty, 75);
  assert.equal(v.masterOutdated, false);
  assert.match(v.events[0].details, /corrections on this sheet were dropped/);
  v = (await edit([{ key: 'ghrit', qty: 120 }, { key: 'nasya', packed: false }])).job;
  // After preparation the sheet is locked.
  await complete(job.id, 'accept', { readyByDate: '2026-11-02' });
  await complete(job.id, 'review', { formulaRef: 'ok' });
  await complete(job.id, 'stock', { batchRefs: 'x' });
  await complete(job.id, 'prepare', { batchNo: 'B', preparerName: 'Meena' }, { consumption: JSON.stringify([{ code: 'SHIVA-LEH', actual: 60 }]) });
  assert.equal(stocks.find((s) => s.code === 'MEDHYA-GHRIT').currentStock, 5000 - 120, 'the corrected quantity is what gets drawn');
  await assert.rejects(edit([{ key: 'ghrit', qty: 10 }]), /after preparation/);
});
