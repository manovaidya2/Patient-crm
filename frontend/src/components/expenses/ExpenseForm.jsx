import { useMemo, useState } from 'react';
import { Plus, Save, X } from 'lucide-react';
import api from '../../api/axios.js';
import Button from '../ui/Button.jsx';
import ProofPicker from '../ui/ProofPicker.jsx';
import { PAID_FROM, MODES, fileHref, inWords, istToday, rs } from './expenseShared.js';

// Add / edit one entry. Clinic expense: what it was for, amount, who paid (typed), shop. Medicine purchase: supplier,
// bill number, items (name typed, quantity, unit, rate) and other charges; the total adds up by itself. Both: where
// the money came from (own money is owed back), mode, bill photos (camera or files), note. "Save and make voucher"
// also makes the payment voucher at once.
const field = 'w-full min-w-0 rounded-lg border border-cardline bg-white px-3 py-2 text-sm text-charcoal focus:border-sage focus:outline-none focus:ring-2 focus:ring-sage/20';
const Label = ({ title, children, className = '', hint }) => <label className={`block min-w-0 text-sm font-medium text-charcoal ${className}`}>{title}{children}{hint && <span className="mt-0.5 block text-xs font-normal text-charcoal/55">{hint}</span>}</label>;
const emptyItem = () => ({ name: '', qty: '', unit: '', rate: '' });

export default function ExpenseForm({ kind, expense = null, suggestions = {}, onSaved, onCancel }) {
  const medicine = kind === 'medicine';
  const [form, setForm] = useState(() => ({
    date: expense?.date || istToday(), purpose: expense?.purpose || '', amount: expense && !medicine ? String(expense.amount) : '',
    vendor: expense?.vendor || '', invoiceNo: expense?.invoiceNo || '', paidByName: expense?.paidByName || '',
    paidFrom: expense?.paidFrom || 'own', paymentMode: expense?.paymentMode || 'cash', extraCharges: expense?.extraCharges ? String(expense.extraCharges) : '', notes: expense?.notes || '',
  }));
  const [items, setItems] = useState(() => (expense?.items?.length ? expense.items.map((i) => ({ name: i.name, qty: String(i.qty), unit: i.unit || '', rate: String(i.rate) })) : [emptyItem(), emptyItem()]));
  const [keep, setKeep] = useState(() => expense?.bills || []);
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const setItem = (i, k) => (e) => setItems((list) => list.map((it, n) => (n === i ? { ...it, [k]: e.target.value } : it)));
  const total = useMemo(() => (medicine
    ? items.reduce((s, i) => s + (Number(i.qty) || 0) * (Number(i.rate) || 0), 0) + (Number(form.extraCharges) || 0)
    : Number(form.amount) || 0), [medicine, items, form.amount, form.extraCharges]);

  const submit = async (makeVoucher) => {
    setBusy(true); setError('');
    try {
      const body = new FormData();
      Object.entries({ ...form, kind }).forEach(([k, v]) => body.append(k, v));
      if (medicine) body.append('items', JSON.stringify(items.filter((i) => i.name || i.qty || i.rate)));
      if (expense) body.append('keepBills', JSON.stringify(keep.map((b) => b.url)));
      if (makeVoucher) body.append('makeVoucher', 'true');
      files.forEach((f) => body.append('bills', f));
      const { data } = expense ? await api.patch(`/expenses/${expense.id}`, body) : await api.post('/expenses', body);
      onSaved(data.expense, makeVoucher);
    } catch (err) { setError(err.response?.data?.message || 'Could not save'); }
    finally { setBusy(false); }
  };

  return (
    <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); submit(false); }}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Label title="Date *"><input className={`${field} mt-1`} type="date" required max={istToday()} value={form.date} onChange={set('date')} /></Label>
        {medicine
          ? <Label title="Supplier *"><input className={`${field} mt-1`} required list="exp-vendors" maxLength={150} value={form.vendor} onChange={set('vendor')} placeholder="e.g. Gupta Herbals" /></Label>
          : <Label title="Amount (Rs) *"><input className={`${field} mt-1`} type="number" min="0.01" step="0.01" required value={form.amount} onChange={set('amount')} /></Label>}
        <Label title="What was it for *" className="sm:col-span-2"><input className={`${field} mt-1`} required maxLength={300} value={form.purpose} onChange={set('purpose')} placeholder={medicine ? 'e.g. Herbs for November batch' : 'e.g. Tea and biscuits for waiting families'} /></Label>
        {!medicine && <Label title="Shop / person paid"><input className={`${field} mt-1`} list="exp-vendors" maxLength={150} value={form.vendor} onChange={set('vendor')} placeholder="e.g. Sharma Tea Stall" /></Label>}
        <Label title="Bill / invoice number"><input className={`${field} mt-1`} maxLength={60} value={form.invoiceNo} onChange={set('invoiceNo')} /></Label>
      </div>

      {medicine && (
        <div className="space-y-2 rounded-xl border border-cardline bg-[#FBF7ED] p-3">
          <p className="text-sm font-bold text-charcoal">Items bought</p>
          <div className="hidden grid-cols-[minmax(0,2fr)_80px_70px_90px_96px_28px] gap-2 text-xs font-semibold text-charcoal/55 sm:grid"><span>Medicine / material</span><span>Qty</span><span>Unit</span><span>Rate (Rs)</span><span className="text-right">Amount</span><span /></div>
          {items.map((it, i) => (
            <div key={i} className="grid grid-cols-2 gap-2 sm:grid-cols-[minmax(0,2fr)_80px_70px_90px_96px_28px] sm:items-center">
              <input className={`${field} col-span-2 sm:col-span-1`} list="exp-items" maxLength={150} placeholder="e.g. Brahmi powder" value={it.name} onChange={setItem(i, 'name')} aria-label={`Item ${i + 1} name`} />
              <input className={field} type="number" min="0" step="0.01" placeholder="Qty" value={it.qty} onChange={setItem(i, 'qty')} aria-label={`Item ${i + 1} quantity`} />
              <input className={field} maxLength={20} placeholder="kg / pcs" value={it.unit} onChange={setItem(i, 'unit')} aria-label={`Item ${i + 1} unit`} />
              <input className={field} type="number" min="0" step="0.01" placeholder="Rate" value={it.rate} onChange={setItem(i, 'rate')} aria-label={`Item ${i + 1} rate`} />
              <span className="text-right text-sm font-bold tabular-nums">{(Number(it.qty) || 0) * (Number(it.rate) || 0) ? rs((Number(it.qty) || 0) * (Number(it.rate) || 0)) : '-'}</span>
              <button type="button" aria-label="Remove item" onClick={() => setItems((l) => (l.length > 1 ? l.filter((_, n) => n !== i) : [emptyItem()]))} className="justify-self-end rounded p-1 text-charcoal/50 hover:bg-white"><X size={15} /></button>
            </div>
          ))}
          <div className="flex flex-wrap items-end justify-between gap-2">
            <Button type="button" size="sm" variant="outline" onClick={() => setItems((l) => [...l, emptyItem()])}><Plus size={13} />Add item</Button>
            <Label title="Other charges (freight etc.)" className="w-44"><input className={`${field} mt-1`} type="number" min="0" step="0.01" value={form.extraCharges} onChange={set('extraCharges')} /></Label>
          </div>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <Label title="Who paid *" hint="Type the name of the person whose money it was."><input className={`${field} mt-1`} required list="exp-people" maxLength={120} value={form.paidByName} onChange={set('paidByName')} placeholder="e.g. Prachi" /></Label>
        <Label title="Mode"><select className={`${field} mt-1`} value={form.paymentMode} onChange={set('paymentMode')}>{Object.entries(MODES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Label>
      </div>
      <div>
        <p className="text-sm font-medium text-charcoal">Money came from *</p>
        <div className="mt-1 flex flex-wrap gap-2">
          {Object.entries(PAID_FROM).filter(([k]) => medicine || k !== 'credit').map(([k, v]) => (
            <label key={k} className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm ${form.paidFrom === k ? 'border-sage bg-sage/10 font-semibold' : 'border-cardline bg-white'}`}>
              <input type="radio" name="paidFrom" value={k} checked={form.paidFrom === k} onChange={set('paidFrom')} className="accent-[#5B7B65]" />{v}
            </label>
          ))}
        </div>
        <p className="mt-1 text-xs text-charcoal/55">{form.paidFrom === 'own' ? `${form.paidByName || 'This person'} will be in the "To repay" list until Admin / Doctor marks it repaid.` : form.paidFrom === 'credit' ? 'Shows as "Supplier due" until the supplier is paid.' : 'Clinic money: nobody has to be repaid.'}</p>
      </div>

      <ProofPicker label="Bill photo / PDF" files={files} setFiles={setFiles} />
      {keep.length > 0 && <ul className="flex flex-wrap gap-2 text-xs">{keep.map((b) => <li key={b.url} className="inline-flex items-center gap-1 rounded-full bg-[#F3EEE2] px-2 py-1"><a href={fileHref(b.url)} target="_blank" rel="noreferrer" className="font-semibold text-sage">{b.fileName || 'Bill'}</a><button type="button" aria-label="Remove bill" onClick={() => setKeep((l) => l.filter((x) => x.url !== b.url))}><X size={12} /></button></li>)}</ul>}
      <Label title="Note"><textarea className={`${field} mt-1`} rows={2} maxLength={1000} value={form.notes} onChange={set('notes')} /></Label>

      <div className="rounded-lg bg-sage/10 px-3 py-2 text-sm"><b className="font-display text-base">{rs(total)}</b>{total > 0 && <span className="ml-2 text-charcoal/65">Rupees {inWords(total)} only</span>}</div>
      {error && <p role="alert" className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="outline" disabled={busy} onClick={onCancel}>Cancel</Button>
        {!expense && <Button type="button" variant="outline" disabled={busy} onClick={() => submit(true)}>Save and make voucher</Button>}
        <Button type="submit" disabled={busy}><Save size={15} />{busy ? 'Saving...' : expense ? 'Save changes' : 'Save'}</Button>
      </div>
      <datalist id="exp-people">{(suggestions.people || []).map((p) => <option key={p} value={p} />)}</datalist>
      <datalist id="exp-vendors">{(suggestions.vendors || []).map((p) => <option key={p} value={p} />)}</datalist>
      <datalist id="exp-items">{(suggestions.items || []).map((p) => <option key={p} value={p} />)}</datalist>
    </form>
  );
}
