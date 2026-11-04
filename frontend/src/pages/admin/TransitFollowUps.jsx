import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { PhoneCall, RefreshCw } from 'lucide-react';
import api from '../../api/axios.js';
import useLiveEvent from '../../api/useLiveEvent.js';
import { PageHeader } from '../../components/ui/Layout.jsx';
import { CALL } from '../../components/transit/TransitActions.jsx';

// "In Transit Follow-ups": every follow-up call In Transit set (call again at ...) on the delivery schedule call,
// scheduling and dispatch / handover steps - open ones with how late they are, and finished ones with whether the
// call was made on time or how many days late.
const TABS = [['open', 'Open'], ['done', 'Done'], ['all', 'All']];
const when = (value) => (value ? new Date(value).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '-');
const late = (days) => `${days} day${days === 1 ? '' : 's'} late`;
const STATUS = {
  upcoming: (r) => ['Upcoming', 'bg-sky-50 text-sky-900'],
  due: () => ['Due now', 'bg-amber-100 text-amber-900'],
  late: (r) => [late(r.lateDays), 'bg-[#8C3B2E] text-white'],
  done: (r) => [r.lateDays ? `Done ${late(r.lateDays)}` : 'Done on time', r.lateDays ? 'bg-[#FDE2E1] text-[#9F1D1D]' : 'bg-emerald-50 text-emerald-800'],
  closed: () => ['Closed (step done)', 'bg-[#F3EEE2] text-charcoal/65'],
};

export default function TransitFollowUps() {
  const [status, setStatus] = useState('open');
  const [mine, setMine] = useState(false);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    setLoading(true);
    try { const { data: res } = await api.get('/transit/follow-ups', { params: { status, mine: mine ? '1' : undefined }, skipCache: true }); setData(res); setError(''); }
    catch (err) { setError(err.response?.data?.message || 'Follow-ups could not be loaded'); }
    finally { setLoading(false); }
  }, [status, mine]);
  useEffect(() => { load(); const t = setInterval(load, 60000); return () => clearInterval(t); }, [load]);
  useLiveEvent('transit:changed', load);
  useLiveEvent('tasks:changed', load);
  const s = data?.summary || {};

  return (
    <div className="space-y-4">
      <PageHeader title="In Transit Follow-ups" icon={PhoneCall} subtitle="Every 'call again at' set while calling the patient (delivery schedule call, scheduling, dispatch / handover). A follow-up reminds at its time and counts the days it is late until the next call." />
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {[['Upcoming', s.upcoming, 'text-sky-900'], ['Due now', s.due, 'text-amber-800'], ['Late', s.late, 'text-[#9F1D1D]'], ['Done', s.done, 'text-emerald-800'], ['Closed', s.closed, 'text-charcoal/70']].map(([label, n, tone]) => (
          <div key={label} className="rounded-[12px] border border-[#E8DFCB] bg-white px-3 py-2.5"><p className="text-[10.5px] font-bold uppercase tracking-wide text-charcoal/55">{label}</p><p className={`font-display text-[20px] font-extrabold ${tone}`}>{n ?? '-'}</p></div>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {TABS.map(([key, label]) => <button key={key} type="button" aria-pressed={status === key} onClick={() => setStatus(key)} className={`rounded-full border px-4 py-1.5 text-sm font-semibold ${status === key ? 'border-sage bg-sage text-white' : 'border-cardline bg-white text-charcoal/70'}`}>{label}</button>)}
        <label className="ml-1 flex items-center gap-1.5 text-sm text-charcoal/75"><input type="checkbox" checked={mine} onChange={(e) => setMine(e.target.checked)} className="accent-[#5B7B65]" />Only the ones I set</label>
        <button type="button" onClick={load} aria-label="Refresh" className="ml-auto rounded-lg p-2 text-sage hover:bg-[#F3F6F2]"><RefreshCw size={15} className={loading ? 'animate-spin' : ''} /></button>
      </div>
      {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      <div className="overflow-x-auto rounded-[14px] border border-[#E8DFCB] bg-white">
        <table className="w-full min-w-[860px] text-left text-sm">
          <thead className="bg-[#56695D] text-xs text-white"><tr>{['Patient', 'Step', 'Follow-up at', 'Status', 'Set on the call', 'Next call'].map((h) => <th key={h} className="px-3 py-2.5 font-semibold">{h}</th>)}</tr></thead>
          <tbody className="divide-y divide-[#F0E8D8]">
            {(data?.rows || []).map((r) => {
              const [label, tone] = STATUS[r.status](r);
              return (
                <tr key={r.id} className={r.status === 'late' ? 'bg-[#FFF7F5]' : ''}>
                  <td className="px-3 py-2.5">
                    {r.poId ? <Link to={`/admin/purchase-orders/${r.poId}`} className="font-bold text-charcoal hover:text-sage hover:underline">{r.patientName}</Link> : <b>{r.patientName}</b>}
                    <p className="text-xs text-charcoal/55">{[r.patientCode, `Phase ${r.phase}`, r.poNumber].filter(Boolean).join(' · ')}</p>
                    {r.phone && <a href={`tel:${r.phone}`} className="text-xs font-semibold text-sage">{r.phone}</a>}
                  </td>
                  <td className="px-3 py-2.5 text-xs font-semibold text-charcoal/75">{r.label}</td>
                  <td className="px-3 py-2.5 font-semibold">{when(r.dueAt)}</td>
                  <td className="px-3 py-2.5"><span className={`inline-block whitespace-nowrap rounded-full px-2.5 py-0.5 text-[11.5px] font-bold ${tone}`}>{label}</span></td>
                  <td className="max-w-[260px] px-3 py-2.5 text-xs"><p className="font-semibold">{CALL[r.outcome] || r.outcome} · {when(r.setAt)} · {r.setByName}</p><p className="mt-0.5 line-clamp-2 text-charcoal/65">{r.notes}</p></td>
                  <td className="px-3 py-2.5 text-xs">{r.doneAt ? <><p className="font-semibold">{CALL[r.doneOutcome] || r.doneOutcome}</p><p className="text-charcoal/60">{when(r.doneAt)} · {r.doneByName}</p></> : <span className="text-charcoal/45">-</span>}</td>
                </tr>
              );
            })}
            {data && !data.rows.length && <tr><td colSpan={6} className="px-3 py-10 text-center text-sm text-charcoal/55">{status === 'open' ? 'No open follow-ups.' : 'Nothing here yet.'}</td></tr>}
            {!data && !error && <tr><td colSpan={6} className="px-3 py-10 text-center text-sm text-charcoal/55">Loading...</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
