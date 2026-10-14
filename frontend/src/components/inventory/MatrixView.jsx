import SizeManager from './SizeManager.jsx';
import { findContainer, num, packLabel, qty, sizeKey } from './helpers.js';

// Har dawa ki har size ki kitni bhari bottles hain. Khaali bottle / jar ginti sirf tab dikhti hai jab uska Packing सामग्री item bana ho.
function Matrix({ title, unit, sizes, items, onOpen, onSize }) {
  const list = items.filter((i) => i.unit === unit && i.packs.length);
  if (!list.length) return null;
  const filled = sizes.map((s) => list.reduce((sum, i) => sum + (i.packs.find((p) => Number(p.size) === s)?.count || 0), 0));
  const tracked = sizes.map((s) => findContainer(items, { unit }, s));
  const anyTracked = tracked.some(Boolean);
  return (
    <section className="space-y-2 rounded-xl border border-cardline bg-white p-3 sm:p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2"><h3 className="text-base font-bold text-charcoal">{title}</h3><p className="text-xs text-charcoal/55">Size ke naam par click karein: sirf usi size wali dawaiyaan dikhengi</p></div>
      <div className="overflow-x-auto rounded-lg border border-cardline">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-offwhite-200 text-xs text-charcoal/60"><tr>
            <th className="px-2.5 py-2.5 text-left font-semibold">दवा</th>
            <th className="px-2.5 py-2.5 text-right font-semibold">Loose<span className="block text-[10px] font-normal">(bottle me nahi)</span></th>
            {sizes.map((s) => <th key={s} className="px-2.5 py-2.5 text-right font-semibold"><button type="button" className="font-semibold text-sage underline decoration-dotted" onClick={() => onSize(sizeKey(s, unit))}>{packLabel(s, unit)}</button><span className="block text-[10px] font-normal">bhari bottle</span></th>)}
            <th className="px-2.5 py-2.5 text-right font-semibold">Kul stock</th>
          </tr></thead>
          <tbody>
            {list.map((item) => (
              <tr key={item.id} className="border-t border-cardline">
                <td className="px-2.5 py-2.5"><button type="button" className="text-left font-semibold hover:text-sage hover:underline" onClick={() => onOpen(item)}>{item.name}</button><p className="text-xs text-charcoal/55">{item.category}</p></td>
                <td className="px-2.5 py-2.5 text-right tabular-nums">{num(item.loose)}</td>
                {sizes.map((s) => {
                  const p = item.packs.find((x) => Number(x.size) === s);
                  if (!p) return <td key={s} className="px-2.5 py-2.5 text-right text-charcoal/20" title="Is dawa ke liye ye size set nahi hai">·</td>;
                  return <td key={s} className={`px-2.5 py-2.5 text-right tabular-nums ${p.count === 0 ? 'text-charcoal/40' : 'font-semibold'}`}>{p.count}</td>;
                })}
                <td className="whitespace-nowrap px-2.5 py-2.5 text-right font-semibold tabular-nums">{qty(item.currentStock, item.unit)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t-2 border-cardline bg-offwhite-100 font-semibold">
            <tr><td className="px-2.5 py-2.5">Bhari hui bottles (kul)</td><td />{filled.map((n, i) => <td key={sizes[i]} className="px-2.5 py-2.5 text-right tabular-nums">{n}</td>)}<td /></tr>
            {anyTracked && (
              <tr><td className="px-2.5 py-2.5">Khaali bottle / jar stock<span className="block text-[11px] font-normal text-charcoal/50">Packing सामग्री se</span></td><td />
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
        <p className="font-bold text-charcoal">Is page ko aise padhein</p>
        <ul className="mt-1 list-disc space-y-0.5 pl-5">
          <li><b>Loose</b> = dawa jo abhi bottle me nahi bhari (drum / bulk me).</li>
          <li>Har <b>size ke neeche ka number</b> = us size ki kitni bhari bottles / jar rakhi hain. <b>0</b> ka matlab abhi us size ki koi bottle nahi bhari. Bharne ke liye <b>Entry → Pack</b> karein.</li>
          <li><b>·</b> ka matlab ye size us dawa ke liye set hi nahi hai (dawa Edit karke size chun sakte hain).</li>
          <li>Khaali bottle ginti <b>optional</b> hai. Sirf tab jab aap Packing सामग्री me us size ka item banate ho (jaise "Bottle 100 ml"), neeche ek extra row dikhti hai aur Pack karne par khaali bottle apne-aap ghatti hai.</li>
        </ul>
      </div>
      <SizeManager master={master} onChanged={onSizesChanged} onError={onError} canRemove={canRemove} />
      {!items.some((i) => i.packs.length) && <div className="rounded-xl border border-dashed border-cardline bg-white p-8 text-center text-sm text-charcoal/55">Abhi kisi dawa me bottle size set nahi hai. Medicine Edit karke "Kin size me pack hoti hai" chuniye.</div>}
      <Matrix title="Liquid dawaiyaan (ml): har size ki bhari bottles / शीशी" unit="ml" sizes={sizesFor('ml')} items={items} onOpen={onOpen} onSize={onSize} />
      <Matrix title="अवलेह / रसायन (gram): jar size ke hisaab se" unit="gram" sizes={sizesFor('gram')} items={items} onOpen={onOpen} onSize={onSize} />
    </div>
  );
}
