import { Link, useLocation } from 'react-router-dom';
import { BellRing, ChevronRight } from 'lucide-react';
import useTaskCounts from '../hooks/useTaskCounts.js';
import useApiQuery from '../api/useApiQuery.js';
import { useAuth } from '../context/AuthContext.jsx';
import { PATIENT_ACCESS_ROLES } from '../constants/roles.js';
import ActorPatientsCard from './ActorPatientsCard.jsx';

// What each count means, in the words of the person who has to act on it.
export const PAGES = {
  '/admin/record-room-overdue': ['Record Room Overdue', 'Same-day paper uploads still pending from Reception'],
  '/admin/purchase-orders': ['Purchase Orders', 'POs waiting on your step'],
  '/admin/exception-payments': ['Exception Payment', 'Payment exceptions waiting for Doctor approval'],
  '/admin/patient-approvals': ['Patient Approvals', 'Patients / payments to approve'],
  '/admin/payments': ['Payments', 'Payments to verify'],
  '/admin/accounts/consultations': ['Consultation Ledger', 'Consultation receipts to verify'],
  '/admin/accounts/refunds': ['Refund Register', 'Refunds to pay'],
  '/admin/self-pickup-schedule': ['Self Pickup Schedule', 'Patients coming to collect medicine'],
  '/admin/courier': ['Porter / Courier Schedule', 'Parcels to dispatch / deliver'],
  '/admin/transit-follow-ups': ['In Transit Follow-ups', 'Follow-up calls due or late'],
  '/admin/patient-queries': ['Patient Queries', "Doctor's answers to send, follow-ups due, queries to solve"],
  '/admin/request-for-advice': ['Doctor Advice Required', 'Patient queries waiting for your answer'],
  '/admin/ready-not-delivered': ['Ready, Not Delivered', 'Medicines made but not delivered yet'],
  '/admin/all-expenses': ['All Expenses', 'Vouchers to approve, money to repay'],
  '/admin/clinic-expenses': ['Clinic Expenses', 'Expenses without a voucher / sent back'],
  '/admin/medicine-purchases': ['Medicine Purchases', 'Purchases without a voucher / sent back'],
  '/admin/medicine-requests': ['Medicine Requests', 'Requests to accept / make'],
  '/admin/medicine-jobs': ['Fulfilment Queue', 'Fulfilment steps waiting on you'],
  '/admin/medicine-made': ['Medicine Made', 'Made, waiting for release'],
  '/admin/stocks': ['Stocks', 'Items low or expired'],
  '/admin/treatment-papers': ['Make Treatment Paper', 'Treatment papers to make (fulfilment step 9)'],
  '/admin/final-check': ['Medicine Final Check', 'Parcels to check (fulfilment step 11)'],
  '/admin/medicine-explanations': ['Medicine Explanations', 'Explanations to complete (PCC)'],
  '/admin/treatment-delivery': ['Treatment Delivery', 'Plans to set up, sessions to confirm / close'],
  '/admin/followups': ['Follow-ups', 'Late / due today'],
  '/admin/family-sessions': ['Family Sessions', 'Late / due today'],
  '/admin/post-counseling-patients': ['Post Counseling', 'Outcome not decided yet'],
  '/admin/package-not-bought': ['Package Not Bought', 'Open (not converted / closed)'],
  '/admin/enquiries': ['Enquiries & Escalations', 'Open, assigned to you'],
};

// A list section (My day, Team pending, Control Room): one per page, or for fulfilment and medicine requests one per
// step - the step's name and who it is pending with.
export const sectionKey = (s) => (s.step ? `${s.page}|${s.step}` : s.page);
export const sectionLabel = (s) => s.title || PAGES[s.page]?.[0] || s.page;
export const stepKind = (page) => (page === '/admin/medicine-jobs' ? 'Fulfilment' : 'Medicine request');
export const sectionHint = (s) => (s.pendingWith ? `Pending with ${s.pendingWith} · ${stepKind(s.page)}` : PAGES[s.page]?.[1] || '');

// "Your pending work": one orange card per page that has work for this role (shown on the role's home page).
// Pages shown step by step: a card per step with work waiting (its name, who it is pending with, how many).
const STEP_PAGES = ['/admin/medicine-jobs', '/admin/medicine-requests'];

export default function PendingWork() {
  const location = useLocation();
  const counts = useTaskCounts(location.pathname);
  const stepped = STEP_PAGES.some((to) => counts[to] > 0);
  const { data: stepData } = useApiQuery('/tasks/steps', {}, { enabled: stepped });
  const steps = stepData?.steps || [];
  // A page whose steps are loaded is shown as its steps; until then (or when a step list is empty) as one card.
  const items = Object.entries(counts).filter(([to, n]) => n > 0 && PAGES[to] && !(STEP_PAGES.includes(to) && steps.some((s) => s.page === to)));
  // Patients tagged "Actor patient" (for everyone who opens patients): a card that opens their list.
  const { user } = useAuth();
  const { data: actors } = useApiQuery('/patients/tagged/actor', {}, { enabled: PATIENT_ACCESS_ROLES.includes(user?.role) });
  const actorPatients = actors?.patients || [];
  return (
    <section className="mb-5 rounded-xl border border-orange-200 bg-orange-50/60 p-3" aria-label="Your pending work">
      <p className="mb-2 flex items-center gap-2 text-sm font-bold text-charcoal"><BellRing size={16} className="text-orange-600" />Your pending work
        <span className="rounded-full bg-orange-500 px-2 py-0.5 text-[11px] font-bold text-white">{items.reduce((s, [, n]) => s + n, 0) + steps.reduce((s, x) => s + x.count, 0)}</span>
      </p>
      {items.length || steps.length || actorPatients.length ? (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {items.map(([to, n]) => (
            <Link key={to} to={to} className="group flex items-center gap-3 rounded-lg border border-orange-200 bg-white px-3 py-2 transition hover:border-orange-400 hover:shadow-sm">
              <span className="flex h-9 min-w-9 items-center justify-center rounded-full bg-orange-500 px-2 text-sm font-bold text-white">{n > 99 ? '99+' : n}</span>
              <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-charcoal">{PAGES[to][0]}</span><span className="block truncate text-xs text-charcoal/60">{PAGES[to][1]}</span></span>
              <ChevronRight size={15} className="shrink-0 text-charcoal/30 group-hover:text-orange-600" />
            </Link>
          ))}
          {steps.map((s) => (
            <Link key={`${s.page}|${s.key}`} to={s.href} className="group flex items-center gap-3 rounded-lg border border-orange-200 bg-white px-3 py-2 transition hover:border-orange-400 hover:shadow-sm">
              <span className="flex h-9 min-w-9 items-center justify-center rounded-full bg-orange-500 px-2 text-sm font-bold text-white">{s.count > 99 ? '99+' : s.count}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-charcoal" title={s.title}>{s.title}</span>
                <span className="block truncate text-xs text-charcoal/60" title={sectionHint(s)}>Pending with <b className="font-semibold text-charcoal/75">{s.pendingWith}</b> · {stepKind(s.page)}</span>
              </span>
              <ChevronRight size={15} className="shrink-0 text-charcoal/30 group-hover:text-orange-600" />
            </Link>
          ))}
          <ActorPatientsCard patients={actorPatients} />
        </div>
      ) : <p className="text-sm text-charcoal/60">Nothing is waiting for you right now.</p>}
    </section>
  );
}
