import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { MessageCircleQuestion, RefreshCw, Search } from 'lucide-react';
import api from '../../api/axios.js';
import useLiveEvent from '../../api/useLiveEvent.js';
import { PageHeader } from '../../components/ui/Layout.jsx';
import QueryCard from '../../components/advice/QueryCard.jsx';

// "Patient Queries" (PCC): every query the PCC raised with the doctor, by where it stands - waiting for the doctor
// (ring the alarm), answer ready (send it to the patient), follow-up (until the patient is satisfied), solved.
// The admin / manager see everyone's.
const TABS = [
  ['with_doctor', 'Waiting for doctor', 'text-[#7C5B2E]'],
  ['to_send', 'Send to patient', 'text-[#C2410C]'],
  ['follow_up', 'Follow-up', 'text-[#4C2F8F]'],
  ['solved', 'Solved', 'text-[#1F6B41]'],
];
// Most urgent first: late follow-ups, then emergencies, then the oldest.
const order = (a, b) => {
  const due = (r) => (r.nextFollowUpAt ? new Date(r.nextFollowUpAt).getTime() : Infinity);
  return (due(a) - due(b)) || (Number(b.isUrgent) - Number(a.isUrgent)) || (new Date(a.askedAt) - new Date(b.askedAt));
};

export default function PatientQueries() {
  const [params, setParams] = useSearchParams();
  const focusId = params.get('q') || '';
  const [tab, setTab] = useState('');
  const [open, setOpen] = useState(null);
  const [solved, setSolved] = useState(null);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/advice/queries', { params: { view: 'open' }, skipCache: true });
      setOpen(data.rows || []); setError('');
    } catch (err) { setError(err.response?.data?.message || 'Queries could not be loaded'); } finally { setLoading(false); }
  }, []);
  const loadSolved = useCallback(async () => {
    try { const { data } = await api.get('/advice/queries', { params: { view: 'solved' }, skipCache: true }); setSolved(data.rows || []); } catch { setSolved([]); }
  }, []);
  useEffect(() => { load(); const t = setInterval(load, 60000); return () => clearInterval(t); }, [load]);
  useEffect(() => { if (tab === 'solved' && solved === null) loadSolved(); }, [tab, solved, loadSolved]);
  useLiveEvent('advice:changed', () => { load(); if (solved !== null) loadSolved(); });

  const byTab = useMemo(() => {
    const groups = { with_doctor: [], to_send: [], follow_up: [], solved: solved || [] };
    (open || []).forEach((r) => groups[r.progress]?.push(r));
    Object.keys(groups).filter((k) => k !== 'solved').forEach((k) => groups[k].sort(order));
    return groups;
  }, [open, solved]);

  // Opened from My Day (?q=<id>): its tab, highlighted and scrolled to.
  useEffect(() => {
    if (!open) return;
    if (focusId) {
      const row = open.find((r) => r.id === focusId);
      if (row) { setTab(row.progress); setTimeout(() => document.getElementById(`query-${focusId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 150); return; }
    }
    if (!tab) setTab(byTab.to_send.length ? 'to_send' : byTab.follow_up.length ? 'follow_up' : 'with_doctor');
  }, [open, focusId]); // eslint-disable-line react-hooks/exhaustive-deps

  const needle = search.trim().toLowerCase();
  const rows = (byTab[tab] || []).filter((r) => !needle || [r.patientName, r.patientCode, r.query, r.advice, r.requestedByName].some((v) => String(v || '').toLowerCase().includes(needle)));
  const lateCount = byTab.follow_up.filter((r) => r.followUpDue).length;
  const replace = (advice) => {
    if (!advice) { load(); return; }
    if (advice.progress === 'solved') { setOpen((list) => (list || []).filter((r) => r.id !== advice.id)); setSolved((list) => (list ? [advice, ...list] : list)); }
    else setOpen((list) => (list || []).map((r) => (r.id === advice.id ? advice : r)));
  };

  return (
    <div className="space-y-4">
      <PageHeader title="Patient Queries" icon={MessageCircleQuestion} subtitle="Queries raised with the doctor during follow-ups: ring the doctor if there is no answer, send the answer to the patient, follow up, and mark it solved once the patient is satisfied. Every step keeps its time." />
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {TABS.map(([key, label, color]) => (
          <button key={key} type="button" aria-pressed={tab === key} onClick={() => { setTab(key); if (focusId) setParams({}, { replace: true }); }} className={`rounded-[12px] border px-3 py-2.5 text-left ${tab === key ? 'border-sage bg-[#F3F6F2] ring-1 ring-sage' : 'border-[#E8DFCB] bg-white hover:border-sage/50'}`}>
            <p className="text-[10.5px] font-bold uppercase tracking-wide text-charcoal/55">{label}</p>
            <p className={`font-display text-[20px] font-extrabold ${color}`}>{key === 'solved' && solved === null ? '-' : byTab[key].length}</p>
            {key === 'follow_up' && lateCount > 0 && <p className="text-[11px] font-bold text-[#B42318]">{lateCount} due / late</p>}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <label className="relative min-w-[220px] flex-1 sm:max-w-sm"><Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-charcoal/40" /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search patient, ID or query" className="w-full rounded-lg border border-cardline bg-white py-2 pl-8 pr-3 text-sm outline-none focus:border-sage" /></label>
        <p className="text-xs text-charcoal/55">Raise a new query from Follow Ups or the patient's page (Sessions & Advice).</p>
        <button type="button" onClick={() => { load(); if (solved !== null) loadSolved(); }} aria-label="Refresh" className="ml-auto rounded-lg p-2 text-sage hover:bg-[#F3F6F2]"><RefreshCw size={15} className={loading ? 'animate-spin' : ''} /></button>
      </div>
      {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {open === null ? <p className="rounded-xl border border-cardline bg-white py-10 text-center text-sm text-charcoal/55">Loading queries...</p>
        : !rows.length ? <p className="rounded-xl border border-dashed border-cardline bg-white py-10 text-center text-sm text-charcoal/55">{needle ? 'No query matches the search.' : tab === 'solved' && solved === null ? 'Loading...' : 'Nothing here.'}</p>
          : <div className="space-y-3">{rows.map((r) => <QueryCard key={r.id} row={r} canAct highlight={r.id === focusId} onChanged={replace} />)}</div>}
    </div>
  );
}
