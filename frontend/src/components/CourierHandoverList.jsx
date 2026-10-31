import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bike, CalendarClock, ExternalLink, Inbox, RefreshCw, Store, Truck } from 'lucide-react';
import useApiQuery from '../api/useApiQuery.js';
import Button from './ui/Button.jsx';
import { PageHeader } from './ui/Layout.jsx';
import { CompactAttachments } from './ui/Attachments.jsx';
import { DelayTable } from './medicine/MedicineDelay.jsx';

const MODE = { pickup: { label: 'Self pickup', icon: Store }, porter: { label: 'Porter', icon: Bike }, courier: { label: 'Courier', icon: Truck } };
const money = (value) => `Rs ${Number(value || 0).toLocaleString('en-IN')}`;
const when = (value) => (value ? new Date(value).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '');
const dayStart = (value) => { const d = new Date(value); d.setHours(0, 0, 0, 0); return d; };
// How the expected dispatch / pickup date stands today.
const dueText = (at) => {
  if (!at) return ['', ''];
  const days = Math.round((dayStart(at) - dayStart(new Date())) / 86400000);
  if (days < 0) return [`${-days} day${days === -1 ? '' : 's'} late`, 'bg-[#FDE2E1] text-[#9F1D1D]'];
  if (days === 0) return ['Today', 'bg-[#FFF1E6] text-[#C2410C]'];
  return [`In ${days} day${days === 1 ? '' : 's'}`, 'bg-[#E6F2EA] text-[#1F6B41]'];
};
const Row = ({ label, value }) => (value ? <p className="text-[12.5px]"><span className="text-charcoal/55">{label}: </span><span className="font-medium text-charcoal">{value}</span></p> : null);

// Courier Requests (to send) and Delivered Couriers, both read from the PO / In Transit timeline: a medicine shows up
// here once In Transit has scheduled it (courier, porter or self pickup with the expected date) and moves to delivered
// by itself when it is dispatched or collected. Dispatch / receipt are done on the PO timeline.
export default function CourierHandoverList({ section, title, subtitle, emptyText }) {
  const { data, loading, error, refresh } = useApiQuery('/courier/handovers', { params: { section } });
  const [search, setSearch] = useState('');
  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (data?.rows || []).filter((r) => !q || [r.patientName, r.patientCode, r.poNumber, r.patientPhone, r.courier?.tracking].some((v) => String(v || '').toLowerCase().includes(q)));
  }, [data, search]);
  return (
    <div className="space-y-4">
      <PageHeader icon={Truck} title={title} subtitle={subtitle} actions={<Button variant="outline" size="sm" onClick={refresh} aria-label="Refresh"><RefreshCw size={15} />Refresh</Button>} />
      <input className="w-full max-w-md rounded-lg border border-cardline bg-white px-3 py-2 text-sm" placeholder="Search patient, ID, PO, phone or tracking" value={search} onChange={(e) => setSearch(e.target.value)} />
      {error && <p role="alert" className="text-sm text-red-700">{error.response?.data?.message || 'Could not load'}</p>}
      {loading && !data ? <p className="text-sm text-charcoal/60">Loading...</p> : !rows.length ? (
        <div className="flex flex-col items-center gap-2 rounded-[14px] border border-dashed border-cardline bg-white p-10 text-center"><Inbox size={22} className="text-charcoal/35" /><p className="text-sm text-charcoal/60">{emptyText}</p></div>
      ) : (
        <div className="space-y-3">
          {rows.map((r) => {
            const mode = MODE[r.mode] || MODE.courier;
            const Icon = mode.icon;
            const [due, dueTone] = section === 'pending' ? dueText(r.expectedAt) : ['', ''];
            const c = r.courier || {};
            return (
              <article key={r.poId} className={`grid gap-4 rounded-[14px] border bg-white p-4 lg:grid-cols-[1.1fr_1.2fr_auto] ${due.includes('late') ? 'border-[#F5B5B0]' : 'border-[#E8DFCB]'}`}>
                <div className="min-w-0">
                  <Link to={`/admin/patients/${r.patientId}`} className="font-display text-base font-bold text-charcoal hover:text-sage">{r.patientName}</Link>
                  <p className="text-xs text-charcoal/60">{[r.patientCode, r.patientPhone, `Phase ${r.phase}`].filter(Boolean).join(' · ')}</p>
                  <p className="mt-1 text-xs"><Link to={`/admin/purchase-orders/${r.poId}`} className="font-mono font-bold text-sage hover:underline">{r.poNumber}</Link>{r.supplyLabel ? <span className="text-charcoal/60"> · {r.supplyLabel}</span> : ''}</p>
                  <p className="mt-1.5 text-xs text-charcoal/65">Medicine: <b className="text-charcoal">{r.medicine.label}</b>{r.medicine.requestedAt ? ` · requested ${when(r.medicine.requestedAt)}` : ''}</p>
                  <p className="text-xs text-charcoal/65">Payment on this PO: <b className={r.payment?.remaining > 0 || r.payment?.pendingCount ? 'text-[#C2410C]' : 'text-[#1F6B41]'}>{r.payment?.remaining > 0 ? `Balance ${money(r.payment.remaining)}` : r.payment?.pendingCount ? `${r.payment.pendingCount} payment(s) to verify` : 'Full payment verified'}</b></p>
                </div>
                <div className="min-w-0 space-y-0.5">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-bold text-charcoal"><Icon size={16} className="text-sage" />{mode.label}{due && <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${dueTone}`}>{due}</span>}</p>
                  {section === 'pending' ? <>
                    <Row label={r.mode === 'pickup' ? 'Expected pickup' : 'Expected dispatch'} value={when(r.expectedAt)} />
                    {r.mode !== 'pickup' && <Row label={r.mode === 'porter' ? 'Porter' : 'Courier'} value={r.plannedCourier} />}
                    {r.mode !== 'pickup' && <Row label="Address" value={r.plannedAddress} />}
                    <Row label="Note" value={r.planNote} />
                    <Row label="Medicine explanation" value={r.explanationAt ? `${when(r.explanationAt)}${r.explanationMode ? ` (${r.explanationMode})` : ''}${r.pcc ? ` · PCC ${r.pcc}` : ''}` : ''} />
                    <Row label="Scheduled" value={r.scheduledAt ? `${when(r.scheduledAt)}${r.scheduledByName ? ` by ${r.scheduledByName}` : ''}` : ''} />
                  </> : <>
                    <p className={`text-xs font-bold ${r.received ? 'text-[#1F6B41]' : 'text-[#C2410C]'}`}>{r.received ? 'Received by the patient' : 'On the way - receipt not confirmed yet'}</p>
                    {r.mode !== 'pickup' && <Row label="Sent" value={c.dispatchedAt ? `${when(c.dispatchedAt)}${c.dispatchedByName ? ` by ${c.dispatchedByName}` : ''}` : ''} />}
                    {r.mode !== 'pickup' && <Row label={r.mode === 'porter' ? 'Porter' : 'Courier / tracking'} value={[c.partner, c.tracking].filter(Boolean).join(' / ')} />}
                    {r.mode !== 'pickup' && <Row label="Deliver to" value={[c.receiverName, c.receiverPhone].filter(Boolean).join(', ')} />}
                    {r.mode !== 'pickup' && <Row label="Address" value={c.address} />}
                    <Row label={r.mode === 'pickup' ? 'Collected by' : 'Received by'} value={c.receivedByName ? `${c.receivedByName}${c.deliveredAt ? `, ${when(c.deliveredAt)}` : ''}` : ''} />
                    <Row label="Note" value={c.notes} />
                    {r.medicine.requestedAt && (c.deliveredAt || c.dispatchedAt) && <Row label="Request to patient" value={`${Math.max(0, Math.round((new Date(c.deliveredAt || c.dispatchedAt) - new Date(r.medicine.requestedAt)) / 86400000))} day(s)`} />}
                    <CompactAttachments files={c.packageImages} label="Package" />
                    <CompactAttachments files={c.deliveryProofImages} label="Delivery proof" />
                  </>}
                  {r.delay && <DelayTable delay={r.delay} className="mt-2" />}
                </div>
                <div className="flex flex-col items-start gap-2 lg:items-end">
                  {section === 'pending' && r.nextStep && <p className="max-w-[240px] text-xs text-charcoal/65 lg:text-right"><CalendarClock size={13} className="mr-1 inline text-sage" /><b className="text-charcoal">{r.nextStep.label}</b>{r.nextStep.waitText ? `: ${r.nextStep.waitText}` : ''}</p>}
                  <Link to={`/admin/purchase-orders/${r.poId}`}><Button size="sm"><ExternalLink size={14} />{section === 'pending' ? 'Open PO timeline' : 'View on PO'}</Button></Link>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
