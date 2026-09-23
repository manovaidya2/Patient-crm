import { useCallback, useEffect, useState } from 'react';
import { CalendarDays, Columns3, Pencil, Plus, Save, Trash2, X } from 'lucide-react';
import { io } from 'socket.io-client';
import api from '../../api/axios.js';
import Button from '../../components/ui/Button.jsx';
import Modal from '../../components/ui/Modal.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { ROLES } from '../../constants/roles.js';

const localIsoDate = (date = new Date()) => new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const socketUrl = (import.meta.env.VITE_API_URL || 'http://localhost:5000/api').replace(/\/api\/?$/, '');
const emptyValues = (columns) => Object.fromEntries(columns.map((column) => [column.id, '']));

const CellInput = ({ column, value, onChange }) => {
  const props = { value: value || '', onChange: (event) => onChange(event.target.value), className: 'w-full min-w-[130px] border-0 bg-transparent px-3 py-2.5 text-sm outline-none' };
  if (column.type === 'select') return <select {...props}><option value="">Select</option>{column.options.map((item) => <option key={item}>{item}</option>)}</select>;
  if (column.type === 'textarea') return <textarea {...props} rows={2} />;
  return <input {...props} type={column.type === 'phone' ? 'tel' : column.type} />;
};

const ReceptionistDashboard = () => {
  const { user } = useAuth();
  const isAdmin = user?.role === ROLES.ADMIN;
  const [selectedDate, setSelectedDate] = useState(localIsoDate());
  const [salesColumns, setSalesColumns] = useState([]);
  const [columns, setColumns] = useState([]);
  const [rows, setRows] = useState([]);
  const [draft, setDraft] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [live, setLive] = useState(false);
  const [error, setError] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [newColumn, setNewColumn] = useState({ label: '', type: 'text', required: false, options: '' });

  const loadColumns = useCallback(async () => {
    const [sales, management] = await Promise.all([api.get('/sales-sheet/columns'), api.get('/sales-sheet/management-columns')]);
    setSalesColumns(sales.data.columns); setColumns(management.data.columns);
  }, []);
  const loadRows = useCallback(async () => {
    const { data } = await api.get('/sales-sheet/management', { params: { date: selectedDate } });
    setRows(data.appointments);
  }, [selectedDate]);

  useEffect(() => { loadColumns().catch(() => setError('Columns could not be loaded')); }, [loadColumns]);
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
      if (editingId) await api.patch(`/sales-sheet/management/${editingId}`, { values: draft });
      else await api.post('/sales-sheet/management', { appointmentDate: selectedDate, values: draft });
      setDraft(null); setEditingId(null); await loadRows();
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
      setNewColumn({ label: '', type: 'text', required: false, options: '' }); await loadColumns();
    } catch (err) { setError(err.response?.data?.message || 'Column could not be added'); }
  };
  const renameColumn = async (column) => {
    const label = window.prompt('Column name', column.label);
    if (!label || label === column.label) return;
    await api.patch(`/sales-sheet/management-columns/${column.id}`, { label }); await loadColumns();
  };
  const deleteColumn = async (column) => {
    if (!window.confirm(`Remove ${column.label} column?`)) return;
    await api.delete(`/sales-sheet/management-columns/${column.id}`); await loadColumns();
  };

  const span = salesColumns.length + columns.length + 4;
  return (
    <div className="mx-auto max-w-[1800px]">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3 border-b border-cardline pb-5">
        <div><p className="text-xs font-semibold uppercase text-charcoal/50">Receptionist Dashboard</p><h1 className="mt-1 font-display text-2xl font-bold text-charcoal">Appointment Management</h1><p className="mt-1 text-sm text-charcoal/55">{rows.length} appointments <span className={`ml-2 text-xs ${live ? 'text-sage' : 'text-charcoal/40'}`}>{live ? 'Live' : 'Connecting'}</span></p></div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 rounded-lg border border-cardline bg-offwhite-100 px-3 py-2"><CalendarDays size={16} className="text-sage" /><input type="date" value={selectedDate} onChange={(event) => setSelectedDate(event.target.value)} className="bg-transparent text-sm outline-none" aria-label="Appointment date" /></label>
          {isAdmin && <Button variant="outline" onClick={() => setSettingsOpen(true)}><Columns3 size={16} /> Columns</Button>}
          <Button disabled={Boolean(draft)} onClick={() => { setDraft(emptyValues(columns)); setEditingId(null); }}><Plus size={16} /> Add appointment</Button>
        </div>
      </div>
      {error && <div className="mb-3 border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      <div className="overflow-x-auto border border-cardline bg-offwhite-100">
        <table className="w-full min-w-max border-collapse text-left">
          <thead><tr className="bg-tan-100 text-xs uppercase text-charcoal/60"><th className="w-12 border-r border-cardline px-3 py-3 text-center">#</th>{salesColumns.map((column) => <th key={column.id} className="min-w-[145px] border-r border-cardline px-3 py-3">{column.label}</th>)}{columns.map((column) => <th key={column.id} className="min-w-[145px] border-r border-cardline bg-sage/5 px-3 py-3">{column.label}{column.required && ' *'}</th>)}<th className="min-w-[125px] border-r border-cardline px-3 py-3">Added by</th><th className="w-24 px-3 py-3 text-center">Actions</th></tr></thead>
          <tbody>
            {draft && !editingId && <tr className="bg-sage/5"><td className="border-r border-cardline px-3 text-center text-xs">{rows.length + 1}</td>{salesColumns.map((column) => <td key={column.id} className="border-r border-cardline px-3 py-2 text-center text-charcoal/30">-</td>)}{columns.map((column) => <td key={column.id} className="border-r border-cardline p-0"><CellInput column={column} value={draft[column.id]} onChange={(value) => setDraft((current) => ({ ...current, [column.id]: value }))} /></td>)}<td className="border-r border-cardline px-3 text-sm">{user?.name}</td><td><div className="flex justify-center"><button onClick={saveRow} className="p-2 text-sage" title="Save"><Save size={17} /></button><button onClick={() => setDraft(null)} className="p-2 text-charcoal/50" title="Cancel"><X size={17} /></button></div></td></tr>}
            {!loading && rows.map((row, index) => editingId === row.id ? <tr key={row.id} className="bg-sage/5"><td className="border-r border-cardline px-3 text-center text-xs">{index + 1}</td>{salesColumns.map((column) => <td key={column.id} className="border-r border-cardline px-3 py-2 text-sm">{row.salesValues[column.id] || '-'}</td>)}{columns.map((column) => <td key={column.id} className="border-r border-cardline p-0"><CellInput column={column} value={draft[column.id]} onChange={(value) => setDraft((current) => ({ ...current, [column.id]: value }))} /></td>)}<td className="border-r border-cardline px-3 text-sm">{row.createdByName}</td><td><div className="flex justify-center"><button onClick={saveRow} className="p-2 text-sage"><Save size={17} /></button><button onClick={() => { setDraft(null); setEditingId(null); }} className="p-2 text-charcoal/50"><X size={17} /></button></div></td></tr> : <tr key={row.id} className="border-t border-cardline"><td className="border-r border-cardline px-3 py-3 text-center text-xs text-charcoal/45">{index + 1}</td>{salesColumns.map((column) => <td key={column.id} className="max-w-[260px] whitespace-pre-wrap border-r border-cardline px-3 py-3 text-sm">{row.salesValues[column.id] || '-'}</td>)}{columns.map((column) => <td key={column.id} className="max-w-[260px] whitespace-pre-wrap border-r border-cardline bg-sage/5 px-3 py-3 text-sm">{row.values[column.id] || '-'}</td>)}<td className="border-r border-cardline px-3 py-3 text-sm">{row.sourceAppointmentId ? row.salesCreatedByName : row.createdByName}</td><td><div className="flex justify-center"><button onClick={() => { setEditingId(row.id); setDraft({ ...emptyValues(columns), ...row.values }); }} className="p-2 text-sage" title="Edit"><Pencil size={16} /></button><button onClick={() => deleteRow(row)} className="p-2 text-red-700" title="Delete"><Trash2 size={16} /></button></div></td></tr>)}
            {!loading && !rows.length && !draft && <tr><td colSpan={span} className="px-6 py-16 text-center text-sm text-charcoal/50">No appointments for this date.</td></tr>}{loading && <tr><td colSpan={span} className="px-6 py-16 text-center text-sm text-charcoal/50">Loading appointments...</td></tr>}
          </tbody>
        </table>
      </div>
      <Modal open={settingsOpen} onClose={() => setSettingsOpen(false)} title="Appointment management columns" className="max-w-4xl">
        <form onSubmit={addColumn} className="grid gap-3 border-b border-cardline pb-5 sm:grid-cols-[1fr_150px_1fr_auto]"><input required placeholder="Column name" value={newColumn.label} onChange={(e) => setNewColumn({ ...newColumn, label: e.target.value })} className="rounded border border-cardline bg-cream px-3 py-2 text-sm" /><select value={newColumn.type} onChange={(e) => setNewColumn({ ...newColumn, type: e.target.value })} className="rounded border border-cardline bg-cream px-3 py-2 text-sm"><option value="text">Text</option><option value="phone">Phone</option><option value="number">Number</option><option value="date">Date</option><option value="time">Time</option><option value="select">Dropdown</option><option value="textarea">Long text</option></select><input disabled={newColumn.type !== 'select'} placeholder="Dropdown options, comma separated" value={newColumn.options} onChange={(e) => setNewColumn({ ...newColumn, options: e.target.value })} className="rounded border border-cardline bg-cream px-3 py-2 text-sm disabled:opacity-40" /><Button type="submit"><Plus size={16} /> Add</Button><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={newColumn.required} onChange={(e) => setNewColumn({ ...newColumn, required: e.target.checked })} /> Required</label></form>
        <div className="divide-y divide-cardline">{columns.map((column) => <div key={column.id} className="flex items-center gap-3 py-3"><div className="flex-1"><p className="font-semibold">{column.label}{column.required && ' *'}</p><p className="text-xs text-charcoal/50">{column.type}</p></div><button onClick={() => renameColumn(column)} className="p-2 text-sage"><Pencil size={16} /></button><button onClick={() => deleteColumn(column)} className="p-2 text-red-700"><Trash2 size={16} /></button></div>)}</div>
      </Modal>
    </div>
  );
};

export default ReceptionistDashboard;
