import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import useStaleState from '../../hooks/useStaleState.js';
import { Link } from 'react-router-dom';
import { AlertTriangle, CalendarClock, HeartHandshake, Inbox, Megaphone, Search, Send, TrendingUp } from 'lucide-react';
import api from '../../api/axios.js';
import Card from '../../components/ui/Card.jsx';
import Button from '../../components/ui/Button.jsx';
import { PageHeader } from '../../components/ui/Layout.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { ROLES } from '../../constants/roles.js';

const thisMonth = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
};
const monthLabel = (key) => (key && key !== 'all'
  ? new Date(`${key}-01T12:00:00`).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })
  : 'All months');
const shortDate = (iso) => (iso ? new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : '-');
const KINDS = [['all', 'All'], ['followUps', 'Follow-ups'], ['familySessions', 'Family sessions']];
const REFRESH_MS = 60 * 1000;
const PAGE_SIZE = 25;

const Stat = ({ icon: Icon, label, value, tone }) => (
  <div className={`rounded-[12px] border px-3.5 py-3 ${tone}`}>
    <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide opacity-80"><Icon size={13} aria-hidden="true" />{label}</p>
    <p className="mt-1 font-display text-2xl font-extrabold">{value}</p>
  </div>
);

// One done session in the date columns: type, date and what was noted.
const SessionCell = ({ session }) => {
  if (!session) return <span className="text-charcoal/25">-</span>;
  const tone = session.outcome === 'improvement'
    ? 'border-[#A7D7B8] bg-[#E8F5EC]'
    : session.outcome === 'problem' ? 'border-[#F5B5B0] bg-[#FDECEA]' : 'border-[#EFE3CF] bg-white';
  return (
    <div className={`min-w-[150px] rounded-[8px] border px-2 py-1.5 ${tone}`} title={session.outcomeNote || 'Nothing noted'}>
      <p className="flex items-center justify-between gap-2 text-[11px] font-bold text-charcoal">
        <span className="inline-flex items-center gap-1">
          {session.kind === 'followUps' ? <CalendarClock size={11} aria-hidden="true" /> : <HeartHandshake size={11} aria-hidden="true" />}
          {session.kind === 'followUps' ? 'FU' : 'FS'} · P{session.stage}
        </span>
        <span className="text-charcoal/60">{shortDate(session.date)}</span>
      </p>
      <p className={`mt-0.5 text-[11.5px] font-semibold ${session.outcome === 'improvement' ? 'text-[#1F6B41]' : session.outcome === 'problem' ? 'text-[#9F1D1D]' : 'text-charcoal/40'}`}>
        {session.outcome === 'improvement' ? 'Improvement' : session.outcome === 'problem' ? 'Problem' : 'Not noted'}
      </p>
      {session.outcomeNote && <p className="line-clamp-2 text-[11px] text-charcoal/75">{session.outcomeNote}</p>}
    </div>
  );
};

// Every patient with done follow-ups / family sessions, with how many showed improvement or a problem.
// Refreshes on its own; patients who clearly improved in a month go to the Digital Marketing sheet automatically.
export default function PatientImprovement() {
  const { user } = useAuth();
  const canSync = [ROLES.ADMIN, ROLES.MANAGER, ROLES.DOCTOR].includes(user?.role);
  const [month, setMonth] = useState(thisMonth());
  const [kind, setKind] = useState('all');
  const [show, setShow] = useState('all');
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useStaleState(`patient-improvement:${month}:${kind}:${show}:${search}:${page}`, null);
  const [loading, setLoading] = useState(!data);
  const [error, setError] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [notice, setNotice] = useState('');
  const requestRef = useRef(null);

  // Typing waits a moment before asking the server; any filter change goes back to page 1.
  useEffect(() => { const timer = setTimeout(() => setSearch(query.trim()), 300); return () => clearTimeout(timer); }, [query]);
  useEffect(() => { setPage(1); }, [month, kind, show, search]);

  // The server filters, counts and pages; only one page of patients comes back.
  // An older request still on its way is cancelled so a slow answer never replaces a newer one.
  const load = useCallback(async ({ silent = false } = {}) => {
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    if (!silent) setLoading(true);
    try {
      const { data: next } = await api.get('/patient-improvement', {
        params: { month, kind, show, q: search || undefined, page, limit: PAGE_SIZE },
        signal: controller.signal,
        skipCache: true,
      });
      setData(next);
      setError('');
    } catch (err) {
      if (controller.signal.aborted) return;
      if (!silent) setError(err.response?.data?.message || 'Could not load patient improvement');
    } finally {
      if (requestRef.current === controller) setLoading(false);
    }
  }, [month, kind, show, search, page]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => () => requestRef.current?.abort(), []);

  const loadRef = useRef(load);
  useEffect(() => { loadRef.current = load; }, [load]);
  useEffect(() => {
    const refresh = () => { if (document.visibilityState === 'visible') loadRef.current({ silent: true }); };
    const timer = setInterval(refresh, REFRESH_MS);
    window.addEventListener('focus', refresh);
    return () => { clearInterval(timer); window.removeEventListener('focus', refresh); };
  }, []);

  const rows = useMemo(() => data?.rows || [], [data]);
  const columnCount = Math.max(1, ...rows.map((row) => row.sessions.length));
  const totals = data?.totals || {};
  const pages = data?.pages || 1;
  const total = data?.total || 0;
  const minImprovements = data?.marketingRule?.minImprovements || 2;

  const [adding, setAdding] = useState('');
  const addToMarketing = async (row) => {
    setAdding(row.id); setNotice(''); setError('');
    try {
      const { data: result } = await api.post(`/patient-improvement/${row.id}/marketing`, { month });
      setNotice(result.message);
      await load({ silent: true });
    } catch (err) {
      setError(err.response?.data?.message || 'Could not add to Digital Marketing');
    } finally {
      setAdding('');
    }
  };

  const sync = async () => {
    setSyncing(true); setNotice(''); setError('');
    try {
      const { data: result } = await api.post('/patient-improvement/sync', { month });
      setNotice(result.message);
      await load({ silent: true });
    } catch (err) {
      setError(err.response?.data?.message || 'Could not send to Digital Marketing');
    } finally {
      setSyncing(false);
    }
  };

  const filterButton = (value, label, active, onClick) => (
    <button key={value} type="button" onClick={onClick} aria-pressed={active}
      className={`rounded-full px-3 py-1.5 text-xs font-bold transition ${active ? 'bg-sage text-white' : 'bg-white text-charcoal/70 ring-1 ring-[#E8DFCB] hover:bg-[#FBF7ED]'}`}>
      {label}
    </button>
  );

  return (
    <div className="space-y-4">
      <PageHeader icon={TrendingUp} title="Patient Improvement"
        subtitle={`Follow-ups and family sessions with what was noted after each one · ${monthLabel(month)}. Updates on its own.`}
        actions={(
          <div className="flex flex-wrap items-center gap-2">
            <input type="month" aria-label="Month" value={month === 'all' ? '' : month} onChange={(e) => setMonth(e.target.value || thisMonth())}
              className="rounded-[10px] border border-[#DED2BD] bg-white px-3 py-2 text-sm" />
            <button type="button" onClick={() => setMonth(month === 'all' ? thisMonth() : 'all')}
              className="rounded-[10px] border border-[#DED2BD] bg-white px-3 py-2 text-sm font-semibold text-charcoal/75 hover:bg-[#FBF7ED]">
              {month === 'all' ? 'One month' : 'All months'}
            </button>
            {canSync && month !== 'all' && (
              <Button size="sm" variant="outline" onClick={sync} disabled={syncing}><Send size={14} />{syncing ? 'Sending...' : 'Send month to Digital Marketing'}</Button>
            )}
          </div>
        )} />

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
        <Stat icon={Inbox} label="Patients" value={totals.patients || 0} tone="border-[#EFE3CF] bg-white text-charcoal" />
        <Stat icon={CalendarClock} label="Follow-ups" value={totals.followUps || 0} tone="border-[#EFE3CF] bg-white text-charcoal" />
        <Stat icon={HeartHandshake} label="Family sessions" value={totals.familySessions || 0} tone="border-[#EFE3CF] bg-white text-charcoal" />
        <Stat icon={TrendingUp} label="Improvements" value={totals.improvements || 0} tone="border-[#A7D7B8] bg-[#E8F5EC] text-[#1F6B41]" />
        <Stat icon={AlertTriangle} label="Problems" value={totals.problems || 0} tone="border-[#F5B5B0] bg-[#FDECEA] text-[#9F1D1D]" />
        <Stat icon={Megaphone} label="In Digital Marketing" value={totals.inMarketing || 0} tone="border-[#E8DFCB] bg-[#FBF7ED] text-charcoal" />
      </div>

      <Card padded={false}>
        <div className="flex flex-col gap-3 border-b border-cardline-soft p-3.5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-1.5">
            {KINDS.map(([value, label]) => filterButton(value, label, kind === value, () => setKind(value)))}
            <span className="mx-1 hidden h-5 w-px bg-[#E8DFCB] sm:inline-block" />
            {[['all', 'Everyone'], ['improvement', 'Improved'], ['problem', 'Facing problem'], ['marketing', 'In Digital Marketing']]
              .map(([value, label]) => filterButton(`show-${value}`, label, show === value, () => setShow(value)))}
          </div>
          <div className="relative w-full lg:w-72">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-charcoal/40" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name, Patient ID or PCC"
              className="w-full rounded-[10px] border border-[#DED2BD] bg-white py-2.5 pl-9 pr-3 text-sm" />
          </div>
        </div>
        <p className="border-b border-cardline-soft bg-[#FBF7ED] px-3.5 py-2 text-[12px] text-charcoal/70">
          A patient goes to the <b>Digital Marketing</b> sheet automatically as soon as {minImprovements === 1 ? 'one improvement is' : `${minImprovements} improvements are`} noted in a month, with the improvement count and every improvement note.
        </p>
        {notice && <p className="border-b border-cardline-soft bg-[#E8F5EC] px-3.5 py-2 text-sm text-[#1F6B41]">{notice}</p>}
        {error && <p role="alert" className="border-b border-red-200 bg-red-50 px-3.5 py-2 text-sm text-red-700">{error}</p>}
        <div className={`h-0.5 overflow-hidden ${loading && data ? 'bg-sage/15' : 'bg-transparent'}`} aria-hidden="true">{loading && data && <div className="h-full w-1/3 animate-pulse bg-sage" />}</div>

        {loading && !data ? (
          <p className="py-12 text-center text-sm text-charcoal/55">Loading...</p>
        ) : !rows.length ? (
          <div className="py-12 text-center"><Inbox className="mx-auto mb-2 text-charcoal/30" size={32} /><p className="text-sm text-charcoal/60">No done follow-ups or family sessions here.</p></div>
        ) : (
          <div className={`overflow-x-auto transition-opacity ${loading ? 'opacity-60' : ''}`} aria-busy={loading}>
            <table className="min-w-full border-collapse text-left text-sm">
              <thead>
                <tr className="bg-[#56695D] text-[12px] font-bold text-offwhite-100">
                  <th className="sticky left-0 z-10 min-w-52 bg-[#56695D] px-3 py-2.5">Patient</th>
                  <th className="min-w-32 px-3 py-2.5">PCC</th>
                  <th className="px-3 py-2.5 text-center">Follow-ups</th>
                  <th className="px-3 py-2.5 text-center">Family sessions</th>
                  <th className="px-3 py-2.5 text-center">Improvements</th>
                  <th className="px-3 py-2.5 text-center">Problems</th>
                  <th className="min-w-36 px-3 py-2.5">Digital Marketing</th>
                  {Array.from({ length: columnCount }, (_, index) => (
                    <th key={index} className="px-2 py-2.5">Session {index + 1}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-b border-cardline-soft align-top hover:bg-offwhite-200/50">
                    <td className="sticky left-0 z-10 bg-offwhite-100 px-3 py-2">
                      <Link to={`/admin/patients/${row.id}`} className="font-semibold text-charcoal hover:text-sage">{row.patientName}</Link>
                      <p className="text-[11.5px] font-semibold text-sage">{row.patientCode}</p>
                      {row.program && <p className="text-[11px] text-charcoal/55">{row.program}</p>}
                    </td>
                    <td className="px-3 py-2 text-[12.5px] text-charcoal/75">{row.assignedDoctorName || '-'}</td>
                    <td className="px-3 py-2 text-center font-semibold">{row.counts.followUps}</td>
                    <td className="px-3 py-2 text-center font-semibold">{row.counts.familySessions}</td>
                    <td className="px-3 py-2 text-center"><span className="rounded-full bg-[#E8F5EC] px-2.5 py-0.5 font-bold text-[#1F6B41]">{row.counts.improvements}</span></td>
                    <td className="px-3 py-2 text-center"><span className="rounded-full bg-[#FDECEA] px-2.5 py-0.5 font-bold text-[#9F1D1D]">{row.counts.problems}</span></td>
                    <td className="px-3 py-2 text-[12px]">
                      {row.inMarketing
                        ? <Link to="/admin/digital-marketing" className="font-semibold text-[#1F6B41] hover:underline">In sheet{row.marketingMonth ? ` · ${monthLabel(row.marketingMonth)}` : ''}</Link>
                        : row.qualifies ? <span className="font-semibold text-[#9C6B2E]">Qualifies</span> : null}
                      {!row.inMarketing && month !== 'all' && row.counts.improvements > 0 && (
                        <button type="button" onClick={() => addToMarketing(row)} disabled={adding === row.id}
                          className="mt-1 flex items-center gap-1 font-semibold text-sage hover:underline disabled:opacity-50">
                          <Send size={12} />{adding === row.id ? 'Adding...' : 'Add to sheet'}
                        </button>
                      )}
                      {!row.inMarketing && !(month !== 'all' && row.counts.improvements > 0) && !row.qualifies && <span className="text-charcoal/40">-</span>}
                    </td>
                    {Array.from({ length: columnCount }, (_, index) => (
                      <td key={index} className="px-2 py-2"><SessionCell session={row.sessions[index]} /></td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {total > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-cardline-soft px-3.5 py-2.5 text-[12.5px] text-charcoal/70">
            <span>{(page - 1) * PAGE_SIZE + 1}-{Math.min(page * PAGE_SIZE, total)} of {total} patients</span>
            <span className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1 || loading}>Previous</Button>
              <span className="font-semibold text-charcoal">Page {page} / {pages}</span>
              <Button size="sm" variant="outline" onClick={() => setPage((p) => Math.min(pages, p + 1))} disabled={page >= pages || loading}>Next</Button>
            </span>
          </div>
        )}
      </Card>
    </div>
  );
}
