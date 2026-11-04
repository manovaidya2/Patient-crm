const { test } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const IncomingCall = require('../models/IncomingCall');
const Patient = require('../models/Patient');
const controller = require('./incomingCallController');

const me = { _id: new mongoose.Types.ObjectId(), name: 'Transit', role: 'in_transit' };
const patient = { _id: new mongoose.Types.ObjectId(), patientName: 'Vyom', patientCode: 'V-171026-11', number: 9999999999 };
const run = async (handler, req) => {
  let body = null; let status = 200; let error = null;
  const res = { status(c) { status = c; return this; }, json(b) { body = b; } };
  await handler({ params: {}, query: {}, body: {}, user: me, ...req }, res, (e) => { error = e; });
  return { body, status, error };
};
const stub = (target, name, fn) => { const old = target[name]; target[name] = fn; return () => { target[name] = old; }; };

test('logging an incoming call: the patient is looked up, question and answer are required, no future time', async () => {
  const undo = [stub(Patient, 'findById', () => ({ select: () => ({ lean: async () => patient }) })), stub(IncomingCall, 'create', async (doc) => ({ toObject: () => ({ _id: new mongoose.Types.ObjectId(), ...doc }) }))];
  try {
    const ok = await run(controller.createIncomingCall, { body: { patientId: String(patient._id), callerName: 'Mother', callerPhone: '98100 12345', receivedAt: new Date(Date.now() - 3600000).toISOString(), query: 'When will the medicine come?', answer: 'Dispatch on Friday' } });
    assert.equal(ok.status, 201);
    assert.equal(ok.body.call.patientCode, 'V-171026-11');
    assert.equal(ok.body.call.callerPhone, '9810012345');
    assert.equal(ok.body.call.source, 'manual');
    assert.equal(ok.body.call.canEdit, true);
    const noAnswer = await run(controller.createIncomingCall, { body: { patientId: String(patient._id), receivedAt: new Date().toISOString(), query: 'Q' } });
    assert.match(noAnswer.error.message, /answered is required/);
    const future = await run(controller.createIncomingCall, { body: { patientId: String(patient._id), receivedAt: new Date(Date.now() + 86400000).toISOString(), query: 'Q', answer: 'A' } });
    assert.match(future.error.message, /future/);
  } finally { undo.forEach((u) => u()); }
});

test('only the person who logged a call (or the admin) edits it', async () => {
  const row = { _id: new mongoose.Types.ObjectId(), createdBy: new mongoose.Types.ObjectId(), save: async () => {}, toObject() { return { ...this }; } };
  const undo = [stub(IncomingCall, 'findById', async () => row)];
  try {
    const denied = await run(controller.updateIncomingCall, { params: { id: String(row._id) }, body: { patientName: 'X', receivedAt: new Date().toISOString(), query: 'Q', answer: 'A' } });
    assert.equal(denied.error.statusCode, 403);
    const admin = await run(controller.updateIncomingCall, { params: { id: String(row._id) }, user: { _id: new mongoose.Types.ObjectId(), name: 'Admin', role: 'admin' }, body: { patientName: 'X', receivedAt: new Date().toISOString(), query: 'Q', answer: 'A' } });
    assert.equal(admin.error, null);
    assert.equal(admin.body.call.editedByName, 'Admin');
  } finally { undo.forEach((u) => u()); }
});

test('a follow-up is marked done with what was done; a later call of the same patient can close it too', async () => {
  let update = null; let many = null;
  const undo = [
    stub(IncomingCall, 'findOneAndUpdate', (filter, change) => { update = { filter, change }; return { lean: async () => ({ _id: filter._id, followUpNeeded: true, followUpDoneAt: change.$set.followUpDoneAt, followUpDoneByName: 'Transit', followUpNote: change.$set.followUpNote, createdBy: me._id }) }; }),
    stub(IncomingCall, 'updateMany', async (filter, change) => { many = { filter, change }; }),
    stub(Patient, 'findById', () => ({ select: () => ({ lean: async () => patient }) })),
    stub(IncomingCall, 'create', async (doc) => ({ _id: new mongoose.Types.ObjectId(), toObject: () => ({ _id: new mongoose.Types.ObjectId(), ...doc }) })),
  ];
  try {
    const id = String(new mongoose.Types.ObjectId());
    const noNote = await run(controller.markFollowUpDone, { params: { id }, body: { note: '' } });
    assert.match(noNote.error.message, /required/);
    const done = await run(controller.markFollowUpDone, { params: { id }, body: { note: 'Called back, gave the dispatch date' } });
    assert.equal(done.body.call.followUpDone.note, 'Called back, gave the dispatch date');
    assert.equal(update.filter.followUpDoneAt, null, 'only an open follow-up');
    const earlier = String(new mongoose.Types.ObjectId());
    await run(controller.createIncomingCall, { body: { patientId: String(patient._id), receivedAt: new Date().toISOString(), query: 'Again asking', answer: 'Sent today', closeFollowUps: [earlier] } });
    assert.deepEqual(many.filter._id.$in, [earlier]);
    assert.equal(String(many.filter.patient), String(patient._id), 'only that patient\'s follow-ups');
    assert.match(many.change.$set.followUpNote, /Sent today/);
  } finally { undo.forEach((u) => u()); }
});
