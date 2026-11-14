import { useState } from 'react';
import { Check, RotateCcw } from 'lucide-react';
import api from '../../api/axios.js';
import Button from '../ui/Button.jsx';
import PatientFile from './PatientFile.jsx';
import { DosePapersView } from './DosePapers.jsx';
import VerificationSteps from './VerificationSteps.jsx';
import DoctorVerificationCheck from './DoctorVerificationCheck.jsx';

// Fulfilment step 11, the final verification check: the PCC chosen by the admin checks the packed parcel (with the
// treatment papers) against the job. PASS makes it ready; HOLD returns it to Packing-2.
const box = 'w-full rounded-lg border border-cardline bg-white px-3 py-2 text-sm';
export default function FinalCheckForm({ job, documents = [], onDone, allowDoctorConfirmation = false }) {
  const stage = job.stages.find((s) => s.key === 'final');
  const [ticks, setTicks] = useState(() => stage.checks.map(() => false));
  const [remarks, setRemarks] = useState('');
  const [answer, setAnswer] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const all = ticks.every(Boolean);
  const sendBack = async () => {
    setBusy(true); setError('');
    try { await api.post(`/medicine-jobs/${job.id}/stages/final`, { checks: ticks, fields: { result: 'HOLD', remarks: reason.trim() }, notes: reason.trim() }); await onDone('Sent back to Packing-2 with the reason.'); }
    catch (err) { setError(err.response?.data?.message || 'Could not send it back'); } finally { setBusy(false); }
  };
  const submit = async () => {
    setBusy(true); setError('');
    try {
      const body = new FormData();
      body.append('checks', JSON.stringify(ticks));
      body.append('fields', JSON.stringify({ result: 'PASS', remarks }));
      await api.post(`/medicine-jobs/${job.id}/stages/final`, body);
      await onDone(`Final check passed for ${job.patientName}: medicine READY for payment clearance and release.`);
    } catch (err) { setError(err.response?.data?.message || 'Could not save the final check'); } finally { setBusy(false); }
  };
  const chip = (on) => `rounded-full border px-3 py-1.5 text-xs font-semibold ${on ? 'border-sage bg-sage text-white' : 'border-cardline bg-white text-charcoal/70 hover:border-sage'}`;
  return (
    <div className="space-y-3">
      <p className="text-sm text-charcoal/70">{stage.purpose}</p>
      <PatientFile documents={documents} />
      <div className="rounded-lg border border-cardline bg-white/70 px-3 py-2"><p className="mb-1.5 text-sm font-semibold text-charcoal">Open-kit photo & treatment papers</p><DosePapersView job={job} /></div>
      <VerificationSteps job={job} />
      <DoctorVerificationCheck job={job} allowConfirmation={allowDoctorConfirmation} />
      <p className="text-[11px] font-bold uppercase tracking-wide text-charcoal/50">Checklist · {ticks.filter(Boolean).length} of {ticks.length} ticked</p>
      <div className="space-y-1.5">
        {stage.checks.map((check, i) => (
          <label key={check} className={`flex cursor-pointer items-start gap-2.5 rounded-lg border px-3 py-2 text-sm ${ticks[i] ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-[#E8DFCB] bg-[#FBF7ED] text-charcoal'}`}>
            <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[#2F8F5B]" checked={ticks[i]} onChange={(e) => setTicks((list) => list.map((v, n) => (n === i ? e.target.checked : v)))} />
            <span>{check}</span>
          </label>
        ))}
      </div>
      <div>
        <p className="mb-1.5 text-sm font-semibold text-charcoal">Is the parcel verified?<span className="text-red-700"> *</span></p>
        <div className="flex gap-2"><button type="button" className={chip(answer === 'yes')} onClick={() => setAnswer('yes')}>Yes, verified</button><button type="button" className={chip(answer === 'no')} onClick={() => setAnswer('no')}>No, send back</button></div>
      </div>
      {answer === 'yes' && <label className="block space-y-1 text-sm font-medium text-charcoal"><span>Remarks</span><textarea className={box} rows={2} value={remarks} onChange={(e) => setRemarks(e.target.value)} /></label>}
      {answer === 'no' && <label className="block space-y-1 text-sm font-medium text-charcoal"><span>What is wrong?<span className="text-red-700"> *</span></span><textarea className={box} rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Diet plan page missing, seal broken on BT-100" /></label>}
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      {answer === 'yes' && <Button disabled={busy || !all} onClick={submit}><Check size={14} />{busy ? 'Saving...' : all ? 'Confirm final check' : 'Tick every point to confirm'}</Button>}
      {answer === 'no' && <Button variant="outline" disabled={busy || !reason.trim()} onClick={sendBack}><RotateCcw size={14} />{busy ? 'Sending...' : 'Send back to Medicine Dept'}</Button>}
    </div>
  );
}
