import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, RefreshCw, Stethoscope } from 'lucide-react';
import api from '../../api/axios.js';
import Button from '../../components/ui/Button.jsx';
import Modal from '../../components/ui/Modal.jsx';

const input = 'w-full rounded-lg border border-cardline bg-white px-3 py-2 text-sm';
const when = value => value ? new Date(value).toLocaleString('en-IN') : '-';
const localNow = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16); };

export default function MedicineExplanations() {
  const [items, setItems] = useState([]);
  const [date, setDate] = useState('');
  const [status, setStatus] = useState('pending');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [completedAt, setCompletedAt] = useState(localNow);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const load = useCallback(async () => {
    try { const { data } = await api.get('/transit/explanations', { params: { date, status }, skipCache: true }); setItems(data.items); setError(''); }
    catch (err) { setError(err.response?.data?.message || 'Could not load explanations'); }
    finally { setLoading(false); }
  }, [date, status]);
  useEffect(() => { load(); const timer = setInterval(load, 30000); return () => clearInterval(timer); }, [load]);
  const complete = async event => {
    event.preventDefault(); setSaving(true); setError('');
    try {
      await api.post(`/transit/${selected.patientId}/${selected.stage}/complete-explanation`, { completedAt: new Date(completedAt).toISOString(), notes });
      setSelected(null); await load();
    } catch (err) { setError(err.response?.data?.message || 'Could not complete explanation'); }
    finally { setSaving(false); }
  };
  return <div className="space-y-5">
    <header className="flex flex-wrap items-center justify-between gap-3">
      <h1 className="flex items-center gap-2 text-2xl font-semibold"><Stethoscope size={24} />Medicine Explanations</h1>
      <Button variant="outline" onClick={load} title="Refresh"><RefreshCw size={16} /></Button>
    </header>
    <div className="flex flex-wrap gap-3 border-y border-cardline py-3">
      <label className="space-y-1 text-sm">Scheduled date<input className={input} type="date" value={date} onChange={event => setDate(event.target.value)} /></label>
      <label className="space-y-1 text-sm">Status<select className={input} value={status} onChange={event => setStatus(event.target.value)}><option value="pending">Pending</option><option value="done">Completed</option><option value="all">All</option></select></label>
    </div>
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    {loading ? <p>Loading...</p> : !items.length ? <p className="text-sm text-charcoal/60">No explanations for this selection.</p> : <div className="divide-y divide-cardline">
      {items.map(item => <article key={item.key} className="grid gap-4 py-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
        <div className="min-w-0"><Link className="font-semibold text-teal-700" to={`/admin/patients/${item.patientId}`}>{item.patientName}</Link><p className="text-sm">{item.patientCode} · Phase {item.stage}</p><a className="text-sm" href={`tel:${item.patientPhone}`}>{item.patientPhone}</a></div>
        <div className="min-w-0 text-sm"><p>Scheduled: {when(item.explanation.at)}</p><p>Mode: {item.explanation.mode || 'phone'}</p>{item.explanation.completedAt ? <><p>Completed: {when(item.explanation.completedAt)}</p><p className="break-words">{item.explanation.note}</p></> : <p className="text-charcoal/60">{item.onHold ? 'On hold' : item.courier?.status === 'delivered' ? 'Medicine received' : 'Awaiting medicine receipt'}</p>}</div>
        {!item.explanation.completedAt && <div><Button disabled={item.onHold || item.courier?.status !== 'delivered'} onClick={() => { setSelected(item); setCompletedAt(localNow()); setNotes(''); setError(''); }}><Check size={16} />Complete</Button></div>}
      </article>)}
    </div>}
    <Modal open={Boolean(selected)} onClose={() => !saving && setSelected(null)} title="Complete medicine explanation">
      <form onSubmit={complete} className="space-y-4">
        <p className="font-medium">{selected?.patientName}</p>
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
        <label className="block space-y-1 text-sm">Actual completion time<input className={input} type="datetime-local" required value={completedAt} max={localNow()} onChange={event => setCompletedAt(event.target.value)} /></label>
        <label className="block space-y-1 text-sm">Explanation notes<textarea className={input} required maxLength={2000} rows={4} value={notes} onChange={event => setNotes(event.target.value)} /></label>
        <Button type="submit" disabled={saving}><Check size={16} />{saving ? 'Saving...' : 'Complete and start treatment'}</Button>
      </form>
    </Modal>
  </div>;
}
