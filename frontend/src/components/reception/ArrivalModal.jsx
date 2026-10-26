import { useEffect, useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import api from '../../api/axios.js';
import Button from '../ui/Button.jsx';
import Input from '../ui/Input.jsx';
import Modal from '../ui/Modal.jsx';

const nowTime = () => new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' });
const selectClass = 'w-full rounded-lg border border-cardline bg-offwhite-200 px-3.5 py-2.5 text-sm text-charcoal focus:border-sage focus:outline-none focus:ring-2 focus:ring-sage/20';

// Step 1: mark Arrived + time. Saving generates the Patient ID, which is shown here so it can be noted down.
const ArrivalModal = ({ row, onClose, onSaved }) => {
  const [status, setStatus] = useState('Arrived');
  const [time, setTime] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  useEffect(() => {
    if (!row) return;
    setStatus(row.arrivalStatus || 'Arrived');
    setTime(row.arrivalTime || nowTime());
    setError(''); setResult(null);
  }, [row]);

  const save = async (event) => {
    event.preventDefault();
    setBusy(true); setError('');
    try {
      const { data } = await api.post(`/sales-sheet/management/${row.id}/arrival`, { status, time });
      setResult(data);
      onSaved?.();
    } catch (err) {
      setError(err.response?.data?.message || 'Arrival could not be saved');
    } finally { setBusy(false); }
  };

  const title = result ? (result.arrivalStatus === 'Online' ? 'Online consultation saved' : 'Arrival saved') : 'Mark arrival';
  return (
    <Modal open={Boolean(row)} onClose={onClose} title={title} className="max-w-md">
      {result ? (
        <div className="space-y-4 text-center">
          <CheckCircle2 className="mx-auto text-sage" size={40} />
          {result.patientId ? (
            <>
              <p className="text-sm text-charcoal/70">Patient ID{result.generated ? ' generated' : ''}. Please note it down.</p>
              <p className="rounded-lg border border-sage/40 bg-sage/10 py-4 font-display text-3xl font-bold tracking-wide text-charcoal">{result.patientId}</p>
            </>
          ) : <p className="text-sm text-charcoal/70">Marked as {result.arrivalStatus.toLowerCase()}. The Patient ID is created when the patient is marked Arrived or Online.</p>}
          <Button onClick={onClose} className="w-full">Okay</Button>
        </div>
      ) : (
        <form onSubmit={save} className="space-y-4">
          <p className="text-sm text-charcoal/65">{row?.appointmentCode}{row?.patientName ? ` · ${row.patientName}` : ''}</p>
          {error && <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-charcoal">Arrival status</label>
            <select value={status} onChange={(event) => setStatus(event.target.value)} className={selectClass}>
              <option value="Arrived">Arrived</option>
              <option value="Arriving">Arriving</option>
              <option value="Online">Online (online consultation)</option>
            </select>
          </div>
          <Input label={status === 'Online' ? 'Online consultation time' : 'Arrival time'} type="time" value={time} onChange={(event) => setTime(event.target.value)} required={status === 'Arrived' || status === 'Online'} />
          {status === 'Online' && <p className="text-xs text-charcoal/60">An online consultation gets a Patient ID just like an arrival, so registration can be filled and sent to post counselling.</p>}
          {row?.patientId && <p className="text-xs text-charcoal/60">Patient ID <b>{row.patientId}</b> already exists and will stay the same.</p>}
          <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button type="submit" disabled={busy}>{busy ? 'Saving...' : 'Save'}</Button></div>
        </form>
      )}
    </Modal>
  );
};

export default ArrivalModal;
