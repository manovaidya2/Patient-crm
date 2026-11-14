import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ShieldCheck, RefreshCw } from 'lucide-react';
import api from '../../api/axios.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { ROLES } from '../../constants/roles.js';
import Button from '../../components/ui/Button.jsx';
import { PageHeader } from '../../components/ui/Layout.jsx';
import { formatBoxReceiptTime as when } from '../../components/medicine/MedicineBoxReceipt.jsx';

const server = (import.meta.env.VITE_API_URL || 'http://localhost:5019/api').replace(/\/api\/?$/, '');
const assetUrl = (url) => /^https?:\/\//i.test(url) ? url : `${server}${url}`;
const money = (value) => `₹${Number(value || 0).toLocaleString('en-IN')}`;

function ExceptionReview({ po, onApproved }) {
  const { user } = useAuth();
  const [confirmed, setConfirmed] = useState(false);
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const verify = async () => {
    setBusy(true); setError('');
    try { const { data } = await api.post(`/purchase-orders/${po.id}/exception-payment/approve`, { confirmed, notes }); onApproved(data.purchaseOrder); }
    catch (err) { setError(err.response?.data?.message || 'Could not approve this payment exception'); }
    finally { setBusy(false); }
  };
  const exception = po.exceptionPayment;
  const payments = po.exceptionPayments || po.payments || [];
  const paymentComplete = Number(po.poPayment?.remaining || 0) <= 0 && !po.poPayment?.pendingCount;
  const pendingAmount = payments.filter((p) => p.onThisPo && p.status === 'pending').reduce((sum, p) => sum + Number(p.amount || 0), 0);
  return <article className="space-y-3 rounded-xl border border-cardline bg-white p-4">
    <div className="flex flex-wrap items-start justify-between gap-2"><div><h2 className="font-bold text-charcoal">{po.patientName} · {po.patientCode}</h2><Link className="text-sm font-semibold text-sage hover:underline" to={`/admin/purchase-orders/${po.id}`}>{po.poNumber} · Phase {po.phase}</Link></div><span className={`rounded-full px-3 py-1 text-xs font-semibold ${exception.pending ? 'bg-amber-100 text-amber-900' : 'bg-emerald-100 text-emerald-900'}`}>{exception.pending ? 'Doctor verification pending' : 'Doctor approved'}</span></div>
    <p className="text-sm">PO value ₹{Number(po.amount || 0).toLocaleString('en-IN')} · verified paid ₹{Number(po.poPayment?.amountPaid || 0).toLocaleString('en-IN')} · balance ₹{Number(po.poPayment?.remaining || 0).toLocaleString('en-IN')}</p>
    <p className="text-xs text-charcoal/65">Requested by {exception.requestedByName} · {when(exception.requestedAt)}</p>
    {exception.reason && <p className="rounded-lg bg-[#FBF7ED] p-3 text-sm">Exception reason: {exception.reason}</p>}
    <section className="space-y-3 rounded-lg border border-cardline p-3">
      <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm font-bold">Payment details & screenshots</h3><span className={`rounded-full px-3 py-1 text-xs font-semibold ${paymentComplete ? 'bg-emerald-50 text-emerald-900' : 'bg-amber-50 text-amber-900'}`}>{paymentComplete ? 'Payment complete' : 'Payment pending'}</span></div>
      <p className="text-xs text-charcoal/70">This PO: verified paid {money(po.poPayment?.amountPaid)} · balance {money(po.poPayment?.remaining)} · {po.poPayment?.pendingCount || 0} payment(s) pending verification{pendingAmount > 0 ? ` (${money(pendingAmount)})` : ''}</p>
      <p className="text-xs text-charcoal/65">All recorded patient payments are shown below. Payments linked to this PO are marked separately.</p>
      {!payments.length && <p className="text-sm text-charcoal/65">No payment recorded yet. Payment is pending.</p>}
      <div className="max-h-[520px] space-y-3 overflow-y-auto">{payments.map((payment) => <div key={`${payment.phase}-${payment.id}`} className="space-y-2 rounded-lg border border-cardline p-3 text-xs">
        <p className="font-semibold">{money(payment.amount)} · {payment.modeLabel || payment.mode}{payment.phase ? ` · Phase ${payment.phase}` : ''}{payment.onThisPo ? ' · For this PO' : ''}</p>
        <p className={payment.status === 'approved' ? 'font-semibold text-emerald-800' : 'font-semibold text-amber-900'}>{payment.status === 'approved' ? 'Payment verified' : payment.status === 'pending' ? 'Payment pending verification' : `Payment ${payment.status}`}</p>
        <p>Paid: {when(payment.date)} · Recorded by: {payment.recordedByName || '—'}</p>
        {payment.bank && <p>Bank: {payment.bank}</p>}{payment.utr && <p>UTR: {payment.utr}</p>}
        {payment.transactionId && <p>Transaction ID: {payment.transactionId}</p>}
        {payment.receivedBy && <p>Received by: {payment.receivedBy}</p>}
        {(payment.splits || []).map((split, i) => <p key={i}>{split.mode}: {money(split.amount)}{split.utr ? ` · UTR ${split.utr}` : ''}{split.receivedBy ? ` · ${split.receivedBy}` : ''}</p>)}
        {payment.approvedAt && <p>Verified by {payment.approvedByName || '—'} · {when(payment.approvedAt)}</p>}
        {payment.notes && <p>Notes: {payment.notes}</p>}
        {payment.files?.length ? <div className="flex flex-wrap gap-2">{payment.files.map((file, i) => <a key={`${file.url}-${i}`} href={assetUrl(file.url)} target="_blank" rel="noreferrer" className="block max-w-52 rounded-lg border border-cardline p-1 text-sage hover:underline">
          {!/\.pdf(?:\?|$)/i.test(file.url) && <img src={assetUrl(file.url)} alt={file.fileName || 'Payment screenshot'} loading="lazy" className="h-32 w-44 object-contain" />}
          <span className="block break-words px-1">{file.fileName || 'Open payment screenshot'}</span>
        </a>)}</div> : <p className="text-charcoal/50">No screenshot attached.</p>}
      </div>)}</div>
    </section>
    {exception.approvedAt ? <p className="text-sm text-emerald-900">Approved by {exception.approvedByName} · {when(exception.approvedAt)}{exception.approvalNotes ? ` · ${exception.approvalNotes}` : ''}</p> : user?.role === ROLES.DOCTOR && <>
      <label className="block space-y-1 text-sm"><span>Doctor notes (optional)</span><textarea className="w-full rounded-lg border border-cardline p-2" value={notes} maxLength={2000} rows={2} onChange={(e) => setNotes(e.target.value)} /></label>
      <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1 accent-sage" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />I reviewed this payment exception and approve proceeding with the usual PO verification.</label>
      <Button disabled={busy || !confirmed} onClick={verify}>{busy ? 'Approving...' : 'Verify exception & approve'}</Button>
    </>}
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
  </article>;
}

export default function ExceptionPayments() {
  const [view, setView] = useState('pending');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    setLoading(true);
    try { const { data } = await api.get('/purchase-orders/exception-payments', { params: { view }, skipCache: true }); setItems(data.items || []); setError(''); }
    catch (err) { setError(err.response?.data?.message || 'Could not load exception payments'); }
    finally { setLoading(false); }
  }, [view]);
  useEffect(() => { load(); const timer = setInterval(load, 30000); return () => clearInterval(timer); }, [load]);
  const approved = (po) => setItems((rows) => view === 'pending' ? rows.filter((row) => row.id !== po.id) : rows.map((row) => row.id === po.id ? po : row));
  return <div className="space-y-4">
    <PageHeader icon={ShieldCheck} title="Exception Payment" subtitle="Doctor verification of New PO payment exceptions. Approval returns the PO to its usual verification flow." actions={<Button variant="outline" onClick={load}><RefreshCw size={15} />Refresh</Button>} />
    <div className="flex gap-2">{[['pending', 'Pending'], ['approved', 'Approved'], ['all', 'All']].map(([key, label]) => <Button key={key} variant={view === key ? undefined : 'outline'} onClick={() => setView(key)}>{label}</Button>)}</div>
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    {loading && !items.length ? <p>Loading exception payments...</p> : !items.length ? <p className="rounded-lg border border-cardline bg-white p-6 text-sm text-charcoal/65">No exception payments in this view.</p> : items.map((po) => <ExceptionReview key={po.id} po={po} onApproved={approved} />)}
  </div>;
}
