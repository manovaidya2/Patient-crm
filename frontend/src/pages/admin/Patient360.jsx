import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Contact, Search } from 'lucide-react';
import useApiQuery from '../../api/useApiQuery.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { PageHeader } from '../../components/ui/Layout.jsx';

const money = (n) => (n ? `₹${Number(n).toLocaleString('en-IN')}` : '0');
const dayYear = (d) => (d ? new Date(`${d}T00:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit', timeZone: 'UTC' }) : '—');
// Medicine stage -> chip (a label always goes with the colour).
const MEDICINE = {
  Started: 'bg-[#DCF0E3] text-[#166534]', Delivered: 'bg-[#E6EEF8] text-[#24476F]', Dispatched: 'bg-[#E6EEF8] text-[#24476F]', Released: 'bg-[#EEF3F0] text-[#1F4F3D]',
  Ready: 'bg-[#EEF3F0] text-[#1F4F3D]', Preparing: 'bg-[#FFF7E8] text-[#7A4A06]', Requested: 'bg-[#FFF7E8] text-[#7A4A06]', 'Not requested': 'bg-charcoal/[0.07] text-charcoal/60',
};
const CATEGORIES = [['', 'All'], ['autism_adhd', 'Autism/ADHD'], ['mental_health', 'Mental Health'], ['other', 'Other']];
const SORTS = [['name', 'Name'], ['next', 'Next session'], ['due', 'Due (highest)'], ['ends', 'Phase ends']];
const select = 'rounded-lg border border-cardline bg-white px-2.5 py-1.5 text-[13px] text-charcoal';

function Tile({ label, value, hint, tone = '' }) {
  return (
    <div className="rounded-xl border border-cardline bg-white px-3.5 py-2.5">
      <p className="text-[11.5px] font-semibold text-charcoal/55">{label}</p>
      <p className={`font-display text-xl font-bold ${tone || 'text-charcoal'}`}>{value}</p>
      {hint && <p className="text-[11px] text-charcoal/45">{hint}</p>}
    </div>
  );
}

// Sheet look (like the lead sheets the team knows): a line around every cell, one line per patient, light pills.
const CATEGORY_PILL = { autism_adhd: 'bg-[#FFF1DC] text-[#8A5300]', mental_health: 'bg-[#EAF0FF] text-[#2F4A8A]', other: 'bg-charcoal/[0.07] text-charcoal/70' };
const AVATAR = ['bg-[#E8E4F7] text-[#4B3F8F]', 'bg-[#E3F1EC] text-[#1F5F4A]', 'bg-[#FBE9E2] text-[#8A3E22]', 'bg-[#E6EEF8] text-[#24476F]', 'bg-[#F7F0DA] text-[#7A5A06]'];
const initials = (name) => String(name || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
const avatarOf = (name) => AVATAR[[...String(name || '')].reduce((n, ch) => n + ch.charCodeAt(0), 0) % AVATAR.length];
const capital = (text) => (text ? text.charAt(0).toUpperCase() + text.slice(1) : '');
const todayDay = () => new Date(Date.now() + 19800000).toISOString().slice(0, 10);
const daysFrom = (d) => Math.round((Date.parse(`${d}T00:00:00Z`) - Date.parse(`${todayDay()}T00:00:00Z`)) / 86400000);
const shortDay = (d) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const cell = 'border border-[#E4DED2] px-3 py-2.5 align-middle whitespace-nowrap';
const head = 'border border-[#E4DED2] bg-[#F7F4EC] px-3 py-2.5 text-left text-[12px] font-bold text-charcoal/70 whitespace-nowrap';
const Person = ({ name }) => (name
  ? <span className="inline-flex items-center gap-2"><span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10.5px] font-bold ${avatarOf(name)}`}>{initials(name)}</span><span className="text-charcoal">{name}</span></span>
  : <span className="text-charcoal/35">--</span>);

// Patient 360°: every patient on one line - phase, programme, where the medicine is, sessions done, the next session,
// what is due, the team and when the phase ends. A row opens the patient; the next session opens that session.
export default function Patient360() {
  const { user } = useAuth();
  // A PCC starts on their own patients (and can look at everyone's).
  const isPcc = user?.role === 'assistant_doctor';
  const myId = String(user?._id || user?.id || '');
  const [status, setStatus] = useState('active');
  const [category, setCategory] = useState('');
  const [pcc, setPcc] = useState(isPcc ? myId : '');
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const [sort, setSort] = useState('name');
  const [page, setPage] = useState(1);
  useEffect(() => { const t = window.setTimeout(() => { setQ(search.trim()); setPage(1); }, 350); return () => window.clearTimeout(t); }, [search]);
  const { data, loading, error } = useApiQuery('/insights/patient-360', { params: { status, category: category || undefined, pcc: pcc || undefined, q: q || undefined, sort, page } });
  const rows = data?.rows || [];
  const s = data?.summary || {};
  const change = (setter) => (e) => { setter(e.target.value); setPage(1); };
  return (
    <div className="space-y-4">
      <PageHeader icon={Contact} title="Patient 360°" subtitle={isPcc && pcc === myId ? 'Your patients on one line: phase, programme, medicine, sessions, next session, due, team and phase end. Choose “All” to see every patient (read only).' : 'Every patient on one line: phase, programme, medicine, sessions, next session, due, team and phase end.'} />
      <div className="grid gap-2.5" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
        <Tile label="Patients" value={s.patients ?? '—'} hint={`${s.onSchedule ?? 0} on the Care Schedule`} />
        <Tile label="No next session" value={s.noNextSession ?? '—'} hint="On the schedule, nothing open" tone={s.noNextSession ? 'text-[#9F1D1D]' : ''} />
        <Tile label="With overdue sessions" value={s.withOverdue ?? '—'} tone={s.withOverdue ? 'text-[#9A5B00]' : ''} />
        <Tile label="Due (balance)" value={money(s.due)} hint={`${s.withDue ?? 0} patients`} />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1.5 text-[12.5px] font-semibold text-charcoal/60">Status<select className={select} value={status} onChange={change(setStatus)}><option value="active">Active</option><option value="inactive">Inactive</option><option value="all">All</option></select></label>
        <label className="flex items-center gap-1.5 text-[12.5px] font-semibold text-charcoal/60">Category<select className={select} value={category} onChange={change(setCategory)}>{CATEGORIES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
        <label className="flex items-center gap-1.5 text-[12.5px] font-semibold text-charcoal/60">PCC<select className={select} value={pcc} onChange={change(setPcc)}><option value="">All</option>{(data?.pccs || []).map((u) => <option key={u.id} value={u.id}>{u.id === myId ? `${u.name} (my patients)` : u.name}</option>)}</select></label>
        <label className="flex items-center gap-1.5 text-[12.5px] font-semibold text-charcoal/60">Sort<select className={select} value={sort} onChange={change(setSort)}>{SORTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
        <label className="flex min-w-[220px] flex-1 items-center gap-2 rounded-lg border border-cardline bg-white px-2.5 py-1.5 sm:max-w-xs"><Search size={14} className="text-charcoal/40" /><input className="w-full bg-transparent text-[13px] outline-none" placeholder="Name, ID, phone" value={search} onChange={(e) => setSearch(e.target.value)} /></label>
      </div>
      {/* The sheet: one line per patient; the name opens the patient, the next session opens that session. */}
      <div className="overflow-x-auto rounded-lg border border-[#E4DED2] bg-white">
        <table className="w-full min-w-[1400px] border-collapse text-[13.5px]">
          <thead className="sticky top-0 z-[1]">
            <tr>
              {['Patient', 'Patient ID', 'Category', 'Phase', 'Programme', 'Medicine', 'Sessions', 'Next session', 'Due', 'PCC', 'Post counselor', 'Phase ends'].map((h) => <th key={h} className={`${head} ${h === 'Due' || h === 'Sessions' ? 'text-right' : ''}`}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const left = r.phaseEnds ? daysFrom(r.phaseEnds) : null;
              return (
                <tr key={r.id} className="transition hover:bg-[#F6F3EA]">
                  <td className={cell}><Link to={`/admin/patients/${r.id}`} className="font-medium text-[#3F3D9A] hover:underline">{r.name}</Link>{!r.active && <span className="ml-1.5 rounded bg-charcoal/[0.07] px-1.5 text-[11px] text-charcoal/55">inactive</span>}</td>
                  <td className={`${cell} text-charcoal/75`}>{r.code || '--'}</td>
                  <td className={cell}>{r.categoryLabel ? <span className={`rounded px-2 py-0.5 text-[12.5px] ${CATEGORY_PILL[r.category] || CATEGORY_PILL.other}`}>{r.categoryLabel}</span> : <span className="text-charcoal/35">--</span>}</td>
                  <td className={`${cell} text-charcoal`}>Phase {r.phase}</td>
                  <td className={`${cell} text-charcoal/80`}>{capital(r.programme) || '--'}</td>
                  <td className={cell}><span className={`rounded px-2 py-0.5 text-[12.5px] ${MEDICINE[r.medicine] || MEDICINE['Not requested']}`}>{r.medicine}</span></td>
                  <td className={`${cell} text-right text-charcoal`} title={r.sessions.missed ? `${r.sessions.missed} missed` : ''}>{r.onSchedule ? `${r.sessions.done}/${r.sessions.total}` : <span className="text-charcoal/35">--</span>}</td>
                  <td className={cell}>
                    {r.next
                      ? <Link to={`/admin/care-schedule/session/${r.next.id}`} className={`hover:underline ${r.next.overdue ? 'font-medium text-[#B4232F]' : 'text-charcoal'}`}>{shortDay(r.next.day)} · {r.next.title}{r.next.overdue ? ' · overdue' : ''}</Link>
                      : r.onSchedule ? <span className="rounded bg-[#FDE2E1] px-2 py-0.5 text-[12.5px] text-[#9F1D1D]">No session open</span> : <span className="text-charcoal/35">Not on the schedule</span>}
                  </td>
                  <td className={`${cell} text-right ${r.due ? 'font-medium text-charcoal' : 'text-charcoal/35'}`}>{r.due ? money(r.due) : '--'}</td>
                  <td className={cell}><Person name={r.pcc} /></td>
                  <td className={cell}><Person name={r.postCounselor} /></td>
                  <td className={cell}>{r.phaseEnds ? <span className="text-charcoal">{dayYear(r.phaseEnds)}{left != null && <span className={`ml-1.5 text-[12px] ${left < 0 ? 'text-charcoal/40' : left <= 30 ? 'text-[#9A5B00]' : 'text-charcoal/45'}`}>({left < 0 ? 'ended' : left === 0 ? 'today' : `${left}d`})</span>}</span> : <span className="text-charcoal/35">--</span>}</td>
                </tr>
              );
            })}
            {!rows.length && <tr><td colSpan={12} className={`${cell} py-10 text-center text-charcoal/55`}>{loading ? 'Loading...' : error ? 'Could not load the patients.' : 'No patient matches.'}</td></tr>}
          </tbody>
        </table>
      </div>
      {data?.pages > 1 && (
        <div className="flex items-center justify-end gap-2 text-[13px]">
          <span className="text-charcoal/55">{data.total} patients · page {data.page} of {data.pages}</span>
          <button type="button" disabled={page <= 1} onClick={() => setPage(page - 1)} className="rounded-lg border border-cardline bg-white p-1.5 disabled:opacity-40" aria-label="Previous page"><ChevronLeft size={16} /></button>
          <button type="button" disabled={page >= data.pages} onClick={() => setPage(page + 1)} className="rounded-lg border border-cardline bg-white p-1.5 disabled:opacity-40" aria-label="Next page"><ChevronRight size={16} /></button>
        </div>
      )}
    </div>
  );
}
