const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeEmployeeName, normalizeEmployeePhone, sameEmployeeIdentity } = require('./hrEmployeeIdentity');

test('employee identity ignores name spacing, case and phone formatting', () => {
  assert.equal(normalizeEmployeeName('  Amit   Kumar '), 'amit kumar');
  assert.equal(normalizeEmployeePhone('+91 98765-43210'), '9876543210');
  assert.equal(sameEmployeeIdentity(
    { name: 'Amit Kumar', phone: '+91 98765-43210' },
    { name: ' amit   kumar ', phone: '98765 43210' },
  ), true);
});

test('different name or phone remains a different employee identity', () => {
  assert.equal(sameEmployeeIdentity({ name: 'Amit Kumar', phone: '9876543210' }, { name: 'Amit Kumar', phone: '9876543211' }), false);
  assert.equal(sameEmployeeIdentity({ name: 'Amit Kumar', phone: '9876543210' }, { name: 'Sumit Kumar', phone: '9876543210' }), false);
});
