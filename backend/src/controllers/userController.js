const User = require('../models/User');
const { asyncHandler } = require('../middleware/errorHandler');
const { CREATABLE_ROLES, RETIRED_ROLES, ROLE_LABELS, ROLES } = require('../constants/roles');
const { formatUser } = require('./authController');
const { dropOtherSockets } = require('../utils/sessionGuard');

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
  const filter = { role: { $in: [...CREATABLE_ROLES, ...RETIRED_ROLES] } };
  if (role) filter.role = role;

  const users = await User.find(filter).sort({ createdAt: -1 });
  res.status(200).json({ success: true, count: users.length, users: users.map(formatUser) });
});

// @desc    Update a team member (name, role, phone, active status, password)
// @route   PATCH /api/users/:id
// @access  Private/Admin
const updateUser = asyncHandler(async (req, res) => {
  const { name, role, phone, isActive, password, email } = req.body;

  const user = await User.findById(req.params.id);
  if (!user) {
    return res.status(404).json({ success: false, message: 'User not found' });
  }

  // The Manager manages every other staff account, never the admin's.
  if (user.role === ROLES.ADMIN && req.user.role !== ROLES.ADMIN) {
    return res.status(403).json({ success: false, message: 'Only the admin can change the admin account' });
  }
  if (user.role === 'admin') {
    return res.status(403).json({ success: false, message: 'Admin account cannot be modified here' });
  }

  if (role && role !== user.role) {
    if (!CREATABLE_ROLES.includes(role)) {
      return res.status(400).json({ success: false, message: 'Invalid role' });
    }
    user.role = role;
  }

  // Login email (the user signs in with it): must be valid and not used by anyone else.
  if (email !== undefined) {
    const nextEmail = String(email || '').toLowerCase().trim();
    if (!/^\S+@\S+\.\S+$/.test(nextEmail)) return res.status(400).json({ success: false, message: 'Enter a valid email' });
    if (nextEmail !== user.email) {
      const taken = await User.findOne({ email: nextEmail, _id: { $ne: user._id } }).select('_id');
      if (taken) return res.status(400).json({ success: false, message: 'A user with this email already exists' });
      user.email = nextEmail;
    }
  }

  if (name !== undefined) user.name = name;
  if (phone !== undefined) user.phone = phone;
  const deactivating = isActive !== undefined && user.isActive && !isActive;
  if (isActive !== undefined) {
    user.isActive = isActive;
    Object.assign(user, isActive ? { deactivatedAt: null, deactivatedByName: '' } : deactivating ? { deactivatedAt: new Date(), deactivatedByName: req.user.name } : {});
  }
  if (password !== undefined && password !== '') {
    if (password.length < 6) {
      return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });
    }
    user.password = password;
  }

  const passwordChanged = password !== undefined && password !== '';
  await user.save();
  // The member is logged out on every device they were signed in on.
  if (passwordChanged || deactivating) dropOtherSockets(req.app?.get?.('io'), user._id);
  res.status(200).json({ success: true, user: formatUser(user), ...(passwordChanged ? { loggedOutEverywhere: true } : {}) });
});

// @desc    Delete a team member
// @route   DELETE /api/users/:id
// @access  Private/Admin
// What still points at a team member: patients and open work. Shown before deactivating (to hand the open work
// over) and used to refuse a delete that would leave those records pointing at nobody.
const linksOf = async (userId) => {
  const Patient = require('../models/Patient');
  const Management = require('../models/AppointmentManagementEntry');
  const Enquiry = require('../models/Enquiry');
  const TeamChat = require('../models/TeamChat');
  const PackageNotBought = require('../models/PackageNotBoughtPatient');
  const [phasePatients, pccPatients, psyPatients, pendingSent, openEnquiries, openQueries, pnb] = await Promise.all([
    Patient.countDocuments({ 'stages.postCounselor': userId }),
    Patient.countDocuments({ assignedDoctor: userId }),
    Patient.countDocuments({ assignedPsychologist: userId }),
    Management.countDocuments({ 'registration.postCounselor': userId, 'registration.status': 'sent', 'postCounseling.outcome.kind': { $exists: false } }),
    Enquiry.countDocuments({ assignedTo: userId, status: { $in: ['open', 'in_progress'] }, deletedAt: null }),
    TeamChat.countDocuments({ assignedTo: userId, kind: { $ne: 'direct' }, status: { $ne: 'closed' } }),
    PackageNotBought.countDocuments({ createdBy: userId }),
  ]);
  return { phasePatients, pccPatients, psyPatients, pendingSent, openEnquiries, openQueries, pnb, total: phasePatients + pccPatients + psyPatients + pendingSent + openEnquiries + openQueries + pnb };
};

// @route GET /api/users/:id/links
const getUserLinks = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id).select('_id');
  if (!user) return res.status(404).json({ success: false, message: 'User not found' });
  res.json({ success: true, links: await linksOf(user._id) });
});

const deleteUser = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) {
    return res.status(404).json({ success: false, message: 'User not found' });
  }

  if (user.role === 'admin') {
    return res.status(403).json({ success: false, message: 'Admin account cannot be deleted' });
  }

  // Linked to patients or open work: deleting would leave those records pointing at nobody - deactivate instead.
  const links = await linksOf(user._id);
  if (links.total > 0) {
    return res.status(409).json({ success: false, message: `${user.name} is linked to patients / open work. Deactivate them instead: they are hidden everywhere and their name stays on the old records.`, links });
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

module.exports = { createUser, getUsers, updateUser, deleteUser, getUserLinks, getAssistantDoctors, getPsychologists, getPostCounselors };
