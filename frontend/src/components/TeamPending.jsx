import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ExternalLink, RefreshCw, Users, X } from 'lucide-react';
import api from '../api/axios.js';
import { bucketOf } from '../utils/taskTiming.js';

// Every role's open work for the Admin / Manager (GET /tasks/team). The server builds it in the background and
// answers from its last copy, so this never slows a page: one shared request for all users of the hook on the page,
// started only after the page has loaded, repeated every 2 minutes while the tab is visible.
// `full`: with the item lists (Team pending page); otherwise just the totals (top button, My day).
const POLL_MS = 2 * 60 * 1000;
const START_DELAY_MS = 3000;
const stores = {};
const storeOf = (full) => {
  const key = full ? 'full' : 'summary';
  if (!stores[key]) {
    const st = { data: null, loading: false, error: '', subs: new Set(), timer: null, inFlight: null, at: 0 };
    const emit = () => st.subs.forEach((fn) => fn({ data: st.data, loading: st.loading, error: st.error }));
    st.load = (fresh = false) => {
      if (st.inFlight && !fresh) return st.inFlight;
      st.loading = true; emit();
      st.inFlight = api.get('/tasks/team', { skipCache: true, params: { ...(full ? {} : { summary: 1 }), ...(fresh ? { fresh: 1 } : {}) } })
        .then(({ data: d }) => {
          st.data = d.roles?.length || !st.data ? d : { ...st.data, building: d.building };
          st.error = ''; st.at = Date.now();
          // The first copy is still being made on the server: ask again shortly.
          if (d.building && !d.roles?.length) setTimeout(() => st.load(), 15000);
        })
        .catch((err) => { st.error = err.response?.data?.message || 'Could not load the team work'; })
        .finally(() => { st.loading = false; st.inFlight = null; emit(); });
      return st.inFlight;
    };
    st.start = () => {
      if (st.timer) return;
      const tick = () => { if (document.visibilityState === 'visible' && Date.now() - st.at >= POLL_MS - 1000) st.load(); };
      const first = () => (window.requestIdleCallback ? window.requestIdleCallback(() => st.load(), { timeout: 5000 }) : st.load());
      st.timer = setInterval(tick, POLL_MS);
      if (!st.data) setTimeout(first, START_DELAY_MS);
      document.addEventListener('visibilitychange', tick);
      st.stop = () => { clearInterval(st.timer); st.timer = null; document.removeEventListener('visibilitychange', tick); };
    };
    stores[key] = st;
  }
  return stores[key];
};

export function useTeamPending({ full = false } = {}) {
  const st = storeOf(full);
  const [state, setState] = useState({ data: st.data, loading: st.loading, error: st.error });
  useEffect(() => {
    st.subs.add(setState); st.start();
    return () => { st.subs.delete(setState); if (!st.subs.size) st.stop?.(); };
  }, [st]);
  const load = useCallback((fresh = false) => st.load(fresh), [st]);
  return { ...state, load };
}

export const overdueOf = (role) => role.overdue ?? role.sections.reduce((n, s) => n + (s.items || []).filter((i) => bucketOf(i) === 'overdue').length, 0);

// One card per role: how much is pending, how much is overdue, and the people with personal work.
export function TeamRoleCards({ roles, selected, onSelect }) {
  return (
    <section className="grid gap-2.5" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }} aria-label="Pending work by role">
      {roles.map((r) => {
        const on = selected === r.role;
        const late = overdueOf(r);
        const busy = r.people.filter((p) => p.personal > 0);
        const Tag = onSelect ? 'button' : Link;
        const props = onSelect ? { type: 'button', onClick: () => onSelect(on ? '' : r.role), 'aria-pressed': on } : { to: `/admin/team-pending?role=${r.role}` };
        return (
          <Tag key={r.role} {...props} className={`flex flex-col gap-1 rounded-xl border px-3 py-2.5 text-left transition hover:shadow-sm ${on ? 'border-charcoal bg-charcoal text-white' : r.total ? 'border-[#FED7AA] bg-[#FFF7ED]' : 'border-cardline bg-white'}`}>
            <span className="flex items-center justify-between gap-2">
              <span className="truncate text-[13px] font-bold">{r.label}</span>
              <span className={`rounded-lg px-2 font-display text-lg font-extrabold ${on ? 'bg-white text-charcoal' : r.total ? 'bg-[#F97316] text-white' : 'bg-[#E9EFE9] text-sage'}`}>{r.total}</span>
            </span>
            <span className={`text-[11.5px] ${on ? 'text-white/75' : 'text-charcoal/60'}`}>
              {r.total ? `${late ? `${late} overdue · ` : ''}${r.sections.length} page${r.sections.length === 1 ? '' : 's'}` : 'All clear'}
              {busy.length ? ` · ${busy.map((p) => `${p.name} ${p.personal}`).join(', ')}` : ''}
            </span>
          </Tag>
        );
      })}
    </section>
  );
}

// Top-right button (Admin / Manager) on every page: the team's pending work by role, one click away.
export function TeamPendingButton({ dark = false }) {
  const navigate = useNavigate();
  const { data, loading, load } = useTeamPending();
  const [open, setOpen] = useState(false);
  const box = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const away = (e) => { if (box.current && !box.current.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', away); document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', esc); };
  }, [open]);
  const roles = data?.roles || [];
  const total = data?.total || 0;
  return (
    <div ref={box} className="relative z-40">
      <button type="button" aria-label={`Team pending work${total ? `, ${total}` : ''}`} aria-expanded={open} title="Team pending work" onClick={() => setOpen((v) => !v)}
        className={`relative flex h-9 w-9 items-center justify-center rounded-full ${dark ? `text-teal-100/90 hover:text-offwhite-100 ${open ? 'bg-teal-800' : ''}` : `shadow-md ring-1 ${open ? 'bg-charcoal text-white ring-charcoal' : 'bg-white text-charcoal ring-cardline hover:bg-[#FBF7ED]'}`}`}>
        <Users size={16} />
        {total > 0 && <span className="absolute -right-1.5 -top-1.5 rounded-full bg-[#2563EB] px-1.5 text-[10px] font-bold leading-4 text-white">{total > 999 ? '999+' : total}</span>}
      </button>
      {open && (
        <section aria-label="Team pending work" className="absolute right-0 top-11 w-[360px] max-w-[calc(100vw-24px)] overflow-hidden rounded-xl border border-cardline bg-white text-charcoal shadow-xl">
          <header className="flex items-center justify-between border-b border-cardline px-3 py-2">
            <strong className="flex items-center gap-2 text-sm"><Users size={15} className="text-sage" />Team pending <span className="rounded-full bg-offwhite-200 px-2 py-0.5 text-[11px] text-charcoal/65">{total}</span></strong>
            <span className="flex items-center gap-1">
              <button type="button" aria-label="Refresh" title="Refresh" onClick={() => load(true)} className="rounded p-1 text-charcoal/60 hover:bg-offwhite-200"><RefreshCw size={14} className={loading ? 'animate-spin' : ''} /></button>
              <button type="button" aria-label="Close" onClick={() => setOpen(false)} className="rounded p-1 text-charcoal/60 hover:bg-offwhite-200"><X size={15} /></button>
            </span>
          </header>
          <ul className="max-h-[70vh] divide-y divide-cardline overflow-y-auto">
            {!roles.length && <li className="px-4 py-8 text-center text-sm text-charcoal/55">{loading ? 'Loading...' : 'No team work found.'}</li>}
            {roles.map((r) => {
              const late = overdueOf(r);
              return (
                <li key={r.role}>
                  <button type="button" onClick={() => { setOpen(false); navigate(`/admin/team-pending?role=${r.role}`); }} className="block w-full px-3 py-2 text-left hover:bg-[#F3F6F2]">
                    <p className="flex items-center justify-between gap-2"><span className="text-sm font-semibold">{r.label}</span><span className="flex items-center gap-1">{late > 0 && <span className="rounded-full bg-[#FDE2E1] px-2 py-0.5 text-[10px] font-bold text-[#9F1D1D]">{late} overdue</span>}<span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${r.total ? 'bg-[#F97316] text-white' : 'bg-[#E9EFE9] text-sage'}`}>{r.total}</span></span></p>
                    <p className="truncate text-xs text-charcoal/60">{r.total ? r.sections.map((s) => `${s.page.replace('/admin/', '').replace(/[-/]/g, ' ')} ${s.count}`).join(' · ') : 'All clear'}</p>
                  </button>
                </li>
              );
            })}
          </ul>
          <footer className="border-t border-cardline px-3 py-2 text-right"><Link to="/admin/team-pending" onClick={() => setOpen(false)} className="inline-flex items-center gap-1 text-xs font-semibold text-sage hover:underline"><ExternalLink size={12} />Open team pending</Link></footer>
        </section>
      )}
    </div>
  );
}
