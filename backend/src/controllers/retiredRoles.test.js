const { test } = require('node:test');
const assert = require('node:assert/strict');
const { ROLES, CREATABLE_ROLES, ALL_ROLES, STORED_ROLES, isRetiredRole, ROLE_LABELS } = require('../constants/roles');
const User = require('../models/User');
const authController = require('./authController');
const { protect } = require('../middleware/auth');
const jwt = require('jsonwebtoken');

const response = () => ({ statusCode: 200, body: null, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } });

test('psychologist is retired: not creatable or active, but still a valid stored value with a label', () => {
  assert.equal(isRetiredRole(ROLES.PSYCHOLOGIST), true);
  assert.equal(CREATABLE_ROLES.includes(ROLES.PSYCHOLOGIST), false);
  assert.equal(ALL_ROLES.includes(ROLES.PSYCHOLOGIST), false);
  assert.equal(STORED_ROLES.includes(ROLES.PSYCHOLOGIST), true);
  assert.match(ROLE_LABELS[ROLES.PSYCHOLOGIST], /Psychologist/);
  // Existing psychologist accounts still pass schema validation, so their name stays on old records.
  const user = new User({ name: 'Old Psychologist', email: 'old@x.com', password: 'secret12', role: ROLES.PSYCHOLOGIST });
  assert.equal(user.validateSync()?.errors?.role, undefined);
});

test('a retired-role account cannot sign in', async () => {
  const original = User.findOne;
  User.findOne = () => ({ select: async () => ({ _id: 'u1', role: ROLES.PSYCHOLOGIST, isActive: true, matchPassword: async () => true }) });
  try {
    const res = response();
    await authController.login({ body: { email: 'old@x.com', password: 'secret12' } }, res, (err) => { throw err; });
    assert.equal(res.statusCode, 403);
    assert.match(res.body.message, /retired/);
  } finally { User.findOne = original; }
});

test('an existing session of a retired-role account is refused', async () => {
  const originalFind = User.findById;
  const secret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = 'test-secret';
  User.findById = async () => ({ _id: 'u1', role: ROLES.PSYCHOLOGIST, isActive: true });
  try {
    const res = response();
    let passed = false;
    await protect({ headers: { authorization: `Bearer ${jwt.sign({ id: 'u1' }, 'test-secret')}` } }, res, () => { passed = true; });
    assert.equal(passed, false);
    assert.equal(res.statusCode, 403);
  } finally { User.findById = originalFind; process.env.JWT_SECRET = secret; }
});
