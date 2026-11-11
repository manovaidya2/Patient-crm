import Badge from '../ui/Badge.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { roleAllowed } from '../../constants/roles.js';
import { PoProgressBar } from './PoPipeline.jsx';
import { PO_STATUS } from '../../constants/supplyPlans.js';

const money = (value) => `Rs ${Number(value || 0).toLocaleString('en-IN')}`;
const initials = (name) => String(name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
const day = (value) => (value ? new Date(value).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '');

// One purchase order as a clickable card: number, status, supply, progress and the step it is on now.
export default function PurchaseOrderRow({ po, onOpen, showPatient = true }) {
  const { user } = useAuth();
  const status = PO_STATUS[po.status] || PO_STATUS.pending;
  // Orange until the step waiting for this role is done (actionBy comes from the current step).
  const mine = roleAllowed(po.actionBy || [], user);
  return (
    <button type="button" onClick={() => onOpen(po)} className={`w-full rounded-[14px] border p-3.5 text-left transition hover:shadow-sm ${mine ? 'border-2 border-[#FDBA74] bg-[#FFF7ED] hover:border-[#F97316]' : 'border-[#E8DFCB] bg-white hover:border-sage/60'}`}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="font-mono text-[13px] font-extrabold text-charcoal">{po.poNumber}</span>
        <Badge tone={status.tone}>{status.label}</Badge>
        {po.supplyLabel && <span className="rounded-full bg-sage/10 px-2 py-0.5 text-[11px] font-semibold text-sage">{po.supplyLabel}</span>}
        {po.refill && <span className="rounded-full bg-[#EFE9FA] px-2 py-0.5 text-[11px] font-semibold text-[#4C2F8F]">Next supply</span>}
        <span className="text-xs text-charcoal/55">Phase {po.phase}</span>
        {mine && <span className="rounded-full bg-[#F97316] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">Your action</span>}
        <span className="ml-auto font-display text-[14px] font-extrabold text-charcoal">{money(po.amount)}</span>
      </div>
      {showPatient && <div className="mt-2 flex min-w-0 items-center gap-2.5"><span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-extrabold ${mine ? 'bg-[#FFE4CC] text-[#C2410C]' : 'bg-[#E9EFE8] text-[#3F5546]'}`}>{initials(po.patientName)}</span><p className="min-w-0 truncate text-[13px] text-charcoal"><b className="font-bold">{po.patientName}</b> <span className="text-[11.5px] text-charcoal/60">{po.patientCode}{po.patientPhone ? ` · ${po.patientPhone}` : ''}</span></p></div>}
      {/* What was paid on this PO, what is left, and how many months of medicine it sends. */}
      {po.poPayment && (
        <p className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[12px] text-charcoal/75">
          <span>Paid <b className="text-[#1F6B41]">{money(po.poPayment.amountPaid)}</b> of {money(po.amount || po.poPayment.totalAmount)}</span>
          {po.carriedForward
            ? <span>Balance <b>{money(po.carriedForward.amount)}</b> carried to {po.carriedForward.poNumber}</span>
            : <span>Balance <b className={Number(po.poPayment.remaining) > 0 ? 'text-[#C2410C]' : 'text-[#1F6B41]'}>{money(po.poPayment.remaining)}</b></span>}
          {po.poPayment.pendingCount > 0 && <span className="font-semibold text-amber-800">{po.poPayment.pendingCount} payment{po.poPayment.pendingCount === 1 ? '' : 's'} to verify</span>}
          {po.supplyMonths > 0 && <span><b>{po.supplyMonths} month{po.supplyMonths === 1 ? '' : 's'}</b> of medicine</span>}
          {po.previousPo && <span className="text-sky-900">balance of {po.previousPo.poNumber}</span>}
        </p>
      )}
      <div className="mt-2"><PoProgressBar steps={po.steps} /></div>
      <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2 text-xs">
        <span className={po.step.state === 'failed' ? 'font-semibold text-[#8C3B2E]' : mine ? 'font-bold text-[#C2410C]' : 'font-medium text-charcoal/75'}><span className="text-charcoal/45">{po.step.state === 'done' ? '' : 'Now: '}</span>{po.step.label}</span>
        <span className="text-charcoal/55">{day(po.createdAt)}{po.createdByName ? ` · ${po.createdByName}` : ''}</span>
      </div>
    </button>
  );
}
