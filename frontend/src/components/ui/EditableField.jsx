import { useState } from 'react';
import { Pencil, Check, X } from 'lucide-react';

const EditableField = ({ label, value, placeholder = 'Not added', type = 'text', options, onSave, readOnly = false }) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const startEdit = () => {
    if (readOnly) return;
    setDraft(value ?? '');
    setError('');
    setEditing(true);
  };

  const cancelEdit = () => {
    setDraft(value ?? '');
    setError('');
    setEditing(false);
  };

  const confirmEdit = async () => {
    setSaving(true);
    setError('');
    try {
      await onSave(draft);
      setEditing(false);
    } catch (err) {
      setError(err.response?.data?.message || 'Could not save');
    } finally {
      setSaving(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && type !== 'select') confirmEdit();
    if (e.key === 'Escape') cancelEdit();
  };

  if (editing) {
    return (
      <div className="bg-offwhite-100 p-4">
        <p className="text-[11px] uppercase tracking-wide font-semibold text-charcoal/55">{label}</p>
        <div className="mt-1 flex items-center gap-1">
          {type === 'select' ? (
            <select
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={saving}
              className="w-full min-w-0 bg-transparent border-b border-sage text-sm font-bold text-charcoal focus:outline-none pb-0.5"
            >
              {options.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          ) : (
            <input
              autoFocus
              type={type}
              value={draft}
              placeholder={placeholder}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={saving}
              className="w-full min-w-0 bg-transparent border-b border-sage text-sm font-bold text-charcoal placeholder:font-normal placeholder:text-charcoal/35 focus:outline-none pb-0.5"
            />
          )}
          <button
            onClick={confirmEdit}
            disabled={saving}
            aria-label={`Save ${label}`}
            className="shrink-0 rounded p-1 text-[#3E7A4F] hover:bg-[#3E7A4F]/10 disabled:opacity-40"
          >
            <Check size={14} />
          </button>
          <button
            onClick={cancelEdit}
            disabled={saving}
            aria-label={`Cancel editing ${label}`}
            className="shrink-0 rounded p-1 text-charcoal/45 hover:bg-sage-muted/20 disabled:opacity-40"
          >
            <X size={14} />
          </button>
        </div>
        {error && <p className="mt-1 text-[10px] text-[#8C3B2E]">{error}</p>}
      </div>
    );
  }

  const displayValue = type === 'select' ? options.find((o) => String(o.value) === String(value))?.label : value;

  return (
    <div className="bg-offwhite-100 p-4 group">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] uppercase tracking-wide font-semibold text-charcoal/55">{label}</p>
        {!readOnly && (
          <button
            onClick={startEdit}
            aria-label={`Edit ${label}`}
            className="shrink-0 rounded p-0.5 text-sage opacity-0 group-hover:opacity-100 focus:opacity-100 hover:bg-sage-muted/20 transition-opacity"
          >
            <Pencil size={12} />
          </button>
        )}
      </div>
      <p
        onClick={startEdit}
        className={`mt-1 text-sm break-words ${readOnly ? '' : 'cursor-text'} ${
          displayValue ? 'font-bold text-charcoal' : 'font-normal italic text-charcoal/35'
        }`}
      >
        {displayValue || placeholder}
      </p>
    </div>
  );
};

export default EditableField;
