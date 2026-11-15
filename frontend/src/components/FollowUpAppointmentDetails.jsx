const when = (value) => value ? new Date(value).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
const server = (import.meta.env.VITE_API_URL || 'http://localhost:5019/api').replace(/\/api\/?$/, '');
const asset = (url) => /^https?:\/\//i.test(url) ? url : `${server}${url}`;
const Stamp = ({ label, at, by, note }) => at ? <p className="text-[11px] text-charcoal/65"><b>{label}:</b> {when(at)}{by ? ` · ${by}` : ''}{note ? ` · ${note}` : ''}</p> : null;

export default function FollowUpAppointmentDetails({ value }) {
  if (!value) return <span className="text-charcoal/30">—</span>;
  return <div className="space-y-2">
    <p className="font-bold text-charcoal">Phase {value.phase} · {value.total} session(s)</p>
    <p className="text-charcoal/65">{value.completed} completed · {value.pending} pending · {value.cancelled} cancelled/rescheduled</p>
    {value.assignedPcc && <p>Assigned PCC: {value.assignedPcc}</p>}
    {value.nextPendingAt && <p className="font-semibold text-sage">Next pending: {when(value.nextPendingAt)}</p>}
    {!value.total ? <p className="text-charcoal/55">No follow-up sessions recorded.</p> : <details className="rounded border border-cardline p-2">
      <summary className="cursor-pointer font-bold text-sage">Follow-up & session details ({value.total})</summary>
      <div className="mt-2 max-h-[600px] space-y-3 overflow-y-auto pr-1">{value.sessions.map((session, index) => <article key={`${session.list}-${session.id || index}`} className="space-y-1 border-b border-cardline pb-3">
        <p className="font-bold">{index + 1}. {session.title}</p>
        <p className="text-charcoal/65">{session.kind} · {when(session.dateTime)}</p>
        <p className={`font-bold ${['done', 'done_late'].includes(session.state) ? 'text-emerald-800' : ['cancelled', 'rescheduled', 'missed', 'late', 'overdue', 'form_due'].includes(session.state) ? 'text-red-700' : 'text-amber-800'}`}>{session.stateLabel}</p>
        <p>{session.role === 'doctor' ? 'Doctor session' : 'PCC session'}{session.mode ? ` · ${session.mode}` : ''}{session.duration ? ` · ${session.duration} min` : ''}</p>
        {session.createdByName && <p className="text-[11px] text-charcoal/55">Scheduled by {session.createdByName}{session.createdAt ? ` · ${when(session.createdAt)}` : ''}</p>}
        {session.notes && <p className="break-words">Notes: {session.notes}</p>}
        <Stamp label="Confirmed" at={session.confirmedAt} by={session.confirmedByName} />
        <Stamp label="Missed" at={session.missedAt} by={session.missedByName} note={session.missReason} />
        <Stamp label="Rescheduled" at={session.movedAt} note={session.rescheduleReason} />
        {session.rescheduledFrom && <p className="text-charcoal/60">Rescheduled from: {session.rescheduledFromAt ? when(session.rescheduledFromAt) : 'Earlier session'}</p>}
        {session.rescheduledTo && <p className="text-charcoal/60">Rescheduled to: {session.rescheduledToAt ? when(session.rescheduledToAt) : 'Replacement session'}</p>}
        <Stamp label="Completed" at={session.completedAt} by={session.completedByName} />
        {session.completionName && <p>Completion name: {session.completionName}</p>}
        {session.completionDetails && <p className="break-words">Completion details: {session.completionDetails}</p>}
        <Stamp label="Cancelled" at={session.cancelledAt} by={session.cancelledByName} note={session.cancelReason} />
        <Stamp label="Tracker sent" at={session.trackerSentAt} by={session.trackerSentByName} />
        <Stamp label="Video requested" at={session.videoRequestedAt} by={session.videoRequestedByName} />
        {session.outcome && <p>Outcome: {session.outcome}{session.outcomeNote ? ` · ${session.outcomeNote}` : ''}</p>}
        <Stamp label="Outcome recorded" at={session.outcomeAt} by={session.outcomeByName} />
        {session.close && <div className="space-y-1 rounded bg-offwhite-200 p-2"><p>Red flag: {typeof session.close.redFlag === 'boolean' ? session.close.redFlag ? 'Yes' : 'No' : 'Not recorded'}</p>{session.close.concern && <p>Concern: {session.close.concern}</p>}{session.close.understanding && <p>Parent understanding: {session.close.understanding}</p>}{session.close.homeTask && <p>Home task: {session.close.homeTask}</p>}{session.close.recording && <p>Recording: {session.close.recording}</p>}</div>}
        {!!session.checklist.length && <details><summary className="cursor-pointer font-semibold text-sage">Session checklist ({session.checklist.length})</summary>{session.checklist.map((line, i) => <p key={i} className="mt-1">{line.answer === 'done' ? '✓' : 'N/A'} {line.text}{line.reason ? ` · ${line.reason}` : ''}</p>)}</details>}
        {(session.files.length > 0 || session.trackerSubmissionUrl || session.meetRecordingUrl) && <div className="space-y-1 pt-1">{session.files.map((file, i) => <a key={i} className="block break-words font-semibold text-sage hover:underline" href={asset(file.url)} target="_blank" rel="noreferrer">{file.fileName || `Session attachment ${i + 1}`}</a>)}{session.trackerSubmissionUrl && <a className="block font-semibold text-sage hover:underline" href={asset(session.trackerSubmissionUrl)} target="_blank" rel="noreferrer">Tracker submission</a>}{session.meetRecordingUrl && <a className="block font-semibold text-sage hover:underline" href={asset(session.meetRecordingUrl)} target="_blank" rel="noreferrer">Meeting recording</a>}</div>}
      </article>)}</div>
    </details>}
  </div>;
}
