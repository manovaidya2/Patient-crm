import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, Calendar, ChevronLeft, ChevronRight, CreditCard, IndianRupee, Inbox, RefreshCw } from 'lucide-react';
import api from '../../api/axios.js';
import Card from '../../components/ui/Card.jsx';
import Button from '../../components/ui/Button.jsx';
import Badge from '../../components/ui/Badge.jsx';
import { CompactAttachments } from '../../components/ui/Attachments.jsx';
import { PATIENT_CATEGORIES } from '../../constants/patientCategories.js';

const PAGE_SIZE = 10;

const categoryTone = (category) => (category === PATIENT_CATEGORIES.AUTISM_ADHD ? 'teal' : 'amber');

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

const formatMoney = (value) => `Rs ${Number(value || 0).toLocaleString('en-IN')}`;

const formatDate = (iso) =>
  iso ? new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '-';

const DetailItem = ({ label, value }) => (
  <div className="min-w-0">
    <p className="text-[10px] font-semibold uppercase tracking-wide text-charcoal/45">{label}</p>
    <p className="mt-0.5 truncate text-sm font-semibold text-charcoal" title={value}>{value}</p>
  </div>
);

// Read-only ledger of every payment that has cleared accounts approval — same card
// layout as the Patient Approvals queue, so Accounts/Doctor/Admin can pull up the full
// payment trail (mode, bank, UTR, screenshots) without opening each patient's page.
const ApprovedPayments = () => {
  const [payments, setPayments] = useState([]);
  const [totalAmount, setTotalAmount] = useState(0);
  const [bankSummary, setBankSummary] = useState([]);
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
        setBankSummary(data.bankSummary || []);
        setTotal(data.total || 0);
        setPages(data.pages || 1);
      } catch (err) {
        setError(err.response?.data?.message || 'Could not load approved payments.');
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
          <h1 className="font-display text-2xl font-bold text-charcoal">Approved Payments</h1>
          <p className="mt-1 text-sm text-charcoal/60">Every payment cleared by accounts, with full mode/bank/screenshot detail.</p>
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
          <Button variant="outline" size="sm" onClick={() => setReloadKey((value) => value + 1)} disabled={loading}>
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
          </Button>
        </div>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <Card>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-sage-muted/25 text-sage">
              <IndianRupee size={19} />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-charcoal/55">Total Approved</p>
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

      {bankSummary.length > 0 && (
        <Card className="mt-6">
          <p className="text-xs font-semibold uppercase tracking-wide text-charcoal/55">Bank-wise Online Payments</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {bankSummary.map((bank) => (
              <div key={bank.bankId} className="rounded-lg border border-cardline bg-offwhite-200 px-3.5 py-3">
                <p className="truncate text-sm font-bold text-charcoal">{bank.bankName}</p>
                <p className="mt-1 font-display text-xl font-bold text-sage">{formatMoney(bank.amount)}</p>
                <p className="mt-0.5 text-xs text-charcoal/55">{bank.count} transaction{bank.count === 1 ? '' : 's'}</p>
              </div>
            ))}
          </div>
        </Card>
      )}

      {error && (
        <div className="mt-6 flex items-center gap-2 rounded-lg border border-[#8C3B2E]/20 bg-[#8C3B2E]/8 px-4 py-3 text-sm text-[#8C3B2E]">
          <AlertTriangle size={17} /> {error}
        </div>
      )}

      <Card className="mt-6" padded={false}>
        {loading ? (
          <div className="p-10 text-center text-sm text-charcoal/55">Loading…</div>
        ) : payments.length === 0 ? (
          <div className="flex flex-col items-center gap-2 p-10 text-center">
            <Inbox size={22} className="text-charcoal/35" />
            <p className="text-sm font-medium text-charcoal">No approved payments found</p>
            <p className="text-xs text-charcoal/55">Try changing the date or month filter.</p>
          </div>
        ) : (
          <ul className="divide-y divide-cardline-soft">
            {payments.map((payment) => (
              <li key={payment.id} className="p-4 sm:p-5">
                <div className="rounded-lg border border-cardline-soft bg-offwhite-100 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link to={`/admin/patients/${payment.patientId}`} className="text-base font-bold text-charcoal hover:text-sage">
                          {payment.patientName}
                        </Link>
                        <Badge tone={categoryTone(payment.category)}>{payment.categoryLabel}</Badge>
                        <Badge tone="amber">Phase {payment.stage}</Badge>
                        <Badge tone={payment.paymentMode === 'online' ? 'teal' : 'inactive'}>{payment.paymentModeLabel}</Badge>
                      </div>
                      <p className="mt-1 text-xs text-charcoal/55">{payment.patientNumber || '-'}</p>
                    </div>
                    <p className="font-display text-xl font-bold text-sage">{formatMoney(payment.amount)}</p>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 border-t border-cardline-soft pt-3.5 sm:grid-cols-3">
                    <DetailItem label="Paid On" value={formatDate(payment.paidAt)} />
                    <DetailItem label="Added On" value={formatDate(payment.addedAt)} />
                    {payment.payToBankName && <DetailItem label="Pay To Bank" value={payment.payToBankName} />}
                    {payment.utr && <DetailItem label="UTR" value={payment.utr} />}
                    {payment.transactionId && <DetailItem label="Transaction No." value={payment.transactionId} />}
                    {payment.receivedBy && <DetailItem label="Received By" value={payment.receivedBy} />}
                    {payment.recordedByName && <DetailItem label="Recorded By" value={payment.recordedByName} />}
                    {payment.editedByName && <DetailItem label="Edited By" value={`${payment.editedByName} · ${formatDate(payment.editedAt)}`} />}
                  </div>

                  {payment.screenshotFiles?.length > 0 && (
                    <div className="mt-3.5 border-t border-cardline-soft pt-3.5">
                      <CompactAttachments files={payment.screenshotFiles} label="Screenshots" />
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}

        {!loading && payments.length > 0 && pages > 1 && (
          <div className="flex items-center justify-between border-t border-cardline-soft px-5 py-3.5">
            <p className="text-xs text-charcoal/55">Page {page} of {pages}</p>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(p - 1, 1))} disabled={page <= 1}>
                <ChevronLeft size={14} /> Prev
              </Button>
              <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.min(p + 1, pages))} disabled={page >= pages}>
                Next <ChevronRight size={14} />
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
};

export default ApprovedPayments;
