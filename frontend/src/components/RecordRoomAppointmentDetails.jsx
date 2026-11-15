import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { ROLES, roleAllowed } from '../constants/roles.js';

const when = (value) => value ? new Date(value).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Not recorded';
const server = (import.meta.env.VITE_API_URL || 'http://localhost:5019/api').replace(/\/api\/?$/, '');
const asset = (url) => /^https?:\/\//i.test(url) ? url : `${server}${url}`;
const LABELS = { not_registered: 'No Record Room entry', uploaded: 'Papers uploaded', partial: 'Some papers still pending', pending: 'Papers not uploaded', overdue: 'Paper upload overdue' };

export default function RecordRoomAppointmentDetails({ value }) {
  const { user } = useAuth();
  if (!value) return <span className="text-charcoal/30">—</span>;
  return <div className="space-y-2">
    <p className={`font-bold ${value.status === 'uploaded' ? 'text-emerald-800' : value.overdue ? 'text-red-700' : 'text-amber-800'}`}>{LABELS[value.status]}</p>
    {value.total > 0 && <p className="text-charcoal/65">{value.uploaded}/{value.total} record(s) uploaded · {value.pending} pending{value.overdue ? ` · ${value.overdue} overdue` : ''}</p>}
    {value.total > 0 && <details className="rounded border border-cardline p-2">
      <summary className="cursor-pointer font-bold text-sage">Record Room details ({value.total})</summary>
      <div className="mt-2 max-h-[600px] space-y-3 overflow-y-auto pr-1">{value.entries.map((record) => <article key={record.id} className="space-y-2 border-b border-cardline pb-3">
        <p className="font-bold">{record.patientId || 'No patient ID'}{record.appointmentId ? ` · ${record.appointmentId}` : ''}</p>
        <p className={record.uploadStatus === 'uploaded' ? 'font-semibold text-emerald-800' : record.uploadStatus === 'overdue' ? 'font-semibold text-red-700' : 'font-semibold text-amber-800'}>{LABELS[record.uploadStatus]}{record.uploadStatus === 'overdue' ? ` · ${record.overdueDays} day(s)` : ''}</p>
        <p>{record.treatmentStatus === 'not_bought' ? 'Treatment not bought' : 'Treatment bought'}</p>
        <p>Shelf: {record.shelfNumber || '—'} · File: {record.fileNumber || '—'} · Index: {record.indexNumber || '—'}</p>
        <p>First paper received: {when(record.firstReceivedAt)}</p>
        <p className="text-[11px] text-charcoal/60">Entry created: {when(record.createdAt)} · {record.createdByName || 'Name not recorded'}</p>
        {record.uploadStatus !== 'uploaded' && record.uploadDueAt && <p className="text-amber-800">Upload due: {when(record.uploadDueAt)} IST{!record.firstReceivedAt ? ' (entry creation date used)' : ''}</p>}
        <p>Pages: {record.pdfPageCount || record.documents.length}</p>
        {record.pdfUpdatedAt && <p className="text-[11px] text-charcoal/60">PDF updated: {when(record.pdfUpdatedAt)}</p>}
        {record.pdfUrl && <a href={asset(record.pdfUrl)} target="_blank" rel="noreferrer" className="block break-words font-semibold text-sage hover:underline">View / download {record.pdfName}</a>}
        {!!record.documents.length && <div className="space-y-2"><p className="font-bold">Uploaded papers</p>{record.documents.map((file, i) => <div key={`${file.url}-${i}`}><a href={asset(file.url)} target="_blank" rel="noreferrer" className="block break-words font-semibold text-sage hover:underline">{i + 1}. {file.fileName || 'Open paper'}</a><p className="text-[11px] text-charcoal/55">{when(file.uploadedAt)} · {file.uploadedByName || 'Name not recorded'}</p></div>)}</div>}
        {!!record.movements.length && <details><summary className="cursor-pointer font-semibold text-sage">Paper issue / return history ({record.movements.length})</summary><div className="mt-2 space-y-2">{record.movements.map((movement, i) => <div key={i} className="space-y-1 border-l border-cardline pl-2"><p className="font-bold">{movement.paperName} · {movement.returnedAt ? 'Returned' : 'Awaiting return'}</p><p>Given to: {movement.givenTo}</p><p className="text-[11px] text-charcoal/60">Issued: {when(movement.issuedAt)} · {movement.issuedByName || 'Name not recorded'}</p>{movement.reason && <p>Reason: {movement.reason}</p>}{movement.returnedAt && <p className="text-[11px] text-charcoal/60">Returned: {when(movement.returnedAt)} · {movement.returnedByName || 'Name not recorded'}</p>}{movement.returnCondition && <p>Condition: {movement.returnCondition}</p>}{movement.problemDetails && <p className="text-red-700">Problem: {movement.problemDetails}</p>}{movement.returnNotes && <p>Return notes: {movement.returnNotes}</p>}</div>)}</div></details>}
        {roleAllowed([ROLES.ADMIN, ROLES.RECEPTIONIST], user) && <Link className="block font-semibold text-sage hover:underline" to={`/admin/record-room?record=${record.id}&treatment=${record.treatmentStatus}`}>Open Record Room entry</Link>}
      </article>)}</div>
    </details>}
  </div>;
}
