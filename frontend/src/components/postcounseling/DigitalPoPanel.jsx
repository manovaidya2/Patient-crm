import { useEffect, useState } from 'react';
import { CheckCircle2, Clock, Copy, ExternalLink, Eye, FileSignature, MessageCircle, RefreshCw, Trash2, XCircle } from 'lucide-react';
import api from '../../api/axios.js';
import Button from '../ui/Button.jsx';
import DigitalPoPaper, { whenText } from '../digitalPo/DigitalPoPaper.jsx';

// Under the post-counselling record: the visit's one digital purchase order. Its link (copy / WhatsApp it to the
// parent, see if it was opened), the signed paper with the consent and signature once the parent submits, and the
// earlier signed versions when it was updated after signing.
export const STATUS = {
  sent: ['Waiting for the parent to sign', 'bg-[#FFF4E0] text-[#8A4B00]', Clock],
  signed: ['Signed by the parent', 'bg-[#DCF0E3] text-[#166534]', CheckCircle2],
  expired: ['Link expired', 'bg-charcoal/[0.08] text-charcoal/60', Clock],
  replaced: ['Replaced by a newer link', 'bg-charcoal/[0.08] text-charcoal/60', Clock],
  deleted: ['Deleted — link not active', 'bg-[#FDECEC] text-[#8A1C25]', XCircle],
};
const linkOf = (token) => `${window.location.origin}/po/${token}`;
const phoneOf = (fields = {}) => {
  const digits = String(fields.whatsappNumber || fields.fatherNumber || fields.motherNumber || '').replace(/\D/g, '');
  return digits.length === 10 ? `91${digits}` : digits;
};

// The signature image (staff only): fetched with the login, shown from memory.
function useSignature(id, version = 0) {
  const [src, setSrc] = useState('');
  useEffect(() => {
    let url = '';
    let live = true;
    api.get(`/digital-po/${id}/signature${version ? `?version=${version}` : ''}`, { responseType: 'blob', skipCache: true })
      .then(({ data }) => { if (!live) return; url = URL.createObjectURL(data); setSrc(url); })
      .catch(() => {});
    return () => { live = false; if (url) URL.revokeObjectURL(url); };
  }, [id, version]);
  return src;
}

// version: an earlier signed version of the same purchase order (its own content and signature).
export function SignedPaper({ item, consentItems, version = 0 }) {
  const src = useSignature(item.id, version);
  const v = version || item.version || 1;
  return <DigitalPoPaper snapshot={item.snapshot} refNo={v > 1 ? `${item.ref} · v${v}` : item.ref} consentItems={consentItems} signed={item.signed} signatureSrc={src} />;
}

// An open link: copy it, send it on WhatsApp, open it; whether the parent opened it.
export function LinkBox({ item, fields = {}, patientName = '' }) {
  const [copied, setCopied] = useState(false);
  const link = item.token ? linkOf(item.token) : '';
  const copy = async () => {
    try { await navigator.clipboard.writeText(link); } catch { window.prompt('Copy this link', link); }
    setCopied(true); window.setTimeout(() => setCopied(false), 2000);
  };
  const message = `Namaste, ${patientName || 'aapke bachche'} ka Manovaidya purchase order: ${link}\nKripya link kholkar padhein, sahmati (consent) par tick karein aur sign karke Submit karein.`;
  const phone = phoneOf(fields);
  return (
    <div className="mt-2 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <input readOnly value={link} onFocus={(e) => e.target.select()} className="min-w-0 flex-1 rounded-lg border border-cardline bg-offwhite-200 px-3 py-2 text-[12.5px] text-charcoal" />
        <Button size="sm" variant="outline" onClick={copy}><Copy size={14} />{copied ? 'Copied' : 'Copy link'}</Button>
        <Button size="sm" onClick={() => window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, '_blank', 'noopener')}><MessageCircle size={14} />WhatsApp{phone ? '' : ' (choose chat)'}</Button>
        <Button size="sm" variant="outline" onClick={() => window.open(link, '_blank', 'noopener')}><ExternalLink size={14} />Open</Button>
      </div>
      <p className="text-[12px] text-charcoal/60">{item.openedAt ? `Opened by the parent ${item.openCount}× (first ${whenText(item.openedAt)})` : 'Not opened yet'} · link works till {whenText(item.expiresAt)}</p>
    </div>
  );
}

// The signed versions before the current one (updated after signing), and links made before one-per-visit.
export function EarlierVersions({ item, others = [], consentItems }) {
  const [openKey, setOpenKey] = useState('');
  const list = [
    ...[...(item?.history || [])].reverse().filter((h) => h.signed).map((h) => ({ key: `v${h.version}`, id: item.id, ref: item.ref, version: h.version, snapshot: h.snapshot, signed: h.signed, note: `updated ${whenText(h.replacedAt)} by ${h.replacedByName}` })),
    ...others.filter((o) => o.signed).map((o) => ({ key: o.id, id: o.id, ref: o.ref, version: 0, snapshot: o.snapshot, signed: o.signed, note: 'an earlier link' })),
  ];
  if (!list.length) return null;
  return (
    <details className="rounded-xl border border-cardline bg-white/60 p-3">
      <summary className="cursor-pointer text-[13px] font-bold text-charcoal">Earlier signed versions ({list.length})</summary>
      <ul className="mt-2 space-y-2">
        {list.map((v) => (
          <li key={v.key} className="rounded-lg border border-cardline bg-white p-2.5 text-[12.5px]">
            <p><b>{v.version ? `v${v.version}` : v.ref}</b> · signed by <b>{v.signed.signerName}</b> ({v.signed.relation}) on {whenText(v.signed.at)} <span className="text-charcoal/50">· {v.note}</span></p>
            <button type="button" onClick={() => setOpenKey(openKey === v.key ? '' : v.key)} className="mt-1 inline-flex items-center gap-1 text-[12px] font-bold text-[#1F5F4A] underline"><Eye size={13} />{openKey === v.key ? 'Hide' : 'View this signed version'}</button>
            {openKey === v.key && <div className="mt-2 rounded-xl bg-[#EEF3F0] p-2 sm:p-4"><SignedPaper item={v} consentItems={consentItems} version={v.version} /></div>}
          </li>
        ))}
      </ul>
    </details>
  );
}

// The visit's digital purchase order as it stands now.
export function CurrentPo({ item, consentItems, fields, patientName, canUpdate = false, onDelete = null }) {
  const [open, setOpen] = useState(item.status === 'signed');
  const [deleting, setDeleting] = useState(false);
  // Not signed yet: it can be taken back (the link stops working at once).
  const remove = async () => {
    if (!window.confirm(`Delete ${item.ref}? The link stops working at once: the parent can no longer open or sign it. You can create a new digital PO later.`)) return;
    setDeleting(true);
    try { await onDelete(); } finally { setDeleting(false); }
  };
  const [label, tone, Icon] = STATUS[item.status] || STATUS.sent;
  return (
    <div className="rounded-xl border border-sage/50 bg-white p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-bold text-charcoal">{item.ref}</span>
        {item.version > 1 && <span className="rounded bg-[#E6EEF8] px-1.5 py-0.5 text-[11px] font-bold text-[#24476F]" title="Updated after it was made">v{item.version}</span>}
        <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11.5px] font-bold ${tone}`}><Icon size={12} />{label}</span>
        <span className="ml-auto text-right text-[11.5px] text-charcoal/50">Made by {item.createdByName} · {whenText(item.createdAt)}{item.editedAt && <span className="block">Updated by {item.editedByName} · {whenText(item.editedAt)}</span>}</span>
      </div>
      {item.status === 'sent' && <LinkBox item={item} fields={fields} patientName={patientName} />}
      {onDelete && ['sent', 'expired'].includes(item.status) && (
        <div className="mt-2 flex justify-end"><Button size="sm" variant="outline" className="border-[#B4232F]/40 text-[#8A1C25]" disabled={deleting} onClick={remove}><Trash2 size={14} />{deleting ? 'Deleting...' : 'Delete — stop the link'}</Button></div>
      )}
      {item.status === 'expired' && <p className="mt-2 text-[12.5px] font-semibold text-[#8A4B00]">The link expired on {whenText(item.expiresAt)} without a signature.{canUpdate ? ' Press "Update digital PO" below: the same link works again for 30 days.' : ''}</p>}
      {item.status === 'signed' && (
        <div className="mt-2">
          <p className="text-[13px]"><b>{item.signed.signerName}</b> ({item.signed.relation}) signed on {whenText(item.signed.at)}{item.signed.signatureKind === 'photo' ? ' · signature photo' : ''}</p>
          <button type="button" onClick={() => setOpen(!open)} className="mt-1 inline-flex items-center gap-1 text-[12.5px] font-bold text-[#1F5F4A] underline"><Eye size={13} />{open ? 'Hide the signed purchase order' : 'View the signed purchase order'}</button>
          {open && <div className="mt-3 rounded-xl bg-[#EEF3F0] p-2 sm:p-4"><SignedPaper item={item} consentItems={consentItems} /></div>}
        </div>
      )}
      {canUpdate && <p className="mt-2 border-t border-cardline pt-2 text-[11.5px] text-charcoal/55">To change it: correct sections C / E above, Save, then press "Update digital PO". The same number and link then show the new purchase order{item.status === 'signed' ? ', and the parent signs again (this signed version is kept)' : ''}.</p>}
    </div>
  );
}

export default function DigitalPoPanel({ digitalPo, fields, patientName, onReload, panelRef, canUpdate = false, onDelete = null }) {
  const items = digitalPo?.items || [];
  // One per visit: the current one (links made before one-per-visit are only kept as earlier signed versions; deleted
  // ones are listed below, their links no longer work).
  const current = items.find((item) => !['replaced', 'deleted'].includes(item.status)) || null;
  const others = items.filter((item) => item !== current && item.status !== 'deleted');
  const deleted = items.filter((item) => item.status === 'deleted');
  const [busy, setBusy] = useState(false);
  const reload = async () => { setBusy(true); try { await onReload?.(); } finally { setBusy(false); } };
  return (
    <section ref={panelRef} className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 border-l-4 border-sage bg-sage/10 px-4 py-2.5">
        <h3 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-charcoal"><FileSignature size={16} />Digital purchase order</h3>
        {onReload && current && <button type="button" onClick={reload} disabled={busy} className="inline-flex items-center gap-1 text-[12px] font-bold text-[#1F5F4A] disabled:opacity-50"><RefreshCw size={13} className={busy ? 'animate-spin' : ''} />Check again</button>}
      </div>
      {current ? (
        <>
          <CurrentPo key={`${current.id}:${current.version}:${current.status}`} item={current} consentItems={digitalPo.consentItems || []} fields={fields} patientName={patientName} canUpdate={canUpdate} onDelete={onDelete} />
          <EarlierVersions item={current} others={others} consentItems={digitalPo.consentItems || []} />
        </>
      ) : others.some((item) => item.signed) ? <EarlierVersions item={null} others={others} consentItems={digitalPo.consentItems || []} /> : <p className="text-sm text-charcoal/60">No digital purchase order yet. "Create digital PO" (below) makes one link for this visit: the parent opens it on their phone, ticks the consent and signs with a finger (or uploads a photo of the signature). The signed paper then shows here.</p>}
      {deleted.length > 0 && <p className="text-[11.5px] text-charcoal/50">Deleted (link not active): {deleted.map((item) => `${item.ref} by ${item.deletedByName}, ${whenText(item.deletedAt)}`).join(' · ')}</p>}
    </section>
  );
}
