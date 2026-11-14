import { useEffect, useState } from 'react';
import api from '../../api/axios.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { ROLES, isAdminLike } from '../../constants/roles.js';
import Button from '../ui/Button.jsx';

export const formatBoxReceiptTime = (value) => value ? new Date(value).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true }) : '';

export default function MedicineBoxReceipt({ job, onSaved }) {
  const { user } = useAuth();
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [assignedPccId, setAssignedPccId] = useState(null);
  const userId = String(user?.id || user?._id || '');
  useEffect(() => {
    if (user?.role !== ROLES.ASSISTANT_DOCTOR) return undefined;
    let active = true;
    api.get('/treatment-papers/setting', { params: { kind: 'final' } }).then(({ data }) => { if (active) setAssignedPccId(data.pcc?.id || ''); }).catch(() => { if (active) setError('Could not check the assigned final verification PCC. Refresh to retry.'); });
    return () => { active = false; };
  }, [userId, user?.role]);
  const receipt = job.boxReceipt;
  const finalDone = job.stages?.some((s) => s.key === 'final' && s.state === 'done');
  const available = job.status !== 'cancelled' && !job.hold;
  const canRequest = available && finalDone && !receipt && (user?.role === ROLES.MEDICINE_DEPARTMENT || isAdminLike(user));
  const canReceive = available && receipt?.status === 'pending' && user?.role === ROLES.ASSISTANT_DOCTOR && assignedPccId === userId;
  const save = async (action) => {
    setBusy(true); setError('');
    try {
      const { data } = await api.post(`/medicine-jobs/${job.id}/box-receipt/${action}`, { notes: notes.trim() });
      setNotes(''); await onSaved?.(data.job);
    } catch (err) { setError(err.response?.data?.message || 'Could not save medicine box receipt'); }
    finally { setBusy(false); }
  };
  return (
    <div className="space-y-3 text-sm text-charcoal">
      <p className={`rounded-lg px-3 py-2 font-semibold ${receipt?.status === 'received' ? 'bg-emerald-50 text-emerald-900' : 'bg-amber-50 text-amber-900'}`}>
        {receipt?.status === 'received' ? 'Medicine box received' : receipt ? 'Request received — awaiting assigned final-check PCC' : 'No box receipt request yet'}
      </p>
      {receipt && <div className="space-y-1 text-xs text-charcoal/75">
        <p>Requested by {receipt.requestedByName} · {formatBoxReceiptTime(receipt.requestedAt)}</p>
        {receipt.requestNote && <p>Request note: {receipt.requestNote}</p>}
        {receipt.receivedAt && <p>Received by {receipt.receivedByName} · {formatBoxReceiptTime(receipt.receivedAt)}</p>}
        {receipt.receivedNote && <p>Receipt note: {receipt.receivedNote}</p>}
      </div>}
      {(canRequest || canReceive) && <>
        <label className="block space-y-1"><span>Notes (optional)</span><textarea className="w-full rounded-lg border border-cardline bg-white px-3 py-2" rows={2} maxLength={2000} value={notes} onChange={(e) => setNotes(e.target.value)} /></label>
        <Button disabled={busy} onClick={() => save(canRequest ? 'request' : 'receive')}>{busy ? 'Saving...' : canRequest ? 'Request to receive medicine box' : 'Received'}</Button>
      </>}
      {!receipt && !finalDone && <p className="text-xs text-charcoal/60">The Medicine Department can request receipt after the final verification check is complete.</p>}
      {job.hold && <p className="text-xs text-red-700">This job is on hold. Resume it before requesting or confirming receipt.</p>}
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    </div>
  );
}
