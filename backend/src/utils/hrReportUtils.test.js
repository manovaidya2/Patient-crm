const test = require('node:test');
const assert = require('node:assert/strict');
const { periodRange, calculateHrMetrics } = require('./hrReportUtils');

test('daily, Monday-week and calendar-month report ranges are deterministic', () => {
  assert.deepEqual(periodRange('daily', '2026-10-10'), { from: '2026-10-10', to: '2026-10-10' });
  assert.deepEqual(periodRange('weekly', '2026-10-10'), { from: '2026-10-05', to: '2026-10-11' });
  assert.deepEqual(periodRange('monthly', '2026-02-10'), { from: '2026-02-01', to: '2026-02-28' });
});

test('report calculations exclude cancelled interviews and withdrawn offers', () => {
  const candidate = { _id: 'c1', createdAt: '2026-10-01T00:00:00Z', screening: { status: 'shortlisted' } };
  const result = calculateHrMetrics({
    candidates: [candidate],
    interviews: [{ status: 'completed', evaluation: { recommendation: 'selected' } }, { status: 'no_show' }],
    offers: [{ _id: 'o1', candidate: 'c1', status: 'accepted', sentAt: new Date('2026-10-02'), respondedAt: new Date('2026-10-05') }, { _id: 'o2', status: 'withdrawn', sentAt: new Date('2026-10-02') }],
    onboardings: [{ offer: 'o1', status: 'completed' }],
    campaigns: [{ actualSpend: 3000 }],
    trainings: [{ participants: [{ status: 'completed' }, { status: 'attended' }] }],
    kpis: [{ data: { target: 100, actualValue: 80, weightage: 100 } }],
  });
  assert.equal(result.metrics.find((row) => row.key === 'interviewAttendance').value, 50);
  assert.equal(result.metrics.find((row) => row.key === 'offerAcceptance').value, 100);
  assert.equal(result.metrics.find((row) => row.key === 'costPerJoining').value, 3000);
  assert.equal(result.metrics.find((row) => row.key === 'timeToHire').numerator, 4);
  assert.equal(result.metrics.find((row) => row.key === 'timeToHire').denominator, 1);
  assert.equal(result.metrics.find((row) => row.key === 'trainingCompletion').value, 50);
  assert.equal(result.metrics.find((row) => row.key === 'kpiAchievement').value, 80);
  assert.equal(result.metrics.find((row) => row.key === 'kpiAchievement').numerator, 80);
  assert.equal(result.metrics.find((row) => row.key === 'kpiAchievement').denominator, 100);
});

test('zero denominators return unavailable instead of misleading zero percent', () => {
  const result = calculateHrMetrics({});
  assert.equal(result.metrics.find((row) => row.key === 'selection').value, null);
  assert.equal(result.metrics.find((row) => row.key === 'costPerJoining').value, null);
});
