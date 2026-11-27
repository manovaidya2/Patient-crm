// Sessions of the earlier Care Schedule plan moving to the plan of 2026-11-26 (careReplan.js).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { movesOf, needsMove, targetOf, foundationToAdd, replanSessions } = require('./careReplan');

const s = (code, day, kind = code.startsWith('DT') ? 'tracker' : code.startsWith('FS') ? 'family' : 'followup', status = 'pending') => ({ code, day, kind, status });

test('which sessions move and where: day 20 … 170 follow-ups take the codes one lower, day 10 and day 180 retire', () => {
  assert.equal(needsMove(s('FU-01', 10)), true);
  assert.equal(needsMove(s('FU-01', 20)), false, 'already on the new plan');
  assert.equal(needsMove(s('FS-01', 15)), false, 'family sessions kept their days');
  assert.equal(needsMove(s('DT-01', 60)), false);
  assert.equal(needsMove(s('DT-03', 180)), true);
  assert.equal(needsMove({ code: 'FU-01·D10', day: 10, kind: 'followup' }), false, 'a retired one is never moved again');
  assert.deepEqual(targetOf(s('FU-02', 20)), { code: 'FU-01' });
  assert.deepEqual(targetOf(s('FU-07', 170)), { code: 'FU-06' });
  assert.deepEqual(targetOf(s('FU-01', 10)), { retired: 'FU-01·D10' });
  assert.deepEqual(targetOf(s('DT-03', 180)), { retired: 'DT-03·D180' });
});

test('the order never needs a code still in use: retired ones first, then by day', () => {
  const sessions = [s('FU-03', 50), s('FS-01', 15), s('FU-02', 20, 'followup', 'completed'), s('FU-01', 10, 'followup', 'completed'), s('DT-01', 60), s('FU-04', 80)];
  const moves = movesOf(sessions).map((m) => `${m.session.code}->${m.code || m.retired}`);
  assert.deepEqual(moves, ['FU-01->FU-01·D10', 'FU-02->FU-01', 'FU-03->FU-02', 'FU-04->FU-03']);
  // Each new code is free when it is taken: the codes in use change one move at a time.
  const inUse = new Set(sessions.map((x) => x.code));
  movesOf(sessions).forEach((m) => {
    const next = m.code || m.retired;
    assert.ok(!inUse.has(next), `${next} is free`);
    inUse.delete(m.session.code);
    inUse.add(next);
  });
});

test('the foundation week is added only for the days still ahead, never twice', () => {
  const part = { startDate: '2026-11-23', offsetDays: 0, days: 30, requestId: 'r1' };
  const add = (today, sessions = []) => foundationToAdd({ part, sessions, today }).map((i) => `${i.code} ${i.targetDate}`);
  assert.deepEqual(add('2026-11-27'), ['FCF-04 2026-11-27', 'FCF-05 2026-11-28', 'FCF-06 2026-11-29', 'FCF-07 2026-11-30']);
  assert.deepEqual(add('2026-11-27', [{ code: 'FCF-04' }]), ['FCF-05 2026-11-28', 'FCF-06 2026-11-29', 'FCF-07 2026-11-30']);
  assert.deepEqual(add('2026-12-05'), [], 'the week is past');
  assert.deepEqual(foundationToAdd({ part: { ...part, offsetDays: 30 }, sessions: [], today: '2026-11-20' }), [], 'only the first supply has a foundation week');
});

test('nothing runs without a database', async () => {
  assert.deepEqual(await replanSessions({ ready: () => false }), { phases: 0, renamed: 0, closed: 0, added: 0 });
});
