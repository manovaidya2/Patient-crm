import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Search, WalletCards, X } from 'lucide-react';
import useApiQuery from '../api/useApiQuery.js';
import Card from './ui/Card.jsx';
import { STAGES } from '../constants/treatmentStages.js';
import { NO_PROGRAM, PROGRAMS, PhasePills, ProgramCards, phaseLabel, selectClass, shortDate, supplyPart, toneOf } from './categoryStyles.jsx';

const money = (value) => `Rs ${Number(value || 0).toLocaleString('en-IN')}`;
const sumDue = (list) => list.reduce((s, p) => s + p.dueAmount, 0);

// Control Room: active patients whose phase package is not fully paid. Program at the top, then the phase, then the
// supply picked on the PO (Full 6 months, 1 + 5, 2 + 4, Custom) with its parts. Due = phase package minus approved
// payments; payments waiting for approval are shown beside it.
export default function PaymentDueCategoriesCard({ className = '' }) {
  const { data, loading } = useApiQuery('/control-room/payment-due-categories');
  const [program, setProgram] = useState(PROGRAMS[0].key);
  const [phase, setPhase] = useState('1');
  const [category, setCategory] = useState('all');
  const [part, setPart] = useState('');
  const [state, setState] = useState('all');
  const [query, setQuery] = useState('');

  // Every patient-phase with payment due, with its category.
  const all = useMemo(() => (data?.categories || []).flatMap((c) => c.patients.map((p) => ({
    ...p, program: p.program || NO_PROGRAM, categoryKey: c.key, categoryLabel: c.label, categoryOrder: c.order ?? 0, part: supplyPart(p.supplyLabel),
  }))), [data]);

  const q = query.trim().toLowerCase();
  const inState = (p) => state === 'all' || (state === 'approval' ? p.pendingApprovalAmount > 0 : state === 'unpaid' ? p.paidAmount <= 0 : p.paidAmount > 0);
  const base = all.filter((p) => inState(p) && (!q || `${p.patientName} ${p.patientCode} ${p.poNumber}`.toLowerCase().includes(q)));
  const inProgram = base.filter((p) => p.program === program);
  const inPhase = inProgram.filter((p) => String(p.phase) === phase);
  const rows = inPhase.filter((p) => (category === 'all' || p.categoryKey === category) && (!part || p.part === part)).sort((a, b) => b.dueAmount - a.dueAmount);
  const phases = [...new Set([...STAGES, ...inProgram.map((p) => p.phase)])].sort((a, b) => a - b);

  const tiles = useMemo(() => {
    const map = new Map();
    inPhase.forEach((p) => {
      if (!map.has(p.categoryKey)) map.set(p.categoryKey, { key: p.categoryKey, label: p.categoryLabel, order: p.categoryOrder, list: [] });
      map.get(p.categoryKey).list.push(p);
    });
    return [...map.values()].sort((a, b) => a.order - b.order).map((t) => {
      const parts = new Map();
      t.list.forEach((p) => { const x = parts.get(p.part) || { count: 0, due: 0 }; parts.set(p.part, { count: x.count + 1, due: x.due + p.dueAmount }); });
      const total = t.list.reduce((s, p) => s + p.totalAmount, 0);
      const paid = t.list.reduce((s, p) => s + p.paidAmount, 0);
      return { ...t, count: t.list.length, due: sumDue(t.list), paidPct: total ? Math.round((paid / total) * 100) : 0, parts: [...parts.entries()] };
    });
  }, [inPhase]); // eslint-disable-line react-hooks/exhaustive-deps

  const choose = (setter) => (value) => { setter(value); setCategory('all'); setPart(''); };
  const filtered = phase !== '1' || category !== 'all' || part || state !== 'all' || q;
  const reset = () => { setProgram(PROGRAMS[0].key); setPhase('1'); setCategory('all'); setPart(''); setState('all'); setQuery(''); };

  return (
    <Card className={className}>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-[#8C3B2E]/10 text-[#8C3B2E]"><WalletCards size={20} /></div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-charcoal/55">Payment pending by category</p>
            <h2 className="mt-1 font-display text-xl font-bold text-charcoal">Patients with payment due</h2>
            <p className="mt-1 text-xs text-charcoal/55">Every phase with payment due in the system: program, then phase, then its supply (from any purchase order, else from its medicine request). Due = phase package minus approved payments; payments awaiting approval are not counted as paid.</p>
            <p className="mt-1.5 inline-flex rounded-md bg-[#8C3B2E]/8 px-2 py-1 text-xs font-semibold text-[#8C3B2E]">{money(sumDue(base))} due in all · {base.length} phase{base.length === 1 ? '' : 's'}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 lg:justify-end">
          <label className="relative"><Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-charcoal/40" /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Patient, code or PO" aria-label="Search patient" className={`${selectClass} w-48 pl-8`} /></label>
          <select aria-label="Payment status" value={state} onChange={(e) => setState(e.target.value)} className={selectClass}>
            <option value="all">Every patient with due</option>
            <option value="partial">Part paid</option>
            <option value="unpaid">Nothing paid yet</option>
            <option value="approval">Payment awaiting approval</option>
          </select>
          {filtered && <button type="button" onClick={reset} className="inline-flex items-center gap-1 rounded-md px-2 py-2 text-xs font-semibold text-[#8C3B2E] hover:bg-[#8C3B2E]/5"><X size={13} />Clear filters</button>}
        </div>
      </div>

      {loading && !data ? (
        <div className="mt-5 rounded-lg border border-cardline bg-offwhite-200 p-5 text-sm text-charcoal/55">Loading pending payments...</div>
      ) : !all.length ? (
        <div className="mt-5 rounded-lg border border-cardline bg-offwhite-200 p-5 text-sm font-semibold text-sage">No payment pending.</div>
      ) : (
        <>
          <p className="mt-5 text-[11px] font-bold uppercase tracking-wide text-charcoal/50">1 · Program</p>
          <ProgramCards rows={base} program={program} onChoose={choose(setProgram)}
            summary={(list) => `${list.length} phase${list.length === 1 ? '' : 's'} with due`} value={(list) => money(sumDue(list))} />

          <p className="mt-4 text-[11px] font-bold uppercase tracking-wide text-charcoal/50">2 · Phase <span className="normal-case tracking-normal text-charcoal/45">in {program}</span></p>
          <PhasePills phases={phases} rows={inProgram} phase={phase} onChoose={choose(setPhase)} />

          <p className="mt-4 text-[11px] font-bold uppercase tracking-wide text-charcoal/50">3 · Medicine supply</p>
          {!tiles.length && <p className="mt-2 rounded-lg border border-dashed border-cardline px-3 py-3 text-sm text-charcoal/55">No payment due in {phaseLabel(Number(phase))}.</p>}
          <div className="mt-2 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {tiles.map((t) => {
              const tone = toneOf(t.key);
              const on = category === t.key;
              return (
                <div key={t.key} className={`rounded-xl border-2 p-3 transition ${tone.box} ${on ? 'ring-2 ring-charcoal/60 ring-offset-1' : ''}`}>
                  <button type="button" onClick={() => { setCategory(on ? 'all' : t.key); setPart(''); }} className="w-full text-left">
                    <span className="flex items-start justify-between gap-2"><span className={`text-sm font-bold ${tone.head}`}>{t.label}</span><span className={`font-display text-2xl font-bold ${tone.head}`}>{t.count}</span></span>
                    <span className="mt-1 block font-display text-base font-bold text-[#8C3B2E]">{money(t.due)} due</span>
                    <span className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-white/80"><span className={`block h-full ${tone.bar}`} style={{ width: `${t.paidPct}%` }} /></span>
                    <span className="mt-1 block text-[11px] text-charcoal/60">{t.paidPct}% of the packages paid</span>
                  </button>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {t.parts.map(([name, x]) => {
                      const partOn = on && part === name;
                      return <button key={name} type="button" onClick={() => { setCategory(t.key); setPart(partOn ? '' : name); }} className={`rounded-md px-2 py-1 text-[11px] font-semibold transition ${partOn ? 'bg-charcoal text-white' : tone.chip}`}>{name}: {x.count} · {money(x.due)}</button>;
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-4 text-xs text-charcoal/60"><b className="text-charcoal">{rows.length}</b> patient{rows.length === 1 ? '' : 's'} · {program} · {phaseLabel(Number(phase))}{category !== 'all' ? ` · ${tiles.find((t) => t.key === category)?.label || ''}` : ''}{part ? ` · ${part}` : ''} · {money(sumDue(rows))} due · highest due first</div>
          <div className="mt-2 overflow-hidden rounded-lg border border-cardline bg-offwhite-100">
            <div className="hidden gap-x-4 border-b border-cardline-soft bg-offwhite-200 px-4 py-2 text-[11px] font-bold uppercase tracking-wide text-charcoal/55 lg:grid lg:grid-cols-[1.4fr_1.4fr_0.9fr_0.9fr_1.1fr_0.9fr]">
              <span>Patient</span><span>Supply</span><span>Package</span><span>Paid</span><span>Due</span><span>Last payment</span>
            </div>
            {!rows.length && <p className="px-4 py-4 text-sm text-charcoal/55">No patient for these filters.</p>}
            {rows.map((p) => {
              const tone = toneOf(p.categoryKey);
              const pct = p.totalAmount ? Math.round((p.paidAmount / p.totalAmount) * 100) : 0;
              return (
                <div key={`${p.patientId}-${p.phase}`} className="grid grid-cols-2 gap-2 border-b border-cardline-soft px-4 py-3 text-sm last:border-0 lg:grid-cols-[1.4fr_1.4fr_0.9fr_0.9fr_1.1fr_0.9fr] lg:gap-x-4">
                  <Link to={`/admin/patients/${p.patientId}`} className="col-span-2 min-w-0 font-bold text-charcoal hover:text-sage lg:col-span-1">
                    <span className="block truncate">{p.patientName}</span>
                    <span className="block font-mono text-[11px] tracking-widest text-charcoal/45">{p.patientCode}{p.poNumber ? ` · ${p.poNumber}` : ''}</span>
                  </Link>
                  <span><span className={`inline-block rounded-md px-2 py-0.5 text-xs font-bold ${tone.chip}`}>{p.categoryLabel}</span>{p.part && p.part !== p.categoryLabel.replace(/^Custom: /, '') && <span className="ml-1 text-xs text-charcoal/65">{p.part}</span>}{p.supplySource && <span className="mt-0.5 block text-[11px] text-charcoal/45">from {p.supplySource.toLowerCase()}</span>}</span>
                  <span className="tabular-nums text-charcoal">{money(p.totalAmount)}</span>
                  <span className="tabular-nums text-sage">{money(p.paidAmount)}<span className="mt-1 block h-1 w-20 overflow-hidden rounded-full bg-offwhite-300/60"><span className="block h-full bg-sage" style={{ width: `${pct}%` }} /></span></span>
                  <span className="font-bold tabular-nums text-[#8C3B2E]">{money(p.dueAmount)}{p.pendingApprovalAmount > 0 && <span className="block text-[11px] font-semibold text-[#9C6B2E]">{money(p.pendingApprovalAmount)} awaiting approval</span>}</span>
                  <span className="text-xs text-charcoal/70">{p.lastPaymentAt ? shortDate(p.lastPaymentAt) : 'No payment yet'}</span>
                </div>
              );
            })}
          </div>
        </>
      )}
    </Card>
  );
}
