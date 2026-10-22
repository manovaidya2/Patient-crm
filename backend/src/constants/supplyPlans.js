// How the six months of medicine on one purchase order are supplied (Formulation Master: 6 / 1+5 / 2+4).
// A plan is split into parts; each purchase order (and its medicine request) is for exactly one part.
const SUPPLY_PLANS = {
  '6M': { label: '6 months together', parts: { full: { label: 'Full 6 months', months: 6 } } },
  '1+5': { label: '1 + 5 months', parts: { first: { label: 'First 1 month', months: 1 }, rest: { label: 'Next 5 months', months: 5 } } },
  '2+4': { label: '2 + 4 months', parts: { first: { label: 'First 2 months', months: 2 }, rest: { label: 'Next 4 months', months: 4 } } },
};

// Flat list for pickers: one entry per plan + part.
const SUPPLY_OPTIONS = Object.entries(SUPPLY_PLANS).flatMap(([plan, def]) => Object.entries(def.parts).map(([part, p]) => ({
  key: `${plan}:${part}`, plan, part, months: p.months, days: p.months * 30,
  label: plan === '6M' ? 'Full 6 months' : `${plan}: ${p.label}`,
})));

// Age bands of the Formulation Master and Chit Book.
const AGE_BANDS = {
  '3-4': '3-4 years',
  '4-12': 'Above 4 - 12 years',
  '12-70': 'Above 12 - 70 years',
  '70+': 'Above 70 years',
};

const supplyOption = (plan, part) => SUPPLY_OPTIONS.find((o) => o.plan === plan && o.part === part) || null;
const supplyOptionByLabel = (label) => SUPPLY_OPTIONS.find((o) => o.label === label) || null;
const supplyLabel = (plan, part) => supplyOption(plan, part)?.label || '';

// "7", "7 years", "7 y 4 m", "3.5" -> age band. Exactly 4 / 12 / 70 belong to the lower band ("above 4" starts after 4).
const ageBandFor = (age) => {
  const match = String(age ?? '').match(/\d+(\.\d+)?/);
  if (!match) return '';
  const years = Number(match[0]);
  if (years < 3) return '';
  if (years <= 4) return '3-4';
  if (years <= 12) return '4-12';
  if (years <= 70) return '12-70';
  return '70+';
};

module.exports = { SUPPLY_PLANS, SUPPLY_OPTIONS, AGE_BANDS, supplyOption, supplyOptionByLabel, supplyLabel, ageBandFor };
