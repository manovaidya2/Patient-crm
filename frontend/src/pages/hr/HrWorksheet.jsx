import { useEffect, useState } from 'react';
import { ClipboardCheck, Download, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import api from '../../api/axios.js';
import Button from '../../components/ui/Button.jsx';
import Modal from '../../components/ui/Modal.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { canHrDelete, hasHrFullAccess } from '../../constants/roles.js';
import { todayInput } from './hrOptions.js';

const fieldClass = 'mt-1 w-full rounded-md border border-cardline bg-white px-3 py-2.5 text-sm text-charcoal outline-none focus:border-sage focus:ring-2 focus:ring-sage/15';
const controlClass = 'rounded-md border border-cardline bg-white px-3 py-2.5 text-sm outline-none focus:border-sage focus:ring-2 focus:ring-sage/15';
const DEPARTMENTS = [['hr', 'HR'], ['recruitment', 'Recruitment'], ['payroll', 'Payroll'], ['admin', 'Admin'], ['operations', 'Operations'], ['other', 'Other']];
const STATUSES = [['completed', 'Completed'], ['in_progress', 'In Progress'], ['pending', 'Pending'], ['delayed', 'Delayed'], ['blocked', 'Blocked']];
const label = (list, value) => list.find(([key]) => key === value)?.[1] || value;
const tone = (value) => ({ completed: 'bg-emerald-100 text-emerald-800', in_progress: 'bg-blue-100 text-blue-800', pending: 'bg-amber-100 text-amber-800', delayed: 'bg-orange-100 text-orange-800', blocked: 'bg-red-100 text-red-800' }[value] || 'bg-offwhite-300 text-charcoal/70');
const Field = ({ label: text, children, className = '' }) => <label className={`block text-sm font-medium text-charcoal ${className}`}>{text}{children}</label>;
const csvCell = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`;

export default function HrWorksheet() {
  const { user } = useAuth();
  const isAdmin = hasHrFullAccess(user?.role);
  const [employees, setEmployees] = useState([]);
  const [employeeId, setEmployeeId] = useState('');
  const [scope, setScope] = useState(isAdmin ? 'employee' : 'self');
  const isSelf = scope === 'self';
  const blank = () => ({ date: todayInput(), scope, employeeId: isSelf ? '' : employeeId, department: 'hr', task: '', dailyTarget: '', actualOutput: '', workStatus: 'completed', delayIssue: '', evidence: '', nextAction: '' });
  const [rows, setRows] = useState([]);
  const [summary, setSummary] = useState({ total: 0, completed: 0, inProgress: 0, pending: 0, delayed: 0 });
  const [filters, setFilters] = useState({ search: '', department: '', workStatus: '', from: todayInput(), to: todayInput() });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [form, setForm] = useState(blank());
  const [editing, setEditing] = useState(null);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = async (params = filters, empId = employeeId, currentScope = scope) => {
    setLoading(true);
    try {
      const { data } = await api.get('/hr/worksheet', { params: { ...params, scope: currentScope, employeeId: currentScope === 'self' ? undefined : empId || undefined } });
      setRows(data.entries || []); setSummary(data.summary || {}); setError('');
    } catch (requestError) { setError(requestError.response?.data?.message || 'Worksheet could not be loaded'); }
    finally { setLoading(false); }
  };
  const switchScope = (next) => { setScope(next); load(filters, employeeId, next); };
  useEffect(() => {
    load();
    api.get('/hr/employees', { params: { operational: true } }).then(({ data }) => setEmployees(data.employees || [])).catch(() => setEmployees([]));
  }, []);
  const selectEmployee = (id) => { setEmployeeId(id); load(filters, id); };
  const selectedEmployee = isSelf ? null : employees.find((item) => item.id === employeeId);

  const set = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));
  const openCreate = () => { setEditing(null); setForm(blank()); setError(''); setOpen(true); };
  const openEdit = (row) => { setEditing(row); setForm({ ...blank(), ...row }); setError(''); setOpen(true); };
  const canEdit = (row) => isAdmin || row.createdByName === user?.name;
  const csvName = isSelf ? 'my-' : selectedEmployee ? `${selectedEmployee.employeeCode}-` : '';
  const submit = async (event) => {
    event.preventDefault(); setSaving(true); setError('');
    try { await (editing ? api.patch(`/hr/worksheet/${editing.id}`, form) : api.post('/hr/worksheet', form)); setOpen(false); await load(); }
    catch (requestError) { setError(requestError.response?.data?.message || 'Entry could not be saved'); }
    finally { setSaving(false); }
  };
  const remove = async (row) => {
    if (!window.confirm('Delete this worksheet entry? This cannot be undone.')) return;
    try { await api.delete(`/hr/worksheet/${row.id}`); await load(); }
    catch (requestError) { setError(requestError.response?.data?.message || 'Entry could not be deleted'); }
  };
  const downloadCsv = () => {
    const head = ['Date', 'Employee', 'Department', 'Work / Task', 'Daily Target', 'Actual Output', 'Work Status', 'Delay / Issue', 'Evidence / Reference', 'Next Action / Due Date'];
    const lines = rows.map((row) => [row.date, row.hrEmployee, label(DEPARTMENTS, row.department), row.task, row.dailyTarget, row.actualOutput, label(STATUSES, row.workStatus), row.delayIssue, row.evidence, row.nextAction].map(csvCell).join(','));
    const url = URL.createObjectURL(new Blob([[head.map(csvCell).join(','), ...lines].join('\n')], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a'); link.href = url; link.download = `hr-daily-worksheet-${csvName}${todayInput()}.csv`; link.click(); URL.revokeObjectURL(url);
  };

  const cards = [['Entries', summary.total], ['Completed', summary.completed], ['In progress', summary.inProgress], ['Pending', summary.pending], ['Delayed / blocked', summary.delayed]];
  const head = ['Date', 'Employee', 'Department', 'Work / Task', 'Daily Target', 'Actual Output', 'Work Status', 'Delay / Issue', 'Evidence / Reference', 'Next Action / Due Date', 'Action'];

  return <div className="space-y-5">
    <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div><p className="text-xs font-semibold uppercase text-sage">HR Operations</p><h1 className="flex items-center gap-2 font-display text-2xl font-bold text-charcoal"><ClipboardCheck size={23} /> Daily HR Worksheet</h1><p className="mt-1 text-sm text-charcoal/60">Date-wise register of the work HR does every day.</p></div>
      <div className="flex gap-2"><Button variant="outline" onClick={downloadCsv} disabled={!rows.length}><Download size={16} /> Download Daily CSV</Button><Button onClick={openCreate}><Plus size={16} /> Add Daily Entry</Button></div>
    </header>
    <div className="flex gap-2 border-b border-cardline">
      {[['self', isAdmin ? 'HR Own Worksheets' : 'My Worksheet'], ['employee', 'Employee Worksheets']].map(([value, text]) => <button key={value} type="button" onClick={() => switchScope(value)} className={`-mb-px border-b-2 px-4 py-2.5 text-sm font-semibold ${scope === value ? 'border-sage text-sage' : 'border-transparent text-charcoal/55 hover:text-charcoal'}`}>{text}</button>)}
    </div>
    {isSelf && <p className="text-sm text-charcoal/60">{isAdmin ? 'Daily work entries HR members have recorded for themselves.' : 'Record your own daily HR work here. Only you and management can see these entries.'}</p>}
    {!isSelf && <section className="border border-cardline bg-offwhite-100 p-3">
      <p className="mb-2 text-xs font-semibold uppercase text-charcoal/50">Employee worksheets (filled by HR from each employee's daily report)</p>
      <div className="flex flex-wrap gap-2">
        {[{ id: '', name: 'All employees' }, ...employees].map((item) => <button key={item.id || 'all'} type="button" onClick={() => selectEmployee(item.id)} className={`rounded-md border px-3 py-2 text-left text-sm transition-colors ${employeeId === item.id ? 'border-sage bg-[#E7F1ED] font-semibold ring-2 ring-sage/20' : 'border-cardline bg-white hover:bg-offwhite-200'}`}>{item.name}{item.employeeCode && <span className="ml-2 text-xs text-charcoal/50">{item.employeeCode}</span>}</button>)}
      </div>
      {!employees.length && <p className="mt-2 text-xs text-charcoal/50">No employees yet. Add employees in HR → Employees to create their worksheets.</p>}
    </section>}
    <section className="grid border border-cardline bg-offwhite-100 sm:grid-cols-5">{cards.map(([text, value], index) => <div key={text} className={`px-4 py-3 ${index < cards.length - 1 ? 'border-b border-cardline sm:border-b-0 sm:border-r' : ''}`}><p className="text-xs font-semibold uppercase text-charcoal/50">{text}</p><p className="mt-1 text-2xl font-bold text-charcoal">{value || 0}</p></div>)}</section>
    <form onSubmit={(event) => { event.preventDefault(); load(); }} className="grid gap-3 border border-cardline bg-offwhite-100 p-4 sm:grid-cols-2 lg:grid-cols-4">
      <label className="relative sm:col-span-2"><Search size={16} className="absolute left-3 top-3 text-charcoal/40" /><input className={`${controlClass} w-full pl-9`} placeholder="Search employee, task, issue or reference" value={filters.search} onChange={(event) => setFilters({ ...filters, search: event.target.value })} /></label>
      <select aria-label="Department" className={controlClass} value={filters.department} onChange={(event) => setFilters({ ...filters, department: event.target.value })}><option value="">All departments</option>{DEPARTMENTS.map(([value, text]) => <option key={value} value={value}>{text}</option>)}</select>
      <select aria-label="Work status" className={controlClass} value={filters.workStatus} onChange={(event) => setFilters({ ...filters, workStatus: event.target.value })}><option value="">All statuses</option>{STATUSES.map(([value, text]) => <option key={value} value={value}>{text}</option>)}</select>
      <input aria-label="From date" type="date" className={controlClass} value={filters.from} onChange={(event) => setFilters({ ...filters, from: event.target.value })} />
      <input aria-label="To date" type="date" className={controlClass} value={filters.to} onChange={(event) => setFilters({ ...filters, to: event.target.value })} />
      <Button type="submit">Apply filters</Button><Button type="button" variant="outline" onClick={() => { const next = { ...filters, from: '', to: '' }; setFilters(next); load(next); }}>Show all dates</Button>
    </form>
    {error && !open && <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>}
    <section className="overflow-hidden border border-cardline bg-offwhite-100">
      <h2 className="border-b border-cardline px-4 py-3 font-display text-base font-bold text-charcoal">{isSelf ? (isAdmin ? 'HR Own Daily Entries' : 'My Daily Entries') : selectedEmployee ? `${selectedEmployee.name}'s Daily Entries` : 'Saved Daily Entries'} <span className="text-sm font-semibold text-charcoal/50">({rows.length} entries)</span></h2>
      <div className="overflow-x-auto"><table className="w-full min-w-[1400px] text-sm">
        <thead className="bg-[#50685D] text-left text-xs uppercase text-white"><tr>{head.map((text) => <th key={text} className="whitespace-nowrap px-4 py-3">{text}</th>)}</tr></thead>
        <tbody className="divide-y divide-cardline-soft">{rows.map((row) => <tr key={row.id}>
          <td className="whitespace-nowrap px-4 py-3 font-semibold">{row.date}</td>
          <td className="px-4 py-3">{row.hrEmployee}</td>
          <td className="px-4 py-3">{label(DEPARTMENTS, row.department)}</td>
          <td className="max-w-64 px-4 py-3">{row.task}</td>
          <td className="px-4 py-3">{row.dailyTarget || '-'}</td>
          <td className="px-4 py-3">{row.actualOutput || '-'}</td>
          <td className="px-4 py-3"><span className={`inline-flex whitespace-nowrap rounded px-2 py-1 text-xs font-semibold ${tone(row.workStatus)}`}>{label(STATUSES, row.workStatus)}</span></td>
          <td className="max-w-56 px-4 py-3">{row.delayIssue || '-'}</td>
          <td className="max-w-56 px-4 py-3">{row.evidence || '-'}</td>
          <td className="max-w-56 px-4 py-3">{row.nextAction || '-'}</td>
          <td className="px-4 py-3"><div className="flex items-center gap-1">{canEdit(row) && <button title="Edit entry" onClick={() => openEdit(row)} className="p-2 text-sage"><Pencil size={16} /></button>}{canHrDelete(user?.role) && <button title="Delete entry" onClick={() => remove(row)} className="p-2 text-red-700"><Trash2 size={16} /></button>}</div></td>
        </tr>)}</tbody>
      </table></div>
      {loading && <p className="p-8 text-center text-sm text-charcoal/50">Loading...</p>}
      {!loading && !rows.length && <p className="p-10 text-center text-sm text-charcoal/50">No entries for these filters — add a daily entry.</p>}
    </section>

    <Modal open={open} onClose={() => setOpen(false)} title={`${editing ? 'Edit' : 'Add'} Daily Entry`} className="max-w-4xl"><form onSubmit={submit} className="space-y-4">
      {error && <div className="rounded bg-red-50 p-3 text-sm text-red-800">{error}</div>}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="Date *"><input required type="date" className={fieldClass} value={form.date} onChange={set('date')} /></Field>
        {!isSelf && <Field label="Employee *"><select required className={fieldClass} value={form.employeeId} onChange={set('employeeId')}><option value="">Select employee</option>{employees.map((item) => <option key={item.id} value={item.id}>{item.employeeCode} - {item.name}</option>)}</select></Field>}
        <Field label="Department"><select className={fieldClass} value={form.department} onChange={set('department')}>{DEPARTMENTS.map(([value, text]) => <option key={value} value={value}>{text}</option>)}</select></Field>
        <Field label="Work / Task *"><input required className={fieldClass} placeholder="Work / Task" value={form.task} onChange={set('task')} /></Field>
        <Field label="Daily Target"><input className={fieldClass} placeholder="Daily Target" value={form.dailyTarget} onChange={set('dailyTarget')} /></Field>
        <Field label="Actual Output"><input className={fieldClass} placeholder="Actual Output" value={form.actualOutput} onChange={set('actualOutput')} /></Field>
        <Field label="Work Status"><select className={fieldClass} value={form.workStatus} onChange={set('workStatus')}>{STATUSES.map(([value, text]) => <option key={value} value={value}>{text}</option>)}</select></Field>
        <Field label="Delay / Issue"><input className={fieldClass} placeholder="Delay / Issue" value={form.delayIssue} onChange={set('delayIssue')} /></Field>
        <Field label="Evidence / Reference"><input className={fieldClass} placeholder="Evidence / Reference" value={form.evidence} onChange={set('evidence')} /></Field>
        <Field label="Next Action / Due Date" className="sm:col-span-2 lg:col-span-3"><input className={fieldClass} placeholder="Next Action / Due Date" value={form.nextAction} onChange={set('nextAction')} /></Field>
      </div>
      <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button><Button type="submit" disabled={saving}>{saving ? 'Saving...' : 'Save Daily Entry'}</Button></div>
    </form></Modal>
  </div>;
}
