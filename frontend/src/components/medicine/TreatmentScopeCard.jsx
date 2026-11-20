import { useEffect, useState } from 'react';
import { CheckCircle2, ClipboardList, Pencil, RotateCcw, ShieldCheck, X } from 'lucide-react';
import api from '../../api/axios.js';
import Button from '../ui/Button.jsx';

const rupees = (v) => (Number(v) ? Number(v).toLocaleString('en-IN') : '-');
const when = (v) => (v ? new Date(v).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '');
const field = 'w-full rounded-lg border border-cardline bg-white px-3 py-2 text-[13px] text-charcoal outline-none focus:border-sage focus:ring-2 focus:ring-sage/15';

const Tag = ({ kind }) => (kind === 'added'
  ? <span className="rounded bg-sky-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-sky-800">Added by doctor</span>
  : kind === 'removed' ? <span className="rounded bg-[#8C3B2E]/10 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#8C3B2E]">Removed by doctor</span> : null);

// Step 2 (Prescription & formulation): the treatment & support components the Post Counselor ticked on the purchase
// (section C). The doctor approves them as they are, or unticks a component that is not needed / ticks one more (and
// writes the other doctor-recommended component), then approves. The new ticks go into the post-counselling record,
// so the PO, Treatment Papers, Medicine Explanations and Treatment Delivery follow them. The package value and the
// payments stay as the Post Counselor filled them.
// `done`: step 2 is completed (a formulation sent before this approval existed shows that, not "waiting").
export default function TreatmentScopeCard({ job, canEdit = false, done = false, onSaved, onError }) {
  const scope = job.treatmentScope;
  const [editing, setEditing] = useState(false);
  const [ticks, setTicks] = useState([]);
  const [other, setOther] = useState('');
  const [busy, setBusy] = useState(false);
  const reset = () => { setTicks((scope?.components || []).filter((c) => c.selected).map((c) => c.key)); setOther(scope?.other || ''); };
  useEffect(() => { if (!editing) reset(); }, [scope, editing]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!scope) return null;
  if (scope.missing) {
    return <p className="rounded-lg border border-dashed border-cardline px-3 py-2 text-xs text-charcoal/60">Treatment &amp; support components: this purchase has no post-counselling record, so there are no components to approve.</p>;
  }
  const approval = scope.approval;
  const all = scope.components;
  const isOn = (c) => (editing ? ticks.includes(c.key) : c.selected);
  const changeOf = (c) => (isOn(c) && !c.onPo ? 'added' : !isOn(c) && c.onPo ? 'removed' : '');
  // Viewing: what is ticked, and what the doctor removed. Editing: every component of the paper.
  const rows = editing ? all : all.filter((c) => c.selected || c.onPo);
  const tickedCount = all.filter(isOn).length;
  const added = all.filter((c) => changeOf(c) === 'added').length;
  const removed = all.filter((c) => changeOf(c) === 'removed').length;
  const poValue = all.reduce((sum, c) => sum + Number(c.value || 0), 0);
  const savedTicks = all.filter((c) => c.selected).map((c) => c.key);
  const changed = editing && (ticks.length !== savedTicks.length || ticks.some((k) => !savedTicks.includes(k)) || other.trim() !== scope.other);
  const toggle = (key) => setTicks((list) => (list.includes(key) ? list.filter((k) => k !== key) : [...list, key]));
  const save = async (withEdit) => {
    setBusy(true); onError?.('');
    try {
      const { data } = await api.post(`/medicine-jobs/${job.id}/scope`, withEdit ? { selected: ticks, other: other.trim() } : {});
      setEditing(false);
      onSaved?.(data.job, withEdit && changed ? 'Treatment components updated and approved. The PO, Treatment Papers, Medicine Explanations and Treatment Delivery follow the new ticks.' : 'Treatment components approved.');
    } catch (err) { onError?.(err.response?.data?.message || 'Could not approve the components'); } finally { setBusy(false); }
  };

  return (
    <section className={`overflow-hidden rounded-xl border-2 ${approval || done ? 'border-[#A7D3B8]' : 'border-[#FDBA74]'} bg-white`} aria-label="Treatment and support components">
      <div className={`flex flex-wrap items-start justify-between gap-2 px-4 py-3 ${approval || done ? 'bg-[#F6FBF7]' : 'bg-[#FFF7ED]'}`}>
        <div className="flex min-w-0 items-start gap-2.5">
          <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${approval || done ? 'bg-[#2F8F5B]/10 text-[#1F6B41]' : 'bg-[#F97316]/10 text-[#C2410C]'}`}><ClipboardList size={17} /></span>
          <div className="min-w-0">
            <p className="text-sm font-extrabold text-charcoal">Treatment &amp; support components <span className="font-semibold text-charcoal/50">· from the purchase order{scope.poNumber ? ` ${scope.poNumber}` : ''}</span></p>
            <p className="mt-0.5 text-xs text-charcoal/65">Ticked by the Post Counselor. Untick a component that is not needed or tick one more, then approve. The package value does not change.</p>
          </div>
        </div>
        {approval
          ? <span className="inline-flex items-center gap-1.5 rounded-full bg-[#2F8F5B] px-3 py-1 text-xs font-bold text-white"><CheckCircle2 size={13} />{approval.edited ? 'Updated & approved' : 'Approved'}</span>
          : done ? <span className="inline-flex items-center gap-1.5 rounded-full bg-offwhite-300/70 px-3 py-1 text-xs font-bold text-charcoal/70">Sent before this approval</span>
          : <span className="inline-flex items-center gap-1.5 rounded-full bg-[#F97316] px-3 py-1 text-xs font-bold text-white"><ShieldCheck size={13} />Waiting for doctor approval</span>}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-cardline px-4 py-2 text-xs">
        <span className="font-semibold text-charcoal">{tickedCount} of {all.length} components ticked{added || removed ? <span className="font-normal text-charcoal/65"> · {[added ? `${added} added` : '', removed ? `${removed} removed` : ''].filter(Boolean).join(', ')} by the doctor</span> : ''}</span>
        {editing && (
          <span className="flex flex-wrap gap-3">
            <button type="button" className="font-semibold text-sage hover:underline" onClick={() => setTicks(all.map((c) => c.key))}>Tick all</button>
            <button type="button" className="inline-flex items-center gap-1 font-semibold text-sage hover:underline" onClick={() => setTicks(all.filter((c) => c.onPo).map((c) => c.key))}><RotateCcw size={11} />Back to the PO ticks</button>
          </span>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[620px] text-left text-[13px]">
          <thead className="bg-[#56695D] text-[11px] font-bold uppercase tracking-wide text-white">
            <tr><th className="px-4 py-2">Component</th><th className="px-3 py-2">Delivery scope / session commitment</th><th className="px-4 py-2 text-right">Value on PO (Rs.)</th></tr>
          </thead>
          <tbody>
            {rows.map((c) => {
              const on = isOn(c);
              const change = changeOf(c);
              return (
                <tr key={c.key} className={`border-t border-cardline align-middle ${on ? 'bg-sage/10' : 'bg-white'}`}>
                  <td className="w-[40%] px-4 py-2.5">
                    <label className={`flex items-start gap-2.5 ${editing ? 'cursor-pointer' : ''}`}>
                      <input type="checkbox" className="mt-0.5 h-4 w-4 shrink-0 accent-sage" checked={on} disabled={!editing || busy} onChange={() => toggle(c.key)} aria-label={c.label} />
                      <span className="min-w-0">
                        <span className={`font-medium ${on ? 'text-charcoal' : 'text-charcoal/50'} ${change === 'removed' ? 'line-through decoration-[#8C3B2E]/50' : ''}`}>{c.label}</span>
                        {change && <span className="mt-1 block"><Tag kind={change} /></span>}
                      </span>
                    </label>
                  </td>
                  <td className={`px-3 py-2.5 ${on ? 'text-charcoal/80' : 'text-charcoal/45'}`}>{c.scope || '-'}</td>
                  <td className="w-[130px] px-4 py-2.5 text-right tabular-nums">{c.onPo ? <span className={`font-semibold ${on ? 'text-charcoal' : 'text-charcoal/45'}`}>{rupees(c.value)}</span> : <span className="text-[11px] text-charcoal/45">Not on the PO</span>}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot><tr className="border-t border-cardline bg-offwhite-200/60 text-[12px]"><td className="px-4 py-2 font-bold text-charcoal" colSpan={2}>Package value on the PO <span className="font-normal text-charcoal/55">(from the Post Counselor's ticks; not changed here)</span></td><td className="px-4 py-2 text-right font-bold tabular-nums text-charcoal">{rupees(poValue)}</td></tr></tfoot>
        </table>
      </div>

      <div className="border-t border-cardline px-4 py-3">
        <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-charcoal/55">Other doctor-recommended component</p>
        {editing
          ? <input aria-label="Other doctor-recommended component" maxLength={300} className={field} value={other} onChange={(e) => setOther(e.target.value)} placeholder="Anything else the doctor recommends (optional)" />
          : <p className="text-[13px] text-charcoal/80">{scope.other || <span className="text-charcoal/45">None</span>}</p>}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-cardline bg-offwhite-200/40 px-4 py-3">
        <p className="text-xs text-charcoal/60">
          {approval
            ? <>{approval.edited ? 'Updated and approved' : 'Approved as ticked'} by <b className="text-charcoal">{approval.byName}</b> · {when(approval.at)}</>
            : done ? 'This formulation was sent before the components approval was added.'
            : canEdit ? 'Approve them as they are, or change the ticks and save. The formulation is sent only after this approval.' : 'The doctor approves these before sending the formulation.'}
        </p>
        {canEdit && (editing ? (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" disabled={busy} onClick={() => setEditing(false)}><X size={14} />Cancel</Button>
            <Button size="sm" disabled={busy || !ticks.length} onClick={() => save(true)}><CheckCircle2 size={14} />{busy ? 'Saving...' : changed ? 'Save & approve' : 'Approve'}</Button>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" disabled={busy} onClick={() => { reset(); setEditing(true); }}><Pencil size={14} />Edit components</Button>
            {!approval && <Button size="sm" disabled={busy} onClick={() => save(false)}><CheckCircle2 size={14} />{busy ? 'Saving...' : 'Approve as it is'}</Button>}
          </div>
        ))}
      </div>
      {editing && !ticks.length && <p className="border-t border-cardline px-4 py-2 text-xs font-semibold text-[#8C3B2E]">Keep at least one component ticked.</p>}
    </section>
  );
}
