const mongoose = require('mongoose');
const Enquiry = require('../models/Enquiry');
const User = require('../models/User');
const { ROLES, ALL_ROLES } = require('../constants/roles');
const { asyncHandler } = require('../middleware/errorHandler');
const fail = (message, statusCode = 400) => { const error = new Error(message); error.statusCode = statusCode; throw error; };
const same = (a, b) => String(a) === String(b);
const accessFilter = (user) => ({ deletedAt: null, ...(user.role === ROLES.ADMIN ? {} : { participants: user._id }) });
const requiredText = (value, label, max) => {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text || text.length > max) fail(`${label} is required (maximum ${max} characters)`);
  return text;
};
async function findAssignee(id) {
  if (!mongoose.isValidObjectId(id)) fail('Select a staff member');
  const user = await User.findOne({ _id: id, isActive: true, role: { $in: ALL_ROLES } }).select('name role');
  if (!user) fail('Staff member is no longer active. Choose another person.');
  return user;
}
function allowedActions(entry, user) {
  const admin = user.role === ROLES.ADMIN;
  if (admin) return ['comment', 'start', 'forward', 'resolve', 'close', 'reopen'];
  const owner = same(entry.createdBy, user._id);
  const assignee = same(entry.assignedTo, user._id);
  const actions = [];
  if (entry.status !== 'closed') actions.push('comment');
  if (['open', 'in_progress'].includes(entry.status) && (admin || assignee)) actions.push('forward', 'resolve');
  if (entry.status === 'open' && (admin || assignee)) actions.push('start');
  if (entry.status === 'resolved' && (admin || owner || assignee)) actions.push('close');
  if (['resolved', 'closed'].includes(entry.status) && (admin || owner)) actions.push('reopen');
  return actions;
}
function serialize(entry, user) {
  const data = entry.toObject ? entry.toObject() : { ...entry };
  delete data.alerts;
  return { ...data, id: String(data._id), actions: allowedActions(entry, user) };
}
function recordEvent(entry, user, action, note) {
  entry.history.push({ action, note, actor: user._id, actorName: user.name, assigneeName: entry.assignedToName, status: entry.status });
  for (const recipient of entry.participants) entry.alerts.push({ recipient, message: `${user.name}: ${action} - ${entry.subject}` });
}
function emit(req, entry) {
  const io = req.app.get('io');
  io?.to('enquiry:admins').emit('enquiry:changed', { id: String(entry._id) });
  for (const id of entry.participants) io?.to(`enquiry:user:${id}`).emit('enquiry:changed', { id: String(entry._id) });
}
const staff = asyncHandler(async (req, res) => {
  const users = await User.find({ isActive: true, role: { $in: ALL_ROLES } }).select('name role').sort({ role: 1, name: 1 }).lean();
  res.json({ users: users.map((user) => ({ id: String(user._id), name: user.name, role: user.role })) });
});
const list = asyncHandler(async (req, res) => {
  const filter = accessFilter(req.user);
  if (req.query.view === 'assigned') filter.assignedTo = req.user._id;
  if (req.query.view === 'created') filter.createdBy = req.user._id;
  if (req.query.status) {
    if (!['open', 'in_progress', 'resolved', 'closed'].includes(req.query.status)) fail('Invalid status');
    filter.status = req.query.status;
  }
  const search = String(req.query.search || '').trim().slice(0, 200).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (search) filter.$or = ['patientName', 'patientReference', 'subject', 'createdByName', 'assignedToName'].map((key) => ({ [key]: { $regex: search, $options: 'i' } }));
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const countFilter = { ...filter };
  delete countFilter.status;
  const states = ['open', 'in_progress', 'resolved', 'closed'];
  const [rows, counts] = await Promise.all([
    Enquiry.find(filter).select('-alerts -history -description').sort({ updatedAt: -1 }).skip((page - 1) * 25).limit(25).lean(),
    Promise.all(states.map((status) => Enquiry.countDocuments({ ...countFilter, status }))),
  ]);
  const summary = Object.fromEntries(states.map((status, index) => [status, counts[index]]));
  summary.total = counts.reduce((sum, count) => sum + count, 0);
  const total = req.query.status ? summary[req.query.status] : summary.total;
  res.json({ rows: rows.map((row) => serialize(row, req.user)), total, summary });
});
const detail = asyncHandler(async (req, res) => {
  const entry = await Enquiry.findOne({ _id: req.params.id, ...accessFilter(req.user) }).select('-alerts');
  if (!entry) fail('Enquiry not found', 404);
  res.json({ enquiry: serialize(entry, req.user) });
});
const create = asyncHandler(async (req, res) => {
  const patientName = requiredText(req.body.patientName, 'Patient name', 150);
  const subject = requiredText(req.body.subject, 'Subject', 180);
  const description = requiredText(req.body.description, 'Enquiry details', 4000);
  const patientReference = String(req.body.patientReference || '').trim();
  if (patientReference.length > 100) fail('Patient reference is too long');
  const assignee = await findAssignee(req.body.assignedTo);
  const entry = new Enquiry({ patientName, patientReference, subject, description,
    createdBy: req.user._id, createdByName: req.user.name,
    assignedTo: assignee._id, assignedToName: assignee.name, assignedToRole: assignee.role,
    participants: [...new Set([String(req.user._id), String(assignee._id)])],
  });
  recordEvent(entry, req.user, 'Created and assigned', description);
  await entry.save(); emit(req, entry);
  res.status(201).json({ enquiry: serialize(entry, req.user) });
});
const update = asyncHandler(async (req, res) => {
  const entry = await Enquiry.findOne({ _id: req.params.id, ...accessFilter(req.user) });
  if (!entry) fail('Enquiry not found', 404);
  if (!allowedActions(entry, req.user).includes(req.body.action)) fail('This action is not allowed for you or the current status', 403);
  const note = requiredText(req.body.note, 'Reason / update', 4000);
  const action = req.body.action;
  const names = { start: 'Work started', forward: 'Forwarded / escalated', comment: 'Update added', resolve: 'Resolved', close: 'Closed', reopen: 'Reopened' };
  if (action === 'forward' || action === 'reopen') {
    const assignee = await findAssignee(action === 'reopen' && !req.body.assignedTo ? entry.assignedTo : req.body.assignedTo);
    if (action === 'forward' && same(assignee._id, entry.assignedTo)) fail('Select a different staff member');
    entry.assignedTo = assignee._id; entry.assignedToName = assignee.name; entry.assignedToRole = assignee.role;
    if (!entry.participants.some((id) => same(id, assignee._id))) entry.participants.push(assignee._id);
    entry.status = 'open';
    entry.resolution = ''; entry.closedReason = '';
  }
  if (action === 'start') { entry.status = 'in_progress'; entry.resolution = ''; entry.closedReason = ''; }
  if (action === 'resolve') { entry.status = 'resolved'; entry.resolution = note; entry.closedReason = ''; }
  if (action === 'close') { entry.status = 'closed'; entry.closedReason = note; }
  recordEvent(entry, req.user, names[action], note);
  try { await entry.save(); } catch (error) { if (error.name === 'VersionError') fail('This enquiry changed. Refresh and try again.', 409); throw error; }
  emit(req, entry);
  res.json({ enquiry: serialize(entry, req.user) });
});
const notifications = asyncHandler(async (req, res) => {
  const recipient = new mongoose.Types.ObjectId(String(req.user._id));
  const [result] = await Enquiry.aggregate([
    { $match: { deletedAt: null, alerts: { $elemMatch: { recipient, readAt: null } } } },
    { $unwind: '$alerts' }, { $match: { 'alerts.recipient': recipient, 'alerts.readAt': null } },
    { $facet: { count: [{ $count: 'total' }], items: [{ $sort: { 'alerts.createdAt': -1, 'alerts._id': -1 } }, { $limit: 30 },
      { $project: { _id: 0, enquiryId: '$_id', id: '$alerts._id', message: '$alerts.message', createdAt: '$alerts.createdAt' } }] } },
  ]);
  res.json({ items: result?.items || [], total: result?.count?.[0]?.total || 0 });
});
const markRead = asyncHandler(async (req, res) => {
  await Enquiry.updateOne({ _id: req.params.id, 'alerts.recipient': req.user._id },
    { $set: { 'alerts.$[alert].readAt': new Date() }, $inc: { __v: 1 } },
    { arrayFilters: [{ 'alert.recipient': req.user._id, 'alert.readAt': null }], timestamps: false });
  res.json({ success: true });
});
const edit = asyncHandler(async (req, res) => {
  if (req.user.role !== ROLES.ADMIN) fail('Only Admin can edit enquiries', 403);
  const entry = await Enquiry.findOne({ _id: req.params.id, deletedAt: null });
  if (!entry) fail('Enquiry not found', 404);
  const reason = requiredText(req.body.reason, 'Edit reason', 1000);
  const changes = [];
  for (const [key, label, max] of [['patientName', 'Patient name', 150], ['subject', 'Subject', 180], ['description', 'Enquiry details', 4000]]) {
    const value = requiredText(req.body[key], label, max);
    if (entry[key] !== value) { changes.push(`${label}: ${entry[key]} -> ${value}`); entry[key] = value; }
  }
  const reference = String(req.body.patientReference || '').trim();
  if (reference.length > 100) fail('Patient reference is too long');
  if (entry.patientReference !== reference) changes.push(`Reference: ${entry.patientReference} -> ${reference}`);
  entry.patientReference = reference;
  if (!same(entry.assignedTo, req.body.assignedTo)) {
    const assignee = await findAssignee(req.body.assignedTo);
    changes.push(`Assigned: ${entry.assignedToName} -> ${assignee.name}`);
    entry.assignedTo = assignee._id; entry.assignedToName = assignee.name; entry.assignedToRole = assignee.role;
    if (!entry.participants.some((id) => same(id, assignee._id))) entry.participants.push(assignee._id);
  }
  recordEvent(entry, req.user, 'Edited by Admin', `${reason}\n${changes.join('\n')}`);
  try { await entry.save(); } catch (error) { if (error.name === 'VersionError') fail('This enquiry changed. Refresh and try again.', 409); throw error; }
  emit(req, entry);
  res.json({ enquiry: serialize(entry, req.user) });
});
const remove = asyncHandler(async (req, res) => {
  if (req.user.role !== ROLES.ADMIN) fail('Only Admin can delete enquiries', 403);
  const entry = await Enquiry.findOne({ _id: req.params.id, deletedAt: null });
  if (!entry) fail('Enquiry not found', 404);
  const reason = requiredText(req.body.reason, 'Delete reason', 1000);
  entry.deletedAt = new Date(); entry.deletedByName = req.user.name;
  entry.history.push({ action: 'Deleted by Admin', note: reason, actor: req.user._id, actorName: req.user.name, status: entry.status, assigneeName: entry.assignedToName });
  try { await entry.save(); } catch (error) { if (error.name === 'VersionError') fail('This enquiry changed. Refresh and try again.', 409); throw error; }
  emit(req, entry); res.json({ success: true });
});
module.exports = { staff, list, detail, create, update, edit, remove, notifications, markRead, allowedActions, accessFilter };
