const ClinicInventory = require('../models/ClinicInventory');
const { asyncHandler } = require('../middleware/errorHandler');
const { ROLES } = require('../constants/roles');

// Four tabs: mobiles and laptops are single devices with their own details; OPD papers ('opd') and Others are stock
// registers. An item saved before the tabs has no kind: it is an OPD paper.
const KINDS = ['mobile', 'laptop', 'opd', 'other'];
const STOCK_KINDS = ['opd', 'other'];
const DEVICE_FIELDS = {
  mobile: ['brand', 'simCompany', 'phoneNumber', 'imei1', 'imei2', 'assignee'],
  laptop: ['deviceId', 'brand', 'assignee'],
};
const kindOf = (item) => (KINDS.includes(item?.kind) ? item.kind : 'opd');
const isDevice = (kind) => kind === 'mobile' || kind === 'laptop';
const deviceOf = (item) => Object.fromEntries([...new Set(Object.values(DEVICE_FIELDS).flat())].map((key) => [key, item.device?.[key] || '']));
const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// The device's details from the form (merged over what is saved), checked. Returns { device } or { message }.
function readDevice(kind, body, saved = {}) {
  const device = {};
  DEVICE_FIELDS[kind].forEach((key) => { device[key] = String(body[key] ?? saved[key] ?? '').trim(); });
  if (!device.brand) return { message: kind === 'mobile' ? 'Mobile brand is required' : 'Laptop brand is required' };
  if (kind === 'laptop' && !device.deviceId) return { message: 'Device ID is required' };
  if (kind === 'mobile') {
    device.imei1 = device.imei1.replace(/\s+/g, '');
    device.imei2 = device.imei2.replace(/\s+/g, '');
    if ([device.imei1, device.imei2].some((imei) => imei && !/^\d{15}$/.test(imei))) return { message: 'An IMEI number has 15 digits' };
    if (device.imei1 && device.imei1 === device.imei2) return { message: 'IMEI 1 and IMEI 2 cannot be the same' };
    if (device.phoneNumber && !/^\+?[\d\s-]{10,15}$/.test(device.phoneNumber)) return { message: 'Enter a valid mobile number' };
  }
  return { device };
}
// Shown as the item's name (search, delete message, records).
const deviceName = (kind, device) => (kind === 'mobile'
  ? `${device.brand} mobile${device.phoneNumber ? ` (${device.phoneNumber})` : ''}`
  : `${device.brand} laptop (${device.deviceId})`);
// Another device already saved with this IMEI / device ID.
async function duplicateDevice(kind, device, id) {
  const same = kind === 'mobile'
    ? [device.imei1, device.imei2].filter(Boolean).flatMap((imei) => [{ 'device.imei1': imei }, { 'device.imei2': imei }])
    : [{ 'device.deviceId': { $regex: `^${escapeRegex(device.deviceId)}$`, $options: 'i' } }];
  if (!same.length) return null;
  const found = await ClinicInventory.findOne({ deletedAt: null, kind, $or: same, ...(id ? { _id: { $ne: id } } : {}) }).select('name');
  return found ? (kind === 'mobile' ? `This IMEI is already saved on ${found.name}` : `This device ID is already saved on ${found.name}`) : null;
}

const formatItem = (item) => ({
  id: String(item._id), name: item.name, kind: kindOf(item), device: deviceOf(item),
  assignments: (item.assignments || []).map((a) => ({ assignee: a.assignee || '', assignedByName: a.assignedByName || '', assignedAt: a.assignedAt || null })).reverse(), category: item.category || 'General', unit: item.unit || 'piece',
  currentStock: item.currentStock || 0, lowStockAt: item.lowStockAt || 0, notes: item.notes || '',
  createdByName: item.createdByName || '', editedByName: item.editedByName || '', editedAt: item.editedAt || null,
  createdAt: item.createdAt, updatedAt: item.updatedAt,
  softCopy: item.softCopy?.filename ? { fileName: item.softCopy.originalName, mimeType: item.softCopy.mimeType, uploadedAt: item.softCopy.uploadedAt, uploadedByName: item.softCopy.uploadedByName } : null,
  transactions: (item.transactions || []).map((entry) => ({ id: String(entry._id), type: entry.type, quantity: entry.quantity, previousStock: entry.previousStock, newStock: entry.newStock, reason: entry.reason || '', notes: entry.notes || '', recordedByName: entry.recordedByName || '', editedByName: entry.editedByName || '', editedAt: entry.editedAt || null, createdAt: entry.createdAt })).sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)),
});

const listClinicInventory = asyncHandler(async (req, res) => {
  const search = String(req.query.search || '').trim();
  const pattern = { $regex: escapeRegex(search), $options: 'i' };
  const filter = search ? { $or: ['name', 'category', ...[...new Set(Object.values(DEVICE_FIELDS).flat())].map((key) => `device.${key}`)].map((key) => ({ [key]: pattern })) } : {};
  filter.deletedAt = null;
  const items = (await ClinicInventory.find(filter).sort({ updatedAt: -1, createdAt: -1 })).map(formatItem);
  // items / lowStock: the stock registers (OPD papers + Others); kinds: how many in each tab.
  const stock = items.filter((item) => STOCK_KINDS.includes(item.kind));
  const totals = stock.reduce((acc, item) => ({ ...acc, items: acc.items + 1, lowStock: acc.lowStock + (item.lowStockAt > 0 && item.currentStock <= item.lowStockAt ? 1 : 0) }), { items: 0, lowStock: 0 });
  totals.kinds = Object.fromEntries(KINDS.map((kind) => [kind, items.filter((item) => item.kind === kind).length]));
  res.json({ success: true, items, totals });
});

const createClinicInventoryItem = asyncHandler(async (req, res) => {
  const kind = KINDS.includes(req.body.kind) ? req.body.kind : 'opd';
  if (isDevice(kind)) {
    const { device, message } = readDevice(kind, req.body);
    if (message) return res.status(400).json({ success: false, message });
    const duplicate = await duplicateDevice(kind, device);
    if (duplicate) return res.status(400).json({ success: false, message: duplicate });
    const item = await ClinicInventory.create({
      name: deviceName(kind, device), kind, device, category: kind === 'mobile' ? 'Mobile' : 'Laptop', unit: 'piece',
      notes: String(req.body.notes || '').trim(), createdByName: req.user.name,
      assignments: device.assignee ? [{ assignee: device.assignee, assignedByName: req.user.name, assignedAt: new Date() }] : [],
    });
    return res.status(201).json({ success: true, item: formatItem(item) });
  }
  const name = String(req.body.name || '').trim();
  if (!name) return res.status(400).json({ success: false, message: 'Item name is required' });
  // The same name may be in both registers; within one it is a repeat (an OPD paper may have no kind saved).
  const existing = await ClinicInventory.findOne({ deletedAt: null, kind: kind === 'opd' ? { $in: [null, 'opd'] } : kind, name: { $regex: `^${escapeRegex(name)}$`, $options: 'i' } });
  if (existing && !existing.deletedAt) return res.status(400).json({ success: false, message: 'This clinic item already exists' });
  const openingStock = Math.max(Number(req.body.openingStock || 0), 0);
  const item = await ClinicInventory.create({ name, kind, category: String(req.body.category || 'General').trim(), unit: String(req.body.unit || 'piece').trim(), currentStock: openingStock, lowStockAt: Math.max(Number(req.body.lowStockAt || 0), 0), notes: String(req.body.notes || '').trim(), createdByName: req.user.name, transactions: openingStock ? [{ type: 'add', quantity: openingStock, previousStock: 0, newStock: openingStock, reason: 'Opening stock', notes: String(req.body.notes || '').trim(), recordedByName: req.user.name }] : [] });
  res.status(201).json({ success: true, item: formatItem(item) });
});

const updateClinicInventoryItem = asyncHandler(async (req, res) => {
  const item = await ClinicInventory.findOne({ _id: req.params.id, deletedAt: null });
  if (!item) return res.status(404).json({ success: false, message: 'Clinic inventory item not found' });
  const kind = kindOf(item);
  if (isDevice(kind)) {
    const before = item.device?.assignee || '';
    const { device, message } = readDevice(kind, req.body, deviceOf(item));
    if (message) return res.status(400).json({ success: false, message });
    const duplicate = await duplicateDevice(kind, device, item._id);
    if (duplicate) return res.status(400).json({ success: false, message: duplicate });
    item.device = { ...deviceOf(item), ...device };
    item.name = deviceName(kind, device);
    if (req.body.notes !== undefined) item.notes = String(req.body.notes || '').trim();
    if (device.assignee !== before) item.assignments.push({ assignee: device.assignee, assignedByName: req.user.name, assignedAt: new Date() });
    item.editedByName = req.user.name; item.editedAt = new Date(); await item.save();
    return res.json({ success: true, item: formatItem(item) });
  }
  if (req.body.name !== undefined) item.name = String(req.body.name || '').trim();
  if (req.body.category !== undefined) item.category = String(req.body.category || 'General').trim();
  if (req.body.unit !== undefined) item.unit = String(req.body.unit || 'piece').trim();
  if (req.body.lowStockAt !== undefined) item.lowStockAt = Math.max(Number(req.body.lowStockAt || 0), 0);
  if (req.body.notes !== undefined) item.notes = String(req.body.notes || '').trim();
  item.editedByName = req.user.name; item.editedAt = new Date(); await item.save();
  res.json({ success: true, item: formatItem(item) });
});

const NO_STOCK = 'Mobiles and laptops have no stock count';
const addClinicInventoryTransaction = asyncHandler(async (req, res) => {
  const item = await ClinicInventory.findOne({ _id: req.params.id, deletedAt: null });
  if (!item) return res.status(404).json({ success: false, message: 'Clinic inventory item not found' });
  if (isDevice(kindOf(item))) return res.status(400).json({ success: false, message: NO_STOCK });
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

// @route PATCH /api/clinic-inventory/:id/transactions/last  - correct the latest stock entry (type, quantity, reason,
// notes). Only the latest, so every older entry's before/after stock stays true.
const editLastClinicInventoryTransaction = asyncHandler(async (req, res) => {
  const item = await ClinicInventory.findOne({ _id: req.params.id, deletedAt: null });
  if (!item) return res.status(404).json({ success: false, message: 'Clinic inventory item not found' });
  if (isDevice(kindOf(item))) return res.status(400).json({ success: false, message: NO_STOCK });
  const last = item.transactions[item.transactions.length - 1];
  if (!last) return res.status(404).json({ success: false, message: 'No stock entry to edit' });
  const type = String(req.body.type || '');
  const quantity = Number(req.body.quantity);
  if (!['add', 'consume', 'adjust'].includes(type) || !Number.isFinite(quantity) || quantity <= 0) return res.status(400).json({ success: false, message: 'Enter a valid stock action and quantity' });
  const previousStock = Number(last.previousStock || 0);
  const newStock = type === 'add' ? previousStock + quantity : type === 'consume' ? previousStock - quantity : quantity;
  if (newStock < 0) return res.status(400).json({ success: false, message: 'Not enough stock available' });
  Object.assign(last, { type, quantity, newStock, reason: String(req.body.reason || '').trim(), notes: String(req.body.notes || '').trim(), editedByName: req.user.name, editedAt: new Date() });
  item.currentStock = newStock;
  await item.save(); res.json({ success: true, item: formatItem(item) });
});

const deleteClinicInventoryItem = asyncHandler(async (req, res) => {
  if (req.user.role !== ROLES.ADMIN) return res.status(403).json({ message: 'Only Admin can delete clinic items' });
  const item = await ClinicInventory.findOneAndUpdate({ _id: req.params.id, deletedAt: null }, {
    $set: { deletedAt: new Date(), deletedByName: req.user.name }, $inc: { __v: 1 },
  });
  if (!item) return res.status(404).json({ message: 'Clinic inventory item not found' });
  res.json({ success: true });
});

module.exports = { listClinicInventory, createClinicInventoryItem, updateClinicInventoryItem, addClinicInventoryTransaction, editLastClinicInventoryTransaction, deleteClinicInventoryItem };
