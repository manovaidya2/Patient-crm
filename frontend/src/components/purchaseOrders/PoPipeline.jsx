import { Check, CircleDot, ClipboardList, Pill, Stethoscope, Truck, X } from 'lucide-react';

const GROUP_ICON = { verification: ClipboardList, medicine: Pill, handover: Truck, treatment: Stethoscope };
export const poDateTime = (value) => (value ? new Date(value).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '');

const boxTone = {
  done: 'border-emerald-600/40 bg-emerald-50 text-emerald-900',
  current: 'border-sage bg-sage/10 text-charcoal ring-2 ring-sage/20',
  failed: 'border-[#8C3B2E]/40 bg-[#8C3B2E]/8 text-[#8C3B2E]',
  todo: 'border-cardline bg-white text-charcoal/45',
};
const dotTone = {
  done: 'bg-emerald-600 text-white border-emerald-600',
  current: 'bg-white text-sage border-sage ring-4 ring-sage/15',
  failed: 'bg-[#8C3B2E] text-white border-[#8C3B2E]',
  todo: 'bg-white text-charcoal/30 border-cardline',
};

// Four stage boxes (PO & payment -> Medicine Dept -> Handover -> Treatment), each listing its steps.
export function PoPipelineBoxes({ groups = [], steps = [] }) {
  return (
    <ol className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {groups.map((group, index) => {
        const Icon = GROUP_ICON[group.key] || ClipboardList;
        return (
          <li key={group.key} className={`relative rounded-xl border p-3 ${boxTone[group.state]}`}>
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-2 text-sm font-bold">
                <span className={`flex h-7 w-7 items-center justify-center rounded-full border-2 ${dotTone[group.state]}`}>{group.state === 'done' ? <Check size={14} /> : group.state === 'failed' ? <X size={14} /> : <Icon size={14} />}</span>
                {index + 1}. {group.label}
              </span>
              <span className="text-[11px] font-semibold opacity-70">{group.doneCount}/{group.total}</span>
            </div>
            <ul className="mt-2.5 space-y-1.5">
              {steps.filter((step) => step.group === group.key).map((step) => (
                <li key={step.key} className="flex items-start gap-2 text-xs">
                  <span className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${dotTone[step.state]}`}>
                    {step.state === 'done' ? <Check size={10} /> : step.state === 'failed' ? <X size={10} /> : step.state === 'current' ? <CircleDot size={10} /> : null}
                  </span>
                  <span className={step.state === 'todo' ? 'text-charcoal/45' : 'font-semibold'}>{step.label}</span>
                </li>
              ))}
            </ul>
          </li>
        );
      })}
    </ol>
  );
}

// Thin bar for list rows: one segment per step.
export function PoProgressBar({ steps = [] }) {
  return (
    <div className="flex gap-0.5" aria-hidden="true">
      {steps.map((step) => <span key={step.key} className={`h-1.5 flex-1 rounded-full ${step.state === 'done' ? 'bg-emerald-600' : step.state === 'current' ? 'bg-sage' : step.state === 'failed' ? 'bg-[#8C3B2E]' : 'bg-cardline'}`} />)}
    </div>
  );
}

// Vertical timeline with who / when / details for every step.
export function PoTimeline({ steps = [] }) {
  return (
    <ol className="relative">
      {steps.map((step, index) => (
        <li key={step.key} className="relative flex gap-3 pb-4 last:pb-0">
          {index < steps.length - 1 && <span className={`absolute left-[13px] top-7 bottom-0 w-0.5 ${step.state === 'done' ? 'bg-emerald-600/60' : 'bg-cardline'}`} aria-hidden="true" />}
          <span className={`relative z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 text-[11px] font-bold ${dotTone[step.state]}`}>
            {step.state === 'done' ? <Check size={13} /> : step.state === 'failed' ? <X size={13} /> : step.n}
          </span>
          <div className={`min-w-0 flex-1 rounded-lg px-3 py-1.5 ${step.state === 'current' ? 'bg-sage/10' : step.state === 'failed' ? 'bg-[#8C3B2E]/8' : ''}`}>
            <p className={`text-sm ${step.state === 'todo' ? 'text-charcoal/45' : 'font-semibold text-charcoal'}`}>{step.label}</p>
            {step.state !== 'todo' && (step.text || step.by || step.at) && (
              <p className="text-xs text-charcoal/60">{[step.text, step.by && `by ${step.by}`, poDateTime(step.at)].filter(Boolean).join(' · ')}</p>
            )}
            {step.state === 'current' && step.waitText && <p className="text-xs font-semibold text-sage">{step.waitText}</p>}
          </div>
        </li>
      ))}
    </ol>
  );
}
