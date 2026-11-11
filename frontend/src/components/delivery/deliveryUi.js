// Small helpers shared by the Treatment Delivery screens (dates are always shown in India time).
const IST = 'Asia/Kolkata';

export const field = 'w-full rounded-lg border border-cardline bg-offwhite-200 px-3 py-2.5 text-sm text-charcoal focus:border-sage focus:outline-none focus:ring-2 focus:ring-sage/20 disabled:opacity-60';
export const label = 'block text-sm font-medium text-charcoal';

export const istToday = () => new Date().toLocaleDateString('en-CA', { timeZone: IST });
export const istDay = (value) => (value ? new Date(value).toLocaleDateString('en-CA', { timeZone: IST }) : '');
export const fmtDT = (value) => (value ? new Date(value).toLocaleString('en-IN', { timeZone: IST, weekday: 'short', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true }) : '-');
export const fmtTime = (value) => (value ? new Date(value).toLocaleTimeString('en-IN', { timeZone: IST, hour: '2-digit', minute: '2-digit', hour12: true }) : '');
// A plain day ("2026-11-12").
export const fmtDay = (day) => (day ? new Date(`${String(day).slice(0, 10)}T00:00:00+05:30`).toLocaleDateString('en-IN', { timeZone: IST, weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' }) : '-');

// <input type="datetime-local"> value <-> ISO.
const pad = (n) => String(n).padStart(2, '0');
export const toLocalInput = (value) => {
  if (!value) return '';
  const d = new Date(value);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
export const toIso = (local) => (local ? new Date(local).toISOString() : '');
export const nowLocal = () => toLocalInput(new Date());

export const errText = (err, fallback = 'Could not save. Try again.') => err?.response?.data?.message || fallback;

export const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// Badge tones (components/ui/Badge.jsx) for a session's state and a phase's status.
export const STATE_TONE = { tentative: 'amber', confirmed: 'teal', form_due: 'danger', overdue: 'danger', missed: 'danger', done: 'green', rescheduled: 'inactive', cancelled: 'inactive' };
export const STATUS_TONE = { none: 'inactive', waiting: 'inactive', setup: 'action', running: 'teal', delivered: 'green' };
export const LEVEL_CLASS = { red: 'border-[#FCA5A5] bg-[#FEF2F2] text-[#9F1D1D]', amber: 'border-[#F3D9A4] bg-[#FBF0DC] text-[#7C5B2E]' };

export const planLink = (patientId, phase) => `/admin/treatment-delivery?p=${patientId}&s=${phase}`;
