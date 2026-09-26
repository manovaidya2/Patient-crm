const ClinicInventory = require('../models/ClinicInventory');
const { asyncHandler } = require('../middleware/errorHandler');

const formatItem = (item) => ({
  id: String(item._id), name: item.name, category: item.category || 'General', unit: item.unit || 'piece',
  currentStock: item.currentStock || 0, lowStockAt: item.lowStockAt || 0, notes: item.notes || '',
  createdByName: item.createdByName || '', editedByName: item.editedByName || '', editedAt: item.editedAt || null,
  createdAt: item.createdAt, updatedAt: item.updatedAt,
  transactions: (item.transactions || []).map((entry) => ({ id: String(entry._id), type: entry.type, quantity: entry.quantity, previousStock: entry.previousStock, newStock: entry.newStock, reason: entry.reason || '', notes: entry.notes || '', recordedByName: entry.recordedByName || '', createdAt: entry.createdAt })).sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)),
});

const listClinicInventory = asyncHandler(async (req, res) => {
  const search = String(req.query.search || '').trim();
  const filter = search ? { $or: [{ name: { $regex: search, $options: 'i' } }, { category: { $regex: search, $options: 'i' } }] } : {};
  const items = (await ClinicInventory.find(filter).sort({ updatedAt: -1, createdAt: -1 })).map(formatItem);
  const totals = items.reduce((acc, item) => ({ items: acc.items + 1, lowStock: acc.lowStock + (item.lowStockAt > 0 && item.currentStock <= item.lowStockAt ? 1 : 0) }), { items: 0, lowStock: 0 });
  res.json({ success: true, items, totals });
});

const createClinicInventoryItem = asyncHandler(async (req, res) => {
  const name = String(req.body.name || '').trim();
  if (!name) return res.status(400).json({ success: false, message: 'Item name is required' });
  const existing = await ClinicInventory.findOne({ name: { $regex: `^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' } });
  if (existing) return res.status(400).json({ success: false, message: 'This clinic item already exists' });
  const openingStock = Math.max(Number(req.body.openingStock || 0), 0);
  const item = await ClinicInventory.create({ name, category: String(req.body.category || 'General').trim(), unit: String(req.body.unit || 'piece').trim(), currentStock: openingStock, lowStockAt: Math.max(Number(req.body.lowStockAt || 0), 0), notes: String(req.body.notes || '').trim(), createdByName: req.user.name, transactions: openingStock ? [{ type: 'add', quantity: openingStock, previousStock: 0, newStock: openingStock, reason: 'Opening stock', notes: String(req.body.notes || '').trim(), recordedByName: req.user.name }] : [] });
  res.status(201).json({ success: true, item: formatItem(item) });
});

const updateClinicInventoryItem = asyncHandler(async (req, res) => {
  const item = await ClinicInventory.findById(req.params.id);
  if (!item) return res.status(404).json({ success: false, message: 'Clinic inventory item not found' });
  if (req.body.name !== undefined) item.name = String(req.body.name || '').trim();
  if (req.body.category !== undefined) item.category = String(req.body.category || 'General').trim();
  if (req.body.unit !== undefined) item.unit = String(req.body.unit || 'piece').trim();
  if (req.body.lowStockAt !== undefined) item.lowStockAt = Math.max(Number(req.body.lowStockAt || 0), 0);
  if (req.body.notes !== undefined) item.notes = String(req.body.notes || '').trim();
  item.editedByName = req.user.name; item.editedAt = new Date(); await item.save();
  res.json({ success: true, item: formatItem(item) });
});

const addClinicInventoryTransaction = asyncHandler(async (req, res) => {
  const item = await ClinicInventory.findById(req.params.id);
  if (!item) return res.status(404).json({ success: false, message: 'Clinic inventory item not found' });
  const type = String(req.body.type || '');
  const quantity = Number(req.body.quantity);
  if (!['add', 'consume', 'adjust'].includes(type) || !Number.isFinite(quantity) || quantity <= 0) return res.status(400).json({ success: false, message: 'Enter a valid stock action and quantity' });
  const previousStock = Number(item.currentStock || 0);
  const newStock = type === 'add' ? previousStock + quantity : type === 'consume' ? previousStock - quantity : quantity;
  if (newStock < 0) return res.status(400).json({ success: false, message: 'Not enough stock available' });
  item.currentStock = newStock;
  item.transactions.push({ type, quantity, previousStock, newStock, reason: String(req.body.reason || '').trim(), notes: String(req.body.notes || '').trim(), recordedByName: req.user.name });
  await item.save(); res.json({ success: true, item: formatItem(item) });
});

module.exports = { listClinicInventory, createClinicInventoryItem, updateClinicInventoryItem, addClinicInventoryTransaction };
