const SalesSheetColumn = require('../models/SalesSheetColumn');
const SalesAppointment = require('../models/SalesAppointment');
const AppointmentManagementColumn = require('../models/AppointmentManagementColumn');
const AppointmentManagementEntry = require('../models/AppointmentManagementEntry');
const SalesSheetLayout = require('../models/SalesSheetLayout');
const { asyncHandler } = require('../middleware/errorHandler');
const { ROLES } = require('../constants/roles');
const { dateRoom } = require('../realtime/salesSheetSocket');

const emitColumnsChanged = (req) => req.app.get('io')?.to('sales-sheet').emit('sales-sheet:columns-changed');
const emitDateChanged = (req, date) => req.app.get('io')?.to(dateRoom(date)).emit('sales-sheet:date-changed', { date });

const validDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''));
const createAppointmentCode = () => {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(new Date()).reduce((result, part) => ({ ...result, [part.type]: part.value }), {});
  return `APT-${parts.year}${parts.month}${parts.day}-${parts.hour}${parts.minute}${parts.second}-${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
};
const serializeColumn = (column) => ({
  id: String(column._id), label: column.label, type: column.type, options: column.options || [],
  required: Boolean(column.required), order: column.order,
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
  canEdit: row.status !== 'rescheduled' && (user.role === ROLES.ADMIN || (!row.acceptedAt && String(row.createdBy) === String(user._id))),
  canDelete: user.role === ROLES.ADMIN || (!row.acceptedAt && String(row.createdBy) === String(user._id)),
  canReschedule: row.status !== 'rescheduled' && ([ROLES.ADMIN, ROLES.RECEPTIONIST].includes(user.role) || (!row.acceptedAt && user.role === ROLES.SALES_TEAM && String(row.createdBy) === String(user._id))),
  canAccept: [ROLES.ADMIN, ROLES.RECEPTIONIST].includes(user.role),
  acceptedAt: row.acceptedAt || null, acceptedByName: row.acceptedByName || '',
  entryAt: row.createdAt, lastEditedAt: row.lastEditedAt || null,
  status: row.status || 'active', rescheduledTo: row.rescheduledTo || '',
  rescheduledAt: row.rescheduledAt || null, rescheduledByName: row.rescheduledByName || '',
  createdAt: row.createdAt, updatedAt: row.updatedAt,
});

const cleanValues = async (rawValues, requireComplete = true) => {
  const columns = await SalesSheetColumn.find({ isActive: true }).sort({ order: 1 }).lean();
  const values = {};
  for (const column of columns) {
    const value = column.type === 'checkbox' ? (String(rawValues?.[String(column._id)] ?? '') === '☑' ? 'true' : String(rawValues?.[String(column._id)] ?? '').trim()) : String(rawValues?.[String(column._id)] ?? '').trim();
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
    const value = column.type === 'checkbox' ? (String(rawValues?.[String(column._id)] ?? '') === '☑' ? 'true' : String(rawValues?.[String(column._id)] ?? '').trim()) : String(rawValues?.[String(column._id)] ?? '').trim();
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
  const allowed = ['text', 'number', 'phone', 'date', 'time', 'select', 'textarea', 'checkbox', 'file'];
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
  if (req.body.order !== undefined) column.order = Number(req.body.order);
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
  const allowed = ['text', 'number', 'phone', 'date', 'time', 'select', 'textarea', 'checkbox', 'file'];
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
  const accepted = await SalesAppointment.find({ appointmentDate: req.query.date, acceptedAt: { $ne: null }, status: { $ne: 'rescheduled' } }).lean();
  if (accepted.length) {
    await AppointmentManagementEntry.bulkWrite(accepted.map((row) => ({ updateOne: { filter: { sourceAppointment: row._id }, update: { $setOnInsert: { appointmentDate: row.appointmentDate, sourceAppointment: row._id, appointmentCode: row.appointmentCode || `APT-${String(row._id).slice(-8).toUpperCase()}`, entryAt: row.createdAt, acceptedAt: row.acceptedAt, acceptedByName: row.acceptedByName || '', salesValues: row.values || {}, values: {}, createdBy: row.acceptedBy || row.createdBy, createdByName: row.createdByName } }, upsert: true } })));
  }
  const rows = await AppointmentManagementEntry.find({ appointmentDate: req.query.date }).populate('sourceAppointment').sort({ createdAt: 1 });
  res.json({ success: true, appointments: rows.map((row) => serializeManagementEntry(row, req.user)) });
});

const acceptAppointment = asyncHandler(async (req, res) => {
  const row = await SalesAppointment.findById(req.params.id);
  if (!row) return res.status(404).json({ success: false, message: 'Appointment not found' });
  if (row.status === 'rescheduled') return res.status(400).json({ success: false, message: 'A rescheduled appointment cannot be accepted' });
  if (!row.acceptedAt) {
    row.acceptedAt = new Date();
    row.acceptedBy = req.user._id;
    row.acceptedByName = req.user.name;
    await row.save();
    await AppointmentManagementEntry.findOneAndUpdate({ sourceAppointment: row._id }, { $setOnInsert: { appointmentDate: row.appointmentDate, sourceAppointment: row._id, appointmentCode: row.appointmentCode, entryAt: row.createdAt, acceptedAt: row.acceptedAt, acceptedByName: req.user.name, salesValues: Object.fromEntries(row.values || []), values: {}, createdBy: req.user._id, createdByName: row.createdByName } }, { upsert: true, new: true });
    emitDateChanged(req, row.appointmentDate);
  }
  res.json({ success: true, appointment: serializeRow(row, req.user) });
});

const rescheduleAppointment = asyncHandler(async (req, res) => {
  const nextDate = String(req.body.appointmentDate || '');
  if (!validDate(nextDate)) return res.status(400).json({ success: false, message: 'Valid reschedule date is required' });
  const row = await SalesAppointment.findById(req.params.id);
  if (!row) return res.status(404).json({ success: false, message: 'Appointment not found' });
  if (row.status === 'rescheduled') return res.status(400).json({ success: false, message: 'This appointment is already rescheduled' });
  if (row.acceptedAt && req.user.role === ROLES.SALES_TEAM) return res.status(403).json({ success: false, message: 'Accepted appointments cannot be rescheduled by Sales Team' });
  const allowed = [ROLES.ADMIN, ROLES.RECEPTIONIST].includes(req.user.role) || (req.user.role === ROLES.SALES_TEAM && String(row.createdBy) === String(req.user._id));
  if (!allowed) return res.status(403).json({ success: false, message: 'You cannot reschedule this appointment' });
  if (nextDate === row.appointmentDate) return res.status(400).json({ success: false, message: 'Choose a different appointment date' });

  const replacement = await SalesAppointment.create({ appointmentCode: createAppointmentCode(), appointmentDate: nextDate, values: Object.fromEntries(row.values || []), createdBy: row.createdBy, createdByName: row.createdByName, updatedByName: req.user.name });
  row.status = 'rescheduled';
  row.rescheduledTo = nextDate;
  row.rescheduledAt = new Date();
  row.rescheduledByName = req.user.name;
  row.rescheduledAppointment = replacement._id;
  await row.save();
  await AppointmentManagementEntry.deleteOne({ sourceAppointment: row._id });
  emitDateChanged(req, row.appointmentDate);
  emitDateChanged(req, nextDate);
  res.status(201).json({ success: true, appointment: serializeRow(replacement, req.user) });
});

const createManagedAppointment = asyncHandler(async (req, res) => {
  if (!validDate(req.body.appointmentDate)) return res.status(400).json({ success: false, message: 'Valid appointment date is required' });
  const values = await cleanManagementValues(req.body.values);
  const salesValues = await cleanValues(req.body.salesValues || {});
  const row = await AppointmentManagementEntry.create({ appointmentDate: req.body.appointmentDate, appointmentCode: createAppointmentCode(), entryAt: new Date(), salesValues, values, createdBy: req.user._id, createdByName: req.user.name });
  emitDateChanged(req, row.appointmentDate);
  res.status(201).json({ success: true });
});
const updateManagedAppointment = asyncHandler(async (req, res) => {
  const row = await AppointmentManagementEntry.findById(req.params.id);
  if (!row) return res.status(404).json({ success: false, message: 'Management appointment not found' });
  if (req.body.salesValues !== undefined) row.salesValues = await cleanValues(req.body.salesValues || {});
  row.values = await cleanManagementValues(req.body.values);
  row.updatedByName = req.user.name; row.lastEditedAt = new Date(); await row.save(); emitDateChanged(req, row.appointmentDate);
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
  const row = await SalesAppointment.create({ appointmentCode: createAppointmentCode(), appointmentDate: req.body.appointmentDate, values, createdBy: req.user._id, createdByName: req.user.name });
  emitDateChanged(req, row.appointmentDate);
  res.status(201).json({ success: true, appointment: serializeRow(row, req.user) });
});

const updateAppointment = asyncHandler(async (req, res) => {
  const row = await SalesAppointment.findById(req.params.id);
  if (!row) return res.status(404).json({ success: false, message: 'Appointment not found' });
  if (row.acceptedAt && req.user.role !== ROLES.ADMIN) return res.status(403).json({ success: false, message: 'Accepted appointments can only be edited in Appointment Management' });
  if (req.user.role !== ROLES.ADMIN && String(row.createdBy) !== String(req.user._id)) {
    return res.status(403).json({ success: false, message: 'Only the member who added this appointment can edit it' });
  }
  row.values = await cleanValues(req.body.values);
  row.updatedByName = req.user.name;
  row.lastEditedAt = new Date();
  await row.save();
  emitDateChanged(req, row.appointmentDate);
  res.json({ success: true, appointment: serializeRow(row, req.user) });
});

const deleteAppointment = asyncHandler(async (req, res) => {
  const row = await SalesAppointment.findById(req.params.id);
  if (!row) return res.status(404).json({ success: false, message: 'Appointment not found' });
  if (row.acceptedAt && req.user.role !== ROLES.ADMIN) return res.status(403).json({ success: false, message: 'Accepted appointments cannot be deleted by Sales Team' });
  if (req.user.role !== ROLES.ADMIN && String(row.createdBy) !== String(req.user._id)) {
    return res.status(403).json({ success: false, message: 'Only the member who added this appointment can delete it' });
  }
  const appointmentDate = row.appointmentDate;
  await row.deleteOne();
  emitDateChanged(req, appointmentDate);
  res.json({ success: true });
});

module.exports = { listColumns, createColumn, updateColumn, deleteColumn, listLayout, updateLayout, listManagementColumns, createManagementColumn, updateManagementColumn, deleteManagementColumn, listAppointments, listManagedAppointments, acceptAppointment, rescheduleAppointment, createManagedAppointment, updateManagedAppointment, deleteManagedAppointment, createAppointment, updateAppointment, deleteAppointment };
