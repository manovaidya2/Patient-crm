import { Link, useLocation } from 'react-router-dom';
import { BellRing, ChevronRight } from 'lucide-react';
import useTaskCounts from '../hooks/useTaskCounts.js';

// What each count means, in the words of the person who has to act on it.
export const PAGES = {
  '/admin/purchase-orders': ['Purchase Orders', 'POs waiting on your step'],
  '/admin/patient-approvals': ['Patient Approvals', 'Patients / payments to approve'],
  '/admin/payments': ['Payments', 'Payments to verify'],
  '/admin/accounts/consultations': ['Consultation Ledger', 'Consultation receipts to verify'],
  '/admin/accounts/refunds': ['Refund Register', 'Refunds to pay'],
  '/admin/courier': ['Courier Requests', 'Parcels to dispatch / deliver'],
  '/admin/medicine-requests': ['Medicine Requests', 'Requests to accept / make'],
  '/admin/medicine-jobs': ['Fulfilment Queue', 'Fulfilment steps waiting on you'],
  '/admin/medicine-made': ['Medicine Made', 'Made, waiting for release'],
  '/admin/stocks': ['Stocks', 'Items low or expired'],
  '/admin/medicine-explanations': ['Medicine Explanations', 'Explanations to complete (PCC)'],
  '/admin/followups': ['Follow-ups', 'Late / due today'],
  '/admin/family-sessions': ['Family Sessions', 'Late / due today'],
  '/admin/post-counseling-patients': ['Post Counseling', 'Outcome not decided yet'],
  '/admin/package-not-bought': ['Package Not Bought', 'Open (not converted / closed)'],
  '/admin/enquiries': ['Enquiries & Escalations', 'Open, assigned to you'],
};

// "Your pending work": one orange card per page that has work for this role (shown on the role's home page).
export default function PendingWork() {
  const location = useLocation();
  const counts = useTaskCounts(location.pathname);
  const items = Object.entries(counts).filter(([to, n]) => n > 0 && PAGES[to]);
  return (
    <section className="mb-5 rounded-xl border border-orange-200 bg-orange-50/60 p-3" aria-label="Your pending work">
      <p className="mb-2 flex items-center gap-2 text-sm font-bold text-charcoal"><BellRing size={16} className="text-orange-600" />Your pending work
        <span className="rounded-full bg-orange-500 px-2 py-0.5 text-[11px] font-bold text-white">{items.reduce((s, [, n]) => s + n, 0)}</span>
      </p>
      {items.length ? (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {items.map(([to, n]) => (
            <Link key={to} to={to} className="group flex items-center gap-3 rounded-lg border border-orange-200 bg-white px-3 py-2 transition hover:border-orange-400 hover:shadow-sm">
              <span className="flex h-9 min-w-9 items-center justify-center rounded-full bg-orange-500 px-2 text-sm font-bold text-white">{n > 99 ? '99+' : n}</span>
              <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-charcoal">{PAGES[to][0]}</span><span className="block truncate text-xs text-charcoal/60">{PAGES[to][1]}</span></span>
              <ChevronRight size={15} className="shrink-0 text-charcoal/30 group-hover:text-orange-600" />
            </Link>
          ))}
        </div>
      ) : <p className="text-sm text-charcoal/60">Nothing is waiting for you right now.</p>}
    </section>
  );
}
