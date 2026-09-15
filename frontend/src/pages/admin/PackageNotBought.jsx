import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, Calendar, ChevronLeft, ChevronRight, ClipboardList, Inbox, Pencil, Plus, Search, Trash2, X } from 'lucide-react';
import api from '../../api/axios.js';
import Card from '../../components/ui/Card.jsx';
import Button from '../../components/ui/Button.jsx';
import Badge from '../../components/ui/Badge.jsx';
import Input from '../../components/ui/Input.jsx';
import Modal from '../../components/ui/Modal.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { ROLES } from '../../constants/roles.js';

const PAGE_SIZE = 10;

const emptyForm = {
  patientName: '',
  parentName: '',
  fatherNumber: '',
  motherNumber: '',
  age: '',
  program: '',
  reason: '',
  followUpDate: '',
  notes: '',
};

const dateForInput = (iso) => (iso ? new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }) : '');

const formatDate = (iso) =>
  iso
    ? new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' })
    : '-';

const PackageNotBought = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isAdmin = user?.role === ROLES.ADMIN;
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingRow, setEditingRow] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const [deletingId, setDeletingId] = useState('');

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 350);
    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    const fetchRows = async () => {
      setLoading(true);
      setLoadError('');
      try {
        const { data } = await api.get('/package-not-bought', {
          params: { page, limit: PAGE_SIZE, search: debouncedSearch || undefined },
        });
        setRows(data.rows || []);
        setPages(data.pages || 1);
        setTotal(data.total || 0);
      } catch (err) {
        setLoadError(err.response?.data?.message || 'Could not load package not bought records.');
      } finally {
        setLoading(false);
      }
    };
    fetchRows();
  }, [page, debouncedSearch, reloadKey]);

  const openAdd = () => {
    setEditingRow(null);
    setForm(emptyForm);
    setFormError('');
    setModalOpen(true);
  };

  const openEdit = (row) => {
    setEditingRow(row);
    setForm({
      patientName: row.patientName || '',
      parentName: row.parentName || '',
      fatherNumber: row.fatherNumber || '',
      motherNumber: row.motherNumber || '',
      age: row.age || '',
      program: row.program || '',
      reason: row.reason || '',
      followUpDate: dateForInput(row.followUpDate),
      notes: row.notes || '',
    });
    setFormError('');
    setModalOpen(true);
  };

  const updateForm = (field, value) => setForm((current) => ({ ...current, [field]: value }));

  const submitForm = async (e) => {
    e.preventDefault();
    setSaving(true);
    setFormError('');
    try {
      const payload = { ...form, patientName: form.patientName.trim() };
      if (editingRow) {
        await api.patch(`/package-not-bought/${editingRow.id}`, payload);
      } else {
        await api.post('/package-not-bought', payload);
      }
      setModalOpen(false);
      setReloadKey((value) => value + 1);
    } catch (err) {
      setFormError(err.response?.data?.message || 'Could not save record.');
    } finally {
      setSaving(false);
    }
  };

  const deleteRow = async (row) => {
    if (!isAdmin) return;
    const ok = window.confirm(`Delete ${row.patientName}?`);
    if (!ok) return;
    setDeletingId(row.id);
    try {
      await api.delete(`/package-not-bought/${row.id}`);
      setReloadKey((value) => value + 1);
    } catch (err) {
      setLoadError(err.response?.data?.message || 'Could not delete record.');
    } finally {
      setDeletingId('');
    }
  };

  const rangeText = useMemo(() => {
    if (!total) return '0 records';
    const start = (page - 1) * PAGE_SIZE + 1;
    const end = Math.min(page * PAGE_SIZE, total);
    return `${start}-${end} of ${total}`;
  }, [page, total]);

  return (
    <div>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-charcoal/55">Post Counselor</p>
          <h1 className="font-display text-2xl font-bold text-charcoal">Package Not Bought</h1>
          <p className="mt-1 text-sm text-charcoal/60">Patients who did not buy a package are kept separate from All Patients.</p>
        </div>
        <Button onClick={openAdd}>
          <Plus size={16} /> Add Record
        </Button>
      </div>

      <Card className="mt-6" padded={false}>
        <div className="flex flex-col gap-3 border-b border-cardline-soft p-4 lg:flex-row lg:items-center">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-charcoal/40" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by patient, parent, phone or program"
              className="w-full rounded-lg border border-cardline bg-offwhite-200 py-2.5 pl-9 pr-10 text-sm text-charcoal placeholder:text-charcoal/40 transition focus:border-sage focus:outline-none focus:ring-2 focus:ring-sage/20"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md p-1 text-charcoal/45 hover:bg-sage-muted/25 hover:text-charcoal"
                aria-label="Clear search"
              >
                <X size={14} />
              </button>
            )}
          </div>
          <div className="rounded-lg border border-cardline bg-offwhite-200 px-4 py-2.5 text-sm font-semibold text-charcoal">
            {rangeText}
          </div>
        </div>

        {loading ? (
          <div className="p-10 text-center text-sm text-charcoal/55">Loading records...</div>
        ) : loadError ? (
          <div className="flex flex-col items-center gap-2 p-10 text-center">
            <AlertTriangle size={22} className="text-[#8C3B2E]" />
            <p className="text-sm font-medium text-charcoal">{loadError}</p>
            <Button size="sm" variant="outline" onClick={() => setReloadKey((value) => value + 1)}>Try again</Button>
          </div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center gap-2 p-10 text-center">
            <Inbox size={22} className="text-charcoal/35" />
            <p className="text-sm font-semibold text-charcoal">No package not bought records yet</p>
            <p className="text-xs text-charcoal/55">Use Add Record to save these patients separately.</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-cardline-soft text-left text-xs uppercase tracking-wide text-charcoal/55">
                    <th className="px-4 py-3 font-semibold">Patient</th>
                    <th className="px-4 py-3 font-semibold">Parent</th>
                    <th className="px-4 py-3 font-semibold">Father's Number</th>
                    <th className="px-4 py-3 font-semibold">Mother's Number</th>
                    <th className="px-4 py-3 font-semibold">Age</th>
                    <th className="px-4 py-3 font-semibold">Program</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                    <th className="px-4 py-3 font-semibold">Follow-up Date</th>
                    <th className="px-4 py-3 font-semibold">Added By</th>
                    <th className="px-4 py-3 text-right font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr
                      key={row.id}
                      onClick={() => navigate(`/admin/package-not-bought/${row.id}`)}
                      className="cursor-pointer border-b border-cardline-soft align-top last:border-0 hover:bg-offwhite-300/25"
                    >
                      <td className="px-4 py-3.5">
                        <p className="font-bold text-charcoal">{row.patientName}</p>
                        {(row.reason || row.notes) && (
                          <p className="mt-1 max-w-xs text-xs text-charcoal/55">
                            {row.reason || row.notes}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3.5 text-charcoal/70">{row.parentName || '-'}</td>
                      <td className="px-4 py-3.5 text-charcoal/70">{row.fatherNumber || '-'}</td>
                      <td className="px-4 py-3.5 text-charcoal/70">{row.motherNumber || '-'}</td>
                      <td className="px-4 py-3.5 text-charcoal/70">{row.age || '-'}</td>
                      <td className="px-4 py-3.5 text-charcoal/70">{row.program || '-'}</td>
                      <td className="px-4 py-3.5">
                        <Badge tone={row.status === 'converted' ? 'teal' : 'amber'}>{row.status === 'converted' ? 'Converted' : 'Open'}</Badge>
                      </td>
                      <td className="px-4 py-3.5 text-charcoal/70">{formatDate(row.followUpDate)}</td>
                      <td className="px-4 py-3.5 text-charcoal/55">{row.createdByName || '-'}</td>
                      <td className="px-4 py-3.5">
                        <div className="flex justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              openEdit(row);
                            }}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-sage hover:bg-sage-muted/25 hover:text-charcoal"
                            aria-label="Edit record"
                            title="Edit"
                          >
                            <Pencil size={15} />
                          </button>
                          {isAdmin && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                deleteRow(row);
                              }}
                              disabled={deletingId === row.id}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[#8C3B2E] hover:bg-[#8C3B2E]/10 disabled:opacity-50"
                              aria-label="Delete record"
                              title="Delete"
                            >
                              <Trash2 size={15} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between border-t border-cardline-soft px-5 py-3.5">
              <span className="flex items-center gap-1.5 text-xs text-charcoal/55">
                <ClipboardList size={13} /> Page {page} of {pages}
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setPage((value) => Math.max(value - 1, 1))}
                  disabled={page <= 1}
                  aria-label="Previous page"
                  className="rounded-md p-1.5 text-sage hover:bg-sage-muted/25 disabled:pointer-events-none disabled:opacity-30"
                >
                  <ChevronLeft size={16} />
                </button>
                <button
                  onClick={() => setPage((value) => Math.min(value + 1, pages))}
                  disabled={page >= pages}
                  aria-label="Next page"
                  className="rounded-md p-1.5 text-sage hover:bg-sage-muted/25 disabled:pointer-events-none disabled:opacity-30"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          </>
        )}
      </Card>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editingRow ? 'Edit Package Not Bought Record' : 'Add Package Not Bought Record'} className="max-w-3xl">
        <form onSubmit={submitForm} className="space-y-4">
          {formError && <div className="rounded-lg bg-[#8C3B2E]/8 px-3.5 py-3 text-sm text-[#8C3B2E]">{formError}</div>}
          <div className="grid gap-4 sm:grid-cols-2">
            <Input id="pnb-patient-name" label="Patient Name" value={form.patientName} onChange={(e) => updateForm('patientName', e.target.value)} required />
            <Input id="pnb-parent-name" label="Parent / Guardian Name" value={form.parentName} onChange={(e) => updateForm('parentName', e.target.value)} />
            <Input id="pnb-father-number" label="Father's Number" value={form.fatherNumber} onChange={(e) => updateForm('fatherNumber', e.target.value)} />
            <Input id="pnb-mother-number" label="Mother's Number" value={form.motherNumber} onChange={(e) => updateForm('motherNumber', e.target.value)} />
            <Input id="pnb-age" label="Age" placeholder="e.g. 4.5 years" value={form.age} onChange={(e) => updateForm('age', e.target.value)} />
            <Input id="pnb-program" label="Program" value={form.program} onChange={(e) => updateForm('program', e.target.value)} />
            <div>
              <label htmlFor="pnb-follow-up-date" className="mb-1.5 block text-sm font-medium text-charcoal">Follow-up Date</label>
              <div className="relative">
                <Calendar size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-charcoal/40" />
                <input
                  id="pnb-follow-up-date"
                  type="date"
                  value={form.followUpDate}
                  onChange={(e) => updateForm('followUpDate', e.target.value)}
                  className="w-full rounded-lg border border-cardline bg-offwhite-200 py-2.5 pl-9 pr-3.5 text-sm text-charcoal transition focus:border-sage focus:outline-none focus:ring-2 focus:ring-sage/20"
                />
              </div>
            </div>
            <Input id="pnb-reason" label="Reason" value={form.reason} onChange={(e) => updateForm('reason', e.target.value)} />
          </div>
          <div>
            <label htmlFor="pnb-notes" className="mb-1.5 block text-sm font-medium text-charcoal">Notes</label>
            <textarea
              id="pnb-notes"
              rows={4}
              value={form.notes}
              onChange={(e) => updateForm('notes', e.target.value)}
              className="w-full resize-y rounded-lg border border-cardline bg-offwhite-200 px-3.5 py-2.5 text-sm text-charcoal placeholder:text-charcoal/40 transition focus:border-sage focus:outline-none focus:ring-2 focus:ring-sage/20"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={saving}>{saving ? 'Saving...' : editingRow ? 'Save Changes' : 'Add Record'}</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default PackageNotBought;
