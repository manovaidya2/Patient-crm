const { test } = require('node:test');
const assert = require('node:assert/strict');
const { recordsForAppointment } = require('./appointmentRecords');
const now = new Date('2026-11-15T05:00:00Z');

test('OPD matches Record Room by patient reference, loosely typed patient ID and appointment ID without matching names', () => {
  const appointment = { id: 'appointment-1', patientCode: 'A-3297', appointmentCode: 'APT-123', patientRef: 'patient-1' };
  const records = [
    { _id: 'by-ref', patient: 'patient-1', patientName: 'Original name', pdfUrl: '/uploads/patient.pdf', pdfPageCount: 2, createdAt: '2026-11-13T05:00:00Z', shelfNumber: 'S-1', fileNumber: 'F-1', indexNumber: 'I-1', documents: [{ url: '/uploads/page.jpg', fileName: 'Paper', uploadedAt: '2026-11-13T06:00:00Z', uploadedByName: 'Reception A' }] },
    { _id: 'by-code', patientId: ' a- 3297 ', createdAt: '2026-11-14T05:00:00Z' },
    { _id: 'legacy-box', appointmentId: 'A_3297', createdAt: '2026-11-15T04:00:00Z' },
    { _id: 'by-appointment', appointmentId: ' apt-123 ', pdfUrl: '/uploads/appointment.pdf' },
    { _id: 'wrong-patient', patient: 'patient-other', patientId: 'B-1000', patientName: 'Same patient name', pdfUrl: '/uploads/wrong.pdf' },
    { _id: 'no-link', patient: null, patientName: 'Same patient name', pdfUrl: '/uploads/no-link.pdf' },
  ];
  const before = JSON.stringify(records);
  const view = recordsForAppointment(appointment, records, now);
  assert.equal(view.total, 4);
  assert.equal(view.uploaded, 2);
  assert.equal(view.pending, 2);
  assert.equal(view.overdue, 1);
  assert.equal(view.status, 'partial');
  assert.equal(view.entries[0].shelfNumber, 'S-1');
  assert.equal(view.entries[0].documents[0].uploadedByName, 'Reception A');
  assert.equal(view.entries[0].documents[0].uploadedAt, '2026-11-13T06:00:00.000Z');
  assert.equal(JSON.stringify(records), before, 'fetching paper status never changes reception records');
});

test('same-day overdue, legacy PDFs, missing records and issue/return history reflect the Record Room source', () => {
  const appointment = { id: 'appointment-1', appointmentCode: 'APT-123' };
  const missing = { _id: 'record-1', appointmentId: 'APT-123', firstReceivedAt: '2026-11-14T16:00:00Z', createdAt: '2026-11-15T04:00:00Z', issueHistory: [{ paperName: 'Patient file', issuedAt: '2026-11-14T17:00:00Z', issuedByName: 'Reception A', givenTo: 'Doctor', reason: 'Review', returnedAt: '2026-11-15T04:00:00Z', returnedByName: 'Reception B', returnCondition: 'problem', problemDetails: 'Page torn' }] };
  let view = recordsForAppointment(appointment, [missing], now);
  assert.equal(view.status, 'overdue');
  assert.equal(view.entries[0].uploadDueAt, '2026-11-14T18:29:59.999Z');
  assert.equal(view.entries[0].movements[0].returnedByName, 'Reception B');
  assert.equal(view.entries[0].movements[0].problemDetails, 'Page torn');
  view = recordsForAppointment(appointment, [{ ...missing, pdfUrl: '/uploads/legacy.pdf', documents: [] }], now);
  assert.equal(view.status, 'uploaded');
  assert.equal(view.overdue, 0);
  assert.equal(recordsForAppointment(appointment, [], now).status, 'not_registered');
  assert.equal(recordsForAppointment({ id: 'no-id' }, [{ _id: 'unlinked', patient: null }], now).total, 0, 'empty links cannot match every unlinked record');
});
