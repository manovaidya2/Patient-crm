import MedicineRequestList from '../../components/MedicineRequestList.jsx';

const MedicineMade = () => (
  <MedicineRequestList
    title="Medicine Made"
    subtitle="Made medicines yahan listed rahengi; courier bhejne ke baad bhi yahin status update hota rahega."
    statuses={['made', 'sent_to_courier']}
    emptyText="No made medicines yet."
    actions={[
      { from: ['made'], status: 'sent_to_courier', label: 'Send To Courier' },
    ]}
  />
);

export default MedicineMade;
