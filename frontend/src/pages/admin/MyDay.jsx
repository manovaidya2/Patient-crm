import { useCallback, useEffect, useMemo, useState } from 'react';
import useStaleState from '../../hooks/useStaleState.js';
import { Link } from 'react-router-dom';
import { ArrowRight, CalendarClock, CheckCircle2, RefreshCw, Sun } from 'lucide-react';
import api from '../../api/axios.js';
import Button from '../../components/ui/Button.jsx';
import { PageHeader, Section } from '../../components/ui/Layout.jsx';
import { PAGES } from '../../components/PendingWork.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { isAdminLike } from '../../constants/roles.js';
import { TeamRoleCards, useTeamPending } from '../../components/TeamPending.jsx';

// Admin / Manager: what every role still has to do, on top of their own day.
function TeamAtAGlance() {
  const { data } = useTeamPending();
  if (!data?.roles?.length) return null;
  return (
    <Section title={`Team pending · ${data.total}`} action={<Link to="/admin/team-pending" className="text-xs font-semibold text-sage hover:underline">Open team pending</Link>}>
      <TeamRoleCards roles={data.roles} />
    </Section>
  );
}

import { BUCKETS, bucketOf, when } from '../../utils/taskTiming.js';
const greeting = () => { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'; };

// My day: every open task of this role, from the same rules as the orange counts, grouped by urgency.
export default function MyDay() {
  const { user } = useAuth();
  const [data, setData] = useStaleState('my-day', null);
  const [error, setError] = useState('');
  const [page, setPage] = useState('');
  const load = useCallback(async () => {
    try { const { data: d } = await api.get('/tasks/my-day', { skipCache: true }); setData(d); setError(''); }
    catch (err) { setError(err.response?.data?.message || 'Could not load your work'); }
  }, []);
  useEffect(() => { load(); const t = setInterval(load, 60000); return () => clearInterval(t); }, [load]);

  const sections = data?.sections || [];
  const total = sections.reduce((s, x) => s + x.count, 0);
  const items = useMemo(() => sections.filter((s) => !page || s.page === page).flatMap((s) => s.items), [sections, page]);
  const grouped = useMemo(() => BUCKETS.map(([key, label, tone]) => [key, label, tone, items.filter((i) => bucketOf(i) === key)]).filter(([, , , list]) => list.length), [items]);
  const dueToday = sections.flatMap((s) => s.items).filter((i) => ['today', 'overdue'].includes(bucketOf(i))).length;

  return (
    <div className="space-y-4">
      <PageHeader
        icon={Sun}
        eyebrow={new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}
        title={`${greeting()}, ${user?.name || ''}`}
        subtitle={data ? (total ? `${total} things are waiting on you · ${dueToday} need attention today` : 'Nothing is waiting on you right now.') : 'Loading your work...'}
        actions={<Button variant="outline" size="sm" onClick={load}><RefreshCw size={14} />Refresh</Button>}
      />
      {error && <p className="rounded-lg bg-[#8C3B2E]/8 px-3 py-2 text-sm text-[#8C3B2E]">{error}</p>}
      {isAdminLike(user) && <TeamAtAGlance />}

      {sections.length > 0 && (
        <section className="grid gap-2.5" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))' }} aria-label="Your work by page">
          {sections.map((s) => {
            const [label, hint] = PAGES[s.page] || [s.page, ''];
            const on = page === s.page;
            return (
              <button key={s.page} type="button" aria-pressed={on} onClick={() => setPage(on ? '' : s.page)} className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition hover:shadow-sm ${on ? 'border-charcoal bg-charcoal text-white' : 'border-[#FED7AA] bg-[#FFF7ED]'}`}>
                <span className={`flex h-10 min-w-10 items-center justify-center rounded-xl px-2 font-display text-lg font-extrabold ${on ? 'bg-white text-charcoal' : 'bg-[#F97316] text-white'}`}>{s.count > 99 ? '99+' : s.count}</span>
                <span className="min-w-0"><span className="block truncate text-[13px] font-bold">{label}</span><span className={`block truncate text-[11.5px] ${on ? 'text-white/75' : 'text-[#9A3412]'}`}>{hint}</span></span>
              </button>
            );
          })}
        </section>
      )}

      {data && !total && (
        <Section><p className="flex items-center gap-2 text-sm text-charcoal/70"><CheckCircle2 size={18} className="text-[#2F8F5B]" />All clear. New work shows up here by itself as soon as it reaches your role.</p></Section>
      )}

      {grouped.length > 0 && (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
          <Section title={page ? `${PAGES[page]?.[0] || page}` : 'Do next'} icon={CalendarClock} action={page && <button type="button" className="text-xs font-semibold text-sage hover:underline" onClick={() => setPage('')}>Show all</button>}>
            <div className="space-y-4">
              {grouped.map(([key, label, tone, list]) => (
                <div key={key}>
                  <p className="mb-1.5 flex items-center gap-2 text-[10.5px] font-bold uppercase tracking-wide text-charcoal/55">{label} <span className={`rounded-full px-2 py-0.5 text-[10.5px] ${tone}`}>{list.length}</span></p>
                  <ul className="divide-y divide-[#F0E8D8] rounded-xl border border-[#F0E8D8]">
                    {list.map((i) => (
                      <li key={i.key}>
                        <Link to={i.href} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-3 py-2.5 hover:bg-[#FBF7ED]">
                          <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[10.5px] font-bold ${tone}`}>{when(i) || label}</span>
                          <span className="min-w-0"><span className="block truncate text-[13px] font-bold text-charcoal">{i.title}</span><span className="block truncate text-[11.5px] text-charcoal/60">{PAGES[i.page]?.[0] ? `${PAGES[i.page][0]} · ` : ''}{i.detail}</span></span>
                          <span className="inline-flex items-center gap-1 rounded-lg border border-cardline bg-white px-2.5 py-1.5 text-xs font-bold text-charcoal">Open <ArrowRight size={13} /></span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </Section>
          <aside className="space-y-4">
            <Section title="Today at a glance">
              <ul className="space-y-2 text-[12.5px]">
                {BUCKETS.map(([key, label, tone]) => {
                  const n = sections.flatMap((s) => s.items).filter((i) => bucketOf(i) === key).length;
                  return <li key={key} className="flex items-center justify-between"><span className="text-charcoal/70">{label}</span><span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${tone}`}>{n}</span></li>;
                })}
              </ul>
              <p className="mt-3 text-[11.5px] text-charcoal/55">Lists show up to 25 per page; open the page for the full list.</p>
            </Section>
            <Section title="Pages">
              <ul className="space-y-1.5 text-[12.5px]">
                {sections.map((s) => <li key={s.page}><Link to={s.page} className="flex items-center justify-between rounded-lg px-2 py-1.5 hover:bg-[#FBF7ED]"><span className="font-semibold text-charcoal">{PAGES[s.page]?.[0] || s.page}</span><span className="rounded-full bg-[#F97316] px-2 py-0.5 text-[10.5px] font-bold text-white">{s.count}</span></Link></li>)}
              </ul>
            </Section>
          </aside>
        </div>
      )}
    </div>
  );
}
