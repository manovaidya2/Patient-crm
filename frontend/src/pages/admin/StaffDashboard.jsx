import { useEffect, useState } from 'react';
import { Activity, AlertTriangle, CalendarClock, CheckCircle2, ChevronLeft, ChevronRight, Clock, Users } from 'lucide-react';
import { Link } from 'react-router-dom';
import api from '../../api/axios.js';
import ReminderDropdown from '../../components/ReminderDropdown.jsx';
import Card from '../../components/ui/Card.jsx';
import { useAuth } from '../../context/AuthContext.jsx';

const formatDateTime = (iso) =>
  iso
    ? new Date(iso).toLocaleString('en-IN', {
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '-';

const formatReminderDate = (item) => {
  if (item?.type !== 'medicine_connect') return formatDateTime(item?.dateTime);
  const [year, month, day] = String(item?.dateTime || '').slice(0, 10).split('-').map(Number);
  if (!year || !month || !day) return '-';
  return new Date(year, month - 1, day).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
  });
};

const RECENT_ACTIONS_PER_PAGE = 10;

const StatCard = ({ icon: Icon, label, value, tone = 'sage' }) => {
  const toneClass = tone === 'danger' ? 'bg-[#B42318]/10 text-[#B42318]' : 'bg-sage-muted/25 text-sage';
  return (
    <Card className="rounded-2xl">
      <div className="flex items-center gap-3">
        <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${toneClass}`}>
          <Icon size={20} />
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-charcoal/55">{label}</p>
          <p className="mt-1 font-display text-2xl font-bold text-charcoal">{value}</p>
        </div>
      </div>
    </Card>
  );
};

const StaffDashboard = () => {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [recentPage, setRecentPage] = useState(1);

  useEffect(() => {
    let cancelled = false;
    const fetchDashboard = async () => {
      try {
        const { data: response } = await api.get('/patients/staff-dashboard-stats');
        if (!cancelled) setData(response);
      } catch {
        if (!cancelled) setData(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchDashboard();
    const intervalId = window.setInterval(fetchDashboard, 15000);
    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, []);

  const summary = data?.summary || {};
  const reminders = data?.reminders || [];
  const assigneeRows = data?.assigneeRows || [];
  const recentActions = data?.recentActions || [];
  const recentPages = Math.max(Math.ceil(recentActions.length / RECENT_ACTIONS_PER_PAGE), 1);
  const safeRecentPage = Math.min(recentPage, recentPages);
  const recentStartIndex = (safeRecentPage - 1) * RECENT_ACTIONS_PER_PAGE;
  const visibleRecentActions = recentActions.slice(recentStartIndex, recentStartIndex + RECENT_ACTIONS_PER_PAGE);

  useEffect(() => {
    setRecentPage(1);
  }, [recentActions.length]);

  return (
    <div className="pr-0 md:pr-6">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="font-display text-2xl font-bold text-charcoal">
            Welcome, {user?.name?.split(' ')[0]}
          </h1>
          <p className="mt-1 text-sm text-charcoal/60">
            Your operational dashboard for reminders, assigned work, and recent CRM activity.
          </p>
        </div>
        <ReminderDropdown className="shrink-0" />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard icon={Users} label="Patients" value={loading ? '...' : summary.assignedPatients || 0} />
        <StatCard icon={AlertTriangle} label="Late" value={loading ? '...' : summary.lateReminders || 0} tone="danger" />
        <StatCard icon={Clock} label="Next 24h" value={loading ? '...' : summary.next24Reminders || 0} />
        <StatCard icon={CalendarClock} label="Today schedules" value={loading ? '...' : Number(summary.todayFollowUps || 0) + Number(summary.todayFamilySessions || 0)} />
        <StatCard icon={CheckCircle2} label="Completed today" value={loading ? '...' : summary.todayCompleted || 0} />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card className="rounded-2xl">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-charcoal/55">Reminder Queue</p>
              <h2 className="mt-1 font-display text-xl font-bold text-charcoal">Late and next 24 hours</h2>
            </div>
            <span className="rounded-full bg-sage-muted/25 px-3 py-1 text-xs font-bold text-sage">
              {reminders.length}
            </span>
          </div>

          <div className="mt-4 space-y-3">
            {reminders.length === 0 ? (
              <p className="rounded-2xl border border-cardline bg-offwhite-200 px-4 py-6 text-center text-sm text-charcoal/50">
                No reminders right now.
              </p>
            ) : (
              reminders.slice(0, 8).map((item) => (
                <Link
                  key={item.id}
                  to={`/admin/patients/${item.patientId}`}
                  className="block rounded-2xl border border-cardline bg-offwhite-200/75 px-4 py-3 transition hover:border-sage/35 hover:bg-sage-muted/15"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-charcoal">{item.typeLabel} - {item.patientName}</p>
                      <p className="mt-1 text-xs text-charcoal/55">{item.stageLabel} | {formatReminderDate(item)}</p>
                      {item.notes && (
                        <p className="mt-1 text-xs font-semibold text-charcoal/65">Issue: {item.notes}</p>
                      )}
                      <p className="mt-1 text-xs text-charcoal/55">Assigned to {item.assignee}</p>
                    </div>
                    <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold ${
                      item.reminderKind === 'late' ? 'bg-[#B42318]/10 text-[#B42318]' : 'bg-sage-muted/25 text-sage'
                    }`}>
                      {item.reminderKind === 'late' ? 'Late' : '24h'}
                    </span>
                  </div>
                </Link>
              ))
            )}
          </div>
        </Card>

        <Card className="rounded-2xl">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-charcoal/55">Workload</p>
            <h2 className="mt-1 font-display text-xl font-bold text-charcoal">Assigned reminders by member</h2>
          </div>

          <div className="mt-4 space-y-3">
            {assigneeRows.length === 0 ? (
              <p className="rounded-2xl border border-cardline bg-offwhite-200 px-4 py-6 text-center text-sm text-charcoal/50">
                No assigned reminder load right now.
              </p>
            ) : (
              assigneeRows.map((row) => (
                <div key={`${row.role}-${row.name}`} className="rounded-2xl border border-cardline bg-offwhite-200/75 px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-charcoal">{row.name}</p>
                      <p className="mt-1 text-xs text-charcoal/50">{row.role}</p>
                    </div>
                    <p className="font-display text-2xl font-bold text-charcoal">{row.total}</p>
                  </div>
                  <p className="mt-2 text-xs text-charcoal/55">Late {row.late} | Next 24h {row.next24}</p>
                </div>
              ))
            )}
          </div>
        </Card>
      </div>

      <Card className="mt-6 rounded-2xl">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-sage-muted/25 text-sage">
              <Activity size={18} />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-charcoal/55">Recent Actions</p>
              <h2 className="font-display text-xl font-bold text-charcoal">Latest CRM work</h2>
            </div>
          </div>
          {recentActions.length > 0 && (
            <span className="text-xs font-semibold text-charcoal/45">
              {recentStartIndex + 1}-{Math.min(recentStartIndex + RECENT_ACTIONS_PER_PAGE, recentActions.length)} of {recentActions.length}
            </span>
          )}
        </div>

        <div className="mt-4 divide-y divide-cardline overflow-hidden rounded-2xl border border-cardline bg-offwhite-200/60">
          {recentActions.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-charcoal/50">No recent actions found.</p>
          ) : (
            visibleRecentActions.map((item, index) => (
              <Link
                key={`${item.patientId}-${item.at}-${index}`}
                to={`/admin/patients/${item.patientId}`}
                className="block px-4 py-3 transition hover:bg-sage-muted/15"
              >
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-charcoal">{item.action}</p>
                    <p className="mt-1 text-xs text-charcoal/55">
                      {item.patientName} {item.patientCode ? `| ${item.patientCode}` : ''} | By {item.by}
                    </p>
                    {item.details && <p className="mt-1 line-clamp-2 text-xs text-charcoal/50">{item.details}</p>}
                  </div>
                  <span className="shrink-0 text-xs font-semibold text-charcoal/45">{formatDateTime(item.at)}</span>
                </div>
              </Link>
            ))
          )}
        </div>

        {recentActions.length > RECENT_ACTIONS_PER_PAGE && (
          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs font-semibold text-charcoal/45">
              Page {safeRecentPage} of {recentPages}
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setRecentPage((page) => Math.max(page - 1, 1))}
                disabled={safeRecentPage <= 1}
                className="inline-flex items-center gap-1 rounded-xl border border-cardline bg-offwhite-100 px-3 py-2 text-xs font-bold text-charcoal transition hover:bg-sage-muted/15 disabled:cursor-not-allowed disabled:opacity-45"
              >
                <ChevronLeft size={14} /> Previous
              </button>
              <button
                type="button"
                onClick={() => setRecentPage((page) => Math.min(page + 1, recentPages))}
                disabled={safeRecentPage >= recentPages}
                className="inline-flex items-center gap-1 rounded-xl border border-cardline bg-offwhite-100 px-3 py-2 text-xs font-bold text-charcoal transition hover:bg-sage-muted/15 disabled:cursor-not-allowed disabled:opacity-45"
              >
                Next <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
};

export default StaffDashboard;
