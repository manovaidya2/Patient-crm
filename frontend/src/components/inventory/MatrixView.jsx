import SizeManager from './SizeManager.jsx';
import { categoryLabel, findContainer, num, packLabel, qty, sizeKey } from './helpers.js';

// Filled-container counts by medicine and size. Empty stock appears when a matching packing item exists.
function Matrix({ title, unit, sizes, items, onOpen, onSize }) {
  const list = items.filter((i) => i.unit === unit && i.packs.length);
  if (!list.length) return null;
  const filled = sizes.map((s) => list.reduce((sum, i) => sum + (i.packs.find((p) => Number(p.size) === s)?.count || 0), 0));
  const tracked = sizes.map((s) => findContainer(items, { unit }, s));
  const anyTracked = tracked.some(Boolean);
  return (
    <section className="space-y-2 rounded-xl border border-cardline bg-white p-3 sm:p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2"><h3 className="text-base font-bold text-charcoal">{title}</h3><p className="text-xs text-charcoal/55">Select a size to show only medicines available in that size.</p></div>
      <div className="overflow-x-auto rounded-lg border border-cardline">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-offwhite-200 text-xs text-charcoal/60"><tr>
            <th className="px-2.5 py-2.5 text-left font-semibold">Medicine</th>
            <th className="px-2.5 py-2.5 text-right font-semibold">Loose<span className="block text-[10px] font-normal">(not packed)</span></th>
            {sizes.map((s) => <th key={s} className="px-2.5 py-2.5 text-right font-semibold"><button type="button" className="font-semibold text-sage underline decoration-dotted" onClick={() => onSize(sizeKey(s, unit))}>{packLabel(s, unit)}</button><span className="block text-[10px] font-normal">filled</span></th>)}
            <th className="px-2.5 py-2.5 text-right font-semibold">Total stock</th>
          </tr></thead>
          <tbody>
            {list.map((item) => (
              <tr key={item.id} className="border-t border-cardline">
                <td className="px-2.5 py-2.5"><button type="button" className="text-left font-semibold hover:text-sage hover:underline" onClick={() => onOpen(item)}>{item.name}</button><p className="text-xs text-charcoal/55">{categoryLabel(item.category)}</p></td>
                <td className="px-2.5 py-2.5 text-right tabular-nums">{num(item.loose)}</td>
                {sizes.map((s) => {
                  const p = item.packs.find((x) => Number(x.size) === s);
                  if (!p) return <td key={s} className="px-2.5 py-2.5 text-right text-charcoal/20" title="This size is not configured for this medicine">·</td>;
                  return <td key={s} className={`px-2.5 py-2.5 text-right tabular-nums ${p.count === 0 ? 'text-charcoal/40' : 'font-semibold'}`}>{p.count}</td>;
                })}
                <td className="whitespace-nowrap px-2.5 py-2.5 text-right font-semibold tabular-nums">{qty(item.currentStock, item.unit)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t-2 border-cardline bg-offwhite-100 font-semibold">
            <tr><td className="px-2.5 py-2.5">Total filled containers</td><td />{filled.map((n, i) => <td key={sizes[i]} className="px-2.5 py-2.5 text-right tabular-nums">{n}</td>)}<td /></tr>
            {anyTracked && (
              <tr><td className="px-2.5 py-2.5">Empty bottle / jar stock<span className="block text-[11px] font-normal text-charcoal/50">From Packing Materials</span></td><td />
                {tracked.map((c, i) => <td key={sizes[i]} className={`px-2.5 py-2.5 text-right tabular-nums ${c && c.currentStock <= (c.lowStockAt || 0) ? 'text-[#8C3B2E]' : ''} ${c ? '' : 'font-normal text-charcoal/25'}`}>{c ? num(c.currentStock) : '·'}</td>)}<td /></tr>
            )}
          </tfoot>
        </table>
      </div>
    </section>
  );
}

export default function MatrixView({ items, master, onOpen, onSize, onSizesChanged, onError, canRemove }) {
  // Every size in the shared list is a column, even if no medicine uses it yet.
  const sizesFor = (unit) => [...new Set([...(master?.[unit] || []), ...items.filter((i) => i.unit === unit).flatMap((i) => i.packs.map((p) => Number(p.size)))])].sort((a, b) => a - b);
  return (
    <div className="space-y-3">
      <div className="rounded-xl border-l-4 border-sage bg-sage/10 px-4 py-3 text-sm text-charcoal/85">
        <p className="font-bold text-charcoal">How to read this view</p>
        <ul className="mt-1 list-disc space-y-0.5 pl-5">
          <li><b>Loose</b> is bulk medicine that has not been packed into a container.</li>
          <li>The number under each size is the count of filled containers. <b>0</b> means none are currently filled. Use <b>Entry → Pack</b> to fill them.</li>
          <li><b>·</b> means that size is not configured for the medicine.</li>
          <li>Empty-container tracking is optional. Create a matching Packing Materials item, such as "Bottle 100 ml", to deduct empty containers automatically during packing.</li>
        </ul>
      </div>
      <SizeManager master={master} onChanged={onSizesChanged} onError={onError} canRemove={canRemove} />
      {!items.some((i) => i.packs.length) && <div className="rounded-xl border border-dashed border-cardline bg-white p-8 text-center text-sm text-charcoal/55">No pack sizes are configured yet. Edit a medicine and select its available pack sizes.</div>}
      <Matrix title="Liquid medicines (ml) by filled bottle / vial size" unit="ml" sizes={sizesFor('ml')} items={items} onOpen={onOpen} onSize={onSize} />
      <Matrix title="Avaleha / Rasayana (gram) by filled jar size" unit="gram" sizes={sizesFor('gram')} items={items} onOpen={onOpen} onSize={onSize} />
    </div>
  );
}
