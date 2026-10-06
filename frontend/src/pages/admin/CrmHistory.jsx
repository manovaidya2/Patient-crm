import { useEffect, useMemo, useState } from 'react';
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock3,
  FilterX,
  History,
  Search,
} from 'lucide-react';
import api from '../../api/axios.js';
import { ROLE_LABELS } from '../../constants/roles.js';

const indiaDateValue = () => {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date());
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
};

const initialFilters = () => ({
  q: '', from: indiaDateValue(), to: indiaDateValue(), actor: '', module: '', action: '', role: '',
});

const formatDate = (value) => new Intl.DateTimeFormat('en-IN', {
  timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric',
}).format(new Date(value));

const formatTime = (value) => new Intl.DateTimeFormat('en-IN', {
  timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true,
}).format(new Date(value));

const actionTone = (action) => {
  if (/delete|cancel|reject/i.test(action)) return 'bg-red-50 text-red-800 border-red-200';
  if (/approve|verify|close|settle/i.test(action)) return 'bg-emerald-50 text-emerald-800 border-emerald-200';
  if (/create|upload/i.test(action)) return 'bg-blue-50 text-blue-800 border-blue-200';
  return 'bg-amber-50 text-amber-800 border-amber-200';
};

export default function CrmHistory() {
  const [filters, setFilters] = useState(initialFilters);
  const [options, setOptions] = useState({ people: [], modules: [], actions: [], roles: [] });
  const [result, setResult] = useState({ logs: [], total: 0, page: 1, pages: 1, counts: {} });
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/crm-history/filters')
      .then(({ data }) => setOptions(data))
      .catch(() => setOptions({ people: [], modules: [], actions: [], roles: [] }));
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setError('');
      try {
        const params = Object.fromEntries(Object.entries({ ...filters, page, limit: 50 }).filter(([, value]) => value !== ''));
        const { data } = await api.get('/crm-history', { params, signal: controller.signal });
        setResult(data);
      } catch (requestError) {
        if (requestError.code !== 'ERR_CANCELED') {
          setError(requestError.response?.data?.message || 'Activity history could not be loaded.');
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, filters.q ? 300 : 0);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [filters, page]);

  const updateFilter = (key, value) => {
    setFilters((current) => ({ ...current, [key]: value }));
    setPage(1);
  };

  const rows = useMemo(() => {
    let previousDate = '';
    return result.logs.map((log) => {
      const date = formatDate(log.occurredAt);
      const startsDay = date !== previousDate;
      previousDate = date;
      return { ...log, date, startsDay };
    });
  }, [result.logs]);

  const resetFilters = () => {
    setFilters(initialFilters());
    setPage(1);
  };

  return (
    <div className="space-y-5 pb-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="mb-1 flex items-center gap-2 text-teal-700">
            <History size={19} />
            <span className="text-xs font-bold uppercase tracking-[0.12em]">Admin audit</span>
          </div>
          <h1 className="font-display text-3xl font-bold text-charcoal">History &amp; Timeline</h1>
          <p className="mt-1 text-sm text-charcoal/60">CRM activity records by date, person and department.</p>
        </div>
        <div className="flex items-center gap-2 rounded-md border border-sand-300 bg-white px-3 py-2 text-sm text-charcoal/65">
          <Clock3 size={16} className="text-teal-700" />
          India time
        </div>
      </header>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          ['Total actions', result.total, 'border-teal-600'],
          ['Created', result.counts?.Created || 0, 'border-blue-500'],
          ['Updated', result.counts?.Updated || 0, 'border-amber-500'],
          ['Deleted', result.counts?.Deleted || 0, 'border-red-500'],
        ].map(([label, value, tone]) => (
          <div key={label} className={`border-l-4 ${tone} rounded-md border-y border-r border-sand-300 bg-white px-4 py-3`}>
            <p className="text-xs font-bold uppercase text-charcoal/50">{label}</p>
            <p className="mt-1 text-2xl font-bold text-charcoal">{value}</p>
          </div>
        ))}
      </section>

      <section className="border-y border-sand-300 bg-white py-4">
        <div className="grid gap-3 px-1 md:grid-cols-2 xl:grid-cols-4">
          <label className="xl:col-span-2">
            <span className="mb-1 block text-xs font-bold uppercase text-charcoal/55">Search</span>
            <span className="relative block">
              <Search size={17} className="absolute left-3 top-1/2 -translate-y-1/2 text-charcoal/40" />
              <input value={filters.q} onChange={(event) => updateFilter('q', event.target.value)} placeholder="Person, action or module" className="h-11 w-full rounded-md border border-sand-300 bg-cream/40 pl-10 pr-3 text-sm outline-none focus:border-teal-600" />
            </span>
          </label>
          <label>
            <span className="mb-1 block text-xs font-bold uppercase text-charcoal/55">From date</span>
            <input type="date" value={filters.from} onChange={(event) => updateFilter('from', event.target.value)} className="h-11 w-full rounded-md border border-sand-300 bg-cream/40 px-3 text-sm outline-none focus:border-teal-600" />
          </label>
          <label>
            <span className="mb-1 block text-xs font-bold uppercase text-charcoal/55">To date</span>
            <input type="date" value={filters.to} onChange={(event) => updateFilter('to', event.target.value)} className="h-11 w-full rounded-md border border-sand-300 bg-cream/40 px-3 text-sm outline-none focus:border-teal-600" />
          </label>
          <label>
            <span className="mb-1 block text-xs font-bold uppercase text-charcoal/55">Person</span>
            <select value={filters.actor} onChange={(event) => updateFilter('actor', event.target.value)} className="h-11 w-full rounded-md border border-sand-300 bg-cream/40 px-3 text-sm outline-none focus:border-teal-600">
              <option value="">All people</option>
              {options.people.map((person) => <option key={person.id} value={person.id}>{person.name} ({ROLE_LABELS[person.role] || person.role})</option>)}
            </select>
          </label>
          <label>
            <span className="mb-1 block text-xs font-bold uppercase text-charcoal/55">Department / module</span>
            <select value={filters.module} onChange={(event) => updateFilter('module', event.target.value)} className="h-11 w-full rounded-md border border-sand-300 bg-cream/40 px-3 text-sm outline-none focus:border-teal-600">
              <option value="">All modules</option>
              {options.modules.map((module) => <option key={module} value={module}>{module}</option>)}
            </select>
          </label>
          <label>
            <span className="mb-1 block text-xs font-bold uppercase text-charcoal/55">Action</span>
            <select value={filters.action} onChange={(event) => updateFilter('action', event.target.value)} className="h-11 w-full rounded-md border border-sand-300 bg-cream/40 px-3 text-sm outline-none focus:border-teal-600">
              <option value="">All actions</option>
              {options.actions.map((action) => <option key={action} value={action}>{action}</option>)}
            </select>
          </label>
          <div className="flex items-end gap-2">
            <label className="min-w-0 flex-1">
              <span className="mb-1 block text-xs font-bold uppercase text-charcoal/55">Role</span>
              <select value={filters.role} onChange={(event) => updateFilter('role', event.target.value)} className="h-11 w-full rounded-md border border-sand-300 bg-cream/40 px-3 text-sm outline-none focus:border-teal-600">
                <option value="">All roles</option>
                {options.roles.map((role) => <option key={role} value={role}>{ROLE_LABELS[role] || role}</option>)}
              </select>
            </label>
            <button type="button" onClick={resetFilters} title="Reset filters" aria-label="Reset filters" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-sand-300 text-charcoal/60 hover:border-teal-600 hover:text-teal-700">
              <FilterX size={18} />
            </button>
          </div>
        </div>
      </section>

      {error && <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>}

      <section className="overflow-hidden rounded-md border border-sand-300 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1050px] text-left text-sm">
            <thead className="bg-teal-900 text-white">
              <tr>
                <th className="w-32 px-4 py-3 font-semibold">Time</th>
                <th className="w-52 px-4 py-3 font-semibold">Person</th>
                <th className="w-44 px-4 py-3 font-semibold">Module</th>
                <th className="w-40 px-4 py-3 font-semibold">Action</th>
                <th className="px-4 py-3 font-semibold">Activity details</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((log) => (
                <tr key={log.id} className="border-t border-sand-200 align-top hover:bg-cream/40">
                  <td className="px-4 py-4 tabular-nums text-charcoal/70">
                    {log.startsDay && <div className="mb-1 flex items-center gap-1.5 whitespace-nowrap font-semibold text-teal-800"><CalendarDays size={14} />{log.date}</div>}
                    <span className="whitespace-nowrap">{formatTime(log.occurredAt)}</span>
                  </td>
                  <td className="px-4 py-4">
                    <p className="font-semibold text-charcoal">{log.actorName}</p>
                    <p className="mt-0.5 text-xs text-charcoal/55">{ROLE_LABELS[log.actorRole] || log.actorRole}</p>
                  </td>
                  <td className="px-4 py-4 font-medium text-charcoal">{log.module}</td>
                  <td className="px-4 py-4"><span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-bold ${actionTone(log.action)}`}>{log.action}</span></td>
                  <td className="px-4 py-4">
                    <p className="text-charcoal/85">{log.summary}</p>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!loading && !rows.length && !error && <div className="px-4 py-14 text-center text-sm text-charcoal/55">No activity found for these filters.</div>}
        {loading && <div className="px-4 py-14 text-center text-sm text-charcoal/55">Loading activity...</div>}
      </section>

      <footer className="flex flex-wrap items-center justify-between gap-3 text-sm text-charcoal/60">
        <span>{result.total} action{result.total === 1 ? '' : 's'} found</span>
        <div className="flex items-center gap-2">
          <button type="button" disabled={page <= 1 || loading} onClick={() => setPage((value) => Math.max(1, value - 1))} aria-label="Previous page" className="flex h-9 w-9 items-center justify-center rounded-md border border-sand-300 disabled:opacity-40"><ChevronLeft size={17} /></button>
          <span className="min-w-24 text-center font-medium text-charcoal">Page {result.page} of {result.pages}</span>
          <button type="button" disabled={page >= result.pages || loading} onClick={() => setPage((value) => value + 1)} aria-label="Next page" className="flex h-9 w-9 items-center justify-center rounded-md border border-sand-300 disabled:opacity-40"><ChevronRight size={17} /></button>
        </div>
      </footer>
    </div>
  );
}
