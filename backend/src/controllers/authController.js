const User = require('../models/User');
const generateToken = require('../utils/generateToken');
const { asyncHandler } = require('../middleware/errorHandler');
const { ROLE_LABELS } = require('../constants/roles');

const formatUser = (user) => ({
  id: user._id,
  name: user.name,
  email: user.email,
  role: user.role,
  roleLabel: ROLE_LABELS[user.role],
  phone: user.phone,
  isActive: user.isActive,
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

  const token = generateToken(user._id);

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

module.exports = { login, getMe, formatUser };
