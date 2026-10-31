const test = require('node:test');
const assert = require('node:assert/strict');
const patientRouter = require('../routes/patientRoutes');
const userRouter = require('../routes/userRoutes');
const accountRouter = require('../routes/accountRoutes');
const { updatePatient } = require('./patientController');
const { ROLES, ASSIGN_DOCTOR_ROLES } = require('../constants/roles');
const transitRouter = require('../routes/transitRoutes');

test('In Transit routes exclude Reception and Post Counselor; explanation completion belongs to Assistant Doctor', () => {
  const queue = routeGuard(transitRouter, '/', 'get');
  for (const role of [ROLES.ADMIN, ROLES.IN_TRANSIT]) assert.equal(checkAccess(queue, role).allowed, true);
  for (const role of [ROLES.RECEPTIONIST, ROLES.POST_COUNSELOR, ROLES.ASSISTANT_DOCTOR]) assert.equal(checkAccess(queue, role).status, 403);
  const completion = routeGuard(transitRouter, '/:patientId/:number/complete-explanation', 'post');
  assert.equal(checkAccess(completion, ROLES.ASSISTANT_DOCTOR).allowed, true);
  assert.equal(checkAccess(completion, ROLES.IN_TRANSIT).status, 403);
  const consultation = routeGuard(accountRouter, '/consultation-receipts/:id', 'patch');
  assert.equal(checkAccess(consultation, ROLES.RECEPTIONIST).allowed, true);
  assert.equal(checkAccess(consultation, ROLES.IN_TRANSIT).status, 403);
  assert.equal(Object.hasOwn(ROLES, 'DISPATCH_COURIER'), false);
});

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

test('account pages accept receptionist and no accountant role remains', () => {
  assert.equal(Object.hasOwn(ROLES, 'ACCOUNTANT'), false);
  const accountGuard = accountRouter.stack[1].handle;
  assert.deepEqual(checkAccess(accountGuard, ROLES.RECEPTIONIST), { allowed: true, status: undefined });
  assert.deepEqual(checkAccess(accountGuard, ROLES.SALES_TEAM), { allowed: false, status: 403 });
});

test('In Transit can open assignment staff lists and assignment update route', () => {
  assert.equal(ASSIGN_DOCTOR_ROLES.includes(ROLES.IN_TRANSIT), true);
  const patientGuard = routeGuard(patientRouter, '/:id', 'patch');
  const doctorGuard = routeGuard(userRouter, '/assistant-doctors', 'get');
  const psychologistGuard = routeGuard(userRouter, '/psychologists', 'get');
  for (const guard of [patientGuard, doctorGuard, psychologistGuard]) {
    assert.deepEqual(checkAccess(guard, ROLES.IN_TRANSIT), { allowed: true, status: undefined });
  }
});

test('In Transit can reach medicine request route while unrelated roles cannot', () => {
  const guard = routeGuard(patientRouter, '/:id/stages/:number/medicine-request', 'post');
  // The Manager passes wherever the Admin does.
  for (const role of [ROLES.ADMIN, ROLES.MANAGER, ROLES.DOCTOR, ROLES.IN_TRANSIT]) {
    assert.equal(checkAccess(guard, role).allowed, true, role);
  }
  for (const role of [ROLES.POST_COUNSELOR, ROLES.PSYCHOLOGIST, ROLES.RECEPTIONIST, ROLES.ASSISTANT_DOCTOR]) {
    assert.deepEqual(checkAccess(guard, role), { allowed: false, status: 403 }, role);
  }
});

test('In Transit can review patients, payments and refunds', () => {
  const guardedRoutes = [
    ['GET', '/payments-ledger'],
    ['GET', '/refunds-ledger'],
    ['GET', '/pending-approvals'],
    ['PATCH', '/:id/approve'],
    ['PATCH', '/:id/stages/:number/payments/:paymentId/approve'],
    ['PATCH', '/:id/stages/:number/payments/:paymentId/cancel'],
    ['POST', '/:id/stages/:number/payments/:paymentId/refunds'],
    ['POST', '/:id/refunds'],
    ['PATCH', '/:id/stages/:number/payments/:paymentId/refunds/:refundId'],
  ];
  for (const [method, path] of guardedRoutes) {
    const guard = routeGuard(patientRouter, path, method.toLowerCase());
    assert.deepEqual(checkAccess(guard, ROLES.IN_TRANSIT), { allowed: true, status: undefined }, `${method} ${path}`);
    assert.deepEqual(checkAccess(guard, ROLES.RECEPTIONIST), { allowed: false, status: 403 });
  }
});

test('In Transit patient updates are restricted to assignment fields', async () => {
  let body;
  let status = 200;
  await updatePatient(
    {
      user: { _id: 'reception-1', name: 'Reception', role: ROLES.IN_TRANSIT },
      params: { id: '507f1f77bcf86cd799439011' },
      body: { patientName: 'Changed outside assignment flow' },
    },
    { status(code) { status = code; return this; }, json(value) { body = value; } },
    (error) => { throw error; }
  );
  assert.equal(status, 403);
  assert.match(body.message, /only assign/i);
});
