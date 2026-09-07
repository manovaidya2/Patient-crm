import CourierRequestList from '../../components/CourierRequestList.jsx';

const CourierRequests = () => (
  <CourierRequestList
    title="Courier Requests"
    subtitle="Medicine department se bheji gayi courier requests yahan dispatch hongi."
    statuses={['pending', 'dispatched']}
    emptyText="No courier requests."
  />
);

export default CourierRequests;
