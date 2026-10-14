import { useMemo, useState } from 'react';
import { Copy } from 'lucide-react';
import api from '../../api/axios.js';
import Button from '../ui/Button.jsx';
import { PriorityTags, StatusBadge } from './parts.jsx';
import { STATUS, fmtDate, inputClass, qty } from './helpers.js';

// Everything below its reorder level (or close to expiry), emergency medicines first, with how much to order.
export default function ReorderView({ items, onOpen, onChanged, onError }) {
  const [text, setText] = useState('');
  const rows = useMemo(() => items.filter((i) => i.suggestedOrder > 0 || i.reorderDue || i.critical || i.expiring)
    .sort((a, b) => Number(b.emergency) - Number(a.emergency) || (STATUS[a.status]?.order ?? 9) - (STATUS[b.status]?.order ?? 9) || (a.daysToLast ?? 9e9) - (b.daysToLast ?? 9e9)), [items]);
  const toOrder = rows.filter((i) => i.suggestedOrder > 0);

  const raise = async (item) => {
    try { await api.post(`/medicine/inventory/${item.id}/purchase-request`); onChanged(`${item.name}: purchase request ban gayi`); }
    catch (err) { onError(err.response?.data?.message || 'Purchase request nahi bani'); }
  };
  const copy = async () => {
    const list = `Manovaidya purchase list · ${new Date().toLocaleDateString('en-IN')}\n${toOrder.map((i, n) => `${n + 1}. ${i.name}${i.code ? ` (${i.code})` : ''} — order ${qty(i.suggestedOrder, i.unit)}${i.emergency ? ' [EMERGENCY]' : ''}`).join('\n')}`;
    setText(list);
    try { await navigator.clipboard.writeText(list); onChanged('Purchase list copy ho gayi'); } catch { /* the text box below is the fallback */ }
  };

  return (
    <div className="space-y-3 rounded-xl border border-cardline bg-white p-3 sm:p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div><h3 className="text-base font-bold text-charcoal">Reorder / Purchase list</h3><p className="text-xs text-charcoal/55">Suggested order = Max level − abhi ka stock. Emergency dawaiyaan sabse upar. Expiry ≤ 90 din wali dawaiyaan bhi yahin.</p></div>
        <Button variant="outline" size="sm" disabled={!toOrder.length} onClick={copy}><Copy size={14} />List copy karein</Button>
      </div>
      <div className="overflow-x-auto rounded-lg border border-cardline">
        <table className="w-full min-w-[960px] text-left text-sm">
          <thead className="bg-offwhite-200 text-xs uppercase tracking-wide text-charcoal/55"><tr>{['Priority', 'दवा', 'Category', 'Abhi stock', 'Min / Reorder / Max', 'दिन चलेगा', 'Suggested order', 'Status', 'Action'].map((h) => <th key={h} className="px-2.5 py-3 font-semibold">{h}</th>)}</tr></thead>
          <tbody>
            {!rows.length ? <tr><td colSpan={9} className="p-10 text-center text-charcoal/55">Koi dawa reorder level par nahi.</td></tr> : rows.map((item) => (
              <tr key={item.id} className="border-t border-cardline align-top">
                <td className="px-2.5 py-3">{item.emergency || item.fastMoving ? <PriorityTags item={item} /> : <span className="text-xs text-charcoal/50">Normal</span>}</td>
                <td className="min-w-[190px] px-2.5 py-3"><button type="button" onClick={() => onOpen(item)} className="text-left font-semibold hover:text-sage hover:underline">{item.name}</button><p className="text-xs text-charcoal/55">{[item.nameHindi, item.supplier].filter(Boolean).join(' · ')}</p></td>
                <td className="px-2.5 py-3 text-xs">{item.category || '-'}</td>
                <td className="whitespace-nowrap px-2.5 py-3 text-right font-semibold">{qty(item.currentStock, item.unit)}</td>
                <td className="whitespace-nowrap px-2.5 py-3 text-right text-xs">{[item.lowStockAt, item.reorderLevel, item.maxLevel].map((v) => Number(v).toLocaleString('en-IN')).join(' / ')}</td>
                <td className="whitespace-nowrap px-2.5 py-3 text-right">{item.daysToLast != null ? <>{item.daysToLast}<p className="text-[11px] text-charcoal/50">{fmtDate(item.lastsUntil)} tak</p></> : '-'}</td>
                <td className="whitespace-nowrap px-2.5 py-3 text-right font-bold">{item.suggestedOrder > 0 ? qty(item.suggestedOrder, item.unit) : '-'}</td>
                <td className="px-2.5 py-3"><StatusBadge item={item} /></td>
                <td className="px-2.5 py-3">
                  {item.suggestedOrder > 0 ? (item.purchaseRequest
                    ? <span className="rounded-full bg-sky-100 px-2.5 py-1 text-xs font-semibold text-sky-800" title={`${item.purchaseRequest.raisedByName} · ${fmtDate(item.purchaseRequest.raisedAt)}`}>PR raised</span>
                    : <Button size="sm" variant="outline" className="!px-2.5 !py-1" onClick={() => raise(item)}>Purchase request</Button>)
                    : <span className="text-xs text-charcoal/50">Pehle use karein</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {text && <textarea className={inputClass} rows={Math.min(10, toOrder.length + 2)} readOnly value={text} onFocus={(e) => e.target.select()} aria-label="Purchase list text" />}
    </div>
  );
}
