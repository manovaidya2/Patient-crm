const { test } = require('node:test');
const assert = require('node:assert/strict');
const { authorize } = require('./auth');

const run = (roles, role, method = 'GET') => {
  let status = null;
  let passed = false;
  const res = { status(code) { status = code; return { json() {} }; } };
  authorize(...roles)({ user: { role }, method }, res, () => { passed = true; });
  return passed ? 'next' : status;
};

test('the manager passes wherever the admin is listed, except a DELETE', () => {
  assert.equal(run(['admin'], 'admin'), 'next');
  assert.equal(run(['admin'], 'manager'), 'next');
  assert.equal(run(['admin', 'doctor'], 'manager', 'PATCH'), 'next');
  assert.equal(run(['admin'], 'manager', 'DELETE'), 403);
  assert.equal(run(['admin'], 'admin', 'DELETE'), 'next');
  assert.equal(run(['doctor'], 'manager'), 403);
  assert.equal(run(['admin'], 'doctor'), 403);
});
