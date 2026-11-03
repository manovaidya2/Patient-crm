import { Link } from 'react-router-dom';
import { ExternalLink } from 'lucide-react';
import Button from '../ui/Button.jsx';
import SirenAlarm from '../alarms/SirenAlarm.jsx';

// In Transit's alarm: the Medicine Department rang it because a job waits on In Transit (quality check / final check).
// It rings the moment they ring it, and on every login / refresh until the step is done.
const when = (value) => new Date(value).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

export default function TransitAlarm({ user }) {
  return (
    <SirenAlarm
      user={user}
      name="transit"
      url="/medicine-jobs/transit-alarms"
      liveEvent="transit:alarm"
      title="Medicine Department is calling you"
      intro={(alarms) => `${alarms.length} job${alarms.length === 1 ? '' : 's'} waiting for In Transit. The Medicine Department rang this alarm so the step below is done now.`}
      renderItem={(a, snooze) => <>
        <span className="min-w-0">
          <b>{a.patientName}</b> <span className="text-charcoal/60">{[a.patientCode, `Phase ${a.phase}`, a.poNumber].filter(Boolean).join(' · ')}</span>
          <span className="block text-xs font-bold text-[#B91C1C]">Why: step {a.stepNo} "{a.step}" is waiting for you to verify</span>
          {a.note && <span className="block text-xs text-charcoal/80">Message: {a.note}</span>}
          <span className="block text-[11px] text-charcoal/55">Rung by {a.byName} · {when(a.at)}</span>
        </span>
        <Link to={`/admin/medicine-jobs/${a.id}`} onClick={snooze}><Button size="sm"><ExternalLink size={13} />Open & verify</Button></Link>
      </>}
    />
  );
}
