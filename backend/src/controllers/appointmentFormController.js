const Sales = require('../models/SalesAppointment');
const Management = require('../models/AppointmentManagementEntry');
const SalesColumn = require('../models/SalesSheetColumn');
const ManagementColumn = require('../models/AppointmentManagementColumn');
const Receipt = require('../models/ConsultationReceipt');
const Bank = require('../models/BankAccount');
const Audit = require('../models/SalesSheetAudit');
const { ROLES } = require('../constants/roles');
const { asyncHandler } = require('../middleware/errorHandler');
const { dateRoom } = require('../realtime/salesSheetSocket');
const { isSalesConfirmationColumn } = require('../utils/appointmentSections');

const fail = (message, statusCode = 400) => { throw Object.assign(new Error(message), { statusCode }); };
const idValid = (id) => /^[a-f\d]{24}$/i.test(String(id || ''));
const modelFor = (sheet) => sheet === 'sales' ? Sales : Management;
const canWrite = (sheet, row, user) => user.role === ROLES.ADMIN || (sheet === 'management'
  ? user.role === ROLES.RECEPTIONIST
  : !row.acceptedAt && row.status === 'active' && (user.role === ROLES.RECEPTIONIST || (user.role === ROLES.SALES_TEAM && String(row.createdBy) === String(user._id))));
const loadTarget = async (req) => {
  const { sheet, id } = req.params;
  if (!['sales', 'management'].includes(sheet) || !idValid(id)) fail('Invalid appointment');
  const row = await modelFor(sheet).findById(id);
  if (!row) fail('Appointment not found', 404);
  const source = sheet === 'sales' ? row : row.sourceAppointment ? await Sales.findById(row.sourceAppointment) : null;
  // Sales users can open only their own consultation account.
  if (req.user.role === ROLES.SALES_TEAM && String(source?.createdBy || row.createdBy) !== String(req.user._id)) fail('This appointment belongs to another team member', 403);
  const root = source?.consultationAccount || source?._id;
  const owner = root && String(root) !== String(source?._id) ? await Sales.findById(root) : source || row;
  if (!owner) fail('Consultation account not found', 404);
  return { sheet, row, source, owner, root, writable: canWrite(sheet, row, req.user) };
};
const receiptFilter = ({ sheet, row, root }) => root
  ? { $or: [{ salesAppointment: root }, ...(sheet === 'management' ? [{ appointment: row._id }] : [])] }
  : { appointment: row._id };
const serializeColumn = (column) => ({ id: String(column._id), label: column.label, type: column.type, required: column.required, options: column.options || [], section: column.section || '' });
const valuesOf = (values) => Object.fromEntries(values || []);
const listBanks = asyncHandler(async (req, res) => {
  const banks = await Bank.find({ isActive: true }).select('name displayName').sort({ name: 1 }).lean();
  res.json({ banks });
});
const getForm = asyncHandler(async (req, res) => {
  const target = await loadTarget(req);
  const salesColumns = await SalesColumn.find({ isActive: true }).sort({ order: 1 }).lean();
  const receptionColumns = target.sheet === 'management' ? await ManagementColumn.find({ isActive: true }).sort({ order: 1 }).lean() : [];
  const receipts = await Receipt.find(receiptFilter(target)).sort({ date: -1, createdAt: -1 }).lean();
  const banks = await Bank.find({ isActive: true }).select('name displayName').sort({ name: 1 }).lean();
  res.json({
    id: target.row._id, appointmentCode: target.row.appointmentCode, appointmentDate: target.row.appointmentDate,
    entryAt: target.row.entryAt || target.row.createdAt,
    lastUpdatedAt: target.row.updatedAt || target.row.lastEditedAt,
    acceptedAt: target.row.acceptedAt || null,
    acceptedByName: target.row.acceptedByName || '',
    status: target.source?.status || target.row.status || 'active',
    rescheduledTo: target.source?.rescheduledTo || '',
    rescheduledByName: target.source?.rescheduledByName || '',
    notComingReason: target.source?.notComingReason || '',
    notComingAt: target.source?.notComingAt || null,
    notComingByName: target.source?.notComingByName || '',
    createdByName: target.row.createdByName || '',
    callTarget: target.sheet === 'management' ? {
      id: target.source?._id || target.row._id,
      sheet: target.source ? 'sales' : 'management',
    } : null,
    canEdit: target.writable, collectionStage: target.sheet === 'sales' ? 'advance' : 'reception',
    consultationFee: target.owner.consultationFee ?? null,
    salesValues: valuesOf(target.sheet === 'sales' ? target.row.values : target.row.salesValues),
    values: valuesOf(target.sheet === 'management' ? target.row.values : null),
    salesColumns: salesColumns.map(serializeColumn), columns: receptionColumns.map(serializeColumn), receipts, banks,
  });
});

const normalizedValue = (column, raw) => {
  let value = String(raw ?? '').trim();
  if (column.type === 'checkbox') value = String([true, 'true', '\u2611'].includes(raw));
  if (column.required && (!value || (column.type === 'checkbox' && value !== 'true'))) fail(`${column.label} is required`);
  if (value.length > 20000) fail('Value is too long');
  if (value && column.type === 'number' && !Number.isFinite(Number(value))) fail('Enter a valid number');
  if (value && column.type === 'select' && !column.options.includes(value)) fail('Invalid choice');
  if (value && column.type === 'multi_select') {
    const selected = value.split(',').map((item) => item.trim()).filter(Boolean);
    if (selected.some((item) => !column.options.includes(item))) fail('Invalid choice');
    value = column.options.filter((item) => selected.includes(item)).join(', ');
  }
  if (value && column.type === 'date') {
    const date = new Date(`${value}T00:00:00Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) fail('Enter a valid date');
  }
  if (value && column.type === 'time' && !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) fail('Enter a valid time');
  if (value && column.type === 'file' && !/^\/uploads\/[a-zA-Z0-9/_\-.]+$/.test(value)) fail('Upload a valid attachment');
  return value;
};
const updateField = asyncHandler(async (req, res) => {
  const target = await loadTarget(req);
  if (!target.writable) fail('This appointment is read-only', 403);
  const { source, columnId, previousValue } = req.body;
  if (!idValid(columnId) || !['sales', 'reception'].includes(source) || (target.sheet === 'sales' && source !== 'sales')) fail('Invalid field');
  const column = await (source === 'sales' ? SalesColumn : ManagementColumn).findOne({ _id: columnId, isActive: true });
  if (!column) fail('Field is no longer available', 404);
  if (req.user.role === ROLES.RECEPTIONIST && source === 'sales' && isSalesConfirmationColumn(column)) fail('Sales confirmation details are read-only for Reception', 403);
  const value = normalizedValue(column, req.body.value);
  const field = `${target.sheet === 'management' && source === 'sales' ? 'salesValues' : 'values'}.${columnId}`;
  const previous = String(previousValue ?? '');
  const condition = previous === '' ? { $or: [{ [field]: '' }, { [field]: { $exists: false } }] } : { [field]: previous };
  const permissions = target.sheet === 'sales' && req.user.role !== ROLES.ADMIN ? { status: 'active', acceptedAt: null } : {};
  const updated = await modelFor(target.sheet).findOneAndUpdate({ _id: target.row._id, ...condition, ...permissions }, { $set: { [field]: value, updatedByName: req.user.name, lastEditedAt: new Date() } }, { new: true });
  if (!updated) fail('This field changed. Reopen the appointment before saving.', 409);
  await Audit.create({ sheet: target.sheet, rowId: target.row._id, appointmentCode: target.row.appointmentCode, action: 'Field updated', details: `${column.label}: ${column.type === 'file' ? 'Attachment changed' : `${previous || '(empty)'} -> ${value || '(empty)'}`}`, changedBy: req.user._id, changedByName: req.user.name });
  req.app.get('io')?.to(dateRoom(target.row.appointmentDate)).emit('sales-sheet:date-changed', { date: target.row.appointmentDate });
  res.json({ success: true, value });
});
const updateFee = asyncHandler(async (req, res) => {
  const target = await loadTarget(req);
  if (!target.writable) fail('This appointment is read-only', 403);
  const amount = req.body.amount === '' || req.body.amount === null ? null : Number(req.body.amount);
  if (amount !== null && (!Number.isFinite(amount) || amount < 0 || amount > 100000000 || Math.abs(amount * 100 - Math.round(amount * 100)) > 0.000001)) fail('Enter a valid consultation fee');
  const Model = target.root ? Sales : Management;
  const updated = await Model.findOneAndUpdate({ _id: target.owner._id, consultationFee: req.body.previousValue ?? null }, { $set: { consultationFee: amount, updatedByName: req.user.name, lastEditedAt: new Date() } }, { new: true });
  if (!updated) fail('Consultation fee changed. Reload before saving.', 409);
  await Audit.create({ sheet: target.sheet, rowId: target.row._id, appointmentCode: target.row.appointmentCode, action: 'Consultation fee updated', details: `${target.owner.consultationFee ?? 'Not set'} -> ${amount ?? 'Not set'}`, changedBy: req.user._id, changedByName: req.user.name });
  req.app.get('io')?.to(dateRoom(target.row.appointmentDate)).emit('sales-sheet:date-changed', { date: target.row.appointmentDate });
  res.json({ consultationFee: amount });
});
// This middleware runs before uploads so unauthorized writes cannot leave files.
const prepareReceipt = asyncHandler(async (req, res, next) => {
  const target = await loadTarget(req);
  if (!target.writable) fail('This appointment is read-only', 403);
  req.consultationTarget = target;
  next();
});
const updateSalesReceipt = asyncHandler(async (req, res) => {
  const target = await loadTarget(req);
  if (target.sheet !== 'sales' || ![ROLES.ADMIN, ROLES.SALES_TEAM].includes(req.user.role) || !target.writable) fail('Sales payment can no longer be edited', 403);
  if (!idValid(req.params.receiptId)) fail('Invalid receipt');
  const amount = Number(req.body.amount);
  if (!Number.isFinite(amount) || amount <= 0 || amount > 100000000 || Math.abs(amount * 100 - Math.round(amount * 100)) > 0.000001) fail('Enter a valid advance amount');
  if (target.owner.consultationFee != null && amount > target.owner.consultationFee) fail('Advance cannot be greater than the consultation fee');
  const dateText = String(req.body.date || '');
  const date = new Date(`${dateText}T12:00:00.000Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateText) || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== dateText) fail('Enter a valid payment date');
  if (dateText > new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })) fail('Payment date cannot be in the future');
  if (!['cash', 'online'].includes(req.body.paymentMode)) fail('Select a payment mode');
  const paymentMode = req.body.paymentMode;
  const reference = String(req.body.reference || '').trim();
  const cashReceivedByName = String(req.body.cashReceivedByName || '').trim();
  const notes = String(req.body.notes || '').trim();
  const files = req.body.files;
  if (reference.length > 200 || cashReceivedByName.length > 200 || notes.length > 2000) fail('Payment detail is too long');
  if (!Array.isArray(files) || files.length > 5 || files.some((file) => !/^\/uploads\/[a-zA-Z0-9/_\-.]+$/.test(String(file?.url || '')))) fail('Select valid payment proofs');
  if (paymentMode === 'online' && (!reference || !files.length)) fail('Online payment needs UTR/reference and payment proof');
  if (paymentMode === 'cash' && !cashReceivedByName) fail('Enter who received the cash payment');
  let bank = null;
  if (paymentMode === 'online' && req.body.bank) {
    if (!idValid(req.body.bank)) fail('Select a valid bank');
    bank = await Bank.findOne({ _id: req.body.bank, isActive: true });
    if (!bank) fail('Select an active bank');
  }
  const stillOpen = await Sales.exists({ _id: target.row._id, acceptedAt: null, status: 'active' });
  if (!stillOpen) fail('Reception has accepted this appointment. Payment can no longer be edited.', 409);
  const receipt = await Receipt.findOneAndUpdate({
    _id: req.params.receiptId, salesAppointment: target.root || target.row._id,
    collectionStage: 'advance', status: 'pending',
  }, { $set: {
    amount, date, paymentMode, bank: bank?._id || null, bankName: bank?.displayName || bank?.name || '',
    reference: paymentMode === 'online' ? reference : '',
    cashReceivedByName: paymentMode === 'cash' ? cashReceivedByName : '',
    notes, files: files.map((file) => ({ url: String(file.url), fileName: String(file.fileName || 'Payment proof').slice(0, 255) })),
    editedByName: req.user.name, editedAt: new Date(),
  } }, { new: true, runValidators: true });
  if (!receipt) fail('Payment was verified or is no longer available for editing', 409);
  await Audit.create({ sheet: 'sales', rowId: target.row._id, appointmentCode: target.row.appointmentCode, action: 'Sales advance edited', details: `Receipt ${receipt._id}: Rs ${amount}`, changedBy: req.user._id, changedByName: req.user.name });
  req.app.get('io')?.to(dateRoom(target.row.appointmentDate)).emit('sales-sheet:date-changed', { date: target.row.appointmentDate });
  res.json({ receipt });
});
module.exports = { getForm, listBanks, updateField, updateFee, prepareReceipt, updateSalesReceipt, loadTarget, receiptFilter, normalizedValue, canWrite };
