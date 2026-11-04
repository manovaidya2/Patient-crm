import { useEffect, useState } from 'react';
import { CalendarPlus } from 'lucide-react';
import api from '../../api/axios.js';
import Button from '../ui/Button.jsx';
import Modal from '../ui/Modal.jsx';

const field = 'w-full rounded-lg border border-cardline bg-offwhite-200 px-3 py-2.5 text-sm text-charcoal focus:border-sage focus:outline-none focus:ring-2 focus:ring-sage/20';
const STATUS = { not_started: 'Not started', in_progress: 'In progress', completed: 'Completed' };
const istToday = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
const dayLabel = (iso) => new Date(`${iso}T00:00:00`).toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });

// The PCC talks to the family and books the next visit here (any time - not tied to the phase status), the same direct appointment
// Reception adds (existing patient, old Patient ID, details from the record). It shows on Reception's Appointment
// Management for that date. The server decides whether booking is open (PCC's own patient, patient not closed).
// `compact`: only the button (top of Patient Details, next to Call / WhatsApp); otherwise the line with the booked
// appointments and the latest phase (Care team).
export default function BookNextAppointment({ patientId, compact = false }) {
  const [info, setInfo] = useState(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(null);

  const load = () => api.get(`/patients/${patientId}/book-appointment`, { skipCache: true }).then(({ data }) => setInfo(data)).catch(() => setInfo(null));
  useEffect(() => { load(); }, [patientId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!info) return null;
  const start = () => { setForm({ appointmentDate: '', time: '', note: '', ...info.defaults }); setError(''); setDone(null); setOpen(true); };
  const change = (key) => (e) => setForm((old) => ({ ...old, [key]: e.target.value }));
  const submit = async (e) => {
    e.preventDefault();
    if (!form.appointmentDate) { setError('Choose the appointment date'); return; }
    setBusy(true); setError('');
    try {
      const { data } = await api.post(`/patients/${patientId}/book-appointment`, form);
      setDone(data.appointment); load();
    } catch (err) { setError(err.response?.data?.message || 'The appointment could not be booked'); }
    finally { setBusy(false); }
  };

  const button = info.allowed && <Button size="sm" onClick={start}><CalendarPlus size={14} />{compact ? 'Book appointment' : 'Book next appointment'}</Button>;
  return (
    <div className={compact ? 'contents' : 'flex flex-wrap items-center justify-between gap-3 bg-[#FCFAF5] px-3 py-3'}>
      {!compact && <div className="min-w-0 text-sm">
        <p className="font-bold text-charcoal">Next appointment</p>
        {info.upcoming.length > 0
          ? <p className="text-xs text-charcoal/65">Booked: {info.upcoming.map((row) => `${dayLabel(row.appointmentDate)} (${row.appointmentCode}${row.bookedBy ? `, by ${row.bookedBy}` : ''})`).join(' · ')}</p>
          : <p className="text-xs text-charcoal/55">{info.allowed ? 'No upcoming appointment booked.' : info.reason}</p>}
        {info.latestPhase && <p className="text-[11px] text-charcoal/50">Latest phase: Phase {info.latestPhase.number} · {STATUS[info.latestPhase.status] || info.latestPhase.status}</p>}
      </div>}
      {button}
      <Modal open={open} onClose={() => !busy && setOpen(false)} title="Book next appointment" className="max-w-lg">
        {done ? (
          <div className="space-y-4 text-center">
            <p className="text-sm text-charcoal/75">Appointment <b>{done.appointmentCode}</b> booked for <b>{dayLabel(done.appointmentDate)}</b>. Reception will see it in Appointment Management on that date.</p>
            <Button className="w-full" onClick={() => setOpen(false)}>Okay</Button>
          </div>
        ) : form && (
          <form onSubmit={submit} className="space-y-3">
            <p className="rounded-lg border border-sage/30 bg-sage/10 px-3 py-2 text-xs text-charcoal/75">Booked as an existing patient with the old Patient ID; name, age, parent and mobile are taken from the patient record.</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-sm font-medium text-charcoal">Appointment date *<input type="date" min={istToday()} required value={form.appointmentDate} onChange={change('appointmentDate')} className={`mt-1.5 ${field}`} /></label>
              <label className="block text-sm font-medium text-charcoal">Time told to the family<input type="time" value={form.time} onChange={change('time')} className={`mt-1.5 ${field}`} /></label>
              <label className="block text-sm font-medium text-charcoal">Mode *<select value={form.mode} onChange={change('mode')} className={`mt-1.5 ${field}`}>{info.options.modes.map((m) => <option key={m} value={m}>{m}</option>)}</select></label>
              <label className="block text-sm font-medium text-charcoal">Lead type *<select value={form.leadType} onChange={change('leadType')} className={`mt-1.5 ${field}`}>{info.options.leadTypes.map((m) => <option key={m} value={m}>{m}</option>)}</select></label>
              <label className="block text-sm font-medium text-charcoal sm:col-span-2">Case category *<select required value={form.caseCategory} onChange={change('caseCategory')} className={`mt-1.5 ${field}`}><option value="">Select</option>{info.options.caseCategories.map((m) => <option key={m} value={m}>{m}</option>)}</select></label>
            </div>
            <label className="block text-sm font-medium text-charcoal">Note for reception<textarea rows={2} maxLength={1000} value={form.note} onChange={change('note')} placeholder="What was discussed with the family, next phase plan..." className={`mt-1.5 ${field}`} /></label>
            {error && <p role="alert" className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
            <div className="flex justify-end gap-2"><Button type="button" variant="outline" disabled={busy} onClick={() => setOpen(false)}>Cancel</Button><Button type="submit" disabled={busy}>{busy ? 'Booking...' : 'Book appointment'}</Button></div>
          </form>
        )}
      </Modal>
    </div>
  );
}
