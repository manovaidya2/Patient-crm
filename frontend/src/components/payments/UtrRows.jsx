import { Plus, X } from 'lucide-react';

// One payment paid as several online transfers on the same day (e.g. 5 × Rs 2,000). The first row is the usual
// UTR / Transaction ID; "+ Add another UTR" adds more rows, each with its own amount, and the payment amount becomes
// their total. With one row nothing changes from the old single UTR form.
export const emptyUtrRow = () => ({ utr: '', transactionId: '', amount: '' });
export const isMultiUtr = (rows) => (rows || []).length >= 2;
export const utrTotal = (rows) => Math.round((rows || []).reduce((sum, row) => sum + (Number(String(row.amount ?? '').replace(/,/g, '')) || 0), 0) * 100) / 100;
// Rows to send: only when there are several transfers (one transfer goes as the plain utr / transactionId fields).
export const utrEntriesPayload = (rows) => (isMultiUtr(rows) ? JSON.stringify(rows.map((row) => ({ utr: row.utr.trim(), transactionId: row.transactionId.trim(), amount: row.amount }))) : '');
// Rows to start an edit with, from a saved payment.
export const utrRowsFrom = (payment) => ((payment?.utrEntries || []).length >= 2
  ? payment.utrEntries.map((row) => ({ utr: row.utr || '', transactionId: row.transactionId || '', amount: row.amount ?? '' }))
  : [{ utr: payment?.utr || '', transactionId: payment?.transactionId || '', amount: '' }]);

const inputClass = 'w-full rounded-[10px] border border-[#DED2BD] bg-white px-3 py-2 text-sm text-charcoal focus:border-sage focus:outline-none focus:ring-2 focus:ring-sage/20';
const rupees = (n) => `Rs ${Number(n || 0).toLocaleString('en-IN')}`;

export default function UtrRows({ rows, onChange, utrLabel = 'UTR', idPrefix = 'utr', disabled = false }) {
  const list = rows?.length ? rows : [emptyUtrRow()];
  const multi = isMultiUtr(list);
  const set = (index, key, value) => onChange(list.map((row, i) => (i === index ? { ...row, [key]: value } : row)));
  const remove = (index) => onChange(list.filter((_, i) => i !== index));
  return (
    <div className="space-y-2">
      {list.map((row, index) => (
        <div key={index} className={`grid gap-2 ${multi ? 'rounded-[10px] border border-[#EFE3CF] bg-[#FBF7ED] p-2.5 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_120px_auto]' : 'sm:grid-cols-2'}`}>
          <label className="block space-y-1 text-sm font-medium text-charcoal">
            <span>{multi ? `${utrLabel} ${index + 1}` : utrLabel}</span>
            <input id={`${idPrefix}-${index}`} className={inputClass} disabled={disabled} placeholder="Optional" value={row.utr} onChange={(e) => set(index, 'utr', e.target.value)} />
          </label>
          <label className="block space-y-1 text-sm font-medium text-charcoal">
            <span>Transaction ID</span>
            <input className={inputClass} disabled={disabled} placeholder="Optional" value={row.transactionId} onChange={(e) => set(index, 'transactionId', e.target.value)} />
          </label>
          {multi && (
            <label className="block space-y-1 text-sm font-medium text-charcoal">
              <span>Amount</span>
              <input className={inputClass} disabled={disabled} inputMode="decimal" placeholder="0" value={row.amount} onChange={(e) => set(index, 'amount', e.target.value)} />
            </label>
          )}
          {multi && (
            <button type="button" disabled={disabled} onClick={() => remove(index)} title="Remove this UTR" aria-label={`Remove ${utrLabel} ${index + 1}`} className="self-end rounded-lg p-2 text-[#9F1D1D] hover:bg-[#FDE2E1] disabled:opacity-40"><X size={16} /></button>
          )}
        </div>
      ))}
      <div className="flex flex-wrap items-center justify-between gap-2">
        {!disabled && <button type="button" onClick={() => onChange([...list, emptyUtrRow()])} className="inline-flex items-center gap-1 text-xs font-bold text-sage hover:underline"><Plus size={13} />Add another UTR (same day)</button>}
        {multi && <p className="text-xs font-semibold text-charcoal">{list.length} transfers · total <span className="text-[#1F6B41]">{rupees(utrTotal(list))}</span> (used as the payment amount)</p>}
      </div>
    </div>
  );
}
