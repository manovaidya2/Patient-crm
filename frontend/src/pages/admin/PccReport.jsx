import { useState } from 'react';
import { BarChart3 } from 'lucide-react';
import useApiQuery from '../../api/useApiQuery.js';
import { PageHeader } from '../../components/ui/Layout.jsx';

const today = () => new Date(Date.now() + 19800000).toISOString().slice(0, 10);
const addDays = (d, n) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
const PRESETS = [['7', 'Last 7 days'], ['30', 'Last 30 days'], ['90', 'Last 90 days'], ['month', 'This month']];
const rangeOf = (key) => {
  const t = today();
  if (key === 'month') return { from: `${t.slice(0, 7)}-01`, to: t };
  return { from: addDays(t, -(Number(key) - 1)), to: t };
};
const pct = (n) => (n == null ? '—' : `${n}%`);

function Tile({ label, value, hint, tone = '' }) {
  return (
    <div className="rounded-xl border border-cardline bg-white px-3.5 py-2.5">
      <p className="text-[11.5px] font-semibold text-charcoal/55">{label}</p>
      <p className={`font-display text-xl font-bold ${tone || 'text-charcoal'}`}>{value}</p>
      {hint && <p className="text-[11px] text-charcoal/45">{hint}</p>}
    </div>
  );
}

// One thin bar for "done on time" out of the sessions due (one hue; the number is printed beside it).
function RateBar({ row }) {
  const value = row.onTimeRate ?? 0;
  return (
    <div className="flex items-center gap-2" title={`${row.onTime} of ${row.due} due sessions done on time (${row.late} late, ${row.missed} missed)`}>
      <div className="h-2 w-28 overflow-hidden rounded-full bg-charcoal/[0.08]"><div className="h-full rounded-full bg-[#1F5F4A]" style={{ width: `${row.due ? value : 0}%` }} /></div>
      <span className="w-10 text-right text-[12.5px] font-bold text-charcoal">{pct(row.onTimeRate)}</span>
    </div>
  );
}

// PCC report: how each PCC's follow-ups, family sessions and trackers went in a date range - due, done (on time /
// late), missed, closed, still overdue, what is coming, and the work around them.
export default function PccReport() {
  const [preset, setPreset] = useState('30');
  const [range, setRange] = useState(rangeOf('30'));
  const { data, loading, error } = useApiQuery('/insights/pcc-report', { params: range });
  const t = data?.team || {};
  const rows = data?.rows || [];
  const pick = (key) => { setPreset(key); setRange(rangeOf(key)); };
  return (
    <div className="space-y-4">
      {data && !data.seesAll
        ? <PageHeader icon={BarChart3} title={`My Report${rows[0]?.name ? ` — ${rows[0].name}` : ''}`} subtitle="How your follow-ups, family sessions and trackers went: done on time, late, missed, overdue — and the work around them." />
        : <PageHeader icon={BarChart3} title="PCC Report" subtitle="How each PCC's follow-ups, family sessions and trackers went: done on time, late, missed, overdue — and the work around them." />}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-lg border border-cardline bg-white p-0.5">
          {PRESETS.map(([key, label]) => <button key={key} type="button" onClick={() => pick(key)} className={`rounded-md px-3 py-1 text-[12.5px] font-bold ${preset === key ? 'bg-[#1F5F4A] text-white' : 'text-charcoal/60 hover:bg-[#EEF3F0]'}`}>{label}</button>)}
        </div>
        <label className="flex items-center gap-1.5 text-[12.5px] font-semibold text-charcoal/60">From<input type="date" className="rounded-lg border border-cardline bg-white px-2 py-1 text-[13px]" value={range.from} max={range.to} onChange={(e) => { setPreset(''); setRange({ ...range, from: e.target.value }); }} /></label>
        <label className="flex items-center gap-1.5 text-[12.5px] font-semibold text-charcoal/60">To<input type="date" className="rounded-lg border border-cardline bg-white px-2 py-1 text-[13px]" value={range.to} min={range.from} onChange={(e) => { setPreset(''); setRange({ ...range, to: e.target.value }); }} /></label>
      </div>
      {error && <p className="text-sm text-[#8A1C25]">{error.response?.data?.message || 'Could not load the report.'}</p>}
      <div className="grid gap-2.5" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))' }}>
        <Tile label={data && !data.seesAll ? 'My sessions due' : 'Sessions due'} value={t.due ?? '—'} hint="in the range, till today" />
        <Tile label="Done" value={t.done ?? '—'} hint={`${pct(t.completionRate)} of due`} />
        <Tile label="Done on time" value={pct(t.onTimeRate)} hint={`${t.onTime ?? 0} on time · ${t.late ?? 0} late`} />
        <Tile label="Missed / closed" value={`${t.missed ?? 0} / ${t.closed ?? 0}`} />
        <Tile label="Overdue now" value={t.overdue ?? '—'} tone={t.overdue ? 'text-[#9F1D1D]' : ''} hint="open, past their day" />
        <Tile label="Due next 7 days" value={t.upcoming ?? '—'} hint={`${t.noCallTime ?? 0} without a call time`} tone={t.noCallTime ? 'text-[#9A5B00]' : ''} />
      </div>
      <div className="overflow-x-auto rounded-xl border border-cardline bg-white">
        <table className="w-full min-w-[1180px] text-left text-[13px]">
          <thead className="border-b border-cardline text-[11px] font-bold uppercase tracking-wide text-charcoal/50">
            <tr>
              <th className="px-4 py-3">PCC</th><th className="px-3 py-3 text-right">Patients</th><th className="px-3 py-3 text-right">Due</th><th className="px-3 py-3 text-right">Done</th>
              <th className="px-3 py-3">On time</th><th className="px-3 py-3 text-right">Late</th><th className="px-3 py-3 text-right">Missed</th><th className="px-3 py-3 text-right">Closed</th>
              <th className="px-3 py-3 text-right">Overdue now</th><th className="px-3 py-3 text-right">Next 7 days</th><th className="px-3 py-3 text-right">Reschedules</th><th className="px-3 py-3 text-right">Calls not connected</th>
              <th className="px-3 py-3 text-right">Avg form</th><th className="px-3 py-3 text-right">Doctor alerts</th><th className="px-3 py-3 text-right">Covers</th><th className="px-3 py-3 text-right">Explanations</th><th className="px-3 py-3 text-right">Queries</th><th className="px-3 py-3 text-right">Leave days</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-cardline">
            {rows.map((r) => (
              <tr key={r.id} className="align-middle">
                <td className="px-4 py-3 font-bold text-charcoal">{r.name}</td>
                <td className="px-3 py-3 text-right">{r.patients}</td>
                <td className="px-3 py-3 text-right font-semibold">{r.due}</td>
                <td className="px-3 py-3 text-right">{r.done}</td>
                <td className="px-3 py-3"><RateBar row={r} /></td>
                <td className="px-3 py-3 text-right">{r.late}</td>
                <td className="px-3 py-3 text-right">{r.missed}</td>
                <td className="px-3 py-3 text-right">{r.closed}</td>
                <td className={`px-3 py-3 text-right font-semibold ${r.overdue ? 'text-[#9F1D1D]' : ''}`}>{r.overdue}</td>
                <td className="px-3 py-3 text-right">{r.upcoming}{r.noCallTime ? <span className="block text-[11px] text-[#9A5B00]">{r.noCallTime} no call time</span> : null}</td>
                <td className="px-3 py-3 text-right">{r.reschedules}</td>
                <td className="px-3 py-3 text-right">{r.notConnected}</td>
                <td className="px-3 py-3 text-right">{r.avgFormMinutes == null ? '—' : `${r.avgFormMinutes} min`}</td>
                <td className="px-3 py-3 text-right">{r.doctorAlerts}</td>
                <td className="px-3 py-3 text-right">{r.covers}</td>
                <td className="px-3 py-3 text-right">{r.explanations}</td>
                <td className="px-3 py-3 text-right">{r.queries}</td>
                <td className="px-3 py-3 text-right">{r.leaveDays}</td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={18} className="px-4 py-8 text-center text-charcoal/55">{loading ? 'Loading...' : 'No PCC found.'}</td></tr>}
          </tbody>
          {rows.length > 1 && (
            <tfoot className="border-t-2 border-cardline bg-[#FAF8F2] font-bold">
              <tr>
                <td className="px-4 py-3">Team</td><td className="px-3 py-3 text-right">{t.patients}</td><td className="px-3 py-3 text-right">{t.due}</td><td className="px-3 py-3 text-right">{t.done}</td>
                <td className="px-3 py-3">{pct(t.onTimeRate)}</td><td className="px-3 py-3 text-right">{t.late}</td><td className="px-3 py-3 text-right">{t.missed}</td><td className="px-3 py-3 text-right">{t.closed}</td>
                <td className="px-3 py-3 text-right">{t.overdue}</td><td className="px-3 py-3 text-right">{t.upcoming}</td><td className="px-3 py-3 text-right">{t.reschedules}</td><td className="px-3 py-3 text-right">{t.notConnected}</td>
                <td className="px-3 py-3 text-right">—</td><td className="px-3 py-3 text-right">{t.doctorAlerts}</td><td className="px-3 py-3 text-right">{t.covers}</td><td className="px-3 py-3 text-right">{t.explanations}</td><td className="px-3 py-3 text-right">{t.queries}</td><td className="px-3 py-3 text-right">{t.leaveDays}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      <ul className="space-y-0.5 text-[11.5px] text-charcoal/55">
        <li><b>Due</b>: sessions given to the PCC whose day (call time, else due day) fell in the range, up to today. <b>On time</b>: done on or before that day.</li>
        <li><b>Overdue now</b> and <b>Next 7 days</b> are as of today, whatever the range. <b>Covers</b>: done for a colleague's patient. <b>Avg form</b>: time from opening the form to saving it.</li>
        <li><b>Explanations</b>: medicine explanations completed in the range. <b>Queries</b>: questions sent to the doctor. <b>Leave days</b>: from the PCC calendar / HR.</li>
      </ul>
    </div>
  );
}
