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

test('the manager covers In Transit, Reception, PCC, Sales Team and Medicine Department, never a DELETE', () => {
  assert.equal(run(['admin'], 'admin'), 'next');
  assert.equal(run(['admin'], 'manager'), 403, 'an Admin-only route (settings, HR, configuration) stays with the Admin');
  assert.equal(run(['admin', 'manager'], 'manager'), 'next', 'a route that names the Manager');
  for (const dept of ['in_transit', 'receptionist', 'assistant_doctor', 'sales_team', 'medicine_department']) assert.equal(run(['admin', dept], 'manager', 'PATCH'), 'next', dept);
  assert.equal(run(['admin', 'in_transit'], 'manager', 'DELETE'), 403);
  assert.equal(run(['admin', 'doctor'], 'manager'), 403, 'the doctor is not a department the Manager covers');
  assert.equal(run(['post_counselor'], 'manager'), 403);
  assert.equal(run(['admin'], 'admin', 'DELETE'), 'next');
  assert.equal(run(['admin'], 'doctor'), 403);
});
