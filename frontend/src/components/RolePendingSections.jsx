import { Link } from 'react-router-dom';
import { AlertTriangle, ChevronRight, Users } from 'lucide-react';
import { useTeamPending } from './TeamPending.jsx';
import { PAGES, sectionHint, sectionKey, sectionLabel } from './PendingWork.jsx';
import { bucketOf, when } from '../utils/taskTiming.js';
import { useAuth } from '../context/AuthContext.jsx';

// Pages the Doctor cannot open: their work is shown to the Doctor without links (view only).
const DOCTOR_CANNOT_OPEN = new Set(['/admin/package-not-bought', '/admin/self-pickup-schedule', '/admin/courier', '/admin/medicine-explanations', '/admin/final-check', '/admin/treatment-papers', '/admin/transit-follow-ups', '/admin/record-room-overdue', '/admin/patient-queries']);

// A task row: a link when the page can be opened, plain text otherwise.
const Row = ({ open, to, children }) => (open
  ? <Link to={to} className="group flex items-start gap-2 px-3 py-2 transition hover:bg-charcoal/[0.03]">{children}</Link>
  : <div className="flex items-start gap-2 px-3 py-2">{children}</div>);

// One colour per role, so each role's section stands apart on the Control Room.
const ROLE_TONE = {
  medicine_department: { band: 'bg-[#166534]', border: 'border-[#166534]', soft: 'bg-[#F0F8F2]', text: 'text-[#166534]', ring: 'border-[#166534]/25', divide: 'divide-[#166534]/15' },
  in_transit: { band: 'bg-[#1D4ED8]', border: 'border-[#1D4ED8]', soft: 'bg-[#EFF4FF]', text: 'text-[#1D4ED8]', ring: 'border-[#1D4ED8]/25', divide: 'divide-[#1D4ED8]/15' },
  assistant_doctor: { band: 'bg-[#B45309]', border: 'border-[#B45309]', soft: 'bg-[#FFF7EB]', text: 'text-[#B45309]', ring: 'border-[#B45309]/25', divide: 'divide-[#B45309]/15' },
  post_counselor: { band: 'bg-[#4338CA]', border: 'border-[#4338CA]', soft: 'bg-[#F1F0FF]', text: 'text-[#4338CA]', ring: 'border-[#4338CA]/25', divide: 'divide-[#4338CA]/15' },
  receptionist: { band: 'bg-[#0F766E]', border: 'border-[#0F766E]', soft: 'bg-[#EEF8F7]', text: 'text-[#0F766E]', ring: 'border-[#0F766E]/25', divide: 'divide-[#0F766E]/15' },
  sales_team: { band: 'bg-[#475569]', border: 'border-[#475569]', soft: 'bg-[#F4F6F8]', text: 'text-[#475569]', ring: 'border-[#475569]/25', divide: 'divide-[#475569]/15' },
  digital_marketing: { band: 'bg-[#BE185D]', border: 'border-[#BE185D]', soft: 'bg-[#FDF0F6]', text: 'text-[#BE185D]', ring: 'border-[#BE185D]/25', divide: 'divide-[#BE185D]/15' },
};
const FALLBACK = ROLE_TONE.sales_team;
const SHOW = 4;
// The PCC's role is shown as "PCC"; the doctor's own work is in the maroon section above.
const LABEL = { assistant_doctor: 'PCC (Patient Care Coordinator)' };

// Control Room: below "Your pending work" and the doctor's section, every other role that has work pending gets its
// own coloured section - page by page, the oldest / most urgent first, with whose it is (same lists as Team pending).
export default function RolePendingSections() {
  const { user } = useAuth();
  const canOpen = (page) => user?.role !== 'doctor' || !DOCTOR_CANNOT_OPEN.has(page);
  const { data, loading } = useTeamPending({ full: true });
  const roles = (data?.roles || []).filter((r) => r.role !== 'doctor' && r.total > 0);
  if (!data) return loading ? <p className="mb-4 text-sm text-charcoal/55">Loading every team's pending work...</p> : null;
  if (!roles.length) return data.building ? <p className="mb-4 text-sm text-charcoal/55">Preparing every team's pending work...</p> : null;
  return (
    <div className="mb-5 space-y-4" aria-label="Pending work by role">
      {roles.map((role) => {
        const tone = ROLE_TONE[role.role] || FALLBACK;
        const late = role.sections.reduce((n, s) => n + (s.items || []).filter((i) => bucketOf(i) === 'overdue').length, 0);
        const busy = role.people.filter((p) => p.personal > 0);
        return (
          <details key={role.role} open className={`overflow-hidden rounded-xl border-2 ${tone.border} ${tone.soft} shadow-sm`}>
            <summary className={`flex cursor-pointer list-none flex-wrap items-center justify-between gap-2 ${tone.band} px-4 py-2.5 text-white`}>
              <span className="flex items-center gap-2 text-sm font-extrabold uppercase tracking-wide"><Users size={16} />Waiting on {LABEL[role.role] || role.label}
                <span className={`rounded-full bg-white px-2.5 py-0.5 text-xs font-extrabold ${tone.text}`}>{role.total}</span>
                {late > 0 && <span className="inline-flex items-center gap-1 rounded-full bg-[#FDE2E1] px-2.5 py-0.5 text-xs font-extrabold text-[#9F1D1D]"><AlertTriangle size={12} />{late} overdue</span>}
              </span>
              <span className="text-xs text-white/80">{busy.length ? busy.map((p) => `${p.name} ${p.personal}`).join(' · ') : 'Shared by the whole team'}</span>
            </summary>
            <div className="grid gap-3 p-3 md:grid-cols-2 xl:grid-cols-3">
              {role.sections.map((section) => {
                const page = PAGES[section.page];
                const items = section.items || [];
                const open = canOpen(section.page);
                const who = section.shared ? `Anyone in ${role.label}` : (section.byPerson || []).map((p) => `${p.name} ${p.count}`).join(' · ');
                return (
                  <div key={sectionKey(section)} className={`flex min-w-0 flex-col rounded-lg border ${tone.ring} bg-white`}>
                    <div className={`flex items-start justify-between gap-2 border-b ${tone.ring} px-3 py-2`}>
                      <div className="min-w-0">
                        <p className={`truncate text-sm font-bold ${tone.text}`} title={sectionLabel(section)}>{sectionLabel(section)}{!open && <span className="ml-1.5 rounded bg-charcoal/[0.06] px-1.5 py-0.5 align-middle text-[10px] font-semibold text-charcoal/50">view only</span>}</p>
                        <p className="truncate text-[11px] text-charcoal/55" title={section.step ? sectionHint(section) : undefined}>{section.step ? [sectionHint(section), section.shared ? '' : who].filter(Boolean).join(' · ') : who || page?.[1]}</p>
                      </div>
                      <span className={`flex h-7 min-w-7 items-center justify-center rounded-full ${tone.band} px-2 text-xs font-extrabold text-white`}>{section.count}</span>
                    </div>
                    <ul className={`flex-1 divide-y ${tone.divide}`}>
                      {items.slice(0, SHOW).map((item) => {
                        const overdue = bucketOf(item) === 'overdue';
                        return (
                          <li key={item.key}>
                            <Row open={open} to={item.href || section.page}>
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-[13px] font-semibold text-charcoal">{item.title}</span>
                                {item.detail && <span className="line-clamp-2 block text-[11.5px] text-charcoal/60">{item.detail}</span>}
                                {item.people?.length > 0 && <span className="block text-[11px] text-charcoal/45">{item.people.join(', ')}</span>}
                              </span>
                              {when(item) && <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10.5px] font-bold ${overdue ? 'bg-[#FDE2E1] text-[#9F1D1D]' : 'bg-charcoal/[0.06] text-charcoal/60'}`}>{when(item)}</span>}
                              {open && <ChevronRight size={14} className="mt-0.5 shrink-0 text-charcoal/25" />}
                            </Row>
                          </li>
                        );
                      })}
                      {!items.length && <li className="px-3 py-2 text-xs text-charcoal/50">{section.count} pending</li>}
                    </ul>
                    {section.count > Math.min(SHOW, items.length) && items.length > 0 && !open && <p className={`border-t ${tone.ring} px-3 py-1.5 text-center text-xs font-semibold text-charcoal/50`}>+{section.count - Math.min(SHOW, items.length)} more</p>}
                    {section.count > Math.min(SHOW, items.length) && items.length > 0 && open && <Link to={section.href || section.page} className={`border-t ${tone.ring} px-3 py-1.5 text-center text-xs font-bold ${tone.text} hover:bg-charcoal/[0.03]`}>+{section.count - Math.min(SHOW, items.length)} more · open the page</Link>}
                  </div>
                );
              })}
            </div>
          </details>
        );
      })}
    </div>
  );
}
