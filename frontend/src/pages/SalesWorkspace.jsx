import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, CalendarDays, ChevronLeft, ChevronRight, Columns3, LogOut, Pencil, Plus, Save, Trash2, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { io } from 'socket.io-client';
import api from '../api/axios.js';
import BrandLogo from '../components/BrandLogo.jsx';
import Button from '../components/ui/Button.jsx';
import Modal from '../components/ui/Modal.jsx';
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
const socketUrl = (import.meta.env.VITE_API_URL || 'http://localhost:5000/api').replace(/\/api\/?$/, '');

const Field = ({ column, value, onChange, disabled = false }) => {
  const common = { value: value || '', disabled, onChange: (event) => onChange(event.target.value), className: 'w-full min-w-[130px] border-0 bg-transparent px-3 py-2.5 text-sm text-charcoal outline-none disabled:cursor-default disabled:bg-transparent' };
  if (column.type === 'select') return <select {...common}><option value="">Select</option>{column.options.map((option) => <option key={option}>{option}</option>)}</select>;
  if (column.type === 'textarea') return <textarea {...common} rows={2} />;
  return <input {...common} type={column.type === 'phone' ? 'tel' : column.type} />;
};

const SalesWorkspace = () => {
  const { user, logout } = useAuth();
  const isAdmin = user?.role === ROLES.ADMIN;
  const [selectedDate, setSelectedDate] = useState(isoDate(new Date()));
  const [columns, setColumns] = useState([]);
  const [rows, setRows] = useState([]);
  const [draft, setDraft] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [liveConnected, setLiveConnected] = useState(false);
  const [newColumn, setNewColumn] = useState({ label: '', type: 'text', required: false, options: '' });

  const dates = useMemo(() => Array.from({ length: 9 }, (_, index) => shiftDate(selectedDate, index - 4)), [selectedDate]);
  const loadColumns = useCallback(async () => {
    const { data } = await api.get('/sales-sheet/columns');
    setColumns(data.columns);
  }, []);
  const loadRows = useCallback(async () => {
    const { data } = await api.get('/sales-sheet/appointments', { params: { date: selectedDate } });
    setRows(data.appointments);
  }, [selectedDate]);

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
      if (date === selectedDate) loadRows().catch(() => {});
    });
    socket.on('sales-sheet:columns-changed', () => {
      loadColumns().catch(() => {});
      loadRows().catch(() => {});
    });
    return () => socket.disconnect();
  }, [selectedDate, loadColumns, loadRows]);

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

  return (
    <div className="min-h-screen bg-cream text-charcoal">
      <header className="flex h-16 items-center justify-between gap-3 bg-teal-950 px-4 text-offwhite-100 sm:px-7">
        <div className="flex min-w-0 items-center gap-2.5"><BrandLogo size="sm" /><span className="truncate font-display text-sm font-bold">Manovaidya Operation System</span></div>
        <div className="flex items-center gap-2">
          {isAdmin && <Link to="/admin"><Button variant="ghost" size="sm" className="text-offwhite-100 hover:bg-teal-800"><ArrowLeft size={15} /> CRM</Button></Link>}
          <Button variant="ghost" size="sm" onClick={logout} className="text-offwhite-100 hover:bg-teal-800"><LogOut size={15} /><span className="hidden sm:inline">Log out</span></Button>
        </div>
      </header>

      <section className="border-b border-tan-300 bg-offwhite-100 px-3 py-3 sm:px-6">
        <div className="mx-auto flex max-w-[1800px] items-center gap-2 overflow-x-auto">
          <button onClick={() => setSelectedDate(shiftDate(selectedDate, -7))} className="shrink-0 p-2 text-sage" title="Previous week"><ChevronLeft size={20} /></button>
          {dates.map((date) => <button key={date} onClick={() => setSelectedDate(date)} className={`min-w-[108px] shrink-0 border-b-2 px-3 py-2 text-center text-xs font-semibold ${date === selectedDate ? 'border-sage bg-sage/10 text-teal-950' : 'border-transparent text-charcoal/60 hover:bg-tan-100'}`}>{dateLabel(date)}</button>)}
          <button onClick={() => setSelectedDate(shiftDate(selectedDate, 7))} className="shrink-0 p-2 text-sage" title="Next week"><ChevronRight size={20} /></button>
          <input type="date" value={selectedDate} onChange={(event) => setSelectedDate(event.target.value)} className="ml-auto shrink-0 rounded border border-tan-300 bg-cream px-2 py-2 text-xs" aria-label="Select appointment date" />
        </div>
      </section>

      <main className="mx-auto max-w-[1800px] p-4 sm:p-6">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div><p className="text-xs font-semibold uppercase text-charcoal/50">Sales Team</p><h1 className="font-display text-2xl font-bold">Appointment Sheet</h1><p className="mt-1 text-sm text-charcoal/60"><CalendarDays className="mr-1 inline" size={15} />{dateLabel(selectedDate)} · {rows.length} appointments <span className={`ml-2 inline-flex items-center gap-1 text-xs ${liveConnected ? 'text-sage' : 'text-charcoal/40'}`}><span className={`h-1.5 w-1.5 rounded-full ${liveConnected ? 'bg-sage' : 'bg-charcoal/30'}`} />{liveConnected ? 'Live' : 'Connecting'}</span></p></div>
          <div className="flex gap-2">{isAdmin && <Button variant="outline" onClick={() => setSettingsOpen(true)}><Columns3 size={16} /> Columns</Button>}<Button onClick={startAdd} disabled={!columns.length || Boolean(draft)}><Plus size={16} /> Add appointment</Button></div>
        </div>
        {error && <div className="mb-3 border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
        <div className="overflow-x-auto border border-tan-300 bg-offwhite-100">
          <table className="w-full min-w-max border-collapse text-left">
            <thead><tr className="bg-tan-100 text-xs uppercase text-charcoal/60"><th className="w-14 border-r border-tan-300 px-3 py-3 text-center">#</th>{columns.map((column) => <th key={column.id} className="min-w-[150px] border-r border-tan-300 px-3 py-3">{column.label}{column.required && <span className="ml-1 text-red-600">*</span>}</th>)}<th className="min-w-[140px] border-r border-tan-300 px-3 py-3">Added by</th><th className="w-24 px-3 py-3 text-center">Actions</th></tr></thead>
            <tbody>
              {draft && <tr className="bg-sage/5"><td className="border-r border-tan-300 px-3 text-center text-xs font-semibold">{editingId ? rows.findIndex((row) => row.id === editingId) + 1 : rows.length + 1}</td>{columns.map((column) => <td key={column.id} className="border-r border-tan-300 p-0"><Field column={column} value={draft.values[column.id]} onChange={(value) => setDraft((current) => ({ values: { ...current.values, [column.id]: value } }))} /></td>)}<td className="border-r border-tan-300 px-3 text-sm font-medium">{editingId ? rows.find((row) => row.id === editingId)?.createdByName : user?.name}</td><td><div className="flex justify-center gap-1"><button onClick={saveRow} className="p-2 text-sage" title="Save"><Save size={17} /></button><button onClick={() => { setDraft(null); setEditingId(null); }} className="p-2 text-charcoal/50" title="Cancel"><X size={17} /></button></div></td></tr>}
              {!loading && rows.map((row, index) => editingId === row.id ? null : <tr key={row.id} className="border-t border-tan-300 hover:bg-tan-100/40"><td className="border-r border-tan-300 px-3 py-3 text-center text-xs text-charcoal/50">{index + 1}</td>{columns.map((column) => <td key={column.id} className="max-w-[280px] whitespace-pre-wrap border-r border-tan-300 px-3 py-3 text-sm">{row.values[column.id] || <span className="text-charcoal/30">-</span>}</td>)}<td className="border-r border-tan-300 px-3 py-3 text-sm"><span className="font-medium">{row.createdByName}</span>{String(row.createdBy) === String(user?.id || user?._id) && <span className="ml-2 text-xs text-sage">You</span>}</td><td><div className="flex justify-center">{row.canEdit ? <><button onClick={() => startEdit(row)} className="p-2 text-sage" title="Edit"><Pencil size={16} /></button><button onClick={() => removeRow(row)} className="p-2 text-red-700" title="Delete"><Trash2 size={16} /></button></> : <span className="text-xs text-charcoal/35">View only</span>}</div></td></tr>)}
              {!loading && !rows.length && !draft && <tr><td colSpan={columns.length + 3} className="px-6 py-16 text-center text-sm text-charcoal/50">{columns.length ? 'No appointments added for this date.' : 'Admin has not configured sheet columns yet.'}</td></tr>}
              {loading && <tr><td colSpan={columns.length + 3} className="px-6 py-16 text-center text-sm text-charcoal/50">Loading sheet...</td></tr>}
            </tbody>
          </table>
        </div>
      </main>

      <Modal open={settingsOpen} onClose={() => setSettingsOpen(false)} title="Sales sheet columns" className="max-w-4xl">
        <form onSubmit={addColumn} className="grid gap-3 border-b border-tan-300 pb-5 sm:grid-cols-[1fr_150px_1fr_auto]">
          <input value={newColumn.label} onChange={(e) => setNewColumn({ ...newColumn, label: e.target.value })} placeholder="Column name" className="rounded border border-tan-300 bg-cream px-3 py-2 text-sm" required />
          <select value={newColumn.type} onChange={(e) => setNewColumn({ ...newColumn, type: e.target.value })} className="rounded border border-tan-300 bg-cream px-3 py-2 text-sm"><option value="text">Text</option><option value="phone">Phone</option><option value="number">Number</option><option value="date">Date</option><option value="time">Time</option><option value="select">Dropdown</option><option value="textarea">Long text</option></select>
          <input value={newColumn.options} onChange={(e) => setNewColumn({ ...newColumn, options: e.target.value })} placeholder={newColumn.type === 'select' ? 'Options, separated by commas' : 'Options only for dropdown'} disabled={newColumn.type !== 'select'} className="rounded border border-tan-300 bg-cream px-3 py-2 text-sm disabled:opacity-40" />
          <Button type="submit"><Plus size={16} /> Add</Button>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={newColumn.required} onChange={(e) => setNewColumn({ ...newColumn, required: e.target.checked })} /> Required field</label>
        </form>
        <div className="divide-y divide-tan-300">{columns.map((column) => <div key={column.id} className="flex items-center gap-3 py-3"><div className="min-w-0 flex-1"><p className="font-semibold">{column.label}{column.required && ' *'}</p><p className="text-xs text-charcoal/50">{column.type}{column.options.length ? ` · ${column.options.join(', ')}` : ''}</p></div><button onClick={() => renameColumn(column)} className="p-2 text-sage" title="Rename"><Pencil size={16} /></button><button onClick={() => removeColumn(column)} className="p-2 text-red-700" title="Remove"><Trash2 size={16} /></button></div>)}{!columns.length && <p className="py-8 text-center text-sm text-charcoal/50">No columns configured.</p>}</div>
      </Modal>
    </div>
  );
};

export default SalesWorkspace;
