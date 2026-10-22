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
  BadgeCheck,
  Table2,
  ShieldCheck,
  Megaphone,
  TrendingDown,
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
  Settings,
  UserX,
  BookOpen,
  FileArchive,
  FileText,
  CheckSquare,
  RotateCcw,
  History,
  Briefcase,
  PhoneCall,
  UserPlus,
  Send,
  Target,
  Activity,
  BarChart3,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { STAGES, STAGE_LABELS } from '../constants/treatmentStages.js';
import { HR_ACCESS_ROLES, ROLES } from '../constants/roles.js';
import api from '../api/axios.js';
import BrandLogo from './BrandLogo.jsx';

// Pages shown at the very top of a role's menu, in this order.
const ROLE_FIRST_PAGES = {
  [ROLES.POST_COUNSELOR]: ['/admin/post-counseling-patients', '/admin/patients', '/admin/package-not-bought', '/admin/post-counseling-done'],
};

export const navItems = [
  { to: '/admin', icon: LayoutGrid, label: 'Control Room', end: true, roles: [ROLES.ADMIN, ROLES.DOCTOR, ROLES.MANAGER, ROLES.ASSISTANT_DOCTOR, ROLES.PSYCHOLOGIST] },
  { to: '/admin', icon: LayoutGrid, label: 'Dashboard', end: true, roles: [ROLES.RECEPTIONIST] },
  { to: '/admin/hr', type: 'hr', roles: HR_ACCESS_ROLES },
  { to: '/admin/appointment-management', icon: CalendarClock, label: 'Appointment Management', roles: [ROLES.ADMIN, ROLES.RECEPTIONIST, ROLES.SALES_TEAM] },
  { to: '/admin/receptionist-checklist', icon: CheckSquare, label: 'Reception Checklist', roles: [ROLES.ADMIN, ROLES.DOCTOR, ROLES.RECEPTIONIST] },
  { to: '/admin/knowledge-library', icon: BookOpen, label: 'Knowledge Library', roles: Object.values(ROLES).filter((role) => role !== ROLES.HR) },
  { to: '/admin/enquiries', icon: ClipboardList, label: 'Enquiries & Escalations', roles: Object.values(ROLES).filter((role) => role !== ROLES.HR) },
  { to: '/admin/record-room', icon: FileArchive, label: 'Record Room', roles: [ROLES.ADMIN, ROLES.RECEPTIONIST] },
  { to: '/admin/visitors', icon: Users, label: 'Visitor Register', roles: [ROLES.ADMIN, ROLES.RECEPTIONIST] },
  { to: '/admin/incoming-couriers', icon: FileArchive, label: 'Incoming Couriers', roles: [ROLES.ADMIN, ROLES.RECEPTIONIST] },
  { to: '/admin/outgoing-couriers', icon: FileArchive, label: 'Outgoing Couriers', roles: [ROLES.ADMIN, ROLES.RECEPTIONIST] },
  { to: '/admin/patients', icon: ClipboardList, label: 'All Patients', roles: [ROLES.ADMIN, ROLES.MANAGER, ROLES.POST_COUNSELOR, ROLES.PSYCHOLOGIST, ROLES.ASSISTANT_DOCTOR, ROLES.DOCTOR, ROLES.RECEPTIONIST, ROLES.SALES_TEAM, ROLES.IN_TRANSIT] },
  { to: '/admin/in-transit', icon: Truck, label: 'In Transit', roles: [ROLES.ADMIN, ROLES.IN_TRANSIT] },
  { to: '/admin/medicine-explanations', icon: ClipboardCheck, label: 'Medicine Explanations', roles: [ROLES.ADMIN, ROLES.ASSISTANT_DOCTOR] },
  { to: '/admin/inactive-patients', icon: UserX, label: 'Inactive Patients', roles: [ROLES.ADMIN, ROLES.DOCTOR, ROLES.POST_COUNSELOR] },
  { to: '/admin/post-counseling-patients', icon: Users, label: 'Post Counseling Patients', roles: [ROLES.ADMIN, ROLES.POST_COUNSELOR, ROLES.DOCTOR, ROLES.MANAGER] },
  { to: '/admin/post-counseling-done', icon: ClipboardCheck, label: 'Post Counseling Done', roles: [ROLES.ADMIN, ROLES.POST_COUNSELOR, ROLES.DOCTOR, ROLES.MANAGER] },
  { to: '/admin/package-not-bought', icon: ClipboardList, label: 'Package Not Bought', roles: [ROLES.ADMIN, ROLES.POST_COUNSELOR] },
  { to: '/admin/patient-approvals', icon: ShieldCheck, label: 'Patient Approvals', roles: [ROLES.ADMIN, ROLES.DOCTOR, ROLES.IN_TRANSIT] },
  { to: '/admin/followups', icon: CalendarClock, label: 'Follow-ups', roles: [ROLES.ADMIN, ROLES.MANAGER, ROLES.ASSISTANT_DOCTOR, ROLES.DOCTOR] },
  { to: '/admin/family-sessions', icon: HeartHandshake, label: 'Family Sessions', roles: [ROLES.ADMIN, ROLES.MANAGER, ROLES.PSYCHOLOGIST, ROLES.ASSISTANT_DOCTOR, ROLES.DOCTOR] },
  { type: 'stages', roles: [ROLES.ADMIN, ROLES.DOCTOR] },
  { to: '/admin/request-for-advice', icon: ClipboardList, label: 'Request for Advice', roles: [ROLES.ADMIN, ROLES.DOCTOR] },
  { to: '/admin/advice-given', icon: ClipboardCheck, label: 'Advice Given', roles: [ROLES.ADMIN, ROLES.DOCTOR] },
  { to: '/admin/medicine-requests', icon: PackageCheck, label: 'Medicine Requests', roles: [ROLES.ADMIN, ROLES.DOCTOR, ROLES.MEDICINE_DEPARTMENT] },
  { to: '/admin/medicine-made', icon: ClipboardCheck, label: 'Medicine Made', roles: [ROLES.ADMIN, ROLES.DOCTOR, ROLES.MEDICINE_DEPARTMENT] },
  { to: '/admin/medicine-inventory', icon: PackageOpen, label: 'Medicine Inventory', roles: [ROLES.ADMIN, ROLES.DOCTOR, ROLES.MEDICINE_DEPARTMENT] },
  { to: '/admin/clinic-inventory', icon: PackageOpen, label: 'Clinic Inventory', roles: [ROLES.ADMIN, ROLES.RECEPTIONIST] },
  { to: '/admin/courier', icon: Truck, label: 'Courier Requests', roles: [ROLES.ADMIN, ROLES.IN_TRANSIT] },
  { to: '/admin/courier-delivered', icon: ClipboardCheck, label: 'Delivered Couriers', roles: [ROLES.ADMIN, ROLES.IN_TRANSIT] },
  { to: '/admin/payments', icon: CreditCard, label: 'Payments', roles: [ROLES.ADMIN, ROLES.DOCTOR, ROLES.IN_TRANSIT] },
  { to: '/admin/approved-payments', icon: BadgeCheck, label: 'Approved Payments', roles: [ROLES.ADMIN, ROLES.DOCTOR, ROLES.IN_TRANSIT] },
  { to: '/admin/invoices', type: 'invoices', roles: [ROLES.ADMIN, ROLES.POST_COUNSELOR, ROLES.DOCTOR, ROLES.RECEPTIONIST] },
  { type: 'accountant', roles: [ROLES.RECEPTIONIST] },
  { to: '/admin/accounts', icon: IndianRupee, label: 'Accounts Dashboard', end: true, roles: [ROLES.ADMIN, ROLES.DOCTOR, ROLES.RECEPTIONIST], hiddenFor: [ROLES.RECEPTIONIST] },
  { to: '/admin/accounts/consultations', icon: BookOpen, label: 'Consultation Ledger', roles: [ROLES.ADMIN, ROLES.DOCTOR, ROLES.RECEPTIONIST], hiddenFor: [ROLES.RECEPTIONIST] },
  { to: '/admin/accounts/treatment', icon: BookOpen, label: 'Treatment Ledger', roles: [ROLES.ADMIN, ROLES.DOCTOR, ROLES.IN_TRANSIT] },
  { to: '/admin/accounts/expenses', icon: TrendingDown, label: 'Expenses', roles: [ROLES.ADMIN, ROLES.DOCTOR, ROLES.RECEPTIONIST], hiddenFor: [ROLES.RECEPTIONIST] },
  { to: '/admin/accounts/refunds', icon: RotateCcw, label: 'Refund Register', roles: [ROLES.ADMIN, ROLES.DOCTOR, ROLES.IN_TRANSIT] },
  { to: '/admin/worksheet', icon: Table2, label: 'Worksheet', roles: [ROLES.ADMIN, ROLES.DOCTOR, ROLES.MANAGER, ROLES.ASSISTANT_DOCTOR, ROLES.PSYCHOLOGIST] },
  { to: '/admin/digital-marketing', icon: Megaphone, label: 'Digital Marketing', roles: [ROLES.ADMIN, ROLES.DOCTOR, ROLES.ASSISTANT_DOCTOR, ROLES.PSYCHOLOGIST, ROLES.DIGITAL_MARKETING] },
  
  { to: '/admin/team', icon: Users, label: 'Team Members', adminOnly: true },
  { to: '/admin/history', icon: History, label: 'History & Timeline', adminOnly: true },
  { to: '/admin/payment-settings', icon: Settings, label: 'Payment Settings', adminOnly: true },
  { to: '/sales', icon: Table2, label: 'Sales Appointment Sheet', roles: [ROLES.ADMIN, ROLES.RECEPTIONIST, ROLES.SALES_TEAM] },
  { to: '/admin/chatgpt', icon: Bot, label: 'CRM Assistant', roles: [ROLES.ADMIN, ROLES.DOCTOR] },
  
];

const STORAGE_KEY = 'crm_sidebar_collapsed';
// "Patients by Phase" nav item expands into the 6 phase links instead of linking directly.
export const StageMenu = ({ collapsed, onNavigate }) => {
  const location = useLocation();
  const isOnStages = location.pathname.startsWith('/admin/stages');
  const [open, setOpen] = useState(isOnStages);

  if (collapsed) {
    return (
      <NavLink
        to="/admin/stages/1"
        onClick={onNavigate}
        title="Patients by Phase"
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
        <span className="flex-1 text-left">Patients by Phase</span>
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

const InvoiceMenu = ({ collapsed, onNavigate }) => {
  const location = useLocation();
  const isOnInvoices = location.pathname.startsWith('/admin/invoices');
  const [open, setOpen] = useState(isOnInvoices);
  useEffect(() => { if (isOnInvoices) setOpen(true); }, [isOnInvoices]);
  if (collapsed) return <NavLink to="/admin/invoices/final-bill" onClick={onNavigate} title="Invoices" aria-label="Invoices" className={`flex items-center justify-center rounded-lg py-2.5 ${isOnInvoices ? 'bg-teal-700 text-white' : 'text-teal-100/70 hover:bg-teal-800'}`}><FileText size={17} /></NavLink>;
  return <div>
    <button type="button" aria-expanded={open} onClick={() => setOpen((value) => !value)} className={`flex w-full items-center gap-3 rounded-lg px-3.5 py-2.5 text-sm font-medium ${isOnInvoices ? 'bg-teal-800 text-white' : 'text-teal-100/70 hover:bg-teal-800 hover:text-white'}`}>
      <FileText size={17} /><span className="flex-1 text-left">Invoices</span><ChevronDown size={15} className={open ? 'rotate-180' : ''} />
    </button>
    {open && <div className="ml-4 mt-1 space-y-0.5 border-l border-offwhite-100/10 pl-3.5">
      {[['final-bill', 'Final Bills'], ['part-payment', 'Part-payment Bills'], ['consultation', 'Consultation Bills']].map(([type, label]) => <NavLink key={type} to={`/admin/invoices/${type}`} onClick={onNavigate} className={({ isActive }) => `block rounded-lg px-3 py-2 text-sm font-medium ${isActive ? 'bg-teal-700 text-white shadow-sm' : 'text-teal-100/60 hover:bg-teal-800 hover:text-white'}`}>{label}</NavLink>)}
    </div>}
  </div>;
};

const ACCOUNTANT_LINKS = [
  ['/admin/accounts', 'Accounts Dashboard', IndianRupee, true],



  ['/admin/accounts/consultations', 'Consultation Ledger', BookOpen],

  ['/admin/accounts/expenses', 'Expenses', TrendingDown],

];

const AccountantMenu = ({ collapsed, onNavigate }) => {
  const location = useLocation();
  const isOnAccountantPage = ACCOUNTANT_LINKS.some(([to, , , end]) => end ? location.pathname === to : location.pathname.startsWith(to));
  const [open, setOpen] = useState(isOnAccountantPage);
  useEffect(() => { if (isOnAccountantPage) setOpen(true); }, [isOnAccountantPage]);
  if (collapsed) return <NavLink to="/admin/accounts" onClick={onNavigate} title="Accountant" aria-label="Accountant" className={`flex items-center justify-center rounded-lg py-2.5 ${isOnAccountantPage ? 'bg-teal-700 text-white' : 'text-teal-100/70 hover:bg-teal-800'}`}><IndianRupee size={17} /></NavLink>;
  return <div>
    <button type="button" aria-expanded={open} onClick={() => setOpen((value) => !value)} className={`flex w-full items-center gap-3 rounded-lg px-3.5 py-2.5 text-sm font-medium ${isOnAccountantPage ? 'bg-teal-800 text-white' : 'text-teal-100/70 hover:bg-teal-800 hover:text-white'}`}>
      <IndianRupee size={17} /><span className="flex-1 text-left">Accountant</span><ChevronDown size={15} className={open ? 'rotate-180' : ''} />
    </button>
    {open && <div className="ml-4 mt-1 space-y-0.5 border-l border-offwhite-100/10 pl-3.5">
      {ACCOUNTANT_LINKS.map(([to, label, Icon, end]) => <NavLink key={to} to={to} end={Boolean(end)} onClick={onNavigate} className={({ isActive }) => `flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium ${isActive ? 'bg-teal-700 text-white shadow-sm' : 'text-teal-100/60 hover:bg-teal-800 hover:text-white'}`}><Icon size={15} />{label}</NavLink>)}
    </div>}
  </div>;
};

const HrMenu = ({ collapsed, onNavigate }) => {
  const location = useLocation();
  const isOnHr = location.pathname.startsWith('/admin/hr');
  const [open, setOpen] = useState(isOnHr);
  useEffect(() => { if (isOnHr) setOpen(true); }, [isOnHr]);
  const links = [
    ['/admin/hr', 'HR Dashboard', LayoutGrid],
    ['/admin/hr/requirements', 'Hiring Requirements', ClipboardCheck],
    ['/admin/hr/job-descriptions', 'Job Descriptions', FileText],
    ['/admin/hr/campaigns', 'Job Campaigns', Megaphone],
    ['/admin/hr/candidates', 'Candidates', UserPlus],
    ['/admin/hr/calls', 'Manual Call Register', PhoneCall],
    ['/admin/hr/interviews', 'Interviews', CalendarClock],
    ['/admin/hr/offers', 'Offers', Send],
    ['/admin/hr/onboarding', 'Onboarding', CheckSquare],
    ['/admin/hr/employees', 'Employees', Users],
    ['/admin/hr/attendance', 'Attendance', CalendarClock],
    ['/admin/hr/leaves', 'Leave Administration', ClipboardList],
    ['/admin/hr/holidays', 'Holiday Calendar', CalendarClock],
    ['/admin/hr/training', 'Training', BadgeCheck],
    ['/admin/hr/kpis', 'Team KPIs', Target],
    ['/admin/hr/performance', 'Performance', Activity],
    ['/admin/hr/appraisals', 'Appraisals', BadgeCheck],
    ['/admin/hr/pip', 'PIP', TrendingDown],
    ['/admin/hr/grievances', 'Grievances', HeartHandshake],
    ['/admin/hr/policies', 'Policies', ShieldCheck],
    ['/admin/hr/payroll', 'Payroll Records', IndianRupee],
    ['/admin/hr/exits', 'Exit Management', UserX],
    ['/admin/hr/worksheet', 'Daily HR Worksheet', ClipboardCheck],
    ['/admin/hr/incidents','Complaints & Conflicts', HeartHandshake],
    ['/admin/hr/expenses', 'Clinic Expenses', IndianRupee],
    ['/admin/hr/reports', 'HR Reports', BarChart3],
  ];
  if (collapsed) return <NavLink to="/admin/hr" onClick={onNavigate} title="HR Management" aria-label="HR Management" className={`flex items-center justify-center rounded-lg py-2.5 ${isOnHr ? 'bg-teal-700 text-white' : 'text-teal-100/70 hover:bg-teal-800'}`}><Briefcase size={17} /></NavLink>;
  return <div className="my-2 border-y border-offwhite-100/10 py-2">
    <button type="button" aria-expanded={open} onClick={() => setOpen((value) => !value)} className={`flex w-full items-center gap-3 rounded-lg px-3.5 py-2.5 text-sm font-semibold ${isOnHr ? 'bg-teal-800 text-white' : 'text-teal-100/80 hover:bg-teal-800 hover:text-white'}`}>
      <Briefcase size={17} /><span className="flex-1 text-left">HR Management</span><ChevronDown size={15} className={open ? 'rotate-180' : ''} />
    </button>
    {open && <div className="ml-4 mt-1 space-y-0.5 border-l border-offwhite-100/10 pl-3.5">{links.map(([to, label, Icon]) => <NavLink key={to} to={to} end={to === '/admin/hr'} onClick={onNavigate} className={({ isActive }) => `flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium ${isActive ? 'bg-teal-700 text-white shadow-sm' : 'text-teal-100/60 hover:bg-teal-800 hover:text-white'}`}><Icon size={15} />{label}</NavLink>)}</div>}
  </div>;
};

const Sidebar = ({ mobile = false, onClose }) => {
  const { user, logout } = useAuth();
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(STORAGE_KEY) === 'true');
  const [adviceUnreadCount, setAdviceUnreadCount] = useState(0);
  const [urgentAdviceCount, setUrgentAdviceCount] = useState(0);
  const isAdmin = user?.role === ROLES.ADMIN;
  const canSeeAdviceCount = [ROLES.ADMIN, ROLES.DOCTOR].includes(user?.role);
  const roleItems = navItems.filter(
    (item) => (!item.adminOnly || isAdmin) && (!item.roles || item.roles.includes(user?.role)) && !item.hiddenFor?.includes(user?.role)
  );
  // Some roles want their daily pages first; everything else follows in the usual order.
  const firstPages = ROLE_FIRST_PAGES[user?.role] || [];
  const rank = (item) => { const at = firstPages.indexOf(item.to); return at === -1 ? firstPages.length : at; };
  const visibleNavItems = firstPages.length ? [...roleItems].sort((x, y) => rank(x) - rank(y)) : roleItems;
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
      className={`${mobile ? 'fixed inset-y-0 left-0 z-50 flex w-72 max-w-[90vw] !h-dvh shadow-2xl' : `hidden md:flex ${isCollapsed ? 'w-20' : 'w-64'} sticky top-0 z-30 shrink-0`} h-screen flex-col overflow-visible bg-teal-950 text-offwhite-100 transition-[width] duration-200`}
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
          if (item.type === 'invoices') {
            return <InvoiceMenu key="invoices" collapsed={isCollapsed} onNavigate={onClose} />;
          }
          if (item.type === 'accountant') {
            return <AccountantMenu key="accountant" collapsed={isCollapsed} onNavigate={onClose} />;
          }
          if (item.type === 'hr') {
            return <HrMenu key="hr" collapsed={isCollapsed} onNavigate={onClose} />;
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
