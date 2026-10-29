import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { AlertTriangle, ArrowLeft, Check, CheckCircle2, Clock3, ExternalLink, FileText, Lock, PauseCircle, Pill, PlayCircle, Printer, RefreshCw, RotateCcw, ShieldCheck } from 'lucide-react';
import api from '../../api/axios.js';
import useLiveEvent from '../../api/useLiveEvent.js';
import Button from '../../components/ui/Button.jsx';
import Badge from '../../components/ui/Badge.jsx';
import { CompactAttachments } from '../../components/ui/Attachments.jsx';
import FormulationSheet from '../../components/medicine/FormulationSheet.jsx';
import { Chip, FieldLabel, poInput } from '../../components/purchaseOrders/CreatePurchaseOrderModal.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { ROLES, ROLE_LABELS } from '../../constants/roles.js';
import { AGE_BANDS, SUPPLY_OPTIONS, supplyKeyOf } from '../../constants/supplyPlans.js';
import { DelayChips, DelayTable, FixedNote } from '../../components/medicine/MedicineDelay.jsx';
import PatientFile from '../../components/medicine/PatientFile.jsx';
import { DosePaperUpload, DosePapersView } from '../../components/medicine/DosePapers.jsx';

const day = (v) => (v ? new Date(v).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '');
const dateTime = (v) => (v ? new Date(v).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '');
const inputDay = (v) => (v ? new Date(v).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }) : '');
const money = (v) => `Rs ${Number(v || 0).toLocaleString('en-IN')}`;
const num = (v) => (v == null || Number.isNaN(Number(v)) ? '-' : Number.isInteger(Number(v)) ? String(v) : String(Math.round(Number(v) * 1000) / 1000));
const URGENCY = { breached: ['Overdue', 'bg-[#8C3B2E]/10 text-[#8C3B2E]'], critical: ['Due within 24 h', 'bg-[#8C3B2E]/10 text-[#8C3B2E]'], risk: ['Due within 48 h', 'bg-amber-100 text-amber-900'], normal: ['On time', 'bg-emerald-100 text-emerald-800'] };
const ErrorText = ({ children }) => (children ? <p className="rounded-lg bg-[#8C3B2E]/8 px-3 py-2 text-sm text-[#8C3B2E]">{children}</p> : null);
const Section = ({ title, icon: Icon, action, children, tone }) => (
  <section className={`rounded-[14px] p-4 sm:p-[18px] ${tone === 'action' ? 'border-2 border-[#FDBA74] bg-gradient-to-b from-[#FFF7ED] to-white' : 'border border-[#E8DFCB] bg-white'}`}><div className="mb-3 flex flex-wrap items-center justify-between gap-2"><h3 className={`flex items-center gap-2 font-display font-bold text-charcoal ${tone === 'action' ? 'text-[15px]' : 'text-[13.5px]'}`}>{Icon && <Icon size={16} className={tone === 'action' ? 'text-[#C2410C]' : 'text-sage'} />}{title}</h3>{action}</div>{children}</section>
);

// ManoVaidya chit card, as the Chit Book prints it.
function ChitCard({ chit, patientName, checked, onToggle, disabled }) {
  return (
    <label className={`block cursor-pointer rounded-2xl border-[3px] bg-white p-3 text-[#1E1A26] transition ${checked ? 'border-emerald-600' : 'border-[#5F4B7E]'}`} style={{ fontFamily: '"Noto Sans Devanagari", system-ui, sans-serif' }}>
      <div className="flex items-center gap-2"><span className="text-xl font-extrabold tracking-tight text-[#5F4B7E]" style={{ fontFamily: 'system-ui, sans-serif' }}>ManoVaidya</span><span className="ml-auto font-bold">श्री</span><span className="flex h-6 w-6 items-center justify-center rounded-full border border-[#1E1A26] text-xs">{chit.chitNo}</span></div>
      <p className="text-center text-[10px] leading-tight">Your Mind and Soul Companion<br />मनोवैद्य आयुर्वेदिक चिकित्सालय</p>
      <p className="mt-2 rounded-full border border-[#8A8494] px-3 py-0.5 text-xs">नाम &nbsp;{patientName || chit.patientName || '______________'}</p>
      <p className="my-1 text-center text-base">{chit.when}</p>
      <p className="text-sm leading-relaxed">{chit.dose}</p>
      <p className="text-right"><b className="text-lg" style={{ fontFamily: 'system-ui, sans-serif' }}>{chit.days}</b> दिवस</p>
      {chit.note && <p className="text-center text-[9px]">{chit.note}</p>}
      <p className="mt-1 flex items-center justify-between font-mono text-[10px] text-[#8A8494]"><span>{chit.name} · पैक {chit.n}/{chit.of}</span><span className="flex items-center gap-1 font-sans text-xs font-semibold text-charcoal"><input type="checkbox" className="h-4 w-4 accent-emerald-600" checked={checked} disabled={disabled} onChange={onToggle} />Chit on pack</span></p>
    </label>
  );
}

const STATUS_TONE = { ok: 'bg-emerald-100 text-emerald-800', short: 'bg-[#8C3B2E]/10 text-[#8C3B2E]', missing: 'bg-[#8C3B2E]/10 text-[#8C3B2E]', manual: 'bg-amber-100 text-amber-900', expires: 'bg-amber-100 text-amber-900' };
const STATUS_TEXT = { ok: 'OK', short: 'Short', missing: 'Not in Stocks', manual: 'Enter actual', expires: 'Expires early' };

function StockTable({ rows, endDate }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-cardline">
      <table className="w-full text-sm"><thead className="bg-offwhite-200 text-[11px] uppercase tracking-wide text-charcoal/55"><tr><th className="px-3 py-2 text-left">Item</th><th className="px-3 py-2 text-right">Needed</th><th className="px-3 py-2 text-right">In stock</th><th className="px-3 py-2 text-right">After</th><th className="px-3 py-2 text-left">Batch / expiry</th><th className="px-3 py-2 text-left">Status</th></tr></thead>
        <tbody>{rows.map((r) => <tr key={r.code} className="border-t border-cardline"><td className="px-3 py-2"><b className="font-mono">{r.code}</b><div className="text-xs text-charcoal/55">{r.for}</div></td><td className="px-3 py-2 text-right font-mono">{num(r.qty)} {r.unit}{r.convertible && r.stockUnit && r.stockUnit !== r.unit ? <div className="text-xs text-charcoal/55">= {num(r.needInStock)} {r.stockUnit}</div> : null}</td><td className="px-3 py-2 text-right font-mono">{r.available == null ? '-' : `${num(r.available)} ${r.stockUnit}`}</td><td className="px-3 py-2 text-right font-mono">{r.balance == null ? '-' : num(r.balance)}</td><td className="px-3 py-2 text-xs">{r.batchNo || '-'}{r.expiryDate ? ` · ${day(r.expiryDate)}` : ''}</td><td className="px-3 py-2"><span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${STATUS_TONE[r.status]}`}>{STATUS_TEXT[r.status]}</span></td></tr>)}</tbody></table>
      {endDate && <p className="px-3 py-2 text-xs text-charcoal/55">Treatment runs till about {day(endDate)}: do not use a batch that expires before that.</p>}
    </div>
  );
}

const InfoRow = ({ label, value, sub }) => (value === '' || value == null ? null : (
  <div className="grid grid-cols-[120px_minmax(0,1fr)] gap-2 py-1 text-sm">
    <span className="text-charcoal/55">{label}</span>
    <span className="min-w-0 break-words font-medium text-charcoal">{value}{sub && <span className="block text-xs font-normal text-charcoal/55">{sub}</span>}</span>
  </div>
));
// What was done in a completed stage: every ticked checklist line, every value filled and the notes, each with a green tick.
// Older jobs may still carry the removed formulation-check fields.
const FIELD_LABEL = { shortageAccepted: 'Shortage request raised (stock was short)', readyByDate: 'Medicine will be ready by', formulaRef: 'Doctor approval / formula reference', exceptions: 'Patient-specific changes', batchRefs: 'Batch / lot references used', batchNo: 'Preparation batch / job reference', preparerName: 'Prepared by (operator)', unitLog: 'Per-unit fill log reference', kitLocation: 'Kit tray / location' };
const fieldText = (field, value) => {
  if (value === true) return 'Yes';
  if (field?.type === 'date' || /^\d{4}-\d{2}-\d{2}/.test(String(value))) return day(value) || String(value);
  return String(value);
};
// What changed on the sheet for this patient, line by line (master value -> new value).
function sheetChanges(f) {
  if (!f) return [];
  const unit = (l) => l.unit || '';
  return f.lines.filter((l) => l.edited || l.added || l.removed).map((l) => {
    const by = l.added?.byName || l.edited?.byName || '';
    if (l.added) return { kind: 'added', title: `Added: ${l.name}`, detail: [`${num(l.qty)} ${unit(l)}`, l.when, l.dose].filter(Boolean).join(' · '), by };
    if (l.removed) return { kind: 'removed', title: `Removed: ${l.name}`, detail: l.original?.qty ? `was ${num(l.original.qty)} ${l.original.unit || unit(l)}` : '', by };
    const o = l.original || {};
    const parts = [];
    if (o.qty !== undefined && o.qty !== l.qty) parts.push(`quantity ${num(o.qty)} → ${num(l.qty)} ${unit(l)}`);
    if (o.dose !== undefined && (o.dose || '') !== (l.dose || '')) parts.push(`dose: "${o.dose || '-'}" → "${l.dose || '-'}"`);
    if (o.containers && (o.containers || []).join('+') !== (l.containers || []).join('+')) parts.push(`packs ${o.containers.join(' + ')} → ${(l.containers || []).join(' + ')} दिन`);
    (l.components || []).forEach((c) => { const oc = (o.components || []).find((x) => x.code === c.code); if (oc && oc.qty !== c.qty) parts.push(`${c.name} ${num(oc.qty)} → ${num(c.qty)} ${c.unit}`); });
    if (o.packed !== undefined && o.packed !== l.packed) parts.push(l.packed ? 'packed' : 'not packed');
    if (!parts.length && l.edited?.changes?.length) parts.push(l.edited.changes.join(', '));
    return { kind: 'changed', title: `Changed: ${l.name}`, detail: parts.join(' · '), by };
  });
}
const CHANGE_TONE = { added: 'border-emerald-300 bg-emerald-100/70 text-emerald-900', removed: 'border-[#8C3B2E]/30 bg-[#8C3B2E]/10 text-[#8C3B2E]', changed: 'border-amber-300 bg-amber-100/70 text-amber-900' };

function DoneList({ stage, job }) {
  if (stage.snapshot?.oldFlow) return <p className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-900">Done before the fulfilment timeline (old request). Nothing was recorded for this step.</p>;
  const items = [
    ...stage.checks.filter((_, i) => stage.checksDone?.[i] !== false).map((text) => ({ text })),
    ...Object.entries(stage.values || {}).filter(([, v]) => v !== '' && v != null && v !== false).map(([k, v]) => {
      const field = stage.fields.find((f) => f.key === k);
      const fixed = k === 'readyByDate' && job.request?.readyByDate ? (job.request.readyByFixed ? 'Fixed by post counselling on the PO paper' : `Filled by ${job.request.readyBySetByName || job.request.requestedByName || 'In Transit'}`) : '';
      return { text: `${field?.label || FIELD_LABEL[k] || k}: ${fieldText(field, v)}`, sub: fixed };
    }),
    stage.notes ? { text: `Notes: ${stage.notes}`, sub: `by ${stage.doneByName}` } : null,
  ].filter(Boolean);
  // The doctor's step also lists every change made on the sheet for this patient, highlighted.
  const changes = stage.key === 'formula' ? sheetChanges(job.formulation) : [];
  if (!items.length && !changes.length) return null;
  return (
    <div>
      {stage.key === 'formula' && (
        <div className="mb-3">
          <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-amber-900">Changes on the sheet for this patient{changes.length ? ` (${changes.length})` : ''}</p>
          {changes.length ? (
            <ul className="space-y-1.5">
              {changes.map((c, i) => (
                <li key={i} className={`rounded-lg border px-3 py-2 ${CHANGE_TONE[c.kind]}`}>
                  <span className="block font-bold">{c.title}</span>
                  {c.detail && <span className="block text-xs">{c.detail}</span>}
                  {c.by && <span className="block text-[11px] opacity-75">by {c.by}</span>}
                </li>
              ))}
            </ul>
          ) : <p className="rounded-lg border border-emerald-200 bg-white/60 px-3 py-2 text-sm">No change: the sheet was verified as built from the Formulation Master.</p>}
        </div>
      )}
      <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-emerald-800">Done in this stage</p>
      <ul className="space-y-1.5">
        {items.map((item, i) => (
          <li key={i} className="flex gap-2">
            <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded bg-emerald-600 text-white" role="img" aria-label="Done"><Check size={12} strokeWidth={3} /></span>
            <span className="min-w-0"><span className="font-semibold text-emerald-900">{item.text}</span>{item.sub && <span className="block text-xs text-emerald-800/75">{item.sub}</span>}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// Step 10: the doctor verifies steps 7, 8 and 9 together - what each recorded and the dose-paper pages.
const VERIFIED_BY_DOCTOR = ['qc', 'pack1', 'photos'];
function VerifySteps({ job }) {
  return (
    <div className="space-y-3 rounded-lg border border-sage/30 bg-[#F3F6F2] p-3">
      <p className="text-sm font-bold text-charcoal">Verify steps 7, 8 and 9</p>
      {VERIFIED_BY_DOCTOR.map((key) => {
        const st = job.stages.find((x) => x.key === key);
        if (!st) return null;
        return (
          <div key={key} className={`rounded-lg border p-3 text-sm ${st.state === 'done' ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-cardline bg-white text-charcoal/60'}`}>
            <p className="mb-1.5 font-bold">{st.n} · {st.label} <span className="font-normal opacity-75">{st.state === 'done' ? `· ${st.doneByName} · ${dateTime(st.doneAt)}` : '· not done'}</span></p>
            {st.state === 'done' && <DoneList stage={st} job={job} />}
            {key === 'photos' && st.state === 'done' && <div className="mt-2"><DosePapersView job={job} /></div>}
          </div>
        );
      })}
    </div>
  );
}

const SOURCE = { conversion:'post-counselling conversion', manual: 'added manually', legacy: 'older PO' };

// Step 0: everything the request brought from In Transit, and the patient's whole file from the Records Room.
function RequestStep({ job, onNext }) {
  const r = job.request || {};
  const sentBy = r.requestedByName ? `chosen by ${r.requestedByName}` : 'chosen by In Transit';
  return (
    <Section title="0 · Medicine request received" icon={FileText} action={<span className="text-xs text-charcoal/50">दवा अनुरोध · In Transit → Medicine Department</span>}>
      <p className="mb-3 text-sm text-charcoal/70">Read the request and the patient's file first. Then accept the order in stage 1.</p>
      <div className="grid gap-3 xl:grid-cols-2">
        <div className="rounded-lg border border-cardline bg-white/70 px-3 py-2">
          <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-charcoal/50">Request</p>
          <InfoRow label="Requested" value={dateTime(r.requestedAt || job.requestedAt)} sub={r.requestedByName ? `by ${r.requestedByName}` : ''} />
          <InfoRow label="Purchase order" value={job.poNumber ? <span>{job.purchaseOrderId ? <Link to={`/admin/purchase-orders/${job.purchaseOrderId}`} className="font-mono text-sage hover:underline">{job.poNumber}</Link> : job.poNumber}</span> : ''} sub={r.po ? [r.po.createdByName && `created by ${r.po.createdByName}`, SOURCE[r.po.source], dateTime(r.po.createdAt)].filter(Boolean).join(' · ') : ''} />
          <InfoRow label="Phase" value={`Phase ${job.phase}`} />
          <InfoRow label="Category" value={r.caseCategory || job.caseCategory || 'Not given'} sub={r.caseCategory ? sentBy : ''} />
          <InfoRow label="Supply" value={job.supplyLabel || 'Not set'} sub={job.fixedPlan?.supply ? 'Sent by post counselling (PO) · read-only' : job.supplyLabel ? sentBy : ''} />
          <InfoRow label="Age group" value={job.ageBandLabel || 'Not set'} sub={[job.fixedPlan?.ageBand ? 'Sent by post counselling (PO) · read-only' : job.ageBandLabel ? sentBy : '', r.patient?.age && `patient age ${r.patient.age}`].filter(Boolean).join(' · ')} />
          <InfoRow label="Ready by" value={day(r.readyByDate || job.readyByDate) || 'Not set'} sub={r.readyByDate ? `${r.readyByFixed ? 'Fixed by post counselling on the PO paper' : `Filled by ${r.readyBySetByName || r.requestedByName || 'In Transit'}${r.readyBySetAt ? ` · ${dateTime(r.readyBySetAt)}` : ''}`} · cannot be changed here` : ''} />
          <InfoRow label="Notes" value={r.notes || job.requestNotes || '-'} />
          <InfoRow label="Medicines" value={r.medicines || job.medicines} sub="Typed with an older request" />
        </div>
        <div className="rounded-lg border border-cardline bg-white/70 px-3 py-2">
          <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-charcoal/50">Patient</p>
          <InfoRow label="Name" value={job.patientName} />
          <InfoRow label="Patient ID" value={job.patientCode} />
          <InfoRow label="Age (this phase)" value={r.patient?.age} />
          <InfoRow label="Gender" value={r.patient?.gender} />
          <InfoRow label="Parent / relative" value={r.patient?.guardianName} />
          <InfoRow label="City" value={r.patient?.city} />
        </div>
      </div>
      <PatientFile documents={job.patientDocuments || []} className="mt-3" />
      {r.prescriptionFiles?.length > 0 && <CompactAttachments files={r.prescriptionFiles} label="Prescription (older request)" className="mt-2" />}
      {onNext && <Button className="mt-3" onClick={onNext}>Next: 1 · {job.stages[0]?.label}</Button>}
    </Section>
  );
}

function StageWork({ job, stage, canAct, onDone, onError }) {
  const { user } = useAuth();
  const [err, setErr] = useState('');
  // Errors show at the top of the page and right above the button, so a rejected stage is never missed.
  const report = (message) => { setErr(message); onError(message); };
  const [checks, setChecks] = useState({});
  const [fields, setFields] = useState({});
  const [notes, setNotes] = useState('');
  const [consumption, setConsumption] = useState({});
  const [chits, setChits] = useState({});
  const [files, setFiles] = useState({});
  // Step 9: papers added on the page (name per paper_<i>) and earlier papers to drop.
  const [paperRows, setPaperRows] = useState([]);
  const [removedPapers, setRemovedPapers] = useState([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setChecks({}); setNotes(''); setConsumption({}); setChits({}); setFiles({}); setPaperRows([]); setRemovedPapers([]);
    setFields(stage.key === 'accept' ? { readyByDate: inputDay(job.readyByDate) } : {});
  }, [stage.key, job.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const allChecked = stage.checks.every((_, i) => checks[i]);
  const submit = async () => {
    if (stage.key === 'photos') {
      const missing = paperRows.findIndex((r, i) => !r.name.trim() || !(files[`paper_${i}`] || []).length);
      if (missing >= 0) { report(paperRows[missing].name.trim() ? `Upload the pages of "${paperRows[missing].name.trim()}"` : 'Enter the name of each paper you added'); return; }
    }
    setBusy(true); report('');
    try {
      const body = new FormData();
      body.append('checks', JSON.stringify(stage.checks.map((_, i) => Boolean(checks[i]))));
      body.append('fields', JSON.stringify(fields));
      body.append('notes', notes);
      if (stage.key === 'prepare') body.append('consumption', JSON.stringify(job.consumption.map((c) => ({ code: c.code, actual: consumption[c.code] === undefined || consumption[c.code] === '' ? null : Number(consumption[c.code]) }))));
      if (stage.key === 'photos') { body.append('papers', JSON.stringify(paperRows.map((r, slot) => ({ name: r.name.trim(), slot })))); body.append('removePapers', JSON.stringify(removedPapers)); }
      if (stage.key === 'fill') body.append('chits', JSON.stringify(job.chits.map((c) => ({ key: c.key, confirmed: c.confirmed || Boolean(chits[c.key]) }))));
      // Every chosen image goes under its slot (photoA, paper_0, paper_1, ...).
      Object.entries(files).forEach(([key, list]) => (list || []).forEach((file) => body.append(key, file)));
      const { data } = await api.post(`/medicine-jobs/${job.id}/stages/${stage.key}`, body);
      onDone(data.job, `${stage.n}. ${stage.label} saved.`);
    } catch (e) { report(e.response?.data?.message || 'Could not save this stage'); } finally { setBusy(false); }
  };
  const rebuild = async () => {
    if (job.formulation?.edited && !window.confirm('This sheet has patient-specific corrections. Rebuilding from the Formulation Master drops them. Continue?')) return;
    setBusy(true); report('');
    try { const { data } = await api.post(`/medicine-jobs/${job.id}/rebuild`); onDone(data.job, 'Sheet rebuilt from the current Formulation Master.'); }
    catch (e) { report(e.response?.data?.message || 'Could not rebuild the sheet'); } finally { setBusy(false); }
  };
  const field = (f) => {
    const v = fields[f.key] ?? '';
    const set = (value) => setFields((old) => ({ ...old, [f.key]: value }));
    if (f.type === 'select') return <FieldLabel key={f.key} label={f.label} required={f.required}><select className={poInput} value={v} onChange={(e) => set(e.target.value)} disabled={!canAct}><option value="">Select</option>{f.options.map((o) => <option key={o} value={o}>{o}</option>)}</select></FieldLabel>;
    if (f.type === 'textarea') return <FieldLabel key={f.key} label={f.label} required={f.required} className="sm:col-span-2"><textarea className={poInput} rows={2} value={v} onChange={(e) => set(e.target.value)} disabled={!canAct} /></FieldLabel>;
    const fixed = f.key === 'readyByDate' && Boolean(job.readyByDate) && user?.role !== ROLES.ADMIN;
    return <FieldLabel key={f.key} label={f.label} required={f.required}><input className={poInput} type={f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : 'text'} {...(f.type === 'number' ? { min: 0, step: f.step || 'any', inputMode: 'decimal' } : {})} value={v} onChange={(e) => set(e.target.value)} disabled={!canAct || fixed} />{fixed && <FixedNote />}</FieldLabel>;
  };
  const endDate = job.readyByDate && job.formulation ? new Date(new Date(job.readyByDate).getTime() + job.formulation.days * 86400000) : null;
  return (
    <div className="space-y-4">
      {stage.key === 'formula' && (
        <p className="rounded-lg border border-sage/30 bg-sage/10 px-3 py-2 text-sm text-charcoal/80">Changes made here (dose, quantity, a medicine added or removed) are for <b>{job.patientName}</b>'s request only. The Formulation Master is not changed.</p>
      )}
      {['review', 'formula'].includes(stage.key) && job.formulation && (
        <div className={`flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-xs ${job.masterOutdated ? 'border-amber-300 bg-amber-50 text-amber-900' : 'border-cardline bg-offwhite-200/60 text-charcoal/70'}`}>
          {job.formulation.custom ? <span>{job.formulation.ageBandLabel}: no Formulation Master - this sheet is made for this child.</span> : <span>Built from the Formulation Master {job.formulation.master?.version ? `v${job.formulation.master.version}` : '(document values)'}{job.formulation.master?.updatedByName ? ` · edited by ${job.formulation.master.updatedByName}` : ''}.{[ROLES.ADMIN, ROLES.DOCTOR].includes(user?.role) && <> <Link to="/admin/formulation-master" className="font-semibold text-sage hover:underline">Open Formulation Master</Link></>}</span>}
          {job.masterOutdated && <span className="flex items-center gap-2 font-semibold">The master changed since (now v{job.masterVersion}).{canAct && <Button size="sm" variant="outline" disabled={busy} onClick={rebuild}><RefreshCw size={13} />Rebuild sheet</Button>}</span>}
        </div>
      )}
      {stage.key === 'review' && job.formulation?.custom && (
        <div className="rounded-lg border-2 border-sky-200 bg-sky-50 p-3 text-sm text-sky-950">
          <p className="font-bold">{job.formulation.ageBandLabel}: no Formulation Master - make this child's formulation</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-[13px]">
            <li><b>Create it here</b> after asking the doctor: "Create formulation" below, add each medicine, save. The doctor still verifies it in step 3.</li>
            <li><b>Or send it to the doctor</b>: complete this step without medicines; the doctor creates the formulation in step 3 ("Create formulation of {job.patientName}" reaches the doctor).</li>
          </ul>
          {!job.formulation.lines.length && <p className="mt-1.5 text-xs font-semibold">No medicines yet - completing this step sends it to the doctor to create.</p>}
        </div>
      )}
      {['review', 'formula'].includes(stage.key) && <FormulationSheet f={job.formulation} patientName={job.patientName} patientCode={job.patientCode} canEdit={[ROLES.ADMIN, ROLES.DOCTOR].includes(user?.role) || (Boolean(job.formulation?.custom) && stage.key === 'review' && user?.role === ROLES.MEDICINE_DEPARTMENT)} jobId={job.id} onSaved={onDone} onError={report} />}
      {stage.key === 'qc' && job.preparerName && (
        <p className="rounded-lg bg-offwhite-200/60 px-3 py-2 text-sm text-charcoal/70">
          Prepared by <b>{job.preparerName}</b>.
        </p>
      )}
      {stage.key === 'stock' && <>
        <StockTable rows={job.stockTable} endDate={endDate} />
        {job.stockTable.some((r) => r.status === 'short') && <label className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900"><input type="checkbox" className="mt-0.5 h-4 w-4 accent-amber-700" checked={Boolean(fields.shortageAccepted)} onChange={(e) => setFields((o) => ({ ...o, shortageAccepted: e.target.checked }))} disabled={!canAct} />Shortage request raised for the short items; continue (preparation will still need the stock).</label>}
      </>}
      {stage.key === 'prepare' && (
        <div className="overflow-x-auto rounded-lg border border-cardline">
          <table className="w-full text-sm"><thead className="bg-offwhite-200 text-[11px] uppercase tracking-wide text-charcoal/55"><tr><th className="px-3 py-2 text-left">Drawn from stock</th><th className="px-3 py-2 text-right">Per sheet</th><th className="px-3 py-2 text-right">Actual used</th></tr></thead>
            <tbody>{job.consumption.map((c) => { const row = job.stockTable.find((r) => r.code === c.code); const needs = row && !row.convertible; return <tr key={c.code} className="border-t border-cardline"><td className="px-3 py-2"><b className="font-mono">{c.code}</b> <span className="text-xs text-charcoal/55">{c.name}</span>{needs && <div className="text-[11px] font-semibold text-amber-800">Enter the actual {row.stockUnit} ({c.unit} to {row.stockUnit} not set in Stocks)</div>}</td><td className="px-3 py-2 text-right font-mono">{num(c.planned)} {c.unit}{row?.convertible && row.stockUnit !== c.unit ? ` = ${num(row.needInStock)} ${row.stockUnit}` : ''}</td><td className="px-3 py-2 text-right"><input className={`${poInput} ml-auto w-32 text-right`} type="number" step="0.001" min="0" placeholder={row?.convertible ? num(row.needInStock) : ''} value={consumption[c.code] ?? ''} onChange={(e) => setConsumption((o) => ({ ...o, [c.code]: e.target.value }))} disabled={!canAct} /><div className="text-[10px] text-charcoal/45">{row?.stockUnit || c.unit}</div></td></tr>; })}</tbody></table>
          <p className="px-3 py-2 text-xs text-charcoal/55">Leave a box empty to use the sheet quantity. Completing this stage reduces Stocks by the actual quantities and writes the ledger.</p>
        </div>
      )}
      {stage.key === 'fill' && (
        <div>
          <div className="mb-2 flex items-center justify-between"><p className="text-sm font-semibold text-charcoal">{job.chits.length} chits - tick each one once it is on its pack</p><button type="button" className="inline-flex items-center gap-1 text-xs font-semibold text-sage hover:underline" onClick={() => window.print()}><Printer size={13} />Print chits</button></div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{job.chits.map((c) => <ChitCard key={c.key} chit={c} patientName={job.patientName} checked={c.confirmed || Boolean(chits[c.key])} disabled={!canAct || c.confirmed} onToggle={() => setChits((o) => ({ ...o, [c.key]: !o[c.key] }))} />)}</div>
        </div>
      )}
      {stage.key === 'photos' && <DosePaperUpload job={job} files={files} setFiles={setFiles} rows={paperRows} setRows={setPaperRows} removed={removedPapers} setRemoved={setRemovedPapers} disabled={!canAct} />}
      {stage.key === 'doctor' && <VerifySteps job={job} />}
      {stage.key === 'release' && job.payment && (
        <div className={`rounded-lg px-3 py-2 text-sm ${job.payment.releasable ? 'bg-emerald-50 text-emerald-900' : 'bg-amber-50 text-amber-900'}`}>
          <b>{job.payment.releasable ? 'Payment cleared by In Transit.' : 'Release blocked.'}</b> Phase {job.phase}: {money(job.payment.amountPaid)} verified of {money(job.payment.totalAmount)}{job.payment.remaining > 0 ? `, balance ${money(job.payment.remaining)}` : ''}{job.payment.pendingCount ? `, ${job.payment.pendingCount} payment(s) pending verification` : ''}{!job.payment.patientApproved ? ', patient not approved' : ''}{job.payment.hold ? ', phase on hold' : ''}.
        </div>
      )}
      <div>
        <p className="mb-1.5 text-[10.5px] font-bold uppercase tracking-wide text-charcoal/60">Checklist · {stage.sop} <span className="normal-case tracking-normal text-charcoal/55">· {stage.checks.filter((_, i) => checks[i]).length} of {stage.checks.length} ticked</span></p>
        <ul className="space-y-1.5">{stage.checks.map((c, i) => <li key={i}><label className={`flex items-start gap-2.5 rounded-[10px] border px-3 py-2.5 text-[13px] ${checks[i] ? 'border-[#A7D3B8] bg-[#F6FBF7] text-charcoal/60 line-through decoration-[#A7D3B8]' : 'border-[#EFE3CF] bg-[#FBF7ED] text-charcoal'} ${canAct ? 'cursor-pointer hover:border-[#DED2BD]' : ''}`}><input type="checkbox" className="mt-0.5 h-[18px] w-[18px] shrink-0 accent-sage" checked={Boolean(checks[i])} disabled={!canAct} onChange={(e) => setChecks((o) => ({ ...o, [i]: e.target.checked }))} />{c}</label></li>)}</ul>
      </div>
      {stage.fields.length > 0 && <div className="grid gap-3 sm:grid-cols-2">{stage.fields.map(field)}</div>}
      <FieldLabel label="Stage notes"><input className={poInput} value={notes} onChange={(e) => setNotes(e.target.value)} disabled={!canAct} /></FieldLabel>
      <ErrorText>{err}</ErrorText>
      {canAct ? <Button disabled={busy || !allChecked} onClick={submit}><Check size={15} />{busy ? 'Saving...' : stage.key === 'release' ? 'Release to In Transit' : stage.key === 'final' ? 'Mark medicine ready' : 'Complete stage'}</Button>
        : <p className="flex items-center gap-2 text-sm text-charcoal/55"><Lock size={14} />This stage is completed by {stage.roles.map((r) => ROLE_LABELS[r]).join(' / ')}.</p>}
    </div>
  );
}

export default function MedicineJobPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [job, setJob] = useState(null);
  const [view, setView] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [holdOpen, setHoldOpen] = useState(false);
  const [holdText, setHoldText] = useState('');
  const [supply, setSupply] = useState({ ageBand: '', supplyKey: '' });
  const canAct = [ROLES.ADMIN, ROLES.DOCTOR, ROLES.MEDICINE_DEPARTMENT].includes(user?.role);

  const load = useCallback(async () => {
    try { const { data } = await api.get(`/medicine-jobs/${id}`, { skipCache: true }); setJob(data.job); setError(''); }
    catch (err) { setError(err.response?.data?.message || 'Could not load the job'); }
  }, [id]);
  useEffect(() => { load(); }, [load]);
  // Live: when anyone changes this job (the doctor's sheet edit or sign-off, a stage done), this page reloads at once.
  useLiveEvent('medicine-job:changed', (payload) => { if (!payload || payload.id === id) load(); });
  useEffect(() => { if (job) setSupply({ ageBand: job.ageBand, supplyKey: supplyKeyOf(job.supplyPlan, job.supplyPart) }); }, [job?.id, job?.ageBand, job?.supplyPlan, job?.supplyPart]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!notice) return undefined; const t = setTimeout(() => setNotice(''), 5000); return () => clearTimeout(t); }, [notice]);
  const done = (next, message) => { setJob(next); setNotice(message); setView(null); setHoldOpen(false); setHoldText(''); };
  const act = async (path, body) => { setError(''); try { const { data } = await api.post(`/medicine-jobs/${id}/${path}`, body); done(data.job, path === 'hold' ? 'Job put on hold.' : 'Job resumed.'); } catch (err) { setError(err.response?.data?.message || 'Could not save'); } };
  // Admin undo of a completed stage (and every stage after it), with a reason.
  const [revertKey, setRevertKey] = useState('');
  const [revertReason, setRevertReason] = useState('');
  const runRevert = async () => {
    setError('');
    try { const { data } = await api.post(`/medicine-jobs/${id}/revert`, { stage: revertKey, reason: revertReason }); setRevertKey(''); setRevertReason(''); done(data.job, 'Stage reverted.'); }
    catch (err) { setError(err.response?.data?.message || 'Could not revert this stage'); }
  };
  const saveSupply = async () => { setError(''); try { const { data } = await api.patch(`/medicine-jobs/${id}/supply`, supply); done(data.job, 'Formulation sheet rebuilt for the new supply.'); } catch (err) { setError(err.response?.data?.message || 'Could not change the supply'); } };

  // `view`: a stage index, or 'request' for step 0. A job not accepted yet opens on step 0 (the request).
  const showRequest = Boolean(job) && (view === 'request' || (view == null && job.currentStage === 0 && job.status === 'open'));
  const shown = useMemo(() => (job && !showRequest ? job.stages[typeof view === 'number' ? view : Math.min(job.currentStage, job.totalStages - 1)] : null), [job, view, showRequest]);
  if (!job) return <div className="space-y-3"><button type="button" onClick={() => navigate(-1)} className="inline-flex items-center gap-1.5 text-sm font-medium text-sage"><ArrowLeft size={15} /> Back</button>{error ? <ErrorText>{error}</ErrorText> : <p className="p-6 text-center text-sm text-charcoal/55">Loading job...</p>}</div>;
  const isCurrent = shown && shown.state === 'current';
  const stageCanAct = (canAct || user?.role === ROLES.IN_TRANSIT) && isCurrent && !job.hold && job.status !== 'released' && shown.roles.includes(user?.role);
  const [urgLabel, urgTone] = URGENCY[job.urgency?.level] || URGENCY.normal;
  // Supply / age group belong to the formulation check, so only that stage's owner changes them.
  // The supply (6 months / 1+5 / 2+4) was chosen in post counselling; only the admin can change it here.
  // Locked only when post counselling sent them (older requests without a PO paper are still chosen here).
  const supplyLocked = Boolean(job.fixedPlan?.supply) && user?.role !== ROLES.ADMIN;
  const ageLocked = Boolean(job.fixedPlan?.ageBand) && user?.role !== ROLES.ADMIN;
  // While the doctor verifies the formulation, the Medicine Department's work area waits (blurred).
  const waitingForDoctor = job.currentKey === 'formula' && job.status === 'open' && user?.role === ROLES.MEDICINE_DEPARTMENT;
  const canChangeSupply = canAct && ['accept', 'review'].includes(job.currentKey) && job.status === 'open' && (job.stages.find((s) => s.key === 'review')?.roles || []).includes(user?.role);

  return (
    <div className="space-y-4">
      <button type="button" onClick={() => (window.history.state?.idx > 0 ? navigate(-1) : navigate('/admin/medicine-requests'))} className="inline-flex items-center gap-1.5 text-sm font-medium text-sage hover:text-charcoal"><ArrowLeft size={15} /> Back</button>
      <header className="flex flex-wrap items-center gap-3.5 rounded-[14px] border border-[#E8DFCB] bg-white px-4 py-3.5 sm:px-[18px]">
        <span className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#E9EFE9] text-sage sm:flex"><Pill size={19} /></span>
        <div className="min-w-[240px] flex-1">
          <div className="flex flex-wrap items-center gap-2"><h1 className="font-display text-[17px] font-extrabold text-charcoal">{job.patientName}</h1>{job.poNumber && <span className="rounded-full bg-[#E9EFE9] px-2.5 py-0.5 font-mono text-[11px] font-bold text-sage">PO {job.poNumber}</span>}{(job.caseCategory || job.supplyLabel || job.ageBandLabel) && <span className="rounded-full bg-[#FBF0DC] px-2.5 py-0.5 text-[11px] font-bold text-[#7C5B2E]">{[job.caseCategory, job.supplyLabel, job.ageBandLabel].filter(Boolean).join(' · ')}</span>}<Badge tone={job.status === 'released' ? 'inactive' : job.status === 'ready' ? 'teal' : 'amber'}>{job.status === 'released' ? 'Released' : job.status === 'ready' ? 'Medicine ready' : 'In fulfilment'}</Badge>{job.hold && <Badge tone="danger">On hold</Badge>}</div>
          <p className="mt-0.5 text-[12.5px] text-charcoal/65">{job.patientCode} · Phase {job.phase} · {job.supplyLabel || 'supply not set'} · {job.ageBandLabel || 'age group not set'} · requested {dateTime(job.requestedAt)}{job.requestedByName ? ` by ${job.requestedByName}` : ''}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          {job.readyByDate && <span className={`rounded-full px-3 py-1.5 text-xs font-bold ${urgTone}`}>{urgLabel} · ready by {day(job.readyByDate)}</span>}
          {job.delay && <DelayChips delay={job.delay} show={['medicine', 'transit', 'dispatch']} />}
          <div className="w-40" title={`${job.progress}% done`}><p className="text-right text-[11px] text-charcoal/60">Stage {Math.min(job.currentStage + 1, job.totalStages)} of {job.totalStages} · <b className="text-charcoal">{job.progress}%</b></p><div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[#EFE3CF]"><div className="h-full rounded-full bg-sage transition-all" style={{ width: `${job.progress}%` }} /></div></div>
          {job.purchaseOrderId && <Link to={`/admin/purchase-orders/${job.purchaseOrderId}`}><Button size="sm" variant="outline"><ExternalLink size={14} />PO</Button></Link>}
          {canAct && job.status !== 'released' && !job.hold && <Button size="sm" variant="outline" onClick={() => setHoldOpen((v) => !v)}><PauseCircle size={14} />Hold</Button>}
        </div>
      </header>
      {job.delay && (job.delay.medicine?.daysLate > 0 || job.delay.transit?.daysLate > 0 || job.delay.dispatch?.daysLate > 0 || job.status === 'released') && (
        <details className="rounded-[14px] border border-[#E8DFCB] bg-white px-4 py-2.5" open={[job.delay.medicine, job.delay.transit, job.delay.dispatch].some((s) => s?.daysLate > 0)}>
          <summary className="cursor-pointer text-sm font-bold text-charcoal">Delays · expected vs actual</summary>
          <DelayTable delay={job.delay} className="mt-2" />
        </details>
      )}
      {job.oldFlow && job.status !== 'released' && <p className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-900"><b>Old request</b> (made before the fulfilment timeline, no PO): the Admin and the Doctor can fill every step to move it on, with the Medicine Department.{!job.ageBand || !job.supplyPlan ? ' Set its age group and supply at step 2 first.' : ''}</p>}
      <ErrorText>{error}</ErrorText>
      {notice && <p className="flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800"><CheckCircle2 size={15} />{notice}</p>}
      {holdOpen && <div className="flex flex-wrap gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3"><input className={`${poInput} flex-1`} placeholder="Reason for the hold (e.g. dose unclear, leak)" value={holdText} onChange={(e) => setHoldText(e.target.value)} /><Button size="sm" disabled={!holdText.trim()} onClick={() => act('hold', { reason: holdText })}>Put on hold</Button></div>}
      {job.hold && <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#8C3B2E]/30 bg-[#8C3B2E]/5 p-3 text-sm"><span><b className="text-[#8C3B2E]">On hold:</b> {job.hold.reason} <span className="text-charcoal/50">({job.hold.byName}, {dateTime(job.hold.at)})</span></span>{canAct && <div className="flex gap-2"><input className={`${poInput} w-64`} placeholder="Corrective action taken" value={holdText} onChange={(e) => setHoldText(e.target.value)} /><Button size="sm" disabled={!holdText.trim()} onClick={() => act('resume', { note: holdText })}><PlayCircle size={14} />Resume</Button></div>}</div>}
      {job.formulation?.pending?.length > 0 && <div className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900"><b>Points the doctor still has to confirm:</b> {job.formulation.pending.join(' ')}</div>}

      <div className="grid items-start gap-3.5 lg:grid-cols-[260px_minmax(0,1fr)] 2xl:grid-cols-[270px_minmax(0,1fr)_300px]">
        <nav className="flex gap-1 overflow-x-auto rounded-[14px] border border-[#E8DFCB] bg-white p-2 lg:sticky lg:top-4 lg:flex-col lg:self-start" aria-label="Stages">
          <button type="button" onClick={() => setView('request')} aria-current={showRequest ? 'step' : undefined} className={`grid shrink-0 grid-cols-[24px_minmax(0,1fr)] items-center gap-2.5 rounded-[10px] px-2.5 py-2 text-left text-[12.5px] transition lg:w-full ${showRequest ? 'bg-[#F3F6F2] ring-1 ring-sage/40' : 'hover:bg-[#FBF7ED]'}`}>
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#2F8F5B] text-[10px] font-extrabold text-white"><Check size={12} /></span>
            <span className="min-w-0"><span className="block truncate font-semibold text-charcoal">Request received</span><span className="block truncate text-[11px] text-charcoal/60">{[job.request?.requestedByName || job.requestedByName, dateTime(job.request?.requestedAt || job.requestedAt)].filter(Boolean).join(' · ')}</span></span>
          </button>
          {job.stages.map((s, i) => {
            const mine = s.state === 'current' && s.roles.includes(user?.role);
            return (
              <button key={s.key} type="button" onClick={() => setView(i)} aria-current={shown?.key === s.key ? 'step' : undefined} className={`grid shrink-0 grid-cols-[24px_minmax(0,1fr)] items-center gap-2.5 rounded-[10px] px-2.5 py-2 text-left text-[12.5px] transition lg:w-full ${s.state === 'current' ? 'bg-[#FFF1E6] ring-1 ring-[#FDBA74]' : 'hover:bg-[#FBF7ED]'} ${shown?.key === s.key && s.state !== 'current' ? 'bg-[#F3F6F2] ring-1 ring-sage/40' : ''}`}>
                <span className={`flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-extrabold ${s.state === 'done' ? 'bg-[#2F8F5B] text-white' : s.state === 'current' ? 'bg-[#F97316] text-white' : 'border-[1.5px] border-[#D9CFBA] text-[#B4AA95]'}`}>{s.state === 'done' ? <Check size={12} /> : s.n}</span>
                <span className="min-w-0"><span className={`block truncate ${s.state === 'todo' ? 'text-[#8a9094]' : s.state === 'current' ? 'font-extrabold text-charcoal' : 'font-semibold text-charcoal'}`}>{s.label}</span><span className={`block truncate text-[11px] ${mine ? 'font-bold text-[#C2410C]' : s.state === 'todo' ? 'text-[#b4b9bc]' : 'text-charcoal/60'}`}>{s.state === 'done' ? `${s.doneByName} · ${dateTime(s.doneAt)}` : mine ? `Your stage · ${s.roles.map((r) => ROLE_LABELS[r]).join(' / ')}` : s.roles.map((r) => ROLE_LABELS[r]).join(' / ')}</span></span>
              </button>
            );
          })}
        </nav>
        <main className="relative min-w-0 space-y-3.5">
          {job.currentKey === 'final' && job.status === 'open' && user?.role === ROLES.MEDICINE_DEPARTMENT && (
            <div className="flex items-center gap-2 rounded-xl border-2 border-[#FDBA74] bg-[#FFF7ED] px-4 py-3 text-sm font-bold text-[#C2410C]">
              <Clock3 size={17} />Final check is confirmed by In Transit
              <span className="font-normal text-charcoal/70">· The parcel is packed; In Transit checks it and marks the medicine ready, then you release it.</span>
            </div>
          )}
          {waitingForDoctor && (
            <div className="sticky top-3 z-10 flex items-center gap-2 rounded-xl border-2 border-[#FDBA74] bg-[#FFF7ED] px-4 py-3 text-sm font-bold text-[#C2410C] shadow-sm">
              <Clock3 size={17} />Please verify formulation from doctor
              <span className="font-normal text-charcoal/70">· The doctor is checking {job.patientName}'s formulation; stock match opens after that.</span>
            </div>
          )}
          <div className={waitingForDoctor && shown?.key === 'formula' ? 'pointer-events-none select-none space-y-3.5 opacity-80 blur-[2px]' : 'space-y-3.5'} aria-hidden={(waitingForDoctor && shown?.key === 'formula') || undefined}>
          {showRequest && <RequestStep job={job} onNext={() => setView(0)} />}
          {shown && (
            <Section tone={stageCanAct ? 'action' : undefined} title={`${shown.n} · ${shown.label}`} icon={shown.state === 'done' ? CheckCircle2 : shown.state === 'current' ? ShieldCheck : Clock3} action={<span className="text-xs text-charcoal/50">{shown.hi} · {shown.sop}</span>}>
              <p className="mb-3 text-sm text-charcoal/70">{shown.purpose}</p>
              {shown.state === 'done' ? (
                <div className="space-y-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-semibold">Completed by {shown.doneByName} ({ROLE_LABELS[shown.doneByRole] || shown.doneByRole}) · {dateTime(shown.doneAt)}</p>
                    {user?.role === ROLES.ADMIN && job.status !== 'cancelled' && (revertKey === shown.key
                      ? <span className="flex flex-wrap items-center gap-2"><input className={`${poInput} w-64`} placeholder="Why is this reverted?" value={revertReason} onChange={(e) => setRevertReason(e.target.value)} /><Button size="sm" disabled={!revertReason.trim()} onClick={runRevert}><RotateCcw size={13} />Revert to this stage</Button><Button size="sm" variant="outline" onClick={() => setRevertKey('')}>Cancel</Button></span>
                      : <button type="button" className="inline-flex items-center gap-1 text-xs font-semibold text-[#8C3B2E] hover:underline" title="Admin: undo this stage and every stage after it" onClick={() => { setRevertKey(shown.key); setRevertReason(''); }}><RotateCcw size={12} />Revert</button>)}
                  </div>
                  <DoneList stage={shown} job={job} />
                  {['review', 'formula'].includes(shown.key) && <FormulationSheet f={job.formulation} patientName={job.patientName} patientCode={job.patientCode} />}
                  {shown.key === 'stock' && (
                    <div className="space-y-1.5">
                      <p className="text-[11px] font-bold uppercase tracking-wide text-emerald-800">{shown.snapshot?.stockTable ? 'Stock as matched at completion' : 'Stock now (the table at completion was not saved for this older job)'}</p>
                      <StockTable rows={shown.snapshot?.stockTable || job.stockTable} />
                    </div>
                  )}
                  {shown.key === 'prepare' && <ul className="font-mono text-xs">{job.consumption.map((c) => <li key={c.code}>{c.code}: {num(c.actual)} {c.unit} drawn (sheet {num(c.planned)})</li>)}</ul>}
                  {shown.key === 'fill' && <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{job.chits.map((c) => <ChitCard key={c.key} chit={c} patientName={job.patientName} checked disabled onToggle={() => {}} />)}</div>}
                  {shown.key === 'photos' && <DosePapersView job={job} />}
                  {shown.key === 'doctor' && <VerifySteps job={job} />}
                </div>
              ) : shown.state === 'todo' ? (
                <p className="flex items-center gap-2 text-sm text-charcoal/55"><Lock size={14} />Opens after "{job.stages[job.currentStage]?.label}". Done by {shown.roles.map((r) => ROLE_LABELS[r]).join(' / ')}.</p>
              ) : (
                <>
                  {/* The patient's whole file (Records Room): in step 0, and again next to the formulation check. */}
                  {shown.key === 'review' ? <PatientFile documents={job.patientDocuments || []} className="mb-4" /> : <button type="button" onClick={() => setView('request')} className="mb-3 inline-flex items-center gap-1 text-xs font-semibold text-sage hover:underline"><FileText size={13} />Request details & patient file (step 0)</button>}
                  {shown.key === 'review' && canChangeSupply && (
                    <div className="mb-4 rounded-lg border border-cardline bg-offwhite-200/60 p-3">
                      <p className="mb-2 text-xs font-bold uppercase tracking-wide text-charcoal/50">{supplyLocked || ageLocked ? 'Age group & supply (sent by post counselling)' : 'Age group & supply (choose as per the prescription)'}</p>
                      <div className="flex flex-wrap gap-1.5">{AGE_BANDS.map((b) => <Chip key={b.value} active={supply.ageBand === b.value} disabled={ageLocked && supply.ageBand !== b.value} onClick={() => !ageLocked && setSupply((s) => ({ ...s, ageBand: b.value }))}>{b.label}</Chip>)}</div>
                      <div className="mt-2 flex flex-wrap gap-1.5">{SUPPLY_OPTIONS.map((o) => <Chip key={o.key} active={supply.supplyKey === o.key} disabled={supplyLocked && supply.supplyKey !== o.key} onClick={() => !supplyLocked && setSupply((s) => ({ ...s, supplyKey: o.key }))}>{o.label}</Chip>)}</div>
                      {supplyLocked && <FixedNote />}
                      {(supply.ageBand !== job.ageBand || supply.supplyKey !== supplyKeyOf(job.supplyPlan, job.supplyPart)) && <Button size="sm" className="mt-2" onClick={saveSupply}>Rebuild sheet</Button>}
                    </div>
                  )}
                  {!stageCanAct && !job.hold && job.status !== 'released' && <p className="mb-3 flex items-center gap-2 rounded-lg bg-offwhite-200 px-3 py-2 text-sm font-semibold text-charcoal/70"><Lock size={14} />View only: this stage is filled by {shown.roles.map((r) => ROLE_LABELS[r]).join(' / ')}.</p>}
                  <StageWork key={shown.key} job={job} stage={shown} canAct={stageCanAct} onDone={done} onError={setError} />
                </>
              )}
            </Section>
          )}
          </div>
        </main>
        <aside className="min-w-0 space-y-3.5 lg:col-start-2 2xl:col-start-auto">
          <Section title="Request" icon={FileText}>
            <dl className="grid grid-cols-[96px_minmax(0,1fr)] gap-x-2.5 gap-y-1.5 text-[12.5px]">
              <dt className="text-charcoal/60">Category</dt><dd className="min-w-0 break-words font-medium text-charcoal">{job.caseCategory || '-'}</dd>
              {job.medicines && <><dt className="text-charcoal/60">Medicines</dt><dd className="min-w-0 break-words font-medium text-charcoal">{job.medicines}</dd></>}
              <dt className="text-charcoal/60">Notes</dt><dd className="min-w-0 break-words font-medium text-charcoal">{job.requestNotes || '-'}</dd>
              <dt className="text-charcoal/60">Requested</dt><dd className="min-w-0 break-words font-medium text-charcoal">{dateTime(job.requestedAt)} {job.requestedByName && `by ${job.requestedByName}`}</dd>
              <dt className="text-charcoal/60">Ready by</dt><dd className="min-w-0 break-words font-medium text-charcoal">{day(job.readyByDate) || 'not set'}</dd>
            </dl>
            {job.formulation?.pending?.length > 0 && <p className="mt-2.5 rounded-lg bg-[#FBF0DC] px-2.5 py-1.5 text-[11.5px] text-[#7C5B2E]">{job.formulation.pending.length} point(s) pending with the doctor</p>}
          </Section>
          {job.events?.length > 0 && <Section title="Activity" icon={Clock3}><ol className="space-y-2">{job.events.map((e, i) => <li key={i} className="text-[12.5px]"><span className="block text-[11px] text-charcoal/55">{dateTime(e.at)} · {e.byName}</span><b className="font-semibold text-charcoal">{e.action}</b>{e.details ? <span className="text-charcoal/70"> - {e.details}</span> : ''}</li>)}</ol></Section>}
        </aside>
      </div>
      {!canAct && <p className="flex items-center gap-2 text-xs text-charcoal/50"><AlertTriangle size={13} />Read-only view: the Medicine Department and the doctor complete these stages.</p>}
    </div>
  );
}
