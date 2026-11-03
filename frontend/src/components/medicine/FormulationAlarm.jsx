import { Link } from 'react-router-dom';
import { ExternalLink } from 'lucide-react';
import Button from '../ui/Button.jsx';
import SirenAlarm from '../alarms/SirenAlarm.jsx';

// The doctor's alarm: formulations waiting on the doctor (fulfilment step 2) for more than a day.
const since = (h) => (h >= 48 ? `${Math.floor(h / 24)} days` : `${h} hours`);

export default function FormulationAlarm({ user }) {
  return (
    <SirenAlarm
      user={user}
      name="formulation"
      url="/medicine-jobs/doctor-alarms"
      title="Formulation pending for over a day"
      intro={(alarms) => `${alarms.length} patient${alarms.length === 1 ? '' : 's'} waiting for your formulation (fulfilment step 2). The Medicine Department cannot start until you send it.`}
      renderItem={(a, snooze) => <>
        <span><b>{a.patientName}</b> <span className="text-charcoal/60">{[a.patientCode, `Phase ${a.phase}`, a.poNumber].filter(Boolean).join(' · ')}</span><span className="block text-xs font-semibold text-[#B91C1C]">Waiting {since(a.hours)}</span></span>
        <Link to={`/admin/medicine-jobs/${a.id}`} onClick={snooze}><Button size="sm"><ExternalLink size={13} />Open & create</Button></Link>
      </>}
    />
  );
}
