// The medicine ready date and the supply (6 months / 1+5 / 2+4) are decided in post counselling on the PO paper.
// In Transit and the Medicine Department work to that date and supply and cannot change them (only the admin can).
// Delays are counted against that same date:
//   Medicine Department: the day the medicine was made (final check)      vs the expected date
//   In Transit:          the day the medicine was released to In Transit  vs the expected date
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
const stepDelay = (expected, doneAt, now) => {
  if (!validDate(expected)) return null;
  if (validDate(doneAt)) return { done: true, at: new Date(doneAt).toISOString(), daysLate: daysLate(expected, doneAt) };
  return { done: false, at: null, daysLate: daysLate(expected, now) };
};

// Delays for a medicine request: when it was made, and when it reached In Transit.
const medicineDelays = ({ expected, madeAt = null, releasedAt = null, now = new Date() } = {}) => {
  if (!validDate(expected)) return null;
  return {
    expectedDate: new Date(expected).toISOString(),
    medicine: stepDelay(expected, madeAt, now),
    transit: stepDelay(expected, releasedAt, now),
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

module.exports = { daysLate, paperDate, readyDateFromPostCounselling, fixedReadyDate, fixedSupplyPlan, canOverrideFixed, medicineDelays };
