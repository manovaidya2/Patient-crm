import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Brain, Pill, Puzzle, Search, X } from 'lucide-react';
import useApiQuery from '../api/useApiQuery.js';
import Card from './ui/Card.jsx';
import { STAGES, STAGE_LABELS } from '../constants/treatmentStages.js';

const shortDate = (value) => (value ? new Date(value).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '-');
const selectClass = 'rounded-md border border-cardline bg-white px-3 py-2 text-sm text-charcoal';
// The date of a row: when its medicine went, else when it was requested.
const rowDate = (p) => p.sentAt || p.requestedAt || p.last?.at || null;
// A yyyy-mm-dd of the browser's own day (the date inputs speak in local days).
const localDay = (value) => { const d = new Date(value); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const phaseLabel = (n) => STAGE_LABELS[n] || `Phase ${n}`;

// Programs at the top: Autism / ADHD, Mental Health (a patient without one is "Program not set").
const NO_PROGRAM = 'Program not set';
const PROGRAMS = [
  { key: 'Autism / ADHD', icon: Puzzle, tone: 'bg-[#EEF2FB] text-[#2F4A8A] border-[#C9D5F0]', active: 'bg-[#2F4A8A] text-white border-[#2F4A8A]' },
  { key: 'Mental Health', icon: Brain, tone: 'bg-[#F5EEFB] text-[#5B3A86] border-[#DCCBEE]', active: 'bg-[#5B3A86] text-white border-[#5B3A86]' },
  { key: NO_PROGRAM, icon: Pill, tone: 'bg-offwhite-200 text-charcoal/70 border-cardline', active: 'bg-charcoal text-white border-charcoal' },
];
// One colour per supply category (the PO paper's choices).
const CATEGORY_TONE = {
  '6M': { box: 'border-[#9DB7A3] bg-[#EEF5EF]', head: 'text-[#2E5A3A]', bar: 'bg-[#4F7A5B]', chip: 'bg-[#DDEBE0] text-[#2E5A3A]' },
  '1+5': { box: 'border-[#A9C1E8] bg-[#EEF3FC]', head: 'text-[#2F4A8A]', bar: 'bg-[#4A6CB8]', chip: 'bg-[#DCE6F7] text-[#2F4A8A]' },
  '2+4': { box: 'border-[#C9B5E6] bg-[#F4EFFB]', head: 'text-[#5B3A86]', bar: 'bg-[#7D5BB0]', chip: 'bg-[#E6DCF4] text-[#5B3A86]' },
  custom: { box: 'border-[#E9C98F] bg-[#FDF6E8]', head: 'text-[#8A5A12]', bar: 'bg-[#C98A22]', chip: 'bg-[#F7E7C6] text-[#8A5A12]' },
  unknown: { box: 'border-cardline bg-offwhite-200', head: 'text-charcoal/70', bar: 'bg-charcoal/40', chip: 'bg-offwhite-300/60 text-charcoal/70' },
  none: { box: 'border-dashed border-[#C9BFAE] bg-white', head: 'text-charcoal/65', bar: 'bg-charcoal/25', chip: 'bg-[#F1ECE2] text-charcoal/70' },
};
const toneOf = (key) => CATEGORY_TONE[key] || (/^C\d/.test(String(key)) ? CATEGORY_TONE.custom : CATEGORY_TONE.unknown);
// "1+5: First 1 month" -> "First 1 month"; "Full 6 months" stays; "Custom: 45 days" -> "45 days".
const partOf = (p) => (p.none ? (p.last ? 'Had medicine in an earlier phase' : 'No medicine at all yet') : p.supplyLabel.includes(': ') ? p.supplyLabel.split(': ').slice(1).join(': ') : p.supplyLabel || 'Not recorded');
const STATUS_TONE = (p) => (p.none ? 'bg-[#F1ECE2] text-charcoal/65' : p.status === 'Delivered' ? 'bg-[#E6F2EA] text-[#1F6B41]' : p.gone ? 'bg-[#FBF0DC] text-[#7C5B2E]' : /hold/i.test(p.status) ? 'bg-[#FDE2E1] text-[#9F1D1D]' : 'bg-[#EEF2FB] text-[#2F4A8A]');

// Control Room: active patients by their LATEST medicine (requested, being made or sent). Program at the top, then
// the phase, then the supply categories of the PO paper (Full 6 months, 1 + 5, 2 + 4, Custom) with their parts.
export default function MedicineCategoriesCard({ className = '' }) {
  const { data, loading } = useApiQuery('/patients/medicine-categories');
  // Only the two programs, Autism / ADHD first.
  const [program, setProgram] = useState(PROGRAMS[0].key);
  // One phase at a time (no 'all phases'), Phase 1 first.
  const [phase, setPhase] = useState('1');
  const [category, setCategory] = useState('all');
  const [part, setPart] = useState('');
  const [state, setState] = useState('all');
  const [dateMode, setDateMode] = useState('all');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [query, setQuery] = useState('');

  // Every patient once, with its category.
  const all = useMemo(() => (data?.categories || []).flatMap((c) => c.patients.map((p) => ({
    ...p, program: p.program || NO_PROGRAM, categoryKey: c.key, categoryLabel: c.label, categoryOrder: c.order ?? 0, part: partOf(p),
  }))), [data]);

  const inDates = (p) => {
    if (dateMode !== 'range') return true;
    const at = rowDate(p);
    if (!at) return false;
    const day = localDay(at);
    return (!from || day >= from) && (!to || day <= to);
  };
  const q = query.trim().toLowerCase();
  // Filters that apply to every level (status, dates, search).
  const inState = (p) => state === 'all' || (state === 'gone' ? p.gone : state === 'none' ? p.none : !p.gone && !p.none);
  const base = all.filter((p) => inState(p) && inDates(p) && (!q || `${p.patientName} ${p.patientCode} ${p.poNumber}`.toLowerCase().includes(q)));
  const inProgram = base.filter((p) => program === 'all' || p.program === program);
  const inPhase = inProgram.filter((p) => String(p.phase) === phase);
  const rows = inPhase.filter((p) => (category === 'all' || p.categoryKey === category) && (!part || p.part === part))
    .sort((a, b) => new Date(rowDate(b) || 0) - new Date(rowDate(a) || 0));

  // Every phase of the treatment (1 to 6), also those with nobody in them now.
  const phases = [...new Set([...STAGES, ...inProgram.map((p) => p.phase)])].sort((a, b) => a - b);
  // Category tiles of the chosen program and phase, each with its parts.
  const tiles = useMemo(() => {
    const map = new Map();
    inPhase.forEach((p) => {
      if (!map.has(p.categoryKey)) map.set(p.categoryKey, { key: p.categoryKey, label: p.categoryLabel, order: p.categoryOrder, list: [] });
      map.get(p.categoryKey).list.push(p);
    });
    return [...map.values()].sort((a, b) => a.order - b.order).map((t) => {
      const parts = new Map();
      t.list.forEach((p) => parts.set(p.part, (parts.get(p.part) || 0) + 1));
      return { ...t, count: t.list.length, gone: t.list.filter((p) => p.gone).length, none: t.key === 'none', parts: [...parts.entries()] };
    });
  }, [inPhase]); // eslint-disable-line react-hooks/exhaustive-deps

  const period = (() => {
    const days = inPhase.map(rowDate).filter(Boolean).map((d) => new Date(d).getTime());
    return days.length ? `${dateMode === 'range' ? 'Filtered' : 'All dates'}: ${shortDate(Math.min(...days))} to ${shortDate(Math.max(...days))}` : 'Nothing in this view';
  })();
  const pick = (setter, value) => { setter(value); setPart(''); };
  const choose = (setter) => (value) => { setter(value); setCategory('all'); setPart(''); };
  const filtered = phase !== '1' || category !== 'all' || part || state !== 'all' || dateMode !== 'all' || q;
  const reset = () => { setProgram(PROGRAMS[0].key); setPhase('1'); setCategory('all'); setPart(''); setState('all'); setDateMode('all'); setFrom(''); setTo(''); setQuery(''); };

  return (
    <Card className={className}>
      {/* Heading and filters */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-sage-muted/25 text-sage"><Pill size={20} /></div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-charcoal/55">Medicine by category</p>
            <h2 className="mt-1 font-display text-xl font-bold text-charcoal">Latest medicine of each patient</h2>
            <p className="mt-1 text-xs text-charcoal/55">Every active patient: program, then their phase, then the supply picked on the PO for the latest medicine of that phase (requested, being made, sent or delivered). Patients with no medicine in their phase yet show under "No medicine yet".</p>
            <p className="mt-1.5 inline-flex rounded-md bg-offwhite-200 px-2 py-1 text-xs font-semibold text-charcoal/75">{period}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 lg:justify-end">
          <label className="relative"><Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-charcoal/40" /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Patient, code or PO" aria-label="Search patient" className={`${selectClass} w-48 pl-8`} /></label>
          <select aria-label="Medicine status" value={state} onChange={(e) => setState(e.target.value)} className={selectClass}>
            <option value="all">Every patient</option><option value="gone">Medicine sent</option><option value="making">Medicine not yet sent</option><option value="none">No medicine yet</option>
          </select>
          <select aria-label="Date filter" value={dateMode} onChange={(e) => setDateMode(e.target.value)} className={selectClass}>
            <option value="all">All dates</option><option value="range">Select dates</option>
          </select>
          {dateMode === 'range' && <>
            <label className="flex items-center gap-1 text-xs text-charcoal/60">From<input type="date" aria-label="From date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} className={selectClass} /></label>
            <label className="flex items-center gap-1 text-xs text-charcoal/60">To<input type="date" aria-label="To date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} className={selectClass} /></label>
          </>}
          {filtered && <button type="button" onClick={reset} className="inline-flex items-center gap-1 rounded-md px-2 py-2 text-xs font-semibold text-[#8C3B2E] hover:bg-[#8C3B2E]/5"><X size={13} />Clear filters</button>}
        </div>
      </div>

      {loading && !data ? (
        <div className="mt-5 rounded-lg border border-cardline bg-offwhite-200 p-5 text-sm text-charcoal/55">Loading medicine categories...</div>
      ) : !all.length ? (
        <div className="mt-5 rounded-lg border border-cardline bg-offwhite-200 p-5 text-sm text-charcoal/55">No active patient has a medicine request yet.</div>
      ) : (
        <>
          {/* 1. Program */}
          <p className="mt-5 text-[11px] font-bold uppercase tracking-wide text-charcoal/50">1 · Program</p>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {PROGRAMS.filter((p) => p.key !== NO_PROGRAM).map((p) => {
              const list = base.filter((x) => x.program === p.key);
              const Icon = p.icon;
              const on = program === p.key;
              return (
                <button key={p.key} type="button" onClick={() => choose(setProgram)(p.key)} className={`flex items-center justify-between rounded-xl border px-4 py-3 text-left transition ${on ? p.active : `${p.tone} hover:shadow-sm`}`}>
                  <span className="flex items-center gap-2"><Icon size={18} /><span><span className="block text-sm font-bold">{p.key}</span><span className="block text-[11px] opacity-75">{list.filter((x) => x.gone).length} sent · {list.filter((x) => !x.gone && !x.none).length} not yet · {list.filter((x) => x.none).length} no medicine</span></span></span>
                  <span className="font-display text-2xl font-bold">{list.length}</span>
                </button>
              );
            })}
          </div>

          {/* 2. Phase */}
          <p className="mt-4 text-[11px] font-bold uppercase tracking-wide text-charcoal/50">2 · Phase <span className="normal-case tracking-normal text-charcoal/45">in {program}</span></p>
          <div className="mt-2 flex flex-wrap gap-2">
            {phases.map(String).map((n) => {
              const count = inProgram.filter((p) => String(p.phase) === n).length;
              const on = phase === n;
              return <button key={n} type="button" onClick={() => choose(setPhase)(n)} className={`rounded-full border px-3.5 py-1.5 text-sm font-semibold transition ${on ? 'border-charcoal bg-charcoal text-white' : count ? 'border-cardline bg-white text-charcoal hover:border-charcoal/40' : 'border-dashed border-cardline bg-white text-charcoal/45 hover:border-charcoal/30'}`}>{phaseLabel(Number(n))} <span className={`ml-1 rounded-full px-1.5 text-xs ${on ? 'bg-white/20' : 'bg-offwhite-200'}`}>{count}</span></button>;
            })}
          </div>

          {/* 3. Supply categories, with their parts */}
          <p className="mt-4 text-[11px] font-bold uppercase tracking-wide text-charcoal/50">3 · Medicine supply</p>
          {!tiles.length && <p className="mt-2 rounded-lg border border-dashed border-cardline px-3 py-3 text-sm text-charcoal/55">No medicine in {phaseLabel(Number(phase))} yet.</p>}
          <div className="mt-2 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {tiles.map((t) => {
              const tone = toneOf(t.key);
              const on = category === t.key;
              const pct = t.count ? Math.round((t.gone / t.count) * 100) : 0;
              return (
                <div key={t.key} className={`rounded-xl border-2 p-3 transition ${tone.box} ${on ? 'ring-2 ring-charcoal/60 ring-offset-1' : ''}`}>
                  <button type="button" onClick={() => pick(setCategory, on ? 'all' : t.key)} className="w-full text-left">
                    <span className="flex items-start justify-between gap-2"><span className={`text-sm font-bold ${tone.head}`}>{t.label}</span><span className={`font-display text-2xl font-bold ${tone.head}`}>{t.count}</span></span>
                    {t.none ? <span className="mt-2 block text-[11px] text-charcoal/60">No medicine request in this phase yet</span> : <>
                      <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-white/80"><span className={`block h-full ${tone.bar}`} style={{ width: `${pct}%` }} /></span>
                      <span className="mt-1 block text-[11px] text-charcoal/60">{t.gone} sent · {t.count - t.gone} not yet</span>
                    </>}
                  </button>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {t.parts.map(([name, n]) => {
                      const partOn = on && part === name;
                      return <button key={name} type="button" onClick={() => { setCategory(t.key); setPart(partOn ? '' : name); }} className={`rounded-md px-2 py-1 text-[11px] font-semibold transition ${partOn ? 'bg-charcoal text-white' : tone.chip}`}>{name}: {n}</button>;
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          {/* The patients */}
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-xs text-charcoal/60">
            <span><b className="text-charcoal">{rows.length}</b> patient{rows.length === 1 ? '' : 's'}{` · ${program}`}{` · ${phaseLabel(Number(phase))}`}{category !== 'all' ? ` · ${tiles.find((t) => t.key === category)?.label || ''}` : ''}{part ? ` · ${part}` : ''} · newest first</span>
          </div>
          <div className="mt-2 overflow-hidden rounded-lg border border-cardline bg-offwhite-100">
            <div className="hidden gap-x-4 border-b border-cardline-soft bg-offwhite-200 px-4 py-2 text-[11px] font-bold uppercase tracking-wide text-charcoal/55 lg:grid lg:grid-cols-[1.4fr_1fr_1.4fr_0.8fr_1fr_1.3fr]">
              <span>Patient</span><span>Program · Phase</span><span>Supply</span><span>PO</span><span>Date</span><span>Status</span>
            </div>
            {!rows.length && <p className="px-4 py-4 text-sm text-charcoal/55">No patient for these filters.</p>}
            {rows.map((p) => {
              const tone = toneOf(p.categoryKey);
              return (
                <div key={p.patientId} className="grid grid-cols-2 gap-2 border-b border-cardline-soft px-4 py-3 text-sm last:border-0 lg:grid-cols-[1.4fr_1fr_1.4fr_0.8fr_1fr_1.3fr] lg:gap-x-4">
                  <Link to={`/admin/patients/${p.patientId}`} className="col-span-2 min-w-0 font-bold text-charcoal hover:text-sage lg:col-span-1">
                    <span className="block truncate">{p.patientName}</span>
                    <span className="block font-mono text-[11px] tracking-widest text-charcoal/45">{p.patientCode}</span>
                  </Link>
                  <span className="text-charcoal"><span className="block text-xs text-charcoal/60">{p.program}</span><b>{phaseLabel(p.phase)}</b></span>
                  <span><span className={`inline-block rounded-md px-2 py-0.5 text-xs font-bold ${tone.chip}`}>{p.categoryLabel}</span>{!p.none && p.part && p.part !== p.categoryLabel.replace(/^Custom: /, '') && <span className="ml-1 text-xs text-charcoal/65">{p.part}</span>}{p.none && p.last && <span className="mt-0.5 block text-[11px] text-charcoal/55">Last: {phaseLabel(p.last.phase)} · {p.last.supplyLabel} · {p.last.status}</span>}</span>
                  <span className="font-mono text-xs text-charcoal/70">{p.poNumber || '-'}</span>
                  <span className="text-xs text-charcoal/70">{p.none ? (p.last?.at ? <>Last {shortDate(p.last.at)}</> : '-') : p.gone ? <>Sent {shortDate(p.sentAt)}</> : <>Requested {shortDate(p.requestedAt)}</>}</span>
                  <span><span className={`inline-block rounded-full px-2.5 py-0.5 text-[11px] font-bold ${STATUS_TONE(p)}`}>{p.status}{p.gone && p.deliveryMode === 'self' ? ' (self pickup)' : ''}</span></span>
                </div>
              );
            })}
          </div>
        </>
      )}
    </Card>
  );
}
