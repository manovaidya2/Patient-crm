import { NavLink, useLocation } from 'react-router-dom';
import { Home, Menu, Sun } from 'lucide-react';
import { navItems } from './Sidebar.jsx';
import useTaskCounts from '../hooks/useTaskCounts.js';
import { useAuth } from '../context/AuthContext.jsx';
import { ROLES, getDefaultRoute } from '../constants/roles.js';

// The pages each role opens most on a phone; anything the role cannot open is skipped.
const PREFERRED = {
  [ROLES.ADMIN]: ['/admin/patients', '/admin/purchase-orders', '/admin/patient-approvals'],
  [ROLES.DOCTOR]: ['/admin/patients', '/admin/patient-approvals', '/admin/purchase-orders'],
  [ROLES.MANAGER]: ['/admin/patients', '/admin/followups', '/admin/family-sessions'],
  [ROLES.POST_COUNSELOR]: ['/admin/post-counseling-patients', '/admin/package-not-bought', '/admin/patients'],
  [ROLES.IN_TRANSIT]: ['/admin/purchase-orders', '/admin/courier', '/admin/patient-approvals'],
  [ROLES.MEDICINE_DEPARTMENT]: ['/admin/medicine-jobs', '/admin/medicine-requests', '/admin/stocks'],
  [ROLES.ASSISTANT_DOCTOR]: ['/admin/medicine-explanations', '/admin/followups', '/admin/family-sessions'],
  [ROLES.RECEPTIONIST]: ['/admin/appointment-management', '/admin/accounts/consultations', '/admin/receptionist-checklist'],
  [ROLES.SALES_TEAM]: ['/admin/appointment-management', '/admin/patients'],
};
const SHORT = {
  '/admin/patients': 'Patients', '/admin/purchase-orders': 'POs', '/admin/patient-approvals': 'Approvals', '/admin/followups': 'Follow-ups',
  '/admin/post-counseling-patients': 'Post couns.', '/admin/package-not-bought': 'Not bought', '/admin/courier': 'Courier',
  '/admin/medicine-jobs': 'Queue', '/admin/stocks': 'Stocks', '/admin/medicine-explanations': 'Explain', '/admin/family-sessions': 'Family',
  '/admin/appointment-management': 'Appointments', '/admin/accounts/consultations': 'Ledger',
  '/admin/medicine-requests': 'Requests', '/admin/receptionist-checklist': 'Checklist', '/admin/enquiries': 'Enquiries', '/admin/knowledge-library': 'Library', '/admin/payments': 'Payments',
};

const badge = (n) => (n > 0 ? <span className="absolute -top-1 right-2 flex h-[18px] min-w-[18px] items-center justify-center rounded-full border-2 border-white bg-[#F97316] px-1 text-[10px] font-extrabold leading-none text-white">{n > 99 ? '99+' : n}</span> : null);

// Phone navigation (as in the design): white bar, two role pages either side of an orange "My day" button, and Menu
// for the full sidebar. Orange numbers are the same pending counts the sidebar shows.
export default function MobileTabBar({ onMenu }) {
  const { user } = useAuth();
  const location = useLocation();
  const counts = useTaskCounts(`${user?.role}|${location.pathname}`);
  const role = user?.role;
  if (!role || role === ROLES.HR) return null;

  const allowed = navItems.filter((item) => item.to && item.icon && (!item.adminOnly || role === ROLES.ADMIN) && (!item.roles || item.roles.includes(role)) && !item.hiddenFor?.includes(role));
  const byPath = new Map(allowed.map((item) => [item.to, item]));
  const home = getDefaultRoute(role);
  const picks = [];
  const add = (to, label, icon) => { if (to && !picks.some((p) => p.to === to) && picks.length < 3) picks.push({ to, label, icon }); };
  if (home && home !== '/admin/my-day') add(home, 'Home', Home);
  (PREFERRED[role] || []).forEach((to) => byPath.has(to) && add(to, SHORT[to] || byPath.get(to).label, byPath.get(to).icon));
  // Fill any gap with the role's busiest other page.
  [...allowed].sort((x, y) => Number(counts[y.to] || 0) - Number(counts[x.to] || 0)).forEach((item) => item.to !== '/admin/my-day' && add(item.to, SHORT[item.to] || item.label, item.icon));
  const total = Object.values(counts).reduce((sum, n) => sum + Number(n || 0), 0);
  const [a, b, c] = picks;

  const Tab = ({ item }) => {
    if (!item) return <span />;
    const Icon = item.icon;
    return (
      <NavLink to={item.to} end={item.to === '/admin'} className={({ isActive }) => `flex min-h-[52px] flex-col items-center gap-[3px] text-[10.5px] ${isActive ? 'font-extrabold text-[#062B29]' : 'font-semibold text-[#7A8286]'}`}>
        {({ isActive }) => (<>
          <span className={`relative flex h-[30px] w-[52px] items-center justify-center rounded-full ${isActive ? 'bg-[#DCE8E1] text-[#0F4642]' : ''}`}><Icon size={21} strokeWidth={1.9} />{badge(Number(counts[item.to] || 0))}</span>
          <span className="max-w-full truncate px-0.5">{item.label}</span>
        </>)}
      </NavLink>
    );
  };

  return (
    <nav aria-label="Quick navigation" className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 items-end rounded-t-[22px] border-t border-[#E8DFCB] bg-white px-1.5 pb-[max(10px,env(safe-area-inset-bottom))] pt-2 shadow-[0_-6px_24px_rgba(39,50,56,0.08)] md:hidden">
      <Tab item={a} />
      <Tab item={b} />
      <NavLink to="/admin/my-day" aria-label={`My day${total ? `, ${total} waiting` : ''}`} className="flex min-h-[52px] flex-col items-center gap-[3px] text-[10.5px] font-extrabold text-[#C2410C]">
        <span className="relative -mt-6 flex h-[52px] w-[52px] items-center justify-center rounded-[18px] bg-[#F97316] text-white shadow-[0_8px_18px_rgba(249,115,22,0.35)]"><Sun size={24} strokeWidth={2.3} />{total > 0 && <span className="absolute -right-1.5 -top-1.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full border-2 border-white bg-[#062B29] px-1 text-[10px] font-extrabold leading-none text-white">{total > 99 ? '99+' : total}</span>}</span>
        My day
      </NavLink>
      <Tab item={c} />
      <button type="button" onClick={onMenu} className="flex min-h-[52px] flex-col items-center gap-[3px] text-[10.5px] font-semibold text-[#7A8286]">
        <span className="flex h-[30px] w-[52px] items-center justify-center rounded-full"><Menu size={21} strokeWidth={1.9} /></span>
        Menu
      </button>
    </nav>
  );
}
