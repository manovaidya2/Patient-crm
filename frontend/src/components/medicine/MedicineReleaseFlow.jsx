import { useState } from 'react';
import api from '../../api/axios.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { ROLES, isAdminLike } from '../../constants/roles.js';
import { formatBoxReceiptTime as when } from './MedicineBoxReceipt.jsx';
import Button from '../ui/Button.jsx';
import ReleasePaymentReview from './ReleasePaymentReview.jsx';

const labels = { awaiting_request: 'Waiting for In Transit release request', requested: 'Release requested — waiting for Medicine Department', accepted: 'Payment checked — request accepted', cancelled: 'Release request cancelled', released: 'Medicine released' };
const statuses = [['waiting_for_payment', 'Waiting for payment'], ['patient_not_ready', 'Patient not ready'], ['waiting_for_collection', 'Waiting for collection'], ['ready_to_request', 'Ready to request release']];
const input = 'w-full rounded-lg border border-cardline bg-white px-3 py-2 text-sm';

export default function MedicineReleaseFlow({ job, onSaved }) {
  const { user } = useAuth();
  const [notes, setNotes] = useState('');
  const [status, setStatus] = useState('waiting_for_payment');
  const [days, setDays] = useState(7);
  const [ticks, setTicks] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [paymentVerified, setPaymentVerified] = useState(false);
  const flow = job.releaseRequest;
  if (!flow) return <p className="text-sm text-charcoal/60">Release follow-up starts after the final verification check.</p>;
  const available = job.status === 'ready' && !job.hold;
  const transit = available && (user?.role === ROLES.IN_TRANSIT || isAdminLike(user));
  const medicine = available && (user?.role === ROLES.MEDICINE_DEPARTMENT || isAdminLike(user));
  const release = job.stages.find((s) => s.key === 'release');
  const act = async (action) => {
    setBusy(true); setError('');
    try {
      const url = action === 'release' ? `/medicine-jobs/${job.id}/stages/release` : `/medicine-jobs/${job.id}/release-request/${action}`;
      const body = action === 'release' ? { checks: release.checks.map((_, i) => Boolean(ticks[i])), fields: {}, notes } : { notes, status, days: Number(days) };
      const { data } = await api.post(url, body);
      if (action === 'reopen') setPaymentVerified(false);
      setNotes(''); await onSaved?.(data.job);
    } catch (err) { if (action === 'request') setPaymentVerified(false); setError(err.response?.data?.message || 'Could not update the release request'); }
    finally { setBusy(false); }
  };
  return (
    <div className="space-y-3 text-sm text-charcoal">
      <p className={`rounded-lg px-3 py-2 font-semibold ${flow.state === 'released' || flow.state === 'accepted' ? 'bg-emerald-50 text-emerald-900' : flow.state === 'cancelled' || (flow.needsTransitAction && flow.overdue) ? 'bg-red-50 text-red-800' : 'bg-[#FBF7ED]'}`}>{labels[flow.state]}</p>
      <div className="space-y-1 text-xs text-charcoal/75">
        <p>Final verification: {when(flow.startedAt)}</p>
        <p>In Transit action deadline: <b>{when(flow.deadlineAt)}</b>{flow.needsTransitAction ? flow.overdue ? ' · Overdue — cancel or extend the release request' : ` · ${flow.daysLeft} day(s) left` : ''}</p>
        {flow.followupLabel && <p>Status: <b>{flow.followupLabel}</b> · {flow.statusUpdatedByName} · {when(flow.statusUpdatedAt)}</p>}
        {flow.requestedAt && <p>Release requested by {flow.requestedByName} · {when(flow.requestedAt)}{flow.requestNote ? ` · ${flow.requestNote}` : ''}</p>}
        {flow.transitPaymentVerifiedAt && <p>Payment reviewed by In Transit: {flow.transitPaymentVerifiedByName} · {when(flow.transitPaymentVerifiedAt)}</p>}
        {flow.acceptedAt && <p>Payment verified and accepted by {flow.acceptedByName} · {when(flow.acceptedAt)}</p>}
        {flow.paymentSnapshot && <p>Payment at acceptance: paid ₹{flow.paymentSnapshot.amountPaid} · balance ₹{flow.paymentSnapshot.remaining} · {flow.paymentSnapshot.pendingCount} pending</p>}
        {(flow.cancellations || []).map((c, i) => <p key={`cancel-${i}`} className="text-red-800">Release request cancelled by <b>{c.byName}</b> · {when(c.at)} · {c.reason}</p>)}
        {flow.reopenedAt && <p>Requested again by {flow.reopenedByName} · {when(flow.reopenedAt)} · payment review required before sending</p>}
        {flow.releasedAt && <p>Released · {when(flow.releasedAt)}</p>}
        {flow.extensions.map((e, i) => <p key={i}>Extended {e.days} day(s) by {e.byName} · {when(e.at)} · new deadline {when(e.deadlineAt)} · {e.reason}</p>)}
      </div>
      {(transit && ['awaiting_request', 'cancelled'].includes(flow.state) || medicine && ['requested', 'accepted'].includes(flow.state)) && <label className="block space-y-1"><span>Notes / reason</span><textarea className={input} maxLength={2000} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></label>}
      {transit && flow.state === 'cancelled' && <div className="space-y-2">
        <p className="text-xs text-charcoal/65">The patient stays in this queue. To request again, enter a reason and extend the deadline, then review payment before sending the new request.</p>
        <div className="flex flex-wrap items-end gap-2"><label className="w-36 space-y-1"><span>Extend by days</span><input type="number" className={input} min={1} max={365} value={days} onChange={(e) => setDays(e.target.value)} /></label><Button disabled={busy || !notes.trim() || Number(days) < 1 || Number(days) > 365} onClick={() => act('reopen')}>{busy ? 'Reopening...' : 'Request again'}</Button></div>
      </div>}
      {transit && flow.state === 'awaiting_request' && <>
        <ReleasePaymentReview jobId={job.id} onVerified={setPaymentVerified} onSaved={onSaved} disabled={busy || flow.overdue} />
        <Button disabled={busy || flow.overdue || !paymentVerified} onClick={() => act('request')}>Request medicine release</Button>
        <div className="flex flex-wrap items-end gap-2">
          <label className="min-w-48 flex-1 space-y-1"><span>Follow-up status</span><select className={input} value={status} onChange={(e) => setStatus(e.target.value)}>{statuses.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
          <Button variant="outline" disabled={busy || flow.overdue} onClick={() => act('status')}>Update status</Button>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <label className="w-36 space-y-1"><span>Extend by days</span><input type="number" className={input} min={1} max={365} value={days} onChange={(e) => setDays(e.target.value)} /></label>
          <Button variant="outline" disabled={busy || !notes.trim() || Number(days) < 1 || Number(days) > 365} onClick={() => act('extend')}>Extend deadline</Button>
          {flow.overdue && <Button variant="outline" disabled={busy || !notes.trim()} onClick={() => act('cancel')}>Cancel release request</Button>}
        </div>
      </>}
      {(user?.role === ROLES.MEDICINE_DEPARTMENT || isAdminLike(user)) && ['requested', 'accepted', 'released'].includes(flow.state) && <ReleasePaymentReview jobId={job.id} readOnly />}
      {medicine && flow.state === 'requested' && <Button disabled={busy} onClick={() => act('accept')}>{busy ? 'Checking payment...' : 'Verify payment & accept request'}</Button>}
      {medicine && flow.state === 'accepted' && release && <div className="space-y-2">
        {release.checks.map((check, i) => <label key={check} className="flex items-start gap-2"><input type="checkbox" className="mt-1 accent-sage" checked={Boolean(ticks[i])} onChange={(e) => setTicks((old) => ({ ...old, [i]: e.target.checked }))} />{check}</label>)}
        <Button disabled={busy || !release.checks.every((_, i) => ticks[i])} onClick={() => act('release')}>{busy ? 'Releasing...' : 'Release medicine'}</Button>
      </div>}
      {job.hold && <p className="text-xs text-red-700">On hold: {job.hold.reason || job.hold}</p>}
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    </div>
  );
}
