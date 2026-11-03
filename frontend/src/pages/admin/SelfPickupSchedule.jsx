import ScheduleTabs from '../../components/ScheduleTabs.jsx';

// Self pickups In Transit scheduled on the PO (the day the patient comes), and the ones already collected.
const TABS = [
  { key: 'scheduled', label: 'Scheduled', section: 'pending', subtitle: 'Scheduled on the PO timeline (step "Schedule delivery": self pickup with the day the patient comes). Hand it over from the PO on that day.', empty: 'No self pickup scheduled: a medicine shows up here once In Transit schedules a self pickup on the PO.' },
  { key: 'complete', label: 'Self pickup complete', section: 'delivered', subtitle: 'Collected at the clinic. Each one keeps showing its In Transit step (explanation, treatment start).', empty: 'No self pickup collected yet.' },
];

const SelfPickupSchedule = () => <ScheduleTabs mode="pickup" title="Self Pickup Schedule" tabs={TABS} />;

export default SelfPickupSchedule;
