import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import useStaleState from '../../hooks/useStaleState.js';
import { io } from 'socket.io-client';
import { CalendarDays, CheckCircle2, Search } from 'lucide-react';
import api from '../../api/axios.js';
import Card from '../../components/ui/Card.jsx';
import Badge from '../../components/ui/Badge.jsx';
import Button from '../../components/ui/Button.jsx';
import PostCounselingRecordModal from '../../components/postcounseling/PostCounselingRecordModal.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { ROLES } from '../../constants/roles.js';
import { ClipboardCheck as PageTitleIcon } from 'lucide-react';

const CATEGORY = { autism_adhd: 'Autism / ADHD', mental_health: 'Mental Health' };
const rupees = (value) => `Rs ${Number(value || 0).toLocaleString('en-IN')}`;
const longDate = (iso) => (iso ? new Date(`${iso}T12:00:00`).toLocaleDateString('en-IN', { weekday: 'long', day: '2-digit', month: 'short', year: 'numeric' }) : 'No date');
const todayIso = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
const inputClass = 'rounded-lg border border-cardline bg-offwhite-200 px-3 py-2 text-sm focus:border-sage focus:outline-none focus:ring-2 focus:ring-sage/20';

// Every saved post-counselling record, grouped by consultation date, so a day's counselling can be looked up later.
const PostCounselingDone = () => {
  const { user } = useAuth();
  const isCounselor = user?.role === ROLES.POST_COUNSELOR;
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [query, setQuery] = useState('');
  const [patients, setPatients] = useStaleState(`post-counseling-done:${from}:${to}:${query.trim()}`, []);
  const [loading, setLoading] = useState(!patients.length);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState(null);

  const load = useCallback(async () => {
    setLoading((was) => was || !patients.length); setError('');
    try {
      const params = {};
      if (from) params.from = from;
      if (to) params.to = to;
      if (query.trim()) params.q = query.trim();
      const { data } = await api.get('/post-counseling/done', { params, skipCache: true });
      setPatients(data.patients || []);
    } catch (err) { setError(err.response?.data?.message || 'Could not load records'); }
    finally { setLoading(false); }
  }, [from, to, query]);

  useEffect(() => { const timer = setTimeout(load, 250); return () => clearTimeout(timer); }, [load]);

  const loadRef = useRef(load);
  useEffect(() => { loadRef.current = load; }, [load]);
  useEffect(() => {
    const socket = io((import.meta.env.VITE_API_URL || 'http://localhost:5000/api').replace(/\/api\/?$/, ''), { auth: { token: localStorage.getItem('crm_token') }, transports: ['websocket', 'polling'] });
    socket.on('post-counseling:changed', () => loadRef.current());
    return () => socket.disconnect();
  }, []);

  const days = useMemo(() => {
    const groups = new Map();
    patients.forEach((patient) => {
      const key = patient.consultationDate || '';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(patient);
    });
    return [...groups.entries()];
  }, [patients]);

  return (
    <div>
      <div className="mb-5">
        <h1 className="flex items-center gap-3 font-display text-2xl font-bold text-charcoal"><PageTitleIcon size={20} aria-hidden="true" />Post Counseling Done</h1>
        <p className="text-sm text-charcoal/60">Saved post-counselling records by consultation date. Open any patient to see everything that was filled.</p>
      </div>
      <Card className="mb-4 flex flex-wrap items-end gap-3 p-3">
        <label className="text-xs font-semibold text-charcoal/65">From<input type="date" value={from} onChange={(event) => setFrom(event.target.value)} className={`${inputClass} mt-1 block`} /></label>
        <label className="text-xs font-semibold text-charcoal/65">To<input type="date" value={to} onChange={(event) => setTo(event.target.value)} className={`${inputClass} mt-1 block`} /></label>
        <Button variant="outline" size="sm" onClick={() => { const today = todayIso(); setFrom(today); setTo(today); }}><CalendarDays size={14} /> Today</Button>
        <Button variant="outline" size="sm" onClick={() => { setFrom(''); setTo(''); setQuery(''); }}>Clear</Button>
        <div className="relative ml-auto w-full sm:w-72">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-charcoal/40" />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name, Patient ID or number" className={`${inputClass} w-full pl-9`} />
        </div>
      </Card>
      {error && <div className="mb-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      {loading && !patients.length ? <p className="py-12 text-center text-sm text-charcoal/55">Loading...</p>
        : !patients.length ? <Card className="py-12 text-center"><CheckCircle2 className="mx-auto mb-2 text-charcoal/30" size={32} /><p className="text-sm text-charcoal/55">No post-counselling records for this filter.</p></Card>
          : <div className="space-y-6">{days.map(([date, rows]) => (
            <section key={date || 'none'}>
              <div className="mb-2 flex items-center gap-2"><h2 className="font-display text-base font-bold text-charcoal">{longDate(date)}</h2><Badge>{rows.length} {rows.length === 1 ? 'patient' : 'patients'}</Badge></div>
              <div className="grid gap-3 lg:grid-cols-2">
                {rows.map((patient) => (
                  <Card key={patient.id} className="space-y-2 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0"><p className="truncate font-display text-base font-bold text-charcoal">{patient.patientName}</p><p className="text-sm font-semibold text-sage">{patient.patientId}</p></div>
                      <div className="flex flex-wrap gap-1.5"><Badge>{CATEGORY[patient.category] || patient.category}</Badge>{patient.outcome && <Badge tone={patient.outcome.kind === 'converted' ? 'active' : 'danger'}>{patient.outcome.kind === 'converted' ? 'Converted' : 'Package not purchased'}</Badge>}{patient.decision && <Badge tone={patient.decision === 'Proceeding' ? 'active' : patient.decision === 'Not Proceeding' ? 'danger' : 'amber'}>{patient.decision}</Badge>}</div>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-3">
                      <div><p className="font-semibold uppercase tracking-wide text-charcoal/45">Reference value</p><p className="text-sm font-bold text-charcoal">{rupees(patient.referenceValue)}</p></div>
                      <div><p className="font-semibold uppercase tracking-wide text-charcoal/45">Approved fee</p><p className="text-sm font-bold text-charcoal">{rupees(patient.approvedProgramFee)}</p></div>
                      <div><p className="font-semibold uppercase tracking-wide text-charcoal/45">Payment plan</p><p className="text-sm font-bold text-charcoal">{patient.paymentPlan || '-'}</p></div>
                      {patient.purchaseSaved && <div><p className="font-semibold uppercase tracking-wide text-charcoal/45">Received now</p><p className="text-sm font-bold text-charcoal">{rupees(patient.amountReceivedNow)}</p></div>}
                      {patient.poNo && <div><p className="font-semibold uppercase tracking-wide text-charcoal/45">PO No.</p><p className="text-sm font-bold text-charcoal">{patient.poNo}</p></div>}
                    </div>
                    {patient.components.length > 0 && <p className="text-xs text-charcoal/65"><b>{patient.components.length} components:</b> {patient.components.join(', ')}</p>}
                    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-cardline pt-2">
                      <p className="text-xs text-charcoal/50">{!isCounselor && `${patient.postCounselorName} · `}Saved {patient.savedAt ? new Date(patient.savedAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''}</p>
                      <Button size="sm" variant="outline" onClick={() => setSelected(patient)}>View details</Button>
                    </div>
                  </Card>
                ))}
              </div>
            </section>
          ))}</div>}
      <PostCounselingRecordModal patient={selected} readOnly onClose={() => setSelected(null)} />
    </div>
  );
};

export default PostCounselingDone;
