import { useCallback, useEffect, useState } from 'react';
import useStaleState from '../../hooks/useStaleState.js';
import { Link } from 'react-router-dom';
import { CalendarClock, Check, ChevronLeft, ChevronRight, Clock3, Package, Phone, Pill, RefreshCw, Stethoscope, UserRound } from 'lucide-react';
import api from '../../api/axios.js';
import Button from '../../components/ui/Button.jsx';
import Badge from '../../components/ui/Badge.jsx';
import Modal from '../../components/ui/Modal.jsx';
import { CompactAttachments } from '../../components/ui/Attachments.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { ROLES, isAdminLike } from '../../constants/roles.js';
import { PageHeader } from '../../components/ui/Layout.jsx';
import { DosePapersView } from '../../components/medicine/DosePapers.jsx';
import PatientFile from '../../components/medicine/PatientFile.jsx';
import PoPostCounselling from './PoPostCounselling.jsx';
import PccCalendar, { pccSlotProblem } from '../../components/transit/PccCalendar.jsx';

const REASONS = [['not_picked', 'Call not picked up'], ['patient_request', 'Patient asked for another time'], ['other', 'Other']];
const pad2 = (n) => String(n).padStart(2, '0');
const localInputOf = (value) => { const d = new Date(value); return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`; };

// The PCC moves the explanation to another of their slots (e.g. the call was not picked up that day), with their
// calendar to pick a free day. Same slot rules as assigning: no Wednesday; Saturday, Sunday and Tuesday from 2 pm.
function RescheduleForm({ item, pccId, onDone, onCancel }) {
  const [at, setAt] = useState('');
  const [reason, setReason] = useState('not_picked');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const problem = pccSlotProblem(at);
  const pickDay = (day, afternoon) => { const typed = (at || '').slice(11, 16) || (item.explanation.at ? localInputOf(item.explanation.at).slice(11, 16) : '11:00'); setAt(`${day}T${afternoon && typed < '14:00' ? '14:00' : typed}`); };
  const submit = async (e) => {
    e.preventDefault();
    if (problem) { setError(problem); return; }
    setSaving(true); setError('');
    try { await api.post(`/transit/${item.patientId}/${item.stage}/reschedule-explanation`, { explanationAt: new Date(at).toISOString(), reason, note }); onDone(); }
    catch (err) { setError(err.response?.data?.message || 'Could not reschedule'); }
    finally { setSaving(false); }
  };
  return (
    <form onSubmit={submit} className="space-y-3">
      <p className="text-sm">{item.patientName} · Phase {item.stage} · now <b>{item.explanation.at ? new Date(item.explanation.at).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '-'}</b></p>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      <div className="flex flex-wrap gap-1.5">{REASONS.map(([key, label]) => <button key={key} type="button" onClick={() => setReason(key)} className={`rounded-full border px-3 py-1 text-xs font-semibold ${reason === key ? 'border-sage bg-sage text-white' : 'border-cardline bg-white text-charcoal/75'}`}>{label}</button>)}</div>
      <label className="block space-y-1 text-sm">New date & time<input className={input} type="datetime-local" required value={at} onChange={(e) => setAt(e.target.value)} /></label>
      {problem && <p className="text-xs font-semibold text-[#8C3B2E]">{problem}</p>}
      <PccCalendar pccId={pccId} value={at} onPick={pickDay} />
      <label className="block space-y-1 text-sm">Note (optional)<textarea className={input} rows={2} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. called twice at 11 am, no answer" /></label>
      <div className="flex justify-end gap-2"><Button type="button" variant="outline" disabled={saving} onClick={onCancel}>Cancel</Button><Button type="submit" disabled={saving || !at || Boolean(problem)}><CalendarClock size={15} />{saving ? 'Saving...' : 'Reschedule explanation'}</Button></div>
    </form>
  );
}

// Collapsed by default: the record is long and each card would otherwise load it.
function PcRecord({ poId }) {
  const [open, setOpen] = useState(false);
  return (
    <details className="mt-3 rounded-[10px] bg-white/70 p-3 ring-1 ring-[#EFE3CF]" onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary className="cursor-pointer text-sm font-bold text-charcoal">Post-counselling record (sections A to E)</summary>
      {open && <div className="mt-3"><PoPostCounselling poId={poId} /></div>}
    </details>
  );
}

const input = 'w-full rounded-lg border border-cardline bg-white px-3 py-2 text-sm';
const when = (value) => (value ? new Date(value).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-');
const localNow = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16); };
const MODE_TEXT = { pickup: 'Collected at clinic', porter: 'Sent by porter', courier: 'Sent by courier' };
const Row = ({ label, value }) => (value ? <p className="text-[12.5px]"><span className="text-charcoal/60">{label}: </span><span className="font-medium text-charcoal">{value}</span></p> : null);

// The PCC's (Patient Care Coordinator, role assistant_doctor) worklist: every patient whose medicine has to be explained, with what was sent and
// how it reached them. Completing the explanation starts the treatment for that phase.
export default function MedicineExplanations() {
  const { user } = useAuth();
  const [date, setDate] = useState('');
  const [status, setStatus] = useState('pending');
  const [items, setItems] = useStaleState(`medicine-explanations:${date}:${status}`, []);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(!items.length);
  const [selected, setSelected] = useState(null);
  const [completedAt, setCompletedAt] = useState(localNow);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [moving, setMoving] = useState(null);
  const [calMonth, setCalMonth] = useState(() => new Date().toLocaleDateString('en-CA').slice(0, 7));
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
    // The full PO value is not needed: no payment pending and some verified (a balance may go to the next PO).
    if (item.payment?.pendingCount) return ['wait', 'Payment pending verification'];
    if (!(item.payment?.amountPaid > 0 || item.payment?.remaining <= 0)) return ['wait', 'No payment verified yet'];
    return ['ready', 'Ready to explain'];
  };
  const tone = { done: 'inactive', hold: 'danger', wait: 'amber', ready: 'teal' };
  const pillTone = { done: 'bg-[#E6F2EA] text-[#1F6B41]', hold: 'bg-[#FDE2E1] text-[#9F1D1D]', wait: 'bg-[#FBF0DC] text-[#7C5B2E]', ready: 'bg-[#2F8F5B] text-white' };
  const dayKey = (value) => (value ? new Date(value).toLocaleDateString('en-CA') : '');
  const todayKey = new Date().toLocaleDateString('en-CA');
  const sorted = [...items].sort((a, b) => String(a.explanation.at || '9999').localeCompare(String(b.explanation.at || '9999')));
  const groups = sorted.reduce((acc, item) => { const k = dayKey(item.explanation.at) || 'none'; (acc[k] = acc[k] || []).push(item); return acc; }, {});
  const dayTitle = (k) => (k === 'none' ? 'Date not scheduled' : `${k === todayKey ? 'Today · ' : ''}${new Date(`${k}T12:00:00`).toLocaleDateString('en-IN', { weekday: 'long', day: '2-digit', month: 'short' })}`);
  const weekEnd = new Date(); weekEnd.setDate(weekEnd.getDate() + 7);
  const todayCount = items.filter((i) => dayKey(i.explanation.at) === todayKey).length;
  const weekCount = items.filter((i) => i.explanation.at && new Date(i.explanation.at) <= weekEnd && dayKey(i.explanation.at) >= todayKey).length;
  const counts = items.reduce((acc, i) => { const [st] = readiness(i); acc[st] = (acc[st] || 0) + 1; return acc; }, {});
  // Month calendar: days with an explanation are orange, today is dark; a click filters the list to that day.
  const monthBase = new Date(`${calMonth}-01T12:00:00`);
  const lead = (monthBase.getDay() + 6) % 7;
  const daysIn = new Date(monthBase.getFullYear(), monthBase.getMonth() + 1, 0).getDate();
  const hasDay = new Set(items.map((i) => dayKey(i.explanation.at)).filter(Boolean));
  const shiftMonth = (n) => { const d = new Date(monthBase); d.setMonth(d.getMonth() + n); setCalMonth(d.toLocaleDateString('en-CA').slice(0, 7)); };
  const chip = (active) => `rounded-full border px-3.5 py-1.5 text-xs font-bold ${active ? 'border-charcoal bg-charcoal text-white' : 'border-[#DED2BD] bg-white text-charcoal hover:bg-[#FBF7ED]'}`;
  return (
    <div className="space-y-4">
      <PageHeader icon={Stethoscope} title="Medicine Explanations"
        subtitle={`${todayCount} today · ${weekCount} in the next 7 days · Patients assigned to ${isAdminLike(user) ? 'each PCC' : 'you'} for the medicine explanation. Completing it starts the treatment of that phase.`}
        actions={<>
          <div className="inline-flex gap-1.5" role="group" aria-label="Status">{[['pending', 'Pending'], ['done', 'Completed'], ['all', 'All']].map(([v, l]) => <button key={v} type="button" aria-pressed={status === v} onClick={() => setStatus(v)} className={chip(status === v)}>{l}</button>)}</div>
          <Button variant="outline" size="sm" onClick={load} title="Refresh" aria-label="Refresh"><RefreshCw size={15} /></Button>
        </>} />
      <div className="flex flex-wrap items-end gap-3">
        <label className="space-y-1 text-[12px] font-semibold text-charcoal/70">Scheduled date<input className={input} type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label>
        <label className="space-y-1 text-[12px] font-semibold text-charcoal/70">Status<select className={input} value={status} onChange={(event) => setStatus(event.target.value)}><option value="pending">Pending</option><option value="done">Completed</option><option value="all">All</option></select></label>
        {date && <Button size="sm" variant="outline" onClick={() => setDate('')}>Show all dates</Button>}
      </div>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
        <section className="min-w-0 space-y-3" aria-label="Schedule">
          {loading && !items.length ? <p className="text-sm text-charcoal/60">Loading...</p> : !items.length ? <p className="rounded-[14px] border border-dashed border-[#DED2BD] bg-white p-8 text-center text-sm text-charcoal/60">No explanations for this selection.</p> : Object.entries(groups).map(([k, list]) => (
            <div key={k} className="space-y-3">
              <p className={`text-[10.5px] font-bold uppercase tracking-wide ${k === todayKey ? 'text-[#C2410C]' : 'text-charcoal/60'}`}>{dayTitle(k)} <span className="normal-case tracking-normal text-charcoal/55">· {list.length}</span></p>
              {list.map((item) => {
                const [state, text] = readiness(item);
                const canComplete = state === 'ready';
                const at = item.explanation.at ? new Date(item.explanation.at) : null;
                const hot = !item.explanation.completedAt && item.pcc?.assigned;
                return (
                  <div key={item.key} className="grid gap-3 sm:grid-cols-[72px_minmax(0,1fr)]">
                    <div className="pt-1 font-display text-[15px] font-extrabold text-charcoal sm:pt-3.5 sm:text-right">{at ? at.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '--'}<span className="block font-body text-[11px] font-semibold text-charcoal/60">{item.explanation.mode || 'phone'}</span></div>
                    <article className={`rounded-[14px] p-4 sm:p-[18px] ${state === 'ready' ? 'border-2 border-[#FDBA74] bg-[#FFF7ED]' : hot ? 'border-2 border-[#FDBA74]/70 bg-white' : 'border border-[#E8DFCB] bg-white'}`}>
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <Link className="font-display text-[15px] font-extrabold text-charcoal hover:text-sage" to={`/admin/patients/${item.patientId}`}>{item.patientName}</Link>
                            <span className="text-[12px] text-charcoal/60">{item.patientCode} · Phase {item.stage}{item.patientDetails?.age ? ` · Age ${item.patientDetails.age}` : ''}</span>
                          </div>
                          <p className="mt-0.5 flex flex-wrap items-center gap-x-3 text-[12.5px] text-charcoal/70">
                            {item.guardianName && <span className="inline-flex items-center gap-1"><UserRound size={13} />{item.guardianName}</span>}
                            {item.patientPhone && <a className="inline-flex items-center gap-1 font-semibold text-sage" href={`tel:${item.patientPhone}`}><Phone size={13} />{item.patientPhone}</a>}
                          </p>
                        </div>
                        <div className="flex flex-col items-end gap-1 text-right">
                          <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${pillTone[state]}`} data-tone={tone[state]}>{text}</span>
                          <p className="flex items-center gap-1 text-[12px] font-semibold text-charcoal"><Clock3 size={13} className="text-sage" />{when(item.explanation.at)}</p>
                          <p className="text-[11.5px] text-charcoal/60">{item.explanation.mode || 'phone'} · PCC {item.assignments.assistantDoctor?.name || 'not assigned'}</p>
                        </div>
                      </div>
                      <div className="mt-3 grid gap-3 sm:grid-cols-2">
                        <div className="rounded-[10px] bg-white/70 p-3 ring-1 ring-[#EFE3CF]">
                          <p className="mb-1 flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-wide text-charcoal/60"><Pill size={12} />Medicine to explain</p>
                          <Row label="PO" value={item.medicine?.poNumber} />
                          <Row label="Supply" value={item.medicine?.supplyLabel} />
                          {/* What goes with this explanation: the months of medicine and the payment made for it. */}
                          <Row label="Given for" value={item.medicine?.supplyNote || (item.payment ? `${item.medicine?.supplyMonths ? `${item.medicine.supplyMonths} month${item.medicine.supplyMonths === 1 ? '' : 's'} of medicine · ` : ''}paid Rs ${Number(item.payment.amountPaid || 0).toLocaleString('en-IN')} of Rs ${Number(item.payment.totalAmount || 0).toLocaleString('en-IN')}${item.payment.remaining > 0 ? ` · balance Rs ${Number(item.payment.remaining).toLocaleString('en-IN')}` : ''}` : '')} />
                          <Row label="Medicines" value={item.medicine?.medicines} />
                          <Row label="Notes" value={item.medicine?.notes} />
                          {item.medicine?.medicineImages?.length > 0 && <CompactAttachments files={item.medicine.medicineImages} label="Medicine photo" />}
                        </div>
                        <div className="rounded-[10px] bg-white/70 p-3 ring-1 ring-[#EFE3CF]">
                          <p className="mb-1 flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-wide text-charcoal/60"><Package size={12} />How it reached the patient</p>
                          <Row label="Delivery" value={item.mode ? MODE_TEXT[item.mode] : ''} />
                          <Row label="Received" value={item.courier?.deliveredAt ? `${item.courier.receivedByName || ''} ${when(item.courier.deliveredAt)}`.trim() : item.courier?.status === 'dispatched' ? `Dispatched ${when(item.courier.dispatchedAt)} (${[item.courier.courierPartner, item.courier.trackingNumber].filter(Boolean).join(' / ')})` : ''} />
                          <Row label="Assigned" value={item.pcc?.assigned ? `${when(item.pcc.at)} by ${item.pcc.byName}` : ''} />
                          {(item.explanation.reschedules || []).length > 0 && <div className="rounded-lg bg-[#FBF7ED] px-2.5 py-1.5 text-[11.5px] text-charcoal/75"><p className="font-bold text-charcoal/80">Rescheduled {item.explanation.reschedules.length} time{item.explanation.reschedules.length === 1 ? '' : 's'}</p>{item.explanation.reschedules.slice().reverse().map((r, i) => <p key={i}>{when(r.from)} → {when(r.to)} · {(REASONS.find(([k]) => k === r.reason) || [])[1] || r.reason}{r.note ? ` · ${r.note}` : ''} · {r.byName}</p>)}</div>}
                          {item.explanation.completedAt && <><Row label="Explained" value={`${when(item.explanation.completedAt)} by ${item.explanation.completedBy}`} /><p className="break-words text-sm text-charcoal/80">{item.explanation.note}</p></>}
                        </div>
                      </div>
                      {/* What the PCC explains from: every treatment paper (by name, all pages) and the patient's file. */}
                      <div className="mt-3 grid gap-3 sm:grid-cols-2">
                        <div className="rounded-[10px] bg-white/70 p-3 ring-1 ring-[#EFE3CF]">
                          <p className="mb-1.5 flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-wide text-charcoal/60"><Pill size={12} />Treatment papers</p>
                          <DosePapersView job={{ photos: item.treatmentPapers || {} }} />
                        </div>
                        <PatientFile documents={item.patientDocuments || []} className="ring-1 ring-[#EFE3CF]" />
                      </div>
                      {/* The post-counselling record behind this PO (sections A to E), as In Transit sees it. Loaded when opened. */}
                      {item.poId && item.poFromConversion && <PcRecord poId={item.poId} />}
                      {!item.explanation.completedAt && (
                        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                          <p className="text-[11.5px] text-charcoal/60">{canComplete ? 'Explain the doses and chits, then complete - this starts the treatment.' : text}</p>
                          <span className="flex flex-wrap gap-2">
                            {item.patientPhone && <a href={`tel:${item.patientPhone}`}><Button size="sm" variant="outline"><Phone size={14} />Call</Button></a>}
                            {item.explanation.at && <Button size="sm" variant="outline" onClick={() => setMoving(item)}><CalendarClock size={14} />Reschedule</Button>}
                            <Button size="sm" variant={canComplete ? 'orange' : 'primary'} disabled={!canComplete} onClick={() => { setSelected(item); setCompletedAt(localNow()); setNotes(''); setError(''); }}><Check size={15} />Complete explanation</Button>
                          </span>
                        </div>
                      )}
                    </article>
                  </div>
                );
              })}
            </div>
          ))}
        </section>
        <aside className="min-w-0 space-y-3.5">
          <section className="rounded-[14px] border border-[#E8DFCB] bg-white p-4">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-[10.5px] font-bold uppercase tracking-wide text-charcoal/60">{monthBase.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}</p>
              <span className="flex gap-1"><button type="button" aria-label="Previous month" onClick={() => shiftMonth(-1)} className="rounded-md p-1 text-charcoal/70 hover:bg-[#FBF7ED]"><ChevronLeft size={15} /></button><button type="button" aria-label="Next month" onClick={() => shiftMonth(1)} className="rounded-md p-1 text-charcoal/70 hover:bg-[#FBF7ED]"><ChevronRight size={15} /></button></span>
            </div>
            <div className="grid grid-cols-7 gap-1 text-center text-[11.5px]">
              {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => <b key={i} className="text-[10px] font-bold text-charcoal/55">{d}</b>)}
              {Array.from({ length: lead }, (_, i) => <span key={`l${i}`} />)}
              {Array.from({ length: daysIn }, (_, i) => {
                const k = `${calMonth}-${String(i + 1).padStart(2, '0')}`;
                const isToday = k === todayKey; const has = hasDay.has(k); const picked = k === date;
                return <button key={k} type="button" aria-pressed={picked} onClick={() => setDate(picked ? '' : k)} title={has ? 'Has explanations' : ''} className={`rounded-lg py-1.5 ${picked ? 'ring-2 ring-sage' : ''} ${isToday ? 'bg-charcoal font-extrabold text-white' : has ? 'bg-[#FFF1E6] font-extrabold text-[#C2410C]' : 'text-charcoal hover:bg-[#FBF7ED]'}`}>{i + 1}</button>;
              })}
            </div>
            <p className="mt-2 text-[11px] text-charcoal/55">Orange days have explanations in this list. Click a day to show only that day.</p>
          </section>
          <section className="rounded-[14px] border border-[#E8DFCB] bg-white p-4">
            <p className="mb-2 text-[10.5px] font-bold uppercase tracking-wide text-charcoal/60">In this list</p>
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-[10px] bg-[#FFF1E6] p-2.5"><p className="text-[11px] text-[#C2410C]">Ready to explain</p><b className="font-display text-[20px] font-extrabold text-[#C2410C]">{counts.ready || 0}</b></div>
              <div className="rounded-[10px] bg-[#FBF0DC] p-2.5"><p className="text-[11px] text-[#7C5B2E]">Waiting</p><b className="font-display text-[20px] font-extrabold text-[#7C5B2E]">{counts.wait || 0}</b></div>
              <div className="rounded-[10px] bg-[#E6F2EA] p-2.5"><p className="text-[11px] text-[#1F6B41]">Explained</p><b className="font-display text-[20px] font-extrabold text-[#1F6B41]">{counts.done || 0}</b></div>
              <div className="rounded-[10px] bg-[#F6F0E3] p-2.5"><p className="text-[11px] text-charcoal/60">On hold</p><b className="font-display text-[20px] font-extrabold text-charcoal">{counts.hold || 0}</b></div>
            </div>
          </section>
        </aside>
      </div>
      <Modal open={Boolean(moving)} onClose={() => setMoving(null)} title="Reschedule medicine explanation" className="max-w-2xl">
        {moving && <RescheduleForm item={moving} pccId={user?.role === ROLES.ASSISTANT_DOCTOR ? user._id || user.id : moving.assignments?.assistantDoctor?.id} onCancel={() => setMoving(null)} onDone={() => { setMoving(null); load(); }} />}
      </Modal>
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
