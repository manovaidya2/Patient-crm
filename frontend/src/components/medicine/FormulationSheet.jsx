import { useState } from 'react';
import { Pencil } from 'lucide-react';
import api from '../../api/axios.js';
import Button from '../ui/Button.jsx';
import { FieldLabel, poInput } from '../purchaseOrders/CreatePurchaseOrderModal.jsx';

const num = (v) => (v == null || Number.isNaN(Number(v)) ? '-' : Number.isInteger(Number(v)) ? String(v) : String(Math.round(Number(v) * 1000) / 1000));

// The Formulation Master sheet of this supply (doc style, as the printed master).
export default function FormulationSheet({ f, patientName, patientCode, canEdit = false, jobId = '', onSaved, onError }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({});
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  if (!f) return <p className="text-sm text-charcoal/55">Set the age group and medicine supply to build the sheet.</p>;
  const d = (key) => draft[key] || {};
  const setLine = (key, patch) => setDraft((o) => ({ ...o, [key]: { ...(o[key] || {}), ...patch } }));
  const save = async () => {
    setBusy(true); onError?.('');
    try {
      const lines = Object.entries(draft).map(([key, v]) => ({ key, ...v, components: v.components ? Object.entries(v.components).map(([code, qty]) => ({ code, qty })) : undefined }));
      const { data } = await api.patch(`/medicine-jobs/${jobId}/formulation`, { lines, note });
      setEditing(false); setDraft({}); setNote(''); onSaved?.(data.job, 'Formulation sheet corrected.');
    } catch (err) { onError?.(err.response?.data?.message || 'Could not save the correction'); } finally { setBusy(false); }
  };
  if (editing) return (
    <div className="rounded-lg border-2 border-amber-300 bg-amber-50/40 p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><p className="text-sm font-bold text-charcoal">Correct the sheet for this patient</p><p className="text-xs text-charcoal/60">Leave a box as it is to keep the master value. The master value stays visible beside every change.</p></div>
      <ol className="divide-y divide-dashed divide-cardline">
        {f.lines.map((l) => (
          <li key={l.key} className="grid gap-2 py-3 sm:grid-cols-2">
            <div>
              <p className="text-sm font-bold text-charcoal">{l.n}. {l.name} <span className="font-normal text-charcoal/55">· {l.when}</span></p>
              {l.fromHome ? <p className="mt-1 text-xs text-charcoal/55">घर से - nothing is packed, so there is nothing to correct here.</p>
                : <label className="mt-1 flex items-center gap-2 text-xs"><input type="checkbox" className="h-4 w-4 accent-sage" checked={d(l.key).packed ?? l.packed} onChange={(e) => setLine(l.key, { packed: e.target.checked })} />Packed in this supply</label>}
              {l.dose !== undefined && <FieldLabel label="Dose / chit text" className="mt-1"><textarea className={poInput} rows={2} value={d(l.key).dose ?? l.dose} onChange={(e) => setLine(l.key, { dose: e.target.value })} /></FieldLabel>}
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {l.components ? l.components.map((c) => <FieldLabel key={c.code} label={`${c.name} (${c.unit})`}><input className={poInput} type="number" step="0.001" min="0" value={d(l.key).components?.[c.code] ?? c.qty} onChange={(e) => setLine(l.key, { components: { ...(d(l.key).components || {}), [c.code]: e.target.value } })} /></FieldLabel>)
                : l.unit ? <FieldLabel label={`Total quantity (${l.unit})`}><input className={poInput} type="number" step="0.001" min="0" value={d(l.key).qty ?? l.qty} onChange={(e) => setLine(l.key, { qty: e.target.value })} /></FieldLabel> : null}
              {l.packed && l.chitNo && <FieldLabel label="Packs (days each, comma separated)"><input className={poInput} value={d(l.key).containers ?? l.containers.join(', ')} onChange={(e) => setLine(l.key, { containers: e.target.value })} /></FieldLabel>}
            </div>
          </li>
        ))}
      </ol>
      <FieldLabel label="Why is the sheet corrected?" required className="mt-2"><input className={poInput} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Dr Garg: 1 चम्मच ghrit for this child" /></FieldLabel>
      <div className="mt-3 flex gap-2"><Button size="sm" disabled={busy || !note.trim() || !Object.keys(draft).length} onClick={save}>{busy ? 'Saving...' : 'Save correction'}</Button><Button size="sm" variant="outline" disabled={busy} onClick={() => { setEditing(false); setDraft({}); }}>Cancel</Button></div>
    </div>
  );
  return (
    <div className="rounded-lg border border-cardline bg-offwhite-100 p-4 sm:p-6">
      {canEdit && <div className="mb-2 flex justify-end"><Button size="sm" variant="outline" onClick={() => setEditing(true)}><Pencil size={13} />Edit sheet</Button></div>}
      {f.edited && <p className="mb-2 rounded bg-amber-100 px-2 py-1 text-[11px] font-semibold text-amber-900">This sheet was corrected for this patient; master values are shown struck through.</p>}
      <div className="border-b border-charcoal pb-2 text-center"><p className="text-xs font-bold tracking-wide">AUTISM, ADHD &amp; CHILD DEVELOPMENT</p><p className="text-base font-bold">{f.title}</p><p className="text-xs text-charcoal/60">आयु: {f.ageBandLabel} · आपूर्ति: {f.months} महीने ({f.days} दिन) · गणना: 1 महीना = 30 दिन, माप-चम्मच = 5 ml</p></div>
      <p className="mt-2 text-xs text-charcoal/60">मरीज: <b className="text-charcoal">{patientName}</b> · ID {patientCode}</p>
      <ol className="mt-3 divide-y divide-dashed divide-cardline">
        {f.lines.map((l) => (
          <li key={l.key} className={`grid gap-x-4 py-2.5 sm:grid-cols-[minmax(0,1fr)_auto] ${l.edited ? 'bg-amber-50/60' : ''}`}>
            <div>
              <p className="text-sm font-bold text-charcoal">{l.n}. {l.name} <span className="font-normal text-charcoal/55">· {l.when}</span>{l.edited && <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-900">corrected by {l.edited.byName}</span>}</p>
              {l.edited && l.original?.dose && l.original.dose !== l.dose && <p className="text-xs text-charcoal/45 line-through">{l.original.dose}</p>}
              {l.dose && <p className="text-sm text-charcoal/80">{l.dose}</p>}
              {l.components && <div className="mt-1 flex flex-wrap gap-1.5 font-mono text-[11px]">{l.components.map((c) => <span key={c.code} className="rounded border border-cardline bg-white px-2 py-0.5">{c.name}: {num(c.qty)} {c.unit}{c.grams ? ` = ${num(c.grams)} g` : ''}{c.pinches ? ` / ${c.pinches} चुटकी` : ''}</span>)}</div>}
              {l.note && <p className="text-xs text-charcoal/55">{l.note}</p>}
              {l.honey && <p className="text-xs text-charcoal/55">शहद कुल: {num(l.honey[0])} {l.honey[1]} (औषधि से अलग, मरीज स्वयं)</p>}
              {l.containers?.length > 1 && <p className="text-xs text-charcoal/55">{l.containers.length} पैक: {l.containers.map((d) => `${d} दिन`).join(' + ')}</p>}
              {l.pending && <p className="text-[11px] font-semibold text-amber-800">पुष्टि बाकी: {l.pending}</p>}
            </div>
            <div className="text-right text-xs text-charcoal/55">टोटल मात्रा<br />{l.edited && l.original && l.original.qty !== l.qty && <span className="block font-mono text-xs text-charcoal/45 line-through">{num(l.original.qty)} {l.original.unit}</span>}<b className="font-mono text-sm text-charcoal">{l.packed ? `${num(l.qty)} ${l.unit}` : l.fromHome ? 'घर से' : 'पैक नहीं'}</b>{l.bottles ? <><br />{l.bottles} × BT-100</> : null}</div>
          </li>
        ))}
      </ol>
      <p className="mt-3 text-xs"><b>साथ जाने वाले Treatment Papers:</b> {f.papers.length ? f.papers.join(' · ') : f.papersNote}</p>
    </div>
  );
}
