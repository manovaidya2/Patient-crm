import { useState } from 'react';
import { Check, FileText, Pencil, RotateCcw, Trash2, Wallet } from 'lucide-react';
import api from '../../api/axios.js';
import Button from '../ui/Button.jsx';
import VoucherSlip from './VoucherSlip.jsx';
import { MODES, PAID_FROM, REPAY, VOUCHER, dayLabel, fileHref, istToday, rs, stamp } from './expenseShared.js';

// One entry opened from the list: everything that was filled, the bills, the voucher, the money (owed / repaid /
// supplier), its history, and the buttons the signed-in person may use.
const field = 'w-full min-w-0 rounded-lg border border-cardline bg-white px-3 py-2 text-sm text-charcoal';
const Row = ({ k, children }) => <div className="contents"><dt className="text-charcoal/55">{k}</dt><dd className="min-w-0 break-words font-semibold text-charcoal">{children}</dd></div>;

export default function ExpenseDetail({ expense: e, onChanged, onEdit }) {
  const [panel, setPanel] = useState(null); // 'reject' | 'settle' | 'notNeeded' | 'delete' | 'payTo'
  const [form, setForm] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const act = async (path, body = {}, method = 'post') => {
    setBusy(true); setError('');
    try { const { data } = await api[method](`/expenses/${e.id}${path}`, body); setPanel(null); onChanged(data.expense || null); }
    catch (err) { setError(err.response?.data?.message || 'Could not save'); }
    finally { setBusy(false); }
  };
  const open = (p, initial = {}) => { setPanel(p); setForm(initial); setError(''); };
  const set = (k) => (ev) => setForm((f) => ({ ...f, [k]: ev.target.value }));
  const [repayLabel, repayTone] = REPAY[e.repayStatus];
  const supplier = e.repayStatus === 'supplier_due';

  return (
    <div className="space-y-4 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${e.kind === 'medicine' ? 'bg-[#FBF0DC] text-[#7C5B2E]' : 'bg-[#E9EFE9] text-sage'}`}>{e.kindLabel}</span>
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${repayTone}`}>{repayLabel}</span>
        {e.voucher && <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${VOUCHER[e.voucher.status][1]}`}>{e.voucher.number} · {VOUCHER[e.voucher.status][0]}</span>}
      </div>
      <div><p className="font-display text-2xl font-extrabold">{rs(e.amount)}</p><p className="text-charcoal/70">{e.purpose}</p></div>

      <dl className="grid grid-cols-[120px_minmax(0,1fr)] gap-x-3 gap-y-1.5">
        <Row k="Date">{dayLabel(e.date)}</Row>
        {e.vendor && <Row k={e.kind === 'medicine' ? 'Supplier' : 'Shop / vendor'}>{e.vendor}</Row>}
        {e.invoiceNo && <Row k="Bill number">{e.invoiceNo}</Row>}
        <Row k="Who paid">{e.paidByName}</Row>
        <Row k="Money from">{PAID_FROM[e.paidFrom]}{e.paymentMode ? ` · ${MODES[e.paymentMode]}` : ''}</Row>
        {e.notes && <Row k="Note">{e.notes}</Row>}
        <Row k="Written by">{e.createdByName} · {stamp(e.createdAt)}{e.editedAt ? ` (edited by ${e.editedByName})` : ''}</Row>
      </dl>

      {e.items.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-cardline">
          <table className="w-full text-left text-xs"><thead className="bg-[#FBF7ED] text-charcoal/60"><tr><th className="px-2 py-1.5">Item</th><th className="px-2 py-1.5 text-right">Qty</th><th className="px-2 py-1.5 text-right">Rate</th><th className="px-2 py-1.5 text-right">Amount</th></tr></thead>
            <tbody>{e.items.map((i, n) => <tr key={n} className="border-t border-cardline"><td className="px-2 py-1.5">{i.name}</td><td className="px-2 py-1.5 text-right tabular-nums">{i.qty} {i.unit}</td><td className="px-2 py-1.5 text-right tabular-nums">{rs(i.rate)}</td><td className="px-2 py-1.5 text-right font-bold tabular-nums">{rs(i.amount)}</td></tr>)}
              {e.extraCharges > 0 && <tr className="border-t border-cardline"><td className="px-2 py-1.5" colSpan={3}>Other charges</td><td className="px-2 py-1.5 text-right font-bold tabular-nums">{rs(e.extraCharges)}</td></tr>}</tbody></table>
        </div>
      )}

      <div><p className="mb-1 text-xs font-bold uppercase tracking-wide text-charcoal/55">Bills</p>
        {e.bills.length ? <div className="flex flex-wrap gap-2">{e.bills.map((b) => <a key={b.url} href={fileHref(b.url)} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-lg border border-cardline bg-white">{/\.(png|jpe?g|webp|gif)$/i.test(b.url) ? <img src={fileHref(b.url)} alt={b.fileName} className="h-20 w-20 object-cover" /> : <span className="flex h-20 w-20 flex-col items-center justify-center gap-1 text-[11px] text-sage"><FileText size={18} />PDF</span>}</a>)}</div> : <p className="text-charcoal/50">No bill attached.</p>}
      </div>

      {e.voucher?.status === 'rejected' && <p className="rounded-lg bg-[#FDE2E1] px-3 py-2 text-[#9F1D1D]"><b>Sent back</b> by {e.voucher.rejectedByName}: {e.voucher.rejectReason}. Correct the entry and make the voucher again.</p>}
      {e.voucher && e.voucher.status !== 'rejected' && <VoucherSlip expense={e} />}
      {e.settlement && <p className={`rounded-lg px-3 py-2 ${e.repayStatus === 'not_needed' ? 'bg-[#F3EEE2]' : 'bg-[#E6F2EA] text-[#1F6B41]'}`}>{e.repayStatus === 'not_needed' ? <>No repayment needed: {e.settlement.reason} ({e.settlement.byName})</> : <><b>{e.repayStatus === 'supplier_paid' ? 'Supplier paid' : 'Repaid'}</b> {rs(e.amount)} to {e.settlement.toName} on {dayLabel(e.settlement.date)} · {MODES[e.settlement.mode]}{e.settlement.reference ? ` · ${e.settlement.reference}` : ''} · by {e.settlement.byName}</>}</p>}

      {/* What this person can do now */}
      <div className="flex flex-wrap gap-2">
        {(e.can.voucher || e.can.remakeVoucher) && <Button size="sm" onClick={() => open('payTo', { payTo: e.voucher?.payTo || (e.paidFrom === 'own' ? e.paidByName : e.vendor || e.paidByName) })}><FileText size={14} />{e.can.remakeVoucher ? 'Make voucher again' : 'Make voucher'}</Button>}
        {e.can.approve && <Button size="sm" onClick={() => act('/voucher/approve')} disabled={busy}><Check size={14} />Approve voucher</Button>}
        {e.can.approve && <Button size="sm" variant="outline" onClick={() => open('reject')}><RotateCcw size={14} />Send back</Button>}
        {e.can.settle && <Button size="sm" onClick={() => open('settle', { date: istToday(), mode: 'cash', reference: '', toName: supplier ? e.vendor : e.paidByName })}><Wallet size={14} />{supplier ? 'Mark supplier paid' : 'Mark repaid'}</Button>}
        {!e.can.settle && e.repayStatus === 'to_repay' && e.voucher?.status !== 'approved' && e.can.notNeeded && <span className="self-center text-xs text-charcoal/55">Approve the voucher to repay {e.paidByName}.</span>}
        {e.can.notNeeded && <Button size="sm" variant="outline" onClick={() => open('notNeeded', { reason: '' })}>No repay needed</Button>}
        {e.can.edit && <Button size="sm" variant="outline" onClick={onEdit}><Pencil size={14} />Edit</Button>}
        {e.can.remove && <Button size="sm" variant="outline" onClick={() => open('delete')} className="!text-[#8C3B2E]"><Trash2 size={14} />Delete</Button>}
      </div>

      {panel && (
        <div className="space-y-2 rounded-xl border border-cardline bg-[#FBF7ED] p-3">
          {panel === 'payTo' && <><label className="block font-medium">Pay to (name on the voucher)<input className={`${field} mt-1`} maxLength={120} value={form.payTo} onChange={set('payTo')} /></label><div className="flex justify-end gap-2"><Button size="sm" variant="outline" onClick={() => setPanel(null)}>Cancel</Button><Button size="sm" disabled={busy} onClick={() => act('/voucher', { payTo: form.payTo })}>Make voucher</Button></div></>}
          {panel === 'reject' && <><label className="block font-medium">Why is it sent back? *<textarea className={`${field} mt-1`} rows={2} maxLength={500} value={form.reason || ''} onChange={set('reason')} placeholder="e.g. Bill photo not clear" /></label><div className="flex justify-end gap-2"><Button size="sm" variant="outline" onClick={() => setPanel(null)}>Cancel</Button><Button size="sm" disabled={busy || !String(form.reason || '').trim()} onClick={() => act('/voucher/reject', { reason: form.reason })}>Send back</Button></div></>}
          {panel === 'settle' && <>
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="block font-medium">{supplier ? 'Supplier' : 'Repaid to'}<input className={`${field} mt-1`} maxLength={120} value={form.toName} onChange={set('toName')} /></label>
              <label className="block font-medium">Date<input className={`${field} mt-1`} type="date" max={istToday()} value={form.date} onChange={set('date')} /></label>
              <label className="block font-medium">Mode<select className={`${field} mt-1`} value={form.mode} onChange={set('mode')}>{Object.entries(MODES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
              <label className="block font-medium">Reference / UTR<input className={`${field} mt-1`} maxLength={120} value={form.reference} onChange={set('reference')} /></label>
            </div>
            <div className="flex justify-end gap-2"><Button size="sm" variant="outline" onClick={() => setPanel(null)}>Cancel</Button><Button size="sm" disabled={busy} onClick={() => act('/settle', form)}><Wallet size={14} />Paid {rs(e.amount)}</Button></div></>}
          {panel === 'notNeeded' && <><label className="block font-medium">Why is no repayment needed? *<input className={`${field} mt-1`} maxLength={300} value={form.reason} onChange={set('reason')} placeholder="e.g. Paid from the clinic cash box" /></label><div className="flex justify-end gap-2"><Button size="sm" variant="outline" onClick={() => setPanel(null)}>Cancel</Button><Button size="sm" disabled={busy || !String(form.reason || '').trim()} onClick={() => act('/not-needed', { reason: form.reason })}>Save</Button></div></>}
          {panel === 'delete' && <><p>Delete this entry of {rs(e.amount)}? It is hidden from every list (kept for the record).</p><div className="flex justify-end gap-2"><Button size="sm" variant="outline" onClick={() => setPanel(null)}>Cancel</Button><Button size="sm" variant="danger" disabled={busy} onClick={() => act('', {}, 'delete')}>Delete</Button></div></>}
        </div>
      )}
      {error && <p role="alert" className="rounded bg-red-50 px-3 py-2 text-red-700">{error}</p>}

      <div><p className="mb-1 text-xs font-bold uppercase tracking-wide text-charcoal/55">History</p>
        <ol className="space-y-1.5 border-l-2 border-cardline pl-3">{e.history.map((h, i) => <li key={i}><p className="font-semibold">{h.action}{h.details ? <span className="font-normal text-charcoal/70"> · {h.details}</span> : null}</p><p className="text-xs text-charcoal/50">{h.byName} · {stamp(h.at)}</p></li>)}</ol>
      </div>
    </div>
  );
}
