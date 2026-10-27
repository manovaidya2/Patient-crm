import { useEffect, useState } from 'react';
import { AlertTriangle, MinusCircle, TrendingUp } from 'lucide-react';
import api from '../../api/axios.js';
import Modal from '../ui/Modal.jsx';
import Button from '../ui/Button.jsx';

export const OUTCOME_LABELS = { problem: 'Facing problem', improvement: 'Improvement found' };

const OPTIONS = [
  { value: 'problem', label: 'Patient is facing a problem', icon: AlertTriangle, tone: 'border-[#F5B5B0] bg-[#FDECEA] text-[#9F1D1D]', placeholder: 'What problem is the patient facing?' },
  { value: 'improvement', label: 'Improvement found in patient', icon: TrendingUp, tone: 'border-[#A7D7B8] bg-[#E8F5EC] text-[#1F6B41]', placeholder: 'What improvement was found?' },
  { value: 'none', label: 'None', icon: MinusCircle, tone: 'border-[#DED2BD] bg-[#FBF7ED] text-charcoal' },
];

// Shown right after a follow-up / family session is marked done (and from "Note progress" later).
// Optional: "None" just closes it. target = { field: 'followups' | 'family-sessions', stage, entryId, label, outcome?, note? }
export default function SessionOutcomeModal({ patientId, target, onClose, onSaved }) {
  const [choice, setChoice] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!target) return;
    setChoice(target.outcome || '');
    setNote(target.note || '');
    setError('');
  }, [target]);

  const option = OPTIONS.find((item) => item.value === choice);
  const close = () => { if (!saving) onClose(); };

  const pick = (value) => {
    if (value === 'none' && !target?.outcome) { onClose(); return; }
    setChoice(value);
    setError('');
  };

  const submit = async (event) => {
    event.preventDefault();
    if (!choice) { setError('Choose an option'); return; }
    if (choice !== 'none' && !note.trim()) { setError(choice === 'problem' ? 'Write the problem' : 'Write the improvement'); return; }
    setSaving(true); setError('');
    try {
      const { data } = await api.patch(`/patients/${patientId}/stages/${target.stage}/${target.field}/${target.entryId}/outcome`, {
        outcome: choice === 'none' ? '' : choice,
        note: choice === 'none' ? '' : note.trim(),
      });
      onSaved?.(data.patient);
      onClose();
    } catch (err) {
      setError(err.response?.data?.message || 'Could not save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={Boolean(target)} onClose={close} title={target ? `How is the patient doing? · ${target.label}` : ''} className="max-w-lg">
      <form onSubmit={submit} className="space-y-4">
        <p className="text-sm text-charcoal/70">Optional. This goes to the <b>Patient Improvement</b> page.</p>
        {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        <div className="grid gap-2">
          {OPTIONS.map(({ value, label, icon: Icon, tone }) => (
            <button
              key={value}
              type="button"
              onClick={() => pick(value)}
              aria-pressed={choice === value}
              className={`flex items-center gap-3 rounded-[10px] border px-3 py-2.5 text-left text-sm font-semibold transition ${choice === value ? tone : 'border-[#E8DFCB] bg-white text-charcoal hover:bg-[#FBF7ED]'}`}
            >
              <Icon size={17} aria-hidden="true" />{label}
            </button>
          ))}
        </div>
        {option && option.value !== 'none' && (
          <label className="block space-y-1.5 text-sm font-medium text-charcoal">
            <span>{option.value === 'problem' ? 'Problem' : 'Improvement'} <span className="text-red-700">*</span></span>
            <textarea
              rows={3}
              autoFocus
              value={note}
              maxLength={2000}
              onChange={(e) => setNote(e.target.value)}
              placeholder={option.placeholder}
              className="w-full resize-y rounded-lg border border-cardline bg-offwhite-200 px-3.5 py-2.5 text-sm text-charcoal outline-none focus:border-sage focus:ring-2 focus:ring-sage/20"
            />
          </label>
        )}
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="ghost" onClick={close} disabled={saving}>Skip</Button>
          {choice && <Button type="submit" disabled={saving}>{saving ? 'Saving...' : choice === 'none' ? 'Clear note' : 'Save'}</Button>}
        </div>
      </form>
    </Modal>
  );
}
