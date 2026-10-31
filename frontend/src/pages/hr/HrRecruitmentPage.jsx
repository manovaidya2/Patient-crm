import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Check, ClipboardCheck, FileText, Megaphone, Pencil, Plus, Search, Send, Trash2, UserCheck, X } from 'lucide-react';
import api from '../../api/axios.js';
import Button from '../../components/ui/Button.jsx';
import Modal from '../../components/ui/Modal.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { canHrDelete, hasHrFullAccess, ROLES } from '../../constants/roles.js';
import { EMPLOYMENT_TYPES, INTERVIEW_TYPES, formatDateTime, formatMoney, labelFor, timeInput, todayInput, toIndiaDateTimeInputs } from './hrOptions.js';

const fieldClass = 'mt-1 w-full rounded-md border border-cardline bg-white px-3 py-2.5 text-sm text-charcoal outline-none focus:border-sage focus:ring-2 focus:ring-sage/15';
const controlClass = 'rounded-md border border-cardline bg-white px-3 py-2.5 text-sm outline-none focus:border-sage focus:ring-2 focus:ring-sage/15';
const modeMeta = {
  requirements: { title: 'Hiring Requirements', subtitle: 'Create manpower requests and route them for management approval.', icon: ClipboardCheck, endpoint: '/hr/requirements', key: 'requirements' },
  jds: { title: 'Job Descriptions', subtitle: 'Prepare role descriptions against approved hiring requirements.', icon: FileText, endpoint: '/hr/job-descriptions', key: 'jobDescriptions' },
  campaigns: { title: 'Job Campaigns', subtitle: 'Track active sourcing campaigns and recruitment channels.', icon: Megaphone, endpoint: '/hr/campaigns', key: 'campaigns' },
  interviews: { title: 'Interviews', subtitle: 'Schedule interview rounds and record structured evaluations.', icon: UserCheck, endpoint: '/hr/interviews', key: 'interviews' },
  offers: { title: 'Offers', subtitle: 'Prepare salary offers with mandatory management approval.', icon: Send, endpoint: '/hr/offers', key: 'offers' },
  onboarding: { title: 'Onboarding', subtitle: 'Complete joining formalities for accepted offers.', icon: Check, endpoint: '/hr/onboarding', key: 'onboardings' },
};
const recordLabels = { requirements: 'Hiring Requirement', jds: 'Job Description', campaigns: 'Job Campaign', interviews: 'Interview', offers: 'Offer', onboarding: 'Onboarding' };

const blanks = {
  requirements: { positionTitle: '', department: '', location: '', employmentType: 'full_time', openings: '1', priority: 'normal', targetDate: '', reason: '', skills: '', requestedByName: '' },
  jds: { requirementId: '', title: '', department: '', summary: '', responsibilities: '', qualifications: '', experience: '', salaryRange: '', status: 'draft' },
  campaigns: { jobDescriptionId: '', name: '', channels: '', startDate: todayInput(), endDate: '', budget: '0', actualSpend: '0', targetApplications: '0', notes: '', status: 'planned' },
  interviews: { candidateId: '', previousInterviewId: '', roundNumber: 1, round: 'Round 1', interviewType: 'in_person', scheduledDate: todayInput(), scheduledTime: timeInput(), durationMinutes: '30', interviewerName: '', locationOrLink: '', instructions: '', status: 'scheduled' },
  offers: { candidateId: '', designation: '', department: '', annualCtc: '', monthlyGross: '', employmentType: 'full_time', proposedJoiningDate: '', validUntil: '', terms: '' },
  onboarding: { offerId: '', joiningDate: '', reportingManager: '', workLocation: '', notes: '' },
};

const badgeTone = (status) => ({ approved: 'bg-emerald-100 text-emerald-800', active: 'bg-emerald-100 text-emerald-800', completed: 'bg-emerald-100 text-emerald-800', accepted: 'bg-emerald-100 text-emerald-800', rejected: 'bg-red-100 text-red-800', cancelled: 'bg-red-100 text-red-800', declined: 'bg-red-100 text-red-800', pending_approval: 'bg-amber-100 text-amber-800', scheduled: 'bg-blue-100 text-blue-800', sent: 'bg-blue-100 text-blue-800', in_progress: 'bg-blue-100 text-blue-800' }[status] || 'bg-offwhite-300 text-charcoal/70');
const Status = ({ value }) => <span className={`inline-flex whitespace-nowrap rounded px-2 py-1 text-xs font-semibold capitalize ${badgeTone(value)}`}>{String(value || '').replaceAll('_', ' ')}</span>;

export default function HrRecruitmentPage({ mode }) {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const launchedContext = useRef('');
  const meta = modeMeta[mode];
  const [rows, setRows] = useState([]);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(blanks[mode]);
  const [saving, setSaving] = useState(false);
  const [requirements, setRequirements] = useState([]);
  const [jds, setJds] = useState([]);
  const [candidates, setCandidates] = useState([]);
  const [offers, setOffers] = useState([]);
  const [evaluation, setEvaluation] = useState(null);
  const [evaluationForm, setEvaluationForm] = useState({ rating: '3', recommendation: 'next_round', strengths: '', concerns: '', notes: '' });
  const [statusAction, setStatusAction] = useState(null);
  const [adminSelectedId, setAdminSelectedId] = useState('');
  const [statusNote, setStatusNote] = useState('');

  const load = async () => {
    setLoading(true);
    try { const { data } = await api.get(meta.endpoint, { params: { search, status } }); setRows(data[meta.key] || []); setError(''); }
    catch (requestError) { setError(requestError.response?.data?.message || `${meta.title} could not be loaded`); }
    finally { setLoading(false); }
  };
  useEffect(() => { setRows([]); setSearch(''); setStatus(''); setForm(blanks[mode]); load(); }, [mode]);
  useEffect(() => {
    const requests = [];
    if (mode === 'jds') requests.push(api.get('/hr/requirements', { params: { status: 'approved' } }).then(({ data }) => setRequirements(data.requirements || [])));
    if (mode === 'campaigns') requests.push(api.get('/hr/job-descriptions', { params: { status: 'active' } }).then(({ data }) => setJds(data.jobDescriptions || [])));
    if (['interviews', 'offers'].includes(mode)) requests.push(api.get('/hr/candidates', { params: { active: true, limit: 100 } }).then(({ data }) => setCandidates(data.candidates || [])));
    if (mode === 'onboarding') requests.push(api.get('/hr/offers', { params: { availableForOnboarding: true } }).then(({ data }) => setOffers(data.offers || [])));
    Promise.all(requests).catch(() => {});
  }, [mode, formOpen]);

  useEffect(() => {
    const candidateId = searchParams.get('candidateId');
    const launchKey = `${mode}:${searchParams.toString()}`;
    if (!candidateId || searchParams.get('create') !== '1' || !['interviews', 'offers'].includes(mode) || launchedContext.current === launchKey) return;
    launchedContext.current = launchKey;
    const launch = async () => {
      try {
        let candidate = candidates.find((row) => row.id === candidateId);
        if (!candidate) {
          const { data } = await api.get(`/hr/candidates/${candidateId}`);
          candidate = data.candidate;
          setCandidates((current) => current.some((row) => row.id === candidate.id) ? current : [...current, candidate]);
        }
        const nextRound = Math.max(1, Number(searchParams.get('roundNumber') || 1));
        setEditing(null);
        setForm({
          ...blanks[mode],
          candidateId: candidate.id,
          contextCandidateName: `${candidate.candidateCode} - ${candidate.name}`,
          ...(mode === 'interviews' ? { previousInterviewId: searchParams.get('previousInterviewId') || '', roundNumber: nextRound, round: `Round ${nextRound}` } : { designation: candidate.appliedPosition || '' }),
        });
        setFormOpen(true);
      } catch (requestError) {
        setError(requestError.response?.data?.message || 'Candidate context could not be loaded');
      }
    };
    launch();
  }, [mode, searchParams, candidates]);

  const closeForm = () => { setFormOpen(false); launchedContext.current = ''; if (searchParams.toString()) setSearchParams({}); };
  const openCreate = () => { setEditing(null); setForm({ ...blanks[mode] }); setFormOpen(true); setError(''); };
  const openEdit = (row) => {
    const next = { ...blanks[mode], ...row };
    if (mode === 'requirements') next.skills = (row.skills || []).join(', ');
    if (mode === 'campaigns') next.channels = (row.channels || []).join(', ');
    if (mode === 'interviews') { const values = toIndiaDateTimeInputs(row.scheduledAt); next.scheduledDate = values.date; next.scheduledTime = values.time; next.contextCandidateName = `${row.candidateCode} - ${row.candidateName}`; }
    if (mode === 'offers') {
      next.contextCandidateName = `${row.candidateCode} - ${row.candidateName}`;
      if (!Number(next.monthlyGross) && Number(next.annualCtc) > 0) next.monthlyGross = String(Math.round(Number(next.annualCtc) / 12));
    }
    setEditing(row); setForm(next); setFormOpen(true); setError('');
  };
  const set = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));
  const submit = async (event) => {
    event.preventDefault(); setSaving(true); setError('');
    try {
      const path = editing ? `${meta.endpoint}/${editing.id}` : meta.endpoint;
      await (editing ? api.patch(path, form) : api.post(path, form));
      closeForm(); await load();
    } catch (requestError) { setError(requestError.response?.data?.message || 'Record could not be saved'); }
    finally { setSaving(false); }
  };
  const changeStatus = async (row, next, note = '') => {
    if (next === 'rejected' && !note) { setStatusAction({ row, next }); setStatusNote(''); return; }
    try { await api.post(`${meta.endpoint}/${row.id}/status`, { status: next, note }); setStatusAction(null); setStatusNote(''); await load(); }
    catch (requestError) { setError(requestError.response?.data?.message || 'Status could not be changed'); }
  };
  const saveEvaluation = async (event) => {
    event.preventDefault(); setSaving(true);
    try {
      await api.post(`/hr/interviews/${evaluation.id}/evaluation`, evaluationForm);
      const completedInterview = evaluation;
      setEvaluation(null);
      await load();
      if (evaluationForm.recommendation === 'next_round') {
        const nextRound = (completedInterview.roundNumber || 1) + 1;
        setEditing(null);
        setForm({ ...blanks.interviews, candidateId: completedInterview.candidateId, contextCandidateName: `${completedInterview.candidateCode} - ${completedInterview.candidateName}`, previousInterviewId: completedInterview.id, roundNumber: nextRound, round: `Round ${nextRound}` });
        setFormOpen(true);
      }
    }
    catch (requestError) { setError(requestError.response?.data?.message || 'Evaluation could not be saved'); }
    finally { setSaving(false); }
  };
  const toggleChecklist = async (row, item) => {
    try { await api.patch(`/hr/onboarding/${row.id}/checklist/${item.key}`, { completed: !item.completed, note: item.note || '' }); await load(); }
    catch (requestError) { setError(requestError.response?.data?.message || 'Checklist could not be updated'); }
  };
  const remove = async (row) => {
    const cascade = ['requirements', 'jds', 'offers', 'onboarding'].includes(mode) ? ' Linked records will also be cleaned up.' : '';
    if (!window.confirm(`Delete this ${recordLabels[mode]}?${cascade} Reports will update automatically.`)) return;
    try { await api.delete(`${meta.endpoint}/${row.id}`); setAdminSelectedId(''); await load(); }
    catch (requestError) { setError(requestError.response?.data?.message || 'Record could not be deleted'); }
  };
  const statusOptions = useMemo(() => ({
    requirements: ['draft', 'pending_approval', 'approved', 'rejected', 'closed'], jds: ['draft', 'active', 'archived'], campaigns: ['planned', 'active', 'paused', 'completed', 'cancelled'], interviews: ['scheduled', 'completed', 'rescheduled', 'cancelled', 'no_show'], offers: ['draft', 'pending_approval', 'approved', 'rejected', 'sent', 'accepted', 'declined', 'expired', 'withdrawn'], onboarding: ['not_started', 'in_progress', 'completed', 'cancelled'],
  }[mode] || []), [mode]);

  const Icon = meta.icon;
  const adminSelected = rows.find((row) => row.id === adminSelectedId);
  return <div className="space-y-5">
    <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-xs font-semibold uppercase text-sage">HR Recruitment</p><h1 className="flex items-center gap-2 font-display text-2xl font-bold text-charcoal"><Icon size={23} />{meta.title}</h1><p className="mt-1 text-sm text-charcoal/60">{meta.subtitle}</p></div>{!(mode === 'offers' && hasHrFullAccess(user?.role)) && <Button onClick={openCreate}><Plus size={16} />{mode === 'onboarding' ? 'Start onboarding' : `New ${mode === 'jds' ? 'JD' : mode.slice(0, -1)}`}</Button>}</header>
    <form onSubmit={(event) => { event.preventDefault(); load(); }} className="grid gap-3 border border-cardline bg-offwhite-100 p-4 sm:grid-cols-[1fr_220px_auto]"><label className="relative"><Search size={16} className="absolute left-3 top-3 text-charcoal/40" /><input className={`${controlClass} w-full pl-9`} placeholder={`Search ${meta.title.toLowerCase()}`} value={search} onChange={(event) => setSearch(event.target.value)} /></label><select className={controlClass} value={status} onChange={(event) => setStatus(event.target.value)}><option value="">All statuses</option>{statusOptions.map((value) => <option key={value} value={value}>{value.replaceAll('_', ' ')}</option>)}</select><Button type="submit">Apply filters</Button></form>
    {error && <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>}
    {hasHrFullAccess(user?.role) && rows.length > 0 && <section className="flex flex-col gap-3 border border-red-200 bg-red-50/50 p-3 sm:flex-row sm:items-center"><div className="min-w-0 flex-1"><p className="text-xs font-semibold uppercase text-red-800">Management record controls</p><select className={`${controlClass} mt-1 w-full`} value={adminSelectedId} onChange={(event) => setAdminSelectedId(event.target.value)}><option value="">Select a record to edit or delete</option>{rows.map((row) => <option key={row.id} value={row.id}>{row.requirementCode || row.jdCode || row.campaignCode || row.interviewCode || row.offerCode || row.onboardingCode} - {row.positionTitle || row.title || row.name || row.candidateName}</option>)}</select></div><div className="flex gap-2"><Button variant="outline" disabled={!adminSelected} onClick={() => adminSelected && openEdit(adminSelected)}><Pencil size={15}/> Edit</Button>{canHrDelete(user?.role) && <Button variant="danger" disabled={!adminSelected} onClick={() => adminSelected && remove(adminSelected)}><Trash2 size={15}/> Delete</Button>}</div></section>}
    <section className="overflow-hidden border border-cardline bg-offwhite-100">
      <div className="overflow-x-auto">{renderTable(mode, rows, user, openEdit, changeStatus, setEvaluation, toggleChecklist)}</div>
      {loading && <p className="p-8 text-center text-sm text-charcoal/50">Loading...</p>}
      {!loading && !rows.length && <p className="p-10 text-center text-sm text-charcoal/50">No records match these filters.</p>}
    </section>
    <Modal open={formOpen} onClose={closeForm} title={`${editing ? 'Edit' : 'Create'} ${recordLabels[mode]}`} className="max-w-4xl"><form onSubmit={submit} className="space-y-4">{error && <div className="rounded bg-red-50 p-3 text-sm text-red-800">{error}</div>}{renderForm(mode, form, set, setForm, requirements, jds, candidates, offers)}<div className="flex justify-end gap-2"><Button variant="ghost" onClick={closeForm}>Cancel</Button><Button type="submit" disabled={saving}>{saving ? 'Saving...' : 'Save'}</Button></div></form></Modal>
    <Modal open={!!evaluation} onClose={() => setEvaluation(null)} title={`Interview evaluation - ${evaluation?.candidateName || ''}`} className="max-w-2xl"><form onSubmit={saveEvaluation} className="space-y-4"><div className="grid gap-4 sm:grid-cols-2"><Field label="Rating"><select className={fieldClass} value={evaluationForm.rating} onChange={(event) => setEvaluationForm({ ...evaluationForm, rating: event.target.value })}>{[1,2,3,4,5].map((value) => <option key={value}>{value}</option>)}</select></Field><Field label="Recommendation"><select className={fieldClass} value={evaluationForm.recommendation} onChange={(event) => setEvaluationForm({ ...evaluationForm, recommendation: event.target.value })}><option value="next_round">Next Round</option><option value="selected">Selected</option><option value="on_hold">On Hold</option><option value="rejected">Rejected</option></select></Field></div><Field label="Strengths"><textarea rows="3" className={fieldClass} value={evaluationForm.strengths} onChange={(event) => setEvaluationForm({ ...evaluationForm, strengths: event.target.value })} /></Field><Field label="Concerns"><textarea rows="3" className={fieldClass} value={evaluationForm.concerns} onChange={(event) => setEvaluationForm({ ...evaluationForm, concerns: event.target.value })} /></Field><Field label="Evaluation notes"><textarea rows="3" className={fieldClass} value={evaluationForm.notes} onChange={(event) => setEvaluationForm({ ...evaluationForm, notes: event.target.value })} /></Field><div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => setEvaluation(null)}>Cancel</Button><Button type="submit" disabled={saving}>Save evaluation</Button></div></form></Modal>
    <Modal open={!!statusAction} onClose={() => setStatusAction(null)} title="Rejection reason" className="max-w-lg"><form onSubmit={(event) => { event.preventDefault(); changeStatus(statusAction.row, statusAction.next, statusNote); }} className="space-y-4"><Field label="Reason *"><textarea autoFocus required rows="4" className={fieldClass} value={statusNote} onChange={(event) => setStatusNote(event.target.value)} placeholder="Enter a clear reason for rejection" /></Field><div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => setStatusAction(null)}>Cancel</Button><Button type="submit" variant="danger">Reject</Button></div></form></Modal>
  </div>;
}

function Field({ label, children, className = '' }) { return <label className={`block text-sm font-medium ${className}`}>{label}{children}</label>; }
function ConnectedCandidate({ name, detail }) { return <div className="flex items-center justify-between gap-3 border border-[#B8CDC8] bg-[#EEF6F3] px-4 py-3"><div><p className="text-xs font-semibold uppercase text-sage">Connected candidate</p><p className="mt-0.5 font-semibold text-charcoal">{name}</p></div><span className="text-right text-xs text-charcoal/55">{detail}</span></div>; }

function renderForm(mode, form, set, setForm, requirements, jds, candidates, offers) {
  if (mode === 'requirements') return <><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"><Field label="Position title *"><input required className={fieldClass} value={form.positionTitle} onChange={set('positionTitle')} /></Field><Field label="Department *"><input required className={fieldClass} value={form.department} onChange={set('department')} /></Field><Field label="Location"><input className={fieldClass} value={form.location} onChange={set('location')} /></Field><Field label="Employment type"><select className={fieldClass} value={form.employmentType} onChange={set('employmentType')}>{EMPLOYMENT_TYPES.map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></Field><Field label="Openings *"><input required min="1" type="number" className={fieldClass} value={form.openings} onChange={set('openings')} /></Field><Field label="Priority"><select className={fieldClass} value={form.priority} onChange={set('priority')}><option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option><option value="urgent">Urgent</option></select></Field><Field label="Target hiring date"><input type="date" className={fieldClass} value={form.targetDate} onChange={set('targetDate')} /></Field><Field label="Requested by *"><input required className={fieldClass} value={form.requestedByName} onChange={set('requestedByName')} /></Field><Field label="Skills (comma separated)"><input className={fieldClass} value={form.skills} onChange={set('skills')} /></Field></div><Field label="Business reason *"><textarea required rows="4" className={fieldClass} value={form.reason} onChange={set('reason')} /></Field></>;
  if (mode === 'jds') return <><div className="grid gap-4 sm:grid-cols-2"><Field label="Approved hiring requirement *"><select required className={fieldClass} value={form.requirementId} onChange={set('requirementId')}><option value="">Select requirement</option>{requirements.map((row) => <option key={row.id} value={row.id}>{row.requirementCode} - {row.positionTitle}</option>)}</select></Field><Field label="Status"><select className={fieldClass} value={form.status} onChange={set('status')}><option value="draft">Draft</option><option value="active">Active</option><option value="archived">Archived</option></select></Field><Field label="Job title *"><input required className={fieldClass} value={form.title} onChange={set('title')} /></Field><Field label="Department *"><input required className={fieldClass} value={form.department} onChange={set('department')} /></Field><Field label="Experience"><input className={fieldClass} value={form.experience} onChange={set('experience')} /></Field><Field label="Salary range"><input className={fieldClass} value={form.salaryRange} onChange={set('salaryRange')} /></Field></div><Field label="Role summary *"><textarea required rows="3" className={fieldClass} value={form.summary} onChange={set('summary')} /></Field><Field label="Responsibilities *"><textarea required rows="5" className={fieldClass} value={form.responsibilities} onChange={set('responsibilities')} /></Field><Field label="Qualifications *"><textarea required rows="4" className={fieldClass} value={form.qualifications} onChange={set('qualifications')} /></Field></>;
  if (mode === 'campaigns') return <><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"><Field label="Active job description *"><select required className={fieldClass} value={form.jobDescriptionId} onChange={set('jobDescriptionId')}><option value="">Select JD</option>{jds.map((row) => <option key={row.id} value={row.id}>{row.jdCode} - {row.title}</option>)}</select></Field><Field label="Campaign name *"><input required className={fieldClass} value={form.name} onChange={set('name')} /></Field><Field label="Channels"><input className={fieldClass} placeholder="LinkedIn, Naukri, Referral" value={form.channels} onChange={set('channels')} /></Field><Field label="Start date *"><input required type="date" className={fieldClass} value={form.startDate} onChange={set('startDate')} /></Field><Field label="End date"><input type="date" className={fieldClass} value={form.endDate} onChange={set('endDate')} /></Field><Field label="Status"><select className={fieldClass} value={form.status} onChange={set('status')}><option value="planned">Planned</option><option value="active">Active</option><option value="paused">Paused</option><option value="completed">Completed</option><option value="cancelled">Cancelled</option></select></Field><Field label="Approved budget"><input min="0" type="number" className={fieldClass} value={form.budget} onChange={set('budget')} /></Field><Field label="Actual recruitment spend"><input min="0" type="number" className={fieldClass} value={form.actualSpend} onChange={set('actualSpend')} /></Field><Field label="Target applications"><input min="0" type="number" className={fieldClass} value={form.targetApplications} onChange={set('targetApplications')} /></Field></div><Field label="Campaign notes"><textarea rows="3" className={fieldClass} value={form.notes} onChange={set('notes')} /></Field></>;
  if (mode === 'interviews') return <>{form.contextCandidateName && <ConnectedCandidate name={form.contextCandidateName} detail={form.previousInterviewId ? `Connected interview round ${form.roundNumber}` : 'First interview after screening'} />}<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{!form.contextCandidateName && <Field label="Candidate *"><select required className={fieldClass} value={form.candidateId} onChange={set('candidateId')}><option value="">Select shortlisted candidate</option>{candidates.filter((row) => row.screening?.status === 'shortlisted' || ['interview_scheduled','interviewed'].includes(row.stage)).map((row) => <option key={row.id} value={row.id}>{row.candidateCode} - {row.name}</option>)}</select></Field>}<Field label="Round *"><input required className={fieldClass} value={form.round} onChange={set('round')} /></Field><Field label="Interview type"><select className={fieldClass} value={form.interviewType} onChange={set('interviewType')}>{INTERVIEW_TYPES.map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></Field><Field label="Date *"><input required type="date" className={fieldClass} value={form.scheduledDate} onChange={set('scheduledDate')} /></Field><Field label="Time *"><input required type="time" className={fieldClass} value={form.scheduledTime} onChange={set('scheduledTime')} /></Field><Field label="Duration (minutes)"><input type="number" min="5" className={fieldClass} value={form.durationMinutes} onChange={set('durationMinutes')} /></Field><Field label="Interviewer *"><input required className={fieldClass} value={form.interviewerName} onChange={set('interviewerName')} /></Field><Field label="Location / meeting link"><input className={fieldClass} value={form.locationOrLink} onChange={set('locationOrLink')} /></Field><Field label="Status"><select className={fieldClass} value={form.status} onChange={set('status')}><option value="scheduled">Scheduled</option><option value="rescheduled">Rescheduled</option><option value="cancelled">Cancelled</option><option value="no_show">No Show</option></select></Field></div><Field label="Instructions"><textarea rows="3" className={fieldClass} value={form.instructions} onChange={set('instructions')} /></Field></>;
  if (mode === 'offers') return <>{form.contextCandidateName && <ConnectedCandidate name={form.contextCandidateName} detail="Selected candidate linked to this offer" />}<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{!form.contextCandidateName && <Field label="Selected candidate *"><select required className={fieldClass} value={form.candidateId} onChange={(event) => { const candidate = candidates.find((row) => row.id === event.target.value); setForm((current) => ({ ...current, candidateId: event.target.value, designation: current.designation || candidate?.appliedPosition || '' })); }}><option value="">Select candidate</option>{candidates.filter((row) => row.stage === 'selected').map((row) => <option key={row.id} value={row.id}>{row.candidateCode} - {row.name}</option>)}</select></Field>}<Field label="Designation *"><input required className={fieldClass} value={form.designation} onChange={set('designation')} /></Field><Field label="Department *"><input required className={fieldClass} value={form.department} onChange={set('department')} /></Field><Field label="Monthly salary *"><input required min="1" type="number" className={fieldClass} value={form.monthlyGross} onChange={set('monthlyGross')} placeholder="Enter monthly gross salary" /></Field><Field label="Annual CTC (optional)"><input min="0" type="number" className={fieldClass} value={form.annualCtc} onChange={set('annualCtc')} placeholder={form.monthlyGross ? `Auto: ${Number(form.monthlyGross) * 12}` : 'Auto-calculated if blank'} /></Field><Field label="Employment type"><select className={fieldClass} value={form.employmentType} onChange={set('employmentType')}>{EMPLOYMENT_TYPES.map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></Field><Field label="Proposed joining date *"><input required type="date" className={fieldClass} value={form.proposedJoiningDate} onChange={set('proposedJoiningDate')} /></Field><Field label="Offer valid until"><input type="date" className={fieldClass} value={form.validUntil} onChange={set('validUntil')} /></Field></div><Field label="Offer terms"><textarea rows="4" className={fieldClass} value={form.terms} onChange={set('terms')} /></Field></>;
  return <><div className="grid gap-4 sm:grid-cols-2">{form.id ? <Field label="Connected offer"><input disabled className={`${fieldClass} bg-offwhite-200`} value={`${form.offerCode || ''} - ${form.candidateName || ''}`} /></Field> : <Field label="Accepted offer *"><select required className={fieldClass} value={form.offerId} onChange={(event) => { const offer = offers.find((row) => row.id === event.target.value); setForm((current) => ({ ...current, offerId: event.target.value, joiningDate: current.joiningDate || offer?.proposedJoiningDate || '' })); }}><option value="">Select accepted offer</option>{offers.map((row) => <option key={row.id} value={row.id}>{row.offerCode} - {row.candidateName}</option>)}</select></Field>}<Field label="Joining date *"><input required type="date" className={fieldClass} value={form.joiningDate} onChange={set('joiningDate')} /></Field><Field label="Reporting manager"><input className={fieldClass} value={form.reportingManager} onChange={set('reportingManager')} /></Field><Field label="Work location"><input className={fieldClass} value={form.workLocation} onChange={set('workLocation')} /></Field></div><Field label="Onboarding notes"><textarea rows="3" className={fieldClass} value={form.notes} onChange={set('notes')} /></Field></>;
}

function renderTable(mode, rows, user, edit, changeStatus, setEvaluation, toggleChecklist) {
  const head = (labels) => <thead className="bg-[#50685D] text-left text-xs uppercase text-white"><tr>{labels.map((label) => <th key={label} className="px-4 py-3">{label}</th>)}</tr></thead>;
  if (mode === 'requirements') return <table className="w-full min-w-[1150px] text-sm">{head(['Requirement','Position','Department','Openings','Priority','Target','Status','Requested by','Actions'])}<tbody className="divide-y divide-cardline-soft">{rows.map((row) => <tr key={row.id}><td className="px-4 py-3 font-semibold">{row.requirementCode}</td><td className="px-4 py-3">{row.positionTitle}</td><td className="px-4 py-3">{row.department}</td><td className="px-4 py-3">{row.openings}</td><td className="px-4 py-3 capitalize">{row.priority}</td><td className="px-4 py-3">{row.targetDate || 'Not set'}</td><td className="px-4 py-3"><Status value={row.status} /></td><td className="px-4 py-3">{row.requestedByName}</td><td className="px-4 py-3"><div className="flex gap-1">{['draft','rejected'].includes(row.status) && <><button title="Edit" onClick={() => edit(row)} className="p-2 text-sage"><Pencil size={15}/></button><Button size="sm" onClick={() => changeStatus(row,'pending_approval')}>Submit</Button></>}{row.status === 'pending_approval' && hasHrFullAccess(user?.role) && <><Button size="sm" onClick={() => changeStatus(row,'approved')}>Approve</Button><Button size="sm" variant="danger" onClick={() => changeStatus(row,'rejected')}>Reject</Button></>}</div></td></tr>)}</tbody></table>;
  if (mode === 'jds') return <table className="w-full min-w-[950px] text-sm">{head(['JD','Requirement','Title','Department','Experience','Salary range','Status','Updated by','Actions'])}<tbody className="divide-y divide-cardline-soft">{rows.map((row) => <tr key={row.id}><td className="px-4 py-3 font-semibold">{row.jdCode}</td><td className="px-4 py-3">{row.requirementCode}</td><td className="px-4 py-3 font-medium">{row.title}</td><td className="px-4 py-3">{row.department}</td><td className="px-4 py-3">{row.experience || '-'}</td><td className="px-4 py-3">{row.salaryRange || '-'}</td><td className="px-4 py-3"><Status value={row.status}/></td><td className="px-4 py-3">{row.updatedByName}</td><td className="px-4 py-3"><button title="Edit" onClick={() => edit(row)} className="p-2 text-sage"><Pencil size={15}/></button></td></tr>)}</tbody></table>;
  if (mode === 'campaigns') return <table className="w-full min-w-[1150px] text-sm">{head(['Campaign','Name','Position','Channels','Dates','Budget','Actual spend','Target','Status','Actions'])}<tbody className="divide-y divide-cardline-soft">{rows.map((row) => <tr key={row.id}><td className="px-4 py-3 font-semibold">{row.campaignCode}</td><td className="px-4 py-3">{row.name}</td><td className="px-4 py-3">{row.positionTitle}</td><td className="px-4 py-3">{row.channels.join(', ') || '-'}</td><td className="px-4 py-3 whitespace-nowrap">{row.startDate}{row.endDate ? ` to ${row.endDate}` : ''}</td><td className="px-4 py-3">{formatMoney(row.budget)}</td><td className="px-4 py-3 font-semibold">{formatMoney(row.actualSpend)}</td><td className="px-4 py-3">{row.targetApplications}</td><td className="px-4 py-3"><Status value={row.status}/></td><td className="px-4 py-3"><button title="Edit" onClick={() => edit(row)} className="p-2 text-sage"><Pencil size={15}/></button></td></tr>)}</tbody></table>;
  if (mode === 'interviews') return <table className="w-full min-w-[1200px] text-sm">{head(['Interview','Candidate','Position','Round','Schedule','Interviewer','Type','Status','Evaluation','Actions'])}<tbody className="divide-y divide-cardline-soft">{rows.map((row) => <tr key={row.id}><td className="px-4 py-3 font-semibold">{row.interviewCode}</td><td className="px-4 py-3"><Link className="font-semibold text-sage underline" to={`/admin/hr/candidates/${row.candidateId}`}>{row.candidateName}</Link><p className="text-xs text-charcoal/50">{row.candidateCode}</p></td><td className="px-4 py-3">{row.appliedPosition}</td><td className="px-4 py-3"><p className="font-medium">{row.round}</p>{row.previousInterviewId && <p className="text-xs text-charcoal/45">Connected round {row.roundNumber}</p>}</td><td className="whitespace-nowrap px-4 py-3">{formatDateTime(row.scheduledAt)}</td><td className="px-4 py-3">{row.interviewerName}</td><td className="px-4 py-3">{labelFor(INTERVIEW_TYPES,row.interviewType)}</td><td className="px-4 py-3"><Status value={row.status}/></td><td className="px-4 py-3">{row.evaluation ? `${row.evaluation.rating}/5 • ${row.evaluation.recommendation.replaceAll('_',' ')}` : 'Pending'}</td><td className="px-4 py-3"><div className="flex gap-1"><button title="Edit" onClick={() => edit(row)} className="p-2 text-sage"><Pencil size={15}/></button>{!row.evaluation && row.status !== 'cancelled' && <Button size="sm" variant="outline" onClick={() => setEvaluation(row)}>Evaluate</Button>}{row.evaluation?.recommendation === 'next_round' && !row.hasNextRound && <Link className="inline-flex items-center border border-cardline bg-white px-3 py-1.5 text-xs font-semibold text-sage" to={`/admin/hr/interviews?create=1&candidateId=${row.candidateId}&previousInterviewId=${row.id}&roundNumber=${(row.roundNumber || 1) + 1}`}>Book next round</Link>}{row.evaluation?.recommendation === 'selected' && <Link className="inline-flex items-center bg-sage px-3 py-1.5 text-xs font-semibold text-white" to={`/admin/hr/offers?create=1&candidateId=${row.candidateId}`}>Prepare offer</Link>}</div></td></tr>)}</tbody></table>;
  if (mode === 'offers') return <table className="w-full min-w-[1200px] text-sm">{head(['Offer','Candidate','Designation','Department','Monthly salary','Annual CTC','Joining','Status','Approval','Actions'])}<tbody className="divide-y divide-cardline-soft">{rows.map((row) => <tr key={row.id}><td className="px-4 py-3 font-semibold">{row.offerCode}</td><td className="px-4 py-3"><Link className="font-semibold text-sage underline" to={`/admin/hr/candidates/${row.candidateId}`}>{row.candidateName}</Link></td><td className="px-4 py-3">{row.designation}</td><td className="px-4 py-3">{row.department}</td><td className="px-4 py-3 font-semibold">{formatMoney(row.monthlyGross)}</td><td className="px-4 py-3 text-charcoal/65">{formatMoney(row.annualCtc)}</td><td className="px-4 py-3">{row.proposedJoiningDate}</td><td className="px-4 py-3"><Status value={row.status}/></td><td className="px-4 py-3">{row.approvedByName || row.approvalNote || '-'}</td><td className="px-4 py-3"><div className="flex gap-1">{((user?.role === ROLES.HR && ['draft','rejected'].includes(row.status)) || (hasHrFullAccess(user?.role) && ['draft','rejected','pending_approval'].includes(row.status))) && <button title="Edit offer" onClick={() => edit(row)} className="p-2 text-sage"><Pencil size={15}/></button>}{user?.role === ROLES.HR && ['draft','rejected'].includes(row.status) && <Button size="sm" onClick={() => changeStatus(row,'pending_approval')}>Submit for approval</Button>}{row.status === 'pending_approval' && hasHrFullAccess(user?.role) && <><Button size="sm" onClick={() => changeStatus(row,'approved')}>Approve offer</Button><Button size="sm" variant="danger" onClick={() => changeStatus(row,'rejected')}>Reject</Button></>}{row.status === 'approved' && user?.role === ROLES.HR && <Button size="sm" onClick={() => changeStatus(row,'sent')}>Mark sent</Button>}{row.status === 'sent' && user?.role === ROLES.HR && <><Button size="sm" onClick={() => changeStatus(row,'accepted')}>Accepted</Button><Button size="sm" variant="outline" onClick={() => changeStatus(row,'declined')}>Declined</Button></>}</div></td></tr>)}</tbody></table>;
  return <div className="divide-y divide-cardline-soft">{rows.map((row) => { const done = row.checklist.filter((item) => item.completed).length; return <article key={row.id} className="p-4"><div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between"><div><div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold text-charcoal">{row.candidateName}</h3><Status value={row.status}/></div><p className="mt-1 text-sm text-charcoal/60">{row.onboardingCode} • {row.designation}, {row.department} • Joining {row.joiningDate}</p></div><p className="text-sm font-semibold text-sage">{done}/{row.checklist.length} completed</p></div><div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">{row.checklist.map((item) => <button key={item.key} disabled={row.status === 'completed'} onClick={() => toggleChecklist(row,item)} className={`flex items-start gap-3 border p-3 text-left text-sm ${item.completed ? 'border-emerald-300 bg-emerald-50' : 'border-cardline bg-white'}`}><span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center border ${item.completed ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-charcoal/30'}`}>{item.completed && <Check size={13}/>}</span><span><strong className="block">{item.label}</strong>{item.completedByName && <small className="text-charcoal/50">by {item.completedByName}</small>}</span></button>)}</div></article>; })}</div>;
}
