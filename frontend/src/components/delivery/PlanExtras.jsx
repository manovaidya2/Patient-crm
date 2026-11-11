import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarPlus, ClipboardCheck, ListChecks, Package, PlusCircle, Target } from 'lucide-react';
import Button from '../ui/Button.jsx';
import Badge from '../ui/Badge.jsx';
import Modal from '../ui/Modal.jsx';
import { Section } from '../ui/Layout.jsx';
import { LEVEL_CLASS, WEEKDAYS, errText, field, fmtDT, fmtDay, istDay, nowLocal, toIso } from './deliveryUi.js';

const Err = ({ text }) => (text ? <p role="alert" className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{text}</p> : null);

// The section D components of the Treatment & PO paper, as ticks.
export function TickPicker({ options, value, onChange, disabled = false }) {
  const toggle = (key) => onChange(value.includes(key) ? value.filter((k) => k !== key) : [...value, key]);
  return (
    <ul className="grid gap-1.5 sm:grid-cols-2">
      {options.map((option) => (
        <li key={option.key}>
          <label className={`flex h-full cursor-pointer items-start gap-2 rounded-lg border px-3 py-2 text-sm ${value.includes(option.key) ? 'border-sage bg-[#F3F6F2]' : 'border-cardline bg-white'}`}>
            <input type="checkbox" disabled={disabled} checked={value.includes(option.key)} onChange={() => toggle(option.key)} className="mt-0.5 h-4 w-4 shrink-0 accent-[#5F7466]" />
            <span className="min-w-0"><span className="block font-medium text-charcoal">{option.label}</span>{option.scope && <span className="block text-[11.5px] leading-snug text-charcoal/55">{option.scope}</span>}</span>
          </label>
        </li>
      ))}
    </ul>
  );
}

// Admin / Manager: correct the ticks of a running plan.
export function CorrectTicks({ plan, act, onClose }) {
  const [ticks, setTicks] = useState(plan.delivery.components.map((c) => c.key));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submit = async (event) => {
    event.preventDefault();
    if (!ticks.length) { setError('Tick at least one component'); return; }
    setBusy(true); setError('');
    try { await act('setup', { components: ticks }); onClose(); }
    catch (err) { setError(errText(err)); setBusy(false); }
  };
  return (
    <Modal open onClose={() => !busy && onClose()} title="Correct the section D ticks" className="max-w-2xl">
      <form onSubmit={submit} className="space-y-3">
        <p className="rounded-lg border border-[#F3D9A4] bg-[#FBF0DC] px-3 py-2 text-xs text-[#7C5B2E]">Sessions of a newly ticked component are added. Untouched sessions of an unticked component are cancelled; sessions already confirmed or done are never touched.</p>
        <TickPicker options={plan.setup.options} value={ticks} onChange={setTicks} />
        <Err text={error} />
        <div className="flex justify-end gap-2"><Button type="button" variant="outline" disabled={busy} onClick={onClose}>Cancel</Button><Button type="submit" disabled={busy}>{busy ? 'Saving...' : 'Save ticks'}</Button></div>
      </form>
    </Modal>
  );
}

// PCC tasks of the phase (no session: preparing the review, booking the next counselling...).
export function PlanTasks({ plan, act }) {
  const [open, setOpen] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  if (!plan.tasks.length) return null;
  const done = async (key) => {
    setBusy(true); setError('');
    try { await act(`tasks/${encodeURIComponent(key)}/done`, { note }); setOpen(''); setNote(''); }
    catch (err) { setError(errText(err)); }
    finally { setBusy(false); }
  };
  return (
    <Section title="PCC tasks" icon={ClipboardCheck}>
      <ul className="space-y-2">
        {plan.tasks.map((task) => (
          <li key={task.key} className={`rounded-lg border px-3 py-2.5 ${task.due ? 'border-[#FDBA74] bg-[#FFF7ED]' : 'border-cardline bg-white'}`}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-medium text-charcoal">{task.title}</p>
                <p className="text-xs text-charcoal/60">Due {fmtDay(istDay(task.dueDate))}{task.doneAt ? ` · done by ${task.doneByName || '-'} on ${fmtDT(task.doneAt)}` : ''}</p>
                {task.note && <p className="text-xs text-charcoal/65">Note: {task.note}</p>}
              </div>
              {task.doneAt ? <Badge tone="green">Done</Badge> : plan.canAct ? <Button size="sm" variant={task.due ? 'orange' : 'outline'} onClick={() => { setOpen(open === task.key ? '' : task.key); setNote(''); setError(''); }}>Mark done</Button> : <Badge tone={task.due ? 'action' : 'inactive'}>{task.due ? 'Due' : 'Later'}</Badge>}
            </div>
            {open === task.key && (
              <div className="mt-2 flex flex-wrap gap-2">
                <input autoFocus maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} placeholder="What was done (optional)" className={`min-w-0 flex-1 ${field}`} />
                <Button disabled={busy} onClick={() => done(task.key)}>{busy ? 'Saving...' : 'Save'}</Button>
              </div>
            )}
          </li>
        ))}
      </ul>
      <div className="mt-2"><Err text={error} /></div>
    </Section>
  );
}

// What the paper promised against what is booked and delivered.
export function PromiseTracker({ plan, onCorrect }) {
  if (!plan.tracker.length) return null;
  return (
    <Section title="Promise tracker (section D)" icon={Target} action={plan.isAdmin && plan.canAct && <Button size="sm" variant="outline" onClick={onCorrect}>Correct ticks</Button>}>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-left text-[12.5px]">
          <thead><tr className="border-b border-cardline text-[10.5px] uppercase tracking-wide text-charcoal/55"><th className="py-1.5 pr-3 font-bold">Component</th><th className="px-2 py-1.5 text-center font-bold">Promised</th><th className="px-2 py-1.5 text-center font-bold">Booked</th><th className="px-2 py-1.5 text-center font-bold">Delivered</th><th className="py-1.5 pl-3 font-bold">Note</th></tr></thead>
          <tbody>
            {plan.tracker.map((row) => {
              const full = row.promised != null && row.promised > 0 && row.delivered >= row.promised;
              return (
                <tr key={row.key} className="border-b border-cardline/60 align-top last:border-0">
                  <td className="py-2 pr-3"><span className="block font-medium text-charcoal">{row.label}</span>{row.scope && <span className="block text-[11px] leading-snug text-charcoal/55">{row.scope}</span>}</td>
                  <td className="px-2 py-2 text-center text-charcoal/75">{row.promised ?? '-'}</td>
                  <td className="px-2 py-2 text-center text-charcoal/75">{row.booked ?? '-'}</td>
                  <td className={`px-2 py-2 text-center font-bold ${full ? 'text-[#1F6B41]' : 'text-charcoal'}`}>{row.delivered ?? '-'}</td>
                  <td className="py-2 pl-3 text-charcoal/60">{row.note || ''}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-[11px] text-charcoal/55">Ticks {plan.delivery.componentsSource === 'paper' ? 'taken from the Treatment & PO paper' : 'set by hand'}{plan.delivery.componentsSetByName ? ` by ${plan.delivery.componentsSetByName}` : ''}{plan.delivery.componentsSetAt ? ` on ${fmtDT(plan.delivery.componentsSetAt)}` : ''}.</p>
    </Section>
  );
}

// Where a start date came from.
// (receipt: plans made while a supply was still dated on its receipt; kept so those records read true.)
const SUPPLY_SOURCE = { manual: 'Start date added here', receipt: 'Dated on the day the patient received this medicine', transit: 'Start date from Medicine Explanations' };
const TRACK_CLASS = { ...LEVEL_CLASS, info: 'border-cardline bg-[#F7F9F6] text-charcoal/75' };

// The medicine supplies the plan is built on. Sessions exist only for the months of medicine in hand. A phase can get
// its medicine in any split (1 + 5, 2 + 4, 1 + 2 + 3 ...): every later supply has its own purchase order, the tracker
// follows it (PO, payment, medicine, receipt), and nothing is dated by itself. Once the patient has it the PCC fills
// its medicine start date on the Medicine Explanations page (no new explanation) and the plan goes on from that day.
// A supply can still be added by hand here, and a phase that gets no more medicine is closed with a reason.
export function SupplyParts({ plan, act }) {
  const d = plan.delivery;
  const next = plan.nextSupply;
  const closed = d.supplyClosed;
  const left = Math.max(0, Math.ceil((d.phaseDays - d.coveredDays) / 30));
  // The form starts with the months and the purchase order of the awaited supply, never with a date.
  const suggested = () => ({ startDate: '', months: next?.suggest?.months ? String(next.suggest.months) : '', poNumber: next?.suggest?.poNumber || '', requestId: next?.suggest?.requestId || '' });
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState(suggested);
  const [fixing, setFixing] = useState(null);
  const [closing, setClosing] = useState(false);
  const [closeNote, setCloseNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const setClosed = async (value) => {
    setBusy(true); setError('');
    try { await act('supply-closed', value ? { closed: true, note: closeNote } : { closed: false }); setClosing(false); setCloseNote(''); }
    catch (err) { setError(errText(err)); }
    finally { setBusy(false); }
  };

  const add = async (event) => {
    event.preventDefault();
    setBusy(true); setError('');
    try { await act('parts', { startDate: form.startDate, months: Number(form.months), poNumber: form.poNumber, requestId: form.requestId }); setAdding(false); }
    catch (err) { setError(errText(err)); }
    finally { setBusy(false); }
  };
  const fix = async (event) => {
    event.preventDefault();
    setBusy(true); setError('');
    try { await act('parts', { index: fixing.index, startDate: fixing.startDate }); setFixing(null); }
    catch (err) { setError(errText(err)); }
    finally { setBusy(false); }
  };

  return (
    <Section title="Medicine supply and plan dates" icon={Package}>
      <p className="mb-2 text-xs text-charcoal/60">Plan of <b>{d.planMonths} month(s)</b>: {Math.round(d.coveredDays / 30)} month(s) of medicine started{left > 0 ? (closed ? `, ${left} month(s) not coming (closed below)` : `, ${left} month(s) still to come`) : ''}. Sessions are made only for the medicine in hand; the months can come in any split, each supply on its own purchase order.</p>
      <ul className="space-y-2">
        {d.parts.map((part) => (
          <li key={part.index} className="rounded-lg border border-cardline bg-white px-3 py-2.5">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0 text-sm">
                <p className="font-medium text-charcoal">Supply {part.index + 1}: {part.months} month(s){part.poNumber ? ` · ${part.poNumber}` : ''}</p>
                <p className="text-xs text-charcoal/65">{fmtDay(part.startDate)} to {fmtDay(part.endDate)}</p>
                <p className="text-[11px] text-charcoal/50">{SUPPLY_SOURCE[part.source] || SUPPLY_SOURCE.transit}{part.addedByName ? ` by ${part.addedByName}` : ''}{part.addedAt ? ` on ${fmtDT(part.addedAt)}` : ''}</p>
              </div>
              {plan.canAct && (['manual', 'receipt'].includes(part.source) || plan.isAdmin) && <Button size="sm" variant="ghost" onClick={() => { setFixing({ index: part.index, startDate: part.startDate }); setError(''); }}>Correct start date</Button>}
            </div>
            {fixing?.index === part.index && (
              <form onSubmit={fix} className="mt-2 flex flex-wrap items-end gap-2">
                <label className="block text-xs font-medium text-charcoal">Correct start date<input type="date" required value={fixing.startDate} onChange={(e) => setFixing((old) => ({ ...old, startDate: e.target.value }))} className={`mt-1 ${field}`} /></label>
                <Button type="submit" disabled={busy}>{busy ? 'Saving...' : 'Save'}</Button>
                <Button type="button" variant="outline" disabled={busy} onClick={() => setFixing(null)}>Cancel</Button>
                <p className="w-full text-[11px] text-charcoal/55">Only sessions nobody has touched move with the date; confirmed, moved and done sessions stay.</p>
              </form>
            )}
          </li>
        ))}
      </ul>

      {left > 0 && next && (
        <div className={`mt-3 rounded-lg border px-3 py-2.5 ${TRACK_CLASS[next.level] || TRACK_CLASS.info}`}>
          <p className="text-sm font-bold">Next supply: {next.monthsLeft} month(s) of medicine still to come{next.poNumber ? ` · ${next.poNumber}` : ''}</p>
          <p className="mt-0.5 text-xs">{next.headline}. {next.text}{next.owner ? ` (with ${next.owner})` : ''}.</p>
          <ol className="mt-2 flex flex-wrap gap-1.5">
            {next.steps.map((step) => (
              <li key={step.key} className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${step.done ? 'bg-[#E6F2EA] text-[#1F6B41]' : 'bg-white/70 text-charcoal/50'}`}>{step.done ? '✓ ' : ''}{step.label}{step.at ? ` · ${fmtDay(istDay(step.at))}` : ''}</li>
            ))}
          </ol>
          <p className="mt-2 text-[11px] opacity-80">This supply has its own purchase order and is not explained again. No date is fixed by itself: once In Transit confirms that the patient has it, the PCC fills its medicine start date on the Medicine Explanations page, and the remaining sessions and follow-ups are made from that date.</p>
        </div>
      )}

      {closed && (
        <div className="mt-3 flex flex-wrap items-start justify-between gap-2 rounded-lg border border-cardline bg-[#F7F9F6] px-3 py-2.5">
          <div className="min-w-0 text-sm">
            <p className="font-bold text-charcoal">No further supply in this phase</p>
            <p className="text-xs text-charcoal/65">Closed{closed.byName ? ` by ${closed.byName}` : ''}{closed.at ? ` on ${fmtDT(closed.at)}` : ''}{closed.note ? ` · ${closed.note}` : ''}</p>
            <p className="mt-0.5 text-[11px] text-charcoal/55">The phase ends with the medicine on record. A new medicine request of this phase reopens it by itself.</p>
          </div>
          {plan.canAct && <Button size="sm" variant="outline" disabled={busy} onClick={() => setClosed(false)}>Reopen</Button>}
        </div>
      )}

      {left > 0 && !closed && plan.canAct && (
        <div className="mt-3 rounded-lg border border-dashed border-[#FDBA74] bg-[#FFF7ED] px-3 py-2.5">
          {!adding ? (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="min-w-0 text-xs text-[#7C5B2E]">{next?.received ? `The patient has the next supply. Its medicine start date is filled on the Medicine Explanations page (already explained / skip, then the date); it can also be added here. The remaining sessions and follow-ups are made from that date.` : `Once the patient has the next supply, the PCC fills its medicine start date on the Medicine Explanations page. Only if the parent already started it another way, add it here: sessions and follow-ups for its months are made from that date.`}</p>
              <Button size="sm" variant="outline" onClick={() => { setForm(suggested()); setAdding(true); setClosing(false); setError(''); }}><PlusCircle size={14} />{next?.received ? 'Fill the start date here' : 'Add next supply by hand'}</Button>
            </div>
          ) : (
            <form onSubmit={add} className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-3">
                <label className="block text-sm font-medium text-charcoal">Medicine start date *<input type="date" required value={form.startDate} onChange={(e) => setForm((old) => ({ ...old, startDate: e.target.value }))} className={`mt-1.5 ${field}`} />{next?.runsOut && <span className="mt-1 block text-[11px] font-normal text-charcoal/55">Medicine in hand runs till {fmtDay(next.runsOut)}. Fill the day the patient really starts this supply.</span>}</label>
                <label className="block text-sm font-medium text-charcoal">Months in this supply *<select required value={form.months} onChange={(e) => setForm((old) => ({ ...old, months: e.target.value }))} className={`mt-1.5 ${field}`}><option value="">Select</option>{Array.from({ length: left }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n}</option>)}</select></label>
                <label className="block text-sm font-medium text-charcoal">PO number<input maxLength={80} value={form.poNumber} onChange={(e) => setForm((old) => ({ ...old, poNumber: e.target.value }))} placeholder="Optional" className={`mt-1.5 ${field}`} /></label>
              </div>
              <div className="flex justify-end gap-2"><Button type="button" variant="outline" disabled={busy} onClick={() => setAdding(false)}>Cancel</Button><Button type="submit" disabled={busy}>{busy ? 'Making sessions...' : 'Add supply and make sessions'}</Button></div>
            </form>
          )}
        </div>
      )}

      {/* The remaining months get no medicine (the parent stopped, or the phase was sold shorter): closed with a reason. */}
      {d.canCloseSupply && plan.canAct && !next?.requestId && !adding && (
        <div className="mt-2">
          {!closing ? (
            <button type="button" className="text-xs font-semibold text-charcoal/60 underline hover:text-charcoal" onClick={() => { setClosing(true); setCloseNote(''); setError(''); }}>No further supply is coming in this phase</button>
          ) : (
            <form onSubmit={(e) => { e.preventDefault(); setClosed(true); }} className="space-y-2 rounded-lg border border-cardline bg-white px-3 py-2.5">
              <label className="block text-sm font-medium text-charcoal">Why is no further supply coming? *<input autoFocus required minLength={3} maxLength={500} value={closeNote} onChange={(e) => setCloseNote(e.target.value)} placeholder="e.g. parent stopped after 3 months" className={`mt-1.5 ${field}`} /></label>
              <p className="text-[11px] text-charcoal/55">The phase then ends with the {Math.round(d.coveredDays / 30)} month(s) of medicine on record and its next-phase options open. Nothing is removed; it can be reopened.</p>
              <div className="flex justify-end gap-2"><Button type="button" variant="outline" disabled={busy} onClick={() => setClosing(false)}>Cancel</Button><Button type="submit" disabled={busy || closeNote.trim().length < 3}>{busy ? 'Saving...' : 'Close the supply of this phase'}</Button></div>
            </form>
          )}
        </div>
      )}
      <div className="mt-2"><Err text={error} /></div>
    </Section>
  );
}

// Plan items that were left out because their day had already passed when the plan was made.
export function SkippedItems({ plan, act }) {
  const [open, setOpen] = useState('');
  const [when, setWhen] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const items = plan.delivery.skipped;
  if (!items.length) return null;
  const add = async (key) => {
    setBusy(true); setError('');
    try { await act('add', { key, ...(when ? { dateTime: toIso(when) } : {}) }); setOpen(''); setWhen(''); }
    catch (err) { setError(errText(err)); }
    finally { setBusy(false); }
  };
  return (
    <Section title={`Left out of the plan (${items.length})`} icon={ListChecks}>
      <p className="mb-2 text-xs text-charcoal/60">These were due before the plan was made, so they were not put on the calendar. Schedule the ones the family still needs.</p>
      <ul className="space-y-2">
        {items.map((item) => (
          <li key={item.key} className="rounded-lg border border-cardline bg-white px-3 py-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0"><p className="text-sm font-medium text-charcoal">{item.title}</p><p className="text-xs text-charcoal/55">Plan day {item.day}{item.reason ? ` · ${item.reason}` : ''}</p></div>
              {plan.canAct && <Button size="sm" variant="outline" onClick={() => { setOpen(open === item.key ? '' : item.key); setWhen(''); setError(''); }}>Schedule now</Button>}
            </div>
            {open === item.key && (
              <div className="mt-2 flex flex-wrap items-end gap-2">
                <label className="block min-w-0 flex-1 text-xs font-medium text-charcoal">Date and time (leave empty for the next free working day)<input type="datetime-local" min={nowLocal()} value={when} onChange={(e) => setWhen(e.target.value)} className={`mt-1 ${field}`} /></label>
                <Button disabled={busy} onClick={() => add(item.key)}>{busy ? 'Saving...' : 'Schedule'}</Button>
              </div>
            )}
          </li>
        ))}
      </ul>
      <div className="mt-2"><Err text={error} /></div>
    </Section>
  );
}

// Sessions that are booked only when the family asks: family counselling (limited) and an extra sensory session.
// Also the short follow-ups added by hand, which stay on the patient page as before.
export function OnRequest({ plan, act }) {
  const [kind, setKind] = useState('');
  const [form, setForm] = useState({ dateTime: '', note: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const familyLeft = plan.family.limit - plan.family.used;
  const closed = plan.options.closedWeekdays.map((n) => WEEKDAYS[n]).join(', ');
  const submit = async (event) => {
    event.preventDefault();
    if (!form.dateTime) { setError('Choose the date and time'); return; }
    setBusy(true); setError('');
    try { await act('on-request', { kind, dateTime: toIso(form.dateTime), note: form.note }); setKind(''); setForm({ dateTime: '', note: '' }); }
    catch (err) { setError(errText(err)); }
    finally { setBusy(false); }
  };
  const start = (value) => { setKind(value); setForm({ dateTime: '', note: '' }); setError(''); };

  return (
    <Section title="On request and short follow-ups" icon={CalendarPlus}>
      <div className="space-y-2">
        {plan.family.ticked && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-cardline bg-white px-3 py-2.5">
            <p className="min-w-0 text-sm text-charcoal"><b>Family counselling</b> <span className="text-charcoal/60">· {plan.family.used} of {plan.family.limit} used · booked when the family asks</span></p>
            {plan.canAct && <Button size="sm" variant="outline" disabled={familyLeft <= 0} onClick={() => start('family')}>{familyLeft > 0 ? 'Book family session' : 'All used'}</Button>}
          </div>
        )}
        {plan.sensoryTicked && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-cardline bg-white px-3 py-2.5">
            <p className="min-w-0 text-sm text-charcoal"><b>Extra sensory guidance session</b> <span className="text-charcoal/60">· when the parent needs one more</span></p>
            {plan.canAct && <Button size="sm" variant="outline" onClick={() => start('sensory')}>Book extra session</Button>}
          </div>
        )}
        <div className="rounded-lg border border-cardline bg-white px-3 py-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="min-w-0 text-sm text-charcoal"><b>Short follow-ups added by hand</b> <span className="text-charcoal/60">· {plan.manual.length} on this phase · added and closed on the patient page, as before</span></p>
            <Link to={`/admin/patients/${plan.patient.id}`} className="text-xs font-bold text-sage underline">Open the patient page</Link>
          </div>
          {plan.manual.length > 0 && (
            <ul className="mt-2 space-y-1 text-xs text-charcoal/70">
              {plan.manual.map((row) => (
                <li key={row.id} className="flex flex-wrap items-center gap-x-2 gap-y-0.5"><Badge tone={row.status === 'completed' || row.status === 'sent' ? 'green' : row.status === 'cancelled' ? 'inactive' : 'teal'}>{row.status === 'completed' || row.status === 'sent' ? 'Done' : row.status === 'cancelled' ? 'Cancelled' : 'Scheduled'}</Badge><span>{fmtDT(row.dateTime)}</span><span className="text-charcoal/50">{row.list === 'familySessions' ? 'Family session' : row.followUpType === 'sfs' ? 'Short follow-up' : 'Follow-up'}</span>{row.notes && <span className="min-w-0 break-words text-charcoal/60">· {row.notes}</span>}</li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {kind && (
        <Modal open onClose={() => !busy && setKind('')} title={kind === 'family' ? `Book family counselling session (${plan.family.used + 1} of ${plan.family.limit})` : 'Book an extra sensory guidance session'} className="max-w-md">
          <form onSubmit={submit} className="space-y-3">
            <label className="block text-sm font-medium text-charcoal">Date and time *<input type="datetime-local" min={nowLocal()} required value={form.dateTime} onChange={(e) => setForm((old) => ({ ...old, dateTime: e.target.value }))} className={`mt-1.5 ${field}`} /></label>
            <p className="text-[11px] text-charcoal/55">{closed ? `Closed: ${closed}. ` : ''}Saturday, Sunday and Tuesday only from 2 pm. One plan session a day for a patient. The date is saved as confirmed with the parent.</p>
            <label className="block text-sm font-medium text-charcoal">Note<textarea rows={2} maxLength={500} value={form.note} onChange={(e) => setForm((old) => ({ ...old, note: e.target.value }))} placeholder="What the family asked for" className={`mt-1.5 ${field}`} /></label>
            <Err text={error} />
            <div className="flex justify-end gap-2"><Button type="button" variant="outline" disabled={busy} onClick={() => setKind('')}>Cancel</Button><Button type="submit" disabled={busy}>{busy ? 'Booking...' : 'Book session'}</Button></div>
          </form>
        </Modal>
      )}
    </Section>
  );
}
