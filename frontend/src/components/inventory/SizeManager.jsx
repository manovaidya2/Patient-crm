import { useState } from 'react';
import { X } from 'lucide-react';
import api from '../../api/axios.js';
import Button from '../ui/Button.jsx';
import { inputClass, packLabel } from './helpers.js';

const UNITS = [['ml', 'ml'], ['gram', 'g']];

// Master list of bottle / शीशी / jar sizes. A size added here is offered in Add medicine and gets a column in the Bottle size view.
export default function SizeManager({ master, onChanged, onError, canRemove = true }) {
  const [unit, setUnit] = useState('ml');
  const [size, setSize] = useState('');
  const [busy, setBusy] = useState(false);

  const add = async (event) => {
    event.preventDefault();
    if (!(Number(size) > 0)) return;
    setBusy(true);
    try {
      await api.post('/medicine/inventory/pack-sizes', { unit, size: Number(size) });
      setSize('');
      onChanged(`${size} ${unit === 'gram' ? 'g' : 'ml'} size list me jud gaya`);
    } catch (err) { onError(err.response?.data?.message || 'Size add nahi hua'); } finally { setBusy(false); }
  };
  const remove = async (u, s) => {
    setBusy(true);
    try {
      await api.delete('/medicine/inventory/pack-sizes', { params: { unit: u, size: s } });
      onChanged('Size list se hata diya');
    } catch (err) { onError(err.response?.data?.message || 'Size hata nahi'); } finally { setBusy(false); }
  };

  return (
    <div className="space-y-2 rounded-xl border border-cardline bg-white p-3 sm:p-4">
      <div>
        <h3 className="text-base font-bold text-charcoal">Bottle / शीशी / jar sizes</h3>
        <p className="text-xs text-charcoal/55">Yahan jodi hui size har dawa ke form me aur neeche ke table me apne-aap aa jaati hai. Jis size ko koi dawa use kar rahi ho, wo hat nahi sakti.</p>
      </div>
      {UNITS.map(([u, label]) => (
        <div key={u} className="flex flex-wrap items-center gap-1.5">
          <span className="w-12 text-xs font-semibold uppercase text-charcoal/50">{label}</span>
          {(master?.[u] || []).map((s) => (
            <span key={s} className="inline-flex items-center gap-1 rounded-full border border-cardline bg-offwhite-100 py-1 pl-3 pr-1.5 text-sm">
              {packLabel(s, u)}
              {canRemove && (
                <button type="button" disabled={busy} onClick={() => remove(u, s)} className="rounded-full p-0.5 text-charcoal/40 hover:bg-gray-200 hover:text-[#8C3B2E]" aria-label={`Remove ${packLabel(s, u)}`} title="Remove (only if no medicine uses it)"><X size={13} /></button>
              )}
            </span>
          ))}
        </div>
      ))}
      <form onSubmit={add} className="flex flex-wrap items-center gap-2 pt-1">
        <input className={`${inputClass} max-w-[150px]`} type="number" min="0" step="any" value={size} onChange={(e) => setSize(e.target.value)} placeholder="Nayi size" aria-label="New size" />
        <select className={`${inputClass} max-w-[90px]`} value={unit} onChange={(e) => setUnit(e.target.value)} aria-label="Size unit">{UNITS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
        <Button type="submit" size="sm" variant="outline" disabled={busy || !(Number(size) > 0)}>+ Size jodein</Button>
      </form>
    </div>
  );
}
