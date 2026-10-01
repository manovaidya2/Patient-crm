import { useCallback, useEffect, useState } from 'react';
import { Check, PhoneCall, RefreshCw } from 'lucide-react';
import api from '../api/axios.js';
import Drawer from './ui/Drawer.jsx';
import Button from './ui/Button.jsx';

const statusLabels = { pending: 'Pending', connected: 'Connected', no_answer: 'No answer', follow_up: 'Follow up' };
const stamp = (value) => value ? new Date(value).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '-';

export default function SalesCallHistory({ row, onClose, onSaved }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('connected');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const load = useCallback(async (signal) => {
    setLoading(true);
    try {
      const response = await api.get(`/sales-sheet/appointments/${row.id}/calls`, { skipCache: true, signal });
      setData(response.data);
    } catch (err) {
      if (!signal?.aborted) setError(err.response?.data?.message || 'Could not load call history.');
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [row.id]);
  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const save = async (event) => {
    event.preventDefault();
    if (saving || !notes.trim()) return;
    setSaving(true); setError(''); setSaved(false);
    try {
      const response = await api.post(`/sales-sheet/appointments/${row.id}/calls`, { status, notes: notes.trim() });
      setNotes(''); setSaved(true);
      onSaved(response.data.appointment);
      await load();
    } catch (err) {
      setError(err.response?.data?.message || 'Could not save this call.');
    } finally { setSaving(false); }
  };
  const staffCounts = new Map();
  (data?.calls || []).forEach((call) => {
    const staff = staffCounts.get(call.calledBy) || { name: call.calledByName, count: 0 };
    staff.count += 1; staffCounts.set(call.calledBy, staff);
  });

  return <Drawer open onClose={() => !saving && onClose()} title="Reception call record">
    <p className="text-sm font-semibold text-charcoal">{row.appointmentCode}</p>
    <div className="my-4 grid grid-cols-2 gap-3 border-y border-cardline py-3 text-sm text-charcoal">
      <div><p className="text-xs text-charcoal/65">Total calls</p><p className="mt-1 text-xl font-bold">{data?.numberOfCalls ?? row.numberOfCalls ?? 0}</p></div>
      <div><p className="text-xs text-charcoal/65">Current status</p><p className="mt-1 font-semibold">{statusLabels[data?.callStatus || row.callStatus] || 'Pending'}</p></div>
      <div className="col-span-2"><p className="text-xs text-charcoal/65">Last call</p><p className="mt-1 text-xs">{stamp(data?.lastCallAt || row.lastCallAt)}</p></div>
    </div>
    {error && <p role="alert" className="mb-3 text-sm text-red-700">{error}</p>}
    {saved && <p role="status" className="mb-3 flex items-center gap-1 text-xs font-semibold text-sage"><Check size={14} />Call saved</p>}
    {data?.canLog && <form onSubmit={save} className="mb-5 space-y-3 border-b border-cardline pb-5">
      <h3 className="text-sm font-bold text-charcoal">Log a call</h3>
      <label className="block text-xs font-semibold text-charcoal">Call outcome
        <select value={status} disabled={saving} onChange={(event) => { setStatus(event.target.value); setSaved(false); }} className="mt-1 w-full rounded-md border border-cardline bg-offwhite-200 px-3 py-2 text-sm">
          {['connected', 'no_answer', 'follow_up'].map((value) => <option key={value} value={value}>{statusLabels[value]}</option>)}
        </select>
      </label>
      <label className="block text-xs font-semibold text-charcoal">Conversation / call details *
        <textarea value={notes} onChange={(event) => { setNotes(event.target.value); setSaved(false); }} required maxLength={2000} rows={4} disabled={saving} placeholder="What was discussed? Any response or next step?" className="mt-1 w-full resize-y rounded-md border border-cardline bg-offwhite-200 px-3 py-2 text-sm font-normal" />
      </label>
      <Button type="submit" size="sm" disabled={saving || !notes.trim()}><PhoneCall size={14} />{saving ? 'Saving...' : 'Save call'}</Button>
    </form>}
    <div className="mb-3 flex items-center justify-between gap-2"><h3 className="text-sm font-bold text-charcoal">Call history</h3><button type="button" title="Refresh call history" aria-label="Refresh call history" disabled={loading || saving} onClick={() => { setError(''); load(); }} className="rounded p-1.5 text-sage disabled:opacity-40"><RefreshCw size={15} className={loading ? 'animate-spin' : ''} /></button></div>
    {staffCounts.size > 0 && <ul className="mb-3 space-y-1 text-xs text-charcoal/75">{Array.from(staffCounts, ([id, staff]) => <li key={id} className="flex justify-between gap-2"><span>{staff.name}</span><span>{staff.count} recorded calls</span></li>)}</ul>}
    {loading ? <p className="text-sm text-charcoal/65">Loading history...</p> : <>
      {!!data?.legacyCount && <p className="mb-3 text-xs text-charcoal/65">{data.legacyCount} earlier call(s): conversation details were not recorded.</p>}
      {!data?.calls?.length && <p className="text-sm text-charcoal/65">No detailed call records yet.</p>}
      <ol className="space-y-4">{(data?.calls || []).map((call) => <li key={call.id} className="border-l-2 border-sage pl-3 text-sm text-charcoal">
        <div className="flex flex-wrap items-center justify-between gap-2"><strong>Call {call.number}</strong><span className="text-xs font-semibold text-sage">{statusLabels[call.status]}</span></div>
        <p className="mt-1 text-xs text-charcoal/70">{stamp(call.calledAt)}</p><p className="mt-1 text-xs font-semibold">{call.calledByName}</p>
        <p className="mt-2 whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{call.notes}</p>
      </li>)}</ol>
    </>}
  </Drawer>;
}
