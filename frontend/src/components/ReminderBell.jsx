import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AlarmClock, ExternalLink, RefreshCw, X } from 'lucide-react';
import api from '../api/axios.js';
import useLiveEvent from '../api/useLiveEvent.js';
import { PAGES } from './PendingWork.jsx';

import { BUCKETS, bucketOf, when } from '../utils/taskTiming.js';

// The signed-in person's own pending reminders (everything My Day lists for them), as a small panel that opens from
// the bell at the top right and closes on a click outside. The count on the bell is the number of items.
// `dark`: on the mobile top bar (dark background).
export default function ReminderBell({ dark = false }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const box = useRef(null);
  const load = useCallback(async () => {
    setLoading(true);
    try { const { data: d } = await api.get('/tasks/my-day', { skipCache: true }); setData(d); } catch { /* the bell just shows nothing new */ } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); const t = setInterval(load, 60000); return () => clearInterval(t); }, [load]);
  useLiveEvent('team-chat:changed', load);
  useLiveEvent('medicine-job:changed', load);
  useEffect(() => {
    if (!open) return undefined;
    const away = (e) => { if (box.current && !box.current.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', away); document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', esc); };
  }, [open]);
  const items = (data?.sections || []).flatMap((s) => s.items.map((i) => ({ ...i, pageLabel: PAGES[s.page]?.[0] || s.page })));
  const total = (data?.sections || []).reduce((n, s) => n + (s.count || 0), 0);
  const grouped = BUCKETS.map(([key, label, tone]) => [key, label, tone, items.filter((i) => bucketOf(i) === key)]).filter(([, , , list]) => list.length);
  const urgent = items.some((i) => bucketOf(i) === 'overdue');
  return (
    <div ref={box} className="relative z-40">
      <button type="button" aria-label={`Reminders${total ? `, ${total} pending` : ''}`} aria-expanded={open} title="My reminders" onClick={() => { setOpen((v) => !v); if (!open) load(); }}
        className={`relative flex h-9 w-9 items-center justify-center rounded-full ${dark ? `text-teal-100/90 hover:text-offwhite-100 ${open ? 'bg-teal-800' : ''}` : `shadow-md ring-1 ${open ? 'bg-charcoal text-white ring-charcoal' : 'bg-white text-charcoal ring-cardline hover:bg-[#FBF7ED]'}`}`}>
        <AlarmClock size={16} />
        {total > 0 && <span className={`absolute -right-1.5 -top-1.5 rounded-full px-1.5 text-[10px] font-bold leading-4 text-white ${urgent ? 'bg-[#9F1D1D]' : 'bg-[#F97316]'}`}>{total > 99 ? '99+' : total}</span>}
      </button>
      {open && (
        <section aria-label="My reminders" className="absolute right-0 top-11 w-[380px] max-w-[calc(100vw-24px)] overflow-hidden rounded-xl border border-cardline bg-white text-charcoal shadow-xl">
          <header className="flex items-center justify-between border-b border-cardline px-3 py-2">
            <strong className="flex items-center gap-2 text-sm"><AlarmClock size={15} className="text-sage" />My reminders <span className="rounded-full bg-offwhite-200 px-2 py-0.5 text-[11px] text-charcoal/65">{total}</span></strong>
            <span className="flex items-center gap-1">
              <button type="button" aria-label="Refresh" title="Refresh" onClick={load} className="rounded p-1 text-charcoal/60 hover:bg-offwhite-200"><RefreshCw size={14} className={loading ? 'animate-spin' : ''} /></button>
              <button type="button" aria-label="Close" onClick={() => setOpen(false)} className="rounded p-1 text-charcoal/60 hover:bg-offwhite-200"><X size={15} /></button>
            </span>
          </header>
          <div className="max-h-[70vh] overflow-y-auto">
            {!items.length && <p className="px-4 py-8 text-center text-sm text-charcoal/55">{loading ? 'Loading...' : 'Nothing pending for you right now.'}</p>}
            {grouped.map(([key, label, tone, list]) => (
              <div key={key} className="border-b border-cardline last:border-b-0">
                <p className="flex items-center gap-2 bg-[#FBF7ED] px-3 py-1.5 text-[10.5px] font-bold uppercase tracking-wide text-charcoal/55">{label}<span className={`rounded-full px-1.5 py-0.5 ${tone}`}>{list.length}</span></p>
                <ul className="divide-y divide-cardline">
                  {list.map((i) => (
                    <li key={i.key}>
                      <button type="button" onClick={() => { setOpen(false); navigate(i.href); }} className="block w-full px-3 py-2 text-left hover:bg-[#F3F6F2]">
                        <p className="flex items-start justify-between gap-2"><span className="min-w-0 truncate text-sm font-semibold text-charcoal">{i.title}</span><span className={`shrink-0 whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-bold ${tone}`}>{when(i) || label}</span></p>
                        <p className="truncate text-xs text-charcoal/60">{i.detail}</p>
                        <p className="text-[10.5px] text-charcoal/45">{i.pageLabel}</p>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <footer className="border-t border-cardline px-3 py-2 text-right"><Link to="/admin/my-day" onClick={() => setOpen(false)} className="inline-flex items-center gap-1 text-xs font-semibold text-sage hover:underline"><ExternalLink size={12} />Open My day</Link></footer>
        </section>
      )}
    </div>
  );
}
