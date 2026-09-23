const SalesSheetColumn = require('../models/SalesSheetColumn');
const SalesAppointment = require('../models/SalesAppointment');
const AppointmentManagementColumn = require('../models/AppointmentManagementColumn');
const AppointmentManagementEntry = require('../models/AppointmentManagementEntry');
const { asyncHandler } = require('../middleware/errorHandler');
const { ROLES } = require('../constants/roles');
const { dateRoom } = require('../realtime/salesSheetSocket');

const emitColumnsChanged = (req) => req.app.get('io')?.to('sales-sheet').emit('sales-sheet:columns-changed');
const emitDateChanged = (req, date) => req.app.get('io')?.to(dateRoom(date)).emit('sales-sheet:date-changed', { date });

const validDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''));
const serializeColumn = (column) => ({
  id: String(column._id), label: column.label, type: column.type, options: column.options || [],
  required: Boolean(column.required), order: column.order,
});
const serializeManagementEntry = (entry, user) => ({
  id: String(entry._id), appointmentDate: entry.appointmentDate,
  values: Object.fromEntries(entry.values || []),
  sourceAppointmentId: entry.sourceAppointment?._id ? String(entry.sourceAppointment._id) : null,
  salesValues: entry.sourceAppointment?.values ? Object.fromEntries(entry.sourceAppointment.values) : {},
  salesCreatedByName: entry.sourceAppointment?.createdByName || '',
  createdBy: String(entry.createdBy), createdByName: entry.createdByName,
  updatedByName: entry.updatedByName || '',
  canEdit: user.role === ROLES.ADMIN || user.role === ROLES.RECEPTIONIST,
  createdAt: entry.createdAt, updatedAt: entry.updatedAt,
});
const serializeRow = (row, user) => ({
  id: String(row._id), appointmentDate: row.appointmentDate,
  values: Object.fromEntries(row.values || []), createdBy: String(row.createdBy),
  createdByName: row.createdByName, updatedByName: row.updatedByName || '',
  canEdit: user.role === ROLES.ADMIN || String(row.createdBy) === String(user._id),
  canAccept: [ROLES.ADMIN, ROLES.RECEPTIONIST].includes(user.role),
  acceptedAt: row.acceptedAt || null, acceptedByName: row.acceptedByName || '',
  createdAt: row.createdAt, updatedAt: row.updatedAt,
});

const cleanValues = async (rawValues, requireComplete = true) => {
  const columns = await SalesSheetColumn.find({ isActive: true }).sort({ order: 1 }).lean();
  const values = {};
  for (const column of columns) {
    const value = String(rawValues?.[String(column._id)] ?? '').trim();
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
    const value = String(rawValues?.[String(column._id)] ?? '').trim();
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
  const allowed = ['text', 'number', 'phone', 'date', 'time', 'select', 'textarea'];
  if (!allowed.includes(type)) return res.status(400).json({ success: false, message: 'Invalid column type' });
  const last = await AppointmentManagementColumn.findOne({ isActive: true }).sort({ order: -1 }).lean();
  const column = await AppointmentManagementColumn.create({ label, type, required: Boolean(req.body.required), options: type === 'select' ? (req.body.options || []).map((v) => String(v).trim()).filter(Boolean) : [], order: (last?.order ?? -1) + 1, createdBy: req.user._id });
  emitColumnsChanged(req);
  res.status(201).json({ success: true, column: serializeColumn(column) });
});
const updateManagementColumn = asyncHandler(async (req, res) => {
  const column = await AppointmentManagementColumn.findOne({ _id: req.params.id, isActive: true });
  if (!column) return res.status(404).json({ success: false, message: 'Column not found' });
  if (req.body.label !== undefined) column.label = String(req.body.label || '').trim();
  if (!column.label) return res.status(400).json({ success: false, message: 'Column name is required' });
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

const createColumn = asyncHandler(async (req, res) => {
  const label = String(req.body.label || '').trim();
  if (!label) return res.status(400).json({ success: false, message: 'Column name is required' });
  const type = String(req.body.type || 'text');
  const allowed = ['text', 'number', 'phone', 'date', 'time', 'select', 'textarea'];
  if (!allowed.includes(type)) return res.status(400).json({ success: false, message: 'Invalid column type' });
  const last = await SalesSheetColumn.findOne({ isActive: true }).sort({ order: -1 }).lean();
  const column = await SalesSheetColumn.create({
    label, type, required: Boolean(req.body.required),
    options: type === 'select' ? (req.body.options || []).map((v) => String(v).trim()).filter(Boolean) : [],
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
  if (req.body.type !== undefined) column.type = req.body.type;
  if (req.body.required !== undefined) column.required = Boolean(req.body.required);
  if (req.body.order !== undefined) column.order = Number(req.body.order);
  if (req.body.options !== undefined) column.options = (req.body.options || []).map((v) => String(v).trim()).filter(Boolean);
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
  if (!validDate(req.query.date)) return res.status(400).json({ success: false, message: 'Valid date is required' });
  const rows = await SalesAppointment.find({ appointmentDate: req.query.date }).sort({ createdAt: 1 });
  res.json({ success: true, appointments: rows.map((row) => serializeRow(row, req.user)) });
});

const listManagedAppointments = asyncHandler(async (req, res) => {
  if (!validDate(req.query.date)) return res.status(400).json({ success: false, message: 'Valid date is required' });
  const accepted = await SalesAppointment.find({ appointmentDate: req.query.date, acceptedAt: { $ne: null } }).lean();
  if (accepted.length) {
    await AppointmentManagementEntry.bulkWrite(accepted.map((row) => ({ updateOne: { filter: { sourceAppointment: row._id }, update: { $setOnInsert: { appointmentDate: row.appointmentDate, sourceAppointment: row._id, values: {}, createdBy: row.acceptedBy || row.createdBy, createdByName: row.acceptedByName || row.createdByName } }, upsert: true } })));
  }
  const rows = await AppointmentManagementEntry.find({ appointmentDate: req.query.date }).populate('sourceAppointment').sort({ createdAt: 1 });
  res.json({ success: true, appointments: rows.map((row) => serializeManagementEntry(row, req.user)) });
});

const acceptAppointment = asyncHandler(async (req, res) => {
  const row = await SalesAppointment.findById(req.params.id);
  if (!row) return res.status(404).json({ success: false, message: 'Appointment not found' });
  if (!row.acceptedAt) {
    row.acceptedAt = new Date();
    row.acceptedBy = req.user._id;
    row.acceptedByName = req.user.name;
    await row.save();
    await AppointmentManagementEntry.findOneAndUpdate({ sourceAppointment: row._id }, { $setOnInsert: { appointmentDate: row.appointmentDate, sourceAppointment: row._id, values: {}, createdBy: req.user._id, createdByName: req.user.name } }, { upsert: true, new: true });
    emitDateChanged(req, row.appointmentDate);
  }
  res.json({ success: true, appointment: serializeRow(row, req.user) });
});

const createManagedAppointment = asyncHandler(async (req, res) => {
  if (!validDate(req.body.appointmentDate)) return res.status(400).json({ success: false, message: 'Valid appointment date is required' });
  const values = await cleanManagementValues(req.body.values);
  const row = await AppointmentManagementEntry.create({ appointmentDate: req.body.appointmentDate, values, createdBy: req.user._id, createdByName: req.user.name });
  emitDateChanged(req, row.appointmentDate);
  res.status(201).json({ success: true });
});
const updateManagedAppointment = asyncHandler(async (req, res) => {
  const row = await AppointmentManagementEntry.findById(req.params.id);
  if (!row) return res.status(404).json({ success: false, message: 'Management appointment not found' });
  row.values = await cleanManagementValues(req.body.values);
  row.updatedByName = req.user.name; await row.save(); emitDateChanged(req, row.appointmentDate);
  res.json({ success: true });
});
const deleteManagedAppointment = asyncHandler(async (req, res) => {
  const row = await AppointmentManagementEntry.findById(req.params.id);
  if (!row) return res.status(404).json({ success: false, message: 'Management appointment not found' });
  const date = row.appointmentDate; await row.deleteOne(); emitDateChanged(req, date);
  res.json({ success: true });
});

const createAppointment = asyncHandler(async (req, res) => {
  if (!validDate(req.body.appointmentDate)) return res.status(400).json({ success: false, message: 'Valid appointment date is required' });
  const values = await cleanValues(req.body.values);
  const row = await SalesAppointment.create({ appointmentDate: req.body.appointmentDate, values, createdBy: req.user._id, createdByName: req.user.name });
  emitDateChanged(req, row.appointmentDate);
  res.status(201).json({ success: true, appointment: serializeRow(row, req.user) });
});

const updateAppointment = asyncHandler(async (req, res) => {
  const row = await SalesAppointment.findById(req.params.id);
  if (!row) return res.status(404).json({ success: false, message: 'Appointment not found' });
  if (req.user.role !== ROLES.ADMIN && String(row.createdBy) !== String(req.user._id)) {
    return res.status(403).json({ success: false, message: 'Only the member who added this appointment can edit it' });
  }
  row.values = await cleanValues(req.body.values);
  row.updatedByName = req.user.name;
  await row.save();
  emitDateChanged(req, row.appointmentDate);
  res.json({ success: true, appointment: serializeRow(row, req.user) });
});

const deleteAppointment = asyncHandler(async (req, res) => {
  const row = await SalesAppointment.findById(req.params.id);
  if (!row) return res.status(404).json({ success: false, message: 'Appointment not found' });
  if (req.user.role !== ROLES.ADMIN && String(row.createdBy) !== String(req.user._id)) {
    return res.status(403).json({ success: false, message: 'Only the member who added this appointment can delete it' });
  }
  const appointmentDate = row.appointmentDate;
  await row.deleteOne();
  emitDateChanged(req, appointmentDate);
  res.json({ success: true });
});

module.exports = { listColumns, createColumn, updateColumn, deleteColumn, listManagementColumns, createManagementColumn, updateManagementColumn, deleteManagementColumn, listAppointments, listManagedAppointments, acceptAppointment, createManagedAppointment, updateManagedAppointment, deleteManagedAppointment, createAppointment, updateAppointment, deleteAppointment };
