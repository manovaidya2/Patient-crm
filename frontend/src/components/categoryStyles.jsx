import { Brain, Pill, Puzzle } from 'lucide-react';
import { STAGE_LABELS } from '../constants/treatmentStages.js';

// Shared by the Control Room sections "Medicine by category" and "Payment pending by category".
export const shortDate = (value) => (value ? new Date(value).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '-');
export const selectClass = 'rounded-md border border-cardline bg-white px-3 py-2 text-sm text-charcoal';
export const phaseLabel = (n) => STAGE_LABELS[n] || `Phase ${n}`;

// Programs at the top: Autism / ADHD, Mental Health (a patient without one is "Program not set").
export const NO_PROGRAM = 'Program not set';
export const PROGRAMS = [
  { key: 'Autism / ADHD', icon: Puzzle, tone: 'bg-[#EEF2FB] text-[#2F4A8A] border-[#C9D5F0]', active: 'bg-[#2F4A8A] text-white border-[#2F4A8A]' },
  { key: 'Mental Health', icon: Brain, tone: 'bg-[#F5EEFB] text-[#5B3A86] border-[#DCCBEE]', active: 'bg-[#5B3A86] text-white border-[#5B3A86]' },
  { key: NO_PROGRAM, icon: Pill, tone: 'bg-offwhite-200 text-charcoal/70 border-cardline', active: 'bg-charcoal text-white border-charcoal' },
];

// One colour per supply category (the PO paper's choices).
export const CATEGORY_TONE = {
  '6M': { box: 'border-[#9DB7A3] bg-[#EEF5EF]', head: 'text-[#2E5A3A]', bar: 'bg-[#4F7A5B]', chip: 'bg-[#DDEBE0] text-[#2E5A3A]' },
  '1+5': { box: 'border-[#A9C1E8] bg-[#EEF3FC]', head: 'text-[#2F4A8A]', bar: 'bg-[#4A6CB8]', chip: 'bg-[#DCE6F7] text-[#2F4A8A]' },
  '2+4': { box: 'border-[#C9B5E6] bg-[#F4EFFB]', head: 'text-[#5B3A86]', bar: 'bg-[#7D5BB0]', chip: 'bg-[#E6DCF4] text-[#5B3A86]' },
  custom: { box: 'border-[#E9C98F] bg-[#FDF6E8]', head: 'text-[#8A5A12]', bar: 'bg-[#C98A22]', chip: 'bg-[#F7E7C6] text-[#8A5A12]' },
  unknown: { box: 'border-cardline bg-offwhite-200', head: 'text-charcoal/70', bar: 'bg-charcoal/40', chip: 'bg-offwhite-300/60 text-charcoal/70' },
  none: { box: 'border-dashed border-[#C9BFAE] bg-white', head: 'text-charcoal/65', bar: 'bg-charcoal/25', chip: 'bg-[#F1ECE2] text-charcoal/70' },
};
export const toneOf = (key) => CATEGORY_TONE[key] || (/^C\d/.test(String(key)) ? CATEGORY_TONE.custom : CATEGORY_TONE.unknown);
// "1+5: First 1 month" -> "First 1 month"; "Full 6 months" stays; "Custom: 45 days" -> "45 days".
export const supplyPart = (supplyLabel) => (String(supplyLabel || '').includes(': ') ? supplyLabel.split(': ').slice(1).join(': ') : supplyLabel || 'Not recorded');

// The two program cards (Autism / ADHD, Mental Health). `summary(list)` gives the small line under the name and
// `value(list)` the big number.
export function ProgramCards({ rows, program, onChoose, summary, value = (list) => list.length }) {
  return (
    <div className="mt-2 grid gap-2 sm:grid-cols-2">
      {PROGRAMS.filter((p) => p.key !== NO_PROGRAM).map((p) => {
        const list = rows.filter((x) => x.program === p.key);
        const Icon = p.icon;
        const on = program === p.key;
        return (
          <button key={p.key} type="button" onClick={() => onChoose(p.key)} className={`flex items-center justify-between rounded-xl border px-4 py-3 text-left transition ${on ? p.active : `${p.tone} hover:shadow-sm`}`}>
            <span className="flex items-center gap-2"><Icon size={18} /><span><span className="block text-sm font-bold">{p.key}</span><span className="block text-[11px] opacity-75">{summary(list)}</span></span></span>
            <span className="font-display text-2xl font-bold">{value(list)}</span>
          </button>
        );
      })}
    </div>
  );
}

// Phase 1 to 6, one at a time, each with its count.
export function PhasePills({ phases, rows, phase, onChoose }) {
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {phases.map(String).map((n) => {
        const count = rows.filter((p) => String(p.phase) === n).length;
        const on = phase === n;
        return <button key={n} type="button" onClick={() => onChoose(n)} className={`rounded-full border px-3.5 py-1.5 text-sm font-semibold transition ${on ? 'border-charcoal bg-charcoal text-white' : count ? 'border-cardline bg-white text-charcoal hover:border-charcoal/40' : 'border-dashed border-cardline bg-white text-charcoal/45 hover:border-charcoal/30'}`}>{phaseLabel(Number(n))} <span className={`ml-1 rounded-full px-1.5 text-xs ${on ? 'bg-white/20' : 'bg-offwhite-200'}`}>{count}</span></button>;
      })}
    </div>
  );
}
