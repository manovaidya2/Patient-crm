import { useMemo } from 'react';
import { ArrowDownToLine, ClipboardEdit, History, Minus, Pencil, Plus, Search } from 'lucide-react';
import Button from '../ui/Button.jsx';
import { Chip, Gauge, PackChips, PriorityTags, StatusBadge } from './parts.jsx';
import { PACKABLE, PACKING_CATEGORY, STATUS, STATUS_FILTERS, categoryLabel, fmtDate, inputClass, num, qty, sizeKey, sizeName, statusTest, unitText } from './helpers.js';

const compactBtn = '!px-2.5 !py-1.5';

// Pick the category -> stock status -> bottle size; each row's counts follow the row above it.
export default function StockList({ items, filters, setFilters, onAction, onOpen, onEdit, onHistory }) {
  const { q, category, status, size } = filters;
  const set = (patch) => setFilters({ ...filters, ...patch });
  const search = q.trim().toLowerCase();
  const base = useMemo(() => items.filter((i) => !search || [i.name, i.nameHindi, i.code, i.rack, i.category].join(' ').toLowerCase().includes(search)), [items, search]);

  const categories = useMemo(() => {
    const names = [...new Set(base.map((i) => i.category))];
    return names.map((name) => {
      const list = base.filter((i) => i.category === name);
      return { name, total: list.length, alert: list.filter((i) => i.critical).length };
    }).sort((a, b) => categoryLabel(a.name).localeCompare(categoryLabel(b.name), 'en'));
  }, [base]);
  const inCategory = useMemo(() => base.filter((i) => category === 'all' || (category === '__none' ? !i.category : i.category === category)), [base, category]);
  const sizeOptions = useMemo(() => {
    const map = new Map();
    inCategory.filter(statusTest(status)).forEach((i) => {
      const keys = i.category === PACKING_CATEGORY && i.containerSize ? [sizeKey(i.containerSize, i.containerUnit === 'g' ? 'gram' : 'ml')] : i.packs.map((p) => sizeKey(p.size, i.unit));
      keys.forEach((k) => map.set(k, (map.get(k) || 0) + 1));
    });
    return [...map.entries()].sort((a, b) => a[0].split('|')[1].localeCompare(b[0].split('|')[1]) * -1 || parseFloat(a[0]) - parseFloat(b[0]));
  }, [inCategory, status]);
  const itemSizes = (i) => (i.category === PACKING_CATEGORY && i.containerSize ? [sizeKey(i.containerSize, i.containerUnit === 'g' ? 'gram' : 'ml')] : i.packs.map((p) => sizeKey(p.size, i.unit)));

  const rows = useMemo(() => inCategory.filter(statusTest(status)).filter((i) => !size || itemSizes(i).includes(size))
    .sort((a, b) => (STATUS[a.status]?.order ?? 9) - (STATUS[b.status]?.order ?? 9) || Number(b.emergency) - Number(a.emergency) || a.code.localeCompare(b.code) || a.name.localeCompare(b.name)),
  [inCategory, status, size]); // eslint-disable-line react-hooks/exhaustive-deps
  const label = category === 'all' ? 'All medicines' : category === '__none' ? 'No category' : categoryLabel(category);

  return (
    <div className="space-y-3">
      <div className="space-y-3 rounded-xl border border-cardline bg-white p-3 sm:p-4">
        <div className="relative max-w-md"><Search size={16} className="absolute left-3 top-2.5 text-charcoal/45" /><input className={`${inputClass} !pl-9`} type="search" placeholder="Search by name, code or rack" value={q} onChange={(e) => set({ q: e.target.value })} aria-label="Search medicine" /></div>
        <div className="grid gap-2 md:grid-cols-[110px_1fr]">
          <p className="pt-1.5 text-xs font-semibold uppercase tracking-wide text-charcoal/50">Category</p>
          <div className="flex flex-wrap gap-2">
            <Chip active={category === 'all'} onClick={() => set({ category: 'all', size: '' })} count={base.length} alert={base.filter((i) => i.critical).length}>All</Chip>
            {categories.map((c) => <Chip key={c.name || '__none'} active={category === (c.name || '__none')} onClick={() => set({ category: c.name || '__none', size: '' })} count={c.total} alert={c.alert}>{categoryLabel(c.name)}</Chip>)}
          </div>
        </div>
        <div className="grid gap-2 md:grid-cols-[110px_1fr]">
          <p className="pt-1.5 text-xs font-semibold uppercase tracking-wide text-charcoal/50">Stock status</p>
          <div className="flex flex-wrap gap-2">{STATUS_FILTERS.map(([key, name, test]) => <Chip key={key} active={status === key} onClick={() => set({ status: key })} count={inCategory.filter(test).length}>{name}</Chip>)}</div>
        </div>
        {(sizeOptions.length > 0 || size) && (
          <div className="grid gap-2 md:grid-cols-[110px_1fr]">
            <p className="pt-1.5 text-xs font-semibold uppercase tracking-wide text-charcoal/50">Bottle / vial size</p>
            <div className="flex flex-wrap gap-2"><Chip active={!size} onClick={() => set({ size: '' })}>All sizes</Chip>{sizeOptions.map(([key, count]) => <Chip key={key} active={size === key} onClick={() => set({ size: key })} count={count}>{sizeName(key)}</Chip>)}</div>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-base font-bold text-charcoal">{rows.length} items <span className="font-normal text-charcoal/50">· {label}{size ? ` · ${sizeName(size)}` : ''}</span></h2>
        <p className="text-xs text-charcoal/50">Stock = Loose + (bottles × size). Gauge: <span className="font-semibold text-[#8C3B2E]">Min</span> | <span className="font-semibold text-amber-700">Reorder</span> | <span className="font-semibold text-violet-700">Max</span></p>
      </div>

      <div className="overflow-x-auto rounded-xl border border-cardline bg-white">
        <table className="w-full min-w-[1120px] text-left text-sm">
          <thead className="bg-offwhite-200 text-xs uppercase tracking-wide text-charcoal/55"><tr>{['Code', 'Medicine', 'Rack', 'Stock', 'Level (Min · Reorder · Max)', 'Stock cover', 'Expiry', 'Status', 'Action'].map((h) => <th key={h} className="px-2.5 py-3 font-semibold">{h}</th>)}</tr></thead>
          <tbody>
            {!rows.length ? <tr><td colSpan={9} className="p-10 text-center text-charcoal/55">{items.length ? 'No medicines match these filters. Select "All" to reset.' : 'No medicines have been added yet. Use "Add medicine" to create the first item.'}</td></tr>
              : rows.map((item) => (
                <tr key={item.id} className="border-t border-cardline align-top hover:bg-offwhite-100/60">
                  <td className="whitespace-nowrap px-2.5 py-3 font-bold text-sage">{item.code || '-'}</td>
                  <td className="min-w-[200px] px-2.5 py-3">
                    <button type="button" onClick={() => onOpen(item)} className="text-left font-semibold text-charcoal hover:text-sage hover:underline">{item.name}</button>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      {item.category && <span className="rounded border border-cardline bg-offwhite-200 px-1.5 py-0.5 text-[11px] text-charcoal/70">{categoryLabel(item.category)}</span>}
                      <PriorityTags item={item} />
                      {item.purchaseRequest && <span className="rounded bg-sky-100 px-1.5 py-0.5 text-[11px] font-semibold text-sky-800">PR raised</span>}
                      {item.pendingCount > 0 && <span className="rounded bg-violet-100 px-1.5 py-0.5 text-[11px] font-semibold text-violet-800">{item.pendingCount} approval pending</span>}
                    </div>
                  </td>
                  <td className="px-2.5 py-3 text-xs text-charcoal/70">{item.rack || '-'}</td>
                  <td className="min-w-[220px] px-2.5 py-3">
                    <p className="text-base font-bold text-charcoal">{qty(item.currentStock, item.unit)}</p>
                    {item.category === PACKING_CATEGORY && item.containerSize > 0 && <p className="text-xs text-charcoal/55">{num(item.containerSize)} {item.containerUnit} {item.containerKind === 'शीशी' ? 'Vial' : item.containerKind}</p>}
                    <PackChips item={item} highlight={size} />
                  </td>
                  <td className="px-2.5 py-3"><Gauge item={item} /></td>
                  <td className="whitespace-nowrap px-2.5 py-3">
                    {item.daysToLast != null ? <>
                      <p className={`text-base font-bold ${item.daysToLast <= 7 ? 'text-[#8C3B2E]' : item.daysToLast <= 15 ? 'text-amber-700' : 'text-charcoal'}`}>{item.daysToLast} <span className="text-xs font-semibold">days</span></p>
                      <p className="text-[11px] text-charcoal/55">until {fmtDate(item.lastsUntil)}</p>
                      <p className="text-[11px] text-charcoal/45" title={item.dailyUseSource === 'manual' ? 'Daily usage entered manually.' : `Average actual usage over the last ${item.dailyUseDays} days`}>{num(item.dailyUse, 1)} {unitText(item.unit)} per day{item.dailyUseSource === 'manual' ? ' (manual)' : ' (actual)'}</p>
                    </> : <span className="text-charcoal/30" title="No usage history is available yet.">-</span>}
                  </td>
                  <td className={`whitespace-nowrap px-2.5 py-3 text-xs ${item.expiring ? 'font-semibold text-[#8C3B2E]' : 'text-charcoal/70'}`}>{item.expiryDate ? <>{fmtDate(item.expiryDate)}<p className="font-normal">{item.expiryDays < 0 ? `${-item.expiryDays} days ago` : `${item.expiryDays} days left`}</p></> : '-'}</td>
                  <td className="px-2.5 py-3"><StatusBadge item={item} /></td>
                  <td className="min-w-[210px] px-2 py-3">
                    <div className="flex flex-wrap gap-1">
                      <Button size="sm" variant="outline" className={compactBtn} onClick={() => onAction('use', item)}><Minus size={13} />Use</Button>
                      <Button size="sm" variant="outline" className={compactBtn} onClick={() => onAction('in', item)}><Plus size={13} />In</Button>
                      <Button size="sm" variant="outline" className={compactBtn} onClick={() => onAction('adjust', item)}><ClipboardEdit size={13} />Adjust</Button>
                      {PACKABLE.includes(item.unit) && <Button size="sm" variant="outline" className={compactBtn} onClick={() => onAction('pack', item)}><ArrowDownToLine size={13} />Pack</Button>}
                      <button type="button" onClick={() => onEdit(item)} className="rounded-lg p-1.5 text-sage hover:bg-sage/10" title="Edit medicine" aria-label={`Edit ${item.name}`}><Pencil size={15} /></button>
                      <button type="button" onClick={() => onHistory(item)} className="rounded-lg p-1.5 text-charcoal/55 hover:bg-gray-100" title="History" aria-label={`History of ${item.name}`}><History size={15} /></button>
                    </div>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
