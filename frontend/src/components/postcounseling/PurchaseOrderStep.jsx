import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Check, Save, UserCheck, PackageX } from 'lucide-react';
import api from '../../api/axios.js';
import Button from '../ui/Button.jsx';
import Input from '../ui/Input.jsx';
import Modal from '../ui/Modal.jsx';

const inputClass = 'w-full rounded-lg border border-cardline bg-offwhite-200 px-3 py-2 text-sm text-charcoal placeholder:text-charcoal/35 focus:border-sage focus:outline-none focus:ring-2 focus:ring-sage/20 disabled:opacity-60';
const rupees = (value) => `Rs ${Number(value || 0).toLocaleString('en-IN')}`;

const SectionTitle = ({ letter, children, hint }) => (
  <div className="border-l-4 border-sage bg-sage/10 px-4 py-2.5"><h3 className="text-sm font-bold uppercase tracking-wide text-charcoal">{letter}. {children}</h3>{hint && <p className="text-xs text-charcoal/55">{hint}</p>}</div>
);
const Chip = ({ active, disabled, onClick, children }) => (
  <button type="button" disabled={disabled} aria-pressed={active} onClick={onClick} className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-semibold transition ${active ? 'border-sage bg-sage text-white' : 'border-cardline bg-white text-charcoal/75 hover:border-sage/60'} disabled:opacity-60`}>{active && <Check size={12} />}{children}</button>
);
const Auto = ({ label, value }) => (
  <div><p className="mb-1 text-xs font-semibold text-charcoal/70">{label} <span className="font-normal text-charcoal/45">(auto)</span></p><p className="rounded-lg border border-cardline bg-offwhite-200 px-3 py-2 text-sm font-bold text-charcoal">{value}</p></div>
);

// Step 2 of post-counselling: purchase order / payment details (prefilled), then the decision.
const PurchaseOrderStep = ({ patient, data, readOnly, onData, onBack, onDecided }) => {
  const defs = data.purchase.definitions;
  const [values, setValues] = useState(data.purchase.values);
  const [saved, setSaved] = useState(data.purchase.saved);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [dialog, setDialog] = useState(null);
  const [form, setForm] = useState({});
  const [result, setResult] = useState(null);

  useEffect(() => { setValues(data.purchase.values); setSaved(data.purchase.saved); }, [data.purchase]);

  const fee = Number(data.record?.totals?.approvedProgramFee || 0);
  const received = Number(values.amountReceivedNow || 0);
  const card = values.mode === 'Card (+3%)' ? Math.round(received * defs.cardRate * 100) / 100 : 0;
  const outstanding = Math.max(fee - received, 0);
  const decided = Boolean(data.outcome);
  const editable = data.canEdit && !readOnly && !decided;
  const set = (key, value) => { setValues((current) => ({ ...current, [key]: value })); setSaved(false); setNotice(''); };
  const visible = (field) => (!field.onlyFor || field.onlyFor.includes(values.mode)) && (!field.hideFor || !field.hideFor.includes(values.mode));
  const registration = data.registration.fields;

  const save = async () => {
    setBusy(true); setError(''); setNotice('');
    try {
      const response = await api.put(`/post-counseling/patients/${patient.id}/purchase`, { purchase: values });
      onData(response.data); setSaved(true); setNotice('Saved');
    } catch (err) { setError(err.response?.data?.message || 'Could not save'); }
    finally { setBusy(false); }
  };

  const openConvert = () => {
    setError('');
    setForm({ number: registration.fatherNumber || registration.whatsappNumber || registration.motherNumber || '', guardianName: registration.fatherName || registration.motherName || '' });
    setDialog('convert');
  };
  const openNotPurchased = () => { setError(''); setForm({ reason: '', followUpDate: '', notes: '' }); setDialog('notPurchased'); };
  const decide = async (kind) => {
    setBusy(true); setError('');
    try {
      const { data: response } = await api.post(`/post-counseling/patients/${patient.id}/outcome/${kind === 'convert' ? 'convert' : 'not-purchased'}`, form);
      setResult({ kind, ...response }); setDialog(null); onDecided?.();
      const refreshed = await api.get(`/post-counseling/patients/${patient.id}/record`, { skipCache: true });
      onData(refreshed.data);
    } catch (err) { setError(err.response?.data?.message || 'Could not complete this'); }
    finally { setBusy(false); }
  };

  const renderField = (field) => {
    if (!visible(field)) return null;
    const wrap = field.wide ? 'md:col-span-2' : '';
    if (field.type === 'check') return <label key={field.key} className={`flex items-center gap-2 pt-6 text-sm font-semibold text-charcoal ${wrap}`}><input type="checkbox" disabled={!editable} checked={Boolean(values[field.key])} onChange={(event) => set(field.key, event.target.checked)} className="h-4 w-4 accent-sage" />{field.label}</label>;
    return (
      <div key={field.key} className={wrap}>
        <p className="mb-1 text-xs font-semibold text-charcoal/70">{field.label}</p>
        {field.type === 'single'
          ? <div className="flex flex-wrap gap-1.5">{field.options.map((option) => <Chip key={option} disabled={!editable} active={values[field.key] === option} onClick={() => set(field.key, values[field.key] === option ? '' : option)}>{option}</Chip>)}</div>
          : <input disabled={!editable} type={field.type === 'date' ? 'date' : field.type === 'time' ? 'time' : 'text'} inputMode={field.type === 'money' ? 'decimal' : undefined} value={values[field.key] ?? ''} onChange={(event) => set(field.key, event.target.value)} className={inputClass} />}
      </div>
    );
  };

  const emiShown = values.mode === 'EMI' || data.record?.e?.paymentPlan === 'EMI';
  const outcomeText = useMemo(() => {
    if (!data.outcome) return '';
    return data.outcome.kind === 'converted' ? 'Converted to patient' : 'Moved to Package Not Bought';
  }, [data.outcome]);

  return (
    <div className="space-y-6">
      {error && <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      {(decided || result) && (
        <div className="rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          <b>{outcomeText || (result?.kind === 'convert' ? 'Converted to patient' : 'Moved to Package Not Bought')}</b>
          {data.outcome?.byName && <span> by {data.outcome.byName}</span>}
          {(data.outcome?.patientId || result?.patientId) && <> · <Link className="font-semibold underline" to={`/admin/patients/${data.outcome?.patientId || result.patientId}`}>Open patient</Link></>}
          {(data.outcome?.packageNotBoughtId || result?.packageNotBoughtId) && <> · <Link className="font-semibold underline" to={`/admin/package-not-bought/${data.outcome?.packageNotBoughtId || result.packageNotBoughtId}`}>Open Package Not Bought</Link></>}
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-3">
        <Auto label="Approved program fee" value={rupees(fee)} />
        <Auto label="Amount received now" value={rupees(received)} />
        <Auto label="Outstanding balance" value={rupees(outstanding)} />
      </div>

      <section className="space-y-3">
        <SectionTitle letter="F" hint="Payment collection & approved instalment plan">Payment collection</SectionTitle>
        <div className="grid gap-3 md:grid-cols-2">
          {defs.sectionF.map(renderField)}
          {values.mode === 'Card (+3%)' && <Auto label="3% card charge (Rs)" value={rupees(card)} />}
          <Auto label="Outstanding balance (Rs)" value={rupees(outstanding)} />
        </div>
      </section>

      {emiShown && (
        <section className="space-y-3">
          <SectionTitle letter="G" hint="If applicable">EMI details</SectionTitle>
          <div className="grid gap-3 md:grid-cols-2">{defs.sectionG.map(renderField)}</div>
        </section>
      )}

      <section className="space-y-3">
        <SectionTitle letter="H">Purchase order &amp; patient / guardian consent</SectionTitle>
        <div className="grid gap-3 md:grid-cols-2">
          {defs.sectionH.map(renderField)}
          <Auto label="PO value (Rs)" value={rupees(fee)} />
          <Auto label="Part payment (Rs)" value={rupees(received)} />
          <Auto label="Balance (Rs)" value={rupees(outstanding)} />
          <div><p className="mb-1 text-xs font-semibold text-charcoal/70">Father's contact no.</p><p className="rounded-lg border border-cardline bg-offwhite-200 px-3 py-2 text-sm">{registration.fatherNumber || '-'}</p></div>
          <div><p className="mb-1 text-xs font-semibold text-charcoal/70">Mother's contact no.</p><p className="rounded-lg border border-cardline bg-offwhite-200 px-3 py-2 text-sm">{registration.motherNumber || '-'}</p></div>
        </div>
      </section>

      {!readOnly && !decided && data.canEdit && (
        <section className="space-y-3 rounded-lg border border-cardline bg-white/60 p-4">
          <p className="text-sm font-bold text-charcoal">Decision</p>
          <p className="text-xs text-charcoal/60">Convert to patient creates the patient with all these details and the package. Package not purchased moves the patient to the Package Not Bought page with the package details.</p>
          <div className="flex flex-wrap gap-2">
            <Button onClick={openConvert} disabled={!saved || busy}><UserCheck size={15} /> Convert to patient</Button>
            <Button variant="outline" onClick={openNotPurchased} disabled={busy}><PackageX size={15} /> Package not purchased</Button>
          </div>
          {!saved && <p className="text-xs text-amber-800">Save the purchase order details to enable Convert to patient.</p>}
        </section>
      )}

      <div className="sticky bottom-0 flex flex-wrap items-center justify-end gap-2 border-t border-cardline bg-offwhite-100 pt-3">
        {notice && <span className="mr-auto text-sm font-semibold text-sage">{notice}</span>}
        {onBack && <Button variant="outline" onClick={onBack}><ArrowLeft size={15} /> Back</Button>}
        {editable && <Button onClick={save} disabled={busy}><Save size={15} />{busy ? 'Saving...' : 'Save'}</Button>}
      </div>

      <Modal open={dialog === 'convert'} onClose={() => !busy && setDialog(null)} title="Convert to patient" className="max-w-lg">
        <div className="space-y-3">
          <p className="text-sm text-charcoal/70">This creates <b>{registration.patientName}</b> ({patient.patientId}) in All Patients, pending accounts approval, with the registration details, the package, the PO and the payment received.</p>
          {error && <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
          <Input label="Father's number *" value={form.number || ''} onChange={(event) => setForm((current) => ({ ...current, number: event.target.value }))} />
          {registration.category !== 'mental_health' && <Input label="Father / Mother name *" value={form.guardianName || ''} onChange={(event) => setForm((current) => ({ ...current, guardianName: event.target.value }))} />}
          <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setDialog(null)} disabled={busy}>Cancel</Button><Button onClick={() => decide('convert')} disabled={busy}>{busy ? 'Converting...' : 'Convert'}</Button></div>
        </div>
      </Modal>

      <Modal open={dialog === 'notPurchased'} onClose={() => !busy && setDialog(null)} title="Package not purchased" className="max-w-lg">
        <div className="space-y-3">
          <p className="text-sm text-charcoal/70"><b>{registration.patientName}</b> will move to Package Not Bought with the package details, so it can be followed up.</p>
          {error && <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
          <div><label className="mb-1.5 block text-sm font-medium text-charcoal">Why was it not purchased? *</label><textarea rows={3} value={form.reason || ''} onChange={(event) => setForm((current) => ({ ...current, reason: event.target.value }))} className={inputClass} /></div>
          <Input label="Next follow-up date" type="date" value={form.followUpDate || ''} onChange={(event) => setForm((current) => ({ ...current, followUpDate: event.target.value }))} />
          <div><label className="mb-1.5 block text-sm font-medium text-charcoal">Notes</label><textarea rows={2} value={form.notes || ''} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} className={inputClass} /></div>
          <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setDialog(null)} disabled={busy}>Cancel</Button><Button onClick={() => decide('notPurchased')} disabled={busy}>{busy ? 'Moving...' : 'Move to Package Not Bought'}</Button></div>
        </div>
      </Modal>
    </div>
  );
};

export default PurchaseOrderStep;
