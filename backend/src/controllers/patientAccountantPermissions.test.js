const test = require('node:test');
const assert = require('node:assert/strict');
const patientRouter = require('../routes/patientRoutes');
const userRouter = require('../routes/userRoutes');
const { updatePatient } = require('./patientController');
const { ROLES, ASSIGN_DOCTOR_ROLES } = require('../constants/roles');

const routeGuard = (router, path, method) => router.stack
  .find((layer) => layer.route?.path === path && layer.route.methods[method])
  .route.stack[0].handle;

const checkAccess = (guard, role) => {
  let allowed = false;
  let status;
  guard(
    { user: { role } },
    { status(code) { status = code; return this; }, json() {} },
    () => { allowed = true; }
  );
  return { allowed, status };
};

test('accountant can open assignment staff lists and assignment update route', () => {
  assert.equal(ASSIGN_DOCTOR_ROLES.includes(ROLES.ACCOUNTANT), true);
  const patientGuard = routeGuard(patientRouter, '/:id', 'patch');
  const doctorGuard = routeGuard(userRouter, '/assistant-doctors', 'get');
  const psychologistGuard = routeGuard(userRouter, '/psychologists', 'get');
  for (const guard of [patientGuard, doctorGuard, psychologistGuard]) {
    assert.deepEqual(checkAccess(guard, ROLES.ACCOUNTANT), { allowed: true, status: undefined });
  }
});

test('accountant can reach medicine request route while unrelated roles cannot', () => {
  const guard = routeGuard(patientRouter, '/:id/stages/:number/medicine-request', 'post');
  for (const role of [ROLES.ADMIN, ROLES.DOCTOR, ROLES.ASSISTANT_DOCTOR, ROLES.ACCOUNTANT]) {
    assert.equal(checkAccess(guard, role).allowed, true, role);
  }
  for (const role of [ROLES.MANAGER, ROLES.POST_COUNSELOR, ROLES.PSYCHOLOGIST]) {
    assert.deepEqual(checkAccess(guard, role), { allowed: false, status: 403 }, role);
  }
});

test('accountant patient updates are restricted to assignment fields', async () => {
  let body;
  let status = 200;
  await updatePatient(
    {
      user: { _id: 'accountant-1', name: 'Accounts', role: ROLES.ACCOUNTANT },
      params: { id: '507f1f77bcf86cd799439011' },
      body: { patientName: 'Changed outside assignment flow' },
    },
    { status(code) { status = code; return this; }, json(value) { body = value; } },
    (error) => { throw error; }
  );
  assert.equal(status, 403);
  assert.match(body.message, /only assign/i);
});
