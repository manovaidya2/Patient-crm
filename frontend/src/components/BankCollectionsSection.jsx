import { useEffect, useState } from 'react';
import api from '../api/axios.js';
import Badge from './ui/Badge.jsx';
import BankDetailModal from './BankDetailModal.jsx';

const formatMoney = (value) => `Rs ${Number(value || 0).toLocaleString('en-IN')}`;

// Inline "bank-wise collections" list — every row from `rows` (already scoped/filtered
// by the caller) merged with its BankAccount record for the account badge/A-C details,
// and clickable straight into BankDetailModal. No separate page to navigate to.
const BankCollectionsSection = ({
  rows = [],
  loading = false,
  eyebrow = 'Bank Reconciliation',
  title = 'Bank-wise online payments',
  caption = '',
  icon: Icon,
  emptyText = 'No online bank payments in this period.',
}) => {
  const [banks, setBanks] = useState([]);
  const [selectedBank, setSelectedBank] = useState(null);

  useEffect(() => {
    let active = true;
    api
      .get('/banks')
      .then(({ data }) => {
        if (active) setBanks(data.banks || []);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  const banksById = banks.reduce((acc, bank) => {
    acc[bank.id] = bank;
    return acc;
  }, {});

  return (
    <>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-charcoal/55">{eyebrow}</p>
          <h2 className="mt-1 font-display text-xl font-bold text-charcoal">{title}</h2>
          {caption && <p className="mt-1 text-xs text-charcoal/55">{caption}</p>}
        </div>
        {Icon && <Icon size={22} className="shrink-0 text-sage" />}
      </div>

      <div className="mt-5">
        {loading ? (
          <p className="text-sm text-charcoal/55">Loading banks...</p>
        ) : rows.length === 0 ? (
          <p className="rounded-lg border border-cardline bg-offwhite-200 px-3.5 py-3 text-sm text-charcoal/55">{emptyText}</p>
        ) : (
          <ul className="space-y-2">
            {rows.map((row) => {
              const bank = banksById[row.bankId];
              const clickable = Boolean(bank);
              const Wrapper = clickable ? 'button' : 'div';
              return (
                <li key={row.bankId}>
                  <Wrapper
                    type={clickable ? 'button' : undefined}
                    onClick={clickable ? () => setSelectedBank(bank) : undefined}
                    className={`flex w-full items-center gap-3 rounded-lg border border-cardline bg-offwhite-200 px-3.5 py-3 text-left ${
                      clickable ? 'transition hover:border-sage hover:bg-sage-muted/10' : ''
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <p className="truncate text-sm font-bold text-charcoal">{row.bankName}</p>
                        {bank && !bank.isActive && <Badge tone="inactive">Inactive</Badge>}
                      </div>
                      {bank && (bank.accountNumber || bank.ifsc || bank.branch) && (
                        <p className="mt-0.5 truncate text-xs text-charcoal/55">
                          {[bank.accountNumber && `A/C: ${bank.accountNumber}`, bank.ifsc, bank.branch].filter(Boolean).join(' · ')}
                        </p>
                      )}
                      <p className="mt-0.5 text-xs text-charcoal/55">{row.count} transaction{row.count === 1 ? '' : 's'}</p>
                    </div>
                    <p className="shrink-0 font-display text-lg font-bold text-sage">{formatMoney(row.amount)}</p>
                  </Wrapper>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {selectedBank && <BankDetailModal bank={selectedBank} onClose={() => setSelectedBank(null)} />}
    </>
  );
};

export default BankCollectionsSection;
