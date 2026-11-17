import { useState } from 'react';
import { Check, Pencil, X } from 'lucide-react';
import { poInput } from '../purchaseOrders/CreatePurchaseOrderModal.jsx';

export default function MedicineNameEditor({ name, canEdit, disabled = false, onSave, fieldLabel = 'medicine name', inputType = 'text' }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(name);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const cancel = () => { setEditing(false); setError(''); };
  const save = async () => {
    const next = text.trim();
    if (!next || saving || disabled) return;
    if (next === name) { cancel(); return; }
    setSaving(true); setError('');
    try { await onSave(next); setEditing(false); }
    catch (err) { setError(err.message || 'Could not save the medicine name'); }
    finally { setSaving(false); }
  };
  const iconButton = 'inline-flex shrink-0 items-center justify-center rounded p-1 text-sage hover:bg-sage/10 disabled:opacity-50';
  if (!editing) return <span className="inline-flex max-w-full items-center gap-1 align-middle"><span>{name}</span>{canEdit && <button type="button" className={iconButton} disabled={disabled} aria-label={`Edit ${fieldLabel}: ${name}`} title={`Edit ${fieldLabel}`} onClick={() => { setText(name); setError(''); setEditing(true); }}><Pencil size={13} /></button>}</span>;
  return <span className="inline-flex max-w-full flex-wrap items-center gap-1 align-middle">
    <input className={`${poInput} min-w-0 max-w-full font-normal ${inputType === 'number' ? 'w-20' : 'sm:w-72'}`} aria-label={fieldLabel === 'medicine name' ? 'Medicine name' : fieldLabel} type={inputType} min={inputType === 'number' ? 1 : undefined} step={inputType === 'number' ? 1 : undefined} autoFocus maxLength={120} value={text} disabled={saving || disabled} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => {
      if (e.key === 'Enter') { e.preventDefault(); save(); }
      if (e.key === 'Escape' && !saving) { e.preventDefault(); cancel(); }
    }} />
    <button type="button" className={iconButton} title={`Save ${fieldLabel}`} aria-label={`Save ${fieldLabel}`} disabled={saving || disabled || !text.trim()} onClick={save}><Check size={16} /></button>
    <button type="button" className={iconButton} title="Cancel name edit" aria-label="Cancel name edit" disabled={saving} onClick={cancel}><X size={15} /></button>
    {saving && <span className="text-xs font-normal text-charcoal/55">Saving...</span>}
    {error && <span role="alert" className="w-full text-xs font-normal text-[#8C3B2E]">{error}</span>}
  </span>;
}
