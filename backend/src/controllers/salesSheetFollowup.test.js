const { test } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const SalesAppointment = require('../models/SalesAppointment');
const SalesSheetAudit = require('../models/SalesSheetAudit');
const controller = require('./salesSheetController');
const { ROLES } = require('../constants/roles');

const ownerId = new mongoose.Types.ObjectId();
const rowId = new mongoose.Types.ObjectId();
const sample = () => new SalesAppointment({ _id: rowId, appointmentCode: 'APT-TEST', appointmentDate: '2026-09-28', createdBy: ownerId, createdByName: 'Sales', status: 'active' });
const originalUpdate = SalesAppointment.findOneAndUpdate;
const originalAudit = SalesSheetAudit.create;

async function invoke(handler, { role = ROLES.SALES_TEAM, body = {}, row = sample() } = {}) {
  let filter;
  SalesAppointment.findOneAndUpdate = async (query, update) => {
    filter = query;
    if (query.status === 'active' && row.status !== 'active') return null;
    if (query.status === 'not_coming' && row.status !== 'not_coming') return null;
    if (query.status?.$in && !query.status.$in.includes(row.status)) return null;
    if (query.createdBy && String(query.createdBy) !== String(row.createdBy)) return null;
    if (query.acceptedAt === null && row.acceptedAt) return null;
    for (const [key, value] of Object.entries(update.$set || {})) row[key] = value;
    for (const [key, value] of Object.entries(update.$inc || {})) row[key] = (row[key] || 0) + value;
    for (const [key, value] of Object.entries(update.$push || {})) row[key].push(value);
    return row;
  };
  SalesSheetAudit.create = async () => ({});
  const response = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(data) { this.data = data; } };
  try {
    await handler({ params: { id: String(rowId) }, body, user: { _id: ownerId, name: 'Sales', role }, app: { get: () => null } }, response, (error) => { throw error; });
    return { response, row, filter };
  } finally { SalesAppointment.findOneAndUpdate = originalUpdate; SalesSheetAudit.create = originalAudit; }
}

test('not coming keeps the same lead, requires reason, and hides call fields from Sales', async () => {
  const missing = await invoke(controller.markNotComing, { body: { reason: ' ' } });
  assert.equal(missing.response.statusCode, 400);
  const { row, response } = await invoke(controller.markNotComing, { body: { reason: 'Patient cancelled' } });
  assert.equal(row.status, 'not_coming');
  assert.equal(row.notComingReason, 'Patient cancelled');
  assert.equal(row.appointmentDate, '2026-09-28');
  assert.equal(String(row._id), String(rowId));
  assert.equal(response.data.appointment.lastCallAt, undefined);
  assert.equal(response.data.appointment.numberOfCalls, undefined);
  assert.equal(response.data.appointment.callStatus, undefined);
  assert.equal(response.data.appointment.lastCallNotes, undefined);
  assert.equal(response.data.appointment.callHistory, undefined);
});

test('pending lead can be reopened and original date stays intact', async () => {
  const row = sample();
  row.status = 'not_coming'; row.notComingReason = 'Old reason';
  const result = await invoke(controller.clearNotComing, { row });
  assert.equal(result.response.statusCode, 200);
  assert.equal(row.status, 'active');
  assert.equal(row.notComingReason, '');
  assert.equal(row.appointmentDate, '2026-09-28');
});

test('a call increments count and records its time only for Reception/Admin', async () => {
  const { row, response } = await invoke(controller.logCall, { role: ROLES.RECEPTIONIST, body: { status: 'connected', notes: 'Confirmed appointment' } });
  assert.equal(row.numberOfCalls, 1);
  assert.ok(row.lastCallAt instanceof Date);
  assert.equal(response.data.appointment.numberOfCalls, 1);
  assert.equal(response.data.appointment.callStatus, 'connected');
  assert.equal(row.callHistory.length, 1);
  assert.equal(row.callHistory[0].notes, 'Confirmed appointment');
  assert.equal(String(row.callHistory[0].calledBy), String(ownerId));
  assert.equal(row.callHistory[0].calledAt.getTime(), row.lastCallAt.getTime());
  await invoke(controller.logCall, { row, role: ROLES.ADMIN, body: { status: 'no_answer', notes: 'No response' } });
  assert.equal(row.numberOfCalls, 2);
  assert.equal(row.callHistory.length, 2);
  assert.equal(row.callHistory[0].notes, 'Confirmed appointment');
  assert.equal(row.lastCallNotes, 'No response');
});

test('invalid calls and unauthorized callers never increment the count', async () => {
  for (const body of [{}, { status: 'pending', notes: 'Test' }, { status: 'connected', notes: ' ' }, { status: 'connected', notes: 'x'.repeat(2001) }]) {
    const result = await invoke(controller.logCall, { role: ROLES.RECEPTIONIST, body });
    assert.equal(result.response.statusCode, 400);
    assert.equal(result.row.numberOfCalls, 0);
  }
  const body = { status: 'connected', notes: 'Test' };
  assert.equal((await invoke(controller.logCall, { body })).response.statusCode, 403);
  const row = sample(); row.status = 'rescheduled';
  assert.equal((await invoke(controller.logCall, { role: ROLES.ADMIN, row, body })).response.statusCode, 409);
  assert.equal(row.numberOfCalls, 0);
});

test('call history preserves legacy counts and is private to Reception/Admin', async () => {
  const original = SalesAppointment.findById;
  const row = sample();
  row.numberOfCalls = 3;
  row.callHistory.push({ status: 'connected', notes: 'Confirmed', calledAt: new Date(), calledBy: ownerId, calledByName: 'Reception' });
  SalesAppointment.findById = () => ({ select: () => ({ lean: async () => row.toObject() }) });
  try {
    const result = await invoke(controller.listCalls, { role: ROLES.RECEPTIONIST });
    assert.equal(result.response.data.legacyCount, 2);
    assert.equal(result.response.data.calls[0].number, 3);
    assert.equal(result.response.data.calls[0].calledByName, 'Reception');
    assert.equal((await invoke(controller.listCalls)).response.statusCode, 403);
  } finally { SalesAppointment.findById = original; }
});

test('call status rejects unexpected values', async () => {
  const result = await invoke(controller.updateCallStatus, { role: ROLES.ADMIN, body: { status: 'invalid' } });
  assert.equal(result.response.statusCode, 400);
});
