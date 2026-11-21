import { Link, useNavigate } from 'react-router-dom';
import { AlertTriangle, CalendarHeart, UserX } from 'lucide-react';
import useApiQuery from '../../api/useApiQuery.js';
import { KIND_STYLE, STATE_STYLE, fmtAt, fmtDay } from './careUi.js';

const lengthText = (days) => (days % 30 === 0 ? `${days / 30} month${days === 30 ? '' : 's'}` : `${days} days`);

// Patient page: the Care Schedule of each phase - the 13 sessions from the medicine start date (only those the
// medicine covers so far), where each stands, and the form of each one. Nothing shows for a patient without it.
export default function PatientCareCard({ patientId }) {
  const { data } = useApiQuery(`/care/patients/${patientId}`, {}, { enabled: Boolean(patientId) });
  const navigate = useNavigate();
  const phases = data?.phases || [];
  if (!phases.length) return null;
  return (
    <section className="overflow-hidden rounded-xl border-2 border-[#1F5F4A]/40 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-2 bg-[#1F5F4A] px-4 py-2 text-white">
        <h3 className="flex items-center gap-2 text-sm font-extrabold uppercase tracking-wide"><CalendarHeart size={16} />Care Schedule</h3>
        <Link to="/admin/care-schedule" className="text-xs font-semibold text-white/85 hover:underline">Open worklist</Link>
      </div>
      <div className="space-y-4 p-3">
        {phases.map((phase) => (
          <div key={phase.phase}>
            <p className="mb-1.5 text-[12.5px] text-charcoal/65">
              <b className="text-charcoal">Phase {phase.phase}</b>
              {phase.plan?.parts?.map((p, i) => <span key={i}> · Supply {i + 1}: {lengthText(p.days)} from {fmtDay(p.startDate)}{p.poNumber ? ` (${p.poNumber})` : ''}</span>)}
              {phase.plan && phase.plan.coveredDays < phase.plan.phaseDays && <span className="text-[#9A5B00]"> · days {phase.plan.coveredDays + 1}–{phase.plan.phaseDays} come with the next supply</span>}
            </p>
            <div className="grid gap-1.5 sm:grid-cols-2 xl:grid-cols-3">
              {phase.sessions.map((s) => {
                const kind = KIND_STYLE[s.kind] || KIND_STYLE.followup;
                return (
                  <button key={s.id} type="button" onClick={() => navigate(`/admin/care-schedule/session/${s.id}`)} className={`flex items-start gap-2 rounded-lg border px-2.5 py-2 text-left transition hover:border-[#1F5F4A]/50 ${s.state === 'alert' ? 'border-[#B4232F]/50 bg-[#FFF5F5]' : 'border-cardline bg-white'}`}>
                    <span className={`mt-0.5 rounded px-1.5 py-0.5 text-[10.5px] font-bold ${kind.chip}`}>{s.code}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[12.5px] font-bold text-charcoal">{s.title} · Day {s.day}</span>
                      <span className="block text-[11.5px] text-charcoal/60">{s.status === 'completed' ? `Done ${fmtAt(s.completedAt)}` : s.callAt ? `Call ${fmtAt(s.callAt)}` : `Due ${fmtDay(s.targetDate)}`}{s.assigneeName ? ` · ${s.assigneeName}` : ''}</span>
                      {s.final && <span className="block truncate text-[11px] text-[#1F4F3D]">{s.final}</span>}
                      {s.leave && <span className="flex items-center gap-1 text-[11px] font-semibold text-[#9A5B00]"><UserX size={11} />PCC on leave</span>}
                    </span>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10.5px] font-bold ${STATE_STYLE[s.state] || ''}`}>{s.state === 'alert' && <AlertTriangle size={10} className="mr-0.5 inline" />}{s.stateLabel}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
