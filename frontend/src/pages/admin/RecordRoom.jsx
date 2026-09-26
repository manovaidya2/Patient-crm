import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ArrowUpRight, CheckCircle2, ChevronLeft, ChevronRight, Clock3, Download, FileText, FolderOpen, Plus, Search, Upload, AlertTriangle } from 'lucide-react';
import api from '../../api/axios.js';
import Button from '../../components/ui/Button.jsx';
import Modal from '../../components/ui/Modal.jsx';

const base = (import.meta.env.VITE_API_URL || 'http://localhost:5000/api').replace(/\/api\/?$/, '');
const stamp = (value) => value ? new Date(value).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-';
const inputClasses = 'min-h-[41px] w-full rounded-md border border-[#cbd1ca] bg-[#fffefa] px-3 py-2.5 text-charcoal [font:inherit] focus:outline focus:outline-2 focus:outline-[#738c7a] focus:outline-offset-1';
const statTones = {
  neutral: 'border-[#d9dedb] bg-white',
  amber: 'border-[#ead09a] bg-[#fff8e8] text-[#855817]',
  red: 'border-[#edccc7] bg-[#fff3f1] text-[#8b3e34]',
};

const emptyPatient = { patientName: '', patientId: '', appointmentId: '' };
const statusLabel = (entry) => !entry.returnedAt ? 'Awaiting return' : entry.returnCondition === 'problem' ? 'Returned with problem' : entry.returnCondition === 'intact' ? 'Returned intact' : 'Returned';

function Field({ label, children }) {
  return <label className="rr-field grid min-w-0 gap-1.5 [&>span]:text-xs [&>span]:leading-[1.5] [&>span]:font-semibold"><span>{label}</span>{children}</label>;
}

export default function RecordRoom() {
  const navigate = useNavigate();
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const register = location.pathname.endsWith('/register');
  const recordId = params.get('record');
  const status = params.get('status') || 'all';
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [records, setRecords] = useState([]);
  const [entries, setEntries] = useState([]);
  const [total, setTotal] = useState(0);
  const [summary, setSummary] = useState(null);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const [modal, setModal] = useState(null);
  const [modalError, setModalError] = useState('');
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(emptyPatient);
  const [lookup, setLookup] = useState('');
  const [matches, setMatches] = useState([]);
  const [issuePatient, setIssuePatient] = useState(null);
  const [issueForm, setIssueForm] = useState({ givenTo: '', reason: '' });
  const [collection, setCollection] = useState(null);
  const [returnForm, setReturnForm] = useState({ returnCondition: 'intact', problemDetails: '', notes: '' });

  useEffect(() => { setPage(1); setSearch(''); }, [register, status]);
  useEffect(() => {
    let active = true;
    api.get('/record-room/summary', { skipCache: true }).then(({ data }) => { if (active) setSummary(data); }).catch(() => { if (active) setSummary(null); });
    return () => { active = false; };
  }, [revision]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    const timer = setTimeout(async () => {
      try {
        if (recordId) {
          const { data } = await api.get(`/record-room/${recordId}`, { skipCache: true });
          if (active) setSelected(data.record);
        } else {
          const { data } = await api.get(register ? '/record-room/movements' : '/record-room', { params: { search, page, status }, skipCache: true });
          if (active) { setRecords(data.records || []); setEntries(data.entries || []); setTotal(data.total || 0); setSelected(null); }
        }
      } catch (err) { if (active) setError(err.response?.data?.message || 'Unable to load records. Please try again.'); }
      finally { if (active) setLoading(false); }
    }, 200);
    return () => { active = false; clearTimeout(timer); };
  }, [recordId, register, search, page, status, revision]);

  useEffect(() => {
    let active = true;
    setMatches([]);
    if (!['create', 'issue'].includes(modal) || lookup.trim().length < 2) return;
    const timer = setTimeout(async () => {
      try {
        const { data } = await api.get(modal === 'create' ? '/record-room/lookup' : '/record-room', { params: modal === 'create' ? { query: lookup } : { search: lookup }, skipCache: true });
        if (active) setMatches(data.results || data.records || []);
      } catch { if (active) setModalError('Patient search failed. Please try again.'); }
    }, 250);
    return () => { active = false; clearTimeout(timer); };
  }, [lookup, modal]);

  function openModal(kind, patient = null) {
    setModalError(''); setLookup(''); setMatches([]); setModal(kind);
    if (kind === 'create') setForm(emptyPatient);
    if (kind === 'issue') { setIssuePatient(patient); setIssueForm({ givenTo: '', reason: '' }); }
  }

  async function save(event) {
    event.preventDefault();
    setSaving(true); setModalError('');
    try {
      if (modal === 'create') {
        const { data } = await api.post('/record-room', form);
        navigate(`/admin/record-room?record=${data.record.id}`);
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

  async function upload(event) {
    const input = event.target;
    const files = Array.from(input.files || []);
    if (!files.length) return;
    setSaving(true); setError('');
    try {
      const body = new FormData(); files.forEach((file) => body.append('documents', file));
      await api.post(`/record-room/${recordId}/documents`, body);
      setRevision((value) => value + 1);
    } catch (err) { setError(err.response?.data?.message || 'Upload failed. Please use JPG or PNG images.'); }
    finally { setSaving(false); input.value = ''; }
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
    return <div className="rr-table-wrap w-full overflow-x-auto rounded-lg border border-[#d8ddd7] bg-[#fffefa]"><table className="rr-table w-full min-w-[820px] border-collapse text-[13px] [&_th]:bg-[#56695d] [&_th]:px-4 [&_th]:py-3.5 [&_th]:text-left [&_th]:text-[11px] [&_th]:font-semibold [&_th]:uppercase [&_th]:text-white [&_td]:max-w-[260px] [&_td]:border-b [&_td]:border-[#e1e5dd] [&_td]:p-4 [&_td]:align-top [&_td]:[overflow-wrap:anywhere] [&_tr:last-child_td]:border-b-0 [&_small]:mt-[5px] [&_small]:block [&_small]:text-xs [&_small]:leading-[1.5] [&_small]:text-[#626d71] [&_tbody_tr:hover]:bg-[#f1f5f0] rr-register !min-w-[1050px]"><thead><tr><th>Patient reference</th><th>Given to / purpose</th><th>Issued</th><th>Return details</th><th>Action</th></tr></thead><tbody>
      {rows.map((row) => {
        const entry = row.entry;
        return <tr key={entry.id || entry._id} className={!entry.returnedAt ? 'rr-pending-row bg-[#fffaeb] [&_td:first-child]:shadow-[inset_3px_0_#d9a443]' : entry.returnCondition === 'problem' ? 'rr-problem-row bg-[#fff6f3]' : ''}>
          <td><Link className="rr-link inline-flex items-center gap-[5px] text-left font-semibold text-[#345e48] hover:underline" to={`/admin/record-room mx-auto max-w-[1500px] text-sm leading-[1.5] text-charcoal [&_h1]:mt-[3px] [&_h1]:text-[26px] [&_h1]:font-bold [&_h2]:text-[17px] [&_h2]:font-bold?record=${row.recordId}`}>{row.patientName}<ArrowUpRight size={13} /></Link><small>{row.patientId || '-'}</small><small>{row.appointmentId || '-'}</small></td>
          <td><strong>{entry.givenTo}</strong><small>{entry.reason || '-'}</small></td>
          <td>{stamp(entry.issuedAt)}<small>By {entry.issuedByName || '-'}</small></td>
          <td><span className={`rr-badge inline-block rounded px-2 py-1 text-[11px] font-semibold ${!entry.returnedAt ? 'rr-amber bg-[#f8e8bf] text-[#75501b]' : entry.returnCondition === 'problem' ? 'rr-red bg-[#f9dfd8] text-[#8b3e34]' : 'rr-green bg-[#e5f0e7] text-[#346045]'}`}>{statusLabel(entry)}</span>{entry.returnedAt && <><small>{stamp(entry.returnedAt)}</small><small>Collected by {entry.returnedByName || '-'}</small>{entry.problemDetails && <p className="rr-problem-text mt-[7px] text-xs leading-[1.5] text-[#8b3e34]">{entry.problemDetails}</p>}{entry.returnNotes && <small>{entry.returnNotes}</small>}</>}</td>
          <td>{!entry.returnedAt ? <Button size="sm" variant="outline" onClick={() => openReturn(row)}><CheckCircle2 size={14} /> Collect</Button> : <span className="rr-muted text-xs leading-[1.5] text-[#626d71]">Recorded</span>}</td>
        </tr>;
      })}
      {!rows.length && <tr><td colSpan={5} className="rr-empty !px-5 !py-12 !text-center text-[#626d71]">No paper movements found.</td></tr>}
    </tbody></table></div>;
  }

  return <div className="record-room mx-auto max-w-[1500px] text-sm leading-[1.5] text-charcoal [&_h1]:mt-[3px] [&_h1]:text-[26px] [&_h1]:font-bold [&_h2]:text-[17px] [&_h2]:font-bold">
    <header className="rr-heading flex flex-wrap items-center justify-between gap-3.5 py-[18px] !pt-0 max-[480px]:items-start max-[480px]:[&_h1]:text-[22px] max-[480px]:[&>.rr-actions]:w-full max-[480px]:[&>.rr-actions_button]:flex-1 max-[480px]:[&>.rr-actions_button]:p-2 max-[480px]:[&>.rr-actions_button]:text-xs max-[480px]:[&>.rr-actions_button]:leading-[1.5]"><div><p className="rr-eyebrow text-[11px] font-bold uppercase text-[#56695d]">Reception / Records</p><h1>{recordId ? 'Patient record' : register ? 'Issue & return register' : 'Record Room'}</h1></div><div className="rr-actions flex flex-wrap items-center gap-2.5">{recordId ? <Button variant="outline" onClick={() => navigate('/admin/record-room')}><ArrowLeft size={16} /> All records</Button> : <><Button variant="outline" onClick={() => openModal('create')}><Plus size={16} /> Add patient record</Button><Button onClick={() => openModal('issue')}><ArrowUpRight size={16} /> Issue paper</Button></>}</div></header>

    {!recordId && <>
      <div className="rr-stats mb-[22px] mt-1 grid grid-cols-3 gap-3 max-[800px]:grid-cols-2">
        {[
          { label: 'Patient records', count: summary?.total, icon: FolderOpen, to: '/admin/record-room', tone: 'neutral', active: !register },
          { label: 'Awaiting return', count: summary?.pending, icon: Clock3, to: '/admin/record-room/register?status=pending', tone: 'amber', active: register && status === 'pending' },
          { label: 'Returned with problem', count: summary?.problems, icon: AlertTriangle, to: '/admin/record-room/register?status=problem', tone: 'red', active: register && status === 'problem' },
        ].map(({ label, count, icon: Icon, to, tone, active }) => <Link key={label} to={to} className={`rr-stat flex min-h-[100px] items-center justify-between gap-2.5 rounded-lg border px-[18px] py-[15px] max-[800px]:p-3 [&_span]:block [&_span]:text-xs [&_span]:leading-[1.5] [&_span]:font-semibold [&_strong]:mt-[5px] [&_strong]:block [&_strong]:text-[27px] [&_strong]:leading-[1.1] hover:outline hover:outline-2 hover:outline-current hover:outline-offset-[-2px] rr-stat-${tone} ${statTones[tone]} ${active ? 'rr-stat-active outline outline-2 outline-current outline-offset-[-2px]' : ''}`}><div><span>{label}</span><strong>{count ?? '-'}</strong></div><Icon size={22} /></Link>)}
      </div>
      <nav className="rr-tabs flex gap-[22px] border-b border-[#d4d8d3] [&_a]:flex [&_a]:items-center [&_a]:gap-[7px] [&_a]:border-b-[3px] [&_a]:border-transparent [&_a]:px-0.5 [&_a]:py-3 [&_a]:font-semibold [&_a[aria-current]]:border-[#56695d] [&_a[aria-current]]:text-[#3c5746] max-[480px]:gap-[15px] max-[480px]:text-xs max-[480px]:leading-[1.5]" aria-label="Record Room pages"><Link to="/admin/record-room" aria-current={!register ? 'page' : undefined}><FolderOpen size={16} /> Patient records</Link><Link to="/admin/record-room/register" aria-current={register ? 'page' : undefined}><FileText size={16} /> Issue & return register</Link></nav>
      <div className="rr-toolbar flex flex-wrap items-center gap-3 py-4 [&>select]:!w-auto [&>select]:max-w-full [&>.rr-muted]:ml-auto"><label className="rr-search relative w-full max-w-[440px] [&_svg]:pointer-events-none [&_svg]:absolute [&_svg]:left-[13px] [&_svg]:top-1/2 [&_svg]:-translate-y-1/2 [&_svg]:text-[#56695d] [&_input]:!pl-[39px]"><Search size={17} /><input className={inputClasses} aria-label="Search records" placeholder={register ? 'Search patient or recipient' : 'Search patient name, patient ID or appointment ID'} value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} /></label>{register && <select className={inputClasses} aria-label="Movement status" value={status} onChange={(event) => { setPage(1); setParams(event.target.value === 'all' ? {} : { status: event.target.value }); }}><option value="all">All movements</option><option value="pending">Awaiting return</option><option value="returned">Collected</option><option value="problem">Returned with problem</option></select>}<span className="rr-muted text-xs leading-[1.5] text-[#626d71]">{total} {register ? 'movements' : 'records'}</span></div>
    </>}

    {error && <div role="alert" className="rr-error mb-3 rounded-md border border-[#ebc8be] bg-[#fff0ec] p-3 text-[#853b30]">{error}<Button size="sm" variant="ghost" onClick={() => setRevision((value) => value + 1)}>Retry</Button></div>}
    {loading ? <div className="rr-empty !px-5 !py-12 !text-center text-[#626d71]" role="status">Loading records...</div> : !error && (recordId && selected ? <>
      <section className="rr-patient-heading flex flex-wrap items-center justify-between gap-3.5 py-[18px] border-b border-[#d4d8d3] !pt-1.5 [&_p]:mt-2 [&_p]:flex [&_p]:flex-wrap [&_p]:gap-4 [&_p]:text-xs [&_p]:leading-[1.5]"><div><h2>{selected.patientName}</h2><p>Patient ID: <strong>{selected.patientId || '-'}</strong><span>Appointment ID: <strong>{selected.appointmentId || '-'}</strong></span></p></div><Button onClick={() => openModal('issue', selected)}><ArrowUpRight size={16} /> Issue paper</Button></section>
      <section className="rr-documents border-b border-[#d4d8d3] pb-5"><div className="rr-section-heading flex flex-wrap items-center justify-between gap-3.5 py-[18px]"><div><h2>Documents <span className="rr-muted text-xs leading-[1.5] text-[#626d71]">({selected.pdfPageCount || 0} pages)</span></h2><small className="rr-muted text-xs leading-[1.5] text-[#626d71]">Last upload: {stamp(selected.pdfUpdatedAt)}</small></div><div className="rr-actions flex flex-wrap items-center gap-2.5"><label className={`rr-upload inline-flex cursor-pointer items-center gap-[7px] rounded-md bg-[#56695d] px-3 py-[9px] text-[13px] font-semibold text-white [&_input]:hidden ${saving ? 'rr-disabled pointer-events-none opacity-50' : ''}`}><Upload size={16} />{saving ? 'Uploading...' : 'Upload images'}<input className={inputClasses} type="file" accept="image/jpeg,image/png" multiple disabled={saving} onChange={upload} /></label>{selected.pdfUrl && <><a className="rr-link inline-flex items-center gap-[5px] text-left font-semibold text-[#345e48] hover:underline" href={`${base}${selected.pdfUrl}?v=${encodeURIComponent(selected.pdfUpdatedAt || '')}`} target="_blank" rel="noreferrer"><FileText size={16} /> View / print PDF</a><button className="rr-icon inline-flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-md border border-[#cbd1ca] bg-[#fffefa] disabled:cursor-not-allowed disabled:opacity-40" title="Download PDF" aria-label="Download PDF" onClick={download}><Download size={17} /></button></>}</div></div>
        {selected.documents?.length ? <div className="rr-document-list grid grid-cols-2 gap-x-6 max-[800px]:grid-cols-1 [&_a]:flex [&_a]:min-w-0 [&_a]:items-center [&_a]:gap-2.5 [&_a]:border-b [&_a]:border-[#dfe3dc] [&_a]:py-3 [&_a>div]:min-w-0 [&_a>div]:flex-1 [&_strong]:block [&_strong]:truncate [&_strong]:text-xs [&_strong]:leading-[1.5] [&_small]:text-[11px] [&_small]:text-[#626d71]">{selected.documents.map((doc, index) => <a key={doc.id} href={`${base}${doc.url}`} target="_blank" rel="noreferrer"><FileText size={18} /><div><strong>{index + 1}. {doc.fileName}</strong><small>{stamp(doc.uploadedAt)} / {doc.uploadedByName}</small></div><ArrowUpRight size={15} /></a>)}</div> : <p className="rr-empty !px-5 !py-12 !text-center text-[#626d71]">No documents uploaded yet.</p>}
      </section>
      <div className="rr-section-heading flex flex-wrap items-center justify-between gap-3.5 py-[18px]"><h2>Paper movement history</h2></div>
      {movementTable([...(selected.issueHistory || [])].reverse().map((entry) => ({ recordId: selected.id, patientName: selected.patientName, patientId: selected.patientId, appointmentId: selected.appointmentId, entry })))}
    </> : register ? movementTable(entries) : <div className="rr-table-wrap w-full overflow-x-auto rounded-lg border border-[#d8ddd7] bg-[#fffefa]"><table className="rr-table w-full min-w-[820px] border-collapse text-[13px] [&_th]:bg-[#56695d] [&_th]:px-4 [&_th]:py-3.5 [&_th]:text-left [&_th]:text-[11px] [&_th]:font-semibold [&_th]:uppercase [&_th]:text-white [&_td]:max-w-[260px] [&_td]:border-b [&_td]:border-[#e1e5dd] [&_td]:p-4 [&_td]:align-top [&_td]:[overflow-wrap:anywhere] [&_tr:last-child_td]:border-b-0 [&_small]:mt-[5px] [&_small]:block [&_small]:text-xs [&_small]:leading-[1.5] [&_small]:text-[#626d71] [&_tbody_tr:hover]:bg-[#f1f5f0]"><thead><tr><th>Patient</th><th>Patient ID</th><th>Appointment ID</th><th>Documents</th><th>Paper status</th><th>Actions</th></tr></thead><tbody>{records.map((record) => {
      const pending = record.issueHistory.filter((entry) => !entry.returnedAt).length;
      return <tr key={record.id} className={pending ? 'rr-pending-row bg-[#fffaeb] [&_td:first-child]:shadow-[inset_3px_0_#d9a443]' : ''}><td><Link className="rr-link inline-flex items-center gap-[5px] text-left font-semibold text-[#345e48] hover:underline" to={`?record=${record.id}`}>{record.patientName}<ArrowUpRight size={14} /></Link></td><td>{record.patientId || '-'}</td><td>{record.appointmentId || '-'}</td><td>{record.pdfPageCount || 0} pages<small>{stamp(record.pdfUpdatedAt)}</small></td><td><span className={`rr-badge inline-block rounded px-2 py-1 text-[11px] font-semibold ${pending ? 'rr-amber bg-[#f8e8bf] text-[#75501b]' : 'rr-green bg-[#e5f0e7] text-[#346045]'}`}>{pending ? `${pending} awaiting return` : 'No pending returns'}</span></td><td><div className="rr-actions flex flex-wrap items-center gap-2.5"><Link className="rr-link inline-flex items-center gap-[5px] text-left font-semibold text-[#345e48] hover:underline" to={`?record=${record.id}`}>Open record</Link><button className="rr-icon inline-flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-md border border-[#cbd1ca] bg-[#fffefa] disabled:cursor-not-allowed disabled:opacity-40" title="Issue paper" aria-label={`Issue paper for ${record.patientName}`} onClick={() => openModal('issue', record)}><ArrowUpRight size={17} /></button></div></td></tr>;
    })}{!records.length && <tr><td colSpan={6} className="rr-empty !px-5 !py-12 !text-center text-[#626d71]">{search ? 'No patient records match your search.' : 'No patient records yet.'}</td></tr>}</tbody></table></div>)}

    {!recordId && <footer className="rr-pagination flex items-center justify-between py-3.5 text-xs leading-[1.5]"><span>Page {page} of {Math.max(1, Math.ceil(total / 25))}</span><div className="rr-actions flex flex-wrap items-center gap-2.5"><button className="rr-icon inline-flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-md border border-[#cbd1ca] bg-[#fffefa] disabled:cursor-not-allowed disabled:opacity-40" aria-label="Previous page" disabled={page <= 1 || loading} onClick={() => setPage((value) => value - 1)}><ChevronLeft size={18} /></button><button className="rr-icon inline-flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-md border border-[#cbd1ca] bg-[#fffefa] disabled:cursor-not-allowed disabled:opacity-40" aria-label="Next page" disabled={page * 25 >= total || loading} onClick={() => setPage((value) => value + 1)}><ChevronRight size={18} /></button></div></footer>}

    <Modal open={!!modal} onClose={() => !saving && setModal(null)} title={modal === 'create' ? 'Add patient record' : modal === 'issue' ? 'Issue paper' : 'Collect returned paper'} className="max-w-xl">
      <form className="record-room mx-auto max-w-[1500px] text-sm leading-[1.5] text-charcoal [&_h1]:mt-[3px] [&_h1]:text-[26px] [&_h1]:font-bold [&_h2]:text-[17px] [&_h2]:font-bold rr-form grid gap-4" onSubmit={save}>
        {modalError && <div role="alert" className="rr-error mb-3 rounded-md border border-[#ebc8be] bg-[#fff0ec] p-3 text-[#853b30]">{modalError}</div>}
        {(modal === 'create' || (modal === 'issue' && !issuePatient)) && <Field label={modal === 'create' ? 'Find patient / appointment' : 'Find a patient record *'}><input className={inputClasses} value={lookup} onChange={(event) => setLookup(event.target.value)} placeholder="Search by name or ID" />{matches.length > 0 && <div className="rr-matches max-h-[190px] overflow-y-auto rounded-md border border-[#cbd1ca] [&_button]:block [&_button]:w-full [&_button]:border-b [&_button]:border-[#dfe3dc] [&_button]:p-2.5 [&_button]:text-left [&_button:hover]:bg-[#eef3ec] [&_small]:block">{matches.map((match, index) => <button type="button" key={match.id || `${match.type}-${index}`} onClick={() => { if (modal === 'create') setForm({ patientName: match.patientName || '', patientId: match.patientCode || match.patientId || '', appointmentId: match.appointmentId || '' }); else setIssuePatient(match); setLookup(''); setMatches([]); }}><strong>{match.patientName || match.appointmentId}</strong><small>{match.patientCode || match.patientId || match.appointmentId}</small></button>)}</div>}</Field>}
        {modal === 'create' && <><Field label="Patient name *"><input className={inputClasses} required value={form.patientName} onChange={(event) => setForm({ ...form, patientName: event.target.value })} /></Field><div className="rr-form-grid grid grid-cols-2 gap-3 max-[480px]:grid-cols-1"><Field label="Patient ID"><input className={inputClasses} value={form.patientId} onChange={(event) => setForm({ ...form, patientId: event.target.value })} /></Field><Field label="Appointment ID"><input className={inputClasses} value={form.appointmentId} onChange={(event) => setForm({ ...form, appointmentId: event.target.value })} /></Field></div></>}
        {modal === 'issue' && <>{issuePatient && <div className="rr-reference border-l-[3px] border-[#738c7a] bg-[#eef3ec] px-3 py-2.5 [&_small]:mt-1 [&_small]:block [&_small]:text-[#626d71] [&_button]:mt-1.5 [&_button]:text-xs [&_button]:leading-[1.5]"><strong>{issuePatient.patientName}</strong><small>{issuePatient.patientId || '-'} / {issuePatient.appointmentId || '-'}</small><button type="button" className="rr-link inline-flex items-center gap-[5px] text-left font-semibold text-[#345e48] hover:underline" onClick={() => setIssuePatient(null)}>Change patient</button></div>}<Field label="Given to / department *"><input className={inputClasses} required maxLength={200} value={issueForm.givenTo} onChange={(event) => setIssueForm({ ...issueForm, givenTo: event.target.value })} /></Field><Field label="Reason / purpose *"><textarea className={inputClasses} required rows={3} maxLength={2000} value={issueForm.reason} onChange={(event) => setIssueForm({ ...issueForm, reason: event.target.value })} /></Field></>}
        {modal === 'collect' && collection && <><div className="rr-reference border-l-[3px] border-[#738c7a] bg-[#eef3ec] px-3 py-2.5 [&_small]:mt-1 [&_small]:block [&_small]:text-[#626d71] [&_button]:mt-1.5 [&_button]:text-xs [&_button]:leading-[1.5]"><strong>{collection.patientName}</strong><small>Given to {collection.entry.givenTo}</small><small>Issued {stamp(collection.entry.issuedAt)}</small></div><Field label="Condition on return *"><select className={inputClasses} value={returnForm.returnCondition} onChange={(event) => setReturnForm({ ...returnForm, returnCondition: event.target.value })}><option value="intact">Intact / no problems</option><option value="problem">Problem found</option></select></Field>{returnForm.returnCondition === 'problem' && <Field label="What was the problem? *"><textarea className={inputClasses} required rows={3} maxLength={2000} placeholder="e.g. Torn page, missing report or damaged original" value={returnForm.problemDetails} onChange={(event) => setReturnForm({ ...returnForm, problemDetails: event.target.value })} /></Field>}<Field label="Collection notes"><textarea className={inputClasses} rows={2} maxLength={2000} value={returnForm.notes} onChange={(event) => setReturnForm({ ...returnForm, notes: event.target.value })} /></Field></>}
        <div className="rr-form-footer flex justify-end gap-2.5 border-t border-[#dfe3dc] pt-4"><Button variant="outline" onClick={() => setModal(null)} disabled={saving}>Cancel</Button><Button type="submit" disabled={saving || (modal === 'issue' && !issuePatient)}>{saving ? 'Saving...' : modal === 'create' ? 'Create record' : modal === 'issue' ? 'Save issue entry' : 'Confirm collection'}</Button></div>
      </form>
    </Modal>
  </div>;
}
