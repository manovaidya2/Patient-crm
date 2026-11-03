import { Plus, X } from 'lucide-react';

// One payment paid in several ways on the same day (e.g. Rs 32,000 = Rs 10,000 online + Rs 10,000 cash + Rs 12,000
// card). It is saved as ONE payment (one approval) with each part; the payment amount is the total of the parts.
export const SPLIT_MODE_OPTIONS = [['online', 'Online'], ['cash', 'Cash'], ['card', 'Card']];
const REF_LABEL = { online: 'UTR / reference', cash: 'Cash received by', card: 'Card slip / approval no. (optional)' };
export const emptySplitRows = () => [{ mode: 'online', amount: '', ref: '' }, { mode: 'cash', amount: '', ref: '' }];
export const splitTotal = (rows) => Math.round((rows || []).reduce((sum, row) => sum + (Number(String(row.amount ?? '').replace(/,/g, '')) || 0), 0) * 100) / 100;
export const splitHasOnline = (rows) => (rows || []).some((row) => row.mode === 'online');
// What the server reads (utils/splitPayment): mode, amount, utr (online / card) or receivedBy (cash).
export const splitsPayload = (rows) => JSON.stringify((rows || []).map((row) => ({
  mode: row.mode, amount: String(row.amount ?? '').trim(),
  utr: row.mode === 'cash' ? '' : String(row.ref || '').trim(), receivedBy: row.mode === 'cash' ? String(row.ref || '').trim() : '',
})));
// Rows to start an edit with, from a saved payment.
export const splitRowsFrom = (payment) => ((payment?.splits || []).length
  ? payment.splits.map((s) => ({ mode: s.mode, amount: s.amount ?? '', ref: s.mode === 'cash' ? s.receivedBy || '' : s.utr || '' }))
  : emptySplitRows());

const inputClass = 'w-full rounded-[10px] border border-[#DED2BD] bg-white px-3 py-2 text-sm text-charcoal focus:border-sage focus:outline-none focus:ring-2 focus:ring-sage/20';
const rupees = (n) => `Rs ${Number(n || 0).toLocaleString('en-IN')}`;

export default function SplitRows({ rows, onChange, idPrefix = 'split' }) {
  const list = rows?.length ? rows : emptySplitRows();
  const set = (index, key, value) => onChange(list.map((row, i) => (i === index ? { ...row, [key]: value } : row)));
  const remove = (index) => onChange(list.filter((_, i) => i !== index));
  return (
    <div className="space-y-2">
      {list.map((row, index) => (
        <div key={index} className="grid gap-2 rounded-[10px] border border-[#EFE3CF] bg-[#FBF7ED] p-2.5 sm:grid-cols-[110px_120px_minmax(0,1fr)_auto]">
          <label className="block space-y-1 text-sm font-medium text-charcoal">
            <span>Part {index + 1}</span>
            <select id={`${idPrefix}-mode-${index}`} className={inputClass} value={row.mode} onChange={(e) => set(index, 'mode', e.target.value)}>
              {SPLIT_MODE_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <label className="block space-y-1 text-sm font-medium text-charcoal">
            <span>Amount<span className="text-red-700"> *</span></span>
            <input className={inputClass} inputMode="decimal" placeholder="0" value={row.amount} onChange={(e) => set(index, 'amount', e.target.value)} />
          </label>
          <label className="block space-y-1 text-sm font-medium text-charcoal">
            <span>{REF_LABEL[row.mode]}{row.mode !== 'card' && <span className="text-red-700"> *</span>}</span>
            <input className={inputClass} value={row.ref} onChange={(e) => set(index, 'ref', e.target.value)} />
          </label>
          <div className="flex items-end">
            {list.length > 2 && <button type="button" onClick={() => remove(index)} className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-charcoal/50 hover:bg-[#8C3B2E]/10 hover:text-[#8C3B2E]" aria-label={`Remove part ${index + 1}`}><X size={15} /></button>}
          </div>
        </div>
      ))}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button type="button" onClick={() => onChange([...list, { mode: 'card', amount: '', ref: '' }])} className="inline-flex items-center gap-1 text-xs font-semibold text-sage hover:underline"><Plus size={13} />Add another part</button>
        <p className="text-sm font-semibold text-charcoal">Total <span className="font-bold">{rupees(splitTotal(list))}</span></p>
      </div>
    </div>
  );
}
