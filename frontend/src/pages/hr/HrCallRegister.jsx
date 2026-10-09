import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Download, History, Pencil, PhoneCall, Plus, ShieldX } from 'lucide-react';
import api from '../../api/axios.js';
import Button from '../../components/ui/Button.jsx';
import Modal from '../../components/ui/Modal.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { ROLES } from '../../constants/roles.js';
import HrCallForm from './HrCallForm.jsx';
import { CALL_OUTCOMES, CALL_TYPES, formatDateTime, labelFor } from './hrOptions.js';

const control = 'rounded-md border border-cardline bg-white px-3 py-2.5 text-sm outline-none focus:border-sage focus:ring-2 focus:ring-sage/15';

export default function HrCallRegister() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const [rows, setRows] = useState([]);
  const [candidates, setCandidates] = useState([]);
  const [filters, setFilters] = useState({ search: '', from: '', to: '', candidateId: '', position: '', outcome: '', followUpStatus: searchParams.get('followUpStatus') || '' });
  const [applied, setApplied] = useState(filters);
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0 });
  const [editing, setEditing] = useState(null);
  const [formOpen, setFormOpen] = useState(false);
  const [historyCall, setHistoryCall] = useState(null);
  const [voidCall, setVoidCall] = useState(null);
  const [voidReason, setVoidReason] = useState('');
  const [error, setError] = useState('');

  const load = async (page = 1) => {
    try { const { data } = await api.get('/hr/calls', { params: { ...applied, page, limit: 30 } }); setRows(data.calls); setPagination(data.pagination); setError(''); }
    catch (requestError) { setError(requestError.response?.data?.message || 'Manual calls could not be loaded'); }
  };
  useEffect(() => { load(1); }, [applied]);
  useEffect(() => { api.get('/hr/candidates', { params: { active: true, limit: 100 } }).then(({ data }) => setCandidates(data.candidates)).catch(() => setCandidates([])); }, []);

  const followUp = async (row, status) => { await api.post(`/hr/calls/${row.id}/follow-up`, { status }); load(pagination.page); };
  const confirmVoid = async () => {
    if (!voidReason.trim()) return;
    try { await api.post(`/hr/calls/${voidCall.id}/void`, { reason: voidReason }); setVoidCall(null); setVoidReason(''); load(pagination.page); }
    catch (requestError) { setError(requestError.response?.data?.message || 'Call could not be voided'); }
  };
  const exportExcel = async () => {
    try {
      const response = await api.get('/hr/calls/export', { params: applied, responseType: 'blob' });
      const url = URL.createObjectURL(response.data); const anchor = document.createElement('a'); anchor.href = url; anchor.download = `HR-Manual-Call-Register.xlsx`; anchor.click(); URL.revokeObjectURL(url);
    } catch { setError('Excel export could not be generated'); }
  };

  return <div className="space-y-5">
    <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-xs font-semibold uppercase text-sage">HR Management</p><h1 className="font-display text-2xl font-bold text-charcoal">Manual Call Register</h1><p className="mt-1 text-sm text-charcoal/60">{pagination.total} HR-entered call records • no telephony integration</p></div><div className="flex gap-2"><Button variant="outline" onClick={exportExcel}><Download size={16} /> Excel</Button><Button onClick={() => { setEditing(null); setFormOpen(true); }}><Plus size={16} /> Add manual call</Button></div></header>
    <section className="border border-cardline bg-offwhite-100 p-4"><form onSubmit={(event) => { event.preventDefault(); setApplied(filters); }} className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      <input className={control} placeholder="Search call, candidate or remarks" value={filters.search} onChange={(event) => setFilters({ ...filters, search: event.target.value })} />
      <select className={control} value={filters.candidateId} onChange={(event) => setFilters({ ...filters, candidateId: event.target.value })}><option value="">All candidates</option>{candidates.map((row) => <option key={row.id} value={row.id}>{row.candidateCode} - {row.name}</option>)}</select>
      <input className={control} placeholder="Job position" value={filters.position} onChange={(event) => setFilters({ ...filters, position: event.target.value })} />
      <select className={control} value={filters.outcome} onChange={(event) => setFilters({ ...filters, outcome: event.target.value })}><option value="">All outcomes</option>{CALL_OUTCOMES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
      <label className="text-xs font-semibold uppercase text-charcoal/55">From<input type="date" className={`${control} mt-1 w-full`} value={filters.from} onChange={(event) => setFilters({ ...filters, from: event.target.value })} /></label>
      <label className="text-xs font-semibold uppercase text-charcoal/55">To<input type="date" className={`${control} mt-1 w-full`} value={filters.to} onChange={(event) => setFilters({ ...filters, to: event.target.value })} /></label>
      <select className={`${control} self-end`} value={filters.followUpStatus} onChange={(event) => setFilters({ ...filters, followUpStatus: event.target.value })}><option value="">All follow-ups</option><option value="pending">Upcoming</option><option value="overdue">Overdue</option><option value="completed">Completed</option><option value="cancelled">Cancelled</option><option value="not_required">Not required</option></select>
      <Button type="submit" className="self-end">Apply filters</Button>
    </form></section>
    {error && <div className="rounded-md bg-red-50 p-3 text-sm text-red-800">{error}</div>}
    <section className="overflow-hidden border border-cardline bg-offwhite-100"><div className="overflow-x-auto"><table className="w-full min-w-[1450px] text-sm"><thead className="bg-[#50685D] text-left text-xs uppercase text-white"><tr><th className="px-4 py-3">Call ID</th><th className="px-4 py-3">Candidate</th><th className="px-4 py-3">Position</th><th className="px-4 py-3">Date / time</th><th className="px-4 py-3">Type</th><th className="px-4 py-3">Outcome</th><th className="px-4 py-3">Remarks</th><th className="px-4 py-3">Next follow-up</th><th className="px-4 py-3">Recorded by</th><th className="px-4 py-3">Actions</th></tr></thead><tbody className="divide-y divide-cardline-soft">
      {rows.map((row) => <tr key={row.id} className={row.followUpDisplayStatus === 'overdue' ? 'bg-red-50/60' : 'hover:bg-offwhite-200'}><td className="px-4 py-3 font-semibold whitespace-nowrap">{row.callCode}<p className="text-[11px] font-normal text-charcoal/50">HR-entered</p></td><td className="px-4 py-3"><Link className="font-semibold text-sage underline" to={`/admin/hr/candidates/${row.candidateId}`}>{row.candidateName}</Link><p className="text-xs text-charcoal/55">{row.candidateCode}</p></td><td className="px-4 py-3">{row.appliedPosition}</td><td className="px-4 py-3 whitespace-nowrap">{row.callDate}<br /><span className="text-charcoal/55">{row.callTime}</span></td><td className="px-4 py-3 whitespace-nowrap">{labelFor(CALL_TYPES, row.callType)}</td><td className="px-4 py-3"><span className="whitespace-nowrap rounded bg-sage/10 px-2 py-1 font-semibold text-sage">{labelFor(CALL_OUTCOMES, row.outcome)}</span></td><td className="max-w-[280px] px-4 py-3"><p className="line-clamp-2" title={row.remarks}>{row.remarks}</p></td><td className="px-4 py-3 whitespace-nowrap">{row.nextFollowUpAt ? <><p className={row.followUpDisplayStatus === 'overdue' ? 'font-semibold text-red-700' : ''}>{formatDateTime(row.nextFollowUpAt)}</p><p className="mt-1 capitalize text-xs">{row.followUpDisplayStatus}</p>{row.followUpStatus === 'pending' && <div className="mt-2 flex gap-1"><button className="text-xs font-semibold text-sage underline" onClick={() => followUp(row, 'completed')}>Complete</button><button className="text-xs text-charcoal/55 underline" onClick={() => followUp(row, 'cancelled')}>Cancel</button></div>}</> : 'Not required'}</td><td className="px-4 py-3 whitespace-nowrap">{row.recordedByName}<p className="text-xs text-charcoal/50">{formatDateTime(row.createdAt)}</p></td><td className="px-4 py-3"><div className="flex gap-1"><button title="Edit call" className="p-2 text-sage" onClick={() => { setEditing(row); setFormOpen(true); }}><Pencil size={16} /></button><button title="Audit history" className="p-2 text-charcoal/60" onClick={() => setHistoryCall(row)}><History size={16} /></button>{user?.role === ROLES.ADMIN && <button title="Void call" className="p-2 text-red-700" onClick={() => setVoidCall(row)}><ShieldX size={16} /></button>}</div></td></tr>)}
    </tbody></table></div>
    {!rows.length && <div className="border-t border-cardline p-10 text-center text-sm text-charcoal/50"><PhoneCall className="mx-auto mb-2" />No manual calls match these filters.</div>}
    {pagination.pages > 1 && <div className="flex items-center justify-between border-t border-cardline p-3"><Button size="sm" variant="outline" disabled={pagination.page <= 1} onClick={() => load(pagination.page - 1)}>Previous</Button><span className="text-sm">Page {pagination.page} of {pagination.pages}</span><Button size="sm" variant="outline" disabled={pagination.page >= pagination.pages} onClick={() => load(pagination.page + 1)}>Next</Button></div>}
    </section>
    <HrCallForm open={formOpen} call={editing} candidates={candidates} onClose={() => setFormOpen(false)} onSaved={() => load(pagination.page)} />
    <Modal open={!!historyCall} onClose={() => setHistoryCall(null)} title="Call audit history" className="max-w-2xl"><div className="space-y-3"><div className="rounded-md bg-offwhite-200 p-3"><p className="font-semibold">{historyCall?.callCode}</p><p className="text-sm text-charcoal/60">Created by {historyCall?.recordedByName} on {formatDateTime(historyCall?.createdAt)}</p></div>{historyCall?.editHistory?.map((entry) => <div key={entry.id} className="border-l-2 border-sage pl-3"><p className="text-sm font-semibold">Edited by {entry.editedByName}</p><p className="text-xs text-charcoal/50">{formatDateTime(entry.editedAt)}</p>{entry.changes.map((change, index) => <p key={`${change.field}-${index}`} className="mt-1 text-sm"><strong className="capitalize">{change.field.replaceAll('_', ' ')}:</strong> {String(change.from ?? 'blank')} → {String(change.to ?? 'blank')}</p>)}</div>)}{!historyCall?.editHistory?.length && <p className="text-sm text-charcoal/55">This record has not been edited.</p>}</div></Modal>
    <Modal open={!!voidCall} onClose={() => setVoidCall(null)} title="Void manual call record"><p className="text-sm text-charcoal/65">The record remains in audit history but is removed from call totals and follow-ups.</p><textarea className={`${control} mt-4 w-full`} rows="3" placeholder="Mandatory reason" value={voidReason} onChange={(event) => setVoidReason(event.target.value)} /><div className="mt-4 flex justify-end gap-2"><Button variant="ghost" onClick={() => setVoidCall(null)}>Cancel</Button><Button variant="danger" disabled={!voidReason.trim()} onClick={confirmVoid}>Void record</Button></div></Modal>
  </div>;
}
