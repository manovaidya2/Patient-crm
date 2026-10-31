import { useCallback, useEffect, useMemo, useState } from 'react';
import useStaleState from '../../hooks/useStaleState.js';
import { Link } from 'react-router-dom';
import { AlertTriangle, BookOpen, CheckCircle2, Clock3, FlaskConical, Pencil, RotateCcw } from 'lucide-react';
import api from '../../api/axios.js';
import Button from '../../components/ui/Button.jsx';
import Badge from '../../components/ui/Badge.jsx';
import FormulationSheet from '../../components/medicine/FormulationSheet.jsx';
import { Chip, FieldLabel, poInput } from '../../components/purchaseOrders/CreatePurchaseOrderModal.jsx';
import { FlaskConical as PageTitleIcon } from 'lucide-react';

const dateTime = (v) => (v ? new Date(v).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '');
const ErrorText = ({ children }) => (children ? <p className="rounded-lg bg-[#8C3B2E]/8 px-3 py-2 text-sm text-[#8C3B2E]">{children}</p> : null);
const qtyText = (v) => (v ? `${v.qty} ${v.unit}` : 'not given');

// Edit form of one age band: six-month quantities, chit doses, शिवा-लेह packs, tablet weights and the doctor-pending points.
function MasterForm({ band, meta, onSaved, onCancel }) {
  const [form, setForm] = useState(() => ({
    quantities: Object.fromEntries(meta.items.map((i) => [i.key, band.quantities[i.key] ? { qty: String(band.quantities[i.key].qty), unit: band.quantities[i.key].unit } : { qty: '', unit: i.units[0] }])),
    doses: { ...band.doses },
    shivaLehSplit: Object.fromEntries(meta.splitDays.map((d) => [String(d), (band.shivaLehSplit[String(d)] || [d]).join(', ')])),
    tabletGrams: Object.fromEntries(Object.entries(band.tabletGrams).map(([k, v]) => [k, String(v)])),
    pendingNotes: { ...band.pendingNotes },
    note: '',
  }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (group, key, value) => setForm((f) => ({ ...f, [group]: { ...f[group], [key]: value } }));
  const save = async () => {
    setBusy(true); setError('');
    try {
      const body = { ...form, quantities: Object.fromEntries(Object.entries(form.quantities).map(([k, v]) => [k, v.qty === '' ? null : v])) };
      const { data } = await api.put(`/formulation-master/${band.ageBand}`, body);
      onSaved(data.band, `Formulation Master ${band.label} saved as v${data.band.version} (${data.changes.length} change${data.changes.length === 1 ? '' : 's'}).`);
    } catch (err) { setError(err.response?.data?.message || 'Could not save the master'); } finally { setBusy(false); }
  };
  const docQty = (key) => qtyText(band.defaults.quantities[key]);
  return (
    <div className="space-y-5 rounded-xl border-2 border-amber-300 bg-amber-50/40 p-4">
      <div><p className="text-sm font-bold text-charcoal">Edit the master for {band.label}</p><p className="text-xs text-charcoal/60">Quantities are the SIX-MONTH totals; every supply (1 month, 5 months, 2 months, 4 months, full) takes its fraction automatically. The document value is shown beside each box.</p></div>
      <div>
        <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-charcoal/50">Six-month quantities</p>
        <div className="overflow-x-auto rounded-lg border border-cardline bg-white">
          <table className="w-full text-sm">
            <thead className="bg-offwhite-200 text-[11px] uppercase tracking-wide text-charcoal/55"><tr><th className="px-3 py-2 text-left">Item</th><th className="px-3 py-2 text-left">Quantity (6 months)</th><th className="px-3 py-2 text-left">Unit</th><th className="px-3 py-2 text-left">Document value</th></tr></thead>
            <tbody>{meta.items.map((i) => {
              const v = form.quantities[i.key];
              return <tr key={i.key} className="border-t border-cardline"><td className="px-3 py-2 font-semibold text-charcoal">{i.label}{i.optional && <span className="block text-[11px] font-normal text-charcoal/50">Leave empty when this age group does not get it.</span>}</td>
                <td className="px-3 py-2"><input className={`${poInput} w-32`} type="number" step="0.001" min="0" value={v.qty} onChange={(e) => set('quantities', i.key, { ...v, qty: e.target.value })} /></td>
                <td className="px-3 py-2">{i.units.length > 1 ? <select className={`${poInput} w-28`} value={v.unit} onChange={(e) => set('quantities', i.key, { ...v, unit: e.target.value })}>{i.units.map((u) => <option key={u} value={u}>{u}</option>)}</select> : <span className="text-charcoal/70">{v.unit}</span>}</td>
                <td className={`px-3 py-2 text-xs ${docQty(i.key) !== (v.qty === '' ? 'not given' : `${Number(v.qty)} ${v.unit}`) ? 'font-semibold text-amber-900' : 'text-charcoal/50'}`}>{docQty(i.key)}</td></tr>;
            })}</tbody>
          </table>
        </div>
      </div>
      <div>
        <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-charcoal/50">Doses on the chits</p>
        <div className="grid gap-3 sm:grid-cols-2">{meta.doses.map((d) => (
          <FieldLabel key={d.key} label={d.label} required={!d.optional}>
            <textarea className={poInput} rows={2} value={form.doses[d.key] || ''} onChange={(e) => set('doses', d.key, e.target.value)} />
            {band.defaults.doses[d.key] && band.defaults.doses[d.key] !== (form.doses[d.key] || '') && <p className="mt-1 text-[11px] text-charcoal/50">Document: {band.defaults.doses[d.key]}</p>}
          </FieldLabel>
        ))}</div>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div>
          <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-charcoal/50">शिवा-लेह packs (days on each chit; must add up to the supply days)</p>
          <div className="grid gap-2 sm:grid-cols-2">{meta.splitDays.map((d) => <FieldLabel key={d} label={`${d} days supply`}><input className={poInput} value={form.shivaLehSplit[String(d)]} onChange={(e) => set('shivaLehSplit', String(d), e.target.value)} placeholder="e.g. 90, 90" /></FieldLabel>)}</div>
        </div>
        <div>
          <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-charcoal/50">Tablet weight (grams per tablet, for the noon-night mix total)</p>
          <div className="grid gap-2 sm:grid-cols-3">{Object.keys(form.tabletGrams).map((k) => <FieldLabel key={k} label={k.toUpperCase()}><input className={poInput} type="number" step="0.001" min="0" value={form.tabletGrams[k]} onChange={(e) => set('tabletGrams', k, e.target.value)} /></FieldLabel>)}</div>
          <p className="mt-3 mb-2 text-[11px] font-bold uppercase tracking-wide text-charcoal/50">Points pending with the doctor (clear a box once confirmed; it then stops showing on jobs)</p>
          <div className="grid gap-2">{meta.pendingKeys.map((k) => <FieldLabel key={k} label={k}><input className={poInput} value={form.pendingNotes[k] || ''} onChange={(e) => set('pendingNotes', k, e.target.value)} /></FieldLabel>)}</div>
        </div>
      </div>
      <FieldLabel label="Why is the master changed? (doctor's instruction / document followed)" required><input className={poInput} value={form.note} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} placeholder="e.g. Dr Garg 22 Oct: ghrit 1 चम्मच above 4 years" /></FieldLabel>
      <ErrorText>{error}</ErrorText>
      <div className="flex gap-2"><Button disabled={busy || !form.note.trim()} onClick={save}>{busy ? 'Saving...' : 'Save new version'}</Button><Button variant="outline" disabled={busy} onClick={onCancel}>Cancel</Button></div>
    </div>
  );
}

export default function FormulationMasterPage() {
  const [data, setData] = useStaleState('formulation-master', null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [band, setBand] = useState('');
  const [editing, setEditing] = useState(false);
  const [supplyKey, setSupplyKey] = useState('6M:full');
  const load = useCallback(async () => {
    try { const { data: d } = await api.get('/formulation-master', { skipCache: true }); setData(d); setBand((b) => b || d.bands[0]?.ageBand || ''); setError(''); }
    catch (err) { setError(err.response?.data?.message || 'Could not load the Formulation Master'); }
  }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (!notice) return undefined; const t = setTimeout(() => setNotice(''), 6000); return () => clearTimeout(t); }, [notice]);
  const current = useMemo(() => data?.bands.find((b) => b.ageBand === band) || null, [data, band]);
  const replaceBand = (next, message) => { setData((d) => ({ ...d, bands: d.bands.map((b) => (b.ageBand === next.ageBand ? next : b)) })); setEditing(false); setNotice(message); };
  const reset = async () => {
    if (!window.confirm(`Put the document values back for ${current.label}? The edited values stay in the history.`)) return;
    setError('');
    try { const { data: d } = await api.post(`/formulation-master/${current.ageBand}/reset`, {}); replaceBand(d.band, `${current.label}: document values restored as v${d.band.version}.`); }
    catch (err) { setError(err.response?.data?.message || 'Could not reset'); }
  };
  if (!data) return error ? <ErrorText>{error}</ErrorText> : <p className="p-6 text-center text-sm text-charcoal/55">Loading Formulation Master...</p>;
  const meta = { items: data.items, doses: data.doses, splitDays: data.splitDays, pendingKeys: data.pendingKeys };
  const sheet = current?.sheets?.[supplyKey];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-sage/15 text-sage"><FlaskConical size={22} /></span>
          <div>
            <h1 className="flex items-center gap-3 font-display text-xl font-bold text-charcoal sm:text-2xl"><PageTitleIcon size={20} aria-hidden="true" />Formulation Master</h1>
            <p className="text-sm text-charcoal/65">Autism / ADHD &amp; Child Development - six-month quantities, chit doses and packs per age group. Every new fulfilment sheet is built from the version saved here; the doctor can correct it any time.</p>
          </div>
        </div>
        <Link to="/admin/medicine-jobs" className="text-sm font-semibold text-sage hover:underline">Fulfilment queue</Link>
      </div>
      <ErrorText>{error}</ErrorText>
      {notice && <p className="flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800"><CheckCircle2 size={15} />{notice}</p>}
      <div className="flex flex-wrap gap-1.5">{data.bands.map((b) => <Chip key={b.ageBand} active={b.ageBand === band} onClick={() => { setBand(b.ageBand); setEditing(false); }}>{b.label}{b.source === 'edited' ? ` · v${b.version}` : ''}</Chip>)}</div>

      {current && (
        <section className="rounded-xl border border-cardline bg-white p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-bold text-charcoal">{current.label}</h2>
              {current.source === 'edited' ? <Badge tone="amber">v{current.version} · edited by {current.updatedByName} on {dateTime(current.updatedAt)}</Badge> : <Badge tone="teal">Document values{current.version ? ` · v${current.version}` : ''}</Badge>}
            </div>
            {data.canEdit && !editing && <div className="flex gap-2">
              <Button size="sm" onClick={() => setEditing(true)}><Pencil size={13} />Edit master</Button>
              {current.source === 'edited' && <Button size="sm" variant="outline" onClick={reset}><RotateCcw size={13} />Reset to document values</Button>}
            </div>}
          </div>
          {current.source === 'edited' && current.note && <p className="mb-3 text-sm text-charcoal/70"><b>Last change:</b> {current.note}</p>}
          {!data.canEdit && <p className="mb-3 flex items-center gap-2 text-xs text-charcoal/50"><AlertTriangle size={13} />Read-only: the doctor or admin edits the master.</p>}
          {editing ? <MasterForm key={`${current.ageBand}-${current.version}`} band={current} meta={meta} onSaved={replaceBand} onCancel={() => setEditing(false)} /> : (
            <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
              <div className="min-w-0 space-y-3">
                {/* Three short columns: fits a phone, so no min-width scroll wrapper. */}
                <div className="overflow-hidden rounded-lg border border-cardline">
                  <table className="w-full table-fixed text-sm">
                    <thead className="bg-offwhite-200 text-[11px] uppercase tracking-wide text-charcoal/55"><tr><th className="px-3 py-2 text-left">Item</th><th className="w-24 px-3 py-2 text-right sm:w-28">6 months</th><th className="w-24 px-3 py-2 text-right sm:w-28">Document</th></tr></thead>
                    <tbody>{data.items.map((i) => { const now = qtyText(current.quantities[i.key]); const doc = qtyText(current.defaults.quantities[i.key]); return <tr key={i.key} className={`border-t border-cardline ${now !== doc ? 'bg-amber-50/70' : ''}`}><td className="break-words px-3 py-1.5">{i.label}</td><td className="whitespace-nowrap px-3 py-1.5 text-right font-mono font-semibold">{now}</td><td className={`whitespace-nowrap px-3 py-1.5 text-right font-mono text-xs ${now !== doc ? 'text-amber-900 line-through' : 'text-charcoal/45'}`}>{doc}</td></tr>; })}</tbody>
                  </table>
                </div>
                <div className="rounded-lg border border-cardline p-3 text-sm">
                  <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-charcoal/50">Doses on the chits</p>
                  {data.doses.map((d) => current.doses[d.key] ? <p key={d.key} className={current.doses[d.key] !== current.defaults.doses[d.key] ? 'rounded bg-amber-50/70 px-1' : ''}><span className="text-charcoal/55">{d.label.split(' - ')[0]}:</span> {current.doses[d.key]}</p> : null)}
                  <p className="mt-2 text-[11px] font-bold uppercase tracking-wide text-charcoal/50">शिवा-लेह packs</p>
                  <p className="font-mono text-xs">{data.splitDays.map((d) => `${d} days: ${(current.shivaLehSplit[String(d)] || []).join(' + ')}`).join(' · ')}</p>
                  <p className="mt-2 text-[11px] font-bold uppercase tracking-wide text-charcoal/50">Tablet weight</p>
                  <p className="font-mono text-xs">{Object.entries(current.tabletGrams).map(([k, v]) => `${k.toUpperCase()} ${v} g`).join(' · ')}</p>
                  {data.pendingKeys.some((k) => current.pendingNotes[k]) && <><p className="mt-2 text-[11px] font-bold uppercase tracking-wide text-amber-800">Pending with the doctor</p>{data.pendingKeys.filter((k) => current.pendingNotes[k]).map((k) => <p key={k} className="text-xs text-amber-900">{current.pendingNotes[k]}</p>)}</>}
                </div>
                {current.history?.length > 0 && (
                  <div className="rounded-lg border border-cardline p-3">
                    <p className="mb-1 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-charcoal/50"><Clock3 size={12} />History</p>
                    <ol className="space-y-2">{current.history.map((h, i) => <li key={i} className="text-xs"><b className="text-charcoal">v{h.version + 1}</b> · {dateTime(h.at)} · {h.byName}: <span className="text-charcoal/80">{h.note}</span><ul className="ml-3 list-disc text-charcoal/60">{h.changes.map((c, j) => <li key={j}>{c}</li>)}</ul></li>)}</ol>
                  </div>
                )}
              </div>
              <div className="min-w-0">
                <p className="mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-charcoal/50"><BookOpen size={12} />Sheet a new job gets</p>
                <div className="mb-2 flex flex-wrap gap-1.5">{data.supplyOptions.map((o) => <Chip key={o.key} active={supplyKey === o.key} onClick={() => setSupplyKey(o.key)}>{o.label}</Chip>)}</div>
                {sheet ? <FormulationSheet f={sheet} patientName="(patient)" patientCode="-" /> : <p className="text-sm text-charcoal/55">No sheet for this supply.</p>}
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
