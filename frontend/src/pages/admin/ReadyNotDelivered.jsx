import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { PackageX, Pencil, RefreshCw } from 'lucide-react';
import api from '../../api/axios.js';
import useLiveEvent from '../../api/useLiveEvent.js';
import Button from '../../components/ui/Button.jsx';
import Modal from '../../components/ui/Modal.jsx';
import { PageHeader } from '../../components/ui/Layout.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { ROLES, roleAllowed } from '../../constants/roles.js';

// "Ready, Not Delivered": every medicine made (doctor's final verification passed) that has not reached the patient,
// oldest first, with why it is held - worked out from the PO (release, call, schedule, payment / PO paper, dispatch,
// receipt, late follow-ups, a passed date, a hold) - and In Transit's own note on the reason.
const TABS = [['all', 'All'], ['not_released', 'Not released'], ['not_sent', 'Not dispatched / collected'], ['on_the_way', 'On the way']];
const STATE = { not_released: ['Not released by Medicine Dept', 'bg-amber-100 text-amber-900'], not_sent: ['Released, not sent', 'bg-[#FFF1E6] text-[#C2410C]'], on_the_way: ['On the way', 'bg-sky-50 text-sky-900'] };
const TONE = { danger: 'border-[#F5C6C0] bg-[#FDE2E1] text-[#9F1D1D]', warning: 'border-amber-200 bg-amber-50 text-amber-900', info: 'border-sky-200 bg-sky-50 text-sky-900' };
const MODE = { pickup: 'Self pickup', shipped: 'Porter / Courier', courier: 'Courier', porter: 'Porter' };
const day = (v) => (v ? new Date(v).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '-');
const stamp = (v) => (v ? new Date(v).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '');

function NoteForm({ row, onSaved, onCancel }) {
  const [note, setNote] = useState(row.note?.text || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const submit = async (e) => {
    e.preventDefault(); setSaving(true); setError('');
    try {
      const body = new FormData(); body.append('action', 'stuck_note'); body.append('note', note.trim());
      await api.patch(`/transit/${row.patientId}/${row.phase}`, body); onSaved();
    } catch (err) { setError(err.response?.data?.message || 'Could not save the reason'); }
    finally { setSaving(false); }
  };
  return (
    <form onSubmit={submit} className="space-y-3">
      <p className="text-sm"><b>{row.patientName}</b> · {row.poNumber} · Phase {row.phase}</p>
      <label className="block text-sm font-medium">Why is it not delivered yet?<textarea className="mt-1 w-full rounded-lg border border-cardline bg-white px-3 py-2 text-sm" rows={3} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Patient out of town till 15 Nov; will collect after that" /></label>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      <div className="flex justify-end gap-2"><Button type="button" variant="outline" disabled={saving} onClick={onCancel}>Cancel</Button><Button type="submit" disabled={saving}>{saving ? 'Saving...' : note.trim() ? 'Save reason' : 'Clear reason'}</Button></div>
    </form>
  );
}

export default function ReadyNotDelivered() {
  const [tab, setTab] = useState('all');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [noting, setNoting] = useState(null);
  // In Transit writes the reason (the manager / admin too); the Doctor watches the list.
  const { user } = useAuth();
  const canNote = roleAllowed([ROLES.ADMIN, ROLES.IN_TRANSIT], user);
  const load = useCallback(async () => {
    setLoading(true);
    try { const { data: res } = await api.get('/courier/ready-not-delivered', { skipCache: true }); setData(res); setError(''); }
    catch (err) { setError(err.response?.data?.message || 'Could not load the list'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); const t = setInterval(load, 60000); return () => clearInterval(t); }, [load]);
  useLiveEvent('transit:changed', load);
  useLiveEvent('medicine-job:changed', load);
  const rows = (data?.rows || []).filter((r) => tab === 'all' || r.state === tab);
  const count = (key) => (data?.rows || []).filter((r) => key === 'all' || r.state === key).length;

  return (
    <div className="space-y-4">
      <PageHeader title="Ready, Not Delivered" icon={PackageX} subtitle="Medicines already made (doctor's final verification passed) that have not reached the patient yet - oldest first, with why each one is held." actions={<button type="button" aria-label="Refresh" onClick={load} className="rounded-lg p-2 text-sage hover:bg-[#F3F6F2]"><RefreshCw size={16} className={loading ? 'animate-spin' : ''} /></button>} />
      <div className="flex flex-wrap gap-2">
        {TABS.map(([key, label]) => <button key={key} type="button" aria-pressed={tab === key} onClick={() => setTab(key)} className={`rounded-full border px-4 py-1.5 text-sm font-semibold ${tab === key ? 'border-sage bg-sage text-white' : 'border-cardline bg-white text-charcoal/70'}`}>{label} ({count(key)})</button>)}
      </div>
      {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {!data && !error && <p className="text-sm text-charcoal/55">Loading...</p>}
      {data && !rows.length && <p className="rounded-[14px] border border-[#E8DFCB] bg-white px-4 py-10 text-center text-sm text-charcoal/55">Nothing here - every ready medicine has been delivered.</p>}
      <div className="space-y-3">
        {rows.map((r) => {
          const [stateLabel, stateTone] = STATE[r.state];
          return (
            <article key={r.poId} className="rounded-[14px] border border-[#E8DFCB] bg-white p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <Link to={`/admin/purchase-orders/${r.poId}`} className="text-base font-bold text-charcoal hover:text-sage hover:underline">{r.patientName}</Link>
                  <p className="text-xs text-charcoal/60">{[r.patientCode, `Phase ${r.phase}`, r.poNumber, r.supplyLabel].filter(Boolean).join(' · ')}{r.patientPhone && <> · <a href={`tel:${r.patientPhone}`} className="font-semibold text-sage">{r.patientPhone}</a></>}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded-full px-2.5 py-1 text-[11.5px] font-bold ${stateTone}`}>{stateLabel}</span>
                  {r.waitingDays != null && <span className={`rounded-full px-2.5 py-1 text-[11.5px] font-bold ${r.waitingDays >= 7 ? 'bg-[#8C3B2E] text-white' : r.waitingDays >= 3 ? 'bg-[#FFF1E6] text-[#C2410C]' : 'bg-[#F3EEE2] text-charcoal/70'}`}>Ready {r.waitingDays === 0 ? 'today' : `${r.waitingDays} day${r.waitingDays === 1 ? '' : 's'} ago`}</span>}
                </div>
              </div>
              <div className="mt-2 grid gap-x-6 gap-y-1 text-xs text-charcoal/70 sm:grid-cols-3">
                <p>Made: <b className="text-charcoal">{day(r.madeAt)}</b>{r.releasedAt && <> · released {day(r.releasedAt)}</>}</p>
                <p>Delivery: <b className="text-charcoal">{MODE[r.mode] || 'Not scheduled'}</b>{r.plannedAt && <> · {day(r.plannedAt)}</>}</p>
                <p>Now on: <b className="text-charcoal">{r.nextStep?.label || '-'}</b></p>
              </div>
              <div className="mt-3">
                <p className="mb-1 text-[10.5px] font-bold uppercase tracking-wide text-charcoal/55">Why it is held</p>
                <ul className="flex flex-wrap gap-1.5">
                  {r.reasons.map((x, i) => <li key={i} title={x.detail || ''} className={`rounded-lg border px-2.5 py-1 text-xs font-semibold ${TONE[x.tone] || TONE.warning}`}>{x.text}{x.detail && <span className="font-normal opacity-75"> · {x.detail}</span>}</li>)}
                  {!r.reasons.length && <li className="text-xs text-charcoal/55">No blocker found on the PO - add the reason below.</li>}
                </ul>
              </div>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-[#FBF7ED] px-3 py-2">
                <p className="min-w-0 text-sm">{r.note ? <><b>In Transit's reason:</b> {r.note.text} <span className="text-xs text-charcoal/55">({r.note.byName}, {stamp(r.note.at)})</span></> : <span className="text-charcoal/55">No reason written by In Transit yet.</span>}</p>
                <span className="flex gap-2">
                  {canNote && <Button size="sm" variant="outline" onClick={() => setNoting(r)}><Pencil size={13} />{r.note ? 'Edit reason' : 'Add reason'}</Button>}
                  <Link to={`/admin/purchase-orders/${r.poId}`}><Button size="sm">Open PO</Button></Link>
                </span>
              </div>
            </article>
          );
        })}
      </div>
      <Modal open={Boolean(noting)} onClose={() => setNoting(null)} title="Why is it not delivered?" className="max-w-lg">
        {noting && <NoteForm row={noting} onCancel={() => setNoting(null)} onSaved={() => { setNoting(null); load(); }} />}
      </Modal>
    </div>
  );
}
