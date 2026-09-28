import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, X } from 'lucide-react';

export const splitChoices = (value) => String(value || '').split(',').map((item) => item.trim()).filter(Boolean);

export default function MultiSelectCell({ options = [], value, onChange, disabled = false, label = 'Multiple choice' }) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState(null);
  const triggerRef = useRef(null);
  const menuRef = useRef(null);
  const selected = splitChoices(value);

  useEffect(() => {
    if (!open) return undefined;
    const updatePosition = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const menuHeight = Math.min(options.length * 38 + 62, 280);
      setPosition({
        left: Math.max(8, Math.min(rect.left, window.innerWidth - 248)),
        top: rect.bottom + menuHeight > window.innerHeight ? Math.max(8, rect.top - menuHeight - 4) : rect.bottom + 4,
        width: Math.max(220, Math.min(rect.width, 300)),
      });
    };
    const dismiss = (event) => {
      if (!triggerRef.current?.contains(event.target) && !menuRef.current?.contains(event.target)) setOpen(false);
    };
    const onKeyDown = (event) => { if (event.key === 'Escape') setOpen(false); };
    updatePosition();
    document.addEventListener('pointerdown', dismiss);
    document.addEventListener('keydown', onKeyDown);
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      document.removeEventListener('pointerdown', dismiss);
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [open, options.length]);

  const toggle = (option) => {
    const next = new Set(selected);
    if (next.has(option)) next.delete(option);
    else next.add(option);
    onChange(options.filter((item) => next.has(item)).join(', '));
  };

  return <>
    <button
      ref={triggerRef}
      type="button"
      disabled={disabled}
      aria-label={label}
      aria-expanded={open}
      aria-haspopup="listbox"
      onClick={() => setOpen((current) => !current)}
      className="flex min-h-10 w-full min-w-[150px] items-center justify-between gap-2 px-3 py-2 text-left text-sm text-charcoal hover:bg-sage/5 disabled:cursor-default"
    >
      <span className={`min-w-0 flex-1 truncate ${selected.length ? '' : 'text-charcoal/55'}`} title={selected.join(', ')}>{selected.length ? selected.join(', ') : 'Select options'}</span>
      <ChevronDown size={15} className="shrink-0 text-sage" />
    </button>
    {open && position && createPortal(
      <div ref={menuRef} role="listbox" aria-label={label} aria-multiselectable="true" style={{ position: 'fixed', zIndex: 100, ...position }} className="max-h-[280px] overflow-y-auto rounded border border-cardline bg-offwhite-100 p-1 shadow-xl">
        {options.map((option) => <button key={option} type="button" role="option" aria-selected={selected.includes(option)} onClick={() => toggle(option)} className="flex w-full items-center gap-2 rounded px-2 py-2 text-left text-sm text-charcoal hover:bg-sage/10">
          <span aria-hidden="true" className={`flex h-4 w-4 shrink-0 items-center justify-center border ${selected.includes(option) ? 'border-sage bg-sage text-white' : 'border-charcoal/40'}`}>
            {selected.includes(option) && <Check size={12} />}
          </span>
          <span className="min-w-0 break-words">{option}</span>
        </button>)}
        {!options.length && <p className="px-2 py-2 text-xs text-charcoal/60">No options</p>}
        {selected.length > 0 && <button type="button" onClick={() => onChange('')} className="mt-1 flex w-full items-center gap-1 border-t border-cardline px-2 py-2 text-xs text-sage hover:bg-sage/10"><X size={13} /> Clear selection</button>}
      </div>, document.body,
    )}
  </>;
}
