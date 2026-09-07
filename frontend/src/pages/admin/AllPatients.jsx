import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, ChevronLeft, ChevronRight, Inbox, AlertTriangle, Users, Plus } from 'lucide-react';
import api from '../../api/axios.js';
import Card from '../../components/ui/Card.jsx';
import Button from '../../components/ui/Button.jsx';
import Badge from '../../components/ui/Badge.jsx';
import Input from '../../components/ui/Input.jsx';
import Modal from '../../components/ui/Modal.jsx';
import { ALL_PATIENT_CATEGORIES, CATEGORY_LABELS, PATIENT_CATEGORIES } from '../../constants/patientCategories.js';

const PAGE_SIZE = 10;

const emptyPatientForm = {
  patientCode: '',
  patientName: '',
  category: PATIENT_CATEGORIES.AUTISM_ADHD,
  age: '',
  number: '',
  guardianName: '',
  alternateNumber: '',
  relativeName: '',
  currentStage: 1,
};

const categoryTone = (category) => (category === PATIENT_CATEGORIES.AUTISM_ADHD ? 'teal' : 'amber');

const formatDate = (iso) =>
  new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

const AllPatients = () => {
  const navigate = useNavigate();
  const [patients, setPatients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState(emptyPatientForm);
  const [addSaving, setAddSaving] = useState(false);
  const [addError, setAddError] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 400);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [categoryFilter]);

  useEffect(() => {
    const fetchPatients = async () => {
      setLoading(true);
      setLoadError('');
      try {
        const { data } = await api.get('/patients', {
          params: {
            page,
            limit: PAGE_SIZE,
            search: debouncedSearch || undefined,
            category: categoryFilter || undefined,
          },
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
  }, [page, debouncedSearch, categoryFilter]);

  const updateAddForm = (field, value) => {
    setAddForm((current) => ({ ...current, [field]: value }));
  };

  const openAddModal = () => {
    setAddForm(emptyPatientForm);
    setAddError('');
    setAddOpen(true);
  };

  const handleAddPatient = async (e) => {
    e.preventDefault();
    setAddSaving(true);
    setAddError('');
    try {
      const { data } = await api.post('/patients', {
        ...addForm,
        age: Number(addForm.age),
        currentStage: Number(addForm.currentStage),
      });
      setAddOpen(false);
      navigate(`/admin/patients/${data.patient.id}`);
    } catch (err) {
      setAddError(err.response?.data?.message || 'Could not add patient.');
    } finally {
      setAddSaving(false);
    }
  };

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-charcoal">All Patients</h1>
          <p className="mt-1 text-sm text-charcoal/60">
            Patients - {total} total.
          </p>
        </div>
        <Button onClick={openAddModal}>
          <Plus size={16} /> Add Patient
        </Button>
      </div>

      <Card className="mt-6" padded={false}>
        <div className="p-4 flex flex-col sm:flex-row gap-3 border-b border-cardline-soft">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-charcoal/40" />
            <input
              placeholder="Search by patient ID, name or number"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-lg border border-cardline bg-offwhite-200 pl-9 pr-3.5 py-2.5 text-sm text-charcoal placeholder:text-charcoal/40 focus:border-sage focus:outline-none focus:ring-2 focus:ring-sage/20 transition"
            />
          </div>
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="rounded-lg border border-cardline bg-offwhite-200 px-3.5 py-2.5 text-sm text-charcoal focus:border-sage focus:outline-none focus:ring-2 focus:ring-sage/20 transition sm:w-56"
          >
            <option value="">All categories</option>
            {ALL_PATIENT_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABELS[c]}
              </option>
            ))}
          </select>
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
            <p className="text-sm text-charcoal font-medium">No patients yet</p>
            <p className="text-xs text-charcoal/55">
              {total === 0
                ? 'Patients sent from the CRM webhook will appear here automatically.'
                : 'Try a different search or filter.'}
            </p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-charcoal/55 border-b border-cardline-soft">
                    <th className="px-5 py-3 font-semibold">Patient ID</th>
                    <th className="px-5 py-3 font-semibold">Patient Name</th>
                    <th className="px-5 py-3 font-semibold">Category</th>
                    <th className="px-5 py-3 font-semibold">Age</th>
                    <th className="px-5 py-3 font-semibold">Number</th>
                    <th className="px-5 py-3 font-semibold">Guardian / Relative</th>
                    <th className="px-5 py-3 font-semibold">Alternate Number</th>
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
                      <td className="px-5 py-3.5 font-mono text-xs font-bold tracking-widest text-charcoal/45">{p.patientCode}</td>
                      <td className="px-5 py-3.5 font-medium text-charcoal">{p.patientName}</td>
                      <td className="px-5 py-3.5">
                        <Badge tone={categoryTone(p.category)}>{p.categoryLabel}</Badge>
                      </td>
                      <td className="px-5 py-3.5 text-charcoal/70">{p.age}</td>
                      <td className="px-5 py-3.5 text-charcoal/70">{p.number}</td>
                      <td className="px-5 py-3.5 text-charcoal/70">
                        {p.guardianName || p.relativeName || '—'}
                      </td>
                      <td className="px-5 py-3.5 text-charcoal/70">{p.alternateNumber || '—'}</td>
                      <td className="px-5 py-3.5 text-charcoal/55">{formatDate(p.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between px-5 py-3.5 border-t border-cardline-soft">
              <span className="text-xs text-charcoal/55 flex items-center gap-1.5">
                <Users size={13} /> Page {page} of {pages}
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

      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="Add Patient Manually" className="max-w-2xl">
        <form onSubmit={handleAddPatient} className="space-y-4">
          {addError && <div className="rounded-lg bg-[#8C3B2E]/8 px-3.5 py-3 text-sm text-[#8C3B2E]">{addError}</div>}

          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              id="patientCode"
              label="Patient ID"
              placeholder="PT-E67640"
              value={addForm.patientCode}
              onChange={(e) => updateAddForm('patientCode', e.target.value)}
              required
            />
            <Input
              id="patientName"
              label="Patient Name"
              value={addForm.patientName}
              onChange={(e) => updateAddForm('patientName', e.target.value)}
              required
            />
            <div>
              <label htmlFor="category" className="block text-sm font-medium text-charcoal mb-1.5">
                Category
              </label>
              <select
                id="category"
                value={addForm.category}
                onChange={(e) => updateAddForm('category', e.target.value)}
                className="w-full rounded-lg border border-cardline bg-offwhite-200 px-3.5 py-2.5 text-sm text-charcoal focus:border-sage focus:outline-none focus:ring-2 focus:ring-sage/20 transition"
              >
                {ALL_PATIENT_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {CATEGORY_LABELS[c]}
                  </option>
                ))}
              </select>
            </div>
            <Input
              id="age"
              label="Age"
              type="number"
              min="0"
              value={addForm.age}
              onChange={(e) => updateAddForm('age', e.target.value)}
              required
            />
            <Input
              id="number"
              label="Phone Number"
              value={addForm.number}
              onChange={(e) => updateAddForm('number', e.target.value)}
              required
            />
            {addForm.category === PATIENT_CATEGORIES.AUTISM_ADHD ? (
              <>
                <Input
                  id="guardianName"
                  label="Father / Mother Name"
                  value={addForm.guardianName}
                  onChange={(e) => updateAddForm('guardianName', e.target.value)}
                  required
                />
                <Input
                  id="alternateNumber"
                  label="Alternate Number"
                  value={addForm.alternateNumber}
                  onChange={(e) => updateAddForm('alternateNumber', e.target.value)}
                />
              </>
            ) : (
              <Input
                id="relativeName"
                label="Relative Name"
                value={addForm.relativeName}
                onChange={(e) => updateAddForm('relativeName', e.target.value)}
                required
              />
            )}
            <div>
              <label htmlFor="currentStage" className="block text-sm font-medium text-charcoal mb-1.5">
                Current Stage
              </label>
              <select
                id="currentStage"
                value={addForm.currentStage}
                onChange={(e) => updateAddForm('currentStage', e.target.value)}
                className="w-full rounded-lg border border-cardline bg-offwhite-200 px-3.5 py-2.5 text-sm text-charcoal focus:border-sage focus:outline-none focus:ring-2 focus:ring-sage/20 transition"
              >
                {[1, 2, 3, 4, 5, 6].map((stage) => (
                  <option key={stage} value={stage}>
                    Stage {stage}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={() => setAddOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={addSaving}>
              {addSaving ? 'Saving...' : 'Add Patient'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default AllPatients;
