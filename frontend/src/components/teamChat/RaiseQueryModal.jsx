import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Paperclip, Send, X } from 'lucide-react';
import api from '../../api/axios.js';
import Button from '../ui/Button.jsx';
import Modal from '../ui/Modal.jsx';
import EnquiryPatientPicker from '../enquiries/EnquiryPatientPicker.jsx';
import { ROLE_LABELS } from '../../constants/roles.js';

const input = 'w-full min-w-0 rounded-md border border-cardline bg-offwhite-100 px-3 py-2 text-sm';

// Raise a query with one person. `person` ({id, name, role, queryTypes}) fixes who it goes to - the query types shown
// are the ones for that person's role (medicine not ready, explanation pending, ...). Without `person` the staff list
// is shown and the types follow the person picked. From a PO (`poId`) the patient, PO, medicine state and delay are
// prefilled. The thread opens in Team Chat once sent (or `onCreated` runs).
// `inline`: shown as a card inside the chat instead of a modal; `initialType`: query type picked already (from the PO).
export default function RaiseQueryModal({ open, onClose, poId = '', patient = null, person = null, onCreated, inline = false, initialType = '' }) {
  const navigate = useNavigate();
  const [staff, setStaff] = useState([]);
  const [draft, setDraft] = useState(null);
  const [files, setFiles] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!open) return;
    setError(''); setFiles([]);
    if (!person) api.get('/team-chat/people', { skipCache: true }).then(({ data }) => setStaff(data.people || [])).catch(() => setStaff([]));
    const base = { kind: 'query', queryType: '', subject: '', assignedTo: person?.id || '', message: '', patientName: patient?.patientName || '', patientReference: patient?.patientCode || '', patientId: patient?.id || '', patientInfo: patient || null, context: null };
    if (poId) {
      setDraft(null);
      api.get('/team-chat/context', { params: { poId }, skipCache: true })
        .then(({ data }) => {
          const d = { ...base, subject: data.subject, patientId: data.patient.id, patientName: data.patient.patientName, patientReference: data.patient.patientCode, patientInfo: { ...data.patient, id: data.patient.id }, context: data.context };
          // The type picked already (from the PO, or suggested by where it stands) fills the subject / message.
          const typeKey = initialType || data.suggest?.queryType || '';
          const t = (person?.queryTypes || []).find((x) => x.key === typeKey);
          setDraft(t ? { ...d, queryType: t.key, subject: t.subject ? `${t.subject} - ${d.patientName} (${d.patientReference})` : d.subject, message: t.message } : d);
        })
        .catch((err) => { setError(err.response?.data?.message || 'Could not read the purchase order'); setDraft(base); });
    } else setDraft(base);
  }, [open, poId, patient, person, initialType]);
  if (!open) return null;
  const target = person || staff.find((s) => s.id === draft?.assignedTo) || null;
  const types = target?.queryTypes || [];
  // Picking a type fills the subject and a starting message (kept if the person already typed something of their own).
  const pickType = (t) => setDraft((d) => {
    const base = d.patientName && t.subject ? `${t.subject} - ${d.patientName}${d.patientReference ? ` (${d.patientReference})` : ''}` : t.subject;
    const prev = types.find((x) => x.key === d.queryType);
    return { ...d, queryType: t.key, subject: !d.subject || (prev && d.subject.startsWith(prev.subject)) ? base : d.subject, message: !d.message || (prev && d.message === prev.message) ? t.message : d.message };
  });
  const submit = async (e) => {
    e.preventDefault();
    if (!draft.assignedTo) { setError('Select the person'); return; }
    if (draft.kind === 'query' && types.length && !draft.queryType) { setError('Pick what the query is about'); return; }
    if (!draft.subject.trim()) { setError('Write the subject'); return; }
    if (!draft.message.trim() && !files.length) { setError('Write the message'); return; }
    setSaving(true); setError('');
    try {
      const body = new FormData();
      ['kind', 'queryType', 'assignedTo', 'message'].forEach((k) => body.append(k, draft[k] || ''));
      body.append('subject', draft.subject.trim());
      if (draft.patientId) body.append('patientId', draft.patientId); else if (draft.patientName) body.append('patientName', draft.patientName);
      if (draft.context) body.append('context', JSON.stringify(draft.context));
      files.forEach((f) => body.append('files', f));
      const { data } = await api.post('/team-chat', body);
      onClose();
      if (onCreated) onCreated(data.chat); else navigate(`/admin/team-chat?with=${data.chat.assignedToId}&q=${data.chat.id}`);
    } catch (err) { setError(err.response?.data?.message || 'Could not send'); } finally { setSaving(false); }
  };
  const byRole = staff.reduce((acc, s) => { (acc[s.role] = acc[s.role] || []).push(s); return acc; }, {});
  const Wrap = inline ? ({ children }) => <div className="border-b border-cardline bg-[#FFF7ED] px-4 py-3"><div className="mb-2 flex items-center justify-between"><p className="text-sm font-bold text-charcoal">{person ? `Raise a query with ${person.name}` : 'Raise a query'}</p><button type="button" onClick={onClose} className="text-xs font-semibold text-charcoal/60 hover:underline">Cancel</button></div>{children}</div> : ({ children }) => <Modal open={open} onClose={() => !saving && onClose()} title={person ? `Raise a query with ${person.name}` : 'Raise a query'} className="max-w-2xl">{children}</Modal>;
  return (
    <Wrap>
      {!draft ? <p className="text-sm text-charcoal/60">Loading...</p> : (
        <form onSubmit={submit} className="space-y-3">
          {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
          <div className="flex gap-1.5">{[['query', 'Query (needs an answer / resolution)'], ['discussion', 'Discussion / information']].map(([k, l]) => <button key={k} type="button" onClick={() => setDraft({ ...draft, kind: k })} className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${draft.kind === k ? 'border-sage bg-sage text-white' : 'border-cardline bg-white text-charcoal/70'}`}>{l}</button>)}</div>
          <fieldset disabled={saving} className="grid gap-3 sm:grid-cols-2">
            {!person && <label className="space-y-1 text-sm sm:col-span-2">Send to *<select className={input} required value={draft.assignedTo} onChange={(e) => setDraft({ ...draft, assignedTo: e.target.value, queryType: '' })}><option value="">Select the person</option>{Object.entries(byRole).map(([role, list]) => <optgroup key={role} label={ROLE_LABELS[role] || role}>{list.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</optgroup>)}</select></label>}
            {target && draft.kind === 'query' && types.length > 0 && (
              <div className="sm:col-span-2">
                <p className="mb-1 text-sm font-medium text-charcoal">What is it about? <span className="font-normal text-charcoal/50">({ROLE_LABELS[target.role] || target.role})</span></p>
                <div className="flex flex-wrap gap-1.5">{types.map((t) => <button key={t.key} type="button" onClick={() => pickType(t)} className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${draft.queryType === t.key ? 'border-sage bg-sage text-white' : 'border-cardline bg-white text-charcoal/75 hover:border-sage/60'}`}>{t.label}</button>)}</div>
              </div>
            )}
            {draft.context ? (
              <div className="rounded-lg border border-sage/40 bg-[#F3F6F2] p-3 text-sm sm:col-span-2">
                <p className="font-bold text-charcoal">{draft.patientName} <span className="font-normal text-charcoal/60">· {draft.patientReference}</span></p>
                <pre className="mt-1 whitespace-pre-wrap font-body text-xs text-charcoal/75">{draft.context.summary}</pre>
                <p className="mt-1 text-[11px] text-charcoal/50">This goes with the query so the other side sees the situation at once.</p>
              </div>
            ) : <EnquiryPatientPicker draft={draft} setDraft={setDraft} />}
            <label className="space-y-1 text-sm sm:col-span-2">Subject *<input className={input} required maxLength={180} value={draft.subject} onChange={(e) => setDraft({ ...draft, subject: e.target.value })} /></label>
            <label className="space-y-1 text-sm sm:col-span-2">Message *<textarea className={input} rows={4} maxLength={4000} value={draft.message} onChange={(e) => setDraft({ ...draft, message: e.target.value })} placeholder={draft.kind === 'query' ? 'What do you need to know or get done?' : 'What do you want to share?'} /></label>
            <div className="sm:col-span-2">
              <label className="inline-flex cursor-pointer items-center gap-1.5 text-xs font-semibold text-sage"><Paperclip size={14} />Attach images / PDF<input type="file" multiple accept="image/*,application/pdf" className="hidden" onChange={(e) => { setFiles((l) => [...l, ...e.target.files].slice(0, 5)); e.target.value = ''; }} /></label>
              {files.length > 0 && <ul className="mt-1 flex flex-wrap gap-1.5">{files.map((f, i) => <li key={i} className="inline-flex items-center gap-1 rounded-full bg-offwhite-200 px-2 py-0.5 text-xs">{f.name}<button type="button" aria-label="Remove" onClick={() => setFiles((l) => l.filter((_, n) => n !== i))}><X size={12} /></button></li>)}</ul>}
            </div>
          </fieldset>
          <Button type="submit" disabled={saving}><Send size={15} />{saving ? 'Sending...' : 'Send'}</Button>
        </form>
      )}
    </Wrap>
  );
}
