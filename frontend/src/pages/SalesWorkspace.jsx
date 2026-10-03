import { useCallback, useEffect, useMemo, useState } from 'react';
import SalesCallHistory from '../components/SalesCallHistory.jsx';
import AppointmentForm from '../components/AppointmentForm.jsx';
import { Search, List, Table2 } from 'lucide-react';
import { ArrowLeft, CalendarDays, CalendarRange, CalendarX2, Check, PhoneCall, RotateCcw, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Columns3, History, LogOut, Pencil, Plus, Save, Trash2, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { io } from 'socket.io-client';
import api from '../api/axios.js';
import BrandLogo from '../components/BrandLogo.jsx';
import Button from '../components/ui/Button.jsx';
import Modal from '../components/ui/Modal.jsx';
import SheetColumnEditor from '../components/SheetColumnEditor.jsx';
import MultiSelectCell, { splitChoices } from '../components/MultiSelectCell.jsx';
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
const bookedDate = (value) => value ? entryDate(`${value}T12:00:00`) : '-';
const entryTime = (value) => value ? new Date(value).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '-';
const timelineStamp = (value) => value ? new Date(value).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-';
const money = (value) => `Rs ${Number(value || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const displayCell = (column, value) => column.type === 'checkbox' ? <span className={`inline-flex h-4 w-4 items-center justify-center border ${value === 'true' ? 'border-sage bg-sage text-white' : 'border-charcoal/40 bg-transparent'}`}>{value === 'true' ? '✓' : ''}</span> : (value || <span className="text-charcoal/30">-</span>);
const socketUrl = (import.meta.env.VITE_API_URL || 'http://localhost:5000/api').replace(/\/api\/?$/, '');
const renderCell = (column, value) => column.type === 'file' && value ? <a href={String(value).startsWith('/') ? socketUrl + value : value} target="_blank" rel="noreferrer" className="text-sage underline">View attachment</a> : displayCell(column, value);

const Field = ({ column, value, onChange, disabled = false }) => {
  const common = { value: value || '', disabled, onChange: (event) => onChange(event.target.value), className: 'w-full min-w-[130px] border-0 bg-transparent px-3 py-2.5 text-sm text-charcoal outline-none disabled:cursor-default disabled:bg-transparent' };
  if (column.type === 'checkbox') return <input type="checkbox" checked={value === 'true' || value === '☑'} disabled={disabled} onChange={(event) => onChange(String(event.target.checked))} className="ml-3 h-4 w-4 accent-sage" />;
  if (column.type === 'file') return <div className="px-3 py-2"><input type="file" disabled={disabled} onChange={async (event) => { const file = event.target.files?.[0]; if (!file) return; const form = new FormData(); form.append('file', file); try { const { data } = await api.post('/sales-sheet/upload', form); onChange(data.file.url); } catch { window.alert('File could not be uploaded'); } }} className="max-w-[180px] text-xs" />{value && <a href={String(value).startsWith('/') ? socketUrl + value : value} target="_blank" rel="noreferrer" className="mt-1 block text-xs text-sage">View attachment</a>}</div>;
  if (column.type === 'select') return <select {...common}><option value="">Select</option>{column.options.map((option) => <option key={option}>{option}</option>)}</select>;
  if (column.type === 'multi_select') return <MultiSelectCell label={column.label} options={column.options} value={value} onChange={onChange} disabled={disabled} />;
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
  const [formRow, setFormRow] = useState(null);
  const [view, setView] = useState('appointments');
  const [search, setSearch] = useState('');
  const [draft, setDraft] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [columnToEdit, setColumnToEdit] = useState(null);
  const [rescheduleRow, setRescheduleRow] = useState(null);
  const [rescheduleDate, setRescheduleDate] = useState('');
  const [notComingRow, setNotComingRow] = useState(null);
  const [notComingReason, setNotComingReason] = useState('');
  const [busyRowId, setBusyRowId] = useState(null);
  const [liveConnected, setLiveConnected] = useState(false);
  const [newColumn, setNewColumn] = useState({ label: '', type: 'text', section: 'details', required: false, options: '' });
  const [filters, setFilters] = useState([{ id: 1, field: '', operator: 'contains', value: '' }]);
  const [timelineRow, setTimelineRow] = useState(null);
  const [callRow, setCallRow] = useState(null);
  const [timeline, setTimeline] = useState([]);
  const [timelineLoading, setTimelineLoading] = useState(false);

  const dates = useMemo(() => Array.from({ length: 9 }, (_, index) => shiftDate(selectedDate, index - 4)), [selectedDate]);
  const loadColumns = useCallback(async () => {
    const { data } = await api.get('/sales-sheet/columns', { skipCache: true });
    setColumns(data.columns);
  }, []);
  const loadRows = useCallback(async () => {
    const { data } = await api.get('/sales-sheet/appointments', { params: allDates ? {} : { date: selectedDate }, skipCache: true });
    setRows(data.appointments.map((row) => ({ ...row, values: Object.fromEntries(columns.map((column) => [column.id, column.type === 'checkbox' ? String([true, 'true', '\u2611'].includes(row.values?.[column.id])) : (row.values?.[column.id] || '')])) })));
  }, [selectedDate, allDates, columns]);

  useEffect(() => { loadColumns().catch((err) => setError(err.response?.data?.message || 'Could not load columns')); }, [loadColumns]);
  useEffect(() => {
    setLoading(true); setDraft(null); setEditingId(null);
    loadRows().catch((err) => setError(err.response?.data?.message || 'Could not load appointments')).finally(() => setLoading(false));
  }, [loadRows]);
  useEffect(() => {
    const timer = window.setInterval(() => loadRows().catch(() => {}), 120000);
    return () => window.clearInterval(timer);
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
  const startAdd = () => { setFormRow({ appointmentDate: selectedDate }); setError(''); };
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
  const markNotComing = async () => {
    if (!notComingReason.trim() || !notComingRow) return;
    setBusyRowId(notComingRow.id); setError('');
    try {
      await api.post(`/sales-sheet/appointments/${notComingRow.id}/not-coming`, { reason: notComingReason.trim() });
      setNotComingRow(null); setNotComingReason(''); await loadRows();
    } catch (err) { setError(err.response?.data?.message || 'Not coming status could not be saved'); }
    finally { setBusyRowId(null); }
  };
  const clearNotComing = async (row) => {
    setBusyRowId(row.id); setError('');
    try { await api.delete(`/sales-sheet/appointments/${row.id}/not-coming`); await loadRows(); }
    catch (err) { setError(err.response?.data?.message || 'Status could not be cleared'); }
    finally { setBusyRowId(null); }
  };
  const updateCall = async (row, status) => {
    setBusyRowId(row.id); setError('');
    try {
      await api.patch(`/sales-sheet/appointments/${row.id}/call-status`, { status });
      await loadRows();
    } catch (err) { setError(err.response?.data?.message || 'Call status could not be saved'); }
    finally { setBusyRowId(null); }
  };
  const logCall = (row) => setCallRow(row);
  const callSaved = (appointment) => {
    const { numberOfCalls, lastCallAt, callStatus, lastCallNotes } = appointment;
    setRows((current) => current.map((row) => row.id === appointment.id
      ? { ...row, numberOfCalls, lastCallAt, callStatus, lastCallNotes } : row));
  };
  const addColumn = async (event) => {
    event.preventDefault();
    try {
      await api.post('/sales-sheet/columns', { ...newColumn, options: newColumn.options.split(',') });
      setNewColumn({ label: '', type: 'text', section: 'details', required: false, options: '' }); await loadColumns();
    } catch (err) { setError(err.response?.data?.message || 'Column could not be added'); }
  };
  const editColumn = (column) => { setSettingsOpen(false); setColumnToEdit(column); };
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
    { key: 'createdByName', label: 'Added By', type: 'text' },
    { key: 'entryDate', label: 'Entry Date', type: 'date' },
    { key: 'entryTime', label: 'Entry Time', type: 'time' },
    { key: 'lastUpdatedAt', label: 'Last Updated Date', type: 'date' },
    { key: 'appointmentDate', label: 'Appointment Date', type: 'date' },
    { key: 'status', label: 'Appointment Status', type: 'select', column: { options: ['active', 'rescheduled', 'not_coming'] } },
    { key: 'acceptance', label: 'Acceptance', type: 'select', column: { options: ['accepted', 'pending'] } },
    { key: 'notComingReason', label: 'Not coming reason', type: 'text' },
    { key: 'salesNumberOfCalls', label: 'Sales calls', type: 'number' },
    { key: 'salesCallStatus', label: 'Sales call status', type: 'select', column: { options: ['pending', 'connected', 'no_answer', 'follow_up'] } },
    ...(canManageReception ? [{ key: 'lastCallAt', label: 'Last call time', type: 'date' }, { key: 'numberOfCalls', label: 'Number of calls', type: 'number' }, { key: 'callStatus', label: 'Call status', type: 'select', column: { options: ['pending', 'connected', 'no_answer', 'follow_up'] } }, { key: 'lastCallNotes', label: 'Call details', type: 'text' }] : []),
    ...columns.map((column) => ({ key: `custom:${column.id}`, label: column.label, type: column.type, column })),
  ], [columns, canManageReception]);
  const filterDescriptor = (filter) => filterDescriptors.find((descriptor) => descriptor.key === filter.field);
  const filterType = (filter) => filterDescriptor(filter)?.type || 'text';
  const filterOperators = (filter) => {
    const type = filterType(filter);
    if (type === 'date' || type === 'time') return [['equals', type === 'time' ? 'At time' : 'On date'], ['notEquals', type === 'time' ? 'Not at time' : 'Not on date'], ['before', type === 'time' ? 'Before time' : 'Before date'], ['after', type === 'time' ? 'After time' : 'After date'], ['empty', 'Is empty'], ['notEmpty', 'Is not empty']];
    if (type === 'number') return [['equals', 'Equals'], ['notEquals', 'Not equals'], ['greater', 'Greater than'], ['less', 'Less than'], ['greaterOrEqual', 'At least'], ['lessOrEqual', 'At most'], ['empty', 'Is empty'], ['notEmpty', 'Is not empty']];
    if (type === 'select' || type === 'checkbox') return [['equals', 'Equals'], ['notEquals', 'Not equals'], ['empty', 'Is empty'], ['notEmpty', 'Is not empty']];
    if (type === 'multi_select') return [['has', 'Has choice'], ['notHas', 'Does not have'], ['empty', 'Is empty'], ['notEmpty', 'Is not empty']];
    if (type === 'file') return [['empty', 'Is empty'], ['notEmpty', 'Is not empty']];
    return [['contains', 'Contains'], ['equals', 'Equals'], ['notEquals', 'Not equals'], ['startsWith', 'Starts with'], ['endsWith', 'Ends with'], ['empty', 'Is empty'], ['notEmpty', 'Is not empty']];
  };
  const filterValue = (row, descriptor) => {
    if (descriptor.key === 'appointmentCode') return row.appointmentCode || '';
    if (descriptor.key === 'createdByName') return row.createdByName || '';
    if (descriptor.key === 'entryDate') return row.entryAt ? new Date(row.entryAt).toISOString().slice(0, 10) : '';
    if (descriptor.key === 'entryTime') return row.entryAt ? `${String(new Date(row.entryAt).getHours()).padStart(2, '0')}:${String(new Date(row.entryAt).getMinutes()).padStart(2, '0')}` : '';
    if (descriptor.key === 'lastUpdatedAt') return row.updatedAt || row.lastEditedAt ? new Date(row.updatedAt || row.lastEditedAt).toISOString().slice(0, 10) : '';
    if (descriptor.key === 'appointmentDate') return row.appointmentDate || '';
    if (descriptor.key === 'status') return row.status || 'active';
    if (descriptor.key === 'acceptance') return row.acceptedAt ? 'accepted' : 'pending';
    if (descriptor.key === 'notComingReason') return row.notComingReason || '';
    if (descriptor.key === 'salesNumberOfCalls') return row.salesNumberOfCalls || 0;
    if (descriptor.key === 'salesCallStatus') return row.salesCallStatus || 'pending';
    if (descriptor.key === 'lastCallAt') return row.lastCallAt ? new Date(row.lastCallAt).toISOString().slice(0, 10) : '';
    if (descriptor.key === 'numberOfCalls') return row.numberOfCalls || 0;
    if (descriptor.key === 'callStatus') return row.callStatus || 'pending';
    if (descriptor.key === 'lastCallNotes') return row.lastCallNotes || '';
    const raw = row.values?.[descriptor.column.id] || '';
    return descriptor.type === 'checkbox' ? (raw === 'true' || raw.includes(String.fromCharCode(9745)) || raw === 'â˜‘' ? 'true' : 'false') : raw;
  };
  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    const searchedRows = rows.filter((row) => !query || [row.appointmentCode, row.appointmentDate, row.createdByName, row.status, row.notComingReason, ...columns.filter((column) => column.type !== 'file').map((column) => row.values[column.id])].some((value) => String(value || '').toLowerCase().includes(query)));
    const activeFilters = filters.filter((filter) => filter.field && (['empty', 'notEmpty'].includes(filter.operator) || String(filter.value ?? '').trim() !== ''));
    if (!activeFilters.length) return searchedRows;
    return searchedRows.filter((row) => activeFilters.every((filter) => {
      const descriptor = filterDescriptor(filter);
      if (!descriptor) return true;
      const value = String(filterValue(row, descriptor)).trim().toLowerCase();
      const query = String(filter.value || '').trim().toLowerCase();
      if (filter.operator === 'empty') return !value;
      if (filter.operator === 'notEmpty') return Boolean(value);
      if (filter.operator === 'has' || filter.operator === 'notHas') {
        const has = splitChoices(value).some((choice) => choice.toLowerCase() === query);
        return filter.operator === 'has' ? has : !has;
      }
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
  }, [filters, filterDescriptors, rows, search, columns]);
  const updateFilter = (id, changes) => setFilters((current) => current.map((filter) => filter.id === id ? { ...filter, ...changes } : filter));
  const addFilter = () => setFilters((current) => [...current, { id: Date.now(), field: '', operator: 'contains', value: '' }]);
  const removeFilter = (id) => setFilters((current) => current.length === 1 ? [{ id: Date.now(), field: '', operator: 'contains', value: '' }] : current.filter((filter) => filter.id !== id));

  return (
    <div className="min-h-screen bg-cream text-charcoal">
      <header className="flex min-h-16 sm:h-16 flex-wrap sm:flex-nowrap items-center justify-between gap-2 sm:gap-3 bg-teal-950 px-3 py-2 sm:py-0 text-offwhite-100 sm:px-7">
        <div className="flex min-w-0 items-center gap-2.5"><BrandLogo size="sm" className="max-sm:!h-7 max-sm:!w-7" /><span className="font-display text-[11px] sm:text-sm font-bold leading-4">Manovaidya<span className="block sm:inline"> Operation System</span></span></div>
        <div className="flex items-center gap-2">
          {canReturnToDashboard && <Link to="/admin"><Button variant="ghost" size="sm" className="text-offwhite-100 hover:bg-teal-800"><ArrowLeft size={15} /> Dashboard</Button></Link>}
          {canReturnToAppointmentManagement && <Link to="/admin/appointment-management"><Button variant="ghost" size="sm" className="text-offwhite-100 hover:bg-teal-800"><ArrowLeft size={15} /> Appointment Management</Button></Link>}
          <Button variant="ghost" size="sm" onClick={logout} className="text-offwhite-100 hover:bg-teal-800"><LogOut size={15} /><span className="hidden sm:inline">Log out</span></Button>
        </div>
      </header>

      <section className="border-b border-tan-300 bg-offwhite-100 px-3 py-3 sm:px-6">
        <div className="mx-auto flex max-w-[1800px] items-center gap-2 overflow-x-auto">
          <button onClick={() => setSelectedDate(shiftDate(selectedDate, -7))} className="shrink-0 p-2 text-sage" title="Previous week"><ChevronLeft size={20} /></button>
          {dates.map((date) => <button key={date} onClick={() => { setSelectedDate(date); setAllDates(false); }} className={`min-w-[108px] shrink-0 border-b-2 px-3 py-2 text-center text-xs font-semibold ${date === selectedDate ? 'border-sage bg-sage/10 text-teal-950' : 'border-transparent text-charcoal/60 hover:bg-tan-100'}`}>{dateLabel(date)}</button>)}
          <button onClick={() => setSelectedDate(shiftDate(selectedDate, 7))} className="shrink-0 p-2 text-sage" title="Next week"><ChevronRight size={20} /></button>
          <input type="date" value={selectedDate} onChange={(event) => { setSelectedDate(event.target.value); setAllDates(false); }} className="shrink-0 rounded border border-tan-300 bg-cream px-2 py-2 text-xs" aria-label="Select appointment date" />
        </div>
      </section>

      <main className="app-content mx-auto min-w-0 max-w-[1800px] p-3 sm:p-6">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div><p className="text-xs font-semibold uppercase text-charcoal/50">Sales Team</p><h1 className="font-display text-2xl font-bold">Sales Appointments</h1><p className="mt-1 text-sm text-charcoal/60"><CalendarDays className="mr-1 inline" size={15} />{allDates ? 'All dates' : dateLabel(selectedDate)} · {rows.filter((row) => row.status === 'active').length} appointments <span className={`ml-2 inline-flex items-center gap-1 text-xs ${liveConnected ? 'text-sage' : 'text-charcoal/40'}`}><span className={`h-1.5 w-1.5 rounded-full ${liveConnected ? 'bg-sage' : 'bg-charcoal/30'}`} />{liveConnected ? 'Live' : 'Connecting'}</span></p></div>
          <div className="flex gap-2">{isAdmin && <Button variant="outline" onClick={() => setSettingsOpen(true)}><Columns3 size={16} /> Fields</Button>}<Button onClick={startAdd} disabled={!columns.length || Boolean(draft)}><Plus size={16} /> Add appointment</Button></div>
        </div>
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <div className="relative min-w-[200px] flex-1"><Search size={17} className="pointer-events-none absolute left-3 top-3 text-sage" /><input aria-label="Search sales appointments" placeholder="Search patient, phone, appointment ID or details" value={search} onChange={(event) => setSearch(event.target.value)} className="w-full rounded-lg border border-cardline bg-white py-2.5 !pl-10 pr-3 text-sm outline-none focus:ring-2 focus:ring-sage/25" /></div>
          <label className="flex items-center gap-2 rounded-md border border-cardline px-3 py-2 text-sm"><input type="checkbox" checked={allDates} onChange={(event) => setAllDates(event.target.checked)} className="accent-sage" />All dates</label>
          <span className="text-xs text-charcoal/70">{filteredRows.length} of {rows.length} appointments</span>
        </div>
        <div className="mb-4 space-y-2 border-y border-cardline py-3">
          <p className="text-xs font-semibold uppercase text-charcoal/65">Filter appointments</p>
          {filters.map((filter, index) => <div key={filter.id} className="grid min-w-0 gap-2 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.2fr)_160px_minmax(0,1fr)_auto] [&>input]:min-w-0 [&>select]:min-w-0">
            <select aria-label={`Filter ${index + 1} field`} value={filter.field} onChange={(event) => { const field = event.target.value; updateFilter(filter.id, { field, operator: filterOperators({ field })[0][0], value: '' }); }} className="rounded border border-cardline bg-white px-3 py-2 text-sm"><option value="">Select field</option>{filterDescriptors.map((descriptor) => <option key={descriptor.key} value={descriptor.key}>{descriptor.label}</option>)}</select>
            <select aria-label={`Filter ${index + 1} condition`} value={filter.operator} onChange={(event) => updateFilter(filter.id, { operator: event.target.value, value: '' })} className="rounded border border-cardline bg-white px-3 py-2 text-sm">{filterOperators(filter).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
            {['select', 'multi_select'].includes(filterType(filter)) ? <select aria-label={`Filter ${index + 1} value`} value={filter.value} onChange={(event) => updateFilter(filter.id, { value: event.target.value })} disabled={['empty', 'notEmpty'].includes(filter.operator)} className="rounded border border-cardline bg-white px-3 py-2 text-sm disabled:opacity-40"><option value="">Select value</option>{(filterDescriptor(filter)?.column?.options || []).map((option) => <option key={option} value={option}>{option.replaceAll('_', ' ')}</option>)}</select> : filterType(filter) === 'checkbox' ? <select aria-label={`Filter ${index + 1} value`} value={filter.value} onChange={(event) => updateFilter(filter.id, { value: event.target.value })} disabled={['empty', 'notEmpty'].includes(filter.operator)} className="rounded border border-cardline bg-white px-3 py-2 text-sm disabled:opacity-40"><option value="">Select value</option><option value="true">Checked</option><option value="false">Unchecked</option></select> : <input aria-label={`Filter ${index + 1} value`} type={filterType(filter) === 'date' ? 'date' : filterType(filter) === 'time' ? 'time' : filterType(filter) === 'number' ? 'number' : 'text'} disabled={['empty', 'notEmpty'].includes(filter.operator) || filterType(filter) === 'file'} value={filter.value} onChange={(event) => updateFilter(filter.id, { value: event.target.value })} placeholder={['date', 'time'].includes(filterType(filter)) ? '' : 'Enter value'} className="rounded border border-cardline bg-white px-3 py-2 text-sm disabled:opacity-40" />}
            <div className="flex items-center gap-2"><Button size="sm" variant="outline" onClick={addFilter}><Plus size={14} />Add filter</Button>{(index > 0 || filters.length > 1) && <button type="button" title="Remove filter" aria-label={`Remove filter ${index + 1}`} onClick={() => removeFilter(filter.id)} className="rounded p-2 text-charcoal/70 hover:text-red-700"><X size={16} /></button>}</div>
          </div>)}
          <button type="button" onClick={() => setFilters([{ id: Date.now(), field: '', operator: 'contains', value: '' }])} className="text-xs font-semibold text-sage underline">Clear filters</button>
        </div>
        <div className="overflow-x-auto rounded-lg border border-cardline bg-offwhite-100">
          <table className={`w-full table-fixed text-left text-sm ${canManageReception ? 'min-w-[2085px]' : 'min-w-[1855px]'}`}><colgroup>{[240, 190, 150, 290, 220, 230, ...(canManageReception ? [230] : []), 300, 235].map((width, index) => <col key={index} style={{ width }} />)}</colgroup><thead className="bg-[#56695D] text-white"><tr>{['Appointment', 'Patient', 'Booked for', 'Entry / updated', 'Consultation', 'Sales calls', ...(canManageReception ? ['Reception calls'] : []), 'Status', 'Actions'].map((label) => <th key={label} className="whitespace-nowrap px-4 py-3 text-xs font-semibold">{label}</th>)}</tr></thead><tbody className="divide-y divide-cardline">
            {loading ? <tr><td colSpan={canManageReception ? 9 : 8} className="p-8 text-center">Loading appointments...</td></tr> : filteredRows.map((row) => {
              const nameColumn = columns.find((column) => /^(patient name|name)$/i.test(column.label.trim()));
              const phoneColumn = columns.find((column) => /^(primary mobile|phone|mobile|phone number|mobile number)$/i.test(column.label.trim()));
              const owned = isAdmin || canManageReception || String(row.createdBy) === String(user?.id || user?._id);
              const rowTone = row.status === 'rescheduled' ? 'bg-[#E3EDF4]' : row.status === 'not_coming' ? 'bg-[#F7DFDC]' : row.acceptedAt ? 'bg-[#DDEEE3]' : 'bg-offwhite-100';
              const edgeTone = row.status === 'rescheduled' ? 'border-sky-600' : row.status === 'not_coming' ? 'border-rose-600' : row.acceptedAt ? 'border-emerald-600' : 'border-transparent';
              const badgeTone = row.status === 'rescheduled' ? 'bg-[#BED6E5] text-sky-950' : row.status === 'not_coming' ? 'bg-[#EAB6B0] text-rose-950' : row.acceptedAt ? 'bg-[#A9D7B9] text-emerald-950' : 'bg-sage/10 text-charcoal';
              return <tr key={row.id} className={rowTone}>
                <td className={`border-l-4 px-4 py-3 ${edgeTone}`}><p className="whitespace-nowrap font-semibold">{row.appointmentCode}</p><p className="mt-1 truncate text-xs text-charcoal/70" title={row.createdByName || ''}>Added by {row.createdByName || '-'}</p></td>
                <td className="px-4 py-3"><p className="truncate font-semibold" title={nameColumn ? row.values[nameColumn.id] || '' : ''}>{nameColumn ? row.values[nameColumn.id] || '-' : '-'}</p><p className="mt-1 truncate text-xs text-charcoal/70">{phoneColumn ? row.values[phoneColumn.id] || '' : ''}</p></td>
                <td className="whitespace-nowrap px-4 py-3 text-xs">{bookedDate(row.appointmentDate)}</td>
                <td className="whitespace-nowrap px-4 py-3 text-xs"><p><span className="text-charcoal/65">Entered</span> {entryDate(row.entryAt)}, {entryTime(row.entryAt)}</p><p className="mt-1"><span className="text-charcoal/65">Updated</span> {timelineStamp(row.updatedAt || row.lastEditedAt)}</p></td>
                <td className="min-w-[170px] px-4 py-3 text-xs"><p className="font-semibold">Fee: {row.consultationFee == null ? 'Not set' : money(row.consultationFee)}</p>{row.consultationFee == null && row.canEdit && <button className="mt-1 font-semibold text-sage underline" onClick={() => setFormRow({ ...row, initialTab: 'payments' })}>Set consultation fee</button>}<p className="mt-1">Received: {money(row.consultationPayments?.received)}</p><p className="mt-1">Verified: {money(row.consultationPayments?.verified)}</p><p className={`mt-1 font-semibold ${row.consultationPayments?.pending ? 'text-amber-800' : row.consultationPayments?.receiptCount ? 'text-emerald-800' : 'text-charcoal/70'}`}>{row.consultationPayments?.pending ? `${row.consultationPayments.receiptCount - row.consultationPayments.verifiedCount} awaiting verification` : row.consultationPayments?.receiptCount ? 'All receipts verified' : 'No payment recorded'}</p></td>
                <td className="min-w-[155px] max-w-[210px] px-4 py-3 text-xs"><button className="inline-flex items-center gap-1 font-semibold text-sage" onClick={() => setFormRow({ ...row, initialTab: 'sales-confirmation' })}><PhoneCall size={14} />{row.salesNumberOfCalls || 0} calls</button><p className="mt-1 capitalize text-charcoal/70">{(row.salesCallStatus || 'pending').replaceAll('_', ' ')}</p>{row.salesLastCallAt && <p className="mt-1 text-charcoal/70">{timelineStamp(row.salesLastCallAt)}</p>}{row.salesLastCallNotes && <p className="mt-1 truncate text-charcoal/80" title={row.salesLastCallNotes}>{row.salesLastCallNotes}</p>}</td>
                {canManageReception && <td className="min-w-[155px] max-w-[210px] px-4 py-3 text-xs"><button onClick={() => setCallRow(row)} className="inline-flex items-center gap-1 font-semibold text-sage" title="View reception call history"><PhoneCall size={14} />{row.numberOfCalls || 0} calls</button><p className="mt-1 capitalize text-charcoal/70">{(row.callStatus || 'pending').replaceAll('_', ' ')}</p>{row.lastCallAt && <p className="mt-1 text-charcoal/70">{timelineStamp(row.lastCallAt)}</p>}{row.lastCallNotes && <p className="mt-1 truncate text-charcoal/80" title={row.lastCallNotes}>{row.lastCallNotes}</p>}</td>}
                <td className="px-4 py-3"><span className={`inline-block whitespace-nowrap rounded px-2 py-1 text-xs font-semibold ${badgeTone}`}>{row.status === 'rescheduled' ? 'Rescheduled' : row.status === 'not_coming' ? 'Not coming' : row.acceptedAt ? 'Accepted' : 'Pending acceptance'}</span>{row.rescheduledTo && <p className="mt-2 whitespace-nowrap text-xs">To {bookedDate(row.rescheduledTo)}</p>}{row.rescheduledByName && <p className="mt-1 truncate text-xs" title={row.rescheduledByName}>By {row.rescheduledByName}</p>}{row.status === 'not_coming' && <><p className="mt-2 truncate text-xs" title={row.notComingByName || ''}>Marked by {row.notComingByName || '-'}</p>{row.notComingAt && <p className="mt-1 whitespace-nowrap text-xs">{timelineStamp(row.notComingAt)}</p>}</>}{row.notComingReason && <p className="mt-1 truncate text-xs" title={row.notComingReason}>{row.notComingReason}</p>}{row.acceptedAt && <><p className="mt-2 truncate text-xs" title={row.acceptedByName || ''}>Accepted by {row.acceptedByName || '-'}</p><p className="mt-1 whitespace-nowrap text-xs">{timelineStamp(row.acceptedAt)}</p></>}</td>
                <td className="px-4 py-3"><div className="flex flex-wrap items-center gap-1">
                  {owned && <Button size="sm" variant="outline" className="max-sm:!whitespace-nowrap" onClick={() => setFormRow(row)}>Open appointment</Button>}
                  {canManageReception && row.status === 'active' && !row.acceptedAt && <Button size="sm" onClick={() => acceptRow(row)}><Check size={14} />Accept</Button>}
                  {row.canReschedule && <button title="Reschedule" className="p-2 text-amber-800" onClick={() => { setRescheduleRow(row); setRescheduleDate(''); }}><CalendarRange size={16} /></button>}
                  {row.canMarkNotComing && (row.status === 'not_coming' ? <button title="Reopen lead" disabled={busyRowId === row.id} onClick={() => clearNotComing(row)} className="p-2 text-sage"><RotateCcw size={16} /></button> : <button title="Mark not coming" onClick={() => { setNotComingRow(row); setNotComingReason(''); }} className="p-2 text-amber-800"><CalendarX2 size={16} /></button>)}
                  {row.canDelete && user?.role !== ROLES.SALES_TEAM && <button title="Delete" onClick={() => removeRow(row)} className="p-2 text-red-700"><Trash2 size={16} /></button>}
                  {isAdmin && <button title="View row timeline" onClick={() => openTimeline(row)} className="p-2 text-sage"><History size={16} /></button>}
                </div></td>
              </tr>;
            })}
            {!loading && !filteredRows.length && <tr><td colSpan={canManageReception ? 9 : 8} className="p-8 text-center">{rows.length ? 'No appointments match this filter.' : 'No appointments for this date.'}</td></tr>}
          </tbody></table>
        </div>
      {formRow && <AppointmentForm key={formRow.id || 'new'} onCreated={() => { setFormRow(null); loadRows().catch(() => {}); }} sheet="sales" row={formRow} onClose={() => { setFormRow(null); loadRows().catch(() => {}); }} onChanged={() => loadRows().catch(() => {})} />}
      <Modal open={Boolean(rescheduleRow)} onClose={() => { setRescheduleRow(null); setRescheduleDate(''); }} title="Reschedule appointment">
        <div className="space-y-4">
          <div><p className="text-sm font-semibold text-charcoal">{rescheduleRow?.appointmentCode}</p><p className="mt-1 text-xs text-charcoal/55">All appointment details will be copied to the new date.</p></div>
          <label className="block"><span className="mb-1.5 block text-sm font-semibold">New appointment date</span><input type="date" value={rescheduleDate} onChange={(event) => setRescheduleDate(event.target.value)} className="w-full rounded-lg border border-cardline bg-cream px-3 py-2.5 text-sm outline-none focus:border-sage" /></label>
          <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => { setRescheduleRow(null); setRescheduleDate(''); }}>Cancel</Button><Button disabled={!rescheduleDate} onClick={reschedule}><CalendarRange size={16} /> Reschedule</Button></div>
        </div>
      </Modal>

      <Modal open={Boolean(notComingRow)} onClose={() => { setNotComingRow(null); setNotComingReason(''); }} title="Mark not coming">
        <div className="space-y-4">
          <p className="text-sm font-semibold">{notComingRow?.appointmentCode}</p>
          <label className="block text-sm font-semibold">Reason *
            <textarea value={notComingReason} onChange={(event) => setNotComingReason(event.target.value)} maxLength={2000} rows={3} placeholder="Why is the lead not coming?" className="mt-1.5 w-full rounded-lg border border-cardline bg-cream px-3 py-2.5 text-sm outline-none focus:border-sage" />
          </label>
          <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setNotComingRow(null)}>Cancel</Button><Button disabled={!notComingReason.trim() || busyRowId === notComingRow?.id} onClick={markNotComing}>Save reason</Button></div>
        </div>
      </Modal>

      {canManageReception && callRow && <SalesCallHistory key={callRow.id} row={callRow} onClose={() => setCallRow(null)} onSaved={callSaved} />}
      <Modal open={settingsOpen} onClose={() => setSettingsOpen(false)} title="Sales form fields" className="max-w-4xl">
        <form onSubmit={addColumn} className="grid gap-3 border-b border-tan-300 pb-5 sm:grid-cols-[1fr_150px_1fr_auto]">
          <input value={newColumn.label} onChange={(e) => setNewColumn({ ...newColumn, label: e.target.value })} placeholder="Column name" className="rounded border border-tan-300 bg-cream px-3 py-2 text-sm" required />
          <select value={newColumn.type} onChange={(e) => setNewColumn({ ...newColumn, type: e.target.value })} className="rounded border border-tan-300 bg-cream px-3 py-2 text-sm"><option value="text">Text</option><option value="phone">Phone</option><option value="number">Number</option><option value="date">Date</option><option value="time">Time</option><option value="select">Dropdown</option><option value="multi_select">Multiple choice</option><option value="textarea">Long text</option><option value="checkbox">Checkbox</option><option value="file">Attachment</option></select>
          <input value={newColumn.options} onChange={(e) => setNewColumn({ ...newColumn, options: e.target.value })} placeholder={['select', 'multi_select'].includes(newColumn.type) ? 'Options, separated by commas' : 'Options only for dropdown'} disabled={!['select', 'multi_select'].includes(newColumn.type)} className="rounded border border-tan-300 bg-cream px-3 py-2 text-sm disabled:opacity-40" />
          <Button type="submit"><Plus size={16} /> Add</Button>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={newColumn.required} onChange={(e) => setNewColumn({ ...newColumn, required: e.target.checked })} /> Required field</label>
          <label className="flex items-center gap-2 text-sm"><span>Section</span><select value={newColumn.section} onChange={(e) => setNewColumn({ ...newColumn, section: e.target.value })} className="min-w-0 flex-1 rounded border border-tan-300 bg-cream px-2 py-2 text-sm"><option value="details">Sales details</option><option value="confirmation">Sales confirmation calls</option><option value="payments">Consultation payments</option></select></label>
        </form>
        <div className="divide-y divide-tan-300">{columns.map((column, index) => <div key={column.id} className="flex items-center gap-2 py-3"><div className="flex min-w-0 flex-1 items-center gap-3"><span className="w-5 text-xs text-charcoal/40">{index + 1}</span><div><p className="font-semibold">{column.label}{column.required && ' *'}</p><p className="text-xs text-charcoal/50">{column.type}{column.options.length ? ` · ${column.options.join(', ')}` : ''}</p></div></div><div className="flex"><button disabled={!index} onClick={() => moveColumn(column, -1)} className="p-1 text-sage disabled:opacity-25" title="Move up"><ChevronUp size={16} /></button><button disabled={index === columns.length - 1} onClick={() => moveColumn(column, 1)} className="p-1 text-sage disabled:opacity-25" title="Move down"><ChevronDown size={16} /></button></div><button onClick={() => editColumn(column)} className="p-2 text-sage" title="Edit column"><Pencil size={16} /></button><button onClick={() => removeColumn(column)} className="p-2 text-red-700" title="Remove"><Trash2 size={16} /></button></div>)}{!columns.length && <p className="py-8 text-center text-sm text-charcoal/50">No columns configured.</p>}</div>
      </Modal>
      {columnToEdit && <SheetColumnEditor key={columnToEdit.id} column={columnToEdit} endpoint="/sales-sheet/columns" onClose={() => { setColumnToEdit(null); setSettingsOpen(true); }} onSaved={loadColumns} />}
      <Drawer open={Boolean(timelineRow)} onClose={() => setTimelineRow(null)} title={`Row timeline${timelineRow?.appointmentCode ? ` · ${timelineRow.appointmentCode}` : ''}`}>
        {timelineLoading ? <p className="text-sm text-charcoal/55">Loading timeline...</p> : !timeline.length ? <p className="text-sm text-charcoal/55">No history recorded for this row.</p> : <div className="relative space-y-4 border-l border-sage/40 pl-4">{timeline.map((item) => <div key={item.id} className="relative"><span className="absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full bg-sage" /><p className="text-sm font-semibold text-charcoal">{item.action}</p>{item.details && <p className="mt-1 text-xs text-charcoal/60">{item.details}</p>}<p className="mt-1 text-[11px] text-charcoal/45">{item.changedByName} · {timelineStamp(item.createdAt)}</p></div>)}</div>}
      </Drawer>
      </main>
    </div>
  );
};

export default SalesWorkspace;
