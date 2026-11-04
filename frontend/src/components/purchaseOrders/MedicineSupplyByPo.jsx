import { Link } from 'react-router-dom';

// Medicine Supply of a phase, PO by PO: which months each PO's medicine covers, where the medicine is, when it reached
// the patient and when it was explained, and the note saved at "Verify payment" (months for how much payment, balance).
const day = (v) => (v ? new Date(v).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '');
const rs = (n) => `Rs ${Number(n || 0).toLocaleString('en-IN')}`;
const STATUS = { requested: 'Requested', in_process: 'Being prepared', made: 'Ready', sent_to_courier: 'Released', cancelled: 'Cancelled' };
const monthsText = (s) => (!s?.fromMonth ? '' : s.fromMonth === s.toMonth ? `Month ${s.fromMonth}` : `Months ${s.fromMonth}-${s.toMonth}`);

function where(m) {
  if (!m) return ['Not requested yet', 'text-charcoal/50'];
  if (m.deliveredAt) return [`${m.mode === 'pickup' ? 'Collected' : 'Received'} ${day(m.deliveredAt)}${m.receivedByName ? ` by ${m.receivedByName}` : ''}`, 'text-[#1F6B41]'];
  if (m.dispatchedAt) return [`Dispatched ${day(m.dispatchedAt)} - on the way`, 'text-sky-800'];
  return [STATUS[m.status] || m.status, 'text-[#C2410C]'];
}

export default function MedicineSupplyByPo({ split }) {
  const pos = (split?.purchaseOrders || []).filter((po) => !['rejected', 'cancelled'].includes(po.status));
  if (!pos.length) return <p className="px-4 pb-3 text-sm text-charcoal/55">No purchase order in this phase yet: the medicine supply shows here PO by PO.</p>;
  const given = pos.filter((po) => po.medicine?.deliveredAt).reduce((n, po) => n + (po.supply?.months || 0), 0);
  const ordered = pos.reduce((n, po) => n + (po.supply?.months || 0), 0);
  const explained = pos.map((po) => po.medicine?.explainedAt).filter(Boolean).sort().pop();
  return (
    <div className="space-y-3 px-4 pb-3">
      <div className="grid gap-2 sm:grid-cols-3">
        <div className="rounded-lg bg-white/80 px-3 py-2 ring-1 ring-cardline"><p className="text-[10px] font-bold uppercase tracking-wide text-charcoal/50">Medicine months given</p><p className="text-base font-extrabold text-charcoal">{given} of {ordered} month{ordered === 1 ? '' : 's'}</p><p className="text-[11px] text-charcoal/55">reached the patient / ordered on the POs</p></div>
        <div className="rounded-lg bg-white/80 px-3 py-2 ring-1 ring-cardline"><p className="text-[10px] font-bold uppercase tracking-wide text-charcoal/50">Last medicine explained</p><p className="text-base font-extrabold text-charcoal">{explained ? day(explained) : 'Not yet'}</p></div>
        <div className="rounded-lg bg-white/80 px-3 py-2 ring-1 ring-cardline"><p className="text-[10px] font-bold uppercase tracking-wide text-charcoal/50">Purchase orders</p><p className="text-base font-extrabold text-charcoal">{pos.length}</p></div>
      </div>
      <div className="overflow-x-auto rounded-lg ring-1 ring-cardline">
        <table className="w-full min-w-[760px] bg-white/80 text-left text-sm">
          <thead className="bg-[#56695D] text-xs text-white"><tr>{['PO', 'Months', 'Medicine', 'Where it is', 'Explained', 'Payment note'].map((h) => <th key={h} className="px-3 py-2 font-semibold">{h}</th>)}</tr></thead>
          <tbody className="divide-y divide-cardline">
            {pos.map((po) => {
              const [whereText, tone] = where(po.medicine);
              const m = po.medicine;
              return (
                <tr key={po.id} className="align-top">
                  <td className="px-3 py-2"><Link to={`/admin/purchase-orders/${po.id}`} className="font-mono font-bold text-sage hover:underline">{po.poNumber}</Link>{po.previousPoNumber && <span className="block text-[11px] text-charcoal/55">balance of {po.previousPoNumber}</span>}{po.carriedForwardToNumber && <span className="block text-[11px] text-charcoal/55">{rs(po.carriedForwardAmount)} carried to {po.carriedForwardToNumber}</span>}</td>
                  <td className="px-3 py-2 font-semibold">{monthsText(po.supply) || '-'}{po.supply?.months ? <span className="block text-[11px] font-normal text-charcoal/55">{po.supply.months} month{po.supply.months === 1 ? '' : 's'}</span> : null}</td>
                  <td className="px-3 py-2">{po.supply?.label || 'Supply not set'}{m?.requestedAt && <span className="block text-[11px] text-charcoal/55">requested {day(m.requestedAt)}</span>}</td>
                  <td className={`px-3 py-2 font-semibold ${tone}`}>{whereText}</td>
                  <td className="px-3 py-2">{m?.explainedAt ? <><b>{day(m.explainedAt)}</b>{m.explainedByName && <span className="block text-[11px] text-charcoal/55">by {m.explainedByName}</span>}</> : m?.explanationDate ? <span className="text-charcoal/70">Scheduled {day(m.explanationDate)}</span> : <span className="text-charcoal/45">-</span>}</td>
                  <td className="px-3 py-2 text-xs">{m?.supplyNote || <span className="text-charcoal/55">Paid {rs(po.payment?.amountPaid)} of {rs(po.payment?.totalAmount)}{po.payment?.remaining > 0 ? ` · balance ${rs(po.payment.remaining)}` : ''}</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
