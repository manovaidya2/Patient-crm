// Post-counselling record (the paper "Post-Counselling Record"): guided questions, decision readiness, the
// customised treatment components with their prices, and the program value / payment structure.
// Everything is fixed here; the form on the Post Counseling page is drawn from these definitions.
const SECTION_A = [
  { key: 'concernIdentified', label: 'When was the concern first identified?', options: ['Recently', '<1 year', '1-3 years', '>3 years'] },
  { key: 'journey', label: 'How has the journey felt so far?', options: ['Confusing', 'Stressful', 'Exhausting', 'Hopeful', 'Mixed'] },
  { key: 'triedAlready', label: 'What have you tried already?', options: ['Therapy', 'Medication', 'Ayurveda', 'Home plans'] },
  { key: 'stillMissing', label: 'What result was still missing?', options: ['Speech', 'Behaviour', 'Attention', 'Independence'] },
  { key: 'expecting', label: 'What are you expecting now?', options: ['Communication', 'Behaviour', 'Learning', 'Routine'] },
  { key: 'lackingSupport', label: 'What is lacking in current support?', options: ['Monitoring', 'Customization', 'Family guidance', 'Continuity'] },
  { key: 'relevantInManovaidya', label: 'What feels relevant in Manovaidya?', options: ['Doctor-led', 'Integrated care', 'Monitoring', 'Support'] },
  { key: 'whyNow', label: 'Why consider treatment now?', options: ['Plateau', 'School impact', 'Daily difficulty', 'Family stress'] },
  { key: 'ifNothingChanges', label: 'If nothing changes in 6 months?', options: ['Delay', 'Dependence', 'School issues', 'Family strain'] },
  { key: 'startWhen', label: 'When would you consider starting?', options: ['Today', 'After discussion', 'After finances', 'Later'] },
];

// type: text | date | single (one choice) | check (tick box)
const SECTION_B = [
  { key: 'strength', label: 'Genuine strength / positive effort', type: 'text', wide: true },
  { key: 'decisionMaker', label: 'Decision maker', type: 'single', options: ['Available', 'Not available'] },
  { key: 'decisionMakerWho', label: 'Who', type: 'text' },
  { key: 'currentStage', label: 'Current stage', type: 'single', options: ['Ready', 'Need discussion', 'Exploring', 'Not ready'] },
  { key: 'planExplained', label: 'Plan explained', type: 'check' },
  { key: 'durationExplained', label: 'Duration explained', type: 'check' },
  { key: 'valuesExplained', label: 'Reference values explained', type: 'check' },
  { key: 'decisionDate', label: 'Decision date', type: 'date' },
  { key: 'decision', label: 'Decision', type: 'single', options: ['Proceeding', 'Need Time', 'Not Proceeding'] },
  { key: 'pendingConcern', label: 'Pending concern / Next action', type: 'text', wide: true },
  { key: 'nextActionDue', label: 'Due', type: 'date' },
];

// price: null = filled in at post-counselling time (Customized Ayurvedic Formulations), 0 = no charge.
const COMPONENTS = [
  { key: 'dosDontsDiet', label: "Do's & Don'ts + Diet Plan Guidance", price: 18000 },
  { key: 'ayurvedicFormulations', label: 'Customized Ayurvedic Formulations', price: null },
  { key: 'panchakarmaKit', label: 'Panchakarma / Home Support Kit', price: 18000 },
  { key: 'medicalHandHolding', label: 'Medical Counselling Team Hand-Holding', price: 24000 },
  { key: 'progressTracking', label: 'Progress & Monitoring Tracking', price: 12000 },
  { key: 'sensoryGuidance', label: 'Sensory / Neurotouch Therapy Guidance', price: 10000 },
  { key: 'homeTherapyPlan', label: 'Customized Home Therapy Plan', price: 18000 },
  { key: 'behaviourRoutinePlan', label: 'Behaviour / Routine Development Plan', price: 15000 },
  { key: 'familyCounselling', label: 'Family Counselling Sessions', price: 18000 },
  { key: 'regularFollowUps', label: 'Regular Follow-ups', price: 30000 },
  { key: 'parentTraining', label: 'Parent Training / Home Implementation', price: 12000 },
  { key: 'functionalSkills', label: 'Functional Skills / Independence Plan', price: 15000 },
  { key: 'querySupport', label: 'Multiple Query Support & Resolution', price: 0 },
];
const CUSTOM_PRICE_KEY = 'ayurvedicFormulations';

const PAYMENT_PLANS = ['Full', '2 Parts', '3 Parts', 'Other Approved', 'EMI'];

const MAX_MONEY = 100000000;
const text = (value, max = 1000) => String(value ?? '').trim().slice(0, max);
const fail = (message) => Object.assign(new Error(message), { statusCode: 400 });
const money = (value, label) => {
  const raw = String(value ?? '').replace(/,/g, '').trim();
  if (raw === '') return '';
  const amount = Number(raw);
  if (!Number.isFinite(amount) || amount < 0 || amount > MAX_MONEY || Math.abs(amount * 100 - Math.round(amount * 100)) > 1e-6) throw fail(`Enter a valid amount for ${label}`);
  return amount;
};
const dateText = (value, label) => {
  const raw = String(value ?? '').trim();
  if (raw && !/^\d{4}-\d{2}-\d{2}$/.test(raw)) throw fail(`Enter a valid date for ${label}`);
  return raw;
};
const pickOne = (value, options) => (options.includes(value) ? value : '');
const pickMany = (values, options) => (Array.isArray(values) ? options.filter((option) => values.includes(option)) : []);

// The money side, always worked out here so the saved totals can never disagree with the selection.
const totals = ({ selected, ayurvedicPrice, concession }) => {
  const reference = COMPONENTS.reduce((sum, component) => {
    if (!selected.includes(component.key)) return sum;
    return sum + (component.key === CUSTOM_PRICE_KEY ? Number(ayurvedicPrice || 0) : Number(component.price || 0));
  }, 0);
  const adjustment = Number(concession || 0);
  return { referenceValue: reference, programFeeBeforeConcession: reference, approvedProgramFee: Math.max(reference - adjustment, 0) };
};

const emptyRecord = () => ({
  a: Object.fromEntries(SECTION_A.map((question) => [question.key, { choices: [], note: '' }])),
  b: Object.fromEntries(SECTION_B.map((field) => [field.key, field.type === 'check' ? false : ''])),
  components: { selected: [], ayurvedicPrice: '' },
  otherComponent: '',
  e: { concession: '', paymentPlan: '', part1Amount: '', part1Due: '', part2Amount: '', part2Due: '', part3Amount: '', part3Due: '', otherPlan: '' },
  totals: totals({ selected: [], ayurvedicPrice: '', concession: '' }),
});

// Cleans what the browser sent into a record we are willing to store. Unknown keys are dropped.
const cleanRecord = (raw = {}) => {
  const record = emptyRecord();
  for (const question of SECTION_A) {
    const entry = raw?.a?.[question.key] || {};
    record.a[question.key] = { choices: pickMany(entry.choices, question.options), note: text(entry.note) };
  }
  for (const field of SECTION_B) {
    const value = raw?.b?.[field.key];
    if (field.type === 'check') record.b[field.key] = value === true || value === 'true';
    else if (field.type === 'single') record.b[field.key] = pickOne(value, field.options);
    else if (field.type === 'date') record.b[field.key] = dateText(value, field.label);
    else record.b[field.key] = text(value, field.wide ? 1000 : 200);
  }
  const selected = COMPONENTS.map((component) => component.key).filter((key) => (raw?.components?.selected || []).includes(key));
  const ayurvedicPrice = selected.includes(CUSTOM_PRICE_KEY) ? money(raw?.components?.ayurvedicPrice, 'Customized Ayurvedic Formulations') : '';
  if (selected.includes(CUSTOM_PRICE_KEY) && ayurvedicPrice === '') throw fail('Enter the price of Customized Ayurvedic Formulations');
  record.components = { selected, ayurvedicPrice };
  record.otherComponent = text(raw?.otherComponent, 300);
  const e = raw?.e || {};
  record.e = {
    concession: money(e.concession, 'Approved concession / adjustment'),
    paymentPlan: pickOne(e.paymentPlan, PAYMENT_PLANS),
    part1Amount: money(e.part1Amount, 'Part 1'), part1Due: text(e.part1Due, 100),
    part2Amount: money(e.part2Amount, 'Part 2'), part2Due: text(e.part2Due, 100),
    part3Amount: money(e.part3Amount, 'Part 3'), part3Due: text(e.part3Due, 100),
    otherPlan: text(e.otherPlan, 500),
  };
  record.totals = totals({ selected, ayurvedicPrice, concession: record.e.concession });
  if (Number(record.e.concession || 0) > record.totals.referenceValue) throw fail('The concession cannot be more than the selected components value');
  return record;
};

const definitions = () => ({
  sectionA: SECTION_A, sectionB: SECTION_B, components: COMPONENTS, customPriceKey: CUSTOM_PRICE_KEY, paymentPlans: PAYMENT_PLANS,
});

module.exports = { SECTION_A, SECTION_B, COMPONENTS, CUSTOM_PRICE_KEY, PAYMENT_PLANS, emptyRecord, cleanRecord, totals, definitions };
