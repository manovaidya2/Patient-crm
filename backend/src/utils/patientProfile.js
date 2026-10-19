// Child & family details taken from the "Autism Clinical History Record" patient-details sheet. One list feeds the
// reception registration form, the Post Counseling page and Patient Details, so they always show the same fields.
const GENDERS = ['Male', 'Female'];
const profile = (key, label, max, extra = {}) => ({ key, label, max, type: 'text', ...extra });

const PROFILE_FIELDS = [
  profile('dateOfBirth', 'Date of birth', 10, { type: 'date', group: 'child' }),
  profile('gender', 'Gender', 10, { type: 'select', options: GENDERS, group: 'child' }),
  profile('weight', 'Weight (kg)', 12, { group: 'child' }),
  profile('height', 'Height (cm)', 12, { group: 'child' }),
  profile('headCircumference', 'Head circumference (cm)', 12, { group: 'child' }),
  profile('fatherName', 'Father name', 120, { group: 'family' }),
  profile('fatherOccupation', 'Father occupation', 120, { group: 'family' }),
  profile('motherName', 'Mother name', 120, { group: 'family' }),
  profile('motherOccupation', 'Mother occupation', 120, { group: 'family' }),
  profile('primaryCaregiver', 'Primary caregiver / relation', 120, { group: 'family' }),
  profile('whatsappNumber', 'Mobile / WhatsApp', 15, { type: 'tel', group: 'family' }),
  profile('historyGivenBy', 'History given by / relation', 120, { group: 'family' }),
  profile('houseAddress', 'House / flat / street / locality', 250, { group: 'address' }),
  profile('landmark', 'Landmark / area', 120, { group: 'address' }),
  profile('city', 'City', 80, { group: 'address' }),
  profile('district', 'District', 80, { group: 'address' }),
  profile('state', 'State', 80, { group: 'address' }),
  profile('pinCode', 'PIN code', 10, { group: 'address' }),
];

const PROFILE_KEYS = PROFILE_FIELDS.map((item) => item.key);

// Mongoose schema fragment: every field is an optional trimmed string.
const profileSchemaFields = () => Object.fromEntries(PROFILE_FIELDS.map((item) => [item.key, { type: String, trim: true, default: '', maxlength: item.max }]));

// Values as stored on a patient, always strings.
const profileOf = (source = {}) => Object.fromEntries(PROFILE_KEYS.map((key) => [key, String(source?.[key] ?? '')]));

// Clean one value according to its field definition ('' when it is not acceptable).
const cleanProfileValue = (definition, raw) => {
  const value = String(raw ?? '').trim();
  if (definition.type === 'tel') return value.replace(/[^\d+]/g, '').slice(0, definition.max);
  if (definition.type === 'date') return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : '';
  if (definition.type === 'select') return (definition.options || []).includes(value) ? value : '';
  return value.slice(0, definition.max);
};

module.exports = { PROFILE_FIELDS, PROFILE_KEYS, profileSchemaFields, profileOf, cleanProfileValue };
