import { Siren, Zap } from 'lucide-react';
import { STATUS, num, unitText } from './helpers.js';

export const Field = ({ label, hint, children, className = '' }) => (
  <label className={`block min-w-0 space-y-1 text-sm font-medium text-charcoal ${className}`}>
    {label ? <span className="block">{label}</span> : null}
    {children}
    {hint && <span className="block text-[11px] font-normal text-charcoal/50">{hint}</span>}
  </label>
);

export function Chip({ active, onClick, children, count, alert, className = '' }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={Boolean(active)} className={`inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-sm transition ${active ? 'border-sage bg-sage/10 font-semibold text-sage ring-1 ring-sage/30' : 'border-cardline bg-white text-charcoal hover:border-sage/60'} ${className}`}>
      {children}
      {count != null && <span className={`text-xs ${active ? 'text-sage' : 'text-charcoal/45'}`}>{count}</span>}
      {alert > 0 && <span className="rounded-full bg-[#8C3B2E]/12 px-1.5 text-[11px] font-bold text-[#8C3B2E]">{alert}</span>}
    </button>
  );
}

export const StatusBadge = ({ item }) => {
  const st = STATUS[item.status] || STATUS.ok;
  return (
    <span>
      <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ${st.badge}`}><span className={`h-1.5 w-1.5 rounded-full ${st.dot}`} />{st.label}</span>
      {item.expiring && item.status !== 'expired' && <span className="mt-1 block text-[11px] font-semibold text-[#8C3B2E]">Expiry {item.expiryDays} din</span>}
    </span>
  );
};

export const PriorityTags = ({ item }) => (
  <>
    {item.emergency && <span className="inline-flex items-center gap-1 rounded bg-[#8C3B2E]/12 px-1.5 py-0.5 text-[11px] font-semibold text-[#8C3B2E]"><Siren size={10} />Emergency</span>}
    {item.fastMoving && <span className="inline-flex items-center gap-1 rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-semibold text-amber-900"><Zap size={10} />Fast moving</span>}
  </>
);

// Level bar with Min / Reorder / Max marks.
export function Gauge({ item }) {
  const { currentStock: stock, lowStockAt: min, reorderLevel: reorder, maxLevel: max, unit } = item;
  const scaleMax = Math.max(max, reorder * 1.5, min * 2, stock, 1) * (max ? 1.25 : 1.15);
  const pct = (v) => `${Math.min((v / scaleMax) * 100, 100)}%`;
  const marks = [[min, 'bg-[#8C3B2E]', 'Min'], [reorder, 'bg-amber-600', 'Reorder'], [max, 'bg-violet-700', 'Max']].filter(([v]) => v > 0);
  if (!marks.length) return <span className="text-xs text-charcoal/40">Levels not set</span>;
  return (
    <div className="min-w-[150px]">
      <div className="relative h-2 rounded-full bg-cardline">
        <div className={`h-full rounded-full ${STATUS[item.status]?.bar || 'bg-sage'}`} style={{ width: pct(stock) }} />
        {marks.map(([v, color, name]) => <span key={name} title={`${name}: ${num(v)} ${unitText(unit)}`} className={`absolute -top-1 h-4 w-0.5 ${color}`} style={{ left: pct(v) }} />)}
      </div>
      <p className="mt-1 text-[11px] text-charcoal/55">{[min, reorder, max].map((v) => (v > 0 ? num(v) : '-')).join(' · ')} {unitText(unit)}</p>
    </div>
  );
}

// Loose + filled bottles, with the selected size highlighted and empty sizes in red.
export function PackChips({ item, highlight = '' }) {
  if (!item.packs.length) return null;
  return (
    <div className="mt-1.5 flex flex-wrap gap-1.5">
      <span className="rounded border border-cardline bg-white px-2 py-0.5 text-xs">Loose {num(item.loose)} {unitText(item.unit)}</span>
      {item.packs.map((p) => (
        <span key={p.size} className={`rounded border px-2 py-0.5 text-xs ${highlight === `${p.size}|${item.unit}` ? 'border-sage bg-sage/10 font-semibold text-sage' : p.count === 0 ? 'border-[#8C3B2E]/50 bg-white text-[#8C3B2E]' : 'border-cardline bg-white'}`} title={p.label}>
          {num(p.size)} {unitText(item.unit)} × {p.count}
        </span>
      ))}
    </div>
  );
}
