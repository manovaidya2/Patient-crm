import { useCallback, useEffect, useState } from 'react';
import api from '../../api/axios.js';
import Button from '../ui/Button.jsx';
import { Chip } from './parts.jsx';
import { TYPE, fmtDateTime, inventoryText, num, qty } from './helpers.js';

const FILTERS = [['all', 'All'], ['add', 'Stock In'], ['consume', 'Use / Issue'], ['adjust', 'Adjust'], ['pack', 'Pack'], ['pending', 'Approval pending']];
const STATUS_BADGE = {
  pending: ['Approval pending', 'bg-amber-100 text-amber-900'],
  rejected: ['Rejected', 'bg-[#8C3B2E]/12 text-[#8C3B2E]'],
  approved: ['Approved', 'bg-emerald-100 text-emerald-800'],
  done: ['Posted', 'bg-emerald-100 text-emerald-800'],
};

// Append-only stock ledger: every in / use / adjust / pack row, with who did it and what the stock was before and after.
export default function LedgerView({ type, onTypeChange, canApprove, onOpenItem, onChanged, reloadKey }) {
  const [data, setData] = useState({ rows: [], counts: {} });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');

  const load = useCallback(async () => {
    try {
      const { data: res } = await api.get('/medicine/inventory/ledger', { params: { type: type === 'all' ? undefined : type }, skipCache: true });
      setData(res); setError('');
    } catch (err) { setError(err.response?.data?.message || 'Could not load the ledger'); } finally { setLoading(false); }
  }, [type]);
  useEffect(() => { setLoading(true); load(); }, [load, reloadKey]);

  const decide = async (row, decision) => {
    setBusy(row.id); setError('');
    try { await api.post(`/medicine/inventory/ledger/${row.itemId}/${row.id}/decision`, { decision }); await load(); onChanged(decision === 'approve' ? `${row.txId} was approved and stock was updated` : `${row.txId} was rejected; stock was not changed`); }
    catch (err) { setError(err.response?.data?.message || 'Could not save the decision'); } finally { setBusy(''); }
  };

  return (
    <div className="space-y-3 rounded-xl border border-cardline bg-white p-3 sm:p-4">
      <div className="flex flex-wrap gap-2">{FILTERS.map(([key, label]) => <Chip key={key} active={type === key} onClick={() => onTypeChange(key)} count={data.counts?.[key] ?? 0}>{label}</Chip>)}</div>
      {error && <p className="rounded-lg bg-[#8C3B2E]/8 px-3 py-2 text-sm text-[#8C3B2E]">{error}</p>}
      <div className="overflow-x-auto rounded-lg border border-cardline">
        <table className="w-full min-w-[1080px] text-left text-sm">
          <thead className="bg-offwhite-200 text-xs uppercase tracking-wide text-charcoal/55"><tr>{['Txn', 'Date & time', 'Type', 'Medicine', 'Quantity', 'Detail', 'Before → After', 'Ref / Reason', 'By', 'Status'].map((h) => <th key={h} className="px-2.5 py-3 font-semibold">{h}</th>)}</tr></thead>
          <tbody>
            {loading ? <tr><td colSpan={10} className="p-10 text-center text-charcoal/55">Loading ledger...</td></tr>
              : !data.rows.length ? <tr><td colSpan={10} className="p-10 text-center text-charcoal/55">No entries found for this type.</td></tr>
                : data.rows.map((row) => {
                  const t = TYPE[row.type] || TYPE.add; const [statusLabel, statusClass] = STATUS_BADGE[row.status] || STATUS_BADGE.done;
                  return (
                    <tr key={`${row.itemId}-${row.id}`} className="border-t border-cardline align-top">
                      <td className="whitespace-nowrap px-2.5 py-3 font-bold text-sage">{row.txId}</td>
                      <td className="whitespace-nowrap px-2.5 py-3 text-xs">{fmtDateTime(row.createdAt)}</td>
                      <td className="px-2.5 py-3"><span className={`whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ${t.badge}`}>{t.label}</span></td>
                      <td className="min-w-[170px] px-2.5 py-3"><button type="button" onClick={() => onOpenItem(row.itemId)} className="text-left font-semibold hover:text-sage hover:underline">{row.itemName}</button></td>
                      <td className={`whitespace-nowrap px-2.5 py-3 text-right font-semibold ${row.delta > 0 ? 'text-emerald-700' : row.delta < 0 ? 'text-[#8C3B2E]' : ''}`}>{row.delta ? `${row.delta > 0 ? '+' : '−'}${qty(Math.abs(row.delta), row.unit, { withConversion: false })}` : row.type === 'pack' ? qty(row.quantity, row.unit, { withConversion: false }) : '-'}</td>
                      <td className="min-w-[200px] px-2.5 py-3 text-xs">{inventoryText(row.detail) || '-'}</td>
                      <td className="whitespace-nowrap px-2.5 py-3 text-right text-xs">{row.status === 'pending' ? `${num(row.previousStock)} → ?` : `${num(row.previousStock)} → ${num(row.newStock)}`}</td>
                      <td className="min-w-[140px] px-2.5 py-3 text-xs">{[row.ref, row.reason && `Reason: ${inventoryText(row.reason)}`].filter(Boolean).join(' · ') || '-'}</td>
                      <td className="px-2.5 py-3 text-xs">{row.recordedByName || '-'}</td>
                      <td className="min-w-[130px] px-2.5 py-3">
                        <span className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ${statusClass}`}>{statusLabel}</span>
                        {row.decidedByName && row.status !== 'done' && <p className="mt-1 text-[11px] text-charcoal/50">{row.decidedByName}</p>}
                        {row.status === 'pending' && canApprove && <div className="mt-1.5 flex gap-1.5"><Button size="sm" className="!px-2.5 !py-1" disabled={busy === row.id} onClick={() => decide(row, 'approve')}>Approve</Button><Button size="sm" variant="outline" className="!px-2.5 !py-1" disabled={busy === row.id} onClick={() => decide(row, 'reject')}>Reject</Button></div>}
                        {row.status === 'pending' && !canApprove && <p className="mt-1 text-[11px] text-charcoal/50">Awaiting Admin / Doctor approval</p>}
                      </td>
                    </tr>
                  );
                })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-charcoal/55">Adjustments above 5%, or those marked Expired or Damage, do not affect stock until approved by an Admin or Doctor. Ledger entries cannot be deleted.</p>
    </div>
  );
}
