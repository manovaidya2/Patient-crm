import { useEffect, useMemo, useState } from 'react';
import { Megaphone, Plus, Search, Trash2 } from 'lucide-react';
import api from '../../api/axios.js';
import Card from '../../components/ui/Card.jsx';
import Button from '../../components/ui/Button.jsx';
import Modal from '../../components/ui/Modal.jsx';
import Toast from '../../components/ui/Toast.jsx';
import { useToast } from '../../components/useToast.js';
import { ROLES } from '../../constants/roles.js';
import { useAuth } from '../../context/AuthContext.jsx';

const columns = [
  { key: 'patientCode', label: 'Patient ID', locked: true, width: 'min-w-36' },
  { key: 'parentName', label: 'Parent Name', locked: true, width: 'min-w-44' },
  { key: 'mobileNumber', label: "Phone / Father's Number", locked: true, width: 'min-w-40' },
  { key: 'patientName', label: 'Patient Name', locked: true, width: 'min-w-48' },
  { key: 'program', label: 'Program', locked: true, width: 'min-w-40' },
  { key: 'programStartDate', label: 'Program Start Date', locked: true, width: 'min-w-40' },
  { key: 'latestFollowUpDate', label: 'Latest Follow-up Date', type: 'date', width: 'min-w-44' },
  { key: 'improvementSummary', label: 'Improvement Summary (short)', type: 'textarea', width: 'min-w-72' },
  { key: 'parentSatisfied', label: 'Parent Satisfied?', width: 'min-w-40' },
  { key: 'permissionToRequestReview', label: 'Permission to Request Review?', width: 'min-w-56' },
  { key: 'firstRequestDate', label: 'First Request Date', type: 'date', width: 'min-w-40' },
  { key: 'contactMethod', label: 'Contact Method', width: 'min-w-44' },
  { key: 'reviewStatus', label: 'Review Status', width: 'min-w-44' },
  { key: 'lastContactDate', label: 'Last Contact Date', type: 'date', width: 'min-w-40' },
  { key: 'nextActionDate', label: 'Next Action Date', type: 'date', width: 'min-w-40' },
  { key: 'reviewPlatform', label: 'Review Platform', width: 'min-w-44' },
  { key: 'reviewLinkRef', label: 'Review Link / Screenshot Ref', width: 'min-w-64' },
  { key: 'testimonialConsent', label: 'Testimonial Consent', width: 'min-w-44' },
  { key: 'approvedBy', label: 'Approved By', width: 'min-w-44' },
  { key: 'notes', label: 'Notes', type: 'textarea', width: 'min-w-72' },
];

const emptyForm = { patientId: '', improvementSummary: '', notes: '' };

const cellBase = 'border-r border-cardline px-2 py-2 align-top';

const DigitalMarketing = () => {
  const { user } = useAuth();
  const { toasts, showToast, dismissToast } = useToast();
  const [rows, setRows] = useState([]);
  const [patients, setPatients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [patientSearch, setPatientSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const canAddReview = [ROLES.ADMIN, ROLES.DOCTOR, ROLES.ASSISTANT_DOCTOR, ROLES.PSYCHOLOGIST].includes(user?.role);
  const canDeleteReview = user?.role === ROLES.ADMIN;
  const tableColSpan = columns.length + (canDeleteReview ? 1 : 0);

  const loadRows = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/digital-marketing/reviews');
      setRows(data.reviews || []);
    } catch (err) {
      showToast(err.response?.data?.message || 'Could not load digital marketing sheet', 'error');
    } finally {
      setLoading(false);
    }
  };

  const loadPatients = async () => {
    if (!canAddReview) return;
    try {
      const { data } = await api.get('/patients', { params: { limit: 100 } });
      setPatients(data.patients || []);
    } catch {
      setPatients([]);
    }
  };

  useEffect(() => {
    loadRows();
    loadPatients();
  }, []);

  const filteredRows = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter((row) =>
      [row.patientCode, row.parentName, row.mobileNumber, row.patientName, row.program, row.improvementSummary, row.reviewStatus]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term))
    );
  }, [rows, search]);

  const openAddModal = () => {
    setForm(emptyForm);
    setPatientSearch('');
    setModalOpen(true);
  };

  const patientMatches = useMemo(() => {
    const term = patientSearch.trim().toLowerCase();
    if (!term) return patients.slice(0, 12);
    return patients
      .filter((patient) =>
        [patient.patientCode, patient.patientName, patient.number, patient.alternateNumber, patient.guardianName, patient.relativeName]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(term))
      )
      .slice(0, 12);
  }, [patients, patientSearch]);

  const selectedPatient = patients.find((patient) => String(patient.id) === String(form.patientId));

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!form.patientId) {
      showToast('Select a patient', 'error');
      return;
    }
    setSaving(true);
    try {
      const { data } = await api.post('/digital-marketing/reviews', form);
      setRows((current) => [data.review, ...current]);
      setModalOpen(false);
      showToast('Review row added');
    } catch (err) {
      showToast(err.response?.data?.message || 'Could not add row', 'error');
    } finally {
      setSaving(false);
    }
  };

  const updateCell = async (row, key, value) => {
    const previous = rows;
    setRows((current) => current.map((item) => (item.id === row.id ? { ...item, [key]: value } : item)));
    try {
      const { data } = await api.patch(`/digital-marketing/reviews/${row.id}`, { [key]: value });
      setRows((current) => current.map((item) => (item.id === row.id ? data.review : item)));
    } catch (err) {
      setRows(previous);
      showToast(err.response?.data?.message || 'Could not update cell', 'error');
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.delete(`/digital-marketing/reviews/${deleteTarget.id}`);
      setRows((current) => current.filter((item) => item.id !== deleteTarget.id));
      setDeleteTarget(null);
      showToast('Review row deleted');
    } catch (err) {
      showToast(err.response?.data?.message || 'Could not delete row', 'error');
    } finally {
      setDeleting(false);
    }
  };

  const renderCell = (row, col) => {
    const value = row[col.key] || '';
    if (col.locked) {
      return <span className="block text-sm font-semibold text-charcoal">{value || '-'}</span>;
    }
    if (col.type === 'date') {
      return (
        <input
          type="date"
          value={value}
          onChange={(e) => updateCell(row, col.key, e.target.value)}
          className="w-full rounded border border-transparent bg-transparent px-1 py-1 text-sm text-charcoal outline-none hover:border-cardline focus:border-sage"
        />
      );
    }
    if (col.type === 'textarea') {
      return (
        <textarea
          value={value}
          rows={2}
          onChange={(e) => updateCell(row, col.key, e.target.value)}
          className="w-full resize-y rounded border border-transparent bg-transparent px-1 py-1 text-sm text-charcoal outline-none hover:border-cardline focus:border-sage"
        />
      );
    }
    return (
      <input
        value={value}
        onChange={(e) => updateCell(row, col.key, e.target.value)}
        className="w-full rounded border border-transparent bg-transparent px-1 py-1 text-sm text-charcoal outline-none hover:border-cardline focus:border-sage"
      />
    );
  };

  return (
    <div>
      <Toast toasts={toasts} onDismiss={dismissToast} />
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-charcoal">Digital Marketing</h1>
          <p className="mt-1 text-sm text-charcoal/60">Patient improvement review sheet for review requests and testimonials.</p>
        </div>
        {canAddReview && (
          <Button onClick={openAddModal}>
            <Plus size={16} /> Add Review Row
          </Button>
        )}
      </div>

      <Card className="mt-6" padded={false}>
        <div className="flex flex-col gap-3 border-b border-cardline-soft p-4 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-charcoal/40" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search sheet"
              className="w-full rounded-lg border border-cardline bg-offwhite-200 py-2.5 pl-9 pr-3.5 text-sm text-charcoal outline-none focus:border-sage focus:ring-2 focus:ring-sage/20"
            />
          </div>
          <span className="inline-flex items-center gap-2 rounded-lg border border-cardline bg-offwhite-200 px-3.5 py-2.5 text-sm font-semibold text-charcoal/60">
            <Megaphone size={15} /> {filteredRows.length} rows
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full border-collapse text-left">
            <thead>
              <tr>
                {columns.map((col) => (
                  <th key={col.key} className={`${col.width} border-r border-teal-800 bg-[#56695D] px-3 py-3 text-sm font-bold text-offwhite-100`}>
                    {col.label}
                  </th>
                ))}
                {canDeleteReview && (
                  <th className="min-w-24 bg-[#56695D] px-3 py-3 text-right text-sm font-bold text-offwhite-100">
                    Actions
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={tableColSpan} className="p-8 text-center text-sm text-charcoal/55">Loading sheet...</td></tr>
              ) : filteredRows.length === 0 ? (
                <tr><td colSpan={tableColSpan} className="p-8 text-center text-sm text-charcoal/55">No review rows yet.</td></tr>
              ) : (
                filteredRows.map((row) => (
                  <tr key={row.id} className="border-b border-cardline-soft bg-offwhite-100 hover:bg-offwhite-200/55">
                    {columns.map((col) => (
                      <td key={col.key} className={`${cellBase} ${col.locked ? 'bg-offwhite-200/70' : 'bg-offwhite-100'}`}>
                        {renderCell(row, col)}
                      </td>
                    ))}
                    {canDeleteReview && (
                      <td className="bg-offwhite-100 px-3 py-2 text-right align-top">
                        <button
                          type="button"
                          onClick={() => setDeleteTarget(row)}
                          className="inline-flex rounded-md p-2 text-[#8C3B2E] transition hover:bg-[#8C3B2E]/10"
                          aria-label={`Delete review row for ${row.patientName}`}
                          title="Delete row"
                        >
                          <Trash2 size={16} />
                        </button>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Add Review Row" className="max-w-xl">
        <form onSubmit={handleCreate} className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-charcoal">Patient</label>
            <input
              value={patientSearch}
              onChange={(e) => {
                setPatientSearch(e.target.value);
                setForm({ ...form, patientId: '' });
              }}
              placeholder={selectedPatient ? `${selectedPatient.patientCode} - ${selectedPatient.patientName}` : 'Search patient by ID, name, or phone number'}
              className="w-full rounded-lg border border-cardline bg-offwhite-200 px-3.5 py-2.5 text-sm text-charcoal outline-none placeholder:text-charcoal/45 focus:border-sage focus:ring-2 focus:ring-sage/20"
            />
            <div className="mt-2 max-h-56 overflow-y-auto rounded-lg border border-cardline bg-offwhite-100">
              {patientMatches.length === 0 ? (
                <p className="px-3.5 py-3 text-sm text-charcoal/50">No patients found.</p>
              ) : (
                patientMatches.map((patient) => (
                  <button
                    key={patient.id}
                    type="button"
                    onClick={() => {
                      setForm({ ...form, patientId: patient.id });
                      setPatientSearch(`${patient.patientCode} - ${patient.patientName}`);
                    }}
                    className={`block w-full px-3.5 py-2.5 text-left text-sm transition hover:bg-sage-muted/20 ${
                      String(form.patientId) === String(patient.id) ? 'bg-sage-muted/25 font-semibold text-sage' : 'text-charcoal'
                    }`}
                  >
                    <span className="font-semibold">{patient.patientCode}</span> - {patient.patientName}
                    {patient.number ? <span className="ml-2 text-xs text-charcoal/45">{patient.number}</span> : null}
                  </button>
                ))
              )}
            </div>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-charcoal">Improvement Summary</label>
            <textarea
              rows={3}
              value={form.improvementSummary}
              onChange={(e) => setForm({ ...form, improvementSummary: e.target.value })}
              className="w-full resize-y rounded-lg border border-cardline bg-offwhite-200 px-3.5 py-2.5 text-sm text-charcoal outline-none focus:border-sage focus:ring-2 focus:ring-sage/20"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-charcoal">Notes</label>
            <textarea
              rows={2}
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              className="w-full resize-y rounded-lg border border-cardline bg-offwhite-200 px-3.5 py-2.5 text-sm text-charcoal outline-none focus:border-sage focus:ring-2 focus:ring-sage/20"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={saving}>{saving ? 'Saving...' : 'Add Row'}</Button>
          </div>
        </form>
      </Modal>

      <Modal open={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="Delete Review Row" className="max-w-md">
        <div className="space-y-4">
          <p className="text-sm leading-6 text-charcoal/75">
            Delete {deleteTarget?.patientCode} - {deleteTarget?.patientName} review row?
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button variant="danger" onClick={handleDelete} disabled={deleting}>
              {deleting ? 'Deleting...' : 'Delete'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default DigitalMarketing;
