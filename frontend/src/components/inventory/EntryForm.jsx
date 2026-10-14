import { useEffect, useMemo, useState } from 'react';
import { Plus, X } from 'lucide-react';
import api from '../../api/axios.js';
import Button from '../ui/Button.jsx';
import { Field } from './parts.jsx';
import { ENTRY_SUBTYPES, PACKABLE, inputClass, packLabel, previewLine, unitText } from './helpers.js';

const ACTS = [
  ['in', 'Stock In', 'Purchase, apna production, return'],
  ['use', 'Use / Issue', 'Patient order, production me khapat'],
  ['adjust', 'Adjust (+ / −)', 'Toot-phoot, ginti ka farak, expired'],
  ['pack', 'Pack (bottle bharna)', 'Loose → bottles; khaali bottle apne-aap kategi'],
];
const RULES = {
  in: 'In-house production chunne par recipe se raw herbs apne-aap katengi.',
  use: 'Bottle size chunne par pehle usi size ki bhari bottles katengi.',
  adjust: '5% se zyada ya Expired / Damage = approval chahiye (Admin / Doctor ki entry seedhi lagti hai).',
  pack: 'Pack = loose dawa ko bottle / jar me bharna. Total stock wahi rehta hai; sirf loose kam hota hai aur bhari bottles badhti hain.',
};
const blankLine = (itemId = '', mode = 'loose') => ({ itemId, mode, qty: '', dir: '-' });
const firstSize = (item) => String(item?.packs?.[0]?.size || 'loose');

// One entry, many medicines. Nothing is saved unless every line passes the server's checks.
export default function EntryForm({ items, categories, canApprove, preset, onSaved }) {
  const [act, setAct] = useState(preset?.act || 'use');
  const [lines, setLines] = useState([blankLine(preset?.itemId, preset?.act === 'pack' ? firstSize(items.find((i) => i.id === preset?.itemId)) : 'loose')]);
  const [subType, setSubType] = useState(ENTRY_SUBTYPES[preset?.act || 'use'].options[0] || '');
  const [form, setForm] = useState({ ref: '', note: '', expiryDate: '', batchNo: '' });
  const [errors, setErrors] = useState([]);
  const [saving, setSaving] = useState(false);
  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const meta = ENTRY_SUBTYPES[act];

  // A preset (Use / In / Adjust / Pack clicked on a row) starts a fresh entry for that medicine.
  useEffect(() => {
    if (!preset) return;
    setAct(preset.act); setLines([blankLine(preset.itemId, preset.act === 'pack' ? firstSize(byId.get(preset.itemId)) : 'loose')]); setSubType(ENTRY_SUBTYPES[preset.act].options[0] || ''); setErrors([]);
    setForm({ ref: '', note: '', expiryDate: '', batchNo: '' });
  }, [preset]);

  const changeAct = (next) => { setAct(next); setSubType(ENTRY_SUBTYPES[next].options[0] || ''); setLines((old) => old.map((l) => ({ ...l, mode: next === 'pack' ? firstSize(byId.get(l.itemId)) : 'loose', dir: '-' }))); setErrors([]); };
  const setLine = (index, patch) => setLines((old) => old.map((l, i) => (i === index ? { ...l, ...patch } : l)));
  const options = () => categories.map((cat) => {
    const list = items.filter((i) => i.category === cat && (act !== 'pack' || (PACKABLE.includes(i.unit) && i.packs.length)));
    return list.length ? <optgroup key={cat} label={cat}>{list.map((i) => <option key={i.id} value={i.id}>{i.name}{i.code ? ` (${i.code})` : ''}</option>)}</optgroup> : null;
  }).concat(items.some((i) => !i.category && (act !== 'pack' || i.packs.length)) ? [<optgroup key="none" label="No category">{items.filter((i) => !i.category && (act !== 'pack' || i.packs.length)).map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}</optgroup>] : []);
  const modeOptions = (item) => {
    if (!item) return [['loose', '—']];
    const list = [];
    if (act !== 'pack') list.push(['loose', item.unit === 'piece' ? 'Nos (ginti)' : `Loose (${unitText(item.unit)})`]);
    item.packs.forEach((p) => list.push([String(p.size), `${packLabel(p.size, item.unit)} (${p.count} bhari)`]));
    return list;
  };

  const submit = async (event) => {
    event.preventDefault(); setSaving(true); setErrors([]);
    try {
      const { data } = await api.post('/medicine/inventory/entry', {
        act, subType: meta.options.length ? subType : '', ref: form.ref, note: form.note,
        ...(act === 'in' ? { expiryDate: form.expiryDate, batchNo: form.batchNo } : {}),
        lines: lines.filter((l) => l.itemId || l.qty).map((l) => ({ itemId: l.itemId, mode: l.mode === 'loose' ? 'loose' : Number(l.mode), qty: l.qty, dir: l.dir })),
      });
      setLines([blankLine()]); setForm({ ref: '', note: '', expiryDate: '', batchNo: '' });
      onSaved(data);
    } catch (err) { setErrors(err.response?.data?.errors || [err.response?.data?.message || 'Entry save nahi hui']); } finally { setSaving(false); }
  };

  return (
    <form onSubmit={submit} className="space-y-4 rounded-xl border border-cardline bg-white p-4" noValidate>
      <div><h3 className="text-base font-bold text-charcoal">Stock entry</h3><p className="text-xs text-charcoal/55">Ek hi entry me kai dawaiyaan (lines). Save hote hi ledger me row banti hai, delete nahi hoti.</p></div>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4" role="radiogroup" aria-label="Entry type">
        {ACTS.map(([key, label, hint]) => (
          <label key={key} className={`cursor-pointer rounded-xl border px-3 py-2.5 ${act === key ? 'border-sage bg-sage/10 text-sage' : 'border-cardline bg-white hover:border-sage/60'}`}>
            <input type="radio" name="act" value={key} checked={act === key} onChange={() => changeAct(key)} className="sr-only" />
            <span className="block text-sm font-bold">{label}</span><span className="block text-[11px] text-charcoal/55">{hint}</span>
          </label>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {meta.options.length > 0 && <Field label={meta.label}><select className={inputClass} value={subType} onChange={(e) => setSubType(e.target.value)}>{meta.options.map((o) => <option key={o}>{o}</option>)}</select></Field>}
        <Field label={meta.ref}><input className={inputClass} value={form.ref} maxLength={120} onChange={(e) => setForm({ ...form, ref: e.target.value })} placeholder={meta.refPlaceholder} /></Field>
        <Field label="Note (optional)"><input className={inputClass} value={form.note} maxLength={500} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="jaise: 2 bottle transit me tooti" /></Field>
        {act === 'in' && <>
          <Field label="Expiry of this stock"><input className={inputClass} type="date" value={form.expiryDate} onChange={(e) => setForm({ ...form, expiryDate: e.target.value })} /></Field>
          <Field label="Batch no."><input className={inputClass} maxLength={60} value={form.batchNo} onChange={(e) => setForm({ ...form, batchNo: e.target.value })} /></Field>
        </>}
      </div>

      <div className="space-y-2">
        {lines.map((line, index) => {
          const item = byId.get(line.itemId);
          const preview = previewLine(act, line, item, items, { canApprove, subType });
          return (
            <div key={index} className="grid items-start gap-2 rounded-xl border border-cardline bg-offwhite-100 p-3 lg:grid-cols-[28px_minmax(200px,2.2fr)_90px_minmax(150px,1.4fr)_110px_minmax(180px,2fr)_32px]">
              <span className="pt-2 text-xs text-charcoal/50">#{index + 1}</span>
              <select className={inputClass} value={line.itemId} onChange={(e) => setLine(index, { itemId: e.target.value, mode: act === 'pack' ? firstSize(byId.get(e.target.value)) : 'loose' })} aria-label={`Medicine line ${index + 1}`}><option value="">— dawa chuniye —</option>{options()}</select>
              {act === 'adjust' ? <select className={inputClass} value={line.dir} onChange={(e) => setLine(index, { dir: e.target.value })} aria-label="Plus or minus"><option value="-">− ghatayein</option><option value="+">+ badhayein</option></select> : <span />}
              <select className={inputClass} value={line.mode} onChange={(e) => setLine(index, { mode: e.target.value })} aria-label="Unit or bottle size">{modeOptions(item).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
              <input className={inputClass} type="number" min="1" step={line.mode === 'loose' ? 'any' : '1'} inputMode="decimal" value={line.qty} onChange={(e) => setLine(index, { qty: e.target.value })} placeholder={act === 'pack' ? 'kitni bottle' : 'matra'} aria-label="Quantity" />
              <p className={`pt-2 text-xs ${preview.error ? 'font-semibold text-[#8C3B2E]' : 'text-charcoal/65'}`}>{preview.text}</p>
              <button type="button" onClick={() => setLines((old) => (old.length > 1 ? old.filter((_, i) => i !== index) : [blankLine()]))} className="rounded-lg p-2 text-charcoal/45 hover:bg-gray-100 hover:text-[#8C3B2E]" aria-label="Remove line"><X size={16} /></button>
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => setLines((old) => [...old, blankLine()])}><Plus size={14} />Ek aur dawa jodein</Button>
        <p className="text-xs text-charcoal/55">{RULES[act]}</p>
      </div>
      {errors.length > 0 && <div className="rounded-lg bg-[#8C3B2E]/8 px-3.5 py-3 text-sm text-[#8C3B2E]"><b>Entry save nahi hui. Ye theek karein:</b><ul className="mt-1 list-disc pl-5">{errors.map((e) => <li key={e}>{e}</li>)}</ul></div>}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-cardline pt-3">
        <span className="text-xs text-charcoal/55">Entry time apne-aap lagega. Galti sudharne ke liye ulti (reversal) entry banti hai.</span>
        <Button type="submit" disabled={saving}>{saving ? 'Saving...' : 'Entry save karein'}</Button>
      </div>
    </form>
  );
}
