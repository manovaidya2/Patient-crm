const { test } = require('node:test');
const assert = require('node:assert/strict');
const { appointmentSessions } = require('./appointmentSessions');
const now = new Date('2026-11-15T05:00:00Z');

test('follow-up column selects the appointment PO phase and keeps real pending, late and completed session details', () => {
  const patient = { currentStage: 2, assignedDoctor: { name: 'PCC A' }, stages: [
    { number: 1, followUps: [
      { _id: 'fu-1', status: 'completed', dateTime: '2026-11-13T05:00:00Z', completedAt: '2026-11-13T06:00:00Z', completedByName: 'PCC B', completionDetails: 'Dose reviewed', outcome: 'improvement', completionFiles: [{ url: '/uploads/session.jpg' }] },
      { _id: 'fu-2', status: 'scheduled', dateTime: '2026-11-14T05:00:00Z', notes: 'Call guardian' },
      { _id: 'fu-3', status: 'sent', followUpType: 'video', dateTime: '2026-11-16T05:00:00Z', videoRequestedByName: 'PCC A' },
    ], familySessions: [{ _id: 'fam-1', status: 'cancelled', dateTime: '2026-11-16T06:00:00Z', cancelledAt: '2026-11-14T05:00:00Z', cancelledByName: 'PCC A', cancelReason: 'Parent unavailable' }] },
    { number: 2, followUps: [{ _id: 'later', status: 'scheduled', dateTime: '2026-12-01T05:00:00Z' }] },
  ] };
  const before = JSON.stringify(patient);
  const view = appointmentSessions(patient, 1, now);
  assert.equal(view.total, 4);
  assert.equal(view.completed, 1);
  assert.equal(view.pending, 2);
  assert.equal(view.cancelled, 1);
  assert.equal(view.assignedPcc, 'PCC A');
  assert.equal(view.sessions[0].state, 'done_late');
  assert.equal(view.sessions[0].completedByName, 'PCC B');
  assert.equal(view.sessions[0].files[0].url, '/uploads/session.jpg');
  assert.equal(view.sessions.find((session) => session.id === 'fu-2').state, 'late');
  assert.equal(view.sessions.find((session) => session.id === 'fu-3').state, 'upcoming', 'video sent still waits for its session completion');
  assert.equal(view.sessions.find((session) => session.id === 'fam-1').cancelReason, 'Parent unavailable');
  assert.equal(appointmentSessions(patient, null, now).total, 1, 'without a PO the current phase is used');
  assert.equal(JSON.stringify(patient), before, 'reading the column leaves the workflow unchanged');
});

test('delivery sessions show confirmation, rescheduled dates, checklists, closing notes and files', () => {
  const patient = { currentStage: 1, stages: [{ number: 1, followUps: [
    { _id: 'old', status: 'cancelled', dateTime: '2026-11-14T05:00:00Z', delivery: { title: 'Diet session', rescheduledTo: 'new', rescheduleReason: 'Parent request' } },
    { _id: 'new', status: 'scheduled', dateTime: '2026-11-16T05:00:00Z', delivery: { title: 'Diet session', confirmedAt: '2026-11-15T04:00:00Z', confirmedByName: 'PCC A', rescheduledFrom: 'old' } },
    { _id: 'done', status: 'completed', dateTime: '2026-11-13T05:00:00Z', completedAt: '2026-11-13T06:00:00Z', completionPdfUrl: '/uploads/form.pdf', delivery: { title: 'Review', checklist: [{ text: 'Diet reviewed', answer: 'done' }], close: { redFlag: false, understanding: 'good', homeTask: 'Repeat exercises', recording: 'declined' } } },
  ] }] };
  const view = appointmentSessions(patient, 1, now);
  assert.equal(view.sessions.find((session) => session.id === 'old').state, 'rescheduled');
  assert.equal(view.sessions.find((session) => session.id === 'old').rescheduledToAt, '2026-11-16T05:00:00.000Z');
  assert.equal(view.sessions.find((session) => session.id === 'new').state, 'confirmed');
  assert.equal(view.sessions.find((session) => session.id === 'new').rescheduledFromAt, '2026-11-14T05:00:00.000Z');
  const completed = view.sessions.find((session) => session.id === 'done');
  assert.equal(completed.close.understanding, 'Good');
  assert.equal(completed.close.recording, 'Consent declined');
  assert.equal(completed.checklist[0].text, 'Diet reviewed');
  assert.equal(completed.files[0].url, '/uploads/form.pdf');
  assert.equal(appointmentSessions(patient, 3, now), null);
  assert.equal(appointmentSessions(null, 1, now), null);
});
