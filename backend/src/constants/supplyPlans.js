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

// Age bands of the Formulation Master and Chit Book. 0-3 years has no master: the formulation is made for each child
// (Medicine Department with the doctor) when the request comes.
const AGE_BANDS = {
  '0-3': '0 - 3 years',
  '3-4': '3-4 years',
  '4-12': 'Above 4 - 12 years',
  '12-70': 'Above 12 - 70 years',
  '70+': 'Above 70 years',
};

// A length of medicine in days, as people say it: "6 months", "20 days", "1 month 15 days" (a month is 30 days).
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
const lengthText = (days) => {
  const n = Math.round(Number(days) || 0);
  if (n <= 0) return '';
  if (n % 30 === 0) return plural(n / 30, 'month');
  return n < 30 ? plural(n, 'day') : `${plural(Math.floor(n / 30), 'month')} ${plural(n % 30, 'day')}`;
};

// Custom supply: the Post Counselor chooses its length in months and days (a Mental Health package can be 45 days),
// at most 12 months in all. It is stored as plan "C<months>" (whole months, as before) or "C<months>m<days>d"
// ("C1m15d", "C0m45d") with part "full", so it travels through every PO, request and job like the fixed plans. It has
// no Formulation Master: the Medicine Department makes this patient's formulation at the formulation check (same way
// as 0-3 years).
const CUSTOM_MAX_DAYS = 360;
const CUSTOM_PICK_LABEL = 'Custom (months / days)';
// Papers saved before days could be chosen still say "Custom (choose months)".
const isCustomPick = (label) => label === CUSTOM_PICK_LABEL || label === 'Custom (choose months)';
const customPlanOf = (months, days = 0) => (days ? `C${months}m${days}d` : `C${months}`);
const customLengthOk = (months, days) => Number.isInteger(months) && Number.isInteger(days) && months >= 0 && months <= 12 && days >= 0
  && months * 30 + days >= 1 && months * 30 + days <= CUSTOM_MAX_DAYS;
// { months, days, total } of a custom plan ("C1m15d" -> 1, 15, 45), else null. Only the written form is valid.
const customLength = (plan) => {
  const m = /^C(\d{1,2})(?:m(\d{1,3})d)?$/.exec(String(plan || ''));
  if (!m) return null;
  const months = Number(m[1]);
  const days = Number(m[2] || 0);
  if (!customLengthOk(months, days) || customPlanOf(months, days) !== plan) return null;
  return { months, days, total: months * 30 + days };
};
const customDays = (plan) => customLength(plan)?.total || 0;
// The whole months of a custom plan (0 for a fixed plan; a plan of days only, "C0m45d", has 0 too: see customDays).
const customMonths = (plan) => customLength(plan)?.months || 0;
const isCustomPlan = (plan) => Boolean(customLength(plan));
const customLabel = (months, days = 0) => `Custom: ${[months ? plural(months, 'month') : '', days ? plural(days, 'day') : ''].filter(Boolean).join(' ')}`;
// `months` is the length in months (45 days -> 1.5); `days` the whole length; customMonths / customDays as typed.
const customOption = (months, days = 0) => {
  const plan = customPlanOf(months, days);
  const total = months * 30 + days;
  return { key: `${plan}:full`, plan, part: 'full', months: total / 30, days: total, label: customLabel(months, days), custom: true, customMonths: months, customDays: days };
};
const isValidPlan = (plan) => plan === '' || plan == null || Boolean(SUPPLY_PLANS[plan]) || isCustomPlan(plan);

const supplyOption = (plan, part) => {
  const custom = customLength(plan);
  if (custom && (!part || part === 'full')) return customOption(custom.months, custom.days);
  return SUPPLY_OPTIONS.find((o) => o.plan === plan && o.part === part) || null;
};
const supplyOptionByLabel = (label) => {
  const m = /^Custom: (?:(\d{1,2}) months?)? ?(?:(\d{1,3}) days?)?$/i.exec(String(label || '').trim());
  if (m && (m[1] || m[2])) {
    const months = Number(m[1] || 0);
    const days = Number(m[2] || 0);
    return customLengthOk(months, days) ? customOption(months, days) : null;
  }
  return SUPPLY_OPTIONS.find((o) => o.label === label) || null;
};
const supplyLabel = (plan, part) => supplyOption(plan, part)?.label || '';

// "7", "7 years", "7 y 4 m", "3.5", "8 months" -> age band. Exactly 4 / 12 / 70 belong to the lower band ("above 4"
// starts after 4); under 3 years is 0-3.
const ageBandFor = (age) => {
  const text = String(age ?? '');
  const match = text.match(/\d+(\.\d+)?/);
  if (!match) return '';
  const onlyMonths = /month|mahin|महीन/i.test(text) && !/year|yr|saal|साल|\dy\b|\d\s*y\b/i.test(text);
  const years = onlyMonths ? Number(match[0]) / 12 : Number(match[0]);
  if (years < 3) return '0-3';
  if (years <= 4) return '3-4';
  if (years <= 12) return '4-12';
  if (years <= 70) return '12-70';
  return '70+';
};

// The PO paper keeps the age group as its label ("Above 4 - 12 years").
const ageBandByLabel = (label) => Object.keys(AGE_BANDS).find((key) => AGE_BANDS[key] === label) || '';

module.exports = {
  SUPPLY_PLANS, SUPPLY_OPTIONS, AGE_BANDS, CUSTOM_PICK_LABEL, CUSTOM_MAX_DAYS, isCustomPick, customLengthOk, customLength, customDays, customMonths, isCustomPlan,
  customOption, isValidPlan, supplyOption, supplyOptionByLabel, supplyLabel, lengthText, ageBandFor, ageBandByLabel,
};
