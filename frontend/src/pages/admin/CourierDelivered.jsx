import CourierRequestList from '../../components/CourierRequestList.jsx';

const CourierDelivered = () => (
  <CourierRequestList
    title="Delivered Couriers"
    subtitle="Delivered courier records yahan history ke liye listed rahenge."
    statuses={['delivered']}
    emptyText="No delivered courier records."
  />
);

export default CourierDelivered;
