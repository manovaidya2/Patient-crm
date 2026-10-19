const { test } = require('node:test');
const assert = require('node:assert/strict');
const controller = require('./salesSheetController');
const AppointmentManagementEntry = require('../models/AppointmentManagementEntry');
const SalesAppointment = require('../models/SalesAppointment');
const ConsultationReceipt = require('../models/ConsultationReceipt');
const SalesSheetAudit = require('../models/SalesSheetAudit');

const ENTRY = 'a'.repeat(24);
const SOURCE = 'b'.repeat(24);
const REPLACEMENT = 'c'.repeat(24);
const user = { _id: 'u'.repeat(24), name: 'Prachi', role: 'receptionist' };

const makeEntry = (extra = {}) => ({
  _id: ENTRY, appointmentCode: 'APT-M-1', appointmentDate: '2026-10-19', sourceAppointment: SOURCE,
  values: new Map(), save: async function save() { this.saved = true; }, ...extra,
});
const makeSource = (extra = {}) => ({
  _id: SOURCE, appointmentCode: 'APT-1', appointmentDate: '2026-10-19', status: 'active', acceptedAt: new Date(), consultationAccount: undefined,
  values: new Map([['x', 'y']]), callHistory: [], salesCallHistory: [], createdBy: 'u1', createdByName: 'Navneet', numberOfCalls: 2,
  save: async function save() { this.saved = true; }, ...extra,
});

const run = async (body, { entry = makeEntry(), source = makeSource(), noEntry = false } = {}) => {
  const restore = [];
  const stub = (target, name, fn) => { const old = target[name]; target[name] = fn; restore.push(() => { target[name] = old; }); };
  const log = { created: null, receipts: null, deleted: null, events: [] };
  stub(AppointmentManagementEntry, 'findById', async () => (noEntry ? null : entry));
  stub(AppointmentManagementEntry, 'findOne', () => ({ select: () => ({ lean: async () => ({ _id: ENTRY }) }) }));
  stub(AppointmentManagementEntry, 'deleteOne', async (filter) => { log.deleted = filter; return {}; });
  stub(SalesAppointment, 'findById', async () => source);
  stub(SalesAppointment, 'create', async (doc) => { log.created = doc; return { _id: REPLACEMENT, appointmentCode: 'APT-NEW', ...doc }; });
  stub(ConsultationReceipt, 'updateMany', async (filter, update) => { log.receipts = { filter, update }; return {}; });
  stub(SalesSheetAudit, 'create', async () => ({}));
  const io = { to(room) { log.events.push(room); return this; }, emit() {} };
  const res = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(payload) { this.body = payload; } };
  let error = null;
  try { await controller.rescheduleManagedAppointment({ params: { id: ENTRY }, body, user, app: { get: () => io } }, res, (e) => { error = e; }); } finally { restore.forEach((fn) => fn()); }
  return { res, error, log, entry, source };
};

test('reschedule from reception needs a valid new date and a note', async () => {
  assert.equal((await run({ appointmentDate: 'soon', note: 'patient asked' })).res.statusCode, 400);
  assert.equal((await run({ appointmentDate: '2026-10-25', note: '  ' })).res.statusCode, 400);
  assert.equal((await run({ appointmentDate: '2026-10-19', note: 'same day' })).res.statusCode, 400);
  assert.equal((await run({ appointmentDate: '2026-10-25', note: 'asked to move' }, { noEntry: true })).res.statusCode, 404);
});

test('reschedule from reception moves it to the Sales sheet on the new date and removes it from Appointment Management', async () => {
  const { res, error, log, source } = await run({ appointmentDate: '2026-10-25', note: 'Patient is travelling, asked for next week' });
  assert.equal(error, null);
  assert.equal(res.body.movedTo, '2026-10-25');
  assert.equal(res.body.inSales, true);
  assert.equal(log.created.appointmentDate, '2026-10-25');
  assert.equal(log.created.rescheduleNote, 'Patient is travelling, asked for next week');
  assert.equal(log.created.rescheduledFromDate, '2026-10-19');
  assert.equal(log.created.acceptedAt, undefined, 'the new row has to be confirmed by Sales again');
  assert.equal(log.created.consultationAccount, SOURCE);
  assert.equal(source.status, 'rescheduled');
  assert.equal(source.rescheduledTo, '2026-10-25');
  assert.equal(source.rescheduleNote, 'Patient is travelling, asked for next week');
  assert.deepEqual(log.deleted, { sourceAppointment: SOURCE }, 'the Reception entry is removed');
  assert.deepEqual(log.receipts.filter, { appointment: ENTRY }, 'reception receipts are kept, attached to the consultation account');
  assert.deepEqual(log.receipts.update.$set, { salesAppointment: SOURCE, appointment: null });
  assert.ok(log.events.length >= 2, 'both dates are refreshed live');
});

test('reschedule from reception is refused once the patient has arrived or registration started', async () => {
  for (const entry of [
    makeEntry({ values: new Map([['6ab7c235bf916b34dfda543c', 'Arrived']]) }),
    makeEntry({ values: new Map([['6abb6329297d3a5387593670', 'R-171026-11']]) }),
    makeEntry({ registration: { status: 'draft' } }),
  ]) {
    const { res, log } = await run({ appointmentDate: '2026-10-25', note: 'moving' }, { entry });
    assert.equal(res.statusCode, 409);
    assert.equal(log.created, null);
    assert.equal(log.deleted, null);
  }
});

test('reschedule from reception: a sales row that is no longer active is not moved again', async () => {
  const { res, log } = await run({ appointmentDate: '2026-10-25', note: 'moving' }, { source: makeSource({ status: 'rescheduled' }) });
  assert.equal(res.statusCode, 409);
  assert.equal(log.created, null);
});

test('reschedule from reception: a direct entry moves to the new date with the note', async () => {
  const entry = makeEntry({ sourceAppointment: undefined });
  const { res, log } = await run({ appointmentDate: '2026-10-22', note: 'Booked wrong day' }, { entry });
  assert.equal(res.body.inSales, false);
  assert.equal(entry.appointmentDate, '2026-10-22');
  assert.equal(entry.rescheduledFromDate, '2026-10-19');
  assert.equal(entry.rescheduleNote, 'Booked wrong day');
  assert.equal(entry.saved, true);
  assert.equal(log.created, null);
});
