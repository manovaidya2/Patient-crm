const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const SalesSheetColumn = require('../models/SalesSheetColumn');
const SalesAppointment = require('../models/SalesAppointment');
const AppointmentManagementColumn = require('../models/AppointmentManagementColumn');
const AppointmentManagementEntry = require('../models/AppointmentManagementEntry');
const SalesSheetLayout = require('../models/SalesSheetLayout');
const SalesSheetAudit = require('../models/SalesSheetAudit');
const { asyncHandler } = require('../middleware/errorHandler');
const { ROLES } = require('../constants/roles');
const { dateRoom } = require('../realtime/salesSheetSocket');

const emitColumnsChanged = (req) => req.app.get('io')?.to('sales-sheet').emit('sales-sheet:columns-changed');
const emitDateChanged = (req, date) => req.app.get('io')?.to(dateRoom(date)).emit('sales-sheet:date-changed', { date });
const uploadManagementAttachment = asyncHandler(async (req, res) => {
  if (!req.file) return res.status(400).json({ success: false, message: 'Choose a file first' });
  res.status(201).json({ success: true, file: { url: `/uploads/records/${req.file.filename}`, fileName: req.file.originalname } });
});

const validDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''));
const OPTION_TYPES = ['select', 'multi_select'];
const COLUMN_TYPES = ['text', 'number', 'phone', 'date', 'time', ...OPTION_TYPES, 'textarea', 'checkbox', 'file'];
const normalizeOptions = (rawOptions, type) => {
  if (!OPTION_TYPES.includes(type)) return [];
  if (!Array.isArray(rawOptions)) {
    const error = new Error('Options must be a list');
    error.statusCode = 400;
    throw error;
  }
  const options = [...new Set(rawOptions.map((option) => String(option).trim()).filter(Boolean))];
  if (type === 'multi_select' && (!options.length || options.some((option) => option.includes(',')))) {
    const error = new Error('Multiple choice needs options without commas');
    error.statusCode = 400;
    throw error;
  }
  return options;
};
const cleanColumnValue = (column, rawValue) => {
  const value = String(rawValue ?? '').trim();
  if (column.type === 'checkbox') return value === '☑' ? 'true' : value;
  if (column.type !== 'multi_select' || !value) return value;
  const selected = value.split(',').map((option) => option.trim()).filter(Boolean);
  const allowed = column.options || [];
  if (selected.some((option) => !allowed.includes(option))) {
    const error = new Error(`${column.label} has an invalid choice`);
    error.statusCode = 400;
    throw error;
  }
  return allowed.filter((option) => selected.includes(option)).join(', ');
};
const migrateLegacyAttachment = (value) => {
  const match = String(value || '').match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return null;
  const extension = ({ 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif', 'application/pdf': '.pdf' }[match[1]] || '.bin');
  const fileName = `appointment-${Date.now()}-${crypto.randomBytes(5).toString('hex')}${extension}`;
  const uploadDir = path.join(__dirname, '../../uploads/records');
  fs.mkdirSync(uploadDir, { recursive: true });
  fs.writeFileSync(path.join(uploadDir, fileName), Buffer.from(match[2], 'base64'));
  return `/uploads/records/${fileName}`;
};
const migrateLegacyFiles = async (row, columns, field = 'values') => {
  const values = row[field];
  let changed = false;
  for (const column of columns.filter((item) => item.type === 'file')) {
    const key = String(column._id);
    const migrated = migrateLegacyAttachment(values?.get ? values.get(key) : values?.[key]);
    if (migrated) { values.set(key, migrated); changed = true; }
  }
  if (changed) await row.save();
};
const createAppointmentCode = () => {
  const timestamp = Date.now().toString(36).toUpperCase();
  const suffix = Math.random().toString(36).slice(2, 4).toUpperCase();
  return `APT-${timestamp}-${suffix}`;
};
const recordAudit = async (req, { sheet, rowId, appointmentCode, action, details = '' }) => {
  try {
    await SalesSheetAudit.create({ sheet, rowId, appointmentCode: appointmentCode || '', action, details, changedBy: req.user._id, changedByName: req.user.name });
  } catch (error) {
    console.error('Sales sheet audit could not be saved:', error.message);
  }
};
const serializeColumn = (column) => ({
  id: String(column._id), label: column.label, type: column.type, options: column.options || [],
  required: Boolean(column.required), order: column.order,
  highlightValue: column.highlightValue || (column.type === 'select' && column.label?.trim().toLowerCase() === 'package status' ? 'Package Purchased' : ''),
});
const serializeManagementEntry = (entry, user) => ({
  id: String(entry._id), appointmentDate: entry.appointmentDate,
  values: Object.fromEntries(entry.values || []),
  sourceAppointmentId: entry.sourceAppointment?._id ? String(entry.sourceAppointment._id) : null,
  salesValues: Object.fromEntries(entry.salesValues || []),
  salesCreatedByName: entry.createdByName || '',
  appointmentCode: entry.appointmentCode || `APT-M-${String(entry._id).slice(-8).toUpperCase()}`,
  entryAt: entry.entryAt || entry.createdAt,
  acceptedAt: entry.acceptedAt || null, acceptedByName: entry.acceptedByName || '',
  lastEditedAt: entry.lastEditedAt || null,
  createdBy: String(entry.createdBy), createdByName: entry.createdByName,
  updatedByName: entry.updatedByName || '',
  canEdit: user.role === ROLES.ADMIN || user.role === ROLES.RECEPTIONIST,
  createdAt: entry.createdAt, updatedAt: entry.updatedAt,
});
const serializeRow = (row, user) => ({
  id: String(row._id), appointmentDate: row.appointmentDate,
  appointmentCode: row.appointmentCode || `APT-${String(row._id).slice(-8).toUpperCase()}`,
  values: Object.fromEntries(row.values || []), createdBy: String(row.createdBy),
  createdByName: row.createdByName, updatedByName: row.updatedByName || '',
  canEdit: row.status === 'active' && (user.role === ROLES.ADMIN || (user.role === ROLES.RECEPTIONIST && !row.acceptedAt) || (!row.acceptedAt && String(row.createdBy) === String(user._id))),
  canDelete: user.role !== ROLES.SALES_TEAM && (user.role === ROLES.ADMIN || (!row.acceptedAt && String(row.createdBy) === String(user._id))),
  canReschedule: row.status === 'active' && ([ROLES.ADMIN, ROLES.RECEPTIONIST].includes(user.role) || (!row.acceptedAt && user.role === ROLES.SALES_TEAM && String(row.createdBy) === String(user._id))),
  canMarkNotComing: !row.acceptedAt && (row.status === 'active' || row.status === 'not_coming') && ([ROLES.ADMIN, ROLES.RECEPTIONIST].includes(user.role) || String(row.createdBy) === String(user._id)),
  canAccept: [ROLES.ADMIN, ROLES.RECEPTIONIST].includes(user.role),
  acceptedAt: row.acceptedAt || null, acceptedByName: row.acceptedByName || '',
  entryAt: row.createdAt, lastEditedAt: row.lastEditedAt || null,
  status: row.status || 'active', notComingReason: row.notComingReason || '', notComingAt: row.notComingAt || null, notComingByName: row.notComingByName || '', rescheduledTo: row.rescheduledTo || '',
  ...([ROLES.ADMIN, ROLES.RECEPTIONIST].includes(user.role) ? { lastCallAt: row.lastCallAt || null, numberOfCalls: row.numberOfCalls || 0, callStatus: row.callStatus || 'pending', lastCallNotes: row.lastCallNotes || '' } : {}),
  rescheduledAt: row.rescheduledAt || null, rescheduledByName: row.rescheduledByName || '',
  createdAt: row.createdAt, updatedAt: row.updatedAt,
});

const cleanValues = async (rawValues, requireComplete = true) => {
  const columns = await SalesSheetColumn.find({ isActive: true }).sort({ order: 1 }).lean();
  const values = {};
  for (const column of columns) {
    const value = cleanColumnValue(column, rawValues?.[String(column._id)]);
    if (requireComplete && column.required && !value) {
      const error = new Error(`${column.label} is required`);
      error.statusCode = 400;
      throw error;
    }
    values[String(column._id)] = value;
  }
  return values;
};
const cleanManagementValues = async (rawValues) => {
  const columns = await AppointmentManagementColumn.find({ isActive: true }).sort({ order: 1 }).lean();
  const values = {};
  for (const column of columns) {
    const value = cleanColumnValue(column, rawValues?.[String(column._id)]);
    if (column.required && !value) {
      const error = new Error(`${column.label} is required`);
      error.statusCode = 400;
      throw error;
    }
    values[String(column._id)] = value;
  }
  return values;
};

const listManagementColumns = asyncHandler(async (req, res) => {
  const columns = await AppointmentManagementColumn.find({ isActive: true }).sort({ order: 1, createdAt: 1 }).lean();
  res.json({ success: true, columns: columns.map(serializeColumn) });
});
const createManagementColumn = asyncHandler(async (req, res) => {
  const label = String(req.body.label || '').trim();
  if (!label) return res.status(400).json({ success: false, message: 'Column name is required' });
  const type = String(req.body.type || 'text');
  const allowed = COLUMN_TYPES;
  if (!allowed.includes(type)) return res.status(400).json({ success: false, message: 'Invalid column type' });
  const last = await AppointmentManagementColumn.findOne({ isActive: true }).sort({ order: -1 }).lean();
  const isPackageStatus = label.toLowerCase() === 'package status';
  const options = normalizeOptions(req.body.options || [], type);
  if (type === 'select' && isPackageStatus && !options.length) options.push('Package Purchased', 'Package Not Purchased');
  const column = await AppointmentManagementColumn.create({ label, type, required: Boolean(req.body.required), options, highlightValue: OPTION_TYPES.includes(type) ? String(req.body.highlightValue || (isPackageStatus && type === 'select' ? 'Package Purchased' : '')).trim() : '', order: (last?.order ?? -1) + 1, createdBy: req.user._id });
  emitColumnsChanged(req);
  res.status(201).json({ success: true, column: serializeColumn(column) });
});
const updateManagementColumn = asyncHandler(async (req, res) => {
  const column = await AppointmentManagementColumn.findOne({ _id: req.params.id, isActive: true });
  if (!column) return res.status(404).json({ success: false, message: 'Column not found' });
  if (req.body.label !== undefined) column.label = String(req.body.label || '').trim();
  if (!column.label) return res.status(400).json({ success: false, message: 'Column name is required' });
  if (req.body.type !== undefined) {
    if (!COLUMN_TYPES.includes(req.body.type)) return res.status(400).json({ success: false, message: 'Invalid column type' });
    column.type = req.body.type;
  }
  if (req.body.required !== undefined) column.required = Boolean(req.body.required);
  if (req.body.options !== undefined && !Array.isArray(req.body.options)) return res.status(400).json({ success: false, message: 'Options must be a list' });
  if (req.body.order !== undefined) column.order = Number(req.body.order);
  if (req.body.options !== undefined) column.options = normalizeOptions(req.body.options, column.type);
  if (req.body.highlightValue !== undefined) column.highlightValue = String(req.body.highlightValue || '').trim();
  if (!OPTION_TYPES.includes(column.type)) { column.options = []; column.highlightValue = ''; }
  else if (column.type === 'multi_select') column.options = normalizeOptions(column.options, column.type);
  if (OPTION_TYPES.includes(column.type) && !column.options.includes(column.highlightValue)) column.highlightValue = '';
  await column.save(); emitColumnsChanged(req);
  res.json({ success: true, column: serializeColumn(column) });
});
const deleteManagementColumn = asyncHandler(async (req, res) => {
  const column = await AppointmentManagementColumn.findById(req.params.id);
  if (!column) return res.status(404).json({ success: false, message: 'Column not found' });
  column.isActive = false; await column.save(); emitColumnsChanged(req);
  res.json({ success: true });
});

const listColumns = asyncHandler(async (req, res) => {
  const columns = await SalesSheetColumn.find({ isActive: true }).sort({ order: 1, createdAt: 1 }).lean();
  res.json({ success: true, columns: columns.map(serializeColumn) });
});
const listLayout = asyncHandler(async (req, res) => {
  const sheet = req.query.sheet === 'management' ? 'management' : 'sales';
  const layout = await SalesSheetLayout.findOne({ sheet }).lean();
  res.json({ success: true, columns: layout?.columns || [] });
});
const updateLayout = asyncHandler(async (req, res) => {
  const sheet = req.body.sheet === 'management' ? 'management' : 'sales';
  const columns = Array.isArray(req.body.columns) ? req.body.columns.map((item, order) => ({ key: String(item.key), order })) : [];
  const layout = await SalesSheetLayout.findOneAndUpdate({ sheet }, { sheet, columns }, { upsert: true, new: true, setDefaultsOnInsert: true });
  emitColumnsChanged(req);
  res.json({ success: true, columns: layout.columns });
});

const createColumn = asyncHandler(async (req, res) => {
  const label = String(req.body.label || '').trim();
  if (!label) return res.status(400).json({ success: false, message: 'Column name is required' });
  const type = String(req.body.type || 'text');
  const allowed = COLUMN_TYPES;
  if (!allowed.includes(type)) return res.status(400).json({ success: false, message: 'Invalid column type' });
  const last = await SalesSheetColumn.findOne({ isActive: true }).sort({ order: -1 }).lean();
  const column = await SalesSheetColumn.create({
    label, type, required: Boolean(req.body.required),
    options: normalizeOptions(req.body.options || [], type),
    order: (last?.order ?? -1) + 1, createdBy: req.user._id,
  });
  emitColumnsChanged(req);
  res.status(201).json({ success: true, column: serializeColumn(column) });
});

const updateColumn = asyncHandler(async (req, res) => {
  const column = await SalesSheetColumn.findOne({ _id: req.params.id, isActive: true });
  if (!column) return res.status(404).json({ success: false, message: 'Column not found' });
  if (req.body.label !== undefined) {
    const label = String(req.body.label || '').trim();
    if (!label) return res.status(400).json({ success: false, message: 'Column name is required' });
    column.label = label;
  }
  if (req.body.type !== undefined) {
    if (!COLUMN_TYPES.includes(req.body.type)) return res.status(400).json({ success: false, message: 'Invalid column type' });
    column.type = req.body.type;
  }
  if (req.body.required !== undefined) column.required = Boolean(req.body.required);
  if (req.body.options !== undefined && !Array.isArray(req.body.options)) return res.status(400).json({ success: false, message: 'Options must be a list' });
  if (req.body.order !== undefined) column.order = Number(req.body.order);
  if (req.body.options !== undefined) column.options = normalizeOptions(req.body.options, column.type);
  if (!OPTION_TYPES.includes(column.type)) column.options = [];
  else if (column.type === 'multi_select') column.options = normalizeOptions(column.options, column.type);
  await column.save();
  emitColumnsChanged(req);
  res.json({ success: true, column: serializeColumn(column) });
});

const deleteColumn = asyncHandler(async (req, res) => {
  const column = await SalesSheetColumn.findById(req.params.id);
  if (!column) return res.status(404).json({ success: false, message: 'Column not found' });
  column.isActive = false;
  await column.save();
  emitColumnsChanged(req);
  res.json({ success: true });
});

const listAppointments = asyncHandler(async (req, res) => {
  if (req.query.date && !validDate(req.query.date)) return res.status(400).json({ success: false, message: 'Valid date is required' });
  const rows = await SalesAppointment.find(req.query.date ? { appointmentDate: req.query.date } : {}).select('-callHistory').sort({ createdAt: 1 });
  const columns = await SalesSheetColumn.find({ isActive: true }).select('_id type').lean();
  await Promise.all(rows.map((row) => migrateLegacyFiles(row, columns)));
  res.json({ success: true, appointments: rows.map((row) => serializeRow(row, req.user)) });
});

const listTimeline = asyncHandler(async (req, res) => {
  const sheet = req.params.sheet === 'management' ? 'management' : 'sales';
  let timeline = await SalesSheetAudit.find({ sheet, rowId: req.params.id }).sort({ createdAt: -1 }).lean();
  if (!timeline.length) {
    const Model = sheet === 'management' ? AppointmentManagementEntry : SalesAppointment;
    const row = await Model.findById(req.params.id).select('appointmentCode createdAt createdByName').lean();
    if (row) timeline = [{ _id: `initial-${row._id}`, action: sheet === 'management' ? 'Management row created' : 'Appointment created', details: 'Initial row record', changedByName: row.createdByName || 'System', createdAt: row.createdAt }];
  }
  res.json({ success: true, timeline: timeline.map((item) => ({ id: String(item._id), action: item.action, details: item.details, changedByName: item.changedByName, createdAt: item.createdAt })) });
});

const listManagedAppointments = asyncHandler(async (req, res) => {
  const dateFilter = validDate(req.query.date) ? { appointmentDate: req.query.date } : {};
  const accepted = await SalesAppointment.find({ ...dateFilter, acceptedAt: { $ne: null }, status: { $ne: 'rescheduled' } }).lean();
  if (accepted.length) {
    await AppointmentManagementEntry.bulkWrite(accepted.map((row) => ({ updateOne: { filter: { sourceAppointment: row._id }, update: { $setOnInsert: { appointmentDate: row.appointmentDate, sourceAppointment: row._id, appointmentCode: row.appointmentCode || `APT-${String(row._id).slice(-8).toUpperCase()}`, entryAt: row.createdAt, acceptedAt: row.acceptedAt, acceptedByName: row.acceptedByName || '', salesValues: row.values || {}, values: {}, createdBy: row.acceptedBy || row.createdBy, createdByName: row.createdByName } }, upsert: true } })));
  }
  const rows = await AppointmentManagementEntry.find(dateFilter).populate('sourceAppointment').sort({ createdAt: 1 });
  res.json({ success: true, appointments: rows.map((row) => serializeManagementEntry(row, req.user)) });
});

const acceptAppointment = asyncHandler(async (req, res) => {
  const row = await SalesAppointment.findById(req.params.id);
  if (!row) return res.status(404).json({ success: false, message: 'Appointment not found' });
  if (row.status !== 'active') return res.status(400).json({ success: false, message: 'Only active appointments can be accepted' });
  if (!row.acceptedAt) {
    row.acceptedAt = new Date();
    row.acceptedBy = req.user._id;
    row.acceptedByName = req.user.name;
    await row.save();
    await recordAudit(req, { sheet: 'sales', rowId: row._id, appointmentCode: row.appointmentCode, action: 'Appointment accepted', details: 'Accepted into Appointment Management' });
    const managementRow = await AppointmentManagementEntry.findOneAndUpdate({ sourceAppointment: row._id }, { $setOnInsert: { appointmentDate: row.appointmentDate, sourceAppointment: row._id, appointmentCode: row.appointmentCode, entryAt: row.createdAt, acceptedAt: row.acceptedAt, acceptedByName: req.user.name, salesValues: Object.fromEntries(row.values || []), values: {}, createdBy: req.user._id, createdByName: row.createdByName } }, { upsert: true, new: true });
    await recordAudit(req, { sheet: 'management', rowId: managementRow._id, appointmentCode: row.appointmentCode, action: 'Appointment accepted', details: 'Sales appointment added to Appointment Management' });
    emitDateChanged(req, row.appointmentDate);
  }
  res.json({ success: true, appointment: serializeRow(row, req.user) });
});

const rescheduleAppointment = asyncHandler(async (req, res) => {
  const nextDate = String(req.body.appointmentDate || '');
  if (!validDate(nextDate)) return res.status(400).json({ success: false, message: 'Valid reschedule date is required' });
  const row = await SalesAppointment.findById(req.params.id);
  if (!row) return res.status(404).json({ success: false, message: 'Appointment not found' });
  if (row.status !== 'active') return res.status(400).json({ success: false, message: 'Only active appointments can be rescheduled' });
  if (row.acceptedAt && req.user.role === ROLES.SALES_TEAM) return res.status(403).json({ success: false, message: 'Accepted appointments cannot be rescheduled by Sales Team' });
  const allowed = [ROLES.ADMIN, ROLES.RECEPTIONIST].includes(req.user.role) || (req.user.role === ROLES.SALES_TEAM && String(row.createdBy) === String(req.user._id));
  if (!allowed) return res.status(403).json({ success: false, message: 'You cannot reschedule this appointment' });
  if (nextDate === row.appointmentDate) return res.status(400).json({ success: false, message: 'Choose a different appointment date' });

  const replacement = await SalesAppointment.create({ appointmentCode: createAppointmentCode(), appointmentDate: nextDate, values: Object.fromEntries(row.values || []), createdBy: row.createdBy, createdByName: row.createdByName, updatedByName: req.user.name, lastCallAt: row.lastCallAt, numberOfCalls: row.numberOfCalls, callStatus: row.callStatus, lastCallNotes: row.lastCallNotes, callHistory: row.callHistory || [] });
  row.status = 'rescheduled';
  row.rescheduledTo = nextDate;
  row.rescheduledAt = new Date();
  row.rescheduledByName = req.user.name;
  row.rescheduledAppointment = replacement._id;
  await row.save();
  await recordAudit(req, { sheet: 'sales', rowId: row._id, appointmentCode: row.appointmentCode, action: 'Appointment rescheduled', details: `Moved to ${nextDate}; replacement ${replacement.appointmentCode}` });
  await recordAudit(req, { sheet: 'sales', rowId: replacement._id, appointmentCode: replacement.appointmentCode, action: 'Rescheduled appointment created', details: `Created from ${row.appointmentCode}` });
  await AppointmentManagementEntry.deleteOne({ sourceAppointment: row._id });
  emitDateChanged(req, row.appointmentDate);
  emitDateChanged(req, nextDate);
  res.status(201).json({ success: true, appointment: serializeRow(replacement, req.user) });
});

const markNotComing = asyncHandler(async (req, res) => {
  const reason = String(req.body.reason || '').trim();
  if (!reason) return res.status(400).json({ success: false, message: 'Not coming reason is required' });
  if (reason.length > 2000) return res.status(400).json({ success: false, message: 'Reason is too long' });
  const filter = { _id: req.params.id, status: { $in: ['active', 'not_coming'] }, acceptedAt: null };
  if (req.user.role === ROLES.SALES_TEAM) filter.createdBy = req.user._id;
  const row = await SalesAppointment.findOneAndUpdate(filter, { $set: { status: 'not_coming', notComingReason: reason, notComingAt: new Date(), notComingByName: req.user.name, updatedByName: req.user.name, lastEditedAt: new Date() } }, { new: true });
  if (!row) return res.status(409).json({ success: false, message: 'Appointment is unavailable or you cannot update it' });
  await recordAudit(req, { sheet: 'sales', rowId: row._id, appointmentCode: row.appointmentCode, action: 'Marked not coming', details: reason });
  emitDateChanged(req, row.appointmentDate);
  res.json({ success: true, appointment: serializeRow(row, req.user) });
});

const clearNotComing = asyncHandler(async (req, res) => {
  const filter = { _id: req.params.id, status: 'not_coming', acceptedAt: null };
  if (req.user.role === ROLES.SALES_TEAM) filter.createdBy = req.user._id;
  const row = await SalesAppointment.findOneAndUpdate(filter, { $set: { status: 'active', notComingReason: '', notComingAt: null, notComingByName: '', updatedByName: req.user.name, lastEditedAt: new Date() } }, { new: true });
  if (!row) return res.status(409).json({ success: false, message: 'Appointment is unavailable or you cannot update it' });
  await recordAudit(req, { sheet: 'sales', rowId: row._id, appointmentCode: row.appointmentCode, action: 'Not coming cleared' });
  emitDateChanged(req, row.appointmentDate);
  res.json({ success: true, appointment: serializeRow(row, req.user) });
});

const logCall = asyncHandler(async (req, res) => {
  if (![ROLES.ADMIN, ROLES.RECEPTIONIST].includes(req.user.role)) return res.status(403).json({ success: false, message: 'Only Admin and Receptionist can record calls' });
  const status = req.body?.status;
  const notes = typeof req.body?.notes === 'string' ? req.body.notes.trim() : '';
  if (!['connected', 'no_answer', 'follow_up'].includes(status)) return res.status(400).json({ success: false, message: 'Select the call outcome' });
  if (!notes || notes.length > 2000) return res.status(400).json({ success: false, message: 'Enter call details (up to 2000 characters)' });
  const calledAt = new Date();
  const row = await SalesAppointment.findOneAndUpdate({ _id: req.params.id, status: 'active' }, {
    $inc: { numberOfCalls: 1 },
    $set: { lastCallAt: calledAt, callStatus: status, lastCallNotes: notes },
    $push: { callHistory: { status, notes, calledAt, calledBy: req.user._id, calledByName: req.user.name } },
  }, { new: true, runValidators: true });
  if (!row) return res.status(409).json({ success: false, message: 'Only active appointments can log calls' });
  await recordAudit(req, { sheet: 'sales', rowId: row._id, appointmentCode: row.appointmentCode, action: 'Call logged', details: `Call ${row.numberOfCalls} | ${status.replace('_', ' ')} | ${notes}` });
  emitDateChanged(req, row.appointmentDate);
  res.json({ success: true, appointment: serializeRow(row, req.user) });
});

const listCalls = asyncHandler(async (req, res) => {
  if (![ROLES.ADMIN, ROLES.RECEPTIONIST].includes(req.user.role)) return res.status(403).json({ success: false, message: 'Only Admin and Receptionist can view call history' });
  const row = await SalesAppointment.findById(req.params.id).select('appointmentCode status numberOfCalls callStatus lastCallAt callHistory').lean();
  if (!row) return res.status(404).json({ success: false, message: 'Appointment not found' });
  const calls = (row.callHistory || []).map((call, index) => ({
    id: String(call._id), number: Math.max(0, (row.numberOfCalls || 0) - (row.callHistory || []).length) + index + 1,
    status: call.status, notes: call.notes, calledAt: call.calledAt,
    calledBy: String(call.calledBy), calledByName: call.calledByName,
  })).reverse();
  res.json({ success: true, calls, numberOfCalls: row.numberOfCalls || 0,
    legacyCount: Math.max(0, (row.numberOfCalls || 0) - calls.length),
    callStatus: row.callStatus || 'pending', lastCallAt: row.lastCallAt || null, canLog: row.status === 'active' });
});

const updateCallStatus = asyncHandler(async (req, res) => {
  const status = String(req.body.status || '');
  if (!['pending', 'connected', 'no_answer', 'follow_up'].includes(status)) return res.status(400).json({ success: false, message: 'Invalid call status' });
  const row = await SalesAppointment.findOneAndUpdate({ _id: req.params.id, status: 'active' }, { $set: { callStatus: status } }, { new: true });
  if (!row) return res.status(409).json({ success: false, message: 'Only active appointments can change call status' });
  await recordAudit(req, { sheet: 'sales', rowId: row._id, appointmentCode: row.appointmentCode, action: 'Call status changed', details: status.replace('_', ' ') });
  emitDateChanged(req, row.appointmentDate);
  res.json({ success: true, appointment: serializeRow(row, req.user) });
});

const createManagedAppointment = asyncHandler(async (req, res) => {
  if (!validDate(req.body.appointmentDate)) return res.status(400).json({ success: false, message: 'Valid appointment date is required' });
  const values = await cleanManagementValues(req.body.values);
  const salesValues = await cleanValues(req.body.salesValues || {});
  const row = await AppointmentManagementEntry.create({ appointmentDate: req.body.appointmentDate, appointmentCode: createAppointmentCode(), entryAt: new Date(), salesValues, values, createdBy: req.user._id, createdByName: req.user.name });
  await recordAudit(req, { sheet: 'management', rowId: row._id, appointmentCode: row.appointmentCode, action: 'Management row created', details: 'Appointment added directly to Appointment Management' });
  emitDateChanged(req, row.appointmentDate);
  res.status(201).json({ success: true });
});
const updateManagedAppointment = asyncHandler(async (req, res) => {
  const row = await AppointmentManagementEntry.findById(req.params.id);
  if (!row) return res.status(404).json({ success: false, message: 'Management appointment not found' });
  if (req.body.salesValues !== undefined) row.salesValues = await cleanValues(req.body.salesValues || {});
  row.values = await cleanManagementValues(req.body.values);
  row.updatedByName = req.user.name; row.lastEditedAt = new Date(); await row.save(); emitDateChanged(req, row.appointmentDate);
  await recordAudit(req, { sheet: 'management', rowId: row._id, appointmentCode: row.appointmentCode, action: 'Management row updated', details: 'Appointment details edited' });
  res.json({ success: true });
});
const deleteManagedAppointment = asyncHandler(async (req, res) => {
  const row = await AppointmentManagementEntry.findById(req.params.id);
  if (!row) return res.status(404).json({ success: false, message: 'Management appointment not found' });
  const date = row.appointmentDate; await recordAudit(req, { sheet: 'management', rowId: row._id, appointmentCode: row.appointmentCode, action: 'Management row deleted', details: 'Appointment removed from Appointment Management' }); await row.deleteOne(); emitDateChanged(req, date);
  res.json({ success: true });
});

const createAppointment = asyncHandler(async (req, res) => {
  if (!validDate(req.body.appointmentDate)) return res.status(400).json({ success: false, message: 'Valid appointment date is required' });
  const values = await cleanValues(req.body.values);
  const row = await SalesAppointment.create({ appointmentCode: createAppointmentCode(), appointmentDate: req.body.appointmentDate, values, createdBy: req.user._id, createdByName: req.user.name });
  await recordAudit(req, { sheet: 'sales', rowId: row._id, appointmentCode: row.appointmentCode, action: 'Appointment created', details: 'Appointment added to Sales Appointment Sheet' });
  emitDateChanged(req, row.appointmentDate);
  res.status(201).json({ success: true, appointment: serializeRow(row, req.user) });
});

const updateAppointment = asyncHandler(async (req, res) => {
  const row = await SalesAppointment.findById(req.params.id);
  if (!row) return res.status(404).json({ success: false, message: 'Appointment not found' });
  if (row.status !== 'active') return res.status(400).json({ success: false, message: 'Only active appointments can be edited' });
  if (row.acceptedAt && req.user.role !== ROLES.ADMIN) return res.status(403).json({ success: false, message: 'Accepted appointments can only be edited in Appointment Management' });
  if (![ROLES.ADMIN, ROLES.RECEPTIONIST].includes(req.user.role) && String(row.createdBy) !== String(req.user._id)) {
    return res.status(403).json({ success: false, message: 'Only the member who added this appointment can edit it' });
  }
  row.values = await cleanValues(req.body.values);
  row.updatedByName = req.user.name;
  row.lastEditedAt = new Date();
  await row.save();
  await recordAudit(req, { sheet: 'sales', rowId: row._id, appointmentCode: row.appointmentCode, action: 'Appointment updated', details: 'Appointment details edited' });
  emitDateChanged(req, row.appointmentDate);
  res.json({ success: true, appointment: serializeRow(row, req.user) });
});

const deleteAppointment = asyncHandler(async (req, res) => {
  if (req.user.role === ROLES.SALES_TEAM) return res.status(403).json({ success: false, message: 'Sales Team members cannot delete appointments' });
  const row = await SalesAppointment.findById(req.params.id);
  if (!row) return res.status(404).json({ success: false, message: 'Appointment not found' });
  if (row.acceptedAt && req.user.role !== ROLES.ADMIN) return res.status(403).json({ success: false, message: 'Accepted appointments cannot be deleted by Sales Team' });
  if (req.user.role !== ROLES.ADMIN && String(row.createdBy) !== String(req.user._id)) {
    return res.status(403).json({ success: false, message: 'Only the member who added this appointment can delete it' });
  }
  const appointmentDate = row.appointmentDate;
  await recordAudit(req, { sheet: 'sales', rowId: row._id, appointmentCode: row.appointmentCode, action: 'Appointment deleted', details: 'Appointment removed from Sales Appointment Sheet' });
  await row.deleteOne();
  emitDateChanged(req, appointmentDate);
  res.json({ success: true });
});

module.exports = { listColumns, createColumn, updateColumn, deleteColumn, listLayout, updateLayout, listManagementColumns, createManagementColumn, updateManagementColumn, deleteManagementColumn, uploadManagementAttachment, listAppointments, listTimeline, listManagedAppointments, acceptAppointment, rescheduleAppointment, markNotComing, clearNotComing, logCall, listCalls, updateCallStatus, createManagedAppointment, updateManagedAppointment, deleteManagedAppointment, createAppointment, updateAppointment, deleteAppointment };
