const { test } = require('node:test');
const assert = require('node:assert/strict');
const { appointmentTreatment } = require('./appointmentTreatment');

test('appointment treatment follows the PO phase rather than a later active phase, preserving actual activation and start dates', () => {
  const patient = { currentStage: 2, stages: [
    { number: 1, status: 'completed', transit: { activatedAt: '2026-10-01T05:00:00Z', activatedByName: 'PCC A', medicineStartDate: '2026-10-03T00:00:00Z', medicineStartNote: 'Start after breakfast', explanationCompletedAt: '2026-10-01T04:00:00Z', explanationCompletedByName: 'PCC B', explanationNote: 'Guardian understood doses' } },
    { number: 2, status: 'not_started', transit: {} },
  ] };
  const phaseOne = appointmentTreatment(patient, 1);
  assert.equal(phaseOne.status, 'completed');
  assert.equal(phaseOne.activated, true);
  assert.equal(phaseOne.activatedByName, 'PCC A');
  assert.equal(phaseOne.activatedAt, '2026-10-01T05:00:00.000Z');
  assert.equal(phaseOne.medicineStartDate, '2026-10-03T00:00:00.000Z');
  assert.equal(phaseOne.startNote, 'Start after breakfast');
  assert.equal(phaseOne.explanation.completedAt, '2026-10-01T04:00:00.000Z');
  assert.equal(phaseOne.explanation.completedByName, 'PCC B');
  assert.equal(phaseOne.explanation.note, 'Guardian understood doses');
  assert.equal(appointmentTreatment(patient).phase, 2);
  assert.equal(appointmentTreatment(patient).activated, false);
  assert.equal(appointmentTreatment(patient).status, 'not_started');
  assert.equal(appointmentTreatment(patient, 3), null, 'missing phases do not inherit a different phase activation');
});

test('treatment hold, removal and patient inactivity show saved reasons and actor/time without losing activation', () => {
  const stage = { number: 1, status: 'in_progress', transit: { activatedAt: '2026-11-01T05:00:00Z', holdActive: true, holdAt: '2026-11-14T05:00:00Z', holdByName: 'Transit A', holdReason: 'Patient asked to wait' } };
  const patient = { currentStage: 1, stages: [stage] };
  let result = appointmentTreatment(patient);
  assert.equal(result.status, 'on_hold');
  assert.equal(result.byName, 'Transit A');
  assert.equal(result.note, 'Patient asked to wait');
  assert.equal(result.at, '2026-11-14T05:00:00.000Z');
  assert.equal(result.activated, true);
  assert.equal(result.stageStatus, 'in_progress');
  Object.assign(stage.transit, { removedAt: '2026-11-15T05:00:00Z', removedByName: 'Manager', removedReason: 'On review' });
  assert.equal(appointmentTreatment(patient).status, 'removed');
  Object.assign(patient, { isActive: false, inactiveReason: 'Closed by patient', inactivatedAt: '2026-11-15T06:00:00Z', inactivatedByName: 'Admin' });
  result = appointmentTreatment(patient);
  assert.equal(result.status, 'inactive');
  assert.equal(result.byName, 'Admin');
  assert.equal(result.note, 'Closed by patient');
});

test('no patient data does not invent activation, completion or a treatment phase', () => {
  assert.equal(appointmentTreatment(null), null);
  assert.equal(appointmentTreatment({ currentStage: 1, stages: [] }), null);
  const savedStatusOnly = appointmentTreatment({ currentStage: 1, stages: [{ number: 1, status: 'in_progress' }] });
  assert.equal(savedStatusOnly.activated, false);
  assert.equal(savedStatusOnly.activatedAt, null);
  assert.equal(savedStatusOnly.status, 'in_progress', 'legacy phase status remains independent of missing activation audit');
});
