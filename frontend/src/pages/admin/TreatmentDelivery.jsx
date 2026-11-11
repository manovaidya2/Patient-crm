import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ArrowLeft, CalendarCheck, CalendarPlus, ClipboardList, HeartHandshake, Search, TriangleAlert } from 'lucide-react';
import api from '../../api/axios.js';
import useLiveEvent from '../../api/useLiveEvent.js';
import Button from '../../components/ui/Button.jsx';
import Badge from '../../components/ui/Badge.jsx';
import { PageHeader, Section, StatRow, StatTile } from '../../components/ui/Layout.jsx';
import DeliveryPlan from '../../components/delivery/DeliveryPlan.jsx';
import DeliverySettings from '../../components/delivery/DeliverySettings.jsx';
import { LEVEL_CLASS, STATE_TONE, STATUS_TONE, errText, fmtDT, fmtDay, fmtTime, istDay } from '../../components/delivery/deliveryUi.js';

const TABS = [['today', 'Today and alerts'], ['patients', 'Patients'], ['settings', 'Settings']];
const STATUSES = [['', 'All'], ['setup', 'Set-up needed'], ['running', 'Running'], ['delivered', 'Delivered'], ['waiting', 'Waiting for start date']];
const empty = 'rounded-xl border border-dashed border-cardline bg-white py-8 text-center text-sm text-charcoal/55';
const rowButton = 'flex w-full flex-wrap items-center justify-between gap-2 rounded-[12px] border border-[#E8DFCB] bg-white px-3 py-2.5 text-left transition hover:border-sage/60';
const who = (row) => `${row.patientName}${row.patientCode ? ` (${row.patientCode})` : ''} · Phase ${row.phase}`;
const needsDecision = (row) => Boolean(row.nextPhase?.due && (!row.nextPhase.decision || row.nextPhase.callBackDue));

// Treatment Delivery: the sessions and follow-ups every phase promised on its Treatment & PO paper (section D),
// made from the medicine start date, and what happens when the phase is delivered.
export default function TreatmentDelivery() {
  const [params, setParams] = useSearchParams();
  const patientId = params.get('p') || '';
  const phase = params.get('s') || '';
  const focusId = params.get('e') || '';
  const tab = TABS.some(([key]) => key === params.get('tab')) ? params.get('tab') : 'today';

  const [rows, setRows] = useState(null);
  const [today, setToday] = useState('');
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');

  const load = useCallback(async () => {
    try {
      const { data } = await api.get('/delivery/worklist', { skipCache: true });
      setRows(data.rows); setToday(data.today); setError('');
    } catch (err) { setError(errText(err, 'The list could not be loaded')); }
  }, []);
  useEffect(() => { load(); const t = setInterval(load, 60000); return () => clearInterval(t); }, [load]);
  useLiveEvent('delivery:changed', load);

  const openPlan = (row, entryId = '') => setParams({ p: row.patientId, s: String(row.phase), ...(entryId ? { e: entryId } : {}) });
  const setTab = (key) => setParams(key === 'today' ? {} : { tab: key });

  const all = rows || [];
  const view = useMemo(() => {
    const sessions = all.flatMap((row) => row.open.map((s) => ({ ...s, row })));
    const weekEnd = Date.now() + 7 * 86400000;
    return {
      setup: all.filter((row) => row.status === 'setup'),
      decisions: all.filter(needsDecision),
      todays: sessions.filter((s) => istDay(s.at) === today).sort((a, b) => new Date(a.at) - new Date(b.at)),
      coming: sessions.filter((s) => istDay(s.at) > today && new Date(s.at).getTime() <= weekEnd).sort((a, b) => new Date(a.at) - new Date(b.at)),
      alerts: all.flatMap((row) => row.alerts.filter((alert) => alert.type !== 'next_phase').map((alert) => ({ ...alert, row })))
        .sort((a, b) => (a.level === b.level ? new Date(a.at || 0) - new Date(b.at || 0) : a.level === 'red' ? -1 : 1)),
    };
  }, [all, today]);
  const count = (...types) => view.alerts.filter((alert) => types.includes(alert.type)).length;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return all.filter((row) => (!status || row.status === status)
      && (!q || [row.patientName, row.patientCode, row.phone, row.pccName, row.purchaseOrder].some((value) => String(value || '').toLowerCase().includes(q))));
  }, [all, search, status]);

  if (patientId && phase) {
    return (
      <div className="space-y-4">
        <PageHeader icon={HeartHandshake} eyebrow="Treatment Delivery" title="Phase plan" subtitle="What was promised, every session made from it, and what comes next"
          actions={<Button variant="outline" onClick={() => setParams(tab === 'today' ? {} : { tab })}><ArrowLeft size={15} />Back to the list</Button>} />
        <DeliveryPlan key={`${patientId}-${phase}`} patientId={patientId} phase={phase} focusId={focusId} onChanged={load} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader icon={HeartHandshake} title="Treatment Delivery" subtitle="Sessions and follow-ups made from each phase's section D ticks, counted from the medicine start date" />

      <div className="grid gap-2 sm:grid-cols-3">
        {TABS.map(([key, text]) => (
          <button key={key} type="button" aria-pressed={tab === key} onClick={() => setTab(key)} className={`rounded-[12px] border px-3 py-2.5 text-left text-[13px] font-bold text-charcoal ${tab === key ? 'border-sage bg-[#F3F6F2] ring-1 ring-sage' : 'border-[#E8DFCB] bg-white hover:border-sage/50'}`}>
            {text}{key === 'patients' && rows ? <span className="ml-1.5 font-normal text-charcoal/55">({all.length})</span> : null}
          </button>
        ))}
      </div>

      {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {tab === 'settings' && <DeliverySettings />}
      {tab !== 'settings' && !rows && !error && <p className={empty}>Loading...</p>}

      {tab === 'today' && rows && (
        <>
          <StatRow>
            <StatTile label="Sessions today" value={view.todays.length} tone={view.todays.length ? 'orange' : 'plain'} />
            <StatTile label="Set-up needed" value={view.setup.length} tone={view.setup.length ? 'red' : 'plain'} hint="Plan not made yet" />
            <StatTile label="To confirm" value={count('confirm')} tone={count('confirm') ? 'orange' : 'plain'} hint="Tell the parent the date" />
            <StatTile label="Missed / form due" value={count('missed', 'form', 'overdue')} tone={count('missed', 'form', 'overdue') ? 'red' : 'plain'} />
            <StatTile label="Next-phase decisions" value={view.decisions.length} tone={view.decisions.length ? 'orange' : 'plain'} hint="Book / needs time / not continuing" />
          </StatRow>

          {all.length === 0 && <p className={empty}>No phase has a Treatment Delivery plan yet. A plan is made by itself when the medicine start date is saved on the Medicine Explanations page.</p>}

          {view.decisions.length > 0 && (
            <Section title={`Next phase: choose what happens (${view.decisions.length})`} icon={CalendarPlus} tone="action">
              <ul className="space-y-2">
                {view.decisions.map((row) => (
                  <li key={`${row.patientId}-${row.phase}`}>
                    <button type="button" onClick={() => openPlan(row)} className={rowButton}>
                      <span className="min-w-0"><span className="block text-[13.5px] font-bold text-charcoal">{who(row)}</span><span className="block text-xs text-charcoal/65">{row.nextPhase.callBackDue ? 'The call-back time has come: talk to the parent and choose again' : row.nextPhase.delivered ? 'Treatment delivery complete' : `Phase ends on ${fmtDay(row.nextPhase.endDate)}`}{row.pccName ? ` · PCC ${row.pccName}` : ''}</span></span>
                      <Badge tone="action">Book appointment / needs time / not continuing</Badge>
                    </button>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {view.setup.length > 0 && (
            <Section title={`Set-up needed (${view.setup.length})`} icon={ClipboardList} tone="action">
              <ul className="space-y-2">
                {view.setup.map((row) => (
                  <li key={`${row.patientId}-${row.phase}`}>
                    <button type="button" onClick={() => openPlan(row)} className={rowButton}>
                      <span className="min-w-0"><span className="block text-[13.5px] font-bold text-charcoal">{who(row)}</span><span className="block text-xs text-charcoal/65">{row.setupNeededWhy === 'months' ? 'The months of medicine supplied are not on record' : row.setupNeededWhy === 'components' ? 'The section D ticks are not on record' : 'The plan has to be set up'}{row.startDate ? ` · medicine started ${fmtDay(row.startDate)}` : ''}</span></span>
                      <Badge tone="action">Set up</Badge>
                    </button>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          <Section title={`Today's sessions (${view.todays.length})`} icon={CalendarCheck}>
            {view.todays.length === 0 ? <p className="text-sm text-charcoal/55">No plan session today.</p> : (
              <ul className="space-y-2">
                {view.todays.map((s) => (
                  <li key={s.id}>
                    <button type="button" onClick={() => openPlan(s.row, s.id)} className={rowButton}>
                      <span className="min-w-0"><span className="block text-[13.5px] font-bold text-charcoal">{fmtTime(s.at)} · {s.title}</span><span className="block text-xs text-charcoal/65">{who(s.row)}{s.row.phone ? ` · ${s.row.phone}` : ''}</span></span>
                      <Badge tone={STATE_TONE[s.state] || 'default'}>{s.stateLabel}</Badge>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          {view.alerts.length > 0 && (
            <Section title={`Needs attention (${view.alerts.length})`} icon={TriangleAlert}>
              <ul className="space-y-1.5">
                {view.alerts.map((alert, i) => (
                  <li key={`${alert.row.patientId}-${alert.row.phase}-${alert.type}-${alert.sessionId || alert.taskKey || i}`}>
                    <button type="button" onClick={() => openPlan(alert.row, alert.sessionId || '')} className={`w-full rounded-lg border px-3 py-2 text-left text-[13px] transition hover:opacity-85 ${LEVEL_CLASS[alert.level] || LEVEL_CLASS.amber}`}>
                      <span className="font-bold">{who(alert.row)}</span><span className="block">{alert.text}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {view.coming.length > 0 && (
            <Section title={`Coming in the next 7 days (${view.coming.length})`} icon={CalendarCheck}>
              <ul className="space-y-2">
                {view.coming.map((s) => (
                  <li key={s.id}>
                    <button type="button" onClick={() => openPlan(s.row, s.id)} className={rowButton}>
                      <span className="min-w-0"><span className="block text-[13.5px] font-bold text-charcoal">{s.title}</span><span className="block text-xs text-charcoal/65">{fmtDT(s.at)} · {who(s.row)}</span></span>
                      <Badge tone={STATE_TONE[s.state] || 'default'}>{s.stateLabel}</Badge>
                    </button>
                  </li>
                ))}
              </ul>
            </Section>
          )}
        </>
      )}

      {tab === 'patients' && rows && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[200px] flex-1">
              <Search size={15} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-charcoal/45" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search patient, ID, mobile, PCC, PO" aria-label="Search" className="w-full rounded-lg border border-cardline bg-white py-2 pl-8 pr-3 text-sm outline-none focus:border-sage" />
            </div>
            <div className="flex flex-wrap gap-1.5">
              {STATUSES.map(([key, text]) => <button key={key || 'all'} type="button" aria-pressed={status === key} onClick={() => setStatus(key)} className={`rounded-full border px-3 py-1 text-xs font-bold transition ${status === key ? 'border-sage bg-sage text-white' : 'border-cardline bg-white text-charcoal/65 hover:border-sage/50'}`}>{text} ({key ? all.filter((row) => row.status === key).length : all.length})</button>)}
            </div>
          </div>

          {filtered.length === 0 ? <p className={empty}>{all.length ? 'No phase matches.' : 'No phase has a Treatment Delivery plan yet.'}</p> : (
            <ul className="space-y-2">
              {filtered.map((row) => {
                const next = row.open[0];
                const percent = row.progress.total ? Math.round((row.progress.done / row.progress.total) * 100) : 0;
                const red = row.alerts.filter((alert) => alert.level === 'red').length;
                return (
                  <li key={`${row.patientId}-${row.phase}`}>
                    <button type="button" onClick={() => openPlan(row)} className="w-full rounded-[12px] border border-[#E8DFCB] bg-white px-3 py-3 text-left transition hover:border-sage/60">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-[13.5px] font-bold text-charcoal">{row.patientName}{row.patientCode && <span className="ml-1.5 font-normal text-charcoal/55">{row.patientCode}</span>}</p>
                          <p className="text-xs text-charcoal/65">Phase {row.phase}{row.purchaseOrder ? ` · ${row.purchaseOrder}` : ''}{row.pccName ? ` · PCC ${row.pccName}` : ''}{row.startDate ? ` · ${fmtDay(row.startDate)}${row.endDate ? ` to ${fmtDay(row.endDate)}` : ''}` : ''}</p>
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5">
                          {needsDecision(row) && <Badge tone="action">Next phase: decide</Badge>}
                          {row.nextPhase?.decision && !row.nextPhase.callBackDue && <Badge tone={row.nextPhase.decision.decision === 'book' ? 'green' : row.nextPhase.decision.decision === 'time' ? 'amber' : 'danger'}>{row.nextPhase.decision.decision === 'book' ? 'Next appointment booked' : row.nextPhase.decision.decision === 'time' ? 'Parent needs time' : 'Not continuing'}</Badge>}
                          {red > 0 && <Badge tone="danger">{red} urgent</Badge>}
                          {row.alerts.length - red > 0 && <Badge tone="amber">{row.alerts.length - red} to do</Badge>}
                          <Badge tone={STATUS_TONE[row.status] || 'default'}>{row.statusLabel}</Badge>
                        </div>
                      </div>
                      {row.planMonths > 0 && (
                        <div className="mt-2">
                          <div className="flex flex-wrap items-center justify-between gap-2 text-[11.5px] text-charcoal/60">
                            <span>{row.progress.done} of {row.progress.total} sessions done · medicine for {row.coveredMonths} of {row.planMonths} month(s)</span>
                            <span>{next ? `Next: ${next.title} · ${fmtDT(next.at)}` : row.status === 'delivered' ? 'All sessions done' : 'No session waiting'}</span>
                          </div>
                          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[#F3EEE2]"><div className={`h-full rounded-full ${row.status === 'delivered' ? 'bg-[#2F8F5B]' : 'bg-sage'}`} style={{ width: `${percent}%` }} /></div>
                          {row.nextSupply && <p className={`mt-1 text-[11.5px] ${row.nextSupply.level === 'red' ? 'font-semibold text-[#9F1D1D]' : row.nextSupply.level === 'amber' ? 'font-semibold text-[#7C5B2E]' : 'text-charcoal/60'}`}>Next supply ({row.nextSupply.monthsLeft} month(s)): {row.nextSupply.text}{row.nextSupply.daysLeft != null ? ` · medicine in hand ${row.nextSupply.daysLeft >= 0 ? `for ${row.nextSupply.daysLeft} more day(s)` : `finished ${-row.nextSupply.daysLeft} day(s) ago`}` : ''}</p>}
                        </div>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
