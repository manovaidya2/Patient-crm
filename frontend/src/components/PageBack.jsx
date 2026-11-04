import { useNavigate, useLocation } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

// One "Back" on every page reached from another page of the app (e.g. Team Chat opened from a purchase order's
// "Raise query"): it goes back to where you came from. Pages that already have their own Back are skipped.
const OWN_BACK = [/^\/admin\/purchase-orders\/[^/]+$/, /^\/admin\/medicine-jobs\/[^/]+$/, /^\/admin\/patients\/[^/]+$/, /^\/admin\/package-not-bought\/[^/]+$/, /^\/admin\/hr\/candidates\/[^/]+$/];

export default function PageBack() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const cameFromApp = (window.history.state?.idx || 0) > 0;
  if (!cameFromApp || pathname === '/admin' || OWN_BACK.some((re) => re.test(pathname))) return null;
  return (
    <button type="button" onClick={() => navigate(-1)} className="mb-3 inline-flex items-center gap-1.5 text-sm font-medium text-sage hover:text-charcoal">
      <ArrowLeft size={15} /> Back
    </button>
  );
}
