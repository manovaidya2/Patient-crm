const CALL_TYPES = ['first_call', 'follow_up', 'other'];
const CALL_OUTCOMES = ['connected', 'no_answer', 'busy', 'switched_off', 'callback_requested', 'interested', 'not_interested', 'wrong_number', 'other'];
const FOLLOW_UP_STATUSES = ['pending', 'completed', 'cancelled', 'not_required'];

const localDateTime = (date, time) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || '')) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(String(time || ''))) return null;
  const value = new Date(`${date}T${time}:00+05:30`);
  return Number.isNaN(value.getTime()) ? null : value;
};

const dateKeyInIndia = (date = new Date()) => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(date);

const addDaysToDateKey = (dateKey, days) => {
  const date = new Date(`${dateKey}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

const startOfWeekDateKey = (dateKey) => {
  const date = new Date(`${dateKey}T12:00:00Z`);
  const day = date.getUTCDay();
  return addDaysToDateKey(dateKey, day === 0 ? -6 : 1 - day);
};

const followUpDisplayStatus = (record, now = new Date()) => {
  if (!record?.nextFollowUpAt || record.followUpStatus === 'not_required') return 'not_required';
  if (record.followUpStatus !== 'pending') return record.followUpStatus;
  return new Date(record.nextFollowUpAt) < now ? 'overdue' : 'pending';
};

module.exports = {
  CALL_TYPES, CALL_OUTCOMES, FOLLOW_UP_STATUSES, localDateTime, dateKeyInIndia,
  addDaysToDateKey, startOfWeekDateKey, followUpDisplayStatus,
};
