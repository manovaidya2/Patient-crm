import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  AlertTriangle, ArrowLeft, Check, CheckCircle2, ClipboardList, Clock3, ExternalLink, FileText, IndianRupee, Layers,
  PauseCircle, Phone, PhoneCall, Pill, PlayCircle, Plus, RotateCcw, Send, ShieldCheck, Stethoscope, Truck, UserRound, X,
} from 'lucide-react';
import api from '../../api/axios.js';
import Button from '../../components/ui/Button.jsx';
import Badge from '../../components/ui/Badge.jsx';
import Modal from '../../components/ui/Modal.jsx';
import { CompactAttachments } from '../../components/ui/Attachments.jsx';
import { PoPipelineBoxes, PoTimeline, poDateTime } from '../../components/purchaseOrders/PoPipeline.jsx';
import { Chip, FieldLabel, poInput } from '../../components/purchaseOrders/CreatePurchaseOrderModal.jsx';
import { ActionForm, CALL, FORMS, MODE, StartTreatmentForm, formKeyFor, sendAction } from '../../components/transit/TransitActions.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { ROLES } from '../../constants/roles.js';
import { AGE_BANDS, PO_STATUS, SUPPLY_OPTIONS, ageBandLabel, supplyKeyOf } from '../../constants/supplyPlans.js';

const money = (value) => `Rs ${Number(value || 0).toLocaleString('en-IN')}`;
const day = (value) => (value ? new Date(value).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '');
const inputDay = (value) => (value ? new Date(value).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }) : '');
const VERIFY_ROLES = [ROLES.ADMIN, ROLES.DOCTOR, ROLES.IN_TRANSIT];
const CREATE_ROLES = [ROLES.ADMIN, ROLES.DOCTOR, ROLES.POST_COUNSELOR, ROLES.IN_TRANSIT];
const TRANSIT_ROLES = [ROLES.ADMIN, ROLES.IN_TRANSIT];
const MED_STATUS = { requested: 'Waiting for Medicine Dept', in_process: 'Being prepared', made: 'Medicine ready', sent_to_courier: 'Released', cancelled: 'Cancelled' };
// Transit steps that belong to handover / treatment start (order and medicine steps live on the PO itself).
const HANDOVER_ACTIONS = ['confirm_mode', 'schedule_visit', 'schedule_dispatch', 'dispatch', 'confirm_received', 'start_treatment', 'log_call'];

const Section = ({ title, icon: Icon, action, children, className = '' }) => (
  <section className={`rounded-xl border border-cardline bg-white p-4 ${className}`}>
    <div className="mb-3 flex items-center justify-between gap-2"><h3 className="flex items-center gap-2 text-sm font-bold text-charcoal">{Icon && <Icon size={16} className="text-sage" />}{title}</h3>{action}</div>
    {children}
  </section>
);
const Row = ({ label, value }) => (value === '' || value == null ? null : <div className="flex justify-between gap-3 py-0.5 text-sm"><span className="text-charcoal/55">{label}</span><span className="min-w-0 break-words text-right font-medium text-charcoal">{value}</span></div>);
const ErrorText = ({ children }) => (children ? <p className="rounded-lg bg-[#8C3B2E]/8 px-3 py-2 text-sm text-[#8C3B2E]">{children}</p> : null);
const smallLink = 'inline-flex items-center gap-1 text-xs font-semibold text-sage hover:underline';

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
  const checksFor = step === 'details'
    ? [['paper', `PO paper checked (${po.paperImages.length ? `${po.paperImages.length} image(s)` : 'no image attached'}) and matches the form below`], ['patient', 'Patient name, ID and contact numbers are correct'], ['order', `Phase ${po.phase}, medicine supply (${po.supplyLabel || 'not selected'}) and PO value ${money(po.amount)} are correct`]]
    : [['proof', po.linkedPayment.count ? `Payment proof matched: ${money(po.linkedPayment.pendingAmount)} pending on this PO (UTR / screenshot / cash receiver)` : 'There is no payment on this PO - confirmed']];
  const [checks, setChecks] = useState({});
  const [rejecting, setRejecting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { setChecks({}); setRejecting(false); }, [step]);
  const run = async () => {
    setBusy(true); setError('');
    try {
      const { data } = await api.post(`/purchase-orders/${po.id}/verify-${step}`, {});
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
  const [values, setValues] = useState({
    supplyKey: supplyKeyOf(po.supplyPlan, po.supplyPart), ageBand: po.ageBand || po.suggestedAgeBand || '',
    medicines: '', readyByDate: inputDay(po.medicineReadyDate), notes: '',
  });
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (key, value) => setValues((v) => ({ ...v, [key]: value }));
  const submit = async (event) => {
    event.preventDefault();
    if (!values.supplyKey) { setError('Select the medicine supply'); return; }
    if (!values.ageBand) { setError('Select the age group'); return; }
    if (!files.length) { setError('Attach the prescription'); return; }
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
      <div><p className="mb-1 text-sm font-medium text-charcoal">Medicine supply<span className="text-red-700"> *</span></p><div className="flex flex-wrap gap-1.5">{SUPPLY_OPTIONS.map((o) => <Chip key={o.key} title={o.hint} active={values.supplyKey === o.key} onClick={() => set('supplyKey', o.key)}>{o.label}</Chip>)}</div></div>
      <div><p className="mb-1 text-sm font-medium text-charcoal">Age group<span className="text-red-700"> *</span> {po.patientAge && <span className="font-normal text-charcoal/50">(patient age {po.patientAge})</span>}</p><div className="flex flex-wrap gap-1.5">{AGE_BANDS.map((b) => <Chip key={b.value} active={values.ageBand === b.value} onClick={() => set('ageBand', b.value)}>{b.label}{b.value === po.suggestedAgeBand ? ' (by age)' : ''}</Chip>)}</div></div>
      <div className="grid gap-3 sm:grid-cols-2">
        <FieldLabel label="Medicines" required className="sm:col-span-2"><textarea className={poInput} rows={2} required value={values.medicines} onChange={(e) => set('medicines', e.target.value)} placeholder="Medicines as per the prescription" /></FieldLabel>
        <FieldLabel label="Medicine ready-by date" required><input className={poInput} type="date" required value={values.readyByDate} onChange={(e) => set('readyByDate', e.target.value)} /></FieldLabel>
        <FieldLabel label="Prescription (image / PDF)" required><input className={`${poInput} text-xs`} type="file" multiple accept="image/*,application/pdf" onChange={(e) => setFiles([...e.target.files])} /></FieldLabel>
        <FieldLabel label="Notes for Medicine Department" className="sm:col-span-2"><input className={poInput} value={values.notes} onChange={(e) => set('notes', e.target.value)} /></FieldLabel>
      </div>
      <Button type="submit" disabled={busy}><Send size={15} />{busy ? 'Sending...' : 'Send medicine request'}</Button>
    </form>
  );
}

function EditRejectedForm({ po, onDone }) {
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
      <div className="flex flex-wrap gap-1.5">{SUPPLY_OPTIONS.map((o) => <Chip key={o.key} active={values.supplyKey === o.key} onClick={() => setValues((v) => ({ ...v, supplyKey: o.key }))}>{o.label}</Chip>)}</div>
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
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (key, value) => setValues((v) => ({ ...v, [key]: value }));
  const submit = async (event) => {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const body = new FormData();
      Object.entries(values).forEach(([key, value]) => { if (value) body.append(key, value); });
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
          <FieldLabel label="Amount (Rs)" required><input className={poInput} required inputMode="decimal" value={values.paymentAmount} onChange={(e) => set('paymentAmount', e.target.value)} /></FieldLabel>
          <div><p className="mb-1 text-sm font-medium text-charcoal">Mode</p><div className="flex gap-1.5"><Chip active={values.paymentMode === 'online'} onClick={() => set('paymentMode', 'online')}>Online</Chip><Chip active={values.paymentMode === 'cash'} onClick={() => set('paymentMode', 'cash')}>Cash</Chip></div></div>
          <FieldLabel label="Payment date"><input className={poInput} type="date" value={values.paymentDate} onChange={(e) => set('paymentDate', e.target.value)} /></FieldLabel>
          {values.paymentMode === 'online'
            ? <FieldLabel label="UTR / reference" required><input className={poInput} required value={values.utr} onChange={(e) => set('utr', e.target.value)} /></FieldLabel>
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
          {section.files.map((f) => <CompactAttachments key={f.label} files={f.files} label={f.label} className="mt-1.5" />)}
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
            {next === 'start_treatment' ? <StartTreatmentForm item={item} onDone={done} /> : <ActionForm key={`${item.key}-${next}`} formKey={formKeyFor(next, item)} item={item} onDone={done} />}
          </div>
        ) : open && <p className="text-sm text-charcoal/65">{['contact', 'handover', 'treatment'].includes(item.group)
          ? <><b className="text-charcoal">{item.step.label}.</b> {item.step.waitText || ''}</>
          : <>The medicine is with Medicine Department. You can already call the patient and plan the delivery; dispatch / handover opens once it is released after full verified payment.</>}</p>}

        {open && <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => setQuick('log_call')}><PhoneCall size={14} />Log call</Button>
          {!shipped && <Button size="sm" variant="outline" onClick={() => setQuick('confirm_mode')}><Truck size={14} />Delivery mode</Button>}
          {item.mode && !shipped && <Button size="sm" variant="outline" onClick={() => setQuick(item.mode === 'pickup' ? 'schedule_visit' : 'schedule_dispatch')}><Clock3 size={14} />Schedule {item.mode === 'pickup' ? 'pickup' : 'dispatch'}</Button>}
          {shipped && !item.explanation.completedAt && <Button size="sm" variant="outline" onClick={() => setQuick('start_treatment')}><Stethoscope size={14} />Schedule explanation</Button>}
        </div>}

        <div className="grid gap-x-6 sm:grid-cols-2">
          <Row label="Delivery mode" value={MODE[item.mode]?.label || 'Not confirmed'} />
          <Row label="Pickup visit" value={poDateTime(item.visit.at)} />
          <Row label="Planned dispatch" value={poDateTime(item.deliveryPlan?.at)} />
          <Row label="Planned carrier" value={item.deliveryPlan?.courier} />
          <Row label={item.mode === 'porter' ? 'Porter' : 'Courier'} value={shipped ? [courier.courierPartner, courier.trackingNumber].filter(Boolean).join(' / ') : ''} />
          <Row label="Received by" value={courier?.receivedByName ? `${courier.receivedByName}, ${poDateTime(courier.deliveredAt)}` : ''} />
          <Row label="Assistant doctor" value={item.assignments.assistantDoctor?.name} />
          <Row label="Explanation" value={item.explanation.at ? `${poDateTime(item.explanation.at)}${item.explanation.ackAt ? ' (seen)' : ''}` : ''} />
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
      <Modal open={Boolean(quick)} onClose={() => setQuick(null)} title={quick ? (quick === 'start_treatment' ? 'Assign doctor and schedule explanation' : FORMS[formKeyFor(quick, item)]?.title) : ''} className="max-w-lg">
        {quick === 'start_treatment' ? <StartTreatmentForm item={item} onDone={done} /> : quick && <ActionForm compact formKey={formKeyFor(quick, item)} item={item} onDone={done} onCancel={() => setQuick(null)} />}
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
  const [busyPayment, setBusyPayment] = useState('');

  const load = useCallback(async () => {
    try { const { data } = await api.get(`/purchase-orders/${poId}`, { skipCache: true }); setPo(data.purchaseOrder); setError(''); }
    catch (err) { setError(err.response?.data?.message || 'Could not load the purchase order'); }
  }, [poId]);
  useEffect(() => { setPo(null); load(); }, [load]);
  useEffect(() => { const timer = setInterval(load, 30000); window.addEventListener('focus', load); return () => { clearInterval(timer); window.removeEventListener('focus', load); }; }, [load]);
  useEffect(() => { if (!notice) return undefined; const t = setTimeout(() => setNotice(''), 6000); return () => clearTimeout(t); }, [notice]);

  const done = (next, message) => { setPo(next); setNotice(message); setPayOpen(false); };
  const verifyPayment = async (payment) => {
    setBusyPayment(payment.id); setError('');
    try { await api.patch(`/patients/${po.patientId}/stages/${po.phase}/payments/${payment.id}/approve`); await load(); setNotice(`Payment of ${money(payment.amount)} verified in Phase ${po.phase} payments.`); }
    catch (err) { setError(err.response?.data?.message || 'Could not verify the payment'); } finally { setBusyPayment(''); }
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

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start gap-3">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-sage/15 text-sage"><ClipboardList size={22} /></span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2"><h1 className="font-mono text-xl font-bold text-charcoal sm:text-2xl">{po.poNumber}</h1><Badge tone={status.tone}>{po.status === 'pending' && po.detailsVerified ? 'Details verified - payment pending' : status.label}</Badge>{po.supplyLabel && <Badge tone="teal">{po.supplyLabel}</Badge>}{po.ageBand && <Badge tone="amber">{ageBandLabel(po.ageBand)}</Badge>}</div>
          <p className="mt-0.5 text-sm text-charcoal/65"><b className="text-charcoal">{po.patientName}</b> · {po.patientCode} · Phase {po.phase}{po.currentStage === po.phase ? ' (current)' : ` · current is Phase ${po.currentStage}`} · {money(po.amount)}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {po.patientPhone && <a href={`tel:${po.patientPhone}`}><Button size="sm" variant="outline"><Phone size={14} />{po.patientPhone}</Button></a>}
          {showPatientLink && <Link to={`/admin/patients/${po.patientId}`}><Button size="sm" variant="outline"><ExternalLink size={14} />Patient</Button></Link>}
          {canVerify && po.status === 'verified' && po.currentStage !== po.phase && <Button size="sm" variant="outline" onClick={activatePhase}><Layers size={14} />Make Phase {po.phase} current</Button>}
        </div>
      </div>
      {po.phaseHold && <p className="flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900"><AlertTriangle size={15} />Phase {po.phase} is on hold.</p>}
      <ErrorText>{error}</ErrorText>
      {notice && <p className="flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800"><CheckCircle2 size={15} />{notice}</p>}

      <PoPipelineBoxes groups={po.groups} steps={po.steps} />

      {(next || waiting) && <div className="rounded-xl border-2 border-sage/40 bg-gradient-to-br from-sage/5 to-white p-4">{next || waiting}</div>}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)]">
        <div className="space-y-4">
          <Section title="Timeline" icon={Clock3}><PoTimeline steps={po.steps} /></Section>
          <Section title="Patient" icon={UserRound}>
            <Row label="Name" value={po.patientName} />
            <Row label="Patient ID" value={po.patientCode} />
            <Row label="Age" value={po.patientAge} />
            <Row label="Father / mother / relative" value={po.guardianName} />
            <Row label="Phone" value={po.patientPhone} />
            <Row label="Other number" value={po.alternateNumber} />
            <Row label="Address" value={po.address} />
            <Row label="Patient approval" value={po.approvalStatus === 'approved' ? 'Approved' : 'Pending'} />
          </Section>
        </div>
        <div className="space-y-4">
          <Section title="Purchase order" icon={FileText}>
            <div className="grid gap-x-6 sm:grid-cols-2">
              <Row label="PO number" value={po.poNumber} />
              <Row label="Phase" value={`Phase ${po.phase}`} />
              <Row label="Medicine supply" value={po.supplyLabel || 'Not selected yet'} />
              <Row label="Age group" value={ageBandLabel(po.ageBand)} />
              <Row label="PO value" value={money(po.amount)} />
              <Row label="Ready expected" value={day(po.medicineReadyDate)} />
              <Row label="Created" value={`${poDateTime(po.createdAt)}${po.createdByName ? ` by ${po.createdByName}` : ''}`} />
              <Row label="Details verified" value={po.detailsVerifiedAt ? `${poDateTime(po.detailsVerifiedAt)} by ${po.detailsVerifiedByName}` : ''} />
              <Row label="Payment verified" value={po.paymentVerifiedAt ? `${poDateTime(po.paymentVerifiedAt)} by ${po.paymentVerifiedByName}` : ''} />
            </div>
            <CompactAttachments files={po.paperImages} label="PO paper" className="mt-2" />
            <div className="mt-4 border-t border-cardline pt-3"><p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-charcoal/45">PO paper as filled</p><PaperDetails po={po} /></div>
          </Section>

          <Section title="Payments on this PO" icon={IndianRupee} action={canCreate && !['rejected', 'cancelled'].includes(po.status) && <button type="button" className={smallLink} onClick={() => setPayOpen(true)}><Plus size={13} />Add payment</button>}>
            <p className="mb-2 rounded-lg bg-offwhite-200 px-3 py-2 text-xs text-charcoal/70">These payments are saved in the patient's <b>Phase {po.phase}</b> payments, next to any earlier payments of that phase.</p>
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
                      {canVerify && p.status === 'pending' && po.status === 'verified' && <button type="button" className="text-xs font-semibold text-sage hover:underline disabled:opacity-50" disabled={busyPayment === p.id} onClick={() => verifyPayment(p)}>{busyPayment === p.id ? 'Verifying...' : 'Verify'}</button>}
                    </div>
                  </li>
                ))}
              </ul>
            ) : <p className="mt-2 text-sm text-charcoal/50">No payment recorded on this PO.</p>}
          </Section>

          <Section title="Medicine request" icon={Pill}>
            {med ? <>
              <span className={`mb-2 inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-bold ${['made', 'sent_to_courier'].includes(med.status) ? 'bg-emerald-100 text-emerald-800' : med.status === 'cancelled' ? 'bg-[#8C3B2E]/10 text-[#8C3B2E]' : 'bg-amber-100 text-amber-900'}`}>{MED_STATUS[med.status] || med.status}</span>
              <Row label="Medicines" value={med.medicines} />
              <Row label="Ready by" value={day(med.readyByDate)} />
              <Row label="Requested" value={[poDateTime(med.requestedAt), med.requestedByName && `by ${med.requestedByName}`].filter(Boolean).join(' ')} />
              <Row label="Notes" value={med.notes} />
              <Row label="Cancelled" value={med.cancelReason} />
              <CompactAttachments files={med.prescriptionFiles} label="Prescription" />
              <CompactAttachments files={med.medicineImages} label="Medicine photos" />
            </> : <p className="text-sm text-charcoal/60">{po.canRequestMedicine ? 'Not requested yet - use the form above.' : po.requestBlockedReason || 'Not requested yet.'}</p>}
          </Section>

          {showHandover && <HandoverPanel po={po} onChanged={load} />}

          {po.events?.length > 0 && (
            <Section title="Activity" icon={Clock3}>
              <ol className="space-y-2">{po.events.map((e, i) => <li key={i} className="flex gap-3 text-sm"><span className="w-28 shrink-0 text-xs text-charcoal/45">{poDateTime(e.at)}</span><span className="min-w-0"><b className="font-semibold text-charcoal">{e.action}</b>{e.details ? <span className="text-charcoal/70"> - {e.details}</span> : ''} <span className="text-xs text-charcoal/45">· {e.byName}</span></span></li>)}</ol>
            </Section>
          )}
        </div>
      </div>
      {payOpen && <AddPaymentModal po={po} open={payOpen} onClose={() => setPayOpen(false)} onDone={done} />}
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
