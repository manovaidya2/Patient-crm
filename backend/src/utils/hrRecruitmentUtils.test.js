const test = require('node:test');
const assert = require('node:assert/strict');
const {
  REQUIREMENT_TRANSITIONS,
  OFFER_TRANSITIONS,
  canTransition,
  canEditOffer,
  canManageOfferTransition,
  nextInterviewRound,
  offerCompensation,
  interviewChainMetadata,
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

test('Admin reviews salary while HR manages offer communication', () => {
  assert.equal(canEditOffer('admin', 'pending_approval'), true);
  assert.equal(canEditOffer('admin', 'accepted'), true);
  assert.equal(canEditOffer('hr', 'pending_approval'), false);
  assert.equal(canManageOfferTransition('admin', 'approved'), true);
  assert.equal(canManageOfferTransition('admin', 'sent'), false);
  assert.equal(canManageOfferTransition('hr', 'approved'), false);
  assert.equal(canManageOfferTransition('hr', 'sent'), true);
  assert.equal(canManageOfferTransition('hr', 'accepted'), true);
});

test('connected interview rounds advance after the existing chain', () => {
  assert.equal(nextInterviewRound(1, 1), 2);
  assert.equal(nextInterviewRound(1, 2), 3);
  assert.equal(nextInterviewRound(3, 2), 4);
});

test('monthly offer salary is required and annual CTC is optional', () => {
  assert.deepEqual(offerCompensation('30000', ''), { monthlyGross: 30000, annualCtc: 360000 });
  assert.deepEqual(offerCompensation('30000', '420000'), { monthlyGross: 30000, annualCtc: 420000 });
  assert.equal(offerCompensation('', ''), null);
  assert.equal(offerCompensation('-1', ''), null);
});

test('legacy interview rounds are inferred without rewriting stored records', () => {
  const rows = [
    { _id: 'first', candidate: 'candidate-a', createdAt: '2026-10-01', roundNumber: 1, evaluation: { recommendation: 'next_round' } },
    { _id: 'second', candidate: 'candidate-a', createdAt: '2026-10-02', roundNumber: 1, evaluation: { recommendation: 'selected' } },
  ];
  const metadata = interviewChainMetadata(rows);
  assert.deepEqual(metadata.get('first'), { previousInterviewId: '', roundNumber: 1, hasNextRound: true });
  assert.deepEqual(metadata.get('second'), { previousInterviewId: 'first', roundNumber: 2, hasNextRound: false });
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
