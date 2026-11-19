import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Pill } from 'lucide-react';
import useApiQuery from '../api/useApiQuery.js';
import Card from './ui/Card.jsx';
import { STAGE_LABELS } from '../constants/treatmentStages.js';

const shortDate = (value) => (value ? new Date(value).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '-');
const STATUS_TONE = { Delivered: 'text-sage', Dispatched: 'text-[#9C6B2E]' };
const selectClass = 'rounded-md border border-cardline bg-offwhite-200 px-3 py-2 text-sm text-charcoal';
// The date of a row: when its medicine went, else when it was requested.
const rowDate = (p) => p.sentAt || p.requestedAt || null;
// A yyyy-mm-dd of the browser's own day (the date inputs speak in local days).
const localDay = (value) => { const d = new Date(value); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

// Control Room: active patients by their LATEST medicine (requested, being made or gone) - 1 month, 45 days, 2 months,
// 6 months ... - with the phase and where the medicine is now. Older supplies of a patient are not counted.
export default function MedicineCategoriesCard({ className = '' }) {
  const { data, loading } = useApiQuery('/patients/medicine-categories');
  const categories = data?.categories || [];
  const [selected, setSelected] = useState('');
  const [phase, setPhase] = useState('all');
  const [state, setState] = useState('all');
  // No date filter by default (all dates); a range only when someone sets one.
  const [dateMode, setDateMode] = useState('all');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  useEffect(() => { if (!selected && categories.length) setSelected(categories[0].key); }, [categories, selected]);
  const phases = useMemo(() => [...new Set(categories.flatMap((c) => c.patients.map((p) => p.phase)))].sort((a, b) => a - b), [categories]);
  const inDates = (p) => {
    if (dateMode !== 'range') return true;
    const at = rowDate(p);
    if (!at) return false;
    const day = localDay(at);
    return (!from || day >= from) && (!to || day <= to);
  };
  const shown = (p) => (phase === 'all' || String(p.phase) === phase) && (state === 'all' || (state === 'gone') === p.gone) && inDates(p);
  // The period the list covers: the oldest and newest date of what is shown.
  const period = useMemo(() => {
    const days = categories.flatMap((c) => c.patients.filter(shown).map(rowDate)).filter(Boolean).map((d) => new Date(d).getTime());
    return days.length ? { from: Math.min(...days), to: Math.max(...days) } : null;
  }, [categories, phase, state, dateMode, from, to]); // eslint-disable-line react-hooks/exhaustive-deps
  const current = categories.find((c) => c.key === selected) || categories[0];
  // Newest on top: a new supply or one just sent comes first.
  const rows = (current?.patients || []).filter(shown).sort((a, b) => new Date(rowDate(b) || 0) - new Date(rowDate(a) || 0));

  return (
    <Card className={className}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-sage-muted/25 text-sage"><Pill size={20} /></div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-charcoal/55">Medicine by category</p>
            <h2 className="mt-1 font-display text-xl font-bold text-charcoal">Latest medicine of each patient</h2>
            <p className="mt-1 text-xs text-charcoal/55">Active patients by how much medicine their latest supply is - requested, being made or sent. Older supplies are not counted.</p>
            <p className="mt-1.5 inline-flex rounded-md bg-offwhite-200 px-2 py-1 text-xs font-semibold text-charcoal/75">
              {!period ? 'No medicine in this period' : `${dateMode === 'range' ? 'Filtered' : 'All dates'}: ${shortDate(period.from)} to ${shortDate(period.to)}`}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:justify-end">
          <select aria-label="Medicine status" value={state} onChange={(e) => setState(e.target.value)} className={selectClass}>
            <option value="all">Sent and not yet sent</option>
            <option value="gone">Sent</option>
            <option value="making">Not yet sent</option>
          </select>
          <select aria-label="Date filter" value={dateMode} onChange={(e) => setDateMode(e.target.value)} className={selectClass}>
            <option value="all">All dates</option>
            <option value="range">Select dates</option>
          </select>
          {dateMode === 'range' && <>
            <label className="flex items-center gap-1 text-xs text-charcoal/60">From<input type="date" aria-label="From date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} className={selectClass} /></label>
            <label className="flex items-center gap-1 text-xs text-charcoal/60">To<input type="date" aria-label="To date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} className={selectClass} /></label>
          </>}
          <select aria-label="Phase" value={phase} onChange={(e) => setPhase(e.target.value)} className={selectClass}>
            <option value="all">All phases</option>
            {phases.map((n) => <option key={n} value={String(n)}>{STAGE_LABELS[n] || `Phase ${n}`}</option>)}
          </select>
        </div>
      </div>

      {loading && !data ? (
        <div className="mt-5 rounded-lg border border-cardline bg-offwhite-200 p-5 text-sm text-charcoal/55">Loading medicine categories...</div>
      ) : !categories.length ? (
        <div className="mt-5 rounded-lg border border-cardline bg-offwhite-200 p-5 text-sm text-charcoal/55">No active patient has a medicine request yet.</div>
      ) : (
        <>
          <div className="mt-5 flex flex-wrap gap-2">
            {categories.map((c) => {
              const list = c.patients.filter(shown);
              const gone = list.filter((p) => p.gone).length;
              const active = c.key === current?.key;
              return (
                <button key={c.key} type="button" onClick={() => setSelected(c.key)}
                  className={`rounded-lg border px-3 py-2 text-left transition ${active ? 'border-sage bg-sage text-white' : 'border-cardline bg-offwhite-200 text-charcoal hover:border-sage/50'}`}>
                  <span className="block text-xs font-semibold opacity-80">{c.label}</span>
                  <span className="block font-display text-xl font-bold">{list.length}</span>
                  {state === 'all' && <span className="block text-[10.5px] opacity-75">{gone} sent · {list.length - gone} not yet</span>}
                </button>
              );
            })}
          </div>

          <div className="mt-4 overflow-hidden rounded-lg border border-cardline bg-offwhite-100">
            <div className="hidden gap-x-4 border-b border-cardline-soft bg-offwhite-200 px-4 py-2 text-[11px] font-bold uppercase tracking-wide text-charcoal/55 sm:grid sm:grid-cols-[1.4fr_0.8fr_1.3fr_0.8fr_0.9fr_1.2fr]">
              <span>Patient</span><span>Phase</span><span>Supply</span><span>PO</span><span>Date</span><span>Status</span>
            </div>
            {!rows.length && <p className="px-4 py-4 text-sm text-charcoal/55">No patient in this category for this filter.</p>}
            {rows.map((p) => (
              <div key={p.patientId} className="grid grid-cols-2 gap-2 border-b border-cardline-soft px-4 py-3 text-sm last:border-0 sm:grid-cols-[1.4fr_0.8fr_1.3fr_0.8fr_0.9fr_1.2fr] sm:gap-x-4">
                <Link to={`/admin/patients/${p.patientId}`} className="col-span-2 min-w-0 font-bold text-charcoal hover:text-sage sm:col-span-1">
                  <span className="block truncate">{p.patientName}</span>
                  <span className="block font-mono text-[11px] tracking-widest text-charcoal/45">{p.patientCode}</span>
                </Link>
                <span className="font-semibold text-charcoal">{STAGE_LABELS[p.phase] || `Phase ${p.phase}`}</span>
                <span className="text-charcoal/70">{p.supplyLabel || '-'}</span>
                <span className="font-mono text-xs text-charcoal/70">{p.poNumber || '-'}</span>
                <span className="text-charcoal/70">{p.gone ? <>Sent {shortDate(p.sentAt)}</> : <>Requested {shortDate(p.requestedAt)}</>}</span>
                <span className={`text-xs font-semibold ${STATUS_TONE[p.status] || (p.gone ? 'text-charcoal/60' : 'text-[#9C6B2E]')}`}>{p.status}{p.gone && p.deliveryMode === 'self' ? ' (self pickup)' : ''}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </Card>
  );
}
