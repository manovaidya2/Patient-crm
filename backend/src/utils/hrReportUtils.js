const { addDaysToDateKey, startOfWeekDateKey } = require('./hrCallUtils');

const percent = (numerator, denominator) => denominator > 0 ? Number(((numerator / denominator) * 100).toFixed(1)) : null;
const average = (values) => values.length ? Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(1)) : null;

const periodRange = (period, anchor) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(anchor)) return null;
  if (period === 'daily') return { from: anchor, to: anchor };
  if (period === 'weekly') { const from = startOfWeekDateKey(anchor); return { from, to: addDaysToDateKey(from, 6) }; }
  if (period === 'monthly') {
    const [year, month] = anchor.split('-').map(Number);
    const to = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
    return { from: `${anchor.slice(0, 7)}-01`, to };
  }
  return null;
};

const metric = (key, label, numerator, denominator, unit, formula, rule) => ({ key, label, numerator, denominator, value: unit === 'percent' ? percent(numerator, denominator) : denominator > 0 ? Number((numerator / denominator).toFixed(1)) : null, unit, formula, rule });

const calculateHrMetrics = ({ candidates = [], candidateHistory = candidates, interviews = [], offers = [], onboardings = [], campaigns = [], trainings = [], kpis = [] }) => {
  const qualified = candidates.filter((row) => row.screening?.status === 'shortlisted').length;
  const attended = interviews.filter((row) => row.status === 'completed').length;
  const completedInterviews = attended;
  const selected = interviews.filter((row) => row.status === 'completed' && row.evaluation?.recommendation === 'selected').length;
  const issuedOffers = offers.filter((row) => row.sentAt && row.status !== 'withdrawn');
  const acceptedOffers = issuedOffers.filter((row) => row.status === 'accepted');
  const joinedOfferIds = new Set(onboardings.filter((row) => row.status === 'completed').map((row) => String(row.offer)));
  const joined = acceptedOffers.filter((row) => joinedOfferIds.has(String(row._id || row.id))).length;
  const candidateCreatedAt = new Map(candidateHistory.map((row) => [String(row._id || row.id), new Date(row.createdAt)]));
  const timeToHireDays = acceptedOffers.map((row) => {
    const appliedAt = candidateCreatedAt.get(String(row.candidate));
    const acceptedAt = row.respondedAt ? new Date(row.respondedAt) : null;
    return appliedAt && acceptedAt && acceptedAt >= appliedAt ? (acceptedAt - appliedAt) / 86400000 : null;
  }).filter((value) => value !== null);
  const recruitmentSpend = campaigns.reduce((sum, row) => sum + Number(row.actualSpend || 0), 0);
  const assignedModules = trainings.reduce((sum, row) => sum + (row.participants || []).length, 0);
  const completedModules = trainings.reduce((sum, row) => sum + (row.participants || []).filter((item) => item.status === 'completed').length, 0);
  const weightedKpis = kpis.map((row) => ({ target: Number(row.data?.target), actual: Number(row.data?.actualValue), weight: Number(row.data?.weightage || 0) })).filter((row) => row.target > 0 && Number.isFinite(row.actual) && row.weight > 0);
  const totalWeight = weightedKpis.reduce((sum, row) => sum + row.weight, 0);
  const weightedAchievement = totalWeight ? Number((weightedKpis.reduce((sum, row) => sum + ((row.actual / row.target) * row.weight), 0) / totalWeight * 100).toFixed(1)) : null;

  return {
    counts: { applications: candidates.length, qualified, interviewsScheduled: interviews.length, interviewsAttended: attended, interviewsCompleted: completedInterviews, selected, offersIssued: issuedOffers.length, offersAccepted: acceptedOffers.length, joined, recruitmentSpend, trainingAssigned: assignedModules, trainingCompleted: completedModules, kpisMeasured: weightedKpis.length },
    metrics: [
      metric('interviewAttendance', 'Interview attendance rate', attended, interviews.length, 'percent', 'Attended / Scheduled x 100', 'Cancelled interviews are excluded; no-shows remain scheduled but not attended.'),
      metric('candidateQualification', 'Candidate qualification rate', qualified, candidates.length, 'percent', 'Qualified / Applications x 100', 'Candidates created in the selected period form the cohort; shortlisted screening is qualified.'),
      metric('selection', 'Selection rate', selected, completedInterviews, 'percent', 'Selected / Interviews completed x 100', 'Only completed interviews with a selected recommendation count.'),
      metric('offerAcceptance', 'Offer acceptance rate', acceptedOffers.length, issuedOffers.length, 'percent', 'Accepted / Offers issued x 100', 'Draft, unapproved and withdrawn offers are excluded; declined offers remain issued.'),
      metric('joining', 'Joining rate', joined, acceptedOffers.length, 'percent', 'Joined / Accepted offers x 100', 'Joining requires completed onboarding linked to an accepted offer.'),
      metric('costPerJoining', 'Cost per joining', recruitmentSpend, joined, 'currency', 'Actual recruitment spend / Employees joined', 'Uses actual spend from non-cancelled campaigns starting in the selected period; budget is not treated as spend.'),
      { key: 'timeToHire', label: 'Average time to hire', numerator: timeToHireDays.length, denominator: timeToHireDays.length, value: average(timeToHireDays), unit: 'days', formula: 'Offer acceptance date - Application date', rule: 'Average calendar days for accepted offers issued in the selected period.' },
      metric('trainingCompletion', 'Training completion', completedModules, assignedModules, 'percent', 'Completed modules / Assigned modules x 100', 'Cancelled training is excluded; attended but incomplete assignments are not completed.'),
      { key: 'kpiAchievement', label: 'Weighted KPI achievement', numerator: weightedKpis.length, denominator: weightedKpis.length, value: weightedAchievement, unit: 'percent', formula: 'Weighted Actual / Target x 100', rule: 'Includes active or completed KPIs ending in the selected period with numeric target, actual and positive weightage.' },
    ],
  };
};

module.exports = { percent, periodRange, calculateHrMetrics };
