import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, PhoneIncoming, Pencil, Plus, RefreshCw, Search, X } from 'lucide-react';
import api from '../../api/axios.js';
import Button from '../../components/ui/Button.jsx';
import Modal from '../../components/ui/Modal.jsx';
import { PageHeader } from '../../components/ui/Layout.jsx';

// In Transit's Incoming Call Log: calls patients / families made to the clinic - when, who, what they asked and what was
// answered. The patient is found by name, Patient ID or phone. Entered by hand for now (later fetched from the phone).
const field = 'w-full rounded-lg border border-cardline bg-white px-3 py-2 text-sm text-charcoal focus:border-sage focus:outline-none focus:ring-2 focus:ring-sage/20';
const pad = (n) => String(n).padStart(2, '0');
const localNow = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const localOf = (v) => { const d = new Date(v); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const when = (v) => (v ? new Date(v).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-');
const Label = ({ title, children, className = '' }) => <label className={`block min-w-0 ${className}`}><span className="mb-1 block text-xs font-semibold text-charcoal">{title}</span>{children}</label>;

function PatientPicker({ value, onChange }) {
  const [q, setQ] = useState('');
  const [rows, setRows] = useState([]);
  useEffect(() => {
    if (q.trim().length < 2) { setRows([]); return undefined; }
    const timer = setTimeout(() => api.get('/incoming-calls/patients', { params: { q }, skipCache: true }).then(({ data }) => setRows(data.patients || [])).catch(() => setRows([])), 250);
    return () => clearTimeout(timer);
  }, [q]);
  if (value) return <div className="flex items-center justify-between gap-2 rounded-lg border border-sage/40 bg-sage/10 px-3 py-2 text-sm"><span className="min-w-0 truncate"><b>{value.patientName}</b>{value.patientCode ? ` · ${value.patientCode}` : ''}{value.phone ? ` · ${value.phone}` : ''}</span><button type="button" aria-label="Change patient" onClick={() => onChange(null)} className="text-charcoal/60"><X size={15} /></button></div>;
  return (
    <div className="relative">
      <div className="relative"><Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-charcoal/40" /><input className={`${field} pl-8`} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, Patient ID or phone" /></div>
      {rows.length > 0 && <div className="absolute z-10 mt-1 max-h-56 w-full overflow-auto rounded-lg border border-cardline bg-white shadow-lg">{rows.map((p) => <button key={p.id} type="button" onClick={() => { onChange(p); setQ(''); setRows([]); }} className="block w-full border-b border-cardline px-3 py-2 text-left text-sm last:border-b-0 hover:bg-[#FBF7ED]"><b>{p.patientName}</b> <span className="text-charcoal/60">{[p.patientCode, p.phone, p.guardianName].filter(Boolean).join(' · ')}</span></button>)}</div>}
      {q.trim().length >= 2 && !rows.length && <p className="mt-1 text-xs text-charcoal/55">No patient found. You can still log the call with the caller's name below.</p>}
    </div>
  );
}

function CallForm({ call, onSaved, onCancel }) {
  const [patient, setPatient] = useState(call?.patientId ? { id: call.patientId, patientName: call.patientName, patientCode: call.patientCode } : null);
  const [form, setForm] = useState({
    patientName: call && !call.patientId ? call.patientName : '', callerName: call?.callerName || '', callerPhone: call?.callerPhone || '',
    receivedAt: call ? localOf(call.receivedAt) : localNow(), durationMinutes: call?.durationMinutes ?? '', query: call?.query || '', answer: call?.answer || '', followUpNeeded: Boolean(call?.followUpNeeded),
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  // A new call of a patient with open follow-ups: tick the ones this call answers, they are marked done with it.
  const [pending, setPending] = useState([]);
  const [closing, setClosing] = useState([]);
  useEffect(() => {
    if (call || !patient?.id) { setPending([]); setClosing([]); return; }
    api.get('/incoming-calls', { params: { patientId: patient.id, followUp: 'open' }, skipCache: true }).then(({ data }) => { setPending(data.calls || []); setClosing((data.calls || []).map((c) => c.id)); }).catch(() => setPending([]));
  }, [patient?.id, call]);
  const set = (key) => (e) => setForm((old) => ({ ...old, [key]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
  const choose = (p) => { setPatient(p); if (p && !form.callerPhone && p.phone) setForm((old) => ({ ...old, callerPhone: p.phone })); };
  const submit = async (e) => {
    e.preventDefault(); setSaving(true); setError('');
    const body = { ...form, patientId: patient?.id || '', receivedAt: new Date(form.receivedAt).toISOString(), closeFollowUps: closing };
    try { if (call) await api.patch(`/incoming-calls/${call.id}`, body); else await api.post('/incoming-calls', body); onSaved(); }
    catch (err) { setError(err.response?.data?.message || 'The call could not be saved'); }
    finally { setSaving(false); }
  };
  return (
    <form onSubmit={submit} className="space-y-3">
      <Label title="Patient (search by name, Patient ID or phone)"><PatientPicker value={patient} onChange={choose} /></Label>
      {!patient && <Label title="Or patient / caller name (not in the system)"><input className={field} maxLength={200} value={form.patientName} onChange={set('patientName')} /></Label>}
      <div className="grid gap-3 sm:grid-cols-2">
        <Label title="Caller name"><input className={field} maxLength={200} value={form.callerName} onChange={set('callerName')} placeholder="e.g. Mother" /></Label>
        <Label title="Caller phone"><input className={field} inputMode="tel" maxLength={20} value={form.callerPhone} onChange={set('callerPhone')} /></Label>
        <Label title="Call came at *"><input className={field} type="datetime-local" required max={localNow()} value={form.receivedAt} onChange={set('receivedAt')} /></Label>
        <Label title="Duration (minutes)"><input className={field} type="number" min="0" max="600" value={form.durationMinutes} onChange={set('durationMinutes')} /></Label>
      </div>
      <Label title="What the caller asked / said *"><textarea className={field} rows={3} required maxLength={2000} value={form.query} onChange={set('query')} /></Label>
      <Label title="What was answered *"><textarea className={field} rows={3} required maxLength={2000} value={form.answer} onChange={set('answer')} /></Label>
      {pending.length > 0 && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm">
          <p className="mb-1.5 font-bold text-amber-900">This patient has {pending.length} open follow-up{pending.length === 1 ? '' : 's'}. Ticked ones are marked done with this call:</p>
          {pending.map((p) => <label key={p.id} className="flex items-start gap-2 py-0.5"><input type="checkbox" className="mt-1 accent-[#5B7B65]" checked={closing.includes(p.id)} onChange={(e) => setClosing((old) => (e.target.checked ? [...old, p.id] : old.filter((id) => id !== p.id)))} /><span>{when(p.receivedAt)} · {p.query}</span></label>)}
        </div>
      )}
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.followUpNeeded} onChange={set('followUpNeeded')} className="accent-[#5B7B65]" />Needs a follow-up / call back</label>
      {error && <p role="alert" className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      <div className="flex justify-end gap-2"><Button type="button" variant="outline" disabled={saving} onClick={onCancel}>Cancel</Button><Button type="submit" disabled={saving}>{saving ? 'Saving...' : call ? 'Save changes' : 'Save call'}</Button></div>
    </form>
  );
}

function FollowUpDoneForm({ call, onSaved, onCancel }) {
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const submit = async (e) => {
    e.preventDefault(); setSaving(true); setError('');
    try { await api.post(`/incoming-calls/${call.id}/follow-up-done`, { note }); onSaved(); }
    catch (err) { setError(err.response?.data?.message || 'Could not mark it done'); }
    finally { setSaving(false); }
  };
  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="rounded-lg bg-[#FBF7ED] px-3 py-2 text-sm"><p className="font-semibold">{call.patientName} · {when(call.receivedAt)}</p><p className="text-charcoal/70">Asked: {call.query}</p></div>
      <Label title="What was done (called back, solution given) *"><textarea className={field} rows={3} required maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Called back at 5 pm, told the dispatch date, patient satisfied" /></Label>
      {error && <p role="alert" className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      <div className="flex justify-end gap-2"><Button type="button" variant="outline" disabled={saving} onClick={onCancel}>Cancel</Button><Button type="submit" disabled={saving || !note.trim()}><Check size={15} />{saving ? 'Saving...' : 'Mark follow-up done'}</Button></div>
    </form>
  );
}

export default function IncomingCallLog() {
  const [q, setQ] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(null); // 'new' or a call
  const [closingCall, setClosingCall] = useState(null);
  const [onlyOpen, setOnlyOpen] = useState(false);
  const load = useCallback(async () => {
    setLoading(true);
    try { const { data: res } = await api.get('/incoming-calls', { params: { q: q || undefined, from: from || undefined, to: to || undefined, followUp: onlyOpen ? 'open' : undefined, page }, skipCache: true }); setData(res); setError(''); }
    catch (err) { setError(err.response?.data?.message || 'Calls could not be loaded'); }
    finally { setLoading(false); }
  }, [q, from, to, page, onlyOpen]);
  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [load]);

  return (
    <div className="space-y-4">
      <PageHeader title="Incoming Call Log" icon={PhoneIncoming} subtitle="Calls from patients and families: when it came, who called, what they asked and what was answered." actions={<Button onClick={() => setEditing('new')}><Plus size={15} />Log incoming call</Button>} />
      <div className="flex flex-wrap items-end gap-2">
        <Label title="Search" className="min-w-[220px] flex-1"><input className={field} value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder="Patient, ID, caller, phone, question or answer" /></Label>
        <Label title="From"><input className={field} type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} /></Label>
        <Label title="To"><input className={field} type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} /></Label>
        <button type="button" aria-pressed={onlyOpen} onClick={() => { setOnlyOpen((v) => !v); setPage(1); }} className={`mb-0.5 rounded-full border px-3 py-2 text-xs font-bold ${onlyOpen ? 'border-amber-500 bg-amber-500 text-white' : 'border-amber-300 bg-amber-50 text-amber-900'}`}>Open follow-ups{data?.openFollowUps ? ` (${data.openFollowUps})` : ''}</button>
        <button type="button" aria-label="Refresh" onClick={load} className="mb-0.5 rounded-lg p-2 text-sage hover:bg-[#F3F6F2]"><RefreshCw size={15} className={loading ? 'animate-spin' : ''} /></button>
      </div>
      {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      <div className="overflow-x-auto rounded-[14px] border border-[#E8DFCB] bg-white">
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead className="bg-[#56695D] text-xs text-white"><tr>{['Call came at', 'Patient', 'Caller', 'Asked / said', 'Answered', 'Logged by', ''].map((h, i) => <th key={i} className="px-3 py-2.5 font-semibold">{h}</th>)}</tr></thead>
          <tbody className="divide-y divide-[#F0E8D8]">
            {(data?.calls || []).map((c) => (
              <tr key={c.id} className="align-top">
                <td className="whitespace-nowrap px-3 py-2.5 font-semibold">{when(c.receivedAt)}{c.durationMinutes != null && <p className="text-xs font-normal text-charcoal/55">{c.durationMinutes} min</p>}{c.followUpNeeded && (c.followUpDone
                  ? <div className="mt-1 max-w-[220px] whitespace-normal rounded-lg bg-emerald-50 px-2 py-1 text-[11px] font-normal text-emerald-900"><b>Follow-up done</b> · {c.followUpDone.byName}, {when(c.followUpDone.at)}<p className="mt-0.5 break-words">{c.followUpDone.note}</p></div>
                  : <div className="mt-1 flex flex-wrap items-center gap-1.5"><span className="inline-block rounded-full bg-amber-100 px-2 py-0.5 text-[10.5px] font-bold text-amber-900">Follow-up needed</span><button type="button" onClick={() => setClosingCall(c)} className="inline-flex items-center gap-1 rounded-full border border-sage/50 bg-white px-2 py-0.5 text-[10.5px] font-bold text-sage hover:bg-sage/10"><Check size={11} />Mark done</button></div>)}</td>
                <td className="px-3 py-2.5">{c.patientId ? <Link to={`/admin/patients/${c.patientId}`} className="font-bold text-charcoal hover:text-sage hover:underline">{c.patientName}</Link> : <b>{c.patientName || '-'}</b>}{c.patientCode && <p className="text-xs text-charcoal/55">{c.patientCode}</p>}</td>
                <td className="px-3 py-2.5 text-xs">{c.callerName || '-'}{c.callerPhone && <a href={`tel:${c.callerPhone}`} className="block font-semibold text-sage">{c.callerPhone}</a>}</td>
                <td className="max-w-[260px] whitespace-pre-wrap break-words px-3 py-2.5 text-xs">{c.query}</td>
                <td className="max-w-[260px] whitespace-pre-wrap break-words px-3 py-2.5 text-xs">{c.answer}</td>
                <td className="px-3 py-2.5 text-xs">{c.createdByName}<p className="text-charcoal/50">{when(c.createdAt)}</p>{c.editedAt && <p className="text-charcoal/50">Edited by {c.editedByName}</p>}</td>
                <td className="px-3 py-2.5">{c.canEdit && <button type="button" aria-label="Edit call" title="Edit call" onClick={() => setEditing(c)} className="rounded p-1.5 text-sage hover:bg-[#F3F6F2]"><Pencil size={14} /></button>}</td>
              </tr>
            ))}
            {data && !data.calls.length && <tr><td colSpan={7} className="px-3 py-10 text-center text-sm text-charcoal/55">No incoming calls logged{q || from || to ? ' for this search' : ' yet'}.</td></tr>}
            {!data && !error && <tr><td colSpan={7} className="px-3 py-10 text-center text-sm text-charcoal/55">Loading...</td></tr>}
          </tbody>
        </table>
      </div>
      {data?.pages > 1 && <div className="flex items-center justify-end gap-2 text-sm"><Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button><span>Page {page} of {data.pages} · {data.total} calls</span><Button size="sm" variant="outline" disabled={page >= data.pages} onClick={() => setPage((p) => p + 1)}>Next</Button></div>}
      <Modal open={Boolean(closingCall)} onClose={() => setClosingCall(null)} title="Follow-up done" className="max-w-lg">
        {closingCall && <FollowUpDoneForm call={closingCall} onCancel={() => setClosingCall(null)} onSaved={() => { setClosingCall(null); load(); }} />}
      </Modal>
      <Modal open={Boolean(editing)} onClose={() => setEditing(null)} title={editing === 'new' ? 'Log incoming call' : 'Edit incoming call'} className="max-w-xl">
        {editing && <CallForm call={editing === 'new' ? null : editing} onCancel={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}
      </Modal>
    </div>
  );
}
