import { useEffect, useState } from 'react';
import api from '../../api/axios.js';
import Button from '../ui/Button.jsx';
import { poInput } from '../purchaseOrders/CreatePurchaseOrderModal.jsx';

const num = (v) => (Number.isInteger(Number(v)) ? String(v) : String(Math.round(Number(v) * 1000) / 1000));

// The Medicine Department sets the actual number of BT-100 bottles each syrup / oil / ghrit is filled in (445 ml in 4).
// The bottles drawn from stock follow the number saved here.
export default function BottleEditor({ job, canEdit, onSaved, onError }) {
  const lines = (job.formulation?.lines || []).filter((l) => l.packed && !l.removed && l.bottles != null);
  const [values, setValues] = useState({});
  const [busy, setBusy] = useState(false);
  useEffect(() => { setValues({}); }, [job.id, job.formulation]);
  if (!lines.length) return null;
  const changed = lines.filter((l) => values[l.key] !== undefined && Number(values[l.key]) !== Number(l.bottles));
  const valid = changed.every((l) => Number.isInteger(Number(values[l.key])) && Number(values[l.key]) >= 1 && Number(values[l.key]) <= 99);
  const save = async () => {
    setBusy(true); onError('');
    try {
      const { data } = await api.patch(`/medicine-jobs/${job.id}/bottles`, { bottles: Object.fromEntries(changed.map((l) => [l.key, Number(values[l.key])])) });
      onSaved(data.job, 'Number of bottles saved.');
    } catch (e) { onError(e.response?.data?.message || 'Could not save the bottles'); } finally { setBusy(false); }
  };
  return (
    <div className="rounded-lg border border-cardline bg-white p-3">
      <p className="text-sm font-bold text-charcoal">Bottles (BT-100, 100 ml)</p>
      <p className="mb-2 text-xs text-charcoal/60">Set the bottles actually used; the same number is taken from stock.</p>
      <div className="divide-y divide-dashed divide-cardline">
        {lines.map((l) => (
          <div key={l.key} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
            <span><b className="text-charcoal">{l.name}</b> <span className="text-charcoal/60">· {num(l.qty)} {l.unit}</span>
              {l.bottlesBy?.byName && <span className="ml-2 text-[11px] text-charcoal/55">changed by {l.bottlesBy.byName}</span>}
            </span>
            {canEdit
              ? <label className="flex items-center gap-2 text-xs text-charcoal/70">Bottles<input className={`${poInput} w-20`} type="number" min="1" max="99" step="1" inputMode="numeric" value={values[l.key] ?? l.bottles} onChange={(e) => setValues((v) => ({ ...v, [l.key]: e.target.value }))} disabled={busy} /></label>
              : <b className="font-mono">{l.bottles} × BT-100</b>}
          </div>
        ))}
      </div>
      {canEdit && changed.length > 0 && <div className="mt-2 flex items-center gap-2"><Button size="sm" disabled={busy || !valid} onClick={save}>{busy ? 'Saving...' : 'Save bottles'}</Button><Button size="sm" variant="outline" disabled={busy} onClick={() => setValues({})}>Cancel</Button>{!valid && <span className="text-xs text-[#8C3B2E]">Enter a whole number from 1 to 99</span>}</div>}
    </div>
  );
}
