import { Chip } from '../purchaseOrders/CreatePurchaseOrderModal.jsx';
import { SUPPLY_OPTIONS, customKey, customMonthsOf } from '../../constants/supplyPlans.js';

// The medicine supply chips (6 months / 1+5 / 2+4) plus "Custom", where the months (1-12) are chosen. The value is the
// supply key ("2+4:first", "C4:full"; "CUSTOM" while the months are not chosen yet). `locked`: decided in post
// counselling, so only the current value can stay selected.
export default function SupplyChips({ value, onChange, locked = false }) {
  const months = customMonthsOf(value);
  const custom = months > 0 || value === 'CUSTOM';
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {SUPPLY_OPTIONS.map((o) => <Chip key={o.key} title={o.hint} active={value === o.key} disabled={locked && value !== o.key} onClick={() => !locked && onChange(o.key)}>{o.label}</Chip>)}
        <Chip title="The Post Counselor chooses the months; the Medicine Department makes this patient's formulation" active={custom} disabled={locked && !custom} onClick={() => !locked && !custom && onChange('CUSTOM')}>Custom{months ? `: ${months} month${months === 1 ? '' : 's'}` : ''}</Chip>
      </div>
      {custom && (
        <label className="flex flex-wrap items-center gap-2 text-sm text-charcoal/75">
          Months of medicine
          <select className="rounded-lg border border-cardline bg-white px-2 py-1 text-sm text-charcoal" disabled={locked} value={months || ''} onChange={(event) => onChange(customKey(Number(event.target.value)))}>
            <option value="">Choose</option>
            {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
          <span className="text-xs text-charcoal/55">No master formulation: the Medicine Department makes this patient's formulation at the formulation check.</span>
        </label>
      )}
    </div>
  );
}
