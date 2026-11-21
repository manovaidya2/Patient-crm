import { useState } from 'react';
import { customLengthOf, lengthText } from '../../constants/supplyPlans.js';
import { Pencil, Plus, X } from 'lucide-react';
import api from '../../api/axios.js';
import Button from '../ui/Button.jsx';
import DoseChitInput, { doseTemplateComplete } from './DoseChitInput.jsx';
import MedicineNameEditor from './MedicineNameEditor.jsx';
import ExtraComponentsEditor, { extraComponentsComplete } from './ExtraComponentsEditor.jsx';
import { FieldLabel, poInput } from '../purchaseOrders/CreatePurchaseOrderModal.jsx';

const UNITS = ['g', 'ml', 'tablet', 'spoon', 'drop', 'piece'];
// When the medicine is taken (as on the Formulation Master); "Other" lets the doctor type it.
export const TIMINGS = ['सुबह -- शाम', 'सुबह (खाली पेट)', 'रात को खाने के बाद', 'सुबह -- दोपहर', 'सुबह -- दोपहर -- शाम', 'सुबह', 'दोपहर', 'शाम', 'रात', 'दोपहर -- शाम', 'सुबह -- रात', 'सुबह (खाली पेट) -- शाम', 'खाने के बाद'];
const OTHER = '__other';
const emptyAdd = () => ({ name: '', when: '', qty: '', unit: 'g', dose: '', containers: '', stockCode: '' });
const GHRIT_VARIANTS = Array.from({ length: 6 }, (_, n) => ({ key: `ghritNm${n}`, code: `GH-NM-${n}`, name: `मेध्य घृत (GH-NM-${n})` }));
const isVariant = (line, variant) => {
  const code = line.ghritVariantCode || GHRIT_VARIANTS.find((v) => v.key === line.key)?.code || (/^GH-NM-[0-5]$/.test(line.stockCode || '') ? line.stockCode : '');
  if (code) return code === variant.code;
  return (!line.original?.name || line.name === line.original.name) && line.name === variant.name;
};
const medicineName = (line) => line.name;
const num = (v) => (v == null || Number.isNaN(Number(v)) ? '-' : Number.isInteger(Number(v)) ? String(v) : String(Math.round(Number(v) * 1000) / 1000));

// The Formulation Master sheet of this supply (doc style, as the printed master).
// Which Stocks item a medicine is drawn from. Left blank, the medicine is matched by name or added to Stocks with 100 units on save.
function StockPick({ value, onChange, options }) {
  const known = options.some((o) => o.code === value);
  return (
    <select className={poInput} value={value || ''} onChange={(e) => onChange(e.target.value)}>
      <option value="">Not in Stocks: add it as new (100 units)</option>
      {value && !known && <option value={value}>{value} (not in Stocks)</option>}
      {options.map((o) => <option key={o.code} value={o.code}>{o.code} - {o.name} ({o.available} {o.unit})</option>)}
    </select>
  );
}

export default function FormulationSheet({ f, patientName, patientCode, canEdit = false, jobId = '', stockOptions = [], onSaved, onError, showSelectedGhrits = false, ghritSelection, ghritSelectionPending = false, onGhritSelectionChange, onSaveGhritSelection, savingGhritSelection = false }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({});
  const [busy, setBusy] = useState(false);
  // Medicines added for this patient in this edit (not in the Formulation Master).
  const [adds, setAdds] = useState([]);
  const [ghritName, setGhritName] = useState('\u092e\u0947\u0927\u094d\u092f \u0918\u0943\u0924 (GH-NM-01)');
  if (!f) return <p className="text-sm text-charcoal/55">Set the age group and medicine supply to build the sheet.</p>;
  const visibleLines = f.lines.filter((line) => {
    if (showSelectedGhrits && (line.key === 'ghrit' || GHRIT_VARIANTS.some((v) => isVariant(line, v))) && (draft[line.key]?.removed ?? line.removed)) return false;
    if (!ghritSelection) return true;
    const variant = GHRIT_VARIANTS.find((v) => isVariant(line, v));
    if (variant) return ghritSelection.includes(variant.code);
    return line.key !== 'ghrit' || (!ghritSelectionPending && ghritSelection.length === 0);
  });
  // Patient-added variants are stored at the end; show all ghrit entries first in the sheet.
  const isGhrit = (line) => line.key === 'ghrit' || GHRIT_VARIANTS.some((v) => isVariant(line, v));
  // A medicine removed for this patient leaves the sheet (it can be brought back from "Edit sheet"); the rest are
  // numbered again 1, 2, 3 ... unless a number was set by hand.
  const shownLines = visibleLines.filter((l) => !l.removed);
  const displayLines = showSelectedGhrits ? [...shownLines.filter(isGhrit), ...shownLines.filter((l) => !isGhrit(l))] : shownLines;
  // The number each medicine has on the sheet; "Edit sheet" lists them in the same order with the same numbers.
  const sheetNo = new Map(displayLines.map((l, i) => [l.key, l.displayNumber ?? i + 1]));
  const editLines = showSelectedGhrits ? [...f.lines.filter(isGhrit), ...f.lines.filter((l) => !isGhrit(l))] : f.lines;
  const startEditing = () => { setEditing(true); if (f.custom && !f.lines.length) setAdds([emptyAdd()]); };
  const d = (key) => draft[key] || {};
  const setLine = (key, patch) => setDraft((o) => ({ ...o, [key]: { ...(o[key] || {}), ...patch } }));
  const activeGhrit = GHRIT_VARIANTS.find((v) => adds.some((a) => a.ghritVariantCode === v.code) || f.lines.some((l) => isVariant(l, v) && !(d(l.key).removed ?? l.removed))) || GHRIT_VARIANTS[0];
  const ghritOptions = ghritSelection ? GHRIT_VARIANTS : [activeGhrit];
  const variantSelected = (variant) => adds.some((a) => a.ghritVariantCode === variant.code) || f.lines.some((l) => isVariant(l, variant) && !(d(l.key).removed ?? l.removed));
  const toggleVariant = (variant, checked) => {
    const existing = f.lines.find((l) => isVariant(l, variant));
    if (existing) setLine(existing.key, { removed: !checked });
    else if (checked) {
      const base = f.lines.find((l) => l.key === 'ghrit') || f.lines.find((l) => GHRIT_VARIANTS.some((v) => isVariant(l, v)));
      setAdds((list) => [...list, { ...emptyAdd(), name: ghritName, ghritVariantCode: variant.code, unit: 'ml', qty: base ? String(base.qty) : '', when: base?.when || '', dose: base?.dose || '', containers: (base?.containers || [f.days]).join(', '), stockCode: '' }]);
    } else setAdds((list) => list.filter((a) => a.ghritVariantCode !== variant.code));
    // Once codes are explicitly chosen, an empty selection means no ghrit.
    const generic = f.lines.find((l) => l.key === 'ghrit');
    if (generic) setLine(generic.key, { removed: true });
  };
  const save = async () => {
    if (adds.some((a) => a.name.trim() && !extraComponentsComplete(a.extraComponents)) || Object.values(draft).some((entry) => !extraComponentsComplete(entry.extraComponents))) {
      onError?.('Select each added component from Stocks and enter a positive quantity, or remove the empty row.');
      return;
    }
    if (adds.some((a) => a.name.trim() && (!doseTemplateComplete(a) || !extraComponentsComplete(a.extraComponents))) || Object.values(draft).some((entry) => !doseTemplateComplete(entry) || !extraComponentsComplete(entry.extraComponents))) {
      onError?.('चुनी हुई Dose instruction की सभी मात्रा शून्य से अधिक भरें (जैसे 1/2 या 1/3)।');
      return;
    }
    setBusy(true); onError?.('');
    try {
      const lines = [
        ...Object.entries(draft).map(([key, v]) => ({ key, ...v, components: v.components ? Object.entries(v.components).map(([code, qty]) => ({ code, qty })) : undefined })),
        ...adds.filter((a) => a.name.trim()).map(({ otherTiming, doseTemplate, doseSpoons, doseWaterCups, dosePattern, doseQuantities, customDose, ...a }) => ({ add: true, ...a })),
      ];
      const { data } = await api.patch(`/medicine-jobs/${jobId}/formulation`, { lines });
      setEditing(false); setDraft({}); setAdds([]); onSaved?.(data.job, 'Formulation sheet corrected.');
    } catch (err) { onError?.(err.response?.data?.message || 'Could not save the correction'); } finally { setBusy(false); }
  };
  const renameMedicine = async (key, name) => {
    if (editing) { setLine(key, { name }); return; }
    setBusy(true); onError?.('');
    try {
      const { data } = await api.patch(`/medicine-jobs/${jobId}/formulation`, { lines: [{ key, name }] });
      onSaved?.(data.job, 'Medicine name saved for this patient.');
    } catch (err) {
      const message = err.response?.data?.message || 'Could not save the medicine name';
      onError?.(message);
      throw new Error(message);
    } finally { setBusy(false); }
  };
  const renameNumber = async (key, number) => {
    if (!Number.isInteger(Number(number)) || Number(number) < 1 || Number(number) > 9999) throw new Error('Enter a medicine number from 1 to 9999');
    if (editing) { setLine(key, { displayNumber: Number(number) }); return; }
    setBusy(true); onError?.('');
    try {
      const { data } = await api.patch('/medicine-jobs/' + jobId + '/formulation', { lines: [{ key, displayNumber: number }] });
      onSaved?.(data.job, 'Medicine number saved for this patient.');
    } catch (err) {
      const message = err.response?.data?.message || 'Could not save the medicine number';
      onError?.(message); throw new Error(message);
    } finally { setBusy(false); }
  };
  // Why "Save" cannot be pressed yet, in words (instead of a grey button with no reason).
  const nameOf = (key) => f.lines.find((l) => l.key === key)?.name || 'a medicine';
  const blocker = (() => {
    const badAddDose = adds.find((a) => a.name.trim() && !doseTemplateComplete(a));
    if (badAddDose) return `"${badAddDose.name.trim()}" की dose पूरी नहीं है: हर मात्रा संख्या में भरें (जैसे 1, 2, 1/2) या "इस दवा का dose / chit text" में पूरा text खुद लिखें।`;
    const badLineDose = Object.entries(draft).find(([, v]) => !doseTemplateComplete(v));
    if (badLineDose) return `"${nameOf(badLineDose[0])}" की dose पूरी नहीं है: हर मात्रा संख्या में भरें (जैसे 1, 2, 1/2) या dose text खुद लिखें।`;
    const badAddPart = adds.find((a) => a.name.trim() && !extraComponentsComplete(a.extraComponents));
    const badLinePart = Object.entries(draft).find(([, v]) => !extraComponentsComplete(v.extraComponents));
    if (badAddPart || badLinePart) return `"${badAddPart ? badAddPart.name.trim() : nameOf(badLinePart[0])}" का added component Stocks से चुनें और मात्रा भरें, या खाली row हटाएँ।`;
    if (adds.some((a) => !a.name.trim() && (a.qty || a.dose || a.doseEntries))) return 'नई दवा का नाम भरें।';
    return '';
  })();
  const nothingChanged = !Object.keys(draft).length && !adds.some((a) => a.name.trim());
  if (editing) return (
    <div className="rounded-lg border-2 border-amber-300 bg-amber-50/40 p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><p className="text-sm font-bold text-charcoal">{f.custom ? `Formulation for this child (${f.ageBandLabel})` : 'Correct the sheet for this patient'}</p><p className="text-xs text-charcoal/60">{f.custom ? 'There is no Formulation Master for this age group: add each medicine with its total quantity for the supply, timing, dose (chit text) and packs. It is for this child only.' : "For this patient's request only: the Formulation Master is not changed. Leave a box as it is to keep the value; the master value stays visible beside every change."}</p></div>
      <fieldset className="mb-3 rounded-lg border border-cardline bg-white/70 p-3">
        <legend className="px-1 text-sm font-bold text-charcoal">Ghrit medicine</legend>
        <div className="grid gap-2 sm:grid-cols-2">{ghritOptions.map((v) => {
          const existing = f.lines.find((line) => isVariant(line, v));
          const added = adds.find((line) => line.ghritVariantCode === v.code);
          const name = (existing ? d(existing.key).name ?? existing.name : added?.name) || ghritName;
          return <div key={v.code} className="flex items-center gap-2 text-sm"><input type="checkbox" aria-label="Include ghrit medicine" className="h-4 w-4 accent-sage" checked={variantSelected(v)} onChange={(e) => toggleVariant(v, e.target.checked)} /><MedicineNameEditor name={name} canEdit={canEdit} disabled={busy} onSave={async (nextName) => { setGhritName(nextName); if (existing) setLine(existing.key, { name: nextName }); else if (added) setAdds((list) => list.map((item) => item.ghritVariantCode === v.code ? { ...item, name: nextName } : item)); }} /></div>;
        })}</div>
        <p className="mt-2 text-xs text-charcoal/55">हर चुने हुए घृत की मात्रा और dose नीचे अलग से भरें।</p>
      </fieldset>
      <ol className="divide-y divide-dashed divide-cardline">
        {editLines.map((l) => (
          <li key={l.key} className="grid gap-2 py-3 sm:grid-cols-2">
            <div>
              <p className="text-sm font-bold text-charcoal"><MedicineNameEditor name={l.removed ? '–' : String(d(l.key).displayNumber ?? sheetNo.get(l.key) ?? l.displayNumber ?? l.n)} fieldLabel="medicine number" inputType="number" canEdit={canEdit && !l.removed} disabled={busy} onSave={(number) => renameNumber(l.key, number)} />. <MedicineNameEditor name={d(l.key).name ?? medicineName(l)} canEdit={canEdit && !l.removed} disabled={busy} onSave={(name) => renameMedicine(l.key, name)} /> <span className="font-normal text-charcoal/55">· {l.when}</span></p>
              <label className="mt-1 flex items-center gap-2 text-xs font-semibold text-[#8C3B2E]"><input type="checkbox" className="h-4 w-4 accent-[#8C3B2E]" checked={d(l.key).removed ?? Boolean(l.removed)} onChange={(e) => setLine(l.key, { removed: e.target.checked })} />Remove this medicine for this patient</label>
              {l.fromHome ? <p className="mt-1 text-xs text-charcoal/55">घर से - nothing is packed, so there is nothing to correct here.</p>
                : <label className="mt-1 flex items-center gap-2 text-xs"><input type="checkbox" className="h-4 w-4 accent-sage" checked={d(l.key).packed ?? l.packed} onChange={(e) => setLine(l.key, { packed: e.target.checked })} />Packed in this supply</label>}
              {l.dose !== undefined && <div className="mt-1"><DoseChitInput value={{ dose: l.dose, doseEntries: l.doseEntries, ...d(l.key) }} onChange={(patch) => setLine(l.key, patch)} /></div>}
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {l.components ? l.components.map((c) => <FieldLabel key={c.code} label={`${c.name} (${c.unit})`}><input className={poInput} type="number" step="0.001" min="0" value={d(l.key).components?.[c.code] ?? c.qty} onChange={(e) => setLine(l.key, { components: { ...(d(l.key).components || {}), [c.code]: e.target.value } })} /></FieldLabel>)
                : l.unit ? <FieldLabel label={`Total quantity (${l.unit})`}><input className={poInput} type="number" step="0.001" min="0" value={d(l.key).qty ?? l.qty} onChange={(e) => setLine(l.key, { qty: e.target.value })} /></FieldLabel> : null}
              {l.packed && l.chitNo && <FieldLabel label="Packs (days each, comma separated)"><input className={poInput} value={d(l.key).containers ?? l.containers.join(', ')} onChange={(e) => setLine(l.key, { containers: e.target.value })} /></FieldLabel>}
              <ExtraComponentsEditor components={d(l.key).extraComponents ?? l.extraComponents} medicineName={d(l.key).name ?? l.name} stockOptions={stockOptions} onChange={(extraComponents) => setLine(l.key, { extraComponents })} />
              {l.added && <FieldLabel label="Drawn from Stocks" className="sm:col-span-2"><StockPick value={d(l.key).stockCode ?? (l.stockCode || '')} options={stockOptions} onChange={(code) => setLine(l.key, { stockCode: code })} /></FieldLabel>}
            </div>
          </li>
        ))}
      </ol>
      <div className="mt-2 space-y-2 border-t border-dashed border-cardline pt-3">
        <p className="text-sm font-bold text-charcoal">{f.custom ? 'Medicines of this formulation' : 'Add a medicine for this patient'}</p>
        {adds.map((a, i) => {
          const setAdd = (patch) => setAdds((list) => list.map((x, n) => (n === i ? { ...x, ...patch } : x)));
          return (
            <div key={i} className="grid gap-2 rounded-lg border border-cardline bg-white/70 p-3 sm:grid-cols-2">
              <div>
                <div className="grid grid-cols-[96px_minmax(0,1fr)] gap-2">
                  <FieldLabel label="Serial no."><input className={poInput} type="number" min="1" step="1" value={a.serialNumber ?? ''} onChange={(e) => setAdd({ serialNumber: e.target.value })} placeholder={String(displayLines.length + i + 1)} aria-describedby={`serial-hint-${i}`} /></FieldLabel>
                  <FieldLabel label="Medicine name" required><input className={poInput} value={a.name} onChange={(e) => setAdd({ name: e.target.value })} /></FieldLabel>
                </div>
                <p id={`serial-hint-${i}`} className="mt-1 text-[11px] text-charcoal/55">{Number(a.serialNumber) >= 1 ? `Goes in at number ${Math.floor(Number(a.serialNumber))}: the medicine at ${Math.floor(Number(a.serialNumber))} and every one below it move down one.` : 'Leave the serial number blank to add it last.'}</p>
              </div>
              <FieldLabel label="When (timing)">
                <select className={poInput} value={a.when === '' ? '' : TIMINGS.includes(a.when) && !a.otherTiming ? a.when : OTHER} onChange={(e) => (e.target.value === OTHER ? setAdd({ when: '', otherTiming: true }) : setAdd({ when: e.target.value, otherTiming: false }))}>
                  <option value="">Select timing</option>
                  {TIMINGS.map((t) => <option key={t} value={t}>{t}</option>)}
                  <option value={OTHER}>Other (type it)</option>
                </select>
                {(a.otherTiming || (a.when && !TIMINGS.includes(a.when))) && <input className={`${poInput} mt-1.5`} value={a.when} onChange={(e) => setAdd({ when: e.target.value, otherTiming: true })} placeholder="Type the timing" />}
              </FieldLabel>
              <div className="grid grid-cols-[minmax(0,1fr)_110px] gap-2">
                <FieldLabel label="Total quantity" required><input className={poInput} type="number" step="0.001" min="0" value={a.qty} onChange={(e) => setAdd({ qty: e.target.value })} /></FieldLabel>
                <FieldLabel label="Unit"><select className={poInput} disabled={Boolean(a.ghritVariantCode)} value={a.unit} onChange={(e) => setAdd({ unit: e.target.value })}>{UNITS.map((u) => <option key={u} value={u}>{u}</option>)}</select></FieldLabel>
              </div>
              <FieldLabel label="Packs (days each, comma separated)"><input className={poInput} value={a.containers} onChange={(e) => setAdd({ containers: e.target.value })} placeholder={`${f.days}`} /></FieldLabel>
              <DoseChitInput value={a} onChange={setAdd} />
              <ExtraComponentsEditor components={a.extraComponents} medicineName={a.name || "New medicine"} stockOptions={stockOptions} onChange={(extraComponents) => setAdd({ extraComponents })} />
              <FieldLabel label="Drawn from Stocks"><StockPick value={a.stockCode} options={stockOptions} onChange={(code) => setAdd({ stockCode: code })} /></FieldLabel>
              <div className="flex items-end justify-end"><Button size="sm" variant="outline" onClick={() => a.ghritVariantCode ? toggleVariant(GHRIT_VARIANTS.find((v) => v.code === a.ghritVariantCode), false) : setAdds((list) => list.filter((_, n) => n !== i))}><X size={13} />Remove</Button></div>
            </div>
          );
        })}
        <Button size="sm" variant="outline" onClick={() => setAdds((list) => [...list, emptyAdd()])}><Plus size={13} />Add medicine</Button>
      </div>
      {blocker && <p role="alert" className="mt-3 rounded-lg bg-[#8C3B2E]/8 px-3 py-2 text-xs font-semibold text-[#8C3B2E]">Save नहीं हो रहा: {blocker}</p>}
      <div className="mt-3 flex gap-2"><Button size="sm" disabled={busy || Boolean(blocker) || nothingChanged} onClick={save}>{busy ? 'Saving...' : f.custom ? 'Save formulation' : 'Save correction'}</Button><Button size="sm" variant="outline" disabled={busy} onClick={() => { setEditing(false); setDraft({}); setAdds([]); }}>Cancel</Button></div>
    </div>
  );
  return (
    <div className="rounded-lg border border-cardline bg-offwhite-100 p-4 sm:p-6">
      {canEdit && <div className="mb-2 flex justify-end"><Button size="sm" variant={f.custom && !f.lines.length ? 'primary' : 'outline'} onClick={startEditing}>{f.custom && !f.lines.length ? <><Plus size={13} />Create formulation</> : f.custom ? <><Pencil size={13} />Edit formulation</> : <><Pencil size={13} />Edit sheet</>}</Button></div>}
      {f.custom && <p className="mb-2 rounded bg-sky-50 px-2 py-1.5 text-[11px] font-semibold text-sky-900">{customLengthOf(f.plan) ? `Custom supply of ${lengthText(f.days)}` : f.ageBandLabel}: no Formulation Master for this age group. {f.lines.length ? 'This formulation was made for this child.' : 'No medicines yet - the formulation is made for this child.'}</p>}
      {f.edited && <p className="mb-2 rounded bg-amber-100 px-2 py-1 text-[11px] font-semibold text-amber-900">This sheet was corrected for this patient only (the Formulation Master is unchanged); master values are shown struck through.</p>}
      <div className="border-b border-charcoal pb-2 text-center"><p className="text-xs font-bold tracking-wide">AUTISM, ADHD &amp; CHILD DEVELOPMENT</p><p className="text-base font-bold">{f.title}</p><p className="text-xs text-charcoal/60">आयु: {f.ageBandLabel} · आपूर्ति: {f.months} महीने ({f.days} दिन) · गणना: 1 महीना = 30 दिन, माप-चम्मच = 5 ml</p></div>
      <p className="mt-2 text-xs text-charcoal/60">मरीज: <b className="text-charcoal">{patientName}</b> · ID {patientCode}</p>
      {canEdit && !ghritSelection && <fieldset className="mt-3 rounded-lg border border-sage/30 bg-white p-3" disabled={busy}>
        <legend className="px-1 text-sm font-bold text-charcoal">Ghrit medicine</legend>
        <div className="grid gap-2 sm:grid-cols-2">{ghritOptions.map((v) => {
          const selected = variantSelected(v);
          const existing = f.lines.find((l) => isVariant(l, v));
          const added = adds.find((a) => a.ghritVariantCode === v.code);
          const value = existing ? { ...existing, ...d(existing.key) } : added;
          const update = (patch) => existing ? setLine(existing.key, patch) : setAdds((list) => list.map((a) => a.ghritVariantCode === v.code ? { ...a, ...patch } : a));
          return <div key={v.code} className="rounded-lg border border-cardline p-2"><label className="flex items-center gap-2 text-sm font-semibold text-charcoal"><input type="checkbox" aria-label="Include ghrit medicine" className="h-4 w-4 accent-sage" checked={selected} onChange={(e) => toggleVariant(v, e.target.checked)} /></label><MedicineNameEditor name={value?.name || ghritName} canEdit={canEdit} disabled={busy} onSave={async (name) => { setGhritName(name); if (existing) await renameMedicine(existing.key, name); else if (added) update({ name }); }} />{selected && value && <div className="mt-2 space-y-2"><FieldLabel label="Total quantity (ml)"><input className={poInput} type="number" min="0.001" step="0.001" value={value.qty} onChange={(e) => update({ qty: e.target.value })} /></FieldLabel><FieldLabel label="Dose / chit text"><textarea className={poInput} rows={2} value={value.dose || ''} onChange={(e) => update({ dose: e.target.value })} /></FieldLabel></div>}</div>;
        })}</div>
        {(Object.keys(draft).length > 0 || adds.length > 0) && <div className="mt-3 flex items-center gap-2"><Button size="sm" disabled={busy || adds.some((a) => a.ghritVariantCode && !(Number(a.qty) > 0))} onClick={save}>{busy ? 'Saving...' : 'Save घृत selection'}</Button><Button size="sm" variant="outline" disabled={busy} onClick={() => { setDraft({}); setAdds([]); }}>Cancel</Button><span className="text-xs text-charcoal/55">इस मरीज की formulation में save करें।</span></div>}
      </fieldset>}
      {ghritSelection && <fieldset className="mt-3 rounded-lg border border-cardline bg-white p-3" disabled={savingGhritSelection}>
        <legend className="px-1 text-sm font-bold text-charcoal">मेध्य घृत चुनें (एक से अधिक चुन सकते हैं)</legend>
        <ol className="divide-y divide-dashed divide-cardline">{GHRIT_VARIANTS.map((v, i) => <li key={v.code} className="py-2"><label className="flex items-center gap-2 text-sm font-semibold text-charcoal"><input type="checkbox" className="h-4 w-4 accent-sage" disabled={!onGhritSelectionChange} checked={ghritSelection.includes(v.code)} onChange={(e) => onGhritSelectionChange?.(v.code, e.target.checked)} />{i + 1}. {v.name}</label></li>)}</ol>
        {onSaveGhritSelection && <Button size="sm" className="mt-2" disabled={savingGhritSelection} onClick={onSaveGhritSelection}>{savingGhritSelection ? 'Saving...' : 'Save selection'}</Button>}
      </fieldset>}
      {!displayLines.length && <p className="mt-3 rounded-lg border border-dashed border-cardline px-3 py-4 text-center text-sm text-charcoal/55">No medicines on this sheet yet.</p>}
      <ol className="mt-3 divide-y divide-dashed divide-cardline">
        {displayLines.map((l, index) => (
          <li key={l.key} className={`grid gap-x-4 py-2.5 sm:grid-cols-[minmax(0,1fr)_auto] ${l.removed ? 'bg-[#8C3B2E]/5 opacity-70' : l.added ? 'bg-emerald-50/70' : l.edited ? 'bg-amber-50/60' : ''}`}>
            <div>
              <p className={`text-sm font-bold text-charcoal ${l.removed ? 'line-through' : ''}`}><MedicineNameEditor name={String(l.displayNumber ?? index + 1)} fieldLabel="medicine number" inputType="number" canEdit={canEdit && !l.removed} disabled={busy} onSave={(number) => renameNumber(l.key, number)} />. <MedicineNameEditor name={medicineName(l)} canEdit={canEdit && !l.removed} disabled={busy} onSave={(name) => renameMedicine(l.key, name)} /> <span className="font-normal text-charcoal/55">· {l.when}</span>{l.removed ? <span className="ml-2 rounded bg-[#8C3B2E]/10 px-1.5 py-0.5 text-[10px] font-bold text-[#8C3B2E] no-underline">removed for this patient by {l.edited?.byName}</span> : l.added ? <span className="ml-2 rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-800">added for this patient by {l.added.byName}</span> : l.edited && <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-900">corrected by {l.edited.byName}</span>}</p>
              {l.edited && l.original?.dose && l.original.dose !== l.dose && <p className="text-xs text-charcoal/45 line-through">{l.original.dose}</p>}
              {l.dose && <p className="whitespace-pre-line text-sm text-charcoal/80">{l.dose}</p>}
              {(l.components?.length || l.extraComponents?.length) > 0 && <div className="mt-1 flex flex-wrap gap-1.5 font-mono text-[11px]">{[...(l.components || []), ...(l.extraComponents || [])].map((c, componentIndex) => <span key={`${c.code}-${componentIndex}`} className="rounded border border-cardline bg-white px-2 py-0.5">{c.name}: {num(c.qty)} {c.unit}{c.grams ? ` = ${num(c.grams)} g` : ''}{c.pinches ? ` / ${c.pinches} चुटकी` : ''}</span>)}</div>}
              {l.note && <p className="text-xs text-charcoal/55">{l.note}</p>}
              {l.honey && <p className="text-xs text-charcoal/55">शहद कुल: {num(l.honey[0])} {l.honey[1]} (औषधि से अलग, मरीज स्वयं)</p>}
              {l.containers?.length > 1 && <p className="text-xs text-charcoal/55">{l.containers.length} पैक: {l.containers.map((d) => `${d} दिन`).join(' + ')}</p>}
              {l.pending && <p className="text-[11px] font-semibold text-amber-800">पुष्टि बाकी: {l.pending}</p>}
              {l.packed && !l.components && !l.fromHome && !l.removed && (l.stockCode ? <p className="font-mono text-[11px] text-charcoal/55">Stocks: {l.stockCode}</p> : l.added || f.custom ? <p className="text-[11px] font-semibold text-sky-800">Not linked to Stocks - picked at preparation</p> : null)}
            </div>
            <div className="text-right text-xs text-charcoal/55">टोटल मात्रा<br />{l.edited && l.original && l.original.qty !== l.qty && <span className="block font-mono text-xs text-charcoal/45 line-through">{num(l.original.qty)} {l.original.unit}</span>}<b className="font-mono text-sm text-charcoal">{l.removed ? 'हटाई गई' : l.packed ? `${num(l.qty)} ${l.unit}` : l.fromHome ? 'घर से' : 'पैक नहीं'}</b>{l.bottles && !l.removed ? <><br />{l.bottles} × BT-100{l.bottlesBy?.byName && <span className="block text-[10px] text-charcoal/55">changed by {l.bottlesBy.byName}</span>}</> : null}</div>
          </li>
        ))}
      </ol>
      <p className="mt-3 text-xs"><b>साथ जाने वाले Treatment Papers:</b> {f.papers.length ? f.papers.join(' · ') : f.papersNote}</p>
    </div>
  );
}
