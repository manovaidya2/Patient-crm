import { useCallback, useEffect, useRef, useState } from 'react';
import useStaleState from '../../hooks/useStaleState.js';
import useLiveEvent from '../../api/useLiveEvent.js';
import { ArrowLeftRight, Inbox, Phone, Search, Undo2 } from 'lucide-react';
import Modal from '../../components/ui/Modal.jsx';
import api from '../../api/axios.js';
import Card from '../../components/ui/Card.jsx';
import Badge from '../../components/ui/Badge.jsx';
import Button from '../../components/ui/Button.jsx';
import PostCounselingRecordModal from '../../components/postcounseling/PostCounselingRecordModal.jsx';
import NotGivenModal from '../../components/postcounseling/NotGivenModal.jsx';
import { Ban } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.jsx';
import { ROLES, isAdminLike } from '../../constants/roles.js';
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
  const [query, setQuery] = useState('');
  const [patients, setPatients] = useStaleState(`post-counseling-patients:${query.trim()}`, []);
  const [defs, setDefs] = useStaleState('post-counseling-patients:defs', { fieldDefs: [], groups: [] });
  const [loading, setLoading] = useState(!patients.length);
  const [error, setError] = useState('');
  const [recordPatient, setRecordPatient] = useState(null);
  // Post counselling not done / treatment not given: moves the patient to the Treatment Not Given page.
  const [notGivenPatient, setNotGivenPatient] = useState(null);
  const canMoveNotGiven = [ROLES.ADMIN, ROLES.MANAGER, ROLES.POST_COUNSELOR].includes(user?.role);
  // Admin / Manager: a patient sent to the wrong Post Counselor goes to another one.
  const canReassign = isAdminLike(user);
  const [moveTarget, setMoveTarget] = useState(null);
  const [counselors, setCounselors] = useState([]);
  const [moveTo, setMoveTo] = useState('');
  const [moveReason, setMoveReason] = useState('');
  const [moving, setMoving] = useState(false);
  const [moveError, setMoveError] = useState('');
  // Something reception filled is wrong: back to reception with a note; it returns once corrected and sent again.
  const canReturn = isCounselor || isAdminLike(user);
  const [returnTarget, setReturnTarget] = useState(null);
  const [returnReason, setReturnReason] = useState('');
  const [returning, setReturning] = useState(false);
  const [returnError, setReturnError] = useState('');
  const sendBack = async () => {
    setReturning(true); setReturnError('');
    try { await api.post(`/post-counseling/patients/${returnTarget.id}/return`, { reason: returnReason }); setReturnTarget(null); load(); }
    catch (err) { setReturnError(err.response?.data?.message || 'Could not send it back'); }
    finally { setReturning(false); }
  };
  const openMove = async (patient) => {
    setMoveTarget(patient); setMoveTo(''); setMoveReason(''); setMoveError('');
    try { const { data } = await api.get('/users/post-counselors'); setCounselors(data.postCounselors || []); } catch { setCounselors([]); }
  };
  const move = async () => {
    setMoving(true); setMoveError('');
    try { await api.put(`/post-counseling/patients/${moveTarget.id}/counselor`, { postCounselorId: moveTo, reason: moveReason }); setMoveTarget(null); load(); }
    catch (err) { setMoveError(err.response?.data?.message || 'Could not move the patient'); }
    finally { setMoving(false); }
  };

  const load = useCallback(async () => {
    setLoading((was) => was || !patients.length); setError('');
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
  useLiveEvent('post-counseling:changed', () => loadRef.current());

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
                  <p className="text-sm font-semibold text-sage">{patient.patientId}{patient.existingPatientCode && <span className="ml-2 rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-bold text-sky-900">Existing patient · next phase</span>}</p>
                </div>
                <div className="flex flex-wrap items-center gap-1.5"><Badge>{CATEGORY[patient.category] || patient.category}</Badge></div>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <Item label="Consultation date" value={formatDate(patient.consultationDate)} />
                <Item label="Arrived" value={patient.meta?.arrivalTime} />
                <Item label="Token no." value={patient.meta?.tokenNumber} />
                <Item label="Primary concern" value={patient.primaryConcern} />
                {!isCounselor && <Item label="Post Counselor" value={<span className="inline-flex flex-wrap items-center gap-2">{patient.postCounselorName}{canReassign && <button type="button" onClick={() => openMove(patient)} className="inline-flex items-center gap-1 rounded-md border border-cardline bg-white px-1.5 py-0.5 text-[11px] font-semibold text-sage hover:bg-[#F3F6F2]"><ArrowLeftRight size={11} />Change</button>}</span>} />}
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
                  {canReturn && <Button size="sm" variant="outline" onClick={() => { setReturnTarget(patient); setReturnReason(''); setReturnError(''); }}><Undo2 size={14} />Send back to reception</Button>}
                  {canMoveNotGiven && <Button size="sm" variant="outline" className="!border-[#FCA5A5] !text-[#9F1D1D] hover:!bg-[#FEF2F2]" onClick={() => setNotGivenPatient(patient)}><Ban size={14} />Treatment not given</Button>}
                  <Button size="sm" onClick={() => setRecordPatient(patient)}>{patient.recordSavedAt ? 'Open post counseling record' : 'Fill post counseling record'}</Button>
                </span>
              </div>
              <p className="pt-2 text-xs text-charcoal/50">Sent by {patient.sentByName || 'Reception'} · {formatStamp(patient.sentAt)} · {patient.appointmentCode}</p>
              {patient.lastReturn && <p className="text-xs font-semibold text-sky-900">Sent back to reception by {patient.lastReturn.byName} ({patient.lastReturn.reason}) · corrected and sent again{patient.lastReturn.resentByName ? ` by ${patient.lastReturn.resentByName}` : ''} {formatStamp(patient.lastReturn.resentAt)}</p>}
              {patient.reassignedFrom && <p className="text-xs font-semibold text-[#9A3412]">Moved from {patient.reassignedFrom.fromName || '-'} to {patient.reassignedFrom.toName} by {patient.reassignedFrom.byName} · {formatStamp(patient.reassignedFrom.at)}{patient.reassignedFrom.reason ? ` · ${patient.reassignedFrom.reason}` : ''}</p>}
            </Card>
          ))}</div>}
      <PostCounselingRecordModal patient={recordPatient} onClose={() => setRecordPatient(null)} onSaved={load} />
      <NotGivenModal patient={notGivenPatient} onClose={() => setNotGivenPatient(null)} onDone={load} />
      <Modal open={Boolean(returnTarget)} onClose={() => !returning && setReturnTarget(null)} title="Send back to reception">
        {returnTarget && <div className="space-y-3 text-sm">
          <p className="text-charcoal/75"><b>{returnTarget.patientName}</b> ({returnTarget.patientId}) goes back to reception. Write what is wrong; reception sees this note, corrects the registration and sends the patient to you again.</p>
          <label className="block text-xs font-semibold text-charcoal/60">What has to be corrected *
            <textarea className="mt-1 w-full rounded-lg border border-cardline bg-white px-3 py-2 text-sm font-normal text-charcoal" rows={3} maxLength={1000} value={returnReason} onChange={(event) => setReturnReason(event.target.value)} placeholder="e.g. Date of birth is wrong, mother's number missing" />
          </label>
          {returnError && <p className="text-xs text-[#8C3B2E]">{returnError}</p>}
          <div className="flex justify-end gap-2"><Button variant="ghost" disabled={returning} onClick={() => setReturnTarget(null)}>Cancel</Button><Button disabled={returning || returnReason.trim().length < 3} onClick={sendBack}><Undo2 size={14} />{returning ? 'Sending back...' : 'Send back'}</Button></div>
        </div>}
      </Modal>
      <Modal open={Boolean(moveTarget)} onClose={() => !moving && setMoveTarget(null)} title="Change Post Counselor">
        {moveTarget && <div className="space-y-3 text-sm">
          <p className="text-charcoal/75"><b>{moveTarget.patientName}</b> ({moveTarget.patientId}) is with <b>{moveTarget.postCounselorName || '-'}</b>. Choose who should handle the post counselling instead. Anything already filled stays with the patient.</p>
          <label className="block text-xs font-semibold text-charcoal/60">New Post Counselor
            <select className="mt-1 w-full rounded-lg border border-cardline bg-white px-3 py-2 text-sm font-normal text-charcoal" value={moveTo} onChange={(event) => setMoveTo(event.target.value)}>
              <option value="">Select</option>
              {counselors.filter((c) => String(c.id) !== String(moveTarget.postCounselor)).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          <label className="block text-xs font-semibold text-charcoal/60">Reason (optional)
            <input className="mt-1 w-full rounded-lg border border-cardline bg-white px-3 py-2 text-sm font-normal text-charcoal" maxLength={500} value={moveReason} onChange={(event) => setMoveReason(event.target.value)} placeholder="e.g. sent to the wrong person" />
          </label>
          {moveError && <p className="text-xs text-[#8C3B2E]">{moveError}</p>}
          <div className="flex justify-end gap-2"><Button variant="ghost" disabled={moving} onClick={() => setMoveTarget(null)}>Cancel</Button><Button disabled={moving || !moveTo} onClick={move}><ArrowLeftRight size={14} />{moving ? 'Moving...' : 'Move patient'}</Button></div>
        </div>}
      </Modal>
    </div>
  );
};

export default PostCounselingPatients;
