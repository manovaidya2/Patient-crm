import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, ClipboardList, Phone, X } from 'lucide-react';
import api from '../../api/axios.js';
import useLiveEvent from '../../api/useLiveEvent.js';
import Button from '../ui/Button.jsx';
import Badge from '../ui/Badge.jsx';
import { Section } from '../ui/Layout.jsx';
import NextPhaseCard from './NextPhaseCard.jsx';
import PlanSessions from './PlanSessions.jsx';
import { CorrectTicks, OnRequest, PlanTasks, PromiseTracker, SkippedItems, SupplyParts, TickPicker } from './PlanExtras.jsx';
import { LEVEL_CLASS, STATUS_TONE, errText, field, fmtDay, istDay, istToday } from './deliveryUi.js';

// Makes the plan of a phase that has none: the section D ticks, the medicine start date and the months of medicine.
function SetupForm({ plan, act }) {
  const s = plan.setup;
  const [ticks, setTicks] = useState(s.components);
  const [form, setForm] = useState({ startDate: s.startDate || '', months: s.months ? String(s.months) : '', planMonths: s.months ? String(s.planMonths) : '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(plan.status !== 'waiting');

  const submit = async (event) => {
    event.preventDefault();
    if (!ticks.length) { setError('Tick at least one component of section D'); return; }
    if (!form.startDate) { setError('Choose the medicine start date'); return; }
    if (!Number(form.months)) { setError('Enter the months of medicine supplied'); return; }
    setBusy(true); setError('');
    try { await act('setup', { components: ticks, startDate: form.startDate, months: Number(form.months), planMonths: Number(form.planMonths) || Number(form.months) }); }
    catch (err) { setError(errText(err)); setBusy(false); }
  };

  const why = plan.status === 'waiting'
    ? 'The section D ticks are on record. The plan is made by itself as soon as the medicine start date is saved on the Medicine Explanations page; nothing needs to be done here.'
    : s.why === 'components' ? 'The medicine start date is saved, but the section D ticks of this phase are not on record. Tick what the Treatment & PO paper promises and the plan is made.'
      : s.why === 'months' ? 'The medicine start date is saved, but the months of medicine supplied are not on record. Enter them and the plan is made.'
        : plan.status === 'none' ? 'This phase has no Treatment Delivery plan (it started before this page existed). Set it up here if its sessions should be scheduled from a medicine start date.'
          : 'The plan of this phase has to be set up by hand.';

  return (
    <Section title="Set up the Treatment Delivery plan" icon={ClipboardList} tone={plan.status === 'setup' ? 'action' : undefined}>
      <p className="text-sm text-charcoal/75">{why}</p>
      {!plan.canAct ? null : !open ? (
        <button type="button" onClick={() => setOpen(true)} className="mt-2 text-xs font-bold text-sage underline">Set it up by hand now (only if the start date will not come from Medicine Explanations)</button>
      ) : (
        <form onSubmit={submit} className="mt-3 space-y-3">
          <div>
            <p className="mb-1.5 text-sm font-medium text-charcoal">Section D: what is ticked on the Treatment & PO paper *{s.source === 'paper' && <span className="ml-1.5 text-xs font-normal text-charcoal/55">(taken from the saved paper, correct if needed)</span>}</p>
            <TickPicker options={s.options} value={ticks} onChange={setTicks} />
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="block text-sm font-medium text-charcoal">Medicine start date *
              <input type="date" required disabled={Boolean(s.startDate)} value={form.startDate} onChange={(e) => setForm((old) => ({ ...old, startDate: e.target.value }))} className={`mt-1.5 ${field}`} />
              {s.startDate && <span className="mt-1 block text-[11px] font-normal text-charcoal/55">Saved on Medicine Explanations</span>}
            </label>
            <label className="block text-sm font-medium text-charcoal">Months of medicine in hand *
              <input type="number" min={1} max={12} required disabled={s.months > 0} value={form.months} onChange={(e) => setForm((old) => ({ ...old, months: e.target.value }))} className={`mt-1.5 ${field}`} />
              {s.months > 0 && <span className="mt-1 block text-[11px] font-normal text-charcoal/55">From the medicine request</span>}
            </label>
            <label className="block text-sm font-medium text-charcoal">Months of the whole plan
              <input type="number" min={Number(form.months) || 1} max={12} disabled={s.months > 0} value={form.planMonths} placeholder={form.months || 'Same as supplied'} onChange={(e) => setForm((old) => ({ ...old, planMonths: e.target.value }))} className={`mt-1.5 ${field}`} />
              <span className="mt-1 block text-[11px] font-normal text-charcoal/55">For example 2 months in hand of a 6 month plan</span>
            </label>
          </div>
          <p className="text-[11px] text-charcoal/55">Sessions and follow-ups are made from the start date for the months in hand, on working days. Items already more than two weeks old on the day the plan is made are left out and can be scheduled by hand.</p>
          {error && <p role="alert" className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          <div className="flex justify-end"><Button type="submit" disabled={busy}>{busy ? 'Making the plan...' : 'Make the plan'}</Button></div>
        </form>
      )}
    </Section>
  );
}

// One phase's Treatment Delivery plan: what was promised, every session and follow-up made from it, and what is next.
export default function DeliveryPlan({ patientId, phase, focusId = '', onChanged }) {
  const [plan, setPlan] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [correcting, setCorrecting] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get(`/delivery/patients/${patientId}/${phase}`, { skipCache: true });
      setPlan(data.plan); setError('');
    } catch (err) { setError(errText(err, 'The plan could not be loaded')); }
    finally { setLoading(false); }
  }, [patientId, phase]);
  useEffect(() => { setPlan(null); setLoading(true); setNotice(''); load(); }, [load]);
  useLiveEvent('delivery:changed', (payload) => { if (!payload || (String(payload.patientId) === String(patientId) && Number(payload.phase) === Number(phase))) load(); });

  // Every save answers with the fresh plan, so the page never shows stale state.
  const act = useCallback(async (path, body) => {
    const { data } = await api.post(`/delivery/patients/${patientId}/${phase}/${path}`, body);
    if (data.plan) setPlan(data.plan);
    setNotice(data.message || 'Saved');
    onChanged?.();
    return data;
  }, [patientId, phase, onChanged]);

  if (loading && !plan) return <p className="rounded-xl border border-dashed border-cardline bg-white py-10 text-center text-sm text-charcoal/55">Loading the plan...</p>;
  if (!plan) return <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error || 'The plan could not be loaded'}</p>;

  const d = plan.delivery;
  const percent = plan.progress.total ? Math.round((plan.progress.done / plan.progress.total) * 100) : 0;
  const todayCount = plan.sessions.filter((s) => s.status === 'scheduled' && istDay(s.dateTime) === istToday()).length;
  // The next-phase card leads the page once its options are open; before that it sits at the end.
  const nextFirst = Boolean(plan.nextPhase?.due);

  return (
    <div className="space-y-4">
      <section className="rounded-[14px] border border-[#E8DFCB] bg-white p-4 sm:p-[18px]">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="font-display text-lg font-extrabold leading-tight text-charcoal">{plan.patient.name}</h2>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-charcoal/65">
              {plan.patient.code && <span>{plan.patient.code}</span>}
              <span>Phase {plan.phase}</span>
              {plan.purchaseOrder && <span>{plan.purchaseOrder}</span>}
              {plan.patient.phone && <a href={`tel:${plan.patient.phone}`} className="inline-flex items-center gap-1 text-sage"><Phone size={12} />{plan.patient.phone}</a>}
              <span>PCC: {plan.patient.pccName || 'not assigned'}</span>
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={STATUS_TONE[plan.status] || 'default'}>{plan.statusLabel}</Badge>
            <Link to={`/admin/patients/${plan.patient.id}`} className="text-xs font-bold text-sage underline">Open patient</Link>
          </div>
        </div>
        {d && (
          <div className="mt-3">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-charcoal/65">
              <span>{fmtDay(d.parts[0]?.startDate)} to {fmtDay(d.endDate)} · {d.planMonths} month plan{d.coveredDays < d.phaseDays ? ` (${Math.round(d.coveredDays / 30)} month(s) of medicine started)` : ''}</span>
              <span className="font-bold text-charcoal">{plan.progress.done} of {plan.progress.total} sessions done{todayCount ? ` · ${todayCount} today` : ''}</span>
            </div>
            <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-[#F3EEE2]" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}><div className={`h-full rounded-full ${plan.status === 'delivered' ? 'bg-[#2F8F5B]' : 'bg-sage'}`} style={{ width: `${percent}%` }} /></div>
          </div>
        )}
        {!plan.canAct && <p className="mt-3 rounded-lg border border-cardline bg-[#FCFAF5] px-3 py-2 text-xs text-charcoal/65">View only: this patient is with another PCC.</p>}
      </section>

      {notice && (
        <div role="status" className="flex items-start justify-between gap-2 rounded-lg border border-[#A7D3B8] bg-[#F6FBF7] px-3 py-2 text-sm text-[#1F6B41]">
          <span className="flex min-w-0 items-start gap-1.5"><CheckCircle2 size={15} className="mt-0.5 shrink-0" />{notice}</span>
          <button type="button" aria-label="Dismiss" onClick={() => setNotice('')} className="shrink-0 rounded p-0.5 hover:bg-[#E6F2EA]"><X size={14} /></button>
        </div>
      )}
      {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {!d && <SetupForm key={`${plan.patient.id}-${plan.phase}-${plan.status}`} plan={plan} act={act} />}

      {d && plan.alerts.length > 0 && (
        <Section title={`Needs attention (${plan.alerts.length})`} icon={AlertTriangle}>
          <ul className="space-y-1.5">
            {plan.alerts.map((alert, i) => <li key={`${alert.type}-${alert.sessionId || alert.taskKey || i}`} className={`rounded-lg border px-3 py-2 text-[13px] ${LEVEL_CLASS[alert.level] || LEVEL_CLASS.amber}`}>{alert.text}</li>)}
          </ul>
        </Section>
      )}

      {d && nextFirst && <NextPhaseCard plan={plan} act={act} />}
      {d && <PlanSessions plan={plan} act={act} focusId={focusId} />}
      {d && <PlanTasks plan={plan} act={act} />}
      {d && <SupplyParts plan={plan} act={act} />}
      {d && <SkippedItems plan={plan} act={act} />}
      {d && <OnRequest plan={plan} act={act} />}
      {d && <PromiseTracker plan={plan} onCorrect={() => setCorrecting(true)} />}
      {d && !nextFirst && <NextPhaseCard plan={plan} act={act} />}
      {d && correcting && <CorrectTicks plan={plan} act={act} onClose={() => setCorrecting(false)} />}
    </div>
  );
}
