import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ClipboardList, Plus, Search } from 'lucide-react';
import api from '../../api/axios.js';
import Button from '../../components/ui/Button.jsx';
import CreatePurchaseOrderModal, { poInput } from '../../components/purchaseOrders/CreatePurchaseOrderModal.jsx';
import PurchaseOrderRow from '../../components/purchaseOrders/PurchaseOrderRow.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { ROLES } from '../../constants/roles.js';
import { PO_STAGES } from '../../constants/supplyPlans.js';

const CREATE_ROLES = [ROLES.ADMIN, ROLES.DOCTOR, ROLES.POST_COUNSELOR, ROLES.IN_TRANSIT];

export default function PurchaseOrders() {
  const { user } = useAuth();
  const navigate = useNavigate();
  // Opens on everything still pending; finished POs move to "Treatment started".
  const [stage, setStage] = useState('pending');
  const [query, setQuery] = useState('');
  const [data, setData] = useState({ items: [], counts: {} });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const requestId = useRef(0);

  const load = useCallback(async () => {
    const id = ++requestId.current;
    try {
      const { data: res } = await api.get('/purchase-orders', { params: { stage: stage || undefined, q: query || undefined }, skipCache: true });
      if (id === requestId.current) { setData(res); setError(''); }
    } catch (err) { if (id === requestId.current) setError(err.response?.data?.message || 'Could not load purchase orders'); }
    finally { if (id === requestId.current) setLoading(false); }
  }, [stage, query]);
  useEffect(() => { setLoading(true); const timer = setTimeout(load, query ? 300 : 0); return () => clearTimeout(timer); }, [load, query]);
  useEffect(() => { const timer = setInterval(load, 60000); return () => clearInterval(timer); }, [load]);

  const open = (po) => navigate(`/admin/purchase-orders/${po.id}`);
  const filters = [{ key: 'pending', label: 'Pending', hint: 'Not finished yet' }, ...PO_STAGES, { key: '', label: 'All', hint: 'Every purchase order' }];
  const countOf = (key) => (key ? data.counts?.[key] : data.counts?.all) ?? 0;
  const mineOf = (key) => (key ? data.counts?.mine?.[key] : data.counts?.mine?.all) || 0;
  // Stages that still need work show their number in orange.
  const pendingCard = (key) => key && key !== 'started' && countOf(key) > 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 font-display text-xl font-bold text-charcoal sm:text-2xl"><ClipboardList size={22} className="text-sage" />Purchase Orders</h1>
          <p className="text-sm text-charcoal/60">Verify each PO and its payment, then send its medicine request to Medicine Department.</p>
        </div>
        <div className="flex w-full flex-wrap gap-2 sm:w-auto">
          <div className="relative min-w-0 flex-1 sm:w-72"><Search size={16} className="absolute left-3 top-2.5 text-charcoal/45" /><input className={`${poInput} !pl-9`} placeholder="PO number, patient, ID or phone" value={query} onChange={(e) => setQuery(e.target.value)} /></div>
          {CREATE_ROLES.includes(user?.role) && <Button onClick={() => setCreateOpen(true)}><Plus size={15} />New PO</Button>}
        </div>
      </div>

      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {filters.map((f) => (
          <button key={f.key || 'all'} type="button" onClick={() => setStage(f.key)} className={`min-w-[132px] shrink-0 rounded-xl border px-3 py-2.5 text-left transition ${stage === f.key ? 'border-sage bg-sage text-white shadow-sm' : pendingCard(f.key) ? 'border-orange-300 bg-orange-50/60 hover:border-orange-400' : 'border-cardline bg-white hover:border-sage/60'}`}>
            <p className={`text-2xl font-bold leading-none ${stage !== f.key && pendingCard(f.key) ? 'text-orange-600' : ''}`}>{countOf(f.key)}</p>
            <p className="mt-1 flex items-center gap-1.5 text-xs font-semibold">{f.label}{mineOf(f.key) > 0 && <span className="rounded-full bg-orange-500 px-1.5 py-px text-[10px] font-bold text-white" title="Waiting for you">{mineOf(f.key)}</span>}</p>
            <p className={`text-[10px] ${stage === f.key ? 'text-white/80' : 'text-charcoal/45'}`}>{f.hint}</p>
          </button>
        ))}
      </div>
      {error && <div className="rounded-lg bg-[#8C3B2E]/8 px-3.5 py-3 text-sm text-[#8C3B2E]">{error}</div>}

      {loading && !data.items.length ? <p className="p-6 text-center text-sm text-charcoal/55">Loading...</p>
        : !data.items.length ? <div className="rounded-xl border border-dashed border-cardline bg-white p-8 text-center text-sm text-charcoal/55">No purchase orders here.</div>
          : <div className="grid gap-2 lg:grid-cols-2">{data.items.map((po) => <PurchaseOrderRow key={po.id} po={po} onOpen={open} />)}</div>}

      <CreatePurchaseOrderModal open={createOpen} onClose={() => setCreateOpen(false)} onCreated={(po) => { setCreateOpen(false); navigate(`/admin/purchase-orders/${po.id}`); }} />
    </div>
  );
}
