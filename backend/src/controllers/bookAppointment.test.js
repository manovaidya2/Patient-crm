const { test } = require('node:test');
const assert = require('node:assert/strict');
const controller = require('./salesSheetController');
const Patient = require('../models/Patient');
const Management = require('../models/AppointmentManagementEntry');
const SalesSheetColumn = require('../models/SalesSheetColumn');
const SalesSheetAudit = require('../models/SalesSheetAudit');

const PCC = 'p'.repeat(24).replace(/p/g, 'a');
const patientDoc = (status) => ({ _id: 'b'.repeat(24), patientName: 'Vyom', patientCode: 'V-171026-11', age: '4', number: 9999999999, category: 'autism_adhd', assignedDoctor: PCC, stages: [{ number: 1, status, packageName: 'Phase 1 kit' }, { number: 2, status: 'not_started' }] });
const run = async (handler, { status = 'completed', body = {}, user = { _id: PCC, role: 'assistant_doctor', name: 'Sakshi' } } = {}) => {
  const created = [];
  const saved = [[Patient, 'findById'], [Management, 'find'], [Management, 'create'], [SalesSheetColumn, 'find'], [SalesSheetAudit, 'create']].map(([t, n]) => [t, n, t[n]]);
  Patient.findById = () => ({ select: () => ({ lean: async () => patientDoc(status) }) });
  Management.find = () => ({ select: () => ({ sort: () => ({ lean: async () => [] }) }) });
  Management.create = async (doc) => { created.push(doc); return { _id: 'c'.repeat(24), ...doc }; };
  SalesSheetColumn.find = () => ({ sort: () => ({ lean: async () => [] }) });
  SalesSheetAudit.create = async () => ({});
  const res = { statusCode: 200, status(c) { this.statusCode = c; return this; }, json(b) { this.body = b; } };
  let error = null;
  try { await handler({ params: { id: 'b'.repeat(24) }, body, user, app: { get: () => null } }, res, (e) => { error = e; }); }
  finally { saved.forEach(([t, n, old]) => { t[n] = old; }); }
  return { res, error, created };
};
const tomorrow = () => new Date(Date.now() + 86400000 + 330 * 60000).toISOString().slice(0, 10);

test('booking is open at any phase status; the latest phase is shown', async () => {
  const inProgress = await run(controller.getAppointmentBooking, { status: 'in_progress' });
  assert.equal(inProgress.res.body.allowed, true);
  assert.deepEqual(inProgress.res.body.latestPhase, { number: 1, status: 'in_progress' });
  assert.equal(inProgress.res.body.defaults.caseCategory, 'Autism + ADHD');
});

test('the PCC books an existing-patient appointment like reception does', async () => {
  const body = { appointmentDate: tomorrow(), mode: 'Clinic Visit', leadType: 'B2C', caseCategory: 'Autism', note: 'Phase 2 plan discussed' };
  const { res, created } = await run(controller.bookAppointmentForPatient, { body });
  assert.equal(res.statusCode, 201);
  assert.equal(created[0].appointmentDate, body.appointmentDate);
  assert.equal(created[0].bookedByRole, 'assistant_doctor');
  assert.equal(created[0].bookingNote, 'Phase 2 plan discussed');
  const midPhase = await run(controller.bookAppointmentForPatient, { body, status: 'in_progress' });
  assert.equal(midPhase.res.statusCode, 201);
  const other = await run(controller.bookAppointmentForPatient, { body, user: { _id: 'd'.repeat(24), role: 'assistant_doctor', name: 'X' } });
  assert.equal(other.error?.statusCode, 403);
  const past = await run(controller.bookAppointmentForPatient, { body: { ...body, appointmentDate: '2020-01-01' } });
  assert.equal(past.res.statusCode, 400);
});
