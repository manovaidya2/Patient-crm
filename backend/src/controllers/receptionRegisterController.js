const crypto = require('crypto');
const { ReceptionRegister, ReceptionEntry } = require('../models/ReceptionRegister');
const { asyncHandler } = require('../middleware/errorHandler');

const types = ['text', 'textarea', 'phone', 'number', 'date', 'time', 'select', 'checkbox'];
const fail = (message) => { const error = new Error(message); error.statusCode = 400; throw error; };
const validDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
const defaults = (kind) => (kind === 'visitors' ? [
  ['name', 'Visitor name', 'text', true], ['phone', 'Phone', 'phone'], ['purpose', 'Purpose', 'textarea'],
  ['meeting', 'Whom to meet', 'text'], ['in', 'In time', 'time'], ['out', 'Out time', 'time'], ['notes', 'Notes', 'textarea'],
] : kind === 'outgoing-couriers' ? [
  ['parcel', 'Parcel', 'textarea', true], ['sentTo', 'Sent to (where)', 'text', true], ['sentBy', 'Sent by (who)', 'text', true], ['notes', 'Note', 'textarea'],
] : [
  ['sender', 'Sender', 'text', true], ['recipient', 'Recipient', 'text', true], ['company', 'Courier company', 'text'],
  ['tracking', 'Tracking number', 'text'], ['description', 'Parcel details', 'textarea'], ['received', 'Received time', 'time'],
  ['status', 'Status', 'select', false, ['Received', 'Handed over']], ['handover', 'Handed over to', 'text'], ['notes', 'Notes', 'textarea'],
]).map(([key, label, type, required = false, options = []]) => ({ key, label, type, required, options }));

async function getRegister(kind) {
  return ReceptionRegister.findOneAndUpdate({ kind }, { $setOnInsert: { columns: defaults(kind) } }, { upsert: true, new: true });
}
function cleanColumn(body) {
  const label = String(body.label || '').trim();
  if (!label || label.length > 80 || !types.includes(body.type)) fail('Enter a column name (up to 80 characters) and valid type');
  const options = body.type === 'select' && Array.isArray(body.options) ? [...new Set(body.options.map((item) => String(item).trim()).filter(Boolean))] : [];
  if (body.type === 'select' && (!options.length || options.length > 100 || options.some((option) => option.length > 100))) fail('Enter dropdown options (up to 100 options, 100 characters each)');
  return { label, type: body.type, required: body.required === true, options };
}
function cleanValues(columns, raw = {}) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) fail('Entry values must be an object');
  const values = {};
  for (const column of columns) {
    const value = String(raw[column.key] ?? '').trim();
    if (value.length > 2000) fail(`${column.label}: maximum 2000 characters`);
    if (column.required && (!value || (column.type === 'checkbox' && value !== 'true'))) fail(`${column.label} is required`);
    if (value && ((column.type === 'number' && !Number.isFinite(Number(value))) ||
      (column.type === 'date' && !validDate(value)) || (column.type === 'time' && !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) ||
      (column.type === 'select' && !column.options.includes(value)) || (column.type === 'checkbox' && !['true', 'false'].includes(value)))) fail(`${column.label} has an invalid value`);
    values[column.key] = value;
  }
  return values;
}
const list = asyncHandler(async (req, res) => {
  const register = await getRegister(req.params.kind);
  const filter = { kind: req.params.kind };
  if (req.query.date) { if (!validDate(req.query.date)) fail('Invalid date'); filter.date = req.query.date; }
  const search = String(req.query.search || '').trim().slice(0, 200);
  if (search) filter.$or = register.columns.map((column) => ({ [`values.${column.key}`]: { $regex: search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' } }));
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const rows = await ReceptionEntry.find(filter).sort({ date: -1, createdAt: -1 }).skip((page - 1) * 25).limit(25).lean();
  const total = await ReceptionEntry.countDocuments(filter);
  res.json({ columns: register.columns, rows, total, page });
});
const save = asyncHandler(async (req, res) => {
  if (!validDate(req.body.date || '')) fail('Select an entry date');
  const register = await getRegister(req.params.kind);
  let raw = req.body.values;
  if (typeof raw === 'string') { try { raw = JSON.parse(raw); } catch { fail('Entry values must be an object'); } }
  const values = cleanValues(register.columns, raw);
  const imageUrl = req.file ? `/uploads/courier/${req.file.filename}` : undefined;
  let row;
  if (req.params.id) {
    row = await ReceptionEntry.findOne({ _id: req.params.id, kind: req.params.kind });
    if (!row) return res.status(404).json({ message: 'Entry not found' });
    row.values = values; row.date = req.body.date; row.updatedByName = req.user.name;
    if (imageUrl) row.imageUrl = imageUrl;
    await row.save();
  } else row = await ReceptionEntry.create({ kind: req.params.kind, date: req.body.date, values, imageUrl, createdByName: req.user.name, updatedByName: req.user.name });
  res.status(req.params.id ? 200 : 201).json({ row });
});
const addColumn = asyncHandler(async (req, res) => {
  const column = cleanColumn(req.body);
  const register = await getRegister(req.params.kind);
  if (register.columns.length >= 50) fail('Maximum 50 columns per sheet');
  if (register.columns.some((item) => item.label.toLowerCase() === column.label.toLowerCase())) fail('A column with this name already exists');
  await ReceptionRegister.updateOne({ _id: register._id }, { $push: { columns: { ...column, key: `field_${crypto.randomUUID().replace(/-/g, '')}` } } });
  res.status(201).json({ success: true });
});
module.exports = { list, save, addColumn, cleanValues, cleanColumn, validDate };
