const { test } = require('node:test');
const assert = require('node:assert/strict');
const { uploadTiming, overdueFilter } = require('./recordRoomOverdue');

test('same-day paper deadline uses India midnight, including dates that are the previous day in UTC', () => {
  const record = { firstReceivedAt: '2026-11-14T19:00:00Z' }; // 15 Nov, 00:30 IST
  const before = uploadTiming(record, '2026-11-15T18:29:59.999Z');
  assert.equal(before.uploadStatus, 'pending');
  assert.equal(before.uploadDueAt, '2026-11-15T18:29:59.999Z');
  assert.equal(before.overdueDays, 0);
  const midnight = uploadTiming(record, '2026-11-15T18:30:00Z');
  assert.equal(midnight.uploadStatus, 'overdue');
  assert.equal(midnight.overdueDays, 1);
  assert.equal(uploadTiming(record, '2026-11-16T18:30:00Z').overdueDays, 2);
});

test('older records use creation date; missing timestamps do not produce false overdue records', () => {
  assert.equal(uploadTiming({ createdAt: '2026-11-13T10:00:00Z' }, '2026-11-14T03:00:00Z').uploadStatus, 'overdue');
  assert.equal(uploadTiming({}, '2026-11-14T03:00:00Z').uploadStatus, 'pending');
  assert.equal(uploadTiming({ firstReceivedAt: '2026-11-14T03:00:00Z', createdAt: '2026-11-13T10:00:00Z' }, '2026-11-14T10:00:00Z').uploadStatus, 'pending');
});

test('successful scans or legacy PDFs clear overdue, while deleting all uploads restores it', () => {
  const record = { createdAt: '2026-11-12T10:00:00Z' };
  const now = '2026-11-14T03:00:00Z';
  for (const upload of [{ documents: [{ url: '/uploads/page.jpg' }] }, { pdfPageCount: 1 }, { pdfUrl: '/uploads/legacy.pdf' }]) {
    const timing = uploadTiming({ ...record, ...upload }, now);
    assert.equal(timing.uploadStatus, 'uploaded');
    assert.equal(timing.overdueDays, 0);
  }
  assert.equal(uploadTiming({ ...record, documents: [], pdfPageCount: 0, pdfUrl: '' }, now).uploadStatus, 'overdue');
});

test('manager list and count query use the same India day cutoff and exclude uploaded records', () => {
  const filter = overdueFilter('2026-11-14T18:30:00Z');
  assert.deepEqual(filter['documents.0'], { $exists: false });
  assert.deepEqual(filter.pdfUrl, { $in: ['', null] });
  assert.deepEqual(filter.pdfPageCount, { $not: { $gt: 0 } });
  assert.equal(filter.$expr.$and[1].$lt[1].toISOString(), '2026-11-14T18:30:00.000Z');
});
