import MedicineRequestList from '../../components/MedicineRequestList.jsx';

const MedicineRequests = () => (
  <MedicineRequestList
    title="New Medicine Requests"
    subtitle="Medicine requests received with prescriptions will be processed here."
    statuses={['requested', 'in_process', 'made', 'cancelled']}
    emptyText="No new medicine requests."
    actions={[
      { from: ['requested'], status: 'in_process', label: 'Accept (set ready date)', variant: 'outline' },
      { from: ['requested', 'in_process'], status: 'made', label: 'Medicine Made', requiresImage: true },
    ]}
  />
);

export default MedicineRequests;
