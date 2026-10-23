import { useEffect, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import useTaskCounts from '../hooks/useTaskCounts.js';
import {
  LayoutGrid,
  Sun,
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
  FlaskConical,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { STAGES, STAGE_LABELS } from '../constants/treatmentStages.js';
import { HR_ACCESS_ROLES, ROLES } from '../constants/roles.js';
import api from '../api/axios.js';
import BrandLogo from './BrandLogo.jsx';

// Pages shown at the very top of a role's menu, in this order.
const ROLE_FIRST_PAGES = {
  [ROLES.POST_COUNSELOR]: ['/admin/my-day', '/admin/post-counseling-patients', '/admin/patients', '/admin/package-not-bought', '/admin/post-counseling-done'],
};

export const navItems = [
  // Every role's open work in one list (the orange counts, item by item).
  { to: '/admin/my-day', icon: Sun, label: 'My day', roles: Object.values(ROLES).filter((role) => role !== ROLES.HR) },
  { to: '/admin', icon: LayoutGrid, label: 'Control Room', end: true, roles: [ROLES.ADMIN, ROLES.DOCTOR, ROLES.MANAGER, ROLES.ASSISTANT_DOCTOR] },
  { to: '/admin', icon: LayoutGrid, label: 'Dashboard', end: true, roles: [ROLES.RECEPTIONIST] },
  { to: '/admin/hr', type: 'hr', roles: HR_ACCESS_ROLES },
  { to: '/admin/appointment-management', icon: CalendarClock, label: 'Appointment Management', roles: [ROLES.ADMIN, ROLES.RECEPTIONIST, ROLES.SALES_TEAM], group: 'reception' },
  { to: '/admin/receptionist-checklist', icon: CheckSquare, label: 'Reception Checklist', roles: [ROLES.ADMIN, ROLES.DOCTOR, ROLES.RECEPTIONIST], group: 'reception' },
  { to: '/admin/knowledge-library', icon: BookOpen, label: 'Knowledge Library', roles: Object.values(ROLES).filter((role) => role !== ROLES.HR) },
  { to: '/admin/enquiries', icon: ClipboardList, label: 'Enquiries & Escalations', roles: Object.values(ROLES).filter((role) => role !== ROLES.HR) },
  { to: '/admin/record-room', icon: FileArchive, label: 'Record Room', roles: [ROLES.ADMIN, ROLES.RECEPTIONIST], group: 'reception' },
  { to: '/admin/visitors', icon: Users, label: 'Visitor Register', roles: [ROLES.ADMIN, ROLES.RECEPTIONIST], group: 'reception' },
  { to: '/admin/incoming-couriers', icon: FileArchive, label: 'Incoming Couriers', roles: [ROLES.ADMIN, ROLES.RECEPTIONIST], group: 'reception' },
  { to: '/admin/outgoing-couriers', icon: FileArchive, label: 'Outgoing Couriers', roles: [ROLES.ADMIN, ROLES.RECEPTIONIST], group: 'reception' },
  { to: '/admin/patients', icon: ClipboardList, label: 'All Patients', roles: [ROLES.ADMIN, ROLES.MANAGER, ROLES.POST_COUNSELOR, ROLES.ASSISTANT_DOCTOR, ROLES.DOCTOR, ROLES.RECEPTIONIST, ROLES.SALES_TEAM, ROLES.IN_TRANSIT] },
  { to: '/admin/purchase-orders', icon: ClipboardList, label: 'Purchase Orders', roles: [ROLES.ADMIN, ROLES.DOCTOR, ROLES.MANAGER, ROLES.POST_COUNSELOR, ROLES.IN_TRANSIT] },
  { to: '/admin/medicine-explanations', icon: ClipboardCheck, label: 'Medicine Explanations', roles: [ROLES.ADMIN, ROLES.ASSISTANT_DOCTOR], group: 'care' },
  { to: '/admin/inactive-patients', icon: UserX, label: 'Inactive Patients', roles: [ROLES.ADMIN, ROLES.DOCTOR, ROLES.POST_COUNSELOR] },
  { to: '/admin/post-counseling-patients', icon: Users, label: 'Post Counseling Patients', roles: [ROLES.ADMIN, ROLES.POST_COUNSELOR, ROLES.DOCTOR, ROLES.MANAGER], group: 'postcounselling' },
  { to: '/admin/post-counseling-done', icon: ClipboardCheck, label: 'Post Counseling Done', roles: [ROLES.ADMIN, ROLES.POST_COUNSELOR, ROLES.DOCTOR, ROLES.MANAGER], group: 'postcounselling' },
  { to: '/admin/package-not-bought', icon: ClipboardList, label: 'Package Not Bought', roles: [ROLES.ADMIN, ROLES.POST_COUNSELOR], group: 'postcounselling' },
  { to: '/admin/patient-approvals', icon: ShieldCheck, label: 'Patient Approvals', roles: [ROLES.ADMIN, ROLES.DOCTOR, ROLES.IN_TRANSIT], group: 'transit' },
  { to: '/admin/followups', icon: CalendarClock, label: 'Follow-ups', roles: [ROLES.ADMIN, ROLES.MANAGER, ROLES.ASSISTANT_DOCTOR, ROLES.DOCTOR], group: 'care' },
  { to: '/admin/family-sessions', icon: HeartHandshake, label: 'Family Sessions', roles: [ROLES.ADMIN, ROLES.MANAGER, ROLES.ASSISTANT_DOCTOR, ROLES.DOCTOR], group: 'care' },
  { type: 'stages', roles: [ROLES.ADMIN, ROLES.DOCTOR] },
  { to: '/admin/request-for-advice', icon: ClipboardList, label: 'Request for Advice', roles: [ROLES.ADMIN, ROLES.DOCTOR], group: 'care' },
  { to: '/admin/advice-given', icon: ClipboardCheck, label: 'Advice Given', roles: [ROLES.ADMIN, ROLES.DOCTOR], group: 'care' },
  { to: '/admin/medicine-requests', icon: PackageCheck, label: 'Medicine Requests', roles: [ROLES.ADMIN, ROLES.DOCTOR, ROLES.MEDICINE_DEPARTMENT], group: 'medicine' },
  { to: '/admin/medicine-jobs', icon: ClipboardCheck, label: 'Fulfilment Queue', roles: [ROLES.ADMIN, ROLES.DOCTOR, ROLES.MEDICINE_DEPARTMENT], group: 'medicine' },
  { to: '/admin/stocks', icon: PackageOpen, label: 'Stocks', roles: [ROLES.ADMIN, ROLES.DOCTOR, ROLES.MEDICINE_DEPARTMENT], group: 'medicine' },
  { to: '/admin/formulation-master', icon: FlaskConical, label: 'Formulation Master', roles: [ROLES.ADMIN, ROLES.DOCTOR], group: 'medicine' },
  { to: '/admin/medicine-made', icon: ClipboardCheck, label: 'Medicine Made', roles: [ROLES.ADMIN, ROLES.DOCTOR, ROLES.MEDICINE_DEPARTMENT], group: 'medicine' },
  { to: '/admin/medicine-inventory', icon: PackageOpen, label: 'Medicine Inventory', roles: [ROLES.ADMIN, ROLES.DOCTOR, ROLES.MEDICINE_DEPARTMENT], group: 'medicine' },
  { to: '/admin/clinic-inventory', icon: PackageOpen, label: 'Clinic Inventory', roles: [ROLES.ADMIN, ROLES.RECEPTIONIST], group: 'reception' },
  { to: '/admin/courier', icon: Truck, label: 'Courier Requests', roles: [ROLES.ADMIN, ROLES.IN_TRANSIT], group: 'transit' },
  { to: '/admin/courier-delivered', icon: ClipboardCheck, label: 'Delivered Couriers', roles: [ROLES.ADMIN, ROLES.IN_TRANSIT], group: 'transit' },
  { to: '/admin/payments', icon: CreditCard, label: 'Payments', roles: [ROLES.ADMIN, ROLES.DOCTOR, ROLES.IN_TRANSIT], group: 'transit' },
  { to: '/admin/approved-payments', icon: BadgeCheck, label: 'Approved Payments', roles: [ROLES.ADMIN, ROLES.DOCTOR, ROLES.IN_TRANSIT], group: 'transit' },
  { to: '/admin/invoices', type: 'invoices', roles: [ROLES.ADMIN, ROLES.POST_COUNSELOR, ROLES.DOCTOR, ROLES.RECEPTIONIST] },
  { to: '/admin/accounts', icon: IndianRupee, label: 'Accounts Dashboard', end: true, roles: [ROLES.ADMIN, ROLES.DOCTOR, ROLES.RECEPTIONIST], hiddenFor: [ROLES.RECEPTIONIST], group: 'transit' },
  { to: '/admin/accounts/consultations', icon: BookOpen, label: 'Consultation Ledger', roles: [ROLES.ADMIN, ROLES.DOCTOR, ROLES.RECEPTIONIST], group: 'reception' },
  { to: '/admin/accounts/treatment', icon: BookOpen, label: 'Treatment Ledger', roles: [ROLES.ADMIN, ROLES.DOCTOR, ROLES.IN_TRANSIT], group: 'transit' },
  { to: '/admin/accounts/expenses', icon: TrendingDown, label: 'Expenses', roles: [ROLES.ADMIN, ROLES.DOCTOR, ROLES.RECEPTIONIST], hiddenFor: [ROLES.RECEPTIONIST], group: 'transit' },
  { to: '/admin/accounts/refunds', icon: RotateCcw, label: 'Refund Register', roles: [ROLES.ADMIN, ROLES.DOCTOR, ROLES.IN_TRANSIT], group: 'transit' },
  { to: '/admin/worksheet', icon: Table2, label: 'Worksheet', roles: [ROLES.ADMIN, ROLES.DOCTOR, ROLES.MANAGER, ROLES.ASSISTANT_DOCTOR], group: 'care' },
  { to: '/admin/digital-marketing', icon: Megaphone, label: 'Digital Marketing', roles: [ROLES.ADMIN, ROLES.DOCTOR, ROLES.ASSISTANT_DOCTOR, ROLES.DIGITAL_MARKETING], group: 'admin' },
  
  { to: '/admin/team', icon: Users, label: 'Team Members', adminOnly: true, group: 'admin' },
  { to: '/admin/history', icon: History, label: 'History & Timeline', adminOnly: true, group: 'admin' },
  { to: '/admin/payment-settings', icon: Settings, label: 'Payment Settings', adminOnly: true, group: 'admin' },
  { to: '/sales', icon: Table2, label: 'Sales Appointment Sheet', roles: [ROLES.ADMIN, ROLES.RECEPTIONIST, ROLES.SALES_TEAM], group: 'reception' },
  { to: '/admin/chatgpt', icon: Bot, label: 'CRM Assistant', roles: [ROLES.ADMIN, ROLES.DOCTOR], group: 'admin' },
  
];

const STORAGE_KEY = 'crm_sidebar_collapsed';
const GROUP_STORAGE_KEY = 'crm_sidebar_groups';

// Department groups (in this order). Pages without a group are common and stay at the top.
const NAV_GROUPS = [
  { key: 'reception', label: 'Reception', icon: CalendarClock },
  { key: 'postcounselling', label: 'Post Counselling', icon: Users },
  { key: 'transit', label: 'In Transit', icon: Truck },
  { key: 'medicine', label: 'Medicine Department', icon: PackageCheck },
  { key: 'care', label: 'PCC & Care', icon: HeartHandshake },
  { key: 'admin', label: 'Admin & Tools', icon: Settings },
];
// A role's own department comes first and starts open.
const HOME_GROUP = {
  [ROLES.RECEPTIONIST]: 'reception', [ROLES.POST_COUNSELOR]: 'postcounselling', [ROLES.IN_TRANSIT]: 'transit',
  [ROLES.MEDICINE_DEPARTMENT]: 'medicine', [ROLES.ASSISTANT_DOCTOR]: 'care', [ROLES.MANAGER]: 'care',
};
const readOpenGroups = () => { try { return JSON.parse(localStorage.getItem(GROUP_STORAGE_KEY) || '{}'); } catch { return {}; } };

// One collapsible department group; its header carries the sum of the orange counts inside.
const NavGroup = ({ group, items, open, onToggle, count, active, renderItem }) => {
  const Icon = group.icon;
  return (
    <div className="pt-1">
      <button type="button" aria-expanded={open} onClick={onToggle} className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[12px] font-bold transition-colors ${active ? 'text-offwhite-100' : 'text-teal-100/80 hover:bg-teal-800 hover:text-offwhite-100'}`}>
        <Icon size={15} strokeWidth={2} className="shrink-0" />
        <span className="min-w-0 flex-1 leading-tight">{group.label}</span>
        {count > 0 && !open && <span className="rounded-full bg-orange-500 px-1.5 py-0.5 text-[10px] font-bold text-white" title="Waiting for you">{count > 99 ? '99+' : count}</span>}
        <ChevronDown size={14} className={`shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && <div className="ml-[18px] mt-0.5 space-y-0.5 border-l border-offwhite-100/10 pl-1 [&_a]:!px-2.5">{items.map(renderItem)}</div>}
    </div>
  );
};
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
  // Open work per page for this role (orange badges); drops as soon as the steps are completed.
  const location = useLocation();
  const taskCounts = useTaskCounts(`${user?.role}|${location.pathname}`);
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
  const [openGroups, setOpenGroups] = useState(readOpenGroups);

  return (
    <aside
      className={`${mobile ? 'fixed inset-y-0 left-0 z-50 flex w-72 max-w-[90vw] !h-dvh shadow-2xl' : `sidebar-compact hidden md:flex ${isCollapsed ? 'w-16' : 'w-60'} sticky top-0 z-30 shrink-0`} h-screen flex-col overflow-visible bg-teal-950 text-offwhite-100 transition-[width] duration-200`}
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

      <nav className="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-3 py-4 scrollbar-thin">
        {(() => {
        const renderItem = (item) => {
          if (item.type === 'stages') {
            return <StageMenu key="stages" collapsed={isCollapsed} onNavigate={onClose} />;
          }
          if (item.type === 'invoices') {
            return <InvoiceMenu key="invoices" collapsed={isCollapsed} onNavigate={onClose} />;
          }
          if (item.type === 'hr') {
            return <HrMenu key="hr" collapsed={isCollapsed} onNavigate={onClose} />;
          }
          const { to, icon: Icon, label, end } = item;
          const showAdviceBadge = to === '/admin/request-for-advice' && adviceUnreadCount > 0;
          const showEmergencyAlert = to === '/admin/request-for-advice' && urgentAdviceCount > 0;
          const taskCount = to === '/admin/my-day' ? Object.values(taskCounts).reduce((sum, n) => sum + Number(n || 0), 0) : Number(taskCounts[to] || 0);
          return (
            <NavLink
              key={to}
              to={to}
              end={end}
              onClick={onClose}
              title={isCollapsed ? label : undefined}
              className={({ isActive }) =>
                `relative flex items-center gap-2.5 rounded-lg px-3 py-2 text-[12.5px] font-medium leading-tight transition-colors duration-150 ${
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
              <Icon size={16} strokeWidth={2} className="shrink-0" />
              {!isCollapsed && (
                <>
                  <span className="min-w-0 flex-1 break-words">{label}</span>
                  {taskCount > 0 && <span className="rounded-full bg-orange-500 px-2 py-0.5 text-[10px] font-bold text-white" title="Waiting for you">{taskCount > 99 ? '99+' : taskCount}</span>}
                  {showAdviceBadge && (
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${showEmergencyAlert ? 'bg-white text-[#B42318]' : 'bg-[#D9B66F] text-teal-950'}`}>
                      {showEmergencyAlert ? `! ${urgentAdviceCount > 99 ? '99+' : urgentAdviceCount}` : adviceUnreadCount > 99 ? '99+' : adviceUnreadCount}
                    </span>
                  )}
                </>
              )}
              {isCollapsed && taskCount > 0 && !showAdviceBadge && <span className="absolute right-1 top-1 h-2.5 w-2.5 rounded-full bg-orange-500" />}
              {isCollapsed && showAdviceBadge && (
                <span className={`absolute right-1 top-1 h-2.5 w-2.5 rounded-full ${showEmergencyAlert ? 'bg-white' : 'bg-[#D9B66F]'}`} />
              )}
            </NavLink>
          );
        };
        const countOf = (item) => (item.to === '/admin/my-day' ? 0 : Number(taskCounts[item.to] || 0));
        const hrItem = visibleNavItems.find((item) => item.type === 'hr');
        // Order inside the menu: home pages, the role's own work, patient pages, then reference pages at the bottom.
        const TOP = ['/admin/my-day', '/admin'];
        const REFERENCE = ['/admin/knowledge-library', '/admin/enquiries'];
        const top = visibleNavItems.filter((item) => TOP.includes(item.to));
        const reference = visibleNavItems.filter((item) => REFERENCE.includes(item.to));
        const patientPages = visibleNavItems.filter((item) => !item.group && item.type !== 'hr' && !TOP.includes(item.to) && !REFERENCE.includes(item.to));
        const workPages = visibleNavItems.filter((item) => item.group);
        const home = HOME_GROUP[user?.role];
        // Admin and Doctor see every department, so every department keeps its own group.
        const fullMenu = [ROLES.ADMIN, ROLES.DOCTOR].includes(user?.role);
        const allGroups = NAV_GROUPS
          .map((group) => ({ group, items: visibleNavItems.filter((item) => item.group === group.key) }))
          .filter((g) => g.items.length);
        const groups = allGroups.filter((g) => fullMenu || g.items.length > 2 || g.group.key === home)
          .sort((a, b) => (b.group.key === home) - (a.group.key === home));
        const loose = allGroups.filter((g) => !groups.includes(g)).flatMap((g) => g.items);
        const divider = (key) => <div key={key} className="my-2 border-t border-offwhite-100/10" />;
        // Collapsed bar, or all work in one department: a plain list in the same order.
        // Only Admin and Doctor get department groups; every other role gets a plain list.
        if (isCollapsed || !fullMenu || allGroups.length <= 1) {
          return <>
            {top.map(renderItem)}
            {workPages.length > 0 && divider('d1')}
            {workPages.map(renderItem)}
            {patientPages.length > 0 && divider('d2')}
            {patientPages.map(renderItem)}
            {reference.length > 0 && divider('d3')}
            {reference.map(renderItem)}
            {hrItem && renderItem(hrItem)}
          </>;
        }
        const isActiveIn = (items) => items.some((item) => item.to && (item.end ? location.pathname === item.to : location.pathname.startsWith(item.to)));
        const groupList = (list) => list.map(({ group, items }) => {
            const active = isActiveIn(items);
            const stored = openGroups[group.key];
            const open = stored === undefined ? active || group.key === home : stored || active;
            return <NavGroup key={group.key} group={group} items={items} open={open} active={active} count={items.reduce((sum, item) => sum + countOf(item), 0)} renderItem={renderItem}
              onToggle={() => setOpenGroups((prev) => { const next = { ...prev, [group.key]: !open }; try { localStorage.setItem(GROUP_STORAGE_KEY, JSON.stringify(next)); } catch { /* optional */ } return next; })} />;
          });
        if (!fullMenu) {
          // Department roles: home, own department (open), its smaller tasks, patient pages, other departments, reference.
          const own = groups.filter((g) => g.group.key === home);
          const others = groups.filter((g) => g.group.key !== home);
          return <>
            {top.map(renderItem)}
            {divider('d1')}
            {groupList(own)}
            {loose.map(renderItem)}
            {others.length > 0 && groupList(others)}
            {divider('d2')}
            {patientPages.map(renderItem)}
            {reference.length > 0 && divider('d3')}
            {reference.map(renderItem)}
            {hrItem && renderItem(hrItem)}
          </>;
        }
        return <>
          {top.map(renderItem)}
          {patientPages.map(renderItem)}
          {reference.map(renderItem)}
          {loose.map(renderItem)}
          <div className="my-2 border-t border-offwhite-100/10" />
          {groups.map(({ group, items }) => {
            const active = isActiveIn(items);
            const stored = openGroups[group.key];
            const open = stored === undefined ? active || group.key === home : stored || active;
            return <NavGroup key={group.key} group={group} items={items} open={open} active={active} count={items.reduce((sum, item) => sum + countOf(item), 0)} renderItem={renderItem}
              onToggle={() => setOpenGroups((prev) => { const next = { ...prev, [group.key]: !open }; try { localStorage.setItem(GROUP_STORAGE_KEY, JSON.stringify(next)); } catch { /* optional */ } return next; })} />;
          })}
          {hrItem && renderItem(hrItem)}
        </>;
        })()}
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
