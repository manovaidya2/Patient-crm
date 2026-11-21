import { useSearchParams } from 'react-router-dom';
import MedicineRequestList from '../../components/MedicineRequestList.jsx';

// Only requests still being worked: once the fulfilment job's final check marks the medicine made, the request moves
// to Medicine Made (and a cancelled one stays on the patient's record), so this list is the open work.
// ?status=requested | in_process (from a "Your pending work" step card) shows only those.
const STEP_STATUSES = ['requested', 'in_process'];
const MedicineRequests = () => {
  const [params] = useSearchParams();
  const only = STEP_STATUSES.includes(params.get('status')) ? [params.get('status')] : null;
  return (
  <MedicineRequestList
    key={only ? only[0] : 'all'}
    title="New Medicine Requests"
    subtitle="Requests still being prepared. Open the fulfilment job and complete it step by step; once the medicine is ready it moves to Medicine Made."
    statuses={only || ['requested', 'in_process']}
    emptyText="No medicine request is waiting."
    pendingStatuses={['requested', 'in_process']}
  />
  );
};

export default MedicineRequests;
