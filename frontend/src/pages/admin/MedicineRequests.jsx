import MedicineRequestList from '../../components/MedicineRequestList.jsx';

// Only requests still being worked: once the fulfilment job's final check marks the medicine made, the request moves
// to Medicine Made (and a cancelled one stays on the patient's record), so this list is the open work.
const MedicineRequests = () => (
  <MedicineRequestList
    title="New Medicine Requests"
    subtitle="Requests still being prepared. Open the fulfilment job and complete it step by step; once the medicine is ready it moves to Medicine Made."
    statuses={['requested', 'in_process']}
    emptyText="No medicine request is waiting."
    pendingStatuses={['requested', 'in_process']}
  />
);

export default MedicineRequests;
