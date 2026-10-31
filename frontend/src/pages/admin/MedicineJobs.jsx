import { useCallback, useEffect, useState } from 'react';
import useLiveEvent from '../../api/useLiveEvent.js';
import { useNavigate } from 'react-router-dom';
import { Pill } from 'lucide-react';
import { DelayChips } from '../../components/medicine/MedicineDelay.jsx';
import api from '../../api/axios.js';
import Badge from '../../components/ui/Badge.jsx';
import { Chip } from '../../components/purchaseOrders/CreatePurchaseOrderModal.jsx';
import { PageHeader } from '../../components/ui/Layout.jsx';

// Board columns: stage ranges of the 12-stage job (0-based current stage).
const BOARD = [['Prepare (1–4)', 0, 3], ['Pack & check (5–8)', 4, 7], ['Finish (9–11)', 8, 10], ['Ready · release (12)', 11, 12]];
// Column box accents and the plain-words line under each column title.
const BOARD_LOOK = [['#657B6C', 'Order, formulation, sheet, preparation'], ['#7C5CBF', 'Packing, chits, quality check'], ['#B45309', 'Labels, final pack, photos'], ['#2F8F5B', 'Ready, waiting for release']];
const dueSoon = (j) => ['breached', 'critical'].includes(j.urgency?.level);
import { useAuth } from '../../context/AuthContext.jsx';
import { roleAllowed } from '../../constants/roles.js';

const day = (v) => (v ? new Date(v).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : '-');
const URG = { breached: ['Overdue', 'bg-[#8C3B2E]/10 text-[#8C3B2E]'], critical: ['< 24 h', 'bg-[#8C3B2E]/10 text-[#8C3B2E]'], risk: ['< 48 h', 'bg-amber-100 text-amber-900'], normal: ['On time', 'bg-emerald-100 text-emerald-800'] };

// The Medicine Department's fulfilment queue: every open job, soonest ready date first.
export default function MedicineJobs() {
  const navigate = useNavigate();
  const [status, setStatus] = useState('all');
  const { user } = useAuth();
  const [items, setItems] = useState(null);
  const [counts, setCounts] = useState(null);
  const [view, setView] = useState('board');
  const [onlyMine, setOnlyMine] = useState(false);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    try { const { data } = await api.get('/medicine-jobs', { params: { status }, skipCache: true }); setItems(data.items); setCounts(data.counts || null); setError(''); }
    catch (err) { setError(err.response?.data?.message || 'Could not load jobs'); }
  }, [status]);
  useEffect(() => { setItems(null); load(); }, [load]);
  useEffect(() => { const t = setInterval(load, 60000); return () => clearInterval(t); }, [load]);
  // Live: any job change updates the queue at once.
  useLiveEvent('medicine-job:changed', () => load());
  return (
    <div className="space-y-4">
      <PageHeader icon={Pill} title="Fulfilment queue"
        subtitle={items ? `${items.length} job(s) · ${items.filter((j) => roleAllowed(j.actionBy || [], user)).length} waiting on you · ${items.filter(dueSoon).length} due within 24 h. Each medicine request is a 12-stage job, soonest ready-by date first. Open a job to work its current stage.` : 'Each medicine request as a 12-stage job, soonest ready-by date first. Open a job to work its current stage.'}
        actions={<div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="View">{[['board', 'Board'], ['list', 'List']].map(([k, l]) => <button key={k} type="button" aria-pressed={view === k} onClick={() => setView(k)} className={`rounded-full border px-3.5 py-1.5 text-xs font-bold ${view === k ? 'border-charcoal bg-charcoal text-white' : 'border-[#DED2BD] bg-white text-charcoal hover:bg-[#FBF7ED]'}`}>{l}</button>)}<button type="button" aria-pressed={onlyMine} onClick={() => setOnlyMine((v) => !v)} className={`rounded-full border px-3.5 py-1.5 text-xs font-bold ${onlyMine ? 'border-[#F97316] bg-[#F97316] text-white' : 'border-[#DED2BD] bg-white text-charcoal hover:bg-[#FBF7ED]'}`}>Only mine</button></div>} />
      <div className="flex flex-wrap gap-1.5">{[['open', 'In fulfilment'], ['ready', 'Ready - awaiting release'], ['released', 'Released'], ['all', 'All']].map(([v, l]) => <Chip key={v} active={status === v} onClick={() => setStatus(v)}>{l}{counts && <span className="ml-1 opacity-70">{counts[v] ?? 0}</span>}{counts?.mine?.[v] > 0 && <span className="ml-1.5 rounded-full bg-orange-500 px-1.5 py-px text-[10px] font-bold text-white" title="Waiting for you">{counts.mine[v]}</span>}</Chip>)}</div>
      {error && <p className="rounded-lg bg-[#8C3B2E]/8 px-3 py-2 text-sm text-[#8C3B2E]">{error}</p>}
      {view === 'board' && items !== null && (
        <div className="grid items-stretch gap-3.5" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
          {BOARD.map(([title, from, to], col) => {
            const list = items.filter((j) => (j.status === 'released' ? 12 : j.currentStage) >= from && (j.status === 'released' ? 12 : j.currentStage) <= to && (!onlyMine || roleAllowed(j.actionBy || [], user)));
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
                  const at = j.status === 'released' ? 12 : j.currentStage;
                  return (
                    <button key={j.id} type="button" onClick={() => navigate(`/admin/medicine-jobs/${j.id}`)} className={`flex flex-col gap-1.5 rounded-xl border p-3 text-left shadow-[0_1px_2px_rgba(39,50,56,0.05)] transition hover:-translate-y-px hover:shadow-md ${mine ? 'border-2 border-[#FDBA74] bg-[#FFF7ED]' : 'border-[#E8DFCB] bg-white'}`}>
                      <span className="flex items-center justify-between gap-2"><b className="truncate text-[13px] text-charcoal">{j.patientName}</b>{j.handedOverOldFlow && <span className="shrink-0 rounded-full bg-[#E6F2EA] px-2 py-0.5 text-[10px] font-bold text-[#1F6B41]" title="Medicine already handed over the old way">Completed (old flow)</span>}{j.hold ? <Badge tone="danger">On hold</Badge> : j.readyByDate ? <span className={`rounded-full px-2 py-0.5 text-[10.5px] font-bold ${ut}`}>{ul}</span> : null}</span>
                      <span className="truncate text-[11.5px] text-charcoal/60">{[j.patientCode, j.poNumber && `PO ${j.poNumber}`, j.supplyLabel, j.ageBandLabel].filter(Boolean).join(' · ')}</span>
                      <span className="flex gap-0.5" aria-hidden="true">{Array.from({ length: 12 }, (_, i) => <i key={i} className={`h-1 flex-1 rounded-full ${i < at ? 'bg-[#2F8F5B]' : i === at ? 'bg-[#F97316]' : 'bg-[#EFE3CF]'}`} />)}</span>
                      <span className={`text-[11.5px] ${mine ? 'font-bold text-[#C2410C]' : 'text-charcoal/65'}`}>{j.status === 'released' ? 'Released to In Transit' : `${j.currentStage + 1}. ${j.currentLabel}`}{j.readyByDate ? ` · ready by ${day(j.readyByDate)}` : ''}</span>
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
              : !items.length ? <tr><td colSpan={5} className="p-6 text-center text-charcoal/55">No jobs here.</td></tr>
                : items.map((j) => { const [ul, ut] = URG[j.urgency?.level] || URG.normal; return (
                  <tr key={j.id} className={`cursor-pointer border-t border-cardline ${roleAllowed(j.actionBy || [], user) ? 'bg-orange-50/70 shadow-[inset_3px_0_0_#f97316] hover:bg-orange-50' : 'hover:bg-sage/5'}`} onClick={() => navigate(`/admin/medicine-jobs/${j.id}`)}>
                    <td className="px-3 py-2"><b>{j.patientName}</b><div className="text-xs text-charcoal/55">{j.patientCode} · Phase {j.phase}</div></td>
                    <td className="px-3 py-2"><span className="font-mono text-xs font-bold">{j.poNumber || '-'}</span><div className="text-xs text-charcoal/60">{j.supplyLabel || '-'}{j.ageBandLabel ? ` · ${j.ageBandLabel}` : ''}</div></td>
                    <td className="px-3 py-2">{j.readyByDate ? <><span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${ut}`}>{ul}</span><div className="text-xs text-charcoal/60">{day(j.readyByDate)}</div>{j.delay && <DelayChips delay={j.delay} show={['medicine']} className="mt-1" />}</> : <span className="text-xs text-charcoal/50">not set</span>}</td>
                    <td className="px-3 py-2">{j.hold ? <Badge tone="danger">On hold</Badge> : <span className="text-charcoal">{j.currentStage + 1 > j.totalStages ? 'Released' : `${j.currentStage + 1}. ${j.currentLabel}`}</span>}</td>
                    <td className="px-3 py-2"><div className="h-1.5 w-28 overflow-hidden rounded-full bg-cardline"><div className="h-full bg-sage" style={{ width: `${j.progress}%` }} /></div><div className="text-[11px] text-charcoal/50">{j.progress}%</div></td>
                  </tr>); })}
          </tbody></table>
      </div>}
    </div>
  );
}
