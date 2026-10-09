const test = require('node:test');
const assert = require('node:assert/strict');
const {
  REQUIREMENT_TRANSITIONS,
  OFFER_TRANSITIONS,
  canTransition,
  splitList,
  validDateKey,
} = require('./hrRecruitmentUtils');

test('hiring requirements follow the approval workflow', () => {
  assert.equal(canTransition(REQUIREMENT_TRANSITIONS, 'draft', 'pending_approval'), true);
  assert.equal(canTransition(REQUIREMENT_TRANSITIONS, 'pending_approval', 'approved'), true);
  assert.equal(canTransition(REQUIREMENT_TRANSITIONS, 'draft', 'approved'), false);
  assert.equal(canTransition(REQUIREMENT_TRANSITIONS, 'approved', 'draft'), false);
});

test('salary offers cannot be sent before approval', () => {
  assert.equal(canTransition(OFFER_TRANSITIONS, 'draft', 'pending_approval'), true);
  assert.equal(canTransition(OFFER_TRANSITIONS, 'pending_approval', 'approved'), true);
  assert.equal(canTransition(OFFER_TRANSITIONS, 'approved', 'sent'), true);
  assert.equal(canTransition(OFFER_TRANSITIONS, 'draft', 'sent'), false);
  assert.equal(canTransition(OFFER_TRANSITIONS, 'accepted', 'withdrawn'), false);
});

test('comma and line separated lists are normalized', () => {
  assert.deepEqual(splitList('Node.js, MongoDB\nCommunication'), ['Node.js', 'MongoDB', 'Communication']);
  assert.deepEqual(splitList([' LinkedIn ', '', 'Referral']), ['LinkedIn', 'Referral']);
});

test('date keys represent real calendar dates', () => {
  assert.equal(validDateKey('2026-10-09'), true);
  assert.equal(validDateKey('2026-02-29'), false);
  assert.equal(validDateKey('2026-13-01'), false);
  assert.equal(validDateKey('', true), true);
  assert.equal(validDateKey(''), false);
});
