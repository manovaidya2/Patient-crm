const { test } = require('node:test');
const assert = require('node:assert/strict');
const { releaseView, DAY_MS } = require('./medicineRelease');

test('the twenty-day clock starts at final verification, even if a release request is sent later', () => {
  const finalAt = new Date('2026-11-01T10:00:00+05:30');
  const deadline = new Date(finalAt.getTime() + 20 * DAY_MS);
  const job = { status: 'ready', stages: [{ key: 'final', doneAt: finalAt }], releaseRequest: {} };
  assert.equal(releaseView(job, finalAt).deadlineAt, deadline.toISOString());
  assert.equal(releaseView(job, finalAt).daysLeft, 20);
  assert.equal(releaseView(job, new Date(deadline.getTime() - 1)).overdue, false);
  assert.equal(releaseView(job, deadline).overdue, true);
  job.releaseRequest.requestedAt = new Date(finalAt.getTime() + 5 * DAY_MS);
  const requested = releaseView(job, deadline);
  assert.equal(requested.deadlineAt, deadline.toISOString());
  assert.equal(requested.needsTransitAction, false);
  assert.equal(requested.state, 'requested');
});

test('explicit extension overrides the deadline while preserving the final-verification start', () => {
  const job = { status: 'ready', stages: [{ key: 'final', doneAt: '2026-11-01T00:00:00Z' }], releaseRequest: { deadlineAt: '2026-12-01T00:00:00Z' } };
  const view = releaseView(job, new Date('2026-11-25T00:00:00Z'));
  assert.equal(view.startedAt, '2026-11-01T00:00:00.000Z');
  assert.equal(view.deadlineAt, '2026-12-01T00:00:00.000Z');
  assert.equal(view.daysLeft, 6);
  assert.equal(view.overdue, false);
  assert.equal(view.needsTransitAction, true);
});

test('an existing release record overrides stale ready/accepted status and retains the original release details', () => {
  const view = releaseView({ status: 'ready', releaseRequest: { acceptedAt: '2026-11-13T12:00:00Z' }, stages: [
    { key: 'final', doneAt: '2026-11-13T10:00:00Z' },
    { key: 'release', doneAt: '2026-10-30T06:11:31Z', doneByName: 'Meena', doneByRole: 'medicine_department', notes: 'Original handover note' },
  ] });
  assert.equal(view.state, 'released');
  assert.equal(view.needsTransitAction, false);
  assert.equal(view.releasedByName, 'Meena');
  assert.equal(view.releasedByRole, 'medicine_department');
  assert.equal(view.releasedAt, '2026-10-30T06:11:31.000Z');
  assert.equal(view.releaseNotes, 'Original handover note');
});
