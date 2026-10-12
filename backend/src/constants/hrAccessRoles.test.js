const test = require('node:test');
const assert = require('node:assert/strict');
const {
  ROLES,
  HR_ACCESS_ROLES,
  HR_FULL_ACCESS_ROLES,
  hasHrFullAccess,
} = require('./roles');
const { authorize } = require('../middleware/auth');

const runAuthorization = (roles, role) => {
  let allowed = false;
  let statusCode = 200;
  authorize(...roles)(
    { user: { role } },
    { status(code) { statusCode = code; return this; }, json() { return this; } },
    () => { allowed = true; }
  );
  return { allowed, statusCode };
};

test('Doctor can access the complete HR system with management controls', () => {
  assert.deepEqual(HR_ACCESS_ROLES, [ROLES.ADMIN, ROLES.DOCTOR, ROLES.HR]);
  assert.deepEqual(HR_FULL_ACCESS_ROLES, [ROLES.ADMIN, ROLES.DOCTOR]);
  assert.equal(hasHrFullAccess(ROLES.DOCTOR), true);
  assert.equal(hasHrFullAccess(ROLES.HR), false);
  assert.equal(hasHrFullAccess(ROLES.RECEPTIONIST), false);
  assert.deepEqual(runAuthorization(HR_ACCESS_ROLES, ROLES.DOCTOR), { allowed: true, statusCode: 200 });
  assert.deepEqual(runAuthorization(HR_FULL_ACCESS_ROLES, ROLES.DOCTOR), { allowed: true, statusCode: 200 });
  assert.deepEqual(runAuthorization(HR_ACCESS_ROLES, ROLES.RECEPTIONIST), { allowed: false, statusCode: 403 });
});
