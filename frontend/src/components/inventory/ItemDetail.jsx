import { useEffect, useState } from 'react';
import api from '../../api/axios.js';
import Button from '../ui/Button.jsx';
import { Gauge, PackChips, PriorityTags, StatusBadge } from './parts.jsx';
import { TYPE, categoryLabel, fmtDate, fmtDateTime, inventoryText, packLabel, qty, unitText } from './helpers.js';

const Row = ({ label, value }) => (value === '' || value == null ? null : <div className="flex justify-between gap-3 py-1 text-sm"><dt className="text-charcoal/55">{label}</dt><dd className="min-w-0 break-words text-right font-medium text-charcoal">{value}</dd></div>);

// Everything about one medicine: levels, packs, recipe, where it is used, and its recent ledger rows.
export default function ItemDetail({ item, items, onAction, onEdit, onDelete, canEdit = true }) {
  const [history, setHistory] = useState(item.transactions);
  useEffect(() => {
    setHistory(item.transactions);
    api.get(`/medicine/inventory/${item.id}/history`, { skipCache: true }).then(({ data }) => setHistory(data.item.transactions.slice(0, 15))).catch(() => {});
  }, [item.id, item.transactions]);
  const byId = new Map(items.map((i) => [i.id, i]));
  const usedBy = items.filter((i) => i.recipe?.ingredients.some((g) => g.itemId === item.id)).map((i) => i.name);
  const suggest = item.suggestedOrder > 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2"><StatusBadge item={item} /><PriorityTags item={item} />{item.purchaseRequest && <span className="rounded bg-sky-100 px-1.5 py-0.5 text-[11px] font-semibold text-sky-800">PR raised · {item.purchaseRequest.raisedByName}</span>}</div>
      <div><p className="text-2xl font-bold text-charcoal">{qty(item.currentStock, item.unit)}</p><PackChips item={item} /><div className="mt-2"><Gauge item={item} /></div></div>
      <dl className="divide-y divide-cardline rounded-xl border border-cardline bg-white px-3 py-1">
        <Row label="Category" value={[categoryLabel(item.category), item.itemType].filter(Boolean).join(' · ')} />
        <Row label="Code / Rack" value={[item.code, item.rack].filter(Boolean).join(' · ')} />
        <Row label="Pack sizes" value={item.packs.map((p) => packLabel(p.size, item.unit)).join(', ')} />
        <Row label="Daily usage" value={item.dailyUse ? `${qty(item.dailyUse, item.unit)} (${item.dailyUseSource === 'manual' ? 'manual' : `${item.dailyUseDays}-day actual average`})` : 'No usage history available'} />
        <Row label="Stock cover" value={item.daysToLast != null ? `${item.daysToLast} days, until ${fmtDate(item.lastsUntil)}` : ''} />
        <Row label="Batch / Expiry" value={[item.batchNo, item.expiryDate ? `${fmtDate(item.expiryDate)}${item.expiryDays != null ? ` (${item.expiryDays < 0 ? 'expired' : `${item.expiryDays} days`})` : ''}` : ''].filter(Boolean).join(' · ')} />
        <Row label="Supplier" value={item.supplier} />
        <Row label="Used in" value={item.usedIn || usedBy.join(', ')} />
        <Row label="Suggested order" value={suggest ? qty(item.suggestedOrder, item.unit) : 'Not required'} />
      </dl>
      {item.recipe && (
        <div className="rounded-xl border border-cardline bg-offwhite-100 p-3">
          <p className="text-sm font-bold text-charcoal">Recipe for {qty(item.recipe.per, item.unit, { withConversion: false })}</p>
          <ul className="mt-1 space-y-0.5 text-sm">{item.recipe.ingredients.map((g) => { const raw = byId.get(g.itemId); return <li key={g.itemId}>{raw?.name || 'Removed item'}: {qty(g.qty, raw?.unit || item.unit, { withConversion: false })}</li>; })}</ul>
          <p className="mt-1 text-[11px] text-charcoal/50">These ingredients are deducted automatically during in-house production.</p>
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={() => onAction('use', item)}>Use</Button>
        <Button size="sm" variant="outline" onClick={() => onAction('in', item)}>+ Stock In</Button>
        <Button size="sm" variant="outline" onClick={() => onAction('adjust', item)}>Adjust</Button>
        {item.packs.length > 0 && <Button size="sm" variant="outline" onClick={() => onAction('pack', item)}>Pack</Button>}
        {canEdit && <Button size="sm" variant="outline" onClick={() => onEdit(item)}>Edit medicine</Button>}
        {onDelete && <Button size="sm" variant="outline" className="!border-[#8C3B2E]/40 !text-[#8C3B2E] hover:!bg-[#8C3B2E]/5" onClick={() => onDelete(item)}>Delete medicine</Button>}
      </div>
      <div>
        <p className="mb-1 text-sm font-bold text-charcoal">Recent entries</p>
        {history.length ? (
          <ul className="divide-y divide-cardline rounded-xl border border-cardline bg-white">
            {history.map((tx) => (
              <li key={tx.id} className="flex items-start justify-between gap-3 px-3 py-2 text-sm">
                <div className="min-w-0"><p className="font-semibold text-charcoal"><span className={`mr-1.5 rounded-full px-2 py-0.5 text-[11px] ${(TYPE[tx.type] || TYPE.add).badge}`}>{(TYPE[tx.type] || TYPE.add).label}</span>{tx.delta ? `${tx.delta > 0 ? '+' : '−'}${qty(Math.abs(tx.delta), item.unit, { withConversion: false })}` : ''}{tx.status === 'pending' && <span className="ml-1.5 text-xs text-amber-800">approval pending</span>}</p><p className="truncate text-xs text-charcoal/55" title={inventoryText(tx.detail)}>{[inventoryText(tx.detail), tx.ref].filter(Boolean).join(' · ')}</p><p className="text-[11px] text-charcoal/45">{tx.txId} · {fmtDateTime(tx.createdAt)} · {tx.recordedByName}</p></div>
                <p className="shrink-0 text-right text-xs text-charcoal/60">{qty(tx.previousStock, item.unit, { withConversion: false })} → <b className="text-charcoal">{qty(tx.newStock, item.unit, { withConversion: false })}</b></p>
              </li>
            ))}
          </ul>
        ) : <p className="rounded-xl border border-dashed border-cardline p-4 text-center text-sm text-charcoal/50">No entries yet.</p>}
      </div>
    </div>
  );
}
