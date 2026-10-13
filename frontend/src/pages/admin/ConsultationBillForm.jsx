import { useEffect, useState } from 'react';
import { FileText, Search, UserRound, IndianRupee } from 'lucide-react';
import api from '../../api/axios.js';
import InvoicePdfStyleSelector from '../../components/InvoicePdfStyleSelector.jsx';

const input = 'w-full min-w-0 rounded-md border border-cardline bg-white px-3 py-2.5 text-sm text-charcoal outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-600/15 disabled:bg-gray-100';
const DEFAULT_FEE = '599';
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const blank = () => ({
  date: today(), consultationDate: today(), paymentDate: today(), patientName: '', patientCode: '', guardianName: '', age: '', gender: '',
  issuedBy: 'Billing Desk', amount: DEFAULT_FEE, paymentMode: 'online', reference: '',
});

function Field({ label, value, onChange, type = 'text', required = false, children, ...rest }) {
  return <label className="block min-w-0 space-y-1.5 text-sm font-medium text-charcoal"><span>{label}{required && <span className="text-red-700"> *</span>}</span>{children || <input className={input} value={value} onChange={(e) => onChange(e.target.value)} type={type} required={required} {...(type === 'number' ? { min: 0, max: 999999999, step: '0.01' } : type === 'text' ? { maxLength: 80 } : {})} {...rest} />}</label>;
}
function Section({ title, icon: Icon, children }) {
  return <section className="border-b border-cardline py-6 last:border-b-0"><h2 className="mb-5 flex items-center gap-2 border-l-4 border-teal-600 pl-3 text-base font-semibold text-charcoal"><Icon size={19} className="text-teal-700" />{title}</h2>{children}</section>;
}

export default function ConsultationBillForm({ initial, onSave, saving, reportError }) {
  const [details, setDetails] = useState(() => (initial ? { ...blank(), ...initial.details } : blank()));
  const [pdfStyle, setPdfStyle] = useState(() => initial?.pdfStyle || 'black-white');
  const [patient, setPatient] = useState(() => (initial?.patient ? { id: initial.patient } : null));
  const [patientQuery, setPatientQuery] = useState('');
  const [patients, setPatients] = useState([]);
  const [searching, setSearching] = useState(false);
  const [lookupError, setLookupError] = useState('');
  const setField = (field, value) => setDetails((d) => ({ ...d, [field]: value }));

  useEffect(() => {
    setPatients([]); setLookupError('');
    if (!patientQuery.trim()) { setSearching(false); return undefined; }
    const controller = new AbortController();
    setSearching(true);
    const timer = setTimeout(async () => {
      try { const { data } = await api.get('/invoices/patients', { params: { q: patientQuery }, signal: controller.signal }); setPatients(data.patients); }
      catch { if (!controller.signal.aborted) setLookupError('Patient lookup failed. Please try again.'); }
      finally { if (!controller.signal.aborted) setSearching(false); }
    }, 300);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [patientQuery]);

  const choosePatient = (p) => {
    setPatient(p);
    setDetails((d) => ({ ...d, patientName: p.patientName, patientCode: p.patientCode, guardianName: p.guardianName, age: p.age, gender: p.gender }));
    setPatientQuery(''); setPatients([]);
  };
  const submit = (e) => {
    e.preventDefault();
    if (!details.patientName.trim()) { reportError('Enter or select the patient.'); return; }
    onSave({ type: 'consultation', patient: patient?.id || null, pdfStyle, details });
  };

  return <form onSubmit={submit} className="min-w-0"><fieldset disabled={saving} className="min-w-0 disabled:opacity-70">
    <div className="overflow-hidden rounded-md border border-cardline bg-white shadow-[0_8px_24px_rgba(39,50,56,0.06)]">
      <div className="flex items-center gap-2 border-b border-cardline bg-[#EEF5F2] px-4 py-3 text-sm font-semibold text-teal-900 sm:px-5"><FileText size={17} className="text-teal-700" />Bill setup</div>
      <div className="grid items-end gap-4 px-4 py-5 sm:grid-cols-2 sm:px-5 xl:grid-cols-[minmax(220px,1.05fr)_minmax(190px,.9fr)_minmax(190px,.9fr)_minmax(310px,1.35fr)]">
        <Field label="Invoice number"><input className={input} disabled value={initial?.invoiceNumber || 'Auto-generated on save'} /></Field>
        <Field label="Invoice date" type="date" required value={details.date} onChange={(v) => setField('date', v)} />
        <Field label="Issued by" value={details.issuedBy} onChange={(v) => setField('issuedBy', v)} />
        <InvoicePdfStyleSelector value={pdfStyle} onChange={setPdfStyle} />
      </div>
    </div>
    <Section title="Patient details" icon={UserRound}>
      <div className="mb-5 max-w-2xl"><Field label="Find patient by name or ID"><div className="relative"><Search size={17} className="absolute left-3 top-3 text-charcoal/50" /><input className={`${input} !pl-10`} placeholder="Patient name or patient ID" autoComplete="off" value={patientQuery} onChange={(e) => setPatientQuery(e.target.value)} /></div></Field>
        {(searching || lookupError || patients.length > 0) && <div className="mt-1 max-h-56 overflow-auto rounded-md border border-cardline bg-white shadow-sm">
          {searching ? <p className="p-3 text-sm">Searching...</p> : lookupError ? <p className="p-3 text-sm text-red-700">{lookupError}</p> : patients.map((p) => <button type="button" key={p.id} className="flex w-full items-center justify-between gap-3 border-b border-cardline px-3 py-2 text-left text-sm last:border-0 hover:bg-teal-50" onClick={() => choosePatient(p)}><span className="font-semibold">{p.patientName}</span><span className="text-xs text-charcoal/60">{p.patientCode || '-'}</span></button>)}
        </div>}
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="Patient name" required value={details.patientName} onChange={(v) => setField('patientName', v)} />
        <Field label="Patient ID" value={details.patientCode} onChange={(v) => setField('patientCode', v)} />
        <Field label="Father / guardian name" value={details.guardianName} onChange={(v) => setField('guardianName', v)} />
        <Field label="Age" value={details.age} onChange={(v) => setField('age', v)} maxLength={25} />
        <Field label="Gender" value={details.gender} onChange={(v) => setField('gender', v)} maxLength={25} />
      </div>
    </Section>
    <Section title="Consultation fee and payment" icon={IndianRupee}>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="Consultation date" type="date" value={details.consultationDate} onChange={(v) => setField('consultationDate', v)} />
        <Field label="Consultation fee (Rs.)" type="number" required value={details.amount} onChange={(v) => setField('amount', v)} />
        <Field label="Payment date" type="date" required value={details.paymentDate} onChange={(v) => setField('paymentDate', v)} />
        <Field label="Payment mode"><select className={input} value={details.paymentMode} onChange={(e) => setField('paymentMode', e.target.value)}><option value="cash">Cash</option><option value="online">Online</option><option value="card">Card</option></select></Field>
        <Field label="UTR / reference (optional)" value={details.reference} onChange={(v) => setField('reference', v)} />
      </div>
    </Section>
    <footer className="flex flex-wrap items-center justify-between gap-4 border-t border-cardline bg-white/70 px-3 py-4 sm:px-5"><p className="text-sm text-charcoal/60">Consultation Bill / PDF</p><button type="submit" disabled={saving} className="inline-flex items-center gap-2 rounded-md bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{saving ? 'Saving PDF...' : initial ? 'Save changes & PDF' : 'Save Consultation Bill & PDF'}</button></footer>
  </fieldset></form>;
}
