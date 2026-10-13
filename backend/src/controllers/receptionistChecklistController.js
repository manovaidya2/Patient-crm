const mongoose = require('mongoose');
const ReceptionistChecklistItem = require('../models/ReceptionistChecklistItem');
const ReceptionistChecklistRecord = require('../models/ReceptionistChecklistRecord');
const ReceptionistChecklistDayReview = require('../models/ReceptionistChecklistDayReview');
const User = require('../models/User');
const { asyncHandler } = require('../middleware/errorHandler');
const { ROLES } = require('../constants/roles');

const validDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(String(value || '')) && !Number.isNaN(Date.parse(value));
// The clinic works in Indian time, so "today" must not depend on the server clock zone.
const todayIST = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
const shiftDay = (date, days) => { const d = new Date(`${date}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); };
const serializeItem = (item) => ({ id: String(item._id), label: item.label, order: item.order });
const bad = (res, message, status = 400) => res.status(status).json({ success: false, message });

const serializeRecord = (record) => ({
  completed: Boolean(record?.completed),
  note: record?.note || '',
  completedAt: record?.completedAt || null,
  updatedAt: record?.updatedAt || null,
  review: record?.reviewVerdict || record?.reviewRemark
    ? { verdict: record.reviewVerdict || '', remark: record.reviewRemark || '', by: record.reviewedByName || '', role: record.reviewedByRole || '', at: record.reviewedAt }
    : null,
});

// Whose checklist is being looked at: a receptionist always sees their own; admin / doctor pick one.
const targetReceptionist = (req) => {
  if (req.user.role === ROLES.RECEPTIONIST) return String(req.user._id);
  const id = String(req.query.userId || req.body?.receptionistId || '');
  return mongoose.isObjectIdOrHexString(id) ? id : null;
};

const listReceptionists = asyncHandler(async (req, res) => {
  const users = await User.find({ role: ROLES.RECEPTIONIST, isActive: { $ne: false } }).select('name').sort({ name: 1 }).lean();
  res.json({ success: true, receptionists: users.map((u) => ({ id: String(u._id), name: u.name })) });
});

const listItems = asyncHandler(async (req, res) => {
  const items = await ReceptionistChecklistItem.find({ isActive: true }).sort({ order: 1, createdAt: 1 }).lean();
  res.json({ success: true, items: items.map(serializeItem) });
});

const listDaily = asyncHandler(async (req, res) => {
  const date = String(req.query.date || '');
  if (!validDate(date)) return bad(res, 'Valid date is required');
  const receptionist = targetReceptionist(req);
  if (!receptionist) return res.json({ success: true, date, today: todayIST(), receptionistId: '', items: [], dayReview: null });
  const [items, records, dayReview] = await Promise.all([
    ReceptionistChecklistItem.find({ isActive: true }).sort({ order: 1, createdAt: 1 }).lean(),
    ReceptionistChecklistRecord.find({ date, receptionist }).lean(),
    ReceptionistChecklistDayReview.findOne({ date, receptionist }).lean(),
  ]);
  const recordMap = new Map(records.map((record) => [String(record.item), record]));
  res.json({
    success: true,
    date,
    today: todayIST(),
    receptionistId: receptionist,
    items: items.map((item) => ({ ...serializeItem(item), ...serializeRecord(recordMap.get(String(item._id))) })),
    dayReview: dayReview ? { remark: dayReview.remark, by: dayReview.reviewedByName, role: dayReview.reviewedByRole, at: dayReview.updatedAt } : null,
  });
});

// Completion per day for the date strip: tasks done, tasks marked "not done properly", and whether the day was reviewed.
const getSummary = asyncHandler(async (req, res) => {
  const receptionist = targetReceptionist(req);
  const days = Math.min(Math.max(parseInt(req.query.days, 10) || 14, 1), 62);
  const today = todayIST();
  const from = shiftDay(today, -(days - 1));
  if (!receptionist) return res.json({ success: true, today, days: [] });
  const [activeItems, records, reviews] = await Promise.all([
    ReceptionistChecklistItem.find({ isActive: true }).select('_id').lean(),
    ReceptionistChecklistRecord.find({ receptionist, date: { $gte: from, $lte: today } }).select('date item completed reviewVerdict reviewRemark').lean(),
    ReceptionistChecklistDayReview.find({ receptionist, date: { $gte: from, $lte: today } }).select('date').lean(),
  ]);
  const activeIds = new Set(activeItems.map((item) => String(item._id)));
  const dayReviewed = new Set(reviews.map((r) => r.date));
  const byDate = {};
  records.filter((r) => activeIds.has(String(r.item))).forEach((r) => {
    const row = byDate[r.date] || (byDate[r.date] = { done: 0, notOk: 0, reviewed: 0 });
    if (r.completed) row.done += 1;
    if (r.reviewVerdict === 'not_ok') row.notOk += 1;
    if (r.reviewVerdict || r.reviewRemark) row.reviewed += 1;
  });
  const out = Array.from({ length: days }, (_, index) => {
    const date = shiftDay(from, index);
    const row = byDate[date] || { done: 0, notOk: 0, reviewed: 0 };
    return { date, total: activeItems.length, done: row.done, notOk: row.notOk, reviewed: row.reviewed > 0 || dayReviewed.has(date) };
  });
  res.json({ success: true, today, days: out });
});

const saveRecord = asyncHandler(async (req, res) => {
  const date = String(req.body.date || '');
  if (!validDate(date)) return bad(res, 'Valid date is required');
  // Tasks are done day by day: a receptionist cannot fill in past or future days.
  if (date !== todayIST()) return bad(res, 'The checklist can only be filled for today');
  const item = await ReceptionistChecklistItem.findOne({ _id: req.body.itemId, isActive: true });
  if (!item) return bad(res, 'Checklist item not found', 404);
  const completed = Boolean(req.body.completed);
  const note = String(req.body.note || '').trim().slice(0, 1000);
  const existing = await ReceptionistChecklistRecord.findOne({ date, item: item._id, receptionist: req.user._id }).select('completed completedAt').lean();
  const record = await ReceptionistChecklistRecord.findOneAndUpdate(
    { date, item: item._id, receptionist: req.user._id },
    { $set: { completed, note, completedAt: completed ? (existing?.completed && existing.completedAt ? existing.completedAt : new Date()) : null, updatedBy: req.user._id } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
  res.json({ success: true, record: serializeRecord(record) });
});

// Admin / doctor: was this task really done? plus a remark. Works for any day.
const reviewRecord = asyncHandler(async (req, res) => {
  const date = String(req.body.date || '');
  if (!validDate(date)) return bad(res, 'Valid date is required');
  const receptionist = targetReceptionist(req);
  if (!receptionist) return bad(res, 'Select a receptionist');
  const item = await ReceptionistChecklistItem.findById(req.body.itemId);
  if (!item) return bad(res, 'Checklist item not found', 404);
  const verdict = ['ok', 'not_ok'].includes(req.body.verdict) ? req.body.verdict : '';
  const remark = String(req.body.remark || '').trim().slice(0, 1000);
  const cleared = !verdict && !remark;
  const record = await ReceptionistChecklistRecord.findOneAndUpdate(
    { date, item: item._id, receptionist },
    {
      $set: {
        reviewVerdict: verdict,
        reviewRemark: remark,
        reviewedBy: cleared ? null : req.user._id,
        reviewedByName: cleared ? '' : req.user.name,
        reviewedByRole: cleared ? '' : req.user.role,
        reviewedAt: cleared ? null : new Date(),
      },
      $setOnInsert: { completed: false, note: '', updatedBy: req.user._id },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
  res.json({ success: true, record: serializeRecord(record) });
});

const reviewDay = asyncHandler(async (req, res) => {
  const date = String(req.body.date || '');
  if (!validDate(date)) return bad(res, 'Valid date is required');
  const receptionist = targetReceptionist(req);
  if (!receptionist) return bad(res, 'Select a receptionist');
  const remark = String(req.body.remark || '').trim().slice(0, 2000);
  if (!remark) {
    await ReceptionistChecklistDayReview.deleteOne({ date, receptionist });
    return res.json({ success: true, dayReview: null });
  }
  const review = await ReceptionistChecklistDayReview.findOneAndUpdate(
    { date, receptionist },
    { $set: { remark, reviewedBy: req.user._id, reviewedByName: req.user.name, reviewedByRole: req.user.role } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
  res.json({ success: true, dayReview: { remark: review.remark, by: review.reviewedByName, role: review.reviewedByRole, at: review.updatedAt } });
});

const createItem = asyncHandler(async (req, res) => {
  const label = String(req.body.label || '').trim().slice(0, 200);
  if (!label) return bad(res, 'Checklist item is required');
  const last = await ReceptionistChecklistItem.findOne({ isActive: true }).sort({ order: -1 }).lean();
  const item = await ReceptionistChecklistItem.create({ label, order: (last?.order ?? -1) + 1, createdBy: req.user._id });
  res.status(201).json({ success: true, item: serializeItem(item) });
});

const updateItem = asyncHandler(async (req, res) => {
  const item = await ReceptionistChecklistItem.findOne({ _id: req.params.id, isActive: true });
  if (!item) return bad(res, 'Checklist item not found', 404);
  if (req.body.label !== undefined) item.label = String(req.body.label || '').trim().slice(0, 200);
  if (!item.label) return bad(res, 'Checklist item is required');
  if (req.body.order !== undefined) item.order = Number(req.body.order);
  await item.save();
  res.json({ success: true, item: serializeItem(item) });
});

const deleteItem = asyncHandler(async (req, res) => {
  const item = await ReceptionistChecklistItem.findById(req.params.id);
  if (!item) return bad(res, 'Checklist item not found', 404);
  item.isActive = false;
  await item.save();
  res.json({ success: true });
});

module.exports = { listReceptionists, listItems, listDaily, getSummary, saveRecord, reviewRecord, reviewDay, createItem, updateItem, deleteItem, todayIST };
