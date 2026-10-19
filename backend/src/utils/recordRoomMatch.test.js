const { test } = require('node:test');
const assert = require('node:assert/strict');
const { looseKey, looseSource, recordRoomConditions } = require('./recordRoomMatch');
const { getPatientRecordRoom } = require('../controllers/patientController');
const Patient = require('../models/Patient');
const AppointmentManagementEntry = require('../models/AppointmentManagementEntry');
const RecordRoom = require('../models/RecordRoom');

const matches = (code, candidate) => new RegExp(looseSource(code), 'i').test(candidate);

test('Patient IDs match whatever spaces, dashes or case they were typed with', () => {
  assert.equal(looseKey(' a- 3297 '), 'A3297');
  assert.ok(matches('A-3297', 'A-3297'));
  assert.ok(matches('A-3297', 'A- 3297'));
  assert.ok(matches('A- 3297', 'a-3297'));
  assert.ok(matches('A-3297', ' A3297 '));
  assert.ok(matches('R-191026-15', 'r-191026-15'));
  assert.equal(matches('A-3297', 'A-32970'), false, 'a longer ID is a different patient');
  assert.equal(matches('A-3297', 'XA-3297'), false);
  assert.equal(matches('A-3297', 'A-3298'), false);
  assert.equal(looseSource('A-'), null, 'a code too short to be an ID never matches');
  assert.equal(looseSource(''), null);
});

test('conditions: the patient link, the ID in either box, and the appointment codes', () => {
  const conditions = recordRoomConditions({ patientRef: 'p1', patientCode: 'R-3248', appointmentCodes: ['APT-1', ' ', 'APT-1', 'APT-2'] });
  assert.deepEqual(conditions[0], { patient: 'p1' });
  assert.ok(conditions[1].patientId.$regex);
  assert.ok(conditions[2].appointmentId.$regex);
  assert.deepEqual(conditions[3], { appointmentId: { $in: ['APT-1', 'APT-2'] } });
  assert.deepEqual(recordRoomConditions({ patientRef: 'p1', patientCode: '' }), [{ patient: 'p1' }]);
});

test('patient details lookup finds PDFs filed under a spaced ID, the appointment box, or the appointment code', async () => {
  const restore = [];
  const stub = (target, name, fn) => { const old = target[name]; target[name] = fn; restore.push(() => { target[name] = old; }); };
  let roomFilter = null;
  let entryFilter = null;
  stub(Patient, 'findById', () => ({ select: () => ({ lean: async () => ({ _id: 'p1', patientCode: 'R-3248' }) }) }));
  stub(AppointmentManagementEntry, 'find', (filter) => { entryFilter = filter; return { select: () => ({ lean: async () => [{ appointmentCode: 'APT-9' }] }) }; });
  stub(RecordRoom, 'find', (filter) => {
    roomFilter = filter;
    return { select: () => ({ sort: () => ({ lean: async () => [{ _id: 'r1', appointmentId: 'R-3248', pdfUrl: '/uploads/x.pdf', pdfName: 'file.pdf', pdfPageCount: 3, fileNumber: 'A-008' }] }) }) };
  });
  const res = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; } };
  try { await getPatientRecordRoom({ params: { id: 'p1' }, user: { _id: 'a', role: 'admin' } }, res, (error) => { throw error; }); } finally { restore.forEach((fn) => fn()); }
  assert.equal(res.body.records.length, 1);
  assert.equal(res.body.records[0].pdfUrl, '/uploads/x.pdf');
  assert.deepEqual(roomFilter.pdfUrl, { $nin: ['', null] });
  assert.ok(roomFilter.$or.some((condition) => condition.appointmentId?.$in?.includes('APT-9')), 'the appointment code carrying the Patient ID is searched');
  assert.ok(roomFilter.$or.some((condition) => condition.patientId?.$regex), 'the Patient ID box is matched loosely');
  assert.ok(roomFilter.$or.some((condition) => condition.appointmentId?.$regex), 'the Appointment ID box is matched too');
  assert.ok(entryFilter['values.6abb6329297d3a5387593670'].$regex);
});
