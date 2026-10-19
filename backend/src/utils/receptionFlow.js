// Reception -> Post Counselor flow: ids of the existing "Reception details" values it reads and writes
// (so everything already saved keeps working), patient-id generation and the registration form fields.
const { PROFILE_FIELDS, cleanProfileValue } = require('./patientProfile');

const SALES_IDS = {
  patientName: '6ab7b2adbf916b34dfd9f5f7',
  age: '6ab7b2b6bf916b34dfd9f609',
  gender: '6ab7b2e2bf916b34dfd9f643',
  guardianName: '6ab7b2fdbf916b34dfd9f66b',
  relationship: '6ab7b310bf916b34dfd9f699',
  fatherOccupation: '6aba3f2e0e962ba40a6a4db8',
  motherOccupation: '6aba3f220e962ba40a6a4d98',
  fatherNumber: '6ab7b33fbf916b34dfd9f6c2',
  motherNumber: '6ab7b34ebf916b34dfd9f6d4',
  city: '6ab7b3d5bf916b34dfda083f',
  state: '6ab7b3e7bf916b34dfda0851',
  centerId: '6ab7ba4fbf916b34dfda21aa',
  centerName: '6ab7ba47bf916b34dfda217a',
  caseCategory: '6ab7b471bf916b34dfda0863',
};
const RECEPTION_IDS = {
  arrivalStatus: '6ab7c235bf916b34dfda543c',
  arrivalTime: '6aba53547172140c6badaf14',
  patientId: '6abb6329297d3a5387593670',
  tokenNumber: '6abb65e3297d3a5387593f6e',
  primaryConcern: '6aba531b7172140c6badaee5',
};

const CATEGORY_LABEL = { autism_adhd: 'Autism / ADHD', mental_health: 'Mental Health' };
const FIRST_SERIAL = 11;
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

// The registration form. `required` fields must be filled before it can go to a Post Counselor.
// Fields that also live on the patient (name, age, numbers, center...) keep their patient meaning.
const base = (key, label, max, extra = {}) => ({ key, label, max, type: 'text', ...extra });
const REGISTRATION_FIELDS = [
  base('patientName', 'Child name', 120, { required: true, group: 'child' }),
  PROFILE_FIELDS.find((item) => item.key === 'dateOfBirth'),
  base('age', 'Age', 30, { required: true, group: 'child' }),
  ...PROFILE_FIELDS.filter((item) => ['gender', 'weight', 'height', 'headCircumference'].includes(item.key)),
  base('category', 'Category', 20, { type: 'select', required: true, group: 'child', options: ['autism_adhd', 'mental_health'], optionLabels: CATEGORY_LABEL }),
  PROFILE_FIELDS.find((item) => item.key === 'fatherName'),
  base('fatherNumber', "Father's mobile", 15, { type: 'tel', group: 'family' }),
  PROFILE_FIELDS.find((item) => item.key === 'fatherOccupation'),
  PROFILE_FIELDS.find((item) => item.key === 'motherName'),
  base('motherNumber', "Mother's mobile", 15, { type: 'tel', group: 'family' }),
  PROFILE_FIELDS.find((item) => item.key === 'motherOccupation'),
  PROFILE_FIELDS.find((item) => item.key === 'primaryCaregiver'),
  PROFILE_FIELDS.find((item) => item.key === 'whatsappNumber'),
  PROFILE_FIELDS.find((item) => item.key === 'historyGivenBy'),
  base('patientHistoryBy', 'Patient history by', 120, { group: 'family' }),
  base('relativeName', 'Relative name', 120, { group: 'family', onlyFor: 'mental_health' }),
  ...PROFILE_FIELDS.filter((item) => item.group === 'address'),
  base('centerName', 'Center name', 120, { group: 'center' }),
  base('centerId', 'Center ID', 80, { group: 'center' }),
];
const FIELD_GROUPS = [['child', 'Child details'], ['family', 'Family details'], ['address', 'Address'], ['center', 'Center']];

const istDate = (now = new Date()) => new Date(now.getTime() + 330 * 60 * 1000).toISOString().slice(0, 10);

// Patient ID = first letter of the name + ddmmyy + serial of that day (the day's first patient gets 11).
const patientIdFor = (name, dateIso, serial) => {
  const letter = (String(name || '').match(/[A-Za-z]/) || ['X'])[0].toUpperCase();
  const [year, month, day] = dateIso.split('-');
  return `${letter}-${day}${month}${year.slice(2)}-${serial}`;
};

const categoryFromCase = (caseCategory) => {
  const value = String(caseCategory || '').trim().toLowerCase();
  if (value === 'mental health') return 'mental_health';
  if (['autism', 'adhd', 'autism + adhd'].includes(value)) return 'autism_adhd';
  return '';
};

const text = (value, max = 200) => String(value ?? '').trim().slice(0, max);
const phone = (value) => String(value ?? '').replace(/[^\d+]/g, '').slice(0, 15);

const cleanValue = (definition, raw) => {
  if (definition.key === 'category') return definition.options.includes(raw) ? raw : '';
  return cleanProfileValue(definition, raw);
};

// Registration form values as saved. Anything not sent is treated as empty.
const cleanRegistration = (raw = {}) => Object.fromEntries(REGISTRATION_FIELDS.map((definition) => [definition.key, cleanValue(definition, raw?.[definition.key])]));

// What must be filled before the patient can go to a Post Counselor.
const missingForSend = (fields) => REGISTRATION_FIELDS.filter((definition) => definition.required && !String(fields[definition.key] || '').trim()).map((definition) => definition.label);

// Pre-fill from what Sales already entered. Sales has one guardian + relationship, so that is split into father/mother.
const defaultsFromSales = (salesValues = {}) => {
  const guardian = text(salesValues[SALES_IDS.guardianName], 120);
  const relationship = text(salesValues[SALES_IDS.relationship], 60);
  const isFather = /father|papa|dad/i.test(relationship);
  const isMother = /mother|mummy|mom|maa/i.test(relationship);
  const gender = text(salesValues[SALES_IDS.gender], 10);
  return {
    ...Object.fromEntries(REGISTRATION_FIELDS.map((definition) => [definition.key, ''])),
    patientName: text(salesValues[SALES_IDS.patientName], 120),
    age: text(salesValues[SALES_IDS.age], 30),
    gender: ['Male', 'Female'].includes(gender) ? gender : '',
    category: categoryFromCase(salesValues[SALES_IDS.caseCategory]),
    fatherName: isFather ? guardian : '',
    motherName: isMother ? guardian : '',
    primaryCaregiver: guardian ? `${guardian}${relationship ? ` - ${relationship}` : ''}` : '',
    fatherOccupation: text(salesValues[SALES_IDS.fatherOccupation], 120),
    motherOccupation: text(salesValues[SALES_IDS.motherOccupation], 120),
    fatherNumber: phone(salesValues[SALES_IDS.fatherNumber]),
    motherNumber: phone(salesValues[SALES_IDS.motherNumber]),
    city: text(salesValues[SALES_IDS.city], 80),
    state: text(salesValues[SALES_IDS.state], 80),
    centerName: text(salesValues[SALES_IDS.centerName], 120),
    centerId: text(salesValues[SALES_IDS.centerId], 80),
  };
};

module.exports = {
  SALES_IDS, RECEPTION_IDS, CATEGORY_LABEL, FIRST_SERIAL, TIME_PATTERN, REGISTRATION_FIELDS, FIELD_GROUPS,
  istDate, patientIdFor, categoryFromCase, cleanRegistration, missingForSend, defaultsFromSales,
};
