// Stored statuses — the only values ever sent when updating an entry.
export const SCHEDULE_STATUSES = {
  SCHEDULED: 'scheduled',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
};

// Display buckets — what the backend actually returns per entry (computed, never stored).
export const DISPLAY_STATUS_LABELS = {
  upcoming: 'Upcoming',
  late: 'Late',
  done: 'Done',
  done_late: 'Done Late',
  cancelled: 'Cancelled',
};

export const DISPLAY_STATUS_BADGE_TONE = {
  upcoming: 'teal',
  late: 'danger',
  done: 'active',
  done_late: 'amber',
  cancelled: 'inactive',
};