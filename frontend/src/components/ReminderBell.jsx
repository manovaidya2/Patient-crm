import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AlarmClock, ExternalLink, RefreshCw, X } from 'lucide-react';
import api from '../api/axios.js';
import useLiveEvent from '../api/useLiveEvent.js';
import { PAGES } from './PendingWork.jsx';

import { BUCKETS, TONE, bucketOf, when } from '../utils/taskTiming.js';
import { playChime } from '../utils/chime.js';

// The reminder sound, shared by the bells (mobile and desktop): a single ding when the page opens with work pending
// (not one per pending reminder), one ding the moment new reminders arrive (live), and one again every 30 minutes while
// any is left.
// The sound never plays alone: with it the reminders show on screen as a stack of cards at the top right (on every
// bell, so the visible one shows it) - all pending ones on opening, then each new one - and are marked "New" in the list.
const RING_EVENT = 'reminders:ring';
const REPEAT_MS = 30 * 60 * 1000;
let seenKeys = null;
let lastRemindAt = 0;
const ORDER = Object.fromEntries(BUCKETS.map(([key], i) => [key, i]));
const soundFor = (list) => {
  const keys = list.map((i) => i.key);
  const before = seenKeys || new Set();
  const newOnes = seenKeys === null ? keys.length : keys.filter((k) => !seenKeys.has(k)).length;
  const repeat = keys.length > 0 && Date.now() - lastRemindAt >= REPEAT_MS;
  seenKeys = new Set(keys);
  const fresh = before.size === 0 || repeat ? keys : keys.filter((k) => !before.has(k));
  // The cards show at once; the browser may hold the ding itself until the page is first clicked.
  const freshSet = new Set(fresh);
  const cards = list.filter((i) => freshSet.has(i.key)).sort((a, b) => ORDER[bucketOf(a)] - ORDER[bucketOf(b)]);
  const show = () => window.dispatchEvent(new CustomEvent(RING_EVENT, { detail: cards }));
  if (repeat || newOnes > 0) { lastRemindAt = Date.now(); playChime(1); show(); }
};

// The signed-in person's own pending reminders (everything My Day lists for them), as a small panel that opens from
// the bell at the top right and closes on a click outside. The count on the bell is the number of items.
// `dark`: on the mobile top bar (dark background).
// The reminder cards at the top right: the first card in full, up to two more peeking out behind it. Each card has
// Open (go to the work) and Later (next card); "Remove all" clears the stack and "See all" opens the bell's list.
function ReminderStack({ cards, pageLabelOf, onOpen, onLater, onRemoveAll, onSeeAll }) {
  const top = cards[0];
  const tone = TONE[bucketOf(top)];
  const behind = Math.min(cards.length - 1, 2);
  return (
    <div role="alert" aria-label="New reminders" className="fixed right-3 top-16 z-[60] w-[360px] max-w-[calc(100vw-24px)] md:right-8 md:top-14" style={{ paddingBottom: behind * 8 }}>
      {Array.from({ length: behind }, (_, i) => (
        <div key={i} aria-hidden="true" className="absolute inset-x-0 top-0 h-full rounded-xl border border-cardline bg-[#FBF7ED] shadow-md"
          style={{ transform: `translateY(${(i + 1) * 8}px) scale(${1 - (i + 1) * 0.04})`, zIndex: -1 - i }} />
      ))}
      <section className="relative rounded-xl border border-cardline bg-white p-3 text-charcoal shadow-xl">
        <p className="flex items-center justify-between gap-2 text-[11px] font-bold uppercase tracking-wide text-charcoal/55">
          <span className="flex items-center gap-1.5"><AlarmClock size={13} className="text-sage" />Reminder{cards.length > 1 ? ` 1 of ${cards.length}` : ''}</span>
          <span className={`rounded-full px-2 py-0.5 normal-case ${tone}`}>{when(top) || 'pending'}</span>
        </p>
        <p className="mt-1.5 truncate text-sm font-bold">{top.title}</p>
        <p className="truncate text-xs text-charcoal/65">{top.detail}</p>
        <p className="text-[10.5px] text-charcoal/45">{pageLabelOf(top)}</p>
        <div className="mt-2.5 flex items-center justify-between gap-2">
          <span className="flex gap-1">
            <button type="button" onClick={onRemoveAll} className="rounded-lg px-2 py-1.5 text-xs font-semibold text-charcoal/60 hover:bg-offwhite-200">Remove all</button>
            <button type="button" onClick={onSeeAll} className="rounded-lg px-2 py-1.5 text-xs font-semibold text-sage hover:bg-[#F3F6F2]">See all</button>
          </span>
          <span className="flex gap-1">
            <button type="button" onClick={() => onLater(top)} className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-charcoal/70 hover:bg-offwhite-200">{cards.length > 1 ? 'Next' : 'Later'}</button>
            <button type="button" onClick={() => onOpen(top)} className="rounded-lg bg-charcoal px-3 py-1.5 text-xs font-bold text-white hover:bg-charcoal/85">Open</button>
          </span>
        </div>
      </section>
    </div>
  );
}

export default function ReminderBell({ dark = false }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [fresh, setFresh] = useState(() => new Set());
  // The cards on screen (top right, one over the other); new ones go on top of what is still showing.
  const [stack, setStack] = useState([]);
  const box = useRef(null);
  useEffect(() => {
    const ring = (e) => {
      const cards = e.detail || [];
      setFresh(new Set(cards.map((i) => i.key)));
      setStack((prev) => [...cards, ...prev.filter((p) => !cards.some((c) => c.key === p.key))]);
    };
    window.addEventListener(RING_EVENT, ring);
    return () => window.removeEventListener(RING_EVENT, ring);
  }, []);
  const load = useCallback(async () => {
    setLoading(true);
    try { const { data: d } = await api.get('/tasks/my-day', { skipCache: true }); setData(d); } catch { /* the bell just shows nothing new */ } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); const t = setInterval(load, 60000); return () => clearInterval(t); }, [load]);
  // Any save that changes someone's pending work (the server says so once its lists are fresh): reload at once.
  useLiveEvent('tasks:changed', load);
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
  useEffect(() => { if (data) soundFor(items); }, [data]); // eslint-disable-line react-hooks/exhaustive-deps
  // Cards whose work is done leave the stack by themselves.
  useEffect(() => { if (data) setStack((prev) => prev.filter((c) => items.some((i) => i.key === c.key))); }, [data]); // eslint-disable-line react-hooks/exhaustive-deps
  const dropCard = (key) => setStack((prev) => prev.filter((c) => c.key !== key));
  const seeAll = () => { setStack([]); setOpen(true); load(); };
  return (
    <div ref={box} className="relative z-40">
      <button type="button" aria-label={`Reminders${total ? `, ${total} pending` : ''}`} aria-expanded={open} title="My reminders" onClick={() => { setOpen((v) => !v); if (!open) load(); }}
        className={`relative flex h-9 w-9 items-center justify-center rounded-full ${dark ? `text-teal-100/90 hover:text-offwhite-100 ${open ? 'bg-teal-800' : ''}` : `shadow-md ring-1 ${open ? 'bg-charcoal text-white ring-charcoal' : 'bg-white text-charcoal ring-cardline hover:bg-[#FBF7ED]'}`}`}>
        <AlarmClock size={16} />
        {total > 0 && <span className={`absolute -right-1.5 -top-1.5 rounded-full px-1.5 text-[10px] font-bold leading-4 text-white ${urgent ? 'bg-[#9F1D1D]' : 'bg-[#F97316]'}`}>{total > 99 ? '99+' : total}</span>}
      </button>
      {stack.length > 0 && !open && <ReminderStack cards={stack} pageLabelOf={(c) => PAGES[c.page]?.[0] || c.page}
        onOpen={(c) => { dropCard(c.key); navigate(c.href); }} onLater={(c) => dropCard(c.key)} onRemoveAll={() => setStack([])} onSeeAll={seeAll} />}
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
                        <p className="flex items-start justify-between gap-2"><span className="min-w-0 truncate text-sm font-semibold text-charcoal">{fresh.has(i.key) && <span className="mr-1.5 rounded bg-[#F97316] px-1 py-0.5 text-[9.5px] font-bold uppercase text-white">New</span>}{i.title}</span><span className={`shrink-0 whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-bold ${tone}`}>{when(i) || label}</span></p>
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
