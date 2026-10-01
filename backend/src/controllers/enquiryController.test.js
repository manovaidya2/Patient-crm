const { test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const Enquiry = require('../models/Enquiry');
const User = require('../models/User');
const controller = require('./enquiryController');
const { ALL_ROLES, ROLES } = require('../constants/roles');
const creator = { _id: new mongoose.Types.ObjectId(), name: 'Creator', role: ROLES.RECEPTIONIST };
const assignee = { _id: new mongoose.Types.ObjectId(), name: 'Assignee', role: ROLES.PSYCHOLOGIST };
const next = { _id: new mongoose.Types.ObjectId(), name: 'Next', role: ROLES.MEDICINE_DEPARTMENT };
const originals = { find: Enquiry.findOne, user: User.findOne, update: Enquiry.updateOne, aggregate: Enquiry.aggregate, save: Enquiry.prototype.save };
afterEach(() => { Enquiry.findOne = originals.find; User.findOne = originals.user; Enquiry.updateOne = originals.update; Enquiry.aggregate = originals.aggregate; Enquiry.prototype.save = originals.save; });
const sample = () => new Enquiry({ patientName: 'Test Patient', subject: 'Medicine question', description: 'Details', createdBy: creator._id, createdByName: creator.name, assignedTo: assignee._id, assignedToName: assignee.name, assignedToRole: assignee.role, participants: [creator._id, assignee._id] });
async function invoke(handler, user, body = {}, entry = sample()) {
  Enquiry.findOne = async (filter) => {
    if (filter.participants && !entry.participants.some((id) => String(id) === String(filter.participants))) return null;
    return entry;
  };
  entry.save = async () => entry;
  const events = [];
  const req = { user, body, params: { id: String(entry._id) }, app: { get: () => ({ to: (room) => ({ emit: (event) => events.push({ room, event }) }) }) } };
  const res = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(data) { this.data = data; } };
  await handler(req, res, (err) => { throw err; });
  return { entry, res, events };
}
test('all roles can create assigned enquiries with durable updates for both people', async () => {
  User.findOne = () => ({ select: async () => assignee });
  Enquiry.prototype.save = async function () { return this; };
  for (const role of ALL_ROLES) {
    const { res } = await invoke(controller.create, { ...creator, role }, { patientName: 'Patient', subject: 'Question', description: 'Details', assignedTo: String(assignee._id) });
    assert.equal(res.statusCode, 201);
    assert.equal(res.data.enquiry.history.length, 1);
    assert.equal(res.data.enquiry.participants.length, 2);
    assert.equal(res.data.enquiry.alerts, undefined);
  }
});
test('forward keeps creator and previous assignee subscribed and records reason', async () => {
  User.findOne = () => ({ select: async () => next });
  const { entry, events } = await invoke(controller.update, assignee, { action: 'forward', assignedTo: String(next._id), note: 'Medicine team needs to check' });
  assert.equal(String(entry.assignedTo), String(next._id));
  assert.equal(entry.participants.length, 3);
  assert.equal(entry.alerts.length, 3);
  assert.equal(entry.history[0].actorName, assignee.name);
  assert.equal(entry.history[0].note, 'Medicine team needs to check');
  assert.equal(events.length, 4);
  assert.ok(controller.allowedActions(entry, creator).includes('comment'));
  assert.ok(!controller.allowedActions(entry, assignee).includes('resolve'));
});
test('resolve, close and reopen retain history and notify creator', async () => {
  const entry = sample();
  await invoke(controller.update, assignee, { action: 'start', note: 'Checking' }, entry);
  assert.equal(entry.status, 'in_progress');
  await invoke(controller.update, assignee, { action: 'resolve', note: 'Explained medicine schedule' }, entry);
  assert.equal(entry.resolution, 'Explained medicine schedule');
  await invoke(controller.update, creator, { action: 'close', note: 'Patient confirmed' }, entry);
  assert.equal(entry.status, 'closed');
  assert.equal(entry.closedReason, 'Patient confirmed');
  assert.ok(entry.alerts.some((alert) => String(alert.recipient) === String(creator._id)));
  User.findOne = () => ({ select: async () => next });
  await invoke(controller.update, creator, { action: 'reopen', note: 'Patient needs more help', assignedTo: String(next._id) }, entry);
  assert.equal(entry.status, 'open');
  assert.equal(entry.history.length, 4);
});
test('rejects outsiders, unauthorized actions, invalid transitions and blank reasons', async () => {
  await assert.rejects(invoke(controller.update, next, { action: 'comment', note: 'Test' }), { statusCode: 404 });
  await assert.rejects(invoke(controller.update, creator, { action: 'resolve', note: 'Test' }), { statusCode: 403 });
  await assert.rejects(invoke(controller.update, assignee, { action: 'close', note: 'Test' }), { statusCode: 403 });
  await assert.rejects(invoke(controller.update, assignee, { action: 'resolve', note: ' ' }), { statusCode: 400 });
  User.findOne = () => ({ select: async () => null });
  await assert.rejects(invoke(controller.update, assignee, { action: 'forward', assignedTo: String(next._id), note: 'Test' }), { statusCode: 400 });
});
test('unread notification queries and acknowledgement are scoped to current user', async () => {
  Enquiry.aggregate = async (pipeline) => {
    assert.equal(String(pipeline[0].$match.alerts.$elemMatch.recipient), String(creator._id));
    assert.equal(String(pipeline[2].$match['alerts.recipient']), String(creator._id));
    return [{ items: [], count: [] }];
  };
  await invoke(controller.notifications, creator);
  Enquiry.updateOne = async (filter, update, options) => {
    assert.equal(String(filter['alerts.recipient']), String(creator._id));
    assert.equal(String(options.arrayFilters[0]['alert.recipient']), String(creator._id));
    assert.equal(update.$inc.__v, 1);
  };
  await invoke(controller.markRead, creator);
});

test('admin sees all enquiries and can act on closed and unassigned-to-admin enquiries', async () => {
  const admin = { ...next, role: ROLES.ADMIN };
  assert.deepEqual(controller.accessFilter(admin), { deletedAt: null });
  const entry = sample(); entry.status = 'closed'; entry.closedReason = 'Old closure';
  assert.ok(controller.allowedActions(entry, admin).includes('start'));
  await invoke(controller.update, admin, { action: 'start', note: 'Investigating again' }, entry);
  assert.equal(entry.status, 'in_progress');
  assert.equal(entry.closedReason, '');
  await invoke(controller.update, admin, { action: 'close', note: 'Admin closed directly' }, entry);
  assert.equal(entry.status, 'closed');
});

test('admin edits preserve creator and timeline; delete is audited and staff are denied', async () => {
  const admin = { ...next, role: ROLES.ADMIN };
  const entry = sample();
  await invoke(controller.edit, admin, { patientName: 'Correct name', patientReference: 'PT-1', subject: 'Updated subject', description: 'Corrected details', assignedTo: String(assignee._id), reason: 'Correcting details' }, entry);
  assert.equal(entry.patientName, 'Correct name');
  assert.equal(String(entry.createdBy), String(creator._id));
  assert.match(entry.history[0].note, /Test Patient -> Correct name/);
  await assert.rejects(invoke(controller.edit, creator, {}, entry), { statusCode: 403 });
  await assert.rejects(invoke(controller.remove, assignee, { reason: 'Test' }, entry), { statusCode: 403 });
  await assert.rejects(invoke(controller.remove, admin, { reason: ' ' }, entry), { statusCode: 400 });
  await invoke(controller.remove, admin, { reason: 'Duplicate enquiry' }, entry);
  assert.ok(entry.deletedAt instanceof Date);
  assert.equal(entry.history.at(-1).note, 'Duplicate enquiry');
});
