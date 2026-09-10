import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { LogOut, Menu } from 'lucide-react';
import Sidebar from '../../components/Sidebar.jsx';
import ScheduleReminderAlert from '../../components/ScheduleReminderAlert.jsx';
import BrandLogo from '../../components/BrandLogo.jsx';
import { useAuth } from '../../context/AuthContext.jsx';

const AdminLayout = () => {
  const { logout } = useAuth();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  return (
    <div className="min-h-screen bg-cream flex">
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
