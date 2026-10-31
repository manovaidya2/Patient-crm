// Shared by My Day, the reminder bell and Team pending: each item is placed by when it is due (or how long it has
// waited), with the same buckets for every role.
const DAY = 86400000;
const startOfToday = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };

export const bucketOf = (item) => {
  const today = startOfToday();
  if (item.waitingSince) {
    const days = item.due ? Math.floor((today - new Date(item.due)) / DAY) : 0;
    return days >= 2 ? 'overdue' : 'today';
  }
  if (!item.due) return 'anytime';
  const due = new Date(item.due);
  if (due < today) return 'overdue';
  if (due < new Date(today.getTime() + DAY)) return 'today';
  return 'upcoming';
};

export const BUCKETS = [
  ['overdue', 'Overdue / waiting long', 'bg-[#FDE2E1] text-[#9F1D1D]'],
  ['today', 'Today', 'bg-[#FFF1E6] text-[#C2410C]'],
  ['upcoming', 'Upcoming', 'bg-[#E9EFE9] text-sage'],
  ['anytime', 'Anytime', 'bg-[#F3EEE2] text-charcoal/70'],
];
export const TONE = Object.fromEntries(BUCKETS.map(([key, , tone]) => [key, tone]));

export const when = (item) => {
  if (!item.due) return '';
  const d = new Date(item.due);
  if (item.waitingSince) {
    const days = Math.floor((startOfToday() - d) / DAY);
    return days <= 0 ? 'since today' : `waiting ${days} day${days === 1 ? '' : 's'}`;
  }
  return d.toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
};
