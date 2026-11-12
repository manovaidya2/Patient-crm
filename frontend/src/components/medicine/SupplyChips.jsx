import { useEffect, useState } from 'react';
import { Chip } from '../purchaseOrders/CreatePurchaseOrderModal.jsx';
import { SUPPLY_OPTIONS, customKey, customLengthOf, customLengthOk, customText } from '../../constants/supplyPlans.js';

// The medicine supply chips (6 months / 1+5 / 2+4) plus "Custom", where the months (0-12) and days are chosen (a
// Mental Health package can be 45 days). The value is the supply key ("2+4:first", "C4:full", "C0m45d:full";
// "CUSTOM" while the length is not chosen yet). `locked`: decided in post counselling, so only the current value can
// stay selected.
export default function SupplyChips({ value, onChange, locked = false }) {
  const length = customLengthOf(value);
  const custom = Boolean(length) || value === 'CUSTOM';
  const [typed, setTyped] = useState({ months: length ? String(length.months) : '', days: length?.days ? String(length.days) : '' });
  // A value set from outside (another supply opened) shows in the fields; what is being typed is left alone.
  useEffect(() => {
    if (!length) return;
    setTyped((old) => (Number(old.months || 0) === length.months && Number(old.days || 0) === length.days ? old : { months: String(length.months), days: length.days ? String(length.days) : '' }));
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps
  const change = (key) => (event) => {
    const next = { ...typed, [key]: String(event.target.value).replace(/\D/g, '').slice(0, 3) };
    setTyped(next);
    const months = Number(next.months || 0);
    const days = Number(next.days || 0);
    onChange(customLengthOk(months, days) ? customKey(months, days) : 'CUSTOM');
  };
  const field = 'rounded-lg border border-cardline bg-white px-2 py-1 text-sm text-charcoal';
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {SUPPLY_OPTIONS.map((o) => <Chip key={o.key} title={o.hint} active={value === o.key} disabled={locked && value !== o.key} onClick={() => !locked && onChange(o.key)}>{o.label}</Chip>)}
        <Chip title="The Post Counselor chooses the months and days; the Medicine Department makes this patient's formulation" active={custom} disabled={locked && !custom} onClick={() => !locked && !custom && onChange('CUSTOM')}>Custom{length ? `: ${customText(length)}` : ''}</Chip>
      </div>
      {custom && (
        <div className="flex flex-wrap items-center gap-2 text-sm text-charcoal/75">
          <label className="flex items-center gap-1.5">
            Months
            <select className={field} disabled={locked} value={typed.months} onChange={change('months')}>
              <option value="">0</option>
              {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </label>
          <label className="flex items-center gap-1.5">
            Days
            <input type="text" inputMode="numeric" className={`${field} w-20`} disabled={locked} value={typed.days} placeholder="0" onChange={change('days')} />
          </label>
          <span className="text-xs text-charcoal/55">
            {length ? `${customText(length)} of medicine.` : 'For example 45 days: 0 months and 45 days.'} Up to 12 months in all. No master formulation: the Medicine Department makes this patient's formulation at the formulation check.
          </span>
        </div>
      )}
    </div>
  );
}
