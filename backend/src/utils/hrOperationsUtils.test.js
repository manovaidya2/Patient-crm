const test = require('node:test');
const assert = require('node:assert/strict');
const { inclusiveDays, timeMinutes, workedMinutes, canChangePolicyStatus, canChangeLeaveStatus } = require('./hrOperationsUtils');

test('leave duration is inclusive and half-day can remain an explicit override', () => {
  assert.equal(inclusiveDays('2026-10-10', '2026-10-10'), 1);
  assert.equal(inclusiveDays('2026-10-10', '2026-10-12'), 3);
});

test('attendance duration is calculated from validated 24-hour times', () => {
  assert.equal(timeMinutes('09:30'), 570);
  assert.equal(workedMinutes('09:30', '18:00'), 510);
  assert.equal(workedMinutes('', '18:00'), 0);
});

test('policies require publishing before archival', () => {
  assert.equal(canChangePolicyStatus('draft', 'published'), true);
  assert.equal(canChangePolicyStatus('published', 'archived'), true);
  assert.equal(canChangePolicyStatus('draft', 'archived'), false);
  assert.equal(canChangePolicyStatus('archived', 'published'), false);
});

test('Admin decides leave while HR can cancel a pending request', () => {
  assert.equal(canChangeLeaveStatus('pending', 'approved', 'admin'), true);
  assert.equal(canChangeLeaveStatus('pending', 'rejected', 'admin'), true);
  assert.equal(canChangeLeaveStatus('pending', 'cancelled', 'hr'), true);
  assert.equal(canChangeLeaveStatus('pending', 'approved', 'hr'), false);
  assert.equal(canChangeLeaveStatus('approved', 'cancelled', 'admin'), false);
});
