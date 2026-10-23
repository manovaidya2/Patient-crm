import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Boxes, History, Plus, Search } from 'lucide-react';
import api from '../../api/axios.js';
import Button from '../../components/ui/Button.jsx';
import Badge from '../../components/ui/Badge.jsx';
import Modal from '../../components/ui/Modal.jsx';
import Drawer from '../../components/ui/Drawer.jsx';
import { Chip, FieldLabel, poInput } from '../../components/purchaseOrders/CreatePurchaseOrderModal.jsx';
import { PageHeader, StatRow, StatTile } from '../../components/ui/Layout.jsx';

const UNITS = ['ml', 'g', 'tablet', 'spoon', 'drop', 'piece'];
const KINDS = [['medicine', 'Medicine'], ['component', 'Component'], ['packing', 'Packing material']];
const day = (v) => (v ? new Date(v).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '');
const dateTime = (v) => (v ? new Date(v).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '');
const num = (v) => (Number.isInteger(Number(v)) ? String(v) : String(Math.round(Number(v) * 1000) / 1000));
const ErrorText = ({ children }) => (children ? <p className="rounded-lg bg-[#8C3B2E]/8 px-3 py-2 text-sm text-[#8C3B2E]">{children}</p> : null);

function ItemModal({ open, onClose, onSaved, item }) {
  const blank = { code: '', name: '', nameHindi: '', kind: 'medicine', unit: 'g', openingStock: '', minLevel: '', batchNo: '', expiryDate: '', gramsPerSpoon: '', dropsPerMl: '', notes: '' };
  const [form, setForm] = useState(blank);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { if (open) { setError(''); setForm(item ? { ...blank, ...item, expiryDate: item.expiryDate ? item.expiryDate.slice(0, 10) : '', gramsPerSpoon: item.gramsPerSpoon ?? '', dropsPerMl: item.dropsPerMl ?? '' } : blank); } }, [open, item]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setError('');
    try { const { data } = item ? await api.patch(`/stocks/${item.id}`, form) : await api.post('/stocks', form); onSaved(data.item); }
    catch (err) { setError(err.response?.data?.message || 'Could not save'); } finally { setBusy(false); }
  };
  return (
    <Modal open={open} onClose={() => !busy && onClose()} title={item ? `Edit ${item.code}` : 'New stock item'} className="max-w-xl">
      <form onSubmit={submit} className="space-y-3">
        <ErrorText>{error}</ErrorText>
        <div className="grid gap-3 sm:grid-cols-2">
          <FieldLabel label="Code" required><input className={poInput} required disabled={Boolean(item)} value={form.code} onChange={(e) => set('code', e.target.value.toUpperCase())} placeholder="e.g. MEDHYA-GHRIT" /></FieldLabel>
          <FieldLabel label="Name" required><input className={poInput} required value={form.name} onChange={(e) => set('name', e.target.value)} /></FieldLabel>
          <FieldLabel label="Hindi name"><input className={poInput} value={form.nameHindi} onChange={(e) => set('nameHindi', e.target.value)} /></FieldLabel>
          <div><p className="mb-1 text-sm font-medium text-charcoal">Kind</p><div className="flex flex-wrap gap-1.5">{KINDS.map(([v, l]) => <Chip key={v} active={form.kind === v} onClick={() => set('kind', v)}>{l}</Chip>)}</div></div>
          <div><p className="mb-1 text-sm font-medium text-charcoal">Unit<span className="text-red-700"> *</span></p><div className="flex flex-wrap gap-1.5">{UNITS.map((u) => <Chip key={u} active={form.unit === u} onClick={() => !item && set('unit', u)}>{u}</Chip>)}</div></div>
          {!item && <FieldLabel label="Opening stock"><input className={poInput} inputMode="decimal" value={form.openingStock} onChange={(e) => set('openingStock', e.target.value)} /></FieldLabel>}
          <FieldLabel label="Minimum level (low-stock alert)"><input className={poInput} inputMode="decimal" value={form.minLevel} onChange={(e) => set('minLevel', e.target.value)} /></FieldLabel>
          <FieldLabel label="Batch no."><input className={poInput} value={form.batchNo} onChange={(e) => set('batchNo', e.target.value)} /></FieldLabel>
          <FieldLabel label="Expiry date"><input className={poInput} type="date" value={form.expiryDate} onChange={(e) => set('expiryDate', e.target.value)} /></FieldLabel>
          <FieldLabel label="Grams per spoon (if stocked in g, dosed in spoons)"><input className={poInput} inputMode="decimal" value={form.gramsPerSpoon} onChange={(e) => set('gramsPerSpoon', e.target.value)} /></FieldLabel>
          <FieldLabel label="Drops per ml (if stocked in ml, dosed in drops)"><input className={poInput} inputMode="decimal" value={form.dropsPerMl} onChange={(e) => set('dropsPerMl', e.target.value)} /></FieldLabel>
          <FieldLabel label="Notes" className="sm:col-span-2"><input className={poInput} value={form.notes} onChange={(e) => set('notes', e.target.value)} /></FieldLabel>
        </div>
        <div className="flex justify-end gap-2"><Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button><Button type="submit" disabled={busy}>{busy ? 'Saving...' : 'Save'}</Button></div>
      </form>
    </Modal>
  );
}

function MoveModal({ open, onClose, onSaved, item }) {
  const [form, setForm] = useState({ type: 'add', quantity: '', batchNo: '', expiryDate: '', note: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { if (open) { setForm({ type: 'add', quantity: '', batchNo: item?.batchNo || '', expiryDate: '', note: '' }); setError(''); } }, [open, item]);
  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setError('');
    try { const { data } = await api.post(`/stocks/${item.id}/transactions`, form); onSaved(data.item); }
    catch (err) { setError(err.response?.data?.message || 'Could not save'); } finally { setBusy(false); }
  };
  if (!item) return null;
  return (
    <Modal open={open} onClose={() => !busy && onClose()} title={`${item.name} · ${num(item.currentStock)} ${item.unit} in stock`} className="max-w-md">
      <form onSubmit={submit} className="space-y-3">
        <ErrorText>{error}</ErrorText>
        <div className="flex flex-wrap gap-1.5">{[['add', 'Stock received'], ['return', 'Returned from job'], ['adjust', 'Physical count correction']].map(([v, l]) => <Chip key={v} active={form.type === v} onClick={() => setForm((f) => ({ ...f, type: v }))}>{l}</Chip>)}</div>
        <FieldLabel label={form.type === 'adjust' ? `Counted stock (${item.unit})` : `Quantity (${item.unit})`} required><input className={poInput} required inputMode="decimal" value={form.quantity} onChange={(e) => setForm((f) => ({ ...f, quantity: e.target.value }))} /></FieldLabel>
        {form.type === 'add' && <div className="grid gap-3 sm:grid-cols-2"><FieldLabel label="Batch no."><input className={poInput} value={form.batchNo} onChange={(e) => setForm((f) => ({ ...f, batchNo: e.target.value }))} /></FieldLabel><FieldLabel label="Expiry date"><input className={poInput} type="date" value={form.expiryDate} onChange={(e) => setForm((f) => ({ ...f, expiryDate: e.target.value }))} /></FieldLabel></div>}
        <FieldLabel label="Note" required={form.type === 'adjust'}><input className={poInput} value={form.note} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} placeholder={form.type === 'adjust' ? 'Why the count differs' : 'Supplier / invoice'} /></FieldLabel>
        <div className="flex justify-end gap-2"><Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button><Button type="submit" disabled={busy}>{busy ? 'Saving...' : 'Save'}</Button></div>
      </form>
    </Modal>
  );
}

export default function Stocks() {
  const [items, setItems] = useState(null);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState('');
  const [editing, setEditing] = useState(null);
  const [itemOpen, setItemOpen] = useState(false);
  const [moving, setMoving] = useState(null);
  const [ledgerOf, setLedgerOf] = useState(null);
  const [ledger, setLedger] = useState([]);
  const load = useCallback(async () => {
    try { const { data } = await api.get('/stocks', { skipCache: true }); setItems(data.items); setError(''); }
    catch (err) { setError(err.response?.data?.message || 'Could not load stocks'); }
  }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!ledgerOf) return;
    api.get('/stocks/ledger', { params: ledgerOf === 'all' ? { limit: 200 } : { item: ledgerOf.id }, skipCache: true }).then(({ data }) => setLedger(data.rows)).catch(() => setLedger([]));
  }, [ledgerOf]);
  const upsert = (item) => { setItems((old) => { const i = (old || []).findIndex((x) => x.id === item.id); if (i < 0) return [...(old || []), item]; const next = [...old]; next[i] = item; return next; }); setItemOpen(false); setMoving(null); setEditing(null); };
  const q = query.trim().toLowerCase();
  const rows = (items || []).filter((i) => (!kind || i.kind === kind) && (!q || [i.code, i.name, i.nameHindi].some((v) => String(v || '').toLowerCase().includes(q))));
  const low = (items || []).filter((i) => i.low).length;
  const expired = (items || []).filter((i) => i.expired).length;
  const kindCount = (k) => (items || []).filter((i) => i.kind === k).length;

  return (
    <div className="space-y-4">
      <PageHeader icon={Boxes} title="Stocks" subtitle="Medicines, components and packing material the Medicine Department draws from. Preparation of a medicine job reduces these automatically."
        actions={<><Button variant="outline" onClick={() => setLedgerOf('all')}><History size={15} />Ledger</Button><Button onClick={() => { setEditing(null); setItemOpen(true); }}><Plus size={15} />New item</Button></>} />
      <StatRow min={140}>
        <StatTile label="All items" value={items === null ? '...' : items.length} onClick={() => setKind('')} active={!kind} />
        {KINDS.map(([v, l]) => <StatTile key={v} label={l} value={items === null ? '...' : kindCount(v)} onClick={() => setKind(v)} active={kind === v} />)}
        <StatTile label="Low stock" value={items === null ? '...' : low} hint="At or below minimum" tone={low ? 'orange' : 'plain'} />
        <StatTile label="Expired" value={items === null ? '...' : expired} hint="Past expiry date" tone={expired ? 'red' : 'plain'} />
      </StatRow>
      {low > 0 && <p className="flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900"><AlertTriangle size={15} />{low} item(s) at or below the minimum level.</p>}
      <ErrorText>{error}</ErrorText>
      <div className="flex flex-wrap gap-2">
        <div className="relative min-w-0 flex-1 sm:max-w-xs"><Search size={16} className="absolute left-3 top-2.5 text-charcoal/45" /><input className={`${poInput} !pl-9`} placeholder="Code or name" value={query} onChange={(e) => setQuery(e.target.value)} /></div>
        <div className="flex gap-1.5"><Chip active={!kind} onClick={() => setKind('')}>All</Chip>{KINDS.map(([v, l]) => <Chip key={v} active={kind === v} onClick={() => setKind(v)}>{l}</Chip>)}</div>
      </div>
      <div className="overflow-x-auto rounded-[14px] border border-[#E8DFCB] bg-white">
        <table className="w-full text-sm"><thead className="bg-[#FBF7ED] text-[10.5px] font-bold uppercase tracking-wide text-charcoal/60"><tr><th className="px-3 py-2 text-left">Item</th><th className="px-3 py-2 text-left">Kind</th><th className="px-3 py-2 text-right">In stock</th><th className="px-3 py-2 text-right">Min</th><th className="px-3 py-2 text-left">Batch / expiry</th><th className="px-3 py-2 text-left">Conversion</th><th className="px-3 py-2" /></tr></thead>
          <tbody>
            {items === null ? <tr><td colSpan={7} className="p-6 text-center text-charcoal/55">Loading...</td></tr>
              : !rows.length ? <tr><td colSpan={7} className="p-6 text-center text-charcoal/55">No stock items.</td></tr>
                : rows.map((i) => (
                  <tr key={i.id} className={`border-t border-[#F0E8D8] ${i.low ? 'bg-[#FFF7ED]' : ''}`}>
                    <td className="px-3 py-2"><b className="font-mono">{i.code}</b><div className="text-xs text-charcoal/60">{i.name}{i.nameHindi ? ` · ${i.nameHindi}` : ''}</div></td>
                    <td className="px-3 py-2 text-xs capitalize">{i.kind}</td>
                    <td className="px-3 py-2 text-right"><span className="font-mono font-bold">{num(i.currentStock)} {i.unit}</span>{i.low && <div className="text-[10px] font-bold text-[#C2410C]">LOW</div>}<div className="ml-auto mt-1 h-1.5 w-24 overflow-hidden rounded-full bg-[#EFE3CF]" title="Stock against twice the minimum level"><div className={`h-full rounded-full ${i.low ? 'bg-[#F97316]' : 'bg-[#2F8F5B]'}`} style={{ width: `${Math.max(4, Math.min(100, Number(i.minLevel) > 0 ? (Number(i.currentStock) / (Number(i.minLevel) * 2)) * 100 : 100))}%` }} /></div></td>
                    <td className="px-3 py-2 text-right font-mono text-charcoal/60">{num(i.minLevel)}</td>
                    <td className="px-3 py-2 text-xs">{i.batchNo || '-'}{i.expiryDate ? <div className={i.expired ? 'font-semibold text-[#8C3B2E]' : ''}>{day(i.expiryDate)}{i.expired ? ' (expired)' : ''}</div> : null}</td>
                    <td className="px-3 py-2 text-xs text-charcoal/60">{i.gramsPerSpoon ? `${i.gramsPerSpoon} g/spoon` : ''}{i.dropsPerMl ? `${i.dropsPerMl} drops/ml` : ''}{!i.gramsPerSpoon && !i.dropsPerMl && (i.unit === 'g' || i.unit === 'ml') && ['SHIVA-LEH', 'BUDDHI-GHRIT'].includes(i.code) ? <span className="text-amber-800">pending</span> : ''}</td>
                    <td className="px-3 py-2"><div className="flex justify-end gap-1"><Button size="sm" onClick={() => setMoving(i)}><Plus size={13} />Stock</Button><Button size="sm" variant="outline" onClick={() => { setEditing(i); setItemOpen(true); }}>Edit</Button><Button size="sm" variant="ghost" onClick={() => setLedgerOf(i)}><History size={13} /></Button></div></td>
                  </tr>
                ))}
          </tbody></table>
      </div>
      <ItemModal open={itemOpen} item={editing} onClose={() => setItemOpen(false)} onSaved={upsert} />
      <MoveModal open={Boolean(moving)} item={moving} onClose={() => setMoving(null)} onSaved={upsert} />
      <Drawer open={Boolean(ledgerOf)} onClose={() => setLedgerOf(null)} title={ledgerOf === 'all' ? 'Stock ledger' : `Ledger · ${ledgerOf?.code || ''}`}>
        {!ledger.length ? <p className="py-6 text-center text-sm text-charcoal/55">No movements yet.</p> : (
          <ul className="divide-y divide-cardline">{ledger.map((t) => <li key={t.id} className="py-2 text-sm"><div className="flex items-center justify-between gap-2"><span><b className="font-mono">{t.code}</b> <Badge tone={t.type === 'consume' ? 'amber' : t.type === 'add' ? 'teal' : 'inactive'}>{t.type}</Badge></span><span className={`font-mono font-bold ${t.delta < 0 ? 'text-[#8C3B2E]' : 'text-emerald-700'}`}>{t.delta > 0 ? '+' : ''}{num(t.delta)}</span></div><p className="text-xs text-charcoal/55">{num(t.before)} → {num(t.after)} · {dateTime(t.at)} · {t.byName}{t.ref ? ` · ${t.ref}` : ''}{t.note ? ` · ${t.note}` : ''}</p></li>)}</ul>
        )}
      </Drawer>
    </div>
  );
}
