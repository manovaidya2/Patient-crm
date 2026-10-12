const test = require('node:test');
const assert = require('node:assert/strict');
const { getDisplayStatus } = require('./scheduleStatuses');

test('requested video remains upcoming until a video is uploaded', () => {
  const status = getDisplayStatus({
    status: 'sent',
    followUpType: 'video',
    dateTime: '2026-01-01T00:00:00.000Z',
  }, new Date('2026-02-01T00:00:00.000Z'));

  assert.equal(status, 'upcoming');
});

test('sent tracker keeps its existing done behavior', () => {
  const status = getDisplayStatus({
    status: 'sent',
    followUpType: 'tracker',
    dateTime: '2026-01-01T00:00:00.000Z',
  }, new Date('2026-02-01T00:00:00.000Z'));

  assert.equal(status, 'done');
});
