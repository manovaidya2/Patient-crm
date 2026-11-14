import { useEffect, useState } from 'react';
import { Check, Search } from 'lucide-react';
import api from '../../api/axios.js';
import Button from '../ui/Button.jsx';
import Modal from '../ui/Modal.jsx';
import PurchaseOrderForm from '../postcounseling/PurchaseOrderForm.jsx';
import { STAGES, STAGE_LABELS } from '../../constants/treatmentStages.js';

export const poInput = 'w-full min-w-0 rounded-lg border border-cardline bg-white px-3 py-2 text-sm text-charcoal outline-none focus:border-sage focus:ring-2 focus:ring-sage/15';

const categoryOf = (value) => value === 'mental_health' ? 'mental_health' : value === 'other' ? 'other' : 'autism_adhd';
const categoryLabel = (category, other = '') => category === 'mental_health' ? 'Mental Health' : category === 'other' ? (other.trim() || 'Other') : 'Autism';
const phaseDuration = (category, days = '30') => category === 'autism_adhd' ? '6 months' : category === 'mental_health' ? '45 days' : Number(days) === 30 ? '1 month (30 days)' : `${days || '—'} days`;
const treatmentLabel = (category, other, days, phase) => `${categoryLabel(category, other)} / Phase ${phase} (${phaseDuration(category, days)})`;

export const Chip = ({ active, onClick, children, title, disabled = false }) => (
  <button type="button" title={title} aria-pressed={active} onClick={onClick} disabled={disabled} className={`inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-semibold transition disabled:cursor-not-allowed ${active ? 'border-sage bg-sage text-white' : 'border-cardline bg-white text-charcoal/75 hover:border-sage/60 disabled:opacity-40'}`}>
    {active && <Check size={12} />}{children}
  </button>
);
export const FieldLabel = ({ label, required, children, className = '' }) => (
  <label className={`block space-y-1 text-sm font-medium text-charcoal ${className}`}><span>{label}{required && <span className="text-red-700"> *</span>}</span>{children}</label>
);

function PatientPicker({ value, onChange }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  useEffect(() => {
    if (query.trim().length < 2) { setResults([]); return undefined; }
    const timer = setTimeout(() => {
      api.get('/patients', { params: { search: query.trim(), limit: 8 }, skipCache: true })
        .then(({ data }) => setResults(data.patients || [])).catch(() => setResults([]));
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);
  if (value) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-lg border border-sage/40 bg-sage/5 px-3 py-2 text-sm">
        <span><b>{value.patientName}</b> <span className="text-charcoal/55">{value.patientCode} · {STAGE_LABELS[value.currentStage] || ''}</span></span>
        <button type="button" className="text-xs font-semibold text-sage hover:underline" onClick={() => onChange(null)}>Change</button>
      </div>
    );
  }
  return (
    <div className="relative">
      <Search size={15} className="absolute left-3 top-2.5 text-charcoal/45" />
      <input className={`${poInput} !pl-9`} placeholder="Search patient by name, ID or phone" value={query} onChange={(e) => setQuery(e.target.value)} />
      {results.length > 0 && (
        <ul className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-cardline bg-white shadow-card">
          {results.map((p) => (
            <li key={p.id}><button type="button" className="w-full px-3 py-2 text-left text-sm hover:bg-sage/10" onClick={() => onChange(p)}><b>{p.patientName}</b> <span className="text-xs text-charcoal/55">{p.patientCode} · {p.number || ''}</span></button></li>
          ))}
        </ul>
      )}
    </div>
  );
}

// New purchase order for an existing patient, on the same PO paper the post counselor fills at conversion:
// payment collection (screenshots for online / receiver for cash), EMI, PO & consent and the PO paper image.
// fromPoId: open with that PO's balance already chosen ("New PO for the balance" on a PO page).
export default function CreatePurchaseOrderModal({ open, onClose, onCreated, patient: fixedPatient = null, fromPoId: presetFrom = '' }) {
  const [patient, setPatient] = useState(fixedPatient);
  const [phase, setPhase] = useState(String(fixedPatient?.currentStage || 1));
  const [category, setCategory] = useState(() => categoryOf(fixedPatient?.category));
  const [otherCategory, setOtherCategory] = useState('');
  const [otherPhaseDays, setOtherPhaseDays] = useState('30');
  const [fee, setFee] = useState('');
  // A new PO made from a previous PO: its value is that PO's unpaid balance (e.g. the rest of the months).
  const [fromPoId, setFromPoId] = useState('');
  const [form, setForm] = useState(null);
  const [values, setValues] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [exceptionPayment, setExceptionPayment] = useState(false);
  const [exceptionPaymentReason, setExceptionPaymentReason] = useState('');

  useEffect(() => {
    if (!open) return;
    setPatient(fixedPatient); setPhase(String(fixedPatient?.currentStage || 1)); setFee(''); setFromPoId(''); setError('');
    setCategory(categoryOf(fixedPatient?.category)); setOtherCategory(''); setOtherPhaseDays('30');
    setExceptionPayment(false); setExceptionPaymentReason('');
  }, [open, fixedPatient]);
  // Load the prefilled paper whenever the patient changes (phase only changes the "ordered treatment" default).
  useEffect(() => {
    if (!open || !patient) { setForm(null); setValues(null); return; }
    let cancelled = false;
    api.get('/purchase-orders/form', { params: { patient: patient.id, phase }, skipCache: true })
      .then(({ data }) => {
        if (cancelled) return;
        const preset = presetFrom && (data.previous || []).find((p) => p.id === presetFrom);
        const initialCategory = categoryOf(data.contacts?.category || patient.category);
        setCategory(initialCategory); setOtherCategory(''); setOtherPhaseDays('30');
        setForm(data); setValues({ ...data.values, orderedTreatment: treatmentLabel(initialCategory, '', '30', preset?.phase || phase) });
        if (preset) { setFromPoId(preset.id); setFee(String(preset.balance)); setPhase(String(preset.phase)); }
      })
      .catch((err) => { if (!cancelled) setError(err.response?.data?.message || 'Could not open the PO form'); });
    return () => { cancelled = true; };
  }, [open, patient]); // eslint-disable-line react-hooks/exhaustive-deps
  const choosePhase = (value) => {
    setPhase(value);
    setValues((current) => (current ? { ...current, orderedTreatment: String(current.orderedTreatment || '').replace(/Phase \d+(?: \(.*\))?$/, `Phase ${value} (${phaseDuration(category, otherPhaseDays)})`) } : current));
  };

  // These are PO labels only; phase numbers, supply, payments and treatment scheduling keep their existing flow.
  const chooseCategory = (value) => {
    setCategory(value);
    setValues((current) => current ? { ...current, orderedTreatment: treatmentLabel(value, otherCategory, otherPhaseDays, phase) } : current);
  };
  const changeOther = (name, days) => {
    setOtherCategory(name); setOtherPhaseDays(days);
    setValues((current) => current ? { ...current, orderedTreatment: treatmentLabel('other', name, days, phase) } : current);
  };

  const previousOptions = form?.previous || [];
  const fromPo = previousOptions.find((p) => p.id === fromPoId) || null;
  const chooseFrom = (id) => {
    setFromPoId(id);
    const p = previousOptions.find((x) => x.id === id);
    if (p) { setFee(String(p.balance)); choosePhase(String(p.phase)); }
  };
  const feeNumber = fromPo ? fromPo.balance : Number(String(fee).replace(/,/g, '')) || 0;
  const submit = async () => {
    if (!patient) { setError('Select the patient'); return; }
    if (category === 'other' && !otherCategory.trim()) { setError('Write the patient category for Other'); return; }
    if (category === 'other' && (!Number.isInteger(Number(otherPhaseDays)) || Number(otherPhaseDays) < 1 || Number(otherPhaseDays) > 3650)) { setError('Enter the phase duration in whole days (1 to 3650)'); return; }
    if (!(feeNumber > 0)) { setError('Enter the PO value (approved fee)'); return; }
    if (!values?.supplyOrder) { setError('Select the medicine supply on this PO (section H)'); return; }
    // No first payment is fine; the mode is asked only when an amount is received now.
    if (Number(values?.amountReceivedNow || 0) > 0 && !values?.mode) { setError('Select the payment mode of the amount received (section F)'); return; }
    setSaving(true); setError('');
    try {
      const { data } = await api.post('/purchase-orders', { patientId: patient.id, phase, fee: feeNumber, purchase: values, ...(fromPo ? { fromPoId: fromPo.id } : {}), ...(exceptionPayment ? { exceptionPayment: true, exceptionPaymentReason } : {}) });
      onCreated?.(data.purchaseOrder);
    } catch (err) { setError(err.response?.data?.message || 'Could not create the purchase order'); } finally { setSaving(false); }
  };

  return (
    <Modal open={open} onClose={() => !saving && onClose()} title="New purchase order" className="max-w-4xl">
      <div className="space-y-5">
        <p className="text-xs text-charcoal/60">Fill the PO paper as the patient signed it. The PO number (PO-xxxx) is generated on save, and the PO goes to In Transit to verify the paper and the payment.</p>
        {error && <p className="rounded-lg bg-[#8C3B2E]/8 px-3 py-2 text-sm text-[#8C3B2E]">{error}</p>}
        {!fixedPatient && <FieldLabel label="Patient" required><PatientPicker value={patient} onChange={setPatient} /></FieldLabel>}
        {patient && previousOptions.length > 0 && (
          <FieldLabel label="Take a balance still owed (optional)">
            <select className={poInput} value={fromPoId} onChange={(e) => (e.target.value ? chooseFrom(e.target.value) : setFromPoId(''))}>
              <option value="">No - a new PO from fresh (no reference)</option>
              {previousOptions.map((p) => <option key={p.id} value={p.id}>{p.poNumber} · Phase {p.phase} · {p.supplyLabel || 'supply not set'} · paid Rs {Number(p.paid).toLocaleString('en-IN')} of Rs {Number(p.amount).toLocaleString('en-IN')} · balance Rs {Number(p.balance).toLocaleString('en-IN')}</option>)}
            </select>
            {fromPo && (fromPo.noPo
              ? <span className="mt-1 block text-xs text-sky-900">Phase {fromPo.phase} was paid without a PO: Rs {Number(fromPo.paid).toLocaleString('en-IN')} of Rs {Number(fromPo.amount).toLocaleString('en-IN')}. This PO's value is the balance, Rs {Number(fromPo.balance).toLocaleString('en-IN')}; the earlier payments stay on Phase {fromPo.phase} for reference and this PO starts at Rs 0 paid.</span>
              : <span className="mt-1 block text-xs text-sky-900">This PO's value is the unpaid balance of {fromPo.poNumber}: Rs {Number(fromPo.balance).toLocaleString('en-IN')}. The balance moves here and is no longer owed on {fromPo.poNumber}.</span>)}
            {!fromPo && <span className="mt-1 block text-xs text-charcoal/60">A new PO always starts at Rs 0 paid: payments made earlier on the phase are not counted on it.</span>}
          </FieldLabel>
        )}
        {patient && (
          <div className="grid gap-3 sm:grid-cols-2">
            <FieldLabel label="Patient category" required><select className={poInput} value={category} onChange={(e) => chooseCategory(e.target.value)}><option value="autism_adhd">Autism</option><option value="mental_health">Mental Health</option><option value="other">Other</option></select></FieldLabel>
            {category === 'other' ? <>
              <FieldLabel label="Other patient category" required><input className={poInput} value={otherCategory} maxLength={100} onChange={(e) => changeOther(e.target.value, otherPhaseDays)} placeholder="Write the patient category" /></FieldLabel>
              <FieldLabel label="Phase duration (days)" required><input type="number" className={poInput} min={1} max={3650} step={1} value={otherPhaseDays} onChange={(e) => changeOther(otherCategory, e.target.value)} /><span className="block text-xs text-charcoal/55">Default: 1 month (30 days)</span></FieldLabel>
            </> : <FieldLabel label="Phase duration"><input className={`${poInput} bg-[#F6F0E3]`} value={phaseDuration(category)} readOnly /></FieldLabel>}
          </div>
        )}
        {patient && (
          <div className="grid gap-3 sm:grid-cols-2">
            <FieldLabel label="Phase" required>
              <select className={poInput} value={phase} onChange={(e) => choosePhase(e.target.value)}>
                {STAGES.map((n) => <option key={n} value={n}>{STAGE_LABELS[n]} · {categoryLabel(category, otherCategory)} · {phaseDuration(category, otherPhaseDays)}{Number(patient.currentStage) === n ? ' (current)' : ''}</option>)}
              </select>
            </FieldLabel>
            <FieldLabel label={fromPo ? `PO value (balance of ${fromPo.poNumber})` : 'PO value / approved fee (Rs)'} required><input className={poInput} inputMode="decimal" value={fromPo ? String(fromPo.balance) : fee} disabled={Boolean(fromPo)} onChange={(e) => setFee(e.target.value)} placeholder="e.g. 42000" /></FieldLabel>
          </div>
        )}
        {patient && !values && !error && <p className="py-6 text-center text-sm text-charcoal/55">Opening the PO form...</p>}
        {patient && <section className="space-y-2 rounded-lg border border-cardline bg-white p-3">
          <label className="flex items-start gap-2 text-sm font-semibold text-charcoal"><input type="checkbox" className="mt-1 h-4 w-4 accent-sage" checked={exceptionPayment} disabled={saving} onChange={(e) => setExceptionPayment(e.target.checked)} />Exception payment — Doctor verification required</label>
          {exceptionPayment && <><p className="text-xs text-charcoal/65">This PO goes to the Doctor's Exception Payment page first. Further PO verification starts after Doctor approval.</p><FieldLabel label="Exception reason / notes (optional)"><textarea className={poInput} rows={2} maxLength={2000} value={exceptionPaymentReason} onChange={(e) => setExceptionPaymentReason(e.target.value)} /></FieldLabel></>}
        </section>}
        {values && form && (
          <PurchaseOrderForm
            defs={form.definitions} values={values} fee={feeNumber} contacts={form.contacts} editable
            onChange={(key, value) => setValues((current) => ({ ...current, [key]: value }))}
            onError={setError} onUploading={setUploading} uploadUrl="/purchase-orders/upload"
          />
        )}
        <div className="sticky bottom-0 flex justify-end gap-2 border-t border-cardline bg-offwhite-100 pt-3">
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={submit} disabled={saving || uploading || !values}><Check size={15} />{saving ? 'Saving...' : 'Create purchase order'}</Button>
        </div>
      </div>
    </Modal>
  );
}
