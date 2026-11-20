import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, CalendarClock, CheckCircle2, History, PhoneOff, RotateCcw, Save, Stethoscope, UserRoundCog, UserX, XCircle } from 'lucide-react';
import api from '../../api/axios.js';
import Modal from '../ui/Modal.jsx';
import Button from '../ui/Button.jsx';
import CareForm, { withContext } from './CareForm.jsx';
import { missingOf } from './formRules.js';
import { STATE_STYLE, fmtAt, fmtDay } from './careUi.js';

const errorText = (error) => error?.response?.data?.message || error?.message || 'Something went wrong';
const toLocalInput = (value) => {
  if (!value) return '';
  const d = new Date(value);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const wednesday = (value) => value && new Date(value).getDay() === 3;
const defaultTime = (day) => (day ? `${day}T11:00` : '');

// One follow-up / family session / tracker: its call (time, reschedules - at most two -, attempts, missed, cancel,
// cover by another person) and its form. Opened from the Care Schedule page, the patient page and the pending lists.
export default function CareSessionModal({ id, open, onClose, onChanged }) {
  const [data, setData] = useState(null);
  const [answers, setAnswers] = useState({});
  const [tab, setTab] = useState('form');
  const [panel, setPanel] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [missing, setMissing] = useState(new Set());
  const [fields, setFields] = useState({});
  const [staff, setStaff] = useState([]);
  const startedAt = useRef(new Date().toISOString());
  const top = useRef(null);

  const load = async () => {
    setError('');
    try {
      const { data: res } = await api.get(`/care/sessions/${id}`);
      setData(res);
      setAnswers(withContext(res.template, res.context, res.session.form?.answers || {}));
      setTab(res.session.status === 'completed' || !['completed', 'missed', 'cancelled'].includes(res.session.status) ? 'form' : 'history');
    } catch (e) { setError(errorText(e)); }
  };
  useEffect(() => { if (open && id) { setData(null); setPanel(''); setNotice(''); setMissing(new Set()); startedAt.current = new Date().toISOString(); load(); } }, [open, id]); // eslint-disable-line react-hooks/exhaustive-deps

  const s = data?.session;
  const isOpen = s && ['pending', 'scheduled'].includes(s.status);
  const canAct = Boolean(data?.canAct) && isOpen;
  const limitReached = s && s.reschedulesUsed >= s.rescheduleLimit;
  const style = STATE_STYLE[s?.state] || STATE_STYLE.upcoming;
  const set = (key, value) => setFields((f) => ({ ...f, [key]: value }));
  const scrollTop = () => top.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });

  const run = async (fn, done = '') => {
    setBusy(true); setError(''); setNotice('');
    try {
      const { data: res } = await fn();
      setData((d) => ({ ...d, session: res.session }));
      if (res.sentToDoctor?.length) setNotice(`Doctor को advice request भेजी गई (${res.sentToDoctor.join(', ')})`);
      else if (done) setNotice(done);
      setPanel(''); setFields({});
      onChanged?.(res.session);
      return res;
    } catch (e) { setError(errorText(e)); scrollTop(); return null; } finally { setBusy(false); }
  };
  const openPanel = async (name) => {
    setPanel(panel === name ? '' : name); setError('');
    if (name === 'reschedule') set('callAt', defaultTime(s?.dueDay));
    if (name === 'call') set('callAt', defaultTime(s?.dueDay));
    if (name === 'assign' && !staff.length) {
      try { const { data: res } = await api.get('/care/staff', { params: { day: s?.dueDay } }); setStaff(res.staff || []); } catch (e) { setError(errorText(e)); }
    }
    scrollTop();
  };
  const timeOk = (value) => {
    if (!value) { setError('Date और time चुनें'); return false; }
    if (wednesday(value)) { setError('बुधवार को क्लिनिक बंद है — दूसरा दिन चुनें'); return false; }
    return true;
  };
  const onAction = (name) => { if (name === 'reschedule' && !limitReached) openPanel('reschedule'); else if (name === 'attempt') openPanel('attempt'); else if (name === 'reschedule') { setError('दो बार reschedule हो चुका है — अब complete, missed by parents या cancel करें'); scrollTop(); } };

  const saveDraft = () => run(() => api.put(`/care/sessions/${id}/form`, { answers, startedAt: startedAt.current }), 'Form saved (draft)');
  const complete = async () => {
    const list = missingOf(data.template, answers);
    setMissing(new Set(list.map((m) => m.id)));
    if (list.length) { setError(`Mark done से पहले भरें: ${list.slice(0, 5).map((m) => m.text).join('; ')}${list.length > 5 ? ` (+${list.length - 5})` : ''}`); scrollTop(); return; }
    const res = await run(() => api.post(`/care/sessions/${id}/complete`, { answers, startedAt: startedAt.current }), 'Session done — form saved');
    if (res) setTab('form');
  };

  const title = s ? `${s.code} · ${s.title}` : 'Session';
  return (
    <Modal open={open} onClose={onClose} title={title} className="max-w-6xl">
      <div ref={top} />
      {!data && !error && <p className="text-sm text-charcoal/55">Loading...</p>}
      {error && <p className="mb-3 flex items-start gap-2 rounded-lg border border-[#B4232F]/30 bg-[#FDF0F0] px-3 py-2 text-[13px] font-semibold text-[#8A1C25]"><AlertTriangle size={15} className="mt-0.5 shrink-0" />{error}</p>}
      {notice && <p className="mb-3 flex items-start gap-2 rounded-lg border border-[#1F5F4A]/30 bg-[#F2F7F4] px-3 py-2 text-[13px] font-semibold text-[#1F4F3D]"><CheckCircle2 size={15} className="mt-0.5 shrink-0" />{notice}</p>}
      {s && (
        <div className="space-y-3">
          <div className="rounded-xl border border-cardline bg-white p-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <Link to={`/admin/patients/${s.patientId}`} className="text-base font-bold text-charcoal hover:underline">{s.patientName}</Link>
                <p className="text-[12.5px] text-charcoal/60">{[s.patientCode, `Phase ${s.phase}`, `${s.kindLabel} · Day ${s.day}`, `Due ${fmtDay(s.targetDate)}`].filter(Boolean).join(' · ')}</p>
                <p className="mt-0.5 text-[12.5px] text-charcoal/70">PCC: <b>{s.ownerName || '—'}</b>{s.covered && <> · This session: <b>{s.assigneeName}</b> (cover{s.cover?.reason ? `: ${s.cover.reason}` : ''})</>}</p>
              </div>
              <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${style}`}>{s.stateLabel}</span>
            </div>
            <div className="mt-2 grid gap-2 text-[12.5px] sm:grid-cols-3">
              <p><span className="text-charcoal/55">Call time:</span> <b>{s.callAt ? fmtAt(s.callAt) : 'Not set'}</b></p>
              <p><span className="text-charcoal/55">Reschedules:</span> <b className={limitReached ? 'text-[#B4232F]' : ''}>{s.reschedulesUsed} / {s.rescheduleLimit}</b></p>
              <p><span className="text-charcoal/55">Calls not connected:</span> <b>{s.attempts}</b></p>
            </div>
            {s.leave && <p className="mt-2 flex items-center gap-2 rounded-lg bg-[#FFF7E8] px-3 py-1.5 text-[12.5px] font-semibold text-[#7A4A06]"><UserX size={14} />{s.leave.text}{data.canManage ? ' — Assign से किसी और को दें' : ' — Manager इसे किसी और को assign करेंगे'}</p>}
            {s.state === 'alert' && <p className="mt-2 flex items-center gap-2 rounded-lg bg-[#FDECEC] px-3 py-1.5 text-[12.5px] font-bold text-[#8A1C25]"><AlertTriangle size={14} />दो बार reschedule हो चुका है — अब action ज़रूरी: complete करें, missed by parents mark करें, या cancel करें।</p>}
            {s.status === 'completed' && <p className="mt-2 text-[12.5px] font-semibold text-[#1F4F3D]">Done by {s.completedByName} · {fmtAt(s.completedAt)}{s.final ? ` · ${s.final}` : ''}</p>}
            {s.status === 'missed' && <p className="mt-2 text-[12.5px] font-semibold text-[#8A1C25]">Missed by parents — {s.missedReason} ({s.missedByName}, {fmtAt(s.missedAt)})</p>}
            {s.status === 'cancelled' && <p className="mt-2 text-[12.5px] font-semibold text-charcoal/70">Cancelled — {s.cancelReason} ({s.cancelledByName}, {fmtAt(s.cancelledAt)})</p>}
            {s.doctorRequests?.length > 0 && <p className="mt-2 flex flex-wrap items-center gap-2 text-[12.5px] text-[#7A1F2B]"><Stethoscope size={14} />Doctor को भेजा: {s.doctorRequests.map((d) => d.level).join(', ')} <Link to="/admin/request-for-advice" className="font-bold underline">Doctor Advice</Link></p>}

            <div className="mt-3 flex flex-wrap gap-1.5">
              {canAct && !s.callAt && <Button size="sm" variant="orange" onClick={() => openPanel('call')}><CalendarClock size={14} className="mr-1 inline" />Set call time</Button>}
              {canAct && s.callAt && <Button size="sm" variant="outline" disabled={limitReached} onClick={() => openPanel('reschedule')} title={limitReached ? 'Already rescheduled twice' : ''}><CalendarClock size={14} className="mr-1 inline" />Reschedule ({s.reschedulesUsed}/{s.rescheduleLimit})</Button>}
              {canAct && <Button size="sm" variant="outline" onClick={() => openPanel('attempt')}><PhoneOff size={14} className="mr-1 inline" />Call not connected</Button>}
              {canAct && <Button size="sm" variant="outline" onClick={() => openPanel('missed')}><UserX size={14} className="mr-1 inline" />Missed by parents</Button>}
              {canAct && <Button size="sm" variant="outline" onClick={() => openPanel('cancel')}><XCircle size={14} className="mr-1 inline" />Cancel</Button>}
              {isOpen && data.canManage && <Button size="sm" variant="outline" onClick={() => openPanel('assign')}><UserRoundCog size={14} className="mr-1 inline" />Assign</Button>}
              {!isOpen && data.canManage && <Button size="sm" variant="outline" onClick={() => openPanel('reopen')}><RotateCcw size={14} className="mr-1 inline" />Reopen</Button>}
            </div>

            {(panel === 'call' || panel === 'reschedule') && (
              <div className="mt-3 grid gap-2 rounded-lg border border-cardline bg-[#FAF8F2] p-3 sm:grid-cols-[220px_1fr_auto] sm:items-end">
                <label className="text-[12px] font-bold text-charcoal">{panel === 'call' ? 'Call date & time' : 'New date & time'}<input type="datetime-local" className="mt-1 w-full rounded-lg border border-cardline bg-white px-2 py-1.5 text-[13px]" value={fields.callAt || ''} onChange={(e) => set('callAt', e.target.value)} /></label>
                {panel === 'reschedule' ? <label className="text-[12px] font-bold text-charcoal">Reason (parent ne kya kaha)<input className="mt-1 w-full rounded-lg border border-cardline bg-white px-2 py-1.5 text-[13px]" value={fields.reason || ''} onChange={(e) => set('reason', e.target.value)} placeholder="e.g. Parent busy, asked for evening" /></label> : <p className="text-[12px] text-charcoal/60">Due day: {fmtDay(s.targetDate)} (बुधवार को नहीं)</p>}
                <Button size="sm" disabled={busy} onClick={() => timeOk(fields.callAt) && run(() => (panel === 'call'
                  ? api.patch(`/care/sessions/${id}/call`, { callAt: new Date(fields.callAt).toISOString() })
                  : api.post(`/care/sessions/${id}/reschedule`, { callAt: new Date(fields.callAt).toISOString(), reason: fields.reason })), panel === 'call' ? 'Call time set' : 'Rescheduled')}>Save</Button>
              </div>
            )}
            {panel === 'attempt' && (
              <div className="mt-3 grid gap-2 rounded-lg border border-cardline bg-[#FAF8F2] p-3 sm:grid-cols-[220px_1fr_auto] sm:items-end">
                <label className="text-[12px] font-bold text-charcoal">What happened<select className="mt-1 w-full rounded-lg border border-cardline bg-white px-2 py-1.5 text-[13px]" value={fields.outcome || ''} onChange={(e) => set('outcome', e.target.value)}><option value="">Choose</option>{Object.entries(data.attemptOutcomes || {}).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
                <label className="text-[12px] font-bold text-charcoal">Note<input className="mt-1 w-full rounded-lg border border-cardline bg-white px-2 py-1.5 text-[13px]" value={fields.note || ''} onChange={(e) => set('note', e.target.value)} /></label>
                <Button size="sm" disabled={busy} onClick={() => run(() => api.post(`/care/sessions/${id}/attempt`, { outcome: fields.outcome, note: fields.note }), 'Call attempt recorded')}>Save</Button>
              </div>
            )}
            {panel === 'missed' && (
              <div className="mt-3 grid gap-2 rounded-lg border border-[#B4232F]/25 bg-[#FFFAFA] p-3 sm:grid-cols-[260px_1fr_auto] sm:items-end">
                <label className="text-[12px] font-bold text-charcoal">Reason<select className="mt-1 w-full rounded-lg border border-cardline bg-white px-2 py-1.5 text-[13px]" value={fields.reason || ''} onChange={(e) => set('reason', e.target.value)}><option value="">Choose</option>{(data.missedReasons || []).map((r) => <option key={r} value={r}>{r}</option>)}</select></label>
                <label className="text-[12px] font-bold text-charcoal">Details{fields.reason === 'Other' && <span className="text-[#B4232F]">*</span>}<input className="mt-1 w-full rounded-lg border border-cardline bg-white px-2 py-1.5 text-[13px]" value={fields.note || ''} onChange={(e) => set('note', e.target.value)} /></label>
                <Button size="sm" variant="danger" disabled={busy} onClick={() => run(() => api.post(`/care/sessions/${id}/missed`, { reason: fields.reason, note: fields.note }), 'Marked missed by parents')}>Mark missed</Button>
              </div>
            )}
            {(panel === 'cancel' || panel === 'reopen') && (
              <div className="mt-3 grid gap-2 rounded-lg border border-cardline bg-[#FAF8F2] p-3 sm:grid-cols-[1fr_auto] sm:items-end">
                <label className="text-[12px] font-bold text-charcoal">{panel === 'cancel' ? 'Why is it cancelled?' : 'Why reopen it?'}<input className="mt-1 w-full rounded-lg border border-cardline bg-white px-2 py-1.5 text-[13px]" value={fields.reason || ''} onChange={(e) => set('reason', e.target.value)} /></label>
                <Button size="sm" variant={panel === 'cancel' ? 'danger' : 'primary'} disabled={busy} onClick={() => run(() => api.post(`/care/sessions/${id}/${panel}`, { reason: fields.reason }), panel === 'cancel' ? 'Cancelled' : 'Reopened')}>{panel === 'cancel' ? 'Cancel session' : 'Reopen'}</Button>
              </div>
            )}
            {panel === 'assign' && (
              <div className="mt-3 grid gap-2 rounded-lg border border-cardline bg-[#FAF8F2] p-3 sm:grid-cols-[260px_1fr_auto] sm:items-end">
                <label className="text-[12px] font-bold text-charcoal">Give this session to<select className="mt-1 w-full rounded-lg border border-cardline bg-white px-2 py-1.5 text-[13px]" value={fields.userId || ''} onChange={(e) => set('userId', e.target.value)}><option value="">Choose</option>{staff.map((u) => <option key={u.id} value={u.id} disabled={u.onLeave}>{u.name} ({u.role.replace('_', ' ')}){u.onLeave ? ' — on leave' : ''}{u.id === s.owner ? ' — patient PCC' : ''}</option>)}</select></label>
                <label className="text-[12px] font-bold text-charcoal">Reason<input className="mt-1 w-full rounded-lg border border-cardline bg-white px-2 py-1.5 text-[13px]" value={fields.reason || ''} onChange={(e) => set('reason', e.target.value)} placeholder={s.leave ? 'PCC on leave' : ''} /></label>
                <Button size="sm" disabled={busy} onClick={() => run(() => api.post(`/care/sessions/${id}/assign`, { userId: fields.userId, reason: fields.reason || (s.leave ? 'PCC on leave' : '') }), 'Assigned')}>Assign</Button>
              </div>
            )}
          </div>

          <div className="flex gap-1 border-b border-cardline">
            {[['form', 'Form'], ['history', 'History']].map(([key, label]) => (
              <button key={key} type="button" onClick={() => setTab(key)} className={`-mb-px border-b-2 px-3 py-1.5 text-[13px] font-bold ${tab === key ? 'border-[#1F5F4A] text-[#1F5F4A]' : 'border-transparent text-charcoal/55'}`}>{key === 'history' && <History size={13} className="mr-1 inline" />}{label}</button>
            ))}
          </div>

          {tab === 'form' && (s.status === 'completed' || canAct
            ? (
              <>
                <CareForm template={data.template} context={data.context} answers={answers} onChange={(next) => { setAnswers(next); if (missing.size) setMissing(new Set()); }} readOnly={!canAct} missing={missing} onAction={onAction} code={s.code} />
                {canAct && (
                  <div className="sticky bottom-0 -mx-3.5 flex flex-wrap items-center justify-end gap-2 border-t border-cardline bg-offwhite-100/95 px-3.5 py-2.5 sm:-mx-6 sm:px-6">
                    {s.hasDraft && <span className="mr-auto text-[12px] text-charcoal/55">Draft saved {fmtAt(s.form?.savedAt)}</span>}
                    <Button variant="outline" disabled={busy} onClick={saveDraft}><Save size={14} className="mr-1 inline" />Save draft</Button>
                    <Button disabled={busy} onClick={complete}><CheckCircle2 size={14} className="mr-1 inline" />Save & mark done</Button>
                  </div>
                )}
              </>
            )
            : <p className="rounded-lg bg-[#FAF8F2] px-3 py-2 text-[13px] text-charcoal/65">{isOpen ? 'यह session आपका नहीं है — सिर्फ़ देख सकते हैं।' : 'यह session बंद है; form नहीं भरा गया।'}</p>)}

          {tab === 'history' && (
            <ul className="space-y-1.5 text-[12.5px]">
              {[...(s.log || [])].reverse().map((entry, i) => (
                <li key={i} className="flex gap-2 rounded-lg border border-cardline bg-white px-3 py-1.5"><span className="shrink-0 text-charcoal/50">{fmtAt(entry.at)}</span><span className="min-w-0 flex-1 text-charcoal">{entry.text}</span><span className="shrink-0 text-charcoal/50">{entry.byName}</span></li>
              ))}
              {!(s.log || []).length && <li className="text-charcoal/55">No history yet.</li>}
            </ul>
          )}
        </div>
      )}
    </Modal>
  );
}
