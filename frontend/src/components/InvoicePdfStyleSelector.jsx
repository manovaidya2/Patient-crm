import { Palette, Printer } from 'lucide-react';

const OPTIONS = [
  { value: 'black-white', label: 'Black & white', icon: Printer },
  { value: 'color', label: 'Color PDF', icon: Palette },
];

export default function InvoicePdfStyleSelector({ value, onChange }) {
  return (
    <fieldset className="min-w-0">
      <legend className="mb-1.5 text-sm font-medium text-charcoal">PDF style</legend>
      <div className="grid h-11 grid-cols-2 overflow-hidden rounded-md border border-cardline bg-white p-1">
        {OPTIONS.map(({ value: option, label, icon: Icon }) => {
          const selected = value === option;
          return (
            <button
              key={option}
              type="button"
              aria-pressed={selected}
              onClick={() => onChange(option)}
              className={`flex min-w-0 items-center justify-center gap-2 rounded px-2 text-xs font-semibold transition-colors sm:text-sm ${selected ? option === 'color' ? 'bg-[#7B3FA1] text-white' : 'bg-charcoal text-white' : 'text-charcoal/60 hover:bg-gray-50'}`}
            >
              <Icon size={16} className="shrink-0" />
              <span className="truncate">{label}</span>
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
