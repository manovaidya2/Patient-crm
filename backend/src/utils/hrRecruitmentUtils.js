const REQUIREMENT_TRANSITIONS = {
  draft: ['pending_approval'], rejected: ['pending_approval'], pending_approval: ['approved', 'rejected'], approved: ['closed'], closed: [],
};
const OFFER_TRANSITIONS = {
  draft: ['pending_approval', 'withdrawn'], rejected: ['pending_approval', 'withdrawn'],
  pending_approval: ['approved', 'rejected'], approved: ['sent', 'withdrawn'], sent: ['accepted', 'declined', 'expired', 'withdrawn'],
  accepted: [], declined: [], expired: [], withdrawn: [],
};

const canTransition = (map, from, to) => Boolean(map[from]?.includes(to));
const splitList = (value, maxItems = 30) => (Array.isArray(value) ? value : String(value || '').split(/[,\n]/))
  .map((entry) => String(entry).trim()).filter(Boolean).slice(0, maxItems);
const validDateKey = (value, optional = false) => {
  if (optional && !value) return true;
  const key = String(value || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return false;
  const date = new Date(`${key}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === key;
};

module.exports = { REQUIREMENT_TRANSITIONS, OFFER_TRANSITIONS, canTransition, splitList, validDateKey };
