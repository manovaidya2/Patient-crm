// After a follow-up or family session is done, the team can note how the patient is doing:
// "problem" (patient is facing a problem) or "improvement" (improvement found), with a short note.
// The Patient Improvement page counts these per patient and per month, and a patient who
// clearly improved in a month is copied into the Digital Marketing review sheet automatically.
const OUTCOMES = ['problem', 'improvement'];
const OUTCOME_LABELS = { problem: 'Facing problem', improvement: 'Improvement found' };
const SCHEDULE_KINDS = { followUps: 'Follow-up', familySessions: 'Family session' };

// A month goes to Digital Marketing as soon as it has this many improvements noted.
const MARKETING_MIN_IMPROVEMENTS = 1;

const pad = (n) => String(n).padStart(2, '0');
// Months are counted in India time so a session at 11 pm on the 31st stays in that month.
const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;
const monthKeyOf = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const ist = new Date(date.getTime() + IST_OFFSET_MS);
  return `${ist.getUTCFullYear()}-${pad(ist.getUTCMonth() + 1)}`;
};
const isMonthKey = (value) => /^\d{4}-(0[1-9]|1[0-2])$/.test(String(value || ''));

// The date a session counts on: when it was done, else when it was planned.
const sessionDate = (entry) => entry.completedAt || entry.dateTime || null;

// Every done follow-up / family session of a patient, oldest first, with its outcome (if noted).
const collectSessions = (patient, { kind = 'all' } = {}) => {
  const rows = [];
  (patient.stages || []).forEach((stage) => {
    Object.keys(SCHEDULE_KINDS).forEach((fieldKey) => {
      if (kind !== 'all' && kind !== fieldKey) return;
      (stage[fieldKey] || []).forEach((entry) => {
        if (entry.status !== 'completed') return;
        const date = sessionDate(entry);
        rows.push({
          id: String(entry._id),
          kind: fieldKey,
          kindLabel: SCHEDULE_KINDS[fieldKey],
          stage: stage.number,
          date,
          month: monthKeyOf(date),
          outcome: OUTCOMES.includes(entry.outcome) ? entry.outcome : '',
          outcomeNote: entry.outcomeNote || '',
          outcomeByName: entry.outcomeByName || '',
          outcomeAt: entry.outcomeAt || null,
        });
      });
    });
  });
  return rows.sort((a, b) => new Date(a.date) - new Date(b.date));
};

const countOutcomes = (sessions) => sessions.reduce((totals, row) => {
  totals.sessions += 1;
  if (row.kind === 'followUps') totals.followUps += 1;
  if (row.kind === 'familySessions') totals.familySessions += 1;
  if (row.outcome === 'problem') totals.problems += 1;
  if (row.outcome === 'improvement') totals.improvements += 1;
  return totals;
}, { sessions: 0, followUps: 0, familySessions: 0, problems: 0, improvements: 0 });

const qualifiesForMarketing = ({ improvements = 0 } = {}) => improvements >= MARKETING_MIN_IMPROVEMENTS;

// Short summary for the marketing sheet: the month's improvement notes, newest first.
const improvementSummaryOf = (sessions) => sessions
  .filter((row) => row.outcome === 'improvement' && row.outcomeNote)
  .reverse()
  .map((row) => row.outcomeNote)
  .join(' | ')
  .slice(0, 1000);

module.exports = {
  OUTCOMES,
  OUTCOME_LABELS,
  SCHEDULE_KINDS,
  MARKETING_MIN_IMPROVEMENTS,
  monthKeyOf,
  isMonthKey,
  collectSessions,
  countOutcomes,
  qualifiesForMarketing,
  improvementSummaryOf,
};
