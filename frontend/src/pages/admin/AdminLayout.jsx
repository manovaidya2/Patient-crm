import { useEffect, useState } from 'react';
import { Outlet } from 'react-router-dom';
import { LogOut, Menu } from 'lucide-react';
import Sidebar from '../../components/Sidebar.jsx';
import ScheduleReminderAlert from '../../components/ScheduleReminderAlert.jsx';
import BrandLogo from '../../components/BrandLogo.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { prefetchGet } from '../../api/axios.js';
import { ROLES } from '../../constants/roles.js';

const todayRange = () => {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setHours(23, 59, 59, 999);
  return { from: start.toISOString(), to: end.toISOString() };
};

const localDate = () => {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

const localMonth = () => localDate().slice(0, 7);

const getPrefetchPlan = (role) => {
  const range = todayRange();
  const plan = [];
  if ([ROLES.ADMIN, ROLES.MANAGER, ROLES.POST_COUNSELOR, ROLES.PSYCHOLOGIST, ROLES.ASSISTANT_DOCTOR, ROLES.DOCTOR, ROLES.ACCOUNTANT].includes(role)) {
    plan.push({ url: '/patients', params: { page: 1, limit: 10 } });
  }
  if ([ROLES.ADMIN, ROLES.MANAGER, ROLES.ASSISTANT_DOCTOR, ROLES.DOCTOR].includes(role)) {
    plan.push({ url: '/schedule/followups', params: range });
  }
  if ([ROLES.ADMIN, ROLES.MANAGER, ROLES.PSYCHOLOGIST, ROLES.ASSISTANT_DOCTOR, ROLES.DOCTOR].includes(role)) {
    plan.push({ url: '/schedule/family-sessions', params: range });
  }

  if ([ROLES.ADMIN, ROLES.DOCTOR].includes(role)) {
    plan.push({ url: '/patients/dashboard-stats', params: { followUpDate: localDate() } });
  }
  if ([ROLES.ADMIN, ROLES.DOCTOR, ROLES.ACCOUNTANT].includes(role)) {
    plan.push({ url: '/patients/pending-approvals' });
    plan.push({ url: '/patients/payments-ledger', params: { filter: 'all', dateType: 'paid', page: 1, limit: 10 } });
    plan.push({ url: '/accounts/overview', params: { filter: 'month', month: localMonth() } });
  }
  if (role === ROLES.ADMIN) plan.push({ url: '/users' });
  if ([ROLES.ADMIN, ROLES.DOCTOR, ROLES.MEDICINE_DEPARTMENT].includes(role)) {
    plan.push({ url: '/medicine/requests', params: { status: 'requested,in_process,made,cancelled' } });
  }
  if ([ROLES.ADMIN, ROLES.DOCTOR, ROLES.DISPATCH_COURIER].includes(role)) {
    plan.push({ url: '/courier/requests', params: { status: 'pending,dispatched,cancelled' } });
  }
  return plan;
};

const BackgroundPrefetch = ({ role }) => {
  useEffect(() => {
    const plan = getPrefetchPlan(role);
    let stopped = false;
    let index = 0;
    let timer;

    const runNext = () => {
      if (stopped || index >= plan.length) return;
      const task = plan[index++];
      prefetchGet(task.url, { params: task.params }).finally(() => {
        timer = window.setTimeout(runNext, 350);
      });
    };

    const start = () => runNext();
    if (window.requestIdleCallback) {
      const idleId = window.requestIdleCallback(start, { timeout: 2500 });
      return () => {
        stopped = true;
        window.cancelIdleCallback(idleId);
        window.clearTimeout(timer);
      };
    }
    timer = window.setTimeout(start, 900);
    return () => {
      stopped = true;
      window.clearTimeout(timer);
    };
  }, [role]);

  return null;
};

const AdminLayout = () => {
  const { user, logout } = useAuth();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  return (
    <div className="min-h-screen bg-cream flex">
      <BackgroundPrefetch role={user?.role} />
      <Sidebar />

      {mobileNavOpen && (
        <div className="fixed inset-0 z-40 bg-charcoal/45 md:hidden" onClick={(event) => { if (event.target === event.currentTarget) setMobileNavOpen(false); }}>
          <Sidebar mobile onClose={() => setMobileNavOpen(false)} />
        </div>
      )}

      <div className="flex-1 min-w-0 flex flex-col">
        {/* Mobile top bar */}
        <div className="md:hidden flex h-14 items-center justify-between px-4 bg-teal-950 text-offwhite-100">
          <button onClick={() => setMobileNavOpen(true)} aria-label="Open navigation" className="-ml-2 p-2 text-teal-100/80 hover:text-offwhite-100">
            <Menu size={20} />
          </button>
          <span className="flex min-w-0 items-center gap-2">
            <BrandLogo size="sm" />
            <span className="max-w-[190px] truncate font-display text-sm font-bold">Manovaidya Operation System</span>
          </span>
          <button onClick={logout} aria-label="Log out" className="-mr-2 p-2 text-teal-100/80 hover:text-offwhite-100">
            <LogOut size={18} />
          </button>
        </div>

        <main className="flex-1 p-4 sm:p-8">
          <ScheduleReminderAlert />
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default AdminLayout;
