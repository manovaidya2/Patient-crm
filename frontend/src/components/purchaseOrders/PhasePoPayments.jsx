import { Link } from 'react-router-dom';
import { ClipboardList, ExternalLink } from 'lucide-react';

const money = (value) => `Rs ${Number(value || 0).toLocaleString('en-IN')}`;
const day = (value) => (value ? new Date(value).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '');
const PO_STATUS = { pending: ['Waiting for verification', 'bg-amber-100 text-amber-900'], verified: ['Verified', 'bg-emerald-100 text-emerald-800'], rejected: ['Rejected', 'bg-[#FDE2E1] text-[#9F1D1D]'], cancelled: ['Cancelled', 'bg-gray-100 text-charcoal/60'] };
const PAY_STATUS = { approved: ['Verified', 'bg-emerald-100 text-emerald-800'], pending: ['Pending', 'bg-amber-100 text-amber-900'], cancelled: ['Cancelled', 'bg-gray-100 text-charcoal/50'] };

function PaymentLine({ pay }) {
  const [label, tone] = PAY_STATUS[pay.approvalStatus] || PAY_STATUS.approved;
  const how = pay.paymentMode === 'cash' ? `Cash${pay.receivedBy ? ` - ${pay.receivedBy}` : ''}` : `${pay.paymentModeLabel || 'Online'}${pay.utr ? ` - UTR ${pay.utr}` : ''}`;
  return (
    <li className="flex items-start justify-between gap-2 py-1.5 text-sm">
      <span className="min-w-0">
        <span className="font-semibold text-charcoal">{money(pay.amount)}</span> <span className="text-charcoal/60">{how}</span>
        <span className="block text-xs text-charcoal/50">{[day(pay.date), pay.payToBankName, pay.recordedByName && `added by ${pay.recordedByName}`, pay.approvedByName && `verified by ${pay.approvedByName}`].filter(Boolean).join(' · ')}</span>
      </span>
      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold ${tone}`}>{label}</span>
    </li>
  );
}

// Patient Details > Package: a phase can have several purchase orders (one per medicine buy). Each is shown with its
// own value, its own payments and balance, and its medicine request - so one PO's payments are never read as another's.
// `split`: GET /patients/:id/purchase-orders for this phase; `addFor(po)`: the "Add payment" control for that PO.
export default function PhasePoPayments({ stage, split, addFor }) {
  const pos = split?.purchaseOrders || [];
  if (!pos.length) return null;
  const byId = new Map((stage.payments || []).map((p) => [String(p.id), p]));
  const unlinked = (split.unlinkedPaymentIds || []).map((id) => byId.get(id)).filter(Boolean);
  const requestOf = (po) => (stage.medicineRequests || []).find((r) => String(r.purchaseOrderId || '') === po.id || (po.medicineRequestId && r.requestId === po.medicineRequestId));
  return (
    <section className="border-t border-cardline bg-offwhite-100 px-4 py-3.5" aria-label="Purchase orders of this phase">
      <h4 className="flex items-center gap-2 text-sm font-bold text-charcoal"><ClipboardList size={15} className="text-sage" />Purchase orders in Phase {stage.number} · payments per PO</h4>
      <p className="mt-0.5 text-xs text-charcoal/55">{pos.length > 1 ? `This phase has ${pos.length} POs. Each is paid and verified on its own; "Net paid" above adds all of them together.` : 'The payments of this PO, against its value.'}</p>
      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        {pos.map((po) => {
          const [statusLabel, statusTone] = PO_STATUS[po.status] || PO_STATUS.pending;
          const pay = po.payment;
          const extra = Math.max(pay.amountPaid - pay.totalAmount, 0);
          const payments = po.paymentIds.map((id) => byId.get(id)).filter(Boolean);
          const request = requestOf(po);
          return (
            <article key={po.id} className="rounded-lg border border-cardline bg-white p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <Link to={`/admin/purchase-orders/${po.id}`} className="inline-flex items-center gap-1 font-mono text-sm font-bold text-sage hover:underline">{po.poNumber}<ExternalLink size={12} /></Link>
                  <span className={`ml-2 rounded-full px-2 py-0.5 text-[11px] font-bold ${statusTone}`}>{statusLabel}</span>
                  <p className="text-xs text-charcoal/50">{[day(po.createdAt), po.createdByName && `by ${po.createdByName}`].filter(Boolean).join(' · ')}</p>
                </div>
                {addFor && addFor(po)}
              </div>
              <div className="mt-2 grid grid-cols-3 gap-2 text-center">
                <div className="rounded-md bg-[#F6F0E3] px-2 py-1.5"><p className="text-[11px] text-charcoal/60">PO value</p><p className="text-sm font-extrabold text-charcoal">{money(pay.totalAmount)}</p></div>
                <div className="rounded-md bg-[#E6F2EA] px-2 py-1.5"><p className="text-[11px] text-[#1F6B41]">Verified paid</p><p className="text-sm font-extrabold text-[#1F6B41]">{money(pay.amountPaid)}</p></div>
                <div className={`rounded-md px-2 py-1.5 ${pay.remaining > 0 ? 'bg-[#FFF1E6]' : extra > 0 ? 'bg-sky-50' : 'bg-[#F3EEE2]'}`}><p className={`text-[11px] ${pay.remaining > 0 ? 'text-[#C2410C]' : extra > 0 ? 'text-sky-900' : 'text-charcoal/60'}`}>{extra > 0 ? 'Paid extra' : 'Balance'}</p><p className={`text-sm font-extrabold ${pay.remaining > 0 ? 'text-[#C2410C]' : extra > 0 ? 'text-sky-900' : 'text-charcoal'}`}>{money(extra > 0 ? extra : pay.remaining)}</p></div>
              </div>
              {pay.pendingCount > 0 && <p className="mt-1.5 text-xs font-semibold text-amber-800">{pay.pendingCount} payment{pay.pendingCount === 1 ? '' : 's'} ({money(pay.pendingAmount)}) waiting for verification</p>}
              {payments.length ? <ul className="mt-2 divide-y divide-cardline">{payments.map((p) => <PaymentLine key={p.id} pay={p} />)}</ul> : <p className="mt-2 text-xs text-charcoal/50">No payment on this PO yet.</p>}
              <p className="mt-2 border-t border-cardline pt-2 text-xs text-charcoal/65">Medicine request: <b className="text-charcoal">{request ? `${request.statusLabel || request.status}${request.supplyLabel ? ` · ${request.supplyLabel}` : ''}` : 'not requested on this PO yet'}</b></p>
            </article>
          );
        })}
      </div>
      {pos.length > 1 && unlinked.length > 0 && (
        <div className="mt-3 rounded-lg border border-dashed border-amber-300 bg-amber-50/60 p-3">
          <p className="text-sm font-bold text-amber-900">Payments not on any PO ({unlinked.length})</p>
          <p className="text-xs text-amber-900/75">Added before payments were linked to a PO. They count in "Net paid" but for no PO; add new payments from the PO they belong to.</p>
          <ul className="mt-1 divide-y divide-amber-200">{unlinked.map((p) => <PaymentLine key={p.id} pay={p} />)}</ul>
        </div>
      )}
    </section>
  );
}
