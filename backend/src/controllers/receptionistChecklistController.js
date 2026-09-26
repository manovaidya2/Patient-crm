const ReceptionistChecklistItem = require('../models/ReceptionistChecklistItem');
const ReceptionistChecklistRecord = require('../models/ReceptionistChecklistRecord');
const { asyncHandler } = require('../middleware/errorHandler');
const { ROLES } = require('../constants/roles');

const validDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''));
const serializeItem = (item) => ({ id: String(item._id), label: item.label, order: item.order });

const listItems = asyncHandler(async (req, res) => {
  const items = await ReceptionistChecklistItem.find({ isActive: true }).sort({ order: 1, createdAt: 1 }).lean();
  res.json({ success: true, items: items.map(serializeItem) });
});

const listDaily = asyncHandler(async (req, res) => {
  const date = String(req.query.date || '');
  if (!validDate(date)) return res.status(400).json({ success: false, message: 'Valid date is required' });
  const receptionist = req.query.userId && req.user.role === ROLES.ADMIN ? req.query.userId : req.user._id;
  const [items, records] = await Promise.all([
    ReceptionistChecklistItem.find({ isActive: true }).sort({ order: 1, createdAt: 1 }).lean(),
    ReceptionistChecklistRecord.find({ date, receptionist }).lean(),
  ]);
  const recordMap = new Map(records.map((record) => [String(record.item), { completed: record.completed, note: record.note || '', completedAt: record.completedAt, updatedAt: record.updatedAt }]));
  res.json({ success: true, date, receptionistId: String(receptionist), items: items.map((item) => ({ ...serializeItem(item), ...(recordMap.get(String(item._id)) || { completed: false, note: '', completedAt: null, updatedAt: null }) })) });
});

const saveRecord = asyncHandler(async (req, res) => {
  const date = String(req.body.date || '');
  if (!validDate(date)) return res.status(400).json({ success: false, message: 'Valid date is required' });
  const item = await ReceptionistChecklistItem.findOne({ _id: req.body.itemId, isActive: true });
  if (!item) return res.status(404).json({ success: false, message: 'Checklist item not found' });
  const completed = Boolean(req.body.completed);
  const record = await ReceptionistChecklistRecord.findOneAndUpdate(
    { date, item: item._id, receptionist: req.user._id },
    { date, item: item._id, receptionist: req.user._id, completed, note: String(req.body.note || '').trim(), completedAt: completed ? new Date() : null, updatedBy: req.user._id },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
  res.json({ success: true, record: { completed: record.completed, note: record.note || '', completedAt: record.completedAt, updatedAt: record.updatedAt } });
});

const createItem = asyncHandler(async (req, res) => {
  const label = String(req.body.label || '').trim();
  if (!label) return res.status(400).json({ success: false, message: 'Checklist item is required' });
  const last = await ReceptionistChecklistItem.findOne({ isActive: true }).sort({ order: -1 }).lean();
  const item = await ReceptionistChecklistItem.create({ label, order: (last?.order ?? -1) + 1, createdBy: req.user._id });
  res.status(201).json({ success: true, item: serializeItem(item) });
});

const updateItem = asyncHandler(async (req, res) => {
  const item = await ReceptionistChecklistItem.findOne({ _id: req.params.id, isActive: true });
  if (!item) return res.status(404).json({ success: false, message: 'Checklist item not found' });
  if (req.body.label !== undefined) item.label = String(req.body.label || '').trim();
  if (!item.label) return res.status(400).json({ success: false, message: 'Checklist item is required' });
  if (req.body.order !== undefined) item.order = Number(req.body.order);
  await item.save();
  res.json({ success: true, item: serializeItem(item) });
});

const deleteItem = asyncHandler(async (req, res) => {
  const item = await ReceptionistChecklistItem.findById(req.params.id);
  if (!item) return res.status(404).json({ success: false, message: 'Checklist item not found' });
  item.isActive = false;
  await item.save();
  res.json({ success: true });
});

module.exports = { listItems, listDaily, saveRecord, createItem, updateItem, deleteItem };
