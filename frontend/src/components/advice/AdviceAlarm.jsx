import { Link } from 'react-router-dom';
import { ExternalLink } from 'lucide-react';
import Button from '../ui/Button.jsx';
import SirenAlarm from '../alarms/SirenAlarm.jsx';

// The doctor's alarm: a PCC rang it because a patient query is still not answered. It rings on every login / refresh
// and the moment a PCC rings, until the doctor answers (or snoozes it for 20 minutes).
const since = (iso) => {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  return mins < 60 ? `${mins} min` : mins < 2880 ? `${Math.floor(mins / 60)} h` : `${Math.floor(mins / 1440)} days`;
};

export default function AdviceAlarm({ user }) {
  return (
    <SirenAlarm
      user={user}
      name="advice"
      url="/advice/doctor-alarms"
      liveEvent="advice:alarm"
      title="Patient query waiting for your answer"
      intro={(alarms) => `The PCC rang for ${alarms.length} patient quer${alarms.length === 1 ? 'y' : 'ies'} that ${alarms.length === 1 ? 'is' : 'are'} not answered yet.`}
      renderItem={(a, snooze) => <>
        <span className="min-w-0"><b>{a.patientName}</b> <span className="text-charcoal/60">{[a.patientCode, a.stage ? `Phase ${a.stage}` : ''].filter(Boolean).join(' · ')}</span>{a.isUrgent && <span className="ml-1 text-xs font-bold text-[#B91C1C]">EMERGENCY</span>}
          <span className="block text-xs text-charcoal/75">"{a.query}"</span>
          <span className="block text-xs font-semibold text-[#B91C1C]">Rung {a.rings} time{a.rings === 1 ? '' : 's'} by {a.lastAlarmBy || 'PCC'}{a.lastNote ? ` - ${a.lastNote}` : ''} · waiting {since(a.waitingSince)}</span></span>
        <Link to="/admin/request-for-advice" onClick={snooze}><Button size="sm"><ExternalLink size={13} />Answer</Button></Link>
      </>}
    />
  );
}
