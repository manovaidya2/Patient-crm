const { test } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const ChatAlarm = require('../models/ChatAlarm');
const TeamChat = require('../models/TeamChat');
const User = require('../models/User');
const controller = require('./chatAlarmController');

const asha = { _id: new mongoose.Types.ObjectId(), name: 'Asha', role: 'medicine_department' };
const ravi = { _id: new mongoose.Types.ObjectId(), name: 'Ravi', role: 'in_transit' };
const run = async (handler, req) => {
  let body = null; let status = 200; let error = null;
  const emitted = [];
  const io = { to: (room) => ({ emit: (event) => emitted.push(`${room}>${event}`) }) };
  await handler({ params: {}, body: {}, app: { get: () => io }, ...req }, { status(c) { status = c; return this; }, json(b) { body = b; } }, (e) => { error = e; });
  return { body, status, error, emitted };
};

test('a member rings another: it rings for them live and is written in their direct chat; they answer "I\'m on it"', async () => {
  const key = process.env.CHAT_ENCRYPTION_KEY; process.env.CHAT_ENCRYPTION_KEY = 'a'.repeat(64);
  const store = [];
  const chats = [];
  const saved = [
    [User, 'findOne', User.findOne], [ChatAlarm, 'findOne', ChatAlarm.findOne], [ChatAlarm, 'findById', ChatAlarm.findById],
    [TeamChat, 'findOne', TeamChat.findOne], [ChatAlarm.prototype, 'save', ChatAlarm.prototype.save], [TeamChat.prototype, 'save', TeamChat.prototype.save],
  ];
  User.findOne = () => ({ select: () => ({ lean: async () => ravi }) });
  ChatAlarm.findOne = async (f) => store.find((a) => String(a.from) === String(f.from) && String(a.to) === String(f.to) && a.status === f.status) || null;
  ChatAlarm.findById = async (id) => store.find((a) => String(a._id) === String(id)) || null;
  TeamChat.findOne = async () => chats[0] || null;
  ChatAlarm.prototype.save = async function save() { if (!store.includes(this)) store.push(this); this.createdAt = this.createdAt || new Date(); return this; };
  TeamChat.prototype.save = async function save() { if (!chats.includes(this)) chats.push(this); return this; };
  try {
    const self = await run(controller.ringAlarm, { user: asha, body: { toUserId: String(asha._id), reason: 'x' } });
    assert.match(self.error.message, /yourself/);
    const noReason = await run(controller.ringAlarm, { user: asha, body: { toUserId: String(ravi._id), reason: '' } });
    assert.match(noReason.error.message, /why/);
    const rung = await run(controller.ringAlarm, { user: asha, body: { toUserId: String(ravi._id), reason: 'Quality check of PO-1 is pending since morning' } });
    assert.equal(rung.error, null);
    assert.equal(rung.status, 201);
    assert.ok(rung.emitted.includes(`enquiry:user:${ravi._id}>chat:alarm`), 'it rings for Ravi at once');
    assert.equal(chats[0].messages.length, 1, 'the ring is written in their direct chat');
    // Ringing again while it rings: one alarm, new reason.
    await run(controller.ringAlarm, { user: asha, body: { toUserId: String(ravi._id), reason: 'Still pending!' } });
    assert.equal(store.length, 1);
    assert.equal(store[0].reason, 'Still pending!');
    const notMine = await run(controller.ackAlarm, { user: asha, params: { id: String(store[0]._id) } });
    assert.equal(notMine.error.statusCode, 403);
    const ack = await run(controller.ackAlarm, { user: ravi, params: { id: String(store[0]._id) }, body: { note: 'Doing it now' } });
    assert.equal(ack.body.alarm.status, 'acknowledged');
    assert.ok(ack.emitted.includes(`enquiry:user:${asha._id}>chat:alarm-updated`), 'Asha sees the answer at once');
    const cancelByRavi = await run(controller.cancelAlarm, { user: ravi, params: { id: String(store[0]._id) } });
    assert.equal(cancelByRavi.error.statusCode, 403);
  } finally { saved.forEach(([t, n, old]) => { t[n] = old; }); if (key === undefined) delete process.env.CHAT_ENCRYPTION_KEY; else process.env.CHAT_ENCRYPTION_KEY = key; }
});
