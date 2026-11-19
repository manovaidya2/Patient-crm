import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { WalletCards } from 'lucide-react';
import useApiQuery from '../api/useApiQuery.js';
import Card from './ui/Card.jsx';
import { STAGE_LABELS } from '../constants/treatmentStages.js';

const money = (value) => `Rs ${Number(value || 0).toLocaleString('en-IN')}`;
const shortDate = (value) => (value ? new Date(value).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '-');
const selectClass = 'rounded-md border border-cardline bg-offwhite-200 px-3 py-2 text-sm text-charcoal';

// Control Room: active patients whose phase still has payment due, by the category of that phase's supply
// (1 month, 45 days, 6 months ...) and the phase. Due = phase package minus approved payments.
export default function PaymentDueCategoriesCard({ className = '' }) {
  const { data, loading } = useApiQuery('/patients/payment-due-categories');
  const categories = data?.categories || [];
  const [selected, setSelected] = useState('all');
  const [phase, setPhase] = useState('all');
  const [program, setProgram] = useState('all');
  useEffect(() => { if (selected !== 'all' && !categories.some((c) => c.key === selected)) setSelected('all'); }, [categories, selected]);
  const phases = useMemo(() => [...new Set(categories.flatMap((c) => c.patients.map((p) => p.phase)))].sort((a, b) => a - b), [categories]);
  const programs = useMemo(() => [...new Set(categories.flatMap((c) => c.patients.map((p) => p.program)).filter(Boolean))].sort(), [categories]);
  const inPhase = (p) => (program === 'all' || p.program === program) && (phase === 'all' || String(p.phase) === phase);
  const all = categories.flatMap((c) => c.patients.map((p) => ({ ...p, category: c.label })));
  const rows = (selected === 'all' ? all : (categories.find((c) => c.key === selected)?.patients || []).map((p) => ({ ...p, category: categories.find((c) => c.key === selected).label })))
    .filter(inPhase).sort((a, b) => b.dueAmount - a.dueAmount);
  const totalOf = (list) => list.filter(inPhase).reduce((s, p) => s + p.dueAmount, 0);
  const chip = (key, label, list) => {
    const shown = list.filter(inPhase);
    const active = selected === key;
    return (
      <button key={key} type="button" onClick={() => setSelected(key)}
        className={`rounded-lg border px-3 py-2 text-left transition ${active ? 'border-[#8C3B2E] bg-[#8C3B2E] text-white' : 'border-cardline bg-offwhite-200 text-charcoal hover:border-[#8C3B2E]/50'}`}>
        <span className="block text-xs font-semibold opacity-80">{label}</span>
        <span className="block font-display text-xl font-bold">{shown.length}</span>
        <span className="block text-[10.5px] opacity-75">{money(totalOf(list))} due</span>
      </button>
    );
  };

  return (
    <Card className={className}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-[#8C3B2E]/10 text-[#8C3B2E]"><WalletCards size={20} /></div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-charcoal/55">Payment pending by category</p>
            <h2 className="mt-1 font-display text-xl font-bold text-charcoal">Patients with payment due</h2>
            <p className="mt-1 text-xs text-charcoal/55">Active patients whose phase package is not fully paid, by the supply picked on the PO (Full 6 months, 1 + 5, 2 + 4, Custom). Only approved payments count as paid.</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:justify-end">
          <select aria-label="Program" value={program} onChange={(e) => setProgram(e.target.value)} className={selectClass}>
            <option value="all">All programs</option>
            {programs.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
          <select aria-label="Phase" value={phase} onChange={(e) => setPhase(e.target.value)} className={selectClass}>
          <option value="all">All phases</option>
          {phases.map((n) => <option key={n} value={String(n)}>{STAGE_LABELS[n] || `Phase ${n}`}</option>)}
        </select>
        </div>
      </div>

      {loading && !data ? (
        <div className="mt-5 rounded-lg border border-cardline bg-offwhite-200 p-5 text-sm text-charcoal/55">Loading pending payments...</div>
      ) : !categories.length ? (
        <div className="mt-5 rounded-lg border border-cardline bg-offwhite-200 p-5 text-sm font-semibold text-sage">No payment pending.</div>
      ) : (
        <>
          <div className="mt-5 flex flex-wrap gap-2">
            {chip('all', 'All categories', all)}
            {categories.map((c) => chip(c.key, c.label, c.patients))}
          </div>
          <div className="mt-4 overflow-hidden rounded-lg border border-cardline bg-offwhite-100">
            <div className="hidden gap-x-4 border-b border-cardline-soft bg-offwhite-200 px-4 py-2 text-[11px] font-bold uppercase tracking-wide text-charcoal/55 sm:grid sm:grid-cols-[1.4fr_0.8fr_1.3fr_0.8fr_0.9fr_0.9fr_1fr]">
              <span>Patient</span><span>Phase</span><span>Category</span><span>Total</span><span>Paid</span><span>Due</span><span>Last payment</span>
            </div>
            {!rows.length && <p className="px-4 py-4 text-sm text-charcoal/55">No payment pending for this filter.</p>}
            {rows.map((p) => (
              <div key={`${p.patientId}-${p.phase}`} className="grid grid-cols-2 gap-2 border-b border-cardline-soft px-4 py-3 text-sm last:border-0 sm:grid-cols-[1.4fr_0.8fr_1.3fr_0.8fr_0.9fr_0.9fr_1fr] sm:gap-x-4">
                <Link to={`/admin/patients/${p.patientId}`} className="col-span-2 min-w-0 font-bold text-charcoal hover:text-sage sm:col-span-1">
                  <span className="block truncate">{p.patientName}</span>
                  <span className="block font-mono text-[11px] tracking-widest text-charcoal/45">{p.patientCode}{p.poNumber ? ` · ${p.poNumber}` : ''}</span>
                </Link>
                <span className="font-semibold text-charcoal">{STAGE_LABELS[p.phase] || `Phase ${p.phase}`}{p.program && <span className="block text-[11px] font-normal text-charcoal/55">{p.program}</span>}</span>
                <span className="text-charcoal/70">{p.category}{p.supplyLabel && p.supplyLabel !== p.category ? <span className="block text-[11px] text-charcoal/50">{p.supplyLabel}</span> : null}</span>
                <span className="tabular-nums text-charcoal">{money(p.totalAmount)}</span>
                <span className="tabular-nums text-sage">{money(p.paidAmount)}</span>
                <span className="font-bold tabular-nums text-[#8C3B2E]">{money(p.dueAmount)}{p.pendingApprovalAmount > 0 && <span className="block text-[11px] font-semibold text-[#9C6B2E]">{money(p.pendingApprovalAmount)} awaiting approval</span>}</span>
                <span className="text-charcoal/70">{shortDate(p.lastPaymentAt)}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </Card>
  );
}
