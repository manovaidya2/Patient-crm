import { useEffect, useState } from 'react';
import { Download, Pencil, Plus, Scale, Search, Trash2 } from 'lucide-react';
import api from '../../api/axios.js';
import Button from '../../components/ui/Button.jsx';
import Modal from '../../components/ui/Modal.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { hasHrFullAccess } from '../../constants/roles.js';
import { todayInput } from './hrOptions.js';

const fieldClass = 'mt-1 w-full rounded-md border border-cardline bg-white px-3 py-2.5 text-sm text-charcoal outline-none focus:border-sage focus:ring-2 focus:ring-sage/15';
const controlClass = 'rounded-md border border-cardline bg-white px-3 py-2.5 text-sm outline-none focus:border-sage focus:ring-2 focus:ring-sage/15';
const TYPES = [['staff_grievance', 'Staff Grievance'], ['staff_conflict', 'Staff Conflict'], ['patient_complaint', 'Patient Complaint'], ['service_issue', 'Service Issue'], ['safety_incident', 'Safety Incident'], ['other', 'Other']];
const SEVERITIES = [['low', 'Low'], ['medium', 'Medium'], ['high', 'High'], ['critical', 'Critical']];
const STATUSES = [['open', 'Open'], ['investigating', 'Investigating'], ['resolved', 'Resolved'], ['escalated', 'Escalated']];
const label = (list, value) => list.find(([key]) => key === value)?.[1] || value;
const blank = () => ({ date: todayInput(), caseRef: '', type: 'staff_grievance', department: '', severity: 'low', assignedTo: '', status: 'open', action: '', resolutionDue: todayInput(), ownerReview: '' });
const tone = (value) => ({ low: 'bg-emerald-100 text-emerald-800', resolved: 'bg-emerald-100 text-emerald-800', medium: 'bg-amber-100 text-amber-800', open: 'bg-amber-100 text-amber-800', investigating: 'bg-blue-100 text-blue-800', high: 'bg-orange-100 text-orange-800', critical: 'bg-red-100 text-red-800', escalated: 'bg-red-100 text-red-800' }[value] || 'bg-offwhite-300 text-charcoal/70');
const Badge = ({ value, list }) => <span className={`inline-flex whitespace-nowrap rounded px-2 py-1 text-xs font-semibold ${tone(value)}`}>{label(list, value)}</span>;
const Field = ({ label: text, children, className = '' }) => <label className={`block text-sm font-medium text-charcoal ${className}`}>{text}{children}</label>;
const csvCell = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`;

export default function HrIncidents() {
  const { user } = useAuth();
  const isAdmin = hasHrFullAccess(user?.role);
  const [rows, setRows] = useState([]);
  const [summary, setSummary] = useState({ total: 0, open: 0, escalated: 0, critical: 0, overdue: 0 });
  const [filters, setFilters] = useState({ search: '', type: '', severity: '', status: '' });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [form, setForm] = useState(blank());
  const [editing, setEditing] = useState(null);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = async (params = filters) => {
    setLoading(true);
    try {
      const { data } = await api.get('/hr/incidents', { params });
      setRows(data.incidents || []); setSummary(data.summary || {}); setError('');
    } catch (requestError) { setError(requestError.response?.data?.message || 'Incidents could not be loaded'); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const set = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));
  const openCreate = () => { setEditing(null); setForm(blank()); setError(''); setOpen(true); };
  const openEdit = (row) => { setEditing(row); setForm({ ...blank(), ...row }); setError(''); setOpen(true); };
  const submit = async (event) => {
    event.preventDefault(); setSaving(true); setError('');
    try { await (editing ? api.patch(`/hr/incidents/${editing.id}`, form) : api.post('/hr/incidents', form)); setOpen(false); await load(); }
    catch (requestError) { setError(requestError.response?.data?.message || 'Incident could not be saved'); }
    finally { setSaving(false); }
  };
  const remove = async (row) => {
    if (!window.confirm('Delete this incident record? This cannot be undone.')) return;
    try { await api.delete(`/hr/incidents/${row.id}`); await load(); }
    catch (requestError) { setError(requestError.response?.data?.message || 'Incident could not be deleted'); }
  };
  const downloadCsv = () => {
    const head = ['Date', 'Case Ref', 'Type', 'Department', 'Severity', 'Assigned To', 'Status', 'Action / Confidential Reference', 'Resolution Due', 'Owner Review'];
    const lines = rows.map((row) => [row.date, row.caseRef, label(TYPES, row.type), row.department, label(SEVERITIES, row.severity), row.assignedTo, label(STATUSES, row.status), row.action, row.resolutionDue, row.ownerReview].map(csvCell).join(','));
    const url = URL.createObjectURL(new Blob([[head.map(csvCell).join(','), ...lines].join('\n')], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a'); link.href = url; link.download = `hr-incidents-${todayInput()}.csv`; link.click(); URL.revokeObjectURL(url);
  };

  const today = todayInput();
  const cards = [['Total cases', summary.total], ['Open', summary.open], ['Escalated', summary.escalated], ['High / critical open', summary.critical], ['Overdue', summary.overdue]];
  const head = ['Date', 'Case Ref', 'Type', 'Department', 'Severity', 'Assigned To', 'Status', 'Action / Confidential Reference', 'Resolution Due', 'Owner Review', 'Action'];

  return <div className="space-y-5">
    <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div><p className="text-xs font-semibold uppercase text-sage">HR Operations</p><h1 className="flex items-center gap-2 font-display text-2xl font-bold text-charcoal"><Scale size={23} /> Complaints & Conflicts</h1><p className="mt-1 text-sm text-charcoal/60">Staff grievances, conflicts, patient complaints and safety incidents.</p></div>
      <div className="flex gap-2"><Button variant="outline" onClick={downloadCsv} disabled={!rows.length}><Download size={16} /> Download CSV</Button><Button onClick={openCreate}><Plus size={16} /> Add Incident</Button></div>
    </header>
    <p className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">Keep grievance details confidential. Only Admin, Doctor and HR can see this page; avoid putting sensitive personal details in the reference field.</p>
    <section className="grid border border-cardline bg-offwhite-100 sm:grid-cols-5">{cards.map(([text, value], index) => <div key={text} className={`px-4 py-3 ${index < cards.length - 1 ? 'border-b border-cardline sm:border-b-0 sm:border-r' : ''}`}><p className="text-xs font-semibold uppercase text-charcoal/50">{text}</p><p className="mt-1 text-2xl font-bold text-charcoal">{value || 0}</p></div>)}</section>
    <form onSubmit={(event) => { event.preventDefault(); load(); }} className="grid gap-3 border border-cardline bg-offwhite-100 p-4 sm:grid-cols-2 lg:grid-cols-[1fr_180px_160px_160px_auto]">
      <label className="relative"><Search size={16} className="absolute left-3 top-3 text-charcoal/40" /><input className={`${controlClass} w-full pl-9`} placeholder="Search case ref, department, assignee" value={filters.search} onChange={(event) => setFilters({ ...filters, search: event.target.value })} /></label>
      <select aria-label="Type" className={controlClass} value={filters.type} onChange={(event) => setFilters({ ...filters, type: event.target.value })}><option value="">All types</option>{TYPES.map(([value, text]) => <option key={value} value={value}>{text}</option>)}</select>
      <select aria-label="Severity" className={controlClass} value={filters.severity} onChange={(event) => setFilters({ ...filters, severity: event.target.value })}><option value="">All severities</option>{SEVERITIES.map(([value, text]) => <option key={value} value={value}>{text}</option>)}</select>
      <select aria-label="Status" className={controlClass} value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.target.value })}><option value="">All statuses</option>{STATUSES.map(([value, text]) => <option key={value} value={value}>{text}</option>)}</select>
      <Button type="submit">Apply filters</Button>
    </form>
    {error && !open && <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>}
    <section className="overflow-hidden border border-cardline bg-offwhite-100"><div className="overflow-x-auto">
      <table className="w-full min-w-[1300px] text-sm">
        <thead className="bg-[#50685D] text-left text-xs uppercase text-white"><tr>{head.map((text) => <th key={text} className="whitespace-nowrap px-4 py-3">{text}</th>)}</tr></thead>
        <tbody className="divide-y divide-cardline-soft">{rows.map((row) => <tr key={row.id}>
          <td className="whitespace-nowrap px-4 py-3 font-semibold">{row.date}</td>
          <td className="px-4 py-3">{row.caseRef || '-'}</td>
          <td className="px-4 py-3">{label(TYPES, row.type)}</td>
          <td className="px-4 py-3">{row.department || '-'}</td>
          <td className="px-4 py-3"><Badge value={row.severity} list={SEVERITIES} /></td>
          <td className="px-4 py-3">{row.assignedTo || '-'}</td>
          <td className="px-4 py-3"><Badge value={row.status} list={STATUSES} /></td>
          <td className="max-w-64 px-4 py-3">{row.action || '-'}</td>
          <td className={`whitespace-nowrap px-4 py-3 ${row.resolutionDue && row.resolutionDue < today && row.status !== 'resolved' ? 'font-semibold text-red-700' : ''}`}>{row.resolutionDue || '-'}</td>
          <td className="max-w-56 px-4 py-3">{row.ownerReview || '-'}{row.reviewedByName && <p className="text-xs text-charcoal/50">by {row.reviewedByName}</p>}</td>
          <td className="px-4 py-3"><div className="flex items-center gap-1"><button title="Edit incident" onClick={() => openEdit(row)} className="p-2 text-sage"><Pencil size={16} /></button>{isAdmin && <button title="Delete incident" onClick={() => remove(row)} className="p-2 text-red-700"><Trash2 size={16} /></button>}</div></td>
        </tr>)}</tbody>
      </table></div>
      {loading && <p className="p-8 text-center text-sm text-charcoal/50">Loading...</p>}
      {!loading && !rows.length && <p className="p-10 text-center text-sm text-charcoal/50">No entries yet — add an incident.</p>}
    </section>

    <Modal open={open} onClose={() => setOpen(false)} title={`${editing ? 'Edit' : 'Add'} Incident`} className="max-w-3xl"><form onSubmit={submit} className="space-y-4">
      {error && <div className="rounded bg-red-50 p-3 text-sm text-red-800">{error}</div>}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="Date *"><input required type="date" className={fieldClass} value={form.date} onChange={set('date')} /></Field>
        <Field label="Case Ref"><input className={fieldClass} placeholder="Case Ref" value={form.caseRef} onChange={set('caseRef')} /></Field>
        <Field label="Type *"><select className={fieldClass} value={form.type} onChange={set('type')}>{TYPES.map(([value, text]) => <option key={value} value={value}>{text}</option>)}</select></Field>
        <Field label="Department"><input className={fieldClass} placeholder="Department" value={form.department} onChange={set('department')} /></Field>
        <Field label="Severity"><select className={fieldClass} value={form.severity} onChange={set('severity')}>{SEVERITIES.map(([value, text]) => <option key={value} value={value}>{text}</option>)}</select></Field>
        <Field label="Assigned To"><input className={fieldClass} placeholder="Assigned To" value={form.assignedTo} onChange={set('assignedTo')} /></Field>
        <Field label="Status"><select className={fieldClass} value={form.status} onChange={set('status')}>{STATUSES.map(([value, text]) => <option key={value} value={value}>{text}</option>)}</select></Field>
        <Field label="Resolution Due"><input type="date" className={fieldClass} value={form.resolutionDue} onChange={set('resolutionDue')} /></Field>
      </div>
      <Field label="Action / Confidential Reference"><textarea rows="3" className={fieldClass} placeholder="Action taken or confidential reference" value={form.action} onChange={set('action')} /></Field>
      {isAdmin && <Field label="Owner review"><input className={fieldClass} placeholder="Owner review note" value={form.ownerReview} onChange={set('ownerReview')} /></Field>}
      <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button><Button type="submit" disabled={saving}>{saving ? 'Saving...' : 'Save'}</Button></div>
    </form></Modal>
  </div>;
}
