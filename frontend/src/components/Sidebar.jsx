import { useEffect, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutGrid,
  Users,
  ClipboardList,
  Layers,
  CalendarClock,
  HeartHandshake,
  IndianRupee,
  CreditCard,
  Table2,
  TrendingDown,
  TrendingUp,
  PackageCheck,
  PackageOpen,
  ClipboardCheck,
  Truck,
  Bot,
  LogOut,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { STAGES, STAGE_LABELS } from '../constants/treatmentStages.js';
import { ROLES } from '../constants/roles.js';
import api from '../api/axios.js';
import BrandLogo from './BrandLogo.jsx';

export const navItems = [
  { to: '/admin', icon: LayoutGrid, label: 'Control Room', end: true, roles: [ROLES.ADMIN, ROLES.DOCTOR, ROLES.MANAGER, ROLES.ASSISTANT_DOCTOR, ROLES.PSYCHOLOGIST] },
  { to: '/admin/patients', icon: ClipboardList, label: 'All Patients', roles: [ROLES.ADMIN, ROLES.MANAGER, ROLES.POST_COUNSELOR, ROLES.PSYCHOLOGIST, ROLES.ASSISTANT_DOCTOR, ROLES.DOCTOR, ROLES.ACCOUNTANT] },
  { to: '/admin/followups', icon: CalendarClock, label: 'Follow-ups', roles: [ROLES.ADMIN, ROLES.MANAGER, ROLES.POST_COUNSELOR, ROLES.ASSISTANT_DOCTOR, ROLES.DOCTOR] },
  { to: '/admin/family-sessions', icon: HeartHandshake, label: 'Family Sessions', roles: [ROLES.ADMIN, ROLES.MANAGER, ROLES.POST_COUNSELOR, ROLES.PSYCHOLOGIST, ROLES.ASSISTANT_DOCTOR, ROLES.DOCTOR] },
  { type: 'stages', roles: [ROLES.ADMIN, ROLES.DOCTOR] },
  { to: '/admin/request-for-advice', icon: ClipboardList, label: 'Request for Advice', roles: [ROLES.ADMIN, ROLES.DOCTOR] },
  { to: '/admin/advice-given', icon: ClipboardCheck, label: 'Advice Given', roles: [ROLES.ADMIN, ROLES.DOCTOR] },
  { to: '/admin/medicine-requests', icon: PackageCheck, label: 'Medicine Requests', roles: [ROLES.ADMIN, ROLES.DOCTOR, ROLES.MEDICINE_DEPARTMENT] },
  { to: '/admin/medicine-made', icon: ClipboardCheck, label: 'Medicine Made', roles: [ROLES.ADMIN, ROLES.DOCTOR, ROLES.MEDICINE_DEPARTMENT] },
  { to: '/admin/medicine-inventory', icon: PackageOpen, label: 'Medicine Inventory', roles: [ROLES.ADMIN, ROLES.DOCTOR, ROLES.MEDICINE_DEPARTMENT] },
  { to: '/admin/courier', icon: Truck, label: 'Courier Requests', roles: [ROLES.ADMIN, ROLES.DOCTOR, ROLES.DISPATCH_COURIER] },
  { to: '/admin/courier-delivered', icon: ClipboardCheck, label: 'Delivered Couriers', roles: [ROLES.ADMIN, ROLES.DOCTOR, ROLES.DISPATCH_COURIER] },
  { to: '/admin/payments', icon: CreditCard, label: 'Payments', roles: [ROLES.ADMIN, ROLES.DOCTOR, ROLES.ACCOUNTANT] },
  { to: '/admin/accounts', icon: IndianRupee, label: 'Accounts Dashboard', end: true, roles: [ROLES.ADMIN, ROLES.DOCTOR, ROLES.ACCOUNTANT] },
  { to: '/admin/accounts/income', icon: TrendingUp, label: 'Income', roles: [ROLES.ADMIN, ROLES.DOCTOR, ROLES.ACCOUNTANT] },
  { to: '/admin/accounts/expenses', icon: TrendingDown, label: 'Expenses', roles: [ROLES.ADMIN, ROLES.DOCTOR, ROLES.ACCOUNTANT] },
  { to: '/admin/worksheet', icon: Table2, label: 'Worksheet', roles: [ROLES.ADMIN, ROLES.DOCTOR, ROLES.MANAGER, ROLES.ASSISTANT_DOCTOR, ROLES.PSYCHOLOGIST] },
  
  { to: '/admin/team', icon: Users, label: 'Team Members', adminOnly: true },
  { to: '/admin/chatgpt', icon: Bot, label: 'CRM Assistant', roles: [ROLES.ADMIN, ROLES.DOCTOR] },
  
];

const STORAGE_KEY = 'crm_sidebar_collapsed';

// "Patients by Stage" nav item — expands into the 6 stage links instead of linking directly.
export const StageMenu = ({ collapsed, onNavigate }) => {
  const location = useLocation();
  const isOnStages = location.pathname.startsWith('/admin/stages');
  const [open, setOpen] = useState(isOnStages);

  if (collapsed) {
    return (
      <NavLink
        to="/admin/stages/1"
        onClick={onNavigate}
        title="Patients by Stage"
        className={`flex items-center justify-center rounded-lg px-0 py-2.5 text-sm font-medium transition-colors duration-150 ${
          isOnStages
            ? 'bg-teal-700 text-offwhite-100 shadow-sm'
            : 'text-teal-100/70 hover:bg-teal-800 hover:text-offwhite-100'
        }`}
      >
        <Layers size={17} strokeWidth={2} className="shrink-0" />
      </NavLink>
    );
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className={`w-full flex items-center gap-3 rounded-lg px-3.5 py-2.5 text-sm font-medium transition-colors duration-150 ${
          isOnStages ? 'text-offwhite-100' : 'text-teal-100/70 hover:bg-teal-800 hover:text-offwhite-100'
        }`}
      >
        <Layers size={17} strokeWidth={2} className="shrink-0" />
        <span className="flex-1 text-left">Patients by Stage</span>
        <ChevronDown size={15} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="mt-1 ml-4 pl-3.5 border-l border-offwhite-100/10 space-y-0.5">
          {STAGES.map((n) => (
            <NavLink
              key={n}
              to={`/admin/stages/${n}`}
              onClick={onNavigate}
              className={({ isActive }) =>
                `block rounded-lg px-3 py-2 text-sm font-medium transition-colors duration-150 ${
                  isActive
                    ? 'bg-teal-700 text-offwhite-100 shadow-sm'
                    : 'text-teal-100/60 hover:bg-teal-800 hover:text-offwhite-100'
                }`
              }
            >
              {STAGE_LABELS[n]}
            </NavLink>
          ))}
        </div>
      )}
    </div>
  );
};

const Sidebar = ({ mobile = false, onClose }) => {
  const { user, logout } = useAuth();
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(STORAGE_KEY) === 'true');
  const [adviceUnreadCount, setAdviceUnreadCount] = useState(0);
  const [urgentAdviceCount, setUrgentAdviceCount] = useState(0);
  const isAdmin = user?.role === ROLES.ADMIN;
  const canSeeAdviceCount = [ROLES.ADMIN, ROLES.DOCTOR].includes(user?.role);
  const visibleNavItems = navItems.filter(
    (item) => (!item.adminOnly || isAdmin) && (!item.roles || item.roles.includes(user?.role)) && !item.hiddenFor?.includes(user?.role)
  );

  useEffect(() => {
    if (!canSeeAdviceCount) {
      setAdviceUnreadCount(0);
      setUrgentAdviceCount(0);
      return undefined;
    }

    const fetchUnreadCount = async () => {
      try {
        const { data } = await api.get('/advice/unread-count');
        setAdviceUnreadCount(Number(data.count || 0));
        setUrgentAdviceCount(Number(data.urgentCount || 0));
      } catch {
        setAdviceUnreadCount(0);
        setUrgentAdviceCount(0);
      }
    };

    fetchUnreadCount();
    const intervalId = window.setInterval(fetchUnreadCount, 15000);
    return () => window.clearInterval(intervalId);
  }, [canSeeAdviceCount]);

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem(STORAGE_KEY, String(next));
      return next;
    });
  };

  const isCollapsed = mobile ? false : collapsed;

  return (
    <aside
      className={`${mobile ? 'fixed inset-y-0 left-0 z-50 flex w-72 shadow-2xl' : `hidden md:flex ${isCollapsed ? 'w-20' : 'w-64'} sticky top-0 z-30 shrink-0`} h-screen flex-col overflow-visible bg-teal-950 text-offwhite-100 transition-[width] duration-200`}
    >
      {/* Collapse / expand toggle */}
      {!mobile && <button
        onClick={toggleCollapsed}
        aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        className="absolute -right-3 top-6 h-6 w-6 rounded-full bg-teal-700 border border-teal-950 text-offwhite-100 flex items-center justify-center hover:bg-teal-600 transition-colors z-10"
      >
        {isCollapsed ? <ChevronRight size={13} /> : <ChevronLeft size={13} />}
      </button>}

      <div
        className={`flex items-center gap-2.5 h-16 border-b border-offwhite-100/10 ${
          isCollapsed ? 'justify-center px-0' : 'px-6'
        }`}
      >
        <BrandLogo size="sm" />
        {!isCollapsed && <span className="max-w-[160px] font-display text-xs font-bold leading-tight">Manovaidya Operation System</span>}
        {mobile && <button type="button" onClick={onClose} aria-label="Close navigation" className="ml-auto p-2 text-teal-100/70 hover:text-offwhite-100"><X size={18} /></button>}
      </div>

      <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto px-3 py-5 scrollbar-thin">
        {visibleNavItems.map((item) => {
          if (item.type === 'stages') {
            return <StageMenu key="stages" collapsed={isCollapsed} onNavigate={onClose} />;
          }
          const { to, icon: Icon, label, end } = item;
          const showAdviceBadge = to === '/admin/request-for-advice' && adviceUnreadCount > 0;
          const showEmergencyAlert = to === '/admin/request-for-advice' && urgentAdviceCount > 0;
          return (
            <NavLink
              key={to}
              to={to}
              end={end}
              onClick={onClose}
              title={isCollapsed ? label : undefined}
              className={({ isActive }) =>
                `relative flex items-center gap-3 rounded-lg px-3.5 py-2.5 text-sm font-medium transition-colors duration-150 ${
                  isCollapsed ? 'justify-center px-0' : ''
                } ${
                  showEmergencyAlert
                    ? 'animate-pulse bg-[#B42318] text-white shadow-sm hover:bg-[#971B12]'
                    :
                  isActive
                    ? 'bg-teal-700 text-offwhite-100 shadow-sm'
                    : 'text-teal-100/70 hover:bg-teal-800 hover:text-offwhite-100'
                }`
              }
            >
              <Icon size={17} strokeWidth={2} className="shrink-0" />
              {!isCollapsed && (
                <>
                  <span className="min-w-0 flex-1 truncate">{label}</span>
                  {showAdviceBadge && (
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${showEmergencyAlert ? 'bg-white text-[#B42318]' : 'bg-[#D9B66F] text-teal-950'}`}>
                      {showEmergencyAlert ? `! ${urgentAdviceCount > 99 ? '99+' : urgentAdviceCount}` : adviceUnreadCount > 99 ? '99+' : adviceUnreadCount}
                    </span>
                  )}
                </>
              )}
              {isCollapsed && showAdviceBadge && (
                <span className={`absolute right-1 top-1 h-2.5 w-2.5 rounded-full ${showEmergencyAlert ? 'bg-white' : 'bg-[#D9B66F]'}`} />
              )}
            </NavLink>
          );
        })}
      </nav>

      <div className="shrink-0 border-t border-offwhite-100/10 px-3 py-4">
        {!isCollapsed && (
          <div className="px-3.5 py-2 mb-2">
            <p className="text-sm font-semibold truncate">{user?.name}</p>
            <p className="text-xs text-teal-100/50 truncate">{user?.roleLabel}</p>
          </div>
        )}
        <button
          onClick={logout}
          title={isCollapsed ? 'Log out' : undefined}
          className={`w-full flex items-center gap-3 rounded-lg px-3.5 py-2.5 text-sm font-medium text-teal-100/70 hover:bg-teal-800 hover:text-offwhite-100 transition-colors duration-150 ${
            isCollapsed ? 'justify-center px-0' : ''
          }`}
        >
          <LogOut size={17} strokeWidth={2} className="shrink-0" />
          {!isCollapsed && 'Log out'}
        </button>
      </div>
    </aside>
  );
};

export default Sidebar;
