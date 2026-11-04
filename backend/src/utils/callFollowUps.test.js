const { test } = require('node:test');
const assert = require('node:assert/strict');
const { lateness, openFollowUps, daysLate } = require('./callFollowUps');

const at = (s) => new Date(s);
test('a call answering a follow-up keeps how many days late it was made', () => {
  const calls = [{ at: at('2026-11-01T05:00:00Z'), outcome: 'not_reachable', nextCallAt: at('2026-11-02T05:00:00Z'), step: 'scheduled' }];
  assert.deepEqual(lateness(calls, 'scheduled', at('2026-11-02T04:00:00Z')), { dueAt: at('2026-11-02T05:00:00Z'), lateDays: 0 });
  assert.equal(lateness(calls, 'scheduled', at('2026-11-05T06:00:00Z')).lateDays, 3);
  assert.equal(lateness(calls, 'calls', at('2026-11-05T06:00:00Z')).dueAt, null, 'other steps keep their own follow-ups');
  assert.equal(daysLate(at('2026-11-02T18:00:00Z'), at('2026-11-02T18:20:00Z')), 0);
});

test('open follow-ups: per step, overdue with late days, gone once connected or the step is done', () => {
  const calls = [
    { at: at('2026-11-01T05:00:00Z'), outcome: 'busy', nextCallAt: at('2026-11-02T05:00:00Z') },
    { at: at('2026-11-01T06:00:00Z'), outcome: 'call_back', nextCallAt: at('2026-11-10T05:00:00Z'), step: 'handover' },
  ];
  const now = at('2026-11-04T07:00:00Z');
  const open = openFollowUps(calls, {}, now);
  assert.equal(open.length, 2);
  assert.deepEqual(open.find((f) => f.step === 'calls'), { step: 'calls', label: 'Call for delivery schedule', dueAt: '2026-11-02T05:00:00.000Z', overdue: true, lateDays: 2 });
  assert.equal(open.find((f) => f.step === 'handover').overdue, false);
  assert.equal(openFollowUps(calls, { calls: true }, now).length, 1, 'a done step has no follow-up');
  assert.equal(openFollowUps([...calls, { at: at('2026-11-03T05:00:00Z'), outcome: 'connected' }], {}, now).length, 1, 'connected closes it');
});

test('follow-up history: done (with late days), closed by the step, open; a connected call can set one too', () => {
  const { followUpHistory } = require('./callFollowUps');
  const calls = [
    { at: at('2026-11-01T05:00:00Z'), outcome: 'busy', nextCallAt: at('2026-11-02T05:00:00Z'), byName: 'A' },
    { at: at('2026-11-04T05:00:00Z'), outcome: 'connected', nextCallAt: at('2026-11-06T05:00:00Z'), lateDays: 2, byName: 'B' },
    { at: at('2026-11-01T06:00:00Z'), outcome: 'not_reachable', nextCallAt: at('2026-11-02T06:00:00Z'), step: 'handover' },
  ];
  const rows = followUpHistory(calls, { handover: true }, at('2026-11-08T07:00:00Z'));
  assert.deepEqual(rows.map((r) => [r.step, r.status, r.lateDays]), [['calls', 'done', 2], ['handover', 'closed', 0], ['calls', 'late', 2]]);
  assert.equal(rows[0].doneByName, 'B');
});
