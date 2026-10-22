import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, Clock3, Package, Phone, Pill, RefreshCw, Stethoscope, UserRound } from 'lucide-react';
import api from '../../api/axios.js';
import Button from '../../components/ui/Button.jsx';
import Badge from '../../components/ui/Badge.jsx';
import Modal from '../../components/ui/Modal.jsx';
import { CompactAttachments } from '../../components/ui/Attachments.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { ROLES } from '../../constants/roles.js';

const input = 'w-full rounded-lg border border-cardline bg-white px-3 py-2 text-sm';
const when = (value) => (value ? new Date(value).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-');
const localNow = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16); };
const MODE_TEXT = { pickup: 'Collected at clinic', porter: 'Sent by porter', courier: 'Sent by courier' };
const Row = ({ label, value }) => (value ? <p className="text-sm"><span className="text-charcoal/55">{label}: </span>{value}</p> : null);

// The PCC's (Patient Care Coordinator, role assistant_doctor) worklist: every patient whose medicine has to be explained, with what was sent and
// how it reached them. Completing the explanation starts the treatment for that phase.
export default function MedicineExplanations() {
  const { user } = useAuth();
  const [items, setItems] = useState([]);
  const [date, setDate] = useState('');
  const [status, setStatus] = useState('pending');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [completedAt, setCompletedAt] = useState(localNow);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const load = useCallback(async () => {
    try { const { data } = await api.get('/transit/explanations', { params: { date, status }, skipCache: true }); setItems(data.items); setError(''); }
    catch (err) { setError(err.response?.data?.message || 'Could not load explanations'); }
    finally { setLoading(false); }
  }, [date, status]);
  useEffect(() => { load(); const timer = setInterval(load, 30000); return () => clearInterval(timer); }, [load]);
  const complete = async (event) => {
    event.preventDefault(); setSaving(true); setError('');
    try {
      await api.post(`/transit/${selected.patientId}/${selected.stage}/complete-explanation`, { completedAt: new Date(completedAt).toISOString(), notes });
      setSelected(null); await load();
    } catch (err) { setError(err.response?.data?.message || 'Could not complete explanation'); }
    finally { setSaving(false); }
  };
  const readiness = (item) => {
    if (item.explanation.completedAt) return ['done', 'Explained'];
    if (item.onHold) return ['hold', 'On hold'];
    if (!item.pcc?.assigned) return ['wait', 'PCC not assigned yet'];
    if (item.courier?.status !== 'delivered') return ['wait', item.courier?.status === 'dispatched' ? 'Medicine on the way' : 'Awaiting medicine handover'];
    if (item.payment?.remaining > 0 || item.payment?.pendingCount) return ['wait', 'Payment not complete'];
    return ['ready', 'Ready to explain'];
  };
  const tone = { done: 'inactive', hold: 'danger', wait: 'amber', ready: 'teal' };
  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold"><Stethoscope size={24} />Medicine Explanations</h1>
          <p className="text-sm text-charcoal/65">Patients assigned to {user?.role === ROLES.ADMIN ? 'each PCC' : 'you'} for the medicine explanation. Completing it starts the treatment of that phase.</p>
        </div>
        <Button variant="outline" onClick={load} title="Refresh"><RefreshCw size={16} /></Button>
      </header>
      <div className="flex flex-wrap gap-3 border-y border-cardline py-3">
        <label className="space-y-1 text-sm">Scheduled date<input className={input} type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label>
        <label className="space-y-1 text-sm">Status<select className={input} value={status} onChange={(event) => setStatus(event.target.value)}><option value="pending">Pending</option><option value="done">Completed</option><option value="all">All</option></select></label>
      </div>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      {loading ? <p>Loading...</p> : !items.length ? <p className="text-sm text-charcoal/60">No explanations for this selection.</p> : (
        <div className="grid gap-3">
          {items.map((item) => {
            const [state, text] = readiness(item);
            const canComplete = state === 'ready';
            return (
              <article key={item.key} className={`rounded-xl border p-4 ${!item.explanation.completedAt && item.pcc?.assigned ? 'border-orange-400 bg-orange-50/50 ring-1 ring-orange-300' : 'border-cardline bg-white'}`}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link className="text-base font-bold text-charcoal hover:text-sage" to={`/admin/patients/${item.patientId}`}>{item.patientName}</Link>
                      <span className="text-sm text-charcoal/60">{item.patientCode} · Phase {item.stage}</span>
                      <Badge tone={tone[state]}>{text}</Badge>
                    </div>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-3 text-sm text-charcoal/70">
                      {item.guardianName && <span className="inline-flex items-center gap-1"><UserRound size={13} />{item.guardianName}</span>}
                      {item.patientPhone && <a className="inline-flex items-center gap-1 font-semibold text-sage" href={`tel:${item.patientPhone}`}><Phone size={13} />{item.patientPhone}</a>}
                      {item.patientDetails?.age && <span>Age {item.patientDetails.age}</span>}
                    </p>
                  </div>
                  <div className="text-right text-sm">
                    <p className="flex items-center justify-end gap-1 font-semibold text-charcoal"><Clock3 size={14} className="text-sage" />{when(item.explanation.at)}</p>
                    <p className="text-charcoal/60">{item.explanation.mode || 'phone'} · PCC {item.assignments.assistantDoctor?.name || 'not assigned'}</p>
                  </div>
                </div>
                <div className="mt-3 grid gap-x-6 gap-y-2 sm:grid-cols-2">
                  <div className="rounded-lg bg-offwhite-200/60 p-3">
                    <p className="mb-1 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-charcoal/50"><Pill size={12} />Medicine to explain</p>
                    <Row label="PO" value={item.medicine?.poNumber} />
                    <Row label="Supply" value={item.medicine?.supplyLabel} />
                    <Row label="Medicines" value={item.medicine?.medicines} />
                    <Row label="Notes" value={item.medicine?.notes} />
                    {item.medicine?.medicineImages?.length > 0 && <CompactAttachments files={item.medicine.medicineImages} label="Medicine photo" />}
                  </div>
                  <div className="rounded-lg bg-offwhite-200/60 p-3">
                    <p className="mb-1 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-charcoal/50"><Package size={12} />How it reached the patient</p>
                    <Row label="Delivery" value={item.mode ? MODE_TEXT[item.mode] : ''} />
                    <Row label="Received" value={item.courier?.deliveredAt ? `${item.courier.receivedByName || ''} ${when(item.courier.deliveredAt)}`.trim() : item.courier?.status === 'dispatched' ? `Dispatched ${when(item.courier.dispatchedAt)} (${[item.courier.courierPartner, item.courier.trackingNumber].filter(Boolean).join(' / ')})` : ''} />
                    <Row label="Assigned" value={item.pcc?.assigned ? `${when(item.pcc.at)} by ${item.pcc.byName}` : ''} />
                    {item.explanation.completedAt && <><Row label="Explained" value={`${when(item.explanation.completedAt)} by ${item.explanation.completedBy}`} /><p className="break-words text-sm text-charcoal/80">{item.explanation.note}</p></>}
                  </div>
                </div>
                {!item.explanation.completedAt && (
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs text-charcoal/55">{canComplete ? 'Explain the doses and chits, then complete - this starts the treatment.' : text}</p>
                    <Button size="sm" disabled={!canComplete} onClick={() => { setSelected(item); setCompletedAt(localNow()); setNotes(''); setError(''); }}><Check size={15} />Complete explanation</Button>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
      <Modal open={Boolean(selected)} onClose={() => !saving && setSelected(null)} title="Complete medicine explanation">
        <form onSubmit={complete} className="space-y-4">
          <p className="font-medium">{selected?.patientName} · Phase {selected?.stage}{selected?.medicine?.poNumber ? ` · ${selected.medicine.poNumber}` : ''}</p>
          {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
          <label className="block space-y-1 text-sm">Actual completion time<input className={input} type="datetime-local" required value={completedAt} max={localNow()} onChange={(event) => setCompletedAt(event.target.value)} /></label>
          <label className="block space-y-1 text-sm">Explanation notes<textarea className={input} required maxLength={2000} rows={4} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="What was explained: doses, chits, diet, next connect" /></label>
          <Button type="submit" disabled={saving}><Check size={16} />{saving ? 'Saving...' : 'Complete and start treatment'}</Button>
        </form>
      </Modal>
    </div>
  );
}
