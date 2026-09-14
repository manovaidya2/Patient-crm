const User = require('../models/User');
const { asyncHandler } = require('../middleware/errorHandler');
const { CREATABLE_ROLES, ROLE_LABELS, ROLES } = require('../constants/roles');
const { formatUser } = require('./authController');

// @desc    Admin creates a login for a team member (manager, counselor, doctor, etc.)
// @route   POST /api/users
// @access  Private/Admin
const createUser = asyncHandler(async (req, res) => {
  const { name, email, password, role, phone } = req.body;

  if (!name || !email || !password || !role) {
    return res.status(400).json({ success: false, message: 'Name, email, password and role are required' });
  }

  if (!CREATABLE_ROLES.includes(role)) {
    return res.status(400).json({
      success: false,
      message: `Invalid role. Allowed roles: ${CREATABLE_ROLES.map((r) => ROLE_LABELS[r]).join(', ')}`,
    });
  }

  const existing = await User.findOne({ email: email.toLowerCase().trim() });
  if (existing) {
    return res.status(400).json({ success: false, message: 'A user with this email already exists' });
  }

  const user = await User.create({
    name,
    email,
    password,
    role,
    phone,
    createdBy: req.user._id,
  });

  res.status(201).json({ success: true, user: formatUser(user) });
});

// @desc    Get all team members (excludes admin accounts)
// @route   GET /api/users
// @access  Private/Admin
const getUsers = asyncHandler(async (req, res) => {
  const { role } = req.query;
  const filter = { role: { $in: CREATABLE_ROLES } };
  if (role) filter.role = role;

  const users = await User.find(filter).sort({ createdAt: -1 });
  res.status(200).json({ success: true, count: users.length, users: users.map(formatUser) });
});

// @desc    Update a team member (name, role, phone, active status, password)
// @route   PATCH /api/users/:id
// @access  Private/Admin
const updateUser = asyncHandler(async (req, res) => {
  const { name, role, phone, isActive, password } = req.body;

  const user = await User.findById(req.params.id);
  if (!user) {
    return res.status(404).json({ success: false, message: 'User not found' });
  }

  if (user.role === 'admin') {
    return res.status(403).json({ success: false, message: 'Admin account cannot be modified here' });
  }

  if (role) {
    if (!CREATABLE_ROLES.includes(role)) {
      return res.status(400).json({ success: false, message: 'Invalid role' });
    }
    user.role = role;
  }

  if (name !== undefined) user.name = name;
  if (phone !== undefined) user.phone = phone;
  if (isActive !== undefined) user.isActive = isActive;
  if (password !== undefined && password !== '') {
    if (password.length < 6) {
      return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });
    }
    user.password = password;
  }

  await user.save();
  res.status(200).json({ success: true, user: formatUser(user) });
});

// @desc    Delete a team member
// @route   DELETE /api/users/:id
// @access  Private/Admin
const deleteUser = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) {
    return res.status(404).json({ success: false, message: 'User not found' });
  }

  if (user.role === 'admin') {
    return res.status(403).json({ success: false, message: 'Admin account cannot be deleted' });
  }

  await user.deleteOne();
  res.status(200).json({ success: true, message: 'User removed' });
});

// @desc    List active Assistant Doctors (name only) — used to assign patients
// @route   GET /api/users/assistant-doctors
// @access  Private/Admin, Manager, Post Counselor
const getAssistantDoctors = asyncHandler(async (req, res) => {
  const doctors = await User.find({ role: ROLES.ASSISTANT_DOCTOR, isActive: true })
    .select('name')
    .sort({ name: 1 });

  res.status(200).json({ success: true, doctors: doctors.map((d) => ({ id: d._id, name: d.name })) });
});

const getPsychologists = asyncHandler(async (req, res) => {
  const psychologists = await User.find({ role: ROLES.PSYCHOLOGIST, isActive: true })
    .select('name')
    .sort({ name: 1 });

  res.status(200).json({
    success: true,
    psychologists: psychologists.map((p) => ({ id: p._id, name: p.name })),
  });
});

const getPostCounselors = asyncHandler(async (req, res) => {
  const counselors = await User.find({ role: ROLES.POST_COUNSELOR, isActive: true })
    .select('name')
    .sort({ name: 1 });

  res.status(200).json({
    success: true,
    postCounselors: counselors.map((c) => ({ id: c._id, name: c.name })),
  });
});

module.exports = { createUser, getUsers, updateUser, deleteUser, getAssistantDoctors, getPsychologists, getPostCounselors };
