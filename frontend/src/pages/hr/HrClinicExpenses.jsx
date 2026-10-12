import { useEffect, useState } from 'react';
import { Download, Pencil, Plus, Receipt, Search, Trash2 } from 'lucide-react';
import api from '../../api/axios.js';
import Button from '../../components/ui/Button.jsx';
import Modal from '../../components/ui/Modal.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { ROLES } from '../../constants/roles.js';
import { todayInput } from './hrOptions.js';

const fieldClass = 'mt-1 w-full rounded-md border border-cardline bg-white px-3 py-2.5 text-sm text-charcoal outline-none focus:border-sage focus:ring-2 focus:ring-sage/15';
const controlClass = 'rounded-md border border-cardline bg-white px-3 py-2.5 text-sm outline-none focus:border-sage focus:ring-2 focus:ring-sage/15';
const CATEGORIES = [['tea_coffee', 'Tea/Coffee'], ['pantry', 'Pantry'], ['cleaning', 'Cleaning'], ['rent', 'Rent'], ['electricity', 'Electricity'], ['internet', 'Internet'], ['stationery', 'Stationery'], ['maintenance', 'Maintenance'], ['vendor', 'Vendor'], ['raw_material', 'Raw Material'], ['other', 'Other']];
const PAYMENT_STATUSES = [['paid', 'Paid'], ['unpaid', 'Unpaid'], ['partial', 'Partial']];
const APPROVALS = [['pending', 'Pending'], ['approved', 'Approved'], ['rejected', 'Rejected']];
const categoryLabel = (value) => CATEGORIES.find(([key]) => key === value)?.[1] || value;
const blank = () => ({ date: todayInput(), category: 'tea_coffee', vendor: '', amount: '', billNumber: '', paymentStatus: 'paid', approval: 'pending', remarks: '', ownerReview: '' });
const money = (value) => `₹${Number(value || 0).toLocaleString('en-IN')}`;
const tone = (value) => ({ paid: 'bg-emerald-100 text-emerald-800', approved: 'bg-emerald-100 text-emerald-800', unpaid: 'bg-red-100 text-red-800', rejected: 'bg-red-100 text-red-800', pending: 'bg-amber-100 text-amber-800', partial: 'bg-blue-100 text-blue-800' }[value] || 'bg-offwhite-300 text-charcoal/70');
const Status = ({ value }) => <span className={`inline-flex whitespace-nowrap rounded px-2 py-1 text-xs font-semibold capitalize ${tone(value)}`}>{value}</span>;
const Field = ({ label, children, className = '' }) => <label className={`block text-sm font-medium text-charcoal ${className}`}>{label}{children}</label>;
const csvCell = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`;

export default function HrClinicExpenses() {
  const { user } = useAuth();
  const isAdmin = user?.role === ROLES.ADMIN;
  const [rows, setRows] = useState([]);
  const [summary, setSummary] = useState({ total: 0, approved: 0, pending: 0, unpaid: 0 });
  const [filters, setFilters] = useState({ search: '', category: '', approval: '', paymentStatus: '', from: '', to: '' });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [form, setForm] = useState(blank());
  const [editing, setEditing] = useState(null);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [review, setReview] = useState(null);

  const load = async (params = filters) => {
    setLoading(true);
    try {
      const { data } = await api.get('/hr/expenses', { params });
      setRows(data.expenses || []); setSummary(data.summary || { total: 0, approved: 0, pending: 0, unpaid: 0 }); setError('');
    } catch (requestError) { setError(requestError.response?.data?.message || 'Expenses could not be loaded'); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const set = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));
  const openCreate = () => { setEditing(null); setForm(blank()); setError(''); setOpen(true); };
  const openEdit = (row) => { setEditing(row); setForm({ ...blank(), ...row, amount: String(row.amount) }); setError(''); setOpen(true); };
  const canEdit = (row) => isAdmin || row.approval === 'pending';

  const submit = async (event) => {
    event.preventDefault(); setSaving(true); setError('');
    try {
      await (editing ? api.patch(`/hr/expenses/${editing.id}`, form) : api.post('/hr/expenses', form));
      setOpen(false); await load();
    } catch (requestError) { setError(requestError.response?.data?.message || 'Expense could not be saved'); }
    finally { setSaving(false); }
  };
  const submitReview = async (event) => {
    event.preventDefault(); setSaving(true);
    try { await api.post(`/hr/expenses/${review.row.id}/review`, { approval: review.approval, ownerReview: review.ownerReview }); setReview(null); await load(); }
    catch (requestError) { setError(requestError.response?.data?.message || 'Review could not be saved'); }
    finally { setSaving(false); }
  };
  const remove = async (row) => {
    if (!window.confirm('Delete this expense record? Totals will update after deletion.')) return;
    try { await api.delete(`/hr/expenses/${row.id}`); await load(); }
    catch (requestError) { setError(requestError.response?.data?.message || 'Expense could not be deleted'); }
  };
  const downloadCsv = () => {
    const head = ['Date', 'Category', 'Vendor / Particulars', 'Amount', 'Bill / Receipt Number', 'Payment Status', 'Approval', 'Remarks', 'Owner Review'];
    const lines = rows.map((row) => [row.date, categoryLabel(row.category), row.vendor, row.amount, row.billNumber, row.paymentStatus, row.approval, row.remarks, row.ownerReview].map(csvCell).join(','));
    const url = URL.createObjectURL(new Blob([[head.map(csvCell).join(','), ...lines].join('\n')], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a'); link.href = url; link.download = `clinic-expenses-${todayInput()}.csv`; link.click(); URL.revokeObjectURL(url);
  };

  const cards = [['Total expenses', summary.total], ['Approved', summary.approved], ['Pending approval', summary.pending], ['Unpaid / partial', summary.unpaid]];
  const head = ['Date', 'Category', 'Vendor / Particulars', 'Amount ₹', 'Bill / Receipt Number', 'Payment Status', 'Approval', 'Remarks', 'Owner Review', 'Action'];

  return <div className="space-y-5">
    <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div><p className="text-xs font-semibold uppercase text-sage">HR Operations</p><h1 className="flex items-center gap-2 font-display text-2xl font-bold text-charcoal"><Receipt size={23} /> Clinic Expenses</h1><p className="mt-1 text-sm text-charcoal/60">Expenses, pantry, maintenance and vendor bills. Admin approves each entry.</p></div>
      <div className="flex gap-2"><Button variant="outline" onClick={downloadCsv} disabled={!rows.length}><Download size={16} /> Download CSV</Button><Button onClick={openCreate}><Plus size={16} /> Add Expense</Button></div>
    </header>
    <section className="grid border border-cardline bg-offwhite-100 sm:grid-cols-4">{cards.map(([label, value], index) => <div key={label} className={`px-4 py-3 ${index < cards.length - 1 ? 'border-b border-cardline sm:border-b-0 sm:border-r' : ''}`}><p className="text-xs font-semibold uppercase text-charcoal/50">{label}</p><p className="mt-1 text-2xl font-bold text-charcoal">{money(value)}</p></div>)}</section>
    <form onSubmit={(event) => { event.preventDefault(); load(); }} className="grid gap-3 border border-cardline bg-offwhite-100 p-4 sm:grid-cols-2 lg:grid-cols-4">
      <label className="relative sm:col-span-2"><Search size={16} className="absolute left-3 top-3 text-charcoal/40" /><input className={`${controlClass} w-full pl-9`} placeholder="Search vendor, bill number or remarks" value={filters.search} onChange={(event) => setFilters({ ...filters, search: event.target.value })} /></label>
      <select aria-label="Category" className={controlClass} value={filters.category} onChange={(event) => setFilters({ ...filters, category: event.target.value })}><option value="">All categories</option>{CATEGORIES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
      <select aria-label="Approval" className={controlClass} value={filters.approval} onChange={(event) => setFilters({ ...filters, approval: event.target.value })}><option value="">All approvals</option>{APPROVALS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
      <select aria-label="Payment status" className={controlClass} value={filters.paymentStatus} onChange={(event) => setFilters({ ...filters, paymentStatus: event.target.value })}><option value="">All payment statuses</option>{PAYMENT_STATUSES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
      <input aria-label="From date" type="date" className={controlClass} value={filters.from} onChange={(event) => setFilters({ ...filters, from: event.target.value })} />
      <input aria-label="To date" type="date" className={controlClass} value={filters.to} onChange={(event) => setFilters({ ...filters, to: event.target.value })} />
      <Button type="submit">Apply filters</Button>
    </form>
    {error && !open && <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>}
    <section className="overflow-hidden border border-cardline bg-offwhite-100"><div className="overflow-x-auto">
      <table className="w-full min-w-[1200px] text-sm">
        <thead className="bg-[#50685D] text-left text-xs uppercase text-white"><tr>{head.map((label) => <th key={label} className="whitespace-nowrap px-4 py-3">{label}</th>)}</tr></thead>
        <tbody className="divide-y divide-cardline-soft">{rows.map((row) => <tr key={row.id}>
          <td className="whitespace-nowrap px-4 py-3 font-semibold">{row.date}</td>
          <td className="px-4 py-3">{categoryLabel(row.category)}</td>
          <td className="px-4 py-3">{row.vendor || '-'}</td>
          <td className="px-4 py-3 font-bold">{money(row.amount)}</td>
          <td className="px-4 py-3">{row.billNumber || '-'}</td>
          <td className="px-4 py-3"><Status value={row.paymentStatus} /></td>
          <td className="px-4 py-3"><Status value={row.approval} /></td>
          <td className="max-w-56 px-4 py-3">{row.remarks || '-'}</td>
          <td className="max-w-56 px-4 py-3">{row.ownerReview || '-'}{row.reviewedByName && <p className="text-xs text-charcoal/50">by {row.reviewedByName}</p>}</td>
          <td className="px-4 py-3"><div className="flex items-center gap-1">
            {canEdit(row) && <button title="Edit expense" onClick={() => openEdit(row)} className="p-2 text-sage"><Pencil size={16} /></button>}
            {isAdmin && <Button size="sm" variant="outline" onClick={() => setReview({ row, approval: row.approval === 'pending' ? 'approved' : row.approval, ownerReview: row.ownerReview })}>Review</Button>}
            {isAdmin && <button title="Delete expense" onClick={() => remove(row)} className="p-2 text-red-700"><Trash2 size={16} /></button>}
          </div></td>
        </tr>)}</tbody>
      </table></div>
      {loading && <p className="p-8 text-center text-sm text-charcoal/50">Loading...</p>}
      {!loading && !rows.length && <p className="p-10 text-center text-sm text-charcoal/50">No expenses match these filters.</p>}
    </section>

    <Modal open={open} onClose={() => setOpen(false)} title={`${editing ? 'Edit' : 'Add'} Expense`} className="max-w-3xl"><form onSubmit={submit} className="space-y-4">
      {error && <div className="rounded bg-red-50 p-3 text-sm text-red-800">{error}</div>}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="Date *"><input required type="date" className={fieldClass} value={form.date} onChange={set('date')} /></Field>
        <Field label="Category *"><select className={fieldClass} value={form.category} onChange={set('category')}>{CATEGORIES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field>
        <Field label="Vendor / Particulars"><input className={fieldClass} placeholder="Vendor / Particulars" value={form.vendor} onChange={set('vendor')} /></Field>
        <Field label="Amount ₹ *"><input required type="number" min="0" step="0.01" className={fieldClass} placeholder="Amount ₹" value={form.amount} onChange={set('amount')} /></Field>
        <Field label="Bill / Receipt Number"><input className={fieldClass} placeholder="Bill / Receipt Number" value={form.billNumber} onChange={set('billNumber')} /></Field>
        <Field label="Payment Status"><select className={fieldClass} value={form.paymentStatus} onChange={set('paymentStatus')}>{PAYMENT_STATUSES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field>
        {isAdmin && <Field label="Approval"><select className={fieldClass} value={form.approval} onChange={set('approval')}>{APPROVALS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field>}
        <Field label="Remarks" className={isAdmin ? 'lg:col-span-2' : 'sm:col-span-2'}><input className={fieldClass} placeholder="Remarks" value={form.remarks} onChange={set('remarks')} /></Field>
      </div>
      {isAdmin && <Field label="Owner review"><input className={fieldClass} placeholder="Owner review note" value={form.ownerReview} onChange={set('ownerReview')} /></Field>}
      <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button><Button type="submit" disabled={saving}>{saving ? 'Saving...' : 'Save'}</Button></div>
    </form></Modal>

    <Modal open={!!review} onClose={() => setReview(null)} title="Owner review" className="max-w-lg"><form onSubmit={submitReview} className="space-y-4">
      <Field label="Decision"><select className={fieldClass} value={review?.approval || 'approved'} onChange={(event) => setReview({ ...review, approval: event.target.value })}>{APPROVALS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field>
      <Field label="Owner review note"><textarea rows="3" className={fieldClass} value={review?.ownerReview || ''} onChange={(event) => setReview({ ...review, ownerReview: event.target.value })} /></Field>
      <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={() => setReview(null)}>Back</Button><Button type="submit" disabled={saving}>Save review</Button></div>
    </form></Modal>
  </div>;
}
