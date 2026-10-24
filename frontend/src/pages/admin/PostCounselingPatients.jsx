import { useCallback, useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { Inbox, Phone, Search } from 'lucide-react';
import api from '../../api/axios.js';
import Card from '../../components/ui/Card.jsx';
import Badge from '../../components/ui/Badge.jsx';
import Button from '../../components/ui/Button.jsx';
import PostCounselingRecordModal from '../../components/postcounseling/PostCounselingRecordModal.jsx';
import NotGivenModal from '../../components/postcounseling/NotGivenModal.jsx';
import { Ban } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.jsx';
import { ROLES } from '../../constants/roles.js';
import { Users as PageTitleIcon } from 'lucide-react';

const CATEGORY = { autism_adhd: 'Autism / ADHD', mental_health: 'Mental Health' };
const formatDate = (iso) => (iso ? new Date(`${iso}T12:00:00`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '-');
const formatStamp = (iso) => (iso ? new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '-');

const Item = ({ label, value }) => (
  <div className="min-w-0"><p className="text-[11px] font-semibold uppercase tracking-wide text-charcoal/45">{label}</p><p className="break-words text-sm font-semibold text-charcoal">{value || <span className="font-normal text-charcoal/35">-</span>}</p></div>
);

// Patients reception has registered and sent to a Post Counselor, with only what matters for conversion.
const PostCounselingPatients = () => {
  const { user } = useAuth();
  const isCounselor = user?.role === ROLES.POST_COUNSELOR;
  const [patients, setPatients] = useState([]);
  const [defs, setDefs] = useState({ fieldDefs: [], groups: [] });
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [recordPatient, setRecordPatient] = useState(null);
  // Post counselling not done / treatment not given: moves the patient to the Treatment Not Given page.
  const [notGivenPatient, setNotGivenPatient] = useState(null);
  const canMoveNotGiven = [ROLES.ADMIN, ROLES.POST_COUNSELOR].includes(user?.role);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const { data } = await api.get('/post-counseling/patients', { params: query.trim() ? { q: query.trim() } : {}, skipCache: true });
      setPatients(data.patients || []);
      setDefs({ fieldDefs: data.fieldDefs || [], groups: data.groups || [] });
    } catch (err) { setError(err.response?.data?.message || 'Could not load patients'); }
    finally { setLoading(false); }
  }, [query]);

  useEffect(() => { const timer = setTimeout(load, 250); return () => clearTimeout(timer); }, [load]);

  // New patients from reception appear without refreshing the page.
  const loadRef = useRef(load);
  useEffect(() => { loadRef.current = load; }, [load]);
  useEffect(() => {
    const socket = io((import.meta.env.VITE_API_URL || 'http://localhost:5000/api').replace(/\/api\/?$/, ''), { auth: { token: localStorage.getItem('crm_token') }, transports: ['websocket', 'polling'] });
    socket.on('post-counseling:changed', () => loadRef.current());
    socket.on('connect', () => loadRef.current());
    return () => socket.disconnect();
  }, []);

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-3 font-display text-2xl font-bold text-charcoal"><PageTitleIcon size={20} aria-hidden="true" />Post Counseling Patients</h1>
          <p className="text-sm text-charcoal/60">{isCounselor ? 'Patients reception has sent to you.' : 'Patients sent by reception to Post Counselors.'}</p>
        </div>
        <div className="relative w-full sm:w-72">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-charcoal/40" />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name, Patient ID or number" className="w-full rounded-lg border border-cardline bg-offwhite-200 py-2.5 pl-9 pr-3 text-sm focus:border-sage focus:outline-none focus:ring-2 focus:ring-sage/20" />
        </div>
      </div>
      {error && <div className="mb-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      {loading && !patients.length ? <p className="py-12 text-center text-sm text-charcoal/55">Loading...</p>
        : !patients.length ? <Card className="py-12 text-center"><Inbox className="mx-auto mb-2 text-charcoal/30" size={32} /><p className="text-sm text-charcoal/55">No patients have been sent yet.</p></Card>
          : <div className="grid gap-3 lg:grid-cols-2">{patients.map((patient) => (
            <Card key={patient.id} className="space-y-3 p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-display text-lg font-bold text-charcoal">{patient.patientName}</p>
                  <p className="text-sm font-semibold text-sage">{patient.patientId}</p>
                </div>
                <div className="flex flex-wrap items-center gap-1.5"><Badge>{CATEGORY[patient.category] || patient.category}</Badge></div>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <Item label="Consultation date" value={formatDate(patient.consultationDate)} />
                <Item label="Arrived" value={patient.meta?.arrivalTime} />
                <Item label="Token no." value={patient.meta?.tokenNumber} />
                <Item label="Primary concern" value={patient.primaryConcern} />
                {!isCounselor && <Item label="Post Counselor" value={patient.postCounselorName} />}
              </div>
              {defs.groups.map(([groupKey, groupLabel]) => {
                const items = defs.fieldDefs.filter((definition) => definition.group === groupKey && (!definition.onlyFor || definition.onlyFor === patient.fields.category));
                if (!items.length) return null;
                return (
                  <div key={groupKey} className="border-t border-cardline pt-3">
                    <p className="mb-2 text-xs font-bold uppercase tracking-wide text-sage">{groupLabel}</p>
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                      {items.map((definition) => {
                        const raw = patient.fields[definition.key];
                        const value = definition.key === 'category' ? CATEGORY[raw] || raw : definition.type === 'date' ? formatDate(raw) : raw;
                        const phone = definition.type === 'tel' && raw;
                        return <Item key={definition.key} label={definition.label} value={phone ? <a href={`tel:${raw}`} className="inline-flex items-center gap-1 text-sage"><Phone size={12} />{raw}</a> : value} />;
                      })}
                    </div>
                  </div>
                );
              })}
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-cardline pt-3">
                <span className={`rounded px-2 py-1 text-xs font-semibold ${patient.recordSavedAt ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>{patient.recordSavedAt ? 'Record saved' : 'Record not filled'}</span>
                <span className="flex flex-wrap gap-2">
                  {canMoveNotGiven && <Button size="sm" variant="outline" className="!border-[#FCA5A5] !text-[#9F1D1D] hover:!bg-[#FEF2F2]" onClick={() => setNotGivenPatient(patient)}><Ban size={14} />Treatment not given</Button>}
                  <Button size="sm" onClick={() => setRecordPatient(patient)}>{patient.recordSavedAt ? 'Open post counseling record' : 'Fill post counseling record'}</Button>
                </span>
              </div>
              <p className="pt-2 text-xs text-charcoal/50">Sent by {patient.sentByName || 'Reception'} · {formatStamp(patient.sentAt)} · {patient.appointmentCode}</p>
            </Card>
          ))}</div>}
      <PostCounselingRecordModal patient={recordPatient} onClose={() => setRecordPatient(null)} onSaved={load} />
      <NotGivenModal patient={notGivenPatient} onClose={() => setNotGivenPatient(null)} onDone={load} />
    </div>
  );
};

export default PostCounselingPatients;
