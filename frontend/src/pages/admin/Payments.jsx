import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, Calendar, ChevronLeft, ChevronRight, CreditCard, FileText, Inbox, IndianRupee, RefreshCw } from 'lucide-react';
import api from '../../api/axios.js';
import Card from '../../components/ui/Card.jsx';
import Button from '../../components/ui/Button.jsx';
import Badge from '../../components/ui/Badge.jsx';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
const SERVER_BASE = API_BASE.replace(/\/api\/?$/, '');
const PAGE_SIZE = 10;
const localDateParts = () => {
  const now = new Date();
  return {
    year: now.getFullYear(),
    month: String(now.getMonth() + 1).padStart(2, '0'),
    day: String(now.getDate()).padStart(2, '0'),
  };
};
const todayValue = () => {
  const { year, month, day } = localDateParts();
  return `${year}-${month}-${day}`;
};
const monthValue = () => {
  const { year, month } = localDateParts();
  return `${year}-${month}`;
};

const formatMoney = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;

const formatDate = (iso) =>
  iso ? new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '-';

const formatDateTime = (iso) =>
  iso
    ? new Date(iso).toLocaleString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '-';

const FileLinks = ({ files = [], fallbackUrl }) => {
  const list = files?.length ? files : fallbackUrl ? [{ url: fallbackUrl, fileName: 'Screenshot' }] : [];
  if (!list.length) return <span className="text-charcoal/40">-</span>;
  return (
    <div className="flex flex-wrap gap-2">
      {list.map((file, index) => (
        <a
          key={`${file.url}-${index}`}
          href={`${SERVER_BASE}${file.url}`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 font-semibold text-sage hover:text-charcoal"
        >
          <FileText size={14} /> {index + 1}
        </a>
      ))}
    </div>
  );
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
  const [dateType, setDateType] = useState('paid');
  const [reloadKey, setReloadKey] = useState(0);

  const params = useMemo(
    () => ({
      filter,
      dateType,
      page,
      limit: PAGE_SIZE,
      date: filter === 'date' ? date : undefined,
      month: filter === 'month' ? month : undefined,
    }),
    [date, dateType, filter, month, page]
  );

  useEffect(() => {
    setPage(1);
  }, [date, dateType, filter, month]);

  useEffect(() => {
    const fetchPayments = async () => {
      setLoading(true);
      setError('');
      try {
        const { data } = await api.get('/patients/payments-ledger', { params });
        setPayments(data.payments || []);
        setTotalAmount(data.totalAmount || 0);
        setTotal(data.total || 0);
        setPages(data.pages || 1);
      } catch (err) {
        setError(err.response?.data?.message || 'Could not load payments.');
      } finally {
        setLoading(false);
      }
    };
    fetchPayments();
  }, [params, reloadKey]);

  return (
    <div>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-charcoal">Payments</h1>
          <p className="mt-1 text-sm text-charcoal/60">Admin ledger for all patient phase transactions.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={dateType}
            onChange={(e) => setDateType(e.target.value)}
            className="rounded-lg border border-cardline bg-offwhite-200 px-3.5 py-2.5 text-sm text-charcoal focus:border-sage focus:outline-none focus:ring-2 focus:ring-sage/20"
          >
            <option value="paid">Filter by paid date</option>
            <option value="added">Filter by added date</option>
          </select>
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="rounded-lg border border-cardline bg-offwhite-200 px-3.5 py-2.5 text-sm text-charcoal focus:border-sage focus:outline-none focus:ring-2 focus:ring-sage/20"
          >
            <option value="all">All</option>
            <option value="today">Today</option>
            <option value="date">Date</option>
            <option value="month">Month</option>
          </select>
          {filter === 'date' && (
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="rounded-lg border border-cardline bg-offwhite-200 px-3.5 py-2.5 text-sm text-charcoal focus:border-sage focus:outline-none focus:ring-2 focus:ring-sage/20"
            />
          )}
          {filter === 'month' && (
            <input
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="rounded-lg border border-cardline bg-offwhite-200 px-3.5 py-2.5 text-sm text-charcoal focus:border-sage focus:outline-none focus:ring-2 focus:ring-sage/20"
            />
          )}
        </div>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <Card>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-sage-muted/25 text-sage">
              <IndianRupee size={19} />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-charcoal/55">Transaction Amount</p>
              <p className="mt-1 font-display text-2xl font-bold text-charcoal">{loading ? '...' : formatMoney(totalAmount)}</p>
            </div>
          </div>
        </Card>
        <Card>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#E8D5B5] text-charcoal">
              <CreditCard size={19} />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-charcoal/55">Transactions</p>
              <p className="mt-1 font-display text-2xl font-bold text-charcoal">{loading ? '...' : total}</p>
            </div>
          </div>
        </Card>
        <Card>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-offwhite-300 text-sage">
              <Calendar size={19} />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-charcoal/55">Date Basis</p>
              <p className="mt-1 text-base font-bold text-charcoal">{dateType === 'paid' ? 'Paid Date' : 'Added Date'}</p>
            </div>
          </div>
        </Card>
      </div>

      <Card className="mt-6" padded={false}>
        <div className="flex items-center justify-between border-b border-cardline-soft px-5 py-4">
          <h2 className="font-display text-base font-bold text-charcoal">Payment Transactions</h2>
          <Button variant="outline" size="sm" onClick={() => setReloadKey((value) => value + 1)}>
            <RefreshCw size={14} /> Refresh
          </Button>
        </div>

        {loading ? (
          <div className="p-10 text-center text-sm text-charcoal/55">Loading payments...</div>
        ) : error ? (
          <div className="flex flex-col items-center gap-2 p-10 text-center">
            <AlertTriangle size={22} className="text-[#8C3B2E]" />
            <p className="text-sm font-medium text-charcoal">{error}</p>
          </div>
        ) : payments.length === 0 ? (
          <div className="flex flex-col items-center gap-2 p-10 text-center">
            <Inbox size={22} className="text-charcoal/35" />
            <p className="text-sm font-medium text-charcoal">No payments found</p>
            <p className="text-xs text-charcoal/55">Try changing the date or month filter.</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-cardline-soft text-left text-xs uppercase tracking-wide text-charcoal/55">
                    <th className="px-5 py-3 font-semibold">Patient</th>
                    <th className="px-5 py-3 font-semibold">Phase</th>
                    <th className="px-5 py-3 font-semibold">Amount</th>
                    <th className="px-5 py-3 font-semibold">Paid Date</th>
                    <th className="px-5 py-3 font-semibold">Added Date</th>
                    <th className="px-5 py-3 font-semibold">Mode</th>
                    <th className="px-5 py-3 font-semibold">UTR</th>
                    <th className="px-5 py-3 font-semibold">Transaction No.</th>
                    <th className="px-5 py-3 font-semibold">Edited By</th>
                    <th className="px-5 py-3 font-semibold">File</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map((payment) => (
                    <tr key={payment.id} className="border-b border-cardline-soft last:border-0 hover:bg-offwhite-300/25">
                      <td className="px-5 py-3.5">
                        <Link to={`/admin/patients/${payment.patientId}`} className="font-semibold text-charcoal hover:text-sage">
                          {payment.patientName}
                        </Link>
                        <p className="mt-0.5 text-xs text-charcoal/50">{payment.patientNumber || '-'}</p>
                      </td>
                      <td className="px-5 py-3.5">
                        <Badge tone="teal">Phase {payment.stage}</Badge>
                      </td>
                      <td className="px-5 py-3.5 font-bold text-charcoal">{formatMoney(payment.amount)}</td>
                      <td className="px-5 py-3.5 text-charcoal/70">{formatDate(payment.paidAt)}</td>
                      <td className="px-5 py-3.5 text-charcoal/70">{formatDateTime(payment.addedAt)}</td>
                      <td className="px-5 py-3.5 text-charcoal/70">{payment.paymentModeLabel || '-'}</td>
                      <td className="px-5 py-3.5 text-charcoal/70">{payment.utr || '-'}</td>
                      <td className="px-5 py-3.5 text-charcoal/70">{payment.transactionId || '-'}</td>
                      <td className="px-5 py-3.5 text-charcoal/70">
                        {payment.editedByName ? (
                          <>
                            <span className="font-semibold text-charcoal">{payment.editedByName}</span>
                            <p className="mt-0.5 text-xs text-charcoal/50">{formatDateTime(payment.editedAt)}</p>
                          </>
                        ) : (
                          '-'
                        )}
                      </td>
                      <td className="px-5 py-3.5">
                        <FileLinks files={payment.screenshotFiles} fallbackUrl={payment.screenshotUrl} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between border-t border-cardline-soft px-5 py-3.5">
              <span className="text-xs text-charcoal/55">
                Page {page} of {pages} - {total} transactions
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
    </div>
  );
};

export default Payments;
