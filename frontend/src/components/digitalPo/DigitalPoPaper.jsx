import { CheckSquare, Square } from 'lucide-react';

// The digital purchase order as a paper: the same on the parent's public page and on the staff side (where the
// signed consent and signature are shown under it). snapshot comes from the server (utils/digitalPo.snapshotOf).
export const rupees = (value) => `₹ ${Number(value || 0).toLocaleString('en-IN')}`;
const dayText = (day) => (day ? new Date(`${day}T00:00:00Z`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '');
export const whenText = (value) => (value ? new Date(value).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' }) : '');

const Heading = ({ n, children }) => (
  <h2 className="mb-2 mt-5 flex items-baseline gap-2 border-b border-[#D9E2DC] pb-1 font-display text-[15px] font-bold text-[#173F33]"><span className="text-[#1F5F4A]">{n}.</span>{children}</h2>
);
const Field = ({ label, value }) => (
  <div className="min-w-0 rounded-lg bg-[#F6F8F5] px-3 py-2">
    <p className="text-[10.5px] font-bold uppercase tracking-wide text-charcoal/50">{label}</p>
    <p className="break-words text-[14px] font-semibold text-charcoal">{value || '—'}</p>
  </div>
);

export default function DigitalPoPaper({ snapshot, refNo, consentItems = [], signed = null, signatureSrc = '', children = null }) {
  const s = snapshot || {};
  const p = s.patient || {};
  return (
    <article className="mx-auto w-full max-w-3xl rounded-2xl border border-[#D9E2DC] bg-white p-4 text-charcoal shadow-sm sm:p-7">
      <header className="flex items-start justify-between gap-3 border-b-2 border-[#1F5F4A] pb-3">
        <div className="flex min-w-0 items-center gap-3">
          <img src="/manovaidya-logo.jfif" alt="Manovaidya" className="h-11 w-11 shrink-0 rounded-lg object-cover" />
          <div className="min-w-0">
            <p className="font-display text-[17px] font-extrabold leading-tight tracking-tight text-[#173F33] sm:text-xl">MANOVAIDYA — PURCHASE ORDER</p>
            <p className="text-[12px] font-semibold text-charcoal/55">Digital · डिजिटल परचेज़ ऑर्डर</p>
          </div>
        </div>
        <div className="shrink-0 text-right text-[12px] text-charcoal/65">
          <p className="font-bold text-charcoal">{refNo}</p>
          <p>{dayText(s.date)}</p>
        </div>
      </header>

      <Heading n={1}>Patient &amp; phase</Heading>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Field label="Patient name" value={p.name} />
        <Field label="Patient ID" value={p.patientId} />
        <Field label="Program" value={p.program} />
        <Field label="Age" value={p.age} />
        <Field label="Phase" value={p.phase ? `Phase ${p.phase}` : ''} />
        <Field label="Parent / guardian" value={p.parent} />
        <Field label="Post-counsellor" value={p.counsellor} />
      </div>

      <Heading n={2}>Treatment &amp; support components</Heading>
      <ul className="divide-y divide-[#E4EAE6] overflow-hidden rounded-xl border border-[#D9E2DC]">
        {(s.components || []).map((c) => (
          <li key={c.name} className="flex items-start justify-between gap-3 px-3 py-2.5">
            <div className="min-w-0">
              <p className="text-[14px] font-semibold">{c.name}</p>
              {c.scope && <p className="text-[12px] text-charcoal/60">{c.scope}</p>}
            </div>
            <p className="shrink-0 text-right text-[14px] font-bold tabular-nums">{c.value ? rupees(c.value) : <span className="text-[12px] font-semibold text-[#1F5F4A]">Included</span>}</p>
          </li>
        ))}
        {s.otherComponent && <li className="px-3 py-2.5 text-[13px]"><span className="font-semibold">Other doctor-recommended component:</span> {s.otherComponent}</li>}
      </ul>

      <Heading n={3}>Program value &amp; payment</Heading>
      <div className="overflow-hidden rounded-xl border border-[#D9E2DC] text-[14px]">
        <div className="flex justify-between gap-3 px-3 py-2"><span className="text-charcoal/70">Selected components value</span><span className="font-semibold tabular-nums">{rupees(s.referenceValue)}</span></div>
        {s.concession > 0 && <div className="flex justify-between gap-3 border-t border-[#E4EAE6] px-3 py-2"><span className="text-charcoal/70">Approved concession</span><span className="font-semibold tabular-nums text-[#1F6B41]">− {rupees(s.concession)}</span></div>}
        <div className="flex justify-between gap-3 border-t-2 border-[#1F5F4A] bg-[#F2F7F4] px-3 py-2.5"><span className="font-bold">Approved program fee</span><span className="text-[16px] font-extrabold tabular-nums">{rupees(s.approvedFee)}</span></div>
        {s.paymentPlan && <div className="flex justify-between gap-3 border-t border-[#E4EAE6] px-3 py-2"><span className="text-charcoal/70">Payment plan</span><span className="font-semibold">{s.paymentPlan}</span></div>}
        {(s.parts || []).map((part) => (
          <div key={part.part} className="flex flex-wrap justify-between gap-x-3 border-t border-[#E4EAE6] px-3 py-2">
            <span className="text-charcoal/70">Part {part.part}</span>
            <span className="font-semibold tabular-nums">{rupees(part.amount)}{part.due !== null && part.due !== undefined && <span className="ml-2 text-[12px] font-normal text-charcoal/55">balance after: {rupees(part.due)}</span>}</span>
          </div>
        ))}
        {s.otherPlan && <div className="border-t border-[#E4EAE6] px-3 py-2 text-[13px]"><span className="text-charcoal/70">Approved plan / note:</span> {s.otherPlan}</div>}
      </div>
      {s.note && <p className="mt-2 text-[12px] italic text-charcoal/55">{s.note}</p>}

      {signed && (
        <>
          <Heading n={4}>Parent acknowledgement &amp; consent</Heading>
          <ul className="space-y-1.5">
            {consentItems.map((item) => {
              const ticked = (signed.consents || []).includes(item.key);
              return (
                <li key={item.key} className="flex gap-2 text-[13px]">
                  {ticked ? <CheckSquare size={17} className="mt-0.5 shrink-0 text-[#1F5F4A]" /> : <Square size={17} className="mt-0.5 shrink-0 text-charcoal/40" />}
                  <span>{item.en}<span className="block text-[12px] text-charcoal/60">{item.hi}</span></span>
                </li>
              );
            })}
          </ul>
          <Heading n={5}>Signature</Heading>
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] sm:items-end">
            <div className="rounded-xl border border-[#D9E2DC] bg-white p-2">
              {signatureSrc ? <img src={signatureSrc} alt={`Signature of ${signed.signerName}`} className="mx-auto max-h-40 w-auto object-contain" /> : <p className="py-10 text-center text-[12px] text-charcoal/45">{signed.hasSignature === false ? 'No signature file' : 'Loading signature…'}</p>}
            </div>
            <div className="text-[13px]">
              <p className="font-bold">{signed.signerName}</p>
              <p className="text-charcoal/65">{signed.relation}{signed.signatureKind === 'photo' ? ' · signature photo uploaded' : ' · signed on the screen'}</p>
              <p className="text-charcoal/65">Signed {whenText(signed.at)}</p>
            </div>
          </div>
        </>
      )}

      {children}
    </article>
  );
}
