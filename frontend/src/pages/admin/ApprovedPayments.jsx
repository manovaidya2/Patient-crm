import FinancialLedger from './FinancialLedger.jsx';

export default function ApprovedPayments() {
  return <FinancialLedger kind="all" title="Approved Payments" fixedStatus="approved" />;
}
