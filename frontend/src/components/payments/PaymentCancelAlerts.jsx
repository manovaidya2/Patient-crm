import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, Check, ExternalLink } from 'lucide-react';
import api from '../../api/axios.js';

const money = (value) => `Rs ${Number(value || 0).toLocaleString('en-IN')}`;
const when = (value) => (value ? new Date(value).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '');

// Red alerts for the person who added a payment that was then cancelled: which patient, how much, who cancelled it and
// why. They stay until "Checked" is clicked. `patientId`: only that patient's alerts (on the patient's own page).
export default function PaymentCancelAlerts({ patientId = '', className = '' }) {
  const [alerts, setAlerts] = useState([]);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const load = useCallback(() => {
    api.get('/patients/payment-cancel-alerts', { params: patientId ? { patientId } : {}, skipCache: true })
      .then(({ data }) => setAlerts(data.alerts || []))
      .catch(() => setAlerts([]));
  }, [patientId]);
  useEffect(() => { load(); }, [load]);
  const check = async (a) => {
    setBusy(a.paymentId); setError('');
    try { await api.patch(`/patients/${a.patientId}/stages/${a.phase}/payments/${a.paymentId}/cancel-alert`); setAlerts((list) => list.filter((x) => x.paymentId !== a.paymentId)); }
    catch (err) { setError(err.response?.data?.message || 'Could not mark it checked'); } finally { setBusy(''); }
  };
  if (!alerts.length) return null;
  return (
    <div className={`space-y-2 ${className}`} role="alert">
      {error && <p className="text-sm text-red-700">{error}</p>}
      {alerts.map((a) => (
        <div key={a.paymentId} className="flex flex-wrap items-start justify-between gap-3 rounded-xl border-2 border-[#F5B5B0] bg-[#FDE2E1] px-4 py-3 text-sm text-[#7A1D1D]">
          <div className="flex min-w-0 gap-2.5">
            <AlertTriangle size={18} className="mt-0.5 shrink-0 text-[#9F1D1D]" />
            <div className="min-w-0">
              <p className="font-bold">
                Payment cancelled: {a.patientName}{a.patientCode ? ` (${a.patientCode})` : ''} · Phase {a.phase}
              </p>
              <p>
                {money(a.amount)} {a.paymentMode === 'cash' ? `cash${a.receivedBy ? ` received by ${a.receivedBy}` : ''}` : `online${a.utr ? ` · UTR ${a.utr}` : ''}`} that you added was cancelled by <b>{a.cancelledByName || 'someone'}</b> on {when(a.cancelledAt)}.
              </p>
              {a.reason && <p className="break-words">Reason: <b>{a.reason}</b></p>}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {!patientId && <Link to={`/admin/patients/${a.patientId}?tab=phases`} className="inline-flex items-center gap-1 rounded-lg border border-[#9F1D1D]/30 bg-white px-3 py-1.5 text-xs font-semibold text-[#9F1D1D] hover:bg-white/80"><ExternalLink size={13} />Open patient</Link>}
            <button type="button" disabled={busy === a.paymentId} onClick={() => check(a)} className="inline-flex items-center gap-1 rounded-lg bg-[#9F1D1D] px-3 py-1.5 text-xs font-bold text-white hover:bg-[#861818] disabled:opacity-60"><Check size={14} />{busy === a.paymentId ? 'Saving...' : 'Checked'}</button>
          </div>
        </div>
      ))}
    </div>
  );
}
