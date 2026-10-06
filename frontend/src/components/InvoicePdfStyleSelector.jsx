import { Check, Palette, Printer } from 'lucide-react';

const OPTIONS = [
  { value: 'black-white', label: 'Black & white', icon: Printer },
  { value: 'color', label: 'Color PDF', icon: Palette },
];

export default function InvoicePdfStyleSelector({ value, onChange }) {
  return (
    <fieldset className="min-w-0">
      <legend className="mb-1.5 text-sm font-medium text-charcoal">PDF style</legend>
      <div className="grid grid-cols-2 gap-2">
        {OPTIONS.map(({ value: option, label, icon: Icon }) => {
          const selected = value === option;
          return (
            <button
              key={option}
              type="button"
              aria-pressed={selected}
              onClick={() => onChange(option)}
              className={`relative flex h-[46px] min-w-0 items-center justify-center gap-2 rounded-md border px-3 text-sm font-semibold shadow-sm transition-all ${selected
                ? option === 'color'
                  ? 'border-[#7B3FA1] bg-[#7B3FA1] text-white shadow-[#7B3FA1]/20'
                  : 'border-charcoal bg-charcoal text-white shadow-charcoal/20'
                : 'border-cardline bg-white text-charcoal/65 hover:border-sage hover:bg-cream-100 hover:text-charcoal'}`}
            >
              <Icon size={17} className="shrink-0" />
              <span className="whitespace-nowrap">{label}</span>
              {selected && <Check size={14} strokeWidth={2.5} className="absolute right-2 top-2" />}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
