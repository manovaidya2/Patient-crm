import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, Check, Clock, IndianRupee, Inbox, Paperclip, RefreshCw } from 'lucide-react';
import api from '../../api/axios.js';
import Card from '../../components/ui/Card.jsx';
import Button from '../../components/ui/Button.jsx';
import Badge from '../../components/ui/Badge.jsx';
import { PATIENT_CATEGORIES } from '../../constants/patientCategories.js';

const categoryTone = (category) => (category === PATIENT_CATEGORIES.AUTISM_ADHD ? 'teal' : 'amber');

const formatDate = (iso) =>
  iso ? new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '-';

const formatMoney = (value) => `Rs ${Number(value || 0).toLocaleString('en-IN')}`;

const currentStageOf = (patient) =>
  patient.stages?.find((stage) => stage.number === patient.currentStage) || {};

const screenshotCount = (stage) =>
  (stage.payments || []).reduce((sum, payment) => sum + (payment.screenshotFiles?.length || 0), 0);

// Accounts approval queue. A patient lands here for one of two reasons:
//  - it's brand new (approvalStatus "pending") and stays hidden from its assigned
//    Assistant Doctor / Psychologist until approved, or
//  - it's already live, but a later payment on some stage still needs sign-off —
//    the patient itself stays visible everywhere, only that payment is flagged.
const PatientApprovals = () => {
  const [patients, setPatients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [approvingId, setApprovingId] = useState(null);
  const [approvingPaymentId, setApprovingPaymentId] = useState(null);
  const [rowError, setRowError] = useState({});

  const fetchPending = async () => {
    setLoading(true);
    setLoadError('');
    try {
      const { data } = await api.get('/patients/pending-approvals');
      setPatients(data.patients || []);
    } catch (err) {
      setLoadError(err.response?.data?.message || 'Could not load pending approvals.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPending();
  }, []);

  const handleApprovePatient = async (patientId) => {
    setApprovingId(patientId);
    setRowError((prev) => ({ ...prev, [patientId]: '' }));
    try {
      await api.patch(`/patients/${patientId}/approve`);
      setPatients((prev) =>
        prev.reduce((acc, patient) => {
          if (patient.id !== patientId) {
            acc.push(patient);
            return acc;
          }
          // Row stays (without the "New Patient" badge/button) if a payment on it is
          // still awaiting approval; otherwise the row is fully cleared.
          if ((patient.pendingPayments || []).length === 0) return acc;
          acc.push({ ...patient, approvalStatus: 'approved' });
          return acc;
        }, [])
      );
    } catch (err) {
      setRowError((prev) => ({ ...prev, [patientId]: err.response?.data?.message || 'Could not approve' }));
    } finally {
      setApprovingId(null);
    }
  };

  const handleApprovePayment = async (patientId, stageNumber, paymentId) => {
    setApprovingPaymentId(paymentId);
    setRowError((prev) => ({ ...prev, [patientId]: '' }));
    try {
      await api.patch(`/patients/${patientId}/stages/${stageNumber}/payments/${paymentId}/approve`);
      setPatients((prev) =>
        prev.reduce((acc, patient) => {
          if (patient.id !== patientId) {
            acc.push(patient);
            return acc;
          }
          const remainingPending = (patient.pendingPayments || []).filter((row) => String(row.paymentId) !== String(paymentId));
          // Drop the row entirely once there's nothing left to review on it.
          if (patient.approvalStatus !== 'pending' && remainingPending.length === 0) return acc;
          acc.push({ ...patient, pendingPayments: remainingPending });
          return acc;
        }, [])
      );
    } catch (err) {
      setRowError((prev) => ({ ...prev, [patientId]: err.response?.data?.message || 'Could not approve payment' }));
    } finally {
      setApprovingPaymentId(null);
    }
  };

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-charcoal">Patient Approvals</h1>
          <p className="mt-1 text-sm text-charcoal/60">
            New patients and new payments on existing patients, waiting for accounts to verify and approve.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchPending} disabled={loading}>
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
        </Button>
      </div>

      <Card className="mt-6" padded={false}>
        {loading ? (
          <div className="p-10 text-center text-sm text-charcoal/55">Loading…</div>
        ) : loadError ? (
          <div className="flex flex-col items-center gap-2 p-10 text-center">
            <AlertTriangle size={22} className="text-[#8C3B2E]" />
            <p className="text-sm font-medium text-charcoal">{loadError}</p>
          </div>
        ) : patients.length === 0 ? (
          <div className="flex flex-col items-center gap-2 p-10 text-center">
            <Inbox size={22} className="text-charcoal/35" />
            <p className="text-sm font-medium text-charcoal">Nothing pending</p>
            <p className="text-xs text-charcoal/55">Every patient and payment added so far has been approved.</p>
          </div>
        ) : (
          <ul className="divide-y divide-cardline-soft">
            {patients.map((patient) => {
              const stage = currentStageOf(patient);
              const screenshots = screenshotCount(stage);
              const isNewPatient = patient.approvalStatus === 'pending';
              const pendingPayments = patient.pendingPayments || [];
              return (
                <li key={patient.id} className="p-4 sm:p-5">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-xs font-bold tracking-widest text-charcoal/45">
                          {patient.patientCode}
                        </span>
                        <Badge tone={categoryTone(patient.category)}>{patient.categoryLabel}</Badge>
                        {isNewPatient && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-[#9C6B2E]/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#9C6B2E]">
                            <Clock size={11} /> New Patient
                          </span>
                        )}
                        {pendingPayments.length > 0 && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-[#8C3B2E]/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#8C3B2E]">
                            <IndianRupee size={11} /> {pendingPayments.length} Payment{pendingPayments.length > 1 ? 's' : ''} Pending
                          </span>
                        )}
                      </div>
                      <Link
                        to={`/admin/patients/${patient.id}`}
                        className="mt-1.5 block text-base font-bold text-charcoal hover:text-sage"
                      >
                        {patient.patientName}
                      </Link>
                      <p className="mt-1 text-xs text-charcoal/55">
                        {patient.currentStageLabel} · Added {formatDate(patient.createdAt)}
                        {stage.postCounselor?.name ? ` · Post Counselor: ${stage.postCounselor.name}` : ''}
                      </p>
                    </div>

                    <div className="flex shrink-0 flex-col items-start gap-2 sm:items-end">
                      <div className="flex items-center gap-4 text-sm">
                        <div className="text-right">
                          <p className="text-[11px] uppercase tracking-wide text-charcoal/45">Package</p>
                          <p className="font-display font-bold text-charcoal">{formatMoney(stage.totalAmount)}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-[11px] uppercase tracking-wide text-charcoal/45">Paid</p>
                          <p className="font-display font-bold text-sage">{formatMoney(stage.amountPaid)}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-[11px] uppercase tracking-wide text-charcoal/45">Screenshots</p>
                          <p className="flex items-center justify-end gap-1 font-display font-bold text-charcoal">
                            <Paperclip size={13} /> {screenshots}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Link to={`/admin/patients/${patient.id}`}>
                          <Button size="sm" variant="outline">
                            View Details
                          </Button>
                        </Link>
                        {isNewPatient && (
                          <Button size="sm" onClick={() => handleApprovePatient(patient.id)} disabled={approvingId === patient.id}>
                            <Check size={14} /> {approvingId === patient.id ? 'Approving...' : 'Approve Patient'}
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>

                  {pendingPayments.length > 0 && (
                    <div className="mt-3 space-y-2 rounded-lg border border-[#8C3B2E]/20 bg-[#8C3B2E]/5 p-3">
                      <p className="text-xs font-bold uppercase tracking-wide text-[#8C3B2E]">Payments awaiting approval</p>
                      {pendingPayments.map((payment) => (
                        <div
                          key={payment.paymentId}
                          className="flex flex-col gap-2 rounded-lg bg-offwhite-100 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between"
                        >
                          <div className="min-w-0 text-xs text-charcoal/70">
                            <span className="font-display text-sm font-bold text-charcoal">{formatMoney(payment.amount)}</span>
                            {' '}· {payment.stageLabel} · {payment.paymentModeLabel} · Paid {formatDate(payment.date)}
                            {payment.recordedByName ? ` · By ${payment.recordedByName}` : ''}
                            {payment.screenshotCount > 0 ? ` · ${payment.screenshotCount} screenshot(s)` : ''}
                          </div>
                          <Button
                            size="sm"
                            onClick={() => handleApprovePayment(patient.id, payment.stage, payment.paymentId)}
                            disabled={approvingPaymentId === payment.paymentId}
                            className="shrink-0 self-start sm:self-auto"
                          >
                            <Check size={13} /> {approvingPaymentId === payment.paymentId ? 'Approving...' : 'Approve Payment'}
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}

                  {rowError[patient.id] && (
                    <p className="mt-2 text-xs font-semibold text-[#8C3B2E]">{rowError[patient.id]}</p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
};

export default PatientApprovals;
