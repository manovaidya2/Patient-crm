import { useEffect, useRef, useState } from 'react';
import { Calendar, X } from 'lucide-react';

// One box for a date filter: pick a single day or a from-to range.
// value: '' | 'YYYY-MM-DD' | 'YYYY-MM-DD..YYYY-MM-DD'
const show = (d) => (d ? new Date(`${d}T00:00:00`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '');
const field = 'w-full rounded-lg border border-cardline bg-white px-3 py-2 text-sm text-charcoal focus:border-sage focus:outline-none focus:ring-2 focus:ring-sage/20';

export default function DateOrRangeFilter({ id, value, onChange, placeholder = 'Any date' }) {
  const [from, to = ''] = (value || '').split('..');
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState(to ? 'range' : 'single');
  const [draft, setDraft] = useState({ from, to });
  const box = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    setDraft({ from, to }); setMode(to ? 'range' : 'single');
    const away = (e) => { if (box.current && !box.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', away);
    return () => document.removeEventListener('mousedown', away);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const label = !from ? '' : to && to !== from ? `${show(from)} – ${show(to)}` : show(from);
  const apply = () => {
    if (mode === 'single') onChange(draft.from || '');
    else if (draft.from && draft.to) onChange(draft.from === draft.to ? draft.from : `${draft.from}..${draft.to}`);
    else onChange(draft.from || '');
    setOpen(false);
  };
  const rangeBad = mode === 'range' && draft.from && draft.to && draft.to < draft.from;
  const tab = (key, text) => (
    <button type="button" onClick={() => setMode(key)} className={`flex-1 rounded-md px-3 py-1.5 text-xs font-semibold transition ${mode === key ? 'bg-white text-charcoal shadow-sm' : 'text-charcoal/60 hover:text-charcoal'}`}>{text}</button>
  );

  return (
    <div ref={box} className="relative">
      <Calendar size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-charcoal/40" />
      <button id={id} type="button" onClick={() => setOpen((v) => !v)} className={`w-full truncate rounded-lg border border-cardline bg-offwhite-200 py-2.5 pl-9 pr-10 text-left text-sm transition focus:border-sage focus:outline-none focus:ring-2 focus:ring-sage/20 ${label ? 'text-charcoal' : 'text-charcoal/45'}`}>
        {label || placeholder}
      </button>
      {from && (
        <button type="button" onClick={() => onChange('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md p-1 text-charcoal/45 hover:bg-sage-muted/25 hover:text-charcoal" aria-label="Clear date filter">
          <X size={14} />
        </button>
      )}
      {open && (
        <div className="absolute left-0 top-full z-30 mt-1 w-72 max-w-[calc(100vw-2rem)] space-y-3 rounded-xl border border-cardline bg-white p-3 shadow-lg">
          <div className="flex gap-1 rounded-lg bg-offwhite-200 p-1">{tab('single', 'Single date')}{tab('range', 'Date range')}</div>
          {mode === 'single' ? (
            <label className="block text-xs font-semibold text-charcoal/60">Date<input type="date" className={`${field} mt-1`} value={draft.from} onChange={(e) => setDraft({ from: e.target.value, to: '' })} /></label>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <label className="block text-xs font-semibold text-charcoal/60">From<input type="date" className={`${field} mt-1 px-2`} value={draft.from} max={draft.to || undefined} onChange={(e) => setDraft((d) => ({ ...d, from: e.target.value }))} /></label>
              <label className="block text-xs font-semibold text-charcoal/60">To<input type="date" className={`${field} mt-1 px-2`} value={draft.to} min={draft.from || undefined} onChange={(e) => setDraft((d) => ({ ...d, to: e.target.value }))} /></label>
            </div>
          )}
          {rangeBad && <p className="text-xs text-[#8C3B2E]">"To" must be on or after "From".</p>}
          <div className="flex justify-between gap-2">
            <button type="button" onClick={() => { onChange(''); setOpen(false); }} className="rounded-md px-2 py-1.5 text-xs font-semibold text-charcoal/60 hover:text-charcoal">Clear</button>
            <button type="button" disabled={rangeBad || !draft.from} onClick={apply} className="rounded-lg bg-sage px-4 py-1.5 text-xs font-semibold text-white hover:bg-sage/90 disabled:opacity-50">Apply</button>
          </div>
        </div>
      )}
    </div>
  );
}
