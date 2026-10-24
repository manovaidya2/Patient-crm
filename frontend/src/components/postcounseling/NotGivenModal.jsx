import { useEffect, useState } from 'react';
import { Ban } from 'lucide-react';
import api from '../../api/axios.js';
import Modal from '../ui/Modal.jsx';
import Button from '../ui/Button.jsx';

export const NOT_GIVEN_OPTIONS = [
  ['postcounselling_not_done', 'Post counselling not done'],
  ['treatment_not_given', 'Treatment not given'],
];

// Moves a post-counselling patient to the Treatment Not Given page (with the reason). They can be restored later.
export default function NotGivenModal({ patient, onClose, onDone }) {
  const [kind, setKind] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { if (patient) { setKind(''); setReason(''); setError(''); } }, [patient]);

  const submit = async (event) => {
    event.preventDefault();
    setSaving(true); setError('');
    try {
      await api.post(`/post-counseling/patients/${patient.id}/not-given`, { kind, reason });
      onDone?.();
      onClose();
    } catch (err) { setError(err.response?.data?.message || 'Could not move the patient'); }
    finally { setSaving(false); }
  };

  return (
    <Modal open={Boolean(patient)} onClose={() => !saving && onClose()} title={patient ? `Treatment not given · ${patient.patientName}` : ''} className="max-w-lg">
      <form onSubmit={submit} className="space-y-4">
        <p className="text-sm text-charcoal/70">The patient moves from Post Counseling Patients to the <b>Treatment Not Given</b> page. You can restore them back anytime from there.</p>
        {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        <fieldset className="space-y-2">
          <legend className="mb-1 text-sm font-semibold text-charcoal">What happened? <span className="text-red-700">*</span></legend>
          {NOT_GIVEN_OPTIONS.map(([value, label]) => (
            <label key={value} className={`flex cursor-pointer items-center gap-3 rounded-[10px] border px-3 py-2.5 text-sm font-semibold ${kind === value ? 'border-[#FDBA74] bg-[#FFF7ED] text-[#C2410C]' : 'border-[#E8DFCB] bg-white text-charcoal'}`}>
              <input type="radio" name="not-given-kind" value={value} checked={kind === value} onChange={() => setKind(value)} className="h-4 w-4 accent-[#F97316]" required />
              {label}
            </label>
          ))}
        </fieldset>
        <label className="block space-y-1 text-sm font-semibold text-charcoal">Reason <span className="text-red-700">*</span>
          <textarea className="w-full rounded-[10px] border border-[#DED2BD] bg-white px-3 py-2 text-sm font-normal" rows={3} maxLength={1000} required value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Parents left before post counselling / doctor advised no treatment now" />
        </label>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button type="submit" variant="orange" disabled={saving || !kind || !reason.trim()}><Ban size={15} />{saving ? 'Moving...' : 'Move to Treatment Not Given'}</Button>
        </div>
      </form>
    </Modal>
  );
}
