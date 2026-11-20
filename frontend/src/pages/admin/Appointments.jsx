import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarCheck2, Download, FileSpreadsheet, RefreshCw } from 'lucide-react';
import api from '../../api/axios.js';
import useLiveEvent from '../../api/useLiveEvent.js';
import Button from '../../components/ui/Button.jsx';
import Modal from '../../components/ui/Modal.jsx';
import { PageHeader } from '../../components/ui/Layout.jsx';
import { downloadXlsx } from '../../utils/xlsx.js';
import { CompactAttachments } from '../../components/ui/Attachments.jsx';
import MedicineAppointmentDetails from '../../components/medicine/MedicineAppointmentDetails.jsx';
import AppointmentPaymentDetails from '../../components/medicine/AppointmentPaymentDetails.jsx';
import FollowUpAppointmentDetails from '../../components/FollowUpAppointmentDetails.jsx';
import RecordRoomAppointmentDetails from '../../components/RecordRoomAppointmentDetails.jsx';

// "Appointments": each appointment of the chosen dates and how the visit went - Patient ID (and when it was made),
// arrival, registration sent to the Post Counselor, PCC history, Medicine Department OPD and the package bought.
// Reception's and post counselling's columns fill by themselves; a PCC ticks the history here. Everyone can see it; it
// exports to Excel (.xlsx) with the columns picked.
const istToday = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
const time = (v) => (v ? new Date(v).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '');
const dateTime = (v) => (v ? new Date(v).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' }) : '');
const money = (n) => `Rs ${Number(n || 0).toLocaleString('en-IN')}`;
const dayLabel = (d) => new Date(`${d}T00:00:00`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
const Stamp = ({ at, by }) => (at ? <p className="mt-0.5 text-[11px] leading-4 text-charcoal/55">{time(at)}{by ? ` · ${by}` : ''}</p> : null);
const Empty = () => <span className="text-charcoal/30">—</span>;

// The table: [title, width class]
const HEAD = [['#', 'w-[110px]'], ['Patient', 'w-[220px]'], ['Patient ID', 'w-[150px]'], ['Arrival', 'w-[100px]'], ['Consultation Fee Payment', 'w-[240px]'], ['Record Room Papers', 'w-[260px]'], ['Registration → Post Counselor', 'w-[190px]'], ['History start', 'w-[120px]'], ['History taken', 'w-[120px]'], ['OPD start', 'w-[160px]'], ['OPD complete', 'w-[160px]'], ['Post Counselling start', 'w-[180px]'], ['Post Counselling complete', 'w-[180px]'], ['Package', 'w-[240px]'], ['Purchase order', 'w-[180px]'], ['Medicine', 'w-[190px]'], ['In Transit', 'w-[280px]'], ['Dispatch / Pickup / Handover', 'w-[240px]'], ['Delivery', 'w-[200px]'], ['Treatment', 'w-[150px]'], ['Treatment Status', 'w-[240px]'], ['Follow-up Sessions', 'w-[300px]']];
const cellClass = 'border border-[#E8DFCB] px-3 py-2.5 align-top';

// Export columns (picked in the dialog): key, header, Excel width, value.
const DELIVERY = { not_scheduled: 'Not scheduled', scheduled: 'Scheduled', on_the_way: 'On the way', delivered: 'Delivered' };
const DELIVERY_TONE = { not_scheduled: 'text-charcoal/60', scheduled: 'text-sky-800', on_the_way: 'text-amber-800', delivered: 'text-emerald-800' };
const MED_TONE = { requested: 'text-charcoal/70', in_process: 'text-amber-800', made: 'text-emerald-800', sent_to_courier: 'text-emerald-800', cancelled: 'text-[#9F1D1D]' };
const outcomeText = (r) => (r.outcome === 'converted' ? 'Package bought' : r.outcome === 'not_purchased' ? 'Not purchased' : '');
const dispatchPickupStatus = (row) => {
  const transit = row.inTransit;
  if (!transit) return '';
  if (transit.selfPickup?.selected) return ({ delivered: 'Picked up / handed over', on_the_way: 'Handed over', scheduled: 'Pickup scheduled · handover pending' })[transit.selfPickup.state] || 'Pickup not scheduled';
  if (transit.porterCourier?.selected) return ({ delivered: 'Delivered', on_the_way: 'Dispatched', scheduled: 'Dispatch scheduled · handover pending' })[transit.porterCourier.state] || 'Dispatch not scheduled';
  return 'Not scheduled';
};
// The patient's and parents' details (registration form, else Sales sheet, else the patient record).
const CONTACT_COLUMNS = [
  ['pAge', 'Age', 8, (r) => r.contact?.age],
  ['pGender', 'Gender', 9, (r) => r.contact?.gender],
  ['pDob', 'Date of birth', 13, (r) => r.contact?.dateOfBirth],
  ['pCategory', 'Category', 16, (r) => r.contact?.category],
  ['pPrimaryMobile', 'Primary mobile', 15, (r) => r.contact?.primaryMobile],
  ['pAlternateMobile', 'Alternate mobile', 15, (r) => r.contact?.alternateMobile],
  ['pWhatsapp', 'Mobile / WhatsApp', 15, (r) => r.contact?.whatsappNumber],
  ['pGuardian', 'Guardian / parent name', 22, (r) => r.contact?.guardianName],
  ['pRelationship', 'Relationship', 14, (r) => r.contact?.relationship],
  ['pFatherName', 'Father name', 20, (r) => r.contact?.fatherName],
  ['pFatherNumber', "Father's mobile", 15, (r) => r.contact?.fatherNumber],
  ['pFatherOccupation', 'Father occupation', 20, (r) => r.contact?.fatherOccupation],
  ['pMotherName', 'Mother name', 20, (r) => r.contact?.motherName],
  ['pMotherNumber', "Mother's mobile", 15, (r) => r.contact?.motherNumber],
  ['pMotherOccupation', 'Mother occupation', 20, (r) => r.contact?.motherOccupation],
  ['pCaregiver', 'Primary caregiver / relation', 24, (r) => r.contact?.primaryCaregiver],
  ['pHistoryGivenBy', 'History given by / relation', 24, (r) => r.contact?.historyGivenBy],
  ['pRelative', 'Relative name', 18, (r) => r.contact?.relativeName],
  ['pAddress', 'Address', 40, (r) => r.contact?.address],
  ['pCity', 'City', 14, (r) => r.contact?.city],
  ['pDistrict', 'District', 14, (r) => r.contact?.district],
  ['pState', 'State', 14, (r) => r.contact?.state],
  ['pPin', 'PIN code', 10, (r) => r.contact?.pinCode],
];
const CONTACT_KEYS = CONTACT_COLUMNS.map(([key]) => key);
const EXPORT_COLUMNS = [
  ['date', 'Appointment date', 14, (r) => dayLabel(r.appointmentDate)],
  ['token', 'Token', 8, (r) => r.tokenNumber || ''],
  ['code', 'Appointment ID', 20, (r) => r.appointmentCode],
  ['patient', 'Patient name', 24, (r) => r.patientName],
  ['phone', 'Phone', 14, (r) => r.phone],
  ['patientId', 'Patient ID', 16, (r) => r.patientId],
  ...CONTACT_COLUMNS,
  ['patientApproval', 'Patient approval status', 22, (r) => r.patientApproval?.status || 'unknown'],
  ['patientApprovedAt', 'Patient approved at', 24, (r) => dateTime(r.patientApproval?.at)],
  ['patientApprovedBy', 'Patient approved by', 22, (r) => r.patientApproval?.byName],
  ['idAt', 'Patient ID made at', 20, (r) => dateTime(r.patientIdAt)],
  ['arrival', 'Arrival', 10, (r) => r.arrivalStatus],
  ['arrivalTime', 'Arrival time', 11, (r) => r.arrivalTime],
  ['consultationFee', 'Consultation fee (Rs)', 20, (r) => r.consultationPayment?.fee ?? ''],
  ['consultationReceived', 'Consultation fee received (Rs)', 24, (r) => r.consultationPayment?.received ?? ''],
  ['consultationVerified', 'Consultation fee verified (Rs)', 24, (r) => r.consultationPayment?.verified ?? ''],
  ['consultationPending', 'Consultation fee pending verification (Rs)', 28, (r) => r.consultationPayment?.pending ?? ''],
  ['consultationDue', 'Consultation fee due (Rs)', 20, (r) => r.consultationPayment?.due ?? ''],
  ['consultationCash', 'Consultation cash (Rs)', 20, (r) => r.consultationPayment?.byMode.cash ?? ''],
  ['consultationOnline', 'Consultation online (Rs)', 20, (r) => r.consultationPayment?.byMode.online ?? ''],
  ['consultationDetails', 'Consultation fee payment details', 80, (r) => r.consultationPayment?.payments.map((payment) => `${money(payment.amount)} · ${payment.modeLabel} · ${payment.status} · ${dateTime(payment.date)} · ${payment.recordedByName}${payment.utr ? ` · UTR ${payment.utr}` : ''}${payment.bank ? ` · ${payment.bank}` : ''}${payment.receivedBy ? ` · Cash received by ${payment.receivedBy}` : ''}${payment.approvedAt ? ` · Approved ${dateTime(payment.approvedAt)} by ${payment.approvedByName}` : ''}`).join('\n')],
  ['recordRoomStatus', 'Record Room paper upload status', 28, (r) => r.recordRoom ? ({ not_registered: 'No Record Room entry', uploaded: 'Papers uploaded', partial: 'Some papers pending', pending: 'Not uploaded', overdue: 'Upload overdue' }[r.recordRoom.status]) : ''],
  ['recordRoomUploaded', 'Record Room uploaded / total records', 28, (r) => r.recordRoom ? `${r.recordRoom.uploaded}/${r.recordRoom.total}` : ''],
  ['recordRoomOverdue', 'Record Room overdue records', 24, (r) => r.recordRoom?.overdue ?? ''],
  ['recordRoomDetails', 'Record Room details / uploads', 90, (r) => r.recordRoom?.entries.map((record) => `${record.patientId} · ${record.appointmentId} · ${record.uploadStatus} · Shelf ${record.shelfNumber} / File ${record.fileNumber} / Index ${record.indexNumber} · Received ${dateTime(record.firstReceivedAt)} · ${record.documents.map((file) => `${file.fileName}: ${dateTime(file.uploadedAt)} by ${file.uploadedByName}`).join(' · ')}`).join('\n')],
  ['regAt', 'Registration sent at', 20, (r) => dateTime(r.registration?.at)],
  ['postCounselor', 'Post Counselor', 18, (r) => r.registration?.to],
  ['historyStart', 'History start', 20, (r) => dateTime(r.historyStarted?.at)],
  ['historyStartBy', 'History start by', 16, (r) => r.historyStarted?.byName],
  ['historyTaken', 'History taken', 20, (r) => dateTime(r.historyTaken?.at)],
  ['historyTakenBy', 'History taken by', 16, (r) => r.historyTaken?.byName],
  ['opdStart', 'OPD start', 23, (r) => dateTime(r.opdStarted?.at)],
  ['opdStartBy', 'OPD start by', 18, (r) => r.opdStarted?.byName],
  ['opdComplete', 'OPD complete', 23, (r) => dateTime(r.opdCompleted?.at)],
  ['opdCompleteBy', 'OPD complete by', 18, (r) => r.opdCompleted?.byName],
  ['postCounsellingStart', 'Post Counselling start', 23, (r) => dateTime(r.postCounsellingStarted?.at)],
  ['postCounsellingStartBy', 'Post Counselling start by', 23, (r) => r.postCounsellingStarted?.byName],
  ['postCounsellingComplete', 'Post Counselling complete', 23, (r) => dateTime(r.postCounsellingCompleted?.at)],
  ['postCounsellingCompleteBy', 'Post Counselling complete by', 23, (r) => r.postCounsellingCompleted?.byName],
  ['outcome', 'Outcome', 16, outcomeText],
  ['treatment', 'Treatment', 26, (r) => r.package?.treatment],
  ['supply', 'Supply', 16, (r) => r.package?.supply],
  ['plan', 'Payment plan', 14, (r) => r.package?.plan],
  ['fee', 'Package fee (Rs)', 14, (r) => (r.package ? r.package.fee : '')],
  ['paid', 'Paid (Rs)', 12, (r) => (r.package ? r.package.paid : '')],
  ['due', 'Due (Rs)', 12, (r) => (r.package ? r.package.due : '')],
  ['poNumber', 'PO number', 12, (r) => r.po?.number || r.poNumber],
  ['poStatus', 'PO status', 20, (r) => r.po?.statusLabel],
  ['poTotal', 'PO amount (Rs)', 14, (r) => (r.po ? r.po.total : '')],
  ['poPaid', 'PO paid (Rs)', 13, (r) => (r.po ? r.po.paid : '')],
  ['poBalance', 'PO balance (Rs)', 14, (r) => (r.po ? r.po.balance : '')],
  ['medicine', 'Medicine status', 20, (r) => r.medicine?.label],
  ['medicineStep', 'Medicine step', 30, (r) => r.medicine?.detail],
  ['medicineMade', 'Medicine ready on', 20, (r) => dateTime(r.medicine?.madeAt)],
  ['medicineDepartment', 'Medicine Department current stage', 36, (r) => r.medicineDepartment?.current],
  ['medicineEntries', 'Medicine entries / approvals (operator / time)', 75, (r) => r.medicineDepartment?.stages.map((stage) => `${stage.label}: ${stage.state}${stage.at ? ` · ${dateTime(stage.at)} · ${stage.byName || 'Name not recorded'}` : ''}${stage.values.length ? ` · ${stage.values.map((field) => `${field.label}: ${field.value}`).join(' · ')}` : ''}${stage.notes ? ` · ${stage.notes}` : ''}`).join('\n')],
  ['medicineDoctor', 'Doctor verification confirmed', 36, (r) => r.medicineDepartment?.doctorVerification ? `${dateTime(r.medicineDepartment.doctorVerification.doneAt)} · ${r.medicineDepartment.doctorVerification.doneByName} · ${r.medicineDepartment.doctorVerification.doctorName}` : ''],
  ['medicineBoxRequested', 'Box receipt request', 35, (r) => r.medicineDepartment?.boxReceipt?.requestedAt ? `${dateTime(r.medicineDepartment.boxReceipt.requestedAt)} · ${r.medicineDepartment.boxReceipt.requestedByName}` : ''],
  ['medicineBoxReceived', 'Medicine box received', 35, (r) => r.medicineDepartment?.boxReceipt?.receivedAt ? `${dateTime(r.medicineDepartment.boxReceipt.receivedAt)} · ${r.medicineDepartment.boxReceipt.receivedByName}` : ''],
  ['medicineActivity', 'Medicine Department activity history', 75, (r) => r.medicineDepartment?.events.map((event) => `${event.action} · ${dateTime(event.at)} · ${event.byName}${event.details ? ` · ${event.details}` : ''}`).join('\n')],
  ['transitPayment', 'In Transit payment verification', 26, (r) => r.inTransit ? ({ pending: 'Payment pending verification', verified: 'Payment verified', not_verified: 'Payment not verified' }[r.inTransit.payment.state]) : ''],
  ['transitRelease', 'Medicine release request status', 38, (r) => r.inTransit?.release?.label],
  ['transitNow', 'In Transit current step', 30, (r) => r.inTransit?.current],
  ['transitCalls', 'Delivery call follow-ups', 45, (r) => r.inTransit?.callFollowUps.map((call) => `${call.label}: ${dateTime(call.dueAt)}${call.overdue ? ` · overdue ${call.lateDays} day(s)` : ''}`).join('\n')],
  ['transitPaper', 'PO paper signed', 18, (r) => r.inTransit ? (r.inTransit.paperSigned ? 'Signed' : 'Not signed') : ''],
  ['transitDeadline', 'Medicine release deadline', 24, (r) => dateTime(r.inTransit?.release?.deadlineAt)],
  ['transitPickup', 'Planned pickup', 24, (r) => dateTime(r.inTransit?.plan?.pickupAt)],
  ['transitDispatch', 'Planned dispatch', 24, (r) => dateTime(r.inTransit?.plan?.dispatchAt)],
  ['transitPlan', 'In Transit delivery notes', 40, (r) => [r.inTransit?.plan?.courier, r.inTransit?.plan?.address, r.inTransit?.plan?.note].filter(Boolean).join(' · ')],
  ['transitPcc', 'Explanation PCC', 22, (r) => r.inTransit?.plan?.pcc],
  ['transitExplanation', 'Medicine explanation appointment', 28, (r) => [dateTime(r.inTransit?.plan?.explanationAt), r.inTransit?.plan?.explanationMode].filter(Boolean).join(' · ')],
  ['transitReceiver', 'Medicine received by', 22, (r) => r.inTransit?.plan?.receiver],
  ['selfPickup', 'Self pickup status', 24, (r) => r.inTransit ? scheduleLabel(r.inTransit.selfPickup?.state, true) : ''],
  ['porterCourier', 'Porter / courier schedule status', 28, (r) => r.inTransit ? scheduleLabel(r.inTransit.porterCourier?.state) : ''],
  ['readyNotDelivered', 'Ready, Not Delivered', 24, (r) => r.inTransit?.readyNotDelivered ? 'Ready, not delivered' : ''],
  ['readyWaiting', 'Days since medicine ready', 18, (r) => r.inTransit?.readyNotDelivered?.waitingDays ?? ''],
  ['readyReasons', 'Delivery pending reasons', 60, (r) => r.inTransit?.readyNotDelivered?.reasons.map((reason) => reason.text).join(' · ')],
  ['transitTimeline', 'In Transit timeline (date / time / operator)', 65, (r) => r.inTransit?.timeline.map((event) => `${event.label}: ${dateTime(event.at)} · ${event.byName || 'Name not recorded'}${event.note ? ` · ${event.note}` : ''}`).join('\n')],
  ['delivery', 'Delivery status', 18, (r) => DELIVERY[r.delivery?.state] || ''],
  ['dispatchPickupHandover', 'Dispatch / Pickup / Handover', 38, dispatchPickupStatus],
  ['deliveryPlan', 'Delivery plan', 26, (r) => r.delivery?.text],
  ['deliverySent', 'Dispatched / handed over', 20, (r) => dateTime(r.delivery?.sentAt)],
  ['deliveryVia', 'Courier / tracking', 22, (r) => r.delivery?.via],
  ['delivered', 'Delivered on', 20, (r) => dateTime(r.delivery?.deliveredAt)],
  ['deliveryScheduledBy', 'Delivery scheduled by', 22, (r) => r.delivery?.scheduledByName],
  ['deliverySentBy', 'Dispatched / handed over by', 22, (r) => r.delivery?.sentByName],
  ['deliveryReceivedBy', 'Delivery confirmed by', 22, (r) => r.delivery?.deliveredByName],
  ['explained', 'Medicine explained', 20, (r) => dateTime(r.explainedAt)],
  ['started', 'Treatment started', 20, (r) => dateTime(r.startedAt)],
  ['treatmentActivatedAt', 'Treatment activated at', 24, (r) => dateTime(r.treatment?.activatedAt)],
  ['treatmentActivatedBy', 'Treatment activated by', 24, (r) => r.treatment?.activatedByName],
  ['treatmentActualStatus', 'Treatment status', 24, (r) => r.treatment?.label],
  ['treatmentPhase', 'Treatment phase', 14, (r) => r.treatment?.phase],
  ['medicineStartDate', 'Actual medicine start date', 24, (r) => dateTime(r.treatment?.medicineStartDate)],
  ['treatmentStatusNote', 'Treatment status notes', 42, (r) => r.treatment?.note],
  ['treatmentStartNote', 'Treatment activation / medicine start note', 45, (r) => r.treatment?.startNote],
  ['activationExplanation', 'Activation explanation completed', 40, (r) => r.treatment?.explanation?.completedAt ? `${dateTime(r.treatment.explanation.completedAt)} · ${r.treatment.explanation.completedByName}` : ''],
  ['followUpCount', 'Follow-up / session count', 20, (r) => r.followUpSessions?.total ?? ''],
  ['followUpCompleted', 'Sessions completed', 18, (r) => r.followUpSessions?.completed ?? ''],
  ['followUpPending', 'Sessions pending', 18, (r) => r.followUpSessions?.pending ?? ''],
  ['followUpNext', 'Next pending session', 24, (r) => dateTime(r.followUpSessions?.nextPendingAt)],
  ['followUpDetails', 'Follow-up / session details', 80, (r) => r.followUpSessions?.sessions.map((session) => `${session.title} · ${dateTime(session.dateTime)} · ${session.stateLabel}${session.completedAt ? ` · Completed ${dateTime(session.completedAt)} by ${session.completedByName}` : ''}${session.notes ? ` · ${session.notes}` : ''}${session.completionDetails ? ` · ${session.completionDetails}` : ''}${session.cancelReason ? ` · Cancelled: ${session.cancelReason}` : ''}${session.rescheduleReason ? ` · Rescheduled: ${session.rescheduleReason}` : ''}`).join('\n')],
];
const PICK_KEY = 'appointments:export-columns';
// Every column there was when the choice was saved: a column added later starts ticked. A choice saved before this
// list existed knew every column except the patient / parent details.
const KNOWN_KEY = 'appointments:export-columns-known';
const savedPick = () => {
  try {
    const v = JSON.parse(localStorage.getItem(PICK_KEY) || 'null');
    if (!Array.isArray(v) || !v.length) return null;
    const stored = JSON.parse(localStorage.getItem(KNOWN_KEY) || 'null');
    const known = Array.isArray(stored) ? stored : EXPORT_COLUMNS.map(([key]) => key).filter((key) => !CONTACT_KEYS.includes(key));
    const fresh = EXPORT_COLUMNS.map(([key]) => key).filter((key) => !known.includes(key) && !v.includes(key));
    return [...v, ...fresh];
  } catch { return null; }
};

function ExportDialog({ rows, from, to, onClose }) {
  const [picked, setPicked] = useState(() => savedPick() || EXPORT_COLUMNS.map(([key]) => key));
  const toggle = (key) => setPicked((old) => (old.includes(key) ? old.filter((k) => k !== key) : [...old, key]));
  const run = () => {
    const cols = EXPORT_COLUMNS.filter(([key]) => picked.includes(key));
    if (!cols.length) return;
    try { localStorage.setItem(PICK_KEY, JSON.stringify(picked)); localStorage.setItem(KNOWN_KEY, JSON.stringify(EXPORT_COLUMNS.map(([key]) => key))); } catch { /* the choice is just not remembered */ }
    const fileName = `opd-sheets-${from}${to !== from ? `-to-${to}` : ''}`;
    const columns = cols.map(([, header, width]) => ({ header, width }));
    const data = rows.map((r) => cols.map(([, , , value]) => { const v = value(r); return v === undefined || v === null ? '' : v; }));
    downloadXlsx({ fileName, sheetName: 'OPD Sheets', columns, rows: data });
    onClose();
  };
  return (
    <div className="space-y-3">
      <p className="text-sm text-charcoal/70">{rows.length} appointment{rows.length === 1 ? '' : 's'} · {from === to ? dayLabel(from) : `${dayLabel(from)} to ${dayLabel(to)}`}. Tick the columns to export.</p>
      <div className="flex gap-3 text-xs font-semibold text-sage"><button type="button" onClick={() => setPicked(EXPORT_COLUMNS.map(([key]) => key))}>Select all</button><button type="button" onClick={() => setPicked([])}>Clear</button></div>
      <div className="grid max-h-[50vh] grid-cols-1 gap-x-4 gap-y-1 overflow-y-auto rounded-lg border border-cardline bg-white p-3 sm:grid-cols-2">
        {EXPORT_COLUMNS.map(([key, header]) => <label key={key} className="flex items-center gap-2 text-sm"><input type="checkbox" className="accent-[#5B7B65]" checked={picked.includes(key)} onChange={() => toggle(key)} />{header}</label>)}
      </div>
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button disabled={!picked.length} onClick={run}><FileSpreadsheet size={15} />Download Excel (.xlsx)</Button>
      </div>
    </div>
  );
}

const scheduleLabel = (state, pickup = false) => ({ not_selected: 'Not selected', not_scheduled: 'Not scheduled', scheduled: 'Scheduled', on_the_way: 'On the way', delivered: pickup ? 'Collected' : 'Delivered' }[state] || 'Not scheduled');

function PatientApproval({ value }) {
  if (!value || value.status === 'unknown') return <p className="mt-1 text-[11px] text-charcoal/50">Approval not available</p>;
  return <div className="mt-1 text-[11px]"><p className={`font-bold ${value.status === 'approved' ? 'text-emerald-800' : 'text-amber-800'}`}>{value.status === 'approved' ? 'Patient approved' : value.status === 'pending' ? 'Patient approval pending' : `Patient ${value.status}`}</p>{(value.at || value.byName) && <p className="text-charcoal/55">{dateTime(value.at)}{value.byName ? ` · ${value.byName}` : ''}</p>}</div>;
}

function ConsultationPayment({ value }) {
  if (!value) return <Empty />;
  return <div className="space-y-2">
    <p className="font-bold">Consultation fee: {value.fee === null ? 'Not set' : money(value.fee)}</p>
    <p>Received {money(value.received)}{value.due !== null ? ` · Due ${money(value.due)}` : ''}</p>
    <p className="text-emerald-800">Verified: {money(value.verified)}</p>
    {value.pending > 0 && <p className="font-semibold text-amber-800">Pending verification: {money(value.pending)}</p>}
    <p className="text-charcoal/65">Cash {money(value.byMode.cash)} · Online {money(value.byMode.online)}{value.byMode.card > 0 ? ` · Card ${money(value.byMode.card)}` : ''}</p>
    <AppointmentPaymentDetails payments={value.payments} title="Consultation payment details & screenshots" emptyMessage="No consultation fee payment recorded for this appointment." />
  </div>;
}

function TreatmentStatus({ value }) {
  if (!value) return <Empty />;
  return <div className="space-y-2">
    <p className={`font-bold ${['completed', 'in_progress'].includes(value.status) ? 'text-emerald-800' : ['inactive', 'removed', 'on_hold'].includes(value.status) ? 'text-red-700' : 'text-amber-800'}`}>{value.label}</p>
    <p className="text-charcoal/60">Phase {value.phase}</p>
    {value.status !== value.stageStatus && <p>Saved phase status: {value.stageStatus.replace(/_/g, ' ')}</p>}
    {value.at && <p className="text-[11px] text-charcoal/55">Status recorded: {dateTime(value.at)} · {value.byName || 'Name not recorded'}</p>}
    {value.note && <p className="break-words text-charcoal/65">Notes: {value.note}</p>}
    <div className="space-y-1 rounded border border-cardline p-2">
      <p className={`font-bold ${value.activated ? 'text-emerald-800' : 'text-amber-800'}`}>Treatment activation: {value.activated ? 'Activated' : 'Not activated'}</p>
      {value.activatedAt && <p className="text-[11px] text-charcoal/65">Activated: {dateTime(value.activatedAt)} · {value.activatedByName || 'Name not recorded'}</p>}
      {value.medicineStartDate && <p>Medicine starts: {dateTime(value.medicineStartDate)}</p>}
      {value.startSetAt && <p className="text-[11px] text-charcoal/55">Start date recorded: {dateTime(value.startSetAt)} · {value.startSetByName || 'Name not recorded'}</p>}
      {value.startNote && <p className="break-words text-charcoal/65">Activation / start note: {value.startNote}</p>}
      {value.explanation?.completedAt ? <p className="text-[11px] text-charcoal/65">Medicine explanation completed: {dateTime(value.explanation.completedAt)} · {value.explanation.completedByName || 'Name not recorded'}</p> : <p className="text-charcoal/55">Medicine explanation completion not recorded</p>}
      {value.explanation?.scheduledFor && <p className="text-[11px] text-charcoal/55">Explanation appointment: {dateTime(value.explanation.scheduledFor)}{value.explanation.mode ? ` · ${value.explanation.mode}` : ''}</p>}
      {value.explanation?.note && <p className="break-words text-charcoal/65">Explanation note: {value.explanation.note}</p>}
    </div>
    {value.stageDate && <p className="text-[11px] text-charcoal/55">Phase date: {dateTime(value.stageDate)}</p>}
  </div>;
}

function DispatchPickupHandover({ row }) {
  if (!row.inTransit) return <Empty />;
  const pickup = row.inTransit.selfPickup?.selected;
  const schedule = pickup ? row.inTransit.selfPickup : row.inTransit.porterCourier;
  const completed = ['delivered', 'on_the_way'].includes(schedule?.state);
  return <div className="space-y-1">
    <p className={`font-bold ${completed ? 'text-emerald-800' : 'text-amber-800'}`}>{dispatchPickupStatus(row)}</p>
    <p className="text-charcoal/65"><b>Self pickup:</b> {row.inTransit.selfPickup?.selected ? scheduleLabel(row.inTransit.selfPickup.state, true) : 'Not selected'}</p>
    <p className="text-charcoal/65"><b>Porter / courier:</b> {row.inTransit.porterCourier?.selected ? scheduleLabel(row.inTransit.porterCourier.state) : 'Not selected'}</p>
    {schedule?.at && <p>Planned: {dateTime(schedule.at)}</p>}
    {row.delivery?.scheduledAt && <p className="text-[11px] text-charcoal/55">Scheduled by {row.delivery.scheduledByName || 'Name not recorded'} · {dateTime(row.delivery.scheduledAt)}</p>}
    {row.delivery?.sentAt && <p className="text-[11px] text-charcoal/55">{pickup ? 'Handed over' : 'Dispatched'}: {dateTime(row.delivery.sentAt)} · {row.delivery.sentByName || 'Name not recorded'}</p>}
    {row.delivery?.deliveredAt && !pickup && <p className="text-[11px] text-charcoal/55">Delivered: {dateTime(row.delivery.deliveredAt)} · {row.delivery.deliveredByName || 'Name not recorded'}</p>}
    {row.inTransit.plan?.receiver && <p>Received by: {row.inTransit.plan.receiver}</p>}
    {!pickup && row.delivery?.via && <p className="break-words text-charcoal/65">{row.delivery.via}</p>}
  </div>;
}

function PoPaymentStatus({ value }) {
  if (!value) return <Empty />;
  const payment = value.payment;
  return <div className="space-y-2">
    <p className={`font-bold ${payment.state === 'verified' ? 'text-emerald-800' : 'text-amber-800'}`}>{payment.state === 'verified' ? 'Payment verified' : payment.state === 'pending' ? 'Payment pending verification' : 'Payment not verified'}</p>
    <p className="text-charcoal/65">Paid {money(payment.paid)} · Balance {money(payment.balance)}{payment.pendingCount ? ` · ${payment.pendingCount} pending verification` : ''}</p>
    <AppointmentPaymentDetails payments={value.payments} />
  </div>;
}

function InTransitStatus({ value }) {
  if (!value) return <Empty />;
  const payment = value.payment;
  return <div className="space-y-2">
    <p className={`font-bold ${payment.state === 'verified' ? 'text-emerald-800' : 'text-amber-800'}`}>{payment.state === 'verified' ? 'Payment verified' : payment.state === 'pending' ? 'Payment pending verification' : 'Payment not verified'}</p>
    <p className="text-charcoal/65">Paid {money(payment.paid)} · Balance {money(payment.balance)}</p>
    {value.release ? <p className={`font-bold ${value.release.state === 'cancelled' ? 'text-red-700' : ['released', 'accepted'].includes(value.release.state) ? 'text-emerald-800' : 'text-amber-800'}`}>{value.release.label}</p> : <p className="text-charcoal/55">Release awaits final verification</p>}
    {value.release?.followup && <p className="text-charcoal/65">Follow-up: {value.release.followup}</p>}
    <div className="space-y-1 rounded border border-cardline p-2 text-charcoal/70">
      <p><b>Self pickup:</b> {scheduleLabel(value.selfPickup?.state, true)}{value.selfPickup?.selected && value.selfPickup.at ? ` · ${dateTime(value.selfPickup.at)}` : ''}</p>
      <p><b>Porter / courier:</b> {scheduleLabel(value.porterCourier?.state)}{value.porterCourier?.selected && value.porterCourier.at ? ` · ${dateTime(value.porterCourier.at)}` : ''}</p>
      {value.porterCourier?.selected && (value.porterCourier.partner || value.porterCourier.tracking) && <p>{[value.porterCourier.partner, value.porterCourier.tracking].filter(Boolean).join(' · ')}</p>}
      {value.readyNotDelivered && <details className="border-t border-cardline pt-1">
        <summary className="cursor-pointer font-bold text-amber-800">Ready, Not Delivered{value.readyNotDelivered.waitingDays !== null ? ` · ${value.readyNotDelivered.waitingDays} day(s)` : ''}</summary>
        <div className="mt-2 space-y-1">
          {value.readyNotDelivered.madeAt && <p>Ready since: {dateTime(value.readyNotDelivered.madeAt)}</p>}
          <ul className="list-inside list-disc">{value.readyNotDelivered.reasons.filter((reason) => !/PO paper/i.test(reason.text)).map((reason, i) => <li key={i}>{reason.text}</li>)}</ul>
          {value.readyNotDelivered.note?.text && <p>Delay note: {value.readyNotDelivered.note.text}</p>}
        </div>
      </details>}
    </div>
    {(value.phaseOnHold || value.phaseRemoved) && <p className="font-bold text-red-700">{value.phaseRemoved ? 'Phase removed from In Transit' : 'Phase on hold'}</p>}
    {value.paperSigned && <p className="text-emerald-800">PO paper: Signed by patient</p>}
    {value.release?.deadlineAt && ['awaiting_request', 'cancelled'].includes(value.release.state) && <p className={value.release.overdue ? 'text-red-700' : 'text-charcoal/65'}>Release action due: {dateTime(value.release.deadlineAt)}{value.release.overdue ? ' · Overdue' : ` · ${value.release.daysLeft} day(s) left`}</p>}
    {value.callFollowUps?.map((call) => <p key={call.step} className={call.overdue ? 'font-semibold text-red-700' : 'text-charcoal/65'}>Call follow-up: {call.label} · {dateTime(call.dueAt)}{call.overdue ? ` · ${call.lateDays} day(s) late` : ''}</p>)}
    {Boolean(value.plan?.mode || value.plan?.pcc || value.plan?.explanationAt || value.plan?.receiver || value.plan?.courierNote || value.plan?.packageImages?.length || value.plan?.deliveryProofImages?.length) && <details className="rounded border border-cardline p-2">
      <summary className="cursor-pointer font-bold text-sage">Delivery plan, PCC & proof</summary>
      <div className="mt-2 space-y-1 text-charcoal/70">
      {value.plan.mode && <p>Mode: {value.plan.mode === 'pickup' ? 'Self pickup' : value.plan.mode === 'shipped' ? 'Porter / courier' : value.plan.mode}</p>}
      {value.plan.pickupAt && <p>Pickup: {dateTime(value.plan.pickupAt)}</p>}
      {value.plan.dispatchAt && <p>Dispatch: {dateTime(value.plan.dispatchAt)}</p>}
      {value.plan.courier && <p>Planned courier: {value.plan.courier}</p>}
      {value.plan.address && <p className="break-words">Delivery address: {value.plan.address}</p>}
      {value.plan.note && <p className="break-words">Plan note: {value.plan.note}</p>}
      {value.plan.pcc && <p>PCC: {value.plan.pcc}</p>}
      {value.plan.explanationAt && <p>Explanation: {dateTime(value.plan.explanationAt)}{value.plan.explanationMode ? ` · ${value.plan.explanationMode}` : ''}</p>}
      </div>
    {value.plan?.receiver && <p>Received by: {value.plan.receiver}</p>}
    {value.plan?.courierNote && <p className="break-words">Courier note: {value.plan.courierNote}</p>}
    <CompactAttachments files={value.plan?.packageImages || []} label="Parcel photos" />
    <CompactAttachments files={value.plan?.deliveryProofImages || []} label="Delivery proof" />
    </details>}
    {value.timeline.length > 0 && <details className="rounded border border-cardline p-2"><summary className="cursor-pointer font-bold text-sage">In Transit timeline ({value.timeline.length})</summary><ul className="mt-2 max-h-72 space-y-2 overflow-y-auto border-l border-cardline pl-2">{value.timeline.map((event, i) => <li key={`${event.label}-${event.at}-${i}`}><p className="font-semibold">{event.label}</p><p className="text-[11px] text-charcoal/60">{dateTime(event.at)} · {event.byName || 'Name not recorded'}</p>{event.note && <p className="break-words text-charcoal/60">{event.note}</p>}</li>)}</ul></details>}
    {value.current && <p className="text-charcoal/65">Now: {value.current}</p>}
    {value.release?.jobId && <Link className="font-semibold text-sage hover:underline" to={`/admin/medicine-jobs/${value.release.jobId}`}>Open fulfilment job</Link>}
  </div>;
}

// Saved ticks stay locked until the operator explicitly opens Edit.
function VisitTick({ row, step, endpoint, label, value, canMark, blocked, blockedReason, history = false, onSaved, onError }) {
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(false);
  const [draftChanged, setDraftChanged] = useState(false);
  const checked = editing ? draft : Boolean(value);
  const save = async (done, edit = false) => {
    if (busy || blocked) return;
    const refreshTimestamp = edit && done && draftChanged;
    if (done === Boolean(value) && !refreshTimestamp) { setEditing(false); return; }
    setBusy(true); onError('');
    try {
      const { data } = await api.post('/appointments-board/' + row.id + '/' + endpoint, { step, done, edit, refreshTimestamp });
      onSaved(data.row);
      setEditing(false);
    } catch (err) { onError(err.response?.data?.message || 'Could not save ' + label); }
    finally { setBusy(false); }
  };
  const stamp = history ? <Stamp at={value?.at} by={value?.byName} /> : value ? <p className="mt-0.5 text-[11px] leading-4 text-charcoal/55">{dateTime(value.at)} · {value.byName}</p> : null;
  if (!canMark) return value ? <><span className="font-bold text-emerald-700">✓ Done</span>{stamp}</> : <Empty />;
  return <div className="inline-flex flex-col items-start gap-1">
    <label title={blocked ? blockedReason : value && !editing ? 'Use Edit to change this saved status' : label}>
      <input type="checkbox" aria-label={label + ' for ' + row.patientName} className="h-4 w-4 accent-[#5B7B65]" checked={checked} disabled={busy || blocked || (Boolean(value) && !editing)} onChange={(e) => { if (editing) { setDraft(e.target.checked); setDraftChanged(true); } else { save(e.target.checked); } }} />
    </label>
    {stamp}
    {editing ? <div className="flex gap-2 text-xs font-semibold">
      <button type="button" className="text-sage hover:underline disabled:opacity-40" disabled={busy || blocked} onClick={() => save(draft, true)}>{busy ? 'Saving...' : 'Save'}</button>
      <button type="button" className="text-charcoal/60 hover:underline disabled:opacity-40" disabled={busy} onClick={() => { setEditing(false); onError(''); }}>Cancel</button>
    </div> : value && <button type="button" aria-label={'Edit ' + label + ' for ' + row.patientName} title={blocked ? blockedReason : 'Edit ' + label} className="text-xs font-semibold text-sage hover:underline disabled:opacity-40" disabled={busy || blocked} onClick={() => { setDraft(Boolean(value)); setDraftChanged(false); setEditing(true); onError(''); }}>Edit</button>}
  </div>;
}

function HistoryTick({ row, step, ...props }) {
  const value = step === 'taken' ? row.historyTaken : row.historyStarted;
  const blocked = !row.patientId || (step === 'taken' && !row.historyStarted) || (step === 'started' && Boolean(row.historyTaken));
  const blockedReason = !row.patientId ? 'Reception marks the arrival first' : step === 'taken' ? 'Tick History start first' : 'Edit and untick History taken first';
  return <VisitTick row={row} step={step} endpoint="history" label={step === 'taken' ? 'History taken' : 'History start'} value={value} canMark={row.canMarkHistory} blocked={blocked} blockedReason={blockedReason} history {...props} />;
}

function OpdTick({ row, step, ...props }) {
  const value = step === 'completed' ? row.opdCompleted : row.opdStarted;
  const blocked = !row.patientId || (step === 'completed' && !row.opdStarted) || (step === 'started' && Boolean(row.opdCompleted));
  const blockedReason = !row.patientId ? 'Reception marks the arrival first' : step === 'completed' ? 'Tick OPD start first' : 'Edit and untick OPD complete first';
  return <VisitTick row={row} step={step} endpoint="opd" label={step === 'completed' ? 'OPD complete' : 'OPD start'} value={value} canMark={row.canMarkOpd} blocked={blocked} blockedReason={blockedReason} {...props} />;
}

function PostCounsellingTick({ row, step, ...props }) {
  const value = step === 'completed' ? row.postCounsellingCompleted : row.postCounsellingStarted;
  const blocked = !row.patientId || (step === 'completed' && !row.postCounsellingStarted) || (step === 'started' && Boolean(row.postCounsellingCompleted));
  const blockedReason = !row.patientId ? 'Reception marks the arrival first' : step === 'completed' ? 'Tick Post Counselling start first' : 'Edit and untick Post Counselling complete first';
  return <VisitTick row={row} step={step} endpoint="post-counselling" label={step === 'completed' ? 'Post Counselling complete' : 'Post Counselling start'} value={value} canMark={row.canMarkPostCounselling} blocked={blocked} blockedReason={blockedReason} {...props} />;
}

export default function Appointments() {
  const [from, setFrom] = useState(istToday);
  const [to, setTo] = useState(istToday);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [exporting, setExporting] = useState(false);
  const load = useCallback(async () => {
    setLoading(true);
    try { const { data: res } = await api.get('/appointments-board', { params: { from, to }, skipCache: true }); setData(res); setError(''); }
    catch (err) { setError(err.response?.data?.message || 'OPD Sheets could not be loaded'); }
    finally { setLoading(false); }
  }, [from, to]);
  useEffect(() => { load(); const t = setInterval(load, 60000); return () => clearInterval(t); }, [load]);
  useLiveEvent('appointments-board:changed', load);
  useLiveEvent('sales-sheet:date-changed', load);
  useLiveEvent('post-counseling:changed', load);
  useLiveEvent('medicine-job:changed', load);
  useLiveEvent('tasks:changed', load);
  const replace = (row) => setData((old) => ({ ...old, rows: old.rows.map((r) => (r.id === row.id ? { ...r, ...row, patientIdAt: r.patientIdAt } : r)) }));
  const rows = data?.rows || [];

  return (
    <div className="space-y-4">
      <PageHeader title="OPD Sheets" icon={CalendarCheck2} subtitle="Each appointment and how the visit went: Patient ID, arrival, registration, history, the package, and after it the PO, medicine, delivery and treatment start."
        actions={<Button variant="outline" disabled={!rows.length} onClick={() => setExporting(true)}><Download size={15} />Export to Excel</Button>} />
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-xs font-semibold text-charcoal">From<input type="date" className="mt-1 block rounded-lg border border-cardline bg-white px-3 py-2 text-sm" value={from} onChange={(e) => { setFrom(e.target.value); if (e.target.value > to) setTo(e.target.value); }} /></label>
        <label className="text-xs font-semibold text-charcoal">To<input type="date" className="mt-1 block rounded-lg border border-cardline bg-white px-3 py-2 text-sm" value={to} min={from} onChange={(e) => setTo(e.target.value)} /></label>
        <Button variant="outline" size="sm" onClick={() => { setFrom(istToday()); setTo(istToday()); }}>Today</Button>
        <span className="mb-2 ml-1 text-sm text-charcoal/60">{rows.length} appointment{rows.length === 1 ? '' : 's'}</span>
        <button type="button" aria-label="Refresh" onClick={load} className="mb-0.5 ml-auto rounded-lg p-2 text-sage hover:bg-[#F3F6F2]"><RefreshCw size={15} className={loading ? 'animate-spin' : ''} /></button>
      </div>
      {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      <div className="overflow-x-auto rounded-[12px] border border-[#E8DFCB] bg-white">
        <table className="w-full min-w-[4220px] table-fixed border-collapse text-left text-[13px]">
          <colgroup>{HEAD.map(([h, w]) => <col key={h} className={w} />)}</colgroup>
          <thead className="bg-[#F6F0E3] text-[11px] font-bold uppercase tracking-wide text-charcoal/70">
            <tr>{HEAD.map(([h]) => <th key={h} className="border border-[#E8DFCB] px-3 py-2.5 align-middle">{h}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.id} className={i % 2 ? 'bg-[#FFFCF7]' : 'bg-white'}>
                <td className={cellClass}>
                  <p className="font-semibold text-charcoal">{i + 1}{r.tokenNumber ? <span className="ml-1.5 rounded bg-[#FFF1E6] px-1.5 py-0.5 text-[11px] font-bold text-[#C2410C]">T{r.tokenNumber}</span> : null}</p>
                  <p className="mt-0.5 whitespace-nowrap text-[11px] text-charcoal/55">{dayLabel(r.appointmentDate)}</p>
                </td>
                <td className={cellClass}>
                  <p className="truncate font-bold text-charcoal" title={r.patientName}>{r.patientName || '-'}</p>
                  <p className="truncate text-[11px] text-charcoal/55" title={r.appointmentCode}>{r.appointmentCode}</p>
                  {r.phone && <a href={`tel:${r.phone}`} className="text-[11px] font-semibold text-sage">{r.phone}</a>}
                </td>
                <td className={cellClass}>{r.patientId ? <><p className="whitespace-nowrap font-bold text-sage">{r.patientId}</p><Stamp at={r.patientIdAt} /><PatientApproval value={r.patientApproval} /></> : <Empty />}</td>
                <td className={cellClass}>{r.arrivalStatus ? <><p className="font-semibold">{r.arrivalStatus}</p><p className="text-[11px] text-charcoal/55">{r.arrivalTime}</p></> : <Empty />}</td>
                <td className={`${cellClass} text-xs`}><ConsultationPayment value={r.consultationPayment} /></td>
                <td className={`${cellClass} text-xs`}><RecordRoomAppointmentDetails value={r.recordRoom} /></td>
                <td className={cellClass}>{r.registration?.at ? <><p className="font-semibold text-emerald-800">✓ {r.registration.to}</p><Stamp at={r.registration.at} by={r.registration.byName} /></> : r.registration?.draft ? <span className="text-xs text-amber-800">Saved, not sent</span> : <Empty />}</td>
                <td className={cellClass}><HistoryTick row={r} step="started" onSaved={replace} onError={setError} /></td>
                <td className={cellClass}><HistoryTick row={r} step="taken" onSaved={replace} onError={setError} /></td>
                <td className={cellClass}><OpdTick row={r} step="started" onSaved={replace} onError={setError} /></td>
                <td className={cellClass}><OpdTick row={r} step="completed" onSaved={replace} onError={setError} /></td>
                <td className={cellClass}><PostCounsellingTick row={r} step="started" onSaved={replace} onError={setError} /></td>
                <td className={cellClass}><PostCounsellingTick row={r} step="completed" onSaved={replace} onError={setError} /></td>
                <td className={`${cellClass} text-xs`}>
                  {r.package ? <div className="space-y-0.5"><p className="font-bold text-emerald-800">Package bought</p><p className="text-charcoal/80">{r.package.treatment}{r.package.supply ? ` · ${r.package.supply}` : ''}</p><p>{money(r.package.fee)}{r.package.plan ? ` · ${r.package.plan}` : ''}</p><p>Paid {money(r.package.paid)} · Due <b className={r.package.due ? 'text-[#C2410C]' : ''}>{money(r.package.due)}</b></p></div>
                    : r.outcome === 'not_purchased' ? <span className="font-semibold text-[#9F1D1D]">Not purchased</span> : <Empty />}
                </td>
                <td className={`${cellClass} text-xs`}>
                  {r.po ? <><Link to={`/admin/purchase-orders/${r.po.id}`} className="font-bold text-sage hover:underline">{r.po.number}</Link><p className={r.po.status === 'verified' ? 'text-emerald-800' : r.po.status === 'rejected' ? 'text-[#9F1D1D]' : 'text-amber-800'}>{r.po.statusLabel}</p><p className="mb-2 text-charcoal/70">PO total {money(r.po.total)}</p><PoPaymentStatus value={r.inTransit} /></>
                    : r.poNumber ? <span className="font-semibold">{r.poNumber}</span> : <Empty />}
                </td>
                <td className={`${cellClass} text-xs`}>
                  {r.medicine?.label ? <><p className={`font-bold ${MED_TONE[r.medicine.status] || 'text-charcoal/60'}`}>{r.medicine.label}</p>{r.medicine.detail && <p className="text-charcoal/65">{r.medicine.detail}</p>}{r.medicine.madeAt && <p className="text-[11px] text-charcoal/55">Ready {dateTime(r.medicine.madeAt)}</p>}{!r.medicine.madeAt && r.medicine.readyBy && <p className="text-[11px] text-charcoal/55">Ready by {dayLabel(String(r.medicine.readyBy).slice(0, 10))}</p>}</> : <Empty />}<MedicineAppointmentDetails value={r.medicineDepartment} />
                </td>
                <td className={`${cellClass} text-xs`}><InTransitStatus value={r.inTransit} /></td>
                <td className={`${cellClass} text-xs`}><DispatchPickupHandover row={r} /></td>
                <td className={`${cellClass} text-xs`}>
                  {r.delivery?.state ? <><p className={`font-bold ${DELIVERY_TONE[r.delivery.state]}`}>{DELIVERY[r.delivery.state]}</p>{r.delivery.text && <p className="text-charcoal/70">{r.delivery.text}</p>}{r.delivery.scheduledAt && <p className="text-[11px] text-charcoal/55">Scheduled {dateTime(r.delivery.scheduledAt)}{r.delivery.scheduledByName ? ` ? ${r.delivery.scheduledByName}` : ''}</p>}{r.delivery.via && <p className="text-charcoal/60">{r.delivery.via}</p>}{r.delivery.deliveredAt ? <p className="text-[11px] text-charcoal/55">Delivered {dateTime(r.delivery.deliveredAt)}{r.delivery.deliveredByName ? ` ? ${r.delivery.deliveredByName}` : ''}</p> : r.delivery.sentAt ? <p className="text-[11px] text-charcoal/55">Sent {dateTime(r.delivery.sentAt)}{r.delivery.sentByName ? ` ? ${r.delivery.sentByName}` : ''}</p> : null}{r.delivery.now && r.delivery.state !== 'delivered' && <p className="text-[11px] text-charcoal/55">Now: {r.delivery.now}</p>}</> : <Empty />}
                </td>
                <td className={`${cellClass} text-xs`}>
                  {r.startedAt ? <><p className="font-bold text-emerald-800">Treatment started</p><p className="text-[11px] text-charcoal/55">{dateTime(r.startedAt)}</p></>
                    : r.explainedAt ? <><p className="font-bold text-emerald-800">Explained</p><p className="text-[11px] text-charcoal/55">{dateTime(r.explainedAt)}</p></> : r.po ? <span className="text-charcoal/50">Not started</span> : <Empty />}
                </td>
                <td className={`${cellClass} text-xs`}><TreatmentStatus value={r.treatment} /></td>
                <td className={`${cellClass} text-xs`}><FollowUpAppointmentDetails value={r.followUpSessions} /></td>
              </tr>
            ))}
            {data && !rows.length && <tr><td colSpan={HEAD.length} className={`${cellClass} py-10 text-center text-sm text-charcoal/55`}>No appointments on {from === to ? dayLabel(from) : 'these dates'}.</td></tr>}
            {!data && !error && <tr><td colSpan={HEAD.length} className={`${cellClass} py-10 text-center text-sm text-charcoal/55`}>Loading...</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-charcoal/55">Any PCC ticks "History start" and "History taken". The Medicine Department ticks OPD start/complete; the Post Counselor ticks Post Counselling start/complete. Each tick saves the date, time and operator. Saved ticks are locked; use Edit, then Save to change them, or Cancel to keep the original status and time. Patient ID, arrival, registration and package come in by themselves. <Link to="/admin/appointment-management" className="font-semibold text-sage">Appointment Management</Link></p>
      <Modal open={exporting} onClose={() => setExporting(false)} title="Export OPD Sheets" className="max-w-xl">
        {exporting && <ExportDialog rows={rows} from={from} to={to} onClose={() => setExporting(false)} />}
      </Modal>
    </div>
  );
}
