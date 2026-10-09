import { useEffect, useState } from 'react';
import api from '../../api/axios.js';
import Button from '../../components/ui/Button.jsx';
import Modal from '../../components/ui/Modal.jsx';

const fieldClass = 'mt-1 w-full rounded-md border border-cardline bg-white px-3 py-2.5 text-sm outline-none focus:border-sage focus:ring-2 focus:ring-sage/15';
const blank = { status: 'pending', rating: '3', education: '', experience: '', currentCtc: '', expectedCtc: '', noticePeriod: '', remarks: '' };

export default function HrScreeningForm({ open, candidate, onClose, onSaved }) {
  const [form, setForm] = useState(blank);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { if (open) setForm({ ...blank, ...(candidate?.screening || {}), rating: String(candidate?.screening?.rating || 3) }); setError(''); }, [open, candidate]);
  const set = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));
  const submit = async (event) => {
    event.preventDefault(); setSaving(true); setError('');
    try { await api.put(`/hr/candidates/${candidate.id}/screening`, form); onSaved(); onClose(); }
    catch (requestError) { setError(requestError.response?.data?.message || 'Screening could not be saved'); }
    finally { setSaving(false); }
  };
  return <Modal open={open} onClose={onClose} title={`Candidate screening - ${candidate?.name || ''}`} className="max-w-3xl">
    <form onSubmit={submit} className="space-y-4">
      {error && <div className="rounded-md bg-red-50 p-3 text-sm text-red-800">{error}</div>}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <label className="text-sm font-medium">Screening status<select className={fieldClass} value={form.status} onChange={set('status')}><option value="pending">Pending</option><option value="shortlisted">Shortlisted</option><option value="on_hold">On Hold</option><option value="rejected">Rejected</option></select></label>
        <label className="text-sm font-medium">Rating (1-5)<select className={fieldClass} value={form.rating} onChange={set('rating')}>{[1,2,3,4,5].map((value) => <option key={value}>{value}</option>)}</select></label>
        <label className="text-sm font-medium">Education<input className={fieldClass} value={form.education} onChange={set('education')} /></label>
        <label className="text-sm font-medium">Experience<input className={fieldClass} placeholder="e.g. 3 years" value={form.experience} onChange={set('experience')} /></label>
        <label className="text-sm font-medium">Current CTC<input className={fieldClass} value={form.currentCtc} onChange={set('currentCtc')} /></label>
        <label className="text-sm font-medium">Expected CTC<input className={fieldClass} value={form.expectedCtc} onChange={set('expectedCtc')} /></label>
        <label className="text-sm font-medium">Notice period<input className={fieldClass} value={form.noticePeriod} onChange={set('noticePeriod')} /></label>
      </div>
      <label className="block text-sm font-medium">Screening remarks<textarea rows="4" className={fieldClass} value={form.remarks} onChange={set('remarks')} /></label>
      <div className="flex justify-end gap-2"><Button variant="ghost" onClick={onClose}>Cancel</Button><Button type="submit" disabled={saving}>{saving ? 'Saving...' : 'Save screening'}</Button></div>
    </form>
  </Modal>;
}
