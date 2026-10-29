import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, ChevronLeft, ChevronRight, Clock3, Package, Phone, Pill, RefreshCw, Stethoscope, UserRound } from 'lucide-react';
import api from '../../api/axios.js';
import Button from '../../components/ui/Button.jsx';
import Badge from '../../components/ui/Badge.jsx';
import Modal from '../../components/ui/Modal.jsx';
import { CompactAttachments } from '../../components/ui/Attachments.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { ROLES } from '../../constants/roles.js';
import { PageHeader } from '../../components/ui/Layout.jsx';
import { DosePapersView } from '../../components/medicine/DosePapers.jsx';
import PatientFile from '../../components/medicine/PatientFile.jsx';

const input = 'w-full rounded-lg border border-cardline bg-white px-3 py-2 text-sm';
const when = (value) => (value ? new Date(value).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-');
const localNow = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16); };
const MODE_TEXT = { pickup: 'Collected at clinic', porter: 'Sent by porter', courier: 'Sent by courier' };
const Row = ({ label, value }) => (value ? <p className="text-[12.5px]"><span className="text-charcoal/60">{label}: </span><span className="font-medium text-charcoal">{value}</span></p> : null);

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
    if (item.payment?.remaining > 0 || item.payment?.pendingCount) return ['wait', 'Payment not complete'];
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
        subtitle={`${todayCount} today · ${weekCount} in the next 7 days · Patients assigned to ${user?.role === ROLES.ADMIN ? 'each PCC' : 'you'} for the medicine explanation. Completing it starts the treatment of that phase.`}
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
          {loading ? <p className="text-sm text-charcoal/60">Loading...</p> : !items.length ? <p className="rounded-[14px] border border-dashed border-[#DED2BD] bg-white p-8 text-center text-sm text-charcoal/60">No explanations for this selection.</p> : Object.entries(groups).map(([k, list]) => (
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
                          <Row label="Medicines" value={item.medicine?.medicines} />
                          <Row label="Notes" value={item.medicine?.notes} />
                          {item.medicine?.medicineImages?.length > 0 && <CompactAttachments files={item.medicine.medicineImages} label="Medicine photo" />}
                        </div>
                        <div className="rounded-[10px] bg-white/70 p-3 ring-1 ring-[#EFE3CF]">
                          <p className="mb-1 flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-wide text-charcoal/60"><Package size={12} />How it reached the patient</p>
                          <Row label="Delivery" value={item.mode ? MODE_TEXT[item.mode] : ''} />
                          <Row label="Received" value={item.courier?.deliveredAt ? `${item.courier.receivedByName || ''} ${when(item.courier.deliveredAt)}`.trim() : item.courier?.status === 'dispatched' ? `Dispatched ${when(item.courier.dispatchedAt)} (${[item.courier.courierPartner, item.courier.trackingNumber].filter(Boolean).join(' / ')})` : ''} />
                          <Row label="Assigned" value={item.pcc?.assigned ? `${when(item.pcc.at)} by ${item.pcc.byName}` : ''} />
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
                      {!item.explanation.completedAt && (
                        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                          <p className="text-[11.5px] text-charcoal/60">{canComplete ? 'Explain the doses and chits, then complete - this starts the treatment.' : text}</p>
                          <span className="flex flex-wrap gap-2">
                            {item.patientPhone && <a href={`tel:${item.patientPhone}`}><Button size="sm" variant="outline"><Phone size={14} />Call</Button></a>}
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
