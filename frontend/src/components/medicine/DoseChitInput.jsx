import { cloneElement, useEffect, useId, useState } from 'react';
import { Pencil } from 'lucide-react';
import api from '../../api/axios.js';
import Button from '../ui/Button.jsx';
import { FieldLabel, poInput } from '../purchaseOrders/CreatePurchaseOrderModal.jsx';

const DECOCTION = 'morning-decoction';
const BUILTIN_DOSES = [
  { id: 'medicine-honey', text: '___ चम्मच दवाई + ___ चम्मच शहद के साथ मिलाकर लीजिए।', labels: ['दवाई की मात्रा (चम्मच)', 'शहद की मात्रा (चम्मच)'] },
  { id: 'pinches-water', text: '___ चुटकी दवाई + ___ घूँट गुनगुने पानी के साथ लीजिए।', labels: ['दवाई की मात्रा (चुटकी)', 'गुनगुने पानी की मात्रा (घूँट)'] },
  { id: 'night-syrup', text: 'रात में सोते समय: ___ चम्मच (2.5 ml) सिरप + उतना ही उबालकर ठंडा किया पानी मिलाएँ। दिन में एक बार।', labels: ['सिरप की मात्रा (चम्मच)'] },
  { id: 'nasya-drops', text: 'नाक में\nदाएँ ___ + बाएँ ___ = ___ बूँद/दिन, एक बार', labels: ['दाएँ नाक में (बूँद)', 'बाएँ नाक में (बूँद)', 'कुल बूँद/दिन'] },
  { id: 'morning-oil', text: 'प्रतिदिन सुबह\nप्रतिदिन सुबह मेध्य Oil से सिर की जड़ों की मालिश करें।', labels: [] },
  { id: 'morning-evening-before-meals', text: 'सुबह ___ — शाम ___, दोनों समय खाना खाने से पहले।', labels: ['सुबह की मात्रा', 'शाम की मात्रा'] },
];
const instruction = (spoons, cups) => `सुबह खाली पेट: ${spoons || '___'} चम्मच दवा को ${cups || '___'} कप पानी में डालकर अच्छी तरह उबालें। जब पानी थोड़ा कम रह जाए, तब छानकर हल्का गुनगुना सेवन करें।`;
const positive = (value) => {
  const text = String(value ?? '').trim();
  const decimal = '(?:\\d+(?:\\.\\d*)?|\\.\\d+)';
  if (!new RegExp(`^${decimal}(?:\\s*/\\s*${decimal})?$`).test(text)) return false;
  const [numerator, denominator = 1] = text.split('/').map(Number);
  return Number.isFinite(numerator) && Number.isFinite(denominator) && numerator > 0 && denominator > 0;
};
const patternParts = (text) => String(text || '').split(/[-_]{2,}/g);
const fillPattern = (text, amounts = [], preview = false) => patternParts(text).map((part, i) => `${i ? amounts[i - 1] || (preview ? '___' : '') : ''}${part}`).join('');
const singleDoseComplete = (value) => {
  if (value.doseTemplate === DECOCTION) return positive(value.doseSpoons) && positive(value.doseWaterCups);
  if (BUILTIN_DOSES.some((t) => t.id === value.doseTemplate) || value.doseTemplate?.startsWith('saved:')) return Boolean(value.dosePattern) && patternParts(value.dosePattern).slice(1).every((_, i) => positive(value.doseQuantities?.[i]));
  return true;
};
export const doseTemplateComplete = (value) => value.doseEntries
  ? value.doseEntries.length > 0 && value.doseEntries.length <= 20 && value.doseEntries.every((entry) => singleDoseComplete(entry) && (value.doseEntries.length === 1 || Boolean(entry.dose?.trim())))
  : singleDoseComplete(value);

function DoseQuantityField({ label, onRename, children }) {
  const id = useId();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const save = () => {
    if (!draft.trim()) return;
    onRename(draft.trim());
    setEditing(false);
  };
  return <div className="space-y-1 text-sm font-medium text-charcoal">
    <div className="flex items-center gap-1.5">
      <label htmlFor={id}>{label}<span className="text-red-700"> *</span></label>
      <button type="button" className="rounded p-1 text-sage hover:bg-sage/10" aria-label={`Rename ${label}`} title="Rename field" onClick={() => { setDraft(label); setEditing(true); }}><Pencil size={13} /></button>
    </div>
    {editing && <div className="space-y-1 rounded border border-cardline bg-white p-2">
      <input autoFocus aria-label="Field name" className={poInput} maxLength={120} value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); save(); } if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setEditing(false); } }} />
      <div className="flex gap-2"><Button size="sm" disabled={!draft.trim()} onClick={save}>Save name</Button><Button size="sm" variant="outline" onClick={() => setEditing(false)}>Cancel</Button></div>
    </div>}
    {cloneElement(children, { id })}
  </div>;
}

function DoseInstructionInput({ value, onChange }) {
  const [templates, setTemplates] = useState([]);
  const [adding, setAdding] = useState(false);
  const [newText, setNewText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    const load = async (event) => {
      try {
        const { data } = await api.get('/formulation-master/dose-templates', { skipCache: Boolean(event) });
        if (active) { setTemplates(data.templates); setError(''); }
      } catch (err) { if (active) setError(err.response?.data?.message || 'Could not load saved dose instructions'); }
    };
    load();
    window.addEventListener('crm:dose-templates-changed', load);
    return () => { active = false; window.removeEventListener('crm:dose-templates-changed', load); };
  }, []);
  const selected = value.doseTemplate || (value.dose ? 'custom' : '');
  const builtin = BUILTIN_DOSES.find((t) => t.id === selected);
  const renameField = (index, label) => {
    const labels = [...(value.doseFieldLabels || [])];
    labels[index] = label;
    onChange({ doseFieldLabels: labels });
  };
  const selectTemplate = (template) => {
    const customDose = selected === 'custom' ? value.dose : value.customDose || '';
    const saved = BUILTIN_DOSES.find((t) => t.id === template) || templates.find((t) => `saved:${t.id}` === template);
    if (saved) {
      onChange({ doseTemplate: template, customDose, doseFieldLabels: [], dosePattern: saved.text, doseQuantities: [], dose: patternParts(saved.text).length === 1 ? saved.text : '' });
    } else {
      onChange({ doseTemplate: template, customDose, doseFieldLabels: [], dose: template === DECOCTION ? (positive(value.doseSpoons) && positive(value.doseWaterCups) ? instruction(value.doseSpoons, value.doseWaterCups) : '') : template === 'custom' ? customDose : '' });
    }
  };
  const saveNewTemplate = async () => {
    setBusy(true); setError('');
    try {
      const { data } = await api.post('/formulation-master/dose-templates', { text: newText.trim() });
      const saved = data.template;
      setTemplates((previous) => [...previous.filter((t) => t.id !== saved.id), saved]);
      onChange({ doseTemplate: `saved:${saved.id}`, customDose: selected === 'custom' ? value.dose : value.customDose || '', doseFieldLabels: [], dosePattern: saved.text, doseQuantities: [], dose: patternParts(saved.text).length === 1 ? saved.text : '' });
      setAdding(false); setNewText('');
      window.dispatchEvent(new Event('crm:dose-templates-changed'));
    } catch (err) { setError(err.response?.data?.message || 'Could not save the dose instruction'); }
    finally { setBusy(false); }
  };
  const setQuantity = (key, amount) => {
    const next = { ...value, [key]: amount };
    onChange({ [key]: amount, dose: doseTemplateComplete(next) ? instruction(next.doseSpoons, next.doseWaterCups) : '' });
  };
  return (
    <div className="space-y-2 sm:col-span-2">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-2">
      <FieldLabel label="Dose / chit text">
        <select className={poInput} value={selected} onChange={(e) => selectTemplate(e.target.value)}>
          <option value="">Select dose instruction</option>
          <option value={DECOCTION}>{instruction('___', '___')}</option>
          {BUILTIN_DOSES.map((template) => <option key={template.id} value={template.id}>{template.text}</option>)}
          {templates.map((template) => <option key={template.id} value={`saved:${template.id}`}>{template.text}</option>)}
          <option value="custom">Other / manually enter dose</option>
        </select>
      </FieldLabel>
      <Button size="sm" variant="outline" disabled={busy} onClick={() => setAdding(true)}>+ New dropdown option</Button>
      </div>
      {error && <p role="alert" className="text-xs text-[#8C3B2E]">{error}</p>}
      {adding && <div className="space-y-2 rounded-lg border border-cardline bg-white p-3">
        <FieldLabel label="Dropdown में नई Dose / chit text जोड़ें" required><textarea className={poInput} rows={3} maxLength={500} value={newText} disabled={busy} onChange={(e) => setNewText(e.target.value)} /></FieldLabel>
        <p className="text-xs text-charcoal/55">जहाँ मात्रा भरनी हो वहाँ ___ या ---- लिखें। चुनने पर हर खाली जगह की मात्रा अलग भर सकेंगे, जैसे 1/2 या 1/3।</p>
        <div className="flex gap-2"><Button size="sm" disabled={busy || !newText.trim()} onClick={saveNewTemplate}>{busy ? 'Saving...' : 'Save & select instruction'}</Button><Button size="sm" variant="outline" disabled={busy} onClick={() => { setAdding(false); setNewText(''); }}>Cancel</Button></div>
      </div>}
      {selected === DECOCTION && <>
        <div className="grid gap-2 sm:grid-cols-2">
          <DoseQuantityField label={value.doseFieldLabels?.[0] || 'दवा की मात्रा (चम्मच)'} onRename={(label) => renameField(0, label)}><input className={poInput} type="text" value={value.doseSpoons || ''} placeholder="जैसे 1/2, 1/3 या 0.5" onChange={(e) => setQuantity('doseSpoons', e.target.value)} /></DoseQuantityField>
          <DoseQuantityField label={value.doseFieldLabels?.[1] || 'पानी की मात्रा (कप)'} onRename={(label) => renameField(1, label)}><input className={poInput} type="text" value={value.doseWaterCups || ''} placeholder="जैसे 1/2, 1 या 2" onChange={(e) => setQuantity('doseWaterCups', e.target.value)} /></DoseQuantityField>
        </div>
        <p className="rounded-lg border border-cardline bg-offwhite-100 p-3 text-sm text-charcoal/80">{instruction(value.doseSpoons, value.doseWaterCups)}</p>
        {!doseTemplateComplete(value) && <p className="text-xs text-charcoal/55">दोनों मात्रा भरें (जैसे 1/2 या 1/3); मात्रा शून्य से अधिक होनी चाहिए।</p>}
      </>}
      {(builtin || selected.startsWith('saved:')) && <>
        {patternParts(value.dosePattern).length > 1 && <div className="grid gap-2 sm:grid-cols-2">{patternParts(value.dosePattern).slice(1).map((_, i) => <DoseQuantityField key={`${selected}-${i}`} label={value.doseFieldLabels?.[i] || builtin?.labels[i] || `मात्रा ${i + 1}`} onRename={(label) => renameField(i, label)}><input className={poInput} type="text" placeholder="जैसे 1/2, 1/3 या 1" value={value.doseQuantities?.[i] || ''} onChange={(e) => {
          const amounts = [...(value.doseQuantities || [])]; amounts[i] = e.target.value;
          const next = { ...value, doseQuantities: amounts };
          onChange({ doseQuantities: amounts, dose: doseTemplateComplete(next) ? fillPattern(value.dosePattern, amounts) : '' });
        }} /></DoseQuantityField>)}</div>}
        <p className="whitespace-pre-line rounded-lg border border-cardline bg-offwhite-100 p-3 text-sm text-charcoal/80">{fillPattern(value.dosePattern, value.doseQuantities, true)}</p>
        {!doseTemplateComplete(value) && <p className="text-xs text-charcoal/55">हर मात्रा भरें (जैसे 1/2 या 1/3); मात्रा शून्य से अधिक होनी चाहिए।</p>}
      </>}
      {selected === 'custom' && <textarea aria-label="Custom dose / chit text" className={poInput} rows={2} value={value.dose || ''} onChange={(e) => onChange({ dose: e.target.value, customDose: e.target.value })} />}
    </div>
  );
}

const entryOf = (value) => ({
  id: value.id || crypto.randomUUID(), dose: value.dose || '', doseTemplate: value.doseTemplate || (value.dose ? 'custom' : ''),
  doseSpoons: value.doseSpoons || '', doseWaterCups: value.doseWaterCups || '',
  dosePattern: value.dosePattern || '', doseQuantities: value.doseQuantities || [], customDose: value.customDose || '',
  doseFieldLabels: value.doseFieldLabels || [],
});

export default function DoseChitInput({ value, onChange }) {
  const [initialId] = useState(() => crypto.randomUUID());
  const entries = value.doseEntries?.length ? value.doseEntries : [entryOf({ ...value, id: initialId })];
  const update = (next) => onChange({ doseEntries: next, dose: next.map((entry) => entry.dose.trim()).filter(Boolean).join('\n') });
  return <div className="space-y-3 sm:col-span-2">
    {entries.map((entry, index) => <div key={entry.id} className={entries.length > 1 ? 'space-y-2 rounded-lg border border-cardline p-3' : 'space-y-2'}>
      {entries.length > 1 && <div className="flex items-center justify-between gap-2"><p className="text-xs font-bold text-charcoal/65">Dose instruction {index + 1}</p><Button size="sm" variant="ghost" onClick={() => update(entries.filter((_, n) => n !== index))}>Remove dose</Button></div>}
      <DoseInstructionInput value={entry} onChange={(patch) => update(entries.map((item, n) => n === index ? { ...item, ...patch } : item))} />
    </div>)}
    <Button size="sm" variant="outline" disabled={entries.length >= 20 || entries.some((entry) => !singleDoseComplete(entry) || !entry.dose.trim())} onClick={() => update([...entries, entryOf({})])}>+ Add more dose</Button>
  </div>;
}
