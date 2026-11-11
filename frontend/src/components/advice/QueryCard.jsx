import { useState } from 'react';
import { Link } from 'react-router-dom';
import { AlarmClock, CheckCircle2, ChevronDown, PhoneCall, RotateCcw, Send } from 'lucide-react';
import api from '../../api/axios.js';
import Badge from '../ui/Badge.jsx';
import Button from '../ui/Button.jsx';
import Modal from '../ui/Modal.jsx';
import { FieldLabel, poInput } from '../purchaseOrders/CreatePurchaseOrderModal.jsx';
import { formatDateTime, PROGRESS, ProgressSteps, QueryThread, QueryTimeline, waitedFor, WaitingForDoctor } from './adviceParts.jsx';

// One patient query for the PCC: where it stands, the question and the doctor's answer, sending it to the patient,
// the follow-ups, and the PCC's next action (ring the doctor / mark sent / follow-up / solve / ask the doctor again).
const VIA = [['whatsapp', 'WhatsApp'], ['call', 'On call'], ['in_person', 'In person'], ['other', 'Other']];
const OUTCOMES = [['satisfied', 'Patient satisfied'], ['not_satisfied', 'Not satisfied'], ['not_reachable', 'Not reachable'], ['call_back', 'Asked to call back']];
const pad = (n) => String(n).padStart(2, '0');
// For <input type="datetime-local"> (the browser's own time).
const localInput = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
const inHours = (h) => localInput(new Date(Date.now() + h * 3600 * 1000));
const waited = waitedFor;
const chip = (active) => `rounded-full border px-3 py-1.5 text-xs font-semibold ${active ? 'border-sage bg-sage text-white' : 'border-cardline bg-white text-charcoal/75 hover:border-sage/50'}`;

function ActionModal({ kind, row, onClose, onDone }) {
  const [form, setForm] = useState(() => ({
    via: 'whatsapp', note: '', followUpAt: inHours(24), outcome: '', nextAt: inHours(3), solve: true, solveNote: '', query: '', isUrgent: false,
  }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const needsNext = ['not_reachable', 'call_back'].includes(form.outcome);
  const at = (v) => (v ? new Date(v).toISOString() : '');
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      let res;
      if (kind === 'alarm') res = await api.post(`/advice/${row.id}/alarm`, { note: form.note });
      if (kind === 'sent') res = await api.post(`/advice/${row.id}/sent`, { via: form.via, note: form.note, followUpAt: at(form.followUpAt) });
      if (kind === 'followup') res = await api.post(`/advice/${row.id}/follow-up`, { outcome: form.outcome, note: form.note, nextAt: needsNext || (form.outcome === 'not_satisfied' && form.nextAt) ? at(form.nextAt) : '', solve: form.outcome === 'satisfied' && form.solve, solveNote: form.solveNote });
      if (kind === 'solve') res = await api.post(`/advice/${row.id}/resolve`, { note: form.note });
      if (kind === 'again') res = await api.post(`/advice/${row.id}/ask-again`, { query: form.query, isUrgent: form.isUrgent });
      onDone(res?.data?.advice);
    } catch (err) {
      setError(err.response?.data?.message || 'Could not save');
    } finally { setBusy(false); }
  };
  const title = { alarm: "Ring the doctor's alarm", sent: 'Sent to the patient', followup: 'Follow-up with the patient', solve: 'Mark the query solved', again: 'Ask the doctor again' }[kind];
  return (
    <Modal open onClose={onClose} title={title} className="max-w-lg">
      <form onSubmit={submit} className="space-y-3.5">
        {error && <div className="rounded-lg bg-[#8C3B2E]/8 px-3.5 py-3 text-sm text-[#8C3B2E]">{error}</div>}
        <div className="rounded-lg border border-cardline bg-offwhite-200 p-3 text-xs text-charcoal/70"><b className="text-charcoal">{row.patientName}</b> · Phase {row.stage || '-'}<p className="mt-1 line-clamp-3 whitespace-pre-line">{row.query}</p></div>
        {kind === 'alarm' && <>
          <p className="text-sm text-charcoal/70">The doctor's screen rings an alarm until the doctor answers this query (waiting {waited(row.askedAt || row.createdAt)}).</p>
          <FieldLabel label="Message for the doctor (optional)"><textarea className={poInput} rows={2} value={form.note} onChange={(e) => set({ note: e.target.value })} placeholder="e.g. Parent is calling again, child has fever" /></FieldLabel>
        </>}
        {kind === 'sent' && <>
          <FieldLabel label="Sent how" required><div className="flex flex-wrap gap-1.5">{VIA.map(([k, l]) => <button key={k} type="button" className={chip(form.via === k)} onClick={() => set({ via: k })}>{l}</button>)}</div></FieldLabel>
          <FieldLabel label="Note (optional)"><textarea className={poInput} rows={2} value={form.note} onChange={(e) => set({ note: e.target.value })} placeholder="e.g. Sent the doctor's voice note to the mother" /></FieldLabel>
          <FieldLabel label="Follow-up call on" required><input type="datetime-local" className={poInput} value={form.followUpAt} onChange={(e) => set({ followUpAt: e.target.value })} required /></FieldLabel>
          <p className="text-xs text-charcoal/55">You get a reminder at this time to ask the patient whether it helped.</p>
        </>}
        {kind === 'followup' && <>
          <FieldLabel label="How did it go" required><div className="flex flex-wrap gap-1.5">{OUTCOMES.map(([k, l]) => <button key={k} type="button" className={chip(form.outcome === k)} onClick={() => set({ outcome: k })}>{l}</button>)}</div></FieldLabel>
          <FieldLabel label={form.outcome === 'not_satisfied' ? 'What is the patient still not satisfied with' : 'Note'} required={form.outcome === 'not_satisfied'}><textarea className={poInput} rows={3} value={form.note} onChange={(e) => set({ note: e.target.value })} /></FieldLabel>
          {(needsNext || form.outcome === 'not_satisfied') && <FieldLabel label={needsNext ? 'Call again on' : 'Next call on (optional - or ask the doctor again)'} required={needsNext}><input type="datetime-local" className={poInput} value={form.nextAt} onChange={(e) => set({ nextAt: e.target.value })} /></FieldLabel>}
          {form.outcome === 'satisfied' && <>
            <label className="flex items-start gap-2 rounded-lg border border-[#B7D7C2] bg-[#EEF7F1] px-3 py-2.5 text-sm"><input type="checkbox" className="mt-0.5 h-4 w-4 accent-[#1F6B41]" checked={form.solve} onChange={(e) => set({ solve: e.target.checked })} /><span><b className="text-[#1F6B41]">Mark the query solved</b><span className="block text-xs text-charcoal/60">The patient is satisfied with the doctor's answer.</span></span></label>
            {form.solve && <FieldLabel label="Closing note (optional)"><input className={poInput} value={form.solveNote} onChange={(e) => set({ solveNote: e.target.value })} /></FieldLabel>}
          </>}
          {form.outcome === 'not_satisfied' && <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">After saving, use <b>Ask doctor again</b> to send the patient's new question to the doctor.</p>}
        </>}
        {kind === 'solve' && <FieldLabel label="Closing note (optional)"><textarea className={poInput} rows={2} value={form.note} onChange={(e) => set({ note: e.target.value })} /></FieldLabel>}
        {kind === 'again' && <>
          <FieldLabel label="What to ask the doctor now" required><textarea className={poInput} rows={4} value={form.query} onChange={(e) => set({ query: e.target.value })} placeholder="The patient's new question / what did not work" /></FieldLabel>
          <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-0.5 h-4 w-4 accent-[#B42318]" checked={form.isUrgent} onChange={(e) => set({ isUrgent: e.target.checked })} /><span className="font-semibold text-[#B42318]">Mark as emergency</span></label>
          <p className="text-xs text-charcoal/55">The earlier question, answer and follow-ups stay on this query.</p>
        </>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" variant={kind === 'alarm' ? 'danger' : 'primary'} disabled={busy || (kind === 'followup' && !form.outcome) || (kind === 'again' && !form.query.trim())}>{busy ? 'Saving...' : kind === 'alarm' ? 'Ring alarm' : 'Save'}</Button>
        </div>
      </form>
    </Modal>
  );
}

export default function QueryCard({ row, number = 0, canAct = false, showPatient = true, onChanged, onEdit, highlight = false }) {
  const [action, setAction] = useState('');
  const isOpen = row.progress !== 'solved';
  // A solved query folds to one line; open ones (and the one opened from a link) stay open.
  const [expanded, setExpanded] = useState(isOpen || highlight);
  const [label, tone] = PROGRESS[row.progress] || PROGRESS.with_doctor;
  const lastFollowUp = row.followUps?.[row.followUps.length - 1];
  const late = row.nextFollowUpAt && new Date(row.nextFollowUpAt) < new Date();
  const asked = (row.rounds?.length || 0) + 1;
  const firstQuestion = row.rounds?.[0]?.query || row.query;
  const lastAnswer = row.advice || (row.adviceVoice?.url ? 'Voice answer' : '');
  const accent = row.progress === 'solved' ? 'border-l-[#1F6B41]' : row.progress === 'with_doctor' ? (row.isUrgent ? 'border-l-[#B42318]' : 'border-l-[#D9A441]') : 'border-l-[#F97316]';
  return (
    <div id={`query-${row.id}`} className={`rounded-xl border border-l-4 border-cardline ${accent} ${highlight ? 'ring-2 ring-[#F97316]' : ''} ${row.isUrgent && row.progress === 'with_doctor' ? 'bg-[#B42318]/5' : 'bg-offwhite-100'}`}>
      <div className="flex flex-col gap-2 p-3.5 sm:flex-row sm:items-start sm:justify-between sm:p-4">
        <button type="button" onClick={() => setExpanded((v) => !v)} className="min-w-0 flex-1 text-left" aria-expanded={expanded}>
          <div className="flex flex-wrap items-center gap-2">
            {number > 0 && <span className="rounded-md bg-charcoal px-2 py-0.5 text-xs font-extrabold text-white">Query {number}</span>}
            {showPatient && <span className="font-display text-base font-bold text-charcoal">{row.patientName || 'Patient'}</span>}
            {showPatient && row.patientCode && <Badge tone="default">{row.patientCode}</Badge>}
            <Badge tone="teal">Phase {row.stage || '-'}</Badge>
            {row.isUrgent && row.progress !== 'solved' && <Badge tone="danger">Emergency</Badge>}
            <Badge tone={tone}>{label}</Badge>
            {asked > 1 && <Badge tone="default">Asked {asked} times</Badge>}
            <ChevronDown size={15} className={`text-charcoal/45 transition-transform ${expanded ? 'rotate-180' : ''}`} />
          </div>
          <p className="mt-1 text-xs text-charcoal/50">Raised by {row.requestedByName || 'PCC'} on {formatDateTime(row.rounds?.[0]?.askedAt || row.askedAt || row.createdAt)}{row.resolvedAt ? ` · solved ${formatDateTime(row.resolvedAt)}` : ''}</p>
          {!expanded && (
            <p className="mt-1.5 line-clamp-2 text-sm text-charcoal/80"><b className="text-charcoal">Q:</b> {firstQuestion}{lastAnswer && <><span className="mx-1.5 text-charcoal/35">→</span><b className="text-[#2F5E7A]">A:</b> {lastAnswer}</>}</p>
          )}
        </button>
        {canAct && isOpen && (
          <div className="flex flex-wrap gap-1.5 sm:justify-end">
            {showPatient && row.patientId && <Link to={`/admin/patients/${row.patientId}`}><Button size="sm" variant="ghost">Patient</Button></Link>}
            {row.progress === 'with_doctor' && onEdit && <Button size="sm" variant="ghost" onClick={() => onEdit(row)}>Edit</Button>}
            {row.progress === 'with_doctor' && <Button size="sm" variant="danger" onClick={() => setAction('alarm')}><AlarmClock size={13} />Ring doctor</Button>}
            {row.progress === 'to_send' && <Button size="sm" variant="orange" onClick={() => setAction('sent')}><Send size={13} />Mark sent to patient</Button>}
            {row.progress === 'follow_up' && <Button size="sm" variant={lastFollowUp?.outcome === 'satisfied' ? 'outline' : 'orange'} onClick={() => setAction('followup')}><PhoneCall size={13} />Add follow-up</Button>}
            {row.progress === 'follow_up' && lastFollowUp?.outcome === 'satisfied' && <Button size="sm" onClick={() => setAction('solve')}><CheckCircle2 size={13} />Mark solved</Button>}
            {['to_send', 'follow_up'].includes(row.progress) && <Button size="sm" variant="outline" onClick={() => setAction('again')}><RotateCcw size={13} />Ask doctor again</Button>}
          </div>
        )}
        {(!canAct || !isOpen) && showPatient && row.patientId && <Link to={`/admin/patients/${row.patientId}`} className="shrink-0"><Button size="sm" variant="ghost">Patient</Button></Link>}
      </div>

      {expanded && (
        <div className="space-y-3 border-t border-cardline px-3.5 pb-3.5 pt-3 sm:px-4 sm:pb-4">
          <ProgressSteps row={row} />
          <QueryThread row={row} waiting={() => <WaitingForDoctor row={row} />} />
          {isOpen && row.nextFollowUpAt && <p className={`rounded-lg px-3 py-2 text-xs font-semibold ${late ? 'bg-[#FDE2E1] text-[#9F1D1D]' : 'bg-[#FBF0DC] text-[#7C5B2E]'}`}>{late ? 'Follow-up late' : 'Next follow-up'}: {formatDateTime(row.nextFollowUpAt)}</p>}
          {isOpen && row.progress === 'follow_up' && !row.nextFollowUpAt && lastFollowUp?.outcome === 'not_satisfied' && <p className="rounded-lg bg-[#FDE2E1] px-3 py-2 text-xs font-semibold text-[#9F1D1D]">Patient not satisfied: ask the doctor again, or add the next follow-up.</p>}
          {isOpen && row.progress === 'follow_up' && lastFollowUp?.outcome === 'satisfied' && <p className="rounded-lg bg-[#EEF7F1] px-3 py-2 text-xs font-semibold text-[#1F6B41]">Patient satisfied: mark the query solved.</p>}
          {row.resolvedAt && <p className="rounded-lg bg-[#EEF7F1] px-3 py-2 text-xs text-[#1F6B41]"><b>Solved</b> · {formatDateTime(row.resolvedAt)}{row.resolvedByName ? ` · ${row.resolvedByName}` : ''}{row.resolvedNote ? ` · ${row.resolvedNote}` : ''}</p>}
          <QueryTimeline timeline={row.timeline} />
        </div>
      )}

      {action && <ActionModal kind={action} row={row} onClose={() => setAction('')} onDone={(advice) => { setAction(''); onChanged?.(advice); }} />}
    </div>
  );
}
