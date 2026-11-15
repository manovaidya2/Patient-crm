import { useState } from 'react';

const server = (import.meta.env.VITE_API_URL || 'http://localhost:5019/api').replace(/\/api\/?$/, '');
const assetUrl = (url) => /^https?:\/\//i.test(url) ? url : `${server}${url}`;
const money = (amount) => `₹${Number(amount || 0).toLocaleString('en-IN')}`;
const when = (value) => value ? new Date(value).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

export default function AppointmentPaymentDetails({ payments = [], title = 'Payment details & screenshots', emptyMessage = 'No payment recorded for this PO.' }) {
  const [open, setOpen] = useState(false);
  return <details className="rounded border border-cardline p-2" onToggle={(event) => setOpen(event.currentTarget.open)}>
    <summary className="cursor-pointer font-bold text-sage">{title} ({payments.length})</summary>
    {open && <div className="mt-2 max-h-[500px] space-y-3 overflow-y-auto pr-1">
      {!payments.length && <p className="text-charcoal/60">{emptyMessage}</p>}
      {payments.map((payment) => <article key={payment.id} className="space-y-1 rounded border border-cardline p-2">
        <p className="font-bold">{money(payment.amount)} · {payment.modeLabel || payment.mode}</p>
        <p className={`font-semibold ${payment.status === 'approved' ? 'text-emerald-800' : payment.status === 'cancelled' ? 'text-red-700' : 'text-amber-800'}`}>{payment.status === 'approved' ? 'Verified' : payment.status === 'pending' ? 'Pending verification' : payment.status}</p>
        <p>Paid: {when(payment.date)}</p>
        <p>Recorded by: {payment.recordedByName || 'Name not recorded'}</p>
        {payment.collectionStage && <p>{payment.collectionStage}{payment.appointmentCode ? ` · ${payment.appointmentCode}` : ''}</p>}
        {payment.createdAt && <p>Recorded: {when(payment.createdAt)}</p>}
        {payment.bank && <p>Bank: {payment.bank}</p>}
        {payment.utr && <p className="break-words">UTR: {payment.utr}</p>}
        {payment.transactionId && <p className="break-words">Transaction ID: {payment.transactionId}</p>}
        {payment.receivedBy && <p>Cash received by: {payment.receivedBy}</p>}
        {(payment.splits || []).map((split, i) => <p key={i}>{split.mode}: {money(split.amount)}{split.utr ? ` · UTR ${split.utr}` : ''}{split.receivedBy ? ` · Received by ${split.receivedBy}` : ''}</p>)}
        {payment.approvedAt && <p>Verified by {payment.approvedByName || 'Name not recorded'} · {when(payment.approvedAt)}</p>}
        {payment.notes && <p className="break-words">Notes: {payment.notes}</p>}
        {payment.cancellationReason && <p className="break-words text-red-700">Cancellation: {payment.cancellationReason}</p>}
        {payment.cancelledAt && <p>Cancelled by {payment.cancelledByName || 'Name not recorded'} · {when(payment.cancelledAt)}</p>}
        {payment.editedAt && <p>Edited by {payment.editedByName || 'Name not recorded'} · {when(payment.editedAt)}</p>}
        {payment.files?.length ? <div className="flex flex-wrap gap-2 pt-1">{payment.files.map((file, i) => <a key={`${file.url}-${i}`} href={assetUrl(file.url)} target="_blank" rel="noreferrer" className="block max-w-full rounded border border-cardline p-1 text-sage hover:underline">
          {!/\.pdf(?:\?|$)/i.test(file.url) && <img src={assetUrl(file.url)} alt={file.fileName || 'Payment screenshot'} loading="lazy" className="h-32 w-44 object-contain" />}
          <span className="block break-words">{file.fileName || 'Open payment screenshot'}</span>
        </a>)}</div> : <p className="text-charcoal/50">No screenshot attached.</p>}
      </article>)}
    </div>}
  </details>;
}
