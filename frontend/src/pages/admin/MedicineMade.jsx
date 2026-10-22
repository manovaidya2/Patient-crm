import MedicineRequestList from '../../components/MedicineRequestList.jsx';

const MedicineMade = () => (
  <MedicineRequestList
    title="Medicine Made"
    subtitle="Prepared medicines stay listed here; release happens on the fulfilment job once the full payment is verified."
    statuses={['made', 'sent_to_courier']}
    emptyText="No made medicines yet."
    pendingStatuses={['made']}
  />
);

export default MedicineMade;
