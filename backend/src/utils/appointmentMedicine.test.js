const { test } = require('node:test');
const assert = require('node:assert/strict');
const { appointmentMedicine } = require('./appointmentMedicine');

test('medicine appointment entries preserve actual stage approvals, files, box receipt and release history', () => {
  const job = { _id: 'job-1', patient: 'patient-1', status: 'released', currentStage: 10,
    requestedAt: '2026-11-14T04:00:00Z', requestedByName: 'Transit A',
    stages: [
      { key: 'accept', doneAt: '2026-11-14T05:00:00Z', doneByName: 'Medicine A', doneByRole: 'medicine_department', fields: { readyByDate: '2026-11-15' }, checks: [true, false, true, true], notes: 'Date committed' },
      { key: 'final', doneAt: '2026-11-14T06:00:00Z', doneByName: 'PCC A', fields: { result: 'PASS', remarks: 'Parcel checked' } },
      { key: 'release', doneAt: '2026-11-14T07:00:00Z', doneByName: 'Medicine B', notes: 'Handed over' },
    ],
    doctorVerification: { confirmedAt: '2026-11-14T06:10:00Z', confirmedByName: 'PCC A', doctorName: 'Doctor A' },
    boxReceipt: { requestedAt: '2026-11-14T06:15:00Z', requestedByName: 'Medicine A', receivedAt: '2026-11-14T06:20:00Z', receivedByName: 'PCC A' },
    releaseRequest: { acceptedAt: '2026-11-14T06:30:00Z', acceptedByName: 'Medicine B' },
    photos: { overview: [{ url: '/uploads/kit.jpg' }], paperSets: [{ name: 'Diet plan', files: [{ url: '/uploads/diet.jpg' }] }] },
    consumption: [{ code: 'MED-1', name: 'Medicine', planned: 10, actual: 9, unit: 'g' }],
    chits: [{ chitNo: 1, name: 'Medicine', confirmed: true, confirmedAt: '2026-11-14T05:30:00Z', confirmedByName: 'Medicine A' }],
    events: [{ at: '2026-11-14T07:00:00Z', action: 'Medicine released', byName: 'Medicine B', details: 'Payment checked' }],
  };
  const before = JSON.stringify(job);
  const view = appointmentMedicine(job);
  assert.equal(view.current, 'Released to In Transit');
  assert.equal(view.stages[0].byName, 'Medicine A');
  assert.equal(view.stages[0].at, '2026-11-14T05:00:00.000Z');
  assert.equal(view.stages[0].checks.length, 3, 'unchecked lines are not displayed as verified');
  assert.equal(view.stages[0].values[0].value, '2026-11-15');
  assert.equal(view.stages.find((stage) => stage.key === 'final').values[0].value, 'PASS');
  assert.equal(view.doctorVerification.doneByName, 'PCC A');
  assert.equal(view.boxReceipt.receivedByName, 'PCC A');
  assert.equal(view.release.acceptedByName, 'Medicine B');
  assert.equal(view.release.releasedByName, 'Medicine B');
  assert.equal(view.photos.paperSets[0].files[0].url, '/uploads/diet.jpg');
  assert.equal(view.consumption[0].actual, 9);
  assert.equal(view.chits[0].confirmedByName, 'Medicine A');
  assert.equal(view.events[0].byName, 'Medicine B');
  assert.equal(JSON.stringify(job), before, 'reading appointments does not update any medicine entries');
});

test('pending, hold, cancelled and old-flow entries never invent approval records or restore disabled stages', () => {
  const job = { _id: 'job-1', status: 'open', currentStage: 1, stages: [{ key: 'accept', doneAt: '2026-11-14T05:00:00Z', doneByName: 'Old request', snapshot: { oldFlow: true } }], hold: { active: true, reason: 'Awaiting clarification', byName: 'Medicine A', at: '2026-11-14T06:00:00Z' } };
  let view = appointmentMedicine(job);
  assert.equal(view.stages.length, 11);
  assert.equal(view.stages.some((stage) => ['qc', 'doctor'].includes(stage.key)), false);
  assert.equal(view.stages[0].oldFlow, true);
  assert.equal(view.stages[1].state, 'current');
  assert.equal(view.stages[1].at, null);
  assert.deepEqual(view.stages[1].checks, []);
  assert.equal(view.doctorVerification, null);
  assert.equal(view.boxReceipt, null);
  assert.equal(view.hold.reason, 'Awaiting clarification');
  job.status = 'cancelled';
  view = appointmentMedicine(job);
  assert.equal(view.current, 'Cancelled');
  assert.equal(view.stages.some((stage) => stage.state === 'current'), false);
  assert.equal(appointmentMedicine(null), null);
});
