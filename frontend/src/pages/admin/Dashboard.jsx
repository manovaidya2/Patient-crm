import { useEffect, useState } from 'react';
import { Users, UserCheck, UserX, ArrowRight, ChevronLeft, ChevronRight, Layers, WalletCards, PackageCheck, Truck, AlertTriangle, CalendarDays } from 'lucide-react';
import { Link } from 'react-router-dom';
import api from '../../api/axios.js';
import Card from '../../components/ui/Card.jsx';
import { CREATABLE_ROLES, ROLE_LABELS, ROLES } from '../../constants/roles.js';
import { STAGES, STAGE_LABELS } from '../../constants/treatmentStages.js';
import { useAuth } from '../../context/AuthContext.jsx';

const formatMoney = (value) => `Rs ${Number(value || 0).toLocaleString('en-IN')}`;

const chartColors = ['#657B6C', '#A9B5A3', '#E8D5B5', '#C6B28E', '#8B9A84', '#DED2BD'];

const pad2 = (value) => String(value).padStart(2, '0');
const toDateInputValue = (date) =>
  `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;

const getEmptyMonthlyRows = () =>
  Array.from({ length: 6 }, (_, index) => {
    const date = new Date();
    date.setMonth(date.getMonth() - (5 - index));
    return {
      key: `${date.getFullYear()}-${date.getMonth() + 1}`,
      label: date.toLocaleString('en-IN', { month: 'short' }),
      patients: 0,
    };
  });

const MonthlyOnboardingChart = ({ rows = [], loading }) => {
  const maxPatients = Math.max(...rows.map((row) => row.patients || 0), 1);

  return (
    <Card className="lg:col-span-7">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-wide font-semibold text-charcoal/55">Monthly Onboarding</p>
          <h2 className="mt-1 font-display text-xl font-bold text-charcoal">Patients added</h2>
        </div>
        <span className="rounded-full border border-cardline bg-offwhite-200 px-3 py-1 text-xs font-semibold text-charcoal/60">
          Last 6 months
        </span>
      </div>

      <div className="mt-6 rounded-xl border border-cardline bg-offwhite-200/55 px-4 pb-4 pt-5">
        <div className="flex h-48 items-end justify-between gap-4 border-b border-cardline">
        {rows.map((row, index) => {
          const value = Number(row.patients || 0);
          const fillHeight = loading ? 24 : value > 0 ? Math.max(28, Math.round((value / maxPatients) * 156)) : 8;
          const trackHeight = loading ? 112 : Math.max(112, fillHeight + 28 + (index % 2) * 14);
          return (
            <div key={row.key || row.label} className="flex min-w-0 flex-1 flex-col items-center">
              <div className="relative flex h-40 w-full max-w-[58px] items-end justify-center">
                <div
                  className="absolute bottom-0 w-full rounded-t-md bg-[#E4D5BF]"
                  style={{ height: trackHeight }}
                />
                <div
                  className="relative z-10 w-[58%] rounded-t-md bg-sage transition-all"
                  style={{ height: fillHeight }}
                />
              </div>
            </div>
          );
        })}
        </div>
        <div className="mt-3 flex justify-between gap-4">
          {rows.map((row) => (
            <div key={`${row.key || row.label}-label`} className="min-w-0 flex-1 text-center">
              <p className="text-sm font-bold text-charcoal">{loading ? '...' : row.patients}</p>
              <p className="mt-1 text-[11px] uppercase tracking-wide text-charcoal/55">{row.label}</p>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
};

const StageDonutChart = ({ rows = [], loading }) => {
  const total = rows.reduce((sum, row) => sum + Number(row.activePatients || 0), 0);
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  return (
    <Card className="lg:col-span-5">
      <div>
        <p className="text-xs uppercase tracking-wide font-semibold text-charcoal/55">Stage Distribution</p>
        <h2 className="mt-1 font-display text-xl font-bold text-charcoal">Active patients</h2>
      </div>

      <div className="mt-6 grid gap-6 sm:grid-cols-[180px_1fr] sm:items-center lg:grid-cols-1 xl:grid-cols-[180px_1fr]">
        <div className="relative mx-auto h-44 w-44">
          <svg viewBox="0 0 140 140" className="-rotate-90">
            <circle cx="70" cy="70" r={radius} fill="none" stroke="#EFE3CF" strokeWidth="18" />
            {rows.map((row, index) => {
              const value = Number(row.activePatients || 0);
              const length = total ? (value / total) * circumference : 0;
              const segment = (
                <circle
                  key={row.stage}
                  cx="70"
                  cy="70"
                  r={radius}
                  fill="none"
                  stroke={chartColors[index % chartColors.length]}
                  strokeWidth="18"
                  strokeLinecap="round"
                  strokeDasharray={`${length} ${circumference - length}`}
                  strokeDashoffset={-offset}
                />
              );
              offset += length;
              return segment;
            })}
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
            <p className="font-display text-3xl font-bold text-charcoal">{loading ? '...' : total}</p>
            <p className="text-xs font-semibold text-charcoal/55">Patients</p>
          </div>
        </div>

        <div className="space-y-2">
          {rows.map((row, index) => {
            const percent = total ? Math.round((Number(row.activePatients || 0) / total) * 100) : 0;
            return (
              <div key={row.stage} className="flex items-center justify-between gap-3 rounded-lg border border-cardline bg-offwhite-200 px-3 py-2">
                <div className="flex min-w-0 items-center gap-2">
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: chartColors[index % chartColors.length] }}
                  />
                  <span className="truncate text-sm font-semibold text-charcoal">{row.label}</span>
                </div>
                <span className="text-xs font-bold text-charcoal/60">
                  {loading ? '...' : `${row.activePatients} (${percent}%)`}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </Card>
  );
};

const Dashboard = () => {
  const { user } = useAuth();
  const isAdmin = user?.role === ROLES.ADMIN;
  const [users, setUsers] = useState([]);
  const [stats, setStats] = useState(null);
  const [emergencyAdvice, setEmergencyAdvice] = useState({ count: 0, latest: null });
  const [activeStageIndex, setActiveStageIndex] = useState(0);
  const [followUpDate, setFollowUpDate] = useState(() => toDateInputValue(new Date()));
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchDashboardData = async () => {
      setLoading(true);
      try {
        const usersPromise = isAdmin ? api.get('/users') : Promise.resolve({ data: { users: [] } });
        const [usersRes, statsRes] = await Promise.all([
          usersPromise,
          api.get('/patients/dashboard-stats', { params: { followUpDate } }),
        ]);
        setUsers(usersRes.data.users || []);
        setStats(statsRes.data);
      } catch (err) {
        // Dashboard fails silently to a zero-state; Team Members page surfaces the real error
      } finally {
        setLoading(false);
      }
    };
    fetchDashboardData();
  }, [isAdmin, followUpDate]);

  useEffect(() => {
    if (![ROLES.ADMIN, ROLES.DOCTOR].includes(user?.role)) return undefined;

    const fetchEmergencyAdvice = async () => {
      try {
        const { data } = await api.get('/advice/unread-count');
        setEmergencyAdvice({
          count: Number(data.urgentCount || 0),
          latest: data.latestUrgent || null,
        });
      } catch {
        setEmergencyAdvice({ count: 0, latest: null });
      }
    };

    fetchEmergencyAdvice();
    const intervalId = window.setInterval(fetchEmergencyAdvice, 10000);
    return () => window.clearInterval(intervalId);
  }, [user?.role]);

  const activeCount = users.filter((u) => u.isActive).length;
  const inactiveCount = users.length - activeCount;

  const roleCounts = CREATABLE_ROLES.map((role) => ({
    role,
    label: ROLE_LABELS[role],
    count: users.filter((u) => u.role === role).length,
  }));

  const stageCounts =
    stats?.stageCounts ||
    STAGES.map((stage) => ({ stage, label: STAGE_LABELS[stage], activePatients: 0 }));
  const activeStage = stageCounts[activeStageIndex] || stageCounts[0];
  const paymentSummary = stats?.paymentSummary || { totalAmount: 0, amountPaid: 0, dueAmount: 0 };
  const followUpSummary = stats?.followUpSummary || {
    total: 0,
    done: 0,
    pending: 0,
    normal: { total: 0, done: 0, pending: 0 },
    sfs: { total: 0, done: 0, pending: 0 },
  };
  const workflowSummary = stats?.workflowSummary || {
    medicineRequested: 0,
    medicineInProcess: 0,
    medicineMade: 0,
    sentToCourier: 0,
    courierPending: 0,
    courierDispatched: 0,
    courierDelivered: 0,
  };
  const courierPending = Math.max(
    Number(workflowSummary.courierPending ?? (workflowSummary.sentToCourier - workflowSummary.courierDispatched - workflowSummary.courierDelivered)) || 0,
    0
  );
  const monthlyOnboarding = stats?.monthlyOnboarding?.length ? stats.monthlyOnboarding : getEmptyMonthlyRows();

  const goToPreviousStage = () => {
    setActiveStageIndex((index) => (index === 0 ? stageCounts.length - 1 : index - 1));
  };

  const goToNextStage = () => {
    setActiveStageIndex((index) => (index === stageCounts.length - 1 ? 0 : index + 1));
  };

  return (
    <div>
      {emergencyAdvice.count > 0 && (
        <>
          <div className="fixed right-4 top-20 z-50 w-[calc(100vw-2rem)] max-w-sm animate-pulse rounded-lg border border-[#B42318] bg-[#B42318] px-4 py-3 text-white shadow-card sm:right-6">
            <div className="flex items-start gap-2">
              <AlertTriangle size={18} className="mt-0.5 shrink-0" />
              <div className="min-w-0">
                <p className="text-sm font-bold">Emergency advice request</p>
                <p className="mt-0.5 text-xs text-white/85">
                  {emergencyAdvice.latest?.patientName || 'A patient'} needs urgent doctor advice.
                </p>
              </div>
            </div>
          </div>
          <Link
            to="/admin/request-for-advice"
            className="mb-5 flex flex-col gap-2 rounded-lg border border-[#B42318] bg-[#B42318]/10 px-4 py-3 text-[#B42318] hover:bg-[#B42318]/15 sm:flex-row sm:items-center sm:justify-between"
          >
            <span className="flex min-w-0 items-center gap-2 text-sm font-bold">
              <AlertTriangle size={18} className="shrink-0" />
              <span className="min-w-0 break-words">Emergency: {emergencyAdvice.count} urgent advice request{emergencyAdvice.count > 1 ? 's' : ''}</span>
            </span>
            <span className="shrink-0 text-xs font-semibold">Open requests</span>
          </Link>
        </>
      )}
      <h1 className="font-display text-3xl font-bold text-charcoal">
        Clinic Control Room
      </h1>
      <p className="mt-1 text-sm text-charcoal/60">Here's what your team looks like today.</p>

      <div className="mt-6 grid grid-cols-1 xl:grid-cols-2 gap-4">
        <Card>
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="h-11 w-11 rounded-lg bg-sage-muted/25 flex items-center justify-center text-sage">
                <Layers size={20} />
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide font-semibold text-charcoal/55">Active Patients</p>
                <h2 className="mt-1 font-display text-xl font-bold text-charcoal">{activeStage?.label || 'Stage 1'}</h2>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={goToPreviousStage}
                aria-label="Previous stage"
                className="p-1.5 rounded-md text-sage hover:bg-sage-muted/25"
              >
                <ChevronLeft size={17} />
              </button>
              <button
                type="button"
                onClick={goToNextStage}
                aria-label="Next stage"
                className="p-1.5 rounded-md text-sage hover:bg-sage-muted/25"
              >
                <ChevronRight size={17} />
              </button>
            </div>
          </div>

          <div className="mt-6 flex items-end justify-between gap-4">
            <div>
              <p className="font-display text-4xl font-bold text-charcoal">
                {loading ? '...' : activeStage?.activePatients || 0}
              </p>
              <p className="mt-1 text-sm text-charcoal/60">Patients currently in this stage</p>
            </div>
            <Link
              to={`/admin/stages/${activeStage?.stage || 1}`}
              className="text-sm font-medium text-sage hover:text-sage flex items-center gap-1"
            >
              View patients <ArrowRight size={14} />
            </Link>
          </div>
        </Card>

        <Card>
          <div className="flex items-center gap-3">
            <div className="h-11 w-11 rounded-lg bg-sage-muted/25 flex items-center justify-center text-sage">
              <WalletCards size={20} />
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide font-semibold text-charcoal/55">Payment Summary</p>
              <h2 className="mt-1 font-display text-xl font-bold text-charcoal">All Patients</h2>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-3 gap-3">
            <div>
              <p className="text-xs font-semibold text-charcoal/55">Package Total</p>
              <p className="mt-1 font-display text-lg font-bold text-charcoal">
                {loading ? '...' : formatMoney(paymentSummary.totalAmount)}
              </p>
            </div>
            <div>
              <p className="text-xs font-semibold text-charcoal/55">Paid</p>
              <p className="mt-1 font-display text-lg font-bold text-sage">
                {loading ? '...' : formatMoney(paymentSummary.amountPaid)}
              </p>
            </div>
            <div>
              <p className="text-xs font-semibold text-charcoal/55">Due</p>
              <p className="mt-1 font-display text-lg font-bold text-[#8C3B2E]">
                {loading ? '...' : formatMoney(paymentSummary.dueAmount)}
              </p>
            </div>
          </div>
        </Card>
      </div>

      <Card className="mt-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs uppercase tracking-wide font-semibold text-charcoal/55">Follow-up Summary</p>
            <h2 className="mt-1 font-display text-xl font-bold text-charcoal">Normal & SFS follow-ups</h2>
          </div>
          <label className="relative w-full sm:w-48">
            <CalendarDays size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-charcoal/40" />
            <input
              type="date"
              value={followUpDate}
              onChange={(e) => setFollowUpDate(e.target.value)}
              className="w-full rounded-lg border border-cardline bg-offwhite-200 pl-9 pr-3.5 py-2.5 text-sm text-charcoal focus:border-sage focus:outline-none focus:ring-2 focus:ring-sage/20 transition"
            />
          </label>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <div className="rounded-lg border border-cardline bg-offwhite-200 p-4">
            <p className="text-xs font-semibold text-charcoal/55">Total Follow-ups</p>
            <p className="mt-2 font-display text-2xl font-bold text-charcoal">{loading ? '...' : followUpSummary.total}</p>
          </div>
          <div className="rounded-lg border border-cardline bg-offwhite-200 p-4">
            <p className="text-xs font-semibold text-charcoal/55">Done</p>
            <p className="mt-2 font-display text-2xl font-bold text-sage">{loading ? '...' : followUpSummary.done}</p>
          </div>
          <div className="rounded-lg border border-cardline bg-offwhite-200 p-4">
            <p className="text-xs font-semibold text-charcoal/55">Pending</p>
            <p className="mt-2 font-display text-2xl font-bold text-[#8C3B2E]">{loading ? '...' : followUpSummary.pending}</p>
          </div>
          <div className="rounded-lg border border-cardline bg-offwhite-200 p-4">
            <p className="text-xs font-semibold text-charcoal/55">Normal</p>
            <p className="mt-2 font-display text-2xl font-bold text-charcoal">{loading ? '...' : followUpSummary.normal.total}</p>
            <p className="mt-1 text-xs text-charcoal/55">Done {loading ? '...' : followUpSummary.normal.done} | Pending {loading ? '...' : followUpSummary.normal.pending}</p>
          </div>
          <div className="rounded-lg border border-cardline bg-offwhite-200 p-4">
            <p className="text-xs font-semibold text-charcoal/55">SFS</p>
            <p className="mt-2 font-display text-2xl font-bold text-charcoal">{loading ? '...' : followUpSummary.sfs.total}</p>
            <p className="mt-1 text-xs text-charcoal/55">Done {loading ? '...' : followUpSummary.sfs.done} | Pending {loading ? '...' : followUpSummary.sfs.pending}</p>
          </div>
        </div>
      </Card>

      <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-wide font-semibold text-charcoal/55">Medicine Workflow</p>
              <h2 className="mt-1 font-display text-xl font-bold text-charcoal">Requests & made</h2>
            </div>
            <PackageCheck size={22} className="text-sage" />
          </div>
          <div className="mt-5 grid grid-cols-4 gap-3">
            <div><p className="text-xs text-charcoal/55">New</p><p className="font-display text-xl font-bold text-charcoal">{loading ? '...' : workflowSummary.medicineRequested}</p></div>
            <div><p className="text-xs text-charcoal/55">Process</p><p className="font-display text-xl font-bold text-charcoal">{loading ? '...' : workflowSummary.medicineInProcess}</p></div>
            <div><p className="text-xs text-charcoal/55">Made</p><p className="font-display text-xl font-bold text-sage">{loading ? '...' : workflowSummary.medicineMade}</p></div>
            <div><p className="text-xs text-charcoal/55">Courier</p><p className="font-display text-xl font-bold text-sage">{loading ? '...' : workflowSummary.sentToCourier}</p></div>
          </div>
        </Card>
        <Card>
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-wide font-semibold text-charcoal/55">Courier Workflow</p>
              <h2 className="mt-1 font-display text-xl font-bold text-charcoal">Dispatch tracking</h2>
            </div>
            <Truck size={22} className="text-sage" />
          </div>
          <div className="mt-5 grid grid-cols-3 gap-3">
            <div><p className="text-xs text-charcoal/55">Pending</p><p className="font-display text-xl font-bold text-charcoal">{loading ? '...' : courierPending}</p></div>
            <div><p className="text-xs text-charcoal/55">Dispatched</p><p className="font-display text-xl font-bold text-sage">{loading ? '...' : workflowSummary.courierDispatched}</p></div>
            <div><p className="text-xs text-charcoal/55">Delivered</p><p className="font-display text-xl font-bold text-charcoal">{loading ? '...' : workflowSummary.courierDelivered}</p></div>
          </div>
        </Card>
      </div>

      {isAdmin && <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="flex items-center gap-4">
          <div className="h-11 w-11 rounded-lg bg-sage-muted/25 flex items-center justify-center text-sage">
            <Users size={20} />
          </div>
          <div>
            <p className="text-2xl font-display font-bold text-charcoal">{loading ? '—' : users.length}</p>
            <p className="text-xs text-charcoal/60">Total team members</p>
          </div>
        </Card>
        <Card className="flex items-center gap-4">
          <div className="h-11 w-11 rounded-lg bg-sage-muted/25 flex items-center justify-center text-sage">
            <UserCheck size={20} />
          </div>
          <div>
            <p className="text-2xl font-display font-bold text-charcoal">{loading ? '—' : activeCount}</p>
            <p className="text-xs text-charcoal/60">Active logins</p>
          </div>
        </Card>
        <Card className="flex items-center gap-4">
          <div className="h-11 w-11 rounded-lg bg-offwhite-300/45 flex items-center justify-center text-charcoal/60">
            <UserX size={20} />
          </div>
          <div>
            <p className="text-2xl font-display font-bold text-charcoal">{loading ? '—' : inactiveCount}</p>
            <p className="text-xs text-charcoal/60">Deactivated logins</p>
          </div>
        </Card>
      </div>}

      <div className="mt-6 grid grid-cols-1 lg:grid-cols-12 gap-4">
        <MonthlyOnboardingChart rows={monthlyOnboarding} loading={loading} />
        <StageDonutChart rows={stageCounts} loading={loading} />
      </div>

      {isAdmin && <div className="mt-8 flex items-center justify-between">
        <h2 className="font-display text-base font-bold text-charcoal">By department</h2>
        <Link
          to="/admin/team"
          className="text-sm font-medium text-sage hover:text-sage flex items-center gap-1"
        >
          Manage team <ArrowRight size={14} />
        </Link>
      </div>}

      {isAdmin && <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {roleCounts.map(({ role, label, count }) => (
          <Card key={role} className="flex items-center justify-between">
            <span className="text-sm font-medium text-charcoal">{label}</span>
            <span className="text-lg font-display font-bold text-sage">{loading ? '—' : count}</span>
          </Card>
        ))}
      </div>}
    </div>
  );
};

export default Dashboard;
