import { useState } from 'react';
import api from '../../api/axios.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { ROLES } from '../../constants/roles.js';
import Button from '../ui/Button.jsx';

const input = 'w-full rounded-lg border border-cardline bg-white px-3 py-2 text-sm';
const when = (value) => value ? new Date(value).toLocaleString('en-IN') : '';

export default function DoctorVerificationCheck({ job, onSaved, allowConfirmation = false }) {
  const { user } = useAuth();
  const [doctorName, setDoctorName] = useState('');
  const [notes, setNotes] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(null);
  const verification = job.doctorVerification || saved;
  const final = job.stages.find((s) => s.key === 'final');
  const canConfirm = allowConfirmation && user?.role === ROLES.ASSISTANT_DOCTOR
    && job.status !== 'cancelled' && !job.hold && ['current', 'done'].includes(final?.state);
  const save = async () => {
    setBusy(true); setError('');
    try {
      const { data } = await api.post(`/medicine-jobs/${job.id}/doctor-verification`, { doctorName: doctorName.trim(), notes: notes.trim(), confirmed });
      setSaved(data.job.doctorVerification);
      onSaved?.(data.job);
    } catch (err) { setError(err.response?.data?.message || 'Could not save doctor verification'); }
    finally { setBusy(false); }
  };
  return (
    <section className="mt-4 space-y-3 rounded-xl border border-cardline bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-base font-bold text-charcoal">Doctor final verification check</h3>
        <span className={`rounded-full px-3 py-1 text-xs font-bold ${verification ? 'bg-emerald-100 text-emerald-900' : 'bg-amber-100 text-amber-900'}`}>{verification ? 'Verified' : 'Pending doctor verification'}</span>
      </div>
      {verification ? <div className="space-y-1 text-sm text-charcoal/80">
        <p>Doctor: <b>{verification.doctorName}</b></p>
        <p>{verification.confirmedByPcc ? 'Confirmed by' : 'Verified by'} <b>{verification.doneByName}</b> · {when(verification.doneAt)}</p>
        {verification.notes && <p>Notes: {verification.notes}</p>}
      </div> : <>
        <p className="text-sm text-charcoal/70">The assigned PCC confirms here after verifying the kit with the doctor.</p>
        {canConfirm ? <>
          <label className="block space-y-1 text-sm font-medium text-charcoal"><span>Doctor name <span className="text-red-700">*</span></span><input className={input} value={doctorName} maxLength={120} onChange={(e) => setDoctorName(e.target.value)} /></label>
          <label className="block space-y-1 text-sm font-medium text-charcoal"><span>Notes</span><textarea className={input} rows={2} value={notes} maxLength={2000} onChange={(e) => setNotes(e.target.value)} /></label>
          <label className="flex items-start gap-2 text-sm text-charcoal"><input className="mt-1 accent-sage" type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />I have verified this kit with the doctor.</label>
          {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
          <Button onClick={save} disabled={busy || !confirmed || !doctorName.trim()}>{busy ? 'Saving...' : 'Confirm doctor verification'}</Button>
        </> : <p className="text-sm text-charcoal/60">Waiting for confirmation from the assigned final-check PCC.</p>}
      </>}
    </section>
  );
}
