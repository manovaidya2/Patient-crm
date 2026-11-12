// Mirrors backend/src/constants/supplyPlans.js (Formulation Master: 6 / 1+5 / 2+4 months).
export const SUPPLY_OPTIONS = [
  { key: '6M:full', plan: '6M', part: 'full', months: 6, label: 'Full 6 months', hint: '6 months together' },
  { key: '1+5:first', plan: '1+5', part: 'first', months: 1, label: '1+5: First 1 month', hint: 'First supply of a 1 + 5 plan' },
  { key: '1+5:rest', plan: '1+5', part: 'rest', months: 5, label: '1+5: Next 5 months', hint: 'Second supply of a 1 + 5 plan' },
  { key: '2+4:first', plan: '2+4', part: 'first', months: 2, label: '2+4: First 2 months', hint: 'First supply of a 2 + 4 plan' },
  { key: '2+4:rest', plan: '2+4', part: 'rest', months: 4, label: '2+4: Next 4 months', hint: 'Second supply of a 2 + 4 plan' },
];

// 0-3 years has no Formulation Master: its formulation is made for each child when the request comes.
export const AGE_BANDS = [
  { value: '0-3', label: '0 - 3 years' },
  { value: '3-4', label: '3-4 years' },
  { value: '4-12', label: 'Above 4 - 12 years' },
  { value: '12-70', label: 'Above 12 - 70 years' },
  { value: '70+', label: 'Above 70 years' },
];

export const supplyKeyOf = (plan, part) => (plan && part ? `${plan}:${part}` : '');
// A length of medicine in days, as people say it: "6 months", "20 days", "1 month 15 days" (a month is 30 days).
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
export const lengthText = (days) => {
  const n = Math.round(Number(days) || 0);
  if (n <= 0) return '';
  if (n % 30 === 0) return plural(n / 30, 'month');
  return n < 30 ? plural(n, 'day') : `${plural(Math.floor(n / 30), 'month')} ${plural(n % 30, 'day')}`;
};
// Custom supply (months and days chosen by the Post Counselor, at most 12 months in all): plan "C<months>" or
// "C<months>m<days>d" ("C0m45d" = 45 days), part "full" - see backend supplyPlans.js.
export const CUSTOM_PICK_LABEL = 'Custom (months / days)';
export const CUSTOM_MAX_DAYS = 360;
export const customLengthOk = (months, days) => Number.isInteger(months) && Number.isInteger(days) && months >= 0 && months <= 12 && days >= 0
  && months * 30 + days >= 1 && months * 30 + days <= CUSTOM_MAX_DAYS;
export const customKey = (months, days = 0) => `${days ? `C${months}m${days}d` : `C${months}`}:full`;
// { months, days, total } of a custom key or plan, else null.
export const customLengthOf = (keyOrPlan) => {
  const m = /^C(\d{1,2})(?:m(\d{1,3})d)?(?::full)?$/.exec(String(keyOrPlan || ''));
  if (!m) return null;
  const months = Number(m[1]);
  const days = Number(m[2] || 0);
  if (!customLengthOk(months, days) || (m[2] !== undefined && !days) || (m[1].length > 1 && m[1][0] === '0')) return null;
  return { months, days, total: months * 30 + days };
};
// As the Post Counselor chose it: "4 months", "45 days", "1 month 15 days".
export const customText = (length) => (length ? [length.months ? plural(length.months, 'month') : '', length.days ? plural(length.days, 'day') : ''].filter(Boolean).join(' ') : '');
export const isCustomSupplyLabel = (label) => /^Custom(:| \()/.test(String(label || ''));
export const ageBandLabel = (value) => AGE_BANDS.find((band) => band.value === value)?.label || '';
// Same rule as the backend: the dose age group from an age like "6", "4.5" or "13 years".
export const ageBandFor = (age) => {
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

export const PO_STATUS = {
  pending: { label: 'Waiting for verification', tone: 'amber' },
  verified: { label: 'Verified', tone: 'teal' },
  rejected: { label: 'Rejected', tone: 'danger' },
  cancelled: { label: 'Cancelled', tone: 'inactive' },
};

// Purchase Orders page filters, in pipeline order (matches backend STAGE_KEYS).
export const PO_STAGES = [
  { key: 'verification', label: 'To verify', hint: 'PO paper & payment' },
  { key: 'request', label: 'Request medicine', hint: 'Verified, not requested' },
  { key: 'medicine', label: 'With Medicine Dept', hint: 'Accepted, preparing, ready' },
  { key: 'schedule', label: 'Delivery schedule pending', hint: 'Fix pickup / dispatch & explanation date' },
  { key: 'handover', label: 'Handover', hint: 'Dispatch / pickup' },
  { key: 'treatment', label: 'Medicine explanation', hint: 'PCC explains, then treatment starts' },
  { key: 'started', label: 'Treatment started', hint: 'Treatment active' },
  { key: 'rejected', label: 'Rejected', hint: 'Needs correction' },
];
