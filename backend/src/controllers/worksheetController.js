const Patient = require('../models/Patient');
const User = require('../models/User');
const WorksheetColumn = require('../models/WorksheetColumn');
const WorksheetManualRow = require('../models/WorksheetManualRow');
const { asyncHandler } = require('../middleware/errorHandler');
const { ROLES, ROLE_LABELS } = require('../constants/roles');

const WORKSHEET_ROLES = [ROLES.ASSISTANT_DOCTOR, ROLES.PSYCHOLOGIST, ROLES.MANAGER];

const toLocalDate = (value) => {
  if (typeof value === 'string') {
    const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (match) return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  }
  const date = value ? new Date(value) : new Date();
  return Number.isNaN(date.getTime()) ? new Date() : date;
};

const startOfDay = (value) => {
  const date = toLocalDate(value);
  date.setHours(0, 0, 0, 0);
  return date;
};

const endOfDay = (value) => {
  const date = toLocalDate(value);
  date.setHours(23, 59, 59, 999);
  return date;
};

const sameUser = (left = {}, right = {}) =>
  String(left.name || '').trim().toLowerCase() === String(right.name || '').trim().toLowerCase() &&
  String(left.role || '') === String(right.role || '');

const getAllowedUsers = async (user) => {
  if (user.role === ROLES.ASSISTANT_DOCTOR || user.role === ROLES.PSYCHOLOGIST) {
    return [{ id: user._id, name: user.name, role: user.role, roleLabel: ROLE_LABELS[user.role] || user.role }];
  }

  const roles = user.role === ROLES.MANAGER
    ? [ROLES.ASSISTANT_DOCTOR, ROLES.PSYCHOLOGIST]
    : WORKSHEET_ROLES;

  const users = await User.find({ role: { $in: roles }, isActive: true })
    .select('name role')
    .sort({ role: 1, name: 1 });

  return users.map((row) => ({
    id: row._id,
    name: row.name,
    role: row.role,
    roleLabel: ROLE_LABELS[row.role] || row.role,
  }));
};

const canUseWorksheetUser = (allowedUsers, userId) => allowedUsers.some((user) => String(user.id) === String(userId));

const makeColumnKey = (label) => {
  const normalized = String(label || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return `custom_${normalized || Date.now()}`;
};

const formatPatientCode = (patient) => patient.patientCode || `PT-${String(patient._id).slice(-6).toUpperCase()}`;

const getWorksheet = asyncHandler(async (req, res) => {
  const allowedViewerRoles = [ROLES.ADMIN, ROLES.DOCTOR, ROLES.MANAGER, ROLES.ASSISTANT_DOCTOR, ROLES.PSYCHOLOGIST];
  if (!allowedViewerRoles.includes(req.user.role)) {
    return res.status(403).json({ success: false, message: 'You do not have permission to view worksheet' });
  }

  const dateMode = req.query.dateMode === 'all' ? 'all' : 'day';
  const dateValue = req.query.date || new Date();
  const dateRange = dateMode === 'all' ? null : { start: startOfDay(dateValue), end: endOfDay(dateValue) };
  const allowedUsers = await getAllowedUsers(req.user);
  const allowedKeys = allowedUsers.map((user) => `${user.role}|${String(user.name).trim().toLowerCase()}`);
  const allowedUserIds = allowedUsers.map((user) => user.id);

  const [patients, manualRows, customColumns] = await Promise.all([
    Patient.find({}).select('patientName patientCode category currentStage activityLog').sort({ updatedAt: -1 }),
    WorksheetManualRow.find({
      user: { $in: allowedUserIds },
      ...(dateRange ? { workDate: { $gte: dateRange.start, $lte: dateRange.end } } : {}),
    }).sort({ workDate: -1, createdAt: -1 }),
    WorksheetColumn.find({}).sort({ createdAt: 1 }),
  ]);

  const rows = [];
  patients.forEach((patient) => {
    (patient.activityLog || []).forEach((entry) => {
      const createdAt = entry.createdAt || entry.updatedAt;
      if (!createdAt) return;
      if (dateRange) {
        const createdTime = new Date(createdAt).getTime();
        if (createdTime < dateRange.start.getTime() || createdTime > dateRange.end.getTime()) return;
      }

      const actor = {
        name: entry.actorName || 'System',
        role: entry.actorRole || '',
      };
      const key = `${actor.role}|${String(actor.name).trim().toLowerCase()}`;
      if (!allowedKeys.includes(key)) return;

      const matchedUser = allowedUsers.find((user) => sameUser(user, actor));
      rows.push({
        id: `${patient._id}-${entry._id}`,
        userId: matchedUser?.id || '',
        userName: actor.name,
        userRole: actor.role,
        userRoleLabel: ROLE_LABELS[actor.role] || actor.role || 'System',
        patientId: patient._id,
        patientName: patient.patientName,
        patientCode: formatPatientCode(patient),
        patientCategory: patient.category,
        currentStage: patient.currentStage || '',
        workType: entry.action,
        details: entry.details || '',
        source: 'auto',
        customValues: {},
        createdAt,
      });
    });
  });

  manualRows.forEach((entry) => {
    rows.push({
      id: `manual-${entry._id}`,
      userId: entry.user,
      userName: entry.userName,
      userRole: entry.userRole,
      userRoleLabel: ROLE_LABELS[entry.userRole] || entry.userRole || 'User',
      patientId: '',
      patientName: entry.patientName || '',
      patientCode: entry.patientCode || '',
      patientCategory: '',
      currentStage: entry.currentStage || '',
      workType: entry.workType,
      details: entry.details || '',
      source: 'manual',
      customValues: entry.customValues || {},
      createdAt: entry.workDate || entry.createdAt,
    });
  });

  rows.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  const tabs = allowedUsers.map((user) => ({
    id: String(user.id),
    name: user.name,
    role: user.role,
    roleLabel: user.roleLabel,
    count: rows.filter((row) => row.userRole === user.role && row.userName === user.name).length,
  }));

  res.status(200).json({
    success: true,
    dateMode,
    date: dateMode === 'all' ? null : startOfDay(dateValue),
    tabs,
    customColumns: customColumns.map((column) => ({
      id: column._id,
      key: column.key,
      label: column.label,
    })),
    rows,
  });
});

const createWorksheetColumn = asyncHandler(async (req, res) => {
  const allowedViewerRoles = [ROLES.ADMIN, ROLES.DOCTOR, ROLES.MANAGER, ROLES.ASSISTANT_DOCTOR, ROLES.PSYCHOLOGIST];
  if (!allowedViewerRoles.includes(req.user.role)) {
    return res.status(403).json({ success: false, message: 'You do not have permission to add worksheet columns' });
  }

  const label = String(req.body.label || '').trim();
  if (!label) {
    return res.status(400).json({ success: false, message: 'Column name is required' });
  }

  let key = makeColumnKey(label);
  const existingCount = await WorksheetColumn.countDocuments({ key: new RegExp(`^${key}(?:_\\d+)?$`) });
  if (existingCount) key = `${key}_${existingCount + 1}`;

  const column = await WorksheetColumn.create({
    label,
    key,
    createdBy: req.user._id,
    createdByName: req.user.name,
  });

  res.status(201).json({
    success: true,
    column: { id: column._id, key: column.key, label: column.label },
  });
});

const createManualWorksheetRow = asyncHandler(async (req, res) => {
  const allowedViewerRoles = [ROLES.ADMIN, ROLES.DOCTOR, ROLES.MANAGER, ROLES.ASSISTANT_DOCTOR, ROLES.PSYCHOLOGIST];
  if (!allowedViewerRoles.includes(req.user.role)) {
    return res.status(403).json({ success: false, message: 'You do not have permission to add worksheet rows' });
  }

  const allowedUsers = await getAllowedUsers(req.user);
  const requestedUserId = req.body.userId || (allowedUsers.length === 1 ? allowedUsers[0].id : null);
  if (!requestedUserId || !canUseWorksheetUser(allowedUsers, requestedUserId)) {
    return res.status(403).json({ success: false, message: 'You cannot add a row for this user' });
  }

  const workType = String(req.body.workType || '').trim();
  if (!workType) {
    return res.status(400).json({ success: false, message: 'Work is required' });
  }

  const worksheetUser = allowedUsers.find((user) => String(user.id) === String(requestedUserId));
  const row = await WorksheetManualRow.create({
    user: worksheetUser.id,
    userName: worksheetUser.name,
    userRole: worksheetUser.role,
    workDate: req.body.workDate ? toLocalDate(req.body.workDate) : new Date(),
    patientName: req.body.patientName || '',
    patientCode: req.body.patientCode || '',
    currentStage: req.body.currentStage || '',
    workType,
    details: req.body.details || '',
    customValues: req.body.customValues || {},
    createdBy: req.user._id,
    createdByName: req.user.name,
  });

  res.status(201).json({ success: true, row });
});

module.exports = { getWorksheet, createWorksheetColumn, createManualWorksheetRow };
