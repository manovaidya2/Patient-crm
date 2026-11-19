import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Pill } from 'lucide-react';
import useApiQuery from '../api/useApiQuery.js';
import Card from './ui/Card.jsx';
import { STAGE_LABELS } from '../constants/treatmentStages.js';

const shortDate = (value) => (value ? new Date(value).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '-');
const DELIVERY_TONE = { Delivered: 'text-sage', Dispatched: 'text-[#9C6B2E]' };

// Control Room: active patients by the LAST medicine that went to them (1 month, 45 days, 2 months, 6 months ...),
// with the phase. Older supplies of a patient are not counted.
export default function MedicineCategoriesCard() {
  const { data, loading } = useApiQuery('/patients/medicine-categories');
  const categories = data?.categories || [];
  const [selected, setSelected] = useState('');
  const [phase, setPhase] = useState('all');
  useEffect(() => { if (!selected && categories.length) setSelected(categories[0].key); }, [categories, selected]);
  const phases = useMemo(() => [...new Set(categories.flatMap((c) => c.patients.map((p) => p.phase)))].sort((a, b) => a - b), [categories]);
  const inPhase = (p) => phase === 'all' || String(p.phase) === phase;
  const current = categories.find((c) => c.key === selected) || categories[0];
  const rows = (current?.patients || []).filter(inPhase);

  return (
    <Card className="mt-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-sage-muted/25 text-sage"><Pill size={20} /></div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-charcoal/55">Medicine by category</p>
            <h2 className="mt-1 font-display text-xl font-bold text-charcoal">Last medicine sent to each patient</h2>
            <p className="mt-1 text-xs text-charcoal/55">Active patients, by how much medicine went in their latest supply. Older supplies are not counted.</p>
          </div>
        </div>
        <select aria-label="Phase" value={phase} onChange={(e) => setPhase(e.target.value)} className="rounded-md border border-cardline bg-offwhite-200 px-3 py-2 text-sm text-charcoal">
          <option value="all">All phases</option>
          {phases.map((n) => <option key={n} value={String(n)}>{STAGE_LABELS[n] || `Phase ${n}`}</option>)}
        </select>
      </div>

      {loading && !data ? (
        <div className="mt-5 rounded-lg border border-cardline bg-offwhite-200 p-5 text-sm text-charcoal/55">Loading medicine categories...</div>
      ) : !categories.length ? (
        <div className="mt-5 rounded-lg border border-cardline bg-offwhite-200 p-5 text-sm text-charcoal/55">No medicine has gone to an active patient yet.</div>
      ) : (
        <>
          <div className="mt-5 flex flex-wrap gap-2">
            {categories.map((c) => {
              const count = c.patients.filter(inPhase).length;
              const active = c.key === current?.key;
              return (
                <button key={c.key} type="button" onClick={() => setSelected(c.key)}
                  className={`rounded-lg border px-3 py-2 text-left transition ${active ? 'border-sage bg-sage text-white' : 'border-cardline bg-offwhite-200 text-charcoal hover:border-sage/50'}`}>
                  <span className="block text-xs font-semibold opacity-80">{c.label}</span>
                  <span className="block font-display text-xl font-bold">{count}</span>
                </button>
              );
            })}
          </div>

          <div className="mt-4 overflow-hidden rounded-lg border border-cardline bg-offwhite-100">
            <div className="hidden gap-x-4 border-b border-cardline-soft bg-offwhite-200 px-4 py-2 text-[11px] font-bold uppercase tracking-wide text-charcoal/55 sm:grid sm:grid-cols-[1.4fr_0.8fr_1.3fr_0.8fr_0.9fr_1fr]">
              <span>Patient</span><span>Phase</span><span>Supply</span><span>PO</span><span>Sent on</span><span>Status</span>
            </div>
            {!rows.length && <p className="px-4 py-4 text-sm text-charcoal/55">No patient in this category{phase === 'all' ? '' : ' for this phase'}.</p>}
            {rows.map((p) => (
              <div key={p.patientId} className="grid grid-cols-2 gap-2 border-b border-cardline-soft px-4 py-3 text-sm last:border-0 sm:grid-cols-[1.4fr_0.8fr_1.3fr_0.8fr_0.9fr_1fr] sm:gap-x-4">
                <Link to={`/admin/patients/${p.patientId}`} className="col-span-2 min-w-0 font-bold text-charcoal hover:text-sage sm:col-span-1">
                  <span className="block truncate">{p.patientName}</span>
                  <span className="block font-mono text-[11px] tracking-widest text-charcoal/45">{p.patientCode}</span>
                </Link>
                <span className="font-semibold text-charcoal">{STAGE_LABELS[p.phase] || `Phase ${p.phase}`}</span>
                <span className="text-charcoal/70">{p.supplyLabel || '-'}</span>
                <span className="font-mono text-xs text-charcoal/70">{p.poNumber || '-'}</span>
                <span className="text-charcoal/70">{shortDate(p.sentAt)}</span>
                <span className={`text-xs font-semibold ${DELIVERY_TONE[p.delivery] || 'text-charcoal/60'}`}>{p.delivery}{p.deliveryMode === 'self' ? ' (self pickup)' : ''}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </Card>
  );
}
