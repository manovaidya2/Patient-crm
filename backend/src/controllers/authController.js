const User = require('../models/User');
const generateToken = require('../utils/generateToken');
const { asyncHandler } = require('../middleware/errorHandler');
const { ROLE_LABELS, isRetiredRole } = require('../constants/roles');
const CrmAuditLog = require('../models/CrmAuditLog');
const { dropOtherSockets } = require('../utils/sessionGuard');
// The token this request came with (this device stays signed in after its own password change).
const requestToken = (req) => String(req.headers?.authorization || '').replace(/^Bearer\s+/i, '');

const formatUser = (user) => ({
  id: user._id,
  name: user.name,
  email: user.email,
  role: user.role,
  roleLabel: ROLE_LABELS[user.role],
  phone: user.phone,
  isActive: user.isActive,
  deactivatedAt: user.deactivatedAt || null,
  deactivatedByName: user.deactivatedByName || '',
});

// @desc    Login user & get token
// @route   POST /api/auth/login
// @access  Public
const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ success: false, message: 'Email and password are required' });
  }

  const user = await User.findOne({ email: email.toLowerCase().trim() }).select('+password');

  if (!user || !(await user.matchPassword(password))) {
    return res.status(401).json({ success: false, message: 'Invalid email or password' });
  }

  if (!user.isActive) {
    return res.status(403).json({ success: false, message: 'Your account has been deactivated. Contact admin.' });
  }

  if (isRetiredRole(user.role)) {
    return res.status(403).json({ success: false, message: 'The Psychologist role has been retired. Family sessions are now done by the PCC. Ask the admin to give your account a new role.' });
  }

  const token = generateToken(user._id);

  CrmAuditLog.create({
    actor: user._id,
    actorName: user.name,
    actorRole: user.role,
    module: 'Account Security',
    action: 'Signed in',
    summary: 'Signed in to the CRM',
    method: 'POST',
    path: '/api/auth/login',
    statusCode: 200,
    occurredAt: new Date(),
  }).catch((error) => console.error('CRM sign-in audit log could not be saved:', error.message));

  res.status(200).json({
    success: true,
    token,
    user: formatUser(user),
  });
});

// @desc    Get currently logged-in user
// @route   GET /api/auth/me
// @access  Private
const getMe = asyncHandler(async (req, res) => {
  res.status(200).json({ success: true, user: formatUser(req.user) });
});

// @desc    Change password for the currently logged-in user
// @route   PATCH /api/auth/password
// @access  Private
const changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    return res.status(400).json({ success: false, message: 'Current password and new password are required' });
  }

  if (newPassword.length < 6) {
    return res.status(400).json({ success: false, message: 'New password must be at least 6 characters' });
  }

  const user = await User.findById(req.user._id).select('+password');
  if (!user || !(await user.matchPassword(currentPassword))) {
    return res.status(401).json({ success: false, message: 'Current password is incorrect' });
  }

  user.password = newPassword;
  await user.save();
  const token = generateToken(user._id);
  dropOtherSockets(req.app?.get?.('io'), user._id, requestToken(req));

  res.status(200).json({ success: true, message: 'Password changed successfully. You were logged out on your other devices.', token });
});

// @desc    Admin changes their own login: email and/or password (and name). The current password is required.
// @route   PATCH /api/auth/account
// @access  Private/Admin
const updateMyAccount = asyncHandler(async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ success: false, message: 'Only the admin can change their login email here' });
  const { currentPassword, email, newPassword, name } = req.body || {};
  if (!currentPassword) return res.status(400).json({ success: false, message: 'Enter your current password to confirm' });
  const user = await User.findById(req.user._id).select('+password');
  if (!user || !(await user.matchPassword(currentPassword))) return res.status(401).json({ success: false, message: 'Current password is incorrect' });

  const changes = [];
  if (email !== undefined && String(email).trim() !== '') {
    const nextEmail = String(email).toLowerCase().trim();
    if (!/^\S+@\S+\.\S+$/.test(nextEmail)) return res.status(400).json({ success: false, message: 'Enter a valid email' });
    if (nextEmail !== user.email) {
      const taken = await User.findOne({ email: nextEmail, _id: { $ne: user._id } }).select('_id');
      if (taken) return res.status(400).json({ success: false, message: 'A user with this email already exists' });
      user.email = nextEmail;
      changes.push('email');
    }
  }
  if (newPassword) {
    if (String(newPassword).length < 6) return res.status(400).json({ success: false, message: 'New password must be at least 6 characters' });
    user.password = newPassword;
    changes.push('password');
  }
  if (name !== undefined && String(name).trim() && String(name).trim() !== user.name) {
    user.name = String(name).trim().slice(0, 100);
    changes.push('name');
  }
  if (!changes.length) return res.status(400).json({ success: false, message: 'Nothing to change' });
  await user.save();
  // A new password logs the admin out on every other device; this device continues with a fresh token.
  const token = changes.includes('password') ? generateToken(user._id) : undefined;
  if (token) dropOtherSockets(req.app?.get?.('io'), user._id, requestToken(req));
  res.status(200).json({ success: true, changed: changes, user: formatUser(user), ...(token ? { token } : {}) });
});

module.exports = { login, getMe, changePassword, updateMyAccount, formatUser };
