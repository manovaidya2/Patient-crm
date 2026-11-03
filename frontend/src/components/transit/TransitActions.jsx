import { useEffect, useState } from 'react';
import { Bike, Check, Stethoscope, Store, Truck } from 'lucide-react';
import api from '../../api/axios.js';
import SplitRows, { emptySplitRows, splitTotal, splitsPayload, splitHasOnline } from '../payments/SplitRows.jsx';
import ProofPicker from '../ui/ProofPicker.jsx';
import PccCalendar, { pccSlotProblem } from './PccCalendar.jsx';
import UtrRows, { emptyUtrRow, isMultiUtr, utrTotal, utrEntriesPayload } from '../payments/UtrRows.jsx';
import Button from '../ui/Button.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { isAdminLike } from '../../constants/roles.js';
import { FixedNote } from '../medicine/MedicineDelay.jsx';

// The In Transit handover / treatment-start actions (calls, delivery mode, pickup or dispatch, receipt, explanation).
// They write to the phase's transit record through /api/transit; the PO details page shows them for its medicine.
export const inputClass = 'w-full min-w-0 rounded-lg border border-cardline bg-white px-3 py-2 text-sm text-charcoal outline-none focus:border-sage focus:ring-2 focus:ring-sage/15';
export const MODE = { pickup: { label: 'Self pickup', icon: Store }, porter: { label: 'Porter', icon: Bike }, courier: { label: 'Courier', icon: Truck } };
export const CALL = { connected: 'Connected', not_reachable: 'Not reachable', busy: 'Busy', call_back: 'Call back later', wrong_number: 'Wrong number' };
export const MED_STATUS = { requested: 'Waiting for medicine department', in_process: 'Being prepared', made: 'Made', sent_to_courier: 'Released to In Transit' };
const pad = (n) => String(n).padStart(2, '0');
const localInput = (value = new Date(), withTime = true) => {
  const d = new Date(value);
  const day = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  return withTime ? `${day}T${pad(d.getHours())}:${pad(d.getMinutes())}` : day;
};
// ---------- action forms ----------
// field: [key, label, type, required, options, showIf]
export const FORMS = {
  raise_request: { title: 'Raise medicine request', note: 'No prescription upload: the Medicine Department reads the patient\'s whole file from the Records Room.', button: 'Raise request', fields: [['readyByDate', 'Expected medicine ready date', 'date', true], ['notes', 'Notes', 'textarea']] },
  accept_request: { title: 'Accept request and set ready-by date', note: 'An automatic reminder goes to the In Transit and Medicine Department one day before this date.', button: 'Accept request', fields: [['readyByDate', 'Medicine will be ready by', 'date', true]] },
  set_ready_by: { title: 'Change ready-by date', note: 'The automatic reminder moves with the date.', button: 'Save date', fields: [['readyByDate', 'Medicine will be ready by', 'date', true]] },
  log_call: {
    title: 'Log a call with the patient', note: 'Tell the patient the medicine status and confirm how they want to receive it. Log every attempt.', button: 'Save call',
    fields: [['outcome', 'Call result', 'pills', true, Object.entries(CALL)], ['notes', 'What was discussed', 'textarea', true], ['nextCallAt', 'Call again at', 'datetime-local', true, null, (v) => v.outcome && !['connected', 'wrong_number'].includes(v.outcome)]],
  },
  confirm_mode: { title: 'Patient confirmed delivery mode', note: 'Porter / courier: full payment is confirmed before sending. Self pickup: schedule the visit next.', button: 'Confirm', fields: [['mode', 'How will the patient get the medicine?', 'pills', true, Object.entries(MODE).map(([k, v]) => [k, v.label])], ['note', 'Note', 'text']] },
  // Step 1 of the handover: the calls are logged above; once one connects, In Transit marks the step done.
  finish_calls: { title: 'Call for delivery schedule', note: 'The call with the patient has connected. Mark it done to move to "Schedule delivery".', button: 'Call done - go to next step', fields: [] },
  // Step 2: only the delivery schedule. Self pickup goes to the Self Pickup Schedule page, porter / courier to the
  // Porter / Courier Schedule page.
  schedule_delivery: {
    title: 'Schedule delivery', note: 'Only the estimated date fixed on the call: the day the patient comes for self pickup, or the day the medicine goes by porter / courier. Porter or courier, its name and the address are filled on that day at dispatch. The request goes to the Self Pickup Schedule or the Porter / Courier Schedule page.', button: 'Save schedule',
    fields: [
      ['deliveryType', 'How will the patient get the medicine?', 'pills', true, [['pickup', 'Self pickup'], ['shipped', 'Porter / Courier']]],
      ['visitAt', 'Estimated self pickup date', 'datetime-local', true, null, (v) => v.deliveryType === 'pickup'],
      ['dispatchAt', 'Estimated delivery date', 'datetime-local', true, null, (v) => v.deliveryType === 'shipped'],
      ['note', 'Note', 'text'],
    ],
  },
  add_payment: {
    title: 'Record a payment', note: 'Saved in Patient Details as pending. In Transit verifies it before it counts toward the balance.', button: 'Save payment', files: { label: 'Payment proof (optional)' },
    fields: [['amount', 'Amount (Rs)', 'number', true, null, (v) => v.paymentMode !== 'split'], ['paymentMode', 'Mode', 'pills', true, [['online', 'Online'], ['cash', 'Cash'], ['split', 'Split']]], ['splitRows', 'Parts', 'splits', true, null, (v) => v.paymentMode === 'split'], ['utrRows', 'UTR / reference', 'utrs', true, null, (v) => v.paymentMode === 'online'], ['receivedBy', 'Cash received by', 'text', true, null, (v) => v.paymentMode === 'cash'], ['date', 'Payment date', 'date', true], ['notes', 'Note', 'text']],
  },
  schedule_visit: { title: 'Schedule the patient visit', note: 'When the patient will come to the clinic to collect the medicine.', button: 'Schedule visit', fields: [['visitAt', 'Visit date & time', 'datetime-local', true], ['note', 'Note', 'text']] },
  schedule_dispatch: { title: 'Schedule dispatch', button: 'Save schedule', fields: [['dispatchAt', 'Dispatch date & time', 'datetime-local', true], ['courierPartner', 'Courier / porter', 'text', true], ['address', 'Delivery address', 'textarea', true], ['note', 'Note', 'text']] },
  dispatch_porter: { title: 'Send by porter', button: 'Mark sent', files: { label: 'Package photo (optional)' }, fields: [['porterName', 'Porter name', 'text', true], ['porterPhone', 'Porter phone', 'text'], ['trackingNumber', 'Booking / order ID', 'text'], ['receiverName', 'Deliver to', 'text', true], ['receiverPhone', 'Receiver phone', 'text', true], ['address', 'Address', 'textarea', true], ['notes', 'Note', 'text']] },
  // Scheduled as "porter / courier": which one is picked here, on the day.
  dispatch_shipped: { title: 'Send the medicine', button: 'Mark sent', files: { label: 'Package photo (required for courier)' }, fields: [['sendBy', 'Send by', 'pills', true, [['porter', 'Porter'], ['courier', 'Courier']]], ['porterName', 'Porter name', 'text', true, null, (v) => v.sendBy === 'porter'], ['porterPhone', 'Porter phone', 'text', false, null, (v) => v.sendBy === 'porter'], ['courierPartner', 'Courier partner', 'text', true, null, (v) => v.sendBy === 'courier'], ['trackingNumber', 'Tracking number / booking ID', 'text', true, null, (v) => v.sendBy === 'courier'], ['receiverName', 'Deliver to', 'text', true], ['receiverPhone', 'Receiver phone', 'text', true], ['address', 'Address', 'textarea', true], ['notes', 'Note', 'text']] },
  dispatch_courier: { title: 'Send by courier', button: 'Mark sent', files: { label: 'Package photo', req: true }, fields: [['courierPartner', 'Courier partner', 'text', true], ['trackingNumber', 'Tracking number', 'text', true], ['receiverName', 'Deliver to', 'text', true], ['receiverPhone', 'Receiver phone', 'text', true], ['address', 'Address', 'textarea', true], ['notes', 'Note', 'text']] },
  confirm_received_shipped: { title: 'Medicine received by patient', button: 'Confirm received', files: { label: 'Delivery proof (optional)' }, fields: [['receivedByName', 'Received by', 'text', true], ['receivedAt', 'Received on', 'datetime-local', true], ['notes', 'Note', 'text']] },
  confirm_received_pickup: { title: 'Medicine collected at clinic', button: 'Confirm collected', files: { label: 'Photo / signature (optional)' }, fields: [['receivedByName', 'Collected by', 'text', true], ['receiverPhone', 'Phone', 'text'], ['receivedAt', 'Collected on', 'datetime-local', true], ['notes', 'Note', 'text']] },
};
export const formKeyFor = (action, item) => {
  if (action === 'dispatch') return item.mode === 'courier' ? 'dispatch_courier' : item.mode === 'porter' ? 'dispatch_porter' : 'dispatch_shipped';
  if (action === 'confirm_received') return item.mode === 'pickup' ? 'confirm_received_pickup' : 'confirm_received_shipped';
  return action;
};
const actionOf = (formKey) => (formKey.startsWith('dispatch') ? 'dispatch' : formKey.startsWith('confirm_received') ? 'confirm_received' : formKey);
const defaults = (formKey, item) => {
  switch (formKey) {
    case 'raise_request': return { readyByDate: item.expectedReadyDate ? localInput(item.expectedReadyDate, false) : '' };
    case 'schedule_dispatch': return { dispatchAt: item.deliveryPlan?.at ? localInput(item.deliveryPlan.at) : '', courierPartner: item.deliveryPlan?.courier || '', address: item.deliveryPlan?.address || item.patientDetails?.address || '' };
    case 'set_ready_by': return { readyByDate: item.medicine?.readyByDate ? localInput(item.medicine.readyByDate, false) : '' };
    case 'confirm_mode': return { mode: item.mode || '' };
    case 'schedule_delivery': return {
      deliveryType: item.mode === 'pickup' ? 'pickup' : item.mode ? 'shipped' : '',
      visitAt: item.visit?.at ? localInput(item.visit.at) : '', dispatchAt: item.deliveryPlan?.at ? localInput(item.deliveryPlan.at) : '',
    };
    case 'add_payment': return { amount: item.payment.remaining ? String(item.payment.remaining) : '', paymentMode: 'online', date: localInput(new Date(), false) };
    case 'schedule_visit': return { visitAt: item.visit.at ? localInput(item.visit.at) : '' };
    case 'dispatch_porter': case 'dispatch_courier': case 'dispatch_shipped': return { receiverName: item.guardianName || item.patientName, receiverPhone: item.patientPhone, address: item.deliveryPlan?.address || item.patientDetails?.address || '', courierPartner: item.deliveryPlan?.courier || '' };
    case 'confirm_received_shipped': case 'confirm_received_pickup': return { receivedAt: localInput(), receiverPhone: item.patientPhone };
    default: return {};
  }
};

export async function sendAction(item, action, values = {}, files = []) {
  const body = new FormData();
  body.append('action', action);
  Object.entries(values).forEach(([key, value]) => { if (value !== '' && value != null) body.append(key, value); });
  files.forEach((file) => body.append('files', file));
  const { data } = await api.patch(`/transit/${item.patientId}/${item.stage}`, body);
  return data.item;
}

function Field({ field, value, onChange, locked = false, staff = [] }) {
  const [key, label, type, req, options] = field;
  let control;
  // A staff member of one role (options = the role), e.g. the PCC.
  if (type === 'staff') control = <select className={inputClass} required={req} value={value || ''} onChange={(e) => onChange(key, e.target.value)}><option value="">Select</option>{staff.filter((s) => s.role === options).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>;
  else if (type === 'pills') {
    control = (
      <div className="flex flex-wrap gap-1.5">
        {options.map(([v, l]) => {
          const Icon = MODE[v]?.icon || (v === 'shipped' ? Truck : null);
          return <button key={v} type="button" onClick={() => onChange(key, v)} className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${value === v ? 'border-sage bg-sage text-white' : 'border-cardline bg-white text-charcoal/70 hover:border-sage'}`}>{Icon && <Icon size={14} />}{l}</button>;
        })}
      </div>
    );
  } else if (type === 'splits') {
    return <SplitRows idPrefix={key} rows={value || emptySplitRows()} onChange={(rows) => onChange(key, rows)} />;
  } else if (type === 'utrs') {
    return <UtrRows idPrefix={`${key}`} utrLabel={label} rows={value || [emptyUtrRow()]} onChange={(rows) => onChange(key, rows)} />;
  } else if (type === 'textarea') control = <textarea className={inputClass} rows={2} required={req} value={value || ''} onChange={(e) => onChange(key, e.target.value)} />;
  else control = <input className={inputClass} type={type} required={req} min={type === 'number' ? 0 : undefined} value={value || ''} onChange={(e) => onChange(key, e.target.value)} disabled={locked} />;
  return <label className="block space-y-1 text-sm font-medium text-charcoal"><span>{label}{req && <span className="text-red-700"> *</span>}</span>{control}{locked && <FixedNote />}</label>;
}

export function ActionForm({ formKey, item, onDone, onCancel, compact }) {
  const form = FORMS[formKey];
  const [values, setValues] = useState(() => defaults(formKey, item));
  const [files, setFiles] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const visible = form.fields.filter((f) => !f[5] || f[5](values));
  const [staff, setStaff] = useState([]);
  const needsStaff = form.fields.some((f) => f[2] === 'staff');
  useEffect(() => { if (needsStaff) api.get('/transit/staff', { skipCache: true }).then(({ data }) => setStaff(data.staff)).catch(() => setError('Could not load the staff list')); }, [needsStaff]);
  // The expected ready date was fixed in post counselling: In Transit sends it to the Medicine Department as it is.
  const { user } = useAuth();
  const dateLocked = formKey === 'raise_request' && Boolean(item.expectedReadyDate) && !isAdminLike(user);
  const submit = async (event) => {
    event.preventDefault();
    const missingPill = visible.find((f) => ['pills', 'staff'].includes(f[2]) && f[3] && !values[f[0]]);
    if (missingPill) { setError(`Select ${missingPill[1].toLowerCase()}`); return; }
    if ((form.files?.req || (formKey === 'add_payment' && (values.paymentMode === 'online' || (values.paymentMode === 'split' && splitHasOnline(values.splitRows || emptySplitRows()))))) && !files.length) { setError('Upload the required document / payment proof'); return; }
    setSaving(true); setError('');
    try {
      const payload = {};
      visible.forEach(([key, , type]) => {
        if (type === 'splits') {
          // Paid in parts the same day: one payment of the total.
          const rows = values[key] || emptySplitRows();
          payload.splits = splitsPayload(rows);
          payload.amount = String(splitTotal(rows));
          return;
        }
        if (type === 'utrs') {
          // Several same-day UTRs: the first goes as utr / transactionId, all of them as utrEntries, the amount is their total.
          const rows = values[key] || [];
          const first = rows[0] || {};
          if (first.utr) payload.utr = first.utr;
          if (first.transactionId) payload.transactionId = first.transactionId;
          if (isMultiUtr(rows)) { payload.utrEntries = utrEntriesPayload(rows); payload.amount = String(utrTotal(rows)); payload.utr = rows.map((r) => r.utr).filter(Boolean).join(', ') || payload.utr; }
          return;
        }
        if (values[key] !== '' && values[key] != null) payload[key] = type === 'datetime-local' ? new Date(values[key]).toISOString() : values[key];
      });
      onDone(await sendAction(item, actionOf(formKey), payload, files));
    } catch (err) { setError(err.response?.data?.message || 'Could not save'); } finally { setSaving(false); }
  };
  return (
    <form onSubmit={submit} className="space-y-3">
      {!compact && <h3 className="text-base font-bold text-charcoal">{form.title}</h3>}
      {form.note && <p className="text-xs leading-5 text-charcoal/60">{form.note}</p>}
      {error && <p className="rounded-lg bg-[#8C3B2E]/8 px-3 py-2 text-sm text-[#8C3B2E]">{error}</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        {visible.map((field) => <div key={field[0]} className={['textarea', 'pills', 'utrs', 'splits'].includes(field[2]) ? 'sm:col-span-2' : ''}><Field field={field} staff={staff} locked={dateLocked && field[0] === 'readyByDate'} value={values[field[0]]} onChange={(k, v) => setValues((old) => ({ ...old, [k]: v, ...(k === 'utrRows' && isMultiUtr(v) ? { amount: String(utrTotal(v)) } : {}) }))} /></div>)}
      </div>
      {form.files && <ProofPicker label={form.files.label} required={form.files.req} files={files} setFiles={setFiles} />}
      <div className="flex flex-wrap gap-2 pt-1">
        <Button type="submit" disabled={saving}><Check size={15} />{saving ? 'Saving...' : form.button}</Button>
        {onCancel && <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>}
      </div>
    </form>
  );
}

// After handover: In Transit assigns the PCC (Patient Care Coordinator, role assistant_doctor) who explains the medicine. A doctor already on the
// patient record is pre-selected so they can be kept or changed; the explanation date fixed earlier can be adjusted.
export function AssignPccForm({ item, onDone }) {
  const [staff, setStaff] = useState([]);
  const existing = item.assignments.assistantDoctor;
  const [values, setValues] = useState({ explanationAt: item.explanation.at ? localInput(item.explanation.at) : '', explanationMode: item.explanation.mode || 'phone', assistantDoctorId: existing?.id || '', postCounselorId: item.assignments.postCounselor?.id || ''});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { api.get('/transit/staff', { skipCache: true }).then(({ data }) => setStaff(data.staff)).catch(() => setError('Could not load the staff list')); }, []);
  const set = (key, value) => setValues((old) => ({ ...old, [key]: value }));
  const select = (key, label, role, req) => (
    <label className="block space-y-1 text-sm font-medium text-charcoal"><span>{label}{req && <span className="text-red-700"> *</span>}</span>
      <select className={inputClass} required={req} value={values[key]} onChange={(e) => set(key, e.target.value)}><option value="">Select</option>{staff.filter((s) => s.role === role).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
    </label>
  );
  const slotProblem = pccSlotProblem(values.explanationAt);
  // A day picked on the calendar keeps the time already typed (11:00 when none; 2 pm at the earliest on afternoon days).
  const pickDay = (day, afternoon) => { const typed = (values.explanationAt || '').slice(11, 16) || '11:00'; set('explanationAt', `${day}T${afternoon && typed < '14:00' ? '14:00' : typed}`); };
  const submit = async (event) => {
    event.preventDefault();
    if (slotProblem) { setError(slotProblem); return; }
    setSaving(true); setError('');
    try { onDone(await sendAction(item, 'assign_pcc', { ...values, explanationAt: values.explanationAt ? new Date(values.explanationAt).toISOString() : '' })); }
    catch (err) { setError(err.response?.data?.message || 'Could not assign the PCC'); } finally { setSaving(false); }
  };
  return (
    <form onSubmit={submit} className="space-y-3">
      <h3 className="text-base font-bold text-charcoal">Medicine explanation date & PCC (Patient Care Coordinator)</h3>
      {existing && !item.pcc?.assigned && <p className="rounded-lg bg-sky-50 px-3 py-2 text-sm text-sky-900"><b>{existing.name}</b> is already the PCC on this patient's record. Keep them or pick another; saving confirms the PCC for Phase {item.stage}.</p>}
      {item.pcc?.assigned && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900">PCC for this phase: <b>{item.pcc.name || existing?.name}</b> (assigned by {item.pcc.byName}). Save to change.</p>}
      {error && <p className="rounded-lg bg-[#8C3B2E]/8 px-3 py-2 text-sm text-[#8C3B2E]">{error}</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        {select('assistantDoctorId', 'PCC (Patient Care Coordinator)', 'assistant_doctor', true)}
        <label className="block space-y-1 text-sm font-medium text-charcoal"><span>Medicine explanation date & time<span className="text-red-700"> *</span></span><input className={inputClass} type="datetime-local" required value={values.explanationAt} onChange={(e) => set('explanationAt', e.target.value)} />{slotProblem && <span className="block text-xs font-semibold text-[#8C3B2E]">{slotProblem}</span>}</label>
        <Field field={['explanationMode', 'Explanation mode', 'pills', true, [['phone', 'Phone'], ['video', 'Video'], ['clinic', 'Clinic']]]} value={values.explanationMode} onChange={set} />
        {select('postCounselorId', `Post counselor (Phase ${item.stage}, optional)`, 'post_counselor', false)}
      </div>
      <PccCalendar pccId={values.assistantDoctorId} value={values.explanationAt} onPick={pickDay} />
      <Button type="submit" disabled={saving || Boolean(slotProblem)}><Stethoscope size={15} />{saving ? 'Saving...' : item.pcc?.assigned ? 'Update explanation & PCC' : 'Schedule explanation & assign PCC'}</Button>
    </form>
  );
}
export const StartTreatmentForm = AssignPccForm;
