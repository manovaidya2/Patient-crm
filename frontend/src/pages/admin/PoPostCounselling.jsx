import { useMemo } from 'react';
import PostCounselingRecordModal from '../../components/postcounseling/PostCounselingRecordModal.jsx';

// The post-counselling record (sections A to E, registration, PO paper) exactly as the Post Counselor filled it,
// shown under the PO's first step ("PO created") so In Transit sees the same form with the same answers. Read-only.
export default function PoPostCounselling({ poId, only = null }) {
  const patient = useMemo(() => ({ id: poId }), [poId]);
  return <PostCounselingRecordModal asPage readOnly patient={patient} recordUrl={`/purchase-orders/${poId}/post-counselling`} only={only} />;
}
