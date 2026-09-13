import { useEffect, useState } from 'react';
import { useNavigate, useParams, Navigate } from 'react-router-dom';
import { Search, ChevronLeft, ChevronRight, Inbox, AlertTriangle, Users } from 'lucide-react';
import api from '../../api/axios.js';
import Card from '../../components/ui/Card.jsx';
import Button from '../../components/ui/Button.jsx';
import Badge from '../../components/ui/Badge.jsx';
import { CATEGORY_LABELS, PATIENT_CATEGORIES } from '../../constants/patientCategories.js';
import { STAGES, STAGE_LABELS } from '../../constants/treatmentStages.js';

const PAGE_SIZE = 10;

const categoryTone = (category) => (category === PATIENT_CATEGORIES.AUTISM_ADHD ? 'teal' : 'amber');

const formatDate = (iso) =>
  new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

const PatientsByStage = () => {
  const navigate = useNavigate();
  const { stage: stageParam } = useParams();
  const stage = Number(stageParam);

  const [patients, setPatients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 400);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [stage]);

  useEffect(() => {
    if (!STAGES.includes(stage)) return;
    const fetchPatients = async () => {
      setLoading(true);
      setLoadError('');
      try {
        const { data } = await api.get('/patients', {
          params: { page, limit: PAGE_SIZE, search: debouncedSearch || undefined, stage },
        });
        setPatients(data.patients);
        setPages(data.pages);
        setTotal(data.total);
      } catch (err) {
        setLoadError(err.response?.data?.message || 'Could not load patients.');
      } finally {
        setLoading(false);
      }
    };
    fetchPatients();
  }, [page, debouncedSearch, stage]);

  // Invalid or missing phase in the URL sends back to Phase 1.
  if (!STAGES.includes(stage)) {
    return <Navigate to="/admin/stages/1" replace />;
  }

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-charcoal">Patients by Phase</h1>
          <p className="mt-1 text-sm text-charcoal/60">
            Pick a phase from the sidebar to see who's on it.
          </p>
        </div>
        <Badge tone="teal">{STAGE_LABELS[stage]}</Badge>
      </div>

      <Card className="mt-6" padded={false}>
        <div className="p-4 border-b border-cardline-soft">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-charcoal/40" />
            <input
              placeholder="Search by patient name, father or mother number"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-lg border border-cardline bg-offwhite-200 pl-9 pr-3.5 py-2.5 text-sm text-charcoal placeholder:text-charcoal/40 focus:border-sage focus:outline-none focus:ring-2 focus:ring-sage/20 transition"
            />
          </div>
        </div>

        {loading ? (
          <div className="p-10 text-center text-sm text-charcoal/55">Loading patients…</div>
        ) : loadError ? (
          <div className="p-10 flex flex-col items-center text-center gap-2">
            <AlertTriangle size={22} className="text-[#8C3B2E]" />
            <p className="text-sm text-charcoal font-medium">{loadError}</p>
            <Button variant="outline" size="sm" onClick={() => setPage((p) => p)} className="mt-1">
              Try again
            </Button>
          </div>
        ) : patients.length === 0 ? (
          <div className="p-10 flex flex-col items-center text-center gap-2">
            <Inbox size={22} className="text-charcoal/35" />
            <p className="text-sm text-charcoal font-medium">No patients on {STAGE_LABELS[stage]}</p>
            <p className="text-xs text-charcoal/55">Try a different phase from the sidebar, or a different search.</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-charcoal/55 border-b border-cardline-soft">
                    <th className="px-5 py-3 font-semibold">Patient Name</th>
                    <th className="px-5 py-3 font-semibold">Category</th>
                    <th className="px-5 py-3 font-semibold">Age</th>
                    <th className="px-5 py-3 font-semibold">Father's Number</th>
                    <th className="px-5 py-3 font-semibold">Phase</th>
                    <th className="px-5 py-3 font-semibold">Received</th>
                  </tr>
                </thead>
                <tbody>
                  {patients.map((p) => (
                    <tr
                      key={p.id}
                      onClick={() => navigate(`/admin/patients/${p.id}`)}
                      className="border-b border-cardline-soft last:border-0 hover:bg-offwhite-300/25 cursor-pointer"
                    >
                      <td className="px-5 py-3.5 font-medium text-charcoal">{p.patientName}</td>
                      <td className="px-5 py-3.5">
                        <Badge tone={categoryTone(p.category)}>{CATEGORY_LABELS[p.category]}</Badge>
                      </td>
                      <td className="px-5 py-3.5 text-charcoal/70">{p.age}</td>
                      <td className="px-5 py-3.5 text-charcoal/70">{p.number}</td>
                      <td className="px-5 py-3.5">
                        <Badge tone="teal">{p.currentStageLabel}</Badge>
                      </td>
                      <td className="px-5 py-3.5 text-charcoal/55">{formatDate(p.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between px-5 py-3.5 border-t border-cardline-soft">
              <span className="text-xs text-charcoal/55 flex items-center gap-1.5">
                <Users size={13} /> Page {page} of {pages} · {total} on {STAGE_LABELS[stage]}
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

export default PatientsByStage;
