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
const medicine = { _id: new mongoose.Types.ObjectId(), name: 'Meena', role: 'medicine_department' };
const postCounselor = { _id: new mongoose.Types.ObjectId(), name: 'Riya', role: 'post_counselor' };
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

test('Medicine Department ticks OPD start and complete with operator/date; other departments cannot edit', async () => {
  const entry = makeEntry();
  await withStubs(entry, async () => {
    const audits = [];
    SalesSheetAudit.create = async (value) => { audits.push(value); return {}; };
    const mark = (step, user = medicine, done = true) => run(controller.markOpd, { params: { id: String(entry._id) }, body: { step, done }, user });
    for (const user of [pcc, reception, { ...medicine, role: 'in_transit' }]) {
      assert.equal((await mark('started', user)).error.statusCode, 403);
    }
    assert.match((await mark('completed')).error.message, /OPD start/);
    const before = Date.now();
    const started = await mark('started');
    assert.equal(started.error, null);
    assert.equal(started.body.row.opdStarted.byName, medicine.name);
    assert.ok(new Date(started.body.row.opdStarted.at).getTime() >= before);
    assert.equal(started.body.row.canMarkOpd, true);
    assert.equal(started.body.row.canMarkHistory, false, 'OPD access does not grant PCC history access');
    const repeated = await mark('started', { ...medicine, name: 'Other medicine operator' });
    assert.deepEqual(repeated.body.row.opdStarted, started.body.row.opdStarted, 'a retry preserves the original operator/time');
    const completed = await mark('completed');
    assert.equal(completed.body.row.opdCompleted.byName, medicine.name);
    assert.ok(new Date(completed.body.row.opdCompleted.at).getTime() >= new Date(started.body.row.opdStarted.at).getTime());
    assert.match((await mark('started', medicine, false)).error.message, /Untick "OPD complete" first/);
    const readOnly = controller.rowOf(entry.toObject(), null, pcc);
    assert.equal(readOnly.canMarkOpd, false);
    assert.equal(readOnly.opdCompleted.byName, medicine.name, 'everyone sees the actual OPD status');
    assert.deepEqual(audits.map((a) => a.action), ['OPD started', 'OPD completed']);
    assert.equal(String(audits[0].changedBy), String(medicine._id));
    assert.match(audits[0].details, /APT-1/);
  });
});

test('OPD requires arrival and keeps the history undo window', async () => {
  const noArrival = makeEntry(false);
  await withStubs(noArrival, async () => {
    const result = await run(controller.markOpd, { params: { id: String(noArrival._id) }, body: { step: 'started' }, user: medicine });
    assert.match(result.error.message, /arrival/);
  });
  const entry = makeEntry();
  entry.visitFlow = { opdStartedAt: new Date(Date.now() - 40 * 60000), opdStartedByName: medicine.name, historyStartedAt: new Date(), historyStartedByName: pcc.name };
  await withStubs(entry, async () => {
    const req = { params: { id: String(entry._id) }, body: { step: 'started', done: false }, user: medicine };
    assert.equal((await run(controller.markOpd, req)).error.statusCode, 403);
    const admin = { _id: new mongoose.Types.ObjectId(), name: 'Admin', role: 'admin' };
    const undone = await run(controller.markOpd, { ...req, user: admin });
    assert.equal(undone.error, null);
    assert.equal(undone.body.row.opdStarted, null);
    assert.equal(undone.body.row.historyStarted.byName, pcc.name, 'OPD writes preserve the history fields');
  });
});

test('Post Counselor marks counselling start/complete with dates and audit; other departments only see it', async () => {
  const entry = makeEntry();
  entry.visitFlow = { historyStartedAt: new Date(), historyStartedByName: pcc.name, opdStartedAt: new Date(), opdStartedByName: medicine.name };
  await withStubs(entry, async () => {
    const audits = [];
    SalesSheetAudit.create = async (value) => { audits.push(value); return {}; };
    const mark = (step, user = postCounselor, done = true) => run(controller.markPostCounselling, { params: { id: String(entry._id) }, body: { step, done }, user });
    for (const user of [pcc, reception, medicine]) assert.equal((await mark('started', user)).error.statusCode, 403);
    assert.match((await mark('completed')).error.message, /Post Counselling start/);
    const before = Date.now();
    const started = await mark('started');
    assert.equal(started.error, null);
    assert.equal(started.body.row.postCounsellingStarted.byName, postCounselor.name);
    assert.ok(new Date(started.body.row.postCounsellingStarted.at).getTime() >= before);
    const repeated = await mark('started', { ...postCounselor, name: 'Another counselor' });
    assert.deepEqual(repeated.body.row.postCounsellingStarted, started.body.row.postCounsellingStarted);
    const completed = await mark('completed');
    assert.equal(completed.body.row.postCounsellingCompleted.byName, postCounselor.name);
    assert.ok(new Date(completed.body.row.postCounsellingCompleted.at) >= new Date(started.body.row.postCounsellingStarted.at));
    assert.equal(completed.body.row.canMarkPostCounselling, true);
    assert.equal(completed.body.row.canMarkHistory, false);
    assert.equal(completed.body.row.canMarkOpd, false);
    assert.equal(completed.body.row.historyStarted.byName, pcc.name);
    assert.equal(completed.body.row.opdStarted.byName, medicine.name);
    assert.match((await mark('started', postCounselor, false)).error.message, /Untick "Post Counselling complete" first/);
    const readOnly = controller.rowOf(entry.toObject(), null, medicine);
    assert.equal(readOnly.canMarkPostCounselling, false);
    assert.equal(readOnly.postCounsellingCompleted.byName, postCounselor.name);
    assert.deepEqual(audits.map((a) => a.action), ['Post counselling started', 'Post counselling completed']);
  });
});

test('post counselling ticks require arrival and follow the history undo window', async () => {
  const noArrival = makeEntry(false);
  await withStubs(noArrival, async () => {
    const result = await run(controller.markPostCounselling, { params: { id: String(noArrival._id) }, body: { step: 'started' }, user: postCounselor });
    assert.match(result.error.message, /arrival/);
  });
  const entry = makeEntry();
  entry.visitFlow = { postCounsellingStartedAt: new Date(Date.now() - 40 * 60000), postCounsellingStartedByName: postCounselor.name };
  await withStubs(entry, async () => {
    const req = { params: { id: String(entry._id) }, body: { step: 'started', done: false }, user: postCounselor };
    assert.equal((await run(controller.markPostCounselling, req)).error.statusCode, 403);
    const undone = await run(controller.markPostCounselling, { ...req, user: { _id: new mongoose.Types.ObjectId(), name: 'Admin', role: 'admin' } });
    assert.equal(undone.error, null);
    assert.equal(undone.body.row.postCounsellingStarted, null);
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

test('In Transit appointment status uses actual payment, release and delivery operators/times without granting visit edits', () => {
  const po = {
    id: 'po-1', poNumber: 'PO-1', status: 'verified',
    paymentVerifiedAt: '2026-11-14T05:00:00Z', paymentVerifiedByName: 'Transit A',
    poPayment: { totalAmount: 42000, amountPaid: 10000, remaining: 32000, pendingCount: 0 },
    steps: [
      { key: 'scheduled', state: 'done', at: '2026-11-14T07:00:00Z', by: 'Transit B', text: 'Self pickup' },
      { key: 'handover', state: 'done', at: '2026-11-14T08:00:00Z', by: 'Transit C' },
    ], courier: { deliveryMode: 'self' },
  };
  const job = { _id: 'job-1', status: 'released', releaseRequest: {
    transitPaymentVerifiedAt: '2026-11-14T05:10:00Z', transitPaymentVerifiedByName: 'Transit B',
    requestedAt: '2026-11-14T05:15:00Z', requestedByName: 'Transit B',
    acceptedAt: '2026-11-14T05:20:00Z', acceptedByName: 'Medicine A',
  }, stages: [{ key: 'final', doneAt: '2026-11-13T05:00:00Z' }, { key: 'release', doneAt: '2026-11-14T06:00:00Z', doneByName: 'Medicine B' }] };
  const row = controller.rowOf(makeEntry().toObject(), null, { role: 'in_transit' }, po, job);
  assert.equal(row.inTransit.payment.state, 'verified');
  assert.equal(row.inTransit.payment.balance, 32000, 'verification does not imply the remaining balance was collected');
  assert.equal(row.inTransit.release.state, 'released');
  assert.deepEqual(row.inTransit.timeline.slice(0, 5).map((event) => event.byName), ['Transit A', 'Transit B', 'Transit B', 'Medicine A', 'Medicine B']);
  assert.equal(row.inTransit.timeline.find((event) => event.label === 'Medicine released').at, '2026-11-14T06:00:00.000Z');
  assert.equal(row.delivery.state, 'delivered');
  assert.equal(row.delivery.scheduledByName, 'Transit B');
  assert.equal(row.delivery.deliveredByName, 'Transit C');
  assert.equal(row.canMarkHistory, false);
  assert.equal(row.canMarkOpd, false);
  assert.equal(row.canMarkPostCounselling, false);
});

test('pending and cancelled release status remains visible, with cancellation actor/reason and no invented approval', () => {
  const po = { id: 'po-1', steps: [], poPayment: { pendingCount: 1 }, paymentVerifiedAt: '2026-11-10T05:00:00Z' };
  const job = { _id: 'job-1', status: 'ready', stages: [{ key: 'final', doneAt: '2026-11-13T05:00:00Z' }], releaseRequest: {} };
  assert.equal(controller.progressOf(po, job).inTransit.release.state, 'awaiting_request');
  job.releaseRequest = { requestedAt: '2026-11-14T05:00:00Z', requestedByName: 'Transit A', cancelledAt: '2026-11-14T06:00:00Z', cancelledByName: 'Transit B', cancelReason: 'Patient asked to wait' };
  const view = controller.progressOf(po, job).inTransit;
  assert.equal(view.payment.state, 'pending');
  assert.equal(view.release.state, 'cancelled');
  assert.equal(view.timeline.at(-1).byName, 'Transit B');
  assert.equal(view.timeline.at(-1).note, 'Patient asked to wait');
  assert.equal(view.timeline.some((event) => /accepted|released$/i.test(event.label)), false);
  assert.equal(controller.progressOf(po).inTransit.release, null, 'no fulfilment job means no release approval is invented');
});

test('appointments fetch call notes, signed PO, delivery plan, PCC and delivery proof from this PO handover record', () => {
  const po = { id: 'po-1', steps: [], phaseHold: true,
    callFollowUps: [{ step: 'handover', label: 'Dispatch / handover', dueAt: '2026-11-16T05:00:00Z', overdue: false, lateDays: 0 }],
    handover: {
      calls: [{ at: '2026-11-14T05:00:00Z', byName: 'Transit A', outcome: 'call_back', notes: 'Call after 3 pm' }],
      poPaperSignedAt: '2026-11-14T06:00:00Z', poPaperSignedByName: 'Transit B', poPaperSignedNote: 'Paper signed at clinic',
      mode: 'pickup', pickupAt: '2026-11-16T05:00:00Z', pickupNote: 'Guardian will collect',
      pcc: { name: 'Sakshi', at: '2026-11-14T07:00:00Z', byName: 'Transit B' }, explanationAt: '2026-11-16T05:00:00Z', explanationMode: 'clinic',
      courier: { receivedByName: 'Guardian', packageImages: [{ url: '/uploads/parcel.jpg' }], deliveryProofImages: [{ url: '/uploads/receipt.jpg' }] },
    },
  };
  const before = JSON.stringify(po);
  const view = controller.progressOf(po).inTransit;
  assert.equal(view.paperSigned, true);
  assert.equal(view.phaseOnHold, true);
  assert.equal(view.plan.mode, 'pickup');
  assert.equal(view.plan.note, 'Guardian will collect');
  assert.equal(view.plan.pcc, 'Sakshi');
  assert.equal(view.plan.receiver, 'Guardian');
  assert.equal(view.plan.deliveryProofImages[0].url, '/uploads/receipt.jpg');
  assert.equal(view.callFollowUps[0].step, 'handover');
  assert.deepEqual(view.timeline.map((event) => event.label), ['Call: call back', 'PO paper signed by patient', 'PCC assigned']);
  assert.equal(view.timeline[0].note, 'Call after 3 pm');
  assert.equal(view.timeline[1].byName, 'Transit B');
  assert.equal(JSON.stringify(po), before, 'the appointments summary does not change the actual workflow records');
});

test('self pickup, courier schedule and Ready Not Delivered match the actual In Transit records', () => {
  const po = { id: 'po-1', status: 'verified', isPhaseCurrentRequest: true,
    medicine: { status: 'made', madeAt: '2026-11-14T05:00:00Z' },
    courier: { status: 'pending', deliveryMode: 'self' },
    steps: [{ key: 'scheduled', state: 'done', done: true, at: '2026-11-14T06:00:00Z', by: 'Transit A' }, { key: 'handover', state: 'current', done: false }],
    handover: { mode: 'pickup', pickupAt: '2026-11-16T05:00:00Z' },
  };
  let summary = controller.progressOf(po).inTransit;
  assert.equal(summary.selfPickup.state, 'scheduled');
  assert.equal(summary.selfPickup.at, '2026-11-16T05:00:00Z');
  assert.equal(summary.porterCourier.state, 'not_selected');
  assert.equal(summary.readyNotDelivered.reasons[0].text, 'Waiting for the patient to collect');
  po.handover = { mode: 'shipped', dispatchAt: '2026-11-16T05:00:00Z', plannedCourier: 'Porter' };
  po.courier = { status: 'dispatched', deliveryMode: 'porter', dispatchedAt: '2026-11-15T05:00:00Z', trackingNumber: 'TRACK-1' };
  summary = controller.progressOf(po).inTransit;
  assert.equal(summary.selfPickup.state, 'not_selected');
  assert.equal(summary.porterCourier.state, 'on_the_way');
  assert.equal(summary.porterCourier.partner, 'Porter');
  assert.equal(summary.porterCourier.tracking, 'TRACK-1');
  assert.match(summary.readyNotDelivered.reasons[0].text, /receipt not confirmed/);
  po.courier.status = 'delivered';
  assert.equal(controller.progressOf(po).inTransit.readyNotDelivered, null);
  assert.equal(controller.progressOf(po).inTransit.porterCourier.state, 'delivered');
  po.courier.status = 'pending';
  po.phaseRemoved = true;
  assert.equal(controller.progressOf(po).inTransit.readyNotDelivered, null, 'removed phases stay out of Ready Not Delivered');
});

test('patient approval comes from patient intake status even before a PO exists', () => {
  const entry = makeEntry().toObject();
  const user = { role: 'in_transit' };
  const patient = { approvalStatus: 'pending' };
  let row = controller.rowOf(entry, null, user, null, null, patient);
  assert.equal(row.patientApproval.status, 'pending');
  assert.equal(row.inTransit, undefined);
  Object.assign(patient, { approvalStatus: 'approved', approvedAt: '2026-11-15T05:00:00Z', approvedByName: 'Transit A' });
  row = controller.rowOf(entry, null, user, null, null, patient);
  assert.deepEqual(row.patientApproval, { status: 'approved', at: '2026-11-15T05:00:00.000Z', byName: 'Transit A' });
  assert.equal(controller.rowOf(entry, null, user).patientApproval, undefined, 'missing data does not invent an approval or overwrite an existing displayed status');
});

test('appointment payment dropdown includes verified and pending PO payments with screenshot proofs and references', () => {
  const verified = { id: 'pay-1', amount: 5000, status: 'approved', mode: 'online', bank: 'Clinic Bank', utr: 'UTR-1', approvedByName: 'Transit A', approvedAt: '2026-11-15T05:00:00Z', files: [{ url: '/uploads/proof.jpg', fileName: 'Payment.jpg' }] };
  const pending = { id: 'pay-2', amount: 2000, status: 'pending', mode: 'cash', receivedBy: 'Reception', files: [] };
  const po = { id: 'po-1', steps: [], poPayment: { amountPaid: 5000, remaining: 2000, pendingCount: 1 }, payments: [verified], handover: { approvedPayments: [verified] }, phasePendingPayments: [pending] };
  const view = controller.progressOf(po).inTransit;
  assert.equal(view.payments.length, 2, 'a verified payment is shown once even if it also appears in the handover');
  assert.equal(view.payment.state, 'pending');
  assert.equal(view.payments.find((payment) => payment.id === 'pay-1').files[0].url, '/uploads/proof.jpg');
  assert.equal(view.payments.find((payment) => payment.id === 'pay-1').utr, 'UTR-1');
  assert.equal(view.payments.find((payment) => payment.id === 'pay-1').approvedByName, 'Transit A');
  assert.equal(view.payments.find((payment) => payment.id === 'pay-2').status, 'pending');
  assert.deepEqual(controller.progressOf({ id: 'po-2', steps: [] }).inTransit.payments, []);
});
