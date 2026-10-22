import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { AlertTriangle, ArrowLeft, Check, CheckCircle2, Clock3, ExternalLink, FileText, Lock, PauseCircle, Pill, PlayCircle, Printer, RefreshCw, RotateCcw, ShieldCheck } from 'lucide-react';
import api from '../../api/axios.js';
import Button from '../../components/ui/Button.jsx';
import Badge from '../../components/ui/Badge.jsx';
import { CompactAttachments } from '../../components/ui/Attachments.jsx';
import FormulationSheet from '../../components/medicine/FormulationSheet.jsx';
import { Chip, FieldLabel, poInput } from '../../components/purchaseOrders/CreatePurchaseOrderModal.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { ROLES, ROLE_LABELS } from '../../constants/roles.js';
import { AGE_BANDS, SUPPLY_OPTIONS, supplyKeyOf } from '../../constants/supplyPlans.js';

const day = (v) => (v ? new Date(v).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '');
const dateTime = (v) => (v ? new Date(v).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '');
const inputDay = (v) => (v ? new Date(v).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }) : '');
const money = (v) => `Rs ${Number(v || 0).toLocaleString('en-IN')}`;
const num = (v) => (v == null || Number.isNaN(Number(v)) ? '-' : Number.isInteger(Number(v)) ? String(v) : String(Math.round(Number(v) * 1000) / 1000));
const URGENCY = { breached: ['Overdue', 'bg-[#8C3B2E]/10 text-[#8C3B2E]'], critical: ['Due within 24 h', 'bg-[#8C3B2E]/10 text-[#8C3B2E]'], risk: ['Due within 48 h', 'bg-amber-100 text-amber-900'], normal: ['On time', 'bg-emerald-100 text-emerald-800'] };
const ErrorText = ({ children }) => (children ? <p className="rounded-lg bg-[#8C3B2E]/8 px-3 py-2 text-sm text-[#8C3B2E]">{children}</p> : null);
const Section = ({ title, icon: Icon, action, children }) => (
  <section className="rounded-xl border border-cardline bg-white p-4"><div className="mb-3 flex items-center justify-between gap-2"><h3 className="flex items-center gap-2 text-sm font-bold text-charcoal">{Icon && <Icon size={16} className="text-sage" />}{title}</h3>{action}</div>{children}</section>
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

function StageWork({ job, stage, canAct, onDone, onError }) {
  const { user } = useAuth();
  const [err, setErr] = useState('');
  // Errors show at the top of the page and right above the button, so a rejected stage is never missed.
  const report = (message) => { setErr(message); onError(message); };
  const isPreparer = Boolean(job.preparerName) && (user?.name || '').trim().toLowerCase() === job.preparerName.trim().toLowerCase();
  const [checks, setChecks] = useState({});
  const [fields, setFields] = useState({});
  const [notes, setNotes] = useState('');
  const [consumption, setConsumption] = useState({});
  const [chits, setChits] = useState({});
  const [files, setFiles] = useState({});
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setChecks({}); setNotes(''); setConsumption({}); setChits({}); setFiles({});
    setFields(stage.key === 'accept' ? { readyByDate: inputDay(job.readyByDate) } : stage.key === 'prepare' ? { preparerName: '' } : {});
  }, [stage.key, job.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const allChecked = stage.checks.every((_, i) => checks[i]);
  const submit = async () => {
    setBusy(true); report('');
    try {
      const body = new FormData();
      body.append('checks', JSON.stringify(stage.checks.map((_, i) => Boolean(checks[i]))));
      body.append('fields', JSON.stringify(fields));
      body.append('notes', notes);
      if (stage.key === 'prepare') body.append('consumption', JSON.stringify(job.consumption.map((c) => ({ code: c.code, actual: consumption[c.code] === undefined || consumption[c.code] === '' ? null : Number(consumption[c.code]) }))));
      if (stage.key === 'fill') body.append('chits', JSON.stringify(job.chits.map((c) => ({ key: c.key, confirmed: c.confirmed || Boolean(chits[c.key]) }))));
      (stage.files || []).forEach((f) => (files[f.key] || []).forEach((file) => body.append(f.key, file)));
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
    return <FieldLabel key={f.key} label={f.label} required={f.required}><input className={poInput} type={f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : 'text'} value={v} onChange={(e) => set(e.target.value)} disabled={!canAct} /></FieldLabel>;
  };
  const endDate = job.readyByDate && job.formulation ? new Date(new Date(job.readyByDate).getTime() + job.formulation.days * 86400000) : null;
  return (
    <div className="space-y-4">
      {stage.key === 'review' && job.formulation && (
        <div className={`flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-xs ${job.masterOutdated ? 'border-amber-300 bg-amber-50 text-amber-900' : 'border-cardline bg-offwhite-200/60 text-charcoal/70'}`}>
          <span>Built from the Formulation Master {job.formulation.master?.version ? `v${job.formulation.master.version}` : '(document values)'}{job.formulation.master?.updatedByName ? ` · edited by ${job.formulation.master.updatedByName}` : ''}.{[ROLES.ADMIN, ROLES.DOCTOR].includes(user?.role) && <> <Link to="/admin/formulation-master" className="font-semibold text-sage hover:underline">Open Formulation Master</Link></>}</span>
          {job.masterOutdated && <span className="flex items-center gap-2 font-semibold">The master changed since (now v{job.masterVersion}).{canAct && <Button size="sm" variant="outline" disabled={busy} onClick={rebuild}><RefreshCw size={13} />Rebuild sheet</Button>}</span>}
        </div>
      )}
      {stage.key === 'review' && <FormulationSheet f={job.formulation} patientName={job.patientName} patientCode={job.patientCode} canEdit={canAct} jobId={job.id} onSaved={onDone} onError={report} />}
      {stage.key === 'qc' && job.preparerName && (
        <p className={`rounded-lg px-3 py-2 text-sm ${isPreparer ? 'bg-[#8C3B2E]/8 text-[#8C3B2E]' : 'bg-offwhite-200/60 text-charcoal/70'}`}>
          Prepared by <b>{job.preparerName}</b>. {isPreparer ? 'You prepared this medicine, so the pack QC must be completed by a colleague, the doctor or the admin (SOP: independent check).' : 'The pack QC is an independent check, done by someone other than the preparer.'}
        </p>
      )}
      {stage.key === 'stock' && <>
        <StockTable rows={job.stockTable} endDate={endDate} />
        {job.stockTable.some((r) => r.status === 'short') && <label className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900"><input type="checkbox" className="mt-0.5 h-4 w-4 accent-amber-700" disabled={!canAct} checked={Boolean(fields.shortageAccepted)} onChange={(e) => setFields((o) => ({ ...o, shortageAccepted: e.target.checked }))} disabled={!canAct} />Shortage request raised for the short items; continue (preparation will still need the stock).</label>}
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
      {stage.key === 'photos' && <div className="grid gap-3 sm:grid-cols-2">{stage.files.map((f) => <FieldLabel key={f.key} label={f.label} required={f.required}><input className={`${poInput} text-xs`} type="file" accept="image/*" multiple disabled={!canAct} onChange={(e) => setFiles((o) => ({ ...o, [f.key]: [...e.target.files] }))} /></FieldLabel>)}</div>}
      {stage.key === 'release' && job.payment && (
        <div className={`rounded-lg px-3 py-2 text-sm ${job.payment.releasable ? 'bg-emerald-50 text-emerald-900' : 'bg-amber-50 text-amber-900'}`}>
          <b>{job.payment.releasable ? 'Payment cleared by In Transit.' : 'Release blocked.'}</b> Phase {job.phase}: {money(job.payment.amountPaid)} verified of {money(job.payment.totalAmount)}{job.payment.remaining > 0 ? `, balance ${money(job.payment.remaining)}` : ''}{job.payment.pendingCount ? `, ${job.payment.pendingCount} payment(s) pending verification` : ''}{!job.payment.patientApproved ? ', patient not approved' : ''}{job.payment.hold ? ', phase on hold' : ''}.
        </div>
      )}
      <div>
        <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-charcoal/45">Checklist · {stage.sop}</p>
        <ul className="space-y-1">{stage.checks.map((c, i) => <li key={i}><label className={`flex items-start gap-2 rounded-lg px-2 py-1.5 text-sm ${checks[i] ? 'text-charcoal/55 line-through decoration-cardline' : 'text-charcoal'} ${canAct ? 'cursor-pointer hover:bg-offwhite-200' : ''}`}><input type="checkbox" className="mt-0.5 h-4 w-4 accent-sage" checked={Boolean(checks[i])} disabled={!canAct} onChange={(e) => setChecks((o) => ({ ...o, [i]: e.target.checked }))} />{c}</label></li>)}</ul>
      </div>
      {stage.fields.length > 0 && <div className="grid gap-3 sm:grid-cols-2">{stage.fields.map(field)}</div>}
      <FieldLabel label="Stage notes"><input className={poInput} value={notes} onChange={(e) => setNotes(e.target.value)} disabled={!canAct} /></FieldLabel>
      <ErrorText>{err}</ErrorText>
      {canAct ? <Button disabled={busy || !allChecked || (stage.key === 'qc' && isPreparer)} onClick={submit}><Check size={15} />{busy ? 'Saving...' : stage.key === 'release' ? 'Release to In Transit' : stage.key === 'final' ? 'Mark medicine ready' : 'Complete stage'}</Button>
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

  const shown = useMemo(() => (job ? job.stages[view ?? Math.min(job.currentStage, job.totalStages - 1)] : null), [job, view]);
  if (!job) return <div className="space-y-3"><button type="button" onClick={() => navigate(-1)} className="inline-flex items-center gap-1.5 text-sm font-medium text-sage"><ArrowLeft size={15} /> Back</button>{error ? <ErrorText>{error}</ErrorText> : <p className="p-6 text-center text-sm text-charcoal/55">Loading job...</p>}</div>;
  const isCurrent = shown && shown.state === 'current';
  const stageCanAct = canAct && isCurrent && !job.hold && job.status !== 'released' && shown.roles.includes(user?.role);
  const [urgLabel, urgTone] = URGENCY[job.urgency?.level] || URGENCY.normal;
  // Supply / age group belong to the formulation check, so only that stage's owner changes them.
  const canChangeSupply = canAct && job.currentStage <= 2 && job.status === 'open' && (job.stages.find((s) => s.key === 'review')?.roles || []).includes(user?.role);

  return (
    <div className="space-y-4">
      <button type="button" onClick={() => (window.history.state?.idx > 0 ? navigate(-1) : navigate('/admin/medicine-requests'))} className="inline-flex items-center gap-1.5 text-sm font-medium text-sage hover:text-charcoal"><ArrowLeft size={15} /> Back</button>
      <div className="flex flex-wrap items-start gap-3">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-sage/15 text-sage"><Pill size={22} /></span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2"><h1 className="font-display text-xl font-bold text-charcoal sm:text-2xl">{job.patientName}</h1>{job.poNumber && <span className="font-mono text-sm font-bold text-charcoal/70">{job.poNumber}</span>}<Badge tone={job.status === 'released' ? 'inactive' : job.status === 'ready' ? 'teal' : 'amber'}>{job.status === 'released' ? 'Released' : job.status === 'ready' ? 'Medicine ready' : 'In fulfilment'}</Badge>{job.hold && <Badge tone="danger">On hold</Badge>}</div>
          <p className="mt-0.5 text-sm text-charcoal/65">{job.patientCode} · Phase {job.phase} · {job.supplyLabel || 'supply not set'} · {job.ageBandLabel || 'age group not set'} · requested {dateTime(job.requestedAt)}{job.requestedByName ? ` by ${job.requestedByName}` : ''}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {job.readyByDate && <span className={`rounded-full px-3 py-1 text-xs font-bold ${urgTone}`}>{urgLabel} · ready by {day(job.readyByDate)}</span>}
          {job.purchaseOrderId && <Link to={`/admin/purchase-orders/${job.purchaseOrderId}`}><Button size="sm" variant="outline"><ExternalLink size={14} />PO</Button></Link>}
          {canAct && job.status !== 'released' && !job.hold && <Button size="sm" variant="outline" onClick={() => setHoldOpen((v) => !v)}><PauseCircle size={14} />Hold</Button>}
        </div>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-cardline"><div className="h-full bg-sage transition-all" style={{ width: `${job.progress}%` }} /></div>
      <ErrorText>{error}</ErrorText>
      {notice && <p className="flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800"><CheckCircle2 size={15} />{notice}</p>}
      {holdOpen && <div className="flex flex-wrap gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3"><input className={`${poInput} flex-1`} placeholder="Reason for the hold (e.g. dose unclear, leak)" value={holdText} onChange={(e) => setHoldText(e.target.value)} /><Button size="sm" disabled={!holdText.trim()} onClick={() => act('hold', { reason: holdText })}>Put on hold</Button></div>}
      {job.hold && <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#8C3B2E]/30 bg-[#8C3B2E]/5 p-3 text-sm"><span><b className="text-[#8C3B2E]">On hold:</b> {job.hold.reason} <span className="text-charcoal/50">({job.hold.byName}, {dateTime(job.hold.at)})</span></span>{canAct && <div className="flex gap-2"><input className={`${poInput} w-64`} placeholder="Corrective action taken" value={holdText} onChange={(e) => setHoldText(e.target.value)} /><Button size="sm" disabled={!holdText.trim()} onClick={() => act('resume', { note: holdText })}><PlayCircle size={14} />Resume</Button></div>}</div>}
      {job.formulation?.pending?.length > 0 && <div className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900"><b>Points the doctor still has to confirm:</b> {job.formulation.pending.join(' ')}</div>}

      <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
        <nav className="flex gap-1 overflow-x-auto lg:sticky lg:top-4 lg:flex-col lg:self-start" aria-label="Stages">
          {job.stages.map((s, i) => (
            <button key={s.key} type="button" onClick={() => setView(i)} aria-current={shown?.key === s.key ? 'step' : undefined} className={`flex shrink-0 items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition lg:w-full ${shown?.key === s.key ? 'bg-white shadow-sm ring-1 ring-sage/40' : 'hover:bg-white/70'}`}>
              <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 text-[11px] font-bold ${s.state === 'done' ? 'border-emerald-600 bg-emerald-600 text-white' : s.state === 'current' ? 'border-sage bg-white text-sage' : 'border-cardline bg-white text-charcoal/40'}`}>{s.state === 'done' ? <Check size={12} /> : s.n}</span>
              <span className="min-w-0"><span className={`block truncate font-semibold ${s.state === 'todo' ? 'text-charcoal/50' : 'text-charcoal'}`}>{s.label}</span><span className="block truncate text-[11px] text-charcoal/50">{s.state === 'done' ? `${s.doneByName} · ${dateTime(s.doneAt)}` : s.roles.map((r) => ROLE_LABELS[r]).join(' / ')}</span></span>
            </button>
          ))}
        </nav>
        <main className="min-w-0 space-y-4">
          {shown && (
            <Section title={`${shown.n}. ${shown.label}`} icon={shown.state === 'done' ? CheckCircle2 : shown.state === 'current' ? ShieldCheck : Clock3} action={<span className="text-xs text-charcoal/50">{shown.hi} · {shown.sop}</span>}>
              <p className="mb-3 text-sm text-charcoal/70">{shown.purpose}</p>
              {shown.state === 'done' ? (
                <div className="space-y-2 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-semibold">Completed by {shown.doneByName} ({ROLE_LABELS[shown.doneByRole] || shown.doneByRole}) · {dateTime(shown.doneAt)}</p>
                    {user?.role === ROLES.ADMIN && job.status !== 'cancelled' && (revertKey === shown.key
                      ? <span className="flex flex-wrap items-center gap-2"><input className={`${poInput} w-64`} placeholder="Why is this reverted?" value={revertReason} onChange={(e) => setRevertReason(e.target.value)} /><Button size="sm" disabled={!revertReason.trim()} onClick={runRevert}><RotateCcw size={13} />Revert to this stage</Button><Button size="sm" variant="outline" onClick={() => setRevertKey('')}>Cancel</Button></span>
                      : <button type="button" className="inline-flex items-center gap-1 text-xs font-semibold text-[#8C3B2E] hover:underline" title="Admin: undo this stage and every stage after it" onClick={() => { setRevertKey(shown.key); setRevertReason(''); }}><RotateCcw size={12} />Revert</button>)}
                  </div>
                  {Object.entries(shown.values || {}).filter(([, v]) => v !== '' && v != null && v !== false).map(([k, v]) => <p key={k}><span className="text-emerald-900/60">{shown.fields.find((f) => f.key === k)?.label || k}:</span> {String(v)}</p>)}
                  {shown.notes && <p>Notes: {shown.notes}</p>}
                  {shown.key === 'review' && <FormulationSheet f={job.formulation} patientName={job.patientName} patientCode={job.patientCode} />}
                  {shown.key === 'prepare' && <ul className="font-mono text-xs">{job.consumption.map((c) => <li key={c.code}>{c.code}: {num(c.actual)} {c.unit} drawn (sheet {num(c.planned)})</li>)}</ul>}
                  {shown.key === 'fill' && <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{job.chits.map((c) => <ChitCard key={c.key} chit={c} patientName={job.patientName} checked disabled onToggle={() => {}} />)}</div>}
                  {shown.key === 'photos' && <><CompactAttachments files={job.photos.overview} label="Photo A" /><CompactAttachments files={job.photos.papers} label="Photo B" /></>}
                </div>
              ) : shown.state === 'todo' ? (
                <p className="flex items-center gap-2 text-sm text-charcoal/55"><Lock size={14} />Opens after "{job.stages[job.currentStage]?.label}". Done by {shown.roles.map((r) => ROLE_LABELS[r]).join(' / ')}.</p>
              ) : (
                <>
                  {shown.key === 'review' && canChangeSupply && (
                    <div className="mb-4 rounded-lg border border-cardline bg-offwhite-200/60 p-3">
                      <p className="mb-2 text-xs font-bold uppercase tracking-wide text-charcoal/50">Age group &amp; supply (from the request; change only if the prescription says otherwise)</p>
                      <div className="flex flex-wrap gap-1.5">{AGE_BANDS.map((b) => <Chip key={b.value} active={supply.ageBand === b.value} onClick={() => setSupply((s) => ({ ...s, ageBand: b.value }))}>{b.label}</Chip>)}</div>
                      <div className="mt-2 flex flex-wrap gap-1.5">{SUPPLY_OPTIONS.map((o) => <Chip key={o.key} active={supply.supplyKey === o.key} onClick={() => setSupply((s) => ({ ...s, supplyKey: o.key }))}>{o.label}</Chip>)}</div>
                      {(supply.ageBand !== job.ageBand || supply.supplyKey !== supplyKeyOf(job.supplyPlan, job.supplyPart)) && <Button size="sm" className="mt-2" onClick={saveSupply}>Rebuild sheet</Button>}
                    </div>
                  )}
                  {!stageCanAct && !job.hold && job.status !== 'released' && <p className="mb-3 flex items-center gap-2 rounded-lg bg-offwhite-200 px-3 py-2 text-sm font-semibold text-charcoal/70"><Lock size={14} />View only: this stage is filled by {shown.roles.map((r) => ROLE_LABELS[r]).join(' / ')}.</p>}
                  <StageWork key={shown.key} job={job} stage={shown} canAct={stageCanAct} onDone={done} onError={setError} />
                </>
              )}
            </Section>
          )}
          <Section title="Request" icon={FileText}>
            <div className="grid gap-x-6 text-sm sm:grid-cols-2">
              <p><span className="text-charcoal/55">Medicines:</span> {job.medicines || '-'}</p>
              <p><span className="text-charcoal/55">Notes:</span> {job.requestNotes || '-'}</p>
              <p><span className="text-charcoal/55">Requested:</span> {dateTime(job.requestedAt)} {job.requestedByName && `by ${job.requestedByName}`}</p>
              <p><span className="text-charcoal/55">Ready by:</span> {day(job.readyByDate) || 'not set'}</p>
            </div>
          </Section>
          {job.events?.length > 0 && <Section title="Activity" icon={Clock3}><ol className="space-y-1.5">{job.events.map((e, i) => <li key={i} className="flex gap-3 text-sm"><span className="w-28 shrink-0 text-xs text-charcoal/45">{dateTime(e.at)}</span><span className="min-w-0"><b className="font-semibold text-charcoal">{e.action}</b>{e.details ? <span className="text-charcoal/70"> - {e.details}</span> : ''} <span className="text-xs text-charcoal/45">· {e.byName}</span></span></li>)}</ol></Section>}
        </main>
      </div>
      {!canAct && <p className="flex items-center gap-2 text-xs text-charcoal/50"><AlertTriangle size={13} />Read-only view: the Medicine Department and the doctor complete these stages.</p>}
    </div>
  );
}
