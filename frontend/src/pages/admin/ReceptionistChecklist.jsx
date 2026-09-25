import { useCallback, useEffect, useState } from 'react';
import { Check, Pencil, Plus, Save, Trash2, X } from 'lucide-react';
import api from '../../api/axios.js';
import Button from '../../components/ui/Button.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { ROLES } from '../../constants/roles.js';

const localDate = () => {
  const date = new Date();
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};
const formatStamp = (value) => value ? new Date(value).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';

const ReceptionistChecklist = ({ compact = false }) => {
  const { user } = useAuth();
  const isAdmin = user?.role === ROLES.ADMIN;
  const [date, setDate] = useState(localDate());
  const [items, setItems] = useState([]);
  const [noteDrafts, setNoteDrafts] = useState({});
  const [newLabel, setNewLabel] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editingLabel, setEditingLabel] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      setError('');
      const { data } = await api.get('/receptionist-checklist/daily', { params: { date }, skipCache: true });
      setItems(data.items || []);
      setNoteDrafts(Object.fromEntries((data.items || []).map((item) => [item.id, item.note || ''])));
    } catch (err) { setError(err.response?.data?.message || 'Checklist could not be loaded'); }
    finally { setLoading(false); }
  }, [date]);

  useEffect(() => { load(); }, [load]);

  const updateRecord = async (item, changes) => {
    const next = { ...item, ...changes };
    setItems((current) => current.map((entry) => entry.id === item.id ? next : entry));
    try {
      const { data } = await api.put('/receptionist-checklist/records', { date, itemId: item.id, completed: next.completed, note: next.note });
      setItems((current) => current.map((entry) => entry.id === item.id ? { ...entry, ...data.record } : entry));
    }
    catch (err) { setError(err.response?.data?.message || 'Checklist record could not be saved'); load(); }
  };

  const addItem = async (event) => {
    event.preventDefault();
    if (!newLabel.trim()) return;
    try { await api.post('/receptionist-checklist/items', { label: newLabel }); setNewLabel(''); await load(); }
    catch (err) { setError(err.response?.data?.message || 'Checklist item could not be added'); }
  };
  const saveItem = async (item) => {
    try { await api.patch(`/receptionist-checklist/items/${item.id}`, { label: editingLabel }); setEditingId(null); await load(); }
    catch (err) { setError(err.response?.data?.message || 'Checklist item could not be updated'); }
  };
  const deleteItem = async (item) => {
    if (!window.confirm(`Remove ${item.label} from the daily checklist?`)) return;
    try { await api.delete(`/receptionist-checklist/items/${item.id}`); await load(); }
    catch (err) { setError(err.response?.data?.message || 'Checklist item could not be removed'); }
  };

  return <section className={`rounded-xl border border-cardline bg-offwhite-100 shadow-sm ${compact ? 'mt-5 p-4' : 'mx-auto max-w-5xl p-5'}`}>
    <div className="flex flex-wrap items-end justify-between gap-3 border-b border-cardline pb-4"><div><p className="text-xs font-semibold uppercase tracking-wide text-charcoal/50">Daily operations</p><h2 className="mt-1 font-display text-xl font-bold text-charcoal">Receptionist checklist</h2><p className="mt-1 text-xs text-charcoal/55">Mark each task complete and keep a note for the day.</p></div><label className="flex items-center gap-2 text-sm"><span className="text-xs font-semibold uppercase text-charcoal/50">Date</span><input type="date" value={date} onChange={(event) => setDate(event.target.value)} className="rounded border border-cardline bg-cream px-3 py-2 text-sm" /></label></div>
    {error && <div className="mt-3 border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
    {isAdmin && <form onSubmit={addItem} className="mt-4 flex gap-2"><input required value={newLabel} onChange={(event) => setNewLabel(event.target.value)} placeholder="Add daily receptionist task" className="min-w-0 flex-1 rounded border border-cardline bg-cream px-3 py-2 text-sm" /><Button type="submit"><Plus size={16} /> Add task</Button></form>}
    <div className="mt-3 divide-y divide-cardline">{loading ? <p className="py-8 text-center text-sm text-charcoal/50">Loading checklist...</p> : !items.length ? <p className="py-8 text-center text-sm text-charcoal/50">No checklist tasks have been added yet.</p> : items.map((item) => <div key={item.id} className="grid items-center gap-2 py-2.5 md:grid-cols-[20px_minmax(180px,1fr)_minmax(240px,1.4fr)_auto]"><button type="button" onClick={() => !isAdmin && updateRecord(item, { completed: !item.completed, note: noteDrafts[item.id] || item.note || '' })} className={item.completed ? 'flex h-5 w-5 items-center justify-center rounded border border-sage bg-sage text-white' : 'flex h-5 w-5 items-center justify-center rounded border border-charcoal/30 bg-transparent'} title={isAdmin ? 'Receptionist completion status' : 'Mark complete'}>{item.completed && <Check size={14} />}</button>{editingId === item.id ? <input autoFocus value={editingLabel} onChange={(event) => setEditingLabel(event.target.value)} className="w-full rounded border border-cardline bg-cream px-2 py-1.5 text-sm" /> : <div className="min-w-0"><p className={item.completed ? 'truncate text-sm text-charcoal/50 line-through' : 'truncate text-sm text-charcoal'}>{item.label}</p>{item.completed && <p className="mt-0.5 text-[10px] text-sage">Marked {formatStamp(item.completedAt)}</p>}</div>}<div className="flex min-w-0 gap-2"><input value={noteDrafts[item.id] ?? item.note ?? ''} disabled={isAdmin} onChange={(event) => setNoteDrafts((current) => ({ ...current, [item.id]: event.target.value }))} placeholder="Daily note" className="min-w-0 flex-1 rounded border border-cardline bg-cream px-3 py-1.5 text-sm disabled:opacity-60" />{!isAdmin && <button type="button" onClick={() => updateRecord(item, { note: noteDrafts[item.id] || '' })} className="inline-flex items-center gap-1 rounded border border-cardline px-2 py-1 text-xs font-semibold text-sage hover:bg-sage/10" title="Save note"><Save size={14} /> Save</button>}</div>{isAdmin && <div className="flex gap-1">{editingId === item.id ? <><button type="button" onClick={() => saveItem(item)} className="p-2 text-sage" title="Save"><Save size={16} /></button><button type="button" onClick={() => setEditingId(null)} className="p-2 text-charcoal/50" title="Cancel"><X size={16} /></button></> : <button type="button" onClick={() => { setEditingId(item.id); setEditingLabel(item.label); }} className="p-2 text-sage" title="Edit"><Pencil size={16} /></button>}<button type="button" onClick={() => deleteItem(item)} className="p-2 text-red-700" title="Delete"><Trash2 size={16} /></button></div>}{item.updatedAt && <span className="text-[10px] text-charcoal/45 md:text-right">Saved {formatStamp(item.updatedAt)}</span>}</div>)}</div>
  </section>;
};

export default ReceptionistChecklist;
