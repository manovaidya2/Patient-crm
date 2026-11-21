// Moving every old patient onto the Care Schedule (server start / "Move old patients"), with the database mocked.
const { test, mock, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const Patient = require('../models/Patient');
const CareSession = require('../models/CareSession');
const { moveOldPatients } = require('./careMigration');

afterEach(() => mock.restoreAll());
const id = () => new mongoose.Types.ObjectId();
const at = (day, hour = '11:00') => new Date(`${day}T${hour}:00+05:30`);
const NOW = at('2026-11-21', '10:00');
const query = (rows) => { const q = { select: () => q, populate: () => q, lean: async () => rows }; return q; };

test('every old phase with open entries moves once: new sessions for the days left, old open entries closed, a second run changes nothing', async () => {
  const pcc = { _id: id(), name: 'PCC Neha' };
  const patient = {
    _id: id(), patientName: 'Aarav', patientCode: 'A-1', assignedDoctor: pcc,
    stages: [{
      number: 1, purchaseOrder: 'PO-1',
      followUps: [{ _id: id(), dateTime: at('2026-07-25'), status: 'completed' }, { _id: id(), dateTime: at('2027-01-04'), status: 'scheduled' }],
      familySessions: [{ _id: id(), dateTime: at('2026-12-26'), status: 'scheduled' }],
    }, { number: 2, followUps: [{ _id: id(), dateTime: at('2026-10-01'), status: 'completed' }], familySessions: [] }],
  };
  let stored = [];
  const updates = [];
  mock.method(Patient, 'find', () => query([patient]));
  mock.method(CareSession, 'find', () => query(stored.map((s) => ({ code: s.code }))));
  mock.method(CareSession, 'insertMany', async (docs) => { stored = stored.concat(docs); return docs; });
  mock.method(Patient, 'updateOne', async (filter, update, options) => { updates.push({ filter, update, options }); return { modifiedCount: updates.length === 1 ? 1 : 0 }; });

  const first = await moveOldPatients({ user: { name: 'System' }, all: true, now: NOW, ready: () => true });
  assert.deepEqual([first.moved, first.sessions, first.closed], [1, 4, 2], 'phase 1 only (phase 2 has nothing open)');
  assert.deepEqual(stored.map((s) => s.code), ['FU-06', 'FS-03', 'FU-07', 'DT-03']);
  assert.deepEqual(stored.map((s) => s.status), ['pending', 'scheduled', 'scheduled', 'pending'], 'call times carried from the old entries close by');
  assert.equal(stored[1].callAt.toISOString(), at('2026-12-26').toISOString());
  assert.ok(stored.every((s) => s.assigneeName === 'PCC Neha' && s.supplyKey === 'converted'));
  assert.equal(String(updates[0].filter._id), String(patient._id));
  assert.equal(updates[0].update.$set['stages.$[s].followUps.$[f0].status'], 'cancelled');

  const again = await moveOldPatients({ user: { name: 'System' }, all: true, now: NOW, ready: () => true });
  assert.equal(again.moved, 0);
  assert.equal(stored.length, 4, 'no session is made twice');
});

test('nothing runs without a database, and a chosen list moves only those phases', async () => {
  assert.deepEqual(await moveOldPatients({ user: { name: 'A' }, all: true, ready: () => false }), { results: [], moved: 0, sessions: 0, closed: 0 });
  assert.equal((await moveOldPatients({ user: { name: 'A' }, wanted: [], ready: () => true })).moved, 0);
});
