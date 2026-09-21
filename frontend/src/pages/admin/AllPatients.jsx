import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Search, ChevronLeft, ChevronRight, Inbox, AlertTriangle, Users, Plus, Calendar, X } from 'lucide-react';
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
  patientHistoryBy: '',
  consultationDate: '',
  relativeName: '',
  currentStage: 1,
  postCounselor: '',
};

const categoryTone = (category) => (category === PATIENT_CATEGORIES.AUTISM_ADHD ? 'teal' : 'amber');

const formatDate = (iso) =>
  new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

const AllPatients = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [patients, setPatients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  // Restored from the URL on mount so the browser/router "back" button (from a
  // patient's details page) lands on the same page/search/filter, not a reset list.
  const [search, setSearch] = useState(() => searchParams.get('search') || '');
  const [debouncedSearch, setDebouncedSearch] = useState(() => searchParams.get('search') || '');
  const [categoryFilter, setCategoryFilter] = useState(() => searchParams.get('category') || '');
  const [dateFilter, setDateFilter] = useState(() => searchParams.get('date') || '');
  const [page, setPage] = useState(() => Number(searchParams.get('page')) || 1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState(emptyPatientForm);
  const [addSaving, setAddSaving] = useState(false);
  const [addError, setAddError] = useState('');
  const [codeCheck, setCodeCheck] = useState({ code: '', status: 'idle' });
  const [postCounselorOptions, setPostCounselorOptions] = useState([]);
  // Track the previous filter values (not just "have we mounted") so React 18 StrictMode's
  // dev-only double-invoke of this effect — same values, twice — can't misread its own
  // second pass as a real change and reset the restored page back to 1.
  const prevFiltersRef = useRef({ categoryFilter, dateFilter });

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch((prev) => {
        if (prev !== search) setPage(1);
        return search;
      });
    }, 400);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    const prev = prevFiltersRef.current;
    if (prev.categoryFilter !== categoryFilter || prev.dateFilter !== dateFilter) {
      setPage(1);
    }
    prevFiltersRef.current = { categoryFilter, dateFilter };
  }, [categoryFilter, dateFilter]);

  // Keep the URL in sync (replace, not push) so it always reflects the current
  // page/search/filters without spamming browser history on every keystroke/click.
  useEffect(() => {
    const params = {};
    if (page > 1) params.page = String(page);
    if (debouncedSearch) params.search = debouncedSearch;
    if (categoryFilter) params.category = categoryFilter;
    if (dateFilter) params.date = dateFilter;
    setSearchParams(params, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, debouncedSearch, categoryFilter, dateFilter]);

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
            receivedDate: dateFilter || undefined,
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
  }, [page, debouncedSearch, categoryFilter, dateFilter]);

  useEffect(() => {
    const fetchPostCounselors = async () => {
      try {
        const { data } = await api.get('/users/post-counselors');
        setPostCounselorOptions(data.postCounselors || []);
      } catch {
        setPostCounselorOptions([]);
      }
    };
    fetchPostCounselors();
  }, []);

  useEffect(() => {
    if (!addOpen) return;
    const code = addForm.patientCode.trim().toUpperCase();
    if (!code) {
      setCodeCheck({ code: '', status: 'idle' });
      return;
    }

    const controller = new AbortController();
    setCodeCheck({ code, status: 'checking' });
    const timer = setTimeout(async () => {
      try {
        const { data } = await api.get('/patients/check-code', { params: { code }, signal: controller.signal });
        setCodeCheck({ code, status: data.exists ? 'duplicate' : 'available' });
      } catch (err) {
        if (!controller.signal.aborted) setCodeCheck({ code, status: 'error' });
      }
    }, 350);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [addOpen, addForm.patientCode]);

  const updateAddForm = (field, value) => {
    setAddForm((current) => ({ ...current, [field]: value }));
  };

  const openAddModal = () => {
    setAddForm(emptyPatientForm);
    setAddError('');
    setCodeCheck({ code: '', status: 'idle' });
    setAddOpen(true);
  };

  const handleAddPatient = async (e) => {
    e.preventDefault();
    const code = addForm.patientCode.trim().toUpperCase();
    if (!code) return;
    setAddSaving(true);
    setAddError('');
    try {
      const check = await api.get('/patients/check-code', { params: { code } });
      if (check.data.exists) {
        setCodeCheck({ code, status: 'duplicate' });
        return;
      }
      const { data } = await api.post('/patients', {
        ...addForm,
        patientCode: code,
        age: addForm.age.trim(),
        currentStage: Number(addForm.currentStage),
        postCounselor: addForm.postCounselor || null,
      });
      setAddOpen(false);
      navigate(`/admin/patients/${data.patient.id}`);
    } catch (err) {
      const message = err.response?.data?.message || 'Could not add patient.';
      if (/patient.?id already exists|patientcode already exists/i.test(message)) {
        setCodeCheck({ code, status: 'duplicate' });
      } else {
        setAddError(message);
      }
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
        <div className="p-4 flex flex-col lg:flex-row gap-3 border-b border-cardline-soft">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-charcoal/40" />
            <input
              placeholder="Search by patient ID, name, father or mother number"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-lg border border-cardline bg-offwhite-200 pl-9 pr-3.5 py-2.5 text-sm text-charcoal placeholder:text-charcoal/40 focus:border-sage focus:outline-none focus:ring-2 focus:ring-sage/20 transition"
            />
          </div>
          <div className="relative sm:w-56">
            <Calendar size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-charcoal/40" />
            <input
              type="date"
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              className="w-full rounded-lg border border-cardline bg-offwhite-200 py-2.5 pl-9 pr-10 text-sm text-charcoal focus:border-sage focus:outline-none focus:ring-2 focus:ring-sage/20 transition"
              aria-label="Filter by received date"
            />
            {dateFilter && (
              <button
                type="button"
                onClick={() => setDateFilter('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md p-1 text-charcoal/45 hover:bg-sage-muted/25 hover:text-charcoal"
                aria-label="Clear date filter"
              >
                <X size={14} />
              </button>
            )}
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
                    <th className="px-5 py-3 font-semibold">Phone / Father's Number</th>
                    <th className="px-5 py-3 font-semibold">Guardian / Relative</th>
                    <th className="px-5 py-3 font-semibold">Mother's Number</th>
                    <th className="px-5 py-3 font-semibold">Received</th>
                  </tr>
                </thead>
                <tbody>
                  {patients.map((p) => (
                    <tr
                      key={p.id}
                      onClick={() => navigate(`/admin/patients/${p.id}`)}
                      className={`border-b border-cardline-soft last:border-0 cursor-pointer ${
                        p.hasDueMedicineConnect
                          ? 'bg-[#B42318]/10 hover:bg-[#B42318]/15'
                          : 'hover:bg-offwhite-300/25'
                      }`}
                    >
                      <td className="px-5 py-3.5 font-mono text-xs font-bold tracking-widest text-charcoal/45">{p.patientCode}</td>
                      <td className="px-5 py-3.5 font-medium text-charcoal">{p.patientName}</td>
                      <td className="px-5 py-3.5">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Badge tone={categoryTone(p.category)}>{p.categoryLabel}</Badge>
                          {p.approvalStatus === 'pending' && (
                            <span className="inline-flex items-center rounded-full bg-[#9C6B2E]/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#9C6B2E]">
                              Pending Approval
                            </span>
                          )}
                        </div>
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
            <div>
              <Input
                id="patientCode"
                label="Patient ID"
                placeholder="PT-E67640"
                value={addForm.patientCode}
                onChange={(e) => updateAddForm('patientCode', e.target.value)}
                error={codeCheck.code === addForm.patientCode.trim().toUpperCase() && codeCheck.status === 'duplicate' ? 'Duplicate Patient ID. Enter a different ID.' : undefined}
                required
              />
              {codeCheck.code === addForm.patientCode.trim().toUpperCase() && codeCheck.status === 'checking' && (
                <p className="mt-1 text-xs text-charcoal/55">Checking Patient ID...</p>
              )}
            </div>
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
              placeholder="e.g. 4.5 years"
              value={addForm.age}
              onChange={(e) => updateAddForm('age', e.target.value)}
              required
            />
            <Input
              id="number"
              label={addForm.category === PATIENT_CATEGORIES.AUTISM_ADHD ? "Father's Number" : 'Phone Number'}
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
                  label="Mother's Number"
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
                Current Phase
              </label>
              <select
                id="currentStage"
                value={addForm.currentStage}
                onChange={(e) => updateAddForm('currentStage', e.target.value)}
                className="w-full rounded-lg border border-cardline bg-offwhite-200 px-3.5 py-2.5 text-sm text-charcoal focus:border-sage focus:outline-none focus:ring-2 focus:ring-sage/20 transition"
              >
                {[1, 2, 3, 4, 5, 6].map((stage) => (
                  <option key={stage} value={stage}>
                    Phase {stage}
                  </option>
                ))}
              </select>
            </div>
            <Input
              id="patientHistoryBy"
              label={`Patient History By - Phase ${addForm.currentStage}`}
              placeholder="Name"
              value={addForm.patientHistoryBy}
              onChange={(e) => updateAddForm('patientHistoryBy', e.target.value)}
            />
            <Input
              id="consultationDate"
              label={`Consultation Date - Phase ${addForm.currentStage}`}
              type="date"
              value={addForm.consultationDate}
              onChange={(e) => updateAddForm('consultationDate', e.target.value)}
            />
            <div>
              <label htmlFor="postCounselor" className="block text-sm font-medium text-charcoal mb-1.5">
                Post Counselor
              </label>
              <select
                id="postCounselor"
                value={addForm.postCounselor}
                onChange={(e) => updateAddForm('postCounselor', e.target.value)}
                className="w-full rounded-lg border border-cardline bg-offwhite-200 px-3.5 py-2.5 text-sm text-charcoal focus:border-sage focus:outline-none focus:ring-2 focus:ring-sage/20 transition"
              >
                <option value="">Not selected</option>
                {postCounselorOptions.map((counselor) => (
                  <option key={counselor.id} value={counselor.id}>
                    {counselor.name}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-charcoal/45">Saved for the selected current phase.</p>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={() => setAddOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={addSaving || (codeCheck.code === addForm.patientCode.trim().toUpperCase() && codeCheck.status === 'duplicate')}>
              {addSaving ? 'Saving...' : 'Add Patient'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default AllPatients;
