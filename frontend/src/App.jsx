import { Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login.jsx';
import GenericDashboard from './pages/GenericDashboard.jsx';
import AdminLayout from './pages/admin/AdminLayout.jsx';
import Dashboard from './pages/admin/Dashboard.jsx';
import StaffDashboard from './pages/admin/StaffDashboard.jsx';
import TeamMembers from './pages/admin/TeamMembers.jsx';
import AllPatients from './pages/admin/AllPatients.jsx';
import InactivePatients from './pages/admin/InactivePatients.jsx';
import PatientApprovals from './pages/admin/PatientApprovals.jsx';
import PatientDetails from './pages/admin/PatientDetails.jsx';
import PatientsByStage from './pages/admin/PatientsByStage.jsx';
import Accounts from './pages/admin/Accounts.jsx';
import Income from './pages/admin/Income.jsx';
import Expenses from './pages/admin/Expenses.jsx';
import FollowUps from './pages/admin/FollowUps.jsx';
import FamilySessions from './pages/admin/FamilySessions.jsx';
import Payments from './pages/admin/Payments.jsx';
import ApprovedPayments from './pages/admin/ApprovedPayments.jsx';
import MedicineRequests from './pages/admin/MedicineRequests.jsx';
import MedicineMade from './pages/admin/MedicineMade.jsx';
import MedicineInventory from './pages/admin/MedicineInventory.jsx';
import ClinicInventory from './pages/admin/ClinicInventory.jsx';
import CourierRequests from './pages/admin/CourierRequests.jsx';
import CourierDelivered from './pages/admin/CourierDelivered.jsx';
import RequestForAdvice from './pages/admin/RequestForAdvice.jsx';
import AdviceGiven from './pages/admin/AdviceGiven.jsx';
import Worksheet from './pages/admin/Worksheet.jsx';
import CrmChatGPT from './pages/admin/CrmChatGPT.jsx';
import DigitalMarketing from './pages/admin/DigitalMarketing.jsx';
import PackageNotBought from './pages/admin/PackageNotBought.jsx';
import PackageNotBoughtDetails from './pages/admin/PackageNotBoughtDetails.jsx';
import PaymentSettings from './pages/admin/PaymentSettings.jsx';
import SalesWorkspace from './pages/SalesWorkspace.jsx';
import ReceptionistDashboard from './pages/admin/ReceptionistDashboard.jsx';
import ReceptionistHomeDashboard from './pages/admin/ReceptionistHomeDashboard.jsx';
import ReceptionistChecklist from './pages/admin/ReceptionistChecklist.jsx';
import PatientQueries from './pages/admin/PatientQueries.jsx';
import KnowledgeLibrary from './pages/admin/KnowledgeLibrary.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import { useAuth } from './context/AuthContext.jsx';
import { ADMIN_LAYOUT_ROLES, PATIENT_ACCESS_ROLES, ROLES, getDefaultRoute } from './constants/roles.js';

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
              <Income />
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
            <ProtectedRoute roles={PATIENT_ACCESS_ROLES}>
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
            <ProtectedRoute roles={[...PATIENT_ACCESS_ROLES, ROLES.RECEPTIONIST]}>
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
            <ProtectedRoute roles={[ROLES.ADMIN, ROLES.RECEPTIONIST, ROLES.SALES_TEAM]}>
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
              <PatientQueries />
            </ProtectedRoute>
          }
        />
        <Route
          path="knowledge-library"
          element={
            <ProtectedRoute roles={[ROLES.ADMIN, ROLES.RECEPTIONIST]}>
              <KnowledgeLibrary />
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
  );
}

export default App;
