import { useEffect, useState } from 'react';
import { NavLink } from 'react-router-dom';
import api from '../api/axios.js';
import useTaskCounts from '../hooks/useTaskCounts.js';
import { useAuth } from '../context/AuthContext.jsx';
import { ROLES } from '../constants/roles.js';

const today = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
const DESK = [ROLES.ADMIN, ROLES.RECEPTIONIST];
const TABS = [
  ['/admin/accounts/consultations', 'Consultation ledger', [ROLES.ADMIN, ROLES.DOCTOR, ROLES.RECEPTIONIST]],
  ['/admin/visitors', 'Visitors', DESK, 'visitors'],
  ['/admin/incoming-couriers', 'Couriers in', DESK, 'incoming-couriers'],
  ['/admin/outgoing-couriers', 'Couriers out', DESK, 'outgoing-couriers'],
  ['/admin/record-room', 'Record room', DESK],
];

// "Registers & ledger" tabs shared by the front-desk pages (as in the design): today's entry count per register and
// the consultation receipts still to verify. Shown only to roles that can open more than one of them.
export default function RegisterTabs() {
  const { user } = useAuth();
  const role = user?.role;
  const counts = useTaskCounts(role);
  const tabs = TABS.filter(([, , roles]) => roles.includes(role));
  const [todayCounts, setTodayCounts] = useState({});
  useEffect(() => {
    if (!DESK.includes(role)) return undefined;
    let active = true;
    Promise.all(TABS.filter((t) => t[3]).map(([, , , kind]) => api.get(`/reception-registers/${kind}`, { params: { date: today(), page: 1 }, skipCache: true }).then(({ data }) => [kind, data.total || 0]).catch(() => [kind, null])))
      .then((pairs) => { if (active) setTodayCounts(Object.fromEntries(pairs)); });
    return () => { active = false; };
  }, [role]);
  if (tabs.length < 2) return null;
  const toVerify = Number(counts['/admin/accounts/consultations'] || 0);
  return (
    <nav aria-label="Registers and ledger" className="-mt-1 mb-1 flex flex-wrap gap-0.5 border-b border-[#E8DFCB]">
      {tabs.map(([to, label, , kind]) => (
        <NavLink key={to} to={to} className={({ isActive }) => `-mb-px inline-flex items-center gap-1.5 border-b-2 px-3.5 py-2.5 text-[12.5px] font-bold ${isActive ? 'border-charcoal text-charcoal' : 'border-transparent text-charcoal/60 hover:text-charcoal'}`}>
          {label}
          {kind && todayCounts[kind] != null && <span className="rounded-full bg-[#E9EFE9] px-2 py-px text-[10.5px] font-extrabold text-[#3F5546]" title="Entries today">{todayCounts[kind]} today</span>}
          {!kind && to.endsWith('consultations') && toVerify > 0 && <span className="rounded-full bg-[#FFF1E6] px-2 py-px text-[10.5px] font-extrabold text-[#C2410C]">{toVerify} to verify</span>}
        </NavLink>
      ))}
    </nav>
  );
}
