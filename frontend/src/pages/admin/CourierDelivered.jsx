import CourierHandoverList from '../../components/CourierHandoverList.jsx';

// Medicines dispatched or collected (from the PO timeline), with who received them and the delays.
const CourierDelivered = () => (
  <CourierHandoverList
    section="delivered"
    title="Delivered Couriers"
    subtitle="Dispatched and collected medicines from the PO timeline, kept for history."
    emptyText="Nothing dispatched or collected yet."
  />
);

export default CourierDelivered;
