const { test } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const Expense = require('../models/Expense');
const Counter = require('../models/Counter');
const c = require('./expenseController');

const who = (role, name) => ({ _id: new mongoose.Types.ObjectId(), role, name });
const reception = who('receptionist', 'Prachi');
const medicine = who('medicine_department', 'Tanu');
const admin = who('admin', 'Admin');
const doctor = who('doctor', 'Dr Sharma');
const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

const run = async (handler, req) => {
  let body = null; let status = 200; let error = null;
  await handler({ params: {}, query: {}, body: {}, files: [], app: { get: () => null }, ...req }, { status(s) { status = s; return this; }, json(b) { body = b; } }, (e) => { error = e; });
  return { body, status, error };
};
const withStore = async (fn) => {
  const store = [];
  let seq = 0;
  const saved = [[Expense, 'findOne', Expense.findOne], [Expense.prototype, 'save', Expense.prototype.save], [Counter, 'next', Counter.next]];
  Expense.findOne = async (f) => store.find((e) => String(e._id) === String(f._id) && !e.deletedAt) || null;
  Expense.prototype.save = async function save() { await this.validate(); if (!store.includes(this)) store.push(this); return this; };
  Counter.next = async () => { seq += 1; return seq; };
  try { await fn(store); } finally { saved.forEach(([t, n, old]) => { t[n] = old; }); }
};

test('Reception writes a clinic expense (no category, names typed); own money is owed back', async () => {
  await withStore(async (store) => {
    const missing = await run(c.createExpense, { user: reception, body: { kind: 'clinic', date: today, purpose: '', amount: '420', paidByName: 'Prachi', paidFrom: 'own' } });
    assert.match(missing.error.message, /What it was for is required/);
    const credit = await run(c.createExpense, { user: reception, body: { kind: 'clinic', date: today, purpose: 'Tea', amount: '420', paidByName: 'Prachi', paidFrom: 'credit' } });
    assert.match(credit.error.message, /Credit is only/);
    const notMine = await run(c.createExpense, { user: reception, body: { kind: 'medicine', date: today, purpose: 'Herbs', vendor: 'Gupta', paidByName: 'Tanu', paidFrom: 'own', items: '[]' } });
    assert.equal(notMine.error.statusCode, 403);
    const ok = await run(c.createExpense, { user: reception, body: { kind: 'clinic', date: today, purpose: 'Tea and biscuits for waiting families', vendor: 'Sharma Tea Stall', amount: '420', paidByName: 'Prachi', paidFrom: 'own', paymentMode: 'cash' } });
    assert.equal(ok.status, 201);
    assert.equal(ok.body.expense.repayStatus, 'to_repay');
    assert.equal(ok.body.expense.can.voucher, true);
    assert.equal(ok.body.expense.can.approve, false);
    const cash = await run(c.createExpense, { user: reception, body: { kind: 'clinic', date: today, purpose: 'Printer paper', amount: '640', paidByName: 'Prachi', paidFrom: 'clinic_cash' } });
    assert.equal(cash.body.expense.repayStatus, 'not_needed');
    assert.equal(store.length, 2);
  });
});

test('Medicine Department writes a purchase: items x quantity x rate plus freight make the total; credit leaves the supplier due', async () => {
  await withStore(async () => {
    const items = JSON.stringify([{ name: 'Brahmi powder', qty: 2, unit: 'kg', rate: 620 }, { name: 'Ashwagandha churna', qty: 3, unit: 'kg', rate: 540 }]);
    const p = await run(c.createExpense, { user: medicine, body: { kind: 'medicine', date: today, purpose: 'Herbs for November', vendor: 'Gupta Herbals', invoiceNo: 'INV-2291', items, extraCharges: '120', paidByName: 'Admin account', paidFrom: 'credit' } });
    assert.equal(p.status, 201);
    assert.equal(p.body.expense.amount, 2980);
    assert.equal(p.body.expense.items[1].amount, 1620);
    assert.equal(p.body.expense.repayStatus, 'supplier_due');
    const noSupplier = await run(c.createExpense, { user: medicine, body: { kind: 'medicine', date: today, purpose: 'x', items, paidByName: 'Tanu', paidFrom: 'own' } });
    assert.match(noSupplier.error.message, /Supplier is required/);
  });
});

test('voucher -> approve (Admin / Doctor only) -> repaid; sent back keeps its number; settled entries are locked', async () => {
  await withStore(async () => {
    const made = await run(c.createExpense, { user: reception, body: { kind: 'clinic', date: today, purpose: 'Courier to Jaipur', amount: '180', paidByName: 'Ravi', paidFrom: 'own', makeVoucher: 'true' } });
    const id = made.body.expense.id;
    assert.equal(made.body.expense.voucher.number, 'CV-0001');
    assert.equal(made.body.expense.voucher.payTo, 'Ravi');
    assert.equal(made.body.expense.voucher.status, 'pending');
    const early = await run(c.settleExpense, { user: admin, params: { id }, body: { mode: 'cash' } });
    assert.match(early.error.message, /Approve the voucher first/);
    const byReception = await run(c.approveVoucher, { user: reception, params: { id } });
    assert.equal(byReception.error.statusCode, 403);
    const back = await run(c.rejectVoucher, { user: doctor, params: { id }, body: { reason: 'Bill photo not clear' } });
    assert.equal(back.body.expense.voucher.status, 'rejected');
    const again = await run(c.makeVoucher, { user: reception, params: { id }, body: {} });
    assert.equal(again.body.expense.voucher.number, 'CV-0001', 'same number when sent again');
    assert.equal(again.body.expense.voucher.status, 'pending');
    const ok = await run(c.approveVoucher, { user: doctor, params: { id } });
    assert.equal(ok.body.expense.voucher.approvedByName, 'Dr Sharma');
    const asReception = await run(c.makeVoucher, { user: reception, params: { id }, body: {} });
    assert.equal(asReception.error.statusCode, 409, 'an approved voucher is not made again');
    const paid = await run(c.settleExpense, { user: admin, params: { id }, body: { date: today, mode: 'upi', reference: 'UTR123' } });
    assert.equal(paid.body.expense.repayStatus, 'repaid');
    assert.equal(paid.body.expense.settlement.toName, 'Ravi');
    const edit = await run(c.updateExpense, { user: admin, params: { id }, body: { date: today, purpose: 'x', amount: '1', paidByName: 'Ravi', paidFrom: 'own' } });
    assert.match(edit.error.message, /settled/);
  });
});

test('an approved voucher whose amount changes needs approval again; each role sees only its own kind', async () => {
  await withStore(async (store) => {
    const made = await run(c.createExpense, { user: medicine, body: { kind: 'medicine', date: today, purpose: 'Bottles', vendor: 'Kamal Packaging', items: JSON.stringify([{ name: 'Amber bottle 100 ml', qty: 200, rate: 6.5 }]), paidByName: 'Tanu', paidFrom: 'own', makeVoucher: 'true' } });
    const id = made.body.expense.id;
    assert.equal(made.body.expense.voucher.number, 'MV-0001');
    await run(c.approveVoucher, { user: admin, params: { id } });
    const byTanu = await run(c.updateExpense, { user: medicine, params: { id }, body: { date: today, purpose: 'Bottles', vendor: 'Kamal Packaging', items: JSON.stringify([{ name: 'Amber bottle 100 ml', qty: 220, rate: 6.5 }]), paidByName: 'Tanu', paidFrom: 'own' } });
    assert.equal(byTanu.error.statusCode, 403, 'approved: only Admin / Doctor change it');
    const edited = await run(c.updateExpense, { user: admin, params: { id }, body: { date: today, purpose: 'Bottles', vendor: 'Kamal Packaging', items: JSON.stringify([{ name: 'Amber bottle 100 ml', qty: 220, rate: 6.5 }]), paidByName: 'Tanu', paidFrom: 'own' } });
    assert.equal(edited.body.expense.amount, 1430);
    assert.equal(edited.body.expense.voucher.status, 'pending');
    assert.deepEqual(c.kindsOf(reception), ['clinic']);
    assert.deepEqual(c.kindsOf(medicine), ['medicine']);
    assert.deepEqual(c.kindsOf(doctor), ['clinic', 'medicine']);
    const denied = await run(c.listExpenses, { user: reception, query: { kind: 'medicine' } });
    assert.equal(denied.error.statusCode, 403);
    assert.equal(store.length, 1);
  });
});
