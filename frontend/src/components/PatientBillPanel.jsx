import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Download, Eye, FileText, Plus, Printer, Receipt, Trash2 } from 'lucide-react';
import api from '../api/axios.js';
import Button from './ui/Button.jsx';
import Modal from './ui/Modal.jsx';
import InvoicePdfStyleSelector from './InvoicePdfStyleSelector.jsx';
import { calculateFinalBill } from '../utils/finalBillMath.js';
import { useAuth } from '../context/AuthContext.jsx';

const DEFAULT_CONSULTATION_FEE = 599;
const CARD_RATE = 0.03;
const DEFAULT_PARTICULARS = ['Consultation Fee', 'First Instalment - Card', 'First Instalment - Cash', 'First Instalment - Online', 'Card Processing Charge', 'Final Instalment'];
const DEFAULT_STATUSES = ['FULLY PAID', 'PARTIALLY PAID', 'UNPAID'];
const inputClass = 'w-full min-w-0 rounded-md border border-cardline bg-white px-3 py-2 text-sm text-charcoal outline-none focus:border-sage focus:ring-2 focus:ring-sage/15 disabled:bg-gray-100';

const inr = (value) => `Rs ${Number(value || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const amountText = (value) => (Math.round(Number(value || 0) * 100) / 100).toFixed(2);
const toNumber = (value) => (value === '' || value == null || Number.isNaN(Number(value)) ? 0 : Number(value));
const dateOnly = (value) => {
  const d = value ? new Date(value) : null;
  if (!d || Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const label = (value) => (value ? value.split('-').reverse().join('/') : '-');
const paymentOrder = (a, b) => new Date(a.date || a.createdAt) - new Date(b.date || b.createdAt) || new Date(a.createdAt) - new Date(b.createdAt);
const newKey = () => Array.from(crypto.getRandomValues(new Uint32Array(4)), (n) => n.toString(16).padStart(8, '0')).join('');
const verifiedPayments = (stage) => (stage.payments || []).filter((pay) => pay.approvalStatus === 'approved').sort(paymentOrder);

const describePayment = (pay) => [
  pay.paymentModeLabel || pay.paymentMode,
  pay.payToBankName,
  pay.utr ? `UTR ${pay.utr}` : (pay.transactionId ? `Txn ${pay.transactionId}` : (pay.receivedBy ? `Received by ${pay.receivedBy}` : '')),
  label(dateOnly(pay.date)),
].filter(Boolean).join(' - ');

function Field({ title, children, hint }) {
  return <label className="block min-w-0 space-y-1 text-sm font-medium text-charcoal"><span>{title}</span>{children}{hint && <span className="block text-[11px] font-normal text-charcoal/55">{hint}</span>}</label>;
}

function CardToggle({ checked, onChange, charge, onCharge, hint }) {
  return (
    <div className="rounded-md border border-cardline bg-white p-3">
      <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />Card payment - add card charge (3% of paid amount)</label>
      {checked && <div className="mt-3 max-w-xs"><Field title="Card charge (Rs.)" hint={hint}><input className={inputClass} type="number" min="0" step="0.01" value={charge} onChange={(e) => onCharge(e.target.value)} /></Field></div>}
    </div>
  );
}

function PartBillForm({ patient, stage, onClose, onSaved }) {
  const approved = useMemo(() => verifiedPayments(stage), [stage]);
  const [selected, setSelected] = useState(() => approved.slice(-1).map((p) => p.id));
  const [consultationFee, setConsultationFee] = useState(String(DEFAULT_CONSULTATION_FEE));
  const [adjustment, setAdjustment] = useState('0');
  const [useCard, setUseCard] = useState(false);
  const [cardOverride, setCardOverride] = useState(null);
  const [outstandingOverride, setOutstandingOverride] = useState(null);
  const [text, setText] = useState({ purchaseOrder: stage.purchaseOrder || '', helpline: '', emiProvider: '', guardianName: patient.guardianName || patient.relativeName || '', age: String(stage.age || patient.age || ''), gender: patient.gender || '' });
  const [dateOverride, setDateOverride] = useState(null);
  const [noteOverride, setNoteOverride] = useState(null);
  const [instalments, setInstalments] = useState(null);
  const [poVerified, setPoVerified] = useState('pending');
  const [pdfStyle, setPdfStyle] = useState('black-white');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const submissionKey = useRef(newKey());

  const chosen = approved.filter((pay) => selected.includes(pay.id));
  const received = chosen.reduce((sum, pay) => sum + Number(pay.amount || 0), 0);
  const treatment = Number(stage.totalAmount || 0);
  const totalPayable = Math.max(treatment - toNumber(adjustment), 0);
  const latest = chosen[chosen.length - 1];
  const coversAll = latest && latest.id === approved[approved.length - 1]?.id;
  const paidToDate = !latest ? 0 : coversAll ? Number(stage.amountPaid || 0) : approved.slice(0, approved.indexOf(latest) + 1).reduce((sum, pay) => sum + Number(pay.amount || 0), 0);
  const autoOutstanding = Math.max(totalPayable - paidToDate, 0);
  const outstanding = outstandingOverride ?? amountText(autoOutstanding);
  const cardCharge = useCard ? (cardOverride ?? amountText(received * CARD_RATE)) : '';
  const date = dateOverride ?? dateOnly(latest?.date);
  const paymentNote = (noteOverride ?? chosen.map(describePayment).join(' | ')).slice(0, 120);
  const rows = instalments ?? [{ amount: autoOutstanding > 0 ? amountText(autoOutstanding) : '', dueDate: '', status: autoOutstanding > 0 ? 'pending' : '' }, { amount: '', dueDate: '', status: '' }, { amount: '', dueDate: '', status: '' }];
  const setRow = (index, field, value) => setInstalments(rows.map((row, i) => (i === index ? { ...row, [field]: value } : row)));
  const toggle = (id) => setSelected((old) => (old.includes(id) ? old.filter((x) => x !== id) : [...old, id]));

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    if (!chosen.length) return setError('Select at least one verified payment for this bill');
    if (!date) return setError('Enter the bill date');
    setSaving(true);
    try {
      const details = {
        stageNumber: stage.number, paymentIds: chosen.map((p) => p.id), paymentNote, date,
        patientName: patient.patientName, patientCode: patient.patientCode || '', guardianName: text.guardianName, age: text.age, gender: text.gender,
        purchaseOrder: text.purchaseOrder, helpline: text.helpline, emiProvider: text.emiProvider, poVerified,
        consultationFee: amountText(consultationFee), treatmentAmount: amountText(treatment), adjustment: amountText(adjustment),
        totalPayable: amountText(totalPayable), amountReceived: amountText(received), outstanding: amountText(outstanding),
        cardCharge: cardCharge === '' ? '' : amountText(cardCharge),
        instalments: rows.map((row) => ({ amount: row.amount === '' ? '' : amountText(row.amount), dueDate: row.dueDate, status: row.status })),
        paymentModes: [...new Set(chosen.map((p) => p.paymentMode).filter((m) => ['cash', 'online'].includes(m)))],
      };
      const { data } = await api.post('/invoices', { type: 'part-payment', patient: patient.id, pdfStyle, submissionKey: submissionKey.current, details });
      onSaved(data.invoice);
    } catch (err) {
      setError(err.response?.data?.message || 'Bill could not be created');
    } finally { setSaving(false); }
  };

  return (
    <form onSubmit={submit} className="space-y-5">
      {error && <div className="rounded-lg bg-[#8C3B2E]/8 px-3.5 py-3 text-sm text-[#8C3B2E]">{error}</div>}
      <section className="space-y-2">
        <h3 className="text-sm font-bold text-charcoal">Verified payments - Phase {stage.number}</h3>
        {approved.length === 0 ? <p className="rounded-md bg-offwhite-200 p-3 text-sm text-charcoal/65">No verified payment yet. Bills can only be made from payments approved by accounts.</p> : (
          <ul className="space-y-2">
            {approved.map((pay) => (
              <li key={pay.id}>
                <label className={`flex cursor-pointer items-start gap-3 rounded-md border p-3 text-sm ${selected.includes(pay.id) ? 'border-sage bg-sage/5' : 'border-cardline bg-white'}`}>
                  <input type="checkbox" className="mt-1" checked={selected.includes(pay.id)} onChange={() => toggle(pay.id)} />
                  <span className="min-w-0 flex-1"><span className="block font-semibold">{inr(pay.amount)}</span><span className="block text-xs text-charcoal/65">{describePayment(pay)}</span></span>
                </label>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="grid gap-3 sm:grid-cols-2">
        <Field title="Bill date"><input className={inputClass} type="date" required value={date} onChange={(e) => setDateOverride(e.target.value)} /></Field>
        <Field title="Purchase order no."><input className={inputClass} maxLength={80} value={text.purchaseOrder} onChange={(e) => setText({ ...text, purchaseOrder: e.target.value })} /></Field>
        <Field title="Father / guardian"><input className={inputClass} maxLength={80} value={text.guardianName} onChange={(e) => setText({ ...text, guardianName: e.target.value })} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field title="Age"><input className={inputClass} maxLength={25} value={text.age} onChange={(e) => setText({ ...text, age: e.target.value })} /></Field>
          <Field title="Gender"><input className={inputClass} maxLength={25} value={text.gender} onChange={(e) => setText({ ...text, gender: e.target.value })} placeholder="Male / Female" /></Field>
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-bold text-charcoal">Billing &amp; agreed payment schedule</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field title="Consultation fee (Rs.)"><input className={inputClass} type="number" min="0" step="0.01" value={consultationFee} onChange={(e) => setConsultationFee(e.target.value)} /></Field>
          <Field title="Customized treatment / formulation (Rs.)" hint="Total amount of this phase from Patient Details"><input className={inputClass} value={amountText(treatment)} disabled readOnly /></Field>
          <Field title="Adjustment / concession (Rs.)"><input className={inputClass} type="number" min="0" max={treatment} step="0.01" value={adjustment} onChange={(e) => setAdjustment(e.target.value)} /></Field>
          <Field title="Total agreed payable (Rs.)" hint="Treatment amount minus adjustment"><input className={inputClass} value={amountText(totalPayable)} disabled readOnly /></Field>
          <Field title="Amount received against this bill (Rs.)" hint="Sum of the payments selected above"><input className={inputClass} value={amountText(received)} disabled readOnly /></Field>
          <Field title="Outstanding balance after this payment (Rs.)" hint="Defaults to the amount left in Patient Details"><input className={inputClass} type="number" min="0" step="0.01" value={outstanding} onChange={(e) => setOutstandingOverride(e.target.value)} /></Field>
        </div>
        <CardToggle checked={useCard} onChange={(on) => { setUseCard(on); setCardOverride(null); }} charge={cardCharge} onCharge={setCardOverride} />
        <Field title="Payment details printed on the bill" hint="Filled from the selected payments; you can edit it (max 120 characters)"><input className={inputClass} maxLength={120} value={paymentNote} onChange={(e) => setNoteOverride(e.target.value)} /></Field>
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-bold text-charcoal">Agreed future instalments</h3>
        {rows.map((row, index) => (
          <div key={index} className="grid gap-3 sm:grid-cols-[110px_1fr_1fr_1fr] sm:items-end">
            <p className="text-sm font-semibold sm:pb-2">{index === 2 ? 'Part 3 / Other' : `Part ${index + 1}`}</p>
            <Field title="Agreed amount (Rs.)"><input className={inputClass} type="number" min="0" step="0.01" value={row.amount} onChange={(e) => setRow(index, 'amount', e.target.value)} /></Field>
            <Field title="Due date"><input className={inputClass} type="date" value={row.dueDate} onChange={(e) => setRow(index, 'dueDate', e.target.value)} /></Field>
            <Field title="Received / pending"><select className={inputClass} value={row.status} onChange={(e) => setRow(index, 'status', e.target.value)}><option value="">-</option><option value="received">Received</option><option value="pending">Pending</option></select></Field>
          </div>
        ))}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field title="EMI provider / application ref."><input className={inputClass} maxLength={80} value={text.emiProvider} onChange={(e) => setText({ ...text, emiProvider: e.target.value })} /></Field>
          <Field title="Patient helpline"><input className={inputClass} maxLength={80} value={text.helpline} onChange={(e) => setText({ ...text, helpline: e.target.value })} /></Field>
        </div>
        <Field title="PO verified"><select className={`${inputClass} sm:max-w-[200px]`} value={poVerified} onChange={(e) => setPoVerified(e.target.value)}><option value="pending">Pending</option><option value="yes">Yes</option></select></Field>
      </section>

      <InvoicePdfStyleSelector value={pdfStyle} onChange={setPdfStyle} />
      <div className="flex flex-wrap justify-end gap-2 border-t border-cardline pt-4">
        <Button type="button" variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
        <Button type="submit" disabled={saving || !chosen.length}><FileText size={15} />{saving ? 'Creating...' : 'Create part-payment bill'}</Button>
      </div>
    </form>
  );
}

// Final bill: the "Invoice & Payment Receipt" layout, listing every verified payment of the phase.
function FinalBillForm({ patient, stage, onClose, onSaved }) {
  const approved = useMemo(() => verifiedPayments(stage), [stage]);
  const [particulars, setParticulars] = useState(DEFAULT_PARTICULARS);
  const [statuses, setStatuses] = useState(DEFAULT_STATUSES);
  const [info, setInfo] = useState({
    guardianName: patient.guardianName || patient.relativeName || '', age: String(stage.age || patient.age || ''), gender: patient.gender || '',
    issuedBy: 'Billing Desk', date: dateOnly(approved[approved.length - 1]?.date) || dateOnly(new Date()),
  });
  const [consultationFee, setConsultationFee] = useState('0');
  const [treatment, setTreatment] = useState(amountText(stage.totalAmount));
  const [duration, setDuration] = useState(stage.medicineMonthsGiven ? `${stage.medicineMonthsGiven} month${stage.medicineMonthsGiven > 1 ? 's' : ''}` : '');
  const [cardOn, setCardOn] = useState(false);
  const [cardCharge, setCardCharge] = useState('0.00');
  const [rows, setRows] = useState(() => approved.map((pay, index) => ({
    key: `treatment-${pay.id}`, source: 'treatment', include: true, date: dateOnly(pay.date), received: amountText(pay.amount),
    particulars: index === approved.length - 1 && Number(stage.remainingAmount || 0) <= 0 ? 'Final Instalment' : `First Instalment - ${pay.paymentMode === 'cash' ? 'Cash' : 'Online'}`,
  })));
  const [consultationLoading, setConsultationLoading] = useState(stage.number === 1);
  const [consultationError, setConsultationError] = useState('');
  const [statusOverride, setStatusOverride] = useState(null);
  const [pdfStyle, setPdfStyle] = useState('black-white');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const submissionKey = useRef(newKey());

  useEffect(() => {
    api.get('/invoices/settings', { skipCache: true }).then(({ data }) => { setParticulars(data.paymentParticulars); setStatuses(data.paymentStatuses); }).catch(() => {});
  }, []);

  useEffect(() => {
    if (stage.number !== 1) { setConsultationLoading(false); return undefined; }
    let active = true;
    setConsultationLoading(true);
    setConsultationError('');
    api.get(`/invoices/patients/${patient.id}/consultation-payments`, { skipCache: true })
      .then(({ data }) => {
        if (!active) return;
        const consultationRows = (data.payments || []).map((payment) => ({
          key: `consultation-${payment.id}`,
          source: 'consultation',
          include: true,
          date: dateOnly(payment.date),
          received: amountText(payment.amount),
          particulars: 'Consultation Fee',
        }));
        const consultationTotal = consultationRows.reduce((sum, row) => sum + toNumber(row.received), 0);
        setConsultationFee(amountText(consultationTotal));
        setRows((current) => [...consultationRows, ...current.filter((row) => row.source !== 'consultation')]
          .sort((a, b) => new Date(a.date || 0) - new Date(b.date || 0)));
      })
      .catch(() => { if (active) setConsultationError('Verified consultation payment could not be loaded. Add the missing payment manually below.'); })
      .finally(() => { if (active) setConsultationLoading(false); });
    return () => { active = false; };
  }, [patient.id, stage.number]);

  const pick = (value) => (particulars.includes(value) ? value : particulars[0]);
  const cardRow = cardOn && toNumber(cardCharge) > 0 ? [{ date: info.date, particulars: 'Card Processing Charge', received: amountText(cardCharge) }] : [];
  const payments = [...rows.filter((row) => row.include).map(({ date, particulars: p, received }) => ({ date, particulars: p, received })), ...cardRow];
  const items = [
    { duration: '', amount: amountText(consultationFee) },
    { duration, amount: amountText(treatment) },
    { duration: '', amount: cardOn ? amountText(cardCharge) : '0.00' },
  ];
  let totals = { totalPayable: 0, amountReceived: 0, outstanding: 0, excessReceived: 0 };
  try { totals = calculateFinalBill(items, payments); } catch { /* the server reports invalid amounts */ }
  const autoStatus = totals.amountReceived <= 0 ? 'UNPAID' : totals.outstanding > 0 || totals.excessReceived > 0 ? 'PARTIALLY PAID' : 'FULLY PAID';
  const paymentStatus = statusOverride ?? autoStatus;
  const setRow = (key, field, value) => setRows((old) => old.map((row) => (row.key === key ? { ...row, [field]: value } : row)));
  const addPaymentRow = () => setRows((current) => current.length >= 100 ? current : [...current, {
    key: `manual-${newKey()}`,
    source: 'manual',
    include: true,
    date: '',
    received: '',
    particulars: particulars.includes('Consultation Fee') ? 'Consultation Fee' : (particulars[0] || ''),
  }]);
  const removePaymentRow = (key) => setRows((current) => current.filter((row) => row.key !== key));

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    const includedRows = rows.filter((row) => row.include);
    if (!includedRows.length) return setError('Add or select at least one payment receipt');
    if (includedRows.some((row) => !row.date || !row.particulars || toNumber(row.received) <= 0)) {
      return setError('Complete the date, payment particulars and received amount for every selected payment row');
    }
    setSaving(true);
    try {
      const details = {
        stageNumber: stage.number, patientName: patient.patientName, patientCode: patient.patientCode || '',
        guardianName: info.guardianName, age: info.age, gender: info.gender, issuedBy: info.issuedBy, date: info.date,
        items, payments: payments.map((p) => ({ ...p, particulars: pick(p.particulars) })), paymentStatus,
      };
      const { data } = await api.post('/invoices', { type: 'final-bill', patient: patient.id, pdfStyle, submissionKey: submissionKey.current, details });
      onSaved(data.invoice);
    } catch (err) {
      setError(err.response?.data?.message || 'Final bill could not be created');
    } finally { setSaving(false); }
  };

  return (
    <form onSubmit={submit} className="space-y-5">
      {error && <div className="rounded-lg bg-[#8C3B2E]/8 px-3.5 py-3 text-sm text-[#8C3B2E]">{error}</div>}
      <section className="grid gap-3 sm:grid-cols-2">
        <Field title="Invoice date"><input className={inputClass} type="date" required value={info.date} onChange={(e) => setInfo({ ...info, date: e.target.value })} /></Field>
        <Field title="Father / guardian"><input className={inputClass} maxLength={80} value={info.guardianName} onChange={(e) => setInfo({ ...info, guardianName: e.target.value })} /></Field>
        <Field title="Age"><input className={inputClass} maxLength={25} value={info.age} onChange={(e) => setInfo({ ...info, age: e.target.value })} /></Field>
        <Field title="Gender"><input className={inputClass} maxLength={25} value={info.gender} onChange={(e) => setInfo({ ...info, gender: e.target.value })} placeholder="Male / Female" /></Field>
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-bold text-charcoal">Invoice details</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field title="Consultation fee (Rs.)"><input className={inputClass} type="number" min="0" step="0.01" value={consultationFee} onChange={(e) => setConsultationFee(e.target.value)} /></Field>
          <span />
          <Field title="Customized Ayurvedic formulations (Rs.)" hint="Total amount of this phase from Patient Details"><input className={inputClass} type="number" min="0" step="0.01" value={treatment} onChange={(e) => setTreatment(e.target.value)} /></Field>
          <Field title="Date / duration"><input className={inputClass} maxLength={80} value={duration} onChange={(e) => setDuration(e.target.value)} placeholder="e.g. 1 month" /></Field>
        </div>
        <CardToggle
          checked={cardOn}
          onChange={(on) => { setCardOn(on); setCardCharge(amountText(rows.filter((r) => r.include).reduce((sum, r) => sum + toNumber(r.received), 0) * CARD_RATE)); }}
          charge={cardCharge} onCharge={setCardCharge} hint="Also added to the bill as a received payment row"
        />
      </section>

      <section className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-charcoal">Payment receipts - all verified payments of Phase {stage.number}</h3>
            <p className="mt-0.5 text-xs text-charcoal/55">Fetched payments are filled automatically. Add a row if a payment is missing.</p>
          </div>
          <Button type="button" size="sm" variant="outline" disabled={rows.length >= 100} onClick={addPaymentRow}><Plus size={15} />Add payment row</Button>
        </div>
        {consultationLoading && <p className="rounded-md bg-offwhite-200 p-3 text-sm text-charcoal/65">Loading verified consultation payment...</p>}
        {consultationError && <p className="rounded-md bg-[#8C3B2E]/8 p-3 text-sm text-[#8C3B2E]">{consultationError}</p>}
        {rows.length === 0 && <p className="rounded-md bg-offwhite-200 p-3 text-sm text-charcoal/65">No verified payment yet.</p>}
        {rows.map((row) => (
          <div key={row.key} className={`grid gap-3 rounded-md border p-3 sm:grid-cols-[28px_1fr_1.4fr_1fr_40px] sm:items-end ${row.include ? 'border-sage bg-sage/5' : 'border-cardline bg-white opacity-60'}`}>
            <input type="checkbox" className="mb-3" checked={row.include} onChange={(e) => setRow(row.key, 'include', e.target.checked)} title="Show on bill" />
            <Field title="Date"><input className={inputClass} type="date" value={row.date} onChange={(e) => setRow(row.key, 'date', e.target.value)} /></Field>
            <Field title="Payment particulars"><select className={inputClass} value={pick(row.particulars)} onChange={(e) => setRow(row.key, 'particulars', e.target.value)}>{particulars.map((p) => <option key={p}>{p}</option>)}</select></Field>
            <Field title="Received (Rs.)"><input className={inputClass} type="number" min="0" step="0.01" value={row.received} onChange={(e) => setRow(row.key, 'received', e.target.value)} /></Field>
            {row.source === 'manual'
              ? <button type="button" className="mb-0.5 flex h-10 w-10 items-center justify-center rounded-md border border-cardline bg-white text-[#8C3B2E] hover:bg-[#8C3B2E]/5" title="Remove payment row" aria-label="Remove manual payment row" onClick={() => removePaymentRow(row.key)}><Trash2 size={16} /></button>
              : <span className="hidden h-10 w-10 sm:block" aria-hidden="true" />}
          </div>
        ))}
        <div className="grid gap-2 rounded-md bg-offwhite-200 p-3 text-sm sm:grid-cols-3">
          <p>Total amount: <b>{inr(totals.totalPayable)}</b></p>
          <p>Total received: <b>{inr(totals.amountReceived)}</b></p>
          <p>Outstanding: <b>{inr(totals.outstanding)}</b>{totals.excessReceived > 0 && <span className="text-[#8C3B2E]"> (excess {inr(totals.excessReceived)})</span>}</p>
        </div>
        <Field title="Payment status"><select className={`${inputClass} sm:max-w-[240px]`} value={paymentStatus} onChange={(e) => setStatusOverride(e.target.value)}>{statuses.map((s) => <option key={s}>{s}</option>)}</select></Field>
      </section>

      <InvoicePdfStyleSelector value={pdfStyle} onChange={setPdfStyle} />
      <div className="flex flex-wrap justify-end gap-2 border-t border-cardline pt-4">
        <Button type="button" variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
        <Button type="submit" disabled={saving || consultationLoading || !rows.length}><FileText size={15} />{saving ? 'Creating...' : 'Create final bill'}</Button>
      </div>
    </form>
  );
}

export default function PatientBillPanel({ patient, stage }) {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [bills, setBills] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [formKind, setFormKind] = useState(null);
  const [preview, setPreview] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const frame = useRef(null);
  const previewUrl = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/invoices', { params: { patient: patient.id, stage: stage.number }, skipCache: true });
      setBills(data.invoices);
      setError('');
    } catch { setError('Bills could not be loaded'); } finally { setLoading(false); }
  }, [patient.id, stage.number]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => () => { if (previewUrl.current) URL.revokeObjectURL(previewUrl.current); }, []);

  const openPdf = async (bill) => {
    try {
      const { data } = await api.get(`/invoices/${bill.id}/pdf`, { responseType: 'blob', skipCache: true });
      if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
      previewUrl.current = URL.createObjectURL(new Blob([data], { type: 'application/pdf' }));
      setPreview({ id: bill.id, url: previewUrl.current, name: bill.fileName, number: bill.invoiceNumber });
    } catch { setError('PDF could not be opened'); }
  };
  const saved = (invoice) => { setFormKind(null); load(); openPdf(invoice); };
  const deleteBill = async () => {
    if (!deleteTarget || deleting) return;
    setDeleting(true);
    setError('');
    try {
      await api.delete(`/invoices/${deleteTarget.id}`);
      if (preview?.id === deleteTarget.id) setPreview(null);
      setDeleteTarget(null);
      await load();
    } catch (err) {
      setError(err.response?.data?.message || 'Bill could not be deleted');
    } finally {
      setDeleting(false);
    }
  };
  const print = () => { try { frame.current.contentWindow.focus(); frame.current.contentWindow.print(); } catch { setError('Use the download button to print this bill'); } };
  const formTitle = formKind === 'final' ? 'Final bill' : 'Part-payment bill';

  return (
    <div className="border-t border-cardline bg-offwhite-100 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-charcoal/55"><Receipt size={14} />Bills - Phase {stage.number}</p>
          <p className="mt-0.5 text-xs text-charcoal/55">Made from verified payments of this phase</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => setFormKind('part')}><FileText size={14} />Part-payment bill</Button>
          <Button size="sm" onClick={() => setFormKind('final')}><FileText size={14} />Final bill</Button>
        </div>
      </div>
      {error && <p className="mt-3 text-sm text-[#8C3B2E]">{error}</p>}
      {loading ? <p className="mt-3 text-sm text-charcoal/55">Loading bills...</p> : bills.length === 0 ? <p className="mt-3 text-sm text-charcoal/55">No bill created for this phase yet.</p> : (
        <ul className="mt-3 divide-y divide-cardline rounded-md border border-cardline bg-white">
          {bills.map((bill) => (
            <li key={bill.id} className="flex flex-wrap items-center justify-between gap-3 px-3 py-2.5 text-sm">
              <div className="min-w-0">
                <p className="font-semibold">{bill.invoiceNumber} <span className="ml-1 rounded-full bg-sage/10 px-2 py-0.5 text-[11px] font-semibold">{bill.type === 'final-bill' ? 'Final' : 'Part payment'}</span></p>
                <p className="text-xs text-charcoal/65">{label(bill.date)} - Received {inr(bill.details?.amountReceived)} - Outstanding {inr(bill.details?.outstanding)}</p>
                {bill.type !== 'final-bill' && bill.details?.paymentNote && <p className="truncate text-xs text-charcoal/55" title={bill.details.paymentNote}>{bill.details.paymentNote}</p>}
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => openPdf(bill)}><Eye size={14} />View</Button>
                {isAdmin && <Button size="sm" variant="danger" onClick={() => setDeleteTarget(bill)} title={`Delete ${bill.invoiceNumber}`}><Trash2 size={14} />Delete</Button>}
              </div>
            </li>
          ))}
        </ul>
      )}

      <Modal open={Boolean(formKind)} onClose={() => setFormKind(null)} title={`${formTitle} - ${patient.patientName} (Phase ${stage.number})`} className="max-w-3xl">
        {formKind === 'part' && <PartBillForm patient={patient} stage={stage} onClose={() => setFormKind(null)} onSaved={saved} />}
        {formKind === 'final' && <FinalBillForm patient={patient} stage={stage} onClose={() => setFormKind(null)} onSaved={saved} />}
      </Modal>
      <Modal open={Boolean(preview)} onClose={() => setPreview(null)} title={preview?.number || 'Bill'} className="max-w-4xl">
        {preview && <div className="space-y-3">
          <div className="flex gap-2"><a href={preview.url} download={preview.name}><Button size="sm" variant="outline" type="button"><Download size={14} />Download</Button></a><Button size="sm" variant="outline" onClick={print}><Printer size={14} />Print</Button></div>
          <iframe ref={frame} title="Bill PDF" src={preview.url} className="h-[70dvh] w-full rounded border border-cardline bg-gray-100" />
        </div>}
      </Modal>
      <Modal open={Boolean(deleteTarget)} onClose={() => !deleting && setDeleteTarget(null)} title="Delete saved bill">
        <div className="space-y-5">
          <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-charcoal">
            <p>Delete <strong>{deleteTarget?.invoiceNumber}</strong> for <strong>{patient.patientName}</strong>?</p>
            <p className="mt-2 text-charcoal/65">The saved PDF and all previous PDF revisions will also be removed.</p>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" disabled={deleting} onClick={() => setDeleteTarget(null)}>Back</Button>
            <Button variant="danger" disabled={deleting} onClick={deleteBill}><Trash2 size={16} />{deleting ? 'Deleting...' : 'Delete bill'}</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
