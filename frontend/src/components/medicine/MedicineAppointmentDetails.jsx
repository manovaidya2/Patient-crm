import { Link } from 'react-router-dom';
import { CompactAttachments } from '../ui/Attachments.jsx';

const when = (value) => value ? new Date(value).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
const Stamp = ({ label, at, by, note }) => at ? <div><p className="font-semibold">{label}</p><p className="text-[11px] text-charcoal/60">{when(at)} · {by || 'Name not recorded'}</p>{note && <p className="break-words text-charcoal/65">{note}</p>}</div> : null;

export default function MedicineAppointmentDetails({ value }) {
  if (!value) return null;
  return <div className="mt-2 space-y-2 border-t border-cardline pt-2">
    <p className="font-bold text-sage">{value.current} · {value.progress}%</p>
    {value.readyByDate && <p>Ready by: {when(value.readyByDate)}</p>}
    {value.hold && <p className="font-semibold text-red-700">On hold: {value.hold.reason} · {value.hold.byName} · {when(value.hold.at)}</p>}
    {value.returned && <p className="text-red-700">Returned to In Transit: {value.returned.reason} · {value.returned.byName} · {when(value.returned.at)}</p>}
    <details className="rounded border border-cardline p-2">
      <summary className="cursor-pointer font-bold text-sage">Medicine entries & approvals ({value.stages.filter((stage) => stage.state === 'done').length}/{value.stages.length})</summary>
      <div className="mt-2 max-h-[600px] space-y-3 overflow-y-auto pr-1">
        <Stamp label="Medicine requested" at={value.requestedAt} by={value.requestedByName} note={value.requestNotes} />
        {value.stages.map((stage) => <section key={stage.key} className="space-y-1 border-b border-cardline pb-2">
          <p className={`font-bold ${stage.state === 'done' ? 'text-emerald-800' : stage.state === 'current' ? 'text-amber-800' : 'text-charcoal/55'}`}>{stage.number}. {stage.label} — {stage.state === 'done' ? 'Completed' : stage.state === 'current' ? 'Current' : 'Pending'}</p>
          {stage.at && <p className="text-[11px] text-charcoal/60">{when(stage.at)} · {stage.byName || 'Name not recorded'}{stage.byRole ? ` (${stage.byRole.replace(/_/g, ' ')})` : ''}</p>}
          {stage.oldFlow && <p className="text-charcoal/55">Completed in the old flow; detailed entries were not recorded.</p>}
          {stage.values.map((field) => <p key={field.label} className="break-words">{field.label}: <b>{['date', 'datetime'].includes(field.type) ? when(field.value) : String(field.value)}</b></p>)}
          {stage.notes && <p className="break-words">Notes: {stage.notes}</p>}
          {!!stage.checks.length && <details><summary className="cursor-pointer text-sage">Verified checklist ({stage.checks.length})</summary><ul className="mt-1 space-y-1 text-charcoal/65">{stage.checks.map((check) => <li key={check}>✓ {check}</li>)}</ul></details>}
        </section>)}
        <section className="space-y-2">
          <p className="font-bold">Final approvals & box receipt</p>
          {value.doctorVerification ? <Stamp label={`Doctor verification${value.doctorVerification.doctorName ? ` · Dr ${value.doctorVerification.doctorName}` : ''}`} at={value.doctorVerification.doneAt} by={value.doctorVerification.doneByName} note={value.doctorVerification.notes} /> : <p className="text-charcoal/55">Doctor verification not recorded.</p>}
          <Stamp label="Receive medicine box requested" at={value.boxReceipt?.requestedAt} by={value.boxReceipt?.requestedByName} note={value.boxReceipt?.requestNote} />
          <Stamp label="Medicine box received" at={value.boxReceipt?.receivedAt} by={value.boxReceipt?.receivedByName} note={value.boxReceipt?.receivedNote} />
          {value.boxReceipt?.status === 'pending' && <p className="text-amber-800">Box receipt pending</p>}
          <Stamp label="Payment checked & release request accepted" at={value.release?.acceptedAt} by={value.release?.acceptedByName} />
          <Stamp label="Medicine released" at={value.release?.releasedAt} by={value.release?.releasedByName} note={value.release?.releaseNotes} />
        </section>
        <section className="space-y-2"><p className="font-bold">Medicine photos & treatment papers</p><CompactAttachments files={value.photos.overview} label="Open kit" /><CompactAttachments files={value.photos.papers} label="Treatment papers" />{value.photos.paperSets.map((paper, index) => <CompactAttachments key={index} files={paper.files} label={paper.name || 'Treatment paper'} />)}</section>
        {!!value.consumption.length && <details><summary className="cursor-pointer font-bold text-sage">Stock used ({value.consumption.length})</summary>{value.consumption.map((item, i) => <p key={i}>{item.name || item.code}: planned {item.planned}, actual {item.actual} {item.unit}</p>)}</details>}
        {!!value.chits.length && <details><summary className="cursor-pointer font-bold text-sage">Packing chits ({value.chits.filter((chit) => chit.confirmed).length}/{value.chits.length} confirmed)</summary>{value.chits.map((chit, i) => <p key={i} className="mt-1">{chit.chitNo}. {chit.name} · {chit.dose} · {chit.when} · {chit.confirmed ? `Confirmed by ${chit.confirmedByName || 'Name not recorded'} · ${when(chit.confirmedAt)}` : 'Pending'}</p>)}</details>}
        {!!value.events.length && <details><summary className="cursor-pointer font-bold text-sage">Activity & approval history ({value.events.length})</summary><div className="mt-2 space-y-2">{value.events.map((event, i) => <Stamp key={i} label={event.action} at={event.at} by={event.byName} note={event.details} />)}</div></details>}
      </div>
    </details>
    <Link className="block font-semibold text-sage hover:underline" to={`/admin/medicine-jobs/${value.id}`}>Open fulfilment job</Link>
  </div>;
}
