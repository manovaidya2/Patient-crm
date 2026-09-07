import CourierRequestList from '../../components/CourierRequestList.jsx';

const CourierDelivered = () => (
  <CourierRequestList
    title="Delivered Couriers"
    subtitle="Delivered courier records will stay listed here for history."
    statuses={['delivered']}
    emptyText="No delivered courier records."
  />
);

export default CourierDelivered;
