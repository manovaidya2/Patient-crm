import { useCallback, useEffect, useState } from 'react';
import api from '../../api/axios.js';
import { formatBoxReceiptTime as when } from './MedicineBoxReceipt.jsx';
import Button from '../ui/Button.jsx';

const server = (import.meta.env.VITE_API_URL || 'http://localhost:5019/api').replace(/\/api\/?$/, '');
const assetUrl = (url) => /^https?:\/\//i.test(url) ? url : `${server}${url}`;
const money = (value) => `₹${Number(value || 0).toLocaleString('en-IN')}`;

export default function ReleasePaymentReview({ jobId, onVerified, onSaved, disabled = false, readOnly = false }) {
  const [details, setDetails] = useState(null);
  const [open, setOpen] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    try {
      const { data } = await api.get(`/medicine-jobs/${jobId}/release-payments`, { skipCache: true });
      setDetails(data); setConfirmed(false); onVerified?.(data.verified); setError('');
    } catch (err) { onVerified?.(false); setError(err.response?.data?.message || 'Could not load payment details'); }
  }, [jobId, onVerified]);
  useEffect(() => { if (open) load(); }, [load, open]);
  const verify = async () => {
    setBusy(true); setError('');
    try {
      const { data } = await api.post(`/medicine-jobs/${jobId}/release-request/verify-payment`, { fingerprint: details.fingerprint, confirmed });
      await load(); await onSaved?.(data.job);
    } catch (err) { onVerified?.(false); setError(err.response?.data?.message || 'Could not verify release payments'); }
    finally { setBusy(false); }
  };
  return (
    <section className="space-y-3 rounded-lg border border-cardline bg-white p-3">
      <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-bold text-charcoal">{readOnly ? 'Payment details & In Transit verification' : '1. Verify payment before requesting release'}</h3><Button size="sm" variant="outline" disabled={busy} onClick={() => open ? load() : setOpen(true)}>{open ? 'Refresh payments' : 'Show payment details & screenshots'}</Button></div>
      {open && details ? <>
        <div className="rounded-lg bg-[#FBF7ED] p-3 text-xs text-charcoal/80">
          <p className="font-semibold">Patient total: {money(details.patientSummary.totalAmount)} · verified paid: {money(details.patientSummary.amountPaid)} · pending verification: {money(details.patientSummary.pendingAmount)} · balance: {money(details.patientSummary.remaining)}</p>
          <p className="mt-1">This medicine release{details.poNumber ? ` · PO ${details.poNumber}` : ''}: total {money(details.summary.totalAmount)} · verified paid {money(details.summary.amountPaid)} · balance {money(details.summary.remaining)} · {details.summary.pendingCount} payment(s) pending verification</p>
        </div>
        <p className="text-xs text-charcoal/65">{readOnly ? 'All recorded patient payments are shown below. Payments marked “For this release” belong to this medicine release.' : 'All recorded patient payments are shown below. Payments marked “For this release” are checked and approved by this verification.'}</p>
        <div className="max-h-[520px] space-y-3 overflow-y-auto pr-1">
          {!details.payments.length && <p className="text-sm text-charcoal/60">No payment records found.</p>}
          {details.payments.map((payment) => <article key={`${payment.phase}-${payment.id}`} className={`space-y-2 rounded-lg border p-3 text-xs ${payment.forRelease ? 'border-sage/40 bg-[#F6FBF7]' : 'border-cardline'}`}>
            <p className="font-bold text-charcoal">{money(payment.amount)} · Phase {payment.phase} · {payment.mode} · {payment.approvalStatus}{payment.forRelease ? ' · For this release' : ''}</p>
            <p>Paid: {when(payment.date)} · Recorded by: {payment.recordedByName || '—'}</p>
            {payment.bank && <p>Bank: {payment.bank}</p>}
            {(payment.utr || payment.transactionId) && <p>UTR: {payment.utr || '—'} · Transaction ID: {payment.transactionId || '—'}</p>}
            {payment.receivedBy && <p>Received by: {payment.receivedBy}</p>}
            {payment.utrEntries.map((entry, i) => <p key={i}>Transfer {i + 1}: {money(entry.amount)} · UTR {entry.utr || '—'} · Transaction {entry.transactionId || '—'}</p>)}
            {payment.splits.map((split, i) => <p key={i}>{split.mode}: {money(split.amount)}{split.utr ? ` · UTR ${split.utr}` : ''}{split.receivedBy ? ` · ${split.receivedBy}` : ''}</p>)}
            {payment.approvedAt && <p>Verified by {payment.approvedByName} · {when(payment.approvedAt)}</p>}
            {payment.notes && <p>Notes: {payment.notes}</p>}
            {payment.screenshots.length ? <div className="flex flex-wrap gap-2">{payment.screenshots.map((file) => <a key={file.url} href={assetUrl(file.url)} target="_blank" rel="noreferrer" className="block max-w-52 rounded-lg border border-cardline bg-white p-1 text-sage hover:underline">
              {!/\.pdf(?:\?|$)/i.test(file.url) && <img src={assetUrl(file.url)} alt={file.fileName || 'Payment screenshot'} loading="lazy" className="h-32 w-44 object-contain" />}
              <span className="block break-words px-1">{file.fileName || 'Open payment screenshot'}</span>
            </a>)}</div> : <p className="text-charcoal/50">No screenshot attached.</p>}
          </article>)}
        </div>
        {details.verified ? <p className="rounded-lg bg-emerald-50 p-2 font-semibold text-emerald-900">Payment verified by {details.verifiedByName} · {when(details.verifiedAt)}{readOnly ? ' · Current payment details match the In Transit verification.' : '. You can request medicine release.'}</p> : readOnly ? <p className="rounded-lg bg-amber-50 p-2 text-amber-900">{details.verifiedAt ? `Payment details changed since In Transit verification by ${details.verifiedByName} · ${when(details.verifiedAt)}. Check the current payment details before accepting.` : 'No In Transit payment verification recorded for the current payment details.'}</p> : <>
          <label className="flex items-start gap-2"><input type="checkbox" className="mt-1 accent-sage" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />I checked the payment amounts, references and available screenshots for this medicine release.</label>
          <Button disabled={busy || disabled || !confirmed} onClick={verify}>{busy ? 'Verifying...' : 'Verify payment'}</Button>
        </>}
      </> : <p className="text-sm text-charcoal/60">{open ? 'Loading patient payment details...' : readOnly ? 'Open the payment history and screenshots to review them before accepting the release request.' : 'Open the patient payment details and verify them to enable the release request.'}</p>}
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    </section>
  );
}
