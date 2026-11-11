import { useState } from 'react';
import { Send } from 'lucide-react';
import api from '../../api/axios.js';
import Button from '../ui/Button.jsx';
import Modal from '../ui/Modal.jsx';
import { FieldLabel, poInput } from '../purchaseOrders/CreatePurchaseOrderModal.jsx';

// The PCC raises the patient's query with the doctor (from a follow-up or the patient's page). The mic on the box
// types what is spoken.
export default function RaiseQueryModal({ patientId, patientName, stage, onClose, onDone }) {
  const [query, setQuery] = useState('');
  const [isUrgent, setIsUrgent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submit = async (e) => {
    e.preventDefault();
    if (!query.trim()) { setError('Write the patient\'s query'); return; }
    setBusy(true); setError('');
    try {
      const { data } = await api.post(`/advice/patients/${patientId}`, { query: query.trim(), isUrgent, stage });
      onDone?.(data.advice);
    } catch (err) { setError(err.response?.data?.message || 'Could not raise the query'); } finally { setBusy(false); }
  };
  return (
    <Modal open onClose={onClose} title="Raise patient query to doctor" className="max-w-lg">
      <form onSubmit={submit} className="space-y-3.5">
        {error && <div className="rounded-lg bg-[#8C3B2E]/8 px-3.5 py-3 text-sm text-[#8C3B2E]">{error}</div>}
        <p className="text-sm text-charcoal/70"><b className="text-charcoal">{patientName}</b> · Phase {stage || '-'}</p>
        <FieldLabel label="Patient's query" required><textarea className={poInput} rows={5} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="What did the patient / parent ask?" /></FieldLabel>
        <label className="flex items-start gap-2 rounded-lg border border-[#B42318]/25 bg-[#B42318]/5 px-3 py-2.5 text-sm"><input type="checkbox" className="mt-0.5 h-4 w-4 accent-[#B42318]" checked={isUrgent} onChange={(e) => setIsUrgent(e.target.checked)} /><span><b className="text-[#B42318]">Mark as emergency</b><span className="block text-xs text-charcoal/60">The doctor's sidebar and dashboard show a red alert until it is answered.</span></span></label>
        <p className="text-xs text-charcoal/55">If the doctor does not answer, ring the doctor's alarm from Patient Queries.</p>
        <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={onClose}>Cancel</Button><Button type="submit" disabled={busy}><Send size={14} />{busy ? 'Sending...' : 'Send to doctor'}</Button></div>
      </form>
    </Modal>
  );
}
