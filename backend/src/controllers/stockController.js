const mongoose = require('mongoose');
const StockItem = require('../models/StockItem');
const StockTransaction = require('../models/StockTransaction');
const { asyncHandler } = require('../middleware/errorHandler');
const { ROLES } = require('../constants/roles');

const STOCK_ROLES = [ROLES.ADMIN, ROLES.DOCTOR, ROLES.MEDICINE_DEPARTMENT];
const fail = (message, statusCode = 400) => { throw Object.assign(new Error(message), { statusCode }); };
const clean = (v, max = 200) => String(v ?? '').trim().slice(0, max);
const qtyOf = (value, label = 'quantity') => {
  const n = Number(String(value ?? '').replace(/,/g, '').trim());
  if (!Number.isFinite(n) || n < 0) fail(`Enter a valid ${label}`);
  return Math.round(n * 1000) / 1000;
};
const dateOrNull = (v) => { if (!v) return null; const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(v) ? `${v}T00:00:00.000+05:30` : v); if (Number.isNaN(d.getTime())) fail('Enter a valid date'); return d; };
const iso = (v) => (v ? new Date(v).toISOString() : null);

const formatItem = (item) => {
  const i = item.toObject ? item.toObject() : item;
  const stock = Number(i.currentStock || 0);
  return {
    id: String(i._id), code: i.code, name: i.name, nameHindi: i.nameHindi || '', kind: i.kind, unit: i.unit,
    currentStock: stock, minLevel: Number(i.minLevel || 0), batchNo: i.batchNo || '', expiryDate: iso(i.expiryDate),
    gramsPerSpoon: i.gramsPerSpoon ?? null, dropsPerMl: i.dropsPerMl ?? null, notes: i.notes || '', isActive: i.isActive !== false,
    low: stock <= Number(i.minLevel || 0), expired: Boolean(i.expiryDate && new Date(i.expiryDate) < new Date()),
    updatedAt: iso(i.updatedAt),
  };
};
const formatTx = (t) => ({ id: String(t._id), itemId: String(t.item), code: t.code, type: t.type, quantity: t.quantity, delta: t.delta, before: t.before, after: t.after, refType: t.refType, jobId: t.job ? String(t.job) : '', ref: t.ref, batchNo: t.batchNo, note: t.note, byName: t.byName, byRole: t.byRole, at: iso(t.createdAt) });

// Moves stock and writes the ledger row. `delta` is signed. Used by the stock page and by medicine jobs.
const moveStock = async (item, { type, quantity, delta, user, refType = '', job = null, ref = '', batchNo = '', note = '' }) => {
  const before = Number(item.currentStock || 0);
  const after = Math.round((before + delta) * 1000) / 1000;
  if (after < 0) fail(`${item.name} (${item.code}): only ${before} ${item.unit} in stock, ${Math.abs(delta)} ${item.unit} needed`);
  item.currentStock = after;
  if (batchNo) item.batchNo = batchNo;
  await item.save();
  return StockTransaction.create({ item: item._id, code: item.code, type, quantity, delta, before, after, refType, job, ref, batchNo, note, byName: user.name, byRole: user.role });
};

// @route GET /api/stocks
const listStocks = asyncHandler(async (req, res) => {
  const items = await StockItem.find(req.query.all === 'true' ? {} : { isActive: { $ne: false } }).sort({ kind: 1, name: 1 });
  res.json({ success: true, items: items.map(formatItem) });
});

// @route POST /api/stocks
const createStock = asyncHandler(async (req, res) => {
  const b = req.body || {};
  const code = clean(b.code, 40).toUpperCase();
  if (!code) fail('Enter the item code');
  if (!clean(b.name)) fail('Enter the item name');
  if (!StockItem.STOCK_UNITS.includes(b.unit)) fail('Select the unit');
  if (await StockItem.exists({ code })) fail(`Code ${code} already exists`, 409);
  const item = await StockItem.create({
    code, name: clean(b.name), nameHindi: clean(b.nameHindi), kind: ['medicine', 'component', 'packing'].includes(b.kind) ? b.kind : 'medicine', unit: b.unit,
    currentStock: 0, minLevel: qtyOf(b.minLevel || 0, 'minimum level'), batchNo: clean(b.batchNo, 80), expiryDate: dateOrNull(b.expiryDate),
    gramsPerSpoon: b.gramsPerSpoon ? qtyOf(b.gramsPerSpoon, 'grams per spoon') : null, dropsPerMl: b.dropsPerMl ? qtyOf(b.dropsPerMl, 'drops per ml') : null, notes: clean(b.notes, 1000),
  });
  const opening = qtyOf(b.openingStock || 0, 'opening stock');
  if (opening > 0) await moveStock(item, { type: 'add', quantity: opening, delta: opening, user: req.user, refType: 'count', note: 'Opening stock', batchNo: item.batchNo });
  res.status(201).json({ success: true, item: formatItem(item) });
});

// @route PATCH /api/stocks/:id   (details only; quantities move through transactions)
const updateStock = asyncHandler(async (req, res) => {
  const item = await StockItem.findById(req.params.id);
  if (!item) fail('Stock item not found', 404);
  const b = req.body || {};
  if (b.name !== undefined) item.name = clean(b.name) || item.name;
  if (b.nameHindi !== undefined) item.nameHindi = clean(b.nameHindi);
  if (b.kind !== undefined && ['medicine', 'component', 'packing'].includes(b.kind)) item.kind = b.kind;
  if (b.minLevel !== undefined) item.minLevel = qtyOf(b.minLevel, 'minimum level');
  if (b.batchNo !== undefined) item.batchNo = clean(b.batchNo, 80);
  if (b.expiryDate !== undefined) item.expiryDate = dateOrNull(b.expiryDate);
  if (b.gramsPerSpoon !== undefined) item.gramsPerSpoon = b.gramsPerSpoon === '' || b.gramsPerSpoon === null ? null : qtyOf(b.gramsPerSpoon, 'grams per spoon');
  if (b.dropsPerMl !== undefined) item.dropsPerMl = b.dropsPerMl === '' || b.dropsPerMl === null ? null : qtyOf(b.dropsPerMl, 'drops per ml');
  if (b.notes !== undefined) item.notes = clean(b.notes, 1000);
  if (b.isActive !== undefined) item.isActive = b.isActive === true || b.isActive === 'true';
  await item.save();
  res.json({ success: true, item: formatItem(item) });
});

// @route POST /api/stocks/:id/transactions   body: { type: add|adjust|return, quantity, note, batchNo, expiryDate }
// add = stock received; return = unused material back from a job; adjust = physical count correction (quantity is the counted stock).
const addStockTransaction = asyncHandler(async (req, res) => {
  const item = await StockItem.findById(req.params.id);
  if (!item) fail('Stock item not found', 404);
  const b = req.body || {};
  const quantity = qtyOf(b.quantity);
  if (!['add', 'adjust', 'return'].includes(b.type)) fail('Select what this entry is');
  if (b.type !== 'adjust' && quantity <= 0) fail('Enter the quantity');
  if (b.type === 'adjust' && !clean(b.note)) fail('Write why the stock is being corrected');
  if (b.expiryDate) item.expiryDate = dateOrNull(b.expiryDate);
  const delta = b.type === 'adjust' ? Math.round((quantity - Number(item.currentStock || 0)) * 1000) / 1000 : quantity;
  const tx = await moveStock(item, { type: b.type, quantity, delta, user: req.user, refType: b.type === 'add' ? 'purchase' : 'count', batchNo: clean(b.batchNo, 80), note: clean(b.note, 500) });
  res.status(201).json({ success: true, item: formatItem(item), transaction: formatTx(tx) });
});

// @route GET /api/stocks/ledger?item=&job=&limit=
const listLedger = asyncHandler(async (req, res) => {
  const filter = {};
  if (req.query.item) { if (!mongoose.Types.ObjectId.isValid(String(req.query.item))) fail('Invalid item'); filter.item = req.query.item; }
  if (req.query.job) { if (!mongoose.Types.ObjectId.isValid(String(req.query.job))) fail('Invalid job'); filter.job = req.query.job; }
  const limit = Math.min(parseInt(req.query.limit, 10) || 200, 1000);
  const rows = await StockTransaction.find(filter).sort({ createdAt: -1 }).limit(limit).lean();
  res.json({ success: true, rows: rows.map(formatTx) });
});

module.exports = { STOCK_ROLES, listStocks, createStock, updateStock, addStockTransaction, listLedger, moveStock, formatItem };
