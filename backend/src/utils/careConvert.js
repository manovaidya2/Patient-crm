// Old patients onto the Care Schedule (asked 2026-11-21): a phase still running on the old follow-ups / family sessions
// gets the new pattern for the days it still has (e.g. 2 months left -> FU-06, FS-03, FU-07 and the trackers on their
// days). Done entries stay exactly as saved. The old entries not done are closed as "Moved to the new Care Schedule"
// (status cancelled, the status before is kept on the entry); a call time agreed on an old entry close to a new day
// is carried over. Nothing is deleted.
//
// The phase's start date: the medicine start date (In Transit), else the day the medicine was taken / the phase
// started, else (most old phases have none) 10 days before its first follow-up or family session, so that one lines up
// with FU-01's day 10. Its length: the medicine on record (months given, or the supplies received) or as far as the old
// schedule was made (its last entry, in whole months), whichever is longer, at most 6 months; 6 months when neither is
// known. A phase with no day left (its old open entries all in the past) only has those entries closed.
const C = require('./careSchedule');
const { supplyOption } = require('../constants/supplyPlans');

const OPEN = ['scheduled', 'sent'];
const MATCH_DAYS = 7;
const plain = (value) => (value?.toObject ? value.toObject() : value || {});
const dayOfDate = (value) => (value ? C.dayOf(value) : '');

const entriesOf = (stage) => [
  ...(stage.followUps || []).map((e) => ({ entry: e, field: 'followUps', kind: e.followUpType === 'tracker' ? 'tracker' : 'followup' })),
  ...(stage.familySessions || []).map((e) => ({ entry: e, field: 'familySessions', kind: 'family' })),
].filter((x) => x.entry?.dateTime);

const anchorOf = (stage, entries) => {
  const t = plain(stage.transit);
  if (t.medicineStartDate) return { day: dayOfDate(t.medicineStartDate), source: 'medicine start date' };
  if (stage.medicineTakenDate) return { day: dayOfDate(stage.medicineTakenDate), source: 'medicine taken date' };
  if (stage.date) return { day: dayOfDate(stage.date), source: 'phase start date' };
  const first = entries.map((x) => dayOfDate(x.entry.dateTime)).sort()[0];
  return first ? { day: C.addDays(first, -10), source: `10 days before the first follow-up (${first})` } : null;
};

const recordedLength = (stage) => {
  if (Number(stage.medicineMonthsGiven) > 0) return { days: Math.min(C.PHASE_DAYS, Number(stage.medicineMonthsGiven) * 30), source: `${stage.medicineMonthsGiven} months given` };
  const seen = new Set();
  const received = [...(stage.medicineRequests || []), stage.medicineRequest].filter((r) => {
    if (!r || plain(r.courier).status !== 'delivered' || seen.has(r.requestId || 'legacy')) return false;
    seen.add(r.requestId || 'legacy');
    return true;
  });
  const days = received.reduce((sum, r) => sum + (supplyOption(r.supplyPlan, r.supplyPart || 'full')?.days || 0), 0);
  if (days > 0) return { days: Math.min(C.PHASE_DAYS, days), source: 'medicine received' };
  return null;
};
const lengthOf = (stage, anchorDay = '', entries = entriesOf(stage)) => {
  const recorded = recordedLength(stage);
  const last = entries.map((x) => dayOfDate(x.entry.dateTime)).sort().pop();
  const span = anchorDay && last ? Math.min(C.PHASE_DAYS, Math.ceil((C.diffDays(last, anchorDay) + 1) / 30) * 30) : 0;
  if (!recorded) return { days: C.PHASE_DAYS, source: '6 months (not on record)' };
  if (span > recorded.days) return { days: span, source: `as far as the old schedule went (${span / 30} months; ${recorded.source})` };
  return recorded;
};

// The plan for one phase (no database). { ok, reason } when it is not converted; else { anchor, length, end, items,
// close, kept } - items: the new sessions from today ({ ...PLAN item, targetDate, carry: { at, from } | null }),
// close: the old entries to close, kept: how many done entries stay as they are.
const planConversion = (stage, now = new Date()) => {
  if (stage.carePlan?.parts?.length) return { ok: false, reason: 'Already on the Care Schedule' };
  const entries = entriesOf(stage);
  const open = entries.filter((x) => OPEN.includes(x.entry.status));
  if (!open.length) return { ok: false, reason: 'No open follow-up or family session' };
  const anchor = anchorOf(stage, entries);
  if (!anchor?.day) return { ok: false, reason: 'No date to start from' };
  const length = lengthOf(stage, anchor.day, entries);
  const today = C.dayOf(now);
  const end = C.addDays(anchor.day, length.days);
  const over = end < today;
  const items = over ? [] : C.itemsForPart({ startDate: anchor.day, offsetDays: 0, days: length.days }).filter((item) => item.targetDate >= today);
  // An old entry close to a new day gives it its call time (each old entry once, the nearest first).
  const used = new Set();
  items.forEach((item) => {
    const candidates = open
      .filter((x) => x.kind === item.kind && !used.has(x.entry) && new Date(x.entry.dateTime) > now)
      .map((x) => ({ x, gap: Math.abs(C.diffDays(dayOfDate(x.entry.dateTime), item.targetDate)) }))
      .filter((c) => c.gap <= MATCH_DAYS && !C.isOffDay(dayOfDate(c.x.entry.dateTime)))
      .sort((a, b) => a.gap - b.gap);
    const best = candidates[0]?.x;
    if (best) used.add(best.entry);
    item.carry = best ? { at: new Date(best.entry.dateTime), from: dayOfDate(best.entry.dateTime) } : null;
  });
  return {
    ok: true, anchor, length, end, items,
    close: open.map((x) => ({ field: x.field, id: String(x.entry._id), day: dayOfDate(x.entry.dateTime), kind: x.kind, status: x.entry.status })),
    kept: entries.length - open.length,
    over,
    reason: over ? `No days left (${anchor.day} + ${length.days} days = ${end}): the old open entries are only closed` : '',
  };
};

// The database update that applies a plan to one phase: the Care Schedule part, the old open entries closed (their
// status before kept), an activity line. Only while the phase is not on the Care Schedule yet (run twice = once).
const conversionUpdate = ({ phase, plan, user, now, poNumber = '' }) => {
  const carePlan = {
    startedAt: now, startedByName: user.name, phaseDays: C.PHASE_DAYS,
    convertedFrom: { at: now, byName: user.name, startFrom: plan.anchor.source, length: plan.length.source, closed: plan.close.length },
    parts: [{ requestId: 'converted', poNumber, days: plan.length.days, startDate: plan.anchor.day, offsetDays: 0, addedAt: now, addedByName: user.name }],
  };
  const set = { 'stages.$[s].carePlan': carePlan };
  const arrayFilters = [{ 's.number': phase }];
  const lists = { followUps: 'f', familySessions: 'g' };
  Object.entries(lists).forEach(([field, letter]) => {
    OPEN.forEach((status, i) => {
      const ids = plan.close.filter((c) => c.field === field && c.status === status).map((c) => c.id);
      if (!ids.length) return;
      const name = `${letter}${i}`;
      const base = `stages.$[s].${field}.$[${name}]`;
      Object.assign(set, {
        [`${base}.status`]: 'cancelled', [`${base}.statusBeforeConvert`]: status, [`${base}.cancelReason`]: plan.over ? 'Not done - the phase had no days left when moving to the new Care Schedule' : 'Moved to the new Care Schedule',
        [`${base}.cancelledAt`]: now, [`${base}.cancelledByName`]: user.name, [`${base}.convertedAt`]: now, [`${base}.convertedByName`]: user.name,
      });
      arrayFilters.push({ [`${name}._id`]: { $in: ids.map((id) => new (require('mongoose').Types.ObjectId)(id)) }, [`${name}.status`]: status });
    });
  });
  const carried = plan.items.filter((i) => i.carry).length;
  const activity = {
    action: `Follow-ups of Phase ${phase} moved to the new Care Schedule`,
    details: `${plan.items.length} new (${plan.items.map((i) => `${i.code} ${i.targetDate}`).join(', ')}); ${plan.close.length} old open entr${plan.close.length === 1 ? 'y' : 'ies'} closed; ${carried} call time${carried === 1 ? '' : 's'} carried over. Start ${plan.anchor.day} (${plan.anchor.source}), ${plan.length.days} days (${plan.length.source}).`,
    actorName: user.name, actorRole: user.role || '', createdAt: now, updatedAt: now,
  };
  return {
    filter: { stages: { $elemMatch: { number: phase, 'carePlan.parts.0': { $exists: false } } } },
    update: { $set: set, $push: { activityLog: activity } },
    options: { arrayFilters },
  };
};


module.exports = { planConversion, conversionUpdate, anchorOf, lengthOf, entriesOf, OPEN };
