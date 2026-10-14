import { useMemo, useState } from 'react';
import { Plus, X } from 'lucide-react';
import api from '../../api/axios.js';
import Button from '../ui/Button.jsx';
import { Chip, Field } from './parts.jsx';
import { PACKABLE, PACKING_CATEGORY, convert, dateInput, inputClass, num, packLabel, unitText } from './helpers.js';

const UNIT_LABELS = { ml: 'ml (liquid / oil / syrup)', gram: 'gram (powder / herb)', tablet: 'tablet / vati', piece: 'piece / nos (ginti)' };
const PRIORITY = [['N', 'Normal'], ['F', 'Fast moving (zyada use)'], ['E', 'Emergency (kabhi khatam na ho)']];
const empty = {
  name: '', nameHindi: '', code: '', category: '', itemType: '', unit: 'ml', rack: '', packSizes: [], customSize: '',
  containerKind: 'Bottle', containerSize: '', containerUnit: 'ml', lowStockAt: '', reorderLevel: '', maxLevel: '', priority: 'N', avgDailyUse: '',
  batchNo: '', expiryDate: '', supplier: '', usedIn: '', openingStock: '', notes: '', openingPacks: [], recipePer: '', recipeRows: [],
};

// Add or edit a medicine (the item master). Category picks the base unit and the bottle sizes it is normally filled into.
export default function ItemForm({ mode, item, items, meta, onClose, onSaved, onSizesChanged, prefill }) {
  const [form, setForm] = useState(() => (item ? {
    ...empty, name: item.name, nameHindi: item.nameHindi, code: item.code, category: item.category, itemType: item.itemType, unit: item.unit, rack: item.rack,
    packSizes: item.packs.map((p) => p.size), containerKind: item.containerKind || 'Bottle', containerSize: item.containerSize || '', containerUnit: item.containerUnit || 'ml',
    lowStockAt: item.lowStockAt || '', reorderLevel: item.reorderLevel || '', maxLevel: item.maxLevel || '', priority: item.emergency ? 'E' : item.fastMoving ? 'F' : 'N',
    avgDailyUse: item.avgDailyUse || '', batchNo: item.batchNo, expiryDate: dateInput(item.expiryDate), supplier: item.supplier, usedIn: item.usedIn,
    notes: item.notes, recipePer: item.recipe?.per || '', recipeRows: item.recipe?.ingredients.map((g) => ({ itemId: g.itemId, qty: g.qty })) || [],
  } : { ...empty, category: '', ...(prefill || {}) }));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const set = (patch) => setForm((old) => ({ ...old, ...patch }));
  const config = meta.categoryConfig.find((c) => c.hi === form.category);
  const isPacking = form.category === PACKING_CATEGORY;
  const canPack = PACKABLE.includes(form.unit) && !isPacking;
  const sizeChoices = useMemo(() => [...new Set([...(meta.packSizeMaster?.[form.unit] || []), ...form.packSizes])].sort((a, b) => a - b), [meta.packSizeMaster, form.unit, form.packSizes]);
  const ingredientOptions = items.filter((i) => i.id !== item?.id && i.category !== PACKING_CATEGORY);

  const pickCategory = (name) => {
    const cfg = meta.categoryConfig.find((c) => c.hi === name);
    set({ category: name, ...(cfg ? { unit: cfg.unit, packSizes: item ? form.packSizes : [] } : {}), ...(name === PACKING_CATEGORY ? { itemType: 'Packaging' } : {}) });
  };
  const toggleSize = (size) => set({ packSizes: form.packSizes.includes(size) ? form.packSizes.filter((s) => s !== size) : [...form.packSizes, size] });
  // A new size goes into the shared list first, so other medicines and the Bottle size view get it too.
  const addCustomSize = async () => {
    const n = Number(form.customSize);
    if (!(n > 0)) return;
    setError('');
    if (!(meta.packSizeMaster?.[form.unit] || []).some((s) => Math.abs(s - n) < 1e-9)) {
      try { await api.post('/medicine/inventory/pack-sizes', { unit: form.unit, size: n }); onSizesChanged?.(); }
      catch (err) { setError(err.response?.data?.message || 'Size add nahi hua'); return; }
    }
    set({ packSizes: form.packSizes.includes(n) ? form.packSizes : [...form.packSizes, n], customSize: '' });
  };

  const submit = async (event) => {
    event.preventDefault(); setError('');
    const min = Number(form.lowStockAt || 0); const re = Number(form.reorderLevel || 0); const max = Number(form.maxLevel || 0);
    if (min && re && !(min < re) || re && max && !(re < max)) { setError('Min < Reorder < Max hona chahiye.'); return; }
    setSaving(true);
    try {
      const body = {
        name: form.name, nameHindi: form.nameHindi, code: form.code, category: form.category, itemType: form.itemType, unit: form.unit, rack: form.rack,
        packSizes: canPack ? form.packSizes : [], lowStockAt: form.lowStockAt, reorderLevel: form.reorderLevel, maxLevel: form.maxLevel,
        emergency: form.priority === 'E', fastMoving: form.priority === 'F', avgDailyUse: form.avgDailyUse, batchNo: form.batchNo, expiryDate: form.expiryDate,
        supplier: form.supplier, usedIn: form.usedIn, notes: form.notes,
        ...(isPacking ? { containerKind: form.containerKind, containerSize: form.containerSize, containerUnit: form.containerUnit } : { containerKind: '', containerSize: 0, containerUnit: '' }),
        recipe: form.recipeRows.length ? { per: form.recipePer, ingredients: form.recipeRows.filter((r) => r.itemId && Number(r.qty) > 0) } : null,
      };
      if (mode === 'add') {
        Object.assign(body, { openingStock: form.openingStock, openingPacks: form.openingPacks.filter((p) => Number(p.size) > 0 && Number(p.count) > 0) });
        await api.post('/medicine/inventory', body);
      } else await api.patch(`/medicine/inventory/${item.id}`, body);
      onSaved(mode === 'add' ? `${form.name} master me jud gayi` : `${form.name} update ho gayi`);
    } catch (err) { setError(err.response?.data?.message || 'Medicine save nahi hui'); } finally { setSaving(false); }
  };

  // Live example so the number is read in the medicine's own unit (g, ml, tab...) and the days are visible straight away.
  const stockNow = mode === 'edit' ? Number(item.currentStock || 0) : Number(form.openingStock || 0) + form.openingPacks.reduce((sum, p) => sum + Number(p.size || 0) * Number(p.count || 0), 0);
  const perDay = Number(form.avgDailyUse || 0);
  const dailyUseHint = perDay > 0
    ? (stockNow > 0 ? `${num(stockNow)} ${unitText(form.unit)} stock ÷ ${num(perDay)} ${unitText(form.unit)} per din = ${Math.floor(stockNow / perDay)} din chalega.` : `Roz ${num(perDay)} ${unitText(form.unit)} use hoga. Stock aane par din dikhenge.`) + ' Isi number se din nikalte hain.'
    : 'Isi number se "din chalega" nikalta hai. Khaali chhodein to pichhle 30 din ke asli use se apne-aap nikalega.';
  const levelHint = (value) => (convert(value, form.unit) ? `= ${convert(value, form.unit)}` : '');
  return (
    <form onSubmit={submit} className="space-y-4">
      {error && <p className="rounded-lg bg-[#8C3B2E]/8 px-3 py-2 text-sm text-[#8C3B2E]">{error}</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Naam (English) *"><input className={inputClass} required maxLength={160} value={form.name} onChange={(e) => set({ name: e.target.value })} placeholder="Jatamansi churna" /></Field>
        <Field label="Hindi / Sanskrit naam"><input className={inputClass} maxLength={120} value={form.nameHindi} onChange={(e) => set({ nameHindi: e.target.value })} placeholder="जटामांसी चूर्ण" /></Field>
        <Field label="कल्पना / Category *" hint="Chunein ya nayi category likhein; wo filter ban jaati hai."><input className={inputClass} required list="inv-categories" maxLength={80} value={form.category} onChange={(e) => pickCategory(e.target.value)} /><datalist id="inv-categories">{meta.categories.map((c) => <option key={c} value={c} />)}</datalist></Field>
        <Field label="Type"><select className={inputClass} value={form.itemType} onChange={(e) => set({ itemType: e.target.value })}><option value="">—</option>{meta.itemTypes.map((t) => <option key={t}>{t}</option>)}</select></Field>
        <Field label="Base unit" hint={config ? 'Category ke hisaab se chuna gaya' : ''}><select className={inputClass} value={form.unit} onChange={(e) => set({ unit: e.target.value })} disabled={mode === 'edit' && item.currentStock > 0}>{[...new Set([...meta.unitOptions, form.unit])].map((u) => <option key={u} value={u}>{UNIT_LABELS[u] || u}</option>)}</select></Field>
        <div className="grid grid-cols-2 gap-3"><Field label="Code"><input className={inputClass} maxLength={40} value={form.code} onChange={(e) => set({ code: e.target.value })} placeholder="T-501" /></Field><Field label="Rack / Shelf *"><input className={inputClass} required maxLength={60} value={form.rack} onChange={(e) => set({ rack: e.target.value })} placeholder="R3-B2" /></Field></div>
      </div>

      {canPack && (
        <div className="space-y-2 rounded-xl border border-cardline bg-offwhite-100 p-3">
          <p className="text-sm font-bold text-charcoal">Kin size me pack hoti hai (bottle / शीशी / jar)</p>
          <div className="flex flex-wrap gap-2">{sizeChoices.map((s) => <Chip key={s} active={form.packSizes.includes(s)} onClick={() => toggleSize(s)}>{packLabel(s, form.unit)}</Chip>)}</div>
          <div className="flex max-w-md gap-2"><input className={inputClass} type="number" min="1" step="any" value={form.customSize} onChange={(e) => set({ customSize: e.target.value })} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCustomSize(); } }} placeholder={`Nayi size (${unitText(form.unit)})`} /><Button type="button" size="sm" variant="outline" onClick={addCustomSize}>+ Nayi size jodein</Button></div>
          <p className="text-[11px] text-charcoal/50">Nayi size shared list me judti hai: baaki dawaon me aur Bottle size view me bhi dikhegi.</p>
        </div>
      )}
      {isPacking && (
        <div className="grid gap-3 rounded-xl border border-cardline bg-offwhite-100 p-3 sm:grid-cols-3">
          <Field label="Container type"><select className={inputClass} value={form.containerKind} onChange={(e) => set({ containerKind: e.target.value })}>{meta.containerKinds.map((k) => <option key={k}>{k}</option>)}</select></Field>
          <Field label="Container size" hint="Label ke liye khaali chhodein"><input className={inputClass} type="number" min="0" step="any" value={form.containerSize} onChange={(e) => set({ containerSize: e.target.value })} placeholder="150" /></Field>
          <Field label="Size unit"><select className={inputClass} value={form.containerUnit} onChange={(e) => set({ containerUnit: e.target.value })}><option>ml</option><option>g</option></select></Field>
          <p className="text-xs text-charcoal/55 sm:col-span-3">Pack karte waqt isi size ke khaali container apne-aap ghatenge.</p>
        </div>
      )}

      <div className="rounded-xl border border-cardline bg-offwhite-100 p-3">
        <p className="mb-2 text-sm font-bold text-charcoal">Stock levels ({unitText(form.unit)})</p>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Min (isse neeche = critical)" hint={levelHint(form.lowStockAt)}><input className={inputClass} type="number" min="0" step="any" value={form.lowStockAt} onChange={(e) => set({ lowStockAt: e.target.value })} /></Field>
          <Field label="Reorder (yahan purchase)" hint={levelHint(form.reorderLevel)}><input className={inputClass} type="number" min="0" step="any" value={form.reorderLevel} onChange={(e) => set({ reorderLevel: e.target.value })} /></Field>
          <Field label="Max (isse zyada na rakhein)" hint={levelHint(form.maxLevel)}><input className={inputClass} type="number" min="0" step="any" value={form.maxLevel} onChange={(e) => set({ maxLevel: e.target.value })} /></Field>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Priority"><select className={inputClass} value={form.priority} onChange={(e) => set({ priority: e.target.value })}>{PRIORITY.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
        <Field label={`Roz ka average use (${unitText(form.unit)} per din)`} hint={dailyUseHint}>
          <div className="flex items-center gap-2"><input className={inputClass} type="number" min="0" step="any" value={form.avgDailyUse} onChange={(e) => set({ avgDailyUse: e.target.value })} placeholder={`jaise 150`} /><span className="shrink-0 text-sm font-semibold text-charcoal/60">{unitText(form.unit)} / din</span></div>
        </Field>
        <Field label="Expiry"><input className={inputClass} type="date" value={form.expiryDate} onChange={(e) => set({ expiryDate: e.target.value })} /></Field>
        <Field label="Batch no."><input className={inputClass} maxLength={60} value={form.batchNo} onChange={(e) => set({ batchNo: e.target.value })} /></Field>
        <Field label="Supplier / apna production"><input className={inputClass} maxLength={120} value={form.supplier} onChange={(e) => set({ supplier: e.target.value })} /></Field>
        <Field label="Kis formulation me jaati hai"><input className={inputClass} maxLength={300} value={form.usedIn} onChange={(e) => set({ usedIn: e.target.value })} placeholder="Brahmi vati, Saraswat churna" /></Field>
      </div>

      {!isPacking && (
        <div className="space-y-2 rounded-xl border border-cardline bg-offwhite-100 p-3">
          <p className="text-sm font-bold text-charcoal">Recipe (optional): apna production hone par raw herbs apne-aap katengi</p>
          <div className="flex max-w-xs items-center gap-2"><span className="whitespace-nowrap text-sm">Banane ke liye</span><input className={inputClass} type="number" min="0" step="any" value={form.recipePer} onChange={(e) => set({ recipePer: e.target.value })} placeholder="1000" /><span className="text-sm">{unitText(form.unit)}</span></div>
          {form.recipeRows.map((row, index) => (
            <div key={index} className="grid grid-cols-[1fr_130px_auto] items-center gap-2">
              <select className={inputClass} value={row.itemId} onChange={(e) => set({ recipeRows: form.recipeRows.map((r, i) => (i === index ? { ...r, itemId: e.target.value } : r)) })}><option value="">— ingredient —</option>{ingredientOptions.map((i) => <option key={i.id} value={i.id}>{i.name} ({unitText(i.unit)})</option>)}</select>
              <input className={inputClass} type="number" min="0" step="any" value={row.qty} onChange={(e) => set({ recipeRows: form.recipeRows.map((r, i) => (i === index ? { ...r, qty: e.target.value } : r)) })} placeholder="matra" />
              <button type="button" onClick={() => set({ recipeRows: form.recipeRows.filter((_, i) => i !== index) })} className="rounded-lg p-2 text-charcoal/50 hover:bg-gray-100" aria-label="Remove ingredient"><X size={16} /></button>
            </div>
          ))}
          <Button type="button" size="sm" variant="outline" onClick={() => set({ recipeRows: [...form.recipeRows, { itemId: '', qty: '' }], recipePer: form.recipePer || 1000 })}><Plus size={14} />Ingredient jodein</Button>
        </div>
      )}

      {mode === 'add' && (
        <div className="space-y-3 rounded-xl border border-cardline bg-offwhite-100 p-3">
          <p className="text-sm font-bold text-charcoal">Opening stock</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={`Loose stock (${unitText(form.unit)})`} hint={levelHint(form.openingStock) || 'Jo abhi bottle me nahi bhara'}><input className={inputClass} type="number" min="0" step="any" value={form.openingStock} onChange={(e) => set({ openingStock: e.target.value })} /></Field>
          </div>
          {canPack && form.packSizes.length > 0 && (
            <div className="space-y-2"><p className="text-sm font-medium text-charcoal">Pehle se bhari bottles (optional)</p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">{[...form.packSizes].sort((a, b) => a - b).map((size) => (
                <label key={size} className="flex items-center gap-2 text-sm"><span className="w-24 shrink-0 text-xs text-charcoal/70">{packLabel(size, form.unit)}</span>
                  <input className={inputClass} type="number" min="0" step="1" value={form.openingPacks.find((p) => Number(p.size) === size)?.count || ''} onChange={(e) => set({ openingPacks: [...form.openingPacks.filter((p) => Number(p.size) !== size), { size, count: e.target.value }] })} placeholder="0" /></label>
              ))}</div>
            </div>
          )}
        </div>
      )}
      <Field label="Notes"><textarea className={inputClass} rows={2} maxLength={2000} value={form.notes} onChange={(e) => set({ notes: e.target.value })} /></Field>
      <div className="flex justify-end gap-2 border-t border-cardline pt-3"><Button type="button" variant="outline" onClick={onClose} disabled={saving}>Cancel</Button><Button type="submit" disabled={saving}>{saving ? 'Saving...' : mode === 'edit' ? 'Save changes' : 'Medicine save karein'}</Button></div>
    </form>
  );
}
