// Care Schedule rules (pure) and the form rules every template follows.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const C = require('./careSchedule');
const R = require('../careTemplates/rules');
const { templateOf, templateCodes } = require('../careTemplates');
const { basicTemplate } = require('../careTemplates/basic');

const codes = (items) => items.map((i) => i.code);

test('the plan: 7 follow-ups, 3 family sessions, 3 trackers on the agreed days', () => {
  assert.equal(C.PLAN.length, 13);
  assert.deepEqual(C.PLAN.filter((i) => i.kind === 'followup').map((i) => i.day), [10, 20, 50, 80, 110, 140, 170]);
  assert.deepEqual(C.PLAN.filter((i) => i.kind === 'family').map((i) => i.day), [15, 105, 165]);
  assert.deepEqual(C.PLAN.filter((i) => i.kind === 'tracker').map((i) => i.day), [60, 120, 180]);
  assert.deepEqual(templateCodes, ['FU-01', 'FU-02', 'FU-03', 'FU-04', 'FU-05', 'FU-06', 'FU-07', 'FS-01', 'FS-02', 'FS-03']);
});

test('only the days the medicine covers are scheduled: 1, 2, 3, 4, 5 and 6 months', () => {
  const of = (days) => codes(C.itemsForPart({ startDate: '2026-11-23', offsetDays: 0, days }));
  assert.deepEqual(of(30), ['FU-01', 'FS-01', 'FU-02']);
  assert.deepEqual(of(60), ['FU-01', 'FS-01', 'FU-02', 'FU-03', 'DT-01']);
  assert.deepEqual(of(90), ['FU-01', 'FS-01', 'FU-02', 'FU-03', 'DT-01', 'FU-04']);
  assert.deepEqual(of(120), ['FU-01', 'FS-01', 'FU-02', 'FU-03', 'DT-01', 'FU-04', 'FS-02', 'FU-05', 'DT-02']);
  assert.equal(of(150).length, 10);
  assert.equal(of(180).length, 13);
  assert.equal(of(45).length, 3, 'a 45 day custom supply: day 10, 15, 20');
  assert.equal(of(400).length, 13, 'never past day 180');
});

test('dates count from the start date; a Wednesday moves to Thursday', () => {
  const items = C.itemsForPart({ startDate: '2026-11-20', offsetDays: 0, days: 180 });
  const fu1 = items.find((i) => i.code === 'FU-01');
  assert.equal(fu1.targetDate, '2026-11-30');
  items.forEach((i) => assert.notEqual(C.weekdayOf(i.targetDate), 3, `${i.code} on a Wednesday`));
  // Start 2026-11-21 + 10 = 2026-12-01 (Tuesday); + 20 = 2026-12-11 (Friday); start 2026-11-22 + 10 = 2026-12-02 (Wednesday) -> Thursday.
  assert.equal(C.itemsForPart({ startDate: '2026-11-22', offsetDays: 0, days: 30 })[0].targetDate, '2026-12-03');
});

test('a later supply goes on with the days after the earlier ones, from its own start date', () => {
  const rest = C.itemsForPart({ startDate: '2027-01-05', offsetDays: 30, days: 150 });
  assert.deepEqual(codes(rest), ['FU-03', 'DT-01', 'FU-04', 'FS-02', 'FU-05', 'DT-02', 'FU-06', 'FS-03', 'FU-07', 'DT-03']);
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

test('form rules: Mark done needs the parent available, the required answers and an owner + due date for every task', () => {
  const t = templateOf('FU-02');
  const answered = { response: 'Available → Start', mode: 'Call', spokeWith: 'Mother', safety: 'No New Concern', medRoutine: 'All Regular', support: 'No Further Support Needed', final: 'Completed — No Concern' };
  assert.deepEqual(R.missingOf(t, answered), [], 'everything required is answered');
  assert.equal(R.missingOf(t, {}).length, 7, 'an empty form: response + 6 required answers');
  assert.ok(R.missingOf(t, { ...answered, response: 'Busy → Schedule Again' }).some((m) => /available/.test(m)), 'a busy parent cannot complete the session');
  assert.ok(R.missingOf(t, { ...answered, final: '' }).some((m) => /Final Status/.test(m)));
  assert.ok(R.missingOf(t, { ...answered, tasks: [{ issue: 'Diet paper not received' }] }).some((m) => /Task T1/.test(m)));
  assert.equal(R.missingOf(t, { ...answered, tasks: [{ issue: 'Diet paper not received', owner: 'PCC', due: '2026-11-25' }] }).filter((m) => /Task/.test(m)).length, 0);
});

test('form rules: a hidden block is never required, and Emergency / Urgent triage goes to the doctor', () => {
  const t = templateOf('FU-03');
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
    assert.ok(blocks.some((b) => b.t === 'response'), `${t.code} response`);
    assert.equal(blocks.filter((b) => b.t === 'final' && b.req).length, 1, `${t.code} final`);
    assert.ok(blocks.some((b) => b.t === 'tasks'), `${t.code} task register`);
  });
  assert.deepEqual(R.cleanAnswers({ a: 'x'.repeat(6000), $where: 1, 'b.c': 2, nested: { ok: true } }), { a: 'x'.repeat(5000), nested: { ok: true } });
});
