const { test, afterEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const Item = require('../models/ReceptionistChecklistItem');
const Record = require('../models/ReceptionistChecklistRecord');
const DayReview = require('../models/ReceptionistChecklistDayReview');
const controller = require('./receptionistChecklistController');

afterEach(() => mock.restoreAll());

const id = () => new mongoose.Types.ObjectId();
const run = async (handler, req) => {
  const res = { statusCode: 200, body: null, status(code) { this.statusCode = code; return this; }, json(value) { this.body = value; } };
  let failure;
  await handler({ query: {}, body: {}, params: {}, ...req }, res, (e) => { failure = e; });
  if (failure) throw failure;
  return res;
};
const reception = { _id: id(), name: 'Anita', role: 'receptionist' };
const doctor = { _id: id(), name: 'Dr Rao', role: 'doctor' };

test('a receptionist can only fill today and not another day', async () => {
  const item = { _id: id(), label: 'Open the clinic' };
  mock.method(Item, 'findOne', async () => item);
  mock.method(Record, 'findOne', () => ({ select: () => ({ lean: async () => null }) }));
  mock.method(Record, 'findOneAndUpdate', async (_f, update) => ({ ...update.$set }));
  const past = await run(controller.saveRecord, { user: reception, body: { date: '2020-01-01', itemId: String(item._id), completed: true } });
  assert.equal(past.statusCode, 400);
  assert.match(past.body.message, /only be filled for today/);
  const ok = await run(controller.saveRecord, { user: reception, body: { date: controller.todayIST(), itemId: String(item._id), completed: true, note: 'done' } });
  assert.equal(ok.statusCode, 200);
  assert.equal(ok.body.record.completed, true);
  assert.ok(ok.body.record.completedAt);
});

test('doctor review stores verdict, remark and who wrote it; clearing removes it', async () => {
  const item = { _id: id() };
  const target = String(id());
  mock.method(Item, 'findById', async () => item);
  let stored;
  mock.method(Record, 'findOneAndUpdate', async (_f, update) => { stored = update.$set; return stored; });
  const res = await run(controller.reviewRecord, { user: doctor, body: { date: '2026-10-10', receptionistId: target, itemId: String(item._id), verdict: 'not_ok', remark: 'Register not cleaned' } });
  assert.equal(res.body.record.review.verdict, 'not_ok');
  assert.equal(res.body.record.review.by, 'Dr Rao');
  assert.equal(res.body.record.review.role, 'doctor');
  const cleared = await run(controller.reviewRecord, { user: doctor, body: { date: '2026-10-10', receptionistId: target, itemId: String(item._id), verdict: '', remark: '' } });
  assert.equal(cleared.body.record.review, null);
  assert.equal(stored.reviewedBy, null);
  const missing = await run(controller.reviewRecord, { user: doctor, body: { date: '2026-10-10', itemId: String(item._id), verdict: 'ok' } });
  assert.equal(missing.statusCode, 400);
});

test('day remark is saved for admin/doctor and empty text deletes it', async () => {
  const target = String(id());
  mock.method(DayReview, 'findOneAndUpdate', async (_f, update) => ({ ...update.$set, updatedAt: new Date() }));
  const del = mock.method(DayReview, 'deleteOne', async () => ({}));
  const saved = await run(controller.reviewDay, { user: doctor, body: { date: '2026-10-10', receptionistId: target, remark: 'Cash not matched' } });
  assert.equal(saved.body.dayReview.remark, 'Cash not matched');
  const cleared = await run(controller.reviewDay, { user: doctor, body: { date: '2026-10-10', receptionistId: target, remark: '  ' } });
  assert.equal(cleared.body.dayReview, null);
  assert.equal(del.mock.callCount(), 1);
});

test('a receptionist always sees their own checklist even if another id is requested', async () => {
  let asked;
  mock.method(Item, 'find', () => ({ sort: () => ({ lean: async () => [{ _id: id(), label: 'Task', order: 0 }] }) }));
  mock.method(Record, 'find', (filter) => { asked = String(filter.receptionist); return { lean: async () => [] }; });
  mock.method(DayReview, 'findOne', () => ({ lean: async () => null }));
  const res = await run(controller.listDaily, { user: reception, query: { date: '2026-10-10', userId: String(id()) } });
  assert.equal(asked, String(reception._id));
  assert.equal(res.body.items.length, 1);
  assert.equal(res.body.items[0].completed, false);
});
