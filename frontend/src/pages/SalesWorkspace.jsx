import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, CalendarDays, CalendarRange, Check, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Columns3, History, LogOut, Pencil, Plus, Save, Trash2, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { io } from 'socket.io-client';
import api from '../api/axios.js';
import BrandLogo from '../components/BrandLogo.jsx';
import Button from '../components/ui/Button.jsx';
import Modal from '../components/ui/Modal.jsx';
import Drawer from '../components/ui/Drawer.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { ROLES } from '../constants/roles.js';

const isoDate = (date) => {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
};
const shiftDate = (value, days) => {
  const date = new Date(`${value}T12:00:00`);
  date.setDate(date.getDate() + days);
  return isoDate(date);
};
const dateLabel = (value) => new Intl.DateTimeFormat('en-IN', { weekday: 'short', day: '2-digit', month: 'short' }).format(new Date(`${value}T12:00:00`));
const entryDate = (value) => value ? new Date(value).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '-';
const entryTime = (value) => value ? new Date(value).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '-';
const timelineStamp = (value) => value ? new Date(value).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-';
const displayCell = (column, value) => column.type === 'checkbox' ? <span className={`inline-flex h-4 w-4 items-center justify-center border ${value === 'true' ? 'border-sage bg-sage text-white' : 'border-charcoal/40 bg-transparent'}`}>{value === 'true' ? '✓' : ''}</span> : (value || <span className="text-charcoal/30">-</span>);
const socketUrl = (import.meta.env.VITE_API_URL || 'http://localhost:5000/api').replace(/\/api\/?$/, '');
const renderCell = (column, value) => column.type === 'file' && value ? <a href={String(value).startsWith('/') ? socketUrl + value : value} target="_blank" rel="noreferrer" className="text-sage underline">View attachment</a> : displayCell(column, value);

const Field = ({ column, value, onChange, disabled = false }) => {
  const common = { value: value || '', disabled, onChange: (event) => onChange(event.target.value), className: 'w-full min-w-[130px] border-0 bg-transparent px-3 py-2.5 text-sm text-charcoal outline-none disabled:cursor-default disabled:bg-transparent' };
  if (column.type === 'checkbox') return <input type="checkbox" checked={value === 'true' || value === '☑'} disabled={disabled} onChange={(event) => onChange(String(event.target.checked))} className="ml-3 h-4 w-4 accent-sage" />;
  if (column.type === 'file') return <div className="px-3 py-2"><input type="file" disabled={disabled} onChange={async (event) => { const file = event.target.files?.[0]; if (!file) return; const form = new FormData(); form.append('file', file); try { const { data } = await api.post('/sales-sheet/upload', form); onChange(data.file.url); } catch { window.alert('File could not be uploaded'); } }} className="max-w-[180px] text-xs" />{value && <a href={String(value).startsWith('/') ? socketUrl + value : value} target="_blank" rel="noreferrer" className="mt-1 block text-xs text-sage">View attachment</a>}</div>;
  if (column.type === 'select') return <select {...common}><option value="">Select</option>{column.options.map((option) => <option key={option}>{option}</option>)}</select>;
  if (column.type === 'textarea') return <textarea {...common} rows={2} />;
  return <input {...common} type={column.type === 'phone' ? 'tel' : column.type} />;
};

const SalesWorkspace = () => {
  const { user, logout } = useAuth();
  const isAdmin = user?.role === ROLES.ADMIN;
  const canReturnToDashboard = [ROLES.ADMIN, ROLES.RECEPTIONIST].includes(user?.role);
  const canReturnToAppointmentManagement = user?.role === ROLES.SALES_TEAM;
  const canManageReception = [ROLES.ADMIN, ROLES.RECEPTIONIST].includes(user?.role);
  const [selectedDate, setSelectedDate] = useState(isoDate(new Date()));
  const [allDates, setAllDates] = useState(false);
  const [columns, setColumns] = useState([]);
  const [rows, setRows] = useState([]);
  const [draft, setDraft] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [rescheduleRow, setRescheduleRow] = useState(null);
  const [rescheduleDate, setRescheduleDate] = useState('');
  const [liveConnected, setLiveConnected] = useState(false);
  const [newColumn, setNewColumn] = useState({ label: '', type: 'text', required: false, options: '' });
  const [filters, setFilters] = useState([{ id: 1, field: '', operator: 'contains', value: '' }]);
  const [timelineRow, setTimelineRow] = useState(null);
  const [timeline, setTimeline] = useState([]);
  const [timelineLoading, setTimelineLoading] = useState(false);

  const dates = useMemo(() => Array.from({ length: 9 }, (_, index) => shiftDate(selectedDate, index - 4)), [selectedDate]);
  const loadColumns = useCallback(async () => {
    const { data } = await api.get('/sales-sheet/columns', { skipCache: true });
    setColumns(data.columns);
  }, []);
  const loadRows = useCallback(async () => {
    const { data } = await api.get('/sales-sheet/appointments', { params: allDates ? {} : { date: selectedDate }, skipCache: true });
    setRows(data.appointments.map((row) => ({ ...row, values: Object.fromEntries(columns.map((column) => [column.id, column.type === 'checkbox' ? (row.values?.[column.id] === 'true' ? '☑' : '☐') : (row.values?.[column.id] || '')])) })));
  }, [selectedDate, allDates, columns]);

  useEffect(() => { loadColumns().catch((err) => setError(err.response?.data?.message || 'Could not load columns')); }, [loadColumns]);
  useEffect(() => {
    setLoading(true); setDraft(null); setEditingId(null);
    loadRows().catch((err) => setError(err.response?.data?.message || 'Could not load appointments')).finally(() => setLoading(false));
  }, [loadRows]);

  useEffect(() => {
    const socket = io(socketUrl, {
      auth: { token: localStorage.getItem('crm_token') },
      transports: ['websocket', 'polling'],
    });
    socket.on('connect', () => {
      setLiveConnected(true);
      socket.emit('sales-sheet:watch-date', selectedDate);
    });
    socket.on('disconnect', () => setLiveConnected(false));
    socket.on('sales-sheet:date-changed', ({ date }) => {
      if (allDates || date === selectedDate) loadRows().catch(() => {});
    });
    socket.on('sales-sheet:columns-changed', () => {
      loadColumns().catch(() => {});
      loadRows().catch(() => {});
    });
    return () => socket.disconnect();
  }, [selectedDate, allDates, loadColumns, loadRows]);

  const emptyValues = () => Object.fromEntries(columns.map((column) => [column.id, '']));
  const startAdd = () => { setDraft({ values: emptyValues() }); setEditingId(null); setError(''); };
  const startEdit = (row) => { setDraft({ values: { ...emptyValues(), ...row.values } }); setEditingId(row.id); setError(''); };
  const saveRow = async () => {
    try {
      setError('');
      if (editingId) await api.patch(`/sales-sheet/appointments/${editingId}`, { values: draft.values });
      else await api.post('/sales-sheet/appointments', { appointmentDate: selectedDate, values: draft.values });
      setDraft(null); setEditingId(null); await loadRows();
    } catch (err) { setError(err.response?.data?.message || 'Appointment could not be saved'); }
  };
  const removeRow = async (row) => {
    if (!window.confirm('Delete this appointment row?')) return;
    try { await api.delete(`/sales-sheet/appointments/${row.id}`); await loadRows(); }
    catch (err) { setError(err.response?.data?.message || 'Appointment could not be deleted'); }
  };
  const acceptRow = async (row) => {
    try {
      setError('');
      await api.post(`/sales-sheet/appointments/${row.id}/accept`);
      await loadRows();
    } catch (err) { setError(err.response?.data?.message || 'Appointment could not be accepted'); }
  };
  const reschedule = async () => {
    try {
      setError('');
      await api.post(`/sales-sheet/appointments/${rescheduleRow.id}/reschedule`, { appointmentDate: rescheduleDate });
      setRescheduleRow(null); setRescheduleDate(''); await loadRows();
    } catch (err) { setError(err.response?.data?.message || 'Appointment could not be rescheduled'); }
  };
  const addColumn = async (event) => {
    event.preventDefault();
    try {
      await api.post('/sales-sheet/columns', { ...newColumn, options: newColumn.options.split(',') });
      setNewColumn({ label: '', type: 'text', required: false, options: '' }); await loadColumns();
    } catch (err) { setError(err.response?.data?.message || 'Column could not be added'); }
  };
  const renameColumn = async (column) => {
    const label = window.prompt('Column name', column.label);
    if (!label || label === column.label) return;
    await api.patch(`/sales-sheet/columns/${column.id}`, { label }); await loadColumns();
  };
  const removeColumn = async (column) => {
    if (!window.confirm(`Remove the ${column.label} column? Existing row data will be kept in history but hidden.`)) return;
    await api.delete(`/sales-sheet/columns/${column.id}`); await loadColumns();
  };
  const moveColumn = async (column, direction) => {
    const index = columns.findIndex((item) => item.id === column.id);
    const target = columns[index + direction];
    if (!target) return;
    await Promise.all([
      api.patch(`/sales-sheet/columns/${column.id}`, { order: target.order }),
      api.patch(`/sales-sheet/columns/${target.id}`, { order: column.order }),
    ]);
    await loadColumns();
  };
  const openTimeline = async (row) => {
    setTimelineRow(row); setTimeline([]); setTimelineLoading(true);
    try { const { data } = await api.get(`/sales-sheet/timeline/sales/${row.id}`, { skipCache: true }); setTimeline(data.timeline || []); }
    catch (err) { setError(err.response?.data?.message || 'Timeline could not be loaded'); }
    finally { setTimelineLoading(false); }
  };
  const filterDescriptors = useMemo(() => [
    { key: 'appointmentCode', label: 'Appointment ID', type: 'text' },
    { key: 'entryDate', label: 'Entry Date', type: 'date' },
    { key: 'entryTime', label: 'Entry Time', type: 'time' },
    { key: 'lastUpdatedAt', label: 'Last Updated Date', type: 'date' },
    ...columns.map((column) => ({ key: `custom:${column.id}`, label: column.label, type: column.type, column })),
  ], [columns]);
  const filterDescriptor = (filter) => filterDescriptors.find((descriptor) => descriptor.key === filter.field);
  const filterType = (filter) => filterDescriptor(filter)?.type || 'text';
  const filterOperators = (filter) => {
    const type = filterType(filter);
    if (type === 'date' || type === 'time') return [['equals', type === 'time' ? 'At time' : 'On date'], ['notEquals', type === 'time' ? 'Not at time' : 'Not on date'], ['before', type === 'time' ? 'Before time' : 'Before date'], ['after', type === 'time' ? 'After time' : 'After date'], ['empty', 'Is empty'], ['notEmpty', 'Is not empty']];
    if (type === 'number') return [['equals', 'Equals'], ['notEquals', 'Not equals'], ['greater', 'Greater than'], ['less', 'Less than'], ['greaterOrEqual', 'At least'], ['lessOrEqual', 'At most'], ['empty', 'Is empty'], ['notEmpty', 'Is not empty']];
    if (type === 'select' || type === 'checkbox') return [['equals', 'Equals'], ['notEquals', 'Not equals'], ['empty', 'Is empty'], ['notEmpty', 'Is not empty']];
    if (type === 'file') return [['empty', 'Is empty'], ['notEmpty', 'Is not empty']];
    return [['contains', 'Contains'], ['equals', 'Equals'], ['notEquals', 'Not equals'], ['startsWith', 'Starts with'], ['endsWith', 'Ends with'], ['empty', 'Is empty'], ['notEmpty', 'Is not empty']];
  };
  const filterValue = (row, descriptor) => {
    if (descriptor.key === 'appointmentCode') return row.appointmentCode || '';
    if (descriptor.key === 'entryDate') return row.entryAt ? new Date(row.entryAt).toISOString().slice(0, 10) : '';
    if (descriptor.key === 'entryTime') return row.entryAt ? `${String(new Date(row.entryAt).getHours()).padStart(2, '0')}:${String(new Date(row.entryAt).getMinutes()).padStart(2, '0')}` : '';
    if (descriptor.key === 'lastUpdatedAt') return row.lastEditedAt ? new Date(row.lastEditedAt).toISOString().slice(0, 10) : '';
    const raw = row.values?.[descriptor.column.id] || '';
    return descriptor.type === 'checkbox' ? (raw === 'true' || raw.includes(String.fromCharCode(9745)) || raw === 'â˜‘' ? 'true' : 'false') : raw;
  };
  const filteredRows = useMemo(() => {
    const activeFilters = filters.filter((filter) => filter.field);
    if (!activeFilters.length) return rows;
    return rows.filter((row) => activeFilters.every((filter) => {
      const descriptor = filterDescriptor(filter);
      if (!descriptor) return true;
      const value = String(filterValue(row, descriptor)).trim().toLowerCase();
      const query = String(filter.value || '').trim().toLowerCase();
      if (filter.operator === 'empty') return !value;
      if (filter.operator === 'notEmpty') return Boolean(value);
      if (filter.operator === 'equals') return value === query;
      if (filter.operator === 'notEquals') return value !== query;
      if (filter.operator === 'before') return value < query;
      if (filter.operator === 'after') return value > query;
      if (filter.operator === 'greater') return Number(value) > Number(query);
      if (filter.operator === 'less') return Number(value) < Number(query);
      if (filter.operator === 'greaterOrEqual') return Number(value) >= Number(query);
      if (filter.operator === 'lessOrEqual') return Number(value) <= Number(query);
      if (filter.operator === 'startsWith') return value.startsWith(query);
      if (filter.operator === 'endsWith') return value.endsWith(query);
      return value.includes(query);
    }));
  }, [filters, filterDescriptors, rows]);
  const updateFilter = (id, changes) => setFilters((current) => current.map((filter) => filter.id === id ? { ...filter, ...changes } : filter));
  const addFilter = () => setFilters((current) => [...current, { id: Date.now(), field: '', operator: 'contains', value: '' }]);
  const removeFilter = (id) => setFilters((current) => current.length === 1 ? [{ id: Date.now(), field: '', operator: 'contains', value: '' }] : current.filter((filter) => filter.id !== id));

  return (
    <div className="min-h-screen bg-cream text-charcoal">
      <header className="flex h-16 items-center justify-between gap-3 bg-teal-950 px-4 text-offwhite-100 sm:px-7">
        <div className="flex min-w-0 items-center gap-2.5"><BrandLogo size="sm" /><span className="truncate font-display text-sm font-bold">Manovaidya Operation System</span></div>
        <div className="flex items-center gap-2">
          {canReturnToDashboard && <Link to="/admin"><Button variant="ghost" size="sm" className="text-offwhite-100 hover:bg-teal-800"><ArrowLeft size={15} /> Dashboard</Button></Link>}
          {canReturnToAppointmentManagement && <Link to="/admin/appointment-management"><Button variant="ghost" size="sm" className="text-offwhite-100 hover:bg-teal-800"><ArrowLeft size={15} /> Appointment Management</Button></Link>}
          <Button variant="ghost" size="sm" onClick={logout} className="text-offwhite-100 hover:bg-teal-800"><LogOut size={15} /><span className="hidden sm:inline">Log out</span></Button>
        </div>
      </header>

      <section className="border-b border-tan-300 bg-offwhite-100 px-3 py-3 sm:px-6">
        <div className="mx-auto flex max-w-[1800px] items-center gap-2 overflow-x-auto">
          <button onClick={() => setSelectedDate(shiftDate(selectedDate, -7))} className="shrink-0 p-2 text-sage" title="Previous week"><ChevronLeft size={20} /></button>
          {dates.map((date) => <button key={date} onClick={() => setSelectedDate(date)} className={`min-w-[108px] shrink-0 border-b-2 px-3 py-2 text-center text-xs font-semibold ${date === selectedDate ? 'border-sage bg-sage/10 text-teal-950' : 'border-transparent text-charcoal/60 hover:bg-tan-100'}`}>{dateLabel(date)}</button>)}
          <button onClick={() => setSelectedDate(shiftDate(selectedDate, 7))} className="shrink-0 p-2 text-sage" title="Next week"><ChevronRight size={20} /></button>
          <label className="ml-auto flex shrink-0 items-center gap-2 rounded border border-tan-300 bg-cream px-3 py-2 text-xs font-semibold text-charcoal/70"><input type="checkbox" checked={allDates} onChange={(event) => setAllDates(event.target.checked)} className="accent-sage" /> All dates</label>
          <input type="date" value={selectedDate} onChange={(event) => setSelectedDate(event.target.value)} className="shrink-0 rounded border border-tan-300 bg-cream px-2 py-2 text-xs" aria-label="Select appointment date" />
        </div>
      </section>

      <main className="mx-auto max-w-[1800px] p-4 sm:p-6">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div><p className="text-xs font-semibold uppercase text-charcoal/50">Sales Team</p><h1 className="font-display text-2xl font-bold">Appointment Sheet</h1><p className="mt-1 text-sm text-charcoal/60"><CalendarDays className="mr-1 inline" size={15} />{dateLabel(selectedDate)} · {rows.filter((row) => row.status !== 'rescheduled').length} appointments <span className={`ml-2 inline-flex items-center gap-1 text-xs ${liveConnected ? 'text-sage' : 'text-charcoal/40'}`}><span className={`h-1.5 w-1.5 rounded-full ${liveConnected ? 'bg-sage' : 'bg-charcoal/30'}`} />{liveConnected ? 'Live' : 'Connecting'}</span></p></div>
          <div className="flex gap-2">{isAdmin && <Button variant="outline" onClick={() => setSettingsOpen(true)}><Columns3 size={16} /> Columns</Button>}<Button onClick={startAdd} disabled={!columns.length || Boolean(draft)}><Plus size={16} /> Add appointment</Button></div>
        </div>
        {error && <div className="mb-3 border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
        <div className="mb-4 space-y-2 rounded-lg border border-tan-300 bg-offwhite-100 p-3"><p className="text-xs font-semibold uppercase text-charcoal/55">Filter appointments (all conditions apply)</p>{filters.map((filter, index) => <div key={filter.id} className="grid gap-2 md:grid-cols-[1.2fr_160px_1fr_auto]"><select value={filter.field} onChange={(event) => { const field = event.target.value; updateFilter(filter.id, { field, operator: filterOperators({ field })[0][0], value: '' }); }} className="rounded border border-tan-300 bg-cream px-3 py-2 text-sm"><option value="">Filter by any column</option>{filterDescriptors.map((descriptor) => <option key={descriptor.key} value={descriptor.key}>{descriptor.label}</option>)}</select><select value={filter.operator} onChange={(event) => updateFilter(filter.id, { operator: event.target.value, value: '' })} className="rounded border border-tan-300 bg-cream px-3 py-2 text-sm">{filterOperators(filter).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>{filterType(filter) === 'select' ? <select value={filter.value} onChange={(event) => updateFilter(filter.id, { value: event.target.value })} disabled={['empty', 'notEmpty'].includes(filter.operator)} className="rounded border border-tan-300 bg-cream px-3 py-2 text-sm disabled:opacity-40"><option value="">Select value</option>{(filterDescriptor(filter)?.column?.options || []).map((option) => <option key={option} value={option}>{option}</option>)}</select> : filterType(filter) === 'checkbox' ? <select value={filter.value} onChange={(event) => updateFilter(filter.id, { value: event.target.value })} disabled={['empty', 'notEmpty'].includes(filter.operator)} className="rounded border border-tan-300 bg-cream px-3 py-2 text-sm disabled:opacity-40"><option value="">Select value</option><option value="true">Checked</option><option value="false">Unchecked</option></select> : <input type={filterType(filter) === 'date' ? 'date' : filterType(filter) === 'time' ? 'time' : filterType(filter) === 'number' ? 'number' : 'text'} disabled={['empty', 'notEmpty'].includes(filter.operator) || filterType(filter) === 'file'} value={filter.value} onChange={(event) => updateFilter(filter.id, { value: event.target.value })} placeholder={['date', 'time'].includes(filterType(filter)) ? '' : 'Enter value'} className="rounded border border-tan-300 bg-cream px-3 py-2 text-sm disabled:opacity-40" />}<div className="flex gap-1"><Button variant="outline" onClick={addFilter}>+ Add</Button>{(index > 0 || filters.length > 1) && <Button variant="outline" onClick={() => removeFilter(filter.id)}>Remove</Button>}</div></div>)}<Button variant="outline" onClick={() => setFilters([{ id: Date.now(), field: '', operator: 'contains', value: '' }])}>Clear all</Button></div>
        <div className="overflow-x-auto border border-tan-300 bg-offwhite-100">
          <table className="w-full min-w-max border-collapse text-left">
            <thead><tr className="bg-tan-100 text-xs uppercase text-charcoal/60"><th className="w-14 border-r border-tan-300 px-3 py-3 text-center">#</th><th className="min-w-[190px] border-r border-tan-300 px-3 py-3">Appointment ID</th><th className="min-w-[120px] border-r border-tan-300 px-3 py-3">Entry Date</th><th className="min-w-[110px] border-r border-tan-300 px-3 py-3">Entry Time</th><th className="min-w-[145px] border-r border-tan-300 px-3 py-3">Last Updated Date</th>{columns.map((column) => <th key={column.id} className="min-w-[150px] border-r border-tan-300 px-3 py-3">{column.label}{column.required && <span className="ml-1 text-red-600">*</span>}</th>)}<th className="min-w-[140px] border-r border-tan-300 px-3 py-3">Added by</th>{canManageReception && <th className="min-w-[130px] border-r border-tan-300 px-3 py-3 text-center">Reception</th>}<th className="w-24 border-r border-tan-300 px-3 py-3 text-center">Actions</th>{isAdmin && <th className="w-24 px-3 py-3 text-center text-sage">Timeline</th>}</tr></thead>
            <tbody>
              {draft && <tr className="bg-sage/5"><td className="border-r border-tan-300 px-3 text-center text-xs font-semibold">{editingId ? rows.findIndex((row) => row.id === editingId) + 1 : rows.length + 1}</td><td className="border-r border-tan-300 px-3 text-xs text-charcoal/45">{editingId ? rows.find((row) => row.id === editingId)?.appointmentCode : 'Auto generated'}</td><td className="border-r border-tan-300 px-3 text-xs text-charcoal/45">{editingId ? entryDate(rows.find((row) => row.id === editingId)?.entryAt) : 'On save'}</td><td className="border-r border-tan-300 px-3 text-xs text-charcoal/45">{editingId ? entryTime(rows.find((row) => row.id === editingId)?.entryAt) : 'On save'}</td><td className="border-r border-tan-300 px-3 text-xs text-charcoal/45">{editingId ? entryDate(rows.find((row) => row.id === editingId)?.lastEditedAt) : '-'}</td>{columns.map((column) => <td key={column.id} className="border-r border-tan-300 p-0"><Field column={column} value={draft.values[column.id]} onChange={(value) => setDraft((current) => ({ values: { ...current.values, [column.id]: value } }))} /></td>)}<td className="border-r border-tan-300 px-3 text-sm font-medium">{editingId ? rows.find((row) => row.id === editingId)?.createdByName : user?.name}</td>{canManageReception && <td className="border-r border-tan-300" />}<td className="border-r border-tan-300"><div className="flex justify-center gap-1"><button onClick={saveRow} className="p-2 text-sage" title="Save"><Save size={17} /></button><button onClick={() => { setDraft(null); setEditingId(null); }} className="p-2 text-charcoal/50" title="Cancel"><X size={17} /></button></div></td>{isAdmin && <td />}</tr>}
              {!loading && filteredRows.map((row, index) => editingId === row.id ? null : <tr key={row.id} className={`border-t border-tan-300 hover:bg-tan-100/40 ${row.status === 'rescheduled' ? 'bg-tan-100/50 text-charcoal/55' : ''}`}><td className="border-r border-tan-300 px-3 py-3 text-center text-xs text-charcoal/50">{index + 1}</td><td className="border-r border-tan-300 px-3 py-3 text-xs font-semibold">{row.appointmentCode}{row.status === 'rescheduled' && <span className="mt-1 block text-[11px] font-semibold text-[#9A5B16]">Rescheduled to {entryDate(`${row.rescheduledTo}T12:00:00`)} by {row.rescheduledByName || '-'}</span>}{row.rescheduledAt && <span className="mt-1 block text-[10px] font-normal text-charcoal/45">Changed {entryDate(row.rescheduledAt)}</span>}</td><td className="border-r border-tan-300 px-3 py-3 text-sm">{entryDate(row.entryAt)}</td><td className="border-r border-tan-300 px-3 py-3 text-sm">{entryTime(row.entryAt)}</td><td className="border-r border-tan-300 px-3 py-3 text-sm">{entryDate(row.lastEditedAt)}</td>{columns.map((column) => <td key={column.id} className="max-w-[280px] whitespace-pre-wrap border-r border-tan-300 px-3 py-3 text-sm">{renderCell(column, row.values[column.id])}</td>)}<td className="border-r border-tan-300 px-3 py-3 text-sm"><span className="font-medium">{row.createdByName}</span>{String(row.createdBy) === String(user?.id || user?._id) && <span className="ml-2 text-xs text-sage">You</span>}</td>{canManageReception && <td className="border-r border-tan-300 px-3 py-3 text-center">{row.status === 'rescheduled' ? <span className="text-xs text-charcoal/40">Not available</span> : row.acceptedAt ? <span className="inline-flex items-center gap-1 text-xs font-semibold text-sage"><Check size={14} /> Accepted</span> : <Button size="sm" onClick={() => acceptRow(row)}><Check size={14} /> Accept</Button>}</td>}<td className="border-r border-tan-300"><div className="flex justify-center">{row.canReschedule && <button onClick={() => { setRescheduleRow(row); setRescheduleDate(''); }} className="p-2 text-[#9A5B16]" title="Reschedule"><CalendarRange size={16} /></button>}{row.canEdit ? <button onClick={() => startEdit(row)} className="p-2 text-sage" title="Edit"><Pencil size={16} /></button> : row.status === 'rescheduled' ? <span className="px-2 text-xs font-semibold text-[#9A5B16]">Rescheduled</span> : <span className="text-xs text-charcoal/35">View only</span>}{row.canDelete && <button onClick={() => removeRow(row)} className="p-2 text-red-700" title="Delete"><Trash2 size={16} /></button>}</div></td>{isAdmin && <td className="px-3 py-3 text-center"><button onClick={() => openTimeline(row)} className="rounded p-1.5 text-sage hover:bg-sage/10" title="View row timeline"><History size={17} /></button></td>}</tr>)}
              {!loading && !filteredRows.length && !draft && <tr><td colSpan={columns.length + 7 + (canManageReception ? 1 : 0) + (isAdmin ? 1 : 0)} className="px-6 py-16 text-center text-sm text-charcoal/50">{rows.length ? 'No appointments match this filter.' : columns.length ? 'No appointments added for this date.' : 'Admin has not configured sheet columns yet.'}</td></tr>}
              {loading && <tr><td colSpan={columns.length + 7 + (canManageReception ? 1 : 0) + (isAdmin ? 1 : 0)} className="px-6 py-16 text-center text-sm text-charcoal/50">Loading sheet...</td></tr>}
            </tbody>
          </table>
        </div>
      </main>

      <Modal open={Boolean(rescheduleRow)} onClose={() => { setRescheduleRow(null); setRescheduleDate(''); }} title="Reschedule appointment">
        <div className="space-y-4">
          <div><p className="text-sm font-semibold text-charcoal">{rescheduleRow?.appointmentCode}</p><p className="mt-1 text-xs text-charcoal/55">All appointment details will be copied to the new date.</p></div>
          <label className="block"><span className="mb-1.5 block text-sm font-semibold">New appointment date</span><input type="date" value={rescheduleDate} onChange={(event) => setRescheduleDate(event.target.value)} className="w-full rounded-lg border border-cardline bg-cream px-3 py-2.5 text-sm outline-none focus:border-sage" /></label>
          <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => { setRescheduleRow(null); setRescheduleDate(''); }}>Cancel</Button><Button disabled={!rescheduleDate} onClick={reschedule}><CalendarRange size={16} /> Reschedule</Button></div>
        </div>
      </Modal>

      <Modal open={settingsOpen} onClose={() => setSettingsOpen(false)} title="Sales sheet columns" className="max-w-4xl">
        <form onSubmit={addColumn} className="grid gap-3 border-b border-tan-300 pb-5 sm:grid-cols-[1fr_150px_1fr_auto]">
          <input value={newColumn.label} onChange={(e) => setNewColumn({ ...newColumn, label: e.target.value })} placeholder="Column name" className="rounded border border-tan-300 bg-cream px-3 py-2 text-sm" required />
          <select value={newColumn.type} onChange={(e) => setNewColumn({ ...newColumn, type: e.target.value })} className="rounded border border-tan-300 bg-cream px-3 py-2 text-sm"><option value="text">Text</option><option value="phone">Phone</option><option value="number">Number</option><option value="date">Date</option><option value="time">Time</option><option value="select">Dropdown</option><option value="textarea">Long text</option><option value="checkbox">Checkbox</option><option value="file">Attachment</option></select>
          <input value={newColumn.options} onChange={(e) => setNewColumn({ ...newColumn, options: e.target.value })} placeholder={newColumn.type === 'select' ? 'Options, separated by commas' : 'Options only for dropdown'} disabled={newColumn.type !== 'select'} className="rounded border border-tan-300 bg-cream px-3 py-2 text-sm disabled:opacity-40" />
          <Button type="submit"><Plus size={16} /> Add</Button>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={newColumn.required} onChange={(e) => setNewColumn({ ...newColumn, required: e.target.checked })} /> Required field</label>
        </form>
        <div className="divide-y divide-tan-300">{columns.map((column, index) => <div key={column.id} className="flex items-center gap-2 py-3"><div className="flex min-w-0 flex-1 items-center gap-3"><span className="w-5 text-xs text-charcoal/40">{index + 1}</span><div><p className="font-semibold">{column.label}{column.required && ' *'}</p><p className="text-xs text-charcoal/50">{column.type}{column.options.length ? ` · ${column.options.join(', ')}` : ''}</p></div></div><div className="flex"><button disabled={!index} onClick={() => moveColumn(column, -1)} className="p-1 text-sage disabled:opacity-25" title="Move up"><ChevronUp size={16} /></button><button disabled={index === columns.length - 1} onClick={() => moveColumn(column, 1)} className="p-1 text-sage disabled:opacity-25" title="Move down"><ChevronDown size={16} /></button></div><button onClick={() => renameColumn(column)} className="p-2 text-sage" title="Rename"><Pencil size={16} /></button><button onClick={() => removeColumn(column)} className="p-2 text-red-700" title="Remove"><Trash2 size={16} /></button></div>)}{!columns.length && <p className="py-8 text-center text-sm text-charcoal/50">No columns configured.</p>}</div>
      </Modal>
      <Drawer open={Boolean(timelineRow)} onClose={() => setTimelineRow(null)} title={`Row timeline${timelineRow?.appointmentCode ? ` · ${timelineRow.appointmentCode}` : ''}`}>
        {timelineLoading ? <p className="text-sm text-charcoal/55">Loading timeline...</p> : !timeline.length ? <p className="text-sm text-charcoal/55">No history recorded for this row.</p> : <div className="relative space-y-4 border-l border-sage/40 pl-4">{timeline.map((item) => <div key={item.id} className="relative"><span className="absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full bg-sage" /><p className="text-sm font-semibold text-charcoal">{item.action}</p>{item.details && <p className="mt-1 text-xs text-charcoal/60">{item.details}</p>}<p className="mt-1 text-[11px] text-charcoal/45">{item.changedByName} · {timelineStamp(item.createdAt)}</p></div>)}</div>}
      </Drawer>
    </div>
  );
};

export default SalesWorkspace;
