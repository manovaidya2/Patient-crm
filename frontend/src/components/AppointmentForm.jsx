import SplitRows, { emptySplitRows, splitTotal, splitsPayload, splitHasOnline, splitRowsFrom } from './payments/SplitRows.jsx';
import { useCallback, useEffect, useState } from 'react';
import { Check, CreditCard, FileText, Pencil, Plus, Save, X, PhoneCall, ClipboardList, UserRound } from 'lucide-react';
import api from '../api/axios.js';
import Modal from './ui/Modal.jsx';
import Button from './ui/Button.jsx';
import MultiSelectCell from './MultiSelectCell.jsx';
import { CompactAttachments } from './ui/Attachments.jsx';
import SalesCallHistory from './SalesCallHistory.jsx';
import { columnSection } from '../utils/appointmentSections.js';
import { useAuth } from '../context/AuthContext.jsx';
import { ADMIN_LIKE_ROLES, ROLES, isAdminLike } from '../constants/roles.js';

const inputClass = 'w-full min-w-0 rounded-md border border-cardline bg-white px-3 py-2 text-sm text-charcoal outline-none focus:ring-2 focus:ring-sage/30';
const money = (value) => `Rs ${Number(value || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const today = () => { const date = new Date(); return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
const paidDate = (value) => value ? new Date(value).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '-';
const stamp = (value) => value ? new Date(value).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-';
const href = (value) => value?.startsWith('/uploads/') ? `${(import.meta.env.VITE_API_URL || 'http://localhost:5000/api').replace(/\/api\/?$/, '')}${value}` : undefined;
const checked = (value) => [true, 'true', '\u2611'].includes(value);
const appointmentColumnsFor = (columns, sheet, role) => (sheet === 'management' && isAdminLike(role)
  ? columns.map((column) => /^(consent|concent)\s*form$/i.test(column.label.trim().replace(/\s+/g, ' '))
    ? { ...column, required: false }
    : column)
  : columns);
// Sales "Patient Type" = Existing asks for the old Patient ID (a field with showWhen). The ID is checked as it is typed
// and shows who it is and which phase this visit's purchase will go into.
const OLD_PATIENT_ID = '6b1f0a3c9d2e4f5a6b7c8d01';
// Reception columns filled later from the list (Arrival button): arrival status, arrival time, Patient ID, token.
// Not asked when the appointment is added, and shown read only afterwards (the Arrival step sets them).
const LATER_COLUMNS = new Set(['6ab7c235bf916b34dfda543c', '6aba53547172140c6badaf14', '6abb6329297d3a5387593670', '6abb65e3297d3a5387593f6e']);
// Also left out of the add form (filled later, open the appointment to see / edit them): screenshot, and the package
// result - Package Offered / Advance Amount Paid / Package Due Amount / Package Status, which the Post Counselor's
// outcome fills by itself (utils/receptionPackage.js), plus the older Package Status column.
const NOT_ON_CREATE = new Set([...LATER_COLUMNS, '6ab3c020c6143a2dc0496498', '6abb64b5297d3a5387593df8', '6abb64e8297d3a5387593e2e', '6abb64f5297d3a5387593e5c', '6abb6525297d3a5387593e92', '6ab6023c71c30693a6638d7a']);
// Age is not copied: the child is older now, and each phase keeps the age told at that visit.
const PREFILL_FROM_PATIENT = { '6ab7b2adbf916b34dfd9f5f7': 'patientName', '6ab7b2fdbf916b34dfd9f66b': 'guardianName', '6ab7b33fbf916b34dfd9f6c2': 'number' };
const isShown = (column, values) => !column.showWhen || String(values?.[column.showWhen.columnId] ?? '') === column.showWhen.value;
// A field that appears because of another choice must be filled.
const isRequired = (column, values) => column.required || Boolean(column.showWhen && isShown(column, values));
function ExistingPatientCheck({ code, onFound }) {
  const [state, setState] = useState({ status: 'idle' });
  useEffect(() => {
    const clean = String(code || '').trim();
    if (!clean) { setState({ status: 'idle' }); return undefined; }
    setState({ status: 'checking' });
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const { data } = await api.get('/sales-sheet/existing-patient', { params: { code: clean }, signal: controller.signal, skipCache: true });
        setState({ status: 'found', patient: data.patient });
        onFound?.(data.patient);
      } catch (err) {
        if (!controller.signal.aborted) setState({ status: 'missing', message: err.response?.data?.message || 'Patient not found' });
      }
    }, 400);
    return () => { clearTimeout(timer); controller.abort(); };
    // onFound is a fresh function on every render; only the code matters here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);
  if (state.status === 'idle') return null;
  if (state.status === 'checking') return <p className="mt-1 text-xs text-charcoal/60">Checking Patient ID...</p>;
  if (state.status === 'missing') return <p className="mt-1 text-xs font-semibold text-red-700">{state.message}</p>;
  const p = state.patient;
  return <p className="mt-1 rounded bg-sky-50 px-2 py-1 text-xs text-sky-950"><b>{p.patientName}</b> ({p.patientCode}){p.age ? ` · age in record ${p.age} (enter today's age)` : ''}{p.categoryLabel ? ` · ${p.categoryLabel}` : ''} · {p.nextPhase ? <>next purchase goes to <b>Phase {p.nextPhase}</b></> : <b>all phases in use</b>}{p.isActive ? '' : ' · closed patient'}</p>;
}
const Label = ({ title, children }) => <label className="block min-w-0"><span className="mb-1 block text-xs font-semibold text-charcoal/80">{title}</span>{children}</label>;

function Value({ column, value, onRemove }) {
  if (column.type === 'checkbox') return <span className="inline-flex items-center gap-2 text-sm">{checked(value) ? <Check size={16} className="text-sage" /> : <X size={16} className="text-charcoal/50" />}{checked(value) ? 'Yes' : 'No'}</span>;
  if (column.type === 'file' && value) return href(value) ? <span className="relative inline-flex"><a className={`inline-flex items-center gap-1 text-sm font-semibold text-sage underline ${onRemove ? 'pr-3' : ''}`} href={href(value)} target="_blank" rel="noreferrer"><FileText size={14} />View attachment</a>{onRemove && <button type="button" onClick={onRemove} className="absolute -right-2 -top-2 inline-flex h-5 w-5 items-center justify-center rounded-full border border-white bg-[#9B3D30] text-white shadow" title="Remove attachment" aria-label={`Remove ${column.label}`}><X size={12} strokeWidth={3} /></button>}</span> : <span className="text-xs text-charcoal/70">Attachment needs re-upload</span>;
  return <p className="whitespace-pre-wrap break-words text-sm text-charcoal [overflow-wrap:anywhere]">{value || <span className="text-charcoal/50">Not entered</span>}</p>;
}

function Field({ column, value, onChange, onError, onUploading }) {
  if (column.type === 'checkbox') return <label className="inline-flex items-center gap-2 text-sm"><input type="checkbox" checked={checked(value)} onChange={(e) => onChange(String(e.target.checked))} className="h-4 w-4 accent-sage" />Yes</label>;
  if (column.type === 'multi_select') return <MultiSelectCell label={column.label} options={column.options} value={value} onChange={onChange} />;
  if (column.type === 'file') return <div className="space-y-2"><input aria-label={`Upload ${column.label}`} className={`${inputClass} text-xs`} type="file" onChange={async (e) => {
    const file = e.target.files?.[0]; if (!file) return;
    onUploading(true);
    try { const body = new FormData(); body.append('file', file); const { data } = await api.post('/sales-sheet/upload', body); onChange(data.file.url); }
    catch (error) { onError(error.response?.data?.message || 'Upload failed'); }
    finally { onUploading(false); }
  }} /><Value column={column} value={value} /></div>;
  const props = { className: inputClass, 'aria-label': column.label, value: value || '', onChange: (e) => onChange(e.target.value), required: column.required };
  if (column.type === 'select') return <select {...props}><option value="">Select</option>{column.options.map((option) => <option key={option}>{option}</option>)}</select>;
  if (column.type === 'textarea') return <textarea {...props} rows={3} />;
  return <input {...props} type={column.type === 'phone' ? 'tel' : column.type} />;
}

export default function AppointmentForm({ sheet, row, onClose, onChanged, onCreated }) {
  const { user } = useAuth();
  const isAdmin = user?.role === ROLES.ADMIN; // removing a saved file or receipt proof stays Admin-only
  const [data, setData] = useState(null);
  const [tab, setTab] = useState(row.initialTab === 'reception-confirmation' && user?.role === ROLES.SALES_TEAM ? 'sales' : row.initialTab || 'sales');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [editingAll, setEditingAll] = useState(false);
  const [originalValues, setOriginalValues] = useState({});
  const [value, setValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [feeEdit, setFeeEdit] = useState(false);
  const [fee, setFee] = useState('');
  const [adding, setAdding] = useState(false);
  const [receipt, setReceipt] = useState(null);
  const [editingPayment, setEditingPayment] = useState(null);
  const [files, setFiles] = useState([]);
  const [newAdvance, setNewAdvance] = useState({ splitRows: emptySplitRows(), amount: '', date: today(), paymentMode: 'cash', bank: '', reference: '', cashReceivedByName: '', notes: '', files: [] });
  const endpoint = `/sales-sheet/forms/${sheet}/${row.id}`;
  // Split (online / cash / card the same day): one payment, the amount is the total of the parts.
  const withSplit = (p) => (p?.paymentMode === 'split' ? { ...p, amount: String(splitTotal(p.splitRows)), splits: p.splitRows } : p);
  const splitProofMissing = (p, proofCount) => p?.paymentMode === 'split' && splitHasOnline(p.splitRows) && !proofCount;
  const load = useCallback(async () => {
    if (!row.id) {
      const [sales, reception, banks] = await Promise.all([
        api.get('/sales-sheet/columns', { skipCache: true }),
        sheet === 'management' ? api.get('/sales-sheet/management-columns', { skipCache: true }) : Promise.resolve({ data: { columns: [] } }),
        api.get('/sales-sheet/banks', { skipCache: true }),
      ]);
      setData({ appointmentDate: row.appointmentDate, consultationFee: null, salesColumns: sales.data.columns, columns: appointmentColumnsFor(reception.data.columns, sheet, user?.role), salesValues: {}, values: {}, receipts: [], banks: banks.data.banks, canEdit: true });
      return;
    }
    const response = await api.get(endpoint, { skipCache: true }); setData(response.data);
  }, [endpoint, row.id, row.appointmentDate, sheet, user?.role]);
  useEffect(() => { setLoading(true); load().catch((err) => setError(err.response?.data?.message || 'Appointment could not be loaded')).finally(() => setLoading(false)); }, [load]);
  const saveField = async (e) => {
    e.preventDefault(); setSaving(true); setError('');
    try { await api.patch(`${endpoint}/field`, { columnId: editing.column.id, source: editing.source, previousValue: editing.previous, value }); await load(); setEditing(null); onChanged?.(); }
    catch (err) { setError(err.response?.data?.message || 'Field could not be saved'); }
    finally { setSaving(false); }
  };
  const removeSavedField = async (column, source, previousValue) => {
    if (!isAdmin || !window.confirm(`Remove ${column.label}? This cannot be undone.`)) return;
    setSaving(true); setError('');
    try {
      await api.patch(`${endpoint}/field`, { columnId: column.id, source, previousValue, value: '' });
      await load();
      onChanged?.();
    } catch (err) { setError(err.response?.data?.message || 'Attachment could not be removed'); }
    finally { setSaving(false); }
  };
  const beginEditAll = () => {
    setOriginalValues({ sales: { ...data.salesValues }, reception: { ...data.values } });
    setEditingAll(true);
    setError('');
  };
  const saveAllFields = async () => {
    // The single form (direct entry) edits both the patient and the reception details together.
    const parts = isDirect ? [['sales', 'details'], ['reception', 'details']] : [[fieldSource, fieldSection]];
    const changed = parts.flatMap(([source, section]) => columnsFor(source, section).map((column) => ({ column, source })))
      .filter(({ column, source }) => String(valuesOf(source)[column.id] || '') !== String(originalValues[source]?.[column.id] || ''));
    if (!changed.length) { setEditingAll(false); return; }
    setSaving(true); setError('');
    try {
      for (const { column, source } of changed) await api.patch(`${endpoint}/field`, { columnId: column.id, source, previousValue: originalValues[source]?.[column.id] || '', value: valuesOf(source)[column.id] || '' });
      await load(); setEditingAll(false); onChanged?.();
    } catch (err) { setError(err.response?.data?.message || 'Some fields could not be saved. Reload before trying again.'); }
    finally { setSaving(false); }
  };
  const saveFee = async (e) => {
    e.preventDefault(); setSaving(true); setError('');
    try { await api.patch(`${endpoint}/fee`, { amount: fee, previousValue: data.consultationFee }); await load(); setFeeEdit(false); onChanged?.(); }
    catch (err) { setError(err.response?.data?.message || 'Fee could not be saved'); }
    finally { setSaving(false); }
  };
  const addReceipt = () => {
    const nameColumn = data.salesColumns.find((column) => /^(patient name|name)$/i.test(column.label.trim()));
    const patientColumn = data.columns.find((column) => /^(patient id|patient code)$/i.test(column.label.trim()));
    setReceipt({ patientName: nameColumn ? data.salesValues[nameColumn.id] || '' : data.receipts[0]?.patientName || '', patientCode: patientColumn ? data.values[patientColumn.id] || '' : '', amount: '', date: today(), paymentMode: 'cash', bank: '', reference: '', cashReceivedByName: '', notes: '', submissionKey: crypto.randomUUID(), splitRows: emptySplitRows() });
    setFiles([]); setAdding(true); setError('');
  };
  const saveReceipt = async (e) => {
    e.preventDefault();
    if (receipt.paymentMode === 'online' && (!receipt.reference.trim() || !files.length)) { setError('Online payment needs UTR/reference and payment proof.'); return; }
    if (receipt.paymentMode === 'cash' && !receipt.cashReceivedByName.trim()) { setError('Enter who received the cash payment.'); return; }
    if (splitProofMissing(receipt, files.length)) { setError('Attach the payment proof of the online part.'); return; }
    setSaving(true); setError('');
    try { const body = new FormData(); const { splitRows, ...plain } = receipt; Object.entries(receipt.paymentMode === 'split' ? { ...plain, amount: String(splitTotal(splitRows)), splits: splitsPayload(splitRows) } : plain).forEach(([key, val]) => body.append(key, val)); files.forEach((file) => body.append('proof', file)); await api.post(`${endpoint}/receipts`, body); await load(); setAdding(false); onChanged?.(); }
    catch (err) { setError(err.response?.data?.message || 'Payment could not be recorded'); }
    finally { setSaving(false); }
  };
  const saveEditedPayment = async (event) => {
    event.preventDefault();
    if (editingPayment.paymentMode === 'online' && (!editingPayment.reference.trim() || !editingPayment.files.length)) { setError('Online payment needs UTR/reference and payment proof.'); return; }
    if (splitProofMissing(editingPayment, editingPayment.files.length)) { setError('Attach the payment proof of the online part.'); return; }
    if (editingPayment.paymentMode === 'cash' && !editingPayment.cashReceivedByName.trim()) { setError('Enter who received the cash payment.'); return; }
    setSaving(true); setError('');
    try {
      await api.patch(`${endpoint}/receipts/${editingPayment.id}`, withSplit(editingPayment));
      await load(); setEditingPayment(null); onChanged?.();
    } catch (err) { setError(err.response?.data?.message || 'Payment could not be updated'); }
    finally { setSaving(false); }
  };
  const openPaymentEdit = (item) => {
    setEditingPayment({
      id: item._id, amount: String(item.amount), date: String(item.date).slice(0, 10),
      paymentMode: item.paymentMode, bank: item.bank || '', reference: item.reference || '',
      cashReceivedByName: item.cashReceivedByName || '', notes: item.notes || '', files: item.files || [], splitRows: splitRowsFrom(item),
    });
    setError('');
  };
  const changeReceipt = (key) => (e) => setReceipt((old) => ({ ...old, [key]: e.target.value }));
  const createAppointment = async () => {
    if (!data.appointmentDate) { setError('Select the appointment date.'); setTab('sales'); return; }
    const requiredField = [
      ...data.salesColumns.map((column) => ({ column, source: 'sales', value: data.salesValues[column.id] })),
      ...(sheet === 'management' ? data.columns.map((column) => ({ column, source: 'reception', value: data.values[column.id] })) : []),
    ].filter(({ column, source }) => !(isDirect && columnSection(column) === 'confirmation') && !(source === 'reception' && NOT_ON_CREATE.has(column.id))).find(({ column, value, source }) => isRequired(column, source === 'sales' ? data.salesValues : data.values) && isShown(column, source === 'sales' ? data.salesValues : data.values) && !String(value ?? '').trim());
    if (requiredField) {
      const section = columnSection(requiredField.column);
      setTab(section === 'payments' ? 'payments' : requiredField.source === 'sales'
        ? section === 'confirmation' ? 'sales-confirmation' : 'sales'
        : section === 'confirmation' ? 'reception-confirmation' : 'reception');
      setError(`${requiredField.column.label} is required.`);
      return;
    }
    const adv = withSplit(newAdvance);
    if (splitProofMissing(newAdvance, newAdvance.files.length)) { setError('Attach the payment proof of the online part.'); setTab('payments'); return; }
    if (adv.amount && (data.consultationFee === '' || data.consultationFee === null || data.consultationFee === undefined)) {
      setError('Set the total consultation fee before adding a payment.'); setTab('payments'); return;
    }
    if (adv.amount && newAdvance.paymentMode === 'online' && (!newAdvance.reference.trim() || !newAdvance.files.length)) { setError('Online payment needs UTR/reference and a payment proof.'); setTab('payments'); return; }
    if (newAdvance.amount && newAdvance.paymentMode === 'cash' && !newAdvance.cashReceivedByName.trim()) { setError('Enter who received the cash payment.'); setTab('payments'); return; }
    setSaving(true); setError('');
    try {
      const body = sheet === 'sales' ? { appointmentDate: data.appointmentDate, consultationFee: data.consultationFee, advance: adv.amount ? adv : undefined, values: data.salesValues } : { appointmentDate: data.appointmentDate, consultationFee: data.consultationFee, salesValues: data.salesValues, values: data.values, payment: adv.amount ? adv : undefined };
      const response = await api.post(`/sales-sheet/${sheet === 'sales' ? 'appointments' : 'management'}`, body);
      onCreated({ ...response.data.appointment, initialTab: 'sales' }); onChanged?.();
    } catch (err) { setError(err.response?.data?.message || 'Appointment could not be created'); }
    finally { setSaving(false); }
  };
  const receipts = data?.receipts || [];
  // Sales edits its pending advance until reception accepts; reception edits any payment of the appointment (a verified
  // one goes back for verification) until the Post Counselor saves the record.
  const editableSalesReceipts = sheet === 'sales' && row.id && data?.canEdit && !data.acceptedAt && [...ADMIN_LIKE_ROLES, ROLES.SALES_TEAM].includes(user?.role)
    ? receipts.filter((item) => item.collectionStage === 'advance' && item.status === 'pending')
    : sheet === 'management' && row.id && data?.canEdit && !data.pcLocked && [...ADMIN_LIKE_ROLES, ROLES.RECEPTIONIST].includes(user?.role)
      ? receipts.filter((item) => item.status !== 'cancelled') : [];
  const received = receipts.filter((item) => item.status !== 'cancelled').reduce((sum, item) => sum + item.amount, 0);
  const advance = receipts.filter((item) => item.status !== 'cancelled' && item.collectionStage === 'advance').reduce((sum, item) => sum + item.amount, 0);
  const approved = receipts.filter((item) => item.status === 'approved').reduce((sum, item) => sum + item.amount, 0);
  const remaining = data?.consultationFee == null ? null : data.consultationFee - received;
  const fieldSource = tab.startsWith('sales') ? 'sales' : 'reception';
  const fieldSection = tab.endsWith('confirmation') ? 'confirmation' : 'details';
  const valuesOf = (source) => (source === 'sales' ? data?.salesValues : data?.values) || {};
  const columnsFor = (source, section) => (source === 'sales' ? data?.salesColumns : data?.columns)?.filter((column) => columnSection(column) === section && isShown(column, valuesOf(source)) && !(source === 'reception' && !row.id && NOT_ON_CREATE.has(column.id))) || [];
  const values = valuesOf(fieldSource);
  const columns = columnsFor(fieldSource, fieldSection);
  // Fill the empty name / age / parent / mobile from the existing patient while the form is being filled in.
  const fillFromPatient = (patient) => {
    if (!(!row.id || editingAll)) return;
    setData((old) => {
      const next = { ...old.salesValues };
      Object.entries(PREFILL_FROM_PATIENT).forEach(([id, key]) => { if (!String(next[id] ?? '').trim() && patient[key] !== '' && patient[key] != null) next[id] = String(patient[key]); });
      return { ...old, salesValues: next };
    });
  };
  const tabs = sheet === 'sales'
    ? [['sales', 'Sales details'], ['payments', 'Consultation payments'], ['sales-confirmation', 'Sales confirmation calls'], ...(row.id && [...ADMIN_LIKE_ROLES, ROLES.RECEPTIONIST].includes(user?.role) ? [['reception-confirmation', 'Reception calls']] : [])]
    : [['sales', 'Sales details'], ['payments', 'Consultation payments'], ['sales-confirmation', 'Sales confirmation calls'], ['reception-confirmation', 'Reception call confirmation'], ['reception', 'Reception details']];
  // Adding an appointment at reception: no call tabs - one simple form with the patient details, the reception details
  // needed now and the payment. Opening a saved appointment shows the usual five tabs.
  const isDirect = sheet === 'management' && !row.id;
  const canEditSection = data?.canEdit && !(user?.role === ROLES.RECEPTIONIST && tab === 'sales-confirmation') && !(data?.pcLocked && tab.startsWith('sales'));
  const fieldGrid = (source, section) => {
    const vals = valuesOf(source);
    const cols = columnsFor(source, section);
    const sectionEditable = data?.canEdit && !(user?.role === ROLES.RECEPTIONIST && source === 'sales' && section === 'confirmation') && !(data?.pcLocked && source === 'sales');
    return <div className="grid gap-x-6 bg-white/70 px-4 sm:grid-cols-2 lg:grid-cols-3">{cols.map((column) => { const canEdit = sectionEditable && !(source === 'reception' && LATER_COLUMNS.has(column.id)); return <div key={column.id} className="min-w-0 border-b border-cardline py-3">
      <div className="mb-2 flex items-start justify-between gap-2"><p className="text-xs font-semibold text-charcoal/75">{column.label}{isRequired(column, vals) ? ' *' : ''}</p>{row.id && canEdit && !editing && !editingAll && <button aria-label={`Edit ${column.label}`} title={`Edit ${column.label}`} onClick={() => { setEditing({ column, source, previous: vals[column.id] || '' }); setValue(vals[column.id] || ''); setError(''); }} className="shrink-0 text-sage"><Pencil size={14} /></button>}</div>
      {((!row.id || editingAll) && canEdit) ? <Field column={column} value={vals[column.id] || ''} onChange={(next) => { const key = source === 'sales' ? 'salesValues' : 'values'; setData((old) => ({ ...old, [key]: { ...old[key], [column.id]: next } })); }} onError={setError} onUploading={setUploading} /> : editing?.column.id === column.id ? <form onSubmit={saveField} className="space-y-2"><Field column={column} value={value} onChange={setValue} onError={setError} onUploading={setUploading} /><div className="flex gap-2"><Button type="submit" size="sm" disabled={saving || uploading}><Save size={13} />Save</Button><Button size="sm" variant="outline" disabled={saving || uploading} onClick={() => setEditing(null)}>Cancel</Button></div></form> : <Value column={column} value={vals[column.id]} onRemove={isAdmin && column.type === 'file' && vals[column.id] ? () => removeSavedField(column, source, vals[column.id]) : undefined} />}
      {column.id === OLD_PATIENT_ID && <ExistingPatientCheck code={editing?.column.id === column.id ? value : vals[column.id]} onFound={source === 'sales' ? fillFromPatient : () => {}} />}
    </div>; })}{!cols.length && <p className="py-8 text-sm text-charcoal/70">No fields in this section</p>}</div>;
  };
  const editAllButton = (count) => row.id && data?.canEdit && !editing && !editingAll && count > 0 && <Button size="sm" variant="outline" onClick={beginEditAll}><Pencil size={14} />Edit all details</Button>;
  const editAllBar = editingAll && <div className="flex justify-end gap-2 border-t border-cardline pt-3"><Button variant="outline" disabled={saving || uploading} onClick={() => { setEditingAll(false); load().catch(() => { }); }}>Cancel</Button><Button disabled={saving || uploading} onClick={saveAllFields}><Save size={15} />{saving ? 'Saving...' : 'Save details'}</Button></div>;
  const sectionTones = {
    sales: { active: 'bg-sky-700 border-sky-700 text-white', idle: 'bg-sky-50 border-sky-200 text-sky-900', heading: 'border-sky-600 bg-sky-50 text-sky-950' },
    payments: { active: 'bg-emerald-700 border-emerald-700 text-white', idle: 'bg-emerald-50 border-emerald-200 text-emerald-900', heading: 'border-emerald-600 bg-emerald-50 text-emerald-950' },
    'sales-confirmation': { active: 'bg-amber-700 border-amber-700 text-white', idle: 'bg-amber-50 border-amber-200 text-amber-900', heading: 'border-amber-600 bg-amber-50 text-amber-950' },
    'reception-confirmation': { active: 'bg-rose-700 border-rose-700 text-white', idle: 'bg-rose-50 border-rose-200 text-rose-900', heading: 'border-rose-600 bg-rose-50 text-rose-950' },
    reception: { active: 'bg-teal-700 border-teal-700 text-white', idle: 'bg-teal-50 border-teal-200 text-teal-900', heading: 'border-teal-600 bg-teal-50 text-teal-950' },
  };
  const tabIcons = { sales: UserRound, payments: CreditCard, 'sales-confirmation': PhoneCall, 'reception-confirmation': PhoneCall, reception: ClipboardList };
  const paymentSheetColumns = [
    ...(data?.salesColumns || []).filter((column) => columnSection(column) === 'payments').map((column) => ({ column, source: 'sales', value: data.salesValues[column.id] })),
    ...(sheet === 'management' ? (data?.columns || []).filter((column) => columnSection(column) === 'payments').map((column) => ({ column, source: 'reception', value: data.values[column.id] })) : []),
  ];
  const paymentSheetFields = paymentSheetColumns.length > 0 && <section className="border-t border-cardline pt-4">
    <h3 className="mb-2 text-sm font-bold">Sheet payment fields</h3>
    <div className="grid gap-x-6 sm:grid-cols-2 lg:grid-cols-3">{paymentSheetColumns.map(({ column, source, value: fieldValue }) => <div key={`${source}:${column.id}`} className="min-w-0 border-b border-cardline py-3">
      <div className="mb-2 flex items-start justify-between gap-2"><p className="text-xs font-semibold text-charcoal/75">{column.label}{column.required ? ' *' : ''}</p>{row.id && data.canEdit && !editing && <button aria-label={`Edit ${column.label}`} title={`Edit ${column.label}`} onClick={() => { setEditing({ column, source, previous: fieldValue || '' }); setValue(fieldValue || ''); setError(''); }} className="shrink-0 text-sage"><Pencil size={14} /></button>}</div>
      {!row.id ? <Field column={column} value={fieldValue || ''} onChange={(next) => { const key = source === 'sales' ? 'salesValues' : 'values'; setData((old) => ({ ...old, [key]: { ...old[key], [column.id]: next } })); }} onError={setError} onUploading={setUploading} /> : editing?.column.id === column.id ? <form onSubmit={saveField} className="space-y-2"><Field column={column} value={value} onChange={setValue} onError={setError} onUploading={setUploading} /><div className="flex gap-2"><Button type="submit" size="sm" disabled={saving || uploading}><Save size={13} />Save</Button><Button size="sm" variant="outline" disabled={saving || uploading} onClick={() => setEditing(null)}>Cancel</Button></div></form> : <Value column={column} value={fieldValue} onRemove={isAdmin && column.type === 'file' && fieldValue ? () => removeSavedField(column, source, fieldValue) : undefined} />}
    </div>)}</div>
  </section>;
  return <Modal open onClose={() => { if (!saving && !uploading && (!editing && !adding && !feeEdit && !editingPayment || window.confirm('Discard unsaved changes?'))) onClose(); }} title={row.appointmentCode || 'Appointment'} className="max-w-6xl">
    {loading ? <p className="py-10 text-center text-sm">Loading appointment...</p> : <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-charcoal/70">{row.id ? <p>Appointment date: {data?.appointmentDate || '-'}</p> : <Label title="Appointment date *"><input aria-label="Appointment date" className={inputClass} type="date" value={data?.appointmentDate || ''} onChange={(e) => setData((old) => ({ ...old, appointmentDate: e.target.value }))} required /></Label>}<span>{data?.canEdit ? 'Editable appointment' : 'Read only'}</span></div>
      <dl className="grid grid-cols-2 gap-x-5 gap-y-4 border-y border-cardline bg-white/60 px-4 py-4 text-xs lg:grid-cols-4">
        {[
          ['Appointment ID', data?.appointmentCode || 'Generated on save'],
          ['Entry date', data?.entryAt ? paidDate(data.entryAt) : 'On save'],
          ['Entry time', data?.entryAt ? new Date(data.entryAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : 'On save'],
          ['Last updated', data?.lastUpdatedAt ? stamp(data.lastUpdatedAt) : 'On save'],
          ...(sheet === 'management' ? [['Accepted', data?.acceptedAt ? stamp(data.acceptedAt) : '-']] : []),
          ['Added by', data?.createdByName ? `${data.createdByName}${data.bookedByRole === 'assistant_doctor' ? ' (PCC)' : ''}` : 'Current user'],
          ...(data?.bookingNote ? [['Note from PCC', data.bookingNote]] : []),
          ...(data?.status === 'rescheduled' ? [['Rescheduled to', data.rescheduledTo || '-'], ['Rescheduled by', data.rescheduledByName || '-']] : []),
          ...(data?.rescheduledFromDate ? [['Rescheduled from', data.rescheduledFromDate]] : []),
          ...(data?.rescheduleNote ? [['Reschedule note', data.rescheduleNote]] : []),
          ...(data?.status === 'not_coming' ? [['Not coming marked by', data.notComingByName || '-'], ['Marked at', stamp(data.notComingAt)]] : []),
        ].map(([label, text]) => <div key={label} className="min-w-0"><dt className="text-xs font-medium text-charcoal/75">{label}</dt><dd className="mt-1 break-words text-xs font-semibold leading-5 text-charcoal sm:text-sm">{text}</dd></div>)}
      </dl>
      {sheet === 'management' && row.id && data && (data.pcSavedAt
        ? <p className="rounded-md border border-[#FCD34D] bg-[#FFFBEB] px-3 py-2 text-xs text-[#78350F]"><b>Post Counselor saved the record</b>{data.pcSavedByName ? ` (${data.pcSavedByName}, ${stamp(data.pcSavedAt)})` : ''}. {data.pcLocked ? 'Appointment details, fee and payments are now locked for reception; reception details stay open.' : 'Admin can still correct it.'}</p>
        : data.canEdit && <p className="rounded-md border border-sage/30 bg-sage/10 px-3 py-2 text-xs text-charcoal/75">Appointment details, fee, payments and screenshots can be corrected until the Post Counselor saves the record.</p>)}
      {data?.status === 'not_coming' && data.notComingReason && <p className="text-sm"><span className="font-semibold">Not coming reason:</span> {data.notComingReason}</p>}
      {!isDirect && <div role="tablist" aria-label="Appointment sections" className="flex gap-2 overflow-x-auto border-b border-cardline pb-4 pt-1">{tabs.map(([key, label]) => {
        const Icon = tabIcons[key];
        return <button key={key} id={`appointment-tab-${key}`} role="tab" aria-selected={tab === key} aria-controls="appointment-section" disabled={saving || uploading || Boolean(editing) || editingAll || adding || feeEdit || Boolean(editingPayment)} onClick={() => setTab(key)} className={`flex min-h-16 min-w-[164px] flex-1 shrink-0 items-center gap-3 rounded-md border px-4 py-3 text-left text-xs font-semibold leading-5 transition-colors sm:text-sm ${tab === key ? `${sectionTones[key].active} shadow-sm` : `${sectionTones[key].idle} hover:brightness-95`} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage focus-visible:ring-offset-2 disabled:opacity-60`}><Icon size={20} className="shrink-0" aria-hidden="true" /><span className="min-w-0">{label}</span></button>;
      })}</div>}
      <div id="appointment-section" role={isDirect ? undefined : 'tabpanel'} aria-labelledby={isDirect ? undefined : `appointment-tab-${tab}`} className="space-y-5">
        {isDirect ? <div className="border-l-4 border-teal-600 bg-teal-50 px-4 py-4 text-teal-950"><h3 className="text-base font-bold text-charcoal sm:text-lg">Appointment form</h3><p className="mt-0.5 text-xs text-charcoal/65">Added directly at reception: patient details, reception details and payment in one form.</p></div> : <div className={`flex items-center justify-between gap-3 border-l-4 px-4 py-4 ${sectionTones[tab]?.heading || sectionTones.sales.heading}`}><h3 className="text-base font-bold text-charcoal sm:text-lg">{tabs.find(([key]) => key === tab)?.[1]}</h3>{user?.role === ROLES.RECEPTIONIST && tab === 'sales-confirmation' && <span className="shrink-0 text-xs font-semibold">Read only</span>}</div>}
        {error && <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        {data && !isDirect && tab !== 'payments' && (sheet !== 'sales' || tab !== 'reception-confirmation') && <div className="space-y-3">{tab.endsWith('confirmation') && <h3 className="text-sm font-bold">Confirmation details</h3>}<div className="flex justify-end">{canEditSection && editAllButton(columns.length)}</div>{fieldGrid(fieldSource, fieldSection)}{editAllBar}</div>}
        {data && isDirect && <div className="space-y-5"><div className="flex justify-end">{editAllButton(columnsFor('sales', 'details').length + columnsFor('reception', 'details').length)}</div>{[['sales', 'Patient details'], ['reception', 'Reception details']].map(([source, label]) => <section key={source} className="space-y-2"><h4 className="text-sm font-bold text-charcoal">{label}</h4>{fieldGrid(source, 'details')}</section>)}{editAllBar}</div>}
        {data && tab === 'sales-confirmation' && row.id && (sheet === 'sales' || data.callTarget?.sheet === 'sales') && [...ADMIN_LIKE_ROLES, ROLES.SALES_TEAM, ROLES.RECEPTIONIST].includes(user?.role) && <div className="border-t border-cardline pt-4"><h3 className="mb-3 text-sm font-bold">Sales calls</h3><SalesCallHistory embedded key={`sales:${sheet === 'sales' ? row.id : data.callTarget.id}`} row={{ id: sheet === 'sales' ? row.id : data.callTarget.id, appointmentCode: data.appointmentCode }} endpoint={`/sales-sheet/appointments/${sheet === 'sales' ? row.id : data.callTarget.id}/sales-calls`} onSaved={() => { load().catch(() => { }); onChanged?.(); }} /></div>}
        {data && tab === 'reception-confirmation' && row.id && (sheet === 'sales' || data.callTarget) && [...ADMIN_LIKE_ROLES, ROLES.RECEPTIONIST].includes(user?.role) && <div className="border-t border-cardline pt-4"><SalesCallHistory embedded key={`reception:${sheet}:${row.id}`} row={{ id: sheet === 'sales' ? row.id : data.callTarget.id, appointmentCode: data.appointmentCode }} endpoint={sheet === 'sales' || data.callTarget.sheet === 'sales' ? `/sales-sheet/appointments/${sheet === 'sales' ? row.id : data.callTarget.id}/calls` : `/sales-sheet/forms/management/${data.callTarget.id}/calls`} onSaved={() => { load().catch(() => { }); onChanged?.(); }} /></div>}
        {data && !row.id && (isDirect || tab === 'payments') && <div className="space-y-4 rounded-md border border-cardline bg-white/50 p-4">
          <div><p className="text-sm font-bold">Consultation payment</p><p className="mt-1 text-xs text-charcoal/70">Set the total fee and, if collected now, record the amount paid below. Both save with this appointment.</p></div>
          <Label title="Total consultation fee"><input className={inputClass} type="number" min="0" step="0.01" max="100000000" value={data.consultationFee ?? ''} onChange={(e) => setData((old) => ({ ...old, consultationFee: e.target.value }))} placeholder="Enter total amount to collect" /></Label>
          <div className="space-y-3 border-t border-cardline pt-4"><p className="text-sm font-bold">{sheet === 'sales' ? 'Payment added by sales' : 'Payment received at reception'}</p><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"><Label title={sheet === 'sales' ? 'Advance amount' : 'Paid amount'}><input className={inputClass} type="number" min="0.01" step="0.01" max={data.consultationFee || 100000000} value={newAdvance.paymentMode === 'split' ? splitTotal(newAdvance.splitRows) : newAdvance.amount} disabled={newAdvance.paymentMode === 'split'} onChange={(e) => setNewAdvance((old) => ({ ...old, amount: e.target.value }))} placeholder="Amount collected now" /></Label><Label title="Payment date"><input className={inputClass} type="date" max={today()} value={newAdvance.date} onChange={(e) => setNewAdvance((old) => ({ ...old, date: e.target.value }))} /></Label><Label title="Payment mode"><select className={inputClass} value={newAdvance.paymentMode} onChange={(e) => setNewAdvance((old) => ({ ...old, paymentMode: e.target.value, bank: '', reference: '', cashReceivedByName: '', files: [], splitRows: emptySplitRows() }))}><option value="cash">Cash</option><option value="online">Online</option><option value="split">Split (online + cash + card)</option></select></Label>{newAdvance.paymentMode !== 'cash' ? <>{newAdvance.paymentMode === 'split' && <div className="sm:col-span-2 lg:col-span-3"><SplitRows idPrefix="new-split" rows={newAdvance.splitRows} onChange={(rows) => setNewAdvance((old) => ({ ...old, splitRows: rows }))} /></div>}<Label title="Paid to bank"><select className={inputClass} value={newAdvance.bank} onChange={(e) => setNewAdvance((old) => ({ ...old, bank: e.target.value }))}><option value="">Select bank (optional)</option>{data.banks.map((bank) => <option key={bank._id} value={bank._id}>{bank.displayName || bank.name}</option>)}</select></Label>{newAdvance.paymentMode === 'online' && <Label title="UTR / reference *"><input className={inputClass} required maxLength={200} value={newAdvance.reference} onChange={(e) => setNewAdvance((old) => ({ ...old, reference: e.target.value }))} /></Label>}<Label title="Payment proof *"><input className={`${inputClass} text-xs`} type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={async (e) => { const file = e.target.files?.[0]; if (!file) return; setUploading(true); try { const body = new FormData(); body.append('file', file); const { data: result } = await api.post('/sales-sheet/consultation-upload', body); setNewAdvance((old) => ({ ...old, files: [{ url: result.file.url, fileName: result.file.fileName }] })); } catch (err) { setError(err.response?.data?.message || 'Payment proof could not be uploaded'); } finally { setUploading(false); } }} />{newAdvance.files[0] && <p className="mt-1 text-xs font-semibold text-sage">{newAdvance.files[0].fileName} attached</p>}</Label></> : <Label title="Cash received by *"><input className={inputClass} required maxLength={200} value={newAdvance.cashReceivedByName} onChange={(e) => setNewAdvance((old) => ({ ...old, cashReceivedByName: e.target.value }))} placeholder="Name of the person who received cash" /></Label>}</div><Label title="Payment notes"><textarea className={inputClass} rows={2} maxLength={2000} value={newAdvance.notes} onChange={(e) => setNewAdvance((old) => ({ ...old, notes: e.target.value }))} /></Label></div>
          {paymentSheetFields}
        </div>}
        {data && !row.id && <div className="flex justify-end border-t border-cardline pt-3"><Button disabled={saving || uploading} onClick={createAppointment}><Save size={15} />{saving ? 'Saving...' : 'Save appointment'}</Button></div>}
        {data && row.id && (isDirect || tab === 'payments') && <div className="space-y-4">{isDirect && <h4 className="border-t border-cardline pt-4 text-sm font-bold text-charcoal">Consultation payment</h4>}
          <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-semibold text-charcoal/70">Consultation fee</p><div className="mt-1 flex flex-wrap items-center gap-3"><strong className="text-lg">{data.consultationFee == null ? 'Not set' : money(data.consultationFee)}</strong>{data.canEdit && !data.pcLocked && !feeEdit && <Button size="sm" variant="outline" onClick={() => { setFee(data.consultationFee ?? ''); setFeeEdit(true); }}><Pencil size={14} />{data.consultationFee == null ? 'Set consultation fee' : 'Edit consultation fee'}</Button>}</div></div>{data.canEdit && !data.pcLocked && !adding && !editingPayment && ((sheet === 'sales' && [...ADMIN_LIKE_ROLES, ROLES.SALES_TEAM].includes(user?.role)) || sheet !== 'sales') && <Button size="sm" onClick={addReceipt}><Plus size={15} />{sheet === 'sales' ? 'Add sales payment' : 'Record reception payment'}</Button>}</div>
          {feeEdit && <form onSubmit={saveFee} className="flex flex-wrap items-end gap-2"><Label title="Total consultation fee *"><input className={inputClass} type="number" min="0" max="100000000" step="0.01" required value={fee} onChange={(e) => setFee(e.target.value)} /></Label><Button type="submit" disabled={saving}>Save fee</Button><Button variant="outline" disabled={saving} onClick={() => setFeeEdit(false)}>Cancel</Button></form>}
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">{[['Sales advance', money(advance)], ['Reception received', money(received - advance)], ['Reception approved', money(approved)], [remaining !== null && remaining < 0 ? 'Extra received' : 'Remaining fee', remaining === null ? 'Fee not set' : money(Math.abs(remaining))]].map(([label, amount]) => <div key={label} className="rounded-md border border-cardline bg-white/60 p-3"><p className="text-xs text-charcoal/70">{label}</p><p className="mt-1 text-base font-bold">{amount}</p></div>)}</div>
          {editableSalesReceipts.length > 0 && !editingPayment && <div className="flex flex-wrap gap-2">{editableSalesReceipts.map((item) => <Button key={item._id} size="sm" variant="outline" onClick={() => openPaymentEdit(item)}><Pencil size={14} />{sheet === 'sales' ? 'Edit sales advance' : 'Edit payment'} {money(item.amount)}{sheet !== 'sales' && ` · ${paidDate(item.date)}`}{item.status === 'approved' && sheet !== 'sales' ? ' (verified)' : ''}</Button>)}</div>}
          {editingPayment && <form onSubmit={saveEditedPayment} className="space-y-4 border-y border-cardline py-4">
            <div className="flex items-center justify-between gap-3"><h3 className="text-sm font-bold">{sheet === 'sales' ? 'Edit sales advance' : 'Edit payment'}</h3><span className="text-xs text-charcoal/70">{sheet === 'sales' ? 'Available until verification or reception acceptance' : 'Available until the Post Counselor saves the record. A verified payment goes back for verification.'}</span></div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <Label title={sheet === 'sales' ? 'Advance amount *' : 'Amount *'}><input className={inputClass} type="number" min="0.01" max={sheet === 'sales' ? data.consultationFee ?? 100000000 : 100000000} step="0.01" required={editingPayment.paymentMode !== 'split'} disabled={editingPayment.paymentMode === 'split'} value={editingPayment.paymentMode === 'split' ? splitTotal(editingPayment.splitRows) : editingPayment.amount} onChange={(e) => setEditingPayment((old) => ({ ...old, amount: e.target.value }))} /></Label>
              <Label title="Payment date *"><input className={inputClass} type="date" max={today()} required value={editingPayment.date} onChange={(e) => setEditingPayment((old) => ({ ...old, date: e.target.value }))} /></Label>
              <Label title="Payment mode"><select className={inputClass} value={editingPayment.paymentMode} onChange={(e) => setEditingPayment((old) => ({ ...old, paymentMode: e.target.value, bank: '', reference: '', cashReceivedByName: '', files: [], splitRows: emptySplitRows() }))}><option value="cash">Cash</option><option value="online">Online</option><option value="split">Split (online + cash + card)</option></select></Label>
              {editingPayment.paymentMode !== 'cash' ? <>
                {editingPayment.paymentMode === 'split' && <div className="sm:col-span-2 lg:col-span-3"><SplitRows idPrefix="edit-split" rows={editingPayment.splitRows} onChange={(rows) => setEditingPayment((old) => ({ ...old, splitRows: rows }))} /></div>}
                <Label title="Paid to bank"><select className={inputClass} value={editingPayment.bank} onChange={(e) => setEditingPayment((old) => ({ ...old, bank: e.target.value }))}><option value="">Select bank (optional)</option>{data.banks.map((bank) => <option key={bank._id} value={bank._id}>{bank.displayName || bank.name}</option>)}</select></Label>
                {editingPayment.paymentMode === 'online' && <Label title="UTR / reference *"><input className={inputClass} maxLength={200} required value={editingPayment.reference} onChange={(e) => setEditingPayment((old) => ({ ...old, reference: e.target.value }))} /></Label>}
                <Label title="Payment proof *"><input className={`${inputClass} text-xs`} type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={async (e) => { const file = e.target.files?.[0]; if (!file) return; setUploading(true); setError(''); try { const body = new FormData(); body.append('file', file); const { data: result } = await api.post('/sales-sheet/consultation-upload', body); setEditingPayment((old) => ({ ...old, files: [{ url: result.file.url, fileName: result.file.fileName }] })); } catch (err) { setError(err.response?.data?.message || 'Payment proof could not be uploaded'); } finally { setUploading(false); } }} />{editingPayment.files.length > 0 && <p className="mt-1 text-xs font-semibold text-sage">{editingPayment.files[0].fileName || 'Payment proof'} attached</p>}</Label>
              </> : <Label title="Cash received by *"><input className={inputClass} required maxLength={200} value={editingPayment.cashReceivedByName} onChange={(e) => setEditingPayment((old) => ({ ...old, cashReceivedByName: e.target.value }))} /></Label>}
            </div>
            <Label title="Payment notes"><textarea className={inputClass} rows={2} maxLength={2000} value={editingPayment.notes} onChange={(e) => setEditingPayment((old) => ({ ...old, notes: e.target.value }))} /></Label>
            <div className="flex justify-end gap-2"><Button variant="outline" disabled={saving || uploading} onClick={() => setEditingPayment(null)}>Cancel</Button><Button type="submit" disabled={saving || uploading}><Save size={14} />{saving ? 'Saving...' : 'Save payment changes'}</Button></div>
          </form>}
          {adding && <form onSubmit={saveReceipt} className="space-y-3 border-y border-cardline py-4">
            <h3 className="text-sm font-bold">{sheet === 'sales' ? 'Sales advance receipt' : 'Reception collection receipt'}</h3>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <Label title="Patient / visitor name *"><input className={inputClass} value={receipt.patientName} onChange={changeReceipt('patientName')} required maxLength={200} /></Label>
              <Label title="Patient ID (optional)"><input className={inputClass} value={receipt.patientCode} onChange={changeReceipt('patientCode')} maxLength={100} /></Label>
              <Label title="Amount received *"><input className={inputClass} type="number" min="0.01" step="0.01" max="100000000" required={receipt.paymentMode !== 'split'} disabled={receipt.paymentMode === 'split'} value={receipt.paymentMode === 'split' ? splitTotal(receipt.splitRows) : receipt.amount} onChange={changeReceipt('amount')} /></Label>
              <Label title="Payment date *"><input className={inputClass} type="date" max={today()} required value={receipt.date} onChange={changeReceipt('date')} /></Label>
              <Label title="Mode"><select className={inputClass} value={receipt.paymentMode} onChange={(e) => { setReceipt((old) => ({ ...old, paymentMode: e.target.value, bank: '', reference: '', cashReceivedByName: '', splitRows: emptySplitRows() })); setFiles([]); }}><option value="cash">Cash</option><option value="online">Online</option><option value="split">Split (online + cash + card)</option></select></Label>
              {receipt.paymentMode !== 'cash' && <Label title="Bank"><select className={inputClass} value={receipt.bank} onChange={changeReceipt('bank')}><option value="">Unassigned bank</option>{data.banks.map((bank) => <option key={bank._id} value={bank._id}>{bank.displayName || bank.name}</option>)}</select></Label>}
              {receipt.paymentMode === 'split' ? <div className="sm:col-span-2 lg:col-span-3"><SplitRows idPrefix="receipt-split" rows={receipt.splitRows} onChange={(rows) => setReceipt((old) => ({ ...old, splitRows: rows }))} /></div> : receipt.paymentMode === 'online' ? <Label title="UTR / reference *"><input className={inputClass} maxLength={200} required value={receipt.reference} onChange={changeReceipt('reference')} /></Label> : <Label title="Cash received by *"><input className={inputClass} required maxLength={200} value={receipt.cashReceivedByName} onChange={changeReceipt('cashReceivedByName')} /></Label>}
            </div>
            {receipt.paymentMode !== 'cash' && <Label title={receipt.paymentMode === 'split' ? 'Payment screenshot / card slip' : 'Payment screenshot / proof *'}><input className={`${inputClass} text-xs`} type="file" required={receipt.paymentMode === 'online'} multiple accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(e) => { const next = [...e.target.files]; if (next.length > 5 || next.some((file) => file.size > 10 * 1024 * 1024)) { setError('Maximum 5 proofs, each up to 10 MB'); e.target.value = ''; setFiles([]); } else { setFiles(next); setError(''); } }} /><label className="mt-1 inline-flex cursor-pointer items-center gap-1 text-xs font-semibold text-sage hover:underline">Take photo<input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { const shot = e.target.files?.[0]; if (shot) setFiles((old) => [...old, shot].slice(0, 5)); e.target.value = ''; }} /></label>{files.length > 0 && <p className="mt-1 text-xs text-charcoal/60">{files.length} file(s) attached</p>}</Label>}
            <Label title="Notes"><textarea className={inputClass} maxLength={2000} rows={2} value={receipt.notes} onChange={changeReceipt('notes')} /></Label>
            <div className="flex justify-end gap-2"><Button variant="outline" disabled={saving} onClick={() => setAdding(false)}>Cancel</Button><Button type="submit" disabled={saving}><Save size={14} />{saving ? 'Saving...' : 'Save receipt'}</Button></div>
          </form>}
          <div className="overflow-x-auto rounded-md border border-cardline"><table className="w-full min-w-[720px] text-left text-sm"><thead className="bg-[#56695D] text-white"><tr>{['Collection', 'Paid on', 'Amount', 'Payment details', 'Verification', 'Proof'].map((label) => <th key={label} className="px-3 py-2 text-xs font-semibold">{label}</th>)}</tr></thead><tbody className="divide-y divide-cardline">{receipts.map((item) => <tr key={item._id}>
            <td className="px-3 py-3"><p className="font-semibold">{item.collectionStage === 'advance' ? 'Sales advance' : 'Reception collection'}</p><p className="text-xs text-charcoal/70">Recorded by {item.recordedByName || '-'}</p>{item.createdAt && <p className="text-xs text-charcoal/60">{stamp(item.createdAt)}</p>}</td>
            <td className="px-3 py-3 text-xs">{paidDate(item.date)}</td><td className="px-3 py-3 font-semibold">{money(item.amount)}</td>
            <td className="px-3 py-3 text-xs"><p className="font-semibold">{item.paymentMode === 'split' ? 'Split payment' : item.paymentMode === 'cash' ? 'Cash received' : 'Online payment'}</p>{item.paymentMode === 'split' && <p className="mt-1">{(item.splits || []).map((p) => `${p.mode} ${money(p.amount)}${p.utr ? ` (${p.utr})` : p.receivedBy ? ` (${p.receivedBy})` : ''}`).join(' + ')}</p>}{item.paymentMode === 'cash' ? <p className="mt-1">Received by {item.cashReceivedByName || item.recordedByName || '-'}</p> : <>{item.bankName && <p className="mt-1">Bank: {item.bankName}</p>}{item.reference && <p className="mt-1 break-all">UTR / reference: {item.reference}</p>}</>}{item.notes && <p className="mt-1 max-w-64 whitespace-pre-wrap break-words text-charcoal/70">{item.notes}</p>}</td>
            <td className="px-3 py-3"><span className={`rounded px-2 py-1 text-xs font-semibold capitalize ${item.status === 'approved' ? 'bg-emerald-50 text-emerald-800' : item.status === 'cancelled' ? 'bg-red-50 text-red-800' : 'bg-amber-50 text-amber-800'}`}>{item.status}</span>{item.approvedByName && <p className="mt-1 text-xs">{item.approvedByName}</p>}</td><td className="px-3 py-3"><CompactAttachments files={item.files || []} label="Proof" deleteUrl={isAdmin ? `/accounts/consultation-receipts/${item._id}/files` : ''} onDeleted={load} /></td>
          </tr>)}{!receipts.length && <tr><td colSpan={6} className="p-6 text-center text-sm text-charcoal/70"><CreditCard size={20} className="mx-auto mb-2" />No consultation receipts recorded</td></tr>}</tbody></table></div>
          {paymentSheetFields}
        </div>}
      </div>
    </div>}
  </Modal>;
}

export { Field, Value };
