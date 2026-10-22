import Badge from '../ui/Badge.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { PoProgressBar } from './PoPipeline.jsx';
import { PO_STATUS } from '../../constants/supplyPlans.js';

const money = (value) => `Rs ${Number(value || 0).toLocaleString('en-IN')}`;
const day = (value) => (value ? new Date(value).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '');

// One purchase order as a clickable card: number, status, supply, progress and the step it is on now.
export default function PurchaseOrderRow({ po, onOpen, showPatient = true }) {
  const { user } = useAuth();
  const status = PO_STATUS[po.status] || PO_STATUS.pending;
  // Orange until the step waiting for this role is done (actionBy comes from the current step).
  const mine = (po.actionBy || []).includes(user?.role);
  return (
    <button type="button" onClick={() => onOpen(po)} className={`w-full rounded-xl border p-3 text-left transition hover:shadow-sm ${mine ? 'border-orange-400 bg-orange-50/60 ring-1 ring-orange-300 hover:border-orange-500' : 'border-cardline bg-white hover:border-sage/60'}`}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="font-mono text-sm font-bold text-charcoal">{po.poNumber}</span>
        <Badge tone={status.tone}>{status.label}</Badge>
        {po.supplyLabel && <span className="rounded-full bg-sage/10 px-2 py-0.5 text-[11px] font-semibold text-sage">{po.supplyLabel}</span>}
        <span className="text-xs text-charcoal/55">Phase {po.phase}</span>
        {mine && <span className="rounded-full bg-orange-500 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">Your action</span>}
        <span className="ml-auto text-sm font-semibold text-charcoal">{money(po.amount)}</span>
      </div>
      {showPatient && <p className="mt-1 truncate text-sm text-charcoal"><b>{po.patientName}</b> <span className="text-xs text-charcoal/50">{po.patientCode}{po.patientPhone ? ` · ${po.patientPhone}` : ''}</span></p>}
      <div className="mt-2"><PoProgressBar steps={po.steps} /></div>
      <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2 text-xs">
        <span className={po.step.state === 'failed' ? 'font-semibold text-[#8C3B2E]' : mine ? 'font-semibold text-orange-700' : 'text-charcoal/70'}><span className="text-charcoal/45">{po.step.state === 'done' ? '' : 'Now: '}</span>{po.step.label}</span>
        <span className="text-charcoal/45">{day(po.createdAt)}{po.createdByName ? ` · ${po.createdByName}` : ''}</span>
      </div>
    </button>
  );
}
