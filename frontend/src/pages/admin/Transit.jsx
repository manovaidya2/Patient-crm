import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  AlarmClock, AlertTriangle, ArrowLeft, Bike, Check, CheckCircle2, Circle, ClipboardList, Clock3, ExternalLink, IndianRupee,
  PauseCircle, Phone, PhoneCall, Pill, PlayCircle, Plus, Search, Stethoscope, Store, Truck, Package, X,
  ArrowUpDown, ChevronDown, RotateCcw, Rows3, Trash2,
} from 'lucide-react';
import api from '../../api/axios.js';
import Button from '../../components/ui/Button.jsx';
import Modal from '../../components/ui/Modal.jsx';
import { CompactAttachments } from '../../components/ui/Attachments.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { ROLES } from '../../constants/roles.js';

const inputClass = 'w-full min-w-0 rounded-lg border border-cardline bg-white px-3 py-2 text-sm text-charcoal outline-none focus:border-sage focus:ring-2 focus:ring-sage/15';
const MODE = { pickup: { label: 'Self pickup', icon: Store }, porter: { label: 'Porter', icon: Bike }, courier: { label: 'Courier', icon: Truck } };
const CALL = { connected: 'Connected', not_reachable: 'Not reachable', busy: 'Busy', call_back: 'Call back later', wrong_number: 'Wrong number' };
const MED_STATUS = { requested: 'Waiting for medicine department', in_process: 'Being prepared', made: 'Made', sent_to_courier: 'Made and sent' };
const GROUP_ICON = { order: ClipboardList, medicine: Pill, contact: PhoneCall, handover: Package, treatment: Stethoscope };
const PIPELINE = [
  { key: 'attention', label: 'Needs attention', hint: 'Due, overdue or call-back', tone: 'danger' },
  { key: 'order', label: 'Order', hint: 'Payment verification' },
  { key: 'medicine', label: 'Medicine', hint: 'Request, ready date, reminder' },
  { key: 'contact', label: 'Patient contact', hint: 'Calls and delivery mode' },
  { key: 'handover', label: 'Handover', hint: 'Payment, dispatch, pickup' },
  { key: 'treatment', label: 'Treatment start', hint: 'Explanation and doctor' },
  { key: 'hold', label: 'On hold', hint: 'Exceptions' },
  { key: 'started', label: 'Started', hint: 'Treatment active' },
  { key: 'removed', label: 'Removed', hint: 'Taken out by admin', adminOnly: true },
];
const SORTS = [
  ['priority', 'Priority (urgent first)'],
  ['due', 'Due soonest'],
  ['newest', 'Newest first'],
  ['oldest', 'Oldest first'],
  ['name', 'Patient name A-Z'],
];
const GROUP_ORDER = [['attention', 'Needs attention'], ['order', 'Order'], ['medicine', 'Medicine'], ['contact', 'Patient contact'], ['handover', 'Handover'], ['treatment', 'Treatment start'], ['hold', 'On hold'], ['started', 'Treatment started'], ['removed', 'Removed']];
const sectionOf = (item) => (item.removed ? 'removed' : item.activated ? 'started' : item.onHold ? 'hold' : item.needsAttention ? 'attention' : item.group);
const sortItems = (items, sort) => {
  const list = [...items];
  const time = (v, fallback) => (v ? new Date(v).getTime() : fallback);
  if (sort === 'due') return list.sort((a, b) => time(a.dueAt, Infinity) - time(b.dueAt, Infinity));
  if (sort === 'newest') return list.sort((a, b) => time(b.enteredAt, 0) - time(a.enteredAt, 0));
  if (sort === 'oldest') return list.sort((a, b) => time(a.enteredAt, 0) - time(b.enteredAt, 0));
  if (sort === 'name') return list.sort((a, b) => a.patientName.localeCompare(b.patientName));
  return list; // server already sends priority order
};
const daysSince = (value) => (value ? Math.max(0, Math.floor((Date.now() - new Date(value)) / 86400000)) : null);

const money = (value) => `Rs ${Number(value || 0).toLocaleString('en-IN')}`;
const dateText = (value) => (value ? new Date(value).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '');
const dateTime = (value) => (value ? new Date(value).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '');
const pad = (n) => String(n).padStart(2, '0');
const localInput = (value = new Date(), withTime = true) => {
  const d = new Date(value);
  const day = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  return withTime ? `${day}T${pad(d.getHours())}:${pad(d.getMinutes())}` : day;
};
const initials = (name = '') => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();

// ---------- action forms ----------
// field: [key, label, type, required, options, showIf]
const FORMS = {
  raise_request: { title: 'Raise medicine request', button: 'Raise request', files: { label: 'Prescription (image / PDF)', req: true }, fields: [['medicines', 'Medicines', 'textarea', true], ['notes', 'Notes', 'textarea']] },
  accept_request: { title: 'Accept request and set ready-by date', note: 'An automatic reminder goes to the post counselor, reception and medicine department one day before this date.', button: 'Accept request', fields: [['readyByDate', 'Medicine will be ready by', 'date', true]] },
  set_ready_by: { title: 'Change ready-by date', note: 'The automatic reminder moves with the date.', button: 'Save date', fields: [['readyByDate', 'Medicine will be ready by', 'date', true]] },
  log_call: {
    title: 'Log a call with the patient', note: 'Tell the patient the medicine status and confirm how they want to receive it. Log every attempt.', button: 'Save call',
    fields: [['outcome', 'Call result', 'pills', true, Object.entries(CALL)], ['notes', 'What was discussed', 'textarea', true], ['nextCallAt', 'Call again at', 'datetime-local', true, null, (v) => v.outcome && !['connected', 'wrong_number'].includes(v.outcome)]],
  },
  confirm_mode: { title: 'Patient confirmed delivery mode', note: 'Porter / courier: full payment is confirmed before sending. Self pickup: schedule the visit next.', button: 'Confirm', fields: [['mode', 'How will the patient get the medicine?', 'pills', true, Object.entries(MODE).map(([k, v]) => [k, v.label])], ['note', 'Note', 'text']] },
  add_payment: {
    title: 'Record a payment', note: 'Saved in Patient Details as pending. Accounts verifies it, then this step completes.', button: 'Save payment', files: { label: 'Payment proof (optional)' },
    fields: [['amount', 'Amount (Rs)', 'number', true], ['paymentMode', 'Mode', 'pills', true, [['online', 'Online'], ['cash', 'Cash']]], ['utr', 'UTR / reference', 'text', true, null, (v) => v.paymentMode === 'online'], ['receivedBy', 'Cash received by', 'text', true, null, (v) => v.paymentMode === 'cash'], ['date', 'Payment date', 'date', true], ['notes', 'Note', 'text']],
  },
  schedule_visit: { title: 'Schedule the patient visit', note: 'When the patient will come to the clinic to collect the medicine.', button: 'Schedule visit', fields: [['visitAt', 'Visit date & time', 'datetime-local', true], ['note', 'Note', 'text']] },
  dispatch_porter: { title: 'Send by porter', button: 'Mark sent', files: { label: 'Package photo (optional)' }, fields: [['porterName', 'Porter name', 'text', true], ['porterPhone', 'Porter phone', 'text'], ['trackingNumber', 'Booking / order ID', 'text'], ['receiverName', 'Deliver to', 'text', true], ['receiverPhone', 'Receiver phone', 'text', true], ['address', 'Address', 'textarea', true], ['notes', 'Note', 'text']] },
  dispatch_courier: { title: 'Send by courier', button: 'Mark sent', files: { label: 'Package photo', req: true }, fields: [['courierPartner', 'Courier partner', 'text', true], ['trackingNumber', 'Tracking number', 'text', true], ['receiverName', 'Deliver to', 'text', true], ['receiverPhone', 'Receiver phone', 'text', true], ['address', 'Address', 'textarea', true], ['notes', 'Note', 'text']] },
  confirm_received_shipped: { title: 'Medicine received by patient', button: 'Confirm received', files: { label: 'Delivery proof (optional)' }, fields: [['receivedByName', 'Received by', 'text', true], ['receivedAt', 'Received on', 'datetime-local', true], ['notes', 'Note', 'text']] },
  confirm_received_pickup: { title: 'Medicine collected at clinic', button: 'Confirm collected', files: { label: 'Photo / signature (optional)' }, fields: [['receivedByName', 'Collected by', 'text', true], ['receiverPhone', 'Phone', 'text'], ['receivedAt', 'Collected on', 'datetime-local', true], ['notes', 'Note', 'text']] },
};
const formKeyFor = (action, item) => {
  if (action === 'dispatch') return item.mode === 'courier' ? 'dispatch_courier' : 'dispatch_porter';
  if (action === 'confirm_received') return item.mode === 'pickup' ? 'confirm_received_pickup' : 'confirm_received_shipped';
  return action;
};
const actionOf = (formKey) => (formKey.startsWith('dispatch') ? 'dispatch' : formKey.startsWith('confirm_received') ? 'confirm_received' : formKey);
const defaults = (formKey, item) => {
  switch (formKey) {
    case 'set_ready_by': return { readyByDate: item.medicine?.readyByDate ? localInput(item.medicine.readyByDate, false) : '' };
    case 'confirm_mode': return { mode: item.mode || '' };
    case 'add_payment': return { amount: item.payment.remaining ? String(item.payment.remaining) : '', paymentMode: 'online', date: localInput(new Date(), false) };
    case 'schedule_visit': return { visitAt: item.visit.at ? localInput(item.visit.at) : '' };
    case 'dispatch_porter': case 'dispatch_courier': return { receiverName: item.guardianName || item.patientName, receiverPhone: item.patientPhone };
    case 'confirm_received_shipped': case 'confirm_received_pickup': return { receivedAt: localInput(), receiverPhone: item.patientPhone };
    default: return {};
  }
};

async function sendAction(item, action, values = {}, files = []) {
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
  else control = <input className={inputClass} type={type} required={req} min={type === 'number' ? 1 : undefined} value={value || ''} onChange={(e) => onChange(key, e.target.value)} />;
  return <label className="block space-y-1 text-sm font-medium text-charcoal"><span>{label}{req && <span className="text-red-700"> *</span>}</span>{control}</label>;
}

function ActionForm({ formKey, item, onDone, onCancel, compact }) {
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
    if (form.files?.req && !files.length) { setError(`${form.files.label} is required`); return; }
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

function StartTreatmentForm({ item, onDone }) {
  const [staff, setStaff] = useState([]);
  const [values, setValues] = useState({ explanationAt: '', assistantDoctorId: item.assignments.assistantDoctor?.id || '', postCounselorId: item.assignments.postCounselor?.id || '', psychologistId: item.assignments.psychologist?.id || '' });
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
    try { onDone(await sendAction(item, 'start_treatment', { ...values, explanationAt: new Date(values.explanationAt).toISOString() })); }
    catch (err) { setError(err.response?.data?.message || 'Could not start treatment'); } finally { setSaving(false); }
  };
  return (
    <form onSubmit={submit} className="space-y-3">
      <h3 className="text-base font-bold text-charcoal">Schedule explanation and start treatment</h3>
      <p className="text-xs leading-5 text-charcoal/60">Medicine has reached the patient and payment is complete. The assigned post counselor is notified of the explanation time. Treatment starts from here.</p>
      {error && <p className="rounded-lg bg-[#8C3B2E]/8 px-3 py-2 text-sm text-[#8C3B2E]">{error}</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block space-y-1 text-sm font-medium text-charcoal sm:col-span-2"><span>Medicine explanation date & time<span className="text-red-700"> *</span></span><input className={inputClass} type="datetime-local" required value={values.explanationAt} onChange={(e) => set('explanationAt', e.target.value)} /></label>
        {select('assistantDoctorId', 'Assistant doctor', 'assistant_doctor', true)}
        {select('postCounselorId', `Post counselor (Phase ${item.stage})`, 'post_counselor', true)}
        {select('psychologistId', 'Psychologist (optional)', 'psychologist', false)}
      </div>
      <Button type="submit" disabled={saving}><Stethoscope size={15} />{saving ? 'Starting...' : 'Start treatment'}</Button>
    </form>
  );
}

// ---------- detail pieces ----------
function StageStepper({ groups }) {
  return (
    <ol className="flex items-start">
      {groups.map((g, i) => {
        const Icon = GROUP_ICON[g.key];
        const ring = g.state === 'done' ? 'border-emerald-600 bg-emerald-600 text-white' : g.state === 'current' ? 'border-sage bg-sage/10 text-sage ring-4 ring-sage/15' : 'border-cardline bg-white text-charcoal/35';
        return (
          <li key={g.key} className="relative flex flex-1 flex-col items-center text-center">
            {i > 0 && <span className={`absolute right-1/2 top-[18px] h-0.5 w-full ${g.state === 'todo' ? 'bg-cardline' : 'bg-emerald-600/70'}`} aria-hidden="true" />}
            <span className={`relative z-10 flex h-9 w-9 items-center justify-center rounded-full border-2 ${ring}`}>{g.state === 'done' ? <Check size={16} /> : <Icon size={16} />}</span>
            <span className={`mt-1.5 text-[11px] font-semibold leading-tight sm:text-xs ${g.state === 'todo' ? 'text-charcoal/45' : 'text-charcoal'}`}>{g.label}</span>
            <span className="text-[10px] text-charcoal/45">{g.doneCount}/{g.total}</span>
          </li>
        );
      })}
    </ol>
  );
}

function Checklist({ steps, groups }) {
  return (
    <div className="space-y-4">
      {groups.map((g) => (
        <div key={g.key}>
          <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-charcoal/45">{g.label}</p>
          <ol className="space-y-0.5">
            {steps.filter((s) => s.group === g.key).map((s) => {
              const Icon = s.state === 'done' ? CheckCircle2 : s.state === 'current' ? (s.auto ? AlarmClock : PlayCircle) : Circle;
              const tone = s.state === 'done' ? 'text-emerald-700' : s.state === 'current' ? 'text-sage' : 'text-charcoal/30';
              return (
                <li key={s.key} className={`flex gap-2.5 rounded-lg px-2 py-1.5 ${s.state === 'current' ? 'bg-sage/10' : ''}`}>
                  <Icon size={17} className={`mt-0.5 shrink-0 ${tone}`} />
                  <div className="min-w-0 text-sm">
                    <p className={s.state === 'todo' ? 'text-charcoal/50' : 'font-medium text-charcoal'}>{s.label}{s.auto && <span className="ml-1.5 rounded bg-offwhite-300/60 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-charcoal/60">Automatic</span>}</p>
                    {s.state !== 'todo' && (s.text || s.by || s.at) && <p className="text-xs text-charcoal/55">{[s.text, s.by && `by ${s.by}`, dateTime(s.at)].filter(Boolean).join(' - ')}</p>}
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
      ))}
    </div>
  );
}

const Card = ({ title, icon: Icon, action, children }) => (
  <section className="rounded-xl border border-cardline bg-white p-4">
    <div className="mb-3 flex items-center justify-between gap-2"><h4 className="flex items-center gap-2 text-sm font-bold text-charcoal">{Icon && <Icon size={16} className="text-sage" />}{title}</h4>{action}</div>
    {children}
  </section>
);
const Row = ({ label, value }) => (value === '' || value == null ? null : <div className="flex justify-between gap-3 py-0.5 text-sm"><span className="text-charcoal/55">{label}</span><span className="min-w-0 break-words text-right font-medium text-charcoal">{value}</span></div>);
const smallLink = 'inline-flex items-center gap-1 text-xs font-semibold text-sage hover:underline';

function NextActionPanel({ item, onDone, onQuick }) {
  if (item.removed) {
    return <div className="flex items-start gap-3 rounded-xl border border-cardline bg-offwhite-200 p-4 text-sm text-charcoal/80"><Trash2 size={20} className="mt-0.5 shrink-0" /><div><p className="font-bold text-charcoal">Removed from In Transit</p><p>by {item.removed.by} on {dateTime(item.removed.at)}{item.removed.reason ? ` - ${item.removed.reason}` : ''}. Patient data was not changed.</p></div></div>;
  }
  if (item.activated) {
    return <div className="flex items-center gap-3 rounded-xl border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-900"><CheckCircle2 size={22} /><div><p className="font-bold">Treatment started</p><p>Explanation on {dateTime(item.explanation.at)}{item.explanation.ackAt ? ` - seen by ${item.explanation.ackByName}` : ' - waiting for the post counselor to see it'}.</p></div></div>;
  }
  if (item.onHold) {
    return <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900"><div className="flex gap-2"><PauseCircle size={20} className="shrink-0" /><div><p className="font-bold">On hold - {item.hold?.reason}</p><p className="text-xs">by {item.hold?.by} on {dateTime(item.hold?.at)}</p></div></div><Button size="sm" onClick={() => sendAction(item, 'resume').then(onDone).catch(() => {})}><PlayCircle size={14} />Resume</Button></div>;
  }
  const action = item.nextAction;
  return (
    <div className="rounded-xl border-2 border-sage/40 bg-gradient-to-br from-sage/5 to-white p-4">
      <p className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-sage/10 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-sage">Step {item.step.n} of {item.totalSteps} - next</p>
      {action === 'start_treatment' ? <StartTreatmentForm key={`${item.key}-start`} item={item} onDone={onDone} />
        : action ? <ActionForm key={`${item.key}-${item.step.key}`} formKey={formKeyFor(action, item)} item={item} onDone={onDone} />
          : (
            <div className="space-y-3">
              <div className="flex gap-3"><Clock3 size={20} className="mt-0.5 shrink-0 text-sage" /><div><h3 className="text-base font-bold text-charcoal">{item.step.label}</h3><p className="text-sm text-charcoal/65">{item.step.waitText || 'Waiting.'}</p></div></div>
              {item.step.key === 'reminder' && <Button size="sm" variant="outline" onClick={() => onQuick('log_call')}><PhoneCall size={14} />Call the patient now</Button>}
              {item.step.key === 'verified' && <p className="text-xs text-charcoal/55">Accounts verifies payments in Patient Approvals / Payments.</p>}
              {item.step.key === 'payment' && <Button size="sm" variant="outline" onClick={() => onQuick('add_payment')}><Plus size={14} />Record another payment</Button>}
            </div>
          )}
    </div>
  );
}

function CaseDetail({ itemKey, initial, onChanged, onRemoved, onBack, canOpenPatient, isAdmin }) {
  const canVerify = isAdmin;
  const [item, setItem] = useState(initial);
  const [events, setEvents] = useState([]);
  const [quick, setQuick] = useState(null);
  const [holdOpen, setHoldOpen] = useState(false);
  const [holdReason, setHoldReason] = useState('');
  const [error, setError] = useState('');
  const [removeOpen, setRemoveOpen] = useState(false);
  const [removeReason, setRemoveReason] = useState('');
  const [removing, setRemoving] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const { data } = await api.get(`/transit/${initial.patientId}/${initial.stage}`, { skipCache: true });
      setItem(data.item); setEvents(data.events);
    } catch { /* the list copy is still shown */ }
  }, [initial.patientId, initial.stage]);
  useEffect(() => { setItem(initial); refresh(); }, [itemKey]); // eslint-disable-line react-hooks/exhaustive-deps
  // Accounts verifies payments on another page; keep this case fresh so it shows up without reloading.
  useEffect(() => {
    const timer = setInterval(refresh, 30000);
    window.addEventListener('focus', refresh);
    return () => { clearInterval(timer); window.removeEventListener('focus', refresh); };
  }, [refresh]);
  const [notice, setNotice] = useState('');
  useEffect(() => { if (!notice) return undefined; const t = setTimeout(() => setNotice(''), 5000); return () => clearTimeout(t); }, [notice]);

  const done = (next) => {
    const before = item.payments?.length || 0;
    setItem(next); setQuick(null); onChanged(next); refresh();
    setNotice((next.payments?.length || 0) > before ? 'Payment saved in Patient Details. It counts once accounts verifies it.' : 'Saved.');
  };
  const verifyPayment = async (payment) => {
    setError('');
    try {
      await api.patch(`/patients/${item.patientId}/stages/${item.stage}/payments/${payment.id}/approve`);
      setNotice(`Payment of ${money(payment.amount)} verified.`);
      const { data } = await api.get(`/transit/${item.patientId}/${item.stage}`, { skipCache: true });
      setItem(data.item); setEvents(data.events); onChanged(data.item);
    } catch (err) { setError(err.response?.data?.message || 'Could not verify the payment'); }
  };
  const hold = async () => {
    try { done(await sendAction(item, 'hold', { reason: holdReason })); setHoldOpen(false); setHoldReason(''); }
    catch (err) { setError(err.response?.data?.message || 'Could not put on hold'); }
  };
  const removeCase = async () => {
    setRemoving(true); setError('');
    try {
      const { data } = await api.delete(`/transit/${item.patientId}/${item.stage}`, { data: { reason: removeReason } });
      setRemoveOpen(false); setRemoveReason('');
      onRemoved(data.item);
    } catch (err) { setError(err.response?.data?.message || 'Could not remove this case'); } finally { setRemoving(false); }
  };
  const restoreCase = async () => {
    setError('');
    try { const { data } = await api.post(`/transit/${item.patientId}/${item.stage}/restore`); done(data.item); }
    catch (err) { setError(err.response?.data?.message || 'Could not restore this case'); }
  };
  const open = !item.activated && !item.onHold && !item.removed;
  const med = item.medicine;
  const courier = item.courier;
  const pay = item.payment;
  const paidPct = pay.totalAmount ? Math.min(100, Math.round((pay.amountPaid / pay.totalAmount) * 100)) : 0;
  const ModeIcon = MODE[item.mode]?.icon;
  const shipped = courier && courier.status !== 'pending';

  return (
    <div className="space-y-4">
      {/* header */}
      <div className="flex flex-wrap items-start gap-3">
        {onBack && <button type="button" onClick={onBack} className="rounded-lg border border-cardline p-2 lg:hidden" aria-label="Back to list"><ArrowLeft size={16} /></button>}
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-sage/15 font-bold text-sage">{initials(item.patientName)}</span>
        <div className="min-w-0 flex-1">
          <h2 className="truncate font-display text-lg font-bold text-charcoal">{item.patientName}</h2>
          <p className="text-xs text-charcoal/55">{[item.patientCode, `Phase ${item.stage}`, `PO ${item.purchaseOrder}`].filter(Boolean).join('  |  ')}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {item.patientPhone && <a href={`tel:${item.patientPhone}`}><Button size="sm" variant="outline"><Phone size={14} />{item.patientPhone}</Button></a>}
          {canOpenPatient && <Link to={`/admin/patients/${item.patientId}`}><Button size="sm" variant="outline"><ExternalLink size={14} />Patient</Button></Link>}
          {open && <Button size="sm" variant="outline" onClick={() => setHoldOpen((v) => !v)}><PauseCircle size={14} />Hold</Button>}
          {isAdmin && !item.removed && <Button size="sm" variant="outline" className="!border-[#8C3B2E]/30 !text-[#8C3B2E] hover:!bg-[#8C3B2E]/5" onClick={() => setRemoveOpen(true)}><Trash2 size={14} />Remove</Button>}
          {isAdmin && item.removed && <Button size="sm" onClick={restoreCase}><RotateCcw size={14} />Restore</Button>}
        </div>
      </div>
      {holdOpen && <div className="flex flex-wrap gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3"><input className={`${inputClass} flex-1`} placeholder="Exception / reason for hold" value={holdReason} onChange={(e) => setHoldReason(e.target.value)} /><Button size="sm" disabled={!holdReason.trim()} onClick={hold}>Put on hold</Button><button type="button" onClick={() => setHoldOpen(false)} className="p-2 text-charcoal/50" aria-label="Close"><X size={16} /></button></div>}
      {error && <p className="rounded-lg bg-[#8C3B2E]/8 px-3 py-2 text-sm text-[#8C3B2E]">{error}</p>}

      <div className="rounded-xl border border-cardline bg-white px-2 py-4 sm:px-4"><StageStepper groups={item.groups} /></div>
      {item.alerts.filter((a) => !a.text.startsWith('On hold')).map((a) => <p key={a.text} className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold ${a.type === 'danger' ? 'bg-[#8C3B2E]/10 text-[#8C3B2E]' : a.type === 'warning' ? 'bg-amber-50 text-amber-900' : 'bg-sky-50 text-sky-900'}`}><AlertTriangle size={15} />{a.text}</p>)}

      {notice && <p className="flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800"><CheckCircle2 size={15} />{notice}</p>}
      <NextActionPanel item={item} onDone={done} onQuick={setQuick} />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <Card title="Journey" icon={ClipboardList}><Checklist steps={item.steps} groups={item.groups} /></Card>
        <div className="space-y-4">
          <Card title="Patient calls" icon={PhoneCall} action={open && <button type="button" className={smallLink} onClick={() => setQuick('log_call')}><Plus size={13} />Log call</button>}>
            {item.calls.length ? (
              <ol className="relative space-y-3 border-l border-cardline pl-4">
                {item.calls.map((c, i) => (
                  <li key={i} className="relative">
                    <span className={`absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full ${c.outcome === 'connected' ? 'bg-emerald-600' : 'bg-amber-500'}`} />
                    <p className="text-sm font-semibold text-charcoal">{CALL[c.outcome]} <span className="font-normal text-charcoal/50">{dateTime(c.at)} - {c.byName}</span></p>
                    <p className="text-sm text-charcoal/75">{c.notes}</p>
                    {c.nextCallAt && <p className="text-xs font-semibold text-amber-800">Call again {dateTime(c.nextCallAt)}</p>}
                  </li>
                ))}
              </ol>
            ) : <p className="text-sm text-charcoal/50">No calls yet. Calls open after the ready-date reminder; you can also call earlier.</p>}
          </Card>

          <Card title="Payment" icon={IndianRupee} action={open && pay.remaining > 0 && <button type="button" className={smallLink} onClick={() => setQuick('add_payment')}><Plus size={13} />Record payment</button>}>
            <div className="mb-2 h-2 overflow-hidden rounded-full bg-cardline"><div className={`h-full ${paidPct >= 100 ? 'bg-emerald-600' : 'bg-sage'}`} style={{ width: `${paidPct}%` }} /></div>
            <Row label="Total" value={money(pay.totalAmount)} />
            <Row label="Paid (verified)" value={money(pay.amountPaid)} />
            <Row label="Balance" value={pay.remaining > 0 ? money(pay.remaining) : 'Nil'} />
            <Row label="Waiting for accounts" value={pay.pendingCount ? `${money(pay.pendingAmount)} (${pay.pendingCount})` : ''} />
            {item.payments?.length > 0 && (
              <ul className="mt-3 divide-y divide-cardline rounded-lg border border-cardline">
                {item.payments.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                    <div className="min-w-0">
                      <p className="font-semibold text-charcoal">{money(p.amount)} <span className="font-normal text-charcoal/50">{p.mode === 'cash' ? 'Cash' : 'Online'}{p.reference ? ` - ${p.reference}` : ''}</span></p>
                      <p className="text-xs text-charcoal/50">{dateText(p.date)}{p.recordedByName ? ` - by ${p.recordedByName}` : ''}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${p.status === 'approved' ? 'bg-emerald-100 text-emerald-800' : p.status === 'pending' ? 'bg-amber-100 text-amber-900' : 'bg-gray-100 text-charcoal/50'}`}>{p.status === 'approved' ? 'Verified' : p.status === 'pending' ? 'Pending' : 'Cancelled'}</span>
                      {canVerify && p.status === 'pending' && <button type="button" className={smallLink} onClick={() => verifyPayment(p)}>Verify</button>}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title="Medicine" icon={Pill} action={open && med && ['requested', 'in_process'].includes(med.status) && <button type="button" className={smallLink} onClick={() => setQuick('set_ready_by')}>Change date</button>}>
            {med ? <>
              <span className={`mb-2 inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-bold ${['made', 'sent_to_courier'].includes(med.status) ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-900'}`}>{MED_STATUS[med.status] || med.status}</span>
              <Row label="Medicines" value={med.medicines} />
              <Row label="Ready by" value={med.readyByDate ? `${dateText(med.readyByDate)}${med.readyDays != null ? ` (${med.readyDays > 1 ? `in ${med.readyDays} days` : med.readyDays === 1 ? 'tomorrow' : med.readyDays === 0 ? 'today' : `${-med.readyDays} days late`})` : ''}` : 'Not set'} />
              <Row label="Reminder" value={med.reminderOn ? `${dateText(med.reminderOn)} (automatic)` : ''} />
              <Row label="Accepted by" value={med.acceptedByName} />
              <Row label="Made by" value={med.madeByName ? `${med.madeByName}, ${dateTime(med.madeAt)}` : ''} />
              {(med.packagedByName || med.chitsWrittenByName || med.lastMedicineCheckedByName) && (
                <div className="mt-2 rounded-lg bg-offwhite-200 px-3 py-2">
                  <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-charcoal/45">Packing & QC</p>
                  <Row label="Packing by" value={med.packagedByName} />
                  <Row label="Chits written by" value={med.chitsWrittenByName} />
                  <Row label="Last checked by" value={med.lastMedicineCheckedByName} />
                  <Row label="Filled by" value={med.packagingDetailsFilledByName ? `${med.packagingDetailsFilledByName}, ${dateTime(med.packagingDetailsFilledAt)}` : ''} />
                </div>
              )}
              <CompactAttachments files={med.prescriptionFiles} label="Prescription" />
              <CompactAttachments files={med.medicineImages} label="Medicine photos" />
              {!['made', 'sent_to_courier'].includes(med.status) && <p className="mt-2 text-xs text-charcoal/55">Medicine department marks it made (with photo) and fills packing details on their page. It updates here automatically.</p>}
            </> : <p className="text-sm text-charcoal/50">No medicine request yet.</p>}
          </Card>

          <Card title="Handover" icon={ModeIcon || Package} action={open && item.mode && !shipped && <button type="button" className={smallLink} onClick={() => setQuick('confirm_mode')}>Change mode</button>}>
            {item.mode ? <>
              <Row label="Mode" value={MODE[item.mode].label} />
              <Row label="Visit" value={dateTime(item.visit.at)} />
              {shipped && <>
                <Row label={item.mode === 'porter' ? 'Porter' : 'Courier'} value={courier.courierPartner} />
                <Row label="Tracking" value={courier.trackingNumber} />
                <Row label="Deliver to" value={[courier.receiverName, courier.receiverPhone].filter(Boolean).join(', ')} />
                <Row label="Address" value={courier.address} />
                <Row label="Received by" value={courier.receivedByName ? `${courier.receivedByName}, ${dateTime(courier.deliveredAt)}` : ''} />
                <CompactAttachments files={courier.packageImages} label="Package" />
                <CompactAttachments files={courier.deliveryProofImages} label="Proof" />
              </>}
            </> : <p className="text-sm text-charcoal/50">Mode is confirmed on the call with the patient.</p>}
          </Card>

          <Card title="Treatment team" icon={Stethoscope}>
            <Row label="Assistant doctor" value={item.assignments.assistantDoctor?.name || 'Not assigned'} />
            <Row label="Post counselor" value={item.assignments.postCounselor?.name || 'Not assigned'} />
            <Row label="Psychologist" value={item.assignments.psychologist?.name || ''} />
            <Row label="Explanation" value={item.explanation.at ? `${dateTime(item.explanation.at)}${item.explanation.ackAt ? ' - seen' : ''}` : ''} />
          </Card>
        </div>
      </div>

      {events.length > 0 && (
        <Card title="Activity" icon={Clock3}>
          <ol className="space-y-2">
            {events.slice(0, 25).map((e, i) => <li key={i} className="flex gap-3 text-sm"><span className="w-28 shrink-0 text-xs text-charcoal/45">{dateTime(e.at)}</span><span className="min-w-0"><span className="text-charcoal/80">{e.details || e.action}</span> <span className="text-xs text-charcoal/45">- {e.by}</span></span></li>)}
          </ol>
        </Card>
      )}

      <Modal open={removeOpen} onClose={() => !removing && setRemoveOpen(false)} title="Remove from In Transit" className="max-w-md">
        <div className="space-y-3">
          <p className="text-sm text-charcoal/70"><b>{item.patientName}</b> (Phase {item.stage}) will be taken off the In Transit list. Payments, medicine request, PO and all other patient data stay as they are. You can restore it later from the Removed tab.</p>
          <label className="block space-y-1 text-sm font-medium text-charcoal"><span>Reason (optional)</span><input className={inputClass} maxLength={300} value={removeReason} onChange={(e) => setRemoveReason(e.target.value)} placeholder="e.g. duplicate entry, wrong PO" /></label>
          <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setRemoveOpen(false)} disabled={removing}>Cancel</Button><Button className="!bg-[#8C3B2E] hover:!bg-[#7a3328]" onClick={removeCase} disabled={removing}><Trash2 size={14} />{removing ? 'Removing...' : 'Remove'}</Button></div>
        </div>
      </Modal>
      <Modal open={Boolean(quick)} onClose={() => setQuick(null)} title={quick ? FORMS[formKeyFor(quick, item)]?.title : ''} className="max-w-lg">
        {quick && <ActionForm compact formKey={formKeyFor(quick, item)} item={item} onDone={done} onCancel={() => setQuick(null)} />}
      </Modal>
    </div>
  );
}

// ---------- queue ----------
function QueueCard({ item, active, onClick }) {
  const ModeIcon = MODE[item.mode]?.icon;
  const alert = item.alerts.find((a) => a.type !== 'info') || item.alerts[0];
  const age = daysSince(item.enteredAt);
  const status = item.removed ? 'Removed from In Transit'
    : item.onHold ? 'On hold'
      : item.activated ? 'Treatment started'
        : null;
  return (
    <button type="button" onClick={onClick} className={`group w-full rounded-xl border p-3 text-left transition ${active ? 'border-sage bg-sage/5 shadow-sm ring-1 ring-sage/30' : 'border-cardline bg-white hover:border-sage/60 hover:shadow-sm'}`}>
      <div className="flex items-start gap-2.5">
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold ${item.priority === 0 ? 'bg-[#8C3B2E]/10 text-[#8C3B2E]' : item.priority === 1 ? 'bg-amber-100 text-amber-900' : 'bg-sage/15 text-sage'}`}>{initials(item.patientName)}</span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className="truncate font-semibold text-charcoal">{item.patientName}</p>
            <span className="flex shrink-0 items-center gap-1.5 text-[11px] text-charcoal/45">{ModeIcon && <ModeIcon size={13} title={MODE[item.mode].label} />}{age != null && `${age}d`}</span>
          </div>
          <p className="truncate text-[11px] text-charcoal/50">{item.patientCode} | Phase {item.stage} | PO {item.purchaseOrder}</p>
          <p className={`mt-1.5 truncate text-[13px] font-medium ${status ? 'text-charcoal/60' : 'text-charcoal'}`} title={item.step.label}>{status || <><span className="text-charcoal/45">{item.nextAction ? 'Next: ' : 'Waiting: '}</span>{item.step.label}</>}</p>
          <div className="mt-1.5 flex gap-1">{item.groups.map((g) => <span key={g.key} className={`h-1 flex-1 rounded-full ${g.state === 'done' ? 'bg-emerald-600' : g.state === 'current' ? 'bg-sage' : 'bg-cardline'}`} />)}</div>
          {alert && !item.removed && <p className={`mt-1.5 inline-flex max-w-full items-center gap-1 truncate rounded-full px-2 py-0.5 text-[11px] font-semibold ${alert.type === 'danger' ? 'bg-[#8C3B2E]/10 text-[#8C3B2E]' : alert.type === 'warning' ? 'bg-amber-100 text-amber-900' : 'bg-sky-100 text-sky-900'}`}><AlertTriangle size={11} className="shrink-0" /><span className="truncate">{alert.text}</span></p>}
        </div>
      </div>
    </button>
  );
}

function QueueSection({ title, items, collapsed, onToggle, children }) {
  return (
    <section>
      <button type="button" onClick={onToggle} className="sticky top-0 z-10 flex w-full items-center justify-between rounded-lg bg-offwhite-200/95 px-2 py-1.5 text-left backdrop-blur">
        <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-charcoal/60"><ChevronDown size={14} className={`transition ${collapsed ? '-rotate-90' : ''}`} />{title}</span>
        <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-bold text-charcoal/60">{items.length}</span>
      </button>
      {!collapsed && <div className="mt-2 space-y-2">{children}</div>}
    </section>
  );
}

export default function Transit() {
  const { user } = useAuth();
  const isAdmin = user?.role === ROLES.ADMIN;
  const [params, setParams] = useSearchParams();
  const [view, setView] = useState('all');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState(() => { try { return localStorage.getItem('transit-sort') || 'priority'; } catch { return 'priority'; } });
  const [grouped, setGrouped] = useState(() => { try { return localStorage.getItem('transit-grouped') !== 'off'; } catch { return true; } });
  const [collapsed, setCollapsed] = useState({});
  const [data, setData] = useState({ items: [], counts: {} });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedKey, setSelectedKey] = useState(params.get('open'));
  const requestId = useRef(0);
  const canOpenPatient = [ROLES.ADMIN, ROLES.POST_COUNSELOR].includes(user?.role);
  useEffect(() => { try { localStorage.setItem('transit-sort', sort); localStorage.setItem('transit-grouped', grouped ? 'on' : 'off'); } catch { /* preference only */ } }, [sort, grouped]);

  const load = useCallback(async () => {
    const id = ++requestId.current;
    try {
      const { data: res } = await api.get('/transit', { params: { view, q: query || undefined }, skipCache: true });
      if (id === requestId.current) { setData(res); setError(''); }
    } catch (err) { if (id === requestId.current) setError(err.response?.data?.message || 'Could not load in-transit cases'); }
    finally { if (id === requestId.current) setLoading(false); }
  }, [view, query]);
  useEffect(() => { setLoading(true); const timer = setTimeout(load, query ? 300 : 0); return () => clearTimeout(timer); }, [load, query]);
  useEffect(() => { const timer = setInterval(load, 60000); return () => clearInterval(timer); }, [load]);

  const sorted = useMemo(() => sortItems(data.items, sort), [data.items, sort]);
  const sections = useMemo(() => {
    if (!grouped) return null;
    return GROUP_ORDER.map(([key, title]) => ({ key, title, items: sorted.filter((item) => sectionOf(item) === key) })).filter((s) => s.items.length);
  }, [sorted, grouped]);

  const [pinned, setPinned] = useState(null); // keeps the open case visible even if it leaves the current filter
  const selected = useMemo(() => data.items.find((i) => i.key === selectedKey) || (pinned?.key === selectedKey ? pinned : null), [data.items, selectedKey, pinned]);
  const choose = (item) => { setSelectedKey(item.key); setPinned(item); if (params.get('open')) setParams({}, { replace: true }); };
  const changed = (item) => { setPinned(item); setData((old) => ({ ...old, items: old.items.map((row) => (row.key === item.key ? item : row)) })); load(); };
  const removed = (item) => { setPinned(null); setSelectedKey(null); setData((old) => ({ ...old, items: old.items.filter((row) => row.key !== item.key) })); load(); };
  useEffect(() => { if (!selectedKey && sorted.length && window.matchMedia('(min-width: 1024px)').matches) setSelectedKey(sorted[0].key); }, [sorted, selectedKey]);

  const card = (item) => <QueueCard key={item.key} item={item} active={item.key === selectedKey} onClick={() => choose(item)} />;
  const pipeline = [{ key: 'all', label: 'All open', hint: 'Every case in transit' }, ...PIPELINE].filter((p) => !p.adminOnly || isAdmin);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 font-display text-xl font-bold text-charcoal sm:text-2xl"><Truck size={22} className="text-sage" />In Transit</h1>
          <p className="mt-1 text-sm text-charcoal/60">From purchase order to treatment start. Everything here stays in sync with Patient Details, Medicine and Courier.</p>
        </div>
        <div className="relative w-full sm:w-72"><Search size={16} className="absolute left-3 top-2.5 text-charcoal/45" /><input className={`${inputClass} !pl-9`} placeholder="Patient, ID, phone or PO" value={query} onChange={(e) => setQuery(e.target.value)} /></div>
      </div>

      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {pipeline.map((p) => (
          <button key={p.key} type="button" onClick={() => setView(p.key)} className={`min-w-[128px] shrink-0 rounded-xl border px-3 py-2.5 text-left transition ${view === p.key ? 'border-sage bg-sage text-white shadow-sm' : 'border-cardline bg-white hover:border-sage/60'}`}>
            <p className={`text-2xl font-bold leading-none ${view !== p.key && p.tone === 'danger' && data.counts?.[p.key] ? 'text-[#8C3B2E]' : ''}`}>{data.counts?.[p.key] ?? 0}</p>
            <p className="mt-1 text-xs font-semibold">{p.label}</p>
            <p className={`text-[10px] ${view === p.key ? 'text-white/80' : 'text-charcoal/45'}`}>{p.hint}</p>
          </button>
        ))}
      </div>
      {error && <div className="rounded-lg bg-[#8C3B2E]/8 px-3.5 py-3 text-sm text-[#8C3B2E]">{error}</div>}

      <div className="grid gap-4 lg:grid-cols-[370px_minmax(0,1fr)]">
        <aside className={`${selected ? 'hidden lg:flex' : 'flex'} min-h-0 flex-col rounded-xl border border-cardline bg-offwhite-100 lg:sticky lg:top-4 lg:max-h-[calc(100dvh-120px)]`}>
          <div className="flex flex-wrap items-center gap-2 border-b border-cardline px-3 py-2.5">
            <p className="mr-auto text-sm font-semibold text-charcoal">{sorted.length} case{sorted.length === 1 ? '' : 's'}</p>
            <label className="flex items-center gap-1.5 text-xs text-charcoal/60"><ArrowUpDown size={13} />
              <select className="rounded-md border border-cardline bg-white px-1.5 py-1 text-xs text-charcoal" value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort cases">{SORTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
            </label>
            <button type="button" onClick={() => setGrouped((g) => !g)} className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-semibold ${grouped ? 'border-sage bg-sage/10 text-sage' : 'border-cardline bg-white text-charcoal/60'}`} title="Group by stage"><Rows3 size={13} />Group</button>
          </div>
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-2.5">
            {loading && !data.items.length ? <p className="p-6 text-center text-sm text-charcoal/55">Loading...</p>
              : !sorted.length ? <div className="p-6 text-center text-sm text-charcoal/55">No cases here. A phase enters In Transit when its purchase order and a payment are added in Patient Details.</div>
                : sections ? sections.map((section) => (
                  <QueueSection key={section.key} title={section.title} items={section.items} collapsed={collapsed[section.key]} onToggle={() => setCollapsed((c) => ({ ...c, [section.key]: !c[section.key] }))}>
                    {section.items.map(card)}
                  </QueueSection>
                )) : <div className="space-y-2">{sorted.map(card)}</div>}
          </div>
        </aside>
        <main className={selected ? '' : 'hidden lg:block'}>
          {selected
            ? <CaseDetail itemKey={selected.key} initial={selected} onChanged={changed} onRemoved={removed} onBack={() => setSelectedKey(null)} canOpenPatient={canOpenPatient} isAdmin={isAdmin} />
            : <div className="flex h-full min-h-[300px] items-center justify-center rounded-xl border border-dashed border-cardline bg-white text-sm text-charcoal/50">Select a case to see its journey</div>}
        </main>
      </div>
    </div>
  );
}
