const { test } = require('node:test');
const assert = require('node:assert/strict');
const { PROFILE_FIELDS, PROFILE_KEYS, profileOf, cleanProfileValue } = require('./patientProfile');
const { REGISTRATION_FIELDS, cleanRegistration } = require('./receptionFlow');

const def = (key) => PROFILE_FIELDS.find((item) => item.key === key);

test('profile fields: every key is unique and the sheet fields are present', () => {
  assert.equal(new Set(PROFILE_KEYS).size, PROFILE_KEYS.length);
  for (const key of ['dateOfBirth', 'gender', 'weight', 'height', 'headCircumference', 'fatherName', 'motherName', 'fatherOccupation', 'motherOccupation', 'primaryCaregiver', 'whatsappNumber', 'historyGivenBy', 'houseAddress', 'landmark', 'city', 'district', 'state', 'pinCode']) assert.ok(PROFILE_KEYS.includes(key), key);
});

test('profile values are cleaned by type', () => {
  assert.equal(cleanProfileValue(def('dateOfBirth'), '2022-06-22'), '2022-06-22');
  assert.equal(cleanProfileValue(def('dateOfBirth'), '22/06/2022'), '');
  assert.equal(cleanProfileValue(def('gender'), 'Female'), 'Female');
  assert.equal(cleanProfileValue(def('gender'), 'unknown'), '');
  assert.equal(cleanProfileValue(def('whatsappNumber'), '88006 11900'), '8800611900');
  assert.equal(cleanProfileValue(def('city'), '  Delhi  '), 'Delhi');
  assert.equal(profileOf({ city: 'Delhi' }).state, '');
});

test('registration: unknown keys are dropped and the category is validated', () => {
  const cleaned = cleanRegistration({ patientName: ' Riddhima ', category: 'bogus', pinCode: '110021', hacker: 'x' });
  assert.equal(cleaned.patientName, 'Riddhima');
  assert.equal(cleaned.category, '');
  assert.equal(cleaned.pinCode, '110021');
  assert.equal('hacker' in cleaned, false);
  assert.equal(Object.keys(cleaned).length, REGISTRATION_FIELDS.length);
});
