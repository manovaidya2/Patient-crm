const mongoose = require('mongoose');
const ChatAlarm = require('../models/ChatAlarm');
const TeamChat = require('../models/TeamChat');
const User = require('../models/User');
const { ALL_ROLES, isAdminLike } = require('../constants/roles');
const { asyncHandler } = require('../middleware/errorHandler');
const { encryptText } = require('../utils/chatCrypto');

// Team Chat alarm: one member rings another for something important (see models/ChatAlarm). The ring and the answer
// are also written into their direct chat, so the history stays with the conversation.
const fail = (message, statusCode = 400) => { throw Object.assign(new Error(message), { statusCode }); };
const same = (a, b) => String(a) === String(b);
const pairKeyOf = (a, b) => [String(a), String(b)].sort().join(':');
const view = (a) => ({
  id: String(a._id), fromId: String(a.from), fromName: a.fromName, fromRole: a.fromRole, toId: String(a.to), toName: a.toName, toRole: a.toRole,
  reason: a.reason, chatId: a.chat ? String(a.chat) : '', status: a.status, at: a.createdAt, ackAt: a.ackAt, ackNote: a.ackNote, cancelledAt: a.cancelledAt,
});
const io = (req) => req.app?.get?.('io');
// The person rung hears it at once; the sender sees the answer at once.
const tell = (req, alarm) => {
  io(req)?.to(`enquiry:user:${alarm.to}`).emit('chat:alarm', { id: String(alarm._id) });
  io(req)?.to(`enquiry:user:${alarm.from}`).emit('chat:alarm-updated', { id: String(alarm._id) });
};
// A line in the two people's direct chat (made if they never chatted).
const noteInChat = async (req, alarm, body) => {
  const pairKey = pairKeyOf(alarm.from, alarm.to);
  let chat = await TeamChat.findOne({ kind: 'direct', pairKey });
  if (!chat) {
    chat = new TeamChat({ kind: 'direct', pairKey, subject: '', status: 'open', createdBy: alarm.from, createdByName: alarm.fromName, createdByRole: alarm.fromRole, assignedTo: alarm.to, assignedToName: alarm.toName, assignedToRole: alarm.toRole, participants: [alarm.from, alarm.to], messages: [] });
  }
  chat.messages.push({ kind: 'event', sender: req.user._id, senderName: req.user.name, senderRole: req.user.role, body: encryptText(body), readBy: [{ user: req.user._id, name: req.user.name, at: new Date() }] });
  chat.lastMessageAt = new Date();
  await chat.save();
  io(req)?.to('enquiry:admins').emit('team-chat:changed', { id: String(chat._id) });
  chat.participants.forEach((id) => io(req)?.to(`enquiry:user:${id}`).emit('team-chat:changed', { id: String(chat._id) }));
  return chat;
};

// @route POST /api/team-chat/alarms  { toUserId, reason }
const ringAlarm = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.body.toUserId)) fail('Choose who to ring');
  if (same(req.body.toUserId, req.user._id)) fail('You cannot ring yourself');
  const reason = String(req.body.reason || '').trim();
  if (!reason) fail('Write why you are ringing (the work that is urgent)');
  if (reason.length > 500) fail('Keep the reason under 500 characters');
  const to = await User.findOne({ _id: req.body.toUserId, isActive: true, role: { $in: ALL_ROLES } }).select('name role').lean();
  if (!to) fail('That staff member is not active');
  // Ringing the same person again while it still rings: the new reason replaces the old one and it rings again.
  let alarm = await ChatAlarm.findOne({ from: req.user._id, to: to._id, status: 'ringing' });
  if (alarm) alarm.reason = reason;
  else alarm = new ChatAlarm({ from: req.user._id, fromName: req.user.name, fromRole: req.user.role, to: to._id, toName: to.name, toRole: to.role, reason });
  const chat = await noteInChat(req, alarm, `🚨 Alarm rung: ${reason}`);
  alarm.chat = chat._id;
  await alarm.save();
  tell(req, alarm);
  res.status(201).json({ success: true, alarm: view(alarm) });
});

// @route GET /api/team-chat/alarms/mine   (the siren: alarms ringing for me)
const myAlarms = asyncHandler(async (req, res) => {
  const rows = await ChatAlarm.find({ to: req.user._id, status: 'ringing' }).sort({ updatedAt: -1 }).limit(50).lean();
  res.json({ success: true, alarms: rows.map(view) });
});

// @route GET /api/team-chat/alarms/sent   (the ones I rang, last 30 days)
const sentAlarms = asyncHandler(async (req, res) => {
  const since = new Date(Date.now() - 30 * 86400000);
  const rows = await ChatAlarm.find({ from: req.user._id, createdAt: { $gte: since } }).sort({ createdAt: -1 }).limit(100).lean();
  res.json({ success: true, alarms: rows.map(view) });
});

// @route POST /api/team-chat/alarms/:id/ack  { note? }   "I'm on it" - only the person rung (or the admin)
const ackAlarm = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) fail('Invalid alarm');
  const alarm = await ChatAlarm.findById(req.params.id);
  if (!alarm) fail('Alarm not found', 404);
  if (!same(alarm.to, req.user._id) && !isAdminLike(req.user)) fail('Only the person it rings for can answer it', 403);
  if (alarm.status !== 'ringing') return res.json({ success: true, alarm: view(alarm) });
  const note = String(req.body.note || '').trim().slice(0, 500);
  Object.assign(alarm, { status: 'acknowledged', ackAt: new Date(), ackNote: note });
  await alarm.save();
  await noteInChat(req, alarm, `✅ Alarm answered by ${req.user.name}: ${note || "I'm on it"}`);
  tell(req, alarm);
  res.json({ success: true, alarm: view(alarm) });
});

// @route POST /api/team-chat/alarms/:id/cancel   - the sender (or the admin) stops it
const cancelAlarm = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) fail('Invalid alarm');
  const alarm = await ChatAlarm.findById(req.params.id);
  if (!alarm) fail('Alarm not found', 404);
  if (!same(alarm.from, req.user._id) && !isAdminLike(req.user)) fail('Only the person who rang it can cancel it', 403);
  if (alarm.status !== 'ringing') return res.json({ success: true, alarm: view(alarm) });
  Object.assign(alarm, { status: 'cancelled', cancelledAt: new Date() });
  await alarm.save();
  await noteInChat(req, alarm, `Alarm cancelled by ${req.user.name}`);
  tell(req, alarm);
  res.json({ success: true, alarm: view(alarm) });
});

module.exports = { ringAlarm, myAlarms, sentAlarms, ackAlarm, cancelAlarm, view };
