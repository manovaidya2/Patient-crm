import FinancialLedger from './FinancialLedger.jsx';

export default function Payments() {
  return <FinancialLedger kind="all" title="Payments" initialStatus="pending" />;
}
