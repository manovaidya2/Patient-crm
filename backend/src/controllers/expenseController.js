const fs = require('fs/promises');
const path = require('path');
const mongoose = require('mongoose');
const Expense = require('../models/Expense');
const Counter = require('../models/Counter');
const { asyncHandler } = require('../middleware/errorHandler');
const { ROLES } = require('../constants/roles');

// Expenses and payment vouchers (see models/Expense).
//  Reception writes clinic expenses, the Medicine Department medicine purchases (the Manager supervises both);
//  each makes the voucher of its entries. Admin / Doctor see both, approve or send back vouchers, and settle the
//  money: repay whoever paid from their own pocket, or pay a supplier who gave credit.
const KINDS = {
  clinic: { prefix: 'CV', label: 'Clinic expense', owner: ROLES.RECEPTIONIST },
  medicine: { prefix: 'MV', label: 'Medicine purchase', owner: ROLES.MEDICINE_DEPARTMENT },
};
const PAID_FROM = { own: 'Own money (to be repaid)', clinic_cash: 'Clinic cash', clinic_bank: 'Clinic bank / UPI', credit: 'On credit (supplier paid later)' };
const MODES = ['', 'cash', 'upi', 'card', 'bank'];
const fail = (message, statusCode = 400) => { throw Object.assign(new Error(message), { statusCode }); };
const text = (v, label, max, required = false) => {
  const s = String(v ?? '').trim();
  if (required && !s) fail(`${label} is required`);
  if (s.length > max) fail(`${label} is too long (maximum ${max} characters)`);
  return s;
};
const money = (v) => Math.round(Number(v || 0) * 100) / 100;
const istToday = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
const validDay = (d) => /^\d{4}-\d{2}-\d{2}$/.test(String(d || '')) && !Number.isNaN(Date.parse(d));

// ---- who may do what
const isApprover = (user) => [ROLES.ADMIN, ROLES.DOCTOR].includes(user.role);
// The kinds a person sees / writes: Admin, Doctor and Manager both; Reception clinic; Medicine Department medicine.
const kindsOf = (user) => {
  if (isApprover(user) || user.role === ROLES.MANAGER) return ['clinic', 'medicine'];
  return Object.keys(KINDS).filter((k) => KINDS[k].owner === user.role);
};
const canWrite = (user, kind) => kindsOf(user).includes(kind);
// An entry is changed until its voucher is approved (then only Admin / Doctor), never after it is settled.
const settled = (e) => ['repaid', 'supplier_paid'].includes(e.repayStatus);
const canEdit = (user, e) => canWrite(user, e.kind) && !settled(e) && (e.voucher?.status !== 'approved' || isApprover(user));

const repayStatusFor = (paidFrom) => (paidFrom === 'own' ? 'to_repay' : paidFrom === 'credit' ? 'supplier_due' : 'not_needed');
const log = (e, user, action, details = '') => e.history.push({ at: new Date(), byName: user.name, byRole: user.role, action, details });
const fileUrl = (f) => ({ url: `/uploads/expenses/${f.filename}`, fileName: f.originalname || 'Bill' });
const dropFiles = (files = []) => Promise.all(files.map((f) => (f?.path ? fs.unlink(f.path).catch(() => {}) : null)));
const removeStored = (url) => (/^\/uploads\/expenses\/[\w.-]+$/.test(url || '') ? fs.unlink(path.join(__dirname, '../..', url)).catch(() => {}) : null);
const emit = (req) => req.app?.get?.('io')?.emit('expenses:changed', {});

const pick = (obj, keys) => Object.fromEntries(keys.map((k) => [k, obj?.[k] ?? null]));
const view = (e, user) => ({
  id: String(e._id), kind: e.kind, kindLabel: KINDS[e.kind].label, date: e.date, purpose: e.purpose, vendor: e.vendor, invoiceNo: e.invoiceNo,
  items: e.items || [], extraCharges: e.extraCharges || 0, amount: e.amount,
  paidByName: e.paidByName, paidFrom: e.paidFrom, paidFromLabel: PAID_FROM[e.paidFrom], paymentMode: e.paymentMode, bills: e.bills || [], notes: e.notes,
  voucher: e.voucher?.number ? pick(e.voucher, ['number', 'payTo', 'status', 'madeAt', 'madeByName', 'approvedAt', 'approvedByName', 'rejectedAt', 'rejectedByName', 'rejectReason']) : null,
  repayStatus: e.repayStatus, settlement: e.settlement?.at ? pick(e.settlement, ['date', 'mode', 'reference', 'toName', 'byName', 'at', 'reason']) : null,
  history: [...(e.history || [])].reverse(),
  createdByName: e.createdByName, createdAt: e.createdAt, editedAt: e.editedAt, editedByName: e.editedByName,
  can: {
    edit: canEdit(user, e), voucher: canWrite(user, e.kind) && !e.voucher?.number,
    remakeVoucher: canWrite(user, e.kind) && e.voucher?.status === 'rejected',
    approve: isApprover(user) && e.voucher?.status === 'pending',
    settle: isApprover(user) && e.voucher?.status === 'approved' && ['to_repay', 'supplier_due'].includes(e.repayStatus),
    notNeeded: isApprover(user) && e.repayStatus === 'to_repay',
    remove: user.role === ROLES.ADMIN,
  },
});

// The fields of an entry from the form (multipart: items as JSON).
const fieldsOf = (body, kind) => {
  const date = String(body.date || '');
  if (!validDay(date)) fail('Choose the date');
  if (date > istToday()) fail('The date cannot be in the future');
  const purpose = text(body.purpose, 'What it was for', 300, true);
  const paidByName = text(body.paidByName, 'Who paid', 120, true);
  const paidFrom = String(body.paidFrom || '');
  if (!PAID_FROM[paidFrom]) fail('Choose where the money came from');
  if (paidFrom === 'credit' && kind !== 'medicine') fail('Credit is only for a medicine purchase from a supplier');
  const paymentMode = String(body.paymentMode || '');
  if (!MODES.includes(paymentMode)) fail('Choose a valid payment mode');
  const out = { date, purpose, paidByName, paidFrom, paymentMode, vendor: text(body.vendor, kind === 'medicine' ? 'Supplier' : 'Shop / person paid', 150, kind === 'medicine'), invoiceNo: text(body.invoiceNo, 'Bill / invoice number', 60), notes: text(body.notes, 'Note', 1000) };
  if (kind === 'medicine') {
    let items = body.items;
    if (typeof items === 'string') { try { items = JSON.parse(items); } catch { fail('The items could not be read'); } }
    items = (Array.isArray(items) ? items : []).map((i) => ({ name: text(i?.name, 'Item name', 150), qty: Number(i?.qty), unit: text(i?.unit, 'Unit', 20), rate: Number(i?.rate) }))
      .filter((i) => i.name || i.qty || i.rate);
    if (!items.length) fail('Add at least one item with quantity and rate');
    items.forEach((i, n) => {
      if (!i.name) fail(`Item ${n + 1}: write the name`);
      if (!(i.qty > 0)) fail(`${i.name}: enter the quantity`);
      if (!(i.rate >= 0) || !Number.isFinite(i.rate)) fail(`${i.name}: enter the rate`);
      i.amount = money(i.qty * i.rate);
    });
    const extra = money(body.extraCharges);
    if (extra < 0) fail('Other charges cannot be negative');
    out.items = items; out.extraCharges = extra;
    out.amount = money(items.reduce((s, i) => s + i.amount, 0) + extra);
  } else {
    out.items = []; out.extraCharges = 0;
    out.amount = money(body.amount);
  }
  if (!(out.amount > 0) || out.amount > 10000000) fail('Enter the amount');
  return out;
};

// ---- list with the numbers each page shows
// @route GET /api/expenses?kind=clinic|medicine|all&from=&to=&status=&q=
const listExpenses = asyncHandler(async (req, res) => {
  const allowed = kindsOf(req.user);
  if (!allowed.length) fail('Expenses are not open for your role', 403);
  const kinds = req.query.kind && req.query.kind !== 'all' ? [req.query.kind].filter((k) => allowed.includes(k)) : allowed;
  if (!kinds.length) fail('You cannot see these expenses', 403);
  const base = { kind: { $in: kinds }, deletedAt: null };
  const range = {};
  if (validDay(req.query.from)) range.$gte = req.query.from;
  if (validDay(req.query.to)) range.$lte = req.query.to;
  const inRange = await Expense.find({ ...base, ...(Object.keys(range).length ? { date: range } : {}) }).sort({ date: -1, createdAt: -1 }).limit(2000).lean();
  // Outstanding money is shown whatever the dates.
  const open = await Expense.find({ ...base, repayStatus: { $in: ['to_repay', 'supplier_due'] } }).select('kind amount paidByName vendor repayStatus voucher.status').lean();
  const status = String(req.query.status || 'all');
  const q = String(req.query.q || '').trim().toLowerCase();
  const rows = inRange.filter((e) => (status === 'all'
    || (status === 'no_voucher' ? !e.voucher?.number || e.voucher.status === 'rejected'
      : status === 'pending_approval' ? e.voucher?.status === 'pending' : e.repayStatus === status))
    && (!q || [e.purpose, e.vendor, e.invoiceNo, e.paidByName, e.voucher?.number, ...(e.items || []).map((i) => i.name)].join(' ').toLowerCase().includes(q)));
  const sum = (list) => money(list.reduce((s, e) => s + e.amount, 0));
  const toRepay = new Map();
  open.filter((e) => e.repayStatus === 'to_repay').forEach((e) => {
    const key = e.paidByName.trim().toLowerCase();
    const v = toRepay.get(key) || { name: e.paidByName.trim(), amount: 0, count: 0, ready: 0 };
    v.amount = money(v.amount + e.amount); v.count += 1; if (e.voucher?.status === 'approved') v.ready += 1;
    toRepay.set(key, v);
  });
  // What each medicine / material cost in these dates.
  const items = new Map();
  inRange.filter((e) => e.kind === 'medicine').forEach((e) => (e.items || []).forEach((i) => {
    const key = i.name.trim().toLowerCase();
    const v = items.get(key) || { name: i.name.trim(), qty: 0, unit: i.unit || '', spend: 0, lastRate: i.rate, lastDate: e.date, buys: 0 };
    v.qty = money(v.qty + i.qty); v.spend = money(v.spend + i.amount); v.buys += 1;
    if (e.date >= v.lastDate) { v.lastRate = i.rate; v.lastDate = e.date; }
    items.set(key, v);
  }));
  res.json({
    success: true, kinds,
    rows: rows.slice(0, 500).map((e) => view(e, req.user)),
    summary: {
      total: sum(inRange), count: inRange.length,
      clinic: sum(inRange.filter((e) => e.kind === 'clinic')), medicine: sum(inRange.filter((e) => e.kind === 'medicine')),
      today: sum(inRange.filter((e) => e.date === istToday())),
      withoutVoucher: inRange.filter((e) => !e.voucher?.number || e.voucher.status === 'rejected').length,
      pendingApproval: inRange.filter((e) => e.voucher?.status === 'pending').length,
      toRepay: money([...toRepay.values()].reduce((s, v) => s + v.amount, 0)),
      supplierDue: sum(open.filter((e) => e.repayStatus === 'supplier_due')),
      supplierDueCount: open.filter((e) => e.repayStatus === 'supplier_due').length,
    },
    toRepay: [...toRepay.values()].sort((a, b) => b.amount - a.amount),
    costByItem: [...items.values()].sort((a, b) => b.spend - a.spend),
    // Names typed before, offered while typing (still free text).
    suggestions: {
      people: [...new Set(inRange.map((e) => e.paidByName).filter(Boolean))].slice(0, 50),
      vendors: [...new Set(inRange.map((e) => e.vendor).filter(Boolean))].slice(0, 50),
      items: [...new Set(inRange.flatMap((e) => (e.items || []).map((i) => i.name)))].slice(0, 100),
    },
    canApprove: isApprover(req.user),
  });
});

const loadEntry = async (req) => {
  if (!mongoose.isValidObjectId(req.params.id)) fail('Invalid entry');
  const e = await Expense.findOne({ _id: req.params.id, deletedAt: null });
  if (!e) fail('Entry not found', 404);
  if (!kindsOf(req.user).includes(e.kind)) fail('You cannot open this entry', 403);
  return e;
};
const done = async (req, res, e, status = 200) => { await e.save(); emit(req); res.status(status).json({ success: true, expense: view(e, req.user) }); };

// @route POST /api/expenses  (multipart: bills[])
const createExpense = asyncHandler(async (req, res) => {
  try {
    const kind = String(req.body.kind || '');
    if (!KINDS[kind]) fail('Choose clinic expense or medicine purchase');
    if (!canWrite(req.user, kind)) fail(`Only ${kind === 'clinic' ? 'Reception' : 'the Medicine Department'} adds ${KINDS[kind].label.toLowerCase()}s`, 403);
    const fields = fieldsOf(req.body, kind);
    const e = new Expense({ kind, ...fields, bills: (req.files || []).map(fileUrl), repayStatus: repayStatusFor(fields.paidFrom), createdBy: req.user._id, createdByName: req.user.name, createdByRole: req.user.role });
    log(e, req.user, 'Recorded', `${fields.purpose} · Rs ${fields.amount} · paid by ${fields.paidByName} (${PAID_FROM[fields.paidFrom]})`);
    if (req.body.makeVoucher === 'true' || req.body.makeVoucher === true) await makeVoucherOn(e, req.user, req.body.payTo);
    await done(req, res, e, 201);
  } catch (error) { await dropFiles(req.files); throw error; }
});

// @route PATCH /api/expenses/:id  (multipart; keepBills = JSON list of bill urls to keep)
const updateExpense = asyncHandler(async (req, res) => {
  try {
    const e = await loadEntry(req);
    if (!canEdit(req.user, e)) fail(settled(e) ? 'This entry is settled and can no longer be changed' : 'The voucher is approved: only Admin / Doctor can change it now', 403);
    const fields = fieldsOf(req.body, e.kind);
    let keep = e.bills;
    if (req.body.keepBills !== undefined) {
      let urls = req.body.keepBills;
      try { urls = typeof urls === 'string' ? JSON.parse(urls) : urls; } catch { urls = []; }
      keep = e.bills.filter((b) => (Array.isArray(urls) ? urls : []).includes(b.url));
      await Promise.all(e.bills.filter((b) => !keep.includes(b)).map((b) => removeStored(b.url)));
    }
    const changed = ['purpose', 'amount', 'paidByName', 'paidFrom', 'vendor', 'date'].filter((k) => String(e[k]) !== String(fields[k]));
    Object.assign(e, fields, { bills: [...keep, ...(req.files || []).map(fileUrl)], editedAt: new Date(), editedByName: req.user.name });
    // Where the money came from decides who is owed (never undoes a settlement: settled entries cannot be edited).
    e.repayStatus = repayStatusFor(fields.paidFrom);
    // A changed amount / payer needs the voucher approved again.
    if (e.voucher?.status === 'approved' && changed.some((k) => ['amount', 'paidByName', 'paidFrom'].includes(k))) {
      Object.assign(e.voucher, { status: 'pending', approvedAt: null, approvedByName: '' });
      log(e, req.user, 'Voucher needs approval again', 'Amount or payer changed after approval');
    }
    log(e, req.user, 'Edited', changed.length ? `Changed: ${changed.join(', ')}` : 'Details updated');
    await done(req, res, e);
  } catch (error) { await dropFiles(req.files); throw error; }
});

// The voucher: numbered per kind (CV-0001 clinic, MV-0001 medicine), waiting for Admin / Doctor.
async function makeVoucherOn(e, user, payTo) {
  const name = text(payTo, 'Pay to', 120) || (e.paidFrom === 'own' ? e.paidByName : e.vendor || e.paidByName);
  if (!e.voucher?.number) {
    const prefix = KINDS[e.kind].prefix;
    e.voucher = { number: `${prefix}-${String(await Counter.next(`voucher:${prefix}`)).padStart(4, '0')}` };
  }
  Object.assign(e.voucher, { payTo: name, status: 'pending', madeAt: new Date(), madeByName: user.name, rejectedAt: null, rejectedByName: '', rejectReason: '' });
  log(e, user, `Voucher ${e.voucher.number} made`, `Pay to ${name}`);
}
// @route POST /api/expenses/:id/voucher  { payTo }   (also re-sends a voucher that was sent back)
const makeVoucher = asyncHandler(async (req, res) => {
  const e = await loadEntry(req);
  if (!canWrite(req.user, e.kind)) fail('You cannot make this voucher', 403);
  if (e.voucher?.number && e.voucher.status !== 'rejected') fail(`Voucher ${e.voucher.number} is already made`, 409);
  await makeVoucherOn(e, req.user, req.body?.payTo);
  await done(req, res, e);
});
// @route POST /api/expenses/:id/voucher/approve | /reject { reason }
const approveVoucher = asyncHandler(async (req, res) => {
  if (!isApprover(req.user)) fail('Only Admin or Doctor approves vouchers', 403);
  const e = await loadEntry(req);
  if (e.voucher?.status !== 'pending') fail('This voucher is not waiting for approval', 409);
  Object.assign(e.voucher, { status: 'approved', approvedAt: new Date(), approvedByName: req.user.name });
  log(e, req.user, `Voucher ${e.voucher.number} approved`);
  await done(req, res, e);
});
const rejectVoucher = asyncHandler(async (req, res) => {
  if (!isApprover(req.user)) fail('Only Admin or Doctor sends a voucher back', 403);
  const e = await loadEntry(req);
  if (e.voucher?.status !== 'pending') fail('This voucher is not waiting for approval', 409);
  const reason = text(req.body?.reason, 'Why it is sent back', 500, true);
  Object.assign(e.voucher, { status: 'rejected', rejectedAt: new Date(), rejectedByName: req.user.name, rejectReason: reason });
  log(e, req.user, `Voucher ${e.voucher.number} sent back`, reason);
  await done(req, res, e);
});

// ---- settling the money (Admin / Doctor, approved voucher)
const settlementOf = (body, user, toName) => {
  const date = String(body?.date || istToday());
  if (!validDay(date) || date > istToday()) fail('Choose the date it was paid');
  const mode = String(body?.mode || '');
  if (!['cash', 'upi', 'card', 'bank'].includes(mode)) fail('Choose how it was paid');
  return { date, mode, reference: text(body?.reference, 'Reference', 120), toName: text(body?.toName, 'Paid to', 120) || toName, byName: user.name, at: new Date(), reason: '' };
};
// @route POST /api/expenses/:id/settle  { date, mode, reference, toName }  repaid / supplier paid
const settleExpense = asyncHandler(async (req, res) => {
  if (!isApprover(req.user)) fail('Only Admin or Doctor marks the money paid', 403);
  const e = await loadEntry(req);
  if (!['to_repay', 'supplier_due'].includes(e.repayStatus)) fail('Nothing is owed on this entry', 409);
  if (e.voucher?.status !== 'approved') fail('Approve the voucher first', 409);
  const supplier = e.repayStatus === 'supplier_due';
  e.settlement = settlementOf(req.body, req.user, supplier ? e.vendor : e.paidByName);
  e.repayStatus = supplier ? 'supplier_paid' : 'repaid';
  log(e, req.user, supplier ? 'Supplier paid' : 'Repaid', `Rs ${e.amount} to ${e.settlement.toName} (${e.settlement.mode}${e.settlement.reference ? `, ${e.settlement.reference}` : ''}) on ${e.settlement.date}`);
  await done(req, res, e);
});
// @route POST /api/expenses/:id/not-needed { reason }  - e.g. it was clinic money after all
const markNotNeeded = asyncHandler(async (req, res) => {
  if (!isApprover(req.user)) fail('Only Admin or Doctor decides this', 403);
  const e = await loadEntry(req);
  if (e.repayStatus !== 'to_repay') fail('Nothing is owed on this entry', 409);
  const reason = text(req.body?.reason, 'Why no repayment is needed', 300, true);
  e.repayStatus = 'not_needed';
  e.settlement = { date: istToday(), mode: '', reference: '', toName: '', byName: req.user.name, at: new Date(), reason };
  log(e, req.user, 'No repayment needed', reason);
  await done(req, res, e);
});
// @route POST /api/expenses/repay-person { name, date, mode, reference }  - every approved, unpaid entry of one person
const repayPerson = asyncHandler(async (req, res) => {
  if (!isApprover(req.user)) fail('Only Admin or Doctor marks the money paid', 403);
  const name = text(req.body?.name, 'Person', 120, true);
  const list = await Expense.find({ deletedAt: null, repayStatus: 'to_repay', 'voucher.status': 'approved', paidByName: new RegExp(`^\\s*${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'i') });
  if (!list.length) fail(`Nothing approved is waiting to be repaid to ${name}`, 409);
  const s = settlementOf(req.body, req.user, name);
  for (const e of list) {
    e.settlement = { ...s }; e.repayStatus = 'repaid';
    log(e, req.user, 'Repaid', `Rs ${e.amount} to ${s.toName} (${s.mode}${s.reference ? `, ${s.reference}` : ''}) on ${s.date} - repaid together`);
    await e.save();
  }
  emit(req);
  res.json({ success: true, count: list.length, total: money(list.reduce((t, e) => t + e.amount, 0)) });
});
// @route DELETE /api/expenses/:id  (Admin only; kept, hidden)
const deleteExpense = asyncHandler(async (req, res) => {
  if (req.user.role !== ROLES.ADMIN) fail('Only the admin deletes an entry', 403);
  const e = await loadEntry(req);
  e.deletedAt = new Date(); e.deletedByName = req.user.name;
  log(e, req.user, 'Deleted');
  await e.save();
  emit(req);
  res.json({ success: true });
});

// For counts / My Day.
const openWorkFor = async (user) => {
  const kinds = kindsOf(user);
  if (!kinds.length) return [];
  if (isApprover(user)) return Expense.find({ deletedAt: null, $or: [{ 'voucher.status': 'pending' }, { 'voucher.status': 'approved', repayStatus: { $in: ['to_repay', 'supplier_due'] } }] }).select('kind date purpose amount paidByName vendor voucher repayStatus createdAt').lean();
  return Expense.find({ deletedAt: null, kind: { $in: kinds }, $or: [{ 'voucher.number': '' }, { 'voucher.number': { $exists: false } }, { 'voucher.status': 'rejected' }] }).select('kind date purpose amount paidByName vendor voucher repayStatus createdAt').lean();
};

module.exports = {
  listExpenses, createExpense, updateExpense, makeVoucher, approveVoucher, rejectVoucher, settleExpense, markNotNeeded, repayPerson, deleteExpense,
  openWorkFor, kindsOf, isApprover, fieldsOf, KINDS, PAID_FROM,
};
