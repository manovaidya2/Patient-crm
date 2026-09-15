const PackageNotBoughtPatient = require('../models/PackageNotBoughtPatient');
const { asyncHandler } = require('../middleware/errorHandler');
const { ROLES } = require('../constants/roles');

const ACCESS_ROLES = [ROLES.ADMIN, ROLES.POST_COUNSELOR];
const FOLLOWUP_WRITE_ROLES = [ROLES.ADMIN, ROLES.POST_COUNSELOR];

const formatFollowUp = (entry) => ({
  id: entry._id,
  dateTime: entry.dateTime,
  notes: entry.notes || '',
  status: entry.status || 'scheduled',
  completionDetails: entry.completionDetails || '',
  completedAt: entry.completedAt || null,
  completedByName: entry.completedByName || '',
  createdByName: entry.createdByName || '',
  createdAt: entry.createdAt,
  updatedAt: entry.updatedAt,
});

const formatRow = (row) => ({
  id: row._id,
  patientName: row.patientName,
  parentName: row.parentName || '',
  fatherNumber: row.fatherNumber || '',
  motherNumber: row.motherNumber || '',
  age: row.age || '',
  program: row.program || '',
  reason: row.reason || '',
  followUpDate: row.followUpDate || null,
  notes: row.notes || '',
  followUps: (row.followUps || []).map(formatFollowUp).sort((a, b) => new Date(b.dateTime) - new Date(a.dateTime)),
  status: row.status || 'open',
  convertedAt: row.convertedAt || null,
  convertedByName: row.convertedByName || '',
  conversionDetails: row.conversionDetails || '',
  createdByName: row.createdByName || '',
  updatedByName: row.updatedByName || '',
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

const parseDateOnly = (value) => {
  const text = String(value || '').trim();
  if (!text) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return undefined;
  return new Date(`${text}T00:00:00.000+05:30`);
};

const parseDateTime = (value) => {
  const text = String(value || '').trim();
  if (!text) return null;
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? undefined : date;
};

const sameTime = (left, right) => left && right && new Date(left).getTime() === new Date(right).getTime();

const syncNextFollowUpDate = (row) => {
  const pending = [...(row.followUps || [])]
    .filter((entry) => (entry.status || 'scheduled') !== 'completed' && entry.dateTime)
    .sort((a, b) => new Date(a.dateTime) - new Date(b.dateTime));
  row.followUpDate = pending[0]?.dateTime || null;
};

const ensureFollowUpForDate = (row, dateTime, createdByName = '') => {
  if (!dateTime) return;
  const exists = (row.followUps || []).some((entry) => sameTime(entry.dateTime, dateTime));
  if (exists) return;
  row.followUps.push({
    dateTime,
    notes: 'Initial next follow-up',
    createdByName,
  });
};

const getPackageNotBoughtById = asyncHandler(async (req, res) => {
  const row = await PackageNotBoughtPatient.findById(req.params.id);
  if (!row) {
    return res.status(404).json({ success: false, message: 'Record not found' });
  }
  if (row.followUpDate && !(row.followUps || []).some((entry) => sameTime(entry.dateTime, row.followUpDate))) {
    ensureFollowUpForDate(row, row.followUpDate, row.createdByName || 'System');
    syncNextFollowUpDate(row);
    await row.save();
  }
  res.status(200).json({ success: true, row: formatRow(row) });
});

const listPackageNotBought = asyncHandler(async (req, res) => {
  const { search = '', page = 1, limit = 10 } = req.query;
  const filter = {};

  if (search) {
    filter.$or = [
      { patientName: { $regex: search, $options: 'i' } },
      { parentName: { $regex: search, $options: 'i' } },
      { fatherNumber: { $regex: search, $options: 'i' } },
      { motherNumber: { $regex: search, $options: 'i' } },
      { program: { $regex: search, $options: 'i' } },
    ];
  }

  const pageNum = Math.max(parseInt(page, 10) || 1, 1);
  const limitNum = Math.min(Math.max(parseInt(limit, 10) || 10, 1), 100);
  const skip = (pageNum - 1) * limitNum;

  const [rows, total] = await Promise.all([
    PackageNotBoughtPatient.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum)
      .lean(),
    PackageNotBoughtPatient.countDocuments(filter),
  ]);

  res.status(200).json({
    success: true,
    rows: rows.map(formatRow),
    total,
    page: pageNum,
    pages: Math.max(Math.ceil(total / limitNum), 1),
  });
});

const createPackageNotBought = asyncHandler(async (req, res) => {
  const { patientName, parentName, fatherNumber, motherNumber, age, program, reason, followUpDate, notes } = req.body;
  const name = String(patientName || '').trim();
  if (!name) {
    return res.status(400).json({ success: false, message: 'Patient name is required' });
  }

  const parsedFollowUpDate = parseDateOnly(followUpDate);
  if (parsedFollowUpDate === undefined) {
    return res.status(400).json({ success: false, message: 'Invalid follow-up date' });
  }

  const row = await PackageNotBoughtPatient.create({
    patientName: name,
    parentName: String(parentName || '').trim(),
    fatherNumber: String(fatherNumber || '').trim(),
    motherNumber: String(motherNumber || '').trim(),
    age: String(age || '').trim(),
    program: String(program || '').trim(),
    reason: String(reason || '').trim(),
    followUpDate: parsedFollowUpDate,
    notes: String(notes || '').trim(),
    createdBy: req.user._id,
    createdByName: req.user.name,
    followUps: parsedFollowUpDate
      ? [{ dateTime: parsedFollowUpDate, notes: 'Initial next follow-up', createdByName: req.user.name }]
      : [],
  });

  res.status(201).json({ success: true, row: formatRow(row) });
});

const updatePackageNotBought = asyncHandler(async (req, res) => {
  const row = await PackageNotBoughtPatient.findById(req.params.id);
  if (!row) {
    return res.status(404).json({ success: false, message: 'Record not found' });
  }

  const fields = ['patientName', 'parentName', 'fatherNumber', 'motherNumber', 'age', 'program', 'reason', 'notes'];
  fields.forEach((field) => {
    if (req.body[field] !== undefined) row[field] = String(req.body[field] || '').trim();
  });
  if (!String(row.patientName || '').trim()) {
    return res.status(400).json({ success: false, message: 'Patient name is required' });
  }
  if (req.body.followUpDate !== undefined) {
    const parsedFollowUpDate = parseDateOnly(req.body.followUpDate);
    if (parsedFollowUpDate === undefined) {
      return res.status(400).json({ success: false, message: 'Invalid follow-up date' });
    }
    ensureFollowUpForDate(row, parsedFollowUpDate, req.user.name);
    syncNextFollowUpDate(row);
  }
  row.updatedByName = req.user.name;
  await row.save();

  res.status(200).json({ success: true, row: formatRow(row) });
});

const addPackageNotBoughtFollowUp = asyncHandler(async (req, res) => {
  const row = await PackageNotBoughtPatient.findById(req.params.id);
  if (!row) {
    return res.status(404).json({ success: false, message: 'Record not found' });
  }
  if ((row.status || 'open') === 'converted') {
    return res.status(400).json({ success: false, message: 'Converted record cannot receive new follow-ups' });
  }

  const dateTime = parseDateTime(req.body.dateTime);
  if (!dateTime) {
    return res.status(400).json({ success: false, message: 'Follow-up date and time is required' });
  }

  row.followUps.push({
    dateTime,
    notes: String(req.body.notes || '').trim(),
    createdByName: req.user.name,
  });
  syncNextFollowUpDate(row);
  row.updatedByName = req.user.name;
  await row.save();

  res.status(201).json({ success: true, row: formatRow(row) });
});

const completePackageNotBoughtFollowUp = asyncHandler(async (req, res) => {
  const row = await PackageNotBoughtPatient.findById(req.params.id);
  if (!row) {
    return res.status(404).json({ success: false, message: 'Record not found' });
  }

  const followUp = row.followUps.id(req.params.followUpId);
  if (!followUp) {
    return res.status(404).json({ success: false, message: 'Follow-up not found' });
  }
  const completionNote = String(req.body.completionDetails || '').trim();
  if (!completionNote) {
    return res.status(400).json({ success: false, message: 'Completion note is required' });
  }

  followUp.status = 'completed';
  followUp.completionDetails = completionNote;
  followUp.completedAt = new Date();
  followUp.completedByName = req.user.name;
  syncNextFollowUpDate(row);
  row.updatedByName = req.user.name;
  await row.save();

  res.status(200).json({ success: true, row: formatRow(row) });
});

const markPackageNotBoughtConverted = asyncHandler(async (req, res) => {
  const row = await PackageNotBoughtPatient.findById(req.params.id);
  if (!row) {
    return res.status(404).json({ success: false, message: 'Record not found' });
  }

  row.status = 'converted';
  row.convertedAt = new Date();
  row.convertedByName = req.user.name;
  row.conversionDetails = String(req.body.conversionDetails || '').trim();
  row.updatedByName = req.user.name;
  await row.save();

  res.status(200).json({ success: true, row: formatRow(row) });
});

const deletePackageNotBought = asyncHandler(async (req, res) => {
  if (req.user.role !== ROLES.ADMIN) {
    return res.status(403).json({ success: false, message: 'Only Admin can delete records' });
  }
  const row = await PackageNotBoughtPatient.findById(req.params.id);
  if (!row) {
    return res.status(404).json({ success: false, message: 'Record not found' });
  }
  await row.deleteOne();
  res.status(200).json({ success: true });
});

module.exports = {
  ACCESS_ROLES,
  FOLLOWUP_WRITE_ROLES,
  listPackageNotBought,
  getPackageNotBoughtById,
  createPackageNotBought,
  updatePackageNotBought,
  addPackageNotBoughtFollowUp,
  completePackageNotBoughtFollowUp,
  markPackageNotBoughtConverted,
  deletePackageNotBought,
};
