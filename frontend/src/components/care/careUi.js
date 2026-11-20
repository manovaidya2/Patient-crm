// Shared look of the Care Schedule (follow-ups, family sessions, trackers). Literal Tailwind classes only.
export const STATE_STYLE = {
  alert: 'bg-[#B4232F] text-white',
  overdue: 'bg-[#FDE2E1] text-[#9F1D1D]',
  today: 'bg-[#FFEFD6] text-[#9A5B00]',
  needs_time: 'bg-[#FFF7E8] text-[#7A4A06]',
  upcoming: 'bg-[#EEF3F0] text-[#1F4F3D]',
  done: 'bg-[#DCF0E3] text-[#166534]',
  missed: 'bg-[#F4E4E4] text-[#7A1F2B]',
  cancelled: 'bg-charcoal/[0.08] text-charcoal/60',
};
export const KIND_STYLE = {
  followup: { chip: 'bg-[#E6EEF8] text-[#24476F]', dot: 'bg-[#3B6EA8]', label: 'Follow-up' },
  family: { chip: 'bg-[#F1ECFA] text-[#4B2E83]', dot: 'bg-[#6B46C1]', label: 'Family session' },
  tracker: { chip: 'bg-[#FDF0E6] text-[#8A4B12]', dot: 'bg-[#C2620C]', label: 'Tracker' },
};
export const fmtDay = (day) => (day ? new Date(`${day}T00:00:00Z`).toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short', timeZone: 'UTC' }) : '');
export const fmtAt = (value) => (value ? new Date(value).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' }) : '');
export const fmtTime = (value) => (value ? new Date(value).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' }) : '');
