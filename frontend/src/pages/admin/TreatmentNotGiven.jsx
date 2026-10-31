import { useCallback, useEffect, useRef, useState } from 'react';
import useStaleState from '../../hooks/useStaleState.js';
import { io } from 'socket.io-client';
import { Ban, History, Inbox, Phone, RotateCcw, Search } from 'lucide-react';
import api from '../../api/axios.js';
import Card from '../../components/ui/Card.jsx';
import Badge from '../../components/ui/Badge.jsx';
import Button from '../../components/ui/Button.jsx';
import Modal from '../../components/ui/Modal.jsx';
import PostCounselingRecordModal from '../../components/postcounseling/PostCounselingRecordModal.jsx';
import { PageHeader } from '../../components/ui/Layout.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { ROLES } from '../../constants/roles.js';

const CATEGORY = { autism_adhd: 'Autism / ADHD', mental_health: 'Mental Health' };
const formatDate = (iso) => (iso ? new Date(`${iso}T12:00:00`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '-');
const stamp = (iso) => (iso ? new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-');
const Item = ({ label, value }) => (
  <div className="min-w-0"><p className="text-[10.5px] font-bold uppercase tracking-wide text-charcoal/55">{label}</p><p className="break-words text-[13px] font-semibold text-charcoal">{value || <span className="font-normal text-charcoal/40">-</span>}</p></div>
);

// Patients whose post counselling did not happen or who were not given treatment. Restore brings them back to
// Post Counseling Patients; every move and restore stays in the history.
export default function TreatmentNotGiven() {
  const { user } = useAuth();
  const canAct = [ROLES.ADMIN, ROLES.MANAGER, ROLES.POST_COUNSELOR].includes(user?.role);
  const isCounselor = user?.role === ROLES.POST_COUNSELOR;
  const [query, setQuery] = useState('');
  const [patients, setPatients] = useStaleState(`treatment-not-given:${query.trim()}`, []);
  const [loading, setLoading] = useState(!patients.length);
  const [error, setError] = useState('');
  const [restoring, setRestoring] = useState(null);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [recordPatient, setRecordPatient] = useState(null);

  const load = useCallback(async () => {
    setLoading((was) => was || !patients.length); setError('');
    try {
      const { data } = await api.get('/post-counseling/not-given', { params: query.trim() ? { q: query.trim() } : {}, skipCache: true });
      setPatients(data.patients || []);
    } catch (err) { setError(err.response?.data?.message || 'Could not load patients'); }
    finally { setLoading(false); }
  }, [query]);
  useEffect(() => { const timer = setTimeout(load, 250); return () => clearTimeout(timer); }, [load]);

  const loadRef = useRef(load);
  useEffect(() => { loadRef.current = load; }, [load]);
  useEffect(() => {
    const socket = io((import.meta.env.VITE_API_URL || 'http://localhost:5000/api').replace(/\/api\/?$/, ''), { auth: { token: localStorage.getItem('crm_token') }, transports: ['websocket', 'polling'] });
    socket.on('post-counseling:changed', () => loadRef.current());
    return () => socket.disconnect();
  }, []);

  const restore = async (event) => {
    event.preventDefault();
    setSaving(true); setError('');
    try {
      await api.post(`/post-counseling/patients/${restoring.id}/restore`, { note });
      setRestoring(null); setNote('');
      await load();
    } catch (err) { setError(err.response?.data?.message || 'Could not restore the patient'); }
    finally { setSaving(false); }
  };

  return (
    <div className="space-y-4">
      <PageHeader icon={Ban} title="Treatment Not Given"
        subtitle={`${patients.length} patient(s) · post counselling not done or treatment not given. Restore a patient to send them back to Post Counseling Patients.`}
        actions={<div className="relative w-full sm:w-72"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-charcoal/40" /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name, Patient ID or number" className="w-full rounded-[10px] border border-[#DED2BD] bg-white py-2.5 pl-9 pr-3 text-sm" /></div>} />
      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      {loading && !patients.length ? <p className="py-12 text-center text-sm text-charcoal/55">Loading...</p>
        : !patients.length ? <Card className="py-12 text-center"><Inbox className="mx-auto mb-2 text-charcoal/30" size={32} /><p className="text-sm text-charcoal/60">No patients here.</p></Card>
          : <div className="grid gap-3 lg:grid-cols-2">{patients.map((patient) => {
            const ng = patient.notGiven || {};
            const f = patient.fields || {};
            return (
              <Card key={patient.id} className="space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-display text-[17px] font-extrabold text-charcoal">{patient.patientName}</p>
                    <p className="text-[13px] font-semibold text-sage">{patient.patientId || patient.appointmentCode}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge>{CATEGORY[patient.category] || patient.category}</Badge>
                    <span className="rounded-full bg-[#FDE2E1] px-2.5 py-0.5 text-[11px] font-bold text-[#9F1D1D]">{ng.kindLabel || 'Treatment not given'}</span>
                  </div>
                </div>
                <div className="rounded-[10px] border border-[#FCA5A5]/60 bg-[#FEF2F2] px-3 py-2.5 text-[13px]">
                  <p className="font-semibold text-[#9F1D1D]">Reason: <span className="font-normal text-charcoal">{ng.reason || '-'}</span></p>
                  <p className="mt-0.5 text-[11.5px] text-charcoal/60">Moved by {ng.byName || '-'} · {stamp(ng.at)}</p>
                </div>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  <Item label="Consultation date" value={formatDate(patient.consultationDate)} />
                  <Item label="Age" value={patient.age} />
                  {!isCounselor && <Item label="Post Counselor" value={patient.postCounselorName} />}
                  <Item label="Father / Mother" value={[f.fatherName, f.motherName].filter(Boolean).join(' / ')} />
                  <Item label="Phone" value={(f.fatherNumber || f.whatsappNumber || f.motherNumber) && <a href={`tel:${f.fatherNumber || f.whatsappNumber || f.motherNumber}`} className="inline-flex items-center gap-1 text-sage"><Phone size={12} />{f.fatherNumber || f.whatsappNumber || f.motherNumber}</a>} />
                  <Item label="Primary concern" value={patient.primaryConcern} />
                </div>
                {ng.history?.length > 0 && (
                  <details className="rounded-[10px] bg-[#FBF7ED] px-3 py-2 text-[12px]">
                    <summary className="flex cursor-pointer items-center gap-1.5 font-semibold text-charcoal/70"><History size={13} />History ({ng.history.length})</summary>
                    <ol className="mt-2 space-y-1">{[...ng.history].reverse().map((h, i) => <li key={i}><b className="text-charcoal">{h.action === 'restored' ? 'Restored to Post Counseling' : `Moved: ${h.kindLabel || h.kind}`}</b>{h.reason ? ` - ${h.reason}` : ''} <span className="text-charcoal/55">· {h.byName} · {stamp(h.at)}</span></li>)}</ol>
                  </details>
                )}
                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#F0E8D8] pt-3">
                  <span className="text-[11.5px] text-charcoal/55">Sent by {patient.sentByName || 'Reception'} · {stamp(patient.sentAt)}</span>
                  <span className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" onClick={() => setRecordPatient(patient)}>View record</Button>
                    {canAct && <Button size="sm" onClick={() => { setRestoring(patient); setNote(''); }}><RotateCcw size={14} />Restore to Post Counseling</Button>}
                  </span>
                </div>
              </Card>
            );
          })}</div>}
      <Modal open={Boolean(restoring)} onClose={() => !saving && setRestoring(null)} title={restoring ? `Restore ${restoring.patientName}` : ''} className="max-w-md">
        <form onSubmit={restore} className="space-y-3">
          <p className="text-sm text-charcoal/70">The patient goes back to <b>Post Counseling Patients</b> with everything filled so far.</p>
          <label className="block space-y-1 text-sm font-semibold text-charcoal">Note (optional)
            <textarea className="w-full rounded-[10px] border border-[#DED2BD] bg-white px-3 py-2 text-sm font-normal" rows={2} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Parents called back, ready for post counselling" />
          </label>
          <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setRestoring(null)} disabled={saving}>Cancel</Button><Button type="submit" disabled={saving}><RotateCcw size={14} />{saving ? 'Restoring...' : 'Restore'}</Button></div>
        </form>
      </Modal>
      <PostCounselingRecordModal patient={recordPatient} onClose={() => setRecordPatient(null)} onSaved={load} readOnly />
    </div>
  );
}
