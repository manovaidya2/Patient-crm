// The medicine ready date and the supply (6 months / 1+5 / 2+4) are decided in post counselling on the PO paper.
// In Transit and the Medicine Department work to that date and supply and cannot change them (only the admin can).
// Delays are counted against that same date:
//   Medicine Department: the day the medicine was made (final check)      vs the expected date
//   In Transit:          the day the medicine was released to In Transit  vs the expected date
// and against the date In Transit fixed with the patient:
//   Dispatch / pickup:   the day it was dispatched (or collected)          vs the planned dispatch (or pickup) date
const { ROLES } = require('../constants/roles');

const DAY_MS = 24 * 60 * 60 * 1000;
const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;
// Whole India-time days, so 11 pm and 1 am on the same date count as the same day.
const istDayNumber = (value) => Math.floor((new Date(value).getTime() + IST_OFFSET_MS) / DAY_MS);
const validDate = (value) => value && !Number.isNaN(new Date(value).getTime());

// Days after the expected date (0 when on time or early); null when either date is missing.
const daysLate = (expected, actual) => {
  if (!validDate(expected) || !validDate(actual)) return null;
  return Math.max(0, istDayNumber(actual) - istDayNumber(expected));
};

// The date written on the PO paper ("Medicine ready expected date"), as a Date, or null.
const paperDate = (value) => (/^\d{4}-\d{2}-\d{2}$/.test(String(value || '')) ? new Date(`${value}T00:00:00.000+05:30`) : null);

// The expected date fixed by post counselling for this phase / purchase order (null for older phases without one).
// A PO added by hand by anyone but the Post Counselor (In Transit, usually) has none: In Transit fills its ready date.
const readyDateFromPostCounselling = (po) => !po || po.source !== 'manual' || po.createdByRole === ROLES.POST_COUNSELOR;
const fixedReadyDate = ({ po = null, stage = null } = {}) => {
  if (!readyDateFromPostCounselling(po)) return null;
  return po?.medicineReadyDate || paperDate(stage?.poPaper?.values?.medicineReadyDate) || null;
};

// Only the admin may change what post counselling fixed.
const canOverrideFixed = (user) => user?.role === ROLES.ADMIN;

// One step's delay: done (with the days it was late) or still running (days late so far).
// Kept once done, so a finished step still shows how late it was.
const stepDelay = (expected, doneAt, now) => {
  if (!validDate(expected)) return null;
  const base = { expected: new Date(expected).toISOString() };
  if (validDate(doneAt)) return { ...base, done: true, at: new Date(doneAt).toISOString(), daysLate: daysLate(expected, doneAt) };
  return { ...base, done: false, at: null, daysLate: daysLate(expected, now) };
};

// The dispatch date In Transit planned with the patient and when it actually left (self pickup: the pickup date and
// when it was collected), for `medicineDelays`.
const dispatchDelayInput = ({ stage = null, request = null } = {}) => {
  const t = stage?.transit || {};
  const courier = request?.courier || {};
  if (t.fulfilmentMode === 'pickup') return { dispatchExpected: t.pickupScheduledAt, dispatchedAt: courier.status === 'delivered' ? courier.deliveredAt : null, dispatchLabel: 'Self pickup' };
  return { dispatchExpected: t.dispatchScheduledAt, dispatchedAt: ['dispatched', 'delivered'].includes(courier.status) ? courier.dispatchedAt : null, dispatchLabel: t.fulfilmentMode === 'porter' ? 'Porter dispatch' : 'Courier dispatch' };
};

// Delays for a medicine request: when it was made, when it reached In Transit, and when it was dispatched.
const medicineDelays = ({ expected, madeAt = null, releasedAt = null, dispatchExpected = null, dispatchedAt = null, dispatchLabel = 'Courier dispatch', now = new Date() } = {}) => {
  if (!validDate(expected) && !validDate(dispatchExpected)) return null;
  return {
    expectedDate: validDate(expected) ? new Date(expected).toISOString() : null,
    medicine: stepDelay(expected, madeAt, now),
    transit: stepDelay(expected, releasedAt, now),
    dispatch: stepDelay(dispatchExpected, dispatchedAt, now),
    dispatchLabel,
  };
};

// The supply and age group post counselling sent for a purchase order: from the PO itself, else from its PO paper
// (or the paper kept on the phase). Empty when post counselling never sent one (older, hand-made requests).
const fixedSupplyPlan = ({ po = null, stage = null } = {}) => {
  const { supplyOptionByLabel, ageBandByLabel } = require('../constants/supplyPlans');
  const paper = po?.paperValues || stage?.poPaper?.values || {};
  const supply = po?.supplyPlan && po?.supplyPart ? { plan: po.supplyPlan, part: po.supplyPart } : supplyOptionByLabel(paper.supplyOrder);
  return { plan: supply?.plan || '', part: supply?.part || '', ageBand: po?.ageBand || ageBandByLabel(paper.ageGroup) || '' };
};

module.exports = { daysLate, paperDate, readyDateFromPostCounselling, fixedReadyDate, fixedSupplyPlan, canOverrideFixed, medicineDelays, dispatchDelayInput };
