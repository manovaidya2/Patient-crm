const mongoose = require('mongoose');
const TeamChat = require('../models/TeamChat');
const User = require('../models/User');
const Patient = require('../models/Patient');
const PurchaseOrder = require('../models/PurchaseOrder');
const { ROLES, ALL_ROLES } = require('../constants/roles');
const { asyncHandler } = require('../middleware/errorHandler');
const { encryptText, decryptText } = require('../utils/chatCrypto');
const { queryTypesFor, queryTypeOf } = require('../constants/queryTypes');
const pairKeyOf = (a, b) => [String(a), String(b)].sort().join(':');

const fail = (message, statusCode = 400) => { throw Object.assign(new Error(message), { statusCode }); };
const same = (a, b) => String(a) === String(b);
const text = (value, max) => String(value ?? '').trim().slice(0, max);
const fileItems = (files = []) => (Array.isArray(files) ? files : []).map((f) => ({ url: `/uploads/team-chat/${f.filename}`, fileName: f.originalname }));
// Only the two (or more, after a forward) people in a thread see it; the admin sees every thread.
const accessFilter = (user) => (user.role === ROLES.ADMIN ? {} : { participants: user._id });
const inThread = (chat, user) => user.role === ROLES.ADMIN || chat.participants.some((id) => same(id, user._id));

async function staffMember(id) {
  if (!mongoose.isValidObjectId(id)) fail('Select the person to send it to');
  const user = await User.findOne({ _id: id, isActive: true, role: { $in: ALL_ROLES } }).select('name role').lean();
  if (!user) fail('That staff member is not active. Choose another person.');
  return user;
}
async function linkedPatient(id) {
  if (!id) return null;
  if (!mongoose.isValidObjectId(id)) fail('Select the patient again');
  const p = await Patient.findOne({ _id: id }).select('patientName patientCode').lean();
  if (!p) fail('That patient was not found');
  return p;
}

const note = (chat, user, body) => chat.messages.push({ kind: 'event', sender: user._id, senderName: user.name, senderRole: user.role, body: encryptText(body), readBy: [{ user: user._id, at: new Date() }] });
const touch = (chat) => { chat.lastMessageAt = new Date(); };
// Every participant (and the admins) is told the thread changed; the bell and open pages refresh.
const emit = (req, chat) => {
  const io = req.app?.get?.('io');
  if (!io) return;
  io.to('enquiry:admins').emit('team-chat:changed', { id: String(chat._id) });
  chat.participants.forEach((id) => io.to(`enquiry:user:${id}`).emit('team-chat:changed', { id: String(chat._id) }));
};

const messageView = (m, user) => ({
  id: String(m._id), kind: m.kind, senderId: String(m.sender || ''), senderName: m.senderName, senderRole: m.senderRole, mine: same(m.sender, user._id),
  body: decryptText(m.body), files: m.files || [], createdAt: m.createdAt,
  seenBy: (m.readBy || []).filter((r) => !same(r.user, m.sender)).map((r) => r.at),
});
const unreadFor = (chat, user) => chat.messages.filter((m) => !same(m.sender, user._id) && !(m.readBy || []).some((r) => same(r.user, user._id))).length;
const summaryView = (chat, user) => {
  const last = chat.messages[chat.messages.length - 1];
  return {
    id: String(chat._id), kind: chat.kind, subject: chat.subject, queryType: chat.queryType || '', status: chat.status,
    createdById: String(chat.createdBy), createdByName: chat.createdByName, createdByRole: chat.createdByRole,
    assignedToId: String(chat.assignedTo), assignedToName: chat.assignedToName, assignedToRole: chat.assignedToRole,
    participants: chat.participants.map(String),
    patientId: chat.patient ? String(chat.patient) : '', patientName: chat.patientName, patientCode: chat.patientCode,
    context: { ...(chat.context?.toObject ? chat.context.toObject() : chat.context || {}), purchaseOrder: chat.context?.purchaseOrder ? String(chat.context.purchaseOrder) : '', medicineJob: chat.context?.medicineJob ? String(chat.context.medicineJob) : '' },
    resolution: chat.resolution, resolvedAt: chat.resolvedAt, resolvedByName: chat.resolvedByName, closedAt: chat.closedAt, closedByName: chat.closedByName,
    lastMessageAt: chat.lastMessageAt, createdAt: chat.createdAt,
    lastMessage: last ? { senderName: last.senderName, kind: last.kind, preview: decryptText(last.body).slice(0, 120), at: last.createdAt } : null,
    unread: unreadFor(chat, user),
    actions: allowedActions(chat, user),
  };
};
// What the signed-in person may do: the other side resolves with a reason; the person who raised it closes when
// satisfied or reopens; anyone in the thread forwards it; the admin can do all of it.
function allowedActions(chat, user) {
  if (!inThread(chat, user)) return [];
  // The running chat between two people is never resolved or closed.
  if (chat.kind === 'direct') return ['message'];
  const admin = user.role === ROLES.ADMIN;
  const owner = same(chat.createdBy, user._id);
  const actions = [];
  if (chat.status !== 'closed') actions.push('message', 'forward');
  if (chat.status === 'open' && (admin || !owner)) actions.push('resolve');
  if (chat.status !== 'closed' && (admin || owner)) actions.push('close');
  if (chat.status !== 'open' && (admin || owner)) actions.push('reopen');
  return actions;
}
const fullView = (chat, user) => ({ ...summaryView(chat, user), messages: chat.messages.map((m) => messageView(m, user)) });

// @route GET /api/team-chat/people   Everyone in the team (WhatsApp-style list): each with the last message of our
// chat, how many of their messages I have not read, and how many queries between us are open.
const people = asyncHandler(async (req, res) => {
  const users = await User.find({ isActive: true, role: { $in: ALL_ROLES }, _id: { $ne: req.user._id } }).select('name role').sort({ role: 1, name: 1 }).lean();
  const chats = await TeamChat.find({ participants: req.user._id }).select('kind status pairKey participants lastMessageAt messages.sender messages.senderName messages.readBy messages.body messages.kind messages.createdAt').lean();
  const byPair = new Map();
  for (const c of chats) {
    const key = c.pairKey || pairKeyOf(c.participants[0], c.participants[1]);
    const slot = byPair.get(key) || { lastAt: null, last: null, unread: 0, openQueries: 0 };
    const last = c.messages[c.messages.length - 1];
    if (last && (!slot.lastAt || new Date(last.createdAt) > new Date(slot.lastAt))) { slot.lastAt = last.createdAt; slot.last = { senderName: last.senderName, preview: decryptText(last.body).slice(0, 80), kind: c.kind }; }
    slot.unread += unreadFor(c, req.user);
    if (c.kind === 'query' && c.status !== 'closed') slot.openQueries += 1;
    byPair.set(key, slot);
  }
  const rows = users.map((u) => { const s = byPair.get(pairKeyOf(req.user._id, u._id)) || { lastAt: null, last: null, unread: 0, openQueries: 0 }; return { id: String(u._id), name: u.name, role: u.role, ...s, queryTypes: queryTypesFor(u.role) }; });
  rows.sort((a, b) => (b.unread - a.unread) || (new Date(b.lastAt || 0) - new Date(a.lastAt || 0)) || a.name.localeCompare(b.name));
  res.json({ success: true, people: rows });
});

// @route GET /api/team-chat/with/:userId   My direct chat with one person (made on first open) plus our queries.
// Opening it marks their messages seen.
const withUser = asyncHandler(async (req, res) => {
  const other = await staffMember(req.params.userId);
  if (same(other._id, req.user._id)) fail('That is you');
  const pairKey = pairKeyOf(req.user._id, other._id);
  let direct = await TeamChat.findOne({ kind: 'direct', pairKey });
  if (!direct) {
    direct = new TeamChat({ kind: 'direct', pairKey, subject: '', status: 'open', createdBy: req.user._id, createdByName: req.user.name, createdByRole: req.user.role, assignedTo: other._id, assignedToName: other.name, assignedToRole: other.role, participants: [req.user._id, other._id], messages: [] });
    await direct.save();
  }
  let changed = false;
  direct.messages.forEach((m) => { if (!same(m.sender, req.user._id) && !(m.readBy || []).some((r) => same(r.user, req.user._id))) { m.readBy.push({ user: req.user._id, at: new Date() }); changed = true; } });
  if (changed) { await direct.save(); emit(req, direct); }
  const queries = await TeamChat.find({ kind: { $ne: 'direct' }, pairKey, participants: req.user._id }).sort({ lastMessageAt: -1 }).limit(100);
  res.json({ success: true, person: { id: String(other._id), name: other.name, role: other.role, queryTypes: queryTypesFor(other.role) }, chat: fullView(direct, req.user), queries: queries.map((q) => summaryView(q, req.user)) });
});

// @route GET /api/team-chat/pairs   Admin: every pair of people who chatted, to open any conversation.
const pairs = asyncHandler(async (req, res) => {
  if (req.user.role !== ROLES.ADMIN) fail('Admin only', 403);
  const chats = await TeamChat.find({}).select('kind status pairKey participants createdBy createdByName assignedTo assignedToName lastMessageAt messages.senderName messages.body messages.createdAt').sort({ lastMessageAt: -1 }).limit(2000).lean();
  const map = new Map();
  for (const c of chats) {
    const key = c.pairKey || pairKeyOf(c.participants[0], c.participants[1]);
    const slot = map.get(key) || { pairKey: key, a: { id: String(c.createdBy), name: c.createdByName }, b: { id: String(c.assignedTo), name: c.assignedToName }, lastAt: null, last: null, threads: 0, openQueries: 0 };
    const last = c.messages[c.messages.length - 1];
    if (last && (!slot.lastAt || new Date(last.createdAt) > new Date(slot.lastAt))) { slot.lastAt = last.createdAt; slot.last = { senderName: last.senderName, preview: decryptText(last.body).slice(0, 80) }; }
    slot.threads += 1; if (c.kind === 'query' && c.status !== 'closed') slot.openQueries += 1;
    map.set(key, slot);
  }
  res.json({ success: true, pairs: [...map.values()].sort((x, y) => new Date(y.lastAt || 0) - new Date(x.lastAt || 0)) });
});

// @route GET /api/team-chat/pair/:pairKey   Admin: one pair's direct chat and queries (read; the admin may write too).
const pairView = asyncHandler(async (req, res) => {
  if (req.user.role !== ROLES.ADMIN) fail('Admin only', 403);
  const pairKey = text(req.params.pairKey, 60);
  const direct = await TeamChat.findOne({ kind: 'direct', pairKey });
  const queries = await TeamChat.find({ kind: { $ne: 'direct' }, pairKey }).sort({ lastMessageAt: -1 }).limit(100);
  res.json({ success: true, chat: direct ? fullView(direct, req.user) : null, queries: queries.map((q) => summaryView(q, req.user)) });
});

// @route GET /api/team-chat/staff   Everyone a thread can be sent to.
const staff = asyncHandler(async (req, res) => {
  const users = await User.find({ isActive: true, role: { $in: ALL_ROLES }, _id: { $ne: req.user._id } }).select('name role').sort({ role: 1, name: 1 }).lean();
  res.json({ users: users.map((u) => ({ id: String(u._id), name: u.name, role: u.role })) });
});

// @route GET /api/team-chat/context?poId=   What a query raised from a PO carries: patient, PO, medicine state, delay.
const poContext = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(String(req.query.poId))) fail('Purchase order not found', 404);
  const po = await PurchaseOrder.findById(req.query.poId).lean();
  if (!po) fail('Purchase order not found', 404);
  const patient = await Patient.findById(po.patient).populate('assignedDoctor', 'name').lean();
  if (!patient) fail('Patient not found', 404);
  const { buildPoView } = require('../utils/purchaseOrderFlow');
  const MedicineJob = require('../models/MedicineJob');
  const job = po.medicineRequestId ? await MedicineJob.findOne({ patient: po.patient, phase: po.phase, requestId: po.medicineRequestId }).select('currentStage status hold stages').lean() : null;
  const v = buildPoView(po, patient, { job });
  const day = (d) => (d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' }) : '');
  const med = v.medicine;
  const lines = [`PO ${v.poNumber} · Phase ${v.phase}${v.supplyLabel ? ` · ${v.supplyLabel}` : ''}`];
  const open = (v.openSteps || []).map((s) => s.label);
  if (open.length) lines.push(`Now at: ${open.join(' / ')}`);
  if (med) {
    const MED = { requested: 'requested, not accepted yet', in_process: 'accepted, being prepared', made: 'ready', sent_to_courier: 'released', cancelled: 'cancelled' };
    lines.push(`Medicine: ${MED[med.status] || med.status}${med.requestedAt ? ` · requested ${day(med.requestedAt)}` : ''}${med.readyByDate ? ` · ready by ${day(med.readyByDate)}` : ''}`);
    const late = v.delay?.medicine && !v.delay.medicine.done ? v.delay.medicine.daysLate : 0;
    if (late > 0) lines.push(`Overdue: ${late} day${late === 1 ? '' : 's'} past the ready-by date, not ready yet`);
    if (v.medicineJob?.currentLabel) lines.push(`Fulfilment step: ${v.medicineJob.currentLabel}${v.medicineJob.hold ? ` (on hold: ${v.medicineJob.hold.reason})` : ''}`);
  }
  if (v.poPayment) lines.push(`Payment on this PO: verified Rs ${v.poPayment.amountPaid} / balance Rs ${v.poPayment.remaining}${v.poPayment.pendingCount ? ` · ${v.poPayment.pendingCount} pending` : ''}`);
  // Who the query most likely goes to, and what it is about, from where the PO stands.
  const late = med && v.delay?.medicine && !v.delay.medicine.done ? v.delay.medicine.daysLate : 0;
  const suggest = !med ? { role: ROLES.IN_TRANSIT, queryType: 'medicine_request' }
    : med.status === 'requested' ? { role: ROLES.MEDICINE_DEPARTMENT, queryType: 'request_not_accepted' }
    : med.status === 'in_process' ? { role: ROLES.MEDICINE_DEPARTMENT, queryType: late > 0 ? 'medicine_not_ready' : 'other' }
    : med.status === 'made' ? { role: ROLES.MEDICINE_DEPARTMENT, queryType: 'release_pending' }
    : open.includes('Medicine explained') ? { role: ROLES.ASSISTANT_DOCTOR, queryType: 'explanation_pending' }
    : open.includes('Treatment started') ? { role: ROLES.ASSISTANT_DOCTOR, queryType: 'treatment_start' }
    : { role: ROLES.MEDICINE_DEPARTMENT, queryType: 'other' };
  res.json({
    success: true,
    suggest,
    context: { purchaseOrder: v.id, poNumber: v.poNumber, phase: v.phase, requestId: med?.requestId || '', medicineJob: v.medicineJob?.id || '', step: open.join(' / '), summary: lines.join('\n') },
    patient: { id: v.patientId, patientName: v.patientName, patientCode: v.patientCode },
    subject: med && v.delay?.medicine && !v.delay.medicine.done && v.delay.medicine.daysLate > 0 ? `Medicine overdue - ${v.patientName} (${v.poNumber})` : `${v.patientName} (${v.poNumber})`,
  });
});

// @route GET /api/team-chat?status=open|resolved|closed|all&view=all|mine&poId=&patientId=&search=
const list = asyncHandler(async (req, res) => {
  const filter = accessFilter(req.user);
  if (['open', 'resolved', 'closed'].includes(req.query.status)) filter.status = req.query.status;
  if (req.query.poId && mongoose.isValidObjectId(String(req.query.poId))) filter['context.purchaseOrder'] = req.query.poId;
  if (req.query.patientId && mongoose.isValidObjectId(String(req.query.patientId))) filter.patient = req.query.patientId;
  if (req.query.jobId && mongoose.isValidObjectId(String(req.query.jobId))) filter['context.medicineJob'] = req.query.jobId;
  if (req.query.withUser && mongoose.isValidObjectId(String(req.query.withUser))) filter.pairKey = pairKeyOf(req.user._id, req.query.withUser);
  filter.kind = { $ne: 'direct' };
  const search = text(req.query.search, 120).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (search) filter.$or = ['subject', 'patientName', 'patientCode', 'context.poNumber', 'createdByName', 'assignedToName'].map((k) => ({ [k]: { $regex: search, $options: 'i' } }));
  const chats = await TeamChat.find(filter).sort({ lastMessageAt: -1 }).limit(300);
  const rows = chats.map((c) => summaryView(c, req.user));
  res.json({ success: true, rows, counts: { open: rows.filter((r) => r.status === 'open').length, resolved: rows.filter((r) => r.status === 'resolved').length, closed: rows.filter((r) => r.status === 'closed').length, unread: rows.reduce((n, r) => n + r.unread, 0) } });
});

// @route GET /api/team-chat/unread   For the bell: threads with messages this person has not seen.
const unread = asyncHandler(async (req, res) => {
  const chats = await TeamChat.find({ ...accessFilter(req.user), status: { $ne: 'closed' } }).select('kind subject patientName participants messages.sender messages.readBy messages.senderName messages.createdAt lastMessageAt').sort({ lastMessageAt: -1 }).limit(100).lean();
  const items = chats.map((c) => ({ id: String(c._id), kind: c.kind, subject: c.kind === 'direct' ? 'chat' : c.subject, patientName: c.patientName, withId: String((c.participants || []).find((id) => !same(id, req.user._id)) || ''), unread: unreadFor(c, req.user), lastAt: c.lastMessageAt, lastFrom: c.messages[c.messages.length - 1]?.senderName || '' })).filter((c) => c.unread > 0);
  res.json({ success: true, items, total: items.reduce((n, c) => n + c.unread, 0) });
});

// @route GET /api/team-chat/:id   Opening a thread marks its messages seen by this person.
const detail = asyncHandler(async (req, res) => {
  const chat = await TeamChat.findOne({ _id: req.params.id, ...accessFilter(req.user) });
  if (!chat) fail('Chat not found', 404);
  let changed = false;
  if (chat.participants.some((id) => same(id, req.user._id))) {
    chat.messages.forEach((m) => { if (!same(m.sender, req.user._id) && !(m.readBy || []).some((r) => same(r.user, req.user._id))) { m.readBy.push({ user: req.user._id, at: new Date() }); changed = true; } });
  }
  if (changed) { await chat.save(); emit(req, chat); }
  res.json({ success: true, chat: fullView(chat, req.user) });
});

// @route POST /api/team-chat   multipart: files[]; body: kind, subject, assignedTo, message, patientId, context (JSON)
const create = asyncHandler(async (req, res) => {
  const body = req.body || {};
  const kind = body.kind === 'discussion' ? 'discussion' : 'query';
  const subject = text(body.subject, 180);
  if (!subject) fail('Write the subject');
  const message = text(body.message, 4000);
  const files = fileItems(req.files);
  if (!message && !files.length) fail('Write the message');
  const to = await staffMember(body.assignedTo);
  if (same(to._id, req.user._id)) fail('Send it to someone else');
  const patient = await linkedPatient(body.patientId);
  let context = {};
  try { context = body.context ? (typeof body.context === 'string' ? JSON.parse(body.context) : body.context) : {}; } catch { context = {}; }
  const chat = new TeamChat({
    kind, subject, queryType: queryTypeOf(to.role, text(body.queryType, 60))?.key || '', pairKey: pairKeyOf(req.user._id, to._id),
    createdBy: req.user._id, createdByName: req.user.name, createdByRole: req.user.role,
    assignedTo: to._id, assignedToName: to.name, assignedToRole: to.role,
    participants: [req.user._id, to._id],
    patient: patient?._id || null, patientName: patient?.patientName || text(body.patientName, 150), patientCode: patient?.patientCode || '',
    context: {
      purchaseOrder: mongoose.isValidObjectId(String(context.purchaseOrder || '')) ? context.purchaseOrder : null, poNumber: text(context.poNumber, 40), phase: Number(context.phase) || null,
      requestId: text(context.requestId, 80), medicineJob: mongoose.isValidObjectId(String(context.medicineJob || '')) ? context.medicineJob : null, step: text(context.step, 160), summary: text(context.summary, 1000),
    },
    messages: [{ kind: 'message', sender: req.user._id, senderName: req.user.name, senderRole: req.user.role, body: encryptText(message), files, readBy: [{ user: req.user._id, at: new Date() }] }],
  });
  await chat.save(); emit(req, chat);
  res.status(201).json({ success: true, chat: fullView(chat, req.user) });
});

// @route POST /api/team-chat/:id/messages   multipart: files[]; body: message
const send = asyncHandler(async (req, res) => {
  const chat = await TeamChat.findOne({ _id: req.params.id, ...accessFilter(req.user) });
  if (!chat) fail('Chat not found', 404);
  if (!allowedActions(chat, req.user).includes('message')) fail('This chat is closed; reopen it to write again', 409);
  const message = text(req.body?.message, 4000);
  const files = fileItems(req.files);
  if (!message && !files.length) fail('Write the message');
  // The admin writing into a thread joins it (so both sides see the admin's words).
  if (!chat.participants.some((id) => same(id, req.user._id))) chat.participants.push(req.user._id);
  chat.messages.push({ kind: 'message', sender: req.user._id, senderName: req.user.name, senderRole: req.user.role, body: encryptText(message), files, readBy: [{ user: req.user._id, at: new Date() }] });
  touch(chat);
  await chat.save(); emit(req, chat);
  res.json({ success: true, chat: fullView(chat, req.user) });
});

// @route POST /api/team-chat/:id/action   body: { action: resolve|close|reopen|forward, note, assignedTo }
const act = asyncHandler(async (req, res) => {
  const chat = await TeamChat.findOne({ _id: req.params.id, ...accessFilter(req.user) });
  if (!chat) fail('Chat not found', 404);
  const action = text(req.body?.action, 20);
  if (!allowedActions(chat, req.user).includes(action)) fail('This action is not allowed for you or the current status', 403);
  const reason = text(req.body?.note, 4000);
  const now = new Date();
  if (action === 'resolve') {
    if (!reason) fail('Write the resolution / reason');
    Object.assign(chat, { status: 'resolved', resolution: reason, resolvedAt: now, resolvedByName: req.user.name });
    note(chat, req.user, `Resolved: ${reason}`);
  } else if (action === 'close') {
    Object.assign(chat, { status: 'closed', closedAt: now, closedByName: req.user.name });
    note(chat, req.user, `Closed${reason ? `: ${reason}` : ' - satisfied with the resolution'}`);
  } else if (action === 'reopen') {
    if (!reason) fail('Write why it is reopened');
    Object.assign(chat, { status: 'open', closedAt: null, closedByName: '' });
    note(chat, req.user, `Reopened: ${reason}`);
  } else if (action === 'forward') {
    const to = await staffMember(req.body?.assignedTo);
    if (same(to._id, chat.assignedTo)) fail('Select a different person');
    Object.assign(chat, { assignedTo: to._id, assignedToName: to.name, assignedToRole: to.role });
    if (!chat.participants.some((id) => same(id, to._id))) chat.participants.push(to._id);
    note(chat, req.user, `Forwarded to ${to.name}${reason ? `: ${reason}` : ''}`);
  }
  touch(chat);
  await chat.save(); emit(req, chat);
  res.json({ success: true, chat: fullView(chat, req.user) });
});

module.exports = { people, withUser, pairs, pairView, staff, poContext, list, unread, detail, create, send, act, allowedActions, accessFilter, unreadFor };
