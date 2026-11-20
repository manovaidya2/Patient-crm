const { test, mock, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const MedicineJob = require('../models/MedicineJob');
const PurchaseOrder = require('../models/PurchaseOrder');
const AdviceRequest = require('../models/AdviceRequest');
const Expense = require('../models/Expense');
const { collectDoctorActions } = require('./doctorActionsController');

afterEach(() => mock.restoreAll());
const chain = (rows) => { const c = { select: () => c, populate: () => c, lean: async () => rows }; return c; };
const id = () => new mongoose.Types.ObjectId();

test('everything waiting on the doctor: formulations, advice (urgent first), exception payments and vouchers, oldest first', async () => {
  const filters = {};
  mock.method(MedicineJob, 'find', (f) => { filters.job = f; return chain([
    { _id: id(), patientName: 'New', phase: 1, poNumber: 'PO-2', stages: [{ key: 'accept', doneAt: new Date('2026-11-19') }] },
    { _id: id(), patientName: 'Old', phase: 2, poNumber: 'PO-1', stages: [{ key: 'accept', doneAt: new Date('2026-11-10') }], hold: { active: true, reason: 'Dose unclear' } },
  ]); });
  mock.method(AdviceRequest, 'find', (f) => { filters.advice = f; return chain([
    { _id: id(), patient: { patientName: 'Calm', isActive: true }, query: 'Sleep issue', askedAt: new Date('2026-11-01') },
    { _id: id(), patient: { patientName: 'Flag', isActive: true }, query: 'Red flag: seizure', isUrgent: true, askedAt: new Date('2026-11-18'), alarms: [{}] },
    { _id: id(), patient: { patientName: 'Closed', isActive: false }, query: 'x' },
  ]); });
  mock.method(PurchaseOrder, 'find', (f) => { filters.po = f; return chain([{ _id: id(), poNumber: 'PO-7', patientName: 'Exc', exceptionPayment: { reason: 'Pay later', requestedAt: new Date('2026-11-15') } }]); });
  mock.method(Expense, 'find', (f) => { filters.expense = f; return chain([{ _id: id(), kind: 'medicine', purpose: 'Herbs', amount: 2500, date: '2026-11-12', voucher: { number: 'V-3', madeByName: 'Meena' } }]); });
  const data = await collectDoctorActions();
  const [formula, advice, exception, voucher] = data.groups;
  assert.equal(filters.job.currentStage, 1);
  assert.deepEqual(filters.advice, { status: 'requested', resolvedAt: null });
  assert.deepEqual([formula.items.map((i) => i.title), formula.items[0].flag, formula.items[0].href.startsWith('/admin/medicine-jobs/')], [['Old', 'New'], 'On hold: Dose unclear', true]);
  assert.deepEqual(advice.items.map((i) => [i.title, i.urgent, i.flag]), [['Flag', true, 'Alarm rung by the PCC'], ['Calm', false, '']]);
  assert.deepEqual([exception.items[0].code, exception.items[0].href], ['PO PO-7', '/admin/exception-payments']);
  assert.match(voucher.items[0].detail, /Medicine purchase · Rs 2,500 — Meena/);
  assert.deepEqual([data.total, data.urgent], [6, 1]);
});
