const test = require('node:test');
const assert = require('node:assert/strict');
const d = require('./treatmentDelivery');

const ALL = d.COMPONENT_KEYS;
const keysOf = (items) => items.map((item) => item.key);
const part = (startDate, months, offsetDays = 0) => ({ startDate, months, offsetDays });

test('supply months: the whole plan and the part in hand', () => {
  assert.equal(d.planMonthsOf('6M'), 6);
  assert.equal(d.planMonthsOf('1+5'), 6);
  assert.equal(d.planMonthsOf('2+4'), 6);
  assert.equal(d.planMonthsOf('C3'), 3);
  assert.equal(d.planMonthsOf('nonsense'), 0);
  assert.equal(d.partMonthsOf('1+5', 'first'), 1);
  assert.equal(d.partMonthsOf('1+5', 'rest'), 5);
  assert.equal(d.partMonthsOf('C3', 'full'), 3);
  assert.equal(d.partMonthsOf('', ''), 0);
});

test('rules: bad values fall back to the defaults', () => {
  const rules = d.cleanRules({ followUpsPerSixMonths: 18, defaultHour: 99, closedWeekdays: [0, 1, 2, 3, 4, 5, 6], doctorReviewDays: [100, 40] });
  assert.equal(rules.followUpsPerSixMonths, 18);
  assert.equal(rules.defaultHour, 11);
  assert.deepEqual(rules.closedWeekdays, [3]);
  assert.deepEqual(rules.doctorReviewDays, [45, 105, 165]);
  assert.deepEqual(d.cleanRules({ doctorReviewDays: [160, 40, 100], closedWeekdays: [3, 0] }).doctorReviewDays, [40, 100, 160]);
  assert.deepEqual(d.cleanRules(null), d.DEFAULT_RULES);
});

test('full 6 month plan: every promised session, on the sample day numbers', () => {
  const plan = d.buildPlan(ALL, 180);
  const byKey = Object.fromEntries(plan.map((item) => [item.key, item]));
  assert.equal(byKey['diet:1'].day, 3);
  assert.equal(byKey['diet:2'].day, 90);
  assert.equal(byKey.panch.day, 5);
  assert.equal(byKey.sens.day, 7);
  assert.equal(byKey.plans.day, 10);
  assert.deepEqual(['medc:1', 'medc:2', 'medc:3'].map((key) => byKey[key].day), [45, 105, 165]);
  const followUps = plan.filter((item) => item.template === 'fu');
  assert.equal(followUps.length, 15);
  assert.equal(followUps[0].day, 14);
  assert.equal(followUps[14].day, 176);
  // One follow-up per month carries the monthly progress documentation.
  assert.equal(followUps.filter((item) => item.monthly).length, 6);
  assert.ok(followUps.find((item) => item.monthly).title.endsWith('+ monthly progress'));
  // The reviews that ride on follow-ups.
  assert.ok(followUps[0].components.includes('panchakarmaKit'));
  assert.ok(followUps[0].components.includes('parentTraining'));
  assert.deepEqual(plan.filter((item) => item.kind === 'task').map((item) => [item.key, item.day]), [['task:reviewPrep', 150], ['task:bookNext', 165], ['task:nextCounselling', 175], ['task:phaseReview', 180]]);
  // Family counselling is booked only when the family needs it; the medicine explanation already happened.
  assert.ok(!plan.some((item) => item.template === 'fam'));
});

test('nothing is made for a component that is not ticked', () => {
  const plan = d.buildPlan(['regularFollowUps'], 180);
  assert.deepEqual([...new Set(plan.filter((item) => item.kind === 'session').map((item) => item.template))], ['fu']);
  assert.ok(plan.every((item) => !item.monthly));
  assert.deepEqual(plan[0].components, ['regularFollowUps']);
  const none = d.buildPlan([], 180);
  assert.ok(none.every((item) => item.kind === 'task'));
  // The written plans are handed over in one session, whichever of them is ticked.
  const plans = d.buildPlan(['homeTherapyPlan', 'functionalSkills'], 180).filter((item) => item.kind === 'session');
  assert.deepEqual(keysOf(plans), ['plans']);
  assert.deepEqual(plans[0].components, ['homeTherapyPlan', 'functionalSkills']);
});

test('a shorter supply plan scales the follow-ups and the later days', () => {
  const plan = d.buildPlan(ALL, 90);
  const followUps = plan.filter((item) => item.template === 'fu');
  assert.equal(followUps.length, 8);
  assert.equal(followUps[0].day, 14);
  assert.equal(followUps[7].day, 86);
  assert.equal(followUps.filter((item) => item.monthly).length, 3);
  assert.equal(plan.find((item) => item.key === 'diet:1').day, 3);
  assert.equal(plan.find((item) => item.key === 'diet:2').day, 45);
  assert.ok(plan.every((item) => item.day <= 90));
  assert.equal(plan.find((item) => item.key === 'task:phaseReview').day, 90);
  assert.equal(d.followUpCount(30, d.DEFAULT_RULES), 3);
});

test('layout: day 1 is the medicine start date; closed days and a second session on one day are skipped', () => {
  // 2026-11-12 is a Thursday. Day 7 = Wednesday 18th (closed) -> Thursday 19th.
  const out = d.layout(d.buildPlan(ALL, 180), { parts: [part('2026-11-12', 6)], today: '2026-11-11' });
  const at = Object.fromEntries(out.sessions.map((s) => [s.key, d.dayOf(s.dateTime)]));
  assert.equal(at['diet:1'], '2026-11-14');
  assert.equal(at.panch, '2026-11-16');
  assert.equal(at.sens, '2026-11-19');
  assert.equal(out.later.length, 0);
  assert.equal(out.skipped.length, 0);
  assert.equal(out.tasks.length, 4);
  const days = out.sessions.map((s) => d.dayOf(s.dateTime));
  assert.equal(new Set(days).size, days.length, 'one session per patient per day');
  assert.ok(days.every((day) => d.weekdayOf(day) !== 3), 'never on a Wednesday');
  // Saturday, Sunday and Tuesday are afternoon days for the PCCs.
  const saturday = out.sessions.find((s) => s.key === 'diet:1');
  assert.equal(saturday.dateTime.toISOString(), '2026-11-14T08:30:00.000Z');
  assert.equal(out.sessions.find((s) => s.key === 'panch').dateTime.toISOString(), '2026-11-16T05:30:00.000Z');
});

test('layout: holidays and days the patient already has something are skipped', () => {
  const out = d.layout(d.buildPlan(['dosDontsDiet'], 180), { parts: [part('2026-11-12', 6)], today: '2026-11-11', holidays: new Set(['2026-11-14']), taken: new Set(['2026-11-15']) });
  assert.equal(d.dayOf(out.sessions[0].dateTime), '2026-11-16');
});

test('layout: only the supply in hand is planned; the rest waits for the next supply', () => {
  const plan = d.buildPlan(ALL, 180);
  const first = d.layout(plan, { parts: [part('2026-11-12', 1)], today: '2026-11-11' });
  assert.ok(first.sessions.every((s) => s.day <= 30));
  assert.ok(first.later.length > 0);
  assert.equal(first.sessions.length + first.later.filter((item) => item.kind === 'session').length, plan.filter((item) => item.kind === 'session').length);
  // The second supply starts late: its days are counted from its own start date.
  const parts = [part('2026-11-12', 1), part('2026-12-20', 5, 30)];
  assert.equal(d.dateOfDay(30, parts), '2026-12-11');
  assert.equal(d.dateOfDay(31, parts), '2026-12-20');
  assert.equal(d.dateOfDay(180, parts), '2027-05-18');
  assert.equal(d.dateOfDay(181, parts), null);
  assert.equal(d.coveredDays(parts), 180);
  assert.equal(d.layout(plan, { parts, today: '2026-11-11' }).later.length, 0);
});

test('layout: a plan made late moves the recent past to the next working day and leaves out the old', () => {
  // Started 30 days ago: day 3-14 items are more than 14 days old, the day 26 follow-up is 4 days old.
  const out = d.layout(d.buildPlan(ALL, 180), { parts: [part('2026-10-13', 6)], today: '2026-11-11' });
  const skipped = keysOf(out.skipped);
  assert.ok(skipped.includes('diet:1') && skipped.includes('plans') && skipped.includes('fu:1'));
  const caughtUp = out.sessions.find((s) => s.key === 'fu:2');
  assert.equal(d.dayOf(caughtUp.dateTime), '2026-11-12');
  // Asked for explicitly ("schedule now"): it is kept.
  const kept = d.layout(d.buildPlan(ALL, 180), { parts: [part('2026-10-13', 6)], today: '2026-11-11', keep: new Set(['diet:1']) });
  assert.ok(kept.sessions.some((s) => s.key === 'diet:1'));
  // Tasks are never left out.
  assert.equal(out.tasks.length, 4);
});

const entry = (extra = {}, delivery = {}) => ({ _id: 'e1', status: 'scheduled', dateTime: new Date('2026-11-20T05:30:00Z'), delivery: { auto: true, key: 'fu:1', template: 'fu', title: 'Follow-up 1', ...delivery }, ...extra });

test('session states', () => {
  const before = new Date('2026-11-15T00:00:00Z');
  const after = new Date('2026-11-25T00:00:00Z');
  assert.equal(d.stateOf(entry(), before), 'tentative');
  assert.equal(d.stateOf(entry(), after), 'overdue');
  assert.equal(d.stateOf(entry({}, { confirmedAt: new Date() }), before), 'confirmed');
  assert.equal(d.stateOf(entry({}, { confirmedAt: new Date() }), after), 'form_due');
  assert.equal(d.stateOf(entry({}, { missedAt: new Date() }), after), 'missed');
  assert.equal(d.stateOf(entry({ status: 'completed' }), after), 'done');
  assert.equal(d.stateOf(entry({ status: 'cancelled' }), after), 'cancelled');
  assert.equal(d.stateOf(entry({ status: 'cancelled' }, { rescheduledTo: 'x' }), after), 'rescheduled');
  assert.equal(d.isMovable(entry()), true);
  assert.equal(d.isMovable(entry({}, { confirmedAt: new Date() })), false);
  assert.equal(d.isMovable(entry({}, { movedAt: new Date() })), false);
  assert.equal(d.isMovable(entry({ status: 'completed' })), false);
});

test('checklist: SOP steps, integrated lines, monthly line and parent teach-back', () => {
  const followUp = d.checklistFor({ template: 'fu', monthly: true, components: ['regularFollowUps', 'panchakarmaKit', 'parentTraining', 'progressTracking'] }, ALL);
  assert.deepEqual(followUp.map((line) => line.key), ['pre', 's1', 's2', 's3', 'i:panchakarmaKit', 'i:parentTraining', 'mon']);
  const plans = d.checklistFor({ template: 'plans', components: ['homeTherapyPlan', 'functionalSkills'] }, ['homeTherapyPlan', 'functionalSkills', 'parentTraining']);
  assert.deepEqual(plans.map((line) => line.key), ['pre', 'p:homeTherapyPlan', 'p:functionalSkills', 's:demo', 'tb']);
  // No teach-back line without parent training, and never on the doctor's review.
  assert.ok(!d.checklistFor({ template: 'diet1' }, ['dosDontsDiet']).some((line) => line.key === 'tb'));
  assert.ok(!d.checklistFor({ template: 'medc' }, ALL).some((line) => line.key === 'tb'));
  assert.deepEqual(d.checklistFor({ template: 'unknown' }, ALL), []);
});

test('closing a session is blocked until every line and the close form are answered', () => {
  const lines = d.checklistFor({ template: 'fu', components: ['regularFollowUps'] }, ['regularFollowUps']);
  const answers = lines.map((line) => ({ key: line.key, answer: 'done' }));
  const close = { redFlag: false, understanding: 'good', recording: 'recorded', homeTask: 'Oil massage daily' };
  assert.throws(() => d.cleanSubmission(lines, { checklist: answers.slice(1), close }), /Done or N\/A/);
  assert.throws(() => d.cleanSubmission(lines, { checklist: answers, close: { ...close, redFlag: undefined } }), /red flag/);
  assert.throws(() => d.cleanSubmission(lines, { checklist: answers, close: { ...close, redFlag: true } }), /concern/);
  assert.throws(() => d.cleanSubmission(lines, { checklist: answers, close: { ...close, understanding: '' } }), /understanding/);
  assert.throws(() => d.cleanSubmission(lines, { checklist: answers, close: { ...close, recording: 'x' } }), /recording/);
  const ok = d.cleanSubmission(lines, { checklist: [{ key: 'pre', answer: 'na', reason: 'Known family' }, ...answers.slice(1)], close: { ...close, redFlag: true, concern: 'Child had a seizure' } });
  assert.equal(ok.checklist.length, lines.length);
  assert.equal(ok.checklist[0].answer, 'na');
  assert.equal(ok.checklist[0].reason, 'Known family');
  assert.equal(ok.close.concern, 'Child had a seizure');
  assert.match(d.summaryOf(ok.checklist, ok.close), /RED FLAG: Child had a seizure/);
  assert.match(d.summaryOf(ok.checklist, ok.close), /3 done, 1 N\/A/);
});

test('promise tracker: promised against delivered, only for ticked components', () => {
  const done = (template, checklist = [], extra = {}) => ({ state: 'done', delivery: { template, checklist, ...extra } });
  const sessions = [
    done('diet1'),
    { state: 'tentative', delivery: { template: 'diet2' } },
    done('fu', [{ key: 'i:panchakarmaKit', answer: 'done' }, { key: 'mon', answer: 'done' }], { monthly: true }),
    done('fu', [{ key: 'i:panchakarmaKit', answer: 'na' }]),
    { state: 'cancelled', delivery: { template: 'fu' } },
    done('plans', [{ key: 'p:homeTherapyPlan', answer: 'done' }]),
  ];
  const rows = d.trackerOf({ components: ['dosDontsDiet', 'panchakarmaKit', 'progressTracking', 'homeTherapyPlan', 'familyCounselling', 'regularFollowUps', 'ayurvedicFormulations'], sessions, followUpsPromised: 15, planMonths: 6, explanationDone: true, familyDone: 1, familyBooked: 2 });
  const by = Object.fromEntries(rows.map((row) => [row.key, row]));
  assert.equal(rows.length, 7);
  assert.deepEqual([by.dosDontsDiet.promised, by.dosDontsDiet.delivered, by.dosDontsDiet.booked], [2, 1, 2]);
  assert.deepEqual([by.regularFollowUps.promised, by.regularFollowUps.delivered, by.regularFollowUps.booked], [15, 2, 2]);
  assert.deepEqual([by.progressTracking.promised, by.progressTracking.delivered], [6, 1]);
  assert.match(by.panchakarmaKit.note, /1 follow-up/);
  assert.equal(by.homeTherapyPlan.delivered, 1);
  assert.deepEqual([by.familyCounselling.promised, by.familyCounselling.delivered, by.familyCounselling.booked], [3, 1, 2]);
  assert.equal(by.ayurvedicFormulations.delivered, 1);
  assert.ok(!by.sensoryGuidance);
});

test('alerts and the next phase', () => {
  const now = new Date('2026-11-25T06:00:00Z');
  const delivery = { phaseDays: 180, parts: [part('2026-11-12', 6)], tasks: [{ key: 'task:reviewPrep', title: 'Prep', dueDate: new Date('2026-11-20T05:30:00Z') }] };
  const sessions = [
    entry({ _id: 'a' }, { missedAt: new Date() }),
    entry({ _id: 'b' }, { confirmedAt: new Date() }),
    entry({ _id: 'c' }),
    entry({ _id: 'd', dateTime: new Date('2026-11-28T05:30:00Z') }),
    entry({ _id: 'e', dateTime: new Date('2026-12-28T05:30:00Z') }),
    entry({ _id: 'f', status: 'completed' }),
  ];
  const alerts = d.alertsOf({ delivery, sessions, now });
  assert.deepEqual(alerts.map((a) => a.type), ['missed', 'form', 'overdue', 'confirm', 'task']);
  assert.equal(alerts[0].sessionId, 'a');
  // Not started: nothing to chase.
  assert.deepEqual(d.alertsOf({ delivery: { phaseDays: 180, parts: [] }, sessions, now }), []);

  // Within 30 days of the phase end: the next-phase consultation must be booked.
  const nearEnd = new Date('2027-04-20T06:00:00Z');
  assert.equal(d.phaseEndDay(delivery), '2027-05-10');
  const near = d.alertsOf({ delivery: { ...delivery, tasks: [] }, sessions: [entry({ status: 'completed' })], now: nearEnd });
  assert.equal(near.find((a) => a.type === 'next_phase').level, 'red'); // delivered: everything is done
  const open = d.alertsOf({ delivery: { ...delivery, tasks: [] }, sessions: [entry({ dateTime: new Date('2027-05-01T05:30:00Z') })], now: nearEnd });
  assert.equal(open.find((a) => a.type === 'next_phase').level, 'amber');
  // A decision ends it; "parent needs time" comes back on the call date.
  assert.ok(!d.alertsOf({ delivery: { ...delivery, tasks: [], nextPhase: { decision: 'book' } }, sessions: [], now: nearEnd }).length);
  const waiting = { ...delivery, tasks: [], nextPhase: { decision: 'time', followUpAt: new Date('2027-04-25T05:30:00Z') } };
  assert.ok(!d.alertsOf({ delivery: waiting, sessions: [], now: nearEnd }).length);
  assert.equal(d.alertsOf({ delivery: waiting, sessions: [], now: new Date('2027-04-26T06:00:00Z') })[0].type, 'next_phase');

  // Supply in hand running out while the plan has more months.
  const partOnly = { phaseDays: 180, parts: [part('2026-11-12', 1)], tasks: [] };
  assert.equal(d.alertsOf({ delivery: partOnly, sessions: [], now: new Date('2026-12-05T06:00:00Z') })[0].type, 'supply');
  assert.equal(d.phaseEndDay(partOnly), null);
});

test('delivered: the whole supply has started and nothing of the plan is open', () => {
  const delivery = { phaseDays: 180, parts: [part('2026-11-12', 6)] };
  assert.equal(d.isDelivered(delivery, [entry({ status: 'completed' }), entry({ status: 'cancelled' })]), true);
  assert.equal(d.isDelivered(delivery, [entry({ status: 'completed' }), entry()]), false);
  assert.equal(d.isDelivered(delivery, []), false);
  assert.equal(d.isDelivered({ phaseDays: 180, parts: [part('2026-11-12', 1)] }, [entry({ status: 'completed' })]), false);
  assert.deepEqual(d.progressOf([entry({ status: 'completed' }), entry(), entry({ status: 'cancelled' })]), { total: 2, done: 1 });
});
