import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { BellRing, Check, MessageCircle, X } from 'lucide-react';
import api from '../../api/axios.js';
import useLiveEvent from '../../api/useLiveEvent.js';
import Button from '../ui/Button.jsx';
import Modal from '../ui/Modal.jsx';
import SirenAlarm from '../alarms/SirenAlarm.jsx';

// Team Chat alarm: any member rings another for something important. The person rung gets the siren on their screen
// (live, and on every login / refresh, snooze 20 min) until they answer "I'm on it" or the sender cancels.
const when = (v) => (v ? new Date(v).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '');

// The siren, for whoever is signed in (mounted once in the layout).
export function ChatAlarmSiren({ user }) {
  const [answering, setAnswering] = useState(null);
  const answer = async (alarm, note, recheck) => {
    await api.post(`/team-chat/alarms/${alarm.id}/ack`, { note }).catch(() => {});
    setAnswering(null);
    recheck();
  };
  return (
    <SirenAlarm
      user={user}
      name="team-chat"
      url="/team-chat/alarms/mine"
      liveEvent="chat:alarm"
      title="Someone needs you now"
      intro={(alarms) => `${alarms.length === 1 ? `${alarms[0].fromName} rang` : `${alarms.length} people rang`} your alarm from Team Chat for something important.`}
      renderItem={(a, snooze, recheck) => (
        <div className="w-full">
          <p><b>{a.fromName}</b> <span className="text-xs text-charcoal/55">· {when(a.at)}</span></p>
          <p className="text-sm font-bold text-[#B91C1C]">{a.reason}</p>
          {answering === a.id ? (
            <form className="mt-2 flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); answer(a, e.currentTarget.note.value, recheck); }}>
              <input name="note" maxLength={500} placeholder="Reply (optional), e.g. Doing it in 10 minutes" className="min-w-0 flex-1 rounded-lg border border-cardline bg-white px-2.5 py-1.5 text-sm" />
              <Button type="submit" size="sm"><Check size={13} />Send</Button>
            </form>
          ) : (
            <div className="mt-2 flex flex-wrap gap-2">
              <Button size="sm" onClick={() => setAnswering(a.id)}><Check size={13} />I&apos;m on it</Button>
              <Link to={`/admin/team-chat?with=${a.fromId}`} onClick={snooze}><Button size="sm" variant="outline"><MessageCircle size={13} />Open chat</Button></Link>
            </div>
          )}
        </div>
      )}
    />
  );
}

// "Ring alarm" in a chat with one person: shows if my alarm is still ringing for them (cancel), or their answer.
export function RingAlarmButton({ person }) {
  const [last, setLast] = useState(null);
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const load = useCallback(() => {
    api.get('/team-chat/alarms/sent', { skipCache: true }).then(({ data }) => setLast((data.alarms || []).find((a) => a.toId === person.id) || null)).catch(() => {});
  }, [person.id]);
  useEffect(() => { load(); }, [load]);
  useLiveEvent('chat:alarm-updated', load);
  const ring = async (e) => {
    e.preventDefault();
    setBusy(true); setError('');
    try { const { data } = await api.post('/team-chat/alarms', { toUserId: person.id, reason }); setLast(data.alarm); setOpen(false); setReason(''); }
    catch (err) { setError(err.response?.data?.message || 'Could not ring the alarm'); }
    finally { setBusy(false); }
  };
  const cancel = async () => {
    try { const { data } = await api.post(`/team-chat/alarms/${last.id}/cancel`); setLast(data.alarm); } catch { /* stays as it was */ }
  };
  const ringing = last?.status === 'ringing';
  return (
    <>
      {ringing ? (
        <span className="inline-flex items-center gap-1.5 rounded-lg border border-[#FCA5A5] bg-[#FEF2F2] px-2.5 py-1.5 text-xs font-bold text-[#B91C1C]" title={last.reason}>
          <BellRing size={14} className="animate-pulse" />Ringing since {when(last.at)}
          <button type="button" onClick={cancel} className="ml-1 rounded p-0.5 hover:bg-[#FDE2E1]" aria-label="Cancel the alarm" title="Cancel the alarm"><X size={13} /></button>
        </span>
      ) : (
        <>
          {last?.status === 'acknowledged' && <span className="hidden text-[11px] text-emerald-800 sm:inline" title={last.ackNote}>✓ Answered {when(last.ackAt)}{last.ackNote ? `: ${last.ackNote}` : ''}</span>}
          <Button size="sm" variant="outline" onClick={() => { setOpen(true); setError(''); }} className="!border-[#FCA5A5] !text-[#B91C1C]"><BellRing size={15} />Ring alarm</Button>
        </>
      )}
      <Modal open={open} onClose={() => !busy && setOpen(false)} title={`Ring ${person.name}'s alarm`} className="max-w-md">
        <form onSubmit={ring} className="space-y-3">
          <p className="text-sm text-charcoal/70">A loud siren rings on {person.name}&apos;s screen until they answer. Use it only for something important.</p>
          <label className="block text-sm font-medium">Why (the urgent work) *<textarea className="mt-1 w-full rounded-lg border border-cardline bg-white px-3 py-2 text-sm" rows={3} required maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Quality check of PO-2420 pending since morning, patient waiting" /></label>
          {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
          <div className="flex justify-end gap-2"><Button type="button" variant="outline" disabled={busy} onClick={() => setOpen(false)}>Cancel</Button><Button type="submit" disabled={busy || !reason.trim()} className="!bg-[#B91C1C]"><BellRing size={15} />{busy ? 'Ringing...' : 'Ring now'}</Button></div>
        </form>
      </Modal>
    </>
  );
}
