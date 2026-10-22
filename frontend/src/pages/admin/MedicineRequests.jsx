import MedicineRequestList from '../../components/MedicineRequestList.jsx';

const MedicineRequests = () => (
  <MedicineRequestList
    title="New Medicine Requests"
    subtitle="Medicine requests received with prescriptions will be processed here."
    statuses={['requested', 'in_process', 'made', 'cancelled']}
    emptyText="No new medicine requests."
    pendingStatuses={['requested', 'in_process']}
  />
);

export default MedicineRequests;
