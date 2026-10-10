const POLICY_TRANSITIONS = { draft: ['published'], published: ['archived'], archived: [] };

const inclusiveDays = (start, end) => Math.floor(
  (new Date(`${end}T00:00:00Z`) - new Date(`${start}T00:00:00Z`)) / 86400000
) + 1;

const timeMinutes = (value) => value ? Number(value.slice(0, 2)) * 60 + Number(value.slice(3, 5)) : 0;
const workedMinutes = (checkIn, checkOut) => checkIn && checkOut ? timeMinutes(checkOut) - timeMinutes(checkIn) : 0;
const canChangePolicyStatus = (from, to) => Boolean(POLICY_TRANSITIONS[from]?.includes(to));
const canChangeLeaveStatus = (from, to, role) => from === 'pending' && (
  (role === 'admin' && ['approved', 'rejected', 'cancelled'].includes(to))
  || (role === 'hr' && to === 'cancelled')
);

module.exports = { POLICY_TRANSITIONS, inclusiveDays, timeMinutes, workedMinutes, canChangePolicyStatus, canChangeLeaveStatus };
