const { test, afterEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
const TeamChat = require('../models/TeamChat');
const User = require('../models/User');
const controller = require('./teamChatController');
const { encryptText, decryptText } = require('../utils/chatCrypto');
const { ROLES } = require('../constants/roles');

afterEach(() => mock.restoreAll());
const transit = { _id: new mongoose.Types.ObjectId(), name: 'Tanu', role: ROLES.IN_TRANSIT };
const med = { _id: new mongoose.Types.ObjectId(), name: 'Meena', role: ROLES.MEDICINE_DEPARTMENT };
const other = { _id: new mongoose.Types.ObjectId(), name: 'Rohit', role: ROLES.POST_COUNSELOR };
const admin = { _id: new mongoose.Types.ObjectId(), name: 'Admin', role: ROLES.ADMIN };

const call = (handler, user, { params = {}, body = {}, query = {}, files = [] } = {}) => new Promise((resolve, reject) => {
  const res = { statusCode: 200, status(c) { this.statusCode = c; return this; }, json(v) { resolve({ status: this.statusCode, ...v }); } };
  handler({ user, params, body, query, files, app: { get: () => ({ to: () => ({ emit() {} }) }) } }, res, reject);
});

test('messages are encrypted at rest and read back; plain old text passes through', () => {
  const stored = encryptText('Medicine 3 days late');
  assert.ok(stored.startsWith('enc1:') && !stored.includes('late'));
  assert.equal(decryptText(stored), 'Medicine 3 days late');
  assert.notEqual(encryptText('same'), encryptText('same'), 'a fresh IV every time');
  assert.equal(decryptText('plain'), 'plain');
});

test('a query goes one-to-one: raised, answered, resolved, closed; only the two (and the admin) see it', async () => {
  const chats = [];
  mock.method(User, 'findOne', (f) => ({ select: () => ({ lean: async () => [transit, med, other].find((u) => String(u._id) === String(f._id)) || null }) }));
  mock.method(TeamChat.prototype, 'save', async function save() { await this.validate(); if (!chats.includes(this)) chats.push(this); return this; });
  mock.method(TeamChat, 'findOne', async (f) => chats.find((c) => String(c._id) === String(f._id) && (!f.participants || c.participants.some((id) => String(id) === String(f.participants)))) || null);
  const ctx = { purchaseOrder: String(new mongoose.Types.ObjectId()), poNumber: 'PO-4821', phase: 1, step: 'Medicine ready', summary: 'Overdue: 3 days' };
  const created = await call(controller.create, transit, { body: { subject: 'Medicine overdue - Aarav', assignedTo: String(med._id), message: 'Kab tak ready hogi?', context: JSON.stringify(ctx) } });
  assert.equal(created.status, 201);
  const id = created.chat.id;
  assert.equal(chats[0].messages[0].body.startsWith('enc1:'), true, 'stored encrypted');
  assert.equal(created.chat.messages[0].body, 'Kab tak ready hogi?');
  assert.equal(created.chat.context.poNumber, 'PO-4821');
  // The other side reads it (seen), answers, resolves with a reason.
  let v = (await call(controller.detail, med, { params: { id } })).chat;
  assert.equal(v.unread, 0);
  assert.equal(v.messages[0].seenBy.length, 1, 'seen tick for the sender');
  assert.deepEqual(v.actions, ['message', 'forward', 'resolve']);
  v = (await call(controller.send, med, { params: { id }, body: { message: 'Stock aa gaya, kal ready' } })).chat;
  assert.equal((await call(controller.detail, transit, { params: { id } })).chat.messages.length, 2);
  await assert.rejects(call(controller.act, transit, { params: { id }, body: { action: 'resolve', note: 'x' } }), /not allowed/, 'the raiser does not resolve');
  v = (await call(controller.act, med, { params: { id }, body: { action: 'resolve', note: 'Ready tomorrow morning' } })).chat;
  assert.equal(v.status, 'resolved');
  assert.ok(v.messages.some((m) => m.kind === 'event' && m.body.startsWith('Resolved')));
  // The raiser closes when satisfied (could reopen instead); nobody writes after close.
  v = (await call(controller.act, transit, { params: { id }, body: { action: 'close' } })).chat;
  assert.equal(v.status, 'closed');
  await assert.rejects(call(controller.send, med, { params: { id }, body: { message: 'late' } }), /closed/);
  // Privacy: a third person cannot open it; the admin can.
  await assert.rejects(call(controller.detail, other, { params: { id } }), /not found/);
  assert.equal((await call(controller.detail, admin, { params: { id } })).chat.messages.length >= 3, true);
});
