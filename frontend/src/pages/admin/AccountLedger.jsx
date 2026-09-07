import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Pencil, Plus, RefreshCw, TrendingDown, TrendingUp } from 'lucide-react';
import api from '../../api/axios.js';
import Badge from '../../components/ui/Badge.jsx';
import Button from '../../components/ui/Button.jsx';
import Card from '../../components/ui/Card.jsx';
import Input from '../../components/ui/Input.jsx';
import Modal from '../../components/ui/Modal.jsx';

const todayValue = () => {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

const monthValue = () => {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
};

const formatMoney = (value) => `Rs ${Number(value || 0).toLocaleString('en-IN')}`;
const formatDate = (iso) => (iso ? new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '-');
const formatDateTime = (iso) =>
  iso
    ? new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : '-';

const defaultCategory = (type) => (type === 'income' ? 'appointment_fee' : 'other');
const incomeCategoryValues = ['appointment_fee', 'medicine_fee', 'patient_payment', 'other'];
const expenseCategoryValues = ['courier', 'medicine_purchase', 'salary', 'rent', 'utility', 'office', 'other'];

const AccountLedger = ({ type }) => {
  const isIncome = type === 'income';
  const [entries, setEntries] = useState([]);
  const [categories, setCategories] = useState([]);
  const [totals, setTotals] = useState({ income: 0, expense: 0, courierExpense: 0 });
  const [filter, setFilter] = useState('month');
  const [date, setDate] = useState(todayValue());
  const [month, setMonth] = useState(monthValue());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState({
    type,
    category: defaultCategory(type),
    amount: '',
    date: todayValue(),
    partyName: '',
    paymentMode: '',
    referenceNumber: '',
    notes: '',
  });
  const [saving, setSaving] = useState(false);
  const [modalError, setModalError] = useState('');

  const params = useMemo(
    () => ({
      type,
      filter,
      date: filter === 'date' ? date : undefined,
      month: filter === 'month' ? month : undefined,
    }),
    [date, filter, month, type]
  );

  useEffect(() => {
    const fetchRows = async () => {
      setLoading(true);
      setError('');
      try {
        const { data } = await api.get('/accounts/overview', { params });
        setEntries(data.entries || []);
        setTotals(data.totals || { income: 0, expense: 0, courierExpense: 0 });
        setCategories(data.categories || []);
      } catch (err) {
        setError(err.response?.data?.message || 'Could not load account records.');
      } finally {
        setLoading(false);
      }
    };
    fetchRows();
  }, [params, reloadKey]);

  const openAdd = () => {
    setForm({
      type,
      category: defaultCategory(type),
      amount: '',
      date: todayValue(),
      partyName: '',
      paymentMode: '',
      referenceNumber: '',
      notes: '',
    });
    setModal({ mode: 'add' });
    setModalError('');
  };

  const openEdit = (entry) => {
    setForm({
      type,
      category: entry.category,
      amount: entry.amount,
      date: entry.date ? entry.date.slice(0, 10) : todayValue(),
      partyName: entry.partyName || '',
      paymentMode: entry.paymentMode || '',
      referenceNumber: entry.referenceNumber || '',
      notes: entry.notes || '',
    });
    setModal({ mode: 'edit', entry });
    setModalError('');
  };

  const submitEntry = async (event) => {
    event.preventDefault();
    setSaving(true);
    setModalError('');
    try {
      if (modal.mode === 'edit') {
        await api.patch(`/accounts/entries/${modal.entry.id}`, form);
      } else {
        await api.post('/accounts/entries', form);
      }
      setModal(null);
      setReloadKey((value) => value + 1);
    } catch (err) {
      setModalError(err.response?.data?.message || 'Could not save entry.');
    } finally {
      setSaving(false);
    }
  };

  const totalAmount = isIncome ? totals.income : totals.expense;
  const pageTitle = isIncome ? 'Income' : 'Expenses';
  const icon = isIncome ? <TrendingUp size={19} /> : <TrendingDown size={19} />;
  const visibleCategories = categories.filter((category) =>
    (isIncome ? incomeCategoryValues : expenseCategoryValues).includes(category.value)
  );

  return (
    <div>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-charcoal">{pageTitle}</h1>
          <p className="mt-1 text-sm text-charcoal/60">{isIncome ? 'Appointment, medicine and other income records.' : 'Clinic, courier and operational expense records.'}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={() => setReloadKey((value) => value + 1)}>
            <RefreshCw size={15} /> Refresh
          </Button>
          <Button onClick={openAdd}>
            <Plus size={15} /> Add {isIncome ? 'Income' : 'Expense'}
          </Button>
        </div>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <Card>
          <div className="flex items-center gap-3">
            <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${isIncome ? 'bg-sage-muted/25 text-sage' : 'bg-[#8C3B2E]/10 text-[#8C3B2E]'}`}>
              {icon}
            </div>
            <div>
              <p className="text-xs font-semibold uppercase text-charcoal/55">Total {pageTitle}</p>
              <p className={`font-display text-2xl font-bold ${isIncome ? 'text-sage' : 'text-[#8C3B2E]'}`}>{loading ? '...' : formatMoney(totalAmount)}</p>
            </div>
          </div>
        </Card>
        <Card>
          <p className="text-xs font-semibold uppercase text-charcoal/55">Records</p>
          <p className="mt-1 font-display text-2xl font-bold text-charcoal">{loading ? '...' : entries.length}</p>
        </Card>
        {!isIncome && (
          <Card>
            <p className="text-xs font-semibold uppercase text-charcoal/55">Courier Paid By Clinic</p>
            <p className="mt-1 font-display text-2xl font-bold text-charcoal">{loading ? '...' : formatMoney(totals.courierExpense)}</p>
          </Card>
        )}
      </div>

      <Card className="mt-6" padded={false}>
        <div className="flex flex-col gap-3 border-b border-cardline-soft p-4 lg:flex-row lg:items-center lg:justify-between">
          <h2 className="font-display text-base font-bold text-charcoal">{pageTitle} Ledger</h2>
          <div className="flex flex-wrap items-center gap-2">
            <select value={filter} onChange={(e) => setFilter(e.target.value)} className="rounded-lg border border-cardline bg-offwhite-200 px-3.5 py-2.5 text-sm text-charcoal focus:border-sage focus:outline-none focus:ring-2 focus:ring-sage/20">
              <option value="all">All</option>
              <option value="today">Today</option>
              <option value="date">Date</option>
              <option value="month">Month</option>
            </select>
            {filter === 'date' && <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="rounded-lg border border-cardline bg-offwhite-200 px-3.5 py-2.5 text-sm text-charcoal focus:border-sage focus:outline-none focus:ring-2 focus:ring-sage/20" />}
            {filter === 'month' && <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="rounded-lg border border-cardline bg-offwhite-200 px-3.5 py-2.5 text-sm text-charcoal focus:border-sage focus:outline-none focus:ring-2 focus:ring-sage/20" />}
          </div>
        </div>

        {loading ? (
          <div className="p-10 text-center text-sm text-charcoal/55">Loading {pageTitle.toLowerCase()}...</div>
        ) : error ? (
          <div className="flex flex-col items-center gap-2 p-10 text-center">
            <AlertTriangle size={22} className="text-[#8C3B2E]" />
            <p className="text-sm font-medium text-charcoal">{error}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-cardline-soft text-left text-xs uppercase tracking-wide text-charcoal/55">
                  <th className="px-5 py-3 font-semibold">Date</th>
                  <th className="px-5 py-3 font-semibold">Category</th>
                  <th className="px-5 py-3 font-semibold">Party</th>
                  <th className="px-5 py-3 font-semibold">Amount</th>
                  <th className="px-5 py-3 font-semibold">Mode / Ref</th>
                  <th className="px-5 py-3 font-semibold">Recorded</th>
                  <th className="px-5 py-3 font-semibold">Notes</th>
                  <th className="px-5 py-3 font-semibold">Action</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <tr key={entry.id} className="border-b border-cardline-soft last:border-0 hover:bg-offwhite-300/25">
                    <td className="px-5 py-3.5 text-charcoal/70">{formatDate(entry.date)}</td>
                    <td className="px-5 py-3.5">
                      <Badge tone={isIncome ? 'teal' : 'danger'}>{entry.categoryLabel}</Badge>
                    </td>
                    <td className="px-5 py-3.5 text-charcoal/70">{entry.partyName || '-'}</td>
                    <td className={`px-5 py-3.5 font-bold ${isIncome ? 'text-sage' : 'text-[#8C3B2E]'}`}>{formatMoney(entry.amount)}</td>
                    <td className="px-5 py-3.5 text-charcoal/70">
                      {entry.paymentMode || '-'}
                      {entry.referenceNumber && <p className="mt-0.5 text-xs text-charcoal/50">{entry.referenceNumber}</p>}
                    </td>
                    <td className="px-5 py-3.5 text-charcoal/70">
                      {entry.recordedByName || '-'}
                      {entry.editedByName && <p className="mt-0.5 text-xs text-charcoal/50">Edited by {entry.editedByName} on {formatDateTime(entry.editedAt)}</p>}
                    </td>
                    <td className="max-w-xs px-5 py-3.5 text-charcoal/70">{entry.notes || '-'}</td>
                    <td className="px-5 py-3.5">
                      {entry.source === 'manual' ? (
                        <Button size="sm" variant="ghost" onClick={() => openEdit(entry)}>
                          <Pencil size={14} /> Edit
                        </Button>
                      ) : (
                        <span className="text-xs font-semibold text-charcoal/45">Auto</span>
                      )}
                    </td>
                  </tr>
                ))}
                {!entries.length && (
                  <tr>
                    <td colSpan="8" className="px-5 py-10 text-center text-charcoal/55">No {pageTitle.toLowerCase()} records found.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Modal open={!!modal} onClose={() => setModal(null)} title={modal?.mode === 'edit' ? `Edit ${pageTitle}` : `Add ${pageTitle}`} className="max-w-2xl">
        <form onSubmit={submitEntry} className="space-y-4">
          {modalError && <div className="rounded-lg bg-[#8C3B2E]/8 px-3.5 py-3 text-sm text-[#8C3B2E]">{modalError}</div>}
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-charcoal">Category</label>
              <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="w-full rounded-lg border border-cardline bg-offwhite-200 px-3.5 py-2.5 text-sm text-charcoal focus:border-sage focus:outline-none focus:ring-2 focus:ring-sage/20">
                {visibleCategories.map((category) => <option key={category.value} value={category.value}>{category.label}</option>)}
              </select>
            </div>
            <Input label="Amount" type="number" min="0" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} required />
            <Input label="Date" type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required />
            <Input label="Party / Patient / Vendor" value={form.partyName} onChange={(e) => setForm({ ...form, partyName: e.target.value })} />
            <Input label="Payment Mode" value={form.paymentMode} onChange={(e) => setForm({ ...form, paymentMode: e.target.value })} />
            <Input label="Reference / UTR / Bill No." value={form.referenceNumber} onChange={(e) => setForm({ ...form, referenceNumber: e.target.value })} />
          </div>
          <textarea rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Notes" className="w-full rounded-lg border border-cardline bg-offwhite-200 px-3.5 py-2.5 text-sm text-charcoal focus:border-sage focus:outline-none focus:ring-2 focus:ring-sage/20" />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setModal(null)}>Cancel</Button>
            <Button type="submit" disabled={saving}>{saving ? 'Saving...' : 'Save'}</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default AccountLedger;
