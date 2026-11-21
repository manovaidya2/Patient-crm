import { useCallback, useEffect, useState } from 'react';
import { ChevronDown, FileSignature, RefreshCw, Search } from 'lucide-react';
import api from '../../api/axios.js';
import useLiveEvent from '../../api/useLiveEvent.js';
import { PageHeader } from '../../components/ui/Layout.jsx';
import { EarlierVersions, LinkBox, SignedPaper, STATUS } from '../../components/postcounseling/DigitalPoPanel.jsx';
import { rupees, whenText } from '../../components/digitalPo/DigitalPoPaper.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { ROLES } from '../../constants/roles.js';

// Digital PO: every digital purchase order the parents submitted (consent + signature), newest first, with the links
// still waiting for a signature in their own tab. A Post Counselor sees their own visits'; the Admin, Manager and
// Doctor everyone's. A row opens the signed paper.
const VIEWS = [['signed', 'Submitted'], ['waiting', 'Waiting for signature'], ['all', 'All']];
const field = 'rounded-lg border border-cardline bg-white px-3 py-2 text-[13px] outline-none focus:border-sage';

function Row({ item, consentItems }) {
  const [open, setOpen] = useState(false);
  const [label, tone, Icon] = STATUS[item.status] || STATUS.sent;
  const p = item.snapshot?.patient || {};
  return (
    <li className="rounded-xl border border-cardline bg-white">
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="grid w-full gap-2 px-3 py-2.5 text-left transition hover:bg-[#FBF7ED] md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1.1fr)_auto] md:items-center">
        <span className="min-w-0">
          <span className="block truncate text-[14px] font-bold text-charcoal">{p.name || '—'}</span>
          <span className="block text-[11.5px] text-charcoal/55">{[p.patientId, p.program, p.phase ? `Phase ${p.phase}` : ''].filter(Boolean).join(' · ')}</span>
        </span>
        <span className="text-[12.5px]">
          <span className="block font-semibold text-charcoal">{item.ref}{item.version > 1 && <span className="ml-1.5 rounded bg-[#E6EEF8] px-1.5 text-[10.5px] font-bold text-[#24476F]">v{item.version}</span>}</span>
          <span className="block text-charcoal/60">Fee {rupees(item.snapshot?.approvedFee)}{item.snapshot?.paymentPlan ? ` · ${item.snapshot.paymentPlan}` : ''}</span>
        </span>
        <span className="text-[12.5px] text-charcoal/75">
          {item.signed
            ? <><b>{item.signed.signerName}</b> ({item.signed.relation})<span className="block text-[11.5px] text-charcoal/55">Signed {whenText(item.signed.at)}</span></>
            : <>Made {whenText(item.createdAt)}<span className="block text-[11.5px] text-charcoal/55">{item.openedAt ? `Opened ${item.openCount}×` : 'Not opened yet'}</span></>}
          <span className="block text-[11px] text-charcoal/45">Post-counsellor: {p.counsellor || item.createdByName}</span>
        </span>
        <span className="flex items-center gap-2 md:justify-end">
          <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11.5px] font-bold ${tone}`}><Icon size={12} />{item.status === 'signed' ? 'Submitted' : label}</span>
          <ChevronDown size={16} className={`text-charcoal/40 transition ${open ? 'rotate-180' : ''}`} />
        </span>
      </button>
      {open && (
        <div className="border-t border-cardline px-3 pb-3">
          {item.status === 'signed' && <div className="mt-3 rounded-xl bg-[#EEF3F0] p-2 sm:p-4"><SignedPaper item={item} consentItems={consentItems} /></div>}
          {item.status === 'sent' && <LinkBox item={item} patientName={p.name} />}
          {item.status === 'expired' && <p className="mt-2 text-[12.5px] text-charcoal/60">The link expired on {whenText(item.expiresAt)} without a signature. Make a new one from the post-counselling record.</p>}
          {item.status === 'deleted' && <p className="mt-2 text-[12.5px] text-[#8A1C25]">Deleted by {item.deletedByName} · {whenText(item.deletedAt)} — the link no longer works.</p>}
          {item.status === 'replaced' && <p className="mt-2 text-[12.5px] text-charcoal/60">Stopped {whenText(item.replacedAt)} by {item.replacedByName}: a newer link was made.</p>}
          {item.editedAt && <p className="mt-2 text-[11.5px] text-charcoal/50">Updated by {item.editedByName} · {whenText(item.editedAt)}</p>}
          {(item.history || []).length > 0 && <div className="mt-3"><EarlierVersions item={item} consentItems={consentItems} /></div>}
        </div>
      )}
    </li>
  );
}

export default function DigitalPurchaseOrders() {
  const { user } = useAuth();
  const [view, setView] = useState('signed');
  const [q, setQ] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const params = { view };
      if (q.trim()) params.q = q.trim();
      if (from) params.from = from;
      if (to) params.to = to;
      const { data: res } = await api.get('/digital-po', { params, skipCache: true });
      setData(res);
    } catch (e) { setError(e.response?.data?.message || 'Could not load the digital purchase orders'); }
    finally { setLoading(false); }
  }, [view, q, from, to]);
  useEffect(() => { const timer = window.setTimeout(load, 250); return () => window.clearTimeout(timer); }, [load]);
  // A parent submitted (or a link was made): the list refreshes by itself.
  useLiveEvent('post-counseling:changed', (payload) => { if (payload) load(); });

  const items = data?.items || [];
  const counts = data?.counts || {};
  return (
    <div className="space-y-4">
      <PageHeader icon={FileSignature} title="Digital PO" subtitle={`Purchase orders the parents opened on the link, ticked the consent and signed${user?.role === ROLES.POST_COUNSELOR ? ' — your patients' : ''}. Open a row for the signed paper.`}
        actions={<button type="button" onClick={load} disabled={loading} className="inline-flex items-center gap-1.5 rounded-lg border border-cardline bg-white px-3 py-2 text-[12.5px] font-bold text-charcoal/75 hover:border-sage disabled:opacity-50"><RefreshCw size={14} className={loading ? 'animate-spin' : ''} />Refresh</button>} />

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1 rounded-xl border border-cardline bg-white p-1">
          {VIEWS.map(([key, label]) => {
            const count = key === 'signed' ? counts.signed : key === 'waiting' ? counts.waiting : null;
            return (
              <button key={key} type="button" aria-pressed={view === key} onClick={() => setView(key)} className={`rounded-lg px-3 py-1.5 text-[13px] font-bold transition ${view === key ? 'bg-[#1F5F4A] text-white' : 'text-charcoal/60 hover:bg-[#EEF3F0]'}`}>
                {label}{count != null && <span className={`ml-1.5 rounded-full px-1.5 text-[11px] ${view === key ? 'bg-white/25' : 'bg-charcoal/[0.08]'}`}>{count}</span>}
              </button>
            );
          })}
        </div>
        <label className="relative min-w-[220px] flex-1">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-charcoal/40" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Patient name, patient ID, DPO number or signer" className={`${field} w-full pl-9`} />
        </label>
        <label className="flex items-center gap-1.5 text-[12px] font-semibold text-charcoal/60">From<input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={field} /></label>
        <label className="flex items-center gap-1.5 text-[12px] font-semibold text-charcoal/60">To<input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={field} /></label>
      </div>

      {error && <p className="rounded-lg border border-[#B4232F]/30 bg-[#FDF0F0] px-3 py-2 text-[13px] font-semibold text-[#8A1C25]">{error}</p>}
      {!data && loading ? <p className="py-10 text-center text-sm text-charcoal/55">Loading...</p> : items.length ? (
        <ul className="space-y-2">{items.map((item) => <Row key={item.id} item={item} consentItems={data.consentItems || []} />)}</ul>
      ) : (
        <p className="rounded-xl border border-dashed border-cardline bg-white/60 px-4 py-10 text-center text-sm text-charcoal/55">
          {view === 'signed' ? 'No digital purchase order has been submitted yet.' : view === 'waiting' ? 'No link is waiting for a signature.' : 'No digital purchase order yet.'}
          {' '}A digital PO is made from the post-counselling record ("Create digital PO").
        </p>
      )}
      {items.length >= 500 && <p className="text-center text-[12px] text-charcoal/50">Showing the latest 500 — search or pick dates to find older ones.</p>}
    </div>
  );
}
