import { useState } from 'react';
import { Save } from 'lucide-react';
import api from '../api/axios.js';
import Button from './ui/Button.jsx';
import Modal from './ui/Modal.jsx';

const types = { text: 'Text', phone: 'Phone', number: 'Number', date: 'Date', time: 'Time', select: 'Dropdown', textarea: 'Long text', checkbox: 'Checkbox', file: 'Attachment' };
const inputClass = 'w-full rounded border border-cardline bg-cream px-3 py-2 text-sm';

export default function SheetColumnEditor({ column, endpoint, management = false, onClose, onSaved }) {
  const [form, setForm] = useState({ label: column.label, type: column.type, required: Boolean(column.required), options: (column.options || []).join(', '), highlightValue: column.highlightValue || '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const options = [...new Set(form.options.split(',').map((value) => value.trim()).filter(Boolean))];
  async function save(event) {
    event.preventDefault();
    setSaving(true); setError('');
    try {
      await api.patch(`${endpoint}/${column.id}`, {
        label: form.label.trim(), type: form.type, required: form.required,
        options: form.type === 'select' ? options : [],
        ...(management ? { highlightValue: form.type === 'select' && options.includes(form.highlightValue) ? form.highlightValue : '' } : {}),
      });
      await onSaved();
      onClose();
    } catch (err) { setError(err.response?.data?.message || 'Column could not be updated'); }
    finally { setSaving(false); }
  }
  return <Modal open onClose={() => !saving && onClose()} title="Edit column" className="max-w-lg">
    <form onSubmit={save} className="space-y-4">
      {error && <p role="alert" className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      <fieldset disabled={saving} className="space-y-4">
        <label className="block space-y-1 text-sm font-semibold"><span>Column name</span><input className={inputClass} required value={form.label} onChange={(event) => setForm({ ...form, label: event.target.value })} /></label>
        <label className="block space-y-1 text-sm font-semibold"><span>Type</span><select className={inputClass} value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value })}>{Object.entries(types).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        {form.type === 'select' && <label className="block space-y-1 text-sm font-semibold"><span>Dropdown options</span><textarea className={inputClass} rows={3} value={form.options} placeholder="Options, separated by commas" onChange={(event) => setForm({ ...form, options: event.target.value })} /></label>}
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 accent-sage" checked={form.required} onChange={(event) => setForm({ ...form, required: event.target.checked })} />Required field</label>
        {management && form.type === 'select' && <label className="block space-y-1 text-sm font-semibold"><span>Green row when value is</span><select className={inputClass} value={options.includes(form.highlightValue) ? form.highlightValue : ''} onChange={(event) => setForm({ ...form, highlightValue: event.target.value })}><option value="">No highlight</option>{options.map((option) => <option key={option} value={option}>{option}</option>)}</select></label>}
      </fieldset>
      <div className="flex justify-end gap-2 border-t border-cardline pt-4"><Button variant="outline" disabled={saving} onClick={onClose}>Cancel</Button><Button type="submit" disabled={saving}><Save size={16} />{saving ? 'Saving...' : 'Save changes'}</Button></div>
    </form>
  </Modal>;
}
