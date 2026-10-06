import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login.jsx';
import AdminLayout from './pages/admin/AdminLayout.jsx';
import EnquiryNotifications from './components/EnquiryNotifications.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import { useAuth } from './context/AuthContext.jsx';
import { ADMIN_LAYOUT_ROLES, PATIENT_ACCESS_ROLES, ROLES, getDefaultRoute } from './constants/roles.js';

const GenericDashboard = lazy(() => import('./pages/GenericDashboard.jsx'));
const Dashboard = lazy(() => import('./pages/admin/Dashboard.jsx'));
const StaffDashboard = lazy(() => import('./pages/admin/StaffDashboard.jsx'));
const TeamMembers = lazy(() => import('./pages/admin/TeamMembers.jsx'));
const AllPatients = lazy(() => import('./pages/admin/AllPatients.jsx'));
const InactivePatients = lazy(() => import('./pages/admin/InactivePatients.jsx'));
const PatientApprovals = lazy(() => import('./pages/admin/PatientApprovals.jsx'));
const PatientDetails = lazy(() => import('./pages/admin/PatientDetails.jsx'));
const PatientsByStage = lazy(() => import('./pages/admin/PatientsByStage.jsx'));
const Accounts = lazy(() => import('./pages/admin/Accounts.jsx'));
const Invoices = lazy(() => import('./pages/admin/Invoices.jsx'));
const Expenses = lazy(() => import('./pages/admin/Expenses.jsx'));
const FollowUps = lazy(() => import('./pages/admin/FollowUps.jsx'));
const FamilySessions = lazy(() => import('./pages/admin/FamilySessions.jsx'));
const Payments = lazy(() => import('./pages/admin/Payments.jsx'));
const FinancialLedger = lazy(() => import('./pages/admin/FinancialLedger.jsx'));
const Refunds = lazy(() => import('./pages/admin/Refunds.jsx'));
const ApprovedPayments = lazy(() => import('./pages/admin/ApprovedPayments.jsx'));
const MedicineRequests = lazy(() => import('./pages/admin/MedicineRequests.jsx'));
const MedicineMade = lazy(() => import('./pages/admin/MedicineMade.jsx'));
const MedicineInventory = lazy(() => import('./pages/admin/MedicineInventory.jsx'));
const ClinicInventory = lazy(() => import('./pages/admin/ClinicInventory.jsx'));
const CourierRequests = lazy(() => import('./pages/admin/CourierRequests.jsx'));
const CourierDelivered = lazy(() => import('./pages/admin/CourierDelivered.jsx'));
const RequestForAdvice = lazy(() => import('./pages/admin/RequestForAdvice.jsx'));
const AdviceGiven = lazy(() => import('./pages/admin/AdviceGiven.jsx'));
const Worksheet = lazy(() => import('./pages/admin/Worksheet.jsx'));
const CrmChatGPT = lazy(() => import('./pages/admin/CrmChatGPT.jsx'));
const DigitalMarketing = lazy(() => import('./pages/admin/DigitalMarketing.jsx'));
const PackageNotBought = lazy(() => import('./pages/admin/PackageNotBought.jsx'));
const PackageNotBoughtDetails = lazy(() => import('./pages/admin/PackageNotBoughtDetails.jsx'));
const PaymentSettings = lazy(() => import('./pages/admin/PaymentSettings.jsx'));
const SalesWorkspace = lazy(() => import('./pages/SalesWorkspace.jsx'));
const ReceptionistDashboard = lazy(() => import('./pages/admin/ReceptionistDashboard.jsx'));
const ReceptionistHomeDashboard = lazy(() => import('./pages/admin/ReceptionistHomeDashboard.jsx'));
const ReceptionistChecklist = lazy(() => import('./pages/admin/ReceptionistChecklist.jsx'));
const Enquiries = lazy(() => import('./pages/admin/Enquiries.jsx'));
const KnowledgeLibrary = lazy(() => import('./pages/admin/KnowledgeLibrary.jsx'));
const RecordRoom = lazy(() => import('./pages/admin/RecordRoom.jsx'));
const ReceptionRegister = lazy(() => import('./pages/admin/ReceptionRegister.jsx'));
const CrmHistory = lazy(() => import('./pages/admin/CrmHistory.jsx'));

const FOLLOWUP_ACCESS_ROLES = PATIENT_ACCESS_ROLES.filter((role) => ![ROLES.PSYCHOLOGIST, ROLES.ACCOUNTANT, ROLES.POST_COUNSELOR].includes(role));
const FAMILY_SESSION_ACCESS_ROLES = PATIENT_ACCESS_ROLES.filter((role) => ![ROLES.ACCOUNTANT, ROLES.POST_COUNSELOR].includes(role));
const WORKSHEET_ACCESS_ROLES = [ROLES.ADMIN, ROLES.DOCTOR, ROLES.MANAGER, ROLES.ASSISTANT_DOCTOR, ROLES.PSYCHOLOGIST];
const DASHBOARD_ACCESS_ROLES = [ROLES.ADMIN, ROLES.DOCTOR, ROLES.MANAGER, ROLES.ASSISTANT_DOCTOR, ROLES.PSYCHOLOGIST, ROLES.RECEPTIONIST];
const DIGITAL_MARKETING_ACCESS_ROLES = [ROLES.ADMIN, ROLES.DOCTOR, ROLES.ASSISTANT_DOCTOR, ROLES.PSYCHOLOGIST, ROLES.DIGITAL_MARKETING];
const PATIENT_APPROVAL_ROLES = [ROLES.ADMIN, ROLES.DOCTOR, ROLES.ACCOUNTANT];
const INACTIVE_PATIENTS_ROLES = [ROLES.ADMIN, ROLES.DOCTOR, ROLES.POST_COUNSELOR];
const PACKAGE_NOT_BOUGHT_ROLES = [ROLES.ADMIN, ROLES.POST_COUNSELOR];

function App() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-cream">
        <p className="text-sm text-charcoal/55">Loading…</p>
      </div>
    );
  }

  return (
    <Suspense fallback={<div className="p-4 text-sm text-charcoal/60" role="status">Loading page...</div>}>
    <EnquiryNotifications />
    <Routes>
      <Route
        path="/login"
        element={user ? <Navigate to={getDefaultRoute(user.role)} replace /> : <Login />}
      />

      <Route
        path="/admin"
        element={
          <ProtectedRoute roles={ADMIN_LAYOUT_ROLES}>
            <AdminLayout />
          </ProtectedRoute>
        }
      >
        <Route
          index
          element={
            <ProtectedRoute roles={DASHBOARD_ACCESS_ROLES}>
              {[ROLES.ADMIN, ROLES.DOCTOR].includes(user?.role)
                ? <Dashboard />
                : user?.role === ROLES.RECEPTIONIST
                  ? <ReceptionistHomeDashboard />
                  : <StaffDashboard />}
            </ProtectedRoute>
          }
        />
        <Route
          path="team"
          element={
            <ProtectedRoute role="admin">
              <TeamMembers />
            </ProtectedRoute>
          }
        />
        <Route
          path="history"
          element={
            <ProtectedRoute role="admin">
              <CrmHistory />
            </ProtectedRoute>
          }
        />
        <Route path="invoices" element={<Navigate to="/admin/invoices/final-bill" replace />} />
        <Route path="invoices/final-bill" element={<ProtectedRoute roles={[ROLES.ADMIN, ROLES.ACCOUNTANT, ROLES.POST_COUNSELOR, ROLES.DOCTOR, ROLES.RECEPTIONIST]}><Invoices type="final-bill" /></ProtectedRoute>} />
        <Route path="invoices/part-payment" element={<ProtectedRoute roles={[ROLES.ADMIN, ROLES.ACCOUNTANT, ROLES.POST_COUNSELOR, ROLES.DOCTOR, ROLES.RECEPTIONIST]}><Invoices type="part-payment" /></ProtectedRoute>} />
        <Route
          path="payment-settings"
          element={
            <ProtectedRoute role="admin">
              <PaymentSettings />
            </ProtectedRoute>
          }
        />
        <Route
          path="worksheet"
          element={
            <ProtectedRoute roles={WORKSHEET_ACCESS_ROLES}>
              <Worksheet />
            </ProtectedRoute>
          }
        />
        <Route
          path="digital-marketing"
          element={
            <ProtectedRoute roles={DIGITAL_MARKETING_ACCESS_ROLES}>
              <DigitalMarketing />
            </ProtectedRoute>
          }
        />
        <Route
          path="chatgpt"
          element={
            <ProtectedRoute roles={[ROLES.ADMIN, ROLES.DOCTOR]}>
              <CrmChatGPT />
            </ProtectedRoute>
          }
        />
        <Route
          path="payments"
          element={
            <ProtectedRoute roles={[ROLES.ADMIN, ROLES.DOCTOR, ROLES.ACCOUNTANT]}>
              <Payments />
            </ProtectedRoute>
          }
        />
        <Route path="accounts/refunds" element={<ProtectedRoute roles={[ROLES.ADMIN, ROLES.DOCTOR, ROLES.ACCOUNTANT]}><Refunds /></ProtectedRoute>} />
        <Route path="accounts/consultations" element={<ProtectedRoute roles={[ROLES.ADMIN, ROLES.DOCTOR, ROLES.ACCOUNTANT]}><FinancialLedger key="consultation" kind="consultation" /></ProtectedRoute>} />
        <Route path="accounts/treatment" element={<ProtectedRoute roles={[ROLES.ADMIN, ROLES.DOCTOR, ROLES.ACCOUNTANT]}><FinancialLedger key="treatment" kind="treatment" /></ProtectedRoute>} />
        <Route
          path="approved-payments"
          element={
            <ProtectedRoute roles={[ROLES.ADMIN, ROLES.DOCTOR, ROLES.ACCOUNTANT]}>
              <ApprovedPayments />
            </ProtectedRoute>
          }
        />
        <Route
          path="accounts"
          element={
            <ProtectedRoute roles={[ROLES.ADMIN, ROLES.DOCTOR, ROLES.ACCOUNTANT]}>
              <Accounts />
            </ProtectedRoute>
          }
        />
        <Route
          path="accounts/income"
          element={
            <ProtectedRoute roles={[ROLES.ADMIN, ROLES.DOCTOR, ROLES.ACCOUNTANT]}>
              <Navigate to="/admin/accounts" replace />
            </ProtectedRoute>
          }
        />
        <Route
          path="accounts/expenses"
          element={
            <ProtectedRoute roles={[ROLES.ADMIN, ROLES.DOCTOR, ROLES.ACCOUNTANT]}>
              <Expenses />
            </ProtectedRoute>
          }
        />
        <Route
          path="medicine-requests"
          element={
            <ProtectedRoute roles={[ROLES.ADMIN, ROLES.DOCTOR, ROLES.MEDICINE_DEPARTMENT]}>
              <MedicineRequests />
            </ProtectedRoute>
          }
        />
        <Route
          path="medicine-made"
          element={
            <ProtectedRoute roles={[ROLES.ADMIN, ROLES.DOCTOR, ROLES.MEDICINE_DEPARTMENT]}>
              <MedicineMade />
            </ProtectedRoute>
          }
        />
        <Route
          path="medicine-inventory"
          element={
            <ProtectedRoute roles={[ROLES.ADMIN, ROLES.DOCTOR, ROLES.MEDICINE_DEPARTMENT]}>
              <MedicineInventory />
            </ProtectedRoute>
          }
        />
        <Route path="clinic-inventory" element={<ProtectedRoute roles={[ROLES.ADMIN, ROLES.RECEPTIONIST]}><ClinicInventory /></ProtectedRoute>} />
        <Route path="visitors" element={<ProtectedRoute roles={[ROLES.ADMIN, ROLES.RECEPTIONIST]}><ReceptionRegister key="visitors" kind="visitors" /></ProtectedRoute>} />
        <Route path="incoming-couriers" element={<ProtectedRoute roles={[ROLES.ADMIN, ROLES.RECEPTIONIST]}><ReceptionRegister key="incoming-couriers" kind="incoming-couriers" /></ProtectedRoute>} />
        <Route
          path="courier"
          element={
            <ProtectedRoute roles={[ROLES.ADMIN, ROLES.DOCTOR, ROLES.DISPATCH_COURIER]}>
              <CourierRequests />
            </ProtectedRoute>
          }
        />
        <Route
          path="courier-delivered"
          element={
            <ProtectedRoute roles={[ROLES.ADMIN, ROLES.DOCTOR, ROLES.DISPATCH_COURIER]}>
              <CourierDelivered />
            </ProtectedRoute>
          }
        />
        <Route
          path="request-for-advice"
          element={
            <ProtectedRoute roles={[ROLES.ADMIN, ROLES.DOCTOR]}>
              <RequestForAdvice />
            </ProtectedRoute>
          }
        />
        <Route
          path="advice-given"
          element={
            <ProtectedRoute roles={[ROLES.ADMIN, ROLES.DOCTOR]}>
              <AdviceGiven />
            </ProtectedRoute>
          }
        />
        <Route
          path="patients"
          element={
            <ProtectedRoute roles={[...PATIENT_ACCESS_ROLES, ROLES.RECEPTIONIST, ROLES.SALES_TEAM]}>
              <AllPatients />
            </ProtectedRoute>
          }
        />
        <Route
          path="inactive-patients"
          element={
            <ProtectedRoute roles={INACTIVE_PATIENTS_ROLES}>
              <InactivePatients />
            </ProtectedRoute>
          }
        />
        <Route
          path="package-not-bought"
          element={
            <ProtectedRoute roles={PACKAGE_NOT_BOUGHT_ROLES}>
              <PackageNotBought />
            </ProtectedRoute>
          }
        />
        <Route
          path="package-not-bought/:id"
          element={
            <ProtectedRoute roles={PACKAGE_NOT_BOUGHT_ROLES}>
              <PackageNotBoughtDetails />
            </ProtectedRoute>
          }
        />
        <Route
          path="patient-approvals"
          element={
            <ProtectedRoute roles={PATIENT_APPROVAL_ROLES}>
              <PatientApprovals />
            </ProtectedRoute>
          }
        />
        <Route
          path="patients/:id"
          element={
            <ProtectedRoute roles={[...PATIENT_ACCESS_ROLES, ROLES.RECEPTIONIST, ROLES.SALES_TEAM]}>
              <PatientDetails />
            </ProtectedRoute>
          }
        />
        <Route
          path="stages"
          element={
            <ProtectedRoute roles={[ROLES.ADMIN, ROLES.DOCTOR]}>
              <Navigate to="/admin/stages/1" replace />
            </ProtectedRoute>
          }
        />
               <Route
          path="stages/:stage"
          element={
            <ProtectedRoute roles={[ROLES.ADMIN, ROLES.DOCTOR]}>
              <PatientsByStage />
            </ProtectedRoute>
          }
        />
        <Route
          path="followups"
          element={
            <ProtectedRoute roles={FOLLOWUP_ACCESS_ROLES}>
              <FollowUps />
            </ProtectedRoute>
          }
        />
        <Route
          path="appointment-management"
          element={
            <ProtectedRoute roles={[ROLES.ADMIN, ROLES.RECEPTIONIST, ROLES.SALES_TEAM, ROLES.ACCOUNTANT]}>
              <ReceptionistDashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="receptionist-checklist"
          element={
            <ProtectedRoute roles={[ROLES.ADMIN, ROLES.RECEPTIONIST]}>
              <ReceptionistChecklist />
            </ProtectedRoute>
          }
        />
        <Route
          path="patient-queries"
          element={
            <ProtectedRoute roles={[ROLES.ADMIN, ROLES.RECEPTIONIST]}>
              <Navigate to="/admin/enquiries" replace />
            </ProtectedRoute>
          }
        />
        <Route
          path="enquiries"
          element={<ProtectedRoute roles={ADMIN_LAYOUT_ROLES}><Enquiries /></ProtectedRoute>}
        />
        <Route
          path="knowledge-library"
          element={
            <ProtectedRoute roles={ADMIN_LAYOUT_ROLES}>
              <KnowledgeLibrary />
            </ProtectedRoute>
          }
        />
        <Route
          path="knowledge-library/:categoryId"
          element={
            <ProtectedRoute roles={ADMIN_LAYOUT_ROLES}>
              <KnowledgeLibrary />
            </ProtectedRoute>
          }
        />
        <Route
          path="record-room/*"
          element={
            <ProtectedRoute roles={[ROLES.ADMIN, ROLES.RECEPTIONIST]}>
              <RecordRoom />
            </ProtectedRoute>
          }
        />
        <Route
          path="family-sessions"
          element={
            <ProtectedRoute roles={FAMILY_SESSION_ACCESS_ROLES}>
              <FamilySessions />
            </ProtectedRoute>
          }
        />
      </Route>

      <Route
        path="/sales"
        element={
          <ProtectedRoute roles={[ROLES.ADMIN, ROLES.SALES_TEAM, ROLES.RECEPTIONIST]}>
            <SalesWorkspace />
          </ProtectedRoute>
        }
      />

      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <GenericDashboard />
          </ProtectedRoute>
        }
      />

      <Route path="/" element={<Navigate to={user ? getDefaultRoute(user.role) : '/login'} replace />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    </Suspense>
  );
}

export default App;
