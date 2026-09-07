import MedicineRequestList from '../../components/MedicineRequestList.jsx';

const MedicineMade = () => (
  <MedicineRequestList
    title="Medicine Made"
    subtitle="Prepared medicines stay listed here, with courier status updates after dispatch."
    statuses={['made', 'sent_to_courier']}
    emptyText="No made medicines yet."
    actions={[
      { from: ['made'], status: 'sent_to_courier', label: 'Send To Courier' },
    ]}
  />
);

export default MedicineMade;
