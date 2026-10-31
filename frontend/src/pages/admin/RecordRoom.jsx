import { useEffect, useState } from 'react';
import useStaleState from '../../hooks/useStaleState.js';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ArrowUpRight, CheckCircle2, ChevronLeft, ChevronRight, Clock3, Download, FileText, FolderOpen, Pencil, Plus, Search, Trash2, Upload, AlertTriangle, X } from 'lucide-react';
import api from '../../api/axios.js';
import { Camera } from 'lucide-react';
import Button from '../../components/ui/Button.jsx';
import Modal from '../../components/ui/Modal.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { ROLES, isAdminLike } from '../../constants/roles.js';

const base = (import.meta.env.VITE_API_URL || 'http://localhost:5000/api').replace(/\/api\/?$/, '');
const stamp = (value) => value ? new Date(value).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-';
const inputClasses = 'min-h-[41px] w-full rounded-[10px] border border-[#DED2BD] bg-white px-3 py-2.5 text-charcoal [font:inherit] focus:outline focus:outline-2 focus:outline-[#738c7a] focus:outline-offset-1';
const statTones = {
  neutral: 'border-[#E8DFCB] bg-white text-charcoal',
  amber: 'border-[#FDBA74] bg-[#FFF7ED] text-[#C2410C]',
  red: 'border-[#FCA5A5] bg-[#FEF2F2] text-[#9F1D1D]',
};

const localDateTime = (value) => { if (!value) return ''; const date = new Date(value); return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16); };
const emptyPatient = { patientName: '', patientId: '', appointmentId: '', shelfNumber: '', fileNumber: '', indexNumber: '', firstReceivedAt: '' };
const statusLabel = (entry) => !entry.returnedAt ? 'Awaiting return' : entry.returnCondition === 'problem' ? 'Returned with problem' : entry.returnCondition === 'intact' ? 'Returned intact' : 'Returned';

function Field({ label, children }) {
  return <label className="rr-field grid min-w-0 gap-1.5 [&>span]:text-xs [&>span]:leading-[1.5] [&>span]:font-semibold"><span>{label}</span>{children}</label>;
}

async function optimizeRecordImage(file) {
  if (!/^image\/(jpeg|png)$/i.test(file.type) || typeof createImageBitmap !== 'function') return file;
  let bitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const scale = Math.min(1, 2000 / bitmap.width, 2800 / bitmap.height);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d', { alpha: false });
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    let quality = 0.82;
    let blob;
    do {
      blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
      quality -= 0.08;
    } while (blob?.size > 9.5 * 1024 * 1024 && quality >= 0.5);
    if (!blob) return file;
    const name = `${file.name.replace(/\.[^.]+$/, '') || 'record-page'}.jpg`;
    return new File([blob], name, { type: 'image/jpeg', lastModified: file.lastModified });
  } catch {
    return file;
  } finally {
    bitmap?.close?.();
  }
}

export default function RecordRoom() {
  const { user } = useAuth();
  const isAdmin = user?.role === ROLES.ADMIN; // deleting stays Admin-only
  const canManage = isAdminLike(user);
  const navigate = useNavigate();
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const register = location.pathname.endsWith('/register');
  const recordId = params.get('record');
  const treatment = params.get('treatment') === 'not_bought' ? 'not_bought' : 'bought';
  const recordsUrl = `/admin/record-room?treatment=${treatment}`;
  const status = params.get('status') || 'all';
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const listKey = `record-room:${register}:${treatment}:${status}:${search}:${page}`;
  const [records, setRecords] = useStaleState(listKey, []);
  const [entries, setEntries] = useStaleState(`${listKey}:entries`, []);
  const [total, setTotal] = useStaleState(`${listKey}:total`, 0);
  const [summary, setSummary] = useStaleState(`record-room:summary:${treatment}`, null);
  const [selected, setSelected] = useStaleState(`record-room:record:${recordId || ''}`, null);
  const hasSnapshot = recordId ? Boolean(selected) : Boolean(records.length || entries.length);
  const [loading, setLoading] = useState(!hasSnapshot);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const [modal, setModal] = useState(null);
  const [modalError, setModalError] = useState('');
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(emptyPatient);
  const [editRecordId, setEditRecordId] = useState(null);
  const [lookup, setLookup] = useState('');
  const [matches, setMatches] = useState([]);
  const [issuePatient, setIssuePatient] = useState(null);
  const [issueForm, setIssueForm] = useState({ givenTo: '', reason: '' });
  const [collection, setCollection] = useState(null);
  const [returnForm, setReturnForm] = useState({ returnCondition: 'intact', problemDetails: '', notes: '' });
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteError, setDeleteError] = useState('');

  useEffect(() => { setPage(1); setSearch(''); }, [register, status, treatment]);
  useEffect(() => {
    let active = true;
    api.get('/record-room/summary', { params: { treatmentStatus: treatment }, skipCache: true }).then(({ data }) => { if (active) setSummary(data); }).catch(() => { if (active) setSummary(null); });
    return () => { active = false; };
  }, [revision, treatment]);

  useEffect(() => {
    let active = true;
    if (!hasSnapshot) setLoading(true);
    setError('');
    const timer = setTimeout(async () => {
      try {
        if (recordId) {
          const { data } = await api.get(`/record-room/${recordId}`, { skipCache: true });
          if (active) setSelected(data.record);
        } else {
          const { data } = await api.get(register ? '/record-room/movements' : '/record-room', { params: { search, page, status, treatmentStatus: treatment }, skipCache: true });
          if (active) { setRecords(data.records || []); setEntries(data.entries || []); setTotal(data.total || 0); setSelected(null); }
        }
      } catch (err) { if (active) setError(err.response?.data?.message || 'Unable to load records. Please try again.'); }
      finally { if (active) setLoading(false); }
    }, 200);
    return () => { active = false; clearTimeout(timer); };
  }, [recordId, register, search, page, status, revision, treatment]);

  useEffect(() => {
    let active = true;
    setMatches([]);
    if (!['create', 'edit', 'issue'].includes(modal) || lookup.trim().length < 2) return;
    const timer = setTimeout(async () => {
      try {
        const { data } = await api.get(['create', 'edit'].includes(modal) ? '/record-room/lookup' : '/record-room', { params: ['create', 'edit'].includes(modal) ? { query: lookup } : { search: lookup, treatmentStatus: treatment }, skipCache: true });
        if (active) setMatches(data.results || data.records || []);
      } catch { if (active) setModalError('Patient search failed. Please try again.'); }
    }, 250);
    return () => { active = false; clearTimeout(timer); };
  }, [lookup, modal, treatment]);

  function openModal(kind, patient = null) {
    setModalError(''); setLookup(''); setMatches([]); setModal(kind);
    if (kind === 'create') setForm({ ...emptyPatient, treatmentStatus: treatment });
    if (kind === 'edit' && patient) { setEditRecordId(patient.id); setForm({ patientName: patient.patientName || '', patientId: patient.patientId || '', appointmentId: patient.appointmentId || '', shelfNumber: patient.shelfNumber || '', fileNumber: patient.fileNumber || '', indexNumber: patient.indexNumber || '', firstReceivedAt: localDateTime(patient.firstReceivedAt), treatmentStatus: patient.treatmentStatus || 'bought' }); }
    if (kind === 'issue') { setIssuePatient(patient); setIssueForm({ givenTo: '', reason: '' }); }
  }

  async function save(event) {
    event.preventDefault();
    setSaving(true); setModalError('');
    try {
      if (modal === 'create') {
        const { data } = await api.post('/record-room', { ...form, firstReceivedAt: form.firstReceivedAt ? new Date(form.firstReceivedAt).toISOString() : null });
        navigate(`/admin/record-room?record=${data.record.id}&treatment=${data.record.treatmentStatus || treatment}`);
      } else if (modal === 'edit') {
        await api.patch(`/record-room/${editRecordId}`, { ...form, firstReceivedAt: form.firstReceivedAt ? new Date(form.firstReceivedAt).toISOString() : null });
        setParams({ treatment: form.treatmentStatus, ...(recordId ? { record: recordId } : {}) });
      } else if (modal === 'issue') {
        if (!issuePatient) throw new Error('Select a patient record first.');
        await api.post(`/record-room/${issuePatient.id}/issue`, issueForm);
      } else {
        await api.post(`/record-room/${collection.recordId}/collect/${collection.entry.id || collection.entry._id}`, returnForm);
      }
      setModal(null); setRevision((value) => value + 1);
    } catch (err) { setModalError(err.response?.data?.message || err.message || 'Unable to save.'); }
    finally { setSaving(false); }
  }

  async function deleteRecord() {
    if (!deleteTarget || deleteTarget.issueHistory?.some((entry) => !entry.returnedAt)) return;
    setSaving(true); setDeleteError('');
    try {
      await api.delete(`/record-room/${deleteTarget.id}`);
      setDeleteTarget(null);
      setSelected(null);
      setRevision((value) => value + 1);
      if (recordId) navigate(recordsUrl);
    } catch (err) { setDeleteError(err.response?.data?.message || 'Record could not be deleted.'); }
    finally { setSaving(false); }
  }

  async function upload(event) {
    const input = event.target;
    const files = Array.from(input.files || []);
    if (!files.length) return;
    setSaving(true); setError('');
    try {
      const body = new FormData();
      for (const file of files) body.append('documents', await optimizeRecordImage(file));
      await api.post(`/record-room/${recordId}/documents`, body);
      setRevision((value) => value + 1);
    } catch (err) { setError(err.response?.data?.message || 'Upload failed. Please use JPG or PNG images.'); }
    finally { setSaving(false); input.value = ''; }
  }

  async function deleteDocument(document) {
    if (!isAdmin || saving || !window.confirm(`Remove ${document.fileName}? The combined PDF will be rebuilt.`)) return;
    setSaving(true); setError('');
    try {
      const { data } = await api.delete(`/record-room/${recordId}/documents/${document.id}`);
      setSelected(data.record);
      setRevision((value) => value + 1);
    } catch (err) { setError(err.response?.data?.message || 'Document could not be removed.'); }
    finally { setSaving(false); }
  }

  async function download() {
    setError('');
    try {
      const response = await fetch(`${base}${selected.pdfUrl}?v=${encodeURIComponent(selected.pdfUpdatedAt || '')}`);
      if (!response.ok) throw new Error();
      const url = URL.createObjectURL(await response.blob());
      const anchor = document.createElement('a'); anchor.href = url; anchor.download = selected.pdfName || 'patient-record.pdf'; anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch { setError('Unable to download the PDF. Please try again.'); }
  }

  function openReturn(row) {
    setCollection(row); setReturnForm({ returnCondition: 'intact', problemDetails: '', notes: '' }); openModal('collect');
  }

  function movementTable(rows) {
    return <div className="rr-table-wrap w-full overflow-x-auto rounded-[14px] border border-[#E8DFCB] bg-white"><table className="rr-table w-full min-w-[820px] border-collapse text-[13px] [&_th]:px-4 [&_th]:py-3 [&_th]:text-left [&_td]:max-w-[260px] [&_td]:border-b [&_td]:border-[#F5EFE3] [&_td]:p-4 [&_td]:align-top [&_td]:[overflow-wrap:anywhere] [&_tr:last-child_td]:border-b-0 [&_small]:mt-[5px] [&_small]:block [&_small]:text-xs [&_small]:leading-[1.5] [&_small]:text-[#6b7278] rr-register !min-w-[1050px]"><thead><tr><th>Patient reference</th><th>Given to / purpose</th><th>Issued</th><th>Return details</th><th>Action</th></tr></thead><tbody>
      {rows.map((row) => {
        const entry = row.entry;
        return <tr key={entry.id || entry._id} className={!entry.returnedAt ? 'rr-pending-row bg-[#FFF7ED] [&_td:first-child]:shadow-[inset_3px_0_#F97316]' : entry.returnCondition === 'problem' ? 'rr-problem-row bg-[#FEF2F2] [&_td:first-child]:shadow-[inset_3px_0_#9F1D1D]' : ''}>
          <td><Link className="rr-link inline-flex items-center gap-[5px] text-left font-semibold text-[#345e48] hover:underline" to={`/admin/record-room?record=${row.recordId}&treatment=${treatment}`}>{row.patientName}<ArrowUpRight size={13} /></Link><small>{row.patientId || '-'}</small><small>{row.appointmentId || '-'}</small></td>
          <td><strong>{entry.givenTo}</strong><small>{entry.reason || '-'}</small></td>
          <td>{stamp(entry.issuedAt)}<small>By {entry.issuedByName || '-'}</small></td>
          <td><span className={`rr-badge inline-block rounded-full px-2.5 py-0.5 text-[11px] font-bold ${!entry.returnedAt ? 'rr-amber bg-[#F97316] text-white' : entry.returnCondition === 'problem' ? 'rr-red bg-[#FDE2E1] text-[#9F1D1D]' : 'rr-green bg-[#E6F2EA] text-[#1F6B41]'}`}>{statusLabel(entry)}</span>{entry.returnedAt && <><small>{stamp(entry.returnedAt)}</small><small>Collected by {entry.returnedByName || '-'}</small>{entry.problemDetails && <p className="rr-problem-text mt-[7px] text-xs leading-[1.5] text-[#8b3e34]">{entry.problemDetails}</p>}{entry.returnNotes && <small>{entry.returnNotes}</small>}</>}</td>
          <td>{!entry.returnedAt ? <Button size="sm" variant="outline" onClick={() => openReturn(row)}><CheckCircle2 size={14} /> Collect</Button> : <span className="rr-muted text-xs leading-[1.5] text-[#626d71]">Recorded</span>}</td>
        </tr>;
      })}
      {!rows.length && <tr><td colSpan={5} className="rr-empty !px-5 !py-12 !text-center text-[#626d71]">No paper movements found.</td></tr>}
    </tbody></table></div>;
  }

  return <div className="record-room mx-auto max-w-[1500px] text-sm leading-[1.5] text-charcoal [&_h1]:mt-[3px] [&_h1]:text-[26px] [&_h1]:font-bold [&_h2]:text-[17px] [&_h2]:font-bold">
    <header className="rr-heading mb-4 flex flex-wrap items-end justify-between gap-3.5 max-[480px]:items-start max-[480px]:[&_h1]:text-[22px] max-[480px]:[&>.rr-actions]:w-full max-[480px]:[&>.rr-actions_button]:flex-1 max-[480px]:[&>.rr-actions_button]:p-2 max-[480px]:[&>.rr-actions_button]:text-xs max-[480px]:[&>.rr-actions_button]:leading-[1.5]"><div className="flex min-w-0 items-start gap-3"><span className="hidden h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-sage/15 text-sage sm:flex"><FolderOpen size={20} /></span><div className="min-w-0"><p className="rr-eyebrow text-xs text-charcoal/60">Reception / Records</p><h1 className="font-display !text-[22px] !font-extrabold leading-tight">{recordId ? 'Patient record' : register ? 'Issue & return register' : 'Record Room'}</h1><p className="mt-0.5 text-[12.5px] text-charcoal/60">Patient paper files: where each file sits, its scanned pages, and who has taken papers out.</p></div></div><div className="rr-actions flex flex-wrap items-center gap-2.5">{recordId ? <Button variant="outline" onClick={() => navigate(recordsUrl)}><ArrowLeft size={16} /> All records</Button> : <><Button variant="outline" onClick={() => openModal('create')}><Plus size={16} /> Add patient record</Button><Button onClick={() => openModal('issue')}><ArrowUpRight size={16} /> Issue paper</Button></>}</div></header>

    {!recordId && <>
      <div role="tablist" aria-label="Treatment records" className="mb-3.5 flex flex-wrap gap-1.5">{[['bought', 'Treatment Bought'], ['not_bought', 'Treatment Not Bought']].map(([value, label]) => <button key={value} type="button" role="tab" aria-selected={treatment === value} onClick={() => { setPage(1); setSearch(''); setParams({ treatment: value }); }} className={`rounded-full border px-4 py-1.5 text-xs font-bold ${treatment === value ? 'border-charcoal bg-charcoal text-white' : 'border-[#DED2BD] bg-white text-charcoal hover:bg-[#FBF7ED]'}`}>{label}</button>)}</div>
      <div className="rr-stats mb-[22px] mt-1 grid grid-cols-3 gap-3 max-[800px]:grid-cols-2">
        {[
          { label: 'Patient records', count: summary?.total, icon: FolderOpen, to: recordsUrl, tone: 'neutral', active: !register },
          { label: 'Awaiting return', count: summary?.pending, icon: Clock3, to: `/admin/record-room/register?status=pending&treatment=${treatment}`, tone: 'amber', active: register && status === 'pending' },
          { label: 'Returned with problem', count: summary?.problems, icon: AlertTriangle, to: `/admin/record-room/register?status=problem&treatment=${treatment}`, tone: 'red', active: register && status === 'problem' },
        ].map(({ label, count, icon: Icon, to, tone, active }) => <Link key={label} to={to} className={`rr-stat flex min-h-[84px] items-center justify-between gap-2.5 rounded-[14px] border px-[18px] py-[13px] max-[800px]:p-3 [&_span]:block [&_span]:text-[10.5px] [&_span]:uppercase [&_span]:tracking-wide [&_span]:leading-[1.5] [&_span]:font-bold [&_strong]:mt-[3px] [&_strong]:block [&_strong]:font-display [&_strong]:text-[24px] [&_strong]:font-extrabold [&_strong]:leading-[1.1] transition hover:shadow-sm rr-stat-${tone} ${statTones[tone]} ${active ? 'rr-stat-active ring-2 ring-charcoal/70' : ''}`}><div><span>{label}</span><strong>{count ?? '-'}</strong></div><Icon size={22} /></Link>)}
      </div>
      <nav className="rr-tabs flex gap-[22px] border-b border-[#E8DFCB] [&_a]:flex [&_a]:items-center [&_a]:gap-[7px] [&_a]:border-b-2 [&_a]:border-transparent [&_a]:px-0.5 [&_a]:py-2.5 [&_a]:text-[13px] [&_a]:font-bold [&_a]:text-charcoal/60 [&_a[aria-current]]:border-charcoal [&_a[aria-current]]:text-charcoal max-[480px]:gap-[15px] max-[480px]:text-xs max-[480px]:leading-[1.5]" aria-label="Record Room pages"><Link to="/admin/record-room" aria-current={!register ? 'page' : undefined}><FolderOpen size={16} /> Patient records</Link><Link to="/admin/record-room/register" aria-current={register ? 'page' : undefined}><FileText size={16} /> Issue & return register</Link></nav>
      <div className="rr-toolbar flex flex-wrap items-center gap-3 py-4 [&>select]:!w-auto [&>select]:max-w-full [&>.rr-muted]:ml-auto"><label className="rr-search relative w-full max-w-[440px] [&_svg]:pointer-events-none [&_svg]:absolute [&_svg]:left-[13px] [&_svg]:top-1/2 [&_svg]:-translate-y-1/2 [&_svg]:text-[#56695d] [&_input]:!pl-[39px]"><Search size={17} /><input className={inputClasses} aria-label="Search records" placeholder={register ? 'Search patient or recipient' : 'Search patient, appointment, shelf, file or index number'} value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} /></label>{register && <select className={inputClasses} aria-label="Movement status" value={status} onChange={(event) => { setPage(1); setParams({ treatment, ...(event.target.value === 'all' ? {} : { status: event.target.value }) }); }}><option value="all">All movements</option><option value="pending">Awaiting return</option><option value="returned">Collected</option><option value="problem">Returned with problem</option></select>}<span className="rr-muted text-xs leading-[1.5] text-[#626d71]">{total} {register ? 'movements' : 'records'}</span></div>
    </>}

    {error && <div role="alert" className="rr-error mb-3 rounded-md border border-[#ebc8be] bg-[#fff0ec] p-3 text-[#853b30]">{error}<Button size="sm" variant="ghost" onClick={() => setRevision((value) => value + 1)}>Retry</Button></div>}
    {loading ? <div className="rr-empty !px-5 !py-12 !text-center text-[#626d71]" role="status">Loading records...</div> : !error && (recordId && selected ? <>
      <section className="rr-patient-heading mb-4 flex flex-wrap items-center justify-between gap-3.5 rounded-[14px] border border-[#E8DFCB] bg-white px-4 py-4 sm:px-[18px]">
        <div className="flex min-w-0 items-start gap-3"><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[12px] bg-[#E9EFE9] text-sage"><FolderOpen size={20} /></span><div className="min-w-0"><h2 className="font-display !text-[17px] !font-extrabold">{selected.patientName}</h2><div className="mt-1.5 flex flex-wrap gap-1.5 text-[11.5px]">{[['Patient ID', selected.patientId], ['Appointment ID', selected.appointmentId], ['Shelf', selected.shelfNumber], ['File', selected.fileNumber], ['Index', selected.indexNumber]].map(([k, v]) => <span key={k} className="rounded-full bg-[#F6F0E3] px-2.5 py-0.5 text-charcoal/70">{k}: <strong className="text-charcoal">{v || '-'}</strong></span>)}<span className="rounded-full bg-[#F6F0E3] px-2.5 py-0.5 text-charcoal/70">First paper received: <strong className="text-charcoal">{selected.firstReceivedAt ? stamp(selected.firstReceivedAt) : 'Not recorded'}</strong></span></div></div></div>
        <div className="flex flex-wrap items-center gap-2"><Button onClick={() => openModal('issue', selected)}><ArrowUpRight size={16} /> Issue paper</Button>{canManage && <Button variant="outline" onClick={() => openModal('edit', selected)}><Pencil size={16} /> Edit record</Button>}{isAdmin && <Button variant="danger" onClick={() => { setDeleteTarget(selected); setDeleteError(''); }}><Trash2 size={16} /> Delete</Button>}</div>
      </section>
      <section className="rr-documents mb-4 rounded-[14px] border border-[#E8DFCB] bg-white px-4 pb-4 sm:px-[18px]"><div className="rr-section-heading flex flex-wrap items-center justify-between gap-3.5 py-[18px]"><div><h2>Documents <span className="rr-muted text-xs leading-[1.5] text-[#626d71]">({selected.pdfPageCount || 0} pages)</span></h2><small className="rr-muted text-xs leading-[1.5] text-[#626d71]">Last upload: {stamp(selected.pdfUpdatedAt)}</small></div><div className="rr-actions flex flex-wrap items-center gap-2.5"><label className={`rr-upload inline-flex cursor-pointer items-center gap-[7px] rounded-[10px] bg-sage px-3 py-[9px] text-[13px] font-bold text-white [&_input]:hidden ${saving ? 'rr-disabled pointer-events-none opacity-50' : ''}`}><Upload size={16} />{saving ? 'Uploading...' : 'Upload images'}<input className={inputClasses} type="file" accept="image/jpeg,image/png" multiple disabled={saving} onChange={upload} /></label><label className={`rr-upload inline-flex cursor-pointer items-center gap-[7px] rounded-[10px] border border-[#DED2BD] bg-white px-3 py-[9px] text-[13px] font-bold text-charcoal ${saving ? 'pointer-events-none opacity-50' : ''}`}><Camera size={16} />Camera<input type="file" accept="image/jpeg,image/png" capture="environment" aria-label="Take a document photo" className="sr-only" disabled={saving} onChange={upload} /></label>{selected.pdfUrl && <><a className="rr-link inline-flex items-center gap-[5px] text-left font-semibold text-[#345e48] hover:underline" href={`${base}${selected.pdfUrl}?v=${encodeURIComponent(selected.pdfUpdatedAt || '')}`} target="_blank" rel="noreferrer"><FileText size={16} /> View / print PDF</a><button className="rr-icon inline-flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-md border border-[#cbd1ca] bg-[#fffefa] disabled:cursor-not-allowed disabled:opacity-40" title="Download PDF" aria-label="Download PDF" onClick={download}><Download size={17} /></button></>}</div></div>
        {selected.documents?.length ? <div className="rr-document-list grid grid-cols-2 gap-x-6 max-[800px]:grid-cols-1 [&_strong]:block [&_strong]:truncate [&_strong]:text-xs [&_strong]:leading-[1.5] [&_small]:text-[11px] [&_small]:text-[#626d71]">{selected.documents.map((doc, index) => <div key={doc.id} className="flex min-w-0 items-center gap-2.5 border-b border-[#F5EFE3] py-3"><a className="flex min-w-0 flex-1 items-center gap-2.5" href={`${base}${doc.url}`} target="_blank" rel="noreferrer"><FileText size={18} /><div className="min-w-0 flex-1"><strong>{index + 1}. {doc.fileName}</strong><small>{stamp(doc.uploadedAt)} / {doc.uploadedByName}</small></div><ArrowUpRight size={15} /></a>{isAdmin && <button type="button" disabled={saving} onClick={() => deleteDocument(doc)} className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[#8C3B2E] hover:bg-[#8C3B2E]/10 disabled:opacity-40" title="Remove this image" aria-label={`Remove ${doc.fileName}`}><X size={15} /></button>}</div>)}</div> : <p className="rr-empty !px-5 !py-12 !text-center text-[#626d71]">No documents uploaded yet.</p>}
      </section>
      <div className="rr-section-heading flex flex-wrap items-center justify-between gap-3.5 py-[18px]"><h2>Paper movement history</h2></div>
      {movementTable([...(selected.issueHistory || [])].reverse().map((entry) => ({ recordId: selected.id, patientName: selected.patientName, patientId: selected.patientId, appointmentId: selected.appointmentId, entry })))}
    </> : register ? movementTable(entries) : <div className="rr-table-wrap w-full overflow-x-auto rounded-[14px] border border-[#E8DFCB] bg-white"><table className="rr-table rr-records w-full min-w-[1050px] border-collapse text-[13px] [&_th]:px-4 [&_th]:py-3 [&_th]:text-left [&_td]:max-w-[260px] [&_td]:border-b [&_td]:border-[#F5EFE3] [&_td]:px-4 [&_td]:py-3 [&_td]:align-middle [&_td]:[overflow-wrap:anywhere] [&_tr:last-child_td]:border-b-0 [&_small]:mt-[3px] [&_small]:block [&_small]:text-[11.5px] [&_small]:leading-[1.5] [&_small]:text-[#6b7278]"><thead><tr><th>Patient</th><th>Location (shelf / file / index)</th><th>First time paper received</th><th>Documents</th><th>Paper status</th><th>Actions</th></tr></thead><tbody>{records.map((record) => {
      const pending = record.issueHistory.filter((entry) => !entry.returnedAt).length;
      return <tr key={record.id} className={pending ? 'rr-pending-row bg-[#FFF7ED] [&_td:first-child]:shadow-[inset_3px_0_#F97316]' : 'hover:bg-[#FFFCF5]'}><td><div className="flex min-w-0 items-center gap-3"><span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] ${pending ? 'bg-[#FFE4CC] text-[#C2410C]' : 'bg-[#E9EFE9] text-sage'}`}><FolderOpen size={18} /></span><div className="min-w-0"><Link className="rr-link inline-flex items-center gap-[5px] text-left text-[13.5px] font-extrabold text-charcoal hover:text-sage hover:underline" to={`?record=${record.id}&treatment=${treatment}`}>{record.patientName}<ArrowUpRight size={14} /></Link><small>Patient ID {record.patientId || '-'} · Appointment ID {record.appointmentId || '-'}</small></div></div></td><td><div className="flex flex-wrap gap-1">{[['Shelf', record.shelfNumber], ['File', record.fileNumber], ['Index', record.indexNumber]].map(([k, v]) => <span key={k} className="rounded-md bg-[#F6F0E3] px-2 py-0.5 text-[11.5px] text-charcoal/65">{k} <b className="font-mono text-charcoal">{v || '-'}</b></span>)}</div></td><td className="text-[12.5px]">{record.firstReceivedAt ? stamp(record.firstReceivedAt) : 'Not recorded'}</td><td><b className="font-display text-[14px] font-extrabold">{record.pdfPageCount || 0}</b> pages<small>{stamp(record.pdfUpdatedAt)}</small></td><td><span className={`rr-badge inline-block whitespace-nowrap rounded-full px-2.5 py-0.5 text-[11px] font-bold ${pending ? 'rr-amber bg-[#F97316] text-white' : 'rr-green bg-[#E6F2EA] text-[#1F6B41]'}`}>{pending ? `${pending} awaiting return` : 'No pending returns'}</span></td><td><div className="rr-actions flex flex-wrap items-center gap-2.5"><Link className="rr-link inline-flex items-center gap-[5px] rounded-[10px] border border-[#DED2BD] bg-white px-3 py-1.5 text-left text-xs font-bold text-charcoal hover:bg-[#FBF7ED]" to={`?record=${record.id}&treatment=${treatment}`}>Open record</Link><button className="rr-icon inline-flex h-[32px] w-[32px] shrink-0 items-center justify-center rounded-[10px] border border-[#DED2BD] bg-white disabled:cursor-not-allowed disabled:opacity-40" title="Issue paper" aria-label={`Issue paper for ${record.patientName}`} onClick={() => openModal('issue', record)}><ArrowUpRight size={17} /></button>{canManage && <button className="rr-icon rounded-[10px] border border-[#DED2BD] bg-white p-2 text-sage" title="Edit record" aria-label={`Edit record for ${record.patientName}`} onClick={() => openModal('edit', record)}><Pencil size={16} /></button>}{isAdmin && <button className="rr-icon rounded-[10px] border border-[#F5C6C0] bg-white p-2 text-[#9F1D1D]" title="Delete record" aria-label={`Delete record for ${record.patientName}`} onClick={() => { setDeleteTarget(record); setDeleteError(''); }}><Trash2 size={16} /></button>}</div></td></tr>;
    })}{!records.length && <tr><td colSpan={6} className="rr-empty !px-5 !py-12 !text-center text-[#626d71]">{search ? 'No patient records match your search.' : 'No patient records yet.'}</td></tr>}</tbody></table></div>)}

    {!recordId && <footer className="rr-pagination flex items-center justify-between py-3.5 text-xs leading-[1.5]"><span>Page {page} of {Math.max(1, Math.ceil(total / 25))}</span><div className="rr-actions flex flex-wrap items-center gap-2.5"><button className="rr-icon inline-flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-md border border-[#cbd1ca] bg-[#fffefa] disabled:cursor-not-allowed disabled:opacity-40" aria-label="Previous page" disabled={page <= 1 || loading} onClick={() => setPage((value) => value - 1)}><ChevronLeft size={18} /></button><button className="rr-icon inline-flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-md border border-[#cbd1ca] bg-[#fffefa] disabled:cursor-not-allowed disabled:opacity-40" aria-label="Next page" disabled={page * 25 >= total || loading} onClick={() => setPage((value) => value + 1)}><ChevronRight size={18} /></button></div></footer>}

    <Modal open={!!modal} onClose={() => !saving && setModal(null)} title={modal === 'create' ? 'Add patient record' : modal === 'edit' ? 'Edit patient record' : modal === 'issue' ? 'Issue paper' : 'Collect returned paper'} className="max-w-xl">
      <form className="record-room mx-auto max-w-[1500px] text-sm leading-[1.5] text-charcoal [&_h1]:mt-[3px] [&_h1]:text-[26px] [&_h1]:font-bold [&_h2]:text-[17px] [&_h2]:font-bold rr-form grid gap-4" onSubmit={save}>
        {modalError && <div role="alert" className="rr-error mb-3 rounded-md border border-[#ebc8be] bg-[#fff0ec] p-3 text-[#853b30]">{modalError}</div>}
        {(['create', 'edit'].includes(modal) || (modal === 'issue' && !issuePatient)) && <Field label={['create', 'edit'].includes(modal) ? 'Find patient / appointment' : 'Find a patient record *'}><input className={inputClasses} value={lookup} onChange={(event) => setLookup(event.target.value)} placeholder="Search by name or ID" />{matches.length > 0 && <div className="rr-matches max-h-[190px] overflow-y-auto rounded-md border border-[#cbd1ca] [&_button]:block [&_button]:w-full [&_button]:border-b [&_button]:border-[#dfe3dc] [&_button]:p-2.5 [&_button]:text-left [&_button:hover]:bg-[#eef3ec] [&_small]:block">{matches.map((match, index) => <button type="button" key={match.id || `${match.type}-${index}`} onClick={() => { if (['create', 'edit'].includes(modal)) setForm((current) => ({ ...current, patientName: match.patientName || '', patientId: match.patientCode || match.patientId || '', appointmentId: match.appointmentId || current.appointmentId })); else setIssuePatient(match); setLookup(''); setMatches([]); }}><strong>{match.patientName || match.appointmentId}</strong><small>{match.patientCode || match.patientId || match.appointmentId}</small></button>)}</div>}</Field>}
        {['create', 'edit'].includes(modal) && <><Field label="Treatment status"><select className={inputClasses} value={form.treatmentStatus || 'bought'} onChange={(event) => setForm({ ...form, treatmentStatus: event.target.value })}><option value="bought">Treatment Bought</option><option value="not_bought">Treatment Not Bought</option></select></Field><Field label="First paper received (date & time)"><input type="datetime-local" className={inputClasses} max={localDateTime(new Date())} value={form.firstReceivedAt} onChange={(event) => setForm({ ...form, firstReceivedAt: event.target.value })} /></Field><Field label="Patient name *"><input className={inputClasses} required value={form.patientName} onChange={(event) => setForm({ ...form, patientName: event.target.value })} /></Field><div className="rr-form-grid grid grid-cols-2 gap-3 max-[480px]:grid-cols-1"><Field label="Patient ID"><input className={inputClasses} value={form.patientId} onChange={(event) => setForm({ ...form, patientId: event.target.value })} /></Field><Field label="Appointment ID"><input className={inputClasses} value={form.appointmentId} onChange={(event) => setForm({ ...form, appointmentId: event.target.value })} /></Field></div><div className="rr-form-grid grid grid-cols-2 gap-3 max-[480px]:grid-cols-1"><Field label="Shelf number"><input className={inputClasses} maxLength={60} value={form.shelfNumber} onChange={(event) => setForm({ ...form, shelfNumber: event.target.value })} /></Field><Field label="Index number"><input className={inputClasses} maxLength={60} value={form.indexNumber} onChange={(event) => setForm({ ...form, indexNumber: event.target.value })} /></Field><Field label="File number"><input className={inputClasses} maxLength={60} value={form.fileNumber} onChange={(event) => setForm({ ...form, fileNumber: event.target.value })} /></Field></div></>}
        {modal === 'issue' && <>{issuePatient && <div className="rr-reference border-l-[3px] border-[#738c7a] bg-[#eef3ec] px-3 py-2.5 [&_small]:mt-1 [&_small]:block [&_small]:text-[#626d71] [&_button]:mt-1.5 [&_button]:text-xs [&_button]:leading-[1.5]"><strong>{issuePatient.patientName}</strong><small>{issuePatient.patientId || '-'} / {issuePatient.appointmentId || '-'}</small><button type="button" className="rr-link inline-flex items-center gap-[5px] text-left font-semibold text-[#345e48] hover:underline" onClick={() => setIssuePatient(null)}>Change patient</button></div>}<Field label="Given to / department *"><input className={inputClasses} required maxLength={200} value={issueForm.givenTo} onChange={(event) => setIssueForm({ ...issueForm, givenTo: event.target.value })} /></Field><Field label="Reason / purpose *"><textarea className={inputClasses} required rows={3} maxLength={2000} value={issueForm.reason} onChange={(event) => setIssueForm({ ...issueForm, reason: event.target.value })} /></Field></>}
        {modal === 'collect' && collection && <><div className="rr-reference border-l-[3px] border-[#738c7a] bg-[#eef3ec] px-3 py-2.5 [&_small]:mt-1 [&_small]:block [&_small]:text-[#626d71] [&_button]:mt-1.5 [&_button]:text-xs [&_button]:leading-[1.5]"><strong>{collection.patientName}</strong><small>Given to {collection.entry.givenTo}</small><small>Issued {stamp(collection.entry.issuedAt)}</small></div><Field label="Condition on return *"><select className={inputClasses} value={returnForm.returnCondition} onChange={(event) => setReturnForm({ ...returnForm, returnCondition: event.target.value })}><option value="intact">Intact / no problems</option><option value="problem">Problem found</option></select></Field>{returnForm.returnCondition === 'problem' && <Field label="What was the problem? *"><textarea className={inputClasses} required rows={3} maxLength={2000} placeholder="e.g. Torn page, missing report or damaged original" value={returnForm.problemDetails} onChange={(event) => setReturnForm({ ...returnForm, problemDetails: event.target.value })} /></Field>}<Field label="Collection notes"><textarea className={inputClasses} rows={2} maxLength={2000} value={returnForm.notes} onChange={(event) => setReturnForm({ ...returnForm, notes: event.target.value })} /></Field></>}
        <div className="rr-form-footer flex justify-end gap-2.5 border-t border-[#dfe3dc] pt-4"><Button variant="outline" onClick={() => setModal(null)} disabled={saving}>Cancel</Button><Button type="submit" disabled={saving || (modal === 'issue' && !issuePatient)}>{saving ? 'Saving...' : modal === 'create' ? 'Create record' : modal === 'edit' ? 'Save changes' : modal === 'issue' ? 'Save issue entry' : 'Confirm collection'}</Button></div>
      </form>
    </Modal>
    <Modal open={Boolean(deleteTarget)} onClose={() => !saving && setDeleteTarget(null)} title="Delete patient record" className="max-w-lg">
      <div className="space-y-4 text-sm text-charcoal">
        <p>Delete <strong>{deleteTarget?.patientName}</strong> and its scanned documents and paper movement history?</p>
        {deleteTarget?.issueHistory?.some((entry) => !entry.returnedAt) && <p className="rounded-md border border-[#ead09a] bg-[#fff8e8] p-3 text-[#855817]">This file is still issued. Collect it before deleting the record.</p>}
        {deleteError && <p role="alert" className="rounded-md border border-[#ebc8be] bg-[#fff0ec] p-3 text-[#853b30]">{deleteError}</p>}
        <div className="flex justify-end gap-2 border-t border-[#dfe3dc] pt-4">
          <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={saving}>Cancel</Button>
          <Button variant="danger" onClick={deleteRecord} disabled={saving || deleteTarget?.issueHistory?.some((entry) => !entry.returnedAt)}><Trash2 size={16} /> {saving ? 'Deleting...' : 'Delete record'}</Button>
        </div>
      </div>
    </Modal>
  </div>;
}
