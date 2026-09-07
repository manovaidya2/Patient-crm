import CourierRequestList from '../../components/CourierRequestList.jsx';

const CourierRequests = () => (
  <CourierRequestList
    title="Courier Requests"
    subtitle="Courier requests sent by the medicine department will be dispatched here."
    statuses={['pending', 'dispatched']}
    emptyText="No courier requests."
  />
);

export default CourierRequests;
