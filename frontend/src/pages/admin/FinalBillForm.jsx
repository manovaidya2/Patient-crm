import { useEffect, useState } from 'react';
import { Check, Plus, Search, Settings2, Trash2, UserRound, FileText, CreditCard } from 'lucide-react';
import api from '../../api/axios.js';
import { BILL_DESCRIPTIONS, calculateFinalBill } from '../../utils/finalBillMath.js';
import { useAuth } from '../../context/AuthContext.jsx';
import InvoicePdfStyleSelector from '../../components/InvoicePdfStyleSelector.jsx';

const input = 'w-full min-w-0 rounded-md border border-cardline bg-white px-3 py-2.5 text-sm text-charcoal outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-600/15';
const button = 'inline-flex items-center justify-center gap-2 rounded-md border border-cardline bg-white px-3 py-2 text-sm font-medium hover:bg-teal-50 disabled:opacity-50';
const defaults = { paymentParticulars: ['Consultation Fee', 'First Instalment - Card', 'First Instalment - Cash', 'First Instalment - Online', 'Card Processing Charge', 'Final Instalment'], paymentStatuses: ['FULLY PAID', 'PARTIALLY PAID', 'UNPAID'] };
const blank = () => ({
  date: '', patientName: '', patientCode: '', guardianName: '', age: '', gender: '', issuedBy: 'Billing Desk',
  items: BILL_DESCRIPTIONS.map((description) => ({ description, duration: '', amount: '' })), payments: [], paymentStatus: '',
});
const number = (value) => `Rs ${Number(value).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function Field({ label, value, onChange, type = 'text', required = false, children, ...rest }) {
  return <label className="block min-w-0 space-y-1.5 text-sm font-medium text-charcoal"><span>{label}{required && <span className="text-red-700"> *</span>}</span>{children || <input className={input} value={value} onChange={(e) => onChange(e.target.value)} type={type} required={required} {...(type === 'number' ? { min: 0, max: 999999999, step: '0.01' } : { maxLength: 80 })} {...rest} />}</label>;
}
function Section({ title, icon: Icon, children }) {
  return <section className="border-b border-cardline py-6 last:border-b-0"><h2 className="mb-5 flex items-center gap-2 border-l-4 border-teal-600 pl-3 text-base font-semibold text-charcoal"><Icon size={19} className="text-teal-700" />{title}</h2>{children}</section>;
}

export default function FinalBillForm({ initial, onSave, saving, reportError }) {
  const { user } = useAuth();
  const [details, setDetails] = useState(() => initial ? { ...blank(), ...initial.details } : blank());
  const [pdfStyle, setPdfStyle] = useState(() => initial?.pdfStyle || 'black-white');
  const [patient, setPatient] = useState(() => initial?.patient ? { id: initial.patient, patientName: initial.patientName, patientCode: initial.patientCode } : null);
  const [patientQuery, setPatientQuery] = useState('');
  const [patients, setPatients] = useState([]);
  const [searching, setSearching] = useState(false);
  const [settings, setSettings] = useState(defaults);
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsDraft, setSettingsDraft] = useState(defaults);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [lookupError, setLookupError] = useState('');
  const setField = (field, value) => setDetails((d) => ({ ...d, [field]: value }));
  const changeItem = (index, field, value) => setDetails((d) => ({ ...d, items: d.items.map((row, i) => i === index ? { ...row, [field]: value } : row) }));
  const changePayment = (index, field, value) => setDetails((d) => ({ ...d, payments: d.payments.map((row, i) => i === index ? { ...row, [field]: value } : row) }));

  useEffect(() => {
    let active = true;
    api.get('/invoices/settings', { skipCache: true }).then(({ data }) => {
      if (!active) return;
      setSettings(data); setSettingsDraft(data); setDetails((d) => ({ ...d, paymentStatus: d.paymentStatus || (data.paymentStatuses.includes('UNPAID') ? 'UNPAID' : data.paymentStatuses[0]) }));
    }).catch(() => { if (active) reportError('Could not load payment dropdown settings. Please reload the form.'); }).finally(() => { if (active) setSettingsLoading(false); });
    return () => { active = false; };
  }, [reportError]);

  useEffect(() => {
    setPatients([]); setLookupError('');
    if (!patientQuery.trim()) { setSearching(false); return undefined; }
    const controller = new AbortController();
    setSearching(true);
    const timer = setTimeout(async () => {
      try { const { data } = await api.get('/invoices/patients', { params: { q: patientQuery }, signal: controller.signal }); setPatients(data.patients); }
      catch (error) { if (!controller.signal.aborted) setLookupError('Patient lookup failed. Please try again.'); }
      finally { if (!controller.signal.aborted) setSearching(false); }
    }, 300);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [patientQuery]);

  let calculated;
  try { calculated = calculateFinalBill(details.items, details.payments); } catch { calculated = null; }
  const paymentStatus = details.paymentStatus;
  const statusMismatch = calculated && ((paymentStatus === 'FULLY PAID' && (calculated.outstanding > 0 || calculated.excessReceived > 0)) || (paymentStatus === 'UNPAID' && calculated.amountReceived > 0) || (paymentStatus === 'PARTIALLY PAID' && (calculated.amountReceived <= 0 || calculated.outstanding <= 0)));
  const particularsOptions = [...new Set([...settings.paymentParticulars, ...(initial?.details.payments || []).map((row) => row.particulars)])];
  const statusOptions = [...new Set([...settings.paymentStatuses, initial?.details.paymentStatus].filter(Boolean))];

  function choosePatient(p) {
    setPatient(p); setDetails((d) => ({ ...d, patientName: p.patientName, patientCode: p.patientCode, guardianName: p.guardianName, age: p.age, gender: p.gender }));
    setPatientQuery(''); setPatients([]);
  }
  async function saveSettings() {
    const cleaned = {};
    for (const key of ['paymentParticulars', 'paymentStatuses']) {
      cleaned[key] = settingsDraft[key].map((v) => v.trim()).filter(Boolean);
      if (!cleaned[key].length || new Set(cleaned[key].map((v) => v.toLowerCase())).size !== cleaned[key].length) { reportError('Dropdown options must be non-empty and unique.'); return; }
    }
    setSettingsSaving(true);
    try {
      const { data } = await api.put('/invoices/settings', cleaned);
      setSettings(data); setSettingsDraft(data); setSettingsOpen(false);
      setDetails((d) => ({ ...d, paymentStatus: data.paymentStatuses.includes(d.paymentStatus) ? d.paymentStatus : data.paymentStatuses[0] }));
    } catch (error) { reportError(error.response?.data?.message || 'Dropdown settings could not be saved.'); }
    finally { setSettingsSaving(false); }
  }
  function submit(e) {
    e.preventDefault();
    if (settingsLoading || !calculated) { reportError('Check amounts and dropdown settings before saving.'); return; }
    if (statusMismatch) { reportError('Payment status does not match the received amount.'); return; }
    onSave({ type: 'final-bill', patient: patient?.id || null, pdfStyle, details });
  }

  return <form onSubmit={submit} className="min-w-0"><fieldset disabled={saving || settingsLoading} className="min-w-0 disabled:opacity-70">
    <div className="overflow-hidden rounded-md border border-cardline bg-white shadow-[0_8px_24px_rgba(39,50,56,0.06)]">
      <div className="flex items-center gap-2 border-b border-cardline bg-[#EEF5F2] px-4 py-3 text-sm font-semibold text-teal-900 sm:px-5">
        <FileText size={17} className="text-teal-700" />
        Bill setup
      </div>
      <div className="grid items-end gap-4 px-4 py-5 sm:grid-cols-2 sm:px-5 xl:grid-cols-[minmax(220px,1.05fr)_minmax(190px,.9fr)_minmax(190px,.9fr)_minmax(310px,1.35fr)]">
        <Field label="Invoice number"><input className={input} disabled value={initial?.invoiceNumber || 'Auto-generated on save'} /></Field>
        <Field label="Invoice date" type="date" required value={details.date} onChange={(v) => setField('date', v)} />
        <Field label="Issued by" value={details.issuedBy} onChange={(v) => setField('issuedBy', v)} />
        <InvoicePdfStyleSelector value={pdfStyle} onChange={setPdfStyle} />
      </div>
    </div>
    <Section title="Patient details" icon={UserRound}>
      <div className="mb-5 max-w-2xl"><Field label="Find patient by name or ID"><div className="relative"><Search size={17} className="absolute left-3 top-3 text-charcoal/50" /><input className={`${input} !pl-10`} placeholder="Patient name or patient ID" autoComplete="off" value={patientQuery} onChange={(e) => setPatientQuery(e.target.value)} /></div></Field>
        {patientQuery.trim() && <div className="mt-2 max-h-52 overflow-auto rounded-md border border-cardline bg-white" aria-live="polite">{searching ? <p className="p-3 text-sm">Searching...</p> : lookupError ? <p className="p-3 text-sm text-red-700">{lookupError}</p> : patients.length ? patients.map((p) => <button key={p.id} type="button" className="flex w-full items-center justify-between border-b border-cardline/50 p-3 text-left text-sm hover:bg-teal-50" onClick={() => choosePatient(p)}><span>{p.patientName}<span className="block text-xs text-charcoal/60">{p.guardianName}</span></span><span className="text-teal-700">{p.patientCode || '-'}</span></button>) : <p className="p-3 text-sm text-charcoal/60">No matching patients.</p>}</div>}
        {patient && <p className="mt-2 flex items-center gap-2 text-sm text-teal-700"><Check size={16} />Linked: {patient.patientName} ({patient.patientCode || '-'}) <button type="button" className="ml-2 underline" onClick={() => setPatient(null)}>Unlink</button></p>}
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="Patient name" value={details.patientName} required onChange={(v) => setField('patientName', v)} />
        <Field label="Patient ID" value={details.patientCode} onChange={(v) => setField('patientCode', v)} />
        <Field label="Father / guardian name" value={details.guardianName} onChange={(v) => setField('guardianName', v)} />
        <Field label="Age" value={details.age} onChange={(v) => setField('age', v)} />
        <Field label="Gender" value={details.gender} onChange={(v) => setField('gender', v)} />
      </div>
    </Section>
    <Section title="Invoice details" icon={FileText}>
      <div className="space-y-4">{details.items.map((row, index) => <div key={row.description} className="grid items-end gap-3 border-b border-cardline/70 pb-4 sm:grid-cols-[44px_minmax(150px,1.8fr)_minmax(130px,1fr)_minmax(130px,1fr)]">
        <span className="flex h-10 w-10 items-center justify-center rounded-md bg-teal-50 text-sm font-semibold text-teal-700">{index + 1}</span>
        <Field label="Description"><input className={input} readOnly value={row.description} /></Field>
        <Field label="Date / duration" value={row.duration} onChange={(v) => changeItem(index, 'duration', v)} />
        <Field label="Amount (Rs)" type="number" required value={row.amount} onChange={(v) => changeItem(index, 'amount', v)} />
      </div>)}</div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 bg-teal-50 p-4 text-sm"><strong>Total amount (including card charge)</strong><strong className="text-base text-teal-700">{calculated ? number(calculated.totalPayable) : 'Check amounts'}</strong></div>
    </Section>
    <Section title="Payment receipts" icon={CreditCard}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-charcoal/60">Add each received payment separately.</p><div className="flex gap-2">{user?.role === 'admin' && <button type="button" className={button} onClick={() => setSettingsOpen((open) => !open)}><Settings2 size={16} />Dropdown settings</button>}<button type="button" className={button} disabled={details.payments.length >= 100} onClick={() => setField('payments', [...details.payments, { date: '', particulars: '', received: '' }])}><Plus size={16} />Add payment row</button></div></div>
      {settingsOpen && <div className="mb-5 border-y border-cardline bg-teal-50/50 p-4"><h3 className="mb-4 font-semibold">Final Bill dropdown settings</h3><div className="grid gap-5 lg:grid-cols-2">{[['paymentParticulars', 'Payment particulars'], ['paymentStatuses', 'Payment statuses']].map(([key, label]) => <div key={key}><h4 className="mb-2 text-sm font-semibold">{label}</h4><div className="space-y-2">{settingsDraft[key].map((value, i) => <div key={`${key}-${i}`} className="flex gap-2"><input className={input} maxLength={80} value={value} onChange={(e) => setSettingsDraft((d) => ({ ...d, [key]: d[key].map((option, n) => n === i ? e.target.value : option) }))} /><button type="button" className={button} title="Remove option" aria-label={`Remove ${label} option ${i + 1}`} disabled={settingsDraft[key].length <= 1} onClick={() => setSettingsDraft((d) => ({ ...d, [key]: d[key].filter((_, n) => n !== i) }))}><Trash2 size={16} /></button></div>)}</div><button type="button" className={`${button} mt-2`} disabled={settingsDraft[key].length >= 100} onClick={() => setSettingsDraft((d) => ({ ...d, [key]: [...d[key], ''] }))}><Plus size={16} />Add option</button></div>)}</div><button type="button" className="mt-5 rounded-md bg-teal-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" disabled={settingsSaving} onClick={saveSettings}>{settingsSaving ? 'Saving...' : 'Save dropdowns'}</button></div>}
      <div className="space-y-3">{details.payments.map((row, index) => <div key={index} className="grid items-end gap-3 border-b border-cardline/70 pb-4 sm:grid-cols-[minmax(135px,1fr)_minmax(190px,2fr)_minmax(130px,1fr)_42px]">
        <Field label={`Payment ${index + 1} date`} required type="date" value={row.date} onChange={(v) => changePayment(index, 'date', v)} />
        <Field label="Payment particulars" required><select className={input} value={row.particulars} required onChange={(e) => changePayment(index, 'particulars', e.target.value)}><option value="">Select particulars</option>{particularsOptions.map((option) => <option key={option} value={option}>{option}</option>)}</select></Field>
        <Field label="Received (Rs)" type="number" required value={row.received} onChange={(v) => changePayment(index, 'received', v)} />
        <button type="button" className={`${button} h-10 w-10 justify-self-end`} title="Remove payment row" aria-label={`Remove payment ${index + 1}`} onClick={() => setField('payments', details.payments.filter((_, i) => i !== index))}><Trash2 size={16} /></button>
      </div>)}</div>
      {!details.payments.length && <p className="py-6 text-center text-sm text-charcoal/60">No payments recorded yet.</p>}
      <div className="mt-4 grid gap-3 border-y border-cardline bg-white/70 p-4 text-sm sm:grid-cols-3"><p>Total received <strong className="block text-base text-teal-700">{calculated ? number(calculated.amountReceived) : '-'}</strong></p><p>Outstanding <strong className="block text-base">{calculated ? number(calculated.outstanding) : '-'}</strong></p><p>Excess received <strong className="block text-base">{calculated ? number(calculated.excessReceived) : '-'}</strong></p></div>
      <div className="mt-5 max-w-sm"><Field label="Payment status" required><select className={input} value={details.paymentStatus} required onChange={(e) => setField('paymentStatus', e.target.value)}><option value="">Select status</option>{statusOptions.map((status) => <option key={status} value={status}>{status}</option>)}</select></Field></div>
      {statusMismatch && <p className="mt-2 text-sm text-red-700">Payment status does not match the received amount.</p>}
      <p className="mt-5 text-sm text-charcoal/70">Amount in words: <strong className="text-charcoal">{calculated?.amountInWords || '-'}</strong></p>
    </Section>
    <footer className="flex flex-wrap items-center justify-between gap-4 border-t border-cardline bg-white/70 px-3 py-4 sm:px-5"><p className="text-sm text-charcoal/60">Final Bill / PDF</p><button type="submit" disabled={saving || settingsLoading || !calculated || statusMismatch} className="inline-flex items-center gap-2 rounded-md bg-teal-700 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{saving ? 'Saving PDF...' : initial ? 'Save changes & PDF' : 'Save Final Bill & PDF'}</button></footer>
  </fieldset></form>;
}
