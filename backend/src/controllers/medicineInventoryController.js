const mongoose = require('mongoose');
const MedicineInventory = require('../models/MedicineInventory');
const InventoryCounter = require('../models/InventoryCounter');
const InventorySetting = require('../models/InventorySetting');
const { asyncHandler } = require('../middleware/errorHandler');
const {
  EXPIRY_WARN_DAYS, ML_SIZES, G_SIZES, CATEGORY_CONFIG, PACKING_CATEGORY, ITEM_TYPES, PACKABLE_UNITS, CONTAINER_KINDS, APPROVER_ROLES,
  round, inventoryView, applyLine, decidePending, parseDate, kindFor, sameSize,
} = require('../utils/medicineStock');

// Units a medicine can be counted in. Older items may still carry a legacy unit (kg, bottle...); that stays valid for them only.
const UNITS = ['ml', 'gram', 'tablet', 'piece'];
const ENTRY_ACTS = ['in', 'use', 'adjust', 'pack'];
const fail = (message, statusCode = 400, extra = {}) => { throw Object.assign(new Error(message), { statusCode, ...extra }); };
const text = (value, max = 200) => String(value ?? '').trim().replace(/[\r\n\t]+/g, ' ').slice(0, max);
const amount = (value) => Math.max(Number(value || 0) || 0, 0);
const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const TX_TYPE = { in: 'add', use: 'consume', adjust: 'adjust', pack: 'pack' };

const formatTransaction = (entry) => ({
  id: String(entry._id),
  txId: entry.txId || `TX-${String(entry._id).slice(-6).toUpperCase()}`,
  type: entry.type,
  subType: entry.subType || '',
  quantity: entry.quantity || 0,
  delta: entry.delta || 0,
  previousStock: entry.previousStock || 0,
  newStock: entry.newStock || 0,
  detail: entry.detail || '',
  ref: entry.ref || '',
  reason: entry.reason || '',
  notes: entry.notes || '',
  recordedByName: entry.recordedByName || '',
  recordedByRole: entry.recordedByRole || '',
  status: entry.status || 'done',
  decidedByName: entry.decidedByName || '',
  decidedAt: entry.decidedAt || null,
  createdAt: entry.createdAt,
});
const newestFirst = (a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0);

const formatInventory = (item, now = new Date(), { history = 8 } = {}) => ({
  id: String(item._id),
  code: item.code || '',
  name: item.name,
  nameHindi: item.nameHindi || '',
  category: item.category || '',
  itemType: item.itemType || '',
  rack: item.rack || '',
  unit: item.unit,
  currentStock: round(item.currentStock),
  lowStockAt: item.lowStockAt || 0,
  reorderLevel: item.reorderLevel || 0,
  maxLevel: item.maxLevel || 0,
  avgDailyUse: item.avgDailyUse || 0,
  batchNo: item.batchNo || '',
  expiryDate: item.expiryDate || null,
  supplier: item.supplier || '',
  usedIn: item.usedIn || '',
  emergency: Boolean(item.emergency),
  fastMoving: Boolean(item.fastMoving),
  packSizes: item.packSizes || [],
  containerKind: item.containerKind || '',
  containerSize: item.containerSize || 0,
  containerUnit: item.containerUnit || '',
  recipe: item.recipe?.ingredients?.length ? { per: item.recipe.per, ingredients: item.recipe.ingredients.map((i) => ({ itemId: String(i.item), qty: i.qty })) } : null,
  purchaseRequest: item.purchaseRequest?.raisedAt ? { raisedAt: item.purchaseRequest.raisedAt, raisedByName: item.purchaseRequest.raisedByName || '', quantity: item.purchaseRequest.quantity || 0 } : null,
  notes: item.notes || '',
  createdByName: item.createdByName || '',
  editedByName: item.editedByName || '',
  editedAt: item.editedAt || null,
  createdAt: item.createdAt,
  updatedAt: item.updatedAt,
  pendingCount: (item.transactions || []).filter((t) => t.status === 'pending').length,
  ...inventoryView(item, now),
  transactions: (item.transactions || []).map(formatTransaction).sort(newestFirst).slice(0, history),
});

// ---------- bottle / jar size master ----------
// One shared list per unit. Adding a size here makes it appear in Add medicine and in the Bottle size view.
const SIZE_KEY = 'pack-sizes';
const sizeUnits = { ml: 'ml', gram: 'gram', g: 'gram' };
const sortedSizes = (list) => [...new Set(list.map((n) => round(Number(n))).filter((n) => n > 0))].sort((a, b) => a - b);
async function loadSizeMaster() {
  const doc = await InventorySetting.findOne({ key: SIZE_KEY }).lean();
  return { ml: sortedSizes(doc?.value?.ml || ML_SIZES), gram: sortedSizes(doc?.value?.gram || G_SIZES) };
}
const saveSizeMaster = (master) => InventorySetting.findOneAndUpdate({ key: SIZE_KEY }, { $set: { value: master } }, { upsert: true, new: true });
const readSize = (body) => {
  const unit = sizeUnits[body.unit];
  const size = round(Number(body.size));
  if (!unit) fail('Choose ml or gram');
  if (!(size > 0) || size > 100000) fail('Enter a valid bottle size');
  return { unit, size };
};

const addPackSize = asyncHandler(async (req, res) => {
  const { unit, size } = readSize(req.body);
  const master = await loadSizeMaster();
  if (master[unit].some((s) => sameSize(s, size))) fail(`${size} ${unit === 'gram' ? 'g' : 'ml'} is already in the list`);
  master[unit] = sortedSizes([...master[unit], size]);
  await saveSizeMaster(master);
  res.status(201).json({ success: true, packSizeMaster: master });
});

const removePackSize = asyncHandler(async (req, res) => {
  const { unit, size } = readSize({ unit: req.query.unit, size: req.query.size });
  const master = await loadSizeMaster();
  const used = await MedicineInventory.find({ isActive: { $ne: false }, $or: [{ unit, packSizes: size }, { unit, 'packs.size': size }, { containerSize: size, containerUnit: unit === 'gram' ? 'g' : 'ml' }] }).select('name');
  if (used.length) fail(`${used.length} medicine(s) still use this size (${used.slice(0, 3).map((i) => i.name).join(', ')}). Remove it from them first`);
  master[unit] = master[unit].filter((s) => !sameSize(s, size));
  await saveSizeMaster(master);
  res.json({ success: true, packSizeMaster: master });
});

// @desc    Whole inventory with computed status; the page filters it on screen
// @route   GET /api/medicine/inventory
const listInventory = asyncHandler(async (req, res) => {
  const { search = '' } = req.query;
  const filter = { isActive: { $ne: false } };
  if (search) {
    const regex = { $regex: escapeRegex(String(search)), $options: 'i' };
    filter.$or = [{ name: regex }, { nameHindi: regex }, { code: regex }, { category: regex }, { rack: regex }];
  }
  const now = new Date();
  const items = await MedicineInventory.find(filter).sort({ category: 1, code: 1, name: 1 });
  const formatted = items.map((item) => formatInventory(item, now));
  const totals = formatted.reduce(
    (acc, item) => {
      acc.items += 1;
      if (item.critical) acc.critical += 1;
      if (item.emergency && item.critical) acc.emergencyCritical += 1;
      if (item.reorderDue) acc.reorder += 1;
      if (item.over) acc.over += 1;
      if (item.needsAttention) acc.lowStock += 1;
      if (item.expiring) acc.expiring += 1;
      acc.pending += item.pendingCount;
      return acc;
    },
    { items: 0, lowStock: 0, critical: 0, emergencyCritical: 0, reorder: 0, over: 0, expiring: 0, pending: 0 }
  );
  const used = [...new Set((await MedicineInventory.distinct('category', { isActive: { $ne: false } })).filter(Boolean))];
  const known = CATEGORY_CONFIG.map((c) => c.hi);
  const categories = [...known, ...used.filter((c) => !known.includes(c)).sort()];
  const packSizeMaster = await loadSizeMaster();
  // Categories that are normally bottled use the shared size list of their unit.
  const categoryConfig = CATEGORY_CONFIG.map((c) => (c.sizes.length ? { ...c, sizes: packSizeMaster[c.unit] } : c));
  res.status(200).json({
    success: true, count: formatted.length, totals, categories, categoryConfig, packSizeMaster, itemTypes: ITEM_TYPES,
    containerKinds: CONTAINER_KINDS, unitOptions: UNITS, expiryWarnDays: EXPIRY_WARN_DAYS, canApprove: APPROVER_ROLES.includes(req.user.role), items: formatted,
  });
});

// Reads the shared item fields from a request body (used by create and update).
function readFields(body, { partial = false } = {}) {
  const out = {};
  const set = (key, value) => { if (!partial || body[key] !== undefined) out[key] = value; };
  set('code', text(body.code, 40));
  set('nameHindi', text(body.nameHindi, 120));
  set('category', text(body.category, 80));
  set('itemType', text(body.itemType, 40));
  set('rack', text(body.rack, 60));
  set('lowStockAt', amount(body.lowStockAt));
  set('reorderLevel', amount(body.reorderLevel));
  set('maxLevel', amount(body.maxLevel));
  set('avgDailyUse', amount(body.avgDailyUse));
  set('batchNo', text(body.batchNo, 60));
  set('supplier', text(body.supplier, 120));
  set('usedIn', text(body.usedIn, 300));
  set('emergency', Boolean(body.emergency));
  set('fastMoving', Boolean(body.fastMoving));
  set('notes', text(body.notes, 2000));
  if (!partial || body.expiryDate !== undefined) out.expiryDate = parseDate(body.expiryDate);
  if (!partial || body.packSizes !== undefined) {
    const sizes = Array.isArray(body.packSizes) ? body.packSizes : String(body.packSizes || '').split(',');
    out.packSizes = [...new Set(sizes.map((s) => round(Number(s))).filter((s) => s > 0))].sort((a, b) => b - a);
  }
  if (!partial || body.containerKind !== undefined || body.containerSize !== undefined || body.containerUnit !== undefined) {
    out.containerKind = CONTAINER_KINDS.includes(body.containerKind) ? body.containerKind : '';
    out.containerSize = amount(body.containerSize);
    out.containerUnit = ['ml', 'g'].includes(body.containerUnit) ? body.containerUnit : '';
  }
  return out;
}

const checkLevels = ({ lowStockAt: min, reorderLevel: reorder, maxLevel: max }) => {
  if (min && reorder && reorder < min) fail('Reorder level must be equal to or above the minimum level');
  if (reorder && max && max < reorder) fail('Maximum level must be equal to or above the reorder level');
};

async function readRecipe(body, selfId) {
  if (body.recipe === undefined) return undefined;
  const raw = body.recipe;
  if (!raw || !Array.isArray(raw.ingredients) || !raw.ingredients.length) return null;
  const per = Number(raw.per);
  if (!(per > 0)) fail('Recipe: enter how much medicine the ingredients make');
  const ids = raw.ingredients.map((i) => String(i.itemId));
  if (ids.some((id) => !mongoose.isObjectIdOrHexString(id) || (selfId && id === String(selfId)))) fail('Recipe: choose valid ingredients');
  const found = await MedicineInventory.find({ _id: { $in: ids } }).select('_id').lean();
  if (found.length !== new Set(ids).size) fail('Recipe: an ingredient was not found');
  return { per, ingredients: raw.ingredients.map((i) => ({ item: i.itemId, qty: parseFloat(i.qty) })).filter((i) => i.qty > 0) };
}

function checkContainerFields(fields, category) {
  if (category === PACKING_CATEGORY && fields.containerKind !== 'Label') {
    if (!(fields.containerSize > 0) || !fields.containerUnit) fail('Packing item: enter the container size and unit (e.g. 150 ml)');
  }
}

const createInventoryItem = asyncHandler(async (req, res) => {
  const name = text(req.body.name, 160);
  const config = CATEGORY_CONFIG.find((c) => c.hi === text(req.body.category, 80));
  const unit = req.body.unit || config?.unit || 'gram';
  const openingStock = amount(req.body.openingStock);
  if (!name) fail('Medicine name is required');
  if (!UNITS.includes(unit)) fail('Choose ml, gram, tablet or piece as the unit');
  const fields = readFields(req.body);
  checkLevels(fields);
  checkContainerFields(fields, fields.category);
  if (await MedicineInventory.findOne({ isActive: { $ne: false }, name: { $regex: `^${escapeRegex(name)}$`, $options: 'i' } })) fail('This medicine already exists in inventory');
  if (fields.code && await MedicineInventory.findOne({ isActive: { $ne: false }, code: { $regex: `^${escapeRegex(fields.code)}$`, $options: 'i' } })) fail('This code is already used by another medicine');

  // Already-filled bottles at the start: [{ size, count }]
  const packs = [];
  const openingPacks = Array.isArray(req.body.openingPacks) ? req.body.openingPacks : [];
  if (openingPacks.length && !PACKABLE_UNITS.includes(unit)) fail('Bottle sizes are available for ml / gram items only');
  openingPacks.forEach((p) => {
    const size = Number(p.size); const count = Math.trunc(Number(p.count));
    if (!(size > 0) || !(count > 0)) return;
    const existing = packs.find((x) => sameSize(x.size, size));
    if (existing) existing.count += count; else packs.push({ size, kind: kindFor(unit, size), count });
  });
  packs.forEach((p) => { if (!fields.packSizes.some((s) => sameSize(s, p.size))) fields.packSizes.push(p.size); });
  if (fields.packSizes.length && !PACKABLE_UNITS.includes(unit)) fail('Bottle sizes are available for ml / gram items only');
  const packedTotal = round(packs.reduce((sum, p) => sum + p.size * p.count, 0));
  const total = round(openingStock + packedTotal);
  const recipe = await readRecipe(req.body, null);

  const item = new MedicineInventory({
    name, unit, ...fields, packs, recipe: recipe || null,
    currentStock: total,
    createdByName: req.user.name,
  });
  if (total) {
    const first = await InventoryCounter.reserve('medicine-ledger', 1);
    item.transactions.push({ txId: `TX-${first}`, type: 'add', subType: 'Opening stock', quantity: total, delta: total, previousStock: 0, newStock: total, detail: 'Opening stock', ref: 'Item master', notes: fields.notes, recordedByName: req.user.name, recordedByRole: req.user.role, status: 'done' });
  }
  await item.save();
  res.status(201).json({ success: true, item: formatInventory(item) });
});

const updateInventoryItem = asyncHandler(async (req, res) => {
  const item = await MedicineInventory.findById(req.params.id);
  if (!item) fail('Medicine inventory item not found', 404);
  if (req.body.name !== undefined) {
    const name = text(req.body.name, 160);
    if (!name) fail('Medicine name is required');
    if (name.toLowerCase() !== item.name.toLowerCase() && await MedicineInventory.findOne({ _id: { $ne: item._id }, isActive: { $ne: false }, name: { $regex: `^${escapeRegex(name)}$`, $options: 'i' } })) fail('This medicine already exists in inventory');
    item.name = name;
  }
  if (req.body.unit !== undefined) {
    if (req.body.unit !== item.unit && !UNITS.includes(req.body.unit)) fail('Choose ml, gram, tablet or piece as the unit');
    if (req.body.unit !== item.unit && (item.packs.some((p) => p.count > 0) || item.currentStock > 0)) fail('Unit can only be changed while the stock is zero');
    item.unit = req.body.unit;
  }
  const fields = readFields(req.body, { partial: true });
  if (fields.code && fields.code.toLowerCase() !== String(item.code || '').toLowerCase()
    && await MedicineInventory.findOne({ _id: { $ne: item._id }, isActive: { $ne: false }, code: { $regex: `^${escapeRegex(fields.code)}$`, $options: 'i' } })) fail('This code is already used by another medicine');
  checkLevels({ lowStockAt: fields.lowStockAt ?? item.lowStockAt, reorderLevel: fields.reorderLevel ?? item.reorderLevel, maxLevel: fields.maxLevel ?? item.maxLevel });
  if (fields.packSizes) {
    if (fields.packSizes.length && !PACKABLE_UNITS.includes(item.unit)) fail('Bottle sizes are available for ml / gram items only');
    // A size that still has filled bottles cannot be dropped from the list.
    (item.packs || []).filter((p) => p.count > 0).forEach((p) => { if (!fields.packSizes.some((s) => sameSize(s, p.size))) fields.packSizes.push(p.size); });
  }
  checkContainerFields({ containerKind: fields.containerKind ?? item.containerKind, containerSize: fields.containerSize ?? item.containerSize, containerUnit: fields.containerUnit ?? item.containerUnit }, fields.category ?? item.category);
  const recipe = await readRecipe(req.body, item._id);
  Object.assign(item, fields);
  if (recipe !== undefined) item.recipe = recipe;
  item.editedByName = req.user.name;
  item.editedAt = new Date();
  await item.save();
  res.status(200).json({ success: true, item: formatInventory(item) });
});

// @desc    Admin / doctor removes a medicine. It disappears from every list; its ledger rows stay as history.
// @route   DELETE /api/medicine/inventory/:id
const deleteInventoryItem = asyncHandler(async (req, res) => {
  const item = await MedicineInventory.findById(req.params.id);
  if (!item || item.isActive === false) fail('Medicine inventory item not found', 404);
  const usedBy = await MedicineInventory.find({ _id: { $ne: item._id }, isActive: { $ne: false }, 'recipe.ingredients.item': item._id }).select('name');
  if (usedBy.length) fail(`${item.name} is an ingredient in the recipe of ${usedBy.slice(0, 3).map((i) => i.name).join(', ')}. Remove it from that recipe first`);
  if (item.transactions.some((t) => t.status === 'pending')) fail('This medicine has an adjustment waiting for approval. Approve or reject it first');
  item.isActive = false;
  item.deletedAt = new Date();
  item.deletedByName = req.user.name;
  item.purchaseRequest = null;
  await item.save();
  res.json({ success: true, id: String(item._id), name: item.name, stockLeft: round(item.currentStock) });
});

// ---------- stock entry (one or many medicines at once) ----------
async function loadEntryItems(lines) {
  const ids = [...new Set(lines.map((l) => String(l.itemId)))];
  if (ids.some((id) => !mongoose.isObjectIdOrHexString(id))) fail('Choose a medicine on every line');
  const docs = await MedicineInventory.find({ _id: { $in: ids }, isActive: { $ne: false } });
  const byId = new Map(docs.map((d) => [String(d._id), d]));
  // Recipe ingredients and empty containers are needed too, and they must be the same document instances.
  const extraIds = docs.flatMap((d) => (d.recipe?.ingredients || []).map((i) => String(i.item))).filter((id) => !byId.has(id));
  const extra = extraIds.length ? await MedicineInventory.find({ _id: { $in: extraIds } }) : [];
  const containers = await MedicineInventory.find({ category: PACKING_CATEGORY, containerSize: { $gt: 0 }, isActive: { $ne: false } });
  [...extra, ...containers].forEach((d) => { if (!byId.has(String(d._id))) byId.set(String(d._id), d); });
  return { byId, containers: containers.map((c) => byId.get(String(c._id))) };
}

const addEntry = asyncHandler(async (req, res) => {
  const act = req.body.act;
  if (!ENTRY_ACTS.includes(act)) fail('Choose Stock In, Use, Adjust or Pack');
  const lines = Array.isArray(req.body.lines) ? req.body.lines.filter((l) => l && (l.itemId || l.qty)) : [];
  if (!lines.length) fail('Add at least one medicine and quantity');
  if (lines.length > 60) fail('An entry can have up to 60 lines');
  const subType = text(req.body.subType, 80);
  const ref = text(req.body.ref, 120);
  const note = text(req.body.note, 500);
  if (act === 'use' && /^patient/i.test(subType) && !ref) fail('Patient order needs the MED ID / Patient ID');

  const { byId, containers } = await loadEntryItems(lines);
  const ctx = {
    act, subType, ref, note, now: new Date(), rows: [], user: { name: req.user.name, role: req.user.role },
    meta: { expiryDate: req.body.expiryDate, batchNo: req.body.batchNo },
    byId: (id) => byId.get(id) || null,
    findContainer: (item, size) => containers.find((c) => c.containerUnit === (item.unit === 'gram' ? 'g' : 'ml') && sameSize(c.containerSize, size)
      && (item.unit === 'gram' ? c.containerKind === 'Jar' : ['Bottle', 'शीशी'].includes(c.containerKind))) || null,
  };
  const errors = [];
  lines.forEach((line, index) => {
    const item = byId.get(String(line.itemId));
    try {
      if (!item) fail('Choose a medicine');
      applyLine(act, item, line, ctx);
    } catch (error) { errors.push(`Line ${index + 1}${item ? ` (${item.name})` : ''}: ${error.message}`); }
  });
  if (errors.length) fail(errors[0], 400, { errors });

  // Everything passed: number the rows, write them into each item's ledger, save.
  const first = await InventoryCounter.reserve('medicine-ledger', ctx.rows.length);
  const created = [];
  ctx.rows.forEach(({ item, entry }, index) => {
    const txId = `TX-${first + index}`;
    item.transactions.push({ ...entry, txId });
    created.push({ txId, itemId: String(item._id), itemName: item.name, type: entry.type, status: entry.status });
  });
  const touched = [...new Set(ctx.rows.map((r) => r.item))];
  touched.forEach((item) => { item.editedByName = req.user.name; item.editedAt = ctx.now; });
  await Promise.all(touched.map((item) => item.save()));
  res.status(200).json({ success: true, created, pending: created.filter((c) => c.status === 'pending').length, items: touched.map((item) => formatInventory(item, ctx.now)) });
});

// ---------- ledger ----------
// @desc    Stock ledger across all medicines, newest first
// @route   GET /api/medicine/inventory/ledger?type=add|consume|adjust|pack|pending&itemId=
const listLedger = asyncHandler(async (req, res) => {
  const match = {};
  const type = String(req.query.type || '');
  if (type === 'pending') match['transactions.status'] = 'pending';
  else if (['add', 'consume', 'adjust', 'pack'].includes(type)) match['transactions.type'] = type;
  const itemFilter = mongoose.isObjectIdOrHexString(String(req.query.itemId || '')) ? { _id: new mongoose.Types.ObjectId(String(req.query.itemId)) } : {};
  const [rows, grouped] = await Promise.all([
    MedicineInventory.aggregate([
      { $match: itemFilter }, { $unwind: '$transactions' }, { $match: match },
      { $sort: { 'transactions.createdAt': -1, 'transactions._id': -1 } }, { $limit: 400 },
      { $project: { name: 1, nameHindi: 1, code: 1, unit: 1, category: 1, tx: '$transactions' } },
    ]),
    MedicineInventory.aggregate([
      { $match: itemFilter }, { $unwind: '$transactions' },
      { $group: { _id: { type: '$transactions.type', pending: { $eq: ['$transactions.status', 'pending'] } }, n: { $sum: 1 } } },
    ]),
  ]);
  const counts = { all: 0, add: 0, consume: 0, adjust: 0, pack: 0, pending: 0 };
  grouped.forEach(({ _id, n }) => { counts.all += n; counts[_id.type] = (counts[_id.type] || 0) + n; if (_id.pending) counts.pending += n; });
  res.json({
    success: true, counts, canApprove: APPROVER_ROLES.includes(req.user.role),
    rows: rows.map((r) => ({ itemId: String(r._id), itemName: r.name, itemHindi: r.nameHindi || '', itemCode: r.code || '', unit: r.unit, category: r.category || '', ...formatTransaction(r.tx) })),
  });
});

// @desc    Approve or reject a waiting adjustment
// @route   POST /api/medicine/inventory/ledger/:itemId/:txnId/decision   { decision: 'approve' | 'reject' }
const decideTransaction = asyncHandler(async (req, res) => {
  const decision = req.body.decision;
  if (!['approve', 'reject'].includes(decision)) fail('Choose approve or reject');
  const item = await MedicineInventory.findById(req.params.itemId);
  if (!item) fail('Medicine inventory item not found', 404);
  const txn = item.transactions.id(req.params.txnId);
  if (!txn) fail('Ledger entry not found', 404);
  decidePending(item, txn, decision, { name: req.user.name, role: req.user.role });
  item.editedByName = req.user.name;
  item.editedAt = new Date();
  await item.save();
  res.json({ success: true, item: formatInventory(item), transaction: formatTransaction(txn) });
});

const getItemHistory = asyncHandler(async (req, res) => {
  const item = await MedicineInventory.findById(req.params.id);
  if (!item) fail('Medicine inventory item not found', 404);
  res.json({ success: true, item: formatInventory(item, new Date(), { history: 500 }) });
});

const raisePurchaseRequest = asyncHandler(async (req, res) => {
  const item = await MedicineInventory.findById(req.params.id);
  if (!item) fail('Medicine inventory item not found', 404);
  const view = inventoryView(item);
  if (!view.reorderDue && !view.critical) fail('This medicine is not below its reorder level');
  item.purchaseRequest = { raisedAt: new Date(), raisedByName: req.user.name, quantity: view.suggestedOrder };
  await item.save();
  res.json({ success: true, item: formatInventory(item) });
});

module.exports = {
  listInventory, createInventoryItem, updateInventoryItem, deleteInventoryItem, addEntry, addPackSize, removePackSize, listLedger, decideTransaction, getItemHistory, raisePurchaseRequest, formatInventory,
};
