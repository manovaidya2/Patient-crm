import { Check, CircleDot, ClipboardList, Pill, Stethoscope, Truck, X } from 'lucide-react';

const GROUP_ICON = { verification: ClipboardList, medicine: Pill, handover: Truck, treatment: Stethoscope };
export const poDateTime = (value) => (value ? new Date(value).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '');

const boxTone = {
  done: 'border-[#A7D3B8] bg-[#E6F2EA] text-[#1F6B41]',
  current: 'border-2 border-[#FDBA74] bg-[#FFF1E6] text-[#C2410C]',
  failed: 'border-[#F5B5B0] bg-[#FDE2E1] text-[#9F1D1D]',
  todo: 'border-[#E8DFCB] bg-[#F3EEE2] text-[#7A8286]',
};
const barTone = { done: ['bg-[#2F8F5B]', 'bg-[#2F8F5B]'], current: ['bg-[#FED7AA]', 'bg-[#F97316]'], failed: ['bg-[#F5B5B0]', 'bg-[#9F1D1D]'], todo: ['bg-[#E8DFCB]', 'bg-[#E8DFCB]'] };
const dotTone = {
  done: 'bg-[#2F8F5B] text-white border-[#2F8F5B]',
  current: 'bg-[#F97316] text-white border-[#F97316] ring-4 ring-[#F97316]/15',
  failed: 'bg-[#9F1D1D] text-white border-[#9F1D1D]',
  todo: 'bg-white text-charcoal/40 border-[#DED2BD]',
};

// Four stage boxes (PO & payment -> Medicine Dept -> Handover -> Treatment), each listing its steps.
export function PoPipelineBoxes({ groups = [], steps = [] }) {
  return (
    <ol className="grid gap-2.5 rounded-[14px] border border-[#E8DFCB] bg-white p-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Pipeline">
      {groups.map((group, index) => {
        const Icon = GROUP_ICON[group.key] || ClipboardList;
        const [track, fill] = barTone[group.state] || barTone.todo;
        const pct = group.total ? Math.max(group.state === 'current' ? 6 : 0, Math.round((group.doneCount / group.total) * 100)) : 0;
        return (
          <li key={group.key} className={`relative rounded-[10px] border px-3 py-2.5 ${boxTone[group.state]}`}>
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-2 font-display text-[12.5px] font-extrabold">
                <span className={`flex h-6 w-6 items-center justify-center rounded-full border-2 ${dotTone[group.state]}`}>{group.state === 'done' ? <Check size={13} /> : group.state === 'failed' ? <X size={13} /> : <Icon size={12} />}</span>
                {index + 1} · {group.label}
              </span>
              <span className="text-[11px] font-bold">{group.doneCount}/{group.total}{group.state === 'current' ? ' · now' : ''}</span>
            </div>
            <div className={`mt-2 h-1 overflow-hidden rounded-full ${track}`}><div className={`h-full rounded-full ${fill}`} style={{ width: `${pct}%` }} /></div>
            <ul className="mt-2.5 space-y-1.5">
              {steps.filter((step) => step.group === group.key).map((step) => (
                <li key={step.key} className="flex items-start gap-2 text-xs">
                  <span className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${dotTone[step.state]}`}>
                    {step.state === 'done' ? <Check size={10} /> : step.state === 'failed' ? <X size={10} /> : step.state === 'current' ? <CircleDot size={10} /> : null}
                  </span>
                  <span className={step.state === 'todo' ? 'text-charcoal/55' : step.state === 'current' ? 'font-extrabold' : 'font-semibold'}>{step.label}</span>
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
      {steps.map((step) => <span key={step.key} className={`h-1.5 flex-1 rounded-full ${step.state === 'done' ? 'bg-[#2F8F5B]' : step.state === 'current' ? 'bg-[#F97316]' : step.state === 'failed' ? 'bg-[#9F1D1D]' : 'bg-[#EFE3CF]'}`} />)}
    </div>
  );
}

// Vertical timeline with who / when / details for every step.
// `onRevert(step)` (admin only) offers "Revert" on done steps; the PO itself cannot be reverted.
export function PoTimeline({ steps = [], onRevert }) {
  return (
    <ol className="relative">
      {steps.map((step, index) => (
        <li key={step.key} className="group relative flex gap-3 pb-4 last:pb-0">
          {index < steps.length - 1 && <span className={`absolute left-[13px] top-7 bottom-0 w-0.5 ${step.state === 'done' ? 'bg-[#2F8F5B]/60' : 'bg-[#E8DFCB]'}`} aria-hidden="true" />}
          <span className={`relative z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 text-[11px] font-bold ${dotTone[step.state]}`}>
            {step.state === 'done' ? <Check size={13} /> : step.state === 'failed' ? <X size={13} /> : step.n}
          </span>
          <div className={`min-w-0 flex-1 rounded-lg px-3 py-1.5 ${step.state === 'current' ? 'bg-[#FFF1E6]' : step.state === 'failed' ? 'bg-[#FDE2E1]' : ''}`}>
            <p className={`flex items-center justify-between gap-2 text-[13px] ${step.state === 'todo' ? 'text-charcoal/55' : step.state === 'current' ? 'font-extrabold text-[#C2410C]' : 'font-semibold text-charcoal'}`}>
              <span>{step.label}</span>
              {onRevert && step.state === 'done' && step.key !== 'created' && <button type="button" onClick={() => onRevert(step)} className="shrink-0 rounded px-1.5 py-0.5 text-[11px] font-semibold text-[#8C3B2E] opacity-60 hover:bg-[#8C3B2E]/10 hover:opacity-100" title="Admin: undo this step and every step after it">Revert</button>}
            </p>
            {step.state !== 'todo' && (step.text || step.by || step.at) && (
              <p className="text-xs text-charcoal/60">{[step.text, step.by && `by ${step.by}`, poDateTime(step.at)].filter(Boolean).join(' · ')}</p>
            )}
            {step.state === 'current' && step.waitText && <p className="text-xs font-semibold text-[#C2410C]/85">{step.waitText}</p>}
          </div>
        </li>
      ))}
    </ol>
  );
}
