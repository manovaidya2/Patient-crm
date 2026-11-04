const { test } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const Management = require('../models/AppointmentManagementEntry');
const User = require('../models/User');
const SalesSheetAudit = require('../models/SalesSheetAudit');
const controller = require('./appointmentBoardController');
const { RECEPTION_IDS } = require('../utils/receptionFlow');

const pcc = { _id: new mongoose.Types.ObjectId(), name: 'Sakshi', role: 'assistant_doctor' };
const otherPcc = { _id: new mongoose.Types.ObjectId(), name: 'Neha', role: 'assistant_doctor' };
const reception = { _id: new mongoose.Types.ObjectId(), name: 'Prachi', role: 'receptionist' };
const makeEntry = (withId = true) => {
  const entry = new Management({ appointmentDate: '2026-11-04', appointmentCode: 'APT-1', values: withId ? { [RECEPTION_IDS.patientId]: 'V-041126-11' } : {} });
  entry.save = async () => entry;
  return entry;
};
const run = async (handler, req) => {
  let body = null; let error = null;
  await handler({ app: { get: () => null }, query: {}, ...req }, { json(b) { body = b; }, status() { return this; } }, (e) => { error = e; });
  return { body, error };
};
const withStubs = async (entry, fn) => {
  const saved = [[Management, 'findById', Management.findById], [User, 'findOne', User.findOne], [SalesSheetAudit, 'create', SalesSheetAudit.create]];
  Management.findById = async () => entry;
  User.findOne = (filter) => ({ select: () => ({ lean: async () => [pcc, otherPcc].find((u) => String(u._id) === String(filter._id)) || null }) });
  SalesSheetAudit.create = async () => ({});
  try { await fn(); } finally { saved.forEach(([t, n, old]) => { t[n] = old; }); }
};

test('Reception releases an arrived patient to a PCC; the Release Time column is filled', async () => {
  const entry = makeEntry();
  await withStubs(entry, async () => {
    const byPcc = await run(controller.releasePatient, { params: { id: String(entry._id) }, body: { pccId: String(pcc._id) }, user: pcc });
    assert.equal(byPcc.error.statusCode, 403);
    const ok = await run(controller.releasePatient, { params: { id: String(entry._id) }, body: { pccId: String(pcc._id) }, user: reception });
    assert.equal(ok.error, null);
    assert.equal(ok.body.row.release.toName, 'Sakshi');
    assert.match(entry.values.get('6aba54d27172140c6badb055'), /^\d{2}:\d{2}$/);
  });
  const notArrived = makeEntry(false);
  await withStubs(notArrived, async () => {
    const r = await run(controller.releasePatient, { params: { id: String(notArrived._id) }, body: { pccId: String(pcc._id) }, user: reception });
    assert.match(r.error.message, /arrival/);
  });
});

test('any PCC ticks history start, then history taken, once the patient has arrived', async () => {
  const entry = makeEntry();
  await withStubs(entry, async () => {
    const byReception = await run(controller.markHistory, { params: { id: String(entry._id) }, body: { step: 'started' }, user: reception });
    assert.equal(byReception.error.statusCode, 403);
    const early = await run(controller.markHistory, { params: { id: String(entry._id) }, body: { step: 'taken' }, user: pcc });
    assert.match(early.error.message, /History start/);
    const started = await run(controller.markHistory, { params: { id: String(entry._id) }, body: { step: 'started' }, user: pcc });
    assert.equal(started.body.row.historyStarted.byName, 'Sakshi');
    const taken = await run(controller.markHistory, { params: { id: String(entry._id) }, body: { step: 'taken' }, user: otherPcc });
    assert.equal(taken.body.row.historyTaken.byName, 'Neha', 'another PCC can tick too');
    assert.equal(taken.body.row.canMarkHistory, true);
  });
  const notArrived = makeEntry(false);
  await withStubs(notArrived, async () => {
    const r = await run(controller.markHistory, { params: { id: String(notArrived._id) }, body: { step: 'started' }, user: pcc });
    assert.match(r.error.message, /arrival/);
  });
});

test('after the package: PO, medicine step, delivery and treatment come from the PO view', () => {
  const steps = (states) => Object.entries(states).map(([key, s]) => ({ key, branch: ['calls', 'scheduled', 'handover', 'received'].includes(key) ? 'transit' : '', ...s }));
  const po = {
    id: 'p1', poNumber: 'PO-1', status: 'verified', poPayment: { totalAmount: 42000, amountPaid: 10000, remaining: 32000, pendingCount: 0 },
    medicine: { status: 'in_process', readyByDate: '2026-11-05' }, courier: { status: 'pending', deliveryMode: '' },
    steps: steps({ ready: { state: 'current', waitText: 'Step 5 Medicine preparation' }, calls: { state: 'done' }, scheduled: { state: 'done', at: '2026-11-04', text: 'Porter / Courier · dispatch 06 Nov 2026' }, handover: { state: 'todo' }, received: { state: 'todo' } }),
  };
  const p = controller.progressOf(po);
  assert.deepEqual(p.po, { id: 'p1', number: 'PO-1', status: 'verified', statusLabel: 'Verified', total: 42000, paid: 10000, balance: 32000, pending: 0 });
  assert.equal(p.medicine.label, 'Being prepared');
  assert.equal(p.medicine.detail, 'Step 5 Medicine preparation');
  assert.equal(p.delivery.state, 'scheduled');
  po.steps.find((s) => s.key === 'handover').state = 'done';
  assert.equal(controller.progressOf(po).delivery.state, 'on_the_way');
  po.steps.find((s) => s.key === 'received').state = 'done';
  assert.equal(controller.progressOf(po).delivery.state, 'delivered');
  assert.equal(controller.progressOf(null), null);
});
