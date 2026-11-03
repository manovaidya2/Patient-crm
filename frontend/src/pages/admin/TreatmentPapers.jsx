import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { BellRing, ExternalLink, FileText, Inbox, RefreshCw, Save } from 'lucide-react';
import api from '../../api/axios.js';
import useLiveEvent from '../../api/useLiveEvent.js';
import Button from '../../components/ui/Button.jsx';
import { PageHeader } from '../../components/ui/Layout.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { isAdminLike } from '../../constants/roles.js';

// Make Treatment Paper: fulfilment step 9. Every kit that passed the quality check waits here for its treatment papers,
// made by the PCC the admin chooses (the setting at the top, admin only). Opening a row opens the job's step 9.
const day = (v) => (v ? new Date(v).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '-');
const when = (v) => (v ? new Date(v).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '');

function PccSetting({ onSaved }) {
  const [data, setData] = useState(null);
  const [pick, setPick] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  useEffect(() => { api.get('/treatment-papers/setting', { skipCache: true }).then(({ data: d }) => { setData(d); setPick(d.pcc?.id || ''); }).catch(() => setMsg('Could not load the setting')); }, []);
  const save = async () => {
    setBusy(true); setMsg('');
    try { const { data: d } = await api.put('/treatment-papers/setting', { pccId: pick }); setData((o) => ({ ...o, pcc: d.pcc })); setMsg('Saved.'); onSaved(); }
    catch (err) { setMsg(err.response?.data?.message || 'Could not save'); } finally { setBusy(false); }
  };
  if (!data) return null;
  return (
    <div className="flex flex-wrap items-end gap-3 rounded-[14px] border border-[#E8DFCB] bg-white p-4">
      <label className="min-w-[240px] flex-1 space-y-1 text-sm font-medium text-charcoal">
        <span>Admin setting: which PCC makes the treatment papers</span>
        <select className="w-full rounded-lg border border-cardline bg-white px-3 py-2 text-sm" value={pick} onChange={(e) => setPick(e.target.value)}>
          <option value="">Any PCC (not chosen)</option>
          {data.pccs.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </label>
      <Button onClick={save} disabled={busy || pick === (data.pcc?.id || '')}><Save size={15} />{busy ? 'Saving...' : 'Save'}</Button>
      {msg && <span className="text-sm font-semibold text-sage">{msg}</span>}
    </div>
  );
}

export default function TreatmentPapers() {
  const { user } = useAuth();
  const [view, setView] = useState('pending');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    try { const { data: d } = await api.get('/treatment-papers', { params: { view }, skipCache: true }); setData(d); setError(''); }
    catch (err) { setError(err.response?.data?.message || 'Could not load'); }
  }, [view]);
  useEffect(() => { setData(null); load(); }, [load]);
  useLiveEvent('medicine-job:changed', () => load());
  useLiveEvent('pcc:alarm', () => load());
  const rows = data?.rows || [];
  return (
    <div className="space-y-4">
      <PageHeader icon={FileText} title="Make Treatment Paper" subtitle="Fulfilment step 9: the kit passed the quality check; make its treatment papers (each paper by name, every page). The doctor checks them next." actions={<Button variant="outline" size="sm" onClick={load}><RefreshCw size={15} />Refresh</Button>} />
      {isAdminLike(user) && <PccSetting onSaved={load} />}
      {data && !data.mine && <p className="rounded-lg bg-[#FBF7ED] px-4 py-3 text-sm text-charcoal/75">Treatment papers are made by <b>{data.pcc?.name}</b> (chosen by the admin).</p>}
      {data?.mine && data.pcc && !isAdminLike(user) && <p className="text-sm text-charcoal/65">You make the treatment papers (chosen by the admin).</p>}
      <div className="flex flex-wrap gap-2">
        {[['pending', 'To make'], ['done', 'Made']].map(([key, label]) => <button key={key} type="button" aria-pressed={view === key} onClick={() => setView(key)} className={`rounded-full border px-4 py-1.5 text-sm font-semibold ${view === key ? 'border-sage bg-sage text-white' : 'border-cardline bg-white text-charcoal/70 hover:border-sage/60'}`}>{label}</button>)}
      </div>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      {!data ? <p className="text-sm text-charcoal/60">Loading...</p> : !rows.length ? (
        <div className="flex flex-col items-center gap-2 rounded-[14px] border border-dashed border-cardline bg-white p-10 text-center"><Inbox size={22} className="text-charcoal/35" /><p className="text-sm text-charcoal/60">{view === 'pending' ? 'No kit is waiting for treatment papers.' : 'No treatment papers made yet.'}</p></div>
      ) : (
        <div className="space-y-3">
          {rows.map((r) => (
            <article key={r.id} className={`flex flex-wrap items-start justify-between gap-3 rounded-[14px] border bg-white p-4 ${r.alarm && view === 'pending' ? 'border-2 border-[#FCA5A5]' : 'border-[#E8DFCB]'}`}>
              <div className="min-w-0">
                <p className="font-display text-base font-bold text-charcoal">{r.patientName} <span className="text-sm font-normal text-charcoal/60">{[r.patientCode, `Phase ${r.phase}`].join(' · ')}</span></p>
                <p className="text-xs text-charcoal/65">{[r.poNumber && `PO ${r.poNumber}`, r.supplyLabel, r.ageBandLabel, r.readyByDate && `ready by ${day(r.readyByDate)}`].filter(Boolean).join(' · ')}</p>
                {view === 'pending' && r.waitingSince && <p className="mt-1 text-xs text-charcoal/60">Waiting since {when(r.waitingSince)} (quality check passed)</p>}
                {r.alarm && view === 'pending' && <p className="mt-1 flex items-center gap-1.5 text-xs font-bold text-[#B91C1C]"><BellRing size={13} />Medicine Department rang {when(r.alarm.at)} ({r.alarm.byName}){r.alarm.note ? `: ${r.alarm.note}` : ''}</p>}
                {view === 'done' && <p className="mt-1 text-xs text-charcoal/65">Made by {r.doneByName} · {when(r.doneAt)} · {r.papers.map((p) => `${p.name} (${p.pages} page${p.pages === 1 ? '' : 's'})`).join(', ')}</p>}
              </div>
              <Link to={`/admin/medicine-jobs/${r.id}`}><Button size="sm"><ExternalLink size={14} />{view === 'pending' ? 'Open & make papers' : 'View'}</Button></Link>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
