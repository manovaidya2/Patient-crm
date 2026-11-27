// Care Schedule rules (pure) and the form rules every template follows.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const C = require('./careSchedule');
const R = require('../careTemplates/rules');
const { templateOf, templateCodes, legacyTemplateOf, templateForSession } = require('../careTemplates');
const { basicTemplate } = require('../careTemplates/basic');

const codes = (items) => items.map((i) => i.code);

const FOUNDATION = ['FCF-01', 'FCF-02', 'FCF-03', 'FCF-04', 'FCF-05', 'FCF-06', 'FCF-07'];

test('the plan (2026-11-26): foundation week, 3 family sessions, 6 follow-ups, 2 trackers on the agreed days', () => {
  assert.equal(C.PLAN.length, 18);
  assert.deepEqual(C.PLAN.filter((i) => i.kind === 'foundation').map((i) => i.day), [1, 2, 3, 4, 5, 6, 7]);
  assert.deepEqual(C.PLAN.filter((i) => i.kind === 'family').map((i) => i.day), [15, 105, 165]);
  assert.deepEqual(C.PLAN.filter((i) => i.kind === 'followup').map((i) => i.day), [20, 50, 80, 110, 140, 170]);
  assert.deepEqual(C.PLAN.filter((i) => i.kind === 'tracker').map((i) => i.day), [60, 120], 'the day-180 tracker is done in the clinic');
  assert.deepEqual(C.FOUNDATION_CODES, FOUNDATION);
  assert.deepEqual([...templateCodes].sort(), [...FOUNDATION, 'FS-01', 'FS-02', 'FS-03', 'FU-01', 'FU-02', 'FU-03', 'FU-04', 'FU-05', 'FU-06'].sort());
});

test('only the days the medicine covers are scheduled: 1, 2, 3, 4, 5 and 6 months', () => {
  const of = (days) => codes(C.itemsForPart({ startDate: '2026-11-23', offsetDays: 0, days }));
  assert.deepEqual(of(30), [...FOUNDATION, 'FS-01', 'FU-01']);
  assert.deepEqual(of(60), [...FOUNDATION, 'FS-01', 'FU-01', 'FU-02', 'DT-01']);
  assert.deepEqual(of(90), [...FOUNDATION, 'FS-01', 'FU-01', 'FU-02', 'DT-01', 'FU-03']);
  assert.deepEqual(of(120), [...FOUNDATION, 'FS-01', 'FU-01', 'FU-02', 'DT-01', 'FU-03', 'FS-02', 'FU-04', 'DT-02']);
  assert.equal(of(150).length, 16);
  assert.equal(of(180).length, 18);
  assert.equal(of(45).length, 9, 'a 45 day custom supply: the foundation week, day 15 and 20');
  assert.equal(of(400).length, 18, 'never past day 180');
});

test('the foundation week: one a day on consecutive working days from the start date, Wednesday skipped', () => {
  const week = (startDate, skip = []) => C.itemsForPart({ startDate, offsetDays: 0, days: 30, skip }).filter((i) => i.kind === 'foundation').map((i) => `${i.code} ${i.targetDate}`);
  // Monday 2026-11-23: Wednesday 25 is skipped.
  assert.deepEqual(week('2026-11-23'), ['FCF-01 2026-11-23', 'FCF-02 2026-11-24', 'FCF-03 2026-11-26', 'FCF-04 2026-11-27', 'FCF-05 2026-11-28', 'FCF-06 2026-11-29', 'FCF-07 2026-11-30']);
  // A start date on a Wednesday: day 1 is the Thursday.
  assert.equal(week('2026-11-25')[0], 'FCF-01 2026-11-26');
  // FCF-04 does not apply (no nasya / oil): FCF-05 takes its day, the week ends a day earlier.
  assert.deepEqual(week('2026-11-23', ['FCF-04']), ['FCF-01 2026-11-23', 'FCF-02 2026-11-24', 'FCF-03 2026-11-26', 'FCF-05 2026-11-27', 'FCF-06 2026-11-28', 'FCF-07 2026-11-29']);
  assert.deepEqual(C.itemsForPart({ startDate: '2026-11-23', offsetDays: 0, days: 30, skip: ['FU-01'] }).map((i) => i.code).slice(-1), ['FU-01'], 'only foundation codes can be skipped');
});

test('dates count from the start date; a Wednesday moves to Thursday', () => {
  const items = C.itemsForPart({ startDate: '2026-11-20', offsetDays: 0, days: 180 });
  assert.equal(items.find((i) => i.code === 'FS-01').targetDate, '2026-12-05');
  assert.equal(items.find((i) => i.code === 'FU-01').targetDate, '2026-12-10');
  items.forEach((i) => assert.notEqual(C.weekdayOf(i.targetDate), 3, `${i.code} on a Wednesday`));
  // Start 2026-11-23 + 15 = 2026-12-08 (Tuesday); start 2026-11-24 + 15 = 2026-12-09 (Wednesday) -> Thursday.
  assert.equal(C.itemsForPart({ startDate: '2026-11-24', offsetDays: 0, days: 30 }).find((i) => i.code === 'FS-01').targetDate, '2026-12-10');
});

test('sessions made on the earlier plan keep their earlier form; a saved form keeps the form it was filled on', () => {
  assert.equal(C.isLegacySession({ code: 'FU-01', day: 10 }), true);
  assert.equal(C.isLegacySession({ code: 'FU-07', day: 170 }), true);
  assert.equal(C.isLegacySession({ code: 'DT-03', day: 180 }), true);
  assert.equal(C.isLegacySession({ code: 'FU-01', day: 20 }), false);
  assert.equal(C.isLegacySession({ code: 'FS-01', day: 15 }), false, 'family sessions kept their days');
  assert.equal(templateForSession({ code: 'FU-01', day: 10 }), legacyTemplateOf('FU-01'));
  assert.equal(templateForSession({ code: 'FU-01', day: 20 }), templateOf('FU-01'));
  assert.equal(templateOf('FU-01').version, 2);
  assert.equal(templateForSession({ code: 'FS-02', day: 105, form: { templateKey: 'MV-FS-02', version: 1 } }), legacyTemplateOf('FS-02'));
  assert.equal(templateForSession({ code: 'FCF-03', day: 3 }), templateOf('FCF-03'));
  assert.equal(templateForSession({ code: 'DT-01', day: 60 }), null, 'a tracker has no form');
  assert.equal(C.notApplicable({ status: 'cancelled', closed: { reason: C.NOT_APPLICABLE } }), true);
  assert.equal(C.notApplicable({ status: 'cancelled', closed: { reason: 'Other' } }), false);
});

test('a later supply goes on with the days after the earlier ones, from its own start date', () => {
  const rest = C.itemsForPart({ startDate: '2027-01-05', offsetDays: 30, days: 150 });
  assert.deepEqual(codes(rest), ['FU-02', 'DT-01', 'FU-03', 'FS-02', 'FU-04', 'DT-02', 'FU-05', 'FS-03', 'FU-06'], 'no foundation week for a later supply');
  assert.equal(rest[0].targetDate, C.workingDay('2027-01-25'), 'day 50 = 20 days into the second supply');
  assert.equal(C.coveredDays([{ offsetDays: 0, days: 30 }, { offsetDays: 30, days: 150 }]), 180);
  assert.equal(C.supplyDone({ phaseDays: 180, parts: [{ offsetDays: 0, days: 30 }] }), false);
  assert.equal(C.supplyDone({ phaseDays: 180, parts: [{ offsetDays: 0, days: 30 }, { offsetDays: 30, days: 150 }] }), true);
  assert.equal(C.supplyDays('1+5', 'first'), 30);
  assert.equal(C.supplyDays('1+5', 'rest'), 150);
  assert.equal(C.supplyDays('6M', 'full'), 180);
  assert.equal(C.supplyDays('C0m45d', 'full'), 45);
});

test('call time: never on a Wednesday, never in the past', () => {
  const now = new Date('2026-11-20T06:00:00Z');
  assert.match(C.callTimeProblem('2026-11-25T11:00:00+05:30', now), /Wednesday/);
  assert.match(C.callTimeProblem('2026-11-19T11:00:00+05:30', now), /past/);
  assert.equal(C.callTimeProblem('2026-11-24T11:00:00+05:30', now), '');
  assert.match(C.callTimeProblem('', now), /Choose/);
});

test('state: red alert after two reschedules, overdue, today, call time to set, scheduled, closed', () => {
  const now = new Date('2026-11-20T06:00:00Z'); // 11:30 India time
  const base = { status: 'pending', targetDate: '2026-11-24', reschedules: [] };
  assert.equal(C.stateOf(base, now), 'needs_time');
  assert.equal(C.stateOf({ ...base, targetDate: '2026-11-19' }, now), 'overdue');
  assert.equal(C.stateOf({ ...base, targetDate: '2026-11-20' }, now), 'today');
  assert.equal(C.stateOf({ ...base, status: 'scheduled', callAt: new Date('2026-11-23T05:30:00Z') }, now), 'upcoming');
  assert.equal(C.stateOf({ ...base, status: 'scheduled', callAt: new Date('2026-11-20T04:00:00Z') }, now), 'overdue', 'the call time passed');
  assert.equal(C.stateOf({ ...base, status: 'scheduled', callAt: new Date('2026-11-23T05:30:00Z'), reschedules: [{}, {}] }, now), 'alert');
  assert.equal(C.stateOf({ ...base, status: 'completed', reschedules: [{}, {}] }, now), 'done');
  assert.equal(C.stateOf({ ...base, status: 'missed' }, now), 'missed');
  assert.equal(C.stateOf({ ...base, status: 'cancelled' }, now), 'cancelled');
});

// The rules are checked on the earlier FU-02 / FU-03 forms (they still carry "required" marks).
test('form rules: Mark done needs the parent available, the required answers and an owner + due date for every task', () => {
  const t = legacyTemplateOf('FU-02');
  const answered = { response: 'Available → Start', mode: 'Call', spokeWith: 'Mother', safety: 'No New Concern', medRoutine: 'All Regular', support: 'No Further Support Needed', final: 'Completed — No Concern' };
  assert.deepEqual(R.missingOf(t, answered), [], 'everything required is answered');
  assert.equal(R.missingOf(t, {}).length, 7, 'an empty form: response + 6 required answers');
  assert.ok(R.missingOf(t, { ...answered, response: 'Busy → Schedule Again' }).some((m) => /available/.test(m)), 'a busy parent cannot complete the session');
  assert.ok(R.missingOf(t, { ...answered, final: '' }).some((m) => /Final Status/.test(m)));
  assert.ok(R.missingOf(t, { ...answered, tasks: [{ issue: 'Diet paper not received' }] }).some((m) => /Task T1/.test(m)));
  assert.equal(R.missingOf(t, { ...answered, tasks: [{ issue: 'Diet paper not received', owner: 'PCC', due: '2026-11-25' }] }).filter((m) => /Task/.test(m)).length, 0);
});

test('form rules: a hidden block is never required, and Emergency / Urgent triage goes to the doctor', () => {
  const t = legacyTemplateOf('FU-03');
  assert.equal(R.escalationsOf(t, { safety: 'No New Concern', triage: 'Emergency' }).length, 0, 'triage hidden when there is no concern');
  const up = R.escalationsOf(t, { safety: 'New Concern', triage: 'Urgent Doctor Review', concern: { symptom: { value: 'vomiting' }, onset: { value: '2 days' } } });
  assert.equal(up.length, 1);
  assert.equal(up[0].level, 'Urgent Doctor Review');
  assert.match(up[0].text, /vomiting/);
  assert.equal(R.escalationsOf(t, { safety: 'New Concern', triage: 'Routine Support' }).length, 0);
});

test('every template and the basic one keep the shape the forms need', () => {
  [...templateCodes.map(templateOf), basicTemplate({ code: 'DT-01', kind: 'tracker', seq: 1, day: 60, title: 'Development Tracker 01' })].forEach((t) => {
    const blocks = R.blocksOf(t);
    assert.equal(blocks.filter((b) => b.t === 'response').length, 1, `${t.code} one response`);
    assert.equal(blocks.filter((b) => b.t === 'final' && b.id === 'final').length, 1, `${t.code} final`);
    const ids = blocks.filter((b) => b.id).map((b) => b.id);
    assert.equal(new Set(ids).size, ids.length, `${t.code} ids are unique`);
  });
  const current = templateCodes.map(templateOf);
  current.forEach((t) => assert.equal(t.day, C.PLAN_BY_CODE[t.code].day, `${t.code} day`));
  current.filter((t) => t.kind !== 'foundation').forEach((t) => assert.equal(t.version, 2, `${t.code} version 2`));
  assert.deepEqual(R.cleanAnswers({ a: 'x'.repeat(6000), $where: 1, 'b.c': 2, nested: { ok: true } }), { a: 'x'.repeat(5000), nested: { ok: true } });
});
