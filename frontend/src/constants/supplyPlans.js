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
  { key: 'handover', label: 'Handover', hint: 'Dispatch / pickup' },
  { key: 'treatment', label: 'Medicine explanation', hint: 'PCC explains, then treatment starts' },
  { key: 'started', label: 'Treatment started', hint: 'Treatment active' },
  { key: 'rejected', label: 'Rejected', hint: 'Needs correction' },
];
