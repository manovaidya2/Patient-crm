const HrClinicExpense = require('../models/HrClinicExpense');
const { asyncHandler } = require('../middleware/errorHandler');
const { ROLES } = require('../constants/roles');
const { validDateKey } = require('../utils/hrRecruitmentUtils');

const CATEGORIES = ['tea_coffee', 'pantry', 'cleaning', 'rent', 'electricity', 'internet', 'stationery', 'maintenance', 'vendor', 'raw_material', 'other'];
const PAYMENT_STATUSES = ['paid', 'unpaid', 'partial'];
const APPROVALS = ['pending', 'approved', 'rejected'];

const clean = (value, max = 1000) => String(value || '').trim().slice(0, max);
const regex = (value) => clean(value, 100).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const serialize = (row) => ({
  id: String(row._id), date: row.date, category: row.category, vendor: row.vendor, amount: row.amount, billNumber: row.billNumber,
  paymentStatus: row.paymentStatus, approval: row.approval, remarks: row.remarks, ownerReview: row.ownerReview,
  reviewedByName: row.reviewedByName, reviewedAt: row.reviewedAt, createdByName: row.createdByName, updatedByName: row.updatedByName,
  createdAt: row.createdAt, updatedAt: row.updatedAt,
});

const listExpenses = asyncHandler(async (req, res) => {
  const filter = {};
  const search = regex(req.query.search);
  if (search) filter.$or = ['vendor', 'billNumber', 'remarks'].map((field) => ({ [field]: { $regex: search, $options: 'i' } }));
  if (CATEGORIES.includes(req.query.category)) filter.category = req.query.category;
  if (APPROVALS.includes(req.query.approval)) filter.approval = req.query.approval;
  if (PAYMENT_STATUSES.includes(req.query.paymentStatus)) filter.paymentStatus = req.query.paymentStatus;
  if (validDateKey(req.query.from, true) && req.query.from) filter.date = { ...filter.date, $gte: req.query.from };
  if (validDateKey(req.query.to, true) && req.query.to) filter.date = { ...filter.date, $lte: req.query.to };
  const rows = await HrClinicExpense.find(filter).sort({ date: -1, createdAt: -1 }).limit(2000).lean();
  const total = rows.reduce((sum, row) => sum + row.amount, 0);
  const approved = rows.filter((row) => row.approval === 'approved').reduce((sum, row) => sum + row.amount, 0);
  const pending = rows.filter((row) => row.approval === 'pending').reduce((sum, row) => sum + row.amount, 0);
  const unpaid = rows.filter((row) => row.paymentStatus !== 'paid').reduce((sum, row) => sum + row.amount, 0);
  res.json({ success: true, expenses: rows.map(serialize), summary: { total, approved, pending, unpaid } });
});

const saveExpense = asyncHandler(async (req, res) => {
  const isAdmin = req.user.role === ROLES.ADMIN;
  const amount = Number(req.body.amount);
  const payload = {
    date: clean(req.body.date, 10), category: clean(req.body.category, 30), vendor: clean(req.body.vendor, 180), amount,
    billNumber: clean(req.body.billNumber, 100), paymentStatus: clean(req.body.paymentStatus, 20) || 'paid', remarks: clean(req.body.remarks, 1000),
  };
  if (!validDateKey(payload.date) || !CATEGORIES.includes(payload.category) || !Number.isFinite(amount) || amount < 0) return res.status(400).json({ success: false, message: 'Date, category and a valid amount are required' });
  if (!PAYMENT_STATUSES.includes(payload.paymentStatus)) return res.status(400).json({ success: false, message: 'Select a valid payment status' });

  let row;
  if (req.params.id) {
    row = await HrClinicExpense.findById(req.params.id);
    if (!row) return res.status(404).json({ success: false, message: 'Expense not found' });
    if (!isAdmin && row.approval !== 'pending') return res.status(403).json({ success: false, message: 'Only pending expenses can be edited. Ask Admin for changes.' });
    Object.assign(row, payload);
  } else {
    row = new HrClinicExpense({ ...payload, createdBy: req.user._id, createdByName: req.user.name });
  }
  if (isAdmin) {
    const approval = clean(req.body.approval, 20) || row.approval;
    if (!APPROVALS.includes(approval)) return res.status(400).json({ success: false, message: 'Select a valid approval status' });
    if (approval !== row.approval || req.body.ownerReview !== undefined) {
      row.approval = approval; row.ownerReview = clean(req.body.ownerReview, 1000);
      row.reviewedBy = req.user._id; row.reviewedByName = req.user.name; row.reviewedAt = new Date();
    }
  }
  row.updatedBy = req.user._id; row.updatedByName = req.user.name;
  await row.save();
  res.status(req.params.id ? 200 : 201).json({ success: true, expense: serialize(row) });
});

const reviewExpense = asyncHandler(async (req, res) => {
  const approval = clean(req.body.approval, 20);
  if (!APPROVALS.includes(approval)) return res.status(400).json({ success: false, message: 'Select a valid approval status' });
  const row = await HrClinicExpense.findById(req.params.id);
  if (!row) return res.status(404).json({ success: false, message: 'Expense not found' });
  row.approval = approval; row.ownerReview = clean(req.body.ownerReview, 1000);
  row.reviewedBy = req.user._id; row.reviewedByName = req.user.name; row.reviewedAt = new Date();
  row.updatedBy = req.user._id; row.updatedByName = req.user.name;
  await row.save();
  res.json({ success: true, expense: serialize(row) });
});

const deleteExpense = asyncHandler(async (req, res) => {
  const row = await HrClinicExpense.findByIdAndDelete(req.params.id);
  if (!row) return res.status(404).json({ success: false, message: 'Expense not found' });
  res.json({ success: true });
});

module.exports = { listExpenses, saveExpense, reviewExpense, deleteExpense };
