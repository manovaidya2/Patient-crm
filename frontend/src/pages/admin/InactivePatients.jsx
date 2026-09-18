import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, ChevronLeft, ChevronRight, Inbox, AlertTriangle, RotateCcw, UserX } from 'lucide-react';
import api from '../../api/axios.js';
import Card from '../../components/ui/Card.jsx';
import Button from '../../components/ui/Button.jsx';
import Badge from '../../components/ui/Badge.jsx';
import { PATIENT_CATEGORIES } from '../../constants/patientCategories.js';

const PAGE_SIZE = 10;

const categoryTone = (category) => (category === PATIENT_CATEGORIES.AUTISM_ADHD ? 'teal' : 'amber');

const formatDate = (iso) =>
  iso ? new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '-';

// Closed cases — dropped off the main patient list and out of reminders, but nothing is
// deleted. Admin/Doctor/Post Counselor can bring one back to the active list any time.
const InactivePatients = () => {
  const navigate = useNavigate();
  const [patients, setPatients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [reactivatingId, setReactivatingId] = useState(null);
  const [rowError, setRowError] = useState({});

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch((prev) => {
        if (prev !== search) setPage(1);
        return search;
      });
    }, 400);
    return () => clearTimeout(timer);
  }, [search]);

  const fetchPatients = async () => {
    setLoading(true);
    setLoadError('');
    try {
      const { data } = await api.get('/patients', {
        params: { status: 'inactive', page, limit: PAGE_SIZE, search: debouncedSearch || undefined },
      });
      setPatients(data.patients);
      setPages(data.pages);
      setTotal(data.total);
    } catch (err) {
      setLoadError(err.response?.data?.message || 'Could not load inactive patients.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPatients();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, debouncedSearch]);

  const handleReactivate = async (event, patientId) => {
    event.stopPropagation();
    setReactivatingId(patientId);
    setRowError((prev) => ({ ...prev, [patientId]: '' }));
    try {
      await api.patch(`/patients/${patientId}/status`, { isActive: true });
      setPatients((prev) => prev.filter((p) => p.id !== patientId));
      setTotal((prev) => Math.max(prev - 1, 0));
    } catch (err) {
      setRowError((prev) => ({ ...prev, [patientId]: err.response?.data?.message || 'Could not reactivate' }));
    } finally {
      setReactivatingId(null);
    }
  };

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-charcoal">Inactive Patients</h1>
          <p className="mt-1 text-sm text-charcoal/60">
            Closed cases (medicine stopped) - {total} total. Reactivate to bring one back to the active list.
          </p>
        </div>
      </div>

      <Card className="mt-6" padded={false}>
        <div className="p-4 border-b border-cardline-soft">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-charcoal/40" />
            <input
              placeholder="Search by patient ID, name, father or mother number"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full max-w-md rounded-lg border border-cardline bg-offwhite-200 pl-9 pr-3.5 py-2.5 text-sm text-charcoal placeholder:text-charcoal/40 focus:border-sage focus:outline-none focus:ring-2 focus:ring-sage/20 transition"
            />
          </div>
        </div>

        {loading ? (
          <div className="p-10 text-center text-sm text-charcoal/55">Loading…</div>
        ) : loadError ? (
          <div className="flex flex-col items-center gap-2 p-10 text-center">
            <AlertTriangle size={22} className="text-[#8C3B2E]" />
            <p className="text-sm font-medium text-charcoal">{loadError}</p>
          </div>
        ) : patients.length === 0 ? (
          <div className="flex flex-col items-center gap-2 p-10 text-center">
            <UserX size={22} className="text-charcoal/35" />
            <p className="text-sm font-medium text-charcoal">No inactive patients</p>
            <p className="text-xs text-charcoal/55">Closed patients will show up here.</p>
          </div>
        ) : (
          <>
            <ul className="divide-y divide-cardline-soft">
              {patients.map((p) => (
                <li
                  key={p.id}
                  onClick={() => navigate(`/admin/patients/${p.id}`)}
                  className="flex cursor-pointer flex-col gap-3 p-4 hover:bg-offwhite-300/25 sm:flex-row sm:items-center sm:justify-between sm:p-5"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs font-bold tracking-widest text-charcoal/45">{p.patientCode}</span>
                      <Badge tone={categoryTone(p.category)}>{p.categoryLabel}</Badge>
                    </div>
                    <p className="mt-1.5 text-base font-bold text-charcoal">{p.patientName}</p>
                    <p className="mt-1 text-xs text-charcoal/55">
                      Closed {formatDate(p.inactivatedAt)}{p.inactivatedByName ? ` by ${p.inactivatedByName}` : ''}
                      {p.inactiveReason ? ` · ${p.inactiveReason}` : ''}
                    </p>
                    {rowError[p.id] && <p className="mt-1 text-xs font-semibold text-[#8C3B2E]">{rowError[p.id]}</p>}
                  </div>
                  {p.canToggleActive && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={(event) => handleReactivate(event, p.id)}
                      disabled={reactivatingId === p.id}
                      className="shrink-0 self-start sm:self-auto"
                    >
                      <RotateCcw size={14} /> {reactivatingId === p.id ? 'Reactivating...' : 'Reactivate'}
                    </Button>
                  )}
                </li>
              ))}
            </ul>

            <div className="flex items-center justify-between border-t border-cardline-soft px-5 py-3.5">
              <span className="flex items-center gap-1.5 text-xs text-charcoal/55">
                <Inbox size={13} /> Page {page} of {pages}
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setPage((p) => Math.max(p - 1, 1))}
                  disabled={page <= 1}
                  aria-label="Previous page"
                  className="p-1.5 rounded-md text-sage hover:bg-sage-muted/25 disabled:opacity-30 disabled:pointer-events-none"
                >
                  <ChevronLeft size={16} />
                </button>
                <button
                  onClick={() => setPage((p) => Math.min(p + 1, pages))}
                  disabled={page >= pages}
                  aria-label="Next page"
                  className="p-1.5 rounded-md text-sage hover:bg-sage-muted/25 disabled:opacity-30 disabled:pointer-events-none"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          </>
        )}
      </Card>
    </div>
  );
};

export default InactivePatients;
