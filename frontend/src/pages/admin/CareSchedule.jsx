import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { AlertTriangle, ArrowRightLeft, MessageCirclePlus, CalendarDays, CalendarHeart, ChevronLeft, ChevronRight, History, ListChecks, Search, Trash2, UserX } from 'lucide-react';
import api from '../../api/axios.js';
import useApiQuery from '../../api/useApiQuery.js';
import { PageHeader } from '../../components/ui/Layout.jsx';
import Button from '../../components/ui/Button.jsx';
import ConvertOldPanel from '../../components/care/ConvertOldPanel.jsx';
import ScheduleListPage from '../../components/ScheduleListPage.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { KIND_STYLE, STATE_STYLE, fmtAt, fmtDay, fmtTime } from '../../components/care/careUi.js';

const VIEWS = [
  ['work', 'My work'], ['alert', 'Red alert'], ['overdue', 'Overdue'], ['today', 'Today'], ['needs_time', 'Set call time'], ['leave', 'PCC on leave'], ['requests', 'Reassign requests'],
  ['upcoming', 'Upcoming'], ['done', 'Done'], ['closed', 'Closed'],
];
const KINDS = [['', 'All'], ['foundation', 'Foundation'], ['followup', 'Follow-ups'], ['family', 'Family sessions'], ['tracker', 'Trackers']];
const errorText = (error) => error?.response?.data?.message || error?.message || 'Something went wrong';

// onQuery: the Manager / Admin raise a Team Chat query to the PCC about a delayed session (overdue / red alert).
function SessionRow({ s, onOpen, onQuery }) {
  const kind = KIND_STYLE[s.kind] || KIND_STYLE.followup;
  const delayed = ['overdue', 'alert'].includes(s.state);
  return (
    <div role="button" tabIndex={0} onClick={() => onOpen(s.id)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(s.id); } }} className={`grid w-full cursor-pointer gap-2 border-b border-cardline px-3 py-2.5 text-left transition hover:bg-[#FBF7ED] md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)_auto] md:items-center ${s.state === 'alert' ? 'bg-[#FFF5F5]' : ''}`}>
      <span className="min-w-0">
        <span className="flex flex-wrap items-center gap-1.5">
          <span className={`rounded px-1.5 py-0.5 text-[10.5px] font-bold ${kind.chip}`}>{s.code}</span>
          <span className="truncate text-[13.5px] font-bold text-charcoal">{s.patientName}</span>
        </span>
        <span className="block text-[11.5px] text-charcoal/55">{[s.patientCode, `Phase ${s.phase}`, `${s.title} · Day ${s.day}`].filter(Boolean).join(' · ')}</span>
      </span>
      <span className="text-[12.5px] text-charcoal/75">
        {s.kind === 'tracker' ? <>Due <b>{fmtDay(s.targetDate)}</b><span className={`block text-[11px] ${s.tracker?.sentAt ? 'text-charcoal/55' : 'text-[#9A5B00]'}`}>{s.tracker?.filledLink ? 'Tracker filled' : s.tracker?.sentAt ? `Tracker sent ${fmtAt(s.tracker.sentAt)}` : 'Tracker not sent yet'}</span></>
          : s.callAt ? <><b>{fmtAt(s.callAt)}</b><span className="block text-[11px] text-charcoal/50">Due {fmtDay(s.targetDate)}</span></> : <>Due <b>{fmtDay(s.targetDate)}</b><span className="block text-[11px] text-[#9A5B00]">Call time not set</span></>}
      </span>
      <span className="text-[12px] text-charcoal/70">
        {s.assigneeName || s.ownerName}{s.covered && <span className="ml-1 rounded bg-[#EEF3F0] px-1 text-[10.5px] font-bold text-[#1F4F3D]">cover</span>}
        {s.leave && <span className="mt-0.5 flex items-center gap-1 text-[11px] font-semibold text-[#9A5B00]"><UserX size={12} />{s.leave.text}</span>}
        {s.reschedulesUsed > 0 && <span className="block text-[11px] text-charcoal/50">Rescheduled {s.reschedulesUsed}/{s.rescheduleLimit}{s.attempts ? ` · ${s.attempts} call${s.attempts === 1 ? '' : 's'} not connected` : ''}</span>}
        {!s.reschedulesUsed && s.attempts > 0 && <span className="block text-[11px] text-charcoal/50">{s.attempts} call{s.attempts === 1 ? '' : 's'} not connected</span>}
        {s.closed && <span className="block truncate text-[11px] text-charcoal/55" title={`${s.closed.reason} — ${s.closed.details}`}>{s.closed.reason} — {s.closed.details}</span>}
      </span>
      <span className="flex flex-wrap items-center gap-1.5 md:justify-end">
        {s.state === 'alert' && <AlertTriangle size={14} className="text-[#B4232F]" />}
        <span className={`rounded-full px-2.5 py-0.5 text-[11.5px] font-bold ${STATE_STYLE[s.state] || ''}`}>{s.stateLabel}</span>
        {s.hasDraft && <span className="rounded-full bg-[#E6EEF8] px-2 py-0.5 text-[10.5px] font-bold text-[#24476F]">Draft</span>}
        {s.reassignAsked && <span className="rounded-full bg-[#EEF3FB] px-2 py-0.5 text-[10.5px] font-bold text-[#24476F]" title={s.reassignRequest?.reason}>Reassign asked</span>}
        {onQuery && delayed && <button type="button" onClick={(e) => { e.stopPropagation(); onQuery(s.id); }} title="Ask the PCC about this delayed session (Team Chat)" className="inline-flex items-center gap-1 rounded-full border border-[#B4232F]/40 bg-white px-2 py-0.5 text-[11px] font-bold text-[#8A1C25] hover:bg-[#FDF0F0]"><MessageCirclePlus size={12} />Raise query</button>}
      </span>
    </div>
  );
}

function Worklist({ onOpen, onQuery }) {
  const [view, setView] = useState('work');
  const [kind, setKind] = useState('');
  const [q, setQ] = useState('');
  const [person, setPerson] = useState('');
  const { data, loading, error } = useApiQuery('/care/sessions', { params: { view, kind, q: q.trim() || undefined, person: person || undefined } });
  const staff = data?.staff || [];
  const counts = data?.counts || {};
  const rows = data?.sessions || [];
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5">
        {VIEWS.map(([key, label]) => {
          const n = counts[key];
          return (
            <button key={key} type="button" onClick={() => setView(key)} className={`rounded-full border px-3 py-1 text-[12.5px] font-bold transition ${view === key ? 'border-[#1F5F4A] bg-[#1F5F4A] text-white' : key === 'alert' && n ? 'border-[#B4232F]/40 bg-[#FFF5F5] text-[#8A1C25]' : 'border-cardline bg-white text-charcoal/70 hover:border-[#1F5F4A]/40'}`}>
              {label}{n ? <span className="ml-1.5 rounded-full bg-white/25 px-1.5">{n}</span> : null}
            </button>
          );
        })}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-lg border border-cardline bg-white p-0.5">
          {KINDS.map(([key, label]) => <button key={key} type="button" onClick={() => setKind(key)} className={`rounded-md px-2.5 py-1 text-[12px] font-bold ${kind === key ? 'bg-[#EEF3F0] text-[#1F4F3D]' : 'text-charcoal/60'}`}>{label}</button>)}
        </div>
        <label className="flex min-w-[220px] flex-1 items-center gap-2 rounded-lg border border-cardline bg-white px-2.5 py-1.5 sm:max-w-xs"><Search size={14} className="text-charcoal/40" /><input className="w-full bg-transparent text-[13px] outline-none" placeholder="Patient name or ID" value={q} onChange={(e) => setQ(e.target.value)} /></label>
        {data?.seesAll && (
          <select className="rounded-lg border border-cardline bg-white px-2.5 py-1.5 text-[13px]" value={person} onChange={(e) => setPerson(e.target.value)}>
            <option value="">Every PCC</option>
            {staff.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        )}
      </div>
      <div className="overflow-hidden rounded-xl border border-cardline bg-white">
        {loading && <p className="px-3 py-4 text-sm text-charcoal/55">Loading...</p>}
        {error && <p className="px-3 py-4 text-sm text-[#8A1C25]">{errorText(error)}</p>}
        {!loading && !error && !rows.length && <p className="px-3 py-6 text-center text-sm text-charcoal/55">{view === 'work' ? 'Nothing waiting right now.' : 'No sessions here.'}</p>}
        {rows.map((s) => <SessionRow key={s.id} s={s} onOpen={onOpen} onQuery={onQuery} />)}
      </div>
      <p className="text-[11.5px] text-charcoal/50">Foundation: Day 1–7 (one a day) · Family sessions: Day 15, 105, 165 · Follow-ups: Day 20, 50, 80, 110, 140, 170 · Trackers: Day 60, 120 (Day 180 in the clinic) — from the medicine start date, only the days the medicine covers. Clinic closed on Wednesday and holidays: a session falling on one moves to the next open day. A call can be rescheduled twice; then it must be completed, marked missed or cancelled.</p>
    </div>
  );
}

const monthOf = (day) => day.slice(0, 7);
const shiftMonth = (month, n) => { const [y, m] = month.split('-').map(Number); const d = new Date(Date.UTC(y, m - 1 + n, 1)); return d.toISOString().slice(0, 7); };
const WEEK = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function Calendar({ onOpen }) {
  const [month, setMonth] = useState(monthOf(new Date().toISOString()));
  const [user, setUser] = useState('');
  const [form, setForm] = useState(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const { data, loading, error, refresh } = useApiQuery('/care/calendar', { params: { month, user: user || undefined } });
  const days = data?.days || [];
  const lead = days.length ? (days[0].weekday + 6) % 7 : 0;
  const save = async () => {
    setBusy(true); setMessage('');
    try {
      const { data: res } = await api.post('/care/leaves', { user: data?.user?.id, from: form.from, to: form.to || form.from, reason: form.reason });
      setMessage(res.affected ? `Leave marked. ${res.affected} session${res.affected === 1 ? '' : 's'} on these days now show a leave alert for the Manager to reassign.` : 'Leave marked.');
      setForm(null); refresh();
    } catch (e) { setMessage(errorText(e)); } finally { setBusy(false); }
  };
  const remove = async (id) => {
    if (!window.confirm('Remove this leave?')) return;
    try { await api.delete(`/care/leaves/${id}`); refresh(); } catch (e) { setMessage(errorText(e)); }
  };
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1 rounded-lg border border-cardline bg-white p-0.5">
          <button type="button" onClick={() => setMonth(shiftMonth(month, -1))} className="rounded-md p-1.5 text-charcoal/60 hover:bg-[#EEF3F0]" aria-label="Previous month"><ChevronLeft size={16} /></button>
          <span className="min-w-[120px] text-center text-[13px] font-bold text-charcoal">{new Date(`${month}-01T00:00:00Z`).toLocaleDateString('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' })}</span>
          <button type="button" onClick={() => setMonth(shiftMonth(month, 1))} className="rounded-md p-1.5 text-charcoal/60 hover:bg-[#EEF3F0]" aria-label="Next month"><ChevronRight size={16} /></button>
        </div>
        {data?.staff?.length > 0 && (
          <select className="rounded-lg border border-cardline bg-white px-2.5 py-1.5 text-[13px]" value={user} onChange={(e) => setUser(e.target.value)}>
            <option value="">My calendar</option>
            {data.staff.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        )}
        <span className="text-[13px] font-semibold text-charcoal/70">{data?.user?.name}</span>
        {data?.canMark && <Button size="sm" variant="outline" className="ml-auto" onClick={() => setForm(form ? null : { from: '', to: '', reason: '' })}><UserX size={14} className="mr-1 inline" />Mark leave</Button>}
      </div>
      {message && <p className="rounded-lg border border-cardline bg-white px-3 py-2 text-[13px] text-charcoal">{message}</p>}
      {form && (
        <div className="grid gap-2 rounded-lg border border-cardline bg-[#FAF8F2] p-3 sm:grid-cols-[160px_160px_1fr_auto] sm:items-end">
          <label className="text-[12px] font-bold">From<input type="date" className="mt-1 w-full rounded-lg border border-cardline bg-white px-2 py-1.5 text-[13px]" value={form.from} onChange={(e) => setForm({ ...form, from: e.target.value })} /></label>
          <label className="text-[12px] font-bold">To<input type="date" className="mt-1 w-full rounded-lg border border-cardline bg-white px-2 py-1.5 text-[13px]" value={form.to} min={form.from} onChange={(e) => setForm({ ...form, to: e.target.value })} /></label>
          <label className="text-[12px] font-bold">Reason<input className="mt-1 w-full rounded-lg border border-cardline bg-white px-2 py-1.5 text-[13px]" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} /></label>
          <Button size="sm" disabled={busy || !form.from} onClick={save}>Save leave</Button>
        </div>
      )}
      {loading && <p className="text-sm text-charcoal/55">Loading...</p>}
      {error && <p className="text-sm text-[#8A1C25]">{errorText(error)}</p>}
      {days.length > 0 && (
        <div className="overflow-x-auto">
          <div className="grid min-w-[760px] grid-cols-7 gap-1">
            {WEEK.map((d) => <p key={d} className="px-1 text-center text-[11px] font-bold uppercase text-charcoal/50">{d}</p>)}
            {Array.from({ length: lead }, (_, i) => <div key={`x${i}`} />)}
            {days.map((d) => (
              <div key={d.day} className={`min-h-[96px] rounded-lg border p-1.5 ${d.leave ? 'border-[#C2780C]/50 bg-[#FFF7E8]' : d.closed ? 'border-cardline bg-charcoal/[0.04]' : 'border-cardline bg-white'}`}>
                <p className="flex items-center justify-between text-[11.5px] font-bold text-charcoal/70"><span>{Number(d.day.slice(8))}</span>{d.closed && <span className="text-[10px] font-semibold text-charcoal/45">Closed</span>}</p>
                {d.leave && (
                  <p className="mt-0.5 flex items-center justify-between gap-1 rounded bg-[#C2780C] px-1 py-0.5 text-[10.5px] font-bold text-white">
                    <span className="truncate">Leave{d.leave.source === 'hr' ? ' (HR)' : ''}{d.leave.reason ? `: ${d.leave.reason}` : ''}</span>
                    {data.canMark && d.leave.source === 'calendar' && d.leave.from === d.day && <button type="button" onClick={() => remove(d.leave.id)} aria-label="Remove leave"><Trash2 size={11} /></button>}
                  </p>
                )}
                <div className="mt-1 space-y-0.5">
                  {(d.old || []).map((o, i) => (
                    <Link key={`old-${i}`} to={`/admin/patients/${o.patientId}`} className={`flex w-full items-center gap-1 truncate rounded border border-dashed border-charcoal/20 px-1 py-0.5 text-[10.5px] font-semibold text-charcoal/60 hover:bg-charcoal/[0.04] ${o.status === 'completed' ? 'opacity-60' : ''}`} title={`Old ${o.type} · ${o.patientName} · ${o.status}`}>
                      <History size={10} className="shrink-0" />{fmtTime(o.at)} {o.type === 'family' ? 'FS' : o.type === 'tracker' ? 'Tracker' : 'FU'} {o.patientName}
                    </Link>
                  ))}
                  {d.sessions.map((s) => {
                    const kind = KIND_STYLE[s.kind] || KIND_STYLE.followup;
                    return (
                      <button key={s.id} type="button" onClick={() => onOpen(s.id)} className={`flex w-full items-center gap-1 truncate rounded px-1 py-0.5 text-left text-[10.5px] font-semibold ${kind.chip} ${['done', 'missed', 'cancelled'].includes(s.state) ? 'opacity-50' : ''} ${s.state === 'alert' ? 'ring-1 ring-[#B4232F]' : ''}`} title={`${s.code} ${s.patientName} · ${s.stateLabel}`}>
                        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${kind.dot}`} />{s.callAt ? `${fmtTime(s.callAt)} ` : ''}{s.code} {s.patientName}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      <p className="flex flex-wrap gap-3 text-[11.5px] text-charcoal/55">{Object.values(KIND_STYLE).map((k) => <span key={k.label} className="flex items-center gap-1"><span className={`h-2 w-2 rounded-full ${k.dot}`} />{k.label}</span>)}<span className="flex items-center gap-1"><History size={11} />dashed = old follow-up / family session</span><span>Orange day = leave · grey = clinic closed (Wednesday / holiday)</span></p>
    </div>
  );
}

function OldRecords() {
  const [params] = useSearchParams();
  const [type, setType] = useState(params.get('type') === 'family' ? 'family' : 'followup');
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-lg border border-cardline bg-white p-0.5">
          {[['followup', 'Old follow-ups'], ['family', 'Old family sessions']].map(([key, label]) => <button key={key} type="button" onClick={() => setType(key)} className={`rounded-md px-3 py-1 text-[12.5px] font-bold ${type === key ? 'bg-[#EEF3F0] text-[#1F4F3D]' : 'text-charcoal/60'}`}>{label}</button>)}
        </div>
        <p className="text-[12px] text-charcoal/55">The old system's entries: done ones as saved, the ones moved to the new schedule show "Moved to the new Care Schedule".</p>
      </div>
      {type === 'followup'
        ? <ScheduleListPage key="fu" title="Old follow-ups" subtitle="Follow-ups of the old system (history)." apiPath="/schedule/followups" showFollowUpTypeFilter />
        : <ScheduleListPage key="fs" title="Old family sessions" subtitle="Family sessions of the old system (history)." apiPath="/schedule/family-sessions" showFamilySessionTypeFilter />}
    </div>
  );
}

const TABS = ['list', 'calendar', 'old', 'convert'];
// Follow-ups & Family Sessions (the Care Schedule): every follow-up, family session and development tracker made from
// the medicine start dates (the worklist), each PCC's calendar with their leave (marked by the PCC or the Manager),
// the old system's entries, and (Admin / Manager) moving old patients to the new pattern.
export default function CareSchedule() {
  const { user } = useAuth();
  const canManage = ['admin', 'manager'].includes(user?.role);
  const [params] = useSearchParams();
  const [tab, setTab] = useState(TABS.includes(params.get('tab')) ? params.get('tab') : 'list');
  const navigate = useNavigate();
  // A session opens on its own page (tabs: form, calls, doctor advice, reminders, reschedule, history).
  const open = (sessionId) => navigate(`/admin/care-schedule/session/${sessionId}`);
  useEffect(() => { const s = params.get('s'); if (s) navigate(`/admin/care-schedule/session/${s}`, { replace: true }); }, [params, navigate]);
  return (
    <div className="space-y-4">
      <PageHeader icon={CalendarHeart} title="Follow-ups & Family Sessions" subtitle="The Care Schedule: follow-ups, family sessions and trackers from the medicine start date — call times, reschedules, missed calls, leave and the forms." />
      <div className="flex gap-1 overflow-x-auto border-b border-cardline">
        {[['list', 'Worklist', ListChecks], ['calendar', 'Calendar & leave', CalendarDays], ['old', 'Old records', History], ...(canManage ? [['convert', 'Move old patients', ArrowRightLeft]] : [])].map(([key, label, Icon]) => (
          <button key={key} type="button" onClick={() => setTab(key)} className={`-mb-px flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2 text-[13px] font-bold ${tab === key ? 'border-[#1F5F4A] text-[#1F5F4A]' : 'border-transparent text-charcoal/55'}`}><Icon size={15} />{label}</button>
        ))}
      </div>
      {tab === 'list' && <Worklist onOpen={open} onQuery={canManage ? (id) => navigate(`/admin/team-chat?care=${id}`) : undefined} />}
      {tab === 'calendar' && <Calendar onOpen={open} />}
      {tab === 'old' && <OldRecords />}
      {tab === 'convert' && canManage && <ConvertOldPanel />}
    </div>
  );
}
