// Purchase order / payment record (paper page 3, sections F, G and H) filled after the post-counselling record.
// The approved program fee comes from the post-counselling record (section E); everything here is fixed in code.
const { SUPPLY_OPTIONS } = require('../constants/supplyPlans');
const { applyParts } = require('./paymentParts');

const MODES = ['Cash', 'Online', 'Card (+3%)', 'EMI', 'Other'];
const PLANS = ['Full', '2 Parts', '3 Parts', 'Other Approved'];
const EMI_STATUSES = ['Approved', 'Pending', 'Declined'];
const CARD_RATE = 0.03;
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

// type: text | money | date | time | single | check | bank (an active bank account id) | files (uploaded payment screenshots)
//       due (worked out: balance left after that part) | dueNote (text from an old free-text due box, kept read-only)
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
  { key: 'part1Amount', label: 'Part 1 (Rs)', type: 'money' }, { key: 'part1Due', label: 'Due after Part 1', type: 'due' },
  { key: 'part2Amount', label: 'Part 2 (Rs)', type: 'money' }, { key: 'part2Due', label: 'Due after Part 2', type: 'due' },
  { key: 'part3Amount', label: 'Part 3 (Rs)', type: 'money' }, { key: 'part3Due', label: 'Due after Part 3', type: 'due' },
  { key: 'part1DueNote', label: 'Part 1 due (earlier note)', type: 'dueNote' },
  { key: 'part2DueNote', label: 'Part 2 due (earlier note)', type: 'dueNote' },
  { key: 'part3DueNote', label: 'Part 3 due (earlier note)', type: 'dueNote' },
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
  { key: 'paperImages', label: 'PO paper (image)', type: 'files', wide: true },
  // Generated on conversion (PO-1234); shown read-only on the paper.
  { key: 'poNo', label: 'PO No.', type: 'auto' },
  { key: 'supplyOrder', label: 'Medicine supply on this PO', type: 'single', options: SUPPLY_OPTIONS.map((option) => option.label), wide: true },
  { key: 'poDate', label: 'PO date', type: 'date' },
  { key: 'orderedTreatment', label: 'Ordered treatment / phase', type: 'text', wide: true },
  { key: 'formulationRef', label: 'Customized formulation / medicine order ref.', type: 'text', wide: true },
  { key: 'medicineReadyDate', label: 'Medicine ready expected date', type: 'date' },
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

// The approved plan and its parts belong to the post-counselling record (section E); the PO paper of a
// post-counselling patient always shows them from there (dues worked out again), so the two never disagree.
const planFromRecord = (record) => {
  const e = record?.e || {};
  const fee = record?.totals?.approvedProgramFee || 0;
  const parts = applyParts({ part1Amount: e.part1Amount ?? '', part2Amount: e.part2Amount ?? '', part3Amount: e.part3Amount ?? '' }, e, fee);
  return { plan: PLANS.includes(e.paymentPlan) ? e.paymentPlan : '', ...parts };
};

// First payment taken now: Part 1 of the plan, or the whole fee on a "Full" plan.
const firstPayment = (record) => {
  const e = record?.e || {};
  if (e.part1Amount !== '' && e.part1Amount !== undefined && e.part1Amount !== null) return e.part1Amount;
  if (e.paymentPlan === 'Full') return record?.totals?.approvedProgramFee ?? '';
  return '';
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
    ...planFromRecord(record),
    amountReceivedNow: firstPayment(record),
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
    else if (field.type === 'due' || field.type === 'dueNote') continue; // worked out after the loop
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
  applyParts(values, raw, approvedFee);
  return { values, totals: totals(values, approvedFee) };
};

const definitions = () => ({ sectionF: SECTION_F, sectionG: SECTION_G, sectionH: SECTION_H, cardRate: CARD_RATE });
// Keys of the PO paper that come from the post-counselling record and are not typed on the paper.
const RECORD_PLAN_KEYS = ['plan', 'part1Amount', 'part2Amount', 'part3Amount', 'part1Due', 'part2Due', 'part3Due', 'part1DueNote', 'part2DueNote', 'part3DueNote'];

// A saved PO paper as Patient Details shows it: the paper image(s) and the main PO details only. The amounts (PO value,
// paid, outstanding) are not copied here: the page works them out from the phase's own payments, so they stay current.
const PO_DETAIL_KEYS = ['poNo', 'poDate', 'orderedTreatment', 'supplyOrder', 'medicineReadyDate', 'formulationRef'];
const describePoPaper = (poPaper) => {
  if (!poPaper?.values) return null;
  const values = poPaper.values;
  const details = SECTION_H.filter((field) => PO_DETAIL_KEYS.includes(field.key))
    .filter((field) => values[field.key] !== '' && values[field.key] !== undefined && values[field.key] !== null)
    .map((field) => ({ label: field.label, value: String(values[field.key]) }));
  return {
    poNo: values.poNo || '', details,
    images: Array.isArray(values.paperImages) ? values.paperImages : [],
    savedAt: poPaper.savedAt || null, savedByName: poPaper.savedByName || '', source: poPaper.source || '',
  };
};

module.exports = { describePoPaper, MODES, PLANS, EMI_STATUSES, ALL_FIELDS, totals, defaults, cleanPurchase, definitions, planFromRecord, firstPayment, RECORD_PLAN_KEYS };
