import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  AlertTriangle, ArrowLeft, Check, CheckCircle2, ClipboardList, Clock3, ExternalLink, FileText, IndianRupee, Layers,
  PauseCircle, Pencil, Phone, PhoneCall, Pill, PlayCircle, Plus, RotateCcw, Send, ShieldCheck, Stethoscope, Truck, UserRound, X,
} from 'lucide-react';
import api from '../../api/axios.js';
import UtrRows, { emptyUtrRow, isMultiUtr, utrTotal, utrEntriesPayload } from '../../components/payments/UtrRows.jsx';
import Button from '../../components/ui/Button.jsx';
import Badge from '../../components/ui/Badge.jsx';
import Modal from '../../components/ui/Modal.jsx';
import { CompactAttachments } from '../../components/ui/Attachments.jsx';
import { PoPipelineBoxes, PoStepStrip, PoTimeline, poDateTime } from '../../components/purchaseOrders/PoPipeline.jsx';
import { Chip, FieldLabel, poInput } from '../../components/purchaseOrders/CreatePurchaseOrderModal.jsx';
import { ActionForm, AssignPccForm, CALL, FORMS, MODE, formKeyFor, sendAction } from '../../components/transit/TransitActions.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { DelayChips, FixedNote } from '../../components/medicine/MedicineDelay.jsx';
import PatientFile from '../../components/medicine/PatientFile.jsx';
import { ROLES } from '../../constants/roles.js';
import { CASE_CATEGORIES } from '../../constants/patientCategories.js';
import { AGE_BANDS, PO_STATUS, SUPPLY_OPTIONS, ageBandFor, ageBandLabel, supplyKeyOf } from '../../constants/supplyPlans.js';

const money = (value) => `Rs ${Number(value || 0).toLocaleString('en-IN')}`;
const day = (value) => (value ? new Date(value).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '');
const inputDay = (value) => (value ? new Date(value).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }) : '');
const VERIFY_ROLES = [ROLES.ADMIN, ROLES.DOCTOR, ROLES.IN_TRANSIT];
const CREATE_ROLES = [ROLES.ADMIN, ROLES.DOCTOR, ROLES.POST_COUNSELOR, ROLES.IN_TRANSIT];
const TRANSIT_ROLES = [ROLES.ADMIN, ROLES.IN_TRANSIT];
const MED_STATUS = { requested: 'Waiting for Medicine Dept', in_process: 'Being prepared', made: 'Medicine ready', sent_to_courier: 'Released', cancelled: 'Cancelled' };
// Transit steps that belong to handover / treatment start (order and medicine steps live on the PO itself).
const HANDOVER_ACTIONS = ['schedule_delivery', 'dispatch', 'confirm_received', 'assign_pcc', 'confirm_mode', 'schedule_visit', 'schedule_dispatch', 'start_treatment', 'log_call'];
const PCC_FORMS = ['assign_pcc', 'start_treatment'];

const Section = ({ title, icon: Icon, action, children, className = '' }) => (
  <section className={`rounded-[14px] border border-[#E8DFCB] bg-white p-4 sm:p-[18px] ${className}`}>
    <div className="mb-3 flex items-center justify-between gap-2"><h3 className="flex items-center gap-2 font-display text-[13.5px] font-bold text-charcoal">{Icon && <Icon size={16} className="text-sage" />}{title}</h3>{action}</div>
    {children}
  </section>
);
const Row = ({ label, value }) => (value === '' || value == null ? null : <div className="flex justify-between gap-3 py-0.5 text-sm"><span className="text-charcoal/55">{label}</span><span className="min-w-0 break-words text-right font-medium text-charcoal">{value}</span></div>);
const ErrorText = ({ children }) => (children ? <p className="rounded-lg bg-[#8C3B2E]/8 px-3 py-2 text-sm text-[#8C3B2E]">{children}</p> : null);
const smallLink = 'inline-flex items-center gap-1 text-xs font-semibold text-sage hover:underline';

// What each timeline step shows on the right: what is filled at that step, or where its status is seen.
const STEP_SECTIONS = {
  created: ['patient', 'po'],
  details: ['patient', 'po'],
  payment: ['payments'],
  requested: ['medicine'],
  accepted: ['medicine', 'job'],
  ready: ['medicine', 'job'],
  scheduled: ['handover'],
  fullpay: ['payments', 'handover'],
  released: ['job', 'handover'],
  handover: ['handover'],
  received: ['handover'],
  pcc: ['handover'],
  explained: ['handover'],
  started: ['handover'],
};
const STEP_STATE = {
  done: ['Done', 'bg-emerald-100 text-emerald-800'],
  current: ['Now', 'bg-[#FFF1E6] text-[#C2410C]'],
  failed: ['Stopped', 'bg-[#FDE2E1] text-[#9F1D1D]'],
  todo: ['Not reached yet', 'bg-[#F3EEE2] text-charcoal/60'],
};

// In Transit's checklist for a verification step ('details' or 'payment'), as [key, label] lines.
const verifyChecklist = (po, step) => (step === 'details'
  ? [['paper', `PO paper checked (${po.paperImages.length ? `${po.paperImages.length} image(s)` : 'no image attached'}) and matches the form below`], ['patient', 'Patient name, ID and contact numbers are correct'], ['order', `Phase ${po.phase}, medicine supply (${po.supplyLabel || 'not selected'}) and PO value ${money(po.amount)} are correct`]]
  : [['proof', po.linkedPayment.count ? `Payment proof matched: ${money(po.linkedPayment.pendingAmount || po.linkedPayment.verifiedAmount)} ${po.linkedPayment.pendingAmount ? 'pending ' : ''}on this PO (UTR / screenshot / cash receiver)` : 'There is no payment on this PO - confirmed']]);

// What was done in a finished step: the lines ticked and the actions taken, each shown in green.
function doneItems(step, po) {
  const med = po.medicine;
  const line = (...bits) => bits.filter(Boolean).join(' · ');
  const events = (actions) => (po.events || []).filter((e) => actions.includes(e.action)).map((e) => ({ text: e.action, sub: line(e.details, e.byName && `by ${e.byName}`, poDateTime(e.at)) }));
  // The lines as they were ticked. A PO verified before they were saved shows its checklist: verifying needs every line ticked.
  const ticked = (checks, key) => (checks?.length ? checks : verifyChecklist(po, key).map(([, label]) => label)).map((text) => ({ text }));
  let items = [];
  if (step.key === 'created') {
    items = [
      ...events(['PO created']),
      { text: `PO value ${money(po.amount)}`, sub: line(`Phase ${po.phase}`, po.supplyLabel, ageBandLabel(po.ageBand)) },
      po.paperImages?.length ? { text: `PO paper attached (${po.paperImages.length} image${po.paperImages.length === 1 ? '' : 's'})` } : null,
      po.medicineReadyDate ? { text: `Medicine expected by ${day(po.medicineReadyDate)}`, sub: 'Fixed by post counselling' } : null,
    ];
  } else if (step.key === 'details') {
    items = po.status === 'rejected' ? events(['PO rejected']) : [...ticked(po.detailsChecks, 'details'), po.approvalStatus === 'approved' ? { text: 'Patient approved' } : null, ...events(['PO details verified'])];
  } else if (step.key === 'payment') {
    items = [
      ...ticked(po.paymentChecks, 'payment'),
      ...po.payments.filter((p) => p.status === 'approved').map((p) => ({ text: `${money(p.amount)} verified`, sub: line(p.mode === 'cash' ? `Cash${p.receivedBy ? ` - ${p.receivedBy}` : ''}` : `Online${p.utr ? ` - UTR ${p.utr}` : ''}`, p.bank, day(p.date), p.approvedByName && `verified by ${p.approvedByName}`) })),
      ...events(['Payment verified']),
    ];
  } else if (step.key === 'requested' && med) {
    // Each value with where it came from: post counselling, the PO, or the person who sent the request.
    const sentBy = med.requestedByName ? `Chosen by ${med.requestedByName} when sending the request` : 'Chosen when sending the request';
    const onPo = `Set on the PO${po.createdByName ? ` by ${po.createdByName}` : ''}`;
    items = [
      { text: 'Medicine request sent to Medicine Department', sub: line(med.requestedByName && `by ${med.requestedByName}`, poDateTime(med.requestedAt)) },
      med.caseCategory ? { text: `Category: ${med.caseCategory}`, sub: med.caseCategory === po.patientCaseCategory ? `The patient's category from the Sales sheet · sent by ${med.requestedByName || 'In Transit'}` : sentBy } : null,
      { text: `Supply: ${po.supplyLabel || '-'}`, sub: po.fixedPlan?.supplyLocked ? onPo : sentBy },
      ageBandLabel(po.ageBand) ? { text: `Age group: ${ageBandLabel(po.ageBand)}`, sub: line(po.fixedPlan?.ageBandLocked ? onPo : sentBy, po.patientAge && `patient age ${po.patientAge}`) } : null,
      med.readyByDate ? {
        text: `Ready by: ${day(med.readyByDate)}`,
        sub: po.fixedPlan?.readyDate
          ? `Fixed by post counselling on the PO paper${po.createdByName ? ` (PO by ${po.createdByName})` : ''} · Medicine Department cannot change it`
          : line(`Filled by ${med.readyBySetByName || med.requestedByName || 'In Transit'}`, poDateTime(med.readyBySetAt || med.requestedAt), 'Medicine Department cannot change it'),
      } : null,
      med.medicines ? { text: `Medicines: ${med.medicines}` } : null,
      med.notes ? { text: `Notes: ${med.notes}`, sub: med.requestedByName && `by ${med.requestedByName}` } : null,
    ];
  } else if (step.key === 'ready' && med?.medicineImages?.length) {
    items = [{ text: 'Medicine ready', sub: line(step.by && `by ${step.by}`, poDateTime(step.at)) }, { text: `${med.medicineImages.length} medicine photo${med.medicineImages.length === 1 ? '' : 's'} added` }];
  }
  items = items.filter(Boolean);
  return items.length ? items : [{ text: step.text || step.label, sub: line(step.by && `by ${step.by}`, poDateTime(step.at)) }];
}

// The chosen timeline step: where it stands, who did it and when, or what it is waiting for.
function StepHeader({ step, total, onAll, onRevert, po }) {
  const [label, tone] = STEP_STATE[step.state] || STEP_STATE.todo;
  const doneLine = [step.text, step.by && `by ${step.by}`, poDateTime(step.at)].filter(Boolean).join(' · ');
  return (
    <div className="flex flex-wrap items-start justify-between gap-2 rounded-[14px] border border-[#E8DFCB] bg-white px-4 py-3">
      <div className="min-w-0">
        <p className="text-[11px] font-bold uppercase tracking-wide text-charcoal/50">Step {step.n} of {total}</p>
        <h2 className="flex flex-wrap items-center gap-2 text-base font-bold text-charcoal">{step.label}<span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${tone}`}>{label}</span></h2>
        {step.state !== 'todo' && doneLine && <p className="text-sm text-charcoal/65">{doneLine}</p>}
        {step.state !== 'done' && step.waitText && <p className="text-sm text-charcoal/65">{step.waitText}</p>}
      </div>
      <div className="flex items-center gap-3">
        {onRevert && step.state === 'done' && step.key !== 'created' && <button type="button" onClick={() => onRevert(step)} className="inline-flex items-center gap-1 text-xs font-semibold text-[#8C3B2E] hover:underline" title="Admin: undo this step and every step after it"><RotateCcw size={13} />Revert</button>}
        <button type="button" onClick={onAll} className={smallLink}><Layers size={13} />All details</button>
      </div>
      {step.state === 'done' && (
        <div className="w-full rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5">
          <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-emerald-800">Done in this step</p>
          <ul className="space-y-1.5">
            {doneItems(step, po).map((item, i) => (
              <li key={i} className="flex gap-2 text-sm">
                {/* Every line done in the step gets the same green tick. */}
                <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded bg-emerald-600 text-white" role="img" aria-label="Done"><Check size={12} strokeWidth={3} /></span>
                <span className="min-w-0"><span className="font-semibold text-emerald-900">{item.text}</span>{item.sub && <span className="block text-xs text-emerald-800/75">{item.sub}</span>}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}


function RejectBox({ po, onDone, onBack }) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const reject = async () => {
    setBusy(true); setError('');
    try { const { data } = await api.post(`/purchase-orders/${po.id}/reject`, { reason }); onDone(data.purchaseOrder, 'Purchase order rejected. The creator corrects it and sends it again.'); }
    catch (err) { setError(err.response?.data?.message || 'Could not reject'); } finally { setBusy(false); }
  };
  return (
    <div className="space-y-2 rounded-lg border border-[#8C3B2E]/25 bg-[#8C3B2E]/5 p-3">
      <ErrorText>{error}</ErrorText>
      <FieldLabel label="Why is it rejected?" required><input className={poInput} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. amount does not match the screenshot" /></FieldLabel>
      <div className="flex gap-2"><Button variant="danger" disabled={busy || !reason.trim()} onClick={reject}>Reject PO</Button><Button variant="outline" onClick={onBack}>Back</Button></div>
    </div>
  );
}

// Step 1: PO paper and patient details. Step 2: payment proof. Each is its own button.
function VerifyPanel({ po, onDone }) {
  const step = po.detailsVerified ? 'payment' : 'details';
  const checksFor = verifyChecklist(po, step);
  const [checks, setChecks] = useState({});
  const [rejecting, setRejecting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { setChecks({}); setRejecting(false); }, [step]);
  const run = async () => {
    setBusy(true); setError('');
    try {
      const { data } = await api.post(`/purchase-orders/${po.id}/verify-${step}`, { checks: checksFor.map(([, label]) => label) });
      onDone(data.purchaseOrder, step === 'details' ? 'PO details verified. Now verify the payment.' : `Payment verified and added to Phase ${po.phase} payments. You can request the medicine now.`);
    } catch (err) { setError(err.response?.data?.message || 'Could not verify'); } finally { setBusy(false); }
  };
  const allChecked = checksFor.every(([key]) => checks[key]);
  return (
    <div className="space-y-3">
      <div className="flex gap-3"><ShieldCheck size={20} className="mt-0.5 shrink-0 text-sage" /><div>
        <p className="text-[11px] font-bold uppercase tracking-wide text-sage">Step {step === 'details' ? 1 : 2} of 2</p>
        <h3 className="text-base font-bold text-charcoal">{step === 'details' ? 'Verify the PO details' : 'Verify the payment'}</h3>
        <p className="text-sm text-charcoal/65">{step === 'details' ? `Check the PO paper and patient details below.${po.approvalStatus === 'pending' ? ' The patient is approved with this step.' : ''}` : `The payment is already saved in Phase ${po.phase} payments of the patient${po.phasePayment.amountPaid ? ' (with the earlier payments of this phase)' : ''}. Verifying makes it count in the phase balance.`}</p>
      </div></div>
      <ErrorText>{error}</ErrorText>
      <div className="space-y-1.5 text-sm">
        {checksFor.map(([key, label]) => <label key={key} className="flex items-start gap-2"><input type="checkbox" className="mt-0.5 h-4 w-4 accent-sage" checked={Boolean(checks[key])} onChange={(e) => setChecks((c) => ({ ...c, [key]: e.target.checked }))} />{label}</label>)}
      </div>
      {!rejecting ? (
        <div className="flex flex-wrap gap-2">
          <Button disabled={busy || !allChecked} onClick={run}><Check size={15} />{busy ? 'Saving...' : step === 'details' ? 'Verify PO details' : 'Verify payment'}</Button>
          <Button variant="outline" disabled={busy} onClick={() => setRejecting(true)}><X size={15} />Reject</Button>
        </div>
      ) : <RejectBox po={po} onDone={onDone} onBack={() => setRejecting(false)} />}
    </div>
  );
}

function MedicineRequestForm({ po, onDone }) {
  const { user } = useAuth();
  const admin = user?.role === ROLES.ADMIN;
  // Fixed in post counselling: In Transit passes them on as they are (only the admin can change them).
  const supplyLocked = Boolean(po.fixedPlan?.supplyLocked) && !admin;
  const dateLocked = Boolean(po.fixedPlan?.readyDate) && !admin;
  const ageLocked = Boolean(po.fixedPlan?.ageBandLocked) && !admin;
  const [values, setValues] = useState({
    supplyKey: supplyKeyOf(po.supplyPlan, po.supplyPart), ageBand: po.ageBand || po.suggestedAgeBand || '',
    caseCategory: po.patientCaseCategory || '', readyByDate: inputDay(po.medicineReadyDate), notes: '',
  });
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (key, value) => setValues((v) => ({ ...v, [key]: value }));
  const submit = async (event) => {
    event.preventDefault();
    if (!values.supplyKey) { setError('Select the medicine supply'); return; }
    if (!values.ageBand) { setError('Select the age group'); return; }
    if (!values.caseCategory) { setError('Select the category: Autism, ADHD, Autism + ADHD or Mental Health'); return; }
    setBusy(true); setError('');
    try {
      const body = new FormData();
      Object.entries(values).forEach(([key, value]) => { if (value) body.append(key, value); });
      files.forEach((file) => body.append('prescription', file));
      const { data } = await api.post(`/purchase-orders/${po.id}/medicine-request`, body);
      onDone(data.purchaseOrder, 'Medicine request sent to Medicine Department.');
    } catch (err) { setError(err.response?.data?.message || 'Could not send the request'); } finally { setBusy(false); }
  };
  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="flex gap-3"><Pill size={20} className="mt-0.5 shrink-0 text-sage" /><div><h3 className="text-base font-bold text-charcoal">Request medicine from Medicine Department</h3><p className="text-sm text-charcoal/65">Confirm the supply and the age group; Medicine Department prepares by this category.</p></div></div>
      <ErrorText>{error}</ErrorText>
      <div><p className="mb-1 text-sm font-medium text-charcoal">Category<span className="text-red-700"> *</span> {po.patientCaseCategory && <span className="font-normal text-charcoal/50">(patient's category: {po.patientCaseCategory})</span>}</p><div className="flex flex-wrap gap-1.5">{CASE_CATEGORIES.map((c) => <Chip key={c} active={values.caseCategory === c} onClick={() => set('caseCategory', c)}>{c}</Chip>)}</div></div>
      <div><p className="mb-1 text-sm font-medium text-charcoal">Medicine supply<span className="text-red-700"> *</span></p><div className="flex flex-wrap gap-1.5">{SUPPLY_OPTIONS.map((o) => <Chip key={o.key} title={o.hint} active={values.supplyKey === o.key} disabled={supplyLocked && values.supplyKey !== o.key} onClick={() => !supplyLocked && set('supplyKey', o.key)}>{o.label}</Chip>)}</div>{supplyLocked && <FixedNote />}</div>
      <div><p className="mb-1 text-sm font-medium text-charcoal">Age group<span className="text-red-700"> *</span> {po.patientAge && <span className="font-normal text-charcoal/50">(patient age {po.patientAge})</span>}</p><div className="flex flex-wrap gap-1.5">{AGE_BANDS.map((b) => <Chip key={b.value} active={values.ageBand === b.value} disabled={ageLocked && values.ageBand !== b.value} onClick={() => !ageLocked && set('ageBand', b.value)}>{b.label}{b.value === po.suggestedAgeBand ? ' (by age)' : ''}</Chip>)}</div>{ageLocked && <FixedNote />}</div>
      <div className="grid gap-3 sm:grid-cols-2">
        <FieldLabel label="Medicine ready-by date" required><input className={poInput} type="date" required readOnly={dateLocked} disabled={dateLocked} value={values.readyByDate} onChange={(e) => set('readyByDate', e.target.value)} />{dateLocked && <FixedNote />}</FieldLabel>
        <div className="sm:col-span-2"><p className="mb-1 text-sm text-charcoal/65">No prescription upload: the Medicine Department reads the patient's whole file from the Records Room.</p><PatientFile documents={po.patientDocuments || []} /></div>
        <FieldLabel label="Notes for Medicine Department" className="sm:col-span-2"><input className={poInput} value={values.notes} onChange={(e) => set('notes', e.target.value)} /></FieldLabel>
      </div>
      <Button type="submit" disabled={busy}><Send size={15} />{busy ? 'Sending...' : 'Send medicine request'}</Button>
    </form>
  );
}

function PlanEditModal({ po, onClose, onDone }) {
  // The age group is never picked: it follows the age entered here.
  const [values, setValues] = useState({ medicineReadyDate: inputDay(po.medicineReadyDate), supplyKey: supplyKeyOf(po.supplyPlan, po.supplyPart), patientAge: po.patientAge || '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (key, value) => setValues((v) => ({ ...v, [key]: value }));
  const submit = async (event) => {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const { data } = await api.patch(`/purchase-orders/${po.id}/plan`, values);
      onDone(data.purchaseOrder, 'Ready date, supply and age group updated.');
      onClose();
    } catch (err) { setError(err.response?.data?.message || 'Could not save'); } finally { setBusy(false); }
  };
  return (
    <Modal open onClose={() => !busy && onClose()} title={`Change plan · ${po.poNumber}`} className="max-w-lg">
      <form onSubmit={submit} className="space-y-3">
        <p className="text-sm text-charcoal/65">Decided in post counselling. In Transit and the Medicine Department work to these and cannot change them. They can be changed here until the Medicine Department accepts the request.</p>
        <ErrorText>{error}</ErrorText>
        <FieldLabel label="Medicine ready expected date" required><input className={poInput} type="date" required value={values.medicineReadyDate} onChange={(e) => set('medicineReadyDate', e.target.value)} /></FieldLabel>
        <div><p className="mb-1 text-sm font-medium text-charcoal">Medicine supply</p><div className="flex flex-wrap gap-1.5">{SUPPLY_OPTIONS.map((o) => <Chip key={o.key} active={values.supplyKey === o.key} onClick={() => set('supplyKey', o.key)}>{o.label}</Chip>)}</div></div>
        <FieldLabel label="Patient age (this phase)" required><input className={poInput} required value={values.patientAge} onChange={(e) => set('patientAge', e.target.value)} placeholder="e.g. 6" /></FieldLabel>
        <p className="text-sm text-charcoal/70">Age group: <b className="text-charcoal">{ageBandLabel(ageBandFor(values.patientAge)) || 'enter the age (from 3 years)'}</b></p>
        <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={onClose} disabled={busy}>Cancel</Button><Button type="submit" disabled={busy}>{busy ? 'Saving...' : 'Save'}</Button></div>
      </form>
    </Modal>
  );
}

function EditRejectedForm({ po, onDone }) {
  const { user } = useAuth();
  const supplyLocked = Boolean(po.fixedPlan?.supplyLocked) && user?.role !== ROLES.ADMIN;
  const [values, setValues] = useState({ supplyKey: supplyKeyOf(po.supplyPlan, po.supplyPart), amount: String(po.amount || ''), notes: po.notes || '' });
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submit = async (event) => {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const body = new FormData();
      Object.entries(values).forEach(([key, value]) => body.append(key, value));
      files.forEach((file) => body.append('paper', file));
      const { data } = await api.patch(`/purchase-orders/${po.id}`, body);
      onDone(data.purchaseOrder, 'Corrected and sent to In Transit again.');
    } catch (err) { setError(err.response?.data?.message || 'Could not save'); } finally { setBusy(false); }
  };
  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="flex gap-3"><AlertTriangle size={20} className="mt-0.5 shrink-0 text-[#8C3B2E]" /><div><h3 className="text-base font-bold text-charcoal">Rejected - correct and resend</h3><p className="text-sm text-[#8C3B2E]">{po.rejectReason} <span className="text-charcoal/50">({po.rejectedByName}, {poDateTime(po.rejectedAt)})</span></p></div></div>
      <ErrorText>{error}</ErrorText>
      <div><div className="flex flex-wrap gap-1.5">{SUPPLY_OPTIONS.map((o) => <Chip key={o.key} active={values.supplyKey === o.key} disabled={supplyLocked && values.supplyKey !== o.key} onClick={() => !supplyLocked && setValues((v) => ({ ...v, supplyKey: o.key }))}>{o.label}</Chip>)}</div>{supplyLocked && <FixedNote />}</div>
      <div className="grid gap-3 sm:grid-cols-2">
        <FieldLabel label="PO amount (Rs)"><input className={poInput} value={values.amount} onChange={(e) => setValues((v) => ({ ...v, amount: e.target.value }))} /></FieldLabel>
        <FieldLabel label="Add PO paper image"><input className={`${poInput} text-xs`} type="file" multiple accept="image/*,application/pdf" onChange={(e) => setFiles([...e.target.files])} /></FieldLabel>
        <FieldLabel label="Notes" className="sm:col-span-2"><input className={poInput} value={values.notes} onChange={(e) => setValues((v) => ({ ...v, notes: e.target.value }))} /></FieldLabel>
      </div>
      <Button type="submit" disabled={busy}><RotateCcw size={15} />{busy ? 'Saving...' : 'Save and resend for verification'}</Button>
    </form>
  );
}

function AddPaymentModal({ po, open, onClose, onDone }) {
  const [values, setValues] = useState({ paymentAmount: '', paymentMode: 'online', paymentDate: inputDay(new Date()), utr: '', receivedBy: '', paymentNotes: '' });
  const [utrRows, setUtrRows] = useState([emptyUtrRow()]);
  const multiUtr = values.paymentMode === 'online' && isMultiUtr(utrRows);
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (key, value) => setValues((v) => ({ ...v, [key]: value }));
  const submit = async (event) => {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const body = new FormData();
      const first = utrRows[0] || {};
      const send = { ...values, ...(values.paymentMode === 'online' ? { utr: first.utr || '', transactionId: first.transactionId || '', utrEntries: utrEntriesPayload(utrRows) } : {}), ...(multiUtr ? { paymentAmount: String(utrTotal(utrRows)) } : {}) };
      Object.entries(send).forEach(([key, value]) => { if (value) body.append(key, value); });
      files.forEach((file) => body.append('screenshot', file));
      const { data } = await api.post(`/purchase-orders/${po.id}/payments`, body);
      onDone(data.purchaseOrder, `Payment saved in Phase ${po.phase} payments. In Transit verifies it.`);
    } catch (err) { setError(err.response?.data?.message || 'Could not save the payment'); } finally { setBusy(false); }
  };
  return (
    <Modal open={open} onClose={() => !busy && onClose()} title={`Add payment to ${po.poNumber}`} className="max-w-lg">
      <form onSubmit={submit} className="space-y-3">
        <ErrorText>{error}</ErrorText>
        <div className="grid gap-3 sm:grid-cols-2">
          <FieldLabel label={multiUtr ? 'Amount (total of UTRs)' : 'Amount (Rs)'} required><input className={poInput} required={!multiUtr} disabled={multiUtr} inputMode="decimal" value={multiUtr ? utrTotal(utrRows) : values.paymentAmount} onChange={(e) => set('paymentAmount', e.target.value)} /></FieldLabel>
          <div><p className="mb-1 text-sm font-medium text-charcoal">Mode</p><div className="flex gap-1.5"><Chip active={values.paymentMode === 'online'} onClick={() => set('paymentMode', 'online')}>Online</Chip><Chip active={values.paymentMode === 'cash'} onClick={() => set('paymentMode', 'cash')}>Cash</Chip></div></div>
          <FieldLabel label="Payment date"><input className={poInput} type="date" value={values.paymentDate} onChange={(e) => set('paymentDate', e.target.value)} /></FieldLabel>
          {values.paymentMode === 'online'
            ? <div className="sm:col-span-2"><UtrRows idPrefix="po-utr" utrLabel="UTR / reference" rows={utrRows} onChange={setUtrRows} /></div>
            : <FieldLabel label="Cash received by" required><input className={poInput} required value={values.receivedBy} onChange={(e) => set('receivedBy', e.target.value)} /></FieldLabel>}
          {values.paymentMode === 'online' && <FieldLabel label="Payment screenshot" required className="sm:col-span-2"><input className={`${poInput} text-xs`} type="file" multiple accept="image/*,application/pdf" onChange={(e) => setFiles([...e.target.files])} /></FieldLabel>}
          <FieldLabel label="Note" className="sm:col-span-2"><input className={poInput} value={values.paymentNotes} onChange={(e) => set('paymentNotes', e.target.value)} /></FieldLabel>
        </div>
        <div className="flex justify-end gap-2"><Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button><Button type="submit" disabled={busy}>{busy ? 'Saving...' : 'Save payment'}</Button></div>
      </form>
    </Modal>
  );
}

// The full PO paper as it was filled (sections F, G, H) with its images and screenshots.
function PaperDetails({ po }) {
  if (!po.paper) return <p className="text-sm text-charcoal/50">The full PO paper was not saved for this older PO.</p>;
  return (
    <div className="space-y-4">
      {po.paper.totals?.length > 0 && <div className="grid gap-2 sm:grid-cols-3">{po.paper.totals.map((t) => <div key={t.label} className="rounded-lg bg-offwhite-200 px-3 py-2"><p className="text-[10px] font-semibold uppercase tracking-wide text-charcoal/50">{t.label}</p><p className="text-sm font-bold text-charcoal">{t.value}</p></div>)}</div>}
      {po.paper.sections.map((section) => (
        <div key={section.letter}>
          <p className="mb-1.5 border-l-4 border-sage bg-sage/10 px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-charcoal">{section.letter}. {section.title}</p>
          <div className="grid gap-x-6 sm:grid-cols-2">{section.rows.map((row) => <Row key={row.label} label={row.label} value={row.value} />)}</div>
          {/* The PO paper image is already shown above as "PO paper"; list only files not shown there. */}
          {section.files.map((f) => {
            const shown = new Set((po.paperImages || []).map((file) => file.url));
            const files = (f.files || []).filter((file) => !shown.has(file.url));
            return files.length ? <CompactAttachments key={f.label} files={files} label={f.label} className="mt-1.5" /> : null;
          })}
        </div>
      ))}
    </div>
  );
}

// Handover and treatment start of this PO's medicine: calls, delivery mode, pickup or dispatch, receipt, explanation.
function HandoverPanel({ po, onChanged }) {
  const [item, setItem] = useState(null);
  const [quick, setQuick] = useState(null);
  const [holdOpen, setHoldOpen] = useState(false);
  const [holdReason, setHoldReason] = useState('');
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    try { const { data } = await api.get(`/transit/${po.patientId}/${po.phase}`, { skipCache: true }); setItem(data.item); setError(''); }
    catch (err) { setError(err.response?.data?.message || 'Could not load the handover details'); }
  }, [po.patientId, po.phase]);
  useEffect(() => { load(); }, [load, po.medicine?.status]);
  const done = (next) => { setItem(next); setQuick(null); setHoldOpen(false); setHoldReason(''); onChanged(); };
  const act = async (action, values = {}) => {
    setError('');
    try { done(await sendAction(item, action, values)); } catch (err) { setError(err.response?.data?.message || 'Could not save'); }
  };
  if (!item) return <Section title="Handover & treatment start" icon={Truck}>{error ? <ErrorText>{error}</ErrorText> : <p className="text-sm text-charcoal/50">Loading...</p>}</Section>;
  const courier = item.courier;
  const shipped = courier && courier.status !== 'pending';
  const open = !item.activated && !item.onHold && !item.removed;
  const next = open && HANDOVER_ACTIONS.includes(item.nextAction) ? item.nextAction : null;
  return (
    <Section title="Handover & treatment start" icon={Truck} action={open && <button type="button" className={smallLink} onClick={() => setHoldOpen((v) => !v)}><PauseCircle size={13} />Hold</button>}>
      <div className="space-y-3">
        <ErrorText>{error}</ErrorText>
        {holdOpen && <div className="flex flex-wrap gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3"><input className={`${poInput} flex-1`} placeholder="Exception / reason for hold" value={holdReason} onChange={(e) => setHoldReason(e.target.value)} /><Button size="sm" disabled={!holdReason.trim()} onClick={() => act('hold', { reason: holdReason })}>Put on hold</Button></div>}
        {item.onHold && <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900"><span><b>On hold:</b> {item.hold?.reason} ({item.hold?.by})</span><Button size="sm" onClick={() => act('resume')}><PlayCircle size={14} />Resume</Button></div>}
        {item.activated && <p className="flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800"><CheckCircle2 size={15} />Treatment started {poDateTime(item.explanation.completedAt)}{item.explanation.completedBy ? ` by ${item.explanation.completedBy}` : ''}</p>}
        {item.alerts.filter((a) => !a.text.startsWith('On hold')).map((a) => <p key={a.text} className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold ${a.type === 'danger' ? 'bg-[#8C3B2E]/10 text-[#8C3B2E]' : a.type === 'warning' ? 'bg-amber-50 text-amber-900' : 'bg-sky-50 text-sky-900'}`}><AlertTriangle size={15} />{a.text}</p>)}

        {next ? (
          <div className="rounded-xl border-2 border-sage/40 bg-sage/5 p-3">
            {PCC_FORMS.includes(next) ? <AssignPccForm item={item} onDone={done} /> : <ActionForm key={`${item.key}-${next}`} formKey={formKeyFor(next, item)} item={item} onDone={done} />}
          </div>
        ) : open && <p className="text-sm text-charcoal/65">{['contact', 'handover', 'treatment'].includes(item.group)
          ? <><b className="text-charcoal">{item.step.label}.</b> {item.step.waitText || ''}{item.nextAction === 'add_payment' ? ' Use "Add payment" in the Payments section, then verify it.' : ''}</>
          : <>The medicine is with Medicine Department. You can already log calls with the patient; the delivery and explanation schedule, payment and handover follow once it is released.</>}</p>}

        {open && <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => setQuick('log_call')}><PhoneCall size={14} />Log call</Button>
          {!shipped && <Button size="sm" variant="outline" onClick={() => setQuick('schedule_delivery')}><Truck size={14} />{item.plan?.done ? 'Change schedule' : 'Schedule delivery & explanation'}</Button>}
          {shipped && !item.explanation.completedAt && <Button size="sm" variant="outline" onClick={() => setQuick('assign_pcc')}><Stethoscope size={14} />{item.pcc?.assigned ? 'Change PCC' : 'Assign PCC'}</Button>}
        </div>}

        <div className="grid gap-x-6 sm:grid-cols-2">
          <Row label="Delivery mode" value={MODE[item.mode]?.label || 'Not confirmed'} />
          <Row label="Pickup visit" value={poDateTime(item.visit.at)} />
          <Row label="Planned dispatch" value={poDateTime(item.deliveryPlan?.at)} />
          <Row label="Planned carrier" value={item.deliveryPlan?.courier} />
          <Row label={item.mode === 'porter' ? 'Porter' : 'Courier'} value={shipped ? [courier.courierPartner, courier.trackingNumber].filter(Boolean).join(' / ') : ''} />
          <Row label="Received by" value={courier?.receivedByName ? `${courier.receivedByName}, ${poDateTime(courier.deliveredAt)}` : ''} />
          <Row label="Medicine explanation" value={item.explanation.at ? `${poDateTime(item.explanation.at)}${item.explanation.mode ? ` (${item.explanation.mode})` : ''}${item.explanation.ackAt ? ' · seen by PCC' : ''}` : ''} />
          <Row label="PCC" value={item.assignments.assistantDoctor?.name ? `${item.assignments.assistantDoctor.name}${item.pcc?.assigned ? ` (assigned ${poDateTime(item.pcc.at)} by ${item.pcc.byName})` : ' (on the patient record - confirm or change at the PCC step)'}` : ''} />
        </div>
        {shipped && <><CompactAttachments files={courier.packageImages} label="Package" /><CompactAttachments files={courier.deliveryProofImages} label="Delivery proof" /></>}

        <div>
          <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-charcoal/45">Calls with the patient</p>
          {item.calls.length ? (
            <ol className="relative space-y-2 border-l border-cardline pl-4">
              {item.calls.map((c, i) => (
                <li key={i} className="relative text-sm">
                  <span className={`absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full ${c.outcome === 'connected' ? 'bg-emerald-600' : 'bg-amber-500'}`} />
                  <p className="font-semibold text-charcoal">{CALL[c.outcome]} <span className="font-normal text-charcoal/50">{poDateTime(c.at)} - {c.byName}</span></p>
                  <p className="text-charcoal/75">{c.notes}</p>
                  {c.nextCallAt && <p className="text-xs font-semibold text-amber-800">Call again {poDateTime(c.nextCallAt)}</p>}
                </li>
              ))}
            </ol>
          ) : <p className="text-sm text-charcoal/50">No calls yet.</p>}
        </div>
      </div>
      <Modal open={Boolean(quick)} onClose={() => setQuick(null)} title={quick ? (PCC_FORMS.includes(quick) ? 'Assign PCC (Patient Care Coordinator)' : FORMS[formKeyFor(quick, item)]?.title) : ''} className="max-w-lg">
        {PCC_FORMS.includes(quick) ? <AssignPccForm item={item} onDone={done} /> : quick && <ActionForm compact formKey={formKeyFor(quick, item)} item={item} onDone={done} onCancel={() => setQuick(null)} />}
      </Modal>
    </Section>
  );
}

export function PurchaseOrderView({ poId, showPatientLink = true }) {
  const { user } = useAuth();
  const role = user?.role;
  const canVerify = VERIFY_ROLES.includes(role);
  const canCreate = CREATE_ROLES.includes(role);
  const [po, setPo] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [payOpen, setPayOpen] = useState(false);
  const [planOpen, setPlanOpen] = useState(false);
  // Admin undo of a timeline step (and every later one), with a reason.
  const [revert, setRevert] = useState(null);
  const [revertReason, setRevertReason] = useState('');
  const [reverting, setReverting] = useState(false);
  const runRevert = async () => {
    setReverting(true); setError('');
    try { const { data } = await api.post(`/purchase-orders/${po.id}/revert`, { step: revert.key, reason: revertReason }); setRevert(null); setRevertReason(''); done(data.purchaseOrder, `Reverted: ${revert.label}.`); }
    catch (err) { setError(err.response?.data?.message || 'Could not revert this step'); } finally { setReverting(false); }
  };
  const [busyPayment, setBusyPayment] = useState('');
  // The timeline step shown on the right (null: follow the step the PO is on now).
  const [picked, setPicked] = useState(null);

  const load = useCallback(async () => {
    try { const { data } = await api.get(`/purchase-orders/${poId}`, { skipCache: true }); setPo(data.purchaseOrder); setError(''); }
    catch (err) { setError(err.response?.data?.message || 'Could not load the purchase order'); }
  }, [poId]);
  useEffect(() => { setPo(null); setPicked(null); load(); }, [load]);
  useEffect(() => { const timer = setInterval(load, 30000); window.addEventListener('focus', load); return () => { clearInterval(timer); window.removeEventListener('focus', load); }; }, [load]);
  useEffect(() => { if (!notice) return undefined; const t = setTimeout(() => setNotice(''), 6000); return () => clearTimeout(t); }, [notice]);

  // After an action the right side moves on to the step the PO is on now.
  const done = (next, message) => { setPo(next); setNotice(message); setPayOpen(false); setPicked(null); };
  // A PO still waiting for verification: In Transit checks the details and the payment right here, in one go.
  const verifyPoHere = async (payment) => {
    if (!window.confirm(`Verify ${po.poNumber}: the PO details and its payment(s) (${money(po.linkedPayment.pendingAmount || payment.amount)}) together?`)) return;
    setBusyPayment(payment.id); setError('');
    try {
      const together = 'Checked from the payment card (PO details and payment together)';
      if (!po.detailsVerifiedAt) await api.post(`/purchase-orders/${po.id}/verify-details`, { checks: [together] });
      const { data } = await api.post(`/purchase-orders/${po.id}/verify-payment`, { checks: [`${together}: payment proof of ${money(po.linkedPayment.pendingAmount || payment.amount)} matched`] });
      setPo(data.purchaseOrder); setPicked(null);
      setNotice(`${po.poNumber} verified with its payment.`);
    } catch (err) { setError(err.response?.data?.message || 'Could not verify'); await load(); } finally { setBusyPayment(''); }
  };
  const verifyPayment = async (payment) => {
    setBusyPayment(payment.id); setError('');
    try { await api.patch(`/patients/${po.patientId}/stages/${po.phase}/payments/${payment.id}/approve`); await load(); setNotice(`Payment of ${money(payment.amount)} verified in Phase ${po.phase} payments.`); }
    catch (err) { setError(err.response?.data?.message || 'Could not verify the payment'); } finally { setBusyPayment(''); }
  };
  // Brings a paused phase back: the admin restores a removed one, In Transit resumes one on hold.
  const resumePhase = async (how) => {
    setError('');
    try {
      if (how === 'restore') await api.post(`/transit/${po.patientId}/${po.phase}/restore`);
      else await api.patch(`/transit/${po.patientId}/${po.phase}`, { action: 'resume' });
      await load(); setNotice(how === 'restore' ? `Phase ${po.phase} is back in In Transit.` : `Phase ${po.phase} resumed.`);
    } catch (err) { setError(err.response?.data?.message || 'Could not bring the phase back'); }
  };
  const activatePhase = async () => {
    if (!window.confirm(`Make Phase ${po.phase} the current phase of ${po.patientName}?`)) return;
    try { const { data } = await api.post(`/purchase-orders/${po.id}/activate-phase`); done(data.purchaseOrder, `Phase ${po.phase} is now the current phase.`); }
    catch (err) { setError(err.response?.data?.message || 'Could not change the phase'); }
  };

  if (!po) return error ? <ErrorText>{error}</ErrorText> : <p className="p-6 text-center text-sm text-charcoal/55">Loading purchase order...</p>;
  const status = PO_STATUS[po.status] || PO_STATUS.pending;
  const med = po.medicine;
  let next = null;
  if (po.status === 'pending' && canVerify) next = <VerifyPanel po={po} onDone={done} />;
  else if (po.status === 'rejected' && canCreate) next = <EditRejectedForm po={po} onDone={done} />;
  else if (po.canRequestMedicine && canVerify) next = <MedicineRequestForm po={po} onDone={done} />;
  const waiting = !next && !med && po.step.state !== 'done' && (
    <div className="flex gap-3"><Clock3 size={20} className="mt-0.5 shrink-0 text-sage" /><div><h3 className="text-base font-bold text-charcoal">{po.step.label}</h3><p className="text-sm text-charcoal/65">{po.step.waitText || po.requestBlockedReason || 'Waiting for the next team.'}</p></div></div>
  );
  const showHandover = TRANSIT_ROLES.includes(role) && med && med.status !== 'cancelled' && po.isPhaseCurrentRequest;
  const myTurn = (po.actionBy || []).includes(role);
  // Timeline as a filter: the chosen step (default: the step the PO is on now) decides what the right side shows.
  const currentKey = po.steps.find((s) => s.state === 'current' || s.state === 'failed')?.key || 'all';
  const selected = picked && (picked === 'all' || po.steps.some((s) => s.key === picked)) ? picked : currentKey;
  const selectedStep = po.steps.find((s) => s.key === selected);
  const show = (part) => selected === 'all' || (STEP_SECTIONS[selected] || []).includes(part);
  // The step the action box (verify / edit / request form, or "waiting for") belongs to.
  const actionKey = next ? (po.status === 'pending' ? (po.detailsVerified ? 'payment' : 'details') : po.status === 'rejected' ? 'details' : 'requested') : po.step.key;
  // "Waiting for ..." is already said by the step header, so it shows on its own only under "All details".
  const showAction = next ? selected === 'all' || selected === actionKey : waiting && selected === 'all';
  const canRevert = role === ROLES.ADMIN && !['rejected', 'cancelled'].includes(po.status);

  return (
    <div className="po-compact space-y-3">
      <header className="flex flex-wrap items-center gap-3 rounded-[14px] border border-[#E8DFCB] bg-white px-4 py-3.5 sm:px-[18px]">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#E9EFE9] font-display text-[11px] font-extrabold text-sage" aria-hidden="true">PO</span>
        <div className="min-w-0 flex-1 basis-[calc(100%-56px)] sm:basis-auto">
          <div className="flex flex-wrap items-center gap-2"><h1 className="font-mono text-[17px] font-bold text-charcoal">{po.poNumber}</h1><Badge tone={status.tone}>{po.status === 'pending' && po.detailsVerified ? 'Details verified - payment pending' : status.label}</Badge>{po.supplyLabel && <Badge tone="teal">{po.supplyLabel}</Badge>}{po.ageBand && <Badge tone="amber">{ageBandLabel(po.ageBand)}</Badge>}</div>
          <p className="mt-0.5 text-[12.5px] text-charcoal/65"><b className="text-charcoal">{po.patientName}</b> · {po.patientCode} · Phase {po.phase}{po.currentStage === po.phase ? ' (current)' : ` · current is Phase ${po.currentStage}`} · <b className="text-charcoal">{money(po.amount)}</b>{po.guardianName ? ` · ${po.guardianName}` : ''}</p>
        </div>
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
          {myTurn && <button type="button" onClick={() => setPicked(null)} title="Show this step" className="inline-flex items-center gap-1.5 rounded-full border border-[#FDBA74] bg-[#FFF1E6] px-3 py-1.5 text-[11.5px] font-bold text-[#C2410C] hover:border-[#F97316]"><span className="h-2 w-2 rounded-full bg-[#F97316]" aria-hidden="true" />Your action · {po.step.label}</button>}
          {po.patientPhone && <a href={`tel:${po.patientPhone}`}><Button size="sm" variant="outline"><Phone size={14} />{po.patientPhone}</Button></a>}
          {showPatientLink && <Link to={`/admin/patients/${po.patientId}`}><Button size="sm" variant="outline"><ExternalLink size={14} />Patient</Button></Link>}
          {canVerify && po.status === 'verified' && po.currentStage !== po.phase && <Button size="sm" variant="outline" onClick={activatePhase}><Layers size={14} />Make Phase {po.phase} current</Button>}
        </div>
      </header>
      {(po.phaseHold || po.phaseRemoved) && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-orange-300 bg-orange-50 px-3 py-2 text-sm font-semibold text-orange-900">
          <span className="flex items-center gap-2"><AlertTriangle size={15} />{po.requestBlockedReason || `Phase ${po.phase} is ${po.phaseRemoved ? 'removed from In Transit' : 'on hold'}.`}</span>
          {po.phaseRemoved ? role === ROLES.ADMIN && <Button size="sm" onClick={() => resumePhase('restore')}><RotateCcw size={14} />Restore to In Transit</Button>
            : TRANSIT_ROLES.includes(role) && <Button size="sm" onClick={() => resumePhase('resume')}><PlayCircle size={14} />Resume</Button>}
        </div>
      )}
      <ErrorText>{error}</ErrorText>
      {notice && <p className="flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800"><CheckCircle2 size={15} />{notice}</p>}

      <PoPipelineBoxes groups={po.groups} steps={po.steps} selected={selected} onSelect={setPicked} />

      <div className="grid items-start gap-3.5 xl:grid-cols-[minmax(0,360px)_minmax(0,1fr)]">
        <div className="hidden xl:sticky xl:top-3 xl:block xl:max-h-[calc(100vh-1.5rem)] xl:overflow-y-auto">
          <Section title="Timeline" icon={Clock3} action={<span className="text-[11.5px] font-medium text-charcoal/60">{po.steps.filter((s) => s.state === 'done').length} of {po.steps.length} done</span>}>
            <button type="button" aria-pressed={selected === 'all'} onClick={() => setPicked('all')} className={`mb-3 flex w-full items-center justify-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold ${selected === 'all' ? 'border-sage bg-sage text-white' : 'border-cardline bg-white text-sage hover:border-sage/60'}`}><Layers size={13} />All details</button>
            <PoTimeline steps={po.steps} selected={selected} onSelect={setPicked} onRevert={canRevert ? setRevert : undefined} />
          </Section>
        </div>
        <div className="min-w-0 space-y-3.5">
          <div className="xl:hidden"><PoStepStrip steps={po.steps} selected={selected} onSelect={setPicked} /></div>
          {selectedStep ? <StepHeader step={selectedStep} total={po.steps.length} onAll={() => setPicked('all')} onRevert={canRevert ? setRevert : undefined} po={po} /> : <p className="rounded-lg bg-[#FBF7ED] px-3 py-2 text-xs text-charcoal/70">Showing every detail of this PO. Click a step in the timeline to see only that step.</p>}
          {showAction && <div className={`rounded-[14px] p-4 sm:p-[18px] ${myTurn ? 'border-2 border-[#FDBA74] bg-gradient-to-b from-[#FFF7ED] to-white' : 'border border-[#E8DFCB] bg-gradient-to-b from-[#F3F6F2] to-white'}`}>{next || waiting}</div>}
          {show('handover') && showHandover && <HandoverPanel po={po} onChanged={load} />}
          {show('patient') && <Section title="Patient" icon={UserRound}>
            <Row label="Name" value={po.patientName} />
            <Row label="Patient ID" value={po.patientCode} />
            <Row label="Age" value={po.patientAge} />
            <Row label="Father / mother / relative" value={po.guardianName} />
            <Row label="Phone" value={po.patientPhone} />
            <Row label="Other number" value={po.alternateNumber} />
            <Row label="Address" value={po.address} />
            <Row label="Patient approval" value={po.approvalStatus === 'approved' ? 'Approved' : 'Pending'} />
          </Section>}
          {show('po') && <Section title="Purchase order" icon={FileText} action={[ROLES.ADMIN, ROLES.POST_COUNSELOR].includes(role) && po.status !== 'cancelled' && (!po.medicine || ['requested', 'cancelled'].includes(po.medicine.status)) && <button type="button" className={smallLink} onClick={() => setPlanOpen(true)}><Pencil size={13} />Change plan</button>}>
            <div className="grid gap-x-6 sm:grid-cols-2">
              <Row label="PO number" value={po.poNumber} />
              <Row label="Phase" value={`Phase ${po.phase}`} />
              <Row label="Medicine supply" value={po.supplyLabel || 'Not selected yet'} />
              <Row label="Age group" value={ageBandLabel(po.ageBand)} />
              <Row label="PO value" value={money(po.amount)} />
              <Row label="Ready expected" value={po.medicineReadyDate ? <span className="inline-flex flex-wrap items-center gap-1.5">{day(po.medicineReadyDate)}{po.fixedPlan?.readyDate && <span className="text-[11px] text-charcoal/55">(fixed by post counselling)</span>}</span> : ''} />
              {po.delay && <Row label="Delay" value={<DelayChips delay={po.delay} />} />}
              <Row label="Created" value={`${poDateTime(po.createdAt)}${po.createdByName ? ` by ${po.createdByName}` : ''}`} />
              <Row label="Details verified" value={po.detailsVerifiedAt ? `${poDateTime(po.detailsVerifiedAt)} by ${po.detailsVerifiedByName}` : ''} />
              <Row label="Payment verified" value={po.paymentVerifiedAt ? `${poDateTime(po.paymentVerifiedAt)} by ${po.paymentVerifiedByName}` : ''} />
            </div>
            <CompactAttachments files={po.paperImages} label="PO paper" className="mt-2" />
            <div className="mt-4 border-t border-cardline pt-3"><p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-charcoal/45">PO paper as filled</p><PaperDetails po={po} /></div>
          </Section>}
          {show('payments') && <Section title="Payments on this PO" icon={IndianRupee} action={canCreate && !['rejected', 'cancelled'].includes(po.status) && <button type="button" className={smallLink} onClick={() => setPayOpen(true)}><Plus size={13} />Add payment</button>}>
            <div className="mb-3 grid grid-cols-3 gap-2">
              <div className="rounded-[10px] bg-[#F6F0E3] px-3 py-2.5"><p className="text-[11px] text-charcoal/60">Phase {po.phase} total</p><p className="font-display text-[14px] font-extrabold sm:text-[16px] text-charcoal">{money(po.phasePayment.totalAmount)}</p></div>
              <div className="rounded-[10px] bg-[#E6F2EA] px-3 py-2.5"><p className="text-[11px] text-[#1F6B41]">Paid</p><p className="font-display text-[14px] font-extrabold sm:text-[16px] text-[#1F6B41]">{money(po.phasePayment.amountPaid)}</p></div>
              <div className={`rounded-[10px] px-3 py-2.5 ${Number(po.phasePayment.remaining) > 0 ? 'bg-[#FFF1E6]' : 'bg-[#F3EEE2]'}`}><p className={`text-[11px] ${Number(po.phasePayment.remaining) > 0 ? 'text-[#C2410C]' : 'text-charcoal/60'}`}>Balance</p><p className={`font-display text-[14px] font-extrabold sm:text-[16px] ${Number(po.phasePayment.remaining) > 0 ? 'text-[#C2410C]' : 'text-charcoal'}`}>{money(po.phasePayment.remaining)}</p></div>
            </div>
            <p className="mb-2 rounded-lg bg-[#FBF7ED] px-3 py-2 text-xs text-charcoal/70">These payments are saved in the patient's <b>Phase {po.phase}</b> payments, next to any earlier payments of that phase.</p>
            <Row label="Verified on this PO" value={money(po.linkedPayment.verifiedAmount)} />
            <Row label="Pending verification" value={po.linkedPayment.pendingCount ? `${money(po.linkedPayment.pendingAmount)} (${po.linkedPayment.pendingCount})` : ''} />
            <Row label={`Phase ${po.phase} total / paid / balance`} value={`${money(po.phasePayment.totalAmount)} / ${money(po.phasePayment.amountPaid)} / ${money(po.phasePayment.remaining)}`} />
            {po.payments.length ? (
              <ul className="mt-3 divide-y divide-cardline rounded-lg border border-cardline">
                {po.payments.map((p) => (
                  <li key={p.id} className="flex items-start justify-between gap-2 px-3 py-2 text-sm">
                    <div className="min-w-0">
                      <p className="font-semibold text-charcoal">{money(p.amount)} <span className="font-normal text-charcoal/55">{p.mode === 'cash' ? `Cash${p.receivedBy ? ` - ${p.receivedBy}` : ''}` : `Online${p.utr ? ` - UTR ${p.utr}` : ''}${p.transactionId ? ` · Txn ${p.transactionId}` : ''}`}</span></p>
                      <p className="text-xs text-charcoal/50">{day(p.date)}{p.bank ? ` · ${p.bank}` : ''}{p.recordedByName ? ` · by ${p.recordedByName}` : ''}{p.approvedByName ? ` · verified by ${p.approvedByName}` : ''}</p>
                      {p.notes && <p className="text-xs text-charcoal/55">{p.notes}</p>}
                      <CompactAttachments files={p.files} label="Payment proof" />
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${p.status === 'approved' ? 'bg-emerald-100 text-emerald-800' : p.status === 'pending' ? 'bg-amber-100 text-amber-900' : 'bg-gray-100 text-charcoal/50'}`}>{p.status === 'approved' ? 'Verified' : p.status === 'pending' ? 'Pending' : 'Cancelled'}</span>
                      {canVerify && p.status === 'pending' && po.status === 'pending' && <button type="button" className="rounded-md bg-sage px-2 py-1 text-xs font-semibold text-white hover:bg-sage/90 disabled:opacity-50" disabled={busyPayment === p.id} onClick={() => verifyPoHere(p)}>{busyPayment === p.id ? 'Verifying...' : 'Verify PO & payment'}</button>}
                      {canVerify && p.status === 'pending' && po.status === 'verified' && <button type="button" className="text-xs font-semibold text-sage hover:underline disabled:opacity-50" disabled={busyPayment === p.id} onClick={() => verifyPayment(p)}>{busyPayment === p.id ? 'Verifying...' : 'Verify'}</button>}
                    </div>
                  </li>
                ))}
              </ul>
            ) : <p className="mt-2 text-sm text-charcoal/50">No payment recorded on this PO.</p>}
          </Section>}

          {show('medicine') && <Section title="Medicine request" icon={Pill}>
            {med ? <>
              <span className={`mb-2 inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-bold ${['made', 'sent_to_courier'].includes(med.status) ? 'bg-emerald-100 text-emerald-800' : med.status === 'cancelled' ? 'bg-[#8C3B2E]/10 text-[#8C3B2E]' : 'bg-amber-100 text-amber-900'}`}>{MED_STATUS[med.status] || med.status}</span>
              <Row label="Category" value={med.caseCategory} />
              <Row label="Medicines" value={med.medicines} />
              <Row label="Ready by" value={med.readyByDate ? `${day(med.readyByDate)} · ${po.fixedPlan?.readyDate ? 'fixed by post counselling' : `filled by ${med.readyBySetByName || med.requestedByName || 'In Transit'}`}` : ''} />
              <Row label="Requested" value={[poDateTime(med.requestedAt), med.requestedByName && `by ${med.requestedByName}`].filter(Boolean).join(' ')} />
              <Row label="Notes" value={med.notes} />
              <Row label="Cancelled" value={med.cancelReason} />
              <PatientFile documents={po.patientDocuments || []} className="mt-2" />
              {/* Prescriptions uploaded with older requests stay visible. */}
              <CompactAttachments files={med.prescriptionFiles} label="Prescription (older request)" />
              <CompactAttachments files={med.medicineImages} label="Medicine photos" />
            </> : <p className="text-sm text-charcoal/60">{po.canRequestMedicine ? 'Not requested yet - use the form above.' : po.requestBlockedReason || 'Not requested yet.'}</p>}
          </Section>}

          {show('job') && po.medicineJob && (
            <Section title="Medicine Department progress" icon={Pill} action={<span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${po.medicineJob.hold ? 'bg-[#8C3B2E]/10 text-[#8C3B2E]' : po.medicineJob.status === 'released' ? 'bg-emerald-100 text-emerald-800' : 'bg-sage/10 text-sage'}`}>{po.medicineJob.hold ? `On hold: ${po.medicineJob.hold.reason}` : po.medicineJob.currentLabel}</span>}>
              <div className="mb-1 grid gap-1" style={{ gridTemplateColumns: `repeat(${po.medicineJob.stages.length || 12}, minmax(0, 1fr))` }} aria-hidden="true">{po.medicineJob.stages.map((s) => <span key={s.key} className={`h-1.5 rounded-full ${s.state === 'done' ? 'bg-[#2F8F5B]' : s.state === 'current' ? 'bg-[#F97316]' : 'bg-[#EFE3CF]'}`} />)}</div>
              <p className="mb-3 text-[11.5px] text-charcoal/60">{po.medicineJob.stages.filter((s) => s.state === 'done').length} of {po.medicineJob.stages.length} stages done · {po.medicineJob.progress}%</p>
              <ol className="grid gap-x-4 gap-y-1 sm:grid-cols-2">
                {po.medicineJob.stages.map((s) => (
                  <li key={s.key} className="flex items-start gap-2 text-sm">
                    <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10px] font-bold ${s.state === 'done' ? 'border-[#2F8F5B] bg-[#2F8F5B] text-white' : s.state === 'current' ? 'border-[#F97316] bg-[#F97316] text-white' : 'border-[#DED2BD] text-charcoal/45'}`}>{s.state === 'done' ? <Check size={11} /> : s.n}</span>
                    <span className="min-w-0"><span className={s.state === 'todo' ? 'text-charcoal/45' : 'font-semibold text-charcoal'}>{s.label}</span>{s.state === 'done' && <span className="block text-xs text-charcoal/50">{s.doneByName} · {poDateTime(s.doneAt)}</span>}{s.state === 'current' && <span className="block text-xs font-bold text-[#C2410C]">In progress</span>}</span>
                  </li>
                ))}
              </ol>
              {TRANSIT_ROLES.includes(role) || [ROLES.DOCTOR].includes(role) ? <Link to={`/admin/medicine-jobs/${po.medicineJob.id}`} className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-sage hover:underline"><ExternalLink size={13} />Open the job</Link> : null}
            </Section>
          )}
          {selected === 'all' && po.events?.length > 0 && (
            <Section title="Activity" icon={Clock3}>
              <ol className="space-y-2">{po.events.map((e, i) => <li key={i} className="flex gap-3 text-sm"><span className="w-28 shrink-0 text-xs text-charcoal/45">{poDateTime(e.at)}</span><span className="min-w-0"><b className="font-semibold text-charcoal">{e.action}</b>{e.details ? <span className="text-charcoal/70"> - {e.details}</span> : ''} <span className="text-xs text-charcoal/45">· {e.byName}</span></span></li>)}</ol>
            </Section>
          )}
        </div>
      </div>
      {planOpen && <PlanEditModal po={po} onClose={() => setPlanOpen(false)} onDone={done} />}
      {payOpen && <AddPaymentModal po={po} open={payOpen} onClose={() => setPayOpen(false)} onDone={done} />}
      <Modal open={Boolean(revert)} onClose={() => !reverting && setRevert(null)} title={revert ? `Revert "${revert.label}"` : ''} className="max-w-lg">
        {revert && (() => {
          const undone = po.steps.filter((s) => s.state === 'done' && s.n >= revert.n);
          return (
            <div className="space-y-3">
              <p className="text-sm text-charcoal/75">Steps are in order, so this step and every step done after it go back. What was recorded is kept with the PO (nothing is lost); stock drawn for preparation returns to Stocks; verified payments go back to pending.</p>
              <ul className="rounded-lg border border-[#8C3B2E]/30 bg-[#8C3B2E]/5 px-3 py-2 text-sm">{[...undone].reverse().map((s) => <li key={s.key} className="flex gap-2"><RotateCcw size={13} className="mt-1 shrink-0 text-[#8C3B2E]" /><span><b>{s.label}</b>{s.by ? <span className="text-charcoal/55"> · {s.by}</span> : ''}</span></li>)}</ul>
              <FieldLabel label="Why is this reverted?" required><input className={poInput} value={revertReason} onChange={(e) => setRevertReason(e.target.value)} placeholder="e.g. Marked ready on the wrong patient" /></FieldLabel>
              <div className="flex gap-2"><Button disabled={reverting || !revertReason.trim()} onClick={runRevert}><RotateCcw size={14} />{reverting ? 'Reverting...' : `Revert ${undone.length} step${undone.length === 1 ? '' : 's'}`}</Button><Button variant="outline" disabled={reverting} onClick={() => setRevert(null)}>Cancel</Button></div>
            </div>
          );
        })()}
      </Modal>
    </div>
  );
}

export default function PurchaseOrderDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  return (
    <div className="space-y-4">
      <button type="button" onClick={() => (window.history.state?.idx > 0 ? navigate(-1) : navigate('/admin/purchase-orders'))} className="inline-flex items-center gap-1.5 text-sm font-medium text-sage hover:text-charcoal"><ArrowLeft size={15} /> Back</button>
      <PurchaseOrderView poId={id} />
    </div>
  );
}
