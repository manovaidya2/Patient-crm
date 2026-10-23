// Shared page building blocks: header, stat tiles, titled sections and key/value lists.
// Every page uses the same spacing, type sizes and colors through these.

// Page title with a one-line summary and actions on the right (wraps on phones).
export function PageHeader({ eyebrow, title, subtitle, actions, icon: Icon }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-3">
      <div className="flex min-w-0 items-start gap-3">
        {Icon && <span className="hidden h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-sage/15 text-sage sm:flex"><Icon size={20} /></span>}
        <div className="min-w-0">
          {eyebrow && <p className="text-xs text-charcoal/60">{eyebrow}</p>}
          <h1 className="font-display text-xl font-extrabold leading-tight text-charcoal sm:text-[22px]">{title}</h1>
          {subtitle && <p className="mt-0.5 text-[12.5px] text-charcoal/60">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

const TILE_TONE = {
  plain: 'border-[#E8DFCB] bg-white',
  orange: 'border-[#FDBA74] bg-[#FFF7ED]',
  red: 'border-[#FCA5A5] bg-[#FEF2F2]',
  green: 'border-[#A7D3B8] bg-[#F6FBF7]',
  soft: 'border-[#EFE3CF] bg-[#FBF7ED]',
};
const TILE_TEXT = { plain: 'text-charcoal', orange: 'text-[#C2410C]', red: 'text-[#9F1D1D]', green: 'text-[#1F6B41]', soft: 'text-charcoal' };

// A number with its label; `onClick` turns it into a filter button, `active` marks the chosen one.
export function StatTile({ label, value, hint, tone = 'plain', onClick, active = false }) {
  const body = (
    <>
      <span className={`block text-[10.5px] font-bold uppercase tracking-wide ${tone === 'plain' || tone === 'soft' ? 'text-charcoal/55' : TILE_TEXT[tone]}`}>{label}</span>
      <span className={`mt-0.5 block font-display text-[22px] font-extrabold leading-tight ${TILE_TEXT[tone]}`}>{value}</span>
      {hint && <span className={`block text-[11.5px] ${tone === 'plain' || tone === 'soft' ? 'text-charcoal/55' : TILE_TEXT[tone]}`}>{hint}</span>}
    </>
  );
  const cls = `rounded-xl border px-3.5 py-3 text-left ${TILE_TONE[tone]} ${active ? 'ring-2 ring-charcoal/70' : ''}`;
  return onClick
    ? <button type="button" onClick={onClick} aria-pressed={active} className={`${cls} transition hover:shadow-sm`}>{body}</button>
    : <div className={cls}>{body}</div>;
}

// Responsive tile row: as many columns as fit.
export function StatRow({ children, min = 150 }) {
  return <section className="grid gap-2.5" style={{ gridTemplateColumns: `repeat(auto-fit, minmax(${min}px, 1fr))` }}>{children}</section>;
}

// A titled white card; `tone="action"` is the orange "your turn" card.
export function Section({ title, icon: Icon, action, children, tone, className = '', bodyClassName = '' }) {
  const frame = tone === 'action' ? 'border-2 border-[#FDBA74] bg-gradient-to-b from-[#FFF7ED] to-white' : 'border border-[#E8DFCB] bg-white';
  return (
    <section className={`rounded-[14px] p-4 sm:p-[18px] ${frame} ${className}`}>
      {(title || action) && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="flex items-center gap-2 font-display text-[13.5px] font-bold text-charcoal">{Icon && <Icon size={16} className="text-sage" />}{title}</h3>
          {action}
        </div>
      )}
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}

// Label | value rows that read down the page; empty values are skipped.
export function KV({ items, labelWidth = 130 }) {
  const rows = items.filter(([, value]) => value !== '' && value !== null && value !== undefined && value !== false);
  if (!rows.length) return null;
  return (
    <dl className="grid gap-x-3 gap-y-1.5 text-[12.5px]" style={{ gridTemplateColumns: `minmax(0, ${labelWidth}px) minmax(0, 1fr)` }}>
      {rows.map(([label, value]) => (
        <div key={label} className="contents"><dt className="text-charcoal/55">{label}</dt><dd className="min-w-0 break-words font-medium text-charcoal">{value}</dd></div>
      ))}
    </dl>
  );
}

// A small uppercase label above a group.
export const Eyebrow = ({ children, className = '' }) => <p className={`text-[10.5px] font-bold uppercase tracking-wide text-charcoal/55 ${className}`}>{children}</p>;
