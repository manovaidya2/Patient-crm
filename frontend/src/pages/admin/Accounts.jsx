import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, ArrowRight, Calendar, CreditCard, IndianRupee, RefreshCw, RotateCcw, TrendingDown, TrendingUp } from 'lucide-react';
import api from '../../api/axios.js';
import Button from '../../components/ui/Button.jsx';
import Card from '../../components/ui/Card.jsx';
import BankCollectionsSection from '../../components/BankCollectionsSection.jsx';

const todayValue = () => {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

const monthValue = () => {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
};

const formatMoney = (value) => `Rs ${Number(value || 0).toLocaleString('en-IN')}`;

const Accounts = () => {
  const [totals, setTotals] = useState({ income: 0, expense: 0, balance: 0, courierExpense: 0, byCategory: {} });
  const [bankSummary, setBankSummary] = useState([]);
  const [refundSummary, setRefundSummary] = useState({ paid: 0, settled: 0, awaitingPayout: 0 });
  const [count, setCount] = useState(0);
  const [collections, setCollections] = useState([]);
  const [filter, setFilter] = useState('today');
  const [date, setDate] = useState(todayValue());
  const [month, setMonth] = useState(monthValue());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  const params = useMemo(
    () => ({
      filter,
      date: filter === 'date' ? date : undefined,
      month: filter === 'month' ? month : undefined,
    }),
    [date, filter, month]
  );

  useEffect(() => {
    const fetchOverview = async () => {
      setLoading(true);
      setError('');
      try {
        const { data } = await api.get('/accounts/overview', { params });
        setTotals(data.totals || { income: 0, expense: 0, balance: 0, courierExpense: 0, byCategory: {} });
        setBankSummary(data.bankSummary || []);
        setRefundSummary(data.refundSummary || { paid: 0, settled: 0, awaitingPayout: 0 });
        setCount(data.count || 0);
        setCollections(data.collections || []);
      } catch (err) {
        setError(err.response?.data?.message || 'Could not load accounts dashboard.');
      } finally {
        setLoading(false);
      }
    };
    fetchOverview();
  }, [params, reloadKey]);

  const netPositive = Number(totals.balance || 0) >= 0;
  const ledgerUrl = (href, kind, status) => {
    const query = new URLSearchParams({ kind, status });
    if (filter === 'all') query.set('period', 'all');
    else if (filter === 'month') {
      const [year, selectedMonth] = month.split('-').map(Number);
      query.set('from', `${month}-01`);
      query.set('to', `${month}-${new Date(year, selectedMonth, 0).getDate()}`);
    } else {
      query.set('from', filter === 'today' ? todayValue() : date);
      query.set('to', filter === 'today' ? todayValue() : date);
    }
    return `${href}?${query}`;
  };

  return (
    <div>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-charcoal">Accounts Dashboard</h1>
          <p className="mt-1 text-sm text-charcoal/60">Income aur expenses ka monthly/dated summary.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select value={filter} onChange={(e) => setFilter(e.target.value)} className="rounded-lg border border-cardline bg-offwhite-200 px-3.5 py-2.5 text-sm text-charcoal focus:border-sage focus:outline-none focus:ring-2 focus:ring-sage/20">
            <option value="all">All</option>
            <option value="today">Today</option>
            <option value="date">Date</option>
            <option value="month">Month</option>
          </select>
          {filter === 'date' && <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="rounded-lg border border-cardline bg-offwhite-200 px-3.5 py-2.5 text-sm text-charcoal focus:border-sage focus:outline-none focus:ring-2 focus:ring-sage/20" />}
          {filter === 'month' && <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="rounded-lg border border-cardline bg-offwhite-200 px-3.5 py-2.5 text-sm text-charcoal focus:border-sage focus:outline-none focus:ring-2 focus:ring-sage/20" />}
          <Button variant="outline" onClick={() => setReloadKey((value) => value + 1)}>
            <RefreshCw size={15} /> Refresh
          </Button>
        </div>
      </div>

      {error && (
        <div className="mt-5 flex items-center gap-2 rounded-lg border border-[#8C3B2E]/20 bg-[#8C3B2E]/8 px-4 py-3 text-sm text-[#8C3B2E]">
          <AlertTriangle size={17} /> {error}
        </div>
      )}

      <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          ['Consultation approved', 'consultation', 'approved', '/admin/accounts/consultations'],
          ['Treatment approved', 'treatment', 'approved', '/admin/accounts/treatment'],
          ['Consultation pending', 'consultation', 'pending', '/admin/payments'],
          ['Treatment pending', 'treatment', 'pending', '/admin/payments'],
        ].map(([label, kind, status, href]) => {
          const total = collections.find((row) => row._id.kind === kind && row._id.status === status);
          return <Link key={label} to={ledgerUrl(href, kind, status)} className="rounded-lg border border-cardline bg-white/60 p-3 text-charcoal hover:border-sage"><p className="text-xs font-semibold">{label}</p><p className="mt-1 text-lg font-bold">{loading ? '...' : formatMoney(total?.amount)}</p><p className="mt-1 text-xs">{total?.count || 0} receipts</p></Link>;
        })}
      </div>
      <div className="mt-6 grid gap-4 xl:grid-cols-4">
        <Card>
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-sage-muted/25 text-sage">
              <TrendingUp size={21} />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase text-charcoal/55">Manual Income Register</p>
              <p className="mt-1 font-display text-2xl font-bold text-sage">{loading ? '...' : formatMoney(totals.income)}</p>
            </div>
          </div>
        </Card>

        <Card>
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-[#8C3B2E]/10 text-[#8C3B2E]">
              <TrendingDown size={21} />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase text-charcoal/55">Total Expenses</p>
              <p className="mt-1 font-display text-2xl font-bold text-[#8C3B2E]">{loading ? '...' : formatMoney(totals.expense)}</p>
            </div>
          </div>
          <Link to="/admin/accounts/expenses" className="mt-5 inline-flex items-center gap-1 text-sm font-semibold text-sage hover:text-charcoal">
            Expenses page <ArrowRight size={14} />
          </Link>
        </Card>

        <Card>
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-[#E8D5B5] text-charcoal">
              <IndianRupee size={21} />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase text-charcoal/55">Manual Income Less Expenses</p>
              <p className={`mt-1 font-display text-2xl font-bold ${netPositive ? 'text-sage' : 'text-[#8C3B2E]'}`}>{loading ? '...' : formatMoney(totals.balance)}</p>
            </div>
          </div>
          <p className="mt-5 text-sm text-charcoal/55">{loading ? '...' : count} records in selected period</p>
        </Card>

        <Card>
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-offwhite-300 text-sage">
              <CreditCard size={21} />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase text-charcoal/55">Courier Paid By Clinic</p>
              <p className="mt-1 font-display text-2xl font-bold text-charcoal">{loading ? '...' : formatMoney(totals.courierExpense)}</p>
            </div>
          </div>
          <p className="mt-5 text-sm text-charcoal/55">Auto added from courier records</p>
        </Card>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-md border border-cardline bg-offwhite-200 px-4 py-3 text-sm text-charcoal">
        <div className="flex items-center gap-2"><RotateCcw size={17} className="text-sage" /><strong>Patient refunds</strong><span>Paid: {loading ? '...' : formatMoney(refundSummary.paid)}</span><span>Awaiting payout: {loading ? '...' : formatMoney(refundSummary.awaitingPayout)}</span><span>Settled: {loading ? '...' : formatMoney(refundSummary.settled)}</span></div>
        <Link to="/admin/accounts/refunds" className="inline-flex items-center gap-1 font-semibold text-sage hover:text-charcoal">Refund register <ArrowRight size={14} /></Link>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card>
          <BankCollectionsSection
            rows={bankSummary}
            title="Treatment bank collections"
            paymentFilter={params}
            loading={loading}
            caption="Uses the date/month filter selected above."
            icon={CreditCard}
            emptyText="No online bank payments in selected period."
          />
        </Card>

        <Card className="bg-[#E8D5B5]">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase text-charcoal/55">Manual Income Categories</p>
              <h2 className="mt-1 font-display text-xl font-bold text-charcoal">Appointment + medicine + other income</h2>
            </div>
            <Calendar size={22} className="text-sage" />
          </div>
          <div className="mt-6 grid grid-cols-3 gap-3 text-sm">
            <div><p className="text-charcoal/55">Appointment</p><p className="font-bold text-charcoal">{formatMoney(totals.byCategory?.appointment_fee)}</p></div>
            <div><p className="text-charcoal/55">Medicine</p><p className="font-bold text-charcoal">{formatMoney(totals.byCategory?.medicine_fee)}</p></div>
            <div><p className="text-charcoal/55">Patient Pay</p><p className="font-bold text-charcoal">{formatMoney(totals.byCategory?.patient_payment)}</p></div>
          </div>
        </Card>

        <Card className="bg-[#EFE3CF]">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase text-charcoal/55">Expense Categories</p>
              <h2 className="mt-1 font-display text-xl font-bold text-charcoal">Courier + medicine purchase + clinic expenses</h2>
            </div>
            <TrendingDown size={22} className="text-[#8C3B2E]" />
          </div>
          <div className="mt-6 grid grid-cols-3 gap-3 text-sm">
            <div><p className="text-charcoal/55">Courier</p><p className="font-bold text-charcoal">{formatMoney(totals.byCategory?.courier)}</p></div>
            <div><p className="text-charcoal/55">Medicine Buy</p><p className="font-bold text-charcoal">{formatMoney(totals.byCategory?.medicine_purchase)}</p></div>
            <div><p className="text-charcoal/55">Other</p><p className="font-bold text-charcoal">{formatMoney(totals.byCategory?.other)}</p></div>
          </div>
        </Card>
      </div>
    </div>
  );
};

export default Accounts;
