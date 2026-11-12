import { useEffect, useState } from 'react';
import { Settings2 } from 'lucide-react';
import api from '../../api/axios.js';
import Button from '../ui/Button.jsx';
import { Section } from '../ui/Layout.jsx';
import { WEEKDAYS, errText, field, fmtDT } from './deliveryUi.js';

// The rules a plan is made with. Days are counted from the medicine start date in a 6 month plan; a shorter plan
// is scaled down.
const GROUPS = [
  ['Regular follow-ups', [
    ['followUpsPerSixMonths', 'Follow-ups in a 6 month plan', 'A shorter plan gets its share'],
    ['firstFollowUpDay', 'First follow-up on day', ''],
    ['lastFollowUpGap', 'Last follow-up, days before the plan ends', ''],
  ]],
  ['Sessions (day after the medicine starts)', [
    ['dietGuidanceDay', "Do's, don'ts and diet guidance", ''],
    ['panchakarmaDay', 'Panchakarma kit demonstration', ''],
    ['sensoryDay', 'Sensory guidance session', ''],
    ['plansDay', 'Written plans hand-over', 'Home therapy, behaviour / routine, functional skills'],
    ['dietReviewDay', 'Diet review session', ''],
  ]],
  ['PCC tasks near the end of the phase (day)', [
    ['reviewPrepDay', 'Phase review prep', 'Collect missing trackers'],
    ['bookNextDay', 'Book the next-phase doctor consultation', ''],
    ['nextCounsellingDay', 'Next-phase counselling and approval', ''],
  ]],
  ['Phase length', [
    ['phaseMonths', 'Months in a treatment phase', 'The medicine can come in any split of months / days (1 + 5, 2 + 4, 3 + 3 ...): the plan is made for the whole phase and scheduled supply by supply. A custom package of a Mental Health patient (45 days ...) is a phase of its own length'],
  ]],
  ['Calendar and limits', [
    ['defaultHour', 'Usual session hour (24 h)', 'Saturday, Sunday and Tuesday start at 2 pm'],
    ['confirmWindowDays', 'Confirm with the parent this many days ahead', ''],
    ['rescheduleLimit', 'Reschedules allowed in a phase', 'Beyond it only the Admin / Manager'],
    ['nextPhaseAlertDays', 'Next-phase options open, days before the phase ends', ''],
    ['catchUpDays', 'Items older than this many days are left out', 'When a plan is made late'],
  ]],
];

export default function DeliverySettings() {
  const [info, setInfo] = useState(null);
  const [rules, setRules] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const take = (data) => { setInfo(data); setRules({ ...data.rules, doctorReviewDays: [...data.rules.doctorReviewDays], closedWeekdays: [...data.rules.closedWeekdays] }); };
  useEffect(() => { api.get('/delivery/settings', { skipCache: true }).then(({ data }) => take(data)).catch((err) => setError(errText(err, 'The settings could not be loaded'))); }, []);

  if (!info || !rules) return error ? <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : <p className="rounded-xl border border-dashed border-cardline bg-white py-10 text-center text-sm text-charcoal/55">Loading the settings...</p>;

  const locked = !info.canEdit;
  const setRule = (key, value) => { setRules((old) => ({ ...old, [key]: value })); setNotice(''); };
  const setReview = (index, value) => setRule('doctorReviewDays', rules.doctorReviewDays.map((day, i) => (i === index ? value : day)));
  const toggleDay = (n) => setRule('closedWeekdays', rules.closedWeekdays.includes(n) ? rules.closedWeekdays.filter((day) => day !== n) : [...rules.closedWeekdays, n].sort());

  const save = async (event) => {
    event.preventDefault();
    setBusy(true); setError(''); setNotice('');
    try {
      const body = { ...rules, doctorReviewDays: rules.doctorReviewDays.map(Number) };
      Object.keys(info.limits).forEach((key) => { body[key] = rules[key] === '' ? '' : Number(rules[key]); });
      const { data } = await api.put('/delivery/settings', { rules: body });
      take(data); setNotice(data.message || 'Settings saved');
    } catch (err) { setError(errText(err)); }
    finally { setBusy(false); }
  };

  return (
    <form onSubmit={save} className="space-y-4">
      <Section title="Treatment Delivery settings" icon={Settings2}>
        <p className="text-sm text-charcoal/75">These rules decide which day each session, follow-up and task lands on when a plan is made. <b>A plan already made keeps the rules it was made with</b>; changes apply to plans made from now on.</p>
        <p className="mt-1 text-xs text-charcoal/55">{locked ? 'Only the Admin can change these.' : 'You can change these as the Admin.'}{info.updatedByName ? ` Last changed by ${info.updatedByName}${info.updatedAt ? ` on ${fmtDT(info.updatedAt)}` : ''}.` : ' Still on the defaults.'}</p>
      </Section>

      {GROUPS.map(([title, rows]) => (
        <Section key={title} title={title}>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {rows.map(([key, text, hint]) => {
              const [min, max] = info.limits[key] || [0, 999];
              return (
                <label key={key} className="block text-sm font-medium text-charcoal">{text}
                  <input type="number" required min={min} max={max} step={1} disabled={locked} value={rules[key]} onChange={(e) => setRule(key, e.target.value)} className={`mt-1.5 ${field}`} />
                  <span className="mt-1 block text-[11px] font-normal text-charcoal/55">{hint ? `${hint} · ` : ''}{min} to {max} · default {info.defaults[key]}</span>
                </label>
              );
            })}
          </div>
        </Section>
      ))}

      <Section title="Doctor treatment reviews (day)">
        <div className="grid gap-3 sm:grid-cols-3">
          {rules.doctorReviewDays.map((day, index) => (
            <label key={index} className="block text-sm font-medium text-charcoal">Review {index + 1}
              <input type="number" required min={15} max={180} step={1} disabled={locked} value={day} onChange={(e) => setReview(index, e.target.value)} className={`mt-1.5 ${field}`} />
              <span className="mt-1 block text-[11px] font-normal text-charcoal/55">15 to 180 · default {info.defaults.doctorReviewDays[index]}</span>
            </label>
          ))}
        </div>
        <p className="mt-2 text-[11px] text-charcoal/55">Three different days. Made only when "Medical hand-holding" is ticked.</p>
      </Section>

      <Section title="Closed weekdays">
        <div className="flex flex-wrap gap-1.5">
          {WEEKDAYS.map((name, n) => (
            <label key={name} className={`flex cursor-pointer items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm ${rules.closedWeekdays.includes(n) ? 'border-[#DC2626] bg-[#FDE2E1] text-[#9F1D1D]' : 'border-cardline bg-white text-charcoal'}`}>
              <input type="checkbox" disabled={locked} checked={rules.closedWeekdays.includes(n)} onChange={() => toggleDay(n)} className="h-4 w-4 accent-[#9F1D1D]" />{name}
            </label>
          ))}
        </div>
        <p className="mt-2 text-[11px] text-charcoal/55">No plan session is put on a closed weekday or on an HR holiday (at most five closed days). Wednesday is always off on the PCC calendar.</p>
      </Section>

      {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {notice && <p role="status" className="rounded-lg border border-[#A7D3B8] bg-[#F6FBF7] px-3 py-2 text-sm text-[#1F6B41]">{notice}</p>}
      {!locked && (
        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="outline" disabled={busy} onClick={() => { setRules({ ...info.defaults, doctorReviewDays: [...info.defaults.doctorReviewDays], closedWeekdays: [...info.defaults.closedWeekdays] }); setNotice(''); }}>Fill the defaults</Button>
          <Button type="submit" disabled={busy}>{busy ? 'Saving...' : 'Save settings'}</Button>
        </div>
      )}
    </form>
  );
}
