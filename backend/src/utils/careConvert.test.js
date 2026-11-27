// Old patients onto the Care Schedule: the plan for one phase (start date, days left, new sessions from today, call
// times carried over, old open entries closed, done ones kept) and the database update it makes.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const { planConversion, conversionUpdate } = require('./careConvert');

const id = () => new mongoose.Types.ObjectId();
const at = (day, hour = '11:00') => new Date(`${day}T${hour}:00+05:30`);
const fu = (day, status = 'scheduled', followUpType = 'normal') => ({ _id: id(), dateTime: at(day), status, followUpType });
const NOW = at('2026-11-21', '10:00');

test('2 months left: only the new-pattern sessions of the days left, from today', () => {
  // First follow-up 2026-07-25 -> start 2026-07-15; day 129 today; 6 months -> FU-05 (day 140), FS-03, FU-06 left (no DT-03 any more).
  const stage = {
    number: 1, followUps: [fu('2026-07-25', 'completed'), fu('2026-08-25', 'completed'), fu('2026-11-25'), fu('2026-12-08', 'scheduled', 'tracker'), fu('2027-01-04')],
    familySessions: [{ _id: id(), dateTime: at('2026-08-10'), status: 'completed' }, { _id: id(), dateTime: at('2026-12-26'), status: 'scheduled' }],
  };
  const plan = planConversion(stage, NOW);
  assert.equal(plan.ok, true);
  assert.deepEqual([plan.anchor.day, plan.anchor.source.startsWith('10 days before'), plan.length.days], ['2026-07-15', true, 180]);
  assert.deepEqual(plan.items.map((i) => i.code), ['FU-05', 'FS-03', 'FU-06']);
  assert.deepEqual(plan.items.map((i) => i.targetDate), ['2026-12-03', '2026-12-27', '2027-01-01']);
  assert.equal(plan.close.length, 4, 'the 4 open old entries are closed');
  assert.equal(plan.kept, 3, 'the 3 done ones stay');
  // The old family session of 2026-12-26 is a day from FS-03 (2026-12-27): its call time is kept. The old follow-up of
  // 2027-01-04 is 3 days from FU-06 (2027-01-01). FU-05 (2026-12-03): the nearest old follow-up (2026-11-25) is 8 days away -> none.
  const carry = Object.fromEntries(plan.items.map((i) => [i.code, i.carry && i.carry.from]));
  assert.deepEqual(carry, { 'FU-05': null, 'FS-03': '2026-12-26', 'FU-06': '2027-01-04' });
});

test('the start date and the length come from the record when they are there', () => {
  const base = { number: 2, followUps: [fu('2026-12-01')], familySessions: [] };
  const withStart = planConversion({ ...base, transit: { medicineStartDate: at('2026-11-01', '00:00') } }, NOW);
  assert.deepEqual([withStart.anchor.day, withStart.anchor.source], ['2026-11-01', 'medicine start date']);
  assert.deepEqual(withStart.items.map((i) => i.code).slice(0, 3), ['FU-01', 'FU-02', 'DT-01'], 'day 20 = 2026-11-21 (today) onward; the foundation week is past');
  const twoMonths = planConversion({ ...base, transit: { medicineStartDate: at('2026-11-01', '00:00') }, medicineMonthsGiven: 2 }, NOW);
  assert.equal(twoMonths.length.days, 60);
  assert.deepEqual(twoMonths.items.map((i) => i.code), ['FU-01', 'FU-02', 'DT-01']);
  const received = planConversion({ ...base, transit: { medicineStartDate: at('2026-11-01', '00:00') }, medicineRequests: [{ requestId: 'r1', supplyPlan: '2+4', supplyPart: 'first', courier: { status: 'delivered' } }] }, NOW);
  assert.equal(received.length.days, 60);
});

test('not converted: no open entry, already on the Care Schedule; a phase with no day left only has its old entries closed', () => {
  assert.equal(planConversion({ number: 1, followUps: [fu('2026-11-01', 'completed')], familySessions: [] }, NOW).ok, false);
  assert.match(planConversion({ number: 1, carePlan: { parts: [{}] }, followUps: [fu('2026-12-01')] }, NOW).reason, /Already/);
  const over = planConversion({ number: 1, medicineMonthsGiven: 1, followUps: [fu('2026-09-18', 'completed'), fu('2026-10-23')], familySessions: [] }, NOW);
  assert.deepEqual([over.ok, over.over, over.items.length, over.close.length], [true, true, 0, 1]);
  const { update } = conversionUpdate({ phase: 1, plan: over, user: { name: 'System' }, now: NOW });
  assert.match(update.$set['stages.$[s].followUps.$[f0].cancelReason'], /no days left/);
});

test('1 month given but the old schedule went to March: the phase is as long as the old schedule (at most 6 months)', () => {
  const stage = { number: 1, medicineMonthsGiven: 1, followUps: [fu('2026-09-17', 'completed'), fu('2026-12-15'), fu('2027-03-15')], familySessions: [] };
  const plan = planConversion(stage, NOW);
  assert.deepEqual([plan.ok, plan.over, plan.length.days], [true, false, 180]);
  assert.match(plan.length.source, /old schedule/);
  assert.equal(plan.items.at(-1).code, 'FU-06');
});

test('the update: Care Schedule part, old open entries closed with their status before, only once', () => {
  const stage = { number: 1, followUps: [fu('2026-07-25', 'completed'), fu('2026-12-01'), fu('2026-12-08', 'sent', 'tracker')], familySessions: [{ _id: id(), dateTime: at('2026-12-26'), status: 'scheduled' }] };
  const plan = planConversion(stage, NOW);
  const { filter, update, options } = conversionUpdate({ phase: 1, plan, user: { name: 'Admin A', role: 'admin' }, now: NOW, poNumber: 'PO-9' });
  assert.deepEqual(filter, { stages: { $elemMatch: { number: 1, 'carePlan.parts.0': { $exists: false } } } }, 'a phase already moved is not touched again');
  const part = update.$set['stages.$[s].carePlan'].parts[0];
  assert.deepEqual([part.requestId, part.startDate, part.days, part.poNumber], ['converted', '2026-07-15', 180, 'PO-9']);
  assert.equal(update.$set['stages.$[s].followUps.$[f0].status'], 'cancelled');
  assert.equal(update.$set['stages.$[s].followUps.$[f0].statusBeforeConvert'], 'scheduled');
  assert.equal(update.$set['stages.$[s].followUps.$[f1].statusBeforeConvert'], 'sent');
  assert.equal(update.$set['stages.$[s].familySessions.$[g0].cancelReason'], 'Moved to the new Care Schedule');
  assert.equal(update.$set['stages.$[s].familySessions.$[g1].status'], undefined, 'no family session was "sent"');
  assert.deepEqual(options.arrayFilters.map((f) => Object.keys(f)[0]), ['s.number', 'f0._id', 'f1._id', 'g0._id']);
  assert.equal(String(options.arrayFilters[1]['f0._id'].$in[0]), String(stage.followUps[1]._id));
  assert.match(update.$push.activityLog.details, /closed/);
});
