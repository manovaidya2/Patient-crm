import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRightLeft, CheckCircle2, Info } from 'lucide-react';
import api from '../../api/axios.js';
import useApiQuery from '../../api/useApiQuery.js';
import Button from '../ui/Button.jsx';
import { fmtAt, fmtDay } from './careUi.js';

const errorText = (error) => error?.response?.data?.message || error?.message || 'Something went wrong';

// Admin / Manager: old patients' follow-ups and family sessions onto the Care Schedule. Each phase still running on
// the old entries gets the new pattern for the days it has left; done entries stay as saved, the old open ones are
// closed as "Moved to the new Care Schedule" (nothing is deleted). Preview first, then move all or one by one.
export default function ConvertOldPanel() {
  const { data, loading, error, refresh } = useApiQuery('/care/convert');
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');
  const [open, setOpen] = useState('');
  const rows = data?.rows || [];
  const totals = data?.totals || {};
  const run = async (body, key) => {
    if (key === 'all' && !window.confirm(`Move ${totals.ready} phases to the new Care Schedule? ${totals.newSessions} new sessions will be made and ${totals.closed} old open entries closed (kept on record).`)) return;
    setBusy(key); setMessage('');
    try {
      const { data: res } = await api.post('/care/convert', body);
      const failed = (res.results || []).filter((r) => !r.ok);
      setMessage(`${res.moved} phase${res.moved === 1 ? '' : 's'} moved, ${res.sessions} new session${res.sessions === 1 ? '' : 's'} made, ${res.closed} old entr${res.closed === 1 ? 'y' : 'ies'} closed.${failed.length ? ` Not moved: ${failed.map((r) => `${r.patientName} (P${r.phase}): ${r.reason}`).join('; ')}` : ''}`);
      refresh();
    } catch (e) { setMessage(errorText(e)); } finally { setBusy(''); }
  };
  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-cardline bg-white p-3 text-[13px] text-charcoal/75">
        <p className="flex items-start gap-2"><Info size={15} className="mt-0.5 shrink-0 text-[#1F5F4A]" /><span>
          Old patients whose follow-ups / family sessions are still open move to the new pattern for the days they have left
          (e.g. 2 months left → FU-06, FS-03, FU-07 and the trackers on their days). This also runs by itself every time the server starts. <b>Done entries stay as saved.</b> The old open
          entries are closed as “Moved to the new Care Schedule” (kept on record). A call time already agreed on an old entry close to a
          new day (±7 days) is kept. Start date: the medicine start date, else 10 days before the phase’s first follow-up.
        </span></p>
      </div>
      {loading && <p className="text-sm text-charcoal/55">Working out the preview...</p>}
      {error && <p className="text-sm text-[#8A1C25]">{errorText(error)}</p>}
      {data && (
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-[13px] text-charcoal"><b>{totals.ready}</b> of {totals.phases} phases ready · <b>{totals.newSessions}</b> new sessions · <b>{totals.closed}</b> old open entries to close</p>
          <Button className="ml-auto" disabled={!totals.ready || Boolean(busy)} onClick={() => run({ all: true }, 'all')}><ArrowRightLeft size={14} className="mr-1 inline" />{busy === 'all' ? 'Moving...' : `Move all ${totals.ready || ''}`}</Button>
        </div>
      )}
      {message && <p className="flex items-start gap-2 rounded-lg border border-[#1F5F4A]/30 bg-[#F2F7F4] px-3 py-2 text-[13px] text-[#1F4F3D]"><CheckCircle2 size={15} className="mt-0.5 shrink-0" />{message}</p>}
      {data && !rows.length && <p className="rounded-lg bg-white px-3 py-4 text-center text-sm text-charcoal/55">No old patient has open follow-ups or family sessions. Everything is on the Care Schedule.</p>}
      {rows.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-cardline bg-white">
          <table className="w-full min-w-[900px] text-left text-[12.5px]">
            <thead className="bg-[#FAF8F2] text-[11.5px] text-charcoal/60">
              <tr><th className="px-3 py-2">Patient</th><th className="px-3 py-2">PCC</th><th className="px-3 py-2">Start / length</th><th className="px-3 py-2">New sessions (from today)</th><th className="px-3 py-2">Old open → closed</th><th className="px-3 py-2" /></tr>
            </thead>
            <tbody className="divide-y divide-cardline">
              {rows.map((r) => {
                const key = `${r.patientId}-${r.phase}`;
                return (
                  <tr key={key} className={r.ok ? '' : 'bg-charcoal/[0.03] text-charcoal/55'}>
                    <td className="px-3 py-2 align-top"><Link to={`/admin/patients/${r.patientId}`} className="font-bold text-charcoal hover:underline">{r.patientName}</Link><span className="block text-[11px] text-charcoal/50">{[r.patientCode, `Phase ${r.phase}`].filter(Boolean).join(' · ')}</span></td>
                    <td className="px-3 py-2 align-top">{r.pccName || '—'}</td>
                    <td className="px-3 py-2 align-top">{r.start ? <>{fmtDay(r.start)} <span className="block text-[11px] text-charcoal/50">{r.startFrom}</span><span className="block text-[11px] text-charcoal/50">{r.days} days · ends {fmtDay(r.end)}</span></> : '—'}</td>
                    <td className="px-3 py-2 align-top">
                      {r.ok && r.over ? <span className="text-[12px] text-[#9A5B00]">{r.reason}</span> : r.ok ? (
                        <>
                          <button type="button" onClick={() => setOpen(open === key ? '' : key)} className="font-bold text-[#1F5F4A] hover:underline">{r.items.length} session{r.items.length === 1 ? '' : 's'}{r.items.some((i) => i.carried) ? ` (${r.items.filter((i) => i.carried).length} with call time)` : ''}</button>
                          {open === key && <ul className="mt-1 space-y-0.5 text-[11.5px]">{r.items.map((i) => <li key={i.code}>{i.code} · day {i.day} · {fmtDay(i.date)}{i.carried ? ` · call ${fmtAt(i.carried)}` : ''}</li>)}</ul>}
                        </>
                      ) : <span className="text-[12px]">{r.reason}</span>}
                    </td>
                    <td className="px-3 py-2 align-top">{r.ok ? <>{r.close} closed<span className="block text-[11px] text-charcoal/50">{r.kept} done kept</span></> : '—'}</td>
                    <td className="px-3 py-2 text-right align-top">{r.ok && <Button size="sm" variant="outline" disabled={Boolean(busy)} onClick={() => run({ items: [{ patientId: r.patientId, phase: r.phase }] }, key)}>{busy === key ? 'Moving...' : 'Move'}</Button>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
