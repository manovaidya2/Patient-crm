const { test, mock, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const Patient = require('../models/Patient');
const { setPatientTag, listTaggedPatients } = require('./patientController');

afterEach(() => mock.restoreAll());
const admin = { _id: new mongoose.Types.ObjectId(), name: 'Super Admin', role: 'admin' };
const pcc = { _id: new mongoose.Types.ObjectId(), name: 'Sakshi', role: 'assistant_doctor' };
const run = async (handler, req) => {
  const res = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(data) { this.data = data; return this; } };
  let failure;
  await handler({ params: {}, body: {}, query: {}, ...req }, res, (error) => { failure = error; });
  if (failure) throw failure;
  return res;
};

test('Actor patient tag: put on and taken off from Patient Details, also on an inactive patient; logged', async () => {
  const patient = new Patient({ patientName: 'Aarav', patientCode: 'A-1', guardianName: 'P', category: 'autism_adhd', number: '1', age: '7', isActive: false });
  patient.save = async () => patient;
  patient.populate = async () => patient;
  mock.method(Patient, 'findById', async () => patient);
  const on = await run(setPatientTag, { params: { id: String(patient._id) }, body: { tag: 'actor', on: true }, user: admin });
  assert.equal(on.statusCode, 200);
  assert.deepEqual(on.data.patient.tags, ['actor']);
  assert.equal(on.data.patient.tagMeta.actor.byName, 'Super Admin');
  assert.equal(on.data.patient.canEditTags, true);
  assert.equal(on.data.patient.isActive, false);
  assert.ok(patient.activityLog.some((a) => a.action === 'Tagged "Actor patient"'));
  assert.equal((await run(setPatientTag, { params: { id: String(patient._id) }, body: { tag: 'actor', on: true }, user: admin })).statusCode, 400);
  assert.equal((await run(setPatientTag, { params: { id: String(patient._id) }, body: { tag: 'vip', on: true }, user: admin })).data.message, 'Unknown tag');
  assert.equal((await run(setPatientTag, { params: { id: String(patient._id) }, body: { tag: 'actor', on: false }, user: pcc })).statusCode, 403);
  const off = await run(setPatientTag, { params: { id: String(patient._id) }, body: { tag: 'actor', on: false }, user: admin });
  assert.deepEqual([off.data.patient.tags, off.data.patient.tagMeta.actor], [[], undefined]);
});

test('the Actor patients list: active and inactive, newest tag first; a PCC sees only the patients they can open', async () => {
  const rows = [
    { _id: new mongoose.Types.ObjectId(), patientName: 'Old', patientCode: 'O-1', category: 'mental_health', isActive: false, approvalStatus: 'approved', assignedDoctor: { _id: pcc._id, name: 'Sakshi' }, tagMeta: { actor: { at: new Date('2026-11-01'), byName: 'Admin' } } },
    { _id: new mongoose.Types.ObjectId(), patientName: 'New', patientCode: 'N-1', category: 'autism_adhd', isActive: true, approvalStatus: 'approved', assignedDoctor: { _id: pcc._id, name: 'Sakshi' }, tagMeta: { actor: { at: new Date('2026-11-10'), byName: 'Doctor' } } },
    { _id: new mongoose.Types.ObjectId(), patientName: 'Other PCC', patientCode: 'X-1', category: 'autism_adhd', isActive: true, approvalStatus: 'approved', assignedDoctor: { _id: new mongoose.Types.ObjectId(), name: 'Aditi' } },
  ];
  let filter = null;
  mock.method(Patient, 'find', (f) => { filter = f; const chain = { select: () => chain, populate: () => chain, lean: async () => rows }; return chain; });
  const all = (await run(listTaggedPatients, { params: { tag: 'actor' }, user: admin })).data;
  assert.deepEqual(filter, { tags: 'actor' });
  assert.deepEqual(all.patients.map((p) => [p.patientName, p.isActive]), [['New', true], ['Old', false], ['Other PCC', true]]);
  assert.deepEqual([all.total, all.active, all.label, all.patients[0].taggedByName, all.patients[0].pccName], [3, 2, 'Actor patient', 'Doctor', 'Sakshi']);
  const mine = (await run(listTaggedPatients, { params: { tag: 'actor' }, user: pcc })).data;
  assert.deepEqual(mine.patients.map((p) => p.patientName), ['New']);
});
