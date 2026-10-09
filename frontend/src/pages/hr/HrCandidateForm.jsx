import { useEffect, useState } from 'react';
import api from '../../api/axios.js';
import Button from '../../components/ui/Button.jsx';
import Modal from '../../components/ui/Modal.jsx';
import { CANDIDATE_STAGES } from './hrOptions.js';

const blank = { name: '', phone: '', alternatePhone: '', email: '', appliedPosition: '', source: '', campaignId: '', campaignCode: '', stage: 'new', notes: '', isActive: true };
const fieldClass = 'mt-1 w-full rounded-md border border-cardline bg-white px-3 py-2.5 text-sm text-charcoal outline-none focus:border-sage focus:ring-2 focus:ring-sage/15';

export default function HrCandidateForm({ open, candidate, onClose, onSaved }) {
  const [form, setForm] = useState(blank);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [campaigns, setCampaigns] = useState([]);

  useEffect(() => {
    if (open) setForm(candidate ? { ...blank, ...candidate } : blank);
    setError('');
  }, [open, candidate]);
  useEffect(() => {
    if (open) api.get('/hr/campaigns', { params: { status: 'active' } }).then(({ data }) => setCampaigns(data.campaigns || [])).catch(() => setCampaigns([]));
  }, [open]);

  const set = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));
  const submit = async (event) => {
    event.preventDefault(); setSaving(true); setError('');
    try {
      const selectedCampaign = campaigns.find((row) => row.id === form.campaignId);
      const payload = { ...form, campaignCode: selectedCampaign?.campaignCode || form.campaignCode || '' };
      const { data } = candidate
        ? await api.patch(`/hr/candidates/${candidate.id}`, payload)
        : await api.post('/hr/candidates', payload);
      onSaved(data.candidate); onClose();
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Candidate could not be saved');
    } finally { setSaving(false); }
  };

  return <Modal open={open} onClose={onClose} title={candidate ? 'Edit candidate' : 'Add candidate'} className="max-w-3xl">
    <form onSubmit={submit} className="space-y-4">
      {error && <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">{error}</div>}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <label className="text-sm font-medium">Candidate name *<input className={fieldClass} value={form.name} onChange={set('name')} required /></label>
        <label className="text-sm font-medium">Phone *<input className={fieldClass} value={form.phone} onChange={set('phone')} required /></label>
        <label className="text-sm font-medium">Alternate phone<input className={fieldClass} value={form.alternatePhone} onChange={set('alternatePhone')} /></label>
        <label className="text-sm font-medium">Email<input type="email" className={fieldClass} value={form.email} onChange={set('email')} /></label>
        <label className="text-sm font-medium">Applied position *<input className={fieldClass} value={form.appliedPosition} onChange={set('appliedPosition')} required /></label>
        <label className="text-sm font-medium">Candidate source<input className={fieldClass} placeholder="Job portal, referral..." value={form.source} onChange={set('source')} /></label>
        <label className="text-sm font-medium">Recruitment campaign<select className={fieldClass} value={form.campaignId} onChange={set('campaignId')}><option value="">Direct / no campaign</option>{campaigns.map((row) => <option key={row.id} value={row.id}>{row.campaignCode} - {row.name}</option>)}</select></label>
        <label className="text-sm font-medium">Recruitment stage<select className={fieldClass} value={form.stage} onChange={set('stage')}>{CANDIDATE_STAGES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        {candidate && <label className="flex items-center gap-2 self-end rounded-md border border-cardline bg-offwhite-200 px-3 py-2.5 text-sm"><input type="checkbox" checked={form.isActive} onChange={(event) => setForm((current) => ({ ...current, isActive: event.target.checked }))} /> Active candidate</label>}
      </div>
      <label className="block text-sm font-medium">Notes<textarea rows="3" className={fieldClass} value={form.notes} onChange={set('notes')} /></label>
      <div className="flex justify-end gap-2"><Button variant="ghost" onClick={onClose}>Cancel</Button><Button type="submit" disabled={saving}>{saving ? 'Saving...' : 'Save candidate'}</Button></div>
    </form>
  </Modal>;
}
