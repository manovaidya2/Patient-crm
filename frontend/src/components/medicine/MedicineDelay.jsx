import { Lock } from 'lucide-react';

const day = (iso) => (iso ? new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '-');

// One step's delay against the date fixed in post counselling, e.g. "Medicine Dept: 2 days late" or "on time".
function Step({ label, step }) {
  if (!step) return null;
  const late = step.daysLate > 0;
  const text = step.done
    ? (late ? `${step.daysLate} day${step.daysLate === 1 ? '' : 's'} late` : 'on time')
    : (late ? `running ${step.daysLate} day${step.daysLate === 1 ? '' : 's'} late` : 'not due yet');
  const tone = late ? 'bg-[#FDE2E1] text-[#9F1D1D]' : step.done ? 'bg-[#E8F5EC] text-[#1F6B41]' : 'bg-[#F4EFE4] text-charcoal/70';
  return <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${tone}`} title={step.at ? `Done ${day(step.at)}` : 'Not done yet'}>{label}: {text}</span>;
}

// Delays for one medicine: made by the Medicine Department, and released to In Transit, against the expected date.
export function DelayChips({ delay, show = ['medicine', 'transit'], className = '' }) {
  if (!delay) return null;
  return (
    <span className={`inline-flex flex-wrap items-center gap-1.5 ${className}`}>
      {show.includes('medicine') && <Step label="Medicine Dept" step={delay.medicine} />}
      {show.includes('transit') && <Step label="Reached In Transit" step={delay.transit} />}
      {show.includes('dispatch') && <Step label={delay.dispatchLabel || 'Dispatch'} step={delay.dispatch} />}
    </span>
  );
}

// The same delays in full: who, expected date, actual date and days late - also once done (the record stays).
export function DelayTable({ delay, className = '' }) {
  const rows = delay ? [
    ['Medicine made', 'Medicine Dept', delay.medicine],
    ['Released to In Transit', 'Medicine Dept', delay.transit],
    [delay.dispatchLabel || 'Dispatch', 'In Transit', delay.dispatch],
  ].filter(([, , step]) => step) : [];
  if (!rows.length) return null;
  return (
    <div className={`overflow-x-auto rounded-lg border border-cardline ${className}`}>
      <table className="w-full min-w-[460px] text-left text-[12.5px]">
        <thead className="bg-[#FBF7ED] text-[11px] uppercase tracking-wide text-charcoal/55"><tr><th className="px-3 py-1.5">Step</th><th className="px-3 py-1.5">Expected</th><th className="px-3 py-1.5">Actual</th><th className="px-3 py-1.5">Delay</th></tr></thead>
        <tbody className="divide-y divide-cardline">
          {rows.map(([label, team, step]) => (
            <tr key={label}>
              <td className="px-3 py-1.5"><span className="font-semibold text-charcoal">{label}</span><span className="block text-[11px] text-charcoal/50">{team}</span></td>
              <td className="px-3 py-1.5 text-charcoal/75">{day(step.expected)}</td>
              <td className="px-3 py-1.5 text-charcoal/75">{step.done ? day(step.at) : 'not yet'}</td>
              <td className="px-3 py-1.5"><Step label={step.done ? 'Done' : 'Now'} step={step} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Shown next to the ready date / supply where they cannot be changed.
export function FixedNote({ children = 'Set by post counselling (PO paper). Only the admin can change it.' }) {
  return <p className="mt-1 flex items-center gap-1 text-[11.5px] text-charcoal/60"><Lock size={11} aria-hidden="true" />{children}</p>;
}
