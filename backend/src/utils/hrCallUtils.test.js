const test = require('node:test');
const assert = require('node:assert/strict');
const {
  localDateTime, dateKeyInIndia, startOfWeekDateKey, followUpDisplayStatus,
} = require('./hrCallUtils');

test('manual call date and time are stored using India timezone', () => {
  assert.equal(localDateTime('2026-10-09', '10:30').toISOString(), '2026-10-09T05:00:00.000Z');
  assert.equal(localDateTime('bad-date', '10:30'), null);
  assert.equal(localDateTime('2026-10-09', '25:30'), null);
});

test('dashboard date boundaries use India date and Monday week start', () => {
  assert.equal(dateKeyInIndia(new Date('2026-10-08T20:00:00.000Z')), '2026-10-09');
  assert.equal(startOfWeekDateKey('2026-10-09'), '2026-10-05');
  assert.equal(startOfWeekDateKey('2026-10-11'), '2026-10-05');
});

test('pending follow-ups become overdue without changing completed records', () => {
  const now = new Date('2026-10-09T10:00:00.000Z');
  assert.equal(followUpDisplayStatus({ nextFollowUpAt: '2026-10-09T09:00:00.000Z', followUpStatus: 'pending' }, now), 'overdue');
  assert.equal(followUpDisplayStatus({ nextFollowUpAt: '2026-10-09T11:00:00.000Z', followUpStatus: 'pending' }, now), 'pending');
  assert.equal(followUpDisplayStatus({ nextFollowUpAt: '2026-10-09T09:00:00.000Z', followUpStatus: 'completed' }, now), 'completed');
  assert.equal(followUpDisplayStatus({ nextFollowUpAt: null, followUpStatus: 'not_required' }, now), 'not_required');
});
