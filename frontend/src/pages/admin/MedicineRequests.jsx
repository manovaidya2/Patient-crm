import MedicineRequestList from '../../components/MedicineRequestList.jsx';

const MedicineRequests = () => (
  <MedicineRequestList
    title="New Medicine Requests"
    subtitle="Prescription ke saath aayi medicine requests yahan process hongi."
    statuses={['requested', 'in_process']}
    emptyText="No new medicine requests."
    actions={[
      { from: ['requested'], status: 'in_process', label: 'Mark In Process', variant: 'outline' },
      { from: ['requested', 'in_process'], status: 'made', label: 'Medicine Made', requiresImage: true },
    ]}
  />
);

export default MedicineRequests;
