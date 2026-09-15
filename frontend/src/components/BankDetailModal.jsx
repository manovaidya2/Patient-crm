import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, Download, IndianRupee, Inbox, X } from 'lucide-react';
import api from '../api/axios.js';
import Button from './ui/Button.jsx';
import Badge from './ui/Badge.jsx';

const formatMoney = (value) => `Rs ${Number(value || 0).toLocaleString('en-IN')}`;

const formatDate = (iso) =>
  iso ? new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '-';

const csvCell = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;

const downloadCsv = (bank, transactions) => {
  const header = ['#', 'Patient', 'Amount', 'Mode', 'UTR / Transaction ID', 'Paid Date', 'Verified Date'];
  const rows = transactions.map((t, index) => [
    index + 1,
    t.patientName,
    t.amount,
    t.paymentModeLabel,
    t.utr || t.transactionId || '-',
    formatDate(t.paidAt),
    t.approvedAt ? formatDate(t.approvedAt) : '-',
  ]);
  const csv = [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${(bank.displayName || bank.name).replace(/[^a-z0-9]+/gi, '-')}-transactions.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

// Drill-down for one bank account — from/to range, live totals for that range, and
// every matching transaction. Opened as an overlay from wherever a bank row is clicked
// (Dashboard, Accounts) so there's no separate "bank details" page to navigate to.
const BankDetailModal = ({ bank, onClose }) => {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [transactions, setTransactions] = useState([]);
  const [totalAmount, setTotalAmount] = useState(0);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchTransactions = async () => {
      setLoading(true);
      setError('');
      try {
        const { data } = await api.get('/patients/payments-ledger', {
          params: { bankId: bank.id, from: from || undefined, to: to || undefined, limit: 2000 },
        });
        setTransactions(data.payments || []);
        setTotalAmount(data.totalAmount || 0);
        setTotal(data.total || 0);
      } catch (err) {
        setError(err.response?.data?.message || 'Could not load transactions.');
      } finally {
        setLoading(false);
      }
    };
    fetchTransactions();
  }, [bank.id, from, to]);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-charcoal/35 p-3 backdrop-blur-sm sm:p-6">
      <div className="w-full max-w-3xl rounded-xl2 border border-cardline bg-offwhite-100 shadow-card">
        <div className="flex items-start justify-between gap-3 border-b border-cardline-soft p-5">
          <div className="flex min-w-0 items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-sage-muted/25 text-sage">
              <IndianRupee size={20} />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-display text-lg font-bold text-charcoal">{bank.displayName || bank.name}</h2>
                <Badge tone="teal">Bank Transfer</Badge>
              </div>
              <p className="mt-0.5 truncate text-xs text-charcoal/55">
                {[bank.accountNumber && `A/C: ${bank.accountNumber}`, bank.ifsc, bank.branch].filter(Boolean).join(' · ') || bank.name}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 rounded-md p-1.5 text-charcoal/55 transition hover:bg-sage-muted/20 hover:text-charcoal"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-cardline-soft p-5">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-charcoal/60">From</label>
              <input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="rounded-lg border border-cardline bg-offwhite-200 px-3 py-2 text-sm text-charcoal focus:border-sage focus:outline-none focus:ring-2 focus:ring-sage/20"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-charcoal/60">To</label>
              <input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="rounded-lg border border-cardline bg-offwhite-200 px-3 py-2 text-sm text-charcoal focus:border-sage focus:outline-none focus:ring-2 focus:ring-sage/20"
              />
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={() => downloadCsv(bank, transactions)} disabled={loading || transactions.length === 0}>
            <Download size={14} /> Download CSV
          </Button>
        </div>

        <div className="flex flex-wrap gap-3 p-5 pb-0">
          <div className="rounded-lg border border-sage/25 bg-sage-muted/15 px-4 py-2.5">
            <p className="text-xs font-semibold text-sage">Total Collected</p>
            <p className="mt-0.5 font-display text-xl font-bold text-sage">{loading ? '...' : formatMoney(totalAmount)}</p>
          </div>
          <div className="rounded-lg border border-cardline bg-offwhite-200 px-4 py-2.5">
            <p className="text-xs font-semibold text-charcoal/55">Transactions</p>
            <p className="mt-0.5 font-display text-xl font-bold text-charcoal">{loading ? '...' : total}</p>
          </div>
        </div>

        <div className="max-h-[50vh] overflow-y-auto p-5">
          {error ? (
            <div className="flex flex-col items-center gap-2 py-8 text-center">
              <AlertTriangle size={20} className="text-[#8C3B2E]" />
              <p className="text-sm font-medium text-charcoal">{error}</p>
            </div>
          ) : loading ? (
            <p className="py-8 text-center text-sm text-charcoal/55">Loading transactions...</p>
          ) : transactions.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-8 text-center">
              <Inbox size={20} className="text-charcoal/35" />
              <p className="text-sm font-medium text-charcoal">No transactions in this range</p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {transactions.map((payment, index) => (
                <div key={payment.id} className="rounded-lg border border-cardline-soft bg-offwhite-200 px-3.5 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-semibold text-charcoal/40">#{index + 1}</span>
                    <Link to={`/admin/patients/${payment.patientId}`} className="font-bold text-charcoal hover:text-sage">
                      {payment.patientName}
                    </Link>
                    <span className="font-display font-bold text-sage">{formatMoney(payment.amount)}</span>
                    <Badge tone="teal">{payment.paymentModeLabel}</Badge>
                  </div>
                  <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-charcoal/60">
                    {(payment.utr || payment.transactionId) && (
                      <span>UTR: <span className="font-semibold text-charcoal">{payment.utr || payment.transactionId}</span></span>
                    )}
                    <span>Paid: {formatDate(payment.paidAt)}</span>
                    {payment.approvedAt && <span className="font-semibold text-sage">&#10003; Verified: {formatDate(payment.approvedAt)}</span>}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default BankDetailModal;
