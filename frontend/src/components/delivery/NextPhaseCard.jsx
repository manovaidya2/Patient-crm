import { useState } from 'react';
import { CalendarPlus, Clock, History, PhoneCall, XCircle } from 'lucide-react';
import api from '../../api/axios.js';
import Button from '../ui/Button.jsx';
import Badge from '../ui/Badge.jsx';
import { Section } from '../ui/Layout.jsx';
import { errText, field, fmtDT, fmtDay, istToday, nowLocal, toIso } from './deliveryUi.js';

const CHOICES = [
  ['book', CalendarPlus, 'Book the next-phase appointment', 'The family is continuing: book the counselling visit now. Reception sees it on that date.'],
  ['time', Clock, 'Parent needs time', 'Set a call-back date. It goes on the follow-up list and this card asks again on that day.'],
  ['stop', XCircle, 'Not continuing', 'The family is not taking the next phase. The reason is kept on record.'],
];
const DECISION_LABEL = { book: 'Appointment booked', time: 'Parent needs time', stop: 'Not continuing' };
const DECISION_TONE = { book: 'green', time: 'amber', stop: 'danger' };

const DecisionText = ({ record }) => (
  <>
    {record.decision === 'book' && <p className="text-sm text-charcoal">Appointment <b>{record.appointmentCode}</b> booked for <b>{fmtDay(record.appointmentDate)}</b>. Reception has it in Appointment Management on that date.</p>}
    {record.decision === 'time' && <p className="text-sm text-charcoal">Call the parent back on <b>{fmtDT(record.followUpAt)}</b>. The call-back is on the follow-up list.</p>}
    {record.decision === 'stop' && <p className="text-sm text-charcoal">Reason: {record.reason}</p>}
    {record.note && record.decision !== 'stop' && <p className="mt-0.5 text-xs text-charcoal/65">Note: {record.note}</p>}
    <p className="mt-1 text-[11px] text-charcoal/55">Saved by {record.byName || '-'} on {fmtDT(record.at)}{record.deliveredWhenDecided ? ' · after the treatment delivery was complete' : ' · before the phase ended'}</p>
  </>
);

// What happens after this phase: once the treatment delivery is done (or in the last days of the phase) the PCC must
// choose one of three things - book the next-phase appointment, the parent needs time, or not continuing.
export default function NextPhaseCard({ plan, act }) {
  const np = plan.nextPhase;
  const [choice, setChoice] = useState('');
  const [info, setInfo] = useState(null);
  const [booking, setBooking] = useState(null);
  const [later, setLater] = useState({ followUpAt: '', note: '' });
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [showHistory, setShowHistory] = useState(false);
  if (!np) return null;

  const record = np.decision;
  const mayDecide = plan.canAct && (np.due || plan.isAdmin);
  const waiting = np.due && (!record || np.callBackDue);

  const pick = async (key) => {
    setChoice(key); setError('');
    if (key !== 'book' || info) return;
    try {
      const { data } = await api.get(`/patients/${plan.patient.id}/book-appointment`, { skipCache: true });
      setInfo(data);
      setBooking({ appointmentDate: '', time: '', note: '', ...data.defaults });
    } catch (err) { setError(errText(err, 'The appointment form could not be opened')); }
  };
  const changeBooking = (key) => (e) => setBooking((old) => ({ ...old, [key]: e.target.value }));

  const submit = async (event) => {
    event.preventDefault();
    let body;
    if (choice === 'book') {
      if (!booking?.appointmentDate) { setError('Choose the appointment date'); return; }
      body = { decision: 'book', booking };
    } else if (choice === 'time') {
      if (!later.followUpAt) { setError('Choose when to call the parent back'); return; }
      body = { decision: 'time', followUpAt: toIso(later.followUpAt), note: later.note };
    } else {
      if (reason.trim().length < 5) { setError('Write why the parent is not continuing'); return; }
      body = { decision: 'stop', reason };
    }
    setBusy(true); setError('');
    try {
      await act('next-phase', body);
      setChoice(''); setReason(''); setLater({ followUpAt: '', note: '' }); setInfo(null); setBooking(null);
    } catch (err) { setError(errText(err)); }
    finally { setBusy(false); }
  };

  const headline = np.delivered
    ? 'The treatment delivery of this phase is complete.'
    : np.due ? `This phase ends on ${fmtDay(np.endDate)}.` : `The phase runs till ${fmtDay(np.endDate)}.`;

  return (
    <Section title="Next phase" icon={CalendarPlus} tone={waiting ? 'action' : undefined}
      action={record ? <Badge tone={np.callBackDue ? 'action' : DECISION_TONE[record.decision]}>{np.callBackDue ? 'Call back due' : DECISION_LABEL[record.decision]}</Badge> : np.due ? <Badge tone="action">Decision needed</Badge> : <Badge tone="inactive">Not open yet</Badge>}>
      <p className="text-sm text-charcoal/75">{headline}{!record && np.due && ' Choose what happens next: a phase is never closed without a decision.'}</p>

      {record && (
        <div className="mt-3 rounded-lg border border-cardline bg-[#FCFAF5] px-3 py-2.5">
          <DecisionText record={record} />
          {np.callBackDue && <p className="mt-2 flex items-center gap-1.5 rounded bg-[#FFF1E6] px-2 py-1.5 text-xs font-bold text-[#C2410C]"><PhoneCall size={13} />The call-back time has come. Talk to the parent and choose again below.</p>}
        </div>
      )}

      {!mayDecide && !record && <p className="mt-3 rounded-lg border border-dashed border-cardline px-3 py-2.5 text-xs text-charcoal/60">The three options (book the appointment / parent needs time / not continuing) open on <b>{fmtDay(np.opensOn)}</b>, or earlier once every session of the plan is done.</p>}

      {mayDecide && (
        <div className="mt-3 space-y-3">
          {record && !choice && <p className="text-xs text-charcoal/60">{np.callBackDue ? 'Choose again:' : 'The decision can be changed; the earlier one stays in the history.'}</p>}
          {!np.due && plan.isAdmin && <p className="text-xs text-charcoal/55">Not open for the PCC yet (opens on {fmtDay(np.opensOn)}). The Admin / Manager can decide earlier.</p>}
          <div className="grid gap-2 sm:grid-cols-3">
            {CHOICES.map(([key, Icon, title, hint]) => (
              <button key={key} type="button" aria-pressed={choice === key} onClick={() => pick(key)}
                className={`rounded-[12px] border px-3 py-2.5 text-left transition ${choice === key ? 'border-sage bg-[#F3F6F2] ring-1 ring-sage' : 'border-[#E8DFCB] bg-white hover:border-sage/50'}`}>
                <span className="flex items-center gap-1.5 text-[13px] font-bold text-charcoal"><Icon size={15} className="text-sage" />{title}</span>
                <span className="mt-0.5 block text-[11.5px] leading-snug text-charcoal/60">{hint}</span>
              </button>
            ))}
          </div>

          {choice && (
            <form onSubmit={submit} className="space-y-3 rounded-lg border border-cardline bg-white p-3">
              {choice === 'book' && !info && !error && <p className="text-sm text-charcoal/60">Opening the appointment form...</p>}
              {choice === 'book' && info && !info.allowed && <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{info.reason || 'An appointment cannot be booked for this patient.'}</p>}
              {choice === 'book' && info?.allowed && booking && (
                <>
                  <p className="rounded-lg border border-sage/30 bg-sage/10 px-3 py-2 text-xs text-charcoal/75">Booked as an existing patient with the old Patient ID; name, age, parent and mobile are taken from the patient record.{info.upcoming?.length > 0 && ` Already booked: ${info.upcoming.map((row) => `${fmtDay(row.appointmentDate)} (${row.appointmentCode})`).join(', ')}.`}</p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="block text-sm font-medium text-charcoal">Appointment date *<input type="date" min={istToday()} required value={booking.appointmentDate} onChange={changeBooking('appointmentDate')} className={`mt-1.5 ${field}`} /></label>
                    <label className="block text-sm font-medium text-charcoal">Time told to the family<input type="time" value={booking.time} onChange={changeBooking('time')} className={`mt-1.5 ${field}`} /></label>
                    <label className="block text-sm font-medium text-charcoal">Mode *<select value={booking.mode} onChange={changeBooking('mode')} className={`mt-1.5 ${field}`}>{info.options.modes.map((m) => <option key={m} value={m}>{m}</option>)}</select></label>
                    <label className="block text-sm font-medium text-charcoal">Lead type *<select value={booking.leadType} onChange={changeBooking('leadType')} className={`mt-1.5 ${field}`}>{info.options.leadTypes.map((m) => <option key={m} value={m}>{m}</option>)}</select></label>
                    <label className="block text-sm font-medium text-charcoal sm:col-span-2">Case category *<select required value={booking.caseCategory} onChange={changeBooking('caseCategory')} className={`mt-1.5 ${field}`}><option value="">Select</option>{info.options.caseCategories.map((m) => <option key={m} value={m}>{m}</option>)}</select></label>
                  </div>
                  <label className="block text-sm font-medium text-charcoal">Note for reception<textarea rows={2} maxLength={1000} value={booking.note} onChange={changeBooking('note')} placeholder="What was discussed with the family, next phase plan..." className={`mt-1.5 ${field}`} /></label>
                </>
              )}
              {choice === 'time' && (
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block text-sm font-medium text-charcoal">Call the parent back on *<input type="datetime-local" min={nowLocal()} required value={later.followUpAt} onChange={(e) => setLater((old) => ({ ...old, followUpAt: e.target.value }))} className={`mt-1.5 ${field}`} /></label>
                  <label className="block text-sm font-medium text-charcoal">What the parent said<input maxLength={1000} value={later.note} onChange={(e) => setLater((old) => ({ ...old, note: e.target.value }))} placeholder="Wants to discuss at home, fees, travel..." className={`mt-1.5 ${field}`} /></label>
                </div>
              )}
              {choice === 'stop' && (
                <label className="block text-sm font-medium text-charcoal">Why is the family not continuing? *<textarea rows={2} maxLength={1000} required value={reason} onChange={(e) => setReason(e.target.value)} placeholder="The reason the parent gave" className={`mt-1.5 ${field}`} /></label>
              )}
              {error && <p role="alert" className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" disabled={busy} onClick={() => { setChoice(''); setError(''); }}>Cancel</Button>
                {(choice !== 'book' || info?.allowed) && <Button type="submit" variant={choice === 'stop' ? 'danger' : 'primary'} disabled={busy}>{busy ? 'Saving...' : choice === 'book' ? 'Book appointment' : choice === 'time' ? 'Save call-back' : 'Save: not continuing'}</Button>}
              </div>
            </form>
          )}
        </div>
      )}

      {np.history?.length > 0 && (
        <div className="mt-3">
          <button type="button" onClick={() => setShowHistory((v) => !v)} className="flex items-center gap-1.5 text-xs font-bold text-sage hover:underline"><History size={13} />{showHistory ? 'Hide' : 'Show'} earlier decisions ({np.history.length})</button>
          {showHistory && <ul className="mt-2 space-y-2">{np.history.map((old, i) => (
            <li key={i} className="rounded-lg border border-cardline bg-white px-3 py-2"><p className="text-[11px] font-bold uppercase tracking-wide text-charcoal/55">{DECISION_LABEL[old.decision] || old.decision}</p><DecisionText record={old} /></li>
          ))}</ul>}
        </div>
      )}
    </Section>
  );
}
