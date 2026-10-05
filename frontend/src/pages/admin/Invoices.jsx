import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ChevronLeft, ChevronRight, Check, CreditCard, Download, Eye, FileText, Plus, Printer, Save, Search, UserRound, X, CalendarDays } from 'lucide-react';
import api from '../../api/axios.js';

const inputClass = 'w-full min-w-0 rounded-md border border-cardline bg-white px-3 py-2.5 text-sm text-charcoal outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-600/15 disabled:bg-gray-100';
const buttonClass = 'inline-flex items-center justify-center gap-2 rounded-md border border-cardline bg-white px-3 py-2.5 text-sm font-semibold text-charcoal hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed';
const primaryClass = `${buttonClass} !border-teal-700 !bg-teal-700 !text-white hover:!bg-teal-800`;
const modeOptions = [['cash', 'Cash'], ['online', 'Online'], ['card', 'Card'], ['emi', 'EMI'], ['other', 'Other']];
const billingFields = [['consultationFee', 'Consultation fee'], ['treatmentAmount', 'Treatment / formulation order'], ['adjustment', 'Adjustment / concession'], ['totalPayable', 'Total agreed payable'], ['amountReceived', 'Amount received'], ['outstanding', 'Outstanding after payment']];
const blankDetails = () => ({
  date: '', purchaseOrder: '', patientName: '', patientCode: '', guardianName: '', age: '', gender: '',
  consultationFee: '', treatmentAmount: '', adjustment: '', totalPayable: '', amountReceived: '', outstanding: '',
  paymentModes: [], reference: '', cardCharge: '', cashCollectedBy: '', handedTo: '', time: '',
  instalments: Array.from({ length: 3 }, () => ({ amount: '', dueDate: '', status: '' })),
  emiProvider: '', helpline: '', poVerified: 'pending',
});
const newKey = () => Array.from(crypto.getRandomValues(new Uint32Array(4)), (n) => n.toString(16).padStart(8, '0')).join('');
const money = (value) => `Rs ${Number(value || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const dateLabel = (value) => value ? value.split('-').reverse().join('/') : '-';

function Field({ label, value, onChange, type = 'text', required = false, children, ...props }) {
  return <label className="block min-w-0 space-y-1.5 text-sm font-medium text-charcoal">
    <span>{label}{required && <span className="ml-1 text-red-700">*</span>}</span>
    {children || <input className={inputClass} type={type} value={value} onChange={(e) => onChange(e.target.value)} required={required} {...(type === 'number' ? { min: 0, max: 999999999, step: '0.01' } : { maxLength: 80 })} {...props} />}
  </label>;
}

function Section({ title, icon: Icon, children }) {
  return <section className="border-b border-cardline py-6 last:border-b-0">
    <h2 className="mb-5 flex items-center gap-2 border-l-4 border-teal-600 pl-3 text-base font-semibold text-charcoal"><Icon size={19} className="text-teal-700" />{title}</h2>
    {children}
  </section>;
}

export default function Invoices() {
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(0);
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [reload, setReload] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [editing, setEditing] = useState(false);
  const [details, setDetails] = useState(blankDetails);
  const [patient, setPatient] = useState(null);
  const [patientQuery, setPatientQuery] = useState('');
  const [patients, setPatients] = useState([]);
  const [searching, setSearching] = useState(false);
  const [patientSearchError, setPatientSearchError] = useState('');
  const [saving, setSaving] = useState(false);
  const [pdfBusy, setPdfBusy] = useState('');
  const [preview, setPreview] = useState(null);
  const [pdfReady, setPdfReady] = useState(false);
  const submissionKey = useRef('');
  const pdfFrame = useRef(null);
  const pdfUrl = useRef(null);
  const busyRef = useRef(false);
  const setField = (key, value) => setDetails((d) => ({ ...d, [key]: value }));

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const { data } = await api.get('/invoices', { params: { q: query, from, to, page }, signal: controller.signal });
        setRows(data.invoices); setTotal(data.total); setPages(data.pages);
      } catch (err) { if (!controller.signal.aborted) setError(err.response?.data?.message || 'Could not load receipts.'); }
      finally { if (!controller.signal.aborted) setLoading(false); }
    }, 250);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [query, from, to, page, reload]);

  useEffect(() => {
    setPatients([]); setPatientSearchError('');
    if (!editing || !patientQuery.trim()) { setSearching(false); return undefined; }
    const controller = new AbortController();
    setSearching(true);
    const timer = setTimeout(async () => {
      try {
        const { data } = await api.get('/invoices/patients', { params: { q: patientQuery }, signal: controller.signal });
        setPatients(data.patients);
      } catch (err) { if (!controller.signal.aborted) setPatientSearchError(err.response?.data?.message || 'Patient search failed. Please retry.'); }
      finally { if (!controller.signal.aborted) setSearching(false); }
    }, 300);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [patientQuery, editing]);

  useEffect(() => () => { if (pdfUrl.current) URL.revokeObjectURL(pdfUrl.current); }, []);
  useEffect(() => {
    if (!preview) return undefined;
    const handler = (e) => { if (e.key === 'Escape') setPreview(null); };
    window.addEventListener('keydown', handler);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', handler); document.body.style.overflow = previous; };
  }, [preview]);

  function startReceipt() {
    setDetails(blankDetails()); setPatient(null); setPatientQuery(''); setPatients([]);
    submissionKey.current = newKey(); setError(''); setNotice(''); setEditing(true);
  }

  function selectPatient(p) {
    setPatient(p);
    setDetails((d) => ({ ...d, patientName: p.patientName, patientCode: p.patientCode, guardianName: p.guardianName, age: p.age, gender: p.gender }));
    setPatientQuery(''); setPatients([]);
  }

  async function saveReceipt(e) {
    e.preventDefault();
    if (busyRef.current) return;
    if (!details.paymentModes.length) { setError('Select at least one payment mode.'); return; }
    busyRef.current = true; setSaving(true); setError('');
    try {
      const { data } = await api.post('/invoices', { type: 'part-payment', submissionKey: submissionKey.current, patient: patient?.id || null, details });
      setEditing(false); setQuery(''); setFrom(''); setTo(''); setPage(1); setReload((n) => n + 1);
      setNotice(`${data.invoice.invoiceNumber} saved. PDF ready to download or print.`);
      await openPdf(data.invoice);
    } catch (err) { setError(err.response?.data?.message || 'Receipt could not be saved. Please retry.'); }
    finally { busyRef.current = false; setSaving(false); }
  }

  async function openPdf(row, download = false) {
    setPdfBusy(row.id); setError('');
    try {
      const { data } = await api.get(`/invoices/${row.id}/pdf`, { responseType: 'blob', skipCache: true });
      const url = URL.createObjectURL(new Blob([data], { type: 'application/pdf' }));
      if (download) {
        const link = document.createElement('a'); link.href = url; link.download = row.fileName;
        document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 60000);
      } else {
        if (pdfUrl.current) URL.revokeObjectURL(pdfUrl.current);
        pdfUrl.current = url; setPdfReady(false); setPreview({ ...row, url });
      }
    } catch { setError('Could not open the saved PDF. Please try again.'); }
    finally { setPdfBusy(''); }
  }

  function printPdf() {
    try { pdfFrame.current.contentWindow.focus(); pdfFrame.current.contentWindow.print(); }
    catch { setError('Open the PDF in a new tab and use the browser print option.'); }
  }

  return <div className="mx-auto max-w-[1500px] p-3 text-charcoal sm:p-6">
    <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-3">
        {editing && <button type="button" className={buttonClass} title="Back to receipts" aria-label="Back to receipts" disabled={saving} onClick={() => { if (window.confirm('Discard this unsaved receipt?')) { setEditing(false); setError(''); } }}><ArrowLeft size={18} /></button>}
        <div><h1 className="text-xl font-bold sm:text-2xl">{editing ? 'Part-payment receipt' : 'Invoices'}</h1><p className="mt-1 text-sm text-charcoal/60">{editing ? 'ManoVaidya / Treatment order' : `${total} saved receipts`}</p></div>
      </div>
      {!editing && <button className={primaryClass} onClick={startReceipt}><Plus size={17} />New receipt</button>}
    </header>
    {error && <div role="alert" className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}<button className="float-right ml-3" onClick={() => setError('')} aria-label="Dismiss error"><X size={16} /></button></div>}
    {notice && !editing && <p role="status" className="mb-4 rounded-md border border-teal-200 bg-teal-50 p-3 text-sm text-teal-800">{notice}</p>}

    {editing ? <form onSubmit={saveReceipt}>
      <fieldset disabled={saving} className="min-w-0 disabled:opacity-70">
        <div className="grid gap-4 border-y border-cardline bg-white/60 px-3 py-5 sm:grid-cols-3 sm:px-5">
          <Field label="Receipt number"><input className={inputClass} value="Auto-generated on save" disabled /></Field>
          <Field label="Receipt date" type="date" required value={details.date} onChange={(v) => setField('date', v)} />
          <Field label="Purchase order number" value={details.purchaseOrder} onChange={(v) => setField('purchaseOrder', v)} />
        </div>
        <Section title="Patient details" icon={UserRound}>
          <div className="mb-5 max-w-2xl">
            <Field label="Find patient by name or ID"><div className="relative"><Search size={17} className="absolute left-3 top-3 text-charcoal/50" /><input className={`${inputClass} !pl-10`} value={patientQuery} onChange={(e) => setPatientQuery(e.target.value)} placeholder="Patient name or patient ID" autoComplete="off" maxLength={100} /></div></Field>
            {patientQuery.trim() && <div className="mt-2 max-h-56 overflow-auto rounded-md border border-cardline bg-white" aria-live="polite">
              {searching ? <p className="p-3 text-sm">Searching...</p> : patientSearchError ? <p className="p-3 text-sm text-red-700">{patientSearchError}</p> : patients.length ? patients.map((p) => <button type="button" key={p.id} className="flex w-full items-center justify-between gap-3 border-b border-gray-100 p-3 text-left text-sm hover:bg-teal-50" onClick={() => selectPatient(p)}><span className="min-w-0 break-words font-semibold">{p.patientName}<span className="block text-xs font-normal text-charcoal/60">{p.guardianName}</span></span><span className="shrink-0 text-teal-700">{p.patientCode || '-'}</span></button>) : <p className="p-3 text-sm text-charcoal/60">No matching patients.</p>}
            </div>}
            {patient && <div className="mt-2 flex items-center gap-2 text-sm text-teal-700"><Check size={16} /><span>Linked: {patient.patientName} ({patient.patientCode || '-'})</span><button type="button" className="ml-auto p-1" title="Unlink patient" aria-label="Unlink patient" onClick={() => setPatient(null)}><X size={16} /></button></div>}
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Patient name" required value={details.patientName} onChange={(v) => setField('patientName', v)} />
            <Field label="Patient ID" value={details.patientCode} onChange={(v) => setField('patientCode', v)} />
            <Field label="Father / guardian name" value={details.guardianName} onChange={(v) => setField('guardianName', v)} />
            <Field label="Age" value={details.age} maxLength={25} onChange={(v) => setField('age', v)} />
            <Field label="Gender" value={details.gender} maxLength={25} onChange={(v) => setField('gender', v)} />
          </div>
        </Section>
        <Section title="Billing & agreed payment" icon={FileText}>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {billingFields.map(([key, label], i) => <Field key={key} label={`${label} (Rs)`} type="number" required={i >= 3} value={details[key]} onChange={(v) => setField(key, v)} />)}
          </div>
        </Section>
        <Section title="Payment details" icon={CreditCard}>
          <fieldset><legend className="mb-2 text-sm font-medium">Payment mode <span className="text-red-700">*</span></legend><div className="mb-5 flex flex-wrap gap-2">
            {modeOptions.map(([key, label]) => <label key={key} className={`flex cursor-pointer items-center gap-2 rounded-md border px-4 py-2.5 text-sm font-medium ${details.paymentModes.includes(key) ? 'border-teal-700 bg-teal-700 text-white' : 'border-cardline bg-white text-charcoal'}`}><input type="checkbox" className="h-4 w-4 accent-teal-600" checked={details.paymentModes.includes(key)} onChange={(e) => setField('paymentModes', e.target.checked ? [...details.paymentModes, key] : details.paymentModes.filter((m) => m !== key))} />{label}</label>)}
          </div></fieldset>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="UTR / transaction / card reference" value={details.reference} onChange={(v) => setField('reference', v)} />
            <Field label="Card charge (Rs)" type="number" value={details.cardCharge} onChange={(v) => setField('cardCharge', v)} />
            <Field label="Cash collected by" required={details.paymentModes.includes('cash')} value={details.cashCollectedBy} onChange={(v) => setField('cashCollectedBy', v)} />
            <Field label="Handed to" value={details.handedTo} onChange={(v) => setField('handedTo', v)} />
            <Field label="Time" type="time" value={details.time} onChange={(v) => setField('time', v)} />
          </div>
        </Section>
        <Section title="Agreed future instalments" icon={CalendarDays}>
          <div className="space-y-4">
            {details.instalments.map((row, index) => <div key={index} className="grid items-end gap-3 border-b border-cardline/60 pb-4 sm:grid-cols-[90px_1fr_1fr_1fr]">
              <p className="self-center text-sm font-semibold">{index === 2 ? 'Part 3 / Other' : `Part ${index + 1}`}</p>
              <Field label="Agreed amount (Rs)" type="number" value={row.amount} onChange={(v) => setField('instalments', details.instalments.map((r, i) => i === index ? { ...r, amount: v } : r))} />
              <Field label="Due date" type="date" value={row.dueDate} onChange={(v) => setField('instalments', details.instalments.map((r, i) => i === index ? { ...r, dueDate: v } : r))} />
              <Field label="Status"><select className={inputClass} value={row.status} onChange={(e) => setField('instalments', details.instalments.map((r, i) => i === index ? { ...r, status: e.target.value } : r))}><option value="">Not set</option><option value="pending">Pending</option><option value="received">Received</option></select></Field>
            </div>)}
          </div>
          <div className="mt-5 grid gap-4 sm:grid-cols-2"><Field label="EMI provider / application reference" value={details.emiProvider} onChange={(v) => setField('emiProvider', v)} /><Field label="Patient helpline" value={details.helpline} onChange={(v) => setField('helpline', v)} /></div>
          <fieldset className="mt-5"><legend className="mb-2 text-sm font-medium">Purchase order verified</legend><div className="flex gap-5">{[['yes', 'Yes'], ['pending', 'Pending']].map(([value, label]) => <label key={value} className="flex items-center gap-2 text-sm"><input type="radio" name="poVerified" className="accent-teal-700" checked={details.poVerified === value} onChange={() => setField('poVerified', value)} />{label}</label>)}</div></fieldset>
        </Section>
        <footer className="flex flex-wrap items-center justify-between gap-4 border-t border-cardline bg-white/70 px-3 py-4 sm:px-5">
          <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm"><span>Received <strong className="ml-2 text-teal-700">{money(details.amountReceived)}</strong></span><span>Outstanding <strong className="ml-2">{money(details.outstanding)}</strong></span></div>
          <button type="submit" className={primaryClass} disabled={saving}><Save size={17} />{saving ? 'Saving PDF...' : 'Save receipt & PDF'}</button>
        </footer>
      </fieldset>
    </form> : <>
      <div className="mb-4 border-b border-cardline"><span className="inline-flex items-center gap-2 border-b-2 border-teal-700 px-1 py-3 text-sm font-semibold text-teal-700"><FileText size={18} />Part-payment receipts</span></div>
      <div className="mb-5 grid items-end gap-3 sm:grid-cols-[minmax(200px,1fr)_160px_160px_auto]">
        <Field label="Search receipts"><div className="relative"><Search size={17} className="absolute left-3 top-3 text-charcoal/50" /><input className={`${inputClass} !pl-10`} placeholder="Invoice number, patient name or ID" value={query} onChange={(e) => { setQuery(e.target.value); setPage(1); }} /></div></Field>
        <Field label="From" type="date" value={from} onChange={(v) => { setFrom(v); setPage(1); }} />
        <Field label="To" type="date" value={to} min={from} onChange={(v) => { setTo(v); setPage(1); }} />
        <button className={buttonClass} onClick={() => { setQuery(''); setFrom(''); setTo(''); setPage(1); setError(''); setReload((v) => v + 1); }}>Reset</button>
      </div>
      <div className="overflow-x-auto rounded-md border border-cardline bg-white/60" aria-busy={loading}>
        <table className="w-full min-w-[930px] text-left text-sm">
          <thead className="bg-teal-900 text-white"><tr>{['Receipt', 'Patient', 'Receipt date', 'Received', 'Outstanding', 'Issued by', 'PDF'].map((text) => <th key={text} className="whitespace-nowrap px-4 py-3 font-semibold">{text}</th>)}</tr></thead>
          <tbody>{loading ? <tr><td colSpan={7} className="p-10 text-center text-charcoal/60">Loading receipts...</td></tr> : rows.length ? rows.map((row) => <tr key={row.id} className="border-b border-cardline last:border-0 hover:bg-white">
            <td className="whitespace-nowrap px-4 py-4 font-semibold">{row.invoiceNumber}</td><td className="px-4 py-4"><span className="font-semibold">{row.patientName}</span><span className="block text-xs text-charcoal/60">{row.patientCode || '-'}</span></td><td className="whitespace-nowrap px-4 py-4">{dateLabel(row.date)}</td><td className="whitespace-nowrap px-4 py-4 text-teal-700">{money(row.details.amountReceived)}</td><td className="whitespace-nowrap px-4 py-4">{money(row.details.outstanding)}</td><td className="px-4 py-4">{row.createdByName || '-'}</td>
            <td className="px-4 py-4"><div className="flex gap-2"><button className={buttonClass} title="View / print receipt" aria-label={`View ${row.invoiceNumber}`} disabled={!!pdfBusy} onClick={() => openPdf(row)}><Eye size={17} /></button><button className={buttonClass} title="Download PDF" aria-label={`Download ${row.invoiceNumber}`} disabled={!!pdfBusy} onClick={() => openPdf(row, true)}><Download size={17} /></button></div></td>
          </tr>) : <tr><td colSpan={7} className="p-12 text-center text-charcoal/60">No receipts found.</td></tr>}</tbody>
        </table>
      </div>
      <div className="mt-4 flex items-center justify-between gap-3 text-sm text-charcoal/60"><span>{total} receipts</span><div className="flex items-center gap-3"><button className={buttonClass} aria-label="Previous page" disabled={page <= 1 || loading} onClick={() => setPage((n) => n - 1)}><ChevronLeft size={16} /></button><span>{page} / {Math.max(1, pages)}</span><button className={buttonClass} aria-label="Next page" disabled={page >= pages || loading} onClick={() => setPage((n) => n + 1)}><ChevronRight size={16} /></button></div></div>
    </>}
    {preview && <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-2 sm:p-5" role="dialog" aria-modal="true" aria-labelledby="receipt-preview-title">
      <div className="flex h-[94dvh] w-full max-w-5xl flex-col overflow-hidden rounded-lg bg-white shadow-xl">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b p-3 sm:p-4"><div className="min-w-0"><h2 id="receipt-preview-title" className="text-base font-semibold">Part-payment receipt</h2><p className="break-words text-xs text-charcoal/60">{preview.invoiceNumber} / {preview.patientName}</p></div><div className="flex flex-wrap gap-2"><a className={buttonClass} href={preview.url} download={preview.fileName} title="Download PDF"><Download size={17} /><span className="hidden sm:inline">Download</span></a><button className={buttonClass} disabled={!pdfReady} onClick={printPdf} title="Print receipt"><Printer size={17} /><span className="hidden sm:inline">Print</span></button><button className={buttonClass} onClick={() => setPreview(null)} title="Close preview" aria-label="Close preview" autoFocus><X size={18} /></button></div></header>
        <div className="flex justify-end border-b px-4 py-2"><a className="text-sm font-medium text-teal-700 underline" href={preview.url} target="_blank" rel="noreferrer">Open PDF in new tab</a></div>
        <iframe ref={pdfFrame} title="Part-payment receipt PDF" src={preview.url} className="min-h-0 w-full flex-1 border-0 bg-gray-100" onLoad={() => setPdfReady(true)} />
      </div>
    </div>}
  </div>;
}
