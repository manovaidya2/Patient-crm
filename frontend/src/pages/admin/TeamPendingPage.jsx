import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowRight, CheckCircle2, RefreshCw, User, Users } from 'lucide-react';
import Button from '../../components/ui/Button.jsx';
import { PageHeader, Section } from '../../components/ui/Layout.jsx';
import { PAGES } from '../../components/PendingWork.jsx';
import { TeamRoleCards, useTeamPending } from '../../components/TeamPending.jsx';
import { BUCKETS, TONE, bucketOf, when } from '../../utils/taskTiming.js';

// Team pending (Admin / Manager): what every role still has to do, page by page, and whose it is.
export default function TeamPendingPage() {
  const { data, loading, error, load } = useTeamPending();
  const [params, setParams] = useSearchParams();
  const roles = data?.roles || [];
  const roleKey = params.get('role') || roles.find((r) => r.total)?.role || '';
  const person = params.get('person') || '';
  const role = roles.find((r) => r.role === roleKey);
  const set = (next) => setParams(Object.fromEntries(Object.entries({ role: roleKey, person, ...next }).filter(([, v]) => v)), { replace: true });

  // With a person picked: only their personal lists, plus the role's shared lists (anyone in the role can do those).
  const sections = useMemo(() => (role?.sections || []).map((s) => (person && !s.shared ? { ...s, items: s.items.filter((i) => i.people.includes(person)), count: s.byPerson?.find((p) => p.name === person)?.count || 0 } : s)).filter((s) => s.count || s.items.length), [role, person]);
  const counts = useMemo(() => Object.fromEntries(BUCKETS.map(([key]) => [key, sections.reduce((n, s) => n + s.items.filter((i) => bucketOf(i) === key).length, 0)])), [sections]);

  return (
    <div className="space-y-4">
      <PageHeader
        icon={Users}
        eyebrow="Admin · Manager"
        title="Team pending work"
        subtitle={data ? `${data.total} open items across the team · updated ${new Date(data.at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}` : 'Loading the team work...'}
        actions={<Button variant="outline" size="sm" onClick={() => load(true)} disabled={loading}><RefreshCw size={14} className={loading ? 'animate-spin' : ''} />Refresh</Button>}
      />
      {error && <p className="rounded-lg bg-[#8C3B2E]/8 px-3 py-2 text-sm text-[#8C3B2E]">{error}</p>}
      {roles.length > 0 && <TeamRoleCards roles={roles} selected={roleKey} onSelect={(r) => set({ role: r, person: '' })} />}

      {role && (
        <Section title={`${role.label} · ${role.total} pending`} icon={Users}>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-bold uppercase tracking-wide text-charcoal/50">People</span>
            <button type="button" onClick={() => set({ person: '' })} className={`rounded-full border px-3 py-1 text-xs font-semibold ${!person ? 'border-charcoal bg-charcoal text-white' : 'border-cardline bg-white text-charcoal/70'}`}>Everyone</button>
            {role.people.map((p) => (
              <button key={p.id} type="button" onClick={() => set({ person: person === p.name ? '' : p.name })} className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold ${person === p.name ? 'border-charcoal bg-charcoal text-white' : 'border-cardline bg-white text-charcoal/70'}`}>
                <User size={12} />{p.name}{p.personal > 0 && <span className={`rounded-full px-1.5 text-[10px] font-bold ${person === p.name ? 'bg-white text-charcoal' : 'bg-[#F97316] text-white'}`}>{p.personal}</span>}
              </button>
            ))}
          </div>
          <div className="mb-4 flex flex-wrap gap-2 text-[11.5px]">
            {BUCKETS.map(([key, label, tone]) => <span key={key} className={`rounded-full px-2.5 py-0.5 font-bold ${tone}`}>{label}: {counts[key]}</span>)}
          </div>

          {!sections.length && <p className="flex items-center gap-2 text-sm text-charcoal/70"><CheckCircle2 size={18} className="text-[#2F8F5B]" />Nothing pending{person ? ` for ${person}` : ''}.</p>}
          <div className="space-y-5">
            {sections.map((s) => (
              <div key={s.page}>
                <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-bold text-charcoal">
                    {PAGES[s.page]?.[0] || s.page}
                    <span className="rounded-full bg-[#F97316] px-2 py-0.5 text-[11px] text-white">{s.count}</span>
                    <span className="text-[11.5px] font-normal text-charcoal/55">{s.shared ? `Anyone in ${role.label}` : (s.byPerson || []).map((p) => `${p.name} ${p.count}`).join(' · ')}</span>
                  </p>
                  <Link to={s.page} className="text-xs font-semibold text-sage hover:underline">Open page</Link>
                </div>
                <ul className="divide-y divide-[#F0E8D8] rounded-xl border border-[#F0E8D8]">
                  {s.items.map((i) => {
                    const bucket = bucketOf(i);
                    return (
                      <li key={i.key}>
                        <Link to={i.href} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-3 py-2.5 hover:bg-[#FBF7ED]">
                          <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[10.5px] font-bold ${TONE[bucket]}`}>{when(i) || BUCKETS.find(([k]) => k === bucket)[1]}</span>
                          <span className="min-w-0">
                            <span className="block truncate text-[13px] font-bold text-charcoal">{i.title}</span>
                            <span className="block truncate text-[11.5px] text-charcoal/60">{i.detail}</span>
                            {i.people?.length > 0 && <span className="block truncate text-[11px] font-semibold text-[#9A3412]">With {i.people.join(', ')}</span>}
                          </span>
                          <span className="inline-flex items-center gap-1 rounded-lg border border-cardline bg-white px-2.5 py-1.5 text-xs font-bold text-charcoal">Open <ArrowRight size={13} /></span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
                {s.count > s.items.length && <p className="mt-1 text-[11.5px] text-charcoal/55">Showing the first {s.items.length} of {s.count}. <Link to={s.page} className="font-semibold text-sage hover:underline">Open the page</Link> for all.</p>}
              </div>
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}
