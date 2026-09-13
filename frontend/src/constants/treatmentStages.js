export const STAGES = [1, 2, 3, 4, 5, 6];

export const STAGE_LABELS = {
  1: 'Phase 1',
  2: 'Phase 2',
  3: 'Phase 3',
  4: 'Phase 4',
  5: 'Phase 5',
  6: 'Phase 6',
};

export const STAGE_STATUSES = {
  NOT_STARTED: 'not_started',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
};

export const STAGE_STATUS_LABELS = {
  not_started: 'Not Started',
  in_progress: 'In Progress',
  completed: 'Completed',
};

export const STAGE_STATUS_OPTIONS = [
  { value: STAGE_STATUSES.NOT_STARTED, label: STAGE_STATUS_LABELS.not_started },
  { value: STAGE_STATUSES.IN_PROGRESS, label: STAGE_STATUS_LABELS.in_progress },
  { value: STAGE_STATUSES.COMPLETED, label: STAGE_STATUS_LABELS.completed },
];
