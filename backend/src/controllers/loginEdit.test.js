const { test } = require('node:test');
const assert = require('node:assert/strict');
const User = require('../models/User');
const userController = require('./userController');
const authController = require('./authController');

const res = () => ({ statusCode: 200, body: null, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } });
const run = async (handler, req) => { const r = res(); let error = null; await handler(req, r, (e) => { error = e; }); if (error) throw error; return r; };
const stub = async (pairs, fn) => {
  const saved = pairs.map(([t, k, v]) => { const old = t[k]; t[k] = v; return [t, k, old]; });
  try { return await fn(); } finally { saved.forEach(([t, k, old]) => { t[k] = old; }); }
};
const member = (extra = {}) => ({ _id: 'u2', name: 'Tanu', email: 'tanu@crm.com', role: 'medicine_department', isActive: true, save: async function save() { return this; }, ...extra });

test('admin changes a team member login email and password', async () => {
  const user = member();
  await stub([[User, 'findById', async () => user], [User, 'findOne', () => ({ select: async () => null })]], async () => {
    const r = await run(userController.updateUser, { params: { id: 'u2' }, body: { email: '  New.Mail@CRM.com ', password: 'secret12' }, user: { _id: 'a1', role: 'admin' } });
    assert.equal(r.statusCode, 200);
    assert.equal(user.email, 'new.mail@crm.com');
    assert.equal(user.password, 'secret12');
  });
});

test('a member email must be valid and not taken by someone else', async () => {
  await stub([[User, 'findById', async () => member()], [User, 'findOne', () => ({ select: async () => ({ _id: 'other' }) })]], async () => {
    const bad = await run(userController.updateUser, { params: { id: 'u2' }, body: { email: 'not-an-email' }, user: { _id: 'a1', role: 'admin' } });
    assert.equal(bad.statusCode, 400);
    const taken = await run(userController.updateUser, { params: { id: 'u2' }, body: { email: 'prachi@crm.com' }, user: { _id: 'a1', role: 'admin' } });
    assert.equal(taken.statusCode, 400);
    assert.match(taken.body.message, /already exists/);
  });
});

test('admin changes their own login email and password only with the current password', async () => {
  const admin = { _id: 'a1', name: 'Super Admin', email: 'admin@crm.com', role: 'admin', isActive: true, matchPassword: async (p) => p === 'old-pass', save: async function save() { return this; } };
  await stub([[User, 'findById', () => ({ select: async () => admin })], [User, 'findOne', () => ({ select: async () => null })]], async () => {
    const wrong = await run(authController.updateMyAccount, { body: { currentPassword: 'nope', email: 'boss@crm.com' }, user: { _id: 'a1', role: 'admin' } });
    assert.equal(wrong.statusCode, 401);
    assert.equal(admin.email, 'admin@crm.com');
    const ok = await run(authController.updateMyAccount, { body: { currentPassword: 'old-pass', email: 'Boss@CRM.com', newPassword: 'new-pass' }, user: { _id: 'a1', role: 'admin' } });
    assert.equal(ok.statusCode, 200);
    assert.deepEqual(ok.body.changed, ['email', 'password']);
    assert.equal(admin.email, 'boss@crm.com');
    assert.equal(admin.password, 'new-pass');
    assert.equal(ok.body.user.email, 'boss@crm.com');
  });
});

test('only the admin can use the own-login email change', async () => {
  const r = await run(authController.updateMyAccount, { body: { currentPassword: 'x', email: 'me@crm.com' }, user: { _id: 'u2', role: 'receptionist' } });
  assert.equal(r.statusCode, 403);
});
