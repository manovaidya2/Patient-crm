import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  AlertTriangle, Bell, CalendarClock, Camera, FileText, NotebookPen, Upload, CheckCircle2, ClipboardList, History, Phone, PhoneOff, RotateCcw, Save, Stethoscope,
  UserRoundCog, UserX, XCircle,
} from 'lucide-react';
import api from '../../api/axios.js';
import Button from '../../components/ui/Button.jsx';
import CareForm, { withContext } from '../../components/care/CareForm.jsx';
import { KIND_STYLE, STATE_STYLE, fmtAt, fmtDay } from '../../components/care/careUi.js';

const errorText = (error) => error?.response?.data?.message || error?.message || 'Something went wrong';
const wednesday = (value) => value && new Date(value).getDay() === 3;
const atEleven = (day) => (day ? `${day}T11:00` : '');
const localNow = () => { const d = new Date(Date.now() + 3600000); const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:00`; };
const AUTOSAVE_MS = 4000;
const SERVER_BASE = (import.meta.env.VITE_API_URL || 'http://localhost:5000/api').replace(/\/api\/?$/, '');
const fileUrl = (url) => (/^https?:/.test(url || '') ? url : `${SERVER_BASE}${url}`);
const TABS = [
  ['form', 'Form', ClipboardList], ['notes', 'Handwritten notes', NotebookPen], ['calls', 'Call details', Phone], ['advice', 'Doctor advice', Stethoscope],
  ['reminders', 'Reminders', Bell], ['reschedule', 'Reschedule', CalendarClock], ['history', 'History', History],
];
const input = 'mt-1 w-full rounded-lg border border-cardline bg-white px-2.5 py-1.5 text-[13px] outline-none focus:border-sage';

function Panel({ title, children, action }) {
  return (
    <section className="rounded-xl border border-cardline bg-white">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-cardline px-4 py-2.5"><h3 className="text-sm font-bold text-charcoal">{title}</h3>{action}</div>
      <div className="space-y-3 p-4">{children}</div>
    </section>
  );
}
const Empty = ({ children }) => <p className="text-[13px] text-charcoal/55">{children}</p>;

// One follow-up / family session / tracker on its own page: the form, the call, the doctor's advice, reminders,
// reschedules and history in tabs. The form saves by itself while it is filled (draft) and on "Save & mark done".
export default function CareSessionPage() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [answers, setAnswers] = useState({});
  const [tab, setTab] = useState('form');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [fields, setFields] = useState({});
  const [staff, setStaff] = useState([]);
  const [closing, setClosing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [lastRecord, setLastRecord] = useState(null);
  const [advice, setAdvice] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [savedAt, setSavedAt] = useState(null);
  const startedAt = useRef(new Date().toISOString());
  const latest = useRef({ answers: {}, dirty: false });
  latest.current = { answers, dirty };

  const load = useCallback(async () => {
    setError('');
    try {
      const { data: res } = await api.get(`/care/sessions/${id}`, { skipCache: true });
      setData(res);
      setAnswers(withContext(res.template, res.context, res.session.form?.answers || {}));
      setSavedAt(res.session.form?.savedAt || null);
      setDirty(false);
    } catch (e) { setError(errorText(e)); }
  }, [id]);
  useEffect(() => { startedAt.current = new Date().toISOString(); setData(null); load(); }, [load]);

  const s = data?.session;
  const isOpen = s && ['pending', 'scheduled'].includes(s.status);
  const canAct = Boolean(data?.canAct) && isOpen;
  const limitReached = s && s.reschedulesUsed >= s.rescheduleLimit;
  const set = (key, value) => setFields((f) => ({ ...f, [key]: value }));
  const top = () => window.scrollTo({ top: 0, behavior: 'smooth' });

  const run = async (fn, done = '') => {
    setBusy(true); setError(''); setNotice('');
    try {
      const { data: res } = await fn();
      if (res.session) setData((d) => ({ ...d, session: res.session }));
      if (res.sentToDoctor?.length) setNotice(`Doctor को advice request भेजी गई (${res.sentToDoctor.join(', ')})`);
      else if (done) setNotice(done);
      setFields({});
      return res;
    } catch (e) { setError(errorText(e)); top(); return null; } finally { setBusy(false); }
  };

  // The form saves by itself a few seconds after the last change, and when the page is left.
  const saveForm = useCallback(async (quiet = false) => {
    if (!latest.current.dirty) return null;
    try {
      const { data: res } = await api.put(`/care/sessions/${id}/form`, { answers: latest.current.answers, startedAt: startedAt.current });
      setDirty(false);
      setSavedAt(res.session?.form?.savedAt || new Date().toISOString());
      setData((d) => (d ? { ...d, session: res.session } : d));
      if (res.sentToDoctor?.length) setNotice(`Doctor को advice request भेजी गई (${res.sentToDoctor.join(', ')})`);
      else if (!quiet) setNotice('Form saved');
      return res;
    } catch (e) { if (!quiet) setError(errorText(e)); return null; }
  }, [id]);
  useEffect(() => {
    if (!dirty || !canAct) return undefined;
    const timer = window.setTimeout(() => saveForm(true), AUTOSAVE_MS);
    return () => window.clearTimeout(timer);
  }, [answers, dirty, canAct, saveForm]);
  useEffect(() => () => { if (latest.current.dirty) saveForm(true); }, [saveForm]);

  // Nothing in the forms is required (asked 2026-11-21): Mark done saves what is filled.
  const complete = async () => {
    const res = await run(() => api.post(`/care/sessions/${id}/complete`, { answers, startedAt: startedAt.current }), 'Session done — form saved');
    if (res) { setDirty(false); setSavedAt(res.session?.form?.savedAt); }
  };
  const timeOk = (value) => {
    if (!value) { setError('Date और time चुनें'); top(); return false; }
    if (wednesday(value)) { setError('बुधवार को क्लिनिक बंद है — दूसरा दिन चुनें'); top(); return false; }
    return true;
  };
  const loadAdvice = useCallback(async () => {
    try { const { data: res } = await api.get(`/care/sessions/${id}/advice`, { skipCache: true }); setAdvice(res.advice || []); } catch (e) { setError(errorText(e)); }
  }, [id]);
  useEffect(() => { if (tab === 'advice' && advice === null) loadAdvice(); }, [tab, advice, loadAdvice]);
  // Who a session can be given to (PCCs, counsellors, doctor, manager), with their leave that day: loaded with the page.
  const [staffError, setStaffError] = useState('');
  useEffect(() => {
    if (!(data?.canManage || data?.canAct) || !s?.dueDay) return;
    api.get('/care/staff', { params: { day: s.dueDay }, skipCache: true }).then(({ data: res }) => { setStaff(res.staff || []); setStaffError(''); }).catch((e) => setStaffError(errorText(e)));
  }, [data?.canManage, data?.canAct, s?.dueDay]);
  const onFormAction = (name) => {
    if (name === 'attempt') { setTab('calls'); set('panel', 'attempt'); }
    if (name === 'reschedule') setTab('reschedule');
    top();
  };
  const kind = KIND_STYLE[s?.kind] || KIND_STYLE.followup;
  const openReminders = useMemo(() => (s?.reminders || []).filter((r) => !r.doneAt).length, [s]);

  if (!data) {
    return (
      <div className="space-y-3">
        {error ? <p className="rounded-lg border border-[#B4232F]/30 bg-[#FDF0F0] px-3 py-2 text-[13px] font-semibold text-[#8A1C25]">{error}</p> : <p className="text-sm text-charcoal/55">Loading...</p>}
      </div>
    );
  }
  const c = data.contact;
  return (
    <div className="space-y-3">
      {/* Header: the patient, the session, where it stands. */}
      <div className="rounded-xl border border-cardline bg-white p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="flex flex-wrap items-center gap-2"><span className={`rounded px-1.5 py-0.5 text-[11px] font-bold ${kind.chip}`}>{s.code}</span><span className="font-display text-lg font-bold text-charcoal">{s.title}</span></p>
            <Link to={`/admin/patients/${s.patientId}`} className="mt-1 block text-base font-bold text-charcoal hover:underline">{s.patientName}</Link>
            <p className="text-[12.5px] text-charcoal/60">{[s.patientCode, `Phase ${s.phase}`, `Day ${s.day}`, `Due ${fmtDay(s.targetDate)}`, `PCC ${s.ownerName || '—'}`].filter(Boolean).join(' · ')}{s.covered && <> · This session: <b>{s.assigneeName}</b> (cover)</>}</p>
          </div>
          <div className="text-right">
            <span className={`inline-block rounded-full px-3 py-1 text-xs font-bold ${STATE_STYLE[s.state] || ''}`}>{s.stateLabel}</span>
            <p className="mt-1 text-[12.5px] text-charcoal/70">Call: <b>{s.callAt ? fmtAt(s.callAt) : 'not set'}</b></p>
            {canAct && <Button size="sm" variant="outline" className="mt-2 border-[#B4232F]/40 text-[#8A1C25]" onClick={() => setClosing(!closing)}><XCircle size={14} className="mr-1 inline" />{closing ? 'Keep open' : 'Close'}</Button>}
          </div>
        </div>
        {canAct && closing && (
          <div className="mt-3 space-y-2 rounded-lg border border-[#B4232F]/25 bg-[#FFFAFA] p-3">
            <p className="text-[12.5px] font-bold text-[#8A1C25]">Close this {s.kindLabel?.toLowerCase() || 'session'}</p>
            <p className="text-[12px] text-charcoal/65">Parents phone नहीं उठाते / reply नहीं देते या session नहीं होगा — reason चुनें और details लिखें। Calls not connected so far: <b>{s.attempts}</b>{s.lastAttempt ? ` (last: ${data.attemptOutcomes?.[s.lastAttempt.outcome] || s.lastAttempt.outcome}, ${fmtAt(s.lastAttempt.at)})` : ''}</p>
            <div className="grid gap-2 md:grid-cols-[minmax(0,320px)_1fr]">
              <label className="block text-[12px] font-bold">Reason<select className={input} value={fields.closeReason || ''} onChange={(e) => set('closeReason', e.target.value)}><option value="">Choose</option>{(data.closeReasons || []).map((r) => <option key={r.label} value={r.label}>{r.label}</option>)}</select></label>
              <label className="block text-[12px] font-bold">Details <span className="text-[#B4232F]">*</span><textarea rows={2} className={input} value={fields.closeDetails || ''} placeholder="e.g. 4 calls on 21, 23, 25 Nov — no answer; WhatsApp sent on 24 Nov — no reply" onChange={(e) => set('closeDetails', e.target.value)} /></label>
            </div>
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="outline" onClick={() => setClosing(false)}>Keep open</Button>
              <Button size="sm" variant="danger" disabled={busy} onClick={async () => { const res = await run(() => api.post(`/care/sessions/${id}/close`, { reason: fields.closeReason, details: fields.closeDetails }), 'Closed'); if (res) setClosing(false); }}><XCircle size={14} className="mr-1 inline" />Close</Button>
            </div>
          </div>
        )}
        {s.reassignAsked && (
          <p className="mt-2 flex flex-wrap items-center gap-2 rounded-lg bg-[#EEF3FB] px-3 py-1.5 text-[12.5px] font-semibold text-[#24476F]"><UserRoundCog size={14} />{data.canManage ? `Reassign requested by ${s.reassignRequest.byName}: ${s.reassignRequest.reason}${s.reassignRequest.suggestedName ? ` (suggested: ${s.reassignRequest.suggestedName})` : ''}` : `Reassign request sent — waiting for the Manager (${fmtAt(s.reassignRequest.at)})`}
            {data.canManage && <button type="button" onClick={() => setTab('calls')} className="font-bold underline">Answer it</button>}
          </p>
        )}
        {s.leave && <p className="mt-2 flex items-center gap-2 rounded-lg bg-[#FFF7E8] px-3 py-1.5 text-[12.5px] font-semibold text-[#7A4A06]"><UserX size={14} />{s.leave.text}{data.canManage ? ' — Call details में Reassign से किसी और को दें' : ' — Manager इसे किसी और को assign करेंगे'}</p>}
        {s.state === 'alert' && <p className="mt-2 flex items-center gap-2 rounded-lg bg-[#FDECEC] px-3 py-1.5 text-[12.5px] font-bold text-[#8A1C25]"><AlertTriangle size={14} />दो बार reschedule हो चुका है — अब Form भरकर complete करें, या ऊपर Close करें (reason के साथ)।</p>}
        {s.status === 'completed' && <p className="mt-2 text-[12.5px] font-semibold text-[#1F4F3D]">Done by {s.completedByName} · {fmtAt(s.completedAt)}{s.final ? ` · ${s.final}` : ''}</p>}
        {['missed', 'cancelled'].includes(s.status) && (
          <div className={`mt-2 rounded-lg border px-3 py-2 text-[12.5px] ${s.status === 'missed' ? 'border-[#B4232F]/30 bg-[#FDF0F0] text-[#8A1C25]' : 'border-cardline bg-[#FAF8F2] text-charcoal/75'}`}>
            <p className="font-bold">{s.status === 'missed' ? 'Closed · Missed by patient' : 'Closed'}{s.closed?.reason ? ` — ${s.closed.reason}` : ''}</p>
            <p className="mt-0.5 whitespace-pre-line">{s.closed?.details || (s.status === 'missed' ? s.missedReason : s.cancelReason)}</p>
            <p className="mt-0.5 text-[11.5px] opacity-80">{s.closed?.byName || s.missedByName || s.cancelledByName} · {fmtAt(s.closed?.at || s.missedAt || s.cancelledAt)} · {s.closed?.attempts ?? s.attempts} call{(s.closed?.attempts ?? s.attempts) === 1 ? '' : 's'} not connected{s.reschedulesUsed ? ` · rescheduled ${s.reschedulesUsed}×` : ''}</p>
          </div>
        )}
        {canAct && s.attempts >= 3 && (
          <p className="mt-2 flex flex-wrap items-center gap-2 rounded-lg bg-[#FFF7E8] px-3 py-1.5 text-[12.5px] font-semibold text-[#7A4A06]"><PhoneOff size={14} />{s.attempts} calls not connected. Parents phone नहीं उठा रहे / reply नहीं दे रहे तो इसे reason के साथ close करें।
            <button type="button" onClick={() => setClosing(true)} className="font-bold underline">Close it</button>
          </p>
        )}
      </div>

      {error && <p className="flex items-start gap-2 rounded-lg border border-[#B4232F]/30 bg-[#FDF0F0] px-3 py-2 text-[13px] font-semibold text-[#8A1C25]"><AlertTriangle size={15} className="mt-0.5 shrink-0" />{error}</p>}
      {notice && <p className="flex items-start gap-2 rounded-lg border border-[#1F5F4A]/30 bg-[#F2F7F4] px-3 py-2 text-[13px] font-semibold text-[#1F4F3D]"><CheckCircle2 size={15} className="mt-0.5 shrink-0" />{notice}</p>}

      <div className="sticky top-0 z-10 -mx-1 flex gap-1.5 overflow-x-auto border-b border-cardline bg-offwhite-100/95 px-1 backdrop-blur">
        {TABS.map(([key, label, Icon]) => {
          const count = key === 'notes' ? (s.notes || []).length : key === 'reminders' ? openReminders : key === 'reschedule' ? s.reschedulesUsed : key === 'calls' ? s.attempts : key === 'advice' ? (s.doctorRequests || []).length : 0;
          return (
            <button key={key} type="button" onClick={() => setTab(key)} aria-pressed={tab === key} className={`my-1.5 flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-[13px] font-bold transition ${tab === key ? 'bg-[#1F5F4A] text-white shadow-sm' : 'text-charcoal/60 hover:bg-[#EEF3F0] hover:text-charcoal'}`}>
              <Icon size={15} />{label}{count > 0 && <span className={`rounded-full px-1.5 text-[11px] ${tab === key ? 'bg-white/25' : 'bg-charcoal/[0.08]'}`}>{count}</span>}
              {key === 'reminders' && s.reminderDue && <span className="h-2 w-2 rounded-full bg-[#F97316]" />}
            </button>
          );
        })}
      </div>

      {/* 1. The form */}
      {tab === 'form' && (s.status === 'completed' || canAct
        ? (
          <>
            <CareForm template={data.template} context={data.context} answers={answers} onChange={(next) => { setAnswers(next); setDirty(true); }} readOnly={!canAct} onAction={onFormAction} code={s.code} />
            {canAct && (
              <div className="sticky bottom-0 z-10 flex flex-wrap items-center justify-end gap-2 rounded-xl border border-cardline bg-offwhite-100/95 px-3 py-2.5 backdrop-blur">
                <span className="mr-auto text-[12px] text-charcoal/55">{dirty ? 'Saving soon…' : savedAt ? `All changes saved · ${fmtAt(savedAt)}` : 'Not saved yet'}</span>
                <Button variant="outline" disabled={busy} onClick={() => saveForm(false)}><Save size={14} className="mr-1 inline" />Save</Button>
                <Button disabled={busy} onClick={complete}><CheckCircle2 size={14} className="mr-1 inline" />Save &amp; mark done</Button>
              </div>
            )}
          </>
        )
        : <Panel title="Form"><Empty>{isOpen ? 'यह session आपका नहीं है — सिर्फ़ देख सकते हैं।' : 'यह session बंद है; form नहीं भरा गया।'}</Empty></Panel>)}

      {/* Handwritten notes: a photo from the camera or a file; each goes to the end of the patient's Records Room PDF. */}
      {tab === 'notes' && (
        <div className="space-y-3">
          {data.canAct && (
            <Panel title="Upload a handwritten note">
              <p className="text-[12.5px] text-charcoal/65">Call के दौरान लिखा note — camera से photo लें या file (photo / scan / PDF) चुनें। Upload होते ही यह इस patient की Records Room PDF के आख़िर में जुड़ जाता है।</p>
              <div className="flex flex-wrap items-center gap-2">
                <label className={`inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-[#1F5F4A] px-3.5 py-2 text-[13px] font-bold text-white hover:bg-[#184D3C] ${uploading ? 'pointer-events-none opacity-60' : ''}`}>
                  <Camera size={16} />Take photo
                  <input type="file" accept="image/*" capture="environment" className="hidden" onChange={async (e) => { const list = [...e.target.files]; e.target.value = ''; if (!list.length) return; const body = new FormData(); list.forEach((f) => body.append('files', f)); setUploading(true); const res = await run(() => api.post(`/care/sessions/${id}/notes`, body), 'Note uploaded and added to the Records Room PDF'); setUploading(false); if (res?.recordRoom) setLastRecord(res.recordRoom); }} />
                </label>
                <label className={`inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-cardline bg-white px-3.5 py-2 text-[13px] font-bold text-charcoal hover:border-[#1F5F4A]/50 ${uploading ? 'pointer-events-none opacity-60' : ''}`}>
                  <Upload size={16} />Upload file
                  <input type="file" multiple accept="image/jpeg,image/png,image/webp,application/pdf" className="hidden" onChange={async (e) => { const list = [...e.target.files]; e.target.value = ''; if (!list.length) return; if (list.length > 10) { setError('एक बार में अधिकतम 10 files'); return; } const body = new FormData(); list.forEach((f) => body.append('files', f)); setUploading(true); const res = await run(() => api.post(`/care/sessions/${id}/notes`, body), list.length > 1 ? `${list.length} notes uploaded and added to the Records Room PDF` : 'Note uploaded and added to the Records Room PDF'); setUploading(false); if (res?.recordRoom) setLastRecord(res.recordRoom); }} />
                </label>
                {uploading && <span className="text-[12.5px] font-semibold text-charcoal/60">Uploading and adding to the Records Room PDF…</span>}
              </div>
              {lastRecord?.pdfUrl && <p className="text-[12.5px] text-[#1F4F3D]">Records Room PDF: <a href={fileUrl(lastRecord.pdfUrl)} target="_blank" rel="noreferrer" className="font-bold underline">{lastRecord.pdfName || 'Open PDF'}</a> ({lastRecord.pages} pages)</p>}
            </Panel>
          )}
          <Panel title={`Notes of this ${s.kindLabel?.toLowerCase() || 'session'} (${(s.notes || []).length})`}>
            {(s.notes || []).length ? (
              <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {[...s.notes].reverse().map((n) => (
                  <li key={n._id} className="overflow-hidden rounded-lg border border-cardline bg-white">
                    <a href={fileUrl(n.url)} target="_blank" rel="noreferrer" className="block bg-[#FAF8F2]">
                      {String(n.mimeType).startsWith('image/') || /\.(jpe?g|png|webp|gif)$/i.test(n.url)
                        ? <img src={fileUrl(n.url)} alt={n.fileName} loading="lazy" className="h-44 w-full object-contain" />
                        : <span className="flex h-44 items-center justify-center gap-2 text-[13px] font-bold text-charcoal/60"><FileText size={22} />PDF</span>}
                    </a>
                    <div className="px-3 py-2 text-[12px]">
                      <p className="truncate font-semibold text-charcoal" title={n.fileName}>{n.fileName}</p>
                      <p className="text-charcoal/55">{fmtAt(n.at)} · {n.byName}</p>
                      {n.recordRoomPdf && <a href={fileUrl(n.recordRoomPdf)} target="_blank" rel="noreferrer" className="font-bold text-[#1F5F4A] underline">In Records Room PDF{n.pdfPageCount ? ` (${n.pdfPageCount} pages then)` : ''}</a>}
                    </div>
                  </li>
                ))}
              </ul>
            ) : <Empty>No handwritten note yet.</Empty>}
          </Panel>
        </div>
      )}

      {/* 2. Call details */}
      {tab === 'calls' && (
        <div className="grid gap-3 lg:grid-cols-2">
          <Panel title="Parent contact">
            {c ? (
              <div className="space-y-1.5 text-[13px]">
                <p><span className="text-charcoal/55">Parent / guardian:</span> <b>{c.parent || '—'}</b></p>
                {c.phone && <p><span className="text-charcoal/55">Phone:</span> <a href={`tel:${c.phone}`} className="font-bold text-[#1F5F4A] underline">{c.phone}</a></p>}
                {c.alternate && <p><span className="text-charcoal/55">Alternate:</span> <a href={`tel:${c.alternate}`} className="font-bold text-[#1F5F4A] underline">{c.alternate}</a></p>}
                <p className="text-charcoal/55">{[c.age && `Age ${c.age}`, c.category].filter(Boolean).join(' · ')}</p>
              </div>
            ) : <Empty>Contact not found.</Empty>}
          </Panel>
          <Panel title="Call time" action={canAct && !s.callAt && <Button size="sm" variant="orange" onClick={() => set('callAt', fields.callAt || atEleven(s.dueDay))}>Set call time</Button>}>
            <p className="text-[13px]">Due day: <b>{fmtDay(s.targetDate)}</b> · Call: <b>{s.callAt ? fmtAt(s.callAt) : 'not set'}</b></p>
            {canAct && !s.callAt && fields.callAt !== undefined && (
              <div className="flex flex-wrap items-end gap-2">
                <label className="text-[12px] font-bold">Date &amp; time<input type="datetime-local" className={input} value={fields.callAt || ''} onChange={(e) => set('callAt', e.target.value)} /></label>
                <Button size="sm" disabled={busy} onClick={() => timeOk(fields.callAt) && run(() => api.patch(`/care/sessions/${id}/call`, { callAt: new Date(fields.callAt).toISOString() }), 'Call time set')}>Save</Button>
              </div>
            )}
            {s.callAt && <p className="text-[12px] text-charcoal/55">To change it use the Reschedule tab ({s.reschedulesUsed}/{s.rescheduleLimit} used).</p>}
          </Panel>
          <Panel title={`Calls not connected (${s.attempts})`}>
            {canAct && (
              <div className="grid gap-2 sm:grid-cols-[200px_1fr_auto] sm:items-end">
                <label className="text-[12px] font-bold">What happened<select className={input} value={fields.outcome || ''} onChange={(e) => set('outcome', e.target.value)}><option value="">Choose</option>{Object.entries(data.attemptOutcomes || {}).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
                <label className="text-[12px] font-bold">Note<input className={input} value={fields.note || ''} onChange={(e) => set('note', e.target.value)} /></label>
                <Button size="sm" disabled={busy} onClick={() => run(() => api.post(`/care/sessions/${id}/attempt`, { outcome: fields.outcome, note: fields.note }), 'Call attempt recorded')}><PhoneOff size={14} className="mr-1 inline" />Record</Button>
              </div>
            )}
            {(s.attemptsList || []).length ? (
              <ul className="divide-y divide-cardline rounded-lg border border-cardline text-[12.5px]">
                {[...s.attemptsList].reverse().map((a, i) => <li key={i} className="flex flex-wrap justify-between gap-2 px-3 py-1.5"><span><b>{a.label}</b>{a.note ? ` — ${a.note}` : ''}</span><span className="text-charcoal/50">{fmtAt(a.at)} · {a.byName}</span></li>)}
              </ul>
            ) : <Empty>No call attempt recorded.</Empty>}
          </Panel>
          <Panel title={isOpen ? 'Reassign' : 'Reopen'}>
            {staffError && <p className="text-[12.5px] font-semibold text-[#8A1C25]">Staff list could not load: {staffError}</p>}
            {/* The PCC asks; the Manager / Admin assigns (the suggested person is chosen already) or declines. */}
            {isOpen && s.reassignRequest && (
              <div className={`rounded-lg border px-3 py-2 text-[12.5px] ${s.reassignAsked ? 'border-[#3B6EA8]/30 bg-[#F1F6FC]' : 'border-cardline bg-[#FAF8F2]'}`}>
                <p className="font-bold text-charcoal">{s.reassignAsked ? 'Reassign request waiting' : s.reassignRequest.status === 'declined' ? 'Last reassign request: declined' : 'Last reassign request: assigned'}</p>
                <p className="text-charcoal/75">{s.reassignRequest.reason}{s.reassignRequest.suggestedName ? ` — suggested: ${s.reassignRequest.suggestedName}` : ''}</p>
                <p className="text-[11.5px] text-charcoal/50">{s.reassignRequest.byName} · {fmtAt(s.reassignRequest.at)}{s.reassignRequest.decidedAt ? ` · ${s.reassignRequest.decidedByName}: ${s.reassignRequest.note} (${fmtAt(s.reassignRequest.decidedAt)})` : ''}</p>
              </div>
            )}
            {isOpen && !data.canManage && canAct && !s.reassignAsked && (
              <div className="grid gap-2 sm:grid-cols-[230px_1fr_auto] sm:items-end">
                <label className="text-[12px] font-bold">Suggest who (optional)<select className={input} value={fields.suggestedUserId || ''} onChange={(e) => set('suggestedUserId', e.target.value)}><option value="">No suggestion</option>{staff.filter((u) => u.id !== s.assignee).map((u) => <option key={u.id} value={u.id} disabled={u.onLeave}>{u.name}{u.onLeave ? ' — on leave' : ''}</option>)}</select></label>
                <label className="text-[12px] font-bold">Why <span className="text-[#B4232F]">*</span><input className={input} value={fields.requestReason || ''} placeholder="e.g. I am on leave that day / parent wants to talk to someone else" onChange={(e) => set('requestReason', e.target.value)} /></label>
                <Button size="sm" disabled={busy} onClick={() => run(() => api.post(`/care/sessions/${id}/reassign-request`, { reason: fields.requestReason, suggestedUserId: fields.suggestedUserId || undefined }), 'Reassign request sent to the Manager')}><UserRoundCog size={14} className="mr-1 inline" />Request reassign</Button>
              </div>
            )}
            {isOpen && data.canManage && s.reassignAsked && (
              <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
                <label className="text-[12px] font-bold">Decline — why it stays<input className={input} value={fields.declineNote || ''} onChange={(e) => set('declineNote', e.target.value)} /></label>
                <Button size="sm" variant="outline" disabled={busy} onClick={() => run(() => api.post(`/care/sessions/${id}/reassign-request/decline`, { note: fields.declineNote }), 'Request declined')}>Decline</Button>
              </div>
            )}
            {isOpen && data.canManage && (
              <div className="grid gap-2 sm:grid-cols-[230px_1fr_auto] sm:items-end">
                <label className="text-[12px] font-bold">Assign this session to (PCC)<select className={input} value={fields.userId ?? (s.reassignAsked ? String(s.reassignRequest.suggested || '') : '')} onChange={(e) => set('userId', e.target.value)}><option value="">Choose</option>{staff.map((u) => <option key={u.id} value={u.id} disabled={u.onLeave}>{u.name}{u.onLeave ? ' — on leave' : ''}{u.id === s.owner ? ' — patient PCC' : ''}{u.id === s.assignee && u.id !== s.owner ? ' — has it now' : ''}</option>)}</select></label>
                <label className="text-[12px] font-bold">Reason<input className={input} value={fields.assignReason ?? (s.reassignAsked ? s.reassignRequest.reason : '')} placeholder={s.leave ? 'PCC on leave' : ''} onChange={(e) => set('assignReason', e.target.value)} /></label>
                <Button size="sm" disabled={busy} onClick={() => run(() => api.post(`/care/sessions/${id}/assign`, { userId: fields.userId ?? String(s.reassignRequest?.suggested || ''), reason: (fields.assignReason ?? (s.reassignAsked ? s.reassignRequest.reason : '')) || (s.leave ? 'PCC on leave' : '') }), 'Assigned')}><UserRoundCog size={14} className="mr-1 inline" />Assign</Button>
              </div>
            )}
            {!isOpen && data.canManage && (
              <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
                <label className="text-[12px] font-bold">Reopen — why<input className={input} value={fields.reopenReason || ''} onChange={(e) => set('reopenReason', e.target.value)} /></label>
                <Button size="sm" disabled={busy} onClick={() => run(() => api.post(`/care/sessions/${id}/reopen`, { reason: fields.reopenReason }), 'Reopened')}><RotateCcw size={14} className="mr-1 inline" />Reopen</Button>
              </div>
            )}
            {!data.canManage && !isOpen && <Empty>बंद session Admin / Manager reopen कर सकते हैं।</Empty>}
            {!data.canManage && isOpen && s.reassignAsked && <Empty>Request Manager के पास है — वो किसी और को assign करेंगे या note के साथ मना करेंगे।</Empty>}
          </Panel>
        </div>
      )}

      {/* 3. Doctor advice */}
      {tab === 'advice' && (
        <div className="space-y-3">
          {canAct && (
            <Panel title="Ask the doctor">
              <textarea rows={3} className={input} placeholder="Parent की परेशानी / सवाल जो doctor से पूछना है" value={fields.query || ''} onChange={(e) => set('query', e.target.value)} />
              <div className="flex flex-wrap items-center gap-3">
                <label className="inline-flex items-center gap-2 text-[13px] font-semibold text-[#8A1C25]"><input type="checkbox" className="h-4 w-4 accent-[#B4232F]" checked={Boolean(fields.urgent)} onChange={(e) => set('urgent', e.target.checked)} />Urgent / emergency</label>
                <Button size="sm" className="ml-auto" disabled={busy} onClick={async () => { const res = await run(() => api.post(`/care/sessions/${id}/advice`, { query: fields.query, urgent: fields.urgent }), 'Sent to the doctor'); if (res) loadAdvice(); }}><Stethoscope size={14} className="mr-1 inline" />Send to doctor</Button>
              </div>
              <p className="text-[11.5px] text-charcoal/50">Form में Emergency / Urgent Doctor Review चुनने पर भी request अपने-आप जाती है।</p>
            </Panel>
          )}
          <Panel title="This patient's doctor advice" action={<Link to="/admin/patient-queries" className="text-[12px] font-bold text-[#1F5F4A] underline">Patient Queries</Link>}>
            {advice === null ? <Empty>Loading...</Empty> : advice.length ? (
              <ul className="space-y-2">
                {advice.map((a) => (
                  <li key={a.id} className={`rounded-lg border px-3 py-2 text-[13px] ${a.fromThisSession ? 'border-[#1F5F4A]/40 bg-[#F6FAF7]' : 'border-cardline'}`}>
                    <p className="flex flex-wrap items-center gap-2">
                      {a.urgent && <span className="rounded bg-[#B4232F] px-1.5 text-[10.5px] font-bold text-white">URGENT</span>}
                      {a.fromThisSession && <span className="rounded bg-[#EEF3F0] px-1.5 text-[10.5px] font-bold text-[#1F4F3D]">this session</span>}
                      <span className="text-[11.5px] text-charcoal/50">{fmtAt(a.askedAt)} · {a.by}{a.phase ? ` · Phase ${a.phase}` : ''}</span>
                      <span className="ml-auto rounded-full bg-charcoal/[0.06] px-2 py-0.5 text-[11px] font-bold text-charcoal/65">{a.status}</span>
                    </p>
                    <p className="mt-1 whitespace-pre-line text-charcoal">{a.query}</p>
                    {a.advice && <p className="mt-1.5 whitespace-pre-line rounded bg-[#FBF1F2] px-2 py-1.5 text-[#5C1620]"><b>Doctor ({a.adviceBy}, {fmtAt(a.adviceAt)}):</b> {a.advice}</p>}
                    {a.voice && <audio controls src={a.voice} className="mt-1.5 h-8 w-full max-w-sm" />}
                  </li>
                ))}
              </ul>
            ) : <Empty>No query to the doctor for this patient yet.</Empty>}
          </Panel>
        </div>
      )}

      {/* 4. Reminders */}
      {tab === 'reminders' && (
        <div className="space-y-3">
          {canAct && (
            <Panel title="Add a reminder">
              <div className="grid gap-2 sm:grid-cols-[220px_1fr_auto] sm:items-end">
                <label className="text-[12px] font-bold">When<input type="datetime-local" className={input} value={fields.remindAt ?? localNow()} onChange={(e) => set('remindAt', e.target.value)} /></label>
                <label className="text-[12px] font-bold">For what<input className={input} value={fields.remindNote || ''} placeholder="e.g. Parent asked to call after 6 pm" onChange={(e) => set('remindNote', e.target.value)} /></label>
                <Button size="sm" disabled={busy} onClick={() => run(() => api.post(`/care/sessions/${id}/reminders`, { at: new Date(fields.remindAt ?? localNow()).toISOString(), note: fields.remindNote }), 'Reminder added')}><Bell size={14} className="mr-1 inline" />Add</Button>
              </div>
            </Panel>
          )}
          <Panel title="Reminders">
            <ul className="space-y-1.5 text-[13px]">
              {s.callAt && isOpen && (
                <li className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-cardline bg-[#FAF8F2] px-3 py-2">
                  <span><b>Call the parent</b> <span className="text-charcoal/55">(automatic, the call time)</span></span>
                  <span className="text-charcoal/60">{fmtAt(s.callAt)}</span>
                </li>
              )}
              {[...(s.reminders || [])].sort((a, b) => new Date(a.at) - new Date(b.at)).map((r) => {
                const due = !r.doneAt && new Date(r.at) <= new Date();
                return (
                  <li key={r._id} className={`flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 ${r.doneAt ? 'border-cardline opacity-60' : due ? 'border-[#F97316]/50 bg-[#FFF7ED]' : 'border-cardline'}`}>
                    <span className="min-w-0"><b className={r.doneAt ? 'line-through' : ''}>{r.note}</b><span className="block text-[11.5px] text-charcoal/50">{fmtAt(r.at)} · {r.byName}{r.doneAt ? ` · done by ${r.doneByName}` : due ? ' · due now' : ''}</span></span>
                    {canAct && <Button size="sm" variant="outline" disabled={busy} onClick={() => run(() => api.patch(`/care/sessions/${id}/reminders/${r._id}`, { done: !r.doneAt }), r.doneAt ? 'Reminder opened again' : 'Reminder done')}>{r.doneAt ? 'Undo' : 'Done'}</Button>}
                  </li>
                );
              })}
              {!(s.reminders || []).length && !(s.callAt && isOpen) && <li><Empty>No reminder.</Empty></li>}
            </ul>
            <p className="text-[11.5px] text-charcoal/50">A reminder that is due shows in Your pending work / My Day.</p>
          </Panel>
        </div>
      )}

      {/* 5. Reschedule */}
      {tab === 'reschedule' && (
        <div className="space-y-3">
          <Panel title={`Reschedule (${s.reschedulesUsed} of ${s.rescheduleLimit} used)`}>
            {/* No call time yet: the first time is set here (not counted); after that every change is a reschedule (2 at most). */}
            {canAct && !limitReached && (
              <div className="grid gap-2 sm:grid-cols-[220px_1fr_auto] sm:items-end">
                <label className="text-[12px] font-bold">{s.callAt ? 'New date & time' : 'Call date & time'}<input type="datetime-local" className={input} value={fields.rescheduleAt ?? atEleven(s.dueDay)} onChange={(e) => set('rescheduleAt', e.target.value)} /></label>
                {s.callAt
                  ? <label className="text-[12px] font-bold">Reason (parent ने क्या कहा)<input className={input} value={fields.rescheduleReason || ''} onChange={(e) => set('rescheduleReason', e.target.value)} /></label>
                  : <p className="text-[12px] text-charcoal/60">Call time अभी set नहीं है — पहली बार set करना reschedule में नहीं गिना जाता। Due day: {fmtDay(s.targetDate)} (बुधवार को नहीं)</p>}
                <Button size="sm" disabled={busy} onClick={() => {
                  const value = fields.rescheduleAt ?? atEleven(s.dueDay);
                  if (!timeOk(value)) return;
                  run(() => (s.callAt
                    ? api.post(`/care/sessions/${id}/reschedule`, { callAt: new Date(value).toISOString(), reason: fields.rescheduleReason })
                    : api.patch(`/care/sessions/${id}/call`, { callAt: new Date(value).toISOString() })), s.callAt ? 'Rescheduled' : 'Call time set');
                }}><CalendarClock size={14} className="mr-1 inline" />{s.callAt ? 'Reschedule' : 'Set call time'}</Button>
              </div>
            )}
            {s.callAt && <p className="text-[12.5px] text-charcoal/70">Current call time: <b>{fmtAt(s.callAt)}</b></p>}
            {!isOpen && <Empty>This session is closed.</Empty>}
            {isOpen && !canAct && <Empty>यह session आपका नहीं है — reschedule उसका PCC (या Admin / Manager / Doctor) करेगा।</Empty>}
            {limitReached && isOpen && <p className="flex items-center gap-2 rounded-lg bg-[#FDECEC] px-3 py-2 text-[12.5px] font-bold text-[#8A1C25]"><AlertTriangle size={14} />दो बार reschedule हो चुका है — अब complete करें (Form), या Call details में missed / cancel करें।</p>}
            {(s.reschedules || []).length ? (
              <ul className="divide-y divide-cardline rounded-lg border border-cardline text-[12.5px]">
                {s.reschedules.map((r, i) => (
                  <li key={i} className="px-3 py-2">
                    <p><b>#{i + 1}</b> {fmtAt(r.from)} → <b>{fmtAt(r.to)}</b></p>
                    <p className="text-charcoal/65">{r.reason}</p>
                    <p className="text-[11.5px] text-charcoal/45">{fmtAt(r.at)} · {r.byName}</p>
                  </li>
                ))}
              </ul>
            ) : <Empty>Not rescheduled.</Empty>}
          </Panel>
        </div>
      )}

      {/* 6. History */}
      {tab === 'history' && (
        <Panel title="History">
          <ul className="space-y-1.5 text-[12.5px]">
            {[...(s.log || [])].reverse().map((entry, i) => (
              <li key={i} className="flex gap-2 rounded-lg border border-cardline bg-white px-3 py-1.5"><span className="shrink-0 text-charcoal/50">{fmtAt(entry.at)}</span><span className="min-w-0 flex-1 text-charcoal">{entry.text}</span><span className="shrink-0 text-charcoal/50">{entry.byName}</span></li>
            ))}
            {!(s.log || []).length && <li><Empty>No history yet.</Empty></li>}
          </ul>
        </Panel>
      )}
    </div>
  );
}
