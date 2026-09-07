// Fixed set of treatment stages a patient can be marked at.
const STAGES = [1, 2, 3, 4, 5, 6];

const STAGE_LABELS = {
  1: 'Stage 1',
  2: 'Stage 2',
  3: 'Stage 3',
  4: 'Stage 4',
  5: 'Stage 5',
  6: 'Stage 6',
};

// Progress status tracked per stage (independent of which stage is the patient's "current" one)
const STAGE_STATUSES = {
  NOT_STARTED: 'not_started',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
};

const ALL_STAGE_STATUSES = Object.values(STAGE_STATUSES);

const STAGE_STATUS_LABELS = {
  not_started: 'Not Started',
  in_progress: 'In Progress',
  completed: 'Completed',
};

module.exports = { STAGES, STAGE_LABELS, STAGE_STATUSES, ALL_STAGE_STATUSES, STAGE_STATUS_LABELS };