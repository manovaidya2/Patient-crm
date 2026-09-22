import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, Calendar, ChevronLeft, ChevronRight, CreditCard, FileText, Inbox, IndianRupee, RefreshCw } from 'lucide-react';
import api from '../../api/axios.js';
import Card from '../../components/ui/Card.jsx';
import Button from '../../components/ui/Button.jsx';

const SERVER_BASE = (import.meta.env.VITE_API_URL || 'http://localhost:5000/api').replace(/\/api\/?$/, '');
const PAGE_SIZE = 10;
const dateParts = () => { const now = new Date(); return [now.getFullYear(), String(now.getMonth() + 1).padStart(2, '0'), String(now.getDate()).padStart(2, '0')]; };
const todayValue = () => dateParts().join('-');
const monthValue = () => dateParts().slice(0, 2).join('-');
const money = (value) => `₹${Number(value || 0).toLocaleString('en-IN')}`;
const formatDate = (value) => value ? new Date(value).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '-';
const formatDateTime = (value) => value ? new Date(value).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-';

const Files = ({ files = [], fallbackUrl }) => {
  const list = files.length ? files : fallbackUrl ? [{ url: fallbackUrl }] : [];
  if (!list.length) return <span className="text-charcoal/30">-</span>;
  return <div className="flex justify-center gap-1">{list.map((file, index) => <a key={`${file.url}-${index}`} href={`${SERVER_BASE}${file.url}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-semibold text-sage hover:text-charcoal"><FileText size={12} />{index + 1}</a>)}</div>;
};

const Payments = () => {
  const [payments, setPayments] = useState([]);
  const [totalAmount, setTotalAmount] = useState(0);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('all');
  const [date, setDate] = useState(todayValue());
  const [month, setMonth] = useState(monthValue());
  const [reloadKey, setReloadKey] = useState(0);
  const params = useMemo(() => ({ filter, dateType: 'paid', page, limit: PAGE_SIZE, date: filter === 'date' ? date : undefined, month: filter === 'month' ? month : undefined }), [date, filter, month, page]);

  useEffect(() => setPage(1), [date, filter, month]);
  useEffect(() => {
    const load = async () => {
      setLoading(true); setError('');
      try { const { data } = await api.get('/patients/payments-ledger', { params }); setPayments(data.payments || []); setTotalAmount(data.totalAmount || 0); setTotal(data.total || 0); setPages(data.pages || 1); }
      catch (err) { setError(err.response?.data?.message || 'Could not load payment ledger.'); }
      finally { setLoading(false); }
    };
    load();
  }, [params, reloadKey]);

  return <div>
    <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
      <div><h1 className="font-display text-2xl font-bold text-charcoal">Payment Ledger</h1><p className="mt-1 text-sm text-charcoal/60">Approved patient payment transactions by paid date.</p></div>
      <div className="flex flex-wrap items-end gap-2"><div><label className="mb-1 block text-[10px] font-semibold uppercase text-charcoal/55">Paid Date Filter</label><select value={filter} onChange={(event) => setFilter(event.target.value)} className="rounded-lg border border-cardline bg-offwhite-200 px-3 py-2 text-xs text-charcoal"><option value="all">All Paid Dates</option><option value="today">Today</option><option value="date">Select Date</option><option value="month">Select Month</option></select></div>{filter === 'date' && <input aria-label="Paid date" type="date" value={date} onChange={(event) => setDate(event.target.value)} className="rounded-lg border border-cardline bg-offwhite-200 px-3 py-2 text-xs text-charcoal" />}{filter === 'month' && <input aria-label="Paid month" type="month" value={month} onChange={(event) => setMonth(event.target.value)} className="rounded-lg border border-cardline bg-offwhite-200 px-3 py-2 text-xs text-charcoal" />}<Button variant="outline" size="sm" onClick={() => setReloadKey((value) => value + 1)} disabled={loading}><RefreshCw size={13} className={loading ? 'animate-spin' : ''} />Refresh</Button></div>
    </div>

    <div className="mt-5 grid gap-3 sm:grid-cols-2"><Card><div className="flex items-center gap-3"><IndianRupee size={19} className="text-sage" /><div><p className="text-[10px] font-semibold uppercase text-charcoal/50">Total Paid</p><p className="mt-0.5 font-display text-xl font-bold text-charcoal">{loading ? '...' : money(totalAmount)}</p></div></div></Card><Card><div className="flex items-center gap-3"><CreditCard size={19} className="text-sage" /><div><p className="text-[10px] font-semibold uppercase text-charcoal/50">Transactions</p><p className="mt-0.5 font-display text-xl font-bold text-charcoal">{loading ? '...' : total}</p></div></div></Card></div>
    {error && <div className="mt-5 flex items-center gap-2 rounded-lg border border-[#8C3B2E]/20 bg-[#8C3B2E]/8 px-4 py-3 text-xs text-[#8C3B2E]"><AlertTriangle size={16} />{error}</div>}

    <Card className="mt-5" padded={false}>
      <div className="flex items-center gap-2 border-b border-cardline-soft px-4 py-3"><Calendar size={16} className="text-sage" /><h2 className="font-display text-sm font-bold text-charcoal">Payment Transactions</h2></div>
      {loading ? <div className="p-10 text-center text-xs text-charcoal/55">Loading payments...</div> : payments.length === 0 ? <div className="flex flex-col items-center gap-2 p-10 text-center"><Inbox size={21} className="text-charcoal/35" /><p className="text-sm font-medium text-charcoal">No payments found</p></div> : <div className="overflow-x-auto">
        <table className="w-full min-w-[1280px] text-xs">
          <thead><tr className="border-b border-cardline bg-offwhite-200 text-left text-[10px] uppercase text-charcoal/55"><th className="px-4 py-3">Patient</th><th className="px-4 py-3">Phase</th><th className="px-4 py-3">Amount</th><th className="px-4 py-3">Paid Date</th><th className="px-4 py-3">Added Date</th><th className="px-4 py-3">Mode</th><th className="px-4 py-3">Bank</th><th className="px-4 py-3">UTR</th><th className="px-4 py-3">Transaction No.</th><th className="px-4 py-3">Edited By</th><th className="px-4 py-3 text-center">File</th></tr></thead>
          <tbody>{payments.map((payment) => <tr key={payment.id} className="border-b border-cardline-soft align-middle last:border-0 hover:bg-offwhite-300/20"><td className="px-4 py-3.5"><Link to={`/admin/patients/${payment.patientId}`} className="font-bold text-charcoal hover:text-sage">{payment.patientName}</Link><p className="mt-0.5 text-[10px] text-charcoal/45">{payment.patientNumber || '-'}</p></td><td className="whitespace-nowrap px-4 py-3.5 text-charcoal/70">Phase {payment.stage}</td><td className="whitespace-nowrap px-4 py-3.5 font-bold text-charcoal">{money(payment.amount)}</td><td className="whitespace-nowrap px-4 py-3.5 text-charcoal/65">{formatDate(payment.paidAt)}</td><td className="whitespace-nowrap px-4 py-3.5 text-charcoal/65">{formatDateTime(payment.addedAt)}</td><td className="whitespace-nowrap px-4 py-3.5 text-charcoal/65">{payment.paymentModeLabel || '-'}</td><td className="max-w-48 px-4 py-3.5 text-charcoal/65">{payment.payToBankName || payment.receivedBy || '-'}</td><td className="max-w-36 break-words px-4 py-3.5 text-charcoal/65">{payment.utr || '-'}</td><td className="max-w-36 break-words px-4 py-3.5 text-charcoal/65">{payment.transactionId || '-'}</td><td className="px-4 py-3.5 text-charcoal/65">{payment.editedByName || '-'}{payment.editedByName && <p className="mt-0.5 whitespace-nowrap text-[10px] text-charcoal/40">{formatDateTime(payment.editedAt)}</p>}</td><td className="px-4 py-3.5 text-center"><Files files={payment.screenshotFiles} fallbackUrl={payment.screenshotUrl} /></td></tr>)}</tbody>
        </table>
      </div>}
      {!loading && payments.length > 0 && <div className="flex items-center justify-between border-t border-cardline-soft px-4 py-3"><span className="text-[10px] text-charcoal/50">Page {page} of {pages} · {total} transactions</span><div className="flex gap-1"><button onClick={() => setPage((value) => Math.max(value - 1, 1))} disabled={page <= 1} aria-label="Previous page" className="rounded-md p-1.5 text-sage disabled:opacity-30"><ChevronLeft size={15} /></button><button onClick={() => setPage((value) => Math.min(value + 1, pages))} disabled={page >= pages} aria-label="Next page" className="rounded-md p-1.5 text-sage disabled:opacity-30"><ChevronRight size={15} /></button></div></div>}
    </Card>
  </div>;
};

export default Payments;
