const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  monthKeyOf,
  collectSessions,
  countOutcomes,
  qualifiesForMarketing,
  improvementSummaryOf,
} = require('./patientImprovement');

const entry = (id, date, extra = {}) => ({ _id: id, dateTime: date, completedAt: date, status: 'completed', ...extra });
const patient = {
  stages: [
    {
      number: 1,
      followUps: [
        entry('f1', '2026-10-03T10:00:00Z', { outcome: 'improvement', outcomeNote: 'Sleeping better' }),
        entry('f2', '2026-10-17T10:00:00Z', { outcome: 'problem', outcomeNote: 'Anger outbursts' }),
        entry('f3', '2026-11-02T10:00:00Z'),
        { _id: 'f4', dateTime: '2026-10-20T10:00:00Z', status: 'scheduled' },
      ],
      familySessions: [
        entry('s1', '2026-10-10T10:00:00Z', { outcome: 'improvement', outcomeNote: 'Talks more at home' }),
        entry('s2', '2026-10-24T10:00:00Z', { outcome: 'improvement', outcomeNote: 'Eye contact improved' }),
      ],
    },
  ],
};

test('only done sessions are counted, in date order, with their outcomes', () => {
  const sessions = collectSessions(patient);
  assert.deepEqual(sessions.map((row) => row.id), ['f1', 's1', 'f2', 's2', 'f3']);
  assert.equal(sessions[0].kindLabel, 'Follow-up');
  assert.equal(sessions[1].kindLabel, 'Family session');
  assert.equal(sessions[4].outcome, '');
  assert.deepEqual(collectSessions(patient, { kind: 'familySessions' }).map((row) => row.id), ['s1', 's2']);
});

test('month counts give follow-ups, family sessions, problems and improvements', () => {
  const october = collectSessions(patient).filter((row) => row.month === '2026-10');
  assert.deepEqual(countOutcomes(october), { sessions: 4, followUps: 2, familySessions: 2, problems: 1, improvements: 3 });
  assert.equal(qualifiesForMarketing(countOutcomes(october)), true);
  assert.equal(improvementSummaryOf(october), 'Eye contact improved | Talks more at home | Sleeping better');
});

test('a month goes to marketing as soon as one improvement is noted', () => {
  assert.equal(qualifiesForMarketing({ improvements: 0, problems: 0 }), false);
  assert.equal(qualifiesForMarketing({ improvements: 1, problems: 3 }), true);
  assert.equal(qualifiesForMarketing({ improvements: 2, problems: 1 }), true);
});

test('months are counted in India time', () => {
  // 31 Oct 20:00 UTC is 1 Nov 01:30 in India.
  assert.equal(monthKeyOf('2026-10-31T20:00:00Z'), '2026-11');
  assert.equal(monthKeyOf('2026-10-31T10:00:00Z'), '2026-10');
  assert.equal(monthKeyOf('not a date'), '');
});

test('a month with clear improvement adds the patient to the Digital Marketing sheet without overwriting filled cells', async () => {
  const DigitalMarketingReview = require('../models/DigitalMarketingReview');
  const { syncImprovementToMarketing } = require('../controllers/digitalMarketingController');
  const original = { findOne: DigitalMarketingReview.findOne, create: DigitalMarketingReview.create };
  const created = [];
  try {
    DigitalMarketingReview.findOne = async () => null;
    DigitalMarketingReview.create = async (doc) => { created.push(doc); return doc; };
    const subject = { _id: 'p1', patientName: 'Aarav', category: 'autism_adhd', ...patient };
    await syncImprovementToMarketing(subject, '2026-10');
    assert.equal(created.length, 1);
    assert.equal(created[0].autoAdded, true);
    assert.equal(created[0].monthImprovements, 3);
    assert.equal(created[0].monthProblems, 1);
    assert.match(created[0].improvementSummary, /Eye contact improved/);

    // November has no improvements: nobody is added.
    await syncImprovementToMarketing(subject, '2026-11');
    assert.equal(created.length, 1);

    // Existing row: counts refresh, the team's own summary stays.
    let saved = false;
    const row = { improvementSummary: 'Written by marketing', improvementMonth: '', save: async () => { saved = true; } };
    DigitalMarketingReview.findOne = async () => row;
    await syncImprovementToMarketing(subject, '2026-10');
    assert.equal(saved, true);
    assert.equal(row.improvementMonth, '2026-10');
    assert.equal(row.monthImprovements, 3);
    assert.equal(row.improvementSummary, 'Written by marketing');
  } finally {
    Object.assign(DigitalMarketingReview, original);
  }
});
