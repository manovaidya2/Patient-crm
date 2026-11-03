import { useEffect, useMemo, useState } from 'react';
import { CalendarDays } from 'lucide-react';
import api from '../../api/axios.js';

// The chosen PCC's next weeks: follow-ups, family sessions and medicine explanations per day, so In Transit can see
// when they are free. Their day off (Wednesday) is closed. Clicking a free day picks it for the explanation.
const WEEKS = 3;
const TYPE = { followup: ['Follow-up', 'bg-sky-100 text-sky-900'], family_session: ['Family session', 'bg-violet-100 text-violet-900'], explanation: ['Explanation', 'bg-amber-100 text-amber-900'] };
const dayKey = (value) => new Date(value).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
const time = (value) => new Date(value).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' });
// Same rules as the server (utils/pccCalendar): off on Wednesday; Saturday, Sunday and Tuesday only from 2 pm.
export const PCC_OFF_WEEKDAYS = [3];
export const PCC_AFTERNOON_WEEKDAYS = [6, 0, 2];
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const pccSlotProblem = (value) => {
  if (!value) return '';
  const d = new Date(value);
  if (PCC_OFF_WEEKDAYS.includes(d.getDay())) return "Wednesday is the PCCs' day off. Choose another day.";
  if (PCC_AFTERNOON_WEEKDAYS.includes(d.getDay()) && d.getHours() < 14) return `On ${DAY_NAMES[d.getDay()]} the PCCs take bookings only from 2 pm.`;
  return '';
};

export default function PccCalendar({ pccId, value, onPick }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [openDay, setOpenDay] = useState('');
  // From the Monday of this week.
  const start = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d; }, []);
  useEffect(() => {
    if (!pccId) { setData(null); return undefined; }
    let live = true;
    setData(null); setError('');
    api.get(`/transit/staff/${pccId}/calendar`, { params: { from: dayKey(start), days: WEEKS * 7 }, skipCache: true })
      .then(({ data: res }) => live && setData(res))
      .catch((err) => live && setError(err.response?.data?.message || 'Could not load the PCC calendar'));
    return () => { live = false; };
  }, [pccId, start]);

  if (!pccId) return <p className="rounded-lg bg-[#FBF7ED] px-3 py-2 text-xs text-charcoal/65">Pick the PCC to see their calendar.</p>;
  if (error) return <p className="text-xs text-[#8C3B2E]">{error}</p>;
  if (!data) return <p className="text-xs text-charcoal/55">Loading calendar...</p>;
  const off = data.offWeekdays || PCC_OFF_WEEKDAYS;
  const byDay = new Map();
  data.events.forEach((e) => { const k = dayKey(e.at); byDay.set(k, [...(byDay.get(k) || []), e]); });
  const today = dayKey(new Date());
  const chosen = value ? dayKey(value) : '';
  const days = Array.from({ length: WEEKS * 7 }, (_, i) => { const d = new Date(start); d.setDate(d.getDate() + i); return d; });
  const opened = openDay && byDay.get(openDay);
  return (
    <div className="rounded-xl border border-cardline bg-white p-3">
      <p className="mb-2 flex flex-wrap items-center gap-2 text-sm font-semibold text-charcoal"><CalendarDays size={15} className="text-sage" />{data.pcc.name}'s calendar <span className="text-xs font-normal text-charcoal/55">· click a day to pick it · Wednesday off · Sat, Sun, Tue from 2 pm</span></p>
      <div className="grid grid-cols-7 gap-1 text-center text-[10.5px] font-bold uppercase text-charcoal/50">{['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => <span key={d}>{d}</span>)}</div>
      <div className="mt-1 grid grid-cols-7 gap-1">
        {days.map((d) => {
          const key = dayKey(d);
          const events = byDay.get(key) || [];
          const isOff = off.includes(d.getDay());
          const afternoon = (data.afternoonWeekdays || PCC_AFTERNOON_WEEKDAYS).includes(d.getDay());
          const past = key < today;
          const picked = key === chosen;
          const disabled = isOff || past;
          return (
            <button key={key} type="button" disabled={disabled && !events.length}
              onClick={() => { setOpenDay(events.length ? key : ''); if (!disabled) onPick(key, afternoon); }}
              title={isOff ? 'PCC day off' : `${events.length} booked`}
              className={`min-h-[52px] rounded-lg border p-1 text-left text-[11px] transition ${picked ? 'border-sage bg-sage/15 ring-2 ring-sage/40' : isOff ? 'border-transparent bg-[#EFEAE0] text-charcoal/40' : past ? 'border-transparent bg-offwhite-200 text-charcoal/40' : 'border-cardline bg-offwhite-100 hover:border-sage'}`}>
              <span className="block font-bold">{d.getDate()} {d.toLocaleDateString('en-IN', { month: 'short' })}</span>
              {afternoon && !isOff && <span className="block text-[10px] font-semibold text-charcoal/55">from 2 pm</span>}
              {isOff ? <span className="block font-semibold">Off</span> : events.length ? <span className={`mt-0.5 inline-block rounded px-1 font-semibold ${events.length >= 4 ? 'bg-[#FDE2E1] text-[#9F1D1D]' : 'bg-amber-50 text-amber-900'}`}>{events.length} booked</span> : !past && <span className="block text-[#1F6B41]">Free</span>}
            </button>
          );
        })}
      </div>
      {opened && (
        <div className="mt-2 rounded-lg bg-[#FBF7ED] p-2">
          <p className="mb-1 text-xs font-bold text-charcoal">{new Date(`${openDay}T12:00:00`).toLocaleDateString('en-IN', { weekday: 'long', day: '2-digit', month: 'short' })}</p>
          <ul className="space-y-1">{opened.map((e, i) => <li key={i} className="flex flex-wrap items-center gap-1.5 text-xs"><b>{time(e.at)}</b><span className={`rounded px-1.5 py-0.5 text-[10.5px] font-semibold ${TYPE[e.type]?.[1] || ''}`}>{TYPE[e.type]?.[0] || e.type}</span>{e.patientName}{e.patientCode ? ` (${e.patientCode})` : ''} · Phase {e.phase}</li>)}</ul>
        </div>
      )}
    </div>
  );
}
