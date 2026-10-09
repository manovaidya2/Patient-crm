import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Search, Users } from 'lucide-react';
import api from '../../api/axios.js';
import Button from '../../components/ui/Button.jsx';
import HrCandidateForm from './HrCandidateForm.jsx';
import { CALL_OUTCOMES, CANDIDATE_STAGES, formatDateTime, labelFor } from './hrOptions.js';

const control = 'rounded-md border border-cardline bg-white px-3 py-2.5 text-sm outline-none focus:border-sage focus:ring-2 focus:ring-sage/15';

export default function HrCandidates() {
  const [rows, setRows] = useState([]);
  const [filters, setFilters] = useState({ search: '', stage: '', active: 'true' });
  const [applied, setApplied] = useState(filters);
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [formOpen, setFormOpen] = useState(false);

  const load = async (page = 1) => {
    setLoading(true);
    try {
      const { data } = await api.get('/hr/candidates', { params: { ...applied, page, limit: 25 } });
      setRows(data.candidates); setPagination(data.pagination); setError('');
    } catch (requestError) { setError(requestError.response?.data?.message || 'Candidates could not be loaded'); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(1); }, [applied]);

  return <div className="space-y-5">
    <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-xs font-semibold uppercase text-sage">HR Management</p><h1 className="font-display text-2xl font-bold text-charcoal">Candidates</h1><p className="mt-1 text-sm text-charcoal/60">{pagination.total} candidate records</p></div><Button onClick={() => setFormOpen(true)}><Plus size={16} /> Add candidate</Button></header>
    <section className="border border-cardline bg-offwhite-100 p-4">
      <form className="grid gap-3 lg:grid-cols-[1fr_220px_180px_auto]" onSubmit={(event) => { event.preventDefault(); setApplied(filters); }}>
        <label className="relative"><Search size={16} className="absolute left-3 top-3 text-charcoal/40" /><input className={`${control} w-full pl-9`} placeholder="Search candidate ID, name, phone, email or position" value={filters.search} onChange={(event) => setFilters({ ...filters, search: event.target.value })} /></label>
        <select className={control} value={filters.stage} onChange={(event) => setFilters({ ...filters, stage: event.target.value })}><option value="">All stages</option>{CANDIDATE_STAGES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
        <select className={control} value={filters.active} onChange={(event) => setFilters({ ...filters, active: event.target.value })}><option value="">All records</option><option value="true">Active</option><option value="false">Inactive</option></select>
        <Button type="submit">Apply filters</Button>
      </form>
    </section>
    {error && <div className="rounded-md bg-red-50 p-4 text-sm text-red-800">{error}</div>}
    <section className="overflow-hidden border border-cardline bg-offwhite-100">
      <div className="overflow-x-auto"><table className="w-full min-w-[1050px] text-sm"><thead className="bg-[#50685D] text-left text-xs uppercase text-white"><tr><th className="px-4 py-3">Candidate</th><th className="px-4 py-3">Contact</th><th className="px-4 py-3">Position</th><th className="px-4 py-3">Stage</th><th className="px-4 py-3">Calls</th><th className="px-4 py-3">Latest call</th><th className="px-4 py-3">Next follow-up</th><th className="px-4 py-3">Action</th></tr></thead><tbody className="divide-y divide-cardline-soft">
        {rows.map((row) => <tr key={row.id} className="hover:bg-offwhite-200"><td className="px-4 py-3"><p className="font-semibold text-charcoal">{row.name}</p><p className="whitespace-nowrap text-xs text-charcoal/55">{row.candidateCode}</p></td><td className="px-4 py-3"><p>{row.phone}</p><p className="text-xs text-charcoal/55">{row.email || 'No email'}</p></td><td className="px-4 py-3 font-medium">{row.appliedPosition}</td><td className="px-4 py-3"><span className="whitespace-nowrap rounded bg-sage/10 px-2 py-1 font-semibold text-sage">{labelFor(CANDIDATE_STAGES, row.stage)}</span></td><td className="px-4 py-3 font-semibold">{row.totalCalls}</td><td className="px-4 py-3"><p>{row.latestCallOutcome ? labelFor(CALL_OUTCOMES, row.latestCallOutcome) : 'No calls'}</p><p className="whitespace-nowrap text-xs text-charcoal/50">{row.latestCallAt ? formatDateTime(row.latestCallAt) : ''}</p></td><td className="px-4 py-3 whitespace-nowrap">{row.nextFollowUpAt ? formatDateTime(row.nextFollowUpAt) : 'Not scheduled'}</td><td className="px-4 py-3"><Link to={`/admin/hr/candidates/${row.id}`}><Button size="sm" variant="outline">Open profile</Button></Link></td></tr>)}
      </tbody></table></div>
      {loading && <p className="p-8 text-center text-sm text-charcoal/50">Loading candidates...</p>}
      {!loading && !rows.length && <div className="border-t border-cardline p-10 text-center text-sm text-charcoal/50"><Users className="mx-auto mb-2 text-charcoal/30" /><p>No candidates match these filters.</p></div>}
      {pagination.pages > 1 && <div className="flex items-center justify-between border-t border-cardline p-3"><Button size="sm" variant="outline" disabled={pagination.page <= 1} onClick={() => load(pagination.page - 1)}>Previous</Button><span className="text-sm text-charcoal/60">Page {pagination.page} of {pagination.pages}</span><Button size="sm" variant="outline" disabled={pagination.page >= pagination.pages} onClick={() => load(pagination.page + 1)}>Next</Button></div>}
    </section>
    <HrCandidateForm open={formOpen} onClose={() => setFormOpen(false)} onSaved={() => load(1)} />
  </div>;
}
