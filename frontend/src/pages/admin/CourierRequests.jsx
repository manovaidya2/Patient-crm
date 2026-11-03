import ScheduleTabs from '../../components/ScheduleTabs.jsx';

// Porter / courier deliveries In Transit scheduled on the PO (the day it goes), the ones on the way, and the delivered ones.
const TABS = [
  { key: 'scheduled', label: 'Scheduled', section: 'pending', subtitle: 'Scheduled on the PO timeline (step "Schedule delivery": porter or courier with its day). On that day fill the delivery details and dispatch from the PO.', empty: 'Nothing to send: a medicine shows up here once In Transit schedules a porter / courier delivery on the PO.' },
  { key: 'onTheWay', label: 'On the way', section: 'delivered', received: false, subtitle: 'Dispatched by porter / courier, receipt not confirmed yet. Confirm the receipt on the PO once the patient has it.', empty: 'Nothing on the way.' },
  { key: 'delivered', label: 'Delivered', section: 'delivered', received: true, subtitle: 'Received by the patient. Each one keeps showing its In Transit step (explanation, treatment start).', empty: 'Nothing delivered yet.' },
];

const CourierRequests = () => <ScheduleTabs mode="shipped" title="Porter / Courier Schedule" tabs={TABS} />;

export default CourierRequests;
