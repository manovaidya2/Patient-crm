import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, CalendarDays, Columns3, History, Pencil, Plus, Save, Trash2, X } from 'lucide-react';
import { io } from 'socket.io-client';
import api from '../../api/axios.js';
import Button from '../../components/ui/Button.jsx';
import Modal from '../../components/ui/Modal.jsx';
import SheetColumnEditor from '../../components/SheetColumnEditor.jsx';
import Drawer from '../../components/ui/Drawer.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { ROLES } from '../../constants/roles.js';

const localIsoDate = (date = new Date()) => new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const displayDate = (value) => value ? new Date(value).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '-';
const displayTime = (value) => value ? new Date(value).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '-';
const displayDateTime = (value) => value ? `${displayDate(value)}, ${displayTime(value)}` : '-';
const timelineStamp = (value) => value ? new Date(value).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-';
const socketUrl = (import.meta.env.VITE_API_URL || 'http://localhost:5000/api').replace(/\/api\/?$/, '');
const serverBase = socketUrl;
const attachmentHref = (value) => String(value || '').startsWith('/') ? `${serverBase}${value}` : value;
const emptyValues = (columns) => Object.fromEntries(columns.map((column) => [column.id, '']));
const displayCell = (column, value) => column.type === 'checkbox' ? <span className={`inline-flex h-4 w-4 items-center justify-center border ${value === 'true' ? 'border-sage bg-sage text-white' : 'border-charcoal/40 bg-transparent'}`}>{value === 'true' ? '✓' : ''}</span> : (value || '-');

const CellInput = ({ column, value, onChange }) => {
  const props = { value: value || '', onChange: (event) => onChange(event.target.value), className: 'w-full min-w-[130px] border-0 bg-transparent px-3 py-2.5 text-sm outline-none' };
  if (column.type === 'checkbox') return <input type="checkbox" checked={value === 'true' || value === '☑'} onChange={(event) => onChange(String(event.target.checked))} className="ml-3 h-4 w-4 accent-sage" />;
  if (column.type === 'file') return <div className="px-3 py-2"><input type="file" onChange={async (event) => { const file = event.target.files?.[0]; if (!file) return; const form = new FormData(); form.append('file', file); try { const { data } = await api.post('/sales-sheet/upload', form); onChange(data.file.url); } catch { window.alert('File could not be uploaded'); } }} className="max-w-[180px] text-xs" />{value && <a href={attachmentHref(value)} target="_blank" rel="noreferrer" className="mt-1 block text-xs text-sage">View attachment</a>}</div>;
  if (column.type === 'select') return <select {...props}><option value="">Select</option>{column.options.map((item) => <option key={item}>{item}</option>)}</select>;
  if (column.type === 'textarea') return <textarea {...props} rows={2} />;
  return <input {...props} type={column.type === 'phone' ? 'tel' : column.type} />;
};

const ReceptionistDashboard = () => {
  const { user } = useAuth();
  const isAdmin = user?.role === ROLES.ADMIN;
  const isSalesTeam = user?.role === ROLES.SALES_TEAM;
  const [selectedDate, setSelectedDate] = useState(localIsoDate());
  const [allDates, setAllDates] = useState(false);
  const [filters, setFilters] = useState([{ id: 1, field: '', operator: 'contains', value: '' }]);
  const [salesColumns, setSalesColumns] = useState([]);
  const [columns, setColumns] = useState([]);
  const [rows, setRows] = useState([]);
  const [draft, setDraft] = useState(null);
  const [salesDraft, setSalesDraft] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [live, setLive] = useState(false);
  const [error, setError] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [columnToEdit, setColumnToEdit] = useState(null);
  const [arrangeOpen, setArrangeOpen] = useState(false);
  const [columnOrder, setColumnOrder] = useState([]);
  const [newColumn, setNewColumn] = useState({ label: '', type: 'text', required: false, options: '', highlightValue: '' });
  const [timelineRow, setTimelineRow] = useState(null);
  const [timeline, setTimeline] = useState([]);
  const [timelineLoading, setTimelineLoading] = useState(false);

  const loadColumns = useCallback(async () => {
    const [sales, management] = await Promise.all([api.get('/sales-sheet/columns', { skipCache: true }), api.get('/sales-sheet/management-columns', { skipCache: true })]);
    setSalesColumns(sales.data.columns); setColumns(management.data.columns);
  }, []);
  const loadLayout = useCallback(async () => {
    const { data } = await api.get('/sales-sheet/layout', { params: { sheet: 'management' }, skipCache: true });
    setColumnOrder((data.columns || []).sort((a, b) => a.order - b.order).map((item) => item.key));
  }, []);
  const loadRows = useCallback(async () => {
    const { data } = await api.get('/sales-sheet/management', { params: allDates ? {} : { date: selectedDate }, skipCache: true });
    setRows(data.appointments.map((row) => ({ ...row, salesValues: Object.fromEntries(salesColumns.map((column) => [column.id, column.type === 'checkbox' ? (row.salesValues?.[column.id] === 'true' ? '☑' : '☐') : (row.salesValues?.[column.id] || '')])), values: Object.fromEntries(columns.map((column) => [column.id, column.type === 'checkbox' ? (row.values?.[column.id] === 'true' ? '☑' : '☐') : (row.values?.[column.id] || '')])) })));
  }, [selectedDate, allDates, salesColumns, columns]);

  useEffect(() => { loadColumns().catch(() => setError('Columns could not be loaded')); }, [loadColumns]);
  useEffect(() => { loadLayout().catch(() => {}); }, [loadLayout]);
  useEffect(() => { setLoading(true); setDraft(null); setEditingId(null); loadRows().catch(() => setError('Appointments could not be loaded')).finally(() => setLoading(false)); }, [loadRows]);
  useEffect(() => {
    const socket = io(socketUrl, { auth: { token: localStorage.getItem('crm_token') }, transports: ['websocket', 'polling'] });
    socket.on('connect', () => { setLive(true); socket.emit('sales-sheet:watch-date', selectedDate); });
    socket.on('disconnect', () => setLive(false));
    socket.on('sales-sheet:date-changed', ({ date }) => { if (date === selectedDate) loadRows().catch(() => {}); });
    socket.on('sales-sheet:columns-changed', () => { loadColumns().catch(() => {}); loadRows().catch(() => {}); });
    return () => socket.disconnect();
  }, [selectedDate, loadColumns, loadRows]);

  const saveRow = async () => {
    try {
      setError('');
      if (editingId) await api.patch(`/sales-sheet/management/${editingId}`, { values: draft, salesValues: salesDraft });
      else await api.post('/sales-sheet/management', { appointmentDate: selectedDate, values: draft, salesValues: salesDraft });
      setDraft(null); setSalesDraft(null); setEditingId(null); await loadRows();
    } catch (err) { setError(err.response?.data?.message || 'Appointment could not be saved'); }
  };
  const deleteRow = async (row) => {
    if (!window.confirm('Remove this row from Appointment Management?')) return;
    await api.delete(`/sales-sheet/management/${row.id}`); await loadRows();
  };
  const addColumn = async (event) => {
    event.preventDefault();
    try {
      await api.post('/sales-sheet/management-columns', { ...newColumn, options: newColumn.options.split(',') });
      setNewColumn({ label: '', type: 'text', required: false, options: '', highlightValue: '' }); await loadColumns();
    } catch (err) { setError(err.response?.data?.message || 'Column could not be added'); }
  };
  const editColumn = (column) => { setSettingsOpen(false); setColumnToEdit(column); };
  const deleteColumn = async (column) => {
    if (!window.confirm(`Remove ${column.label} column?`)) return;
    await api.delete(`/sales-sheet/management-columns/${column.id}`); await loadColumns();
  };
  const descriptors = useMemo(() => [
    { key: 'index', label: '#', fixed: true },
    { key: 'appointmentCode', label: 'Appointment ID', fixed: true },
    { key: 'entryDate', label: 'Entry Date', fixed: true },
    { key: 'entryTime', label: 'Entry Time', fixed: true },
    { key: 'acceptedAt', label: 'Accepted Date/Time', fixed: true },
    { key: 'lastUpdatedAt', label: 'Last Updated Date/Time', fixed: true },
    ...salesColumns.map((column) => ({ key: `sales:${column.id}`, label: column.label, column, source: 'sales' })),
    ...columns.map((column) => ({ key: `custom:${column.id}`, label: column.label, column, source: 'custom' })),
    { key: 'addedBy', label: 'Added By', fixed: true },
    ...(!isSalesTeam ? [{ key: 'actions', label: 'Actions', fixed: true }] : []),
    ...(isAdmin ? [{ key: 'timeline', label: 'Timeline', fixed: true }] : []),
  ], [salesColumns, columns, isSalesTeam, isAdmin]);
  const filterDescriptors = useMemo(() => [{ key: 'appointmentDate', label: 'Appointment Date', fixed: true }, ...descriptors.filter((descriptor) => !['index', 'actions', 'timeline'].includes(descriptor.key))], [descriptors]);
  const dateFilterKeys = useMemo(() => new Set(filterDescriptors.filter((descriptor) => ['appointmentDate', 'entryDate', 'acceptedAt', 'lastUpdatedAt'].includes(descriptor.key) || descriptor.column?.type === 'date').map((descriptor) => descriptor.key)), [filterDescriptors]);
  const timeFilterKeys = useMemo(() => new Set(filterDescriptors.filter((descriptor) => descriptor.key === 'entryTime' || descriptor.column?.type === 'time').map((descriptor) => descriptor.key)), [filterDescriptors]);
  const filterDescriptor = (item) => filterDescriptors.find((descriptor) => descriptor.key === item.field);
  const filterType = (item) => filterDescriptor(item)?.column?.type || (dateFilterKeys.has(item.field) ? 'date' : timeFilterKeys.has(item.field) ? 'time' : 'text');
  const filterOperators = (item) => {
    const type = filterType(item);
    if (type === 'date' || type === 'time') return [['equals', type === 'time' ? 'At time' : 'On date'], ['notEquals', type === 'time' ? 'Not at time' : 'Not on date'], ['before', type === 'time' ? 'Before time' : 'Before date'], ['after', type === 'time' ? 'After time' : 'After date'], ['empty', 'Is empty'], ['notEmpty', 'Is not empty']];
    if (type === 'number') return [['equals', 'Equals'], ['notEquals', 'Not equals'], ['greater', 'Greater than'], ['less', 'Less than'], ['greaterOrEqual', 'At least'], ['lessOrEqual', 'At most'], ['empty', 'Is empty'], ['notEmpty', 'Is not empty']];
    if (type === 'select' || type === 'checkbox') return [['equals', 'Equals'], ['notEquals', 'Not equals'], ['empty', 'Is empty'], ['notEmpty', 'Is not empty']];
    if (type === 'file') return [['empty', 'Is empty'], ['notEmpty', 'Is not empty']];
    return [['contains', 'Contains'], ['equals', 'Equals'], ['notEquals', 'Not equals'], ['startsWith', 'Starts with'], ['endsWith', 'Ends with'], ['empty', 'Is empty'], ['notEmpty', 'Is not empty']];
  };
  const filterValue = (row, descriptor) => {
    if (descriptor.key === 'appointmentDate') return row.appointmentDate || '';
    if (descriptor.source) {
      const rawValue = row[descriptor.source === 'sales' ? 'salesValues' : 'values']?.[descriptor.column.id] || '';
      return descriptor.column.type === 'checkbox' ? (rawValue === 'true' || rawValue === 'â˜‘' || rawValue.includes(String.fromCharCode(9745)) ? 'true' : 'false') : rawValue;
    }
    if (descriptor.key === 'appointmentCode') return row.appointmentCode || '';
    if (descriptor.key === 'entryDate') return row.entryAt ? new Date(row.entryAt).toISOString().slice(0, 10) : '';
    if (descriptor.key === 'entryTime') return row.entryAt ? `${String(new Date(row.entryAt).getHours()).padStart(2, '0')}:${String(new Date(row.entryAt).getMinutes()).padStart(2, '0')}` : '';
    if (descriptor.key === 'acceptedAt') return row.acceptedAt ? new Date(row.acceptedAt).toISOString().slice(0, 10) : '';
    if (descriptor.key === 'lastUpdatedAt') return row.lastEditedAt ? new Date(row.lastEditedAt).toISOString().slice(0, 10) : '';
    if (descriptor.key === 'addedBy') return row.createdByName || '';
    return '';
  };
  const filteredRows = useMemo(() => {
    const activeFilters = filters.filter((item) => item.field);
    if (!activeFilters.length) return rows;
    return rows.filter((row) => activeFilters.every((filter) => {
      const descriptor = filterDescriptors.find((item) => item.key === filter.field);
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
      if (filter.operator === 'endsWith') return value.endsWith(query);
      if (filter.operator === 'startsWith') return value.startsWith(query);
      return value.includes(query);
    }));
  }, [filters, filterDescriptors, rows]);
  const updateFilter = (id, changes) => setFilters((current) => current.map((item) => item.id === id ? { ...item, ...changes } : item));
  const addFilter = () => setFilters((current) => [...current, { id: Date.now(), field: '', operator: 'contains', value: '' }]);
  const removeFilter = (id) => setFilters((current) => current.length === 1 ? [{ id: Date.now(), field: '', operator: 'contains', value: '' }] : current.filter((item) => item.id !== id));
  const orderedDescriptors = useMemo(() => {
    const arrangeable = descriptors.filter((descriptor) => descriptor.key !== 'timeline');
    const byKey = new Map(arrangeable.map((descriptor) => [descriptor.key, descriptor]));
    const saved = columnOrder.map((key) => byKey.get(key)).filter(Boolean);
    const savedKeys = new Set(saved.map((descriptor) => descriptor.key));
    return [...saved, ...arrangeable.filter((descriptor) => !savedKeys.has(descriptor.key)), ...(isAdmin ? descriptors.filter((descriptor) => descriptor.key === 'timeline') : [])];
  }, [columnOrder, descriptors, isAdmin]);
  const moveDescriptor = (index, direction) => {
    const next = [...orderedDescriptors];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    setColumnOrder(next.map((descriptor) => descriptor.key));
  };
  const saveLayout = async () => {
    await api.put('/sales-sheet/layout', { sheet: 'management', columns: orderedDescriptors.filter((descriptor) => descriptor.key !== 'timeline').map((descriptor) => ({ key: descriptor.key })) });
    setArrangeOpen(false);
  };
  const openTimeline = async (row) => {
    setTimelineRow(row); setTimeline([]); setTimelineLoading(true);
    try { const { data } = await api.get(`/sales-sheet/timeline/management/${row.id}`, { skipCache: true }); setTimeline(data.timeline || []); }
    catch (err) { setError(err.response?.data?.message || 'Timeline could not be loaded'); }
    finally { setTimelineLoading(false); }
  };
  const span = orderedDescriptors.length + (isAdmin ? 1 : 0);
  const checkboxDisplay = (values, definitions) => Object.fromEntries(definitions.map((column) => [column.id, column.type === 'checkbox' ? (values?.[column.id] === 'true' ? '☑' : '☐') : (values?.[column.id] || '')]));
  const displayRows = rows.map((row) => ({ ...row, salesValues: checkboxDisplay(row.salesValues, salesColumns), values: checkboxDisplay(row.values, columns) }));
  const rowIsHighlighted = (row) => columns.some((column) => column.highlightValue && String(row.values?.[column.id] || '').trim().toLowerCase() === String(column.highlightValue).trim().toLowerCase());
  return (
    <div className="mx-auto max-w-[1800px]">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3 border-b border-cardline pb-5">
        <div><p className="text-xs font-semibold uppercase text-charcoal/50">Receptionist Dashboard</p><h1 className="mt-1 font-display text-2xl font-bold text-charcoal">Appointment Management</h1><p className="mt-1 text-sm text-charcoal/55">{filteredRows.length}{filters.some((item) => item.field) ? ` of ${rows.length}` : ''} appointments <span className={`ml-2 text-xs ${live ? 'text-sage' : 'text-charcoal/40'}`}>{live ? 'Live' : 'Connecting'}</span></p></div>
        <div className="flex flex-wrap items-center gap-2">
          {!allDates && <label className="flex items-center gap-2 rounded-lg border border-cardline bg-offwhite-100 px-3 py-2"><CalendarDays size={16} className="text-sage" /><input type="date" value={selectedDate} onChange={(event) => setSelectedDate(event.target.value)} className="bg-transparent text-sm outline-none" aria-label="Appointment date" /></label>}
          <label className="flex items-center gap-2 rounded-lg border border-cardline bg-offwhite-100 px-3 py-2 text-sm"><input type="checkbox" checked={allDates} onChange={(event) => setAllDates(event.target.checked)} className="accent-sage" /> All dates</label>
          {isAdmin && <><Button variant="outline" onClick={() => setSettingsOpen(true)}><Columns3 size={16} /> Columns</Button><Button variant="outline" onClick={() => setArrangeOpen(true)}><Columns3 size={16} /> Arrange</Button></>}
          {!isSalesTeam && <Button disabled={Boolean(draft)} onClick={() => { setDraft(emptyValues(columns)); setSalesDraft(emptyValues(salesColumns)); setEditingId(null); }}><Plus size={16} /> Add appointment</Button>}
        </div>
      </div>
      {error && <div className="mb-3 border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      <div className="mb-4 space-y-2 rounded-lg border border-cardline bg-offwhite-100 p-3"><p className="text-xs font-semibold uppercase text-charcoal/55">Filter appointments (all conditions apply)</p>{filters.map((filter, index) => <div key={filter.id} className="grid gap-2 md:grid-cols-[1.2fr_160px_1fr_auto]"><select value={filter.field} onChange={(event) => { const nextField = event.target.value; updateFilter(filter.id, { field: nextField, operator: filterOperators({ field: nextField })[0][0], value: '' }); }} className="rounded border border-cardline bg-cream px-3 py-2 text-sm"><option value="">Filter by any column</option>{filterDescriptors.map((descriptor) => <option key={descriptor.key} value={descriptor.key}>{descriptor.label}</option>)}</select><select value={filter.operator} onChange={(event) => updateFilter(filter.id, { operator: event.target.value, value: '' })} className="rounded border border-cardline bg-cream px-3 py-2 text-sm">{filterOperators(filter).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>{filterType(filter) === 'select' ? <select value={filter.value} onChange={(event) => updateFilter(filter.id, { value: event.target.value })} disabled={['empty', 'notEmpty'].includes(filter.operator)} className="rounded border border-cardline bg-cream px-3 py-2 text-sm disabled:opacity-40"><option value="">Select value</option>{(filterDescriptor(filter)?.column?.options || []).map((option) => <option key={option} value={option}>{option}</option>)}</select> : filterType(filter) === 'checkbox' ? <select value={filter.value} onChange={(event) => updateFilter(filter.id, { value: event.target.value })} disabled={['empty', 'notEmpty'].includes(filter.operator)} className="rounded border border-cardline bg-cream px-3 py-2 text-sm disabled:opacity-40"><option value="">Select value</option><option value="true">Checked</option><option value="false">Unchecked</option></select> : <input type={filterType(filter) === 'date' ? 'date' : filterType(filter) === 'time' ? 'time' : filterType(filter) === 'number' ? 'number' : 'text'} disabled={['empty', 'notEmpty'].includes(filter.operator) || filterType(filter) === 'file'} value={filter.value} onChange={(event) => updateFilter(filter.id, { value: event.target.value })} placeholder={['date', 'time'].includes(filterType(filter)) ? '' : 'Enter value'} className="rounded border border-cardline bg-cream px-3 py-2 text-sm disabled:opacity-40" />}<div className="flex gap-1"><Button variant="outline" onClick={addFilter}>+ Add</Button>{(index > 0 || filters.length > 1) && <Button variant="outline" onClick={() => removeFilter(filter.id)}>Remove</Button>}</div></div>)}<Button variant="outline" onClick={() => setFilters([{ id: Date.now(), field: '', operator: 'contains', value: '' }])}>Clear all</Button></div>
      <div className="overflow-x-auto border border-cardline bg-offwhite-100">
        <table className="w-full min-w-max border-collapse text-left">
          <thead><tr className="bg-teal-950 text-xs uppercase text-offwhite-100">{orderedDescriptors.map((descriptor) => <th key={descriptor.key} className={`min-w-[145px] border-r border-teal-800 px-3 py-3 ${descriptor.key === 'timeline' ? 'text-sage' : ''}`}>{descriptor.label}{descriptor.column?.required && ' *'}</th>)}</tr></thead>
          <tbody>
            {draft && !editingId && <tr className="bg-sage/5">{orderedDescriptors.map((descriptor) => <td key={descriptor.key} className="border-r border-cardline p-0">{descriptor.key === 'timeline' ? null : descriptor.source === 'custom' ? <CellInput column={descriptor.column} value={draft[descriptor.column.id]} onChange={(value) => setDraft((current) => ({ ...current, [descriptor.column.id]: value }))} /> : descriptor.key === 'actions' ? <div className="flex justify-center"><button onClick={saveRow} className="p-2 text-sage" title="Save"><Save size={17} /></button><button onClick={() => setDraft(null)} className="p-2 text-charcoal/50" title="Cancel"><X size={17} /></button></div> : <span className="px-3 text-xs text-charcoal/40">{descriptor.key === 'addedBy' ? user?.name : 'Auto'}</span>}</td>)}</tr>}
            {!loading && filteredRows.map((row, index) => editingId === row.id ? <tr key={row.id} className="bg-sage/5">{orderedDescriptors.map((descriptor) => <td key={descriptor.key} className="border-r border-cardline p-0">{descriptor.source === 'sales' ? <CellInput column={descriptor.column} value={salesDraft?.[descriptor.column.id]} onChange={(value) => setSalesDraft((current) => ({ ...current, [descriptor.column.id]: value }))} /> : descriptor.source === 'custom' ? <CellInput column={descriptor.column} value={draft[descriptor.column.id]} onChange={(value) => setDraft((current) => ({ ...current, [descriptor.column.id]: value }))} /> : descriptor.key === 'actions' ? <div className="flex justify-center"><button onClick={saveRow} className="p-2 text-sage" title="Save"><Save size={17} /></button><button onClick={() => { setDraft(null); setSalesDraft(null); setEditingId(null); }} className="p-2 text-charcoal/50" title="Cancel"><X size={17} /></button></div> : <span className="px-3 text-xs">{descriptor.key === 'index' ? index + 1 : descriptor.key === 'appointmentCode' ? row.appointmentCode : descriptor.key === 'entryDate' ? displayDate(row.entryAt) : descriptor.key === 'entryTime' ? displayTime(row.entryAt) : descriptor.key === 'acceptedAt' ? displayDateTime(row.acceptedAt) : descriptor.key === 'lastUpdatedAt' ? displayDateTime(row.lastEditedAt) : descriptor.key === 'addedBy' ? row.createdByName : '-'}</span>}</td>)}</tr> : <tr key={row.id} className={`border-t border-cardline ${rowIsHighlighted(row) ? 'bg-emerald-100/70' : ''}`}>{orderedDescriptors.map((descriptor) => <td key={descriptor.key} className="max-w-[260px] overflow-hidden text-ellipsis whitespace-nowrap border-r border-cardline px-3 py-3 text-sm" title={descriptor.source ? String(row[descriptor.source === 'sales' ? 'salesValues' : 'values']?.[descriptor.column.id] || '') : ''}>{descriptor.source ? (descriptor.column.type === 'file' && (String(row[descriptor.source === 'sales' ? 'salesValues' : 'values']?.[descriptor.column.id] || '').startsWith('data:') || String(row[descriptor.source === 'sales' ? 'salesValues' : 'values']?.[descriptor.column.id] || '').startsWith('/uploads/')) ? <a href={attachmentHref(row[descriptor.source === 'sales' ? 'salesValues' : 'values'][descriptor.column.id])} target="_blank" rel="noreferrer" className="text-sage underline">View attachment</a> : (row[descriptor.source === 'sales' ? 'salesValues' : 'values']?.[descriptor.column.id] || '-')) : descriptor.key === 'actions' ? <div className="flex justify-center"><button onClick={() => { setEditingId(row.id); setDraft({ ...emptyValues(columns), ...row.values }); setSalesDraft({ ...emptyValues(salesColumns), ...row.salesValues }); }} className="p-2 text-sage" title="Edit"><Pencil size={16} /></button><button onClick={() => deleteRow(row)} className="p-2 text-red-700" title="Delete"><Trash2 size={16} /></button></div> : descriptor.key === 'index' ? index + 1 : descriptor.key === 'appointmentCode' ? row.appointmentCode : descriptor.key === 'entryDate' ? displayDate(row.entryAt) : descriptor.key === 'entryTime' ? displayTime(row.entryAt) : descriptor.key === 'acceptedAt' ? displayDateTime(row.acceptedAt) : descriptor.key === 'lastUpdatedAt' ? displayDateTime(row.lastUpdatedAt) : descriptor.key === 'timeline' ? <button onClick={() => openTimeline(row)} className="rounded p-1.5 text-sage hover:bg-sage/10" title="View row timeline"><History size={17} /></button> : row.sourceAppointmentId ? row.salesCreatedByName : row.createdByName}</td>)}</tr>) }
            {!loading && !filteredRows.length && !draft && <tr><td colSpan={span} className="px-6 py-16 text-center text-sm text-charcoal/50">{rows.length ? 'No appointments match this filter.' : 'No appointments for this date.'}</td></tr>}{loading && <tr><td colSpan={span} className="px-6 py-16 text-center text-sm text-charcoal/50">Loading appointments...</td></tr>}
          </tbody>
        </table>
      </div>
      <Modal open={settingsOpen} onClose={() => setSettingsOpen(false)} title="Appointment management columns" className="max-w-4xl">
        <form onSubmit={addColumn} className="grid gap-3 border-b border-cardline pb-5 sm:grid-cols-[1fr_150px_1fr_auto]"><input required placeholder="Column name" value={newColumn.label} onChange={(e) => setNewColumn({ ...newColumn, label: e.target.value })} className="rounded border border-cardline bg-cream px-3 py-2 text-sm" /><select value={newColumn.type} onChange={(e) => setNewColumn({ ...newColumn, type: e.target.value, highlightValue: '' })} className="rounded border border-cardline bg-cream px-3 py-2 text-sm"><option value="text">Text</option><option value="phone">Phone</option><option value="number">Number</option><option value="date">Date</option><option value="time">Time</option><option value="select">Dropdown</option><option value="textarea">Long text</option><option value="checkbox">Checkbox</option><option value="file">Attachment</option></select><input disabled={newColumn.type !== 'select'} placeholder="Dropdown options, comma separated" value={newColumn.options} onChange={(e) => setNewColumn({ ...newColumn, options: e.target.value })} className="rounded border border-cardline bg-cream px-3 py-2 text-sm disabled:opacity-40" /><Button type="submit"><Plus size={16} /> Add</Button><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={newColumn.required} onChange={(e) => setNewColumn({ ...newColumn, required: e.target.checked })} /> Required</label><label className="flex items-center gap-2 text-sm sm:col-span-2"><span className="whitespace-nowrap">Green row when value is</span><select disabled={newColumn.type !== 'select'} value={newColumn.highlightValue} onChange={(e) => setNewColumn({ ...newColumn, highlightValue: e.target.value })} className="min-w-0 flex-1 rounded border border-cardline bg-cream px-3 py-2 text-sm disabled:opacity-40"><option value="">No highlight</option>{newColumn.options.split(',').map((option) => option.trim()).filter(Boolean).map((option) => <option key={option} value={option}>{option}</option>)}</select></label></form>
        <div className="divide-y divide-cardline">{columns.map((column) => <div key={column.id} className="flex items-center gap-3 py-3"><div className="flex-1"><p className="font-semibold">{column.label}{column.required && ' *'}</p><p className="text-xs text-charcoal/50">{column.type}</p></div><button onClick={() => editColumn(column)} className="p-2 text-sage"><Pencil size={16} /></button><button onClick={() => deleteColumn(column)} className="p-2 text-red-700"><Trash2 size={16} /></button></div>)}</div>
      </Modal>
      {isAdmin && <Modal open={arrangeOpen} onClose={() => setArrangeOpen(false)} title="Arrange Appointment Management columns" className="max-w-3xl">
        <div className="divide-y divide-cardline">{orderedDescriptors.filter((descriptor) => descriptor.key !== 'timeline').map((descriptor, index) => <div key={descriptor.key} className="flex items-center gap-3 py-3"><span className="w-6 text-xs text-charcoal/40">{index + 1}</span><span className="flex-1 font-semibold">{descriptor.label}</span><button disabled={!index} onClick={() => moveDescriptor(index, -1)} className="p-1 text-sage disabled:opacity-25" title="Move up"><ArrowUp size={16} /></button><button disabled={index === orderedDescriptors.length - 2} onClick={() => moveDescriptor(index, 1)} className="p-1 text-sage disabled:opacity-25" title="Move down"><ArrowDown size={16} /></button></div>)}</div>
        <Button onClick={saveLayout} className="mt-4">Save arrangement</Button>
      </Modal>}
      {columnToEdit && <SheetColumnEditor key={columnToEdit.id} column={columnToEdit} endpoint="/sales-sheet/management-columns" management onClose={() => { setColumnToEdit(null); setSettingsOpen(true); }} onSaved={loadColumns} />}
      <Drawer open={Boolean(timelineRow)} onClose={() => setTimelineRow(null)} title={`Row timeline${timelineRow?.appointmentCode ? ` · ${timelineRow.appointmentCode}` : ''}`}>
        {timelineLoading ? <p className="text-sm text-charcoal/55">Loading timeline...</p> : !timeline.length ? <p className="text-sm text-charcoal/55">No history recorded for this row.</p> : <div className="relative space-y-4 border-l border-sage/40 pl-4">{timeline.map((item) => <div key={item.id} className="relative"><span className="absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full bg-sage" /><p className="text-sm font-semibold text-charcoal">{item.action}</p>{item.details && <p className="mt-1 text-xs text-charcoal/60">{item.details}</p>}<p className="mt-1 text-[11px] text-charcoal/45">{item.changedByName} · {timelineStamp(item.createdAt)}</p></div>)}</div>}
      </Drawer>
    </div>
  );
};

export default ReceptionistDashboard;
