import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ClipboardList, Plus } from 'lucide-react';
import api from '../../api/axios.js';
import Card from '../ui/Card.jsx';
import Button from '../ui/Button.jsx';
import CreatePurchaseOrderModal from './CreatePurchaseOrderModal.jsx';
import PurchaseOrderRow from './PurchaseOrderRow.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { ROLES } from '../../constants/roles.js';

const CREATE_ROLES = [ROLES.ADMIN, ROLES.DOCTOR, ROLES.POST_COUNSELOR, ROLES.IN_TRANSIT];

// Patient Details > Purchase Orders: every PO of this patient, newest first, and "New PO".
export default function PatientPurchaseOrders({ patient }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [items, setItems] = useState(null);
  const [error, setError] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const fixedPatient = useMemo(() => ({ id: patient.id, patientName: patient.patientName, patientCode: patient.patientCode, currentStage: patient.currentStage }), [patient.id, patient.patientName, patient.patientCode, patient.currentStage]);

  const load = useCallback(async () => {
    try { const { data } = await api.get('/purchase-orders', { params: { patient: patient.id }, skipCache: true }); setItems(data.items); setError(''); }
    catch (err) { setError(err.response?.data?.message || 'Could not load purchase orders'); }
  }, [patient.id]);
  useEffect(() => { load(); }, [load]);

  return (
    <Card className="mt-4">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 font-display text-base font-bold text-charcoal"><ClipboardList size={18} className="text-sage" />Purchase orders</h2>
          <p className="mt-0.5 text-xs text-charcoal/55">One PO per medicine purchase. Open a PO to see its full timeline up to treatment start.</p>
        </div>
        {CREATE_ROLES.includes(user?.role) && patient.isActive && <Button size="sm" onClick={() => setCreateOpen(true)}><Plus size={14} />New PO</Button>}
      </div>
      {error && <p className="mb-3 rounded-lg bg-[#8C3B2E]/8 px-3 py-2 text-sm text-[#8C3B2E]">{error}</p>}
      {items === null ? <p className="py-6 text-center text-sm text-charcoal/55">Loading...</p>
        : !items.length ? <p className="rounded-xl border border-dashed border-cardline p-6 text-center text-sm text-charcoal/55">No purchase orders yet.</p>
          : <div className="grid gap-2 lg:grid-cols-2">{items.map((po) => <PurchaseOrderRow key={po.id} po={po} showPatient={false} onOpen={() => navigate(`/admin/purchase-orders/${po.id}`)} />)}</div>}
      <CreatePurchaseOrderModal open={createOpen} patient={fixedPatient} onClose={() => setCreateOpen(false)} onCreated={(po) => { setCreateOpen(false); navigate(`/admin/purchase-orders/${po.id}`); }} />
    </Card>
  );
}
