import { useEffect, useMemo, useState } from 'react';
import { Activity, Check, IndianRupee, Pencil, Plus, Search, ShieldAlert, Target, Trash2, UserMinus } from 'lucide-react';
import api from '../../api/axios.js';
import Button from '../../components/ui/Button.jsx';
import Modal from '../../components/ui/Modal.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { hasHrFullAccess, ROLES } from '../../constants/roles.js';
import { todayInput } from './hrOptions.js';

const fieldClass = 'mt-1 w-full rounded-md border border-cardline bg-white px-3 py-2.5 text-sm text-charcoal outline-none focus:border-sage focus:ring-2 focus:ring-sage/15';
const controlClass = 'rounded-md border border-cardline bg-white px-3 py-2.5 text-sm outline-none focus:border-sage';
const monthInput = () => todayInput().slice(0, 7);
const common = { employeeId: '', title: '', startDate: todayInput(), endDate: todayInput() };
const blanks = {
  kpis: { ...common, metric: '', target: '', actualValue: 0, unit: '', weightage: 100 },
  performance: { ...common, reviewDate: todayInput(), reviewer: '', score: 3, strengths: '', improvements: '', summary: '' },
  appraisals: { ...common, effectiveDate: todayInput(), currentDesignation: '', proposedDesignation: '', currentSalary: '', proposedSalary: '', reason: '' },
  pip: { ...common, concern: '', expectations: '', supportPlan: '', reviewNotes: '' },
  grievances: { ...common, incidentDate: todayInput(), category: 'workplace', details: '', resolution: '' },
  payroll: { ...common, month: monthInput(), basicSalary: '', allowances: 0, deductions: 0, paymentDate: '', reference: '', notes: '' },
  exits: { ...common, exitType: 'resignation', requestDate: todayInput(), lastWorkingDate: todayInput(), reason: '', handover: '', clearanceNotes: '' },
};

const meta = {
  kpis: { title: 'Team KPIs', subtitle: 'Set measurable employee goals and track completion.', icon: Target },
  performance: { title: 'Performance Reviews', subtitle: 'Record structured reviews, strengths and development areas.', icon: Activity },
  appraisals: { title: 'Appraisals', subtitle: 'Prepare promotion and salary proposals for management approval.', icon: IndianRupee },
  pip: { title: 'Performance Improvement Plans', subtitle: 'Manage concerns, expectations, support and review outcomes.', icon: ShieldAlert },
  grievances: { title: 'Grievances', subtitle: 'Maintain confidential employee concerns and resolutions.', icon: ShieldAlert },
  payroll: { title: 'Payroll Records', subtitle: 'Prepare monthly salary records for restricted management approval.', icon: IndianRupee },
  exits: { title: 'Exit Management', subtitle: 'Track resignation or termination through approval and clearance.', icon: UserMinus },
};

const tones = { active: 'bg-emerald-100 text-emerald-800', completed: 'bg-emerald-100 text-emerald-800', approved: 'bg-emerald-100 text-emerald-800', finalized: 'bg-emerald-100 text-emerald-800', resolved: 'bg-emerald-100 text-emerald-800', paid: 'bg-emerald-100 text-emerald-800', rejected: 'bg-red-100 text-red-800', cancelled: 'bg-red-100 text-red-800', pending_approval: 'bg-amber-100 text-amber-800', in_review: 'bg-blue-100 text-blue-800', clearance: 'bg-blue-100 text-blue-800', extended: 'bg-purple-100 text-purple-800' };
const Status = ({ value }) => <span className={`inline-flex whitespace-nowrap rounded px-2 py-1 text-xs font-semibold capitalize ${tones[value] || 'bg-offwhite-300 text-charcoal/70'}`}>{value.replaceAll('_', ' ')}</span>;
const Field = ({ label, children, className = '' }) => <label className={`block text-sm font-medium ${className}`}>{label}{children}</label>;
const money = (value) => `Rs ${Number(value || 0).toLocaleString('en-IN')}`;

const actionMap = {
  kpis: { draft: [['active', 'Activate']], active: [['completed', 'Complete'], ['cancelled', 'Cancel']] },
  performance: { draft: [['finalized', 'Finalize']] },
  pip: { active: [['extended', 'Extend'], ['completed', 'Complete'], ['cancelled', 'Cancel']], extended: [['completed', 'Complete'], ['cancelled', 'Cancel']] },
  grievances: { open: [['in_review', 'Start review']], in_review: [['resolved', 'Resolve']], resolved: [['closed', 'Close']] },
};

export default function HrLifecyclePage({ mode }) {
  const { user } = useAuth();
  const config = meta[mode];
  const [rows, setRows] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [statuses, setStatuses] = useState([]);
  const [filters, setFilters] = useState({ search: '', status: '' });
  const [form, setForm] = useState({ ...blanks[mode] });
  const [editing, setEditing] = useState(null);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [adminSelectedId, setAdminSelectedId] = useState('');

  const load = async () => {
    try {
      const { data } = await api.get(`/hr/lifecycle/${mode}`, { params: filters });
      setRows(data.records || []); setStatuses(data.statuses || []); setError('');
    } catch (requestError) { setError(requestError.response?.data?.message || `${config.title} could not be loaded`); }
  };
  useEffect(() => { load(); }, [mode]);
  useEffect(() => { api.get('/hr/employees', { params: { operational: hasHrFullAccess(user?.role) ? undefined : true } }).then(({ data }) => setEmployees(data.employees || [])).catch(() => setEmployees([])); }, [user?.role]);
  useEffect(() => { setForm({ ...blanks[mode] }); setEditing(null); setOpen(false); }, [mode]);

  const summary = useMemo(() => rows.reduce((result, row) => ({ ...result, [row.status]: (result[row.status] || 0) + 1 }), {}), [rows]);
  const set = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));
  const create = () => { setEditing(null); setForm({ ...blanks[mode] }); setError(''); setOpen(true); };
  const edit = (row) => { setEditing(row); setForm({ ...blanks[mode], ...row, ...row.data }); setError(''); setOpen(true); };
  const submit = async (event) => {
    event.preventDefault(); setSaving(true); setError('');
    try { const path = `/hr/lifecycle/${mode}${editing ? `/${editing.id}` : ''}`; await (editing ? api.patch(path, form) : api.post(path, form)); setOpen(false); await load(); }
    catch (requestError) { setError(requestError.response?.data?.message || 'Record could not be saved'); }
    finally { setSaving(false); }
  };
  const changeStatus = async (row, status) => {
    const note = status === 'rejected' ? window.prompt('Enter rejection reason') : '';
    if (status === 'rejected' && !note) return;
    try { await api.post(`/hr/lifecycle/${mode}/${row.id}/status`, { status, note }); await load(); }
    catch (requestError) { setError(requestError.response?.data?.message || 'Status could not be changed'); }
  };
  const remove = async (row) => {
    if (!window.confirm(`Delete ${row.recordCode}? Reports and totals will update automatically.`)) return;
    try { await api.delete(`/hr/lifecycle/${mode}/${row.id}`); setAdminSelectedId(''); await load(); }
    catch (requestError) { setError(requestError.response?.data?.message || 'Record could not be deleted'); }
  };
  const Icon = config.icon;
  const adminSelected = rows.find((row) => row.id === adminSelectedId);

  return <div className="space-y-5">
    <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-xs font-semibold uppercase text-sage">People Development</p><h1 className="flex items-center gap-2 font-display text-2xl font-bold text-charcoal"><Icon size={23} /> {config.title}</h1><p className="mt-1 text-sm text-charcoal/60">{config.subtitle}</p></div><Button onClick={create}><Plus size={16} /> Add record</Button></header>
    <form onSubmit={(event) => { event.preventDefault(); load(); }} className="grid gap-3 border border-cardline bg-offwhite-100 p-4 sm:grid-cols-[1fr_220px_auto]"><label className="relative"><Search size={16} className="absolute left-3 top-3 text-charcoal/40" /><input className={`${controlClass} w-full pl-9`} placeholder="Search employee, ID or title" value={filters.search} onChange={(event) => setFilters({ ...filters, search: event.target.value })} /></label><select className={controlClass} value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.target.value })}><option value="">All statuses</option>{statuses.map((status) => <option key={status} value={status}>{status.replaceAll('_', ' ')}</option>)}</select><Button type="submit">Apply filters</Button></form>
    <section className="grid border border-cardline bg-offwhite-100 sm:grid-cols-3 lg:grid-cols-6"><Metric label="Visible records" value={rows.length} />{Object.entries(summary).slice(0, 5).map(([status, count]) => <Metric key={status} label={status.replaceAll('_', ' ')} value={count} />)}</section>
    {error && <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>}
    {hasHrFullAccess(user?.role) && rows.length > 0 && <section className="flex flex-col gap-3 border border-red-200 bg-red-50/50 p-3 sm:flex-row sm:items-center"><div className="min-w-0 flex-1"><p className="text-xs font-semibold uppercase text-red-800">Management record controls</p><select className={`${controlClass} mt-1 w-full`} value={adminSelectedId} onChange={(event) => setAdminSelectedId(event.target.value)}><option value="">Select a record to edit or delete</option>{rows.map((row) => <option key={row.id} value={row.id}>{row.recordCode} - {row.employeeName} - {row.title}</option>)}</select></div><div className="flex gap-2"><Button variant="outline" disabled={!adminSelected} onClick={() => adminSelected && edit(adminSelected)}><Pencil size={15}/> Edit</Button><Button variant="danger" disabled={!adminSelected} onClick={() => adminSelected && remove(adminSelected)}><Trash2 size={15}/> Delete</Button></div></section>}
    <section className="overflow-hidden border border-cardline bg-offwhite-100"><div className="overflow-x-auto"><table className="w-full min-w-[1100px] text-sm"><thead className="bg-[#50685D] text-left text-xs uppercase text-white"><tr>{['Record','Employee','Title / period','Details','Status','Updated by','Actions'].map((label) => <th key={label} className="whitespace-nowrap px-4 py-3">{label}</th>)}</tr></thead><tbody className="divide-y divide-cardline-soft">{rows.map((row) => <tr key={row.id}><td className="px-4 py-3 font-semibold">{row.recordCode}</td><td className="px-4 py-3"><p className="font-semibold">{row.employeeName}</p><p className="text-xs text-charcoal/50">{row.employeeCode} | {row.department}</p></td><td className="px-4 py-3"><p className="font-medium">{row.title}</p><p className="text-xs text-charcoal/50">{row.startDate || '-'}{row.endDate ? ` to ${row.endDate}` : ''}</p></td><td className="max-w-sm px-4 py-3">{detailFor(mode, row.data)}</td><td className="px-4 py-3"><Status value={row.status} />{row.decisionNote && <p className="mt-1 text-xs text-charcoal/50">{row.decisionNote}</p>}</td><td className="px-4 py-3">{row.updatedByName}</td><td className="px-4 py-3"><div className="flex flex-wrap gap-1">{canEdit(row, user) && <button title="Edit record" onClick={() => edit(row)} className="p-2 text-sage"><Pencil size={16} /></button>}{actionsFor(mode, row, user).map(([status, label]) => <Button key={status} size="sm" variant={status === 'rejected' || status === 'cancelled' ? 'danger' : status === 'approved' ? 'primary' : 'outline'} onClick={() => changeStatus(row, status)}>{status === 'approved' && <Check size={14} />}{label}</Button>)}</div></td></tr>)}</tbody></table></div>{!rows.length && <p className="p-10 text-center text-sm text-charcoal/50">No records match these filters.</p>}</section>
    <Modal open={open} onClose={() => setOpen(false)} title={`${editing ? 'Edit' : 'Add'} ${config.title}`} className="max-w-5xl"><form onSubmit={submit} className="space-y-4">{error && <div className="rounded bg-red-50 p-3 text-sm text-red-800">{error}</div>}<LifecycleForm mode={mode} form={form} set={set} employees={employees} /><div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button><Button type="submit" disabled={saving}>{saving ? 'Saving...' : 'Save record'}</Button></div></form></Modal>
  </div>;
}

function LifecycleForm({ mode, form, set, employees }) {
  return <><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"><Field label="Employee *"><select required className={fieldClass} value={form.employeeId} onChange={set('employeeId')}><option value="">Select employee</option>{employees.map((row) => <option key={row.id} value={row.id}>{row.employeeCode} - {row.name}</option>)}</select></Field><Field label="Record title *"><input required className={fieldClass} value={form.title} onChange={set('title')} /></Field>{!['payroll'].includes(mode) && <><Field label="Period start"><input type="date" className={fieldClass} value={form.startDate} onChange={set('startDate')} /></Field><Field label="Period end"><input type="date" className={fieldClass} value={form.endDate} onChange={set('endDate')} /></Field></>}</div>{fieldsFor(mode, form, set)}</>;
}

function fieldsFor(mode, form, set) {
  if (mode === 'kpis') return <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5"><Field label="Metric *"><input required className={fieldClass} value={form.metric} onChange={set('metric')} /></Field><Field label="Numeric target *"><input required min="0.01" step="any" type="number" className={fieldClass} value={form.target} onChange={set('target')} /></Field><Field label="Actual performance"><input required min="0" step="any" type="number" className={fieldClass} value={form.actualValue} onChange={set('actualValue')} /></Field><Field label="Unit"><input className={fieldClass} value={form.unit} onChange={set('unit')} placeholder="Calls, %, cases" /></Field><Field label="Weightage % *"><input required min="1" max="100" type="number" className={fieldClass} value={form.weightage} onChange={set('weightage')} /></Field></div>;
  if (mode === 'performance') return <><div className="grid gap-4 sm:grid-cols-3"><Field label="Review date *"><input required type="date" className={fieldClass} value={form.reviewDate} onChange={set('reviewDate')} /></Field><Field label="Reviewer *"><input required className={fieldClass} value={form.reviewer} onChange={set('reviewer')} /></Field><Field label="Score (1-5) *"><input required type="number" min="1" max="5" className={fieldClass} value={form.score} onChange={set('score')} /></Field></div><TextAreas fields={[['strengths','Strengths'],['improvements','Development areas'],['summary','Review summary']]} form={form} set={set} /></>;
  if (mode === 'appraisals') return <><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"><Field label="Effective date *"><input required type="date" className={fieldClass} value={form.effectiveDate} onChange={set('effectiveDate')} /></Field><Field label="Current designation *"><input required className={fieldClass} value={form.currentDesignation} onChange={set('currentDesignation')} /></Field><Field label="Proposed designation *"><input required className={fieldClass} value={form.proposedDesignation} onChange={set('proposedDesignation')} /></Field><Field label="Current monthly salary *"><input required min="0" type="number" className={fieldClass} value={form.currentSalary} onChange={set('currentSalary')} /></Field><Field label="Proposed monthly salary *"><input required min="0" type="number" className={fieldClass} value={form.proposedSalary} onChange={set('proposedSalary')} /></Field></div><TextAreas fields={[['reason','Appraisal justification *']]} form={form} set={set} required /></>;
  if (mode === 'pip') return <TextAreas fields={[['concern','Performance concern *'],['expectations','Expected improvement *'],['supportPlan','Support plan *'],['reviewNotes','Review notes']]} form={form} set={set} required />;
  if (mode === 'grievances') return <><div className="grid gap-4 sm:grid-cols-2"><Field label="Incident date *"><input required type="date" className={fieldClass} value={form.incidentDate} onChange={set('incidentDate')} /></Field><Field label="Category *"><select className={fieldClass} value={form.category} onChange={set('category')}><option value="workplace">Workplace</option><option value="conduct">Conduct</option><option value="harassment">Harassment</option><option value="payroll">Payroll</option><option value="policy">Policy</option><option value="other">Other</option></select></Field></div><TextAreas fields={[['details','Grievance details *'],['resolution','Resolution / action taken']]} form={form} set={set} required /></>;
  if (mode === 'payroll') { const net = Number(form.basicSalary || 0) + Number(form.allowances || 0) - Number(form.deductions || 0); return <><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><Field label="Payroll month *"><input required type="month" className={fieldClass} value={form.month} onChange={set('month')} /></Field><Field label="Basic salary *"><input required min="0" type="number" className={fieldClass} value={form.basicSalary} onChange={set('basicSalary')} /></Field><Field label="Allowances"><input min="0" type="number" className={fieldClass} value={form.allowances} onChange={set('allowances')} /></Field><Field label="Deductions"><input min="0" type="number" className={fieldClass} value={form.deductions} onChange={set('deductions')} /></Field><div className="border border-sage/30 bg-[#EAF3F1] p-3"><p className="text-xs font-semibold uppercase text-sage">Calculated net pay</p><p className="mt-1 text-xl font-bold">{money(net)}</p></div><Field label="Payment date"><input type="date" className={fieldClass} value={form.paymentDate} onChange={set('paymentDate')} /></Field><Field label="Payment reference"><input className={fieldClass} value={form.reference} onChange={set('reference')} /></Field></div><TextAreas fields={[['notes','Payroll notes']]} form={form} set={set} /></>; }
  return <><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"><Field label="Exit type *"><select className={fieldClass} value={form.exitType} onChange={set('exitType')}><option value="resignation">Resignation</option><option value="termination">Termination</option><option value="contract_end">Contract end</option><option value="retirement">Retirement</option><option value="other">Other</option></select></Field><Field label="Request date *"><input required type="date" className={fieldClass} value={form.requestDate} onChange={set('requestDate')} /></Field><Field label="Last working date *"><input required type="date" className={fieldClass} value={form.lastWorkingDate} onChange={set('lastWorkingDate')} /></Field></div><TextAreas fields={[['reason','Exit reason *'],['handover','Handover plan'],['clearanceNotes','Clearance notes']]} form={form} set={set} required /></>;
}

function TextAreas({ fields, form, set, required = false }) { return <div className="grid gap-4 sm:grid-cols-2">{fields.map(([key, label]) => <Field key={key} label={label}><textarea required={required && label.includes('*')} rows="3" className={fieldClass} value={form[key]} onChange={set(key)} /></Field>)}</div>; }
function Metric({ label, value }) { return <div className="border-b border-r border-cardline px-4 py-3"><p className="text-xs font-semibold uppercase text-charcoal/50">{label}</p><p className="mt-1 text-2xl font-bold">{value}</p></div>; }
function detailFor(mode, data) { if (mode === 'kpis') return `${data.metric}: ${data.actualValue || 0} / ${data.target} ${data.unit || ''} (${data.weightage}%)`; if (mode === 'performance') return `${data.score}/5 by ${data.reviewer}`; if (mode === 'appraisals') return `${data.currentDesignation} to ${data.proposedDesignation} | ${money(data.proposedSalary)}`; if (mode === 'pip') return data.concern; if (mode === 'grievances') return `${data.category} | ${data.incidentDate}`; if (mode === 'payroll') return `${data.month} | Net ${money(data.netPay)}`; return `${String(data.exitType || '').replaceAll('_',' ')} | Last day ${data.lastWorkingDate}`; }
function canEdit(row, user) { if (hasHrFullAccess(user?.role)) return true; if (['finalized','approved','paid','completed','closed'].includes(row.status)) return false; if (['appraisals','payroll','exits'].includes(row.module) && row.status === 'pending_approval') return false; return true; }
function actionsFor(mode, row, user) { if (['appraisals','payroll','exits'].includes(mode)) { if ((user?.role === ROLES.HR || hasHrFullAccess(user?.role)) && ['draft','rejected','initiated'].includes(row.status)) return [['pending_approval','Submit']]; if (hasHrFullAccess(user?.role) && row.status === 'pending_approval') return [['approved','Approve'],['rejected','Reject']]; if (mode === 'payroll' && hasHrFullAccess(user?.role) && row.status === 'approved') return [['paid','Mark paid']]; if (mode === 'exits' && (user?.role === ROLES.HR || hasHrFullAccess(user?.role)) && row.status === 'approved') return [['clearance','Start clearance']]; if (mode === 'exits' && (user?.role === ROLES.HR || hasHrFullAccess(user?.role)) && row.status === 'clearance') return [['completed','Complete exit']]; return []; } return actionMap[mode]?.[row.status] || []; }
