import CourierHandoverList from '../../components/CourierHandoverList.jsx';

// Medicines In Transit has scheduled for courier, porter or self pickup, still to be sent / collected.
const CourierRequests = () => (
  <CourierHandoverList
    section="pending"
    title="Courier Requests"
    subtitle="Scheduled on the PO timeline (courier, porter or self pickup with its expected date). Dispatch or hand over from the PO; it then moves to Delivered Couriers."
    emptyText="Nothing to send: a medicine shows up here once In Transit schedules its delivery on the PO."
  />
);

export default CourierRequests;
