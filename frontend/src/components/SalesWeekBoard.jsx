import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';

const iso = (date) => new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
// Monday of the week that holds `value` (YYYY-MM-DD).
export const weekOf = (value) => {
  const date = new Date(`${value}T12:00:00`);
  date.setDate(date.getDate() - ((date.getDay() + 6) % 7));
  return Array.from({ length: 7 }, (_, i) => { const d = new Date(date); d.setDate(date.getDate() + i); return iso(d); });
};
const clock = (t) => { if (!t) return ''; const [h, m] = String(t).split(':').map(Number); if (Number.isNaN(h)) return t; return `${((h + 11) % 12) + 1}:${String(m || 0).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`; };

// How a booking looks on the board (same meaning as the table row colours).
const LOOK = {
  pending: ['border-[#FDBA74] bg-[#FFF7ED]', 'Pending acceptance', 'text-[#C2410C]'],
  accepted: ['border-[#C9D8CD] bg-[#E9EFE9]', 'Accepted by reception', 'text-[#3F5546]'],
  rescheduled: ['border-[#D4C6F0] bg-[#EFE9FA]', 'Rescheduled', 'text-[#5B3FA0]'],
  not_coming: ['border-[#E8DFCB] bg-[#F3EEE2] text-[#8a9094] line-through', 'Not coming', 'text-[#8a9094]'],
};
export const lookOf = (row) => (row.status === 'rescheduled' ? 'rescheduled' : row.status === 'not_coming' ? 'not_coming' : row.acceptedAt ? 'accepted' : 'pending');

// Sales appointments as a week board (design view). Every booking opens the same appointment form as the table.
export default function SalesWeekBoard({ dates, rowsByDate, columns, search, loading, today, onOpen, onAdd, canAdd, onShift, onThisWeek }) {
  const nameColumn = columns.find((c) => /^(patient name|name)$/i.test(c.label.trim()));
  const phoneColumn = columns.find((c) => /^(primary mobile|phone|mobile|phone number|mobile number)$/i.test(c.label.trim()));
  const timeColumn = columns.find((c) => c.type === 'time');
  const q = search.trim().toLowerCase();
  const match = (row) => !q || [row.appointmentCode, row.createdByName, ...columns.filter((c) => c.type !== 'file').map((c) => row.values?.[c.id])].some((v) => String(v || '').toLowerCase().includes(q));
  const all = dates.flatMap((d) => rowsByDate[d] || []);
  const count = (key) => all.filter((r) => lookOf(r) === key).length;
  const busiest = Math.max(1, ...dates.map((d) => (rowsByDate[d] || []).filter((r) => r.status === 'active').length));
  const tiles = [
    ['Booked', all.filter((r) => r.status === 'active').length, 'active this week', 'plain'],
    ['Pending acceptance', count('pending'), 'reception yet to accept', count('pending') ? 'orange' : 'plain'],
    ['Accepted', count('accepted'), 'accepted by reception', 'green'],
    ['Rescheduled', count('rescheduled'), 'moved to another day', 'plain'],
    ['Not coming', count('not_coming'), 'marked not coming', 'plain'],
  ];
  const tone = { plain: 'border-[#E8DFCB] bg-white text-charcoal', orange: 'border-[#FDBA74] bg-[#FFF7ED] text-[#C2410C]', green: 'border-[#E8DFCB] bg-white text-[#1F6B41]' };
  const range = `${new Date(`${dates[0]}T12:00:00`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })} – ${new Date(`${dates[6]}T12:00:00`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}`;

  return (
    <div className="space-y-3.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-display text-[15px] font-extrabold text-charcoal">Week {range}{loading && <span className="ml-2 text-xs font-medium text-charcoal/55">Loading...</span>}</p>
        <div className="flex items-center gap-1.5">
          <button type="button" aria-label="Previous week" onClick={() => onShift(-7)} className="rounded-[10px] border border-[#DED2BD] bg-white p-2 text-charcoal hover:bg-[#FBF7ED]"><ChevronLeft size={15} /></button>
          <button type="button" onClick={onThisWeek} className="rounded-[10px] border border-[#DED2BD] bg-white px-3 py-1.5 text-xs font-bold text-charcoal hover:bg-[#FBF7ED]">This week</button>
          <button type="button" aria-label="Next week" onClick={() => onShift(7)} className="rounded-[10px] border border-[#DED2BD] bg-white p-2 text-charcoal hover:bg-[#FBF7ED]"><ChevronRight size={15} /></button>
        </div>
      </div>
      <section className="grid gap-2.5" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
        {tiles.map(([label, value, hint, t]) => (
          <div key={label} className={`rounded-[14px] border px-3.5 py-3 ${tone[t]}`}>
            <p className={`text-[10.5px] font-bold uppercase tracking-wide ${t === 'orange' ? 'text-[#C2410C]' : 'text-charcoal/60'}`}>{label}</p>
            <p className="font-display text-[22px] font-extrabold leading-tight">{value}</p>
            <p className={`text-[11.5px] ${t === 'orange' ? 'text-[#9A3412]' : 'text-charcoal/60'}`}>{hint}</p>
          </div>
        ))}
      </section>
      <div className="overflow-x-auto pb-1">
        <div className="grid min-w-[1100px] gap-2.5" style={{ gridTemplateColumns: 'repeat(7, minmax(150px, 1fr))' }}>
          {dates.map((date) => {
            const list = (rowsByDate[date] || []).filter(match).sort((a, b) => String(timeColumn ? a.values?.[timeColumn.id] || '99' : '').localeCompare(String(timeColumn ? b.values?.[timeColumn.id] || '99' : '')));
            const active = (rowsByDate[date] || []).filter((r) => r.status === 'active').length;
            const isToday = date === today;
            const d = new Date(`${date}T12:00:00`);
            return (
              <section key={date} aria-label={d.toDateString()} className={`flex min-h-[460px] flex-col gap-2 rounded-[14px] bg-white p-2.5 ${isToday ? 'border-2 border-charcoal' : 'border border-[#E8DFCB]'}`}>
                <div className="flex items-baseline justify-between px-0.5">
                  <span className={`text-[10.5px] font-bold uppercase tracking-wide ${isToday ? 'text-charcoal' : 'text-charcoal/60'}`}>{d.toLocaleDateString('en-IN', { weekday: 'short' })}{isToday ? ' · today' : ''}</span>
                  <b className="font-display text-[18px] font-extrabold text-charcoal">{d.getDate()}</b>
                </div>
                <div className="h-[5px] overflow-hidden rounded-full bg-[#EFE3CF]"><span className="block h-full rounded-full bg-sage" style={{ width: `${Math.round((active / busiest) * 100)}%` }} /></div>
                <p className="px-0.5 text-[10.5px] text-charcoal/60">{active} booked{(rowsByDate[date] || []).length > active ? ` · ${(rowsByDate[date] || []).length - active} moved / not coming` : ''}</p>
                {list.map((row) => {
                  const key = lookOf(row);
                  const [cls, label, labelTone] = LOOK[key];
                  const time = timeColumn ? row.values?.[timeColumn.id] : '';
                  return (
                    <button key={row.id} type="button" onClick={() => onOpen(row)} className={`block rounded-[10px] border px-2.5 py-2 text-left text-[11.5px] leading-snug transition hover:shadow-sm ${cls}`}>
                      <span className="font-display text-[11px] font-extrabold text-charcoal/60">{clock(time) || 'No time'}</span>
                      <b className="block truncate text-[12px] text-charcoal">{(nameColumn && row.values?.[nameColumn.id]) || row.appointmentCode}</b>
                      {phoneColumn && row.values?.[phoneColumn.id] && <span className="block truncate text-charcoal/60">{row.values[phoneColumn.id]}</span>}
                      <span className={`block font-semibold ${labelTone}`}>{label}{row.notComingReason ? ` · ${row.notComingReason}` : ''}</span>
                      <span className="block truncate text-[10.5px] text-charcoal/55">{row.appointmentCode}{row.createdByName ? ` · by ${row.createdByName}` : ''}</span>
                    </button>
                  );
                })}
                {canAdd && <button type="button" onClick={() => onAdd(date)} className="mt-auto flex items-center justify-center gap-1 rounded-[10px] border-[1.5px] border-dashed border-[#DED2BD] px-2 py-2 text-[11.5px] font-semibold text-charcoal/55 hover:border-sage hover:text-sage"><Plus size={13} />Add on {d.getDate()}</button>}
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}
