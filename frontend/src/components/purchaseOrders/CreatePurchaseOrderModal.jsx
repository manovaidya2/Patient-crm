import { useEffect, useState } from 'react';
import { Check, Search } from 'lucide-react';
import api from '../../api/axios.js';
import Button from '../ui/Button.jsx';
import Modal from '../ui/Modal.jsx';
import PurchaseOrderForm from '../postcounseling/PurchaseOrderForm.jsx';
import { STAGES, STAGE_LABELS } from '../../constants/treatmentStages.js';

export const poInput = 'w-full min-w-0 rounded-lg border border-cardline bg-white px-3 py-2 text-sm text-charcoal outline-none focus:border-sage focus:ring-2 focus:ring-sage/15';

export const Chip = ({ active, onClick, children, title }) => (
  <button type="button" title={title} aria-pressed={active} onClick={onClick} className={`inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${active ? 'border-sage bg-sage text-white' : 'border-cardline bg-white text-charcoal/75 hover:border-sage/60'}`}>
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
export default function CreatePurchaseOrderModal({ open, onClose, onCreated, patient: fixedPatient = null }) {
  const [patient, setPatient] = useState(fixedPatient);
  const [phase, setPhase] = useState(String(fixedPatient?.currentStage || 1));
  const [fee, setFee] = useState('');
  const [form, setForm] = useState(null);
  const [values, setValues] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setPatient(fixedPatient); setPhase(String(fixedPatient?.currentStage || 1)); setFee(''); setError('');
  }, [open, fixedPatient]);
  // Load the prefilled paper whenever the patient changes (phase only changes the "ordered treatment" default).
  useEffect(() => {
    if (!open || !patient) { setForm(null); setValues(null); return; }
    let cancelled = false;
    api.get('/purchase-orders/form', { params: { patient: patient.id, phase }, skipCache: true })
      .then(({ data }) => { if (!cancelled) { setForm(data); setValues(data.values); } })
      .catch((err) => { if (!cancelled) setError(err.response?.data?.message || 'Could not open the PO form'); });
    return () => { cancelled = true; };
  }, [open, patient]); // eslint-disable-line react-hooks/exhaustive-deps
  const choosePhase = (value) => {
    setPhase(value);
    setValues((current) => (current ? { ...current, orderedTreatment: String(current.orderedTreatment || '').replace(/Phase \d$/, `Phase ${value}`) } : current));
  };

  const feeNumber = Number(String(fee).replace(/,/g, '')) || 0;
  const submit = async () => {
    if (!patient) { setError('Select the patient'); return; }
    if (!(feeNumber > 0)) { setError('Enter the PO value (approved fee)'); return; }
    if (!values?.supplyOrder) { setError('Select the medicine supply on this PO (section H)'); return; }
    if (!values?.mode) { setError('Select the payment mode (section F)'); return; }
    setSaving(true); setError('');
    try {
      const { data } = await api.post('/purchase-orders', { patientId: patient.id, phase, fee: feeNumber, purchase: values });
      onCreated?.(data.purchaseOrder);
    } catch (err) { setError(err.response?.data?.message || 'Could not create the purchase order'); } finally { setSaving(false); }
  };

  return (
    <Modal open={open} onClose={() => !saving && onClose()} title="New purchase order" className="max-w-4xl">
      <div className="space-y-5">
        <p className="text-xs text-charcoal/60">Fill the PO paper as the patient signed it. The PO number (PO-xxxx) is generated on save, and the PO goes to In Transit to verify the paper and the payment.</p>
        {error && <p className="rounded-lg bg-[#8C3B2E]/8 px-3 py-2 text-sm text-[#8C3B2E]">{error}</p>}
        {!fixedPatient && <FieldLabel label="Patient" required><PatientPicker value={patient} onChange={setPatient} /></FieldLabel>}
        {patient && (
          <div className="grid gap-3 sm:grid-cols-2">
            <FieldLabel label="Phase" required>
              <select className={poInput} value={phase} onChange={(e) => choosePhase(e.target.value)}>
                {STAGES.map((n) => <option key={n} value={n}>{STAGE_LABELS[n]}{Number(patient.currentStage) === n ? ' (current)' : ''}</option>)}
              </select>
            </FieldLabel>
            <FieldLabel label="PO value / approved fee (Rs)" required><input className={poInput} inputMode="decimal" value={fee} onChange={(e) => setFee(e.target.value)} placeholder="e.g. 42000" /></FieldLabel>
          </div>
        )}
        {patient && !values && !error && <p className="py-6 text-center text-sm text-charcoal/55">Opening the PO form...</p>}
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
