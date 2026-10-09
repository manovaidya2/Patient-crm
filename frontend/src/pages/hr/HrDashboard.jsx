import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarClock, PhoneCall, PhoneIncoming, UserRoundCheck, Users, AlertTriangle, ArrowRight, ClipboardCheck, Megaphone, Send, Briefcase } from 'lucide-react';
import api from '../../api/axios.js';
import Button from '../../components/ui/Button.jsx';
import { CALL_OUTCOMES, formatDateTime, labelFor } from './hrOptions.js';

const cards = [
  ['today', "Today's calls", PhoneCall, 'border-[#4A8077] bg-[#EDF6F4]'],
  ['yesterday', "Yesterday's calls", PhoneIncoming, 'border-[#7795A7] bg-[#EFF4F7]'],
  ['week', 'This week', CalendarClock, 'border-[#77549A] bg-[#F3EEF8]'],
  ['month', 'This month', CalendarClock, 'border-[#B38238] bg-[#FFF6E8]'],
  ['connected', 'Connected calls', PhoneCall, 'border-[#4A8077] bg-[#EDF6F4]'],
  ['no_answer', 'No Answer calls', PhoneIncoming, 'border-[#7795A7] bg-[#EFF4F7]'],
  ['interested', 'Interested', UserRoundCheck, 'border-[#4A8077] bg-[#EDF6F4]'],
  ['not_interested', 'Not Interested', UserRoundCheck, 'border-[#9A6963] bg-[#FAF0EF]'],
  ['pendingCallbacks', 'Pending callbacks', PhoneIncoming, 'border-[#B38238] bg-[#FFF9EE]'],
  ['overdueFollowUps', 'Overdue follow-ups', AlertTriangle, 'border-[#B8534C] bg-[#FFF1F0]'],
  ['activeCandidates', 'Active candidates', Users, 'border-[#4A8077] bg-[#EDF6F4]'],
];

const recruitmentCards = [
  ['pendingRequirements', 'Requirements awaiting approval', ClipboardCheck, '/admin/hr/requirements', 'bg-[#FFF6E8] border-[#D5A75F]'],
  ['activeCampaigns', 'Active job campaigns', Megaphone, '/admin/hr/campaigns', 'bg-[#EEF6F4] border-[#6C9B91]'],
  ['upcomingInterviews', 'Upcoming interviews', CalendarClock, '/admin/hr/interviews', 'bg-[#EFF4F8] border-[#7C9AAF]'],
  ['pendingOffers', 'Offers awaiting approval', Send, '/admin/hr/offers', 'bg-[#F5EFF9] border-[#9873B2]'],
  ['activeOnboarding', 'Active onboarding', Briefcase, '/admin/hr/onboarding', 'bg-[#F8F3EA] border-[#A88B60]'],
];

export default function HrDashboard() {
  const [data, setData] = useState(null);
  const [recruitment, setRecruitment] = useState(null);
  const [error, setError] = useState('');
  const load = async () => {
    try {
      const [callResponse, recruitmentResponse] = await Promise.all([api.get('/hr/dashboard'), api.get('/hr/recruitment/summary')]);
      setData(callResponse.data); setRecruitment(recruitmentResponse.data.summary); setError('');
    }
    catch (requestError) { setError(requestError.response?.data?.message || 'HR dashboard could not be loaded'); }
  };
  useEffect(() => { load(); }, []);
  const stat = (key) => data?.stats?.[key] ?? data?.stats?.outcomes?.[key] ?? 0;

  return <div className="space-y-6">
    <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div><p className="text-xs font-semibold uppercase text-sage">HR Management</p><h1 className="font-display text-2xl font-bold text-charcoal">HR Dashboard</h1><p className="mt-1 text-sm text-charcoal/60">Recruitment pipeline, manual calling and candidate follow-ups.</p></div>
      <div className="flex gap-2"><Link to="/admin/hr/candidates"><Button variant="outline">Candidates</Button></Link><Link to="/admin/hr/calls"><Button><PhoneCall size={16} /> Manual Call Register</Button></Link></div>
    </header>
    {error && <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error} <button className="ml-2 underline" onClick={load}>Retry</button></div>}
    <section className="border border-cardline bg-offwhite-100">
      <div className="flex items-center justify-between border-b border-cardline px-4 py-3"><div><h2 className="font-semibold text-charcoal">Recruitment pipeline</h2><p className="text-xs text-charcoal/55">Current approvals and operational workload</p></div><Link to="/admin/hr/requirements" className="inline-flex items-center gap-1 text-sm font-semibold text-sage">Open pipeline <ArrowRight size={14} /></Link></div>
      <div className="grid sm:grid-cols-2 xl:grid-cols-5">{recruitmentCards.map(([key, label, Icon, to, style]) => <Link key={key} to={to} className={`min-h-[116px] border-b border-r border-cardline p-4 transition hover:brightness-95 ${style}`}><div className="flex items-start justify-between gap-3"><p className="text-sm font-semibold text-charcoal/65">{label}</p><Icon size={18} className="shrink-0 text-charcoal/45" /></div><p className="mt-3 text-3xl font-bold text-charcoal">{recruitment ? recruitment[key] : '...'}</p></Link>)}</div>
    </section>
    <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {cards.map(([key, label, Icon, tone]) => <div key={key} className={`min-h-[108px] border-l-4 p-4 ${tone}`}><div className="flex items-center justify-between"><p className="text-sm font-semibold text-charcoal/65">{label}</p><Icon size={18} className="text-charcoal/45" /></div><p className="mt-3 text-3xl font-bold text-charcoal">{data ? stat(key) : '...'}</p></div>)}
    </section>
    <div className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
      <section className="border border-cardline bg-offwhite-100">
        <div className="flex items-center justify-between border-b border-cardline px-4 py-3"><div><h2 className="font-semibold text-charcoal">Follow-up queue</h2><p className="text-xs text-charcoal/55">Overdue first, then upcoming</p></div><Link to="/admin/hr/calls?followUpStatus=pending" className="inline-flex items-center gap-1 text-sm font-semibold text-sage">View all <ArrowRight size={14} /></Link></div>
        <div className="divide-y divide-cardline-soft">
          {(data?.followUps || []).map((row) => <Link key={row.id} to={`/admin/hr/candidates/${row.candidateId}`} className="grid gap-1 px-4 py-3 hover:bg-offwhite-200 sm:grid-cols-[1fr_auto]"><div><p className="font-semibold text-charcoal">{row.candidateName} <span className="text-xs font-normal text-charcoal/50">{row.candidateCode}</span></p><p className="text-sm text-charcoal/65">{row.appliedPosition} • {row.remarks}</p></div><div className="text-left sm:text-right"><p className={`text-sm font-semibold ${row.followUpDisplayStatus === 'overdue' ? 'text-red-700' : 'text-[#8A5B16]'}`}>{formatDateTime(row.nextFollowUpAt)}</p><p className="text-xs capitalize text-charcoal/50">{row.followUpDisplayStatus}</p></div></Link>)}
          {data && !data.followUps.length && <p className="p-8 text-center text-sm text-charcoal/50">No pending follow-ups</p>}
        </div>
      </section>
      <section className="border border-cardline bg-offwhite-100">
        <div className="border-b border-cardline px-4 py-3"><h2 className="font-semibold text-charcoal">Latest manual calls</h2><p className="text-xs text-charcoal/55">HR-entered call activity</p></div>
        <div className="divide-y divide-cardline-soft">
          {(data?.recentCalls || []).slice(0, 7).map((row) => <Link key={row.id} to={`/admin/hr/candidates/${row.candidateId}`} className="block px-4 py-3 hover:bg-offwhite-200"><div className="flex items-start justify-between gap-3"><p className="font-semibold text-charcoal">{row.candidateName}</p><span className="whitespace-nowrap text-xs text-charcoal/50">{row.callDate} {row.callTime}</span></div><p className="mt-1 text-sm"><span className="font-medium text-sage">{labelFor(CALL_OUTCOMES, row.outcome)}</span> <span className="text-charcoal/60">• {row.recordedByName}</span></p></Link>)}
          {data && !data.recentCalls.length && <p className="p-8 text-center text-sm text-charcoal/50">No calls recorded yet</p>}
        </div>
      </section>
    </div>
  </div>;
}
