import { customLengthOk, lengthText } from '../../constants/supplyPlans.js';

// A length of medicine typed by a person: months (0-12) and days (a Mental Health package can be 45 days).
// `value` is { months: '', days: '' } (strings, as typed); a month is 30 days, at most 12 months in all.
export const lengthDays = ({ months, days } = {}) => {
  const m = Number(months || 0);
  const d = Number(days || 0);
  return customLengthOk(m, d) ? m * 30 + d : 0;
};
// The fields for a length in days (45 -> 1 month 15 days); empty for 0.
export const lengthFields = (total) => {
  const n = Math.round(Number(total) || 0);
  return { months: n >= 30 ? String(Math.floor(n / 30)) : '', days: n % 30 ? String(n % 30) : '' };
};
// What the API takes: { months, days } as numbers.
export const lengthBody = (value) => ({ months: Number(value?.months || 0), days: Number(value?.days || 0) });

export default function LengthFields({ label, value, onChange, disabled = false, required = false, hint = '', maxMonths = 12 }) {
  const set = (key) => (event) => onChange({ ...value, [key]: String(event.target.value).replace(/\D/g, '').slice(0, 3) });
  const total = lengthDays(value);
  const box = 'rounded-lg border border-cardline bg-white px-2 py-2 text-sm text-charcoal disabled:bg-[#F7F4EC] disabled:text-charcoal/60';
  return (
    <fieldset className="block text-sm font-medium text-charcoal" disabled={disabled}>
      <legend>{label}{required ? ' *' : ''}</legend>
      <div className="mt-1.5 flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1.5 font-normal text-charcoal/75">
          <select aria-label={`${label}: months`} className={box} value={value?.months || ''} onChange={set('months')}>
            <option value="">0</option>
            {Array.from({ length: maxMonths }, (_, i) => i + 1).map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
          months
        </label>
        <label className="flex items-center gap-1.5 font-normal text-charcoal/75">
          <input aria-label={`${label}: days`} type="text" inputMode="numeric" placeholder="0" className={`${box} w-16`} value={value?.days || ''} onChange={set('days')} />
          days
        </label>
      </div>
      <span className="mt-1 block text-[11px] font-normal text-charcoal/55">
        {total ? `${lengthText(total)}` : (value?.months || value?.days) ? 'From 1 day to 12 months in all' : ''}{hint ? `${total || value?.months || value?.days ? ' · ' : ''}${hint}` : ''}
      </span>
    </fieldset>
  );
}
