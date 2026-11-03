import { Link } from 'react-router-dom';
import { ExternalLink } from 'lucide-react';
import Button from '../ui/Button.jsx';
import SirenAlarm from '../alarms/SirenAlarm.jsx';

// A PCC's alarm, rung by the Medicine Department while a kit waits on them: kind 'papers' (step 9, treatment papers) or
// 'final' (step 11, final verification check). It rings the moment they ring it, and on every login / refresh until done.
const when = (value) => new Date(value).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
const WHAT = { papers: ['kit', 'treatment papers', 'Open & make papers'], final: ['parcel', 'the final check', 'Open & check'] };

export default function PaperAlarm({ user, kind = 'papers' }) {
  const [thing, waitsFor, button] = WHAT[kind];
  return (
    <SirenAlarm
      user={user}
      name={kind === 'final' ? 'final-check' : 'papers'}
      url={`/treatment-papers/alarms?kind=${kind}`}
      liveEvent="pcc:alarm"
      title="Medicine Department is calling you"
      intro={(alarms) => `${alarms.length} ${thing}${alarms.length === 1 ? '' : 's'} waiting for ${waitsFor}. The Medicine Department rang this alarm so it is done now.`}
      renderItem={(a, snooze) => <>
        <span className="min-w-0">
          <b>{a.patientName}</b> <span className="text-charcoal/60">{[a.patientCode, `Phase ${a.phase}`, a.poNumber].filter(Boolean).join(' · ')}</span>
          <span className="block text-xs font-bold text-[#B91C1C]">Why: step {a.stepNo} "{a.step}" is waiting for you</span>
          {a.note && <span className="block text-xs text-charcoal/80">Message: {a.note}</span>}
          <span className="block text-[11px] text-charcoal/55">Rung by {a.byName} · {when(a.at)}</span>
        </span>
        <Link to={kind === 'final' ? '/admin/final-check' : `/admin/medicine-jobs/${a.id}`} onClick={snooze}><Button size="sm"><ExternalLink size={13} />{button}</Button></Link>
      </>}
    />
  );
}
