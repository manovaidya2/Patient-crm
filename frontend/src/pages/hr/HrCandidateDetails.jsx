import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, CalendarClock, ClipboardCheck, Pencil, PhoneCall, Plus, UserRound } from 'lucide-react';
import api from '../../api/axios.js';
import Button from '../../components/ui/Button.jsx';
import HrCandidateForm from './HrCandidateForm.jsx';
import HrCallForm from './HrCallForm.jsx';
import HrScreeningForm from './HrScreeningForm.jsx';
import { CALL_OUTCOMES, CALL_TYPES, CANDIDATE_STAGES, INTERVIEW_TYPES, formatDateTime, formatMoney, labelFor } from './hrOptions.js';

const tone = (status) => ({
  accepted: 'bg-emerald-100 text-emerald-800', approved: 'bg-emerald-100 text-emerald-800', completed: 'bg-emerald-100 text-emerald-800', shortlisted: 'bg-emerald-100 text-emerald-800',
  rejected: 'bg-red-100 text-red-800', declined: 'bg-red-100 text-red-800', cancelled: 'bg-red-100 text-red-800',
  pending_approval: 'bg-amber-100 text-amber-800', scheduled: 'bg-blue-100 text-blue-800', sent: 'bg-blue-100 text-blue-800',
}[status] || 'bg-offwhite-300 text-charcoal/70');

function Status({ value }) {
  return <span className={`inline-flex rounded px-2 py-1 text-xs font-semibold capitalize ${tone(value)}`}>{String(value || 'pending').replaceAll('_', ' ')}</span>;
}

export default function HrCandidateDetails() {
  const { id } = useParams();
  const [candidate, setCandidate] = useState(null);
  const [calls, setCalls] = useState([]);
  const [interviews, setInterviews] = useState([]);
  const [offers, setOffers] = useState([]);
  const [tab, setTab] = useState('overview');
  const [candidateForm, setCandidateForm] = useState(false);
  const [callForm, setCallForm] = useState(false);
  const [screeningForm, setScreeningForm] = useState(false);
  const [editingCall, setEditingCall] = useState(null);
  const [error, setError] = useState('');

  const load = async () => {
    try {
      const [candidateResponse, callsResponse, interviewsResponse, offersResponse] = await Promise.all([
        api.get(`/hr/candidates/${id}`),
        api.get('/hr/calls', { params: { candidateId: id, limit: 100 } }),
        api.get('/hr/interviews', { params: { candidateId: id } }),
        api.get('/hr/offers', { params: { candidateId: id } }),
      ]);
      setCandidate(candidateResponse.data.candidate);
      setCalls(callsResponse.data.calls || []);
      setInterviews(interviewsResponse.data.interviews || []);
      setOffers(offersResponse.data.offers || []);
      setError('');
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Candidate profile could not be loaded');
    }
  };

  useEffect(() => { load(); }, [id]);
  if (error) return <div className="rounded-md bg-red-50 p-4 text-red-800">{error}</div>;
  if (!candidate) return <p className="p-10 text-center text-charcoal/50">Loading candidate profile...</p>;

  const tabs = [
    ['overview', 'Overview'],
    ['calls', `Call History (${candidate.totalCalls})`],
    ['recruitment', `Recruitment (${interviews.length + offers.length})`],
    ['activity', 'Activity Timeline'],
  ];
  const screening = candidate.screening || { status: 'pending' };

  return <div className="space-y-5">
    <Link to="/admin/hr/candidates" className="inline-flex items-center gap-2 text-sm font-semibold text-sage"><ArrowLeft size={16} /> Back to candidates</Link>
    <section className="border border-cardline bg-offwhite-100">
      <div className="flex flex-col gap-5 p-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex gap-4"><div className="flex h-12 w-12 shrink-0 items-center justify-center bg-[#EAF3F1] text-sage"><UserRound /></div><div><p className="text-xs font-semibold uppercase text-charcoal/50">{candidate.candidateCode}</p><h1 className="font-display text-3xl font-bold text-charcoal">{candidate.name}</h1><p className="mt-1 text-charcoal/60">{candidate.appliedPosition} | {candidate.phone}</p></div></div>
        <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => setCandidateForm(true)}><Pencil size={15} /> Edit candidate</Button><Button variant="outline" onClick={() => setScreeningForm(true)}><ClipboardCheck size={15} /> Screening</Button><Button onClick={() => { setEditingCall(null); setCallForm(true); }}><Plus size={15} /> Add manual call</Button></div>
      </div>
      <div className="grid border-t border-cardline sm:grid-cols-2 lg:grid-cols-6">
        <Metric label="Stage" value={labelFor(CANDIDATE_STAGES, candidate.stage)} />
        <Metric label="Campaign" value={candidate.campaignCode || 'Not linked'} />
        <Metric label="Screening" value={String(screening.status || 'pending').replaceAll('_', ' ')} />
        <Metric label="Total calls" value={candidate.totalCalls} />
        <Metric label="Latest outcome" value={candidate.latestCallOutcome ? labelFor(CALL_OUTCOMES, candidate.latestCallOutcome) : 'No calls'} />
        <Metric label="Next follow-up" value={candidate.nextFollowUpAt ? formatDateTime(candidate.nextFollowUpAt) : 'Not scheduled'} last />
      </div>
    </section>

    <nav className="flex overflow-x-auto border-b-2 border-cardline">{tabs.map(([value, label]) => <button key={value} onClick={() => setTab(value)} className={`min-w-max border-b-4 px-6 py-3 text-sm font-semibold ${tab === value ? 'border-sage bg-[#EAF3F1] text-sage' : 'border-transparent text-charcoal/55'}`}>{label}</button>)}</nav>

    {tab === 'overview' && <div className="grid gap-4 xl:grid-cols-[1fr_0.9fr]">
      <section className="grid gap-4 border border-cardline bg-offwhite-100 p-5 sm:grid-cols-2"><Info label="Primary phone" value={candidate.phone} /><Info label="Alternate phone" value={candidate.alternatePhone || 'Not added'} /><Info label="Email" value={candidate.email || 'Not added'} /><Info label="Candidate source" value={candidate.source || 'Not added'} /><Info label="Applied position" value={candidate.appliedPosition} /><Info label="Record status" value={candidate.isActive ? 'Active' : 'Inactive'} /><div className="sm:col-span-2"><Info label="Notes" value={candidate.notes || 'No notes added'} /></div></section>
      <section className="border border-cardline bg-[#F3F7F5] p-5"><div className="flex items-center justify-between gap-3"><div><p className="text-xs font-semibold uppercase text-sage">Screening assessment</p><h2 className="mt-1 font-semibold text-charcoal">Candidate suitability</h2></div><Status value={screening.status} /></div><div className="mt-5 grid gap-4 sm:grid-cols-2"><Info label="Rating" value={screening.rating ? `${screening.rating}/5` : 'Not rated'} /><Info label="Screened by" value={screening.screenedByName || 'Not screened'} /><Info label="Education" value={screening.education || 'Not added'} /><Info label="Experience" value={screening.experience || 'Not added'} /><Info label="Current CTC" value={screening.currentCtc || 'Not added'} /><Info label="Expected CTC" value={screening.expectedCtc || 'Not added'} /><Info label="Notice period" value={screening.noticePeriod || 'Not added'} /><Info label="Screened at" value={screening.screenedAt ? formatDateTime(screening.screenedAt) : 'Not screened'} /><div className="sm:col-span-2"><Info label="Remarks" value={screening.remarks || 'No screening remarks'} /></div></div></section>
    </div>}

    {tab === 'calls' && <section className="space-y-3">{calls.map((call) => <article key={call.id} className={`border border-cardline bg-offwhite-100 p-4 ${call.followUpDisplayStatus === 'overdue' ? 'border-l-4 border-l-red-600' : 'border-l-4 border-l-sage'}`}><div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><div className="flex flex-wrap items-center gap-2"><span className="font-semibold">{labelFor(CALL_OUTCOMES, call.outcome)}</span><span className="rounded bg-offwhite-300 px-2 py-0.5 text-xs">{labelFor(CALL_TYPES, call.callType)}</span><span className="text-xs text-charcoal/50">{call.callCode}</span></div><p className="mt-2 text-sm text-charcoal/75">{call.remarks}</p><p className="mt-2 text-xs text-charcoal/50">Recorded by {call.recordedByName} | {call.callDate} at {call.callTime} | HR-entered</p>{call.nextFollowUpAt && <p className={`mt-2 inline-flex items-center gap-1 text-sm ${call.followUpDisplayStatus === 'overdue' ? 'font-semibold text-red-700' : 'text-[#8A5B16]'}`}><CalendarClock size={14} /> Follow-up {formatDateTime(call.nextFollowUpAt)} ({call.followUpDisplayStatus})</p>}</div><Button size="sm" variant="outline" onClick={() => { setEditingCall(call); setCallForm(true); }}><Pencil size={14} /> Edit</Button></div></article>)}{!calls.length && <Empty icon={PhoneCall} text="No calls recorded for this candidate." />}</section>}

    {tab === 'recruitment' && <div className="grid gap-5 xl:grid-cols-2"><section className="border border-cardline bg-offwhite-100"><SectionTitle title="Interview rounds" action="Schedule interview" to="/admin/hr/interviews" /><div className="divide-y divide-cardline-soft">{interviews.map((row) => <article key={row.id} className="p-4"><div className="flex items-start justify-between gap-3"><div><p className="font-semibold">{row.round} <span className="ml-1 text-xs font-normal text-charcoal/50">{row.interviewCode}</span></p><p className="mt-1 text-sm text-charcoal/60">{formatDateTime(row.scheduledAt)} | {labelFor(INTERVIEW_TYPES, row.interviewType)}</p><p className="mt-1 text-sm">Interviewer: {row.interviewerName}</p></div><Status value={row.status} /></div>{row.evaluation && <div className="mt-3 border-l-2 border-sage bg-[#F3F7F5] p-3 text-sm"><strong>{row.evaluation.rating}/5 | {row.evaluation.recommendation.replaceAll('_', ' ')}</strong><p className="mt-1 text-charcoal/65">{row.evaluation.notes || row.evaluation.strengths || 'Evaluation recorded'}</p></div>}</article>)}{!interviews.length && <p className="p-8 text-center text-sm text-charcoal/50">No interviews scheduled.</p>}</div></section><section className="border border-cardline bg-offwhite-100"><SectionTitle title="Offers" action="Manage offers" to="/admin/hr/offers" /><div className="divide-y divide-cardline-soft">{offers.map((row) => <article key={row.id} className="p-4"><div className="flex items-start justify-between gap-3"><div><p className="font-semibold">{row.designation} <span className="ml-1 text-xs font-normal text-charcoal/50">{row.offerCode}</span></p><p className="mt-1 text-sm text-charcoal/60">{row.department} | Joining {row.proposedJoiningDate}</p><p className="mt-2 font-semibold text-sage">{formatMoney(row.annualCtc)} annual CTC</p></div><Status value={row.status} /></div>{row.approvalNote && <p className="mt-3 text-sm text-charcoal/65">Approval note: {row.approvalNote}</p>}</article>)}{!offers.length && <p className="p-8 text-center text-sm text-charcoal/50">No offers prepared.</p>}</div></section></div>}

    {tab === 'activity' && <section className="border border-cardline bg-offwhite-100 p-5"><div className="space-y-5">{(candidate.activity || []).map((entry) => <div key={entry.id} className="relative border-l-2 border-[#B8CDC8] pl-5 before:absolute before:-left-[6px] before:top-1 before:h-2.5 before:w-2.5 before:rounded-full before:bg-sage"><p className="font-semibold">{entry.action}</p><p className="text-sm text-charcoal/65">{entry.details}</p><p className="mt-1 text-xs text-charcoal/45">{entry.actorName} | {formatDateTime(entry.createdAt)}</p></div>)}</div></section>}

    <HrCandidateForm open={candidateForm} candidate={candidate} onClose={() => setCandidateForm(false)} onSaved={load} />
    <HrCallForm open={callForm} call={editingCall} fixedCandidate={candidate} onClose={() => setCallForm(false)} onSaved={load} />
    <HrScreeningForm open={screeningForm} candidate={candidate} onClose={() => setScreeningForm(false)} onSaved={load} />
  </div>;
}

function Metric({ label, value, last = false }) { return <div className={`p-4 ${last ? '' : 'border-r border-cardline'}`}><p className="text-xs uppercase text-charcoal/50">{label}</p><p className="mt-1 font-semibold capitalize">{value}</p></div>; }
function Info({ label, value }) { return <div><p className="text-xs font-semibold uppercase text-charcoal/50">{label}</p><p className="mt-1 text-base font-medium text-charcoal">{value}</p></div>; }
function SectionTitle({ title, action, to }) { return <div className="flex items-center justify-between border-b border-cardline px-4 py-3"><h2 className="font-semibold">{title}</h2><Link className="text-sm font-semibold text-sage" to={to}>{action}</Link></div>; }
function Empty({ icon: Icon, text }) { return <div className="border border-dashed border-cardline p-12 text-center"><Icon className="mx-auto text-charcoal/30" /><p className="mt-2 text-sm text-charcoal/55">{text}</p></div>; }
