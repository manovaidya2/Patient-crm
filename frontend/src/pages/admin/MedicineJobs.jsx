import { useCallback, useEffect, useRef, useState } from 'react';
import useStaleState from '../../hooks/useStaleState.js';
import useLiveEvent from '../../api/useLiveEvent.js';
import { useNavigate } from 'react-router-dom';
import { Pill } from 'lucide-react';
import { DelayChips } from '../../components/medicine/MedicineDelay.jsx';
import FinalVerificationStatus from '../../components/medicine/FinalVerificationStatus.jsx';
import MedicineBoxReceipt, { formatBoxReceiptTime } from '../../components/medicine/MedicineBoxReceipt.jsx';
import MedicineReleaseFlow from '../../components/medicine/MedicineReleaseFlow.jsx';
import api from '../../api/axios.js';
import Badge from '../../components/ui/Badge.jsx';
import { Chip } from '../../components/purchaseOrders/CreatePurchaseOrderModal.jsx';
import { PageHeader } from '../../components/ui/Layout.jsx';

// Board columns: stage ranges of the active 11-stage job (0-based current stage).
const BOARD = [['Prepare (1–4)', 0, 3], ['Pack (5–7)', 4, 6], ['Finish & verify (8–10)', 7, 9], ['Ready · release (11)', 10, 11]];
// Column box accents and the plain-words line under each column title.
const BOARD_LOOK = [['#657B6C', 'Order, formulation, sheet, stock'], ['#7C5CBF', 'Preparation, chits, open kit'], ['#B45309', 'Treatment papers, parcel, final verification'], ['#2F8F5B', 'Ready, waiting for release']];
const dueSoon = (j) => ['breached', 'critical'].includes(j.urgency?.level);
import { useAuth } from '../../context/AuthContext.jsx';
import { roleAllowed, ROLES } from '../../constants/roles.js';

const day = (v) => (v ? new Date(v).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : '-');
const URG = { breached: ['Overdue', 'bg-[#8C3B2E]/10 text-[#8C3B2E]'], critical: ['< 24 h', 'bg-[#8C3B2E]/10 text-[#8C3B2E]'], risk: ['< 48 h', 'bg-amber-100 text-amber-900'], normal: ['On time', 'bg-emerald-100 text-emerald-800'] };

// The Medicine Department's fulfilment queue: every open job, soonest ready date first.
export default function MedicineJobs() {
  const navigate = useNavigate();
  const [status, setStatus] = useState('all');
  const { user } = useAuth();
  const [items, setItems] = useStaleState(`medicine-jobs:${status}`, null);
  const [counts, setCounts] = useStaleState('medicine-jobs:counts', null);
  const [boxRequests, setBoxRequests] = useStaleState('medicine-box-receipts', []);
  const [releaseRequests, setReleaseRequests] = useStaleState('medicine-release-requests', []);
  const [view, setView] = useState('board');
  const [onlyMine, setOnlyMine] = useState(false);
  const [search, setSearch] = useState('');
  const [stageFilter, setStageFilter] = useState('all');
  const [attention, setAttention] = useState('all');
  const [error, setError] = useState('');
  const hasItems = useRef(false);
  hasItems.current = Boolean(items?.length);
  const load = useCallback(async () => {
    try {
      // An empty screen gets the first cards at once; the whole queue follows right after.
      if (!hasItems.current) { const { data } = await api.get('/medicine-jobs', { params: { status, limit: 12 }, skipCache: true }); setItems(data.items); setCounts(data.counts || null); }
      const [{ data }, { data: receipts }, { data: releases }] = await Promise.all([api.get('/medicine-jobs', { params: { status }, skipCache: true }), api.get('/medicine-jobs/box-receipts', { skipCache: true }), api.get('/medicine-jobs/release-requests', { skipCache: true })]);
      setItems(data.items); setCounts(data.counts || null); setBoxRequests(receipts.items || []); setReleaseRequests(releases.items || []); setError('');
    } catch (err) { setError(err.response?.data?.message || 'Could not load jobs'); }
  }, [status, setItems, setCounts, setBoxRequests, setReleaseRequests]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { const t = setInterval(load, 60000); return () => clearInterval(t); }, [load]);
  // Live: any job change updates the queue at once.
  useLiveEvent('medicine-job:changed', () => load());
  const terms = search.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const matchesPatient = (job) => {
    const text = [job.patientName, job.patientCode, job.poNumber].filter(Boolean).join(' ').toLowerCase();
    return terms.every((term) => text.includes(term));
  };
  const filteredItems = (items || []).filter((job) => {
    if (!matchesPatient(job) || (onlyMine && !roleAllowed(job.actionBy || [], user))) return false;
    const stage = job.status === 'released' ? job.totalStages : job.currentStage;
    if (stageFilter !== 'all') {
      const [, from, to] = BOARD[Number(stageFilter)];
      if (stage < from || stage > to) return false;
    }
    return attention === 'all' || (attention === 'hold' ? Boolean(job.hold) : attention === 'due' ? dueSoon(job) : job.urgency?.level === attention);
  });
  const visibleBoxRequests = boxRequests.filter(matchesPatient);
  const visibleReleaseRequests = releaseRequests.filter((row) => matchesPatient(row) && row.releaseRequest?.state !== 'released' && (user?.role !== ROLES.MEDICINE_DEPARTMENT || ['requested', 'accepted', 'cancelled'].includes(row.releaseRequest?.state)));
  return (
    <div className="space-y-4">
      <PageHeader icon={Pill} title="Fulfilment queue"
        subtitle={items ? `${items.length} job(s) · ${items.filter((j) => roleAllowed(j.actionBy || [], user)).length} waiting on you · ${items.filter(dueSoon).length} due within 24 h. Each medicine request is an 11-stage job, soonest ready-by date first. Open a job to work its current stage.` : 'Each medicine request as an 11-stage job, soonest ready-by date first. Open a job to work its current stage.'}
        actions={<div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="View">{[['board', 'Board'], ['list', 'List']].map(([k, l]) => <button key={k} type="button" aria-pressed={view === k} onClick={() => setView(k)} className={`rounded-full border px-3.5 py-1.5 text-xs font-bold ${view === k ? 'border-charcoal bg-charcoal text-white' : 'border-[#DED2BD] bg-white text-charcoal hover:bg-[#FBF7ED]'}`}>{l}</button>)}<button type="button" aria-pressed={onlyMine} onClick={() => setOnlyMine((v) => !v)} className={`rounded-full border px-3.5 py-1.5 text-xs font-bold ${onlyMine ? 'border-[#F97316] bg-[#F97316] text-white' : 'border-[#DED2BD] bg-white text-charcoal hover:bg-[#FBF7ED]'}`}>Only mine</button></div>} />
      <div className="flex flex-wrap gap-1.5">{[['open', 'In fulfilment'], ['ready', 'Ready - awaiting release'], ['released', 'Released'], ['all', 'All']].map(([v, l]) => <Chip key={v} active={status === v} onClick={() => setStatus(v)}>{l}{counts && <span className="ml-1 opacity-70">{counts[v] ?? 0}</span>}{counts?.mine?.[v] > 0 && <span className="ml-1.5 rounded-full bg-orange-500 px-1.5 py-px text-[10px] font-bold text-white" title="Waiting for you">{counts.mine[v]}</span>}</Chip>)}</div>
      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-cardline bg-white p-3">
        <label className="min-w-52 flex-1 space-y-1 text-xs font-semibold"><span>Search patient / PO</span><input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Patient name, patient ID or PO number" className="block w-full rounded-lg border border-cardline px-3 py-2 text-sm font-normal" /></label>
        <label className="space-y-1 text-xs font-semibold"><span>Queue stage</span><select value={stageFilter} onChange={(e) => setStageFilter(e.target.value)} className="block rounded-lg border border-cardline bg-white px-3 py-2 text-sm font-normal"><option value="all">All stages</option>{BOARD.map(([title], i) => <option key={i} value={i}>{title}</option>)}</select></label>
        <label className="space-y-1 text-xs font-semibold"><span>Attention</span><select value={attention} onChange={(e) => setAttention(e.target.value)} className="block rounded-lg border border-cardline bg-white px-3 py-2 text-sm font-normal"><option value="all">All jobs</option><option value="hold">On hold</option><option value="breached">Overdue</option><option value="due">Due within 24 h</option><option value="risk">Due within 48 h</option></select></label>
        {(search || stageFilter !== 'all' || attention !== 'all' || onlyMine) && <button type="button" className="rounded-lg border border-cardline px-3 py-2 text-sm font-semibold text-sage" onClick={() => { setSearch(''); setStageFilter('all'); setAttention('all'); setOnlyMine(false); }}>Clear filters</button>}
        {items !== null && <span className="py-2 text-xs text-charcoal/65">Showing {filteredItems.length} of {items.length} jobs</span>}
      </div>
      {error && <p className="rounded-lg bg-[#8C3B2E]/8 px-3 py-2 text-sm text-[#8C3B2E]">{error}</p>}
      <section className="space-y-3 rounded-xl border border-cardline bg-white p-4">
        <h2 className="font-bold text-charcoal">Medicine release requests</h2>
        <p className="text-xs text-charcoal/65">In Transit requests release or updates the follow-up within 20 days of final verification. The Medicine Department checks payment, accepts and releases.</p>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{visibleReleaseRequests.map((row) => <article key={row.id} className="space-y-2 rounded-lg border border-cardline p-3">
          <button type="button" className="text-left font-bold text-sage hover:underline" onClick={() => navigate(`/admin/medicine-jobs/${row.id}`)}>{row.patientName} · {row.patientCode}</button>
          <MedicineReleaseFlow job={row} onSaved={load} />
        </article>)}</div>
        {!visibleReleaseRequests.length && <p className="text-sm text-charcoal/60">No medicine release requests waiting here.</p>}
      </section>
      <section className="space-y-3 rounded-xl border border-cardline bg-white p-4">
        <h2 className="font-bold text-charcoal">Receive medicine box <span className="ml-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-900">{visibleBoxRequests.length} pending</span></h2>
        <p className="text-xs text-charcoal/65">Requests from the Medicine Department after final verification. The assigned final verification PCC confirms receipt here.</p>
        {!visibleBoxRequests.length ? <p className="text-sm text-charcoal/60">No medicine box receipt requests pending.</p> : <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{visibleBoxRequests.map((row) => <article key={row.id} className="space-y-2 rounded-lg border border-amber-200 p-3">
          <button type="button" className="text-left font-bold text-sage hover:underline" onClick={() => navigate(`/admin/medicine-jobs/${row.id}`)}>{row.patientName} · {row.patientCode}</button>
          <p className="text-xs text-charcoal/65">Phase {row.phase}{row.poNumber ? ` · PO ${row.poNumber}` : ''}</p>
          <MedicineBoxReceipt job={row} onSaved={load} />
        </article>)}</div>}
      </section>
      {view === 'board' && items !== null && (
        <div className="grid items-stretch gap-3.5" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
          {BOARD.map(([title, from, to], col) => {
            const list = filteredItems.filter((j) => (j.status === 'released' ? j.totalStages : j.currentStage) >= from && (j.status === 'released' ? j.totalStages : j.currentStage) <= to);
            const mineHere = list.filter((j) => roleAllowed(j.actionBy || [], user)).length;
            const [accent, hint] = BOARD_LOOK[col];
            return (
              <section key={title} className="flex min-h-[380px] min-w-0 flex-col overflow-hidden rounded-[16px] border border-[#E8DFCB] bg-[#FBF7ED]" aria-label={title}>
                <div className="h-1" style={{ background: accent }} aria-hidden="true" />
                <div className="flex items-start justify-between gap-2 border-b border-[#EFE3CF] bg-white px-3.5 py-3">
                  <div className="min-w-0"><h2 className="font-display text-[13.5px] font-extrabold text-charcoal">{title}</h2><p className="truncate text-[11px] text-charcoal/60">{hint}</p></div>
                  <span className="flex shrink-0 items-center gap-1">{mineHere > 0 && <span className="rounded-full bg-[#F97316] px-2 py-0.5 text-[11px] font-extrabold text-white" title="Waiting for you">{mineHere}</span>}<span className="rounded-full bg-[#E9EFE9] px-2 py-0.5 text-[11px] font-extrabold text-[#3F5546]">{list.length}</span></span>
                </div>
                <div className="flex flex-1 flex-col gap-2.5 p-2.5">
                {!list.length && <p className="flex flex-1 items-center justify-center rounded-xl border border-dashed border-[#DED2BD] px-3 py-6 text-center text-xs text-charcoal/50">No jobs</p>}
                {list.map((j) => {
                  const [ul, ut] = URG[j.urgency?.level] || URG.normal;
                  const mine = roleAllowed(j.actionBy || [], user);
                  const at = j.status === 'released' ? j.totalStages : j.currentStage;
                  return (
                    <button key={j.id} type="button" onClick={() => navigate(`/admin/medicine-jobs/${j.id}`)} className={`flex flex-col gap-1.5 rounded-xl border p-3 text-left shadow-[0_1px_2px_rgba(39,50,56,0.05)] transition hover:-translate-y-px hover:shadow-md ${mine ? 'border-2 border-[#FDBA74] bg-[#FFF7ED]' : 'border-[#E8DFCB] bg-white'}`}>
                      <span className="flex items-center justify-between gap-2"><b className="truncate text-[13px] text-charcoal">{j.patientName}</b>{j.handedOverOldFlow && <span className="shrink-0 rounded-full bg-[#E6F2EA] px-2 py-0.5 text-[10px] font-bold text-[#1F6B41]" title="Medicine already handed over the old way">Completed (old flow)</span>}{j.hold ? <Badge tone="danger">On hold</Badge> : j.readyByDate ? <span className={`rounded-full px-2 py-0.5 text-[10.5px] font-bold ${ut}`}>{ul}</span> : null}</span>
                      <span className="truncate text-[11.5px] text-charcoal/60">{[j.patientCode, j.poNumber && `PO ${j.poNumber}`, j.supplyLabel, j.ageBandLabel].filter(Boolean).join(' · ')}</span>
                      <span className="flex gap-0.5" aria-hidden="true">{Array.from({ length: j.totalStages }, (_, i) => <i key={i} className={`h-1 flex-1 rounded-full ${i < at ? 'bg-[#2F8F5B]' : i === at ? 'bg-[#F97316]' : 'bg-[#EFE3CF]'}`} />)}</span>
                      <span className={`text-[11.5px] ${mine ? 'font-bold text-[#C2410C]' : 'text-charcoal/65'}`}>{j.status === 'released' ? 'Released to In Transit' : `${j.currentStage + 1}. ${j.currentLabel}`}{j.readyByDate ? ` · ready by ${day(j.readyByDate)}` : ''}</span>
                      <FinalVerificationStatus verification={j.finalVerification} />
                      {j.status === 'released' && <span className="block rounded-lg bg-emerald-50 px-2.5 py-2 text-[11.5px] text-emerald-900"><b className="block">Medicine released — completed</b><span className="block">{j.releaseRequest?.releasedByName || 'Name not recorded'} · {j.releaseRequest?.releasedAt ? formatBoxReceiptTime(j.releaseRequest.releasedAt) : 'Release time not recorded'}</span></span>}
                    </button>
                  );
                })}
                </div>
                {col === BOARD.length - 1 && counts && <p className="border-t border-[#EFE3CF] bg-white px-3.5 py-2.5 text-[11.5px] text-charcoal/60">Released so far: <b className="text-charcoal">{counts.released ?? 0}</b> · ready, awaiting release: <b className="text-charcoal">{counts.ready ?? 0}</b></p>}
              </section>
            );
          })}
        </div>
      )}
      {view === 'list' && <div className="overflow-x-auto rounded-xl border border-cardline bg-white">
        <table className="w-full text-sm"><thead className="bg-offwhite-200 text-[11px] uppercase tracking-wide text-charcoal/55"><tr><th className="px-3 py-2 text-left">Patient</th><th className="px-3 py-2 text-left">PO · supply</th><th className="px-3 py-2 text-left">Ready by</th><th className="px-3 py-2 text-left">Current stage</th><th className="px-3 py-2 text-left">Progress</th></tr></thead>
          <tbody>
            {items === null ? <tr><td colSpan={5} className="p-6 text-center text-charcoal/55">Loading...</td></tr>
              : !filteredItems.length ? <tr><td colSpan={5} className="p-6 text-center text-charcoal/55">No jobs match these filters.</td></tr>
                : filteredItems.map((j) => { const [ul, ut] = URG[j.urgency?.level] || URG.normal; return (
                  <tr key={j.id} className={`cursor-pointer border-t border-cardline ${roleAllowed(j.actionBy || [], user) ? 'bg-orange-50/70 shadow-[inset_3px_0_0_#f97316] hover:bg-orange-50' : 'hover:bg-sage/5'}`} onClick={() => navigate(`/admin/medicine-jobs/${j.id}`)}>
                    <td className="px-3 py-2"><b>{j.patientName}</b><div className="text-xs text-charcoal/55">{j.patientCode} · Phase {j.phase}</div></td>
                    <td className="px-3 py-2"><span className="font-mono text-xs font-bold">{j.poNumber || '-'}</span><div className="text-xs text-charcoal/60">{j.supplyLabel || '-'}{j.ageBandLabel ? ` · ${j.ageBandLabel}` : ''}</div></td>
                    <td className="px-3 py-2">{j.readyByDate ? <><span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${ut}`}>{ul}</span><div className="text-xs text-charcoal/60">{day(j.readyByDate)}</div>{j.delay && <DelayChips delay={j.delay} show={['medicine']} className="mt-1" />}</> : <span className="text-xs text-charcoal/50">not set</span>}</td>
                    <td className="space-y-1 px-3 py-2">{j.hold ? <Badge tone="danger">On hold</Badge> : <span className="text-charcoal">{j.currentStage + 1 > j.totalStages ? 'Released' : `${j.currentStage + 1}. ${j.currentLabel}`}</span>}<FinalVerificationStatus verification={j.finalVerification} /></td>
                    <td className="px-3 py-2"><div className="h-1.5 w-28 overflow-hidden rounded-full bg-cardline"><div className="h-full bg-sage" style={{ width: `${j.progress}%` }} /></div><div className="text-[11px] text-charcoal/50">{j.progress}%</div></td>
                  </tr>); })}
          </tbody></table>
      </div>}
    </div>
  );
}
