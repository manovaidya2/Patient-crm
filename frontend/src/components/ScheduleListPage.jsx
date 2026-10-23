import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarDays, Search, Inbox, AlertTriangle } from 'lucide-react';
import useApiQuery from '../api/useApiQuery.js';
import Card from './ui/Card.jsx';
import Drawer from './ui/Drawer.jsx';
import Badge from './ui/Badge.jsx';
import { DISPLAY_STATUS_BADGE_TONE } from '../constants/scheduleStatuses.js';
import { PageHeader, StatRow, StatTile } from './ui/Layout.jsx';

const SERVER_BASE = (import.meta.env.VITE_API_URL || 'http://localhost:5000/api').replace(/\/api\/?$/, '');

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
// Calendar view of the same entries: colors by status, one chip per entry; a click opens the entry drawer.
const CHIP = {
  late: 'border-l-[3px] border-[#DC2626] bg-[#FDE2E1] text-[#7F1D1D]',
  upcoming: 'border-l-[3px] border-sage bg-[#E9EFE9] text-[#2F4A3A]',
  done: 'border-l-[3px] border-[#2F8F5B] bg-[#E6F2EA] text-[#1F6B41]',
  done_late: 'border-l-[3px] border-[#B45309] bg-[#FBF0DC] text-[#7C5B2E]',
  cancelled: 'border-l-[3px] border-[#C5C0B4] bg-[#F3EEE2] text-charcoal/45 line-through',
};
const FAMILY_CHIP = 'border-l-[3px] border-[#7C5CBF] bg-[#EFE9FA] text-[#4C2F8F]';
const sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
const timeOf = (value) => new Date(value).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
const dayKey = (d) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

const ScheduleCalendar = ({ entries, range, mode, family, onOpen }) => {
  const today = new Date();
  const byDay = new Map();
  entries.forEach((e) => { const k = dayKey(new Date(e.dateTime)); if (!byDay.has(k)) byDay.set(k, []); byDay.get(k).push(e); });
  byDay.forEach((list) => list.sort((a, b) => new Date(a.dateTime) - new Date(b.dateTime)));
  const chipClass = (e) => (family && e.displayStatus === 'upcoming' ? FAMILY_CHIP : CHIP[e.displayStatus] || CHIP.upcoming);
  const chip = (e) => (
    <button key={e.id} type="button" onClick={() => onOpen([e], `${e.patientName} · ${formatDateTime(e.dateTime)}`)} className={`block w-full truncate rounded-md px-1.5 py-1 text-left text-[11px] leading-tight ${chipClass(e)}`} title={`${e.patientName} · ${e.displayStatusLabel || e.displayStatus}`}>
      <b className="mr-1">{timeOf(e.dateTime)}</b>{e.patientName}
    </button>
  );

  // Day agenda for today / tomorrow / a date / all.
  if (!range || !['week', 'month'].includes(mode)) {
    const days = [...byDay.entries()].sort((a, b) => new Date(a[1][0].dateTime) - new Date(b[1][0].dateTime));
    if (!days.length) return null;
    return (
      <div className="divide-y divide-cardline-soft">
        {days.map(([k, list]) => (
          <div key={k} className="grid gap-3 p-4 sm:grid-cols-[120px_minmax(0,1fr)]">
            <p className="font-display text-sm font-bold text-charcoal">{new Date(list[0].dateTime).toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short' })}{sameDay(new Date(list[0].dateTime), today) && <span className="ml-2 rounded-full bg-[#F97316] px-2 py-0.5 text-[10px] text-white">Today</span>}</p>
            <ul className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}>
              {list.map((e) => (
                <li key={e.id}><button type="button" onClick={() => onOpen([e], `${e.patientName} · ${formatDateTime(e.dateTime)}`)} className={`w-full rounded-lg px-3 py-2 text-left ${chipClass(e)}`}>
                  <span className="block text-[12px] font-bold">{timeOf(e.dateTime)} · {e.patientName}</span>
                  <span className="block truncate text-[11px] opacity-80">{e.stageLabel}{e.assignee ? ` · ${e.assignee}` : ''}{e.displayStatusLabel ? ` · ${e.displayStatusLabel}` : ''}</span>
                </button></li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    );
  }

  // Week = 7 columns; month = Monday-first weeks covering the month.
  const start = new Date(range.start);
  const first = new Date(start);
  if (mode === 'month') first.setDate(first.getDate() - ((first.getDay() + 6) % 7));
  const count = mode === 'week' ? 7 : Math.ceil((((start.getDay() + 6) % 7) + new Date(start.getFullYear(), start.getMonth() + 1, 0).getDate()) / 7) * 7;
  const days = Array.from({ length: count }, (_, i) => { const d = new Date(first); d.setDate(first.getDate() + i); return d; });
  const limit = mode === 'week' ? 12 : 3;
  return (
    <div className="overflow-x-auto">
      <div className="grid min-w-[820px] grid-cols-7">
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => <div key={d} className="border-b border-cardline-soft px-2 py-2 text-[11px] font-bold uppercase text-charcoal/55">{d}</div>)}
        {days.map((d) => {
          const list = byDay.get(dayKey(d)) || [];
          const outside = mode === 'month' && d.getMonth() !== start.getMonth();
          const isToday = sameDay(d, today);
          return (
            <div key={d.toISOString()} className={`flex flex-col gap-1 border-b border-l border-cardline-soft p-1.5 ${mode === 'week' ? 'min-h-[260px]' : 'min-h-[108px]'} ${isToday ? 'bg-[#FFFBF5]' : outside ? 'bg-[#FBF7ED]' : ''}`}>
              <span className={`mb-0.5 inline-flex h-6 w-6 items-center justify-center rounded-full text-[12px] font-bold ${isToday ? 'bg-charcoal text-white' : outside ? 'text-charcoal/30' : 'text-charcoal'}`}>{d.getDate()}</span>
              {list.slice(0, limit).map(chip)}
              {list.length > limit && <button type="button" onClick={() => onOpen(list, d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }))} className="px-1 text-left text-[10.5px] font-bold text-charcoal/60 hover:underline">+{list.length - limit} more</button>}
            </div>
          );
        })}
      </div>
    </div>
  );
};

const ScheduleListPage = ({ title, subtitle, apiPath, showFollowUpTypeFilter = false, showFamilySessionTypeFilter = false }) => {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [followUpTypeFilter, setFollowUpTypeFilter] = useState('all');
  // Calendar is the default view; "By assignee" keeps the original table.
  const [view, setView] = useState('calendar');
  const [dateMode, setDateMode] = useState('week');
  const [dateValue, setDateValue] = useState(() => toDateInputValue(new Date()));
  const [weekValue, setWeekValue] = useState(() => toWeekInputValue(new Date()));
  const [monthValue, setMonthValue] = useState(() => toMonthInputValue(new Date()));

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerTitle, setDrawerTitle] = useState('');
  const [drawerEntries, setDrawerEntries] = useState([]);

  const activeDateValue =
    dateMode === 'week' ? weekValue : dateMode === 'month' ? monthValue : dateValue;
  const activeRange = useMemo(() => getDateRange(dateMode, activeDateValue), [dateMode, activeDateValue]);
  const { data, loading, error } = useApiQuery(apiPath, {
    params: activeRange ? { from: activeRange.start.toISOString(), to: activeRange.end.toISOString() } : {},
  });
  const rows = data?.rows || [];
  const loadError = error && !data ? error.response?.data?.message || 'Could not load.' : '';

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

  const calendarEntries = useMemo(() => filteredRows.flatMap((row) => row.entries.map((entry) => ({ ...entry, assignee: row.assignee }))), [filteredRows]);
  const openEntries = (entries, heading) => {
    if (!entries.length) return;
    setDrawerTitle(heading);
    setDrawerEntries(entries);
    setDrawerOpen(true);
  };

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
    <div className="space-y-4">
      <PageHeader
        icon={CalendarDays}
        title={title}
        subtitle={subtitle}
        actions={
          <div className="inline-flex overflow-hidden rounded-[10px] border border-cardline bg-white" role="group" aria-label="View">
            {[['calendar', 'Calendar'], ['assignee', 'By assignee']].map(([key, label]) => (
              <button key={key} type="button" aria-pressed={view === key} onClick={() => setView(key)} className={`px-3.5 py-2 text-xs font-bold ${view === key ? 'bg-charcoal text-white' : 'text-charcoal/70 hover:bg-[#FBF7ED]'}`}>{label}</button>
            ))}
          </div>
        }
      />

      <StatRow min={130}>
        <StatTile label="Late" value={filteredTotals.late} tone={filteredTotals.late ? 'red' : 'plain'} />
        <StatTile label="Upcoming" value={filteredTotals.upcoming} tone={filteredTotals.upcoming ? 'orange' : 'plain'} />
        <StatTile label="Done" value={filteredTotals.done} tone="green" />
        <StatTile label="Done late" value={filteredTotals.done_late} />
        <StatTile label="Cancelled" value={filteredTotals.cancelled} />
      </StatRow>

      <Card padded={false}>
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
                  {showFollowUpTypeFilter && <option value="video">Video Upload</option>}
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
        ) : view === 'calendar' ? (
          <ScheduleCalendar entries={calendarEntries} range={activeRange} mode={dateMode} family={showFamilySessionTypeFilter} onOpen={openEntries} />
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
                    : (e.followUpType || 'normal') === 'sfs' ? 'SFS' : (e.followUpType || 'normal') === 'tracker' ? 'Tracker' : (e.followUpType || 'normal') === 'video' ? 'Video Upload' : 'Normal'}
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
              {e.videoUrl && (
                <a
                  href={`${SERVER_BASE}${e.videoUrl}`}
                  target="_blank"
                  rel="noreferrer"
                  onClick={(event) => event.stopPropagation()}
                  className="ml-3 mt-1 inline-flex text-xs font-semibold text-sage hover:text-charcoal"
                >
                  View Video
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
