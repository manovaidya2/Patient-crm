import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Pencil, Plus, RefreshCw, Send, Trash2 } from 'lucide-react';
import api from '../../api/axios.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { ROLE_LABELS, ROLES } from '../../constants/roles.js';
import Button from '../../components/ui/Button.jsx';
import Modal from '../../components/ui/Modal.jsx';
import Drawer from '../../components/ui/Drawer.jsx';

const input = 'w-full min-w-0 rounded-md border border-cardline bg-offwhite-100 px-3 py-2 text-sm';
const statuses = { open: 'Open', in_progress: 'In progress', resolved: 'Resolved', closed: 'Closed' };
const actions = { start: 'Start work', comment: 'Add update', forward: 'Forward / escalate', resolve: 'Resolve', close: 'Close enquiry', reopen: 'Reopen' };
const stamp = (value) => new Date(value).toLocaleString('en-IN');
const blank = { patientName: '', patientReference: '', subject: '', description: '', assignedTo: '' };

export default function Enquiries() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const id = params.get('id');
  const [view, setView] = useState(user?.role === ROLES.ADMIN ? 'following' : 'assigned');
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState({ rows: [], total: 0 });
  const [staff, setStaff] = useState([]);
  const [entry, setEntry] = useState(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState('');
  const [detailError, setDetailError] = useState('');
  const [modalError, setModalError] = useState('');
  const [draft, setDraft] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteReason, setDeleteReason] = useState('');
  const [action, setAction] = useState('');
  const [note, setNote] = useState('');
  const [assignedTo, setAssignedTo] = useState('');
  const [saving, setSaving] = useState(false);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    api.get('/enquiries/staff', { skipCache: true }).then(({ data }) => { if (active) setStaff(data.users); }).catch(() => { if (active) setError('Staff list could not be loaded. Refresh to retry.'); });
    return () => { active = false; };
  }, [revision]);
  useEffect(() => { const refresh = () => setRevision((value) => value + 1); window.addEventListener('enquiries:refresh', refresh); return () => window.removeEventListener('enquiries:refresh', refresh); }, []);
  useEffect(() => {
    const controller = new AbortController(); setLoading(true);
    const timer = setTimeout(async () => {
      try { const result = await api.get('/enquiries', { params: { view, status, search, page }, skipCache: true, signal: controller.signal }); setData(result.data); setError(''); }
      catch (err) { if (!controller.signal.aborted) setError(err.response?.data?.message || 'Could not load enquiries'); }
      finally { if (!controller.signal.aborted) setLoading(false); }
    }, 200);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [view, status, search, page, revision]);
  useEffect(() => {
    if (!id) { setEntry(null); return undefined; }
    const controller = new AbortController(); setDetailLoading(true); setDetailError('');
    api.get(`/enquiries/${id}`, { skipCache: true, signal: controller.signal }).then(({ data }) => {
      if (!controller.signal.aborted) setEntry(data.enquiry);
    }).catch((err) => { if (!controller.signal.aborted) { setEntry(null); setDetailError(err.response?.data?.message || 'Could not load enquiry'); } }).finally(() => { if (!controller.signal.aborted) setDetailLoading(false); });
    return () => controller.abort();
  }, [id, revision]);
  useEffect(() => { setAction(''); setNote(''); setAssignedTo(''); }, [id]);
  // Opening a ticket acknowledges its saved updates for this user only.
  useEffect(() => {
    if (!id) return;
    api.post(`/enquiries/${id}/read`).then(() => window.dispatchEvent(new Event('enquiries:read'))).catch(() => {});
  }, [id]);
  const options = (exclude = '') => Object.entries(ROLE_LABELS).map(([role, label]) => <optgroup key={role} label={label}>{staff.filter((person) => person.role === role && person.id !== exclude).map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}</optgroup>);
  async function create(event) {
    event.preventDefault(); if (saving) return;
    setSaving(true); setModalError('');
    try { const { data } = draft.id ? await api.patch(`/enquiries/${draft.id}`, draft) : await api.post('/enquiries', draft); setDraft(null); setParams({ id: data.enquiry.id }); setRevision((value) => value + 1); }
    catch (err) { setModalError(err.response?.data?.message || 'Could not create enquiry'); }
    finally { setSaving(false); }
  }
  async function update(event) {
    event.preventDefault(); if (saving) return;
    setSaving(true); setDetailError('');
    try { const { data } = await api.post(`/enquiries/${id}/actions`, { action, note, assignedTo }); setEntry(data.enquiry); setAction(''); setNote(''); setAssignedTo(''); setRevision((value) => value + 1); }
    catch (err) { setDetailError(err.response?.data?.message || 'Could not save update'); }
    finally { setSaving(false); }
  }
  async function deleteEnquiry(event) {
    event.preventDefault(); if (saving) return;
    setSaving(true); setModalError('');
    try {
      await api.delete(`/enquiries/${deleteTarget.id}`, { data: { reason: deleteReason } });
      setDeleteTarget(null); setEntry(null); setPage(1); setRevision((value) => value + 1);
      window.dispatchEvent(new Event('enquiries:read'));
    } catch (err) { setModalError(err.response?.data?.message || 'Could not delete enquiry'); }
    finally { setSaving(false); }
  }
  return <div className="space-y-4 pb-14 text-charcoal">
    <header className="flex flex-wrap items-center justify-between gap-3"><h1 className="font-display text-xl font-bold sm:text-2xl">Enquiries & Escalations</h1><Button size="sm" onClick={() => { setModalError(''); setDraft({ ...blank }); }}><Plus size={16} />New enquiry</Button></header>
    <div role="tablist" aria-label="Enquiry views" className="flex flex-wrap gap-1 border-b border-cardline">{[['assigned', 'Assigned to me'], ['created', 'Created by me'], ['following', user?.role === ROLES.ADMIN ? 'All enquiries' : 'Following']].map(([value, label]) => <button key={value} role="tab" aria-selected={view === value} onClick={() => { setView(value); setStatus(''); setPage(1); }} className={`border-b-2 px-3 py-2 text-sm font-semibold ${view === value ? 'border-sage text-sage' : 'border-transparent text-charcoal/65'}`}>{label}</button>)}</div>
<div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5" aria-label="Enquiry counts">
      {[['', 'Total', 'text-charcoal'], ['open', 'Open', 'text-amber-800'], ['in_progress', 'In progress', 'text-blue-800'], ['resolved', 'Resolved', 'text-sage'], ['closed', 'Closed', 'text-charcoal/70']].map(([value, label, tone]) => <button key={value} type="button" aria-label={`Filter ${label.toLowerCase()} enquiries`} aria-pressed={status === value} onClick={() => { setStatus(value); setPage(1); }} className={`min-w-0 rounded-lg border px-3 py-3 text-left transition ${status === value ? 'border-sage bg-sage/10 ring-1 ring-sage' : 'border-cardline bg-offwhite-100 hover:border-sage'}`}><span className="block text-xs font-semibold text-charcoal/75">{label}</span><strong className={`mt-1 block text-xl tabular-nums ${tone}`}>{loading ? '...' : error ? '-' : data.summary?.[value || 'total'] ?? '-'}</strong></button>)}
    </div>
    <div className="flex flex-wrap gap-3"><input aria-label="Search enquiries" placeholder="Search patient, reference or subject" className={`${input} flex-1 basis-56`} value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} /><select aria-label="Enquiry status" className={`${input} !w-auto`} value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}><option value="">All statuses</option>{Object.entries(statuses).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><button title="Refresh enquiries" aria-label="Refresh enquiries" onClick={() => setRevision((value) => value + 1)} className="rounded-md border border-cardline p-2"><RefreshCw size={17} /></button></div>
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    <div className="overflow-x-auto rounded-lg border border-cardline"><table className="w-full min-w-[780px] text-left text-sm"><thead className="bg-[#56695D] text-xs text-white"><tr>{['Patient / Reference', 'Enquiry', 'Status', 'Assigned to', 'Created by', 'Updated'].map((heading) => <th key={heading} className="p-3">{heading}</th>)}</tr></thead><tbody>{loading ? <tr><td colSpan={6} className="p-8 text-center">Loading...</td></tr> : data.rows.map((row) => <tr key={row.id} className="border-t border-cardline bg-offwhite-100"><td className="p-3"><strong>{row.patientName}</strong><small className="block">{row.patientReference || '-'}</small></td><td className="max-w-[260px] p-3"><button onClick={() => setParams({ id: row.id })} className="text-left font-semibold text-sage underline break-words">{row.subject}</button></td><td className="p-3">{statuses[row.status]}</td><td className="p-3">{row.assignedToName}<small className="block text-charcoal/65">{ROLE_LABELS[row.assignedToRole]}</small></td><td className="p-3">{row.createdByName}</td><td className="p-3 text-xs">{stamp(row.updatedAt)}</td></tr>)}{!loading && !data.rows.length && <tr><td colSpan={6} className="p-8 text-center">No enquiries found.</td></tr>}</tbody></table></div>
    <footer className="flex items-center justify-between text-xs"><span>{data.total} enquiries · Page {page}</span><div className="flex gap-2"><button title="Previous page" aria-label="Previous page" disabled={page === 1} onClick={() => setPage(page - 1)} className="p-2 disabled:opacity-30"><ChevronLeft size={17} /></button><button title="Next page" aria-label="Next page" disabled={page * 25 >= data.total} onClick={() => setPage(page + 1)} className="p-2 disabled:opacity-30"><ChevronRight size={17} /></button></div></footer>
    <Modal open={!!draft} onClose={() => !saving && setDraft(null)} title={draft?.id ? "Edit enquiry" : "New patient enquiry"} className="max-w-2xl">{draft && <form onSubmit={create} className="space-y-3">{modalError && <p role="alert" className="text-sm text-red-700">{modalError}</p>}<fieldset disabled={saving} className="grid gap-3 sm:grid-cols-2">{[['patientName', 'Patient name', 150, true], ['patientReference', 'Patient / appointment ID', 100, false], ['subject', 'Subject', 180, true]].map(([key, label, max, required]) => <label key={key} className="space-y-1 text-sm">{label}{required ? ' *' : ''}<input className={input} required={required} maxLength={max} value={draft[key]} onChange={(event) => setDraft({ ...draft, [key]: event.target.value })} /></label>)}<label className="space-y-1 text-sm">Assign to *<select className={input} required value={draft.assignedTo} onChange={(event) => setDraft({ ...draft, assignedTo: event.target.value })}><option value="">Select staff member</option>{draft.id && !staff.some((person) => person.id === String(draft.assignedTo)) && <option value={draft.assignedTo}>{draft.assignedToName} (inactive)</option>}{options()}</select></label><label className="space-y-1 text-sm sm:col-span-2">Enquiry details *<textarea className={input} required maxLength={4000} rows={4} value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} /></label>{draft.id && <label className="space-y-1 text-sm sm:col-span-2">Edit reason *<textarea className={input} required maxLength={1000} value={draft.reason || ''} onChange={(event) => setDraft({ ...draft, reason: event.target.value })} /></label>}</fieldset><Button type="submit" disabled={saving || (!draft.id && !staff.length)}><Send size={16} />{saving ? 'Saving...' : draft.id ? 'Save changes' : 'Create & assign'}</Button></form>}</Modal>
    <Modal open={!!deleteTarget} onClose={() => !saving && setDeleteTarget(null)} title="Delete enquiry"><form onSubmit={deleteEnquiry} className="space-y-3"><p className="text-sm">Delete <strong>{deleteTarget?.subject}</strong>? It will be removed from enquiry lists. Audit history will be retained.</p>{modalError && <p role="alert" className="text-sm text-red-700">{modalError}</p>}<label className="block text-sm">Delete reason *<textarea className={input} required maxLength={1000} value={deleteReason} onChange={(event) => setDeleteReason(event.target.value)} /></label><div className="flex justify-end gap-2"><Button variant="outline" disabled={saving} onClick={() => setDeleteTarget(null)}>Cancel</Button><Button type="submit" disabled={saving}><Trash2 size={16} />{saving ? 'Deleting...' : 'Delete enquiry'}</Button></div></form></Modal>
    <Drawer open={!!id} onClose={() => !saving && setParams({})} title="Enquiry details">
      {detailError && <p role="alert" className="mb-3 text-sm text-red-700">{detailError}</p>}
      {detailLoading ? <p className="text-sm">Loading...</p> : entry && <div className="space-y-4 text-sm"><div><h3 className="break-words font-bold">{entry.subject}</h3><p className="mt-1">{entry.patientName} · {entry.patientReference || 'No reference ID'}</p><p className="mt-2 whitespace-pre-wrap break-words">{entry.description}</p></div><dl className="space-y-1 border-y border-cardline py-3"><div><dt className="inline font-semibold">Status: </dt><dd className="inline">{statuses[entry.status]}</dd></div><div><dt className="inline font-semibold">Assigned: </dt><dd className="inline">{entry.assignedToName} ({ROLE_LABELS[entry.assignedToRole]})</dd></div><div><dt className="inline font-semibold">Created by: </dt><dd className="inline">{entry.createdByName}, {stamp(entry.createdAt)}</dd></div></dl>{entry.resolution && <p className="whitespace-pre-wrap break-words"><strong>Resolution: </strong>{entry.resolution}</p>}{entry.closedReason && <p className="whitespace-pre-wrap break-words"><strong>Closure reason: </strong>{entry.closedReason}</p>}
      {user?.role === ROLES.ADMIN && <div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={() => { setDraft({ ...entry, reason: '' }); setModalError(''); setParams({}); }}><Pencil size={15} />Edit enquiry</Button><Button size="sm" variant="outline" onClick={() => { setDeleteTarget(entry); setDeleteReason(''); setModalError(''); setParams({}); }}><Trash2 size={15} />Delete enquiry</Button></div>}
      {entry.actions.length > 0 && <form onSubmit={update} className="space-y-3 border-b border-cardline pb-4"><select aria-label="Enquiry action" required disabled={saving} value={action} onChange={(event) => setAction(event.target.value)} className={input}><option value="">Select action</option>{entry.actions.map((key) => <option key={key} value={key}>{actions[key]}</option>)}</select>{['forward', 'reopen'].includes(action) && <select aria-label="Assign enquiry to" className={input} value={assignedTo} required disabled={saving} onChange={(event) => setAssignedTo(event.target.value)}><option value="">Select staff member</option>{options(action === 'forward' ? String(entry.assignedTo) : '')}</select>}{action && <><textarea aria-label="Reason or update" placeholder={action === 'resolve' ? 'Solution provided' : 'Reason / update'} className={input} required maxLength={4000} rows={3} value={note} disabled={saving} onChange={(event) => setNote(event.target.value)} /><Button type="submit" size="sm" disabled={saving}><Send size={15} />{saving ? 'Saving...' : actions[action]}</Button></>}</form>}
      <h3 className="font-bold">Timeline</h3><ol className="space-y-4">{[...entry.history].reverse().map((event) => <li key={event._id} className="border-l-2 border-sage pl-3"><strong>{event.action}</strong><p className="mt-1 text-xs">{event.actorName} · {stamp(event.createdAt)}</p><p className="mt-1 text-xs text-charcoal/70">Assigned to {event.assigneeName} · {statuses[event.status]}</p><p className="mt-2 whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{event.note}</p></li>)}</ol></div>}
    </Drawer>
  </div>;
}
