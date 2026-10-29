import { Check, CircleDot, ClipboardList, GitFork, Pill, RotateCcw, Stethoscope, Truck, X } from 'lucide-react';

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
// With `onSelect` a step can be clicked here too, like on the timeline.
export function PoPipelineBoxes({ groups = [], steps = [], selected, onSelect }) {
  const StepRow = onSelect ? 'button' : 'div';
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
                <li key={step.key}>
                  <StepRow {...(onSelect ? { type: 'button', onClick: () => onSelect(step.key), 'aria-pressed': selected === step.key } : {})} className={`flex w-full items-start gap-2 rounded-md px-1 py-0.5 text-left text-xs ${selected === step.key ? 'bg-white/80 ring-1 ring-sage' : onSelect ? 'hover:bg-white/60' : ''}`}>
                    <span className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${dotTone[step.state]}`}>
                      {step.state === 'done' ? <Check size={10} /> : step.state === 'failed' ? <X size={10} /> : step.state === 'current' ? <CircleDot size={10} /> : null}
                    </span>
                    <span className={step.state === 'todo' ? 'text-charcoal/55' : step.state === 'current' ? 'font-extrabold' : 'font-semibold'}>{step.label}</span>
                  </StepRow>
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

// The Medicine Dept track: the fulfilment stages of the medicine job (live), or - for a request without a job - the
// PO's own "ready" and "released" steps. A job stage that is a PO step ("Final check" = Medicine ready, "Release" =
// Released) selects that PO step; the others select "job:<stage key>".
const JOB_TO_PO_STEP = { final: 'ready', release: 'released' };
export function medicineTrack(steps = [], job = null) {
  if (!job?.stages?.length) return steps.filter((step) => step.branch === 'medicine');
  return job.stages.filter((stage) => stage.key !== 'accept').map((stage) => {
    const poStep = steps.find((step) => step.key === JOB_TO_PO_STEP[stage.key]);
    return poStep
      ? { ...poStep, n: stage.n, label: stage.label, jobStage: stage }
      : { key: `job:${stage.key}`, n: stage.n, label: stage.label, state: stage.state, by: stage.doneByName, at: stage.doneAt, waitText: 'Medicine Department is on this step', jobStage: stage };
  });
}

// One step of a track: smaller than a main step so two tracks fit side by side.
function TrackStep({ step, last, selected, onSelect, onRevert }) {
  const isSelected = selected === step.key;
  const Body = onSelect ? 'button' : 'div';
  return (
    <li className="relative flex gap-2 pb-2.5 last:pb-0">
      {!last && <span className={`absolute left-[10px] top-[22px] bottom-0 w-0.5 ${step.state === 'done' ? 'bg-[#2F8F5B]/60' : 'bg-[#E8DFCB]'}`} aria-hidden="true" />}
      <span className={`relative z-10 flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full border-2 text-[10px] font-bold ${dotTone[step.state] || dotTone.todo}`}>
        {step.state === 'done' ? <Check size={11} /> : step.state === 'failed' ? <X size={11} /> : step.n}
      </span>
      <div className={`relative min-w-0 flex-1 rounded-md border ${isSelected ? 'border-sage bg-sage/10 ring-2 ring-sage/15' : step.state === 'current' ? 'border-transparent bg-[#FFF1E6]' : 'border-transparent'} ${onSelect && !isSelected ? 'hover:border-cardline hover:bg-offwhite-200/70' : ''}`}>
        <Body {...(onSelect ? { type: 'button', onClick: () => onSelect(step.key), 'aria-pressed': isSelected } : {})} className={`block w-full px-2 py-1 text-left ${onRevert ? 'pr-6' : ''}`}>
          <span className={`block text-[12px] leading-snug ${step.state === 'todo' ? 'text-charcoal/55' : step.state === 'current' ? 'font-extrabold text-[#C2410C]' : 'font-semibold text-charcoal'}`}>{step.label}</span>
          {step.state === 'done' && (step.by || step.at) && <span className="block text-[11px] leading-snug text-charcoal/55">{[step.by, poDateTime(step.at)].filter(Boolean).join(' · ')}</span>}
          {step.state === 'current' && step.waitText && <span className="line-clamp-2 block text-[11px] font-semibold leading-snug text-[#C2410C]/85">{step.waitText}</span>}
        </Body>
        {onRevert && step.state === 'done' && <button type="button" onClick={() => onRevert(step)} aria-label={`Revert ${step.label}`} className="absolute right-0.5 top-0.5 rounded p-1 text-[#8C3B2E] opacity-50 hover:bg-[#8C3B2E]/10 hover:opacity-100" title="Admin: undo this step and every step after it"><RotateCcw size={11} /></button>}
      </div>
    </li>
  );
}

// Vertical timeline with who / when / details for every step.
// `onRevert(step)` (admin only) offers "Revert" on done steps; the PO itself cannot be reverted.
// With `onSelect` every step is also a filter: clicking it shows that step's work and details next to the timeline.
// Steps with a `branch` are drawn after the main line as two tracks side by side (Medicine Dept | In Transit);
// `job` (the medicine job summary) fills the Medicine Dept track with its fulfilment stages.
export function PoTimeline({ steps = [], job = null, onRevert, selected, onSelect }) {
  const trunk = steps.filter((step) => !step.branch);
  const tracks = [
    { key: 'medicine', label: 'Medicine Dept', note: job ? 'Fulfilment, live' : 'Prepares & releases', icon: Pill, steps: medicineTrack(steps, job) },
    { key: 'transit', label: 'In Transit', note: 'Delivery, payment, handover', icon: Truck, steps: steps.filter((step) => step.branch === 'transit') },
  ].filter((track) => track.steps.length);
  const split = trunk.every((step) => step.state === 'done' || step.state === 'failed');
  return (
    <div>
      <ol className="relative">
        {trunk.map((step, index) => {
          const isSelected = selected === step.key;
          const Body = onSelect ? 'button' : 'div';
          const line = index < trunk.length - 1 || tracks.length > 0;
          return (
            <li key={step.key} className="group relative flex gap-3 pb-4">
              {line && <span className={`absolute left-[13px] top-7 bottom-0 w-0.5 ${step.state === 'done' ? 'bg-[#2F8F5B]/60' : 'bg-[#E8DFCB]'}`} aria-hidden="true" />}
              <span className={`relative z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 text-[11px] font-bold ${dotTone[step.state]}`}>
                {step.state === 'done' ? <Check size={13} /> : step.state === 'failed' ? <X size={13} /> : step.n}
              </span>
              <div className={`relative min-w-0 flex-1 rounded-lg border ${isSelected ? 'border-sage bg-sage/10 ring-2 ring-sage/15' : step.state === 'current' ? 'border-transparent bg-[#FFF1E6]' : step.state === 'failed' ? 'border-transparent bg-[#FDE2E1]' : 'border-transparent'} ${onSelect && !isSelected ? 'hover:border-cardline hover:bg-offwhite-200/70' : ''}`}>
                <Body {...(onSelect ? { type: 'button', onClick: () => onSelect(step.key), 'aria-pressed': isSelected } : {})} className="block w-full px-3 py-1.5 pr-14 text-left">
                  <span className={`block text-[13px] ${step.state === 'todo' ? 'text-charcoal/55' : step.state === 'current' ? 'font-extrabold text-[#C2410C]' : 'font-semibold text-charcoal'}`}>{step.label}</span>
                  {step.state !== 'todo' && (step.text || step.by || step.at) && (
                    <span className="block text-xs text-charcoal/60">{[step.text, step.by && `by ${step.by}`, poDateTime(step.at)].filter(Boolean).join(' · ')}</span>
                  )}
                  {step.state === 'current' && step.waitText && <span className="block text-xs font-semibold text-[#C2410C]/85">{step.waitText}</span>}
                </Body>
                {onRevert && step.state === 'done' && step.key !== 'created' && <button type="button" onClick={() => onRevert(step)} className="absolute right-1.5 top-1.5 rounded px-1.5 py-0.5 text-[11px] font-semibold text-[#8C3B2E] opacity-60 hover:bg-[#8C3B2E]/10 hover:opacity-100" title="Admin: undo this step and every step after it">Revert</button>}
              </div>
            </li>
          );
        })}
      </ol>
      {tracks.length > 0 && (
        <div className="relative">
          {/* The fork: the main line splits into one line per track. */}
          <span className={`absolute left-[13px] top-0 h-0.5 w-[calc(50%+2px)] ${split ? 'bg-[#2F8F5B]/60' : 'bg-[#E8DFCB]'}`} aria-hidden="true" />
          <p className="flex items-center gap-1.5 pl-9 pt-1.5 text-[10.5px] font-bold uppercase tracking-wide text-charcoal/45"><GitFork size={12} />{split ? 'Two tracks, side by side' : 'Splits in two tracks after acceptance'}</p>
          <div className="mt-1.5 grid grid-cols-2 gap-2">
            {tracks.map((track) => {
              const Icon = track.icon;
              const done = track.steps.filter((step) => step.state === 'done').length;
              return (
                <section key={track.key} aria-label={`${track.label} track`} className="min-w-0 rounded-lg border border-[#E8DFCB] bg-[#FDFBF6] p-1.5">
                  <header className="mb-2 flex items-start justify-between gap-1 border-b border-[#E8DFCB] px-1 pb-1.5">
                    <span className="min-w-0"><span className="flex items-center gap-1 text-[12px] font-extrabold text-charcoal"><Icon size={13} className="shrink-0 text-sage" />{track.label}</span><span className="block text-[10.5px] text-charcoal/50">{track.note}</span></span>
                    <span className="shrink-0 rounded-full bg-white px-1.5 py-0.5 text-[10.5px] font-bold text-charcoal/60">{done}/{track.steps.length}</span>
                  </header>
                  <ol>
                    {track.steps.map((step, index) => (
                      <TrackStep key={step.key} step={step} last={index === track.steps.length - 1} selected={selected} onSelect={onSelect} onRevert={onRevert && !step.key.startsWith('job:') ? onRevert : undefined} />
                    ))}
                  </ol>
                </section>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// Small screens: the same steps as a scrolling strip of filters.
export function PoStepStrip({ steps = [], selected, onSelect }) {
  return (
    <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1" role="group" aria-label="Show a step">
      {[{ key: 'all', label: 'All details', state: 'all' }, ...steps].map((step) => {
        const isSelected = selected === step.key;
        return (
          <button key={step.key} type="button" aria-pressed={isSelected} onClick={() => onSelect(step.key)}
            className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold ${isSelected ? 'border-sage bg-sage text-white' : step.state === 'current' ? 'border-[#FDBA74] bg-[#FFF1E6] text-[#C2410C]' : step.state === 'done' ? 'border-[#A7D3B8] bg-[#E6F2EA] text-[#1F6B41]' : step.state === 'failed' ? 'border-[#F5B5B0] bg-[#FDE2E1] text-[#9F1D1D]' : 'border-cardline bg-white text-charcoal/60'}`}>
            {step.state === 'done' ? <Check size={12} /> : step.state === 'failed' ? <X size={12} /> : step.n ? <span>{step.n}</span> : null}{step.label}
          </button>
        );
      })}
    </div>
  );
}
