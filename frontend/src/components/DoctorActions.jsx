import { Link } from 'react-router-dom';
import { AlertTriangle, BellRing, ChevronRight, FlaskConical, ReceiptText, Stethoscope, WalletCards } from 'lucide-react';
import useApiQuery from '../api/useApiQuery.js';

const ICONS = { formula: FlaskConical, advice: Stethoscope, exception: WalletCards, voucher: ReceiptText };
// Where "see all" goes for each kind of work.
const PAGE = { formula: '/admin/medicine-jobs', advice: '/admin/request-for-advice', exception: '/admin/exception-payments', voucher: '/admin/all-expenses' };
const SHOW = 4;

const waiting = (since) => {
  if (!since) return '';
  const hours = Math.max(0, Math.floor((Date.now() - new Date(since).getTime()) / 3600000));
  return hours < 24 ? `${hours}h` : `${Math.floor(hours / 24)}d`;
};

// Top of the Control Room: every task waiting on the doctor, in maroon - medicine formulations (fulfilment step 2),
// requests for the doctor's advice from the PCC (urgent first), exception payments and vouchers to approve.
export default function DoctorActions() {
  const { data, loading } = useApiQuery('/tasks/doctor-actions');
  if (loading && !data) return null;
  const groups = (data?.groups || []).filter((g) => g.items.length);
  const total = data?.total || 0;
  if (!total) {
    return <p className="mb-4 flex items-center gap-2 rounded-xl border border-[#7A1F2B]/25 bg-[#7A1F2B]/[0.04] px-4 py-2.5 text-sm font-semibold text-[#7A1F2B]"><Stethoscope size={16} />Doctor action required: nothing is waiting on the doctor right now.</p>;
  }
  return (
    <section className="mb-5 overflow-hidden rounded-xl border-2 border-[#7A1F2B] bg-[#FBF1F2] shadow-sm" aria-label="Doctor action required">
      <div className="flex flex-wrap items-center justify-between gap-2 bg-[#7A1F2B] px-4 py-2.5 text-white">
        <p className="flex items-center gap-2 text-sm font-extrabold uppercase tracking-wide"><Stethoscope size={17} />Doctor action required
          <span className="rounded-full bg-white px-2.5 py-0.5 text-xs font-extrabold text-[#7A1F2B]">{total}</span>
          {data.urgent > 0 && <span className="inline-flex items-center gap-1 rounded-full bg-[#F4C542] px-2.5 py-0.5 text-xs font-extrabold text-[#5C1620]"><AlertTriangle size={12} />{data.urgent} urgent</span>}
        </p>
        <p className="text-xs text-white/80">Waiting on the doctor · oldest first · click a task to open it</p>
      </div>
      <div className={`grid gap-3 p-3 ${groups.length > 2 ? 'md:grid-cols-2 xl:grid-cols-4' : 'md:grid-cols-2'}`}>
        {groups.map((group) => {
          const Icon = ICONS[group.key] || Stethoscope;
          return (
            <div key={group.key} className="flex min-w-0 flex-col rounded-lg border border-[#7A1F2B]/25 bg-white">
              <div className="flex items-start justify-between gap-2 border-b border-[#7A1F2B]/15 px-3 py-2">
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 text-sm font-bold text-[#7A1F2B]"><Icon size={15} />{group.title}</p>
                  <p className="truncate text-[11px] text-charcoal/55">{group.hint}</p>
                </div>
                <span className="flex h-7 min-w-7 items-center justify-center rounded-full bg-[#7A1F2B] px-2 text-xs font-extrabold text-white">{group.items.length}</span>
              </div>
              <ul className="flex-1 divide-y divide-[#7A1F2B]/10">
                {group.items.slice(0, SHOW).map((item) => (
                  <li key={item.id}>
                    <Link to={item.href} className={`group flex items-start gap-2 px-3 py-2 transition hover:bg-[#7A1F2B]/[0.05] ${item.urgent ? 'bg-[#FFF4D6]' : ''}`}>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5 text-[13px] font-semibold text-charcoal">
                          {item.urgent && <AlertTriangle size={13} className="shrink-0 text-[#B4232F]" />}
                          <span className="truncate">{item.title}</span>
                          {item.code && <span className="shrink-0 font-mono text-[10.5px] font-normal text-charcoal/45">{item.code}</span>}
                        </span>
                        {item.detail && <span className="line-clamp-2 block text-[11.5px] text-charcoal/60">{item.detail}</span>}
                        {item.flag && <span className="mt-0.5 inline-flex items-center gap-1 text-[11px] font-semibold text-[#B4232F]"><BellRing size={11} />{item.flag}</span>}
                      </span>
                      {item.since && <span className="shrink-0 rounded bg-[#7A1F2B]/10 px-1.5 py-0.5 text-[10.5px] font-bold text-[#7A1F2B]" title={`Waiting since ${new Date(item.since).toLocaleString('en-IN')}`}>{waiting(item.since)}</span>}
                      <ChevronRight size={14} className="mt-0.5 shrink-0 text-charcoal/25 group-hover:text-[#7A1F2B]" />
                    </Link>
                  </li>
                ))}
              </ul>
              {group.items.length > SHOW && <Link to={PAGE[group.key]} className="border-t border-[#7A1F2B]/15 px-3 py-1.5 text-center text-xs font-bold text-[#7A1F2B] hover:bg-[#7A1F2B]/[0.05]">+{group.items.length - SHOW} more · open all</Link>}
            </div>
          );
        })}
      </div>
    </section>
  );
}
