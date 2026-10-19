// Purchase order / payment record (paper page 3, sections F, G and H) filled after the post-counselling record.
// The approved program fee comes from the post-counselling record (section E); everything here is fixed in code.
const MODES = ['Cash', 'Online', 'Card (+3%)', 'EMI', 'Other'];
const PLANS = ['Full', '2 Parts', '3 Parts', 'Other Approved'];
const EMI_STATUSES = ['Approved', 'Pending', 'Declined'];
const CARD_RATE = 0.03;
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

// type: text | money | date | time | single | check | bank (an active bank account id) | files (uploaded payment screenshots)
const SECTION_F = [
  { key: 'mode', label: 'Mode', type: 'single', options: MODES },
  { key: 'amountReceivedNow', label: 'Amount received now (Rs)', type: 'money' },
  { key: 'utrReference', label: 'UTR / payment / tracking reference', type: 'text', hideFor: ['Cash'] },
  { key: 'transactionId', label: 'Transaction ID', type: 'text', hideFor: ['Cash'] },
  { key: 'payToBank', label: 'Paid to bank', type: 'bank', hideFor: ['Cash'] },
  { key: 'screenshots', label: 'Payment screenshots', type: 'files', hideFor: ['Cash'], wide: true },
  { key: 'cashHandedTo', label: 'Cash handed to', type: 'text', onlyFor: ['Cash'] },
  { key: 'cashReceiver', label: 'Cash receiver / signature', type: 'text', onlyFor: ['Cash'] },
  { key: 'paymentDate', label: 'Payment date', type: 'date' },
  { key: 'paymentTime', label: 'Time', type: 'time' },
  { key: 'paymentVerifiedBy', label: 'Payment verified by', type: 'text' },
  { key: 'paymentNotes', label: 'Payment notes', type: 'text', wide: true },
  { key: 'plan', label: 'Approved plan', type: 'single', options: PLANS },
  { key: 'part1Amount', label: 'Part 1 (Rs)', type: 'money' }, { key: 'part1Due', label: 'Part 1 due', type: 'text' },
  { key: 'part2Amount', label: 'Part 2 (Rs)', type: 'money' }, { key: 'part2Due', label: 'Part 2 due', type: 'text' },
  { key: 'part3Amount', label: 'Part 3 (Rs)', type: 'money' }, { key: 'part3Due', label: 'Part 3 due', type: 'text' },
];
const SECTION_G = [
  { key: 'emiProvider', label: 'Bank / EMI card / provider', type: 'text' },
  { key: 'emiTxnRef', label: 'Application / Txn ref', type: 'text' },
  { key: 'emiApprovedAmount', label: 'Approved amount (Rs)', type: 'money' },
  { key: 'emiTenure', label: 'Tenure', type: 'text' },
  { key: 'emiPerMonth', label: 'EMI / month (Rs)', type: 'money' },
  { key: 'emiStatus', label: 'Status', type: 'single', options: EMI_STATUSES },
  { key: 'emiVerifiedBy', label: 'Verified by', type: 'text' },
  { key: 'emiApprovalDate', label: 'Approval date', type: 'date' },
  { key: 'emiNote', label: 'EMI note', type: 'text', wide: true },
];
const SECTION_H = [
  { key: 'poNo', label: 'PO No.', type: 'text' },
  { key: 'poDate', label: 'PO date', type: 'date' },
  { key: 'orderedTreatment', label: 'Ordered treatment / phase', type: 'text', wide: true },
  { key: 'formulationRef', label: 'Customized formulation / medicine order ref.', type: 'text', wide: true },
  { key: 'guardianName', label: 'Patient / guardian name', type: 'text' },
  { key: 'relationship', label: 'Relationship', type: 'text' },
  { key: 'guardianMobile', label: 'Mobile', type: 'text' },
  { key: 'consentTaken', label: 'Consent and signature taken', type: 'check' },
  { key: 'counsellorWitness', label: 'Counsellor / witness', type: 'text' },
  { key: 'consentDate', label: 'Consent date', type: 'date' },
];
const ALL_FIELDS = [...SECTION_F, ...SECTION_G, ...SECTION_H];

const text = (value, max = 200) => String(value ?? '').trim().slice(0, max);
const fail = (message) => Object.assign(new Error(message), { statusCode: 400 });
const money = (value, label) => {
  const raw = String(value ?? '').replace(/,/g, '').trim();
  if (raw === '') return '';
  const amount = Number(raw);
  if (!Number.isFinite(amount) || amount < 0 || amount > 100000000 || Math.abs(amount * 100 - Math.round(amount * 100)) > 1e-6) throw fail(`Enter a valid amount for ${label}`);
  return amount;
};

// Worked out here, never trusted from the browser.
const totals = (values, approvedFee) => {
  const fee = Number(approvedFee || 0);
  const received = Number(values.amountReceivedNow || 0);
  return {
    approvedProgramFee: fee,
    cardCharge: values.mode === 'Card (+3%)' ? Math.round(received * CARD_RATE * 100) / 100 : 0,
    outstandingBalance: Math.max(fee - received, 0),
    poValue: fee,
    partPayment: received,
  };
};

// First values shown when the form is opened: what is already known from the registration and the record.
const defaults = ({ record, registration, counselorName, today }) => {
  const e = record?.e || {};
  const emi = e.paymentPlan === 'EMI';
  const categoryLabel = registration?.category === 'mental_health' ? 'Mental Health' : 'Autism / ADHD';
  const base = Object.fromEntries(ALL_FIELDS.map((field) => [field.key, field.type === 'check' ? false : field.type === 'files' ? [] : '']));
  return {
    ...base,
    mode: emi ? 'EMI' : '',
    plan: PLANS.includes(e.paymentPlan) ? e.paymentPlan : '',
    part1Amount: e.part1Amount ?? '', part1Due: e.part1Due || '',
    part2Amount: e.part2Amount ?? '', part2Due: e.part2Due || '',
    part3Amount: e.part3Amount ?? '', part3Due: e.part3Due || '',
    poDate: today, consentDate: today, paymentDate: today,
    orderedTreatment: `${categoryLabel} / Phase 1`,
    guardianName: registration?.fatherName || registration?.motherName || '',
    guardianMobile: registration?.fatherNumber || registration?.motherNumber || '',
    counsellorWitness: counselorName || '',
  };
};

const cleanPurchase = (raw = {}, approvedFee) => {
  const values = {};
  for (const field of ALL_FIELDS) {
    const value = raw?.[field.key];
    if (field.type === 'check') values[field.key] = value === true || value === 'true';
    else if (field.type === 'single') values[field.key] = field.options.includes(value) ? value : '';
    else if (field.type === 'money') values[field.key] = money(value, field.label);
    else if (field.type === 'bank') {
      const id = text(value, 24);
      if (id && !/^[a-f0-9]{24}$/i.test(id)) throw fail('Select a valid bank');
      values[field.key] = id;
    } else if (field.type === 'files') {
      values[field.key] = (Array.isArray(value) ? value : [])
        .filter((file) => /^\/uploads\/payments\/[A-Za-z0-9._-]+$/.test(String(file?.url || '')))
        .slice(0, 10)
        .map((file) => ({ url: String(file.url), fileName: text(file.fileName || 'Payment screenshot', 255) }));
    }
    else if (field.type === 'date') {
      const v = text(value, 10);
      if (v && !/^\d{4}-\d{2}-\d{2}$/.test(v)) throw fail(`Enter a valid date for ${field.label}`);
      values[field.key] = v;
    } else if (field.type === 'time') {
      const v = text(value, 5);
      if (v && !TIME_PATTERN.test(v)) throw fail('Enter a valid time');
      values[field.key] = v;
    } else values[field.key] = text(value, field.wide ? 500 : 200);
  }
  if (values.mode === 'Cash') { values.utrReference = ''; values.transactionId = ''; values.payToBank = ''; values.screenshots = []; }
  else { values.cashHandedTo = ''; values.cashReceiver = ''; }
  if (Number(values.amountReceivedNow || 0) > Number(approvedFee || 0)) throw fail('The amount received cannot be more than the approved program fee');
  return { values, totals: totals(values, approvedFee) };
};

const definitions = () => ({ sectionF: SECTION_F, sectionG: SECTION_G, sectionH: SECTION_H, cardRate: CARD_RATE });

module.exports = { MODES, PLANS, EMI_STATUSES, ALL_FIELDS, totals, defaults, cleanPurchase, definitions };
