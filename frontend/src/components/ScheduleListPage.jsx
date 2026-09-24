import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarDays, Search, Inbox, AlertTriangle } from 'lucide-react';
import api from '../api/axios.js';
import Card from './ui/Card.jsx';
import Drawer from './ui/Drawer.jsx';
import Badge from './ui/Badge.jsx';
import { DISPLAY_STATUS_BADGE_TONE } from '../constants/scheduleStatuses.js';
import { useAuth } from '../context/AuthContext.jsx';

const scheduleCache = new Map();
const scheduleRequests = new Map();

const clearScheduleCache = () => {
  scheduleCache.clear();
  scheduleRequests.clear();
};

if (typeof window !== 'undefined') {
  window.addEventListener('crm:logout', clearScheduleCache);
  window.addEventListener('crm:data-changed', clearScheduleCache);
}

const getInitials = (name) =>
  name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('') || '?';

const countColumns = [
  { key: 'upcoming', label: 'Upcoming', className: 'text-[#9C6B2E]' },
  { key: 'late', label: 'Late', className: 'text-[#8C3B2E]' },
  { key: 'done', label: 'Done', className: 'text-sage' },
  { key: 'done_late', label: 'Done Late', className: 'text-sage' },
  { key: 'cancelled', label: 'Cancel', className: 'text-charcoal/40' },
];

const pad2 = (value) => String(value).padStart(2, '0');

const toDateInputValue = (date) =>
  `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;

const toMonthInputValue = (date) => `${date.getFullYear()}-${pad2(date.getMonth() + 1)}`;

const addDays = (date, days) => {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
};

const getDatePreset = (value) => {
  if (value === toDateInputValue(new Date())) return 'today';
  if (value === toDateInputValue(addDays(new Date(), 1))) return 'tomorrow';
  return 'date';
};

const toWeekInputValue = (date) => {
  const target = new Date(date);
  target.setHours(0, 0, 0, 0);
  target.setDate(target.getDate() + 3 - ((target.getDay() + 6) % 7));
  const week1 = new Date(target.getFullYear(), 0, 4);
  const weekNumber =
    1 + Math.round(((target - week1) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7);
  return `${target.getFullYear()}-W${pad2(weekNumber)}`;
};

const startOfDay = (date) => {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
};

const endOfDay = (date) => {
  const next = new Date(date);
  next.setHours(23, 59, 59, 999);
  return next;
};

const getWeekRange = (weekValue) => {
  const [yearText, weekText] = weekValue.split('-W');
  const year = Number(yearText);
  const week = Number(weekText);
  const jan4 = new Date(year, 0, 4);
  const monday = startOfDay(jan4);
  monday.setDate(jan4.getDate() - ((jan4.getDay() + 6) % 7) + (week - 1) * 7);
  const sunday = endOfDay(monday);
  sunday.setDate(monday.getDate() + 6);
  return { start: monday, end: sunday };
};

const getDateRange = (mode, value) => {
  if (mode === 'all') return null;
  if (!value) return null;

  if (mode === 'month') {
    const [year, month] = value.split('-').map(Number);
    return {
      start: new Date(year, month - 1, 1, 0, 0, 0, 0),
      end: new Date(year, month, 0, 23, 59, 59, 999),
    };
  }

  if (mode === 'week') return getWeekRange(value);

  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return { start: startOfDay(date), end: endOfDay(date) };
};

const formatDateTime = (iso) =>
  new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

// Grouped-by-assignee summary with status-bucket counts — used for both the
// Follow-ups and Family Sessions sidebar pages. Each count is clickable and
// opens a drawer listing exactly those entries (patient, stage, date & time).
const ScheduleListPage = ({ title, subtitle, apiPath, showFollowUpTypeFilter = false, showFamilySessionTypeFilter = false }) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [rows, setRows] = useState([]);
  const [search, setSearch] = useState('');
  const [followUpTypeFilter, setFollowUpTypeFilter] = useState('all');
  const [dateMode, setDateMode] = useState('today');
  const [dateValue, setDateValue] = useState(() => toDateInputValue(new Date()));
  const [weekValue, setWeekValue] = useState(() => toWeekInputValue(new Date()));
  const [monthValue, setMonthValue] = useState(() => toMonthInputValue(new Date()));
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerTitle, setDrawerTitle] = useState('');
  const [drawerEntries, setDrawerEntries] = useState([]);

  const activeDateValue =
    dateMode === 'week' ? weekValue : dateMode === 'month' ? monthValue : dateValue;
  const activeRange = useMemo(() => getDateRange(dateMode, activeDateValue), [dateMode, activeDateValue]);
  const scheduleCacheKey = useMemo(() => {
    const scope = String(user?._id || user?.id || 'guest');
    const from = activeRange?.start?.toISOString() || 'all';
    const to = activeRange?.end?.toISOString() || 'all';
    return `${scope}:${apiPath}:${from}:${to}`;
  }, [activeRange, apiPath, user?._id, user?.id]);

  useEffect(() => {
    let cancelled = false;
    const cachedRows = scheduleCache.get(scheduleCacheKey);
    if (cachedRows) {
      setRows(cachedRows);
      setLoadError('');
      setLoading(false);
      return () => {
        cancelled = true;
      };
    }

    const fetchData = async () => {
      setLoading(true);
      setLoadError('');
      try {
        const params = activeRange
          ? { from: activeRange.start.toISOString(), to: activeRange.end.toISOString() }
          : {};
        let request = scheduleRequests.get(scheduleCacheKey);
        if (!request) {
          request = api.get(apiPath, { params });
          scheduleRequests.set(scheduleCacheKey, request);
        }
        const { data } = await request;
        const nextRows = data.rows || [];
        scheduleCache.set(scheduleCacheKey, nextRows);
        if (!cancelled) setRows(nextRows);
      } catch (err) {
        if (!cancelled) setLoadError(err.response?.data?.message || 'Could not load.');
      } finally {
        scheduleRequests.delete(scheduleCacheKey);
        if (!cancelled) setLoading(false);
      }
    };
    fetchData();
    return () => {
      cancelled = true;
    };
  }, [apiPath, activeRange, scheduleCacheKey]);

  const filteredRows = useMemo(() => {
    const emptyCounts = () => ({ upcoming: 0, late: 0, done: 0, done_late: 0, cancelled: 0 });

    return rows
      .filter((r) => r.assignee.toLowerCase().includes(search.toLowerCase()))
      .map((row) => {
        const entries = row.entries.filter((entry) => {
          if ((showFollowUpTypeFilter || showFamilySessionTypeFilter) && followUpTypeFilter !== 'all' && (entry.followUpType || 'normal') !== followUpTypeFilter) {
            return false;
          }
          if (!activeRange) return true;
          const entryDate = new Date(entry.dateTime);
          return entryDate >= activeRange.start && entryDate <= activeRange.end;
        });
        const counts = entries.reduce((acc, entry) => {
          acc[entry.displayStatus] += 1;
          return acc;
        }, emptyCounts());
        return { ...row, entries, counts };
      })
      .filter((row) => row.entries.length > 0);
  }, [rows, search, activeRange, showFollowUpTypeFilter, showFamilySessionTypeFilter, followUpTypeFilter]);

  const filteredTotals = useMemo(() => {
    const totals = { upcoming: 0, late: 0, done: 0, done_late: 0, cancelled: 0 };
    filteredRows.forEach((row) => {
      Object.keys(totals).forEach((key) => {
        totals[key] += row.counts[key];
      });
    });
    return totals;
  }, [filteredRows]);

  const openDrawer = (row, column) => {
    const matches = row.entries.filter((e) => e.displayStatus === column.key);
    if (matches.length === 0) return;
    setDrawerTitle(`${row.assignee} — ${column.label}`);
    setDrawerEntries(matches.sort((a, b) => new Date(a.dateTime) - new Date(b.dateTime)));
    setDrawerOpen(true);
  };

  const handleDateModeChange = (mode) => {
    setDateMode(mode);
    if (mode === 'today') setDateValue(toDateInputValue(new Date()));
    if (mode === 'tomorrow') setDateValue(toDateInputValue(addDays(new Date(), 1)));
  };

  const handleCalendarChange = (value) => {
    if (dateMode === 'week') {
      setWeekValue(value);
      return;
    }
    if (dateMode === 'month') {
      setMonthValue(value);
      return;
    }

    setDateValue(value);
    setDateMode(getDatePreset(value));
  };

  return (
    <div>
      <h1 className="font-display text-2xl font-bold text-charcoal">{title}</h1>
      <p className="mt-1 text-sm text-charcoal/60">{subtitle}</p>

      <Card className="mt-6" padded={false}>
        <div className="p-4 border-b border-cardline-soft space-y-3">
          <div className="flex flex-col lg:flex-row gap-3">
            <div className="relative flex-1">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-charcoal/40" />
              <input
                placeholder="Search by assignee"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full rounded-lg border border-cardline bg-offwhite-200 pl-9 pr-3.5 py-2.5 text-sm text-charcoal placeholder:text-charcoal/40 focus:border-sage focus:outline-none focus:ring-2 focus:ring-sage/20 transition"
              />
            </div>

            <div className="flex flex-col sm:flex-row gap-2">
              {(showFollowUpTypeFilter || showFamilySessionTypeFilter) && (
                <select
                  value={followUpTypeFilter}
                  onChange={(e) => setFollowUpTypeFilter(e.target.value)}
                  className="rounded-lg border border-cardline bg-offwhite-200 px-3.5 py-2.5 text-sm text-charcoal focus:border-sage focus:outline-none focus:ring-2 focus:ring-sage/20 transition sm:w-36"
                  aria-label="Filter follow-up type"
                >
                  <option value="all">All Types</option>
                  <option value="normal">{showFamilySessionTypeFilter ? 'Family Session' : 'Normal'}</option>
                  <option value="sfs">SFS</option>
                  {showFollowUpTypeFilter && <option value="tracker">Tracker</option>}
                </select>
              )}
              <select
                value={dateMode}
                onChange={(e) => handleDateModeChange(e.target.value)}
                className="rounded-lg border border-cardline bg-offwhite-200 px-3.5 py-2.5 text-sm text-charcoal focus:border-sage focus:outline-none focus:ring-2 focus:ring-sage/20 transition sm:w-36"
              >
                <option value="today">Today</option>
                <option value="tomorrow">Tomorrow</option>
                {dateMode === 'date' && <option value="date">Selected Date</option>}
                <option value="week">Week</option>
                <option value="month">Month</option>
                <option value="all">All</option>
              </select>

              <div className="relative sm:w-44">
                <CalendarDays size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-charcoal/40" />
                <input
                  type={dateMode === 'week' ? 'week' : dateMode === 'month' ? 'month' : 'date'}
                  value={dateMode === 'all' ? dateValue : activeDateValue}
                  onChange={(e) => handleCalendarChange(e.target.value)}
                  disabled={dateMode === 'all'}
                  className="w-full rounded-lg border border-cardline bg-offwhite-200 pl-9 pr-3.5 py-2.5 text-sm text-charcoal focus:border-sage focus:outline-none focus:ring-2 focus:ring-sage/20 transition disabled:opacity-50"
                />
              </div>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="p-10 text-center text-sm text-charcoal/55">Loading…</div>
        ) : loadError ? (
          <div className="p-10 flex flex-col items-center text-center gap-2">
            <AlertTriangle size={22} className="text-[#8C3B2E]" />
            <p className="text-sm text-charcoal font-medium">{loadError}</p>
          </div>
        ) : filteredRows.length === 0 ? (
          <div className="p-10 flex flex-col items-center text-center gap-2">
            <Inbox size={22} className="text-charcoal/35" />
            <p className="text-sm text-charcoal font-medium">Nothing scheduled yet</p>
            <p className="text-xs text-charcoal/55">
              Entries scheduled from a patient's details page will show up here, grouped by assignee.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-charcoal/55 border-b border-cardline-soft">
                  <th className="px-5 py-3 font-semibold">Assignee</th>
                  {countColumns.map((c) => (
                    <th key={c.key} className="px-5 py-3 font-semibold">
                      {c.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((row) => (
                  <tr key={row.assignee} className="border-b border-cardline-soft last:border-0 hover:bg-offwhite-300/25">
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-2.5">
                        <div className="h-8 w-8 shrink-0 rounded-full bg-sage-muted/25 flex items-center justify-center text-xs font-bold text-sage">
                          {getInitials(row.assignee)}
                        </div>
                        <span className="font-medium text-charcoal">{row.assignee}</span>
                      </div>
                    </td>
                    {countColumns.map((c) => {
                      const count = row.counts[c.key];
                      return (
                        <td key={c.key} className="px-5 py-3.5">
                          {count > 0 ? (
                            <button
                              type="button"
                              onClick={() => openDrawer(row, c)}
                              className={`font-semibold hover:underline ${c.className}`}
                            >
                              {count}
                            </button>
                          ) : (
                            <span className={`font-semibold ${c.className}`}>{count}</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-cardline-soft">
                  <td className="px-5 py-3.5 font-display font-bold text-charcoal">Total</td>
                  {countColumns.map((c) => (
                    <td key={c.key} className={`px-5 py-3.5 font-display font-bold ${c.className}`}>
                      {filteredTotals[c.key]}
                    </td>
                  ))}
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </Card>

      <Drawer open={drawerOpen} onClose={() => setDrawerOpen(false)} title={drawerTitle}>
        <ul className="space-y-3">
          {drawerEntries.map((e) => (
            <li
              key={e.id}
              onClick={() => navigate(`/admin/patients/${e.patientId}`)}
              className="rounded-lg border border-cardline bg-offwhite-200 p-3.5 cursor-pointer hover:bg-offwhite-200/70"
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-bold text-charcoal">{e.patientName}</p>
                <Badge tone={DISPLAY_STATUS_BADGE_TONE[e.displayStatus]}>{e.displayStatusLabel}</Badge>
              </div>
              <p className="mt-1 text-xs text-charcoal/60">
                {e.stageLabel} · {formatDateTime(e.dateTime)}
              </p>
              {(showFollowUpTypeFilter || showFamilySessionTypeFilter) && (
                <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-charcoal/45">
                  {showFamilySessionTypeFilter
                    ? (e.followUpType === 'sfs' ? 'Short Follow-up' : 'Family Session')
                    : (e.followUpType || 'normal') === 'sfs' ? 'SFS' : (e.followUpType || 'normal') === 'tracker' ? 'Tracker' : 'Normal'}
                </p>
              )}
              {e.trackerSubmissionUrl && (
                <a
                  href={e.trackerSubmissionUrl}
                  target="_blank"
                  rel="noreferrer"
                  onClick={(event) => event.stopPropagation()}
                  className="mt-1 inline-flex text-xs font-semibold text-sage hover:text-charcoal"
                >
                  Tracker Link
                </a>
              )}
              {e.notes && <p className="mt-1 text-xs text-charcoal/55">{e.notes}</p>}
              {e.status === 'cancelled' && e.cancelReason && (
                <div className="mt-2 pt-2 border-t border-cardline-soft">
                  <p className="text-xs font-semibold text-[#8C3B2E]">
                    Cancelled{e.cancelledAt ? ` · ${formatDateTime(e.cancelledAt)}` : ''}
                    {e.cancelledByName ? ` by ${e.cancelledByName}` : ''}
                  </p>
                  <p className="mt-0.5 text-xs text-charcoal/60">Reason: {e.cancelReason}</p>
                </div>
              )}
            </li>
          ))}
        </ul>
      </Drawer>
    </div>
  );
};

export default ScheduleListPage;
