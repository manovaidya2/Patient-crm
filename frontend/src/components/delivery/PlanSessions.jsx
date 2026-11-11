import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarClock, ChevronDown, ChevronRight, Stethoscope } from 'lucide-react';
import Button from '../ui/Button.jsx';
import Badge from '../ui/Badge.jsx';
import Modal from '../ui/Modal.jsx';
import { Section } from '../ui/Layout.jsx';
import SessionConsole from './SessionConsole.jsx';
import { STATE_TONE, WEEKDAYS, errText, field, fmtDT, istDay, istToday, nowLocal, toIso, toLocalInput } from './deliveryUi.js';

const OPEN_STATES = new Set(['tentative', 'confirmed', 'form_due', 'overdue', 'missed']);
const FILTERS = [['open', 'To do'], ['done', 'Done'], ['other', 'Rescheduled / not needed'], ['all', 'All']];
const SECTION_LABEL = { pre: 'Before starting', sop: 'Session steps', integrated: 'Reviews on this follow-up', teachback: 'Teach-back' };
const tab = (on) => `rounded-full border px-3 py-1 text-xs font-bold transition ${on ? 'border-sage bg-sage text-white' : 'border-cardline bg-white text-charcoal/65 hover:border-sage/50'}`;

// Everything that is on record for one session (shown when its row is opened).
function SessionDetails({ session, options }) {
  const close = session.close;
  return (
    <div className="mt-2 space-y-2 border-t border-cardline pt-2 text-xs text-charcoal/75">
      <p>{session.auto ? 'Made by the plan' : session.onRequest ? 'Booked on request' : 'Added by hand'}{session.day ? ` · plan day ${session.day}` : ''}{session.createdByName ? ` · by ${session.createdByName}` : ''}{session.mode ? ` · ${session.mode}` : ''}{session.duration ? ` · about ${session.duration} min` : ''}</p>
      {session.components.length > 0 && <p>Covers: {session.components.map((c) => c.label).join(', ')}</p>}
      {session.notes && <p>Note: {session.notes}</p>}
      {session.confirmedAt && <p>Confirmed with the parent by {session.confirmedByName || '-'} on {fmtDT(session.confirmedAt)}</p>}
      {session.movedAt && <p>Date changed on {fmtDT(session.movedAt)}{session.rescheduleReason ? ` · ${session.rescheduleReason}` : ''}{session.rescheduledFrom ? ' (takes the place of an earlier session)' : ''}</p>}
      {session.missedAt && <p className="text-[#9F1D1D]">Missed: {session.missReason} · marked by {session.missedByName || '-'} on {fmtDT(session.missedAt)}</p>}
      {session.status === 'cancelled' && <p>{session.rescheduledTo ? 'Rescheduled' : 'Not needed'}: {session.cancelReason || '-'} · by {session.cancelledByName || '-'} on {fmtDT(session.cancelledAt)}</p>}
      {session.state === 'done' && (
        <>
          <p className="font-bold text-[#1F6B41]">Closed by {session.completedByName || '-'} on {fmtDT(session.completedAt)}</p>
          {session.checklist.length > 0 ? (
            <ul className="space-y-1">
              {session.checklist.map((line) => (
                <li key={line.key} className="flex items-start gap-2">
                  <Badge tone={line.answer === 'done' ? 'green' : 'amber'} className="mt-0.5 shrink-0">{line.answer === 'done' ? 'Done' : 'N/A'}</Badge>
                  <span className="min-w-0"><span className="text-charcoal/50">{SECTION_LABEL[line.section] || ''}{SECTION_LABEL[line.section] ? ': ' : ''}</span>{line.text}{line.reason ? <span className="text-charcoal/60"> ({line.reason})</span> : null}</span>
                </li>
              ))}
            </ul>
          ) : session.completionDetails && <p>{session.completionDetails}</p>}
          {close && (
            <div className="rounded-lg border border-cardline bg-white px-2.5 py-2">
              <p><b>Red flag:</b> {close.redFlag ? <span className="font-bold text-[#9F1D1D]">Yes: {close.concern}</span> : 'No'}{session.adviceId && <> · <Link to={`/admin/patient-queries?q=${session.adviceId}`} className="font-bold text-sage underline">Open the doctor query</Link></>}</p>
              <p><b>Parent understanding:</b> {options.understanding[close.understanding] || close.understanding || '-'}</p>
              <p><b>Recording:</b> {options.recording[close.recording] || close.recording || '-'}</p>
              {close.homeTask && <p><b>Home task:</b> {close.homeTask}</p>}
            </div>
          )}
        </>
      )}
      {session.state !== 'done' && session.lines.length > 0 && <p className="text-charcoal/55">{session.lines.length} checklist lines to fill when the session is taken.</p>}
    </div>
  );
}

// Change the date of a session. A tentative date simply moves; a confirmed or missed one is rescheduled with a
// reason and counts towards the phase's limit.
function MoveModal({ session, plan, onClose, act }) {
  const counts = Boolean(session.confirmedAt || session.missedAt);
  const d = plan.delivery;
  const [form, setForm] = useState({ dateTime: new Date(session.dateTime) > new Date() ? toLocalInput(session.dateTime) : '', reason: '', confirmed: counts });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const limitHit = counts && d.reschedulesUsed >= d.rescheduleLimit;
  const closed = plan.options.closedWeekdays.map((n) => WEEKDAYS[n]).join(', ');

  const submit = async (event) => {
    event.preventDefault();
    if (!form.dateTime) { setError('Choose the new date and time'); return; }
    if (counts && !form.reason.trim()) { setError('Write the reason for rescheduling'); return; }
    setBusy(true); setError('');
    try { await act(`sessions/${session.id}/reschedule`, { dateTime: toIso(form.dateTime), reason: form.reason, confirmed: form.confirmed }); onClose(); }
    catch (err) { setError(errText(err)); setBusy(false); }
  };

  return (
    <Modal open onClose={() => !busy && onClose()} title={counts ? 'Reschedule session' : 'Move the date'} className="max-w-lg">
      <form onSubmit={submit} className="space-y-3">
        <p className="text-sm text-charcoal/75"><b>{session.title}</b><br />Now on {fmtDT(session.dateTime)}</p>
        {counts
          ? <p className={`rounded-lg border px-3 py-2 text-xs ${limitHit ? 'border-[#FCA5A5] bg-[#FEF2F2] text-[#9F1D1D]' : 'border-[#F3D9A4] bg-[#FBF0DC] text-[#7C5B2E]'}`}>This session was {session.missedAt ? 'missed' : 'confirmed with the parent'}, so this counts as a reschedule: {d.reschedulesUsed} of {d.rescheduleLimit} used in this phase.{limitHit && (plan.isAdmin ? ' The limit is used up; you can still reschedule as Admin / Manager.' : ' The limit is used up: only the Admin or the Manager can reschedule now.')}</p>
          : <p className="rounded-lg border border-sage/30 bg-sage/10 px-3 py-2 text-xs text-charcoal/75">This date is still tentative, so moving it is free and does not count as a reschedule.</p>}
        <label className="block text-sm font-medium text-charcoal">New date and time *<input type="datetime-local" min={nowLocal()} required value={form.dateTime} onChange={(e) => setForm((old) => ({ ...old, dateTime: e.target.value }))} className={`mt-1.5 ${field}`} /></label>
        <p className="text-[11px] text-charcoal/55">{closed ? `Closed: ${closed}. ` : ''}Saturday, Sunday and Tuesday only from 2 pm. Holidays are not allowed. One plan session a day for a patient.</p>
        <label className="block text-sm font-medium text-charcoal">Reason {counts ? '*' : '(optional)'}<input maxLength={300} value={form.reason} onChange={(e) => setForm((old) => ({ ...old, reason: e.target.value }))} placeholder="Why the date is changing" className={`mt-1.5 ${field}`} /></label>
        <label className="flex items-center gap-2 text-sm text-charcoal"><input type="checkbox" checked={form.confirmed} onChange={(e) => setForm((old) => ({ ...old, confirmed: e.target.checked }))} className="h-4 w-4 accent-[#5F7466]" />The parent agreed to this date (mark it confirmed)</label>
        {error && <p role="alert" className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        <div className="flex justify-end gap-2"><Button type="button" variant="outline" disabled={busy} onClick={onClose}>Cancel</Button><Button type="submit" disabled={busy || (limitHit && !plan.isAdmin)}>{busy ? 'Saving...' : counts ? 'Reschedule' : 'Move date'}</Button></div>
      </form>
    </Modal>
  );
}

function MissedModal({ session, reasons, onClose, act }) {
  const [reason, setReason] = useState('');
  const [other, setOther] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submit = async (event) => {
    event.preventDefault();
    const value = reason === 'other' ? other.trim() : reason;
    if (!value) { setError('Choose why the session was missed'); return; }
    setBusy(true); setError('');
    try { await act(`sessions/${session.id}/missed`, { reason: value }); onClose(true); }
    catch (err) { setError(errText(err)); setBusy(false); }
  };
  return (
    <Modal open onClose={() => !busy && onClose(false)} title="Mark session missed" className="max-w-md">
      <form onSubmit={submit} className="space-y-3">
        <p className="text-sm text-charcoal/75"><b>{session.title}</b><br />{fmtDT(session.dateTime)}</p>
        <fieldset className="space-y-1.5">
          <legend className="text-sm font-medium text-charcoal">Why was it missed? *</legend>
          {[...reasons, 'other'].map((item) => (
            <label key={item} className="flex items-center gap-2 rounded-lg border border-cardline bg-white px-3 py-2 text-sm text-charcoal"><input type="radio" name="miss-reason" checked={reason === item} onChange={() => setReason(item)} className="accent-[#5F7466]" />{item === 'other' ? 'Other reason' : item}</label>
          ))}
          {reason === 'other' && <input autoFocus maxLength={300} value={other} onChange={(e) => setOther(e.target.value)} placeholder="Write the reason" className={field} />}
        </fieldset>
        <p className="text-[11px] text-charcoal/55">The session stays on record as missed. Next, reschedule it to a new date.</p>
        {error && <p role="alert" className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        <div className="flex justify-end gap-2"><Button type="button" variant="outline" disabled={busy} onClick={() => onClose(false)}>Cancel</Button><Button type="submit" variant="danger" disabled={busy}>{busy ? 'Saving...' : 'Mark missed'}</Button></div>
      </form>
    </Modal>
  );
}

function NotNeededModal({ session, onClose, act }) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submit = async (event) => {
    event.preventDefault();
    if (reason.trim().length < 5) { setError('Write why this session is not needed'); return; }
    setBusy(true); setError('');
    try { await act(`sessions/${session.id}/cancel`, { reason }); onClose(); }
    catch (err) { setError(errText(err)); setBusy(false); }
  };
  return (
    <Modal open onClose={() => !busy && onClose()} title="Session not needed" className="max-w-md">
      <form onSubmit={submit} className="space-y-3">
        <p className="text-sm text-charcoal/75"><b>{session.title}</b><br />{fmtDT(session.dateTime)}</p>
        <p className="rounded-lg border border-[#F3D9A4] bg-[#FBF0DC] px-3 py-2 text-xs text-[#7C5B2E]">The session is taken off the calendar but stays on record with your reason. The plan does not make it again.</p>
        <label className="block text-sm font-medium text-charcoal">Reason *<textarea rows={2} maxLength={300} required value={reason} onChange={(e) => setReason(e.target.value)} className={`mt-1.5 ${field}`} /></label>
        {error && <p role="alert" className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        <div className="flex justify-end gap-2"><Button type="button" variant="outline" disabled={busy} onClick={onClose}>Cancel</Button><Button type="submit" variant="danger" disabled={busy}>{busy ? 'Saving...' : 'Mark not needed'}</Button></div>
      </form>
    </Modal>
  );
}

// The schedule of the phase: every plan session with its state and what can be done with it now.
export default function PlanSessions({ plan, act, focusId = '' }) {
  const [filter, setFilter] = useState('open');
  const [openRows, setOpenRows] = useState(() => new Set(focusId ? [focusId] : []));
  const [modal, setModal] = useState(null);
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');
  const today = istToday();
  const d = plan.delivery;

  const counts = useMemo(() => ({
    open: plan.sessions.filter((s) => OPEN_STATES.has(s.state)).length,
    done: plan.sessions.filter((s) => s.state === 'done').length,
    other: plan.sessions.filter((s) => s.state === 'rescheduled' || s.state === 'cancelled').length,
    all: plan.sessions.length,
  }), [plan.sessions]);
  const rows = plan.sessions.filter((s) => (filter === 'all' ? true : filter === 'open' ? OPEN_STATES.has(s.state) : filter === 'done' ? s.state === 'done' : s.state === 'rescheduled' || s.state === 'cancelled'));
  const windowEnd = Date.now() + d.confirmWindowDays * 86400000;
  const toConfirm = plan.sessions.filter((s) => s.state === 'tentative' && new Date(s.dateTime).getTime() <= windowEnd).length;
  const live = modal ? plan.sessions.find((s) => s.id === modal.id) : null;

  const toggle = (id) => setOpenRows((old) => { const next = new Set(old); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const quick = async (id, path, body) => {
    setBusyId(id); setError('');
    try { await act(path, body); } catch (err) { setError(errText(err)); } finally { setBusyId(''); }
  };

  return (
    <Section title={`Sessions and follow-ups (${counts.all})`} icon={CalendarClock}
      action={plan.canAct && toConfirm > 0 && <Button size="sm" variant="orange" disabled={busyId === 'window'} onClick={() => quick('window', 'confirm', { window: true })}>{busyId === 'window' ? 'Confirming...' : `Confirm the next ${d.confirmWindowDays} days (${toConfirm})`}</Button>}>
      <p className="mb-3 text-xs text-charcoal/60">Dates made by the plan are <b>tentative</b> until they are told to the parent (Confirm). A session is closed only through its checklist, on its day or later. Reschedules used: <b>{d.reschedulesUsed} of {d.rescheduleLimit}</b> (moving a tentative date is free).</p>
      <div className="mb-3 flex flex-wrap gap-1.5">{FILTERS.map(([key, text]) => <button key={key} type="button" aria-pressed={filter === key} onClick={() => setFilter(key)} className={tab(filter === key)}>{text} ({counts[key]})</button>)}</div>
      {error && <p role="alert" className="mb-3 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {rows.length === 0
        ? <p className="rounded-xl border border-dashed border-cardline py-8 text-center text-sm text-charcoal/55">{filter === 'open' ? 'No session is waiting. ' : 'Nothing here.'}{filter === 'open' && plan.status === 'delivered' && 'The treatment delivery of this phase is complete.'}</p>
        : (
          <ul className="space-y-2">
            {rows.map((s) => {
              const isOpen = OPEN_STATES.has(s.state);
              const dayCame = istDay(s.dateTime) <= today;
              const expanded = openRows.has(s.id);
              const hot = s.state === 'missed' || s.state === 'form_due' || s.state === 'overdue';
              return (
                <li key={s.id} id={`session-${s.id}`} className={`rounded-[12px] border px-3 py-2.5 ${hot ? 'border-[#FCA5A5] bg-[#FFFBFA]' : istDay(s.dateTime) === today && isOpen ? 'border-[#FDBA74] bg-[#FFF7ED]' : 'border-[#E8DFCB] bg-white'}`}>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <button type="button" onClick={() => toggle(s.id)} aria-expanded={expanded} className="flex min-w-0 flex-1 items-start gap-1.5 text-left">
                      {expanded ? <ChevronDown size={15} className="mt-0.5 shrink-0 text-charcoal/50" /> : <ChevronRight size={15} className="mt-0.5 shrink-0 text-charcoal/50" />}
                      <span className="min-w-0">
                        <span className="block text-[13.5px] font-bold text-charcoal">{s.title}</span>
                        <span className="block text-xs text-charcoal/65">{fmtDT(s.dateTime)}{istDay(s.dateTime) === today && isOpen ? ' · today' : ''}</span>
                        {s.state === 'missed' && <span className="block text-xs text-[#9F1D1D]">Missed: {s.missReason}. Reschedule it.</span>}
                        {s.state === 'form_due' && <span className="block text-xs text-[#9F1D1D]">The date has passed: fill the session checklist, or mark it missed.</span>}
                        {s.state === 'overdue' && <span className="block text-xs text-[#9F1D1D]">The date passed without a confirmation: take it, move it or mark it missed.</span>}
                      </span>
                    </button>
                    <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                      {s.role === 'doctor' && <Badge tone="purple"><Stethoscope size={11} />Doctor review</Badge>}
                      {s.onRequest && <Badge tone="default">On request</Badge>}
                      <Badge tone={STATE_TONE[s.state] || 'default'}>{s.stateLabel}</Badge>
                    </div>
                  </div>

                  {isOpen && plan.canAct && (
                    <div className="mt-2 flex flex-wrap gap-1.5 pl-5">
                      {dayCame && <Button size="sm" variant={s.state === 'missed' ? 'outline' : 'orange'} onClick={() => setModal({ type: 'console', id: s.id })}>Open session</Button>}
                      {s.state === 'tentative' && <Button size="sm" disabled={busyId === s.id} onClick={() => quick(s.id, 'confirm', { entryIds: [s.id] })}>{busyId === s.id ? 'Confirming...' : 'Confirm with parent'}</Button>}
                      <Button size="sm" variant={s.state === 'missed' ? 'orange' : 'outline'} onClick={() => setModal({ type: 'move', id: s.id })}>{s.confirmedAt || s.missedAt ? 'Reschedule' : 'Move date'}</Button>
                      {dayCame && !s.missedAt && <Button size="sm" variant="outline" onClick={() => setModal({ type: 'missed', id: s.id })}>Mark missed</Button>}
                      {plan.isAdmin && <Button size="sm" variant="ghost" onClick={() => setModal({ type: 'cancel', id: s.id })}>Not needed</Button>}
                    </div>
                  )}
                  {expanded && <div className="pl-5"><SessionDetails session={s} options={plan.options} /></div>}
                </li>
              );
            })}
          </ul>
        )}

      {live && modal.type === 'console' && <SessionConsole session={live} options={plan.options} onClose={() => setModal(null)} onSubmit={async (body) => { await act(`sessions/${live.id}/complete`, body); setModal(null); setOpenRows((old) => new Set(old).add(live.id)); setFilter('done'); }} />}
      {live && modal.type === 'move' && <MoveModal session={live} plan={plan} act={act} onClose={() => setModal(null)} />}
      {live && modal.type === 'missed' && <MissedModal session={live} reasons={plan.options.missReasons} act={act} onClose={(saved) => setModal(saved ? { type: 'move', id: live.id } : null)} />}
      {live && modal.type === 'cancel' && <NotNeededModal session={live} act={act} onClose={() => setModal(null)} />}
    </Section>
  );
}
