import { useEffect, useState } from 'react';
import { ArrowLeft, Save, UserCheck } from 'lucide-react';
import api from '../../api/axios.js';
import Button from '../ui/Button.jsx';
import Input from '../ui/Input.jsx';
import Modal from '../ui/Modal.jsx';
import OutcomeBanner from './OutcomeBanner.jsx';
import PurchaseOrderForm from './PurchaseOrderForm.jsx';

// Step 2 of post-counselling when the patient is being converted: the purchase order / payment paper (prefilled),
// then "Convert to patient". (Package not purchased is chosen on the first paper and never needs this one.)
const PurchaseOrderStep = ({ patient, data, readOnly, onData, onBack, onDecided }) => {
  const [values, setValues] = useState(data.purchase.values);
  const [saved, setSaved] = useState(data.purchase.saved);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [dialog, setDialog] = useState(false);
  const [form, setForm] = useState({});
  const [result, setResult] = useState(null);

  useEffect(() => { setValues(data.purchase.values); setSaved(data.purchase.saved); }, [data.purchase]);

  const fee = Number(data.record?.totals?.approvedProgramFee || 0);
  const decided = Boolean(data.outcome);
  const editable = data.canEdit && !readOnly && !decided;
  const registration = data.registration.fields;
  // A returning patient: the purchase goes into their next phase, no new patient is made.
  const existing = data.existingPatient || null;
  const change = (key, value) => { setValues((current) => ({ ...current, [key]: value })); setSaved(false); setNotice(''); };

  const saveNow = async () => {
    const response = await api.put(`/post-counseling/patients/${patient.id}/purchase`, { purchase: values });
    onData(response.data); setSaved(true);
  };
  const save = async () => {
    setBusy(true); setError(''); setNotice('');
    try { await saveNow(); setNotice('Saved'); }
    catch (err) { setError(err.response?.data?.message || 'Could not save'); }
    finally { setBusy(false); }
  };

  // Convert saves the paper first, so what was typed is what gets converted.
  const startConvert = async () => {
    setBusy(true); setError('');
    try {
      if (!values.mode) throw new Error('Select the payment mode first');
      if (!saved) await saveNow();
      setForm({ number: registration.fatherNumber || registration.whatsappNumber || registration.motherNumber || '', guardianName: registration.fatherName || registration.motherName || '' });
      setDialog(true);
    } catch (err) { setError(err.response?.data?.message || err.message || 'Could not save'); }
    finally { setBusy(false); }
  };
  const convert = async () => {
    setBusy(true); setError('');
    try {
      const { data: response } = await api.post(`/post-counseling/patients/${patient.id}/outcome/convert`, form);
      setResult({ kind: 'convert', ...response }); setDialog(false); onDecided?.();
      const refreshed = await api.get(`/post-counseling/patients/${patient.id}/record`, { skipCache: true });
      onData(refreshed.data);
    } catch (err) { setError(err.response?.data?.message || 'Could not convert'); }
    finally { setBusy(false); }
  };

  return (
    <div className="space-y-6">
      {error && <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      <OutcomeBanner outcome={data.outcome} result={result} />

      <PurchaseOrderForm planFromRecord defs={data.purchase.definitions} values={values} onChange={change} fee={fee} contacts={registration} editable={editable} showEmi={data.record?.e?.paymentPlan === 'EMI'} onError={setError} onUploading={setUploading} />

      <div className="sticky bottom-0 flex flex-wrap items-center justify-end gap-2 border-t border-cardline bg-offwhite-100 pt-3">
        {notice && <span className="mr-auto text-sm font-semibold text-sage">{notice}</span>}
        {onBack && <Button variant="outline" onClick={onBack}><ArrowLeft size={15} /> Back</Button>}
        {editable && <Button variant="outline" onClick={save} disabled={busy || uploading}><Save size={15} />{busy ? 'Saving...' : 'Save'}</Button>}
        {editable && <Button onClick={startConvert} disabled={busy || uploading}><UserCheck size={15} /> {existing ? `Convert: add Phase ${data.phase}` : `Convert to patient · Phase ${data.phase || 1}`}</Button>}
      </div>

      <Modal open={dialog} onClose={() => !busy && setDialog(false)} title="Convert to patient" className="max-w-lg">
        <div className="space-y-3">
          {existing
            ? <p className="text-sm text-charcoal/70"><b>{existing.patientName}</b> ({existing.patientCode}) is an existing patient. No new patient is made: this package and the payment received go into <b>Phase {data.phase}</b> of the same patient. A purchase order number (PO-xxxx) is generated and the PO goes to In Transit for verification.</p>
            : <p className="text-sm text-charcoal/70">This creates <b>{registration.patientName}</b> ({patient.patientId}) in All Patients, pending accounts approval, with the registration details, and puts the package and the payment received into <b>Phase {data.phase || 1}</b>. A purchase order number (PO-xxxx) is generated and the PO goes to In Transit for verification.</p>}
          {!(Number(values.amountReceivedNow || 0) > 0) && <p className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">No payment is recorded on this PO. In Transit can add it later.</p>}
          {error && <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
          <Input label="Father's number *" value={form.number || ''} onChange={(event) => setForm((current) => ({ ...current, number: event.target.value }))} />
          {registration.category !== 'mental_health' && <Input label="Father / Mother name *" value={form.guardianName || ''} onChange={(event) => setForm((current) => ({ ...current, guardianName: event.target.value }))} />}
          <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setDialog(false)} disabled={busy}>Cancel</Button><Button onClick={convert} disabled={busy}>{busy ? 'Converting...' : 'Convert'}</Button></div>
        </div>
      </Modal>
    </div>
  );
};

export default PurchaseOrderStep;
