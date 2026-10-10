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
import { ROLES } from '../constants/roles.js';

const inputClass = 'w-full min-w-0 rounded-md border border-cardline bg-white px-3 py-2 text-sm text-charcoal outline-none focus:ring-2 focus:ring-sage/30';
const money = (value) => `Rs ${Number(value || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const today = () => { const date = new Date(); return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
const paidDate = (value) => value ? new Date(value).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '-';
const stamp = (value) => value ? new Date(value).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-';
const href = (value) => value?.startsWith('/uploads/') ? `${(import.meta.env.VITE_API_URL || 'http://localhost:5000/api').replace(/\/api\/?$/, '')}${value}` : undefined;
const checked = (value) => [true, 'true', '\u2611'].includes(value);
const Label = ({ title, children }) => <label className="block min-w-0"><span className="mb-1 block text-xs font-semibold text-charcoal/80">{title}</span>{children}</label>;

function Value({ column, value }) {
  if (column.type === 'checkbox') return <span className="inline-flex items-center gap-2 text-sm">{checked(value) ? <Check size={16} className="text-sage" /> : <X size={16} className="text-charcoal/50" />}{checked(value) ? 'Yes' : 'No'}</span>;
  if (column.type === 'file' && value) return href(value) ? <a className="inline-flex items-center gap-1 text-sm font-semibold text-sage underline" href={href(value)} target="_blank" rel="noreferrer"><FileText size={14} />View attachment</a> : <span className="text-xs text-charcoal/70">Attachment needs re-upload</span>;
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
  const [newAdvance, setNewAdvance] = useState({ amount: '', date: today(), paymentMode: 'cash', bank: '', reference: '', cashReceivedByName: '', notes: '', files: [] });
  const endpoint = `/sales-sheet/forms/${sheet}/${row.id}`;
  const load = useCallback(async () => {
    if (!row.id) {
      const [sales, reception, banks] = await Promise.all([
        api.get('/sales-sheet/columns', { skipCache: true }),
        sheet === 'management' ? api.get('/sales-sheet/management-columns', { skipCache: true }) : Promise.resolve({ data: { columns: [] } }),
        api.get('/sales-sheet/banks', { skipCache: true }),
      ]);
      setData({ appointmentDate: row.appointmentDate, consultationFee: null, salesColumns: sales.data.columns, columns: reception.data.columns, salesValues: {}, values: {}, receipts: [], banks: banks.data.banks, canEdit: true });
      return;
    }
    const response = await api.get(endpoint, { skipCache: true }); setData(response.data);
  }, [endpoint, row.id, row.appointmentDate, sheet]);
  useEffect(() => { setLoading(true); load().catch((err) => setError(err.response?.data?.message || 'Appointment could not be loaded')).finally(() => setLoading(false)); }, [load]);
  const saveField = async (e) => {
    e.preventDefault(); setSaving(true); setError('');
    try { await api.patch(`${endpoint}/field`, { columnId: editing.column.id, source: editing.source, previousValue: editing.previous, value }); await load(); setEditing(null); onChanged?.(); }
    catch (err) { setError(err.response?.data?.message || 'Field could not be saved'); }
    finally { setSaving(false); }
  };
  const beginEditAll = () => {
    setOriginalValues({ ...values });
    setEditingAll(true);
    setError('');
  };
  const saveAllFields = async () => {
    const changed = columns.filter((column) => String(values[column.id] || '') !== String(originalValues[column.id] || ''));
    if (!changed.length) { setEditingAll(false); return; }
    setSaving(true); setError('');
    try {
      for (const column of changed) await api.patch(`${endpoint}/field`, { columnId: column.id, source: fieldSource, previousValue: originalValues[column.id] || '', value: values[column.id] || '' });
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
    setReceipt({ patientName: nameColumn ? data.salesValues[nameColumn.id] || '' : data.receipts[0]?.patientName || '', patientCode: patientColumn ? data.values[patientColumn.id] || '' : '', amount: '', date: today(), paymentMode: 'cash', bank: '', reference: '', cashReceivedByName: '', notes: '', submissionKey: crypto.randomUUID() });
    setFiles([]); setAdding(true); setError('');
  };
  const saveReceipt = async (e) => {
    e.preventDefault();
    if (receipt.paymentMode === 'online' && (!receipt.reference.trim() || !files.length)) { setError('Online payment needs UTR/reference and payment proof.'); return; }
    if (receipt.paymentMode === 'cash' && !receipt.cashReceivedByName.trim()) { setError('Enter who received the cash payment.'); return; }
    setSaving(true); setError('');
    try { const body = new FormData(); Object.entries(receipt).forEach(([key, val]) => body.append(key, val)); files.forEach((file) => body.append('proof', file)); await api.post(`${endpoint}/receipts`, body); await load(); setAdding(false); onChanged?.(); }
    catch (err) { setError(err.response?.data?.message || 'Payment could not be recorded'); }
    finally { setSaving(false); }
  };
  const saveEditedPayment = async (event) => {
    event.preventDefault();
    if (editingPayment.paymentMode === 'online' && (!editingPayment.reference.trim() || !editingPayment.files.length)) { setError('Online payment needs UTR/reference and payment proof.'); return; }
    if (editingPayment.paymentMode === 'cash' && !editingPayment.cashReceivedByName.trim()) { setError('Enter who received the cash payment.'); return; }
    setSaving(true); setError('');
    try {
      await api.patch(`${endpoint}/receipts/${editingPayment.id}`, editingPayment);
      await load(); setEditingPayment(null); onChanged?.();
    } catch (err) { setError(err.response?.data?.message || 'Sales payment could not be updated'); }
    finally { setSaving(false); }
  };
  const openPaymentEdit = (item) => {
    setEditingPayment({ id: item._id, amount: String(item.amount), date: String(item.date).slice(0, 10),
      paymentMode: item.paymentMode, bank: item.bank || '', reference: item.reference || '',
      cashReceivedByName: item.cashReceivedByName || '', notes: item.notes || '', files: item.files || [] });
    setError('');
  };
  const changeReceipt = (key) => (e) => setReceipt((old) => ({ ...old, [key]: e.target.value }));
  const createAppointment = async () => {
    if (!data.appointmentDate) { setError('Select the appointment date.'); setTab('sales'); return; }
    const requiredField = [
      ...data.salesColumns.map((column) => ({ column, source: 'sales', value: data.salesValues[column.id] })),
      ...(sheet === 'management' ? data.columns.map((column) => ({ column, source: 'reception', value: data.values[column.id] })) : []),
    ].find(({ column, value }) => column.required && !String(value ?? '').trim());
    if (requiredField) {
      const section = columnSection(requiredField.column);
      setTab(section === 'payments' ? 'payments' : requiredField.source === 'sales'
        ? section === 'confirmation' ? 'sales-confirmation' : 'sales'
        : section === 'confirmation' ? 'reception-confirmation' : 'reception');
      setError(`${requiredField.column.label} is required.`);
      return;
    }
    if (newAdvance.amount && (data.consultationFee === '' || data.consultationFee === null || data.consultationFee === undefined)) {
      setError('Set the total consultation fee before adding a payment.'); setTab('payments'); return;
    }
    if (newAdvance.amount && newAdvance.paymentMode === 'online' && (!newAdvance.reference.trim() || !newAdvance.files.length)) { setError('Online payment needs UTR/reference and a payment proof.'); setTab('payments'); return; }
    if (newAdvance.amount && newAdvance.paymentMode === 'cash' && !newAdvance.cashReceivedByName.trim()) { setError('Enter who received the cash payment.'); setTab('payments'); return; }
    setSaving(true); setError('');
    try {
      const body = sheet === 'sales' ? { appointmentDate: data.appointmentDate, consultationFee: data.consultationFee, advance: newAdvance.amount ? newAdvance : undefined, values: data.salesValues } : { appointmentDate: data.appointmentDate, consultationFee: data.consultationFee, salesValues: data.salesValues, values: data.values, payment: newAdvance.amount ? newAdvance : undefined };
      const response = await api.post(`/sales-sheet/${sheet === 'sales' ? 'appointments' : 'management'}`, body);
      onCreated({ ...response.data.appointment, initialTab: 'sales' }); onChanged?.();
    } catch (err) { setError(err.response?.data?.message || 'Appointment could not be created'); }
    finally { setSaving(false); }
  };
  const receipts = data?.receipts || [];
  const editableSalesReceipts = sheet === 'sales' && row.id && data?.canEdit && !data.acceptedAt && [ROLES.ADMIN, ROLES.SALES_TEAM].includes(user?.role)
    ? receipts.filter((item) => item.collectionStage === 'advance' && item.status === 'pending') : [];
  const received = receipts.filter((item) => item.status !== 'cancelled').reduce((sum, item) => sum + item.amount, 0);
  const advance = receipts.filter((item) => item.status !== 'cancelled' && item.collectionStage === 'advance').reduce((sum, item) => sum + item.amount, 0);
  const approved = receipts.filter((item) => item.status === 'approved').reduce((sum, item) => sum + item.amount, 0);
  const remaining = data?.consultationFee == null ? null : data.consultationFee - received;
  const fieldSource = tab.startsWith('sales') ? 'sales' : 'reception';
  const fieldSection = tab.endsWith('confirmation') ? 'confirmation' : 'details';
  const columns = (fieldSource === 'sales' ? data?.salesColumns : data?.columns)?.filter((column) => columnSection(column) === fieldSection) || [];
  const values = fieldSource === 'sales' ? data?.salesValues : data?.values;
  const tabs = sheet === 'sales'
    ? [['sales', 'Sales details'], ['payments', 'Consultation payments'], ['sales-confirmation', 'Sales confirmation calls'], ...(row.id && [ROLES.ADMIN, ROLES.RECEPTIONIST].includes(user?.role) ? [['reception-confirmation', 'Reception calls']] : [])]
    : [['sales', 'Sales details'], ['payments', 'Consultation payments'], ['sales-confirmation', 'Sales confirmation calls'], ['reception-confirmation', 'Reception call confirmation'], ['reception', 'Reception details']];
  const canEditSection = data?.canEdit && !(user?.role === ROLES.RECEPTIONIST && tab === 'sales-confirmation');
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
      {!row.id ? <Field column={column} value={fieldValue || ''} onChange={(next) => { const key = source === 'sales' ? 'salesValues' : 'values'; setData((old) => ({ ...old, [key]: { ...old[key], [column.id]: next } })); }} onError={setError} onUploading={setUploading} /> : editing?.column.id === column.id ? <form onSubmit={saveField} className="space-y-2"><Field column={column} value={value} onChange={setValue} onError={setError} onUploading={setUploading} /><div className="flex gap-2"><Button type="submit" size="sm" disabled={saving || uploading}><Save size={13} />Save</Button><Button size="sm" variant="outline" disabled={saving || uploading} onClick={() => setEditing(null)}>Cancel</Button></div></form> : <Value column={column} value={fieldValue} />}
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
          ['Added by', data?.createdByName || 'Current user'],
          ...(data?.status === 'rescheduled' ? [['Rescheduled to', data.rescheduledTo || '-'], ['Rescheduled by', data.rescheduledByName || '-']] : []),
          ...(data?.status === 'not_coming' ? [['Not coming marked by', data.notComingByName || '-'], ['Marked at', stamp(data.notComingAt)]] : []),
        ].map(([label, text]) => <div key={label} className="min-w-0"><dt className="text-xs font-medium text-charcoal/75">{label}</dt><dd className="mt-1 break-words text-xs font-semibold leading-5 text-charcoal sm:text-sm">{text}</dd></div>)}
      </dl>
      {data?.status === 'not_coming' && data.notComingReason && <p className="text-sm"><span className="font-semibold">Not coming reason:</span> {data.notComingReason}</p>}
      <div role="tablist" aria-label="Appointment sections" className="flex gap-2 overflow-x-auto border-b border-cardline pb-4 pt-1">{tabs.map(([key, label]) => {
        const Icon = tabIcons[key];
        return <button key={key} id={`appointment-tab-${key}`} role="tab" aria-selected={tab === key} aria-controls="appointment-section" disabled={saving || uploading || Boolean(editing) || editingAll || adding || feeEdit || Boolean(editingPayment)} onClick={() => setTab(key)} className={`flex min-h-16 min-w-[164px] flex-1 shrink-0 items-center gap-3 rounded-md border px-4 py-3 text-left text-xs font-semibold leading-5 transition-colors sm:text-sm ${tab === key ? `${sectionTones[key].active} shadow-sm` : `${sectionTones[key].idle} hover:brightness-95`} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage focus-visible:ring-offset-2 disabled:opacity-60`}><Icon size={20} className="shrink-0" aria-hidden="true" /><span className="min-w-0">{label}</span></button>;
      })}</div>
      <div id="appointment-section" role="tabpanel" aria-labelledby={`appointment-tab-${tab}`} className="space-y-5">
      <div className={`flex items-center justify-between gap-3 border-l-4 px-4 py-4 ${sectionTones[tab]?.heading || sectionTones.sales.heading}`}><h3 className="text-base font-bold text-charcoal sm:text-lg">{tabs.find(([key]) => key === tab)?.[1]}</h3>{user?.role === ROLES.RECEPTIONIST && tab === 'sales-confirmation' && <span className="shrink-0 text-xs font-semibold">Read only</span>}</div>
      {error && <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {data && tab !== 'payments' && (sheet !== 'sales' || tab !== 'reception-confirmation') && <div className="space-y-3">{tab.endsWith('confirmation') && <h3 className="text-sm font-bold">Confirmation details</h3>}<div className="flex justify-end">{row.id && canEditSection && !editing && !editingAll && columns.length > 0 && <Button size="sm" variant="outline" onClick={beginEditAll}><Pencil size={14} />Edit all details</Button>}</div><div className="grid gap-x-6 bg-white/70 px-4 sm:grid-cols-2 lg:grid-cols-3">{columns.map((column) => <div key={column.id} className="min-w-0 border-b border-cardline py-3">
        <div className="mb-2 flex items-start justify-between gap-2"><p className="text-xs font-semibold text-charcoal/75">{column.label}{column.required ? ' *' : ''}</p>{row.id && canEditSection && !editing && !editingAll && <button aria-label={`Edit ${column.label}`} title={`Edit ${column.label}`} onClick={() => { setEditing({ column, source: fieldSource, previous: values[column.id] || '' }); setValue(values[column.id] || ''); setError(''); }} className="shrink-0 text-sage"><Pencil size={14} /></button>}</div>
        {((!row.id || editingAll) && canEditSection) ? <Field column={column} value={values[column.id] || ''} onChange={(next) => { const key = fieldSource === 'sales' ? 'salesValues' : 'values'; setData((old) => ({ ...old, [key]: { ...old[key], [column.id]: next } })); }} onError={setError} onUploading={setUploading} /> : editing?.column.id === column.id ? <form onSubmit={saveField} className="space-y-2"><Field column={column} value={value} onChange={setValue} onError={setError} onUploading={setUploading} /><div className="flex gap-2"><Button type="submit" size="sm" disabled={saving || uploading}><Save size={13} />Save</Button><Button size="sm" variant="outline" disabled={saving || uploading} onClick={() => setEditing(null)}>Cancel</Button></div></form> : <Value column={column} value={values[column.id]} />}
      </div>)}{!columns.length && <p className="py-8 text-sm text-charcoal/70">No fields in this section</p>}</div>{editingAll && <div className="flex justify-end gap-2 border-t border-cardline pt-3"><Button variant="outline" disabled={saving || uploading} onClick={() => { setEditingAll(false); load().catch(() => {}); }}>Cancel</Button><Button disabled={saving || uploading} onClick={saveAllFields}><Save size={15} />{saving ? 'Saving...' : 'Save details'}</Button></div>}</div>}
      {data && tab === 'sales-confirmation' && row.id && (sheet === 'sales' || data.callTarget?.sheet === 'sales') && [ROLES.ADMIN, ROLES.SALES_TEAM, ROLES.RECEPTIONIST].includes(user?.role) && <div className="border-t border-cardline pt-4"><h3 className="mb-3 text-sm font-bold">Sales calls</h3><SalesCallHistory embedded key={`sales:${sheet === 'sales' ? row.id : data.callTarget.id}`} row={{ id: sheet === 'sales' ? row.id : data.callTarget.id, appointmentCode: data.appointmentCode }} endpoint={`/sales-sheet/appointments/${sheet === 'sales' ? row.id : data.callTarget.id}/sales-calls`} onSaved={() => { load().catch(() => {}); onChanged?.(); }} /></div>}
      {data && tab === 'reception-confirmation' && row.id && (sheet === 'sales' || data.callTarget) && [ROLES.ADMIN, ROLES.RECEPTIONIST].includes(user?.role) && <div className="border-t border-cardline pt-4"><SalesCallHistory embedded key={`reception:${sheet}:${row.id}`} row={{ id: sheet === 'sales' ? row.id : data.callTarget.id, appointmentCode: data.appointmentCode }} endpoint={sheet === 'sales' || data.callTarget.sheet === 'sales' ? `/sales-sheet/appointments/${sheet === 'sales' ? row.id : data.callTarget.id}/calls` : `/sales-sheet/forms/management/${data.callTarget.id}/calls`} onSaved={() => { load().catch(() => {}); onChanged?.(); }} /></div>}
      {data && !row.id && tab === 'payments' && <div className="space-y-4 rounded-md border border-cardline bg-white/50 p-4">
        <div><p className="text-sm font-bold">Consultation payment</p><p className="mt-1 text-xs text-charcoal/70">Set the total fee and, if collected now, record the amount paid below. Both save with this appointment.</p></div>
        <Label title="Total consultation fee"><input className={inputClass} type="number" min="0" step="0.01" max="100000000" value={data.consultationFee ?? ''} onChange={(e) => setData((old) => ({ ...old, consultationFee: e.target.value }))} placeholder="Enter total amount to collect" /></Label>
        <div className="space-y-3 border-t border-cardline pt-4"><p className="text-sm font-bold">{sheet === 'sales' ? 'Payment added by sales' : 'Payment received at reception'}</p><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"><Label title={sheet === 'sales' ? 'Advance amount' : 'Paid amount'}><input className={inputClass} type="number" min="0.01" step="0.01" max={data.consultationFee || 100000000} value={newAdvance.amount} onChange={(e) => setNewAdvance((old) => ({ ...old, amount: e.target.value }))} placeholder="Amount collected now" /></Label><Label title="Payment date"><input className={inputClass} type="date" max={today()} value={newAdvance.date} onChange={(e) => setNewAdvance((old) => ({ ...old, date: e.target.value }))} /></Label><Label title="Payment mode"><select className={inputClass} value={newAdvance.paymentMode} onChange={(e) => setNewAdvance((old) => ({ ...old, paymentMode: e.target.value, bank: '', reference: '', cashReceivedByName: '', files: [] }))}><option value="cash">Cash</option><option value="online">Online</option></select></Label>{newAdvance.paymentMode === 'online' ? <><Label title="Paid to bank"><select className={inputClass} value={newAdvance.bank} onChange={(e) => setNewAdvance((old) => ({ ...old, bank: e.target.value }))}><option value="">Select bank (optional)</option>{data.banks.map((bank) => <option key={bank._id} value={bank._id}>{bank.displayName || bank.name}</option>)}</select></Label><Label title="UTR / reference *"><input className={inputClass} required maxLength={200} value={newAdvance.reference} onChange={(e) => setNewAdvance((old) => ({ ...old, reference: e.target.value }))} /></Label><Label title="Payment proof *"><input className={`${inputClass} text-xs`} type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={async (e) => { const file = e.target.files?.[0]; if (!file) return; setUploading(true); try { const body = new FormData(); body.append('file', file); const { data: result } = await api.post('/sales-sheet/consultation-upload', body); setNewAdvance((old) => ({ ...old, files: [{ url: result.file.url, fileName: result.file.fileName }] })); } catch (err) { setError(err.response?.data?.message || 'Payment proof could not be uploaded'); } finally { setUploading(false); } }} />{newAdvance.files[0] && <p className="mt-1 text-xs font-semibold text-sage">{newAdvance.files[0].fileName} attached</p>}</Label></> : <Label title="Cash received by *"><input className={inputClass} required maxLength={200} value={newAdvance.cashReceivedByName} onChange={(e) => setNewAdvance((old) => ({ ...old, cashReceivedByName: e.target.value }))} placeholder="Name of the person who received cash" /></Label>}</div><Label title="Payment notes"><textarea className={inputClass} rows={2} maxLength={2000} value={newAdvance.notes} onChange={(e) => setNewAdvance((old) => ({ ...old, notes: e.target.value }))} /></Label></div>
        {paymentSheetFields}
      </div>}
      {data && !row.id && <div className="flex justify-end border-t border-cardline pt-3"><Button disabled={saving || uploading} onClick={createAppointment}><Save size={15} />{saving ? 'Saving...' : 'Save appointment'}</Button></div>}
      {data && row.id && tab === 'payments' && <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-semibold text-charcoal/70">Consultation fee</p><div className="mt-1 flex flex-wrap items-center gap-3"><strong className="text-lg">{data.consultationFee == null ? 'Not set' : money(data.consultationFee)}</strong>{data.canEdit && !feeEdit && <Button size="sm" variant="outline" onClick={() => { setFee(data.consultationFee ?? ''); setFeeEdit(true); }}><Pencil size={14} />{data.consultationFee == null ? 'Set consultation fee' : 'Edit consultation fee'}</Button>}</div></div>{data.canEdit && !adding && !editingPayment && ((sheet === 'sales' && [ROLES.ADMIN, ROLES.SALES_TEAM].includes(user?.role)) || sheet !== 'sales') && <Button size="sm" onClick={addReceipt}><Plus size={15} />{sheet === 'sales' ? 'Add sales payment' : 'Record reception payment'}</Button>}</div>
        {feeEdit && <form onSubmit={saveFee} className="flex flex-wrap items-end gap-2"><Label title="Total consultation fee *"><input className={inputClass} type="number" min="0" max="100000000" step="0.01" required value={fee} onChange={(e) => setFee(e.target.value)} /></Label><Button type="submit" disabled={saving}>Save fee</Button><Button variant="outline" disabled={saving} onClick={() => setFeeEdit(false)}>Cancel</Button></form>}
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">{[['Sales advance', money(advance)], ['Reception received', money(received - advance)], ['Accountant approved', money(approved)], [remaining !== null && remaining < 0 ? 'Extra received' : 'Remaining fee', remaining === null ? 'Fee not set' : money(Math.abs(remaining))]].map(([label, amount]) => <div key={label} className="rounded-md border border-cardline bg-white/60 p-3"><p className="text-xs text-charcoal/70">{label}</p><p className="mt-1 text-base font-bold">{amount}</p></div>)}</div>
        {editableSalesReceipts.length > 0 && !editingPayment && <div className="flex flex-wrap gap-2">{editableSalesReceipts.map((item) => <Button key={item._id} size="sm" variant="outline" onClick={() => openPaymentEdit(item)}><Pencil size={14} />Edit sales advance {money(item.amount)}</Button>)}</div>}
        {editingPayment && <form onSubmit={saveEditedPayment} className="space-y-4 border-y border-cardline py-4">
          <div className="flex items-center justify-between gap-3"><h3 className="text-sm font-bold">Edit sales advance</h3><span className="text-xs text-charcoal/70">Available until verification or reception acceptance</span></div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Label title="Advance amount *"><input className={inputClass} type="number" min="0.01" max={data.consultationFee ?? 100000000} step="0.01" required value={editingPayment.amount} onChange={(e) => setEditingPayment((old) => ({ ...old, amount: e.target.value }))} /></Label>
            <Label title="Payment date *"><input className={inputClass} type="date" max={today()} required value={editingPayment.date} onChange={(e) => setEditingPayment((old) => ({ ...old, date: e.target.value }))} /></Label>
            <Label title="Payment mode"><select className={inputClass} value={editingPayment.paymentMode} onChange={(e) => setEditingPayment((old) => ({ ...old, paymentMode: e.target.value, bank: '', reference: '', cashReceivedByName: '', files: [] }))}><option value="cash">Cash</option><option value="online">Online</option></select></Label>
            {editingPayment.paymentMode === 'online' ? <>
              <Label title="Paid to bank"><select className={inputClass} value={editingPayment.bank} onChange={(e) => setEditingPayment((old) => ({ ...old, bank: e.target.value }))}><option value="">Select bank (optional)</option>{data.banks.map((bank) => <option key={bank._id} value={bank._id}>{bank.displayName || bank.name}</option>)}</select></Label>
              <Label title="UTR / reference *"><input className={inputClass} maxLength={200} required value={editingPayment.reference} onChange={(e) => setEditingPayment((old) => ({ ...old, reference: e.target.value }))} /></Label>
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
            <Label title="Amount received *"><input className={inputClass} type="number" min="0.01" step="0.01" max="100000000" required value={receipt.amount} onChange={changeReceipt('amount')} /></Label>
            <Label title="Payment date *"><input className={inputClass} type="date" max={today()} required value={receipt.date} onChange={changeReceipt('date')} /></Label>
            <Label title="Mode"><select className={inputClass} value={receipt.paymentMode} onChange={(e) => { setReceipt((old) => ({ ...old, paymentMode: e.target.value, bank: '', reference: '', cashReceivedByName: '' })); setFiles([]); }}><option value="cash">Cash</option><option value="online">Online</option></select></Label>
            {receipt.paymentMode === 'online' && <Label title="Bank"><select className={inputClass} value={receipt.bank} onChange={changeReceipt('bank')}><option value="">Unassigned bank</option>{data.banks.map((bank) => <option key={bank._id} value={bank._id}>{bank.displayName || bank.name}</option>)}</select></Label>}
            {receipt.paymentMode === 'online' ? <Label title="UTR / reference *"><input className={inputClass} maxLength={200} required value={receipt.reference} onChange={changeReceipt('reference')} /></Label> : <Label title="Cash received by *"><input className={inputClass} required maxLength={200} value={receipt.cashReceivedByName} onChange={changeReceipt('cashReceivedByName')} /></Label>}
          </div>
          {receipt.paymentMode === 'online' && <Label title="Payment screenshot / proof *"><input className={`${inputClass} text-xs`} type="file" required multiple accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(e) => { const next = [...e.target.files]; if (next.length > 5 || next.some((file) => file.size > 10 * 1024 * 1024)) { setError('Maximum 5 proofs, each up to 10 MB'); e.target.value = ''; setFiles([]); } else { setFiles(next); setError(''); } }} /></Label>}
          <Label title="Notes"><textarea className={inputClass} maxLength={2000} rows={2} value={receipt.notes} onChange={changeReceipt('notes')} /></Label>
          <div className="flex justify-end gap-2"><Button variant="outline" disabled={saving} onClick={() => setAdding(false)}>Cancel</Button><Button type="submit" disabled={saving}><Save size={14} />{saving ? 'Saving...' : 'Save receipt'}</Button></div>
        </form>}
        <div className="overflow-x-auto rounded-md border border-cardline"><table className="w-full min-w-[720px] text-left text-sm"><thead className="bg-[#56695D] text-white"><tr>{['Collection', 'Paid on', 'Amount', 'Payment details', 'Verification', 'Proof'].map((label) => <th key={label} className="px-3 py-2 text-xs font-semibold">{label}</th>)}</tr></thead><tbody className="divide-y divide-cardline">{receipts.map((item) => <tr key={item._id}>
          <td className="px-3 py-3"><p className="font-semibold">{item.collectionStage === 'advance' ? 'Sales advance' : 'Reception collection'}</p><p className="text-xs text-charcoal/70">Recorded by {item.recordedByName || '-'}</p>{item.createdAt && <p className="text-xs text-charcoal/60">{stamp(item.createdAt)}</p>}</td>
          <td className="px-3 py-3 text-xs">{paidDate(item.date)}</td><td className="px-3 py-3 font-semibold">{money(item.amount)}</td>
          <td className="px-3 py-3 text-xs"><p className="font-semibold">{item.paymentMode === 'cash' ? 'Cash received' : 'Online payment'}</p>{item.paymentMode === 'cash' ? <p className="mt-1">Received by {item.cashReceivedByName || item.recordedByName || '-'}</p> : <>{item.bankName && <p className="mt-1">Bank: {item.bankName}</p>}{item.reference && <p className="mt-1 break-all">UTR / reference: {item.reference}</p>}</>}{item.notes && <p className="mt-1 max-w-64 whitespace-pre-wrap break-words text-charcoal/70">{item.notes}</p>}</td>
          <td className="px-3 py-3"><span className={`rounded px-2 py-1 text-xs font-semibold capitalize ${item.status === 'approved' ? 'bg-emerald-50 text-emerald-800' : item.status === 'cancelled' ? 'bg-red-50 text-red-800' : 'bg-amber-50 text-amber-800'}`}>{item.status}</span>{item.approvedByName && <p className="mt-1 text-xs">{item.approvedByName}</p>}</td><td className="px-3 py-3"><CompactAttachments files={item.files || []} label="Proof" /></td>
        </tr>)}{!receipts.length && <tr><td colSpan={6} className="p-6 text-center text-sm text-charcoal/70"><CreditCard size={20} className="mx-auto mb-2" />No consultation receipts recorded</td></tr>}</tbody></table></div>
        {paymentSheetFields}
      </div>}
      </div>
    </div>}
  </Modal>;
}
