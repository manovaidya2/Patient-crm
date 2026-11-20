import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, Clapperboard, Search } from 'lucide-react';
import Modal from './ui/Modal.jsx';

const day = (v) => (v ? new Date(v).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '');
const FILTERS = [['all', 'All'], ['active', 'Active'], ['inactive', 'Inactive']];

// The "Actor patient" tag (put on from Patient Details): a card with the count on the home page; it opens the list,
// active and inactive patients alike, and a name opens that patient. `patients`: GET /patients/tagged/actor.
export default function ActorPatientsCard({ patients = [] }) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');
  if (!patients.length) return null;
  const counts = { all: patients.length, active: patients.filter((p) => p.isActive).length, inactive: patients.filter((p) => !p.isActive).length };
  const q = query.trim().toLowerCase();
  const rows = patients.filter((p) => (filter === 'all' || (filter === 'active') === p.isActive) && (!q || `${p.patientName} ${p.patientCode} ${p.pccName}`.toLowerCase().includes(q)));
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="group flex items-center gap-3 rounded-lg border border-[#4C2F8F]/25 bg-white px-3 py-2 text-left transition hover:border-[#4C2F8F]/60 hover:shadow-sm">
        <span className="flex h-9 min-w-9 items-center justify-center rounded-full bg-[#5B3A9E] px-2 text-sm font-bold text-white">{patients.length > 99 ? '99+' : patients.length}</span>
        <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-charcoal">Actor Patients</span><span className="block truncate text-xs text-charcoal/60">{counts.active} active · {counts.inactive} inactive</span></span>
        <ChevronRight size={15} className="shrink-0 text-charcoal/30 group-hover:text-[#5B3A9E]" />
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title={`Actor patients (${patients.length})`} className="max-w-3xl">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Status">
            {FILTERS.map(([key, label]) => (
              <button key={key} type="button" onClick={() => setFilter(key)} aria-pressed={filter === key} className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${filter === key ? 'border-[#5B3A9E] bg-[#5B3A9E] text-white' : 'border-cardline bg-white text-charcoal/70 hover:border-[#5B3A9E]/50'}`}>{label} · {counts[key]}</button>
            ))}
          </div>
          <label className="relative"><Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-charcoal/40" /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Name, Patient ID or PCC" aria-label="Search actor patients" className="w-56 rounded-md border border-cardline bg-white py-1.5 pl-8 pr-2 text-sm text-charcoal outline-none focus:border-[#5B3A9E]" /></label>
        </div>
        <div className="mt-3 overflow-hidden rounded-lg border border-cardline">
          {!rows.length && <p className="px-4 py-6 text-center text-sm text-charcoal/55">No patient for this filter.</p>}
          {rows.map((p) => (
            <div key={p.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-cardline-soft px-4 py-2.5 last:border-0">
              <div className="min-w-0">
                <Link to={`/admin/patients/${p.id}`} onClick={() => setOpen(false)} className="inline-flex items-center gap-1.5 font-bold text-charcoal hover:text-[#5B3A9E] hover:underline"><Clapperboard size={13} className="text-[#5B3A9E]" />{p.patientName}</Link>
                <p className="text-[11.5px] text-charcoal/55">{[p.patientCode, p.categoryLabel, `Phase ${p.currentStage}`, p.pccName ? `PCC ${p.pccName}` : ''].filter(Boolean).join(' · ')}</p>
              </div>
              <div className="text-right">
                {p.isActive
                  ? <span className="rounded-full bg-[#E6F3EA] px-2.5 py-0.5 text-[11px] font-bold text-[#1F6B41]">Active</span>
                  : <span className="rounded-full bg-[#EDE9E1] px-2.5 py-0.5 text-[11px] font-bold text-charcoal/65">Inactive{p.inactivatedAt ? ` since ${day(p.inactivatedAt)}` : ''}</span>}
                {p.taggedAt && <p className="mt-0.5 text-[11px] text-charcoal/45">Tagged by {p.taggedByName || '-'} · {day(p.taggedAt)}</p>}
              </div>
            </div>
          ))}
        </div>
      </Modal>
    </>
  );
}
