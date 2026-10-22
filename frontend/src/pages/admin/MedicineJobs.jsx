import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Pill } from 'lucide-react';
import api from '../../api/axios.js';
import Badge from '../../components/ui/Badge.jsx';
import { Chip } from '../../components/purchaseOrders/CreatePurchaseOrderModal.jsx';
import { useAuth } from '../../context/AuthContext.jsx';

const day = (v) => (v ? new Date(v).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : '-');
const URG = { breached: ['Overdue', 'bg-[#8C3B2E]/10 text-[#8C3B2E]'], critical: ['< 24 h', 'bg-[#8C3B2E]/10 text-[#8C3B2E]'], risk: ['< 48 h', 'bg-amber-100 text-amber-900'], normal: ['On time', 'bg-emerald-100 text-emerald-800'] };

// The Medicine Department's fulfilment queue: every open job, soonest ready date first.
export default function MedicineJobs() {
  const navigate = useNavigate();
  const [status, setStatus] = useState('open');
  const { user } = useAuth();
  const [items, setItems] = useState(null);
  const [counts, setCounts] = useState(null);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    try { const { data } = await api.get('/medicine-jobs', { params: { status }, skipCache: true }); setItems(data.items); setCounts(data.counts || null); setError(''); }
    catch (err) { setError(err.response?.data?.message || 'Could not load jobs'); }
  }, [status]);
  useEffect(() => { setItems(null); load(); }, [load]);
  useEffect(() => { const t = setInterval(load, 60000); return () => clearInterval(t); }, [load]);
  return (
    <div className="space-y-4">
      <div><h1 className="flex items-center gap-2 font-display text-xl font-bold text-charcoal sm:text-2xl"><Pill size={22} className="text-sage" />Fulfilment queue</h1><p className="text-sm text-charcoal/60">Each medicine request as a 12-stage job, soonest ready-by date first. Open a job to work its current stage.</p></div>
      <div className="flex flex-wrap gap-1.5">{[['open', 'In fulfilment'], ['ready', 'Ready - awaiting release'], ['released', 'Released'], ['all', 'All']].map(([v, l]) => <Chip key={v} active={status === v} onClick={() => setStatus(v)}>{l}{counts && <span className="ml-1 opacity-70">{counts[v] ?? 0}</span>}{counts?.mine?.[v] > 0 && <span className="ml-1.5 rounded-full bg-orange-500 px-1.5 py-px text-[10px] font-bold text-white" title="Waiting for you">{counts.mine[v]}</span>}</Chip>)}</div>
      {error && <p className="rounded-lg bg-[#8C3B2E]/8 px-3 py-2 text-sm text-[#8C3B2E]">{error}</p>}
      <div className="overflow-x-auto rounded-xl border border-cardline bg-white">
        <table className="w-full text-sm"><thead className="bg-offwhite-200 text-[11px] uppercase tracking-wide text-charcoal/55"><tr><th className="px-3 py-2 text-left">Patient</th><th className="px-3 py-2 text-left">PO · supply</th><th className="px-3 py-2 text-left">Ready by</th><th className="px-3 py-2 text-left">Current stage</th><th className="px-3 py-2 text-left">Progress</th></tr></thead>
          <tbody>
            {items === null ? <tr><td colSpan={5} className="p-6 text-center text-charcoal/55">Loading...</td></tr>
              : !items.length ? <tr><td colSpan={5} className="p-6 text-center text-charcoal/55">No jobs here.</td></tr>
                : items.map((j) => { const [ul, ut] = URG[j.urgency?.level] || URG.normal; return (
                  <tr key={j.id} className={`cursor-pointer border-t border-cardline ${(j.actionBy || []).includes(user?.role) ? 'bg-orange-50/70 shadow-[inset_3px_0_0_#f97316] hover:bg-orange-50' : 'hover:bg-sage/5'}`} onClick={() => navigate(`/admin/medicine-jobs/${j.id}`)}>
                    <td className="px-3 py-2"><b>{j.patientName}</b><div className="text-xs text-charcoal/55">{j.patientCode} · Phase {j.phase}</div></td>
                    <td className="px-3 py-2"><span className="font-mono text-xs font-bold">{j.poNumber || '-'}</span><div className="text-xs text-charcoal/60">{j.supplyLabel || '-'}{j.ageBandLabel ? ` · ${j.ageBandLabel}` : ''}</div></td>
                    <td className="px-3 py-2">{j.readyByDate ? <><span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${ut}`}>{ul}</span><div className="text-xs text-charcoal/60">{day(j.readyByDate)}</div></> : <span className="text-xs text-charcoal/50">not set</span>}</td>
                    <td className="px-3 py-2">{j.hold ? <Badge tone="danger">On hold</Badge> : <span className="text-charcoal">{j.currentStage + 1 > j.totalStages ? 'Released' : `${j.currentStage + 1}. ${j.currentLabel}`}</span>}</td>
                    <td className="px-3 py-2"><div className="h-1.5 w-28 overflow-hidden rounded-full bg-cardline"><div className="h-full bg-sage" style={{ width: `${j.progress}%` }} /></div><div className="text-[11px] text-charcoal/50">{j.progress}%</div></td>
                  </tr>); })}
          </tbody></table>
      </div>
    </div>
  );
}
