const MedicineInventory = require('../models/MedicineInventory');
const { asyncHandler } = require('../middleware/errorHandler');

const UNITS = ['tablet', 'capsule', 'bottle', 'packet', 'kg', 'gram', 'mg', 'ml', 'piece', 'other'];
const TRANSACTION_TYPES = ['add', 'consume', 'adjust'];

const formatInventory = (item) => ({
  id: item._id,
  name: item.name,
  unit: item.unit,
  currentStock: item.currentStock || 0,
  lowStockAt: item.lowStockAt || 0,
  lastUnitCost: item.lastUnitCost || 0,
  stockValue: Number(item.currentStock || 0) * Number(item.lastUnitCost || 0),
  notes: item.notes || '',
  createdByName: item.createdByName || '',
  editedByName: item.editedByName || '',
  editedAt: item.editedAt || null,
  createdAt: item.createdAt,
  updatedAt: item.updatedAt,
  transactions: (item.transactions || [])
    .map((entry) => ({
      id: entry._id,
      type: entry.type,
      quantity: entry.quantity || 0,
      previousStock: entry.previousStock || 0,
      newStock: entry.newStock || 0,
      unitCost: entry.unitCost || 0,
      totalCost: entry.totalCost || 0,
      reason: entry.reason || '',
      notes: entry.notes || '',
      recordedByName: entry.recordedByName || '',
      createdAt: entry.createdAt,
    }))
    .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)),
});

const listInventory = asyncHandler(async (req, res) => {
  const { search = '' } = req.query;
  const filter = {};

  if (search) {
    filter.name = { $regex: search, $options: 'i' };
  }

  const items = await MedicineInventory.find(filter).sort({ updatedAt: -1, createdAt: -1 });
  const formatted = items.map(formatInventory);
  const totals = formatted.reduce(
    (acc, item) => {
      acc.items += 1;
      acc.stockValue += item.stockValue;
      if (item.lowStockAt > 0 && item.currentStock <= item.lowStockAt) acc.lowStock += 1;
      return acc;
    },
    { items: 0, stockValue: 0, lowStock: 0 }
  );

  res.status(200).json({ success: true, count: formatted.length, totals, items: formatted });
});

const createInventoryItem = asyncHandler(async (req, res) => {
  const name = String(req.body.name || '').trim();
  const unit = req.body.unit || 'gram';
  const openingStock = Math.max(Number(req.body.openingStock || 0), 0);
  const lowStockAt = Math.max(Number(req.body.lowStockAt || 0), 0);
  const unitCost = Math.max(Number(req.body.unitCost || 0), 0);

  if (!name) {
    return res.status(400).json({ success: false, message: 'Medicine name is required' });
  }
  if (!UNITS.includes(unit)) {
    return res.status(400).json({ success: false, message: 'Invalid stock unit' });
  }

  const existing = await MedicineInventory.findOne({ name: { $regex: `^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' } });
  if (existing) {
    return res.status(400).json({ success: false, message: 'This medicine already exists in inventory' });
  }

  const item = await MedicineInventory.create({
    name,
    unit,
    currentStock: openingStock,
    lowStockAt,
    lastUnitCost: unitCost,
    notes: req.body.notes || '',
    createdByName: req.user.name,
    transactions: openingStock
      ? [
          {
            type: 'add',
            quantity: openingStock,
            previousStock: 0,
            newStock: openingStock,
            unitCost,
            totalCost: openingStock * unitCost,
            reason: 'Opening stock',
            notes: req.body.notes || '',
            recordedByName: req.user.name,
          },
        ]
      : [],
  });

  res.status(201).json({ success: true, item: formatInventory(item) });
});

const updateInventoryItem = asyncHandler(async (req, res) => {
  const item = await MedicineInventory.findById(req.params.id);
  if (!item) {
    return res.status(404).json({ success: false, message: 'Medicine inventory item not found' });
  }

  if (req.body.name !== undefined) {
    const name = String(req.body.name || '').trim();
    if (!name) return res.status(400).json({ success: false, message: 'Medicine name is required' });
    item.name = name;
  }
  if (req.body.unit !== undefined) {
    if (!UNITS.includes(req.body.unit)) {
      return res.status(400).json({ success: false, message: 'Invalid stock unit' });
    }
    item.unit = req.body.unit;
  }
  if (req.body.lowStockAt !== undefined) item.lowStockAt = Math.max(Number(req.body.lowStockAt || 0), 0);
  if (req.body.notes !== undefined) item.notes = req.body.notes || '';
  item.editedByName = req.user.name;
  item.editedAt = new Date();

  await item.save();
  res.status(200).json({ success: true, item: formatInventory(item) });
});

const addInventoryTransaction = asyncHandler(async (req, res) => {
  const item = await MedicineInventory.findById(req.params.id);
  if (!item) {
    return res.status(404).json({ success: false, message: 'Medicine inventory item not found' });
  }

  const type = req.body.type;
  const quantity = Math.max(Number(req.body.quantity || 0), 0);
  const unitCost = Math.max(Number(req.body.unitCost || item.lastUnitCost || 0), 0);

  if (!TRANSACTION_TYPES.includes(type)) {
    return res.status(400).json({ success: false, message: 'Invalid inventory transaction type' });
  }
  if (quantity <= 0) {
    return res.status(400).json({ success: false, message: 'Enter a valid quantity' });
  }

  const previousStock = Number(item.currentStock || 0);
  let newStock = previousStock;

  if (type === 'add') {
    newStock = previousStock + quantity;
    item.lastUnitCost = unitCost;
  } else if (type === 'consume') {
    if (quantity > previousStock) {
      return res.status(400).json({ success: false, message: 'Not enough stock available' });
    }
    newStock = previousStock - quantity;
  } else if (type === 'adjust') {
    newStock = quantity;
  }

  item.currentStock = newStock;
  item.transactions.push({
    type,
    quantity,
    previousStock,
    newStock,
    unitCost,
    totalCost: quantity * unitCost,
    reason: req.body.reason || '',
    notes: req.body.notes || '',
    recordedByName: req.user.name,
  });

  await item.save();
  res.status(200).json({ success: true, item: formatInventory(item) });
});

module.exports = {
  listInventory,
  createInventoryItem,
  updateInventoryItem,
  addInventoryTransaction,
};
