import { useEffect, useState } from 'react';
import api from '../../api/axios.js';
import Button from '../../components/ui/Button.jsx';
import Modal from '../../components/ui/Modal.jsx';
import { CALL_OUTCOMES, CALL_TYPES, timeInput, todayInput } from './hrOptions.js';

const fieldClass = 'mt-1 w-full rounded-md border border-cardline bg-white px-3 py-2.5 text-sm text-charcoal outline-none focus:border-sage focus:ring-2 focus:ring-sage/15';
const toFollowUpFields = (value) => {
  if (!value) return { nextFollowUpDate: '', nextFollowUpTime: '' };
  const date = new Date(value);
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
  const time = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false }).format(date);
  return { nextFollowUpDate: parts, nextFollowUpTime: time };
};

export default function HrCallForm({ open, call, fixedCandidate, candidates = [], onClose, onSaved }) {
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setForm(call ? {
      candidateId: call.candidateId, callDate: call.callDate, callTime: call.callTime,
      callType: call.callType, outcome: call.outcome, remarks: call.remarks,
      ...toFollowUpFields(call.nextFollowUpAt),
    } : {
      candidateId: fixedCandidate?.id || '', callDate: todayInput(), callTime: timeInput(),
      callType: 'first_call', outcome: 'connected', remarks: '', nextFollowUpDate: '', nextFollowUpTime: '',
    });
    setError('');
  }, [open, call, fixedCandidate]);

  const set = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));
  const submit = async (event) => {
    event.preventDefault();
    if ((form.nextFollowUpDate && !form.nextFollowUpTime) || (!form.nextFollowUpDate && form.nextFollowUpTime)) {
      setError('Next follow-up date and time must both be entered'); return;
    }
    setSaving(true); setError('');
    try {
      const { data } = call
        ? await api.patch(`/hr/calls/${call.id}`, form)
        : await api.post('/hr/calls', form);
      onSaved(data.call); onClose();
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Call record could not be saved');
    } finally { setSaving(false); }
  };

  return <Modal open={open} onClose={onClose} title={call ? 'Edit manual call record' : 'Add manual call'} className="max-w-4xl">
    <form onSubmit={submit} className="space-y-4">
      {error && <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">{error}</div>}
      <div className="rounded-md border border-[#C9DCD8] bg-[#EFF7F5] px-3 py-2 text-sm text-[#315F5A]">This is an HR-entered manual record. No call is placed or verified by the CRM.</div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {!fixedCandidate && !call && <label className="text-sm font-medium sm:col-span-2 lg:col-span-3">Candidate *<select className={fieldClass} value={form.candidateId || ''} onChange={set('candidateId')} required><option value="">Select candidate</option>{candidates.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.candidateCode} - {candidate.name} ({candidate.appliedPosition})</option>)}</select></label>}
        {(fixedCandidate || call) && <div className="sm:col-span-2 lg:col-span-3 rounded-md border border-cardline bg-offwhite-200 px-3 py-2.5"><p className="text-xs uppercase text-charcoal/50">Candidate</p><p className="font-semibold">{fixedCandidate?.name || call?.candidateName} <span className="font-normal text-charcoal/60">• {fixedCandidate?.candidateCode || call?.candidateCode}</span></p></div>}
        <label className="text-sm font-medium">Call date *<input type="date" className={fieldClass} value={form.callDate || ''} onChange={set('callDate')} required /></label>
        <label className="text-sm font-medium">Call time *<input type="time" className={fieldClass} value={form.callTime || ''} onChange={set('callTime')} required /></label>
        <label className="text-sm font-medium">Call type *<select className={fieldClass} value={form.callType || ''} onChange={set('callType')} required>{CALL_TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label className="text-sm font-medium">Call outcome *<select className={fieldClass} value={form.outcome || ''} onChange={set('outcome')} required>{CALL_OUTCOMES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label className="text-sm font-medium">Next follow-up date<input type="date" className={fieldClass} value={form.nextFollowUpDate || ''} onChange={set('nextFollowUpDate')} /></label>
        <label className="text-sm font-medium">Next follow-up time<input type="time" className={fieldClass} value={form.nextFollowUpTime || ''} onChange={set('nextFollowUpTime')} /></label>
      </div>
      <label className="block text-sm font-medium">Call remarks *<textarea rows="4" className={fieldClass} placeholder="Record what was discussed and the next action" value={form.remarks || ''} onChange={set('remarks')} required /></label>
      <div className="flex justify-end gap-2"><Button variant="ghost" onClick={onClose}>Cancel</Button><Button type="submit" disabled={saving}>{saving ? 'Saving...' : 'Save manual call'}</Button></div>
    </form>
  </Modal>;
}
