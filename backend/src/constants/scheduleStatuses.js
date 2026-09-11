// Stored statuses — the only values ever saved on a Follow-up/Family Session entry.
const SCHEDULE_STATUSES = {
  SCHEDULED: 'scheduled',
  SENT: 'sent',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
};

const ALL_SCHEDULE_STATUSES = Object.values(SCHEDULE_STATUSES);

// Display buckets — never stored, always computed from status + dateTime + completedAt.
// A "scheduled" entry becomes "late" automatically once its dateTime has passed.
// A "completed" entry is "done" if it was completed on/before its dateTime, else "done_late".
const DISPLAY_STATUSES = {
  UPCOMING: 'upcoming',
  LATE: 'late',
  DONE: 'done',
  DONE_LATE: 'done_late',
  CANCELLED: 'cancelled',
};

const DISPLAY_STATUS_LABELS = {
  upcoming: 'Upcoming',
  late: 'Late',
  done: 'Done',
  done_late: 'Done Late',
  cancelled: 'Cancelled',
};

// Computes the display bucket for one entry. Pass `now` for testability; defaults to the current time.
const getDisplayStatus = (entry, now = new Date()) => {
  if (entry.status === SCHEDULE_STATUSES.CANCELLED) return DISPLAY_STATUSES.CANCELLED;
  if (entry.status === SCHEDULE_STATUSES.SENT) return DISPLAY_STATUSES.DONE;
  if (entry.status === SCHEDULE_STATUSES.COMPLETED) {
    const wasLate = entry.completedAt && new Date(entry.completedAt) > new Date(entry.dateTime);
    return wasLate ? DISPLAY_STATUSES.DONE_LATE : DISPLAY_STATUSES.DONE;
  }
  return new Date(entry.dateTime) < now ? DISPLAY_STATUSES.LATE : DISPLAY_STATUSES.UPCOMING;
};

module.exports = {
  SCHEDULE_STATUSES,
  ALL_SCHEDULE_STATUSES,
  DISPLAY_STATUSES,
  DISPLAY_STATUS_LABELS,
  getDisplayStatus,
};
