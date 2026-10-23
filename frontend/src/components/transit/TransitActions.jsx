import { useEffect, useState } from 'react';
import { Bike, Check, Stethoscope, Store, Truck } from 'lucide-react';
import api from '../../api/axios.js';
import Button from '../ui/Button.jsx';

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
  raise_request: { title: 'Raise medicine request', button: 'Raise request', files: { label: 'Prescription (image / PDF)', req: true }, fields: [['medicines', 'Medicines', 'textarea', true], ['readyByDate', 'Expected medicine ready date', 'date', true], ['notes', 'Notes', 'textarea']] },
  accept_request: { title: 'Accept request and set ready-by date', note: 'An automatic reminder goes to the In Transit and Medicine Department one day before this date.', button: 'Accept request', fields: [['readyByDate', 'Medicine will be ready by', 'date', true]] },
  set_ready_by: { title: 'Change ready-by date', note: 'The automatic reminder moves with the date.', button: 'Save date', fields: [['readyByDate', 'Medicine will be ready by', 'date', true]] },
  log_call: {
    title: 'Log a call with the patient', note: 'Tell the patient the medicine status and confirm how they want to receive it. Log every attempt.', button: 'Save call',
    fields: [['outcome', 'Call result', 'pills', true, Object.entries(CALL)], ['notes', 'What was discussed', 'textarea', true], ['nextCallAt', 'Call again at', 'datetime-local', true, null, (v) => v.outcome && !['connected', 'wrong_number'].includes(v.outcome)]],
  },
  confirm_mode: { title: 'Patient confirmed delivery mode', note: 'Porter / courier: full payment is confirmed before sending. Self pickup: schedule the visit next.', button: 'Confirm', fields: [['mode', 'How will the patient get the medicine?', 'pills', true, Object.entries(MODE).map(([k, v]) => [k, v.label])], ['note', 'Note', 'text']] },
  // After the medicine is ready: delivery mode + its date + the medicine explanation date, fixed on the call.
  schedule_delivery: {
    title: 'Schedule delivery & medicine explanation', note: 'Fixed with the patient on the call (log the connected call first). Self pickup needs the pickup date; porter / courier the dispatch date and address. The medicine explanation date goes to the PCC once assigned.', button: 'Save schedule',
    fields: [
      ['mode', 'How will the patient get the medicine?', 'pills', true, Object.entries(MODE).map(([k, v]) => [k, v.label])],
      ['visitAt', 'Self pickup date & time', 'datetime-local', true, null, (v) => v.mode === 'pickup'],
      ['dispatchAt', 'Dispatch date & time', 'datetime-local', true, null, (v) => ['courier', 'porter'].includes(v.mode)],
      ['courierPartner', 'Courier / porter', 'text', true, null, (v) => ['courier', 'porter'].includes(v.mode)],
      ['address', 'Delivery address', 'textarea', true, null, (v) => ['courier', 'porter'].includes(v.mode)],
      ['explanationAt', 'Medicine explanation date & time', 'datetime-local', true],
      ['explanationMode', 'Explanation mode', 'pills', true, [['phone', 'Phone'], ['video', 'Video'], ['clinic', 'Clinic']]],
      ['note', 'Note', 'text'],
    ],
  },
  add_payment: {
    title: 'Record a payment', note: 'Saved in Patient Details as pending. In Transit verifies it before it counts toward the balance.', button: 'Save payment', files: { label: 'Payment proof (optional)' },
    fields: [['amount', 'Amount (Rs)', 'number', true], ['paymentMode', 'Mode', 'pills', true, [['online', 'Online'], ['cash', 'Cash']]], ['utr', 'UTR / reference', 'text', true, null, (v) => v.paymentMode === 'online'], ['receivedBy', 'Cash received by', 'text', true, null, (v) => v.paymentMode === 'cash'], ['date', 'Payment date', 'date', true], ['notes', 'Note', 'text']],
  },
  schedule_visit: { title: 'Schedule the patient visit', note: 'When the patient will come to the clinic to collect the medicine.', button: 'Schedule visit', fields: [['visitAt', 'Visit date & time', 'datetime-local', true], ['note', 'Note', 'text']] },
  schedule_dispatch: { title: 'Schedule dispatch', button: 'Save schedule', fields: [['dispatchAt', 'Dispatch date & time', 'datetime-local', true], ['courierPartner', 'Courier / porter', 'text', true], ['address', 'Delivery address', 'textarea', true], ['note', 'Note', 'text']] },
  dispatch_porter: { title: 'Send by porter', button: 'Mark sent', files: { label: 'Package photo (optional)' }, fields: [['porterName', 'Porter name', 'text', true], ['porterPhone', 'Porter phone', 'text'], ['trackingNumber', 'Booking / order ID', 'text'], ['receiverName', 'Deliver to', 'text', true], ['receiverPhone', 'Receiver phone', 'text', true], ['address', 'Address', 'textarea', true], ['notes', 'Note', 'text']] },
  dispatch_courier: { title: 'Send by courier', button: 'Mark sent', files: { label: 'Package photo', req: true }, fields: [['courierPartner', 'Courier partner', 'text', true], ['trackingNumber', 'Tracking number', 'text', true], ['receiverName', 'Deliver to', 'text', true], ['receiverPhone', 'Receiver phone', 'text', true], ['address', 'Address', 'textarea', true], ['notes', 'Note', 'text']] },
  confirm_received_shipped: { title: 'Medicine received by patient', button: 'Confirm received', files: { label: 'Delivery proof (optional)' }, fields: [['receivedByName', 'Received by', 'text', true], ['receivedAt', 'Received on', 'datetime-local', true], ['notes', 'Note', 'text']] },
  confirm_received_pickup: { title: 'Medicine collected at clinic', button: 'Confirm collected', files: { label: 'Photo / signature (optional)' }, fields: [['receivedByName', 'Collected by', 'text', true], ['receiverPhone', 'Phone', 'text'], ['receivedAt', 'Collected on', 'datetime-local', true], ['notes', 'Note', 'text']] },
};
export const formKeyFor = (action, item) => {
  if (action === 'dispatch') return item.mode === 'courier' ? 'dispatch_courier' : 'dispatch_porter';
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
      mode: item.mode || '', visitAt: item.visit?.at ? localInput(item.visit.at) : '', dispatchAt: item.deliveryPlan?.at ? localInput(item.deliveryPlan.at) : '',
      courierPartner: item.deliveryPlan?.courier || '', address: item.deliveryPlan?.address || item.patientDetails?.address || '',
      explanationAt: item.explanation?.at ? localInput(item.explanation.at) : '', explanationMode: item.explanation?.mode || 'phone',
    };
    case 'add_payment': return { amount: item.payment.remaining ? String(item.payment.remaining) : '', paymentMode: 'online', date: localInput(new Date(), false) };
    case 'schedule_visit': return { visitAt: item.visit.at ? localInput(item.visit.at) : '' };
    case 'dispatch_porter': case 'dispatch_courier': return { receiverName: item.guardianName || item.patientName, receiverPhone: item.patientPhone };
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

function Field({ field, value, onChange }) {
  const [key, label, type, req, options] = field;
  let control;
  if (type === 'pills') {
    control = (
      <div className="flex flex-wrap gap-1.5">
        {options.map(([v, l]) => {
          const Icon = MODE[v]?.icon;
          return <button key={v} type="button" onClick={() => onChange(key, v)} className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${value === v ? 'border-sage bg-sage text-white' : 'border-cardline bg-white text-charcoal/70 hover:border-sage'}`}>{Icon && <Icon size={14} />}{l}</button>;
        })}
      </div>
    );
  } else if (type === 'textarea') control = <textarea className={inputClass} rows={2} required={req} value={value || ''} onChange={(e) => onChange(key, e.target.value)} />;
  else control = <input className={inputClass} type={type} required={req} min={type === 'number' ? 0 : undefined} value={value || ''} onChange={(e) => onChange(key, e.target.value)} />;
  return <label className="block space-y-1 text-sm font-medium text-charcoal"><span>{label}{req && <span className="text-red-700"> *</span>}</span>{control}</label>;
}

export function ActionForm({ formKey, item, onDone, onCancel, compact }) {
  const form = FORMS[formKey];
  const [values, setValues] = useState(() => defaults(formKey, item));
  const [files, setFiles] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const visible = form.fields.filter((f) => !f[5] || f[5](values));
  const submit = async (event) => {
    event.preventDefault();
    const missingPill = visible.find((f) => f[2] === 'pills' && f[3] && !values[f[0]]);
    if (missingPill) { setError(`Select ${missingPill[1].toLowerCase()}`); return; }
    if ((form.files?.req || (formKey === 'add_payment' && values.paymentMode === 'online')) && !files.length) { setError('Upload the required document / payment proof'); return; }
    setSaving(true); setError('');
    try {
      const payload = {};
      visible.forEach(([key, , type]) => { if (values[key] !== '' && values[key] != null) payload[key] = type === 'datetime-local' ? new Date(values[key]).toISOString() : values[key]; });
      onDone(await sendAction(item, actionOf(formKey), payload, files));
    } catch (err) { setError(err.response?.data?.message || 'Could not save'); } finally { setSaving(false); }
  };
  return (
    <form onSubmit={submit} className="space-y-3">
      {!compact && <h3 className="text-base font-bold text-charcoal">{form.title}</h3>}
      {form.note && <p className="text-xs leading-5 text-charcoal/60">{form.note}</p>}
      {error && <p className="rounded-lg bg-[#8C3B2E]/8 px-3 py-2 text-sm text-[#8C3B2E]">{error}</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        {visible.map((field) => <div key={field[0]} className={['textarea', 'pills'].includes(field[2]) ? 'sm:col-span-2' : ''}><Field field={field} value={values[field[0]]} onChange={(k, v) => setValues((old) => ({ ...old, [k]: v }))} /></div>)}
      </div>
      {form.files && <label className="block space-y-1 text-sm font-medium text-charcoal"><span>{form.files.label}{form.files.req && <span className="text-red-700"> *</span>}</span><input className={`${inputClass} text-xs`} type="file" multiple accept="image/*,application/pdf" onChange={(e) => setFiles([...e.target.files])} /></label>}
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
  const submit = async (event) => {
    event.preventDefault(); setSaving(true); setError('');
    try { onDone(await sendAction(item, 'assign_pcc', { ...values, explanationAt: values.explanationAt ? new Date(values.explanationAt).toISOString() : '' })); }
    catch (err) { setError(err.response?.data?.message || 'Could not assign the PCC'); } finally { setSaving(false); }
  };
  return (
    <form onSubmit={submit} className="space-y-3">
      <h3 className="text-base font-bold text-charcoal">Assign PCC (Patient Care Coordinator) for the medicine explanation</h3>
      {existing && !item.pcc?.assigned && <p className="rounded-lg bg-sky-50 px-3 py-2 text-sm text-sky-900"><b>{existing.name}</b> is already the PCC on this patient's record. Keep them or pick another; saving confirms the PCC for Phase {item.stage}.</p>}
      {item.pcc?.assigned && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900">PCC for this phase: <b>{item.pcc.name || existing?.name}</b> (assigned by {item.pcc.byName}). Save to change.</p>}
      {error && <p className="rounded-lg bg-[#8C3B2E]/8 px-3 py-2 text-sm text-[#8C3B2E]">{error}</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        {select('assistantDoctorId', 'PCC (Patient Care Coordinator)', 'assistant_doctor', true)}
        <label className="block space-y-1 text-sm font-medium text-charcoal"><span>Medicine explanation date & time<span className="text-red-700"> *</span></span><input className={inputClass} type="datetime-local" required value={values.explanationAt} onChange={(e) => set('explanationAt', e.target.value)} /></label>
        <Field field={['explanationMode', 'Explanation mode', 'pills', true, [['phone', 'Phone'], ['video', 'Video'], ['clinic', 'Clinic']]]} value={values.explanationMode} onChange={set} />
        {select('postCounselorId', `Post counselor (Phase ${item.stage}, optional)`, 'post_counselor', false)}
      </div>
      <Button type="submit" disabled={saving}><Stethoscope size={15} />{saving ? 'Saving...' : item.pcc?.assigned ? 'Update PCC' : 'Assign PCC'}</Button>
    </form>
  );
}
export const StartTreatmentForm = AssignPccForm;
