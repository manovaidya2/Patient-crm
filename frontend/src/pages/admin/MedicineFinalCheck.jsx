import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { BellRing, ChevronDown, ClipboardCheck, ExternalLink, Inbox, RefreshCw } from 'lucide-react';
import api from '../../api/axios.js';
import useLiveEvent from '../../api/useLiveEvent.js';
import Button from '../../components/ui/Button.jsx';
import { PageHeader } from '../../components/ui/Layout.jsx';
import FinalCheckForm from '../../components/medicine/FinalCheckForm.jsx';
import DoctorVerificationCheck from '../../components/medicine/DoctorVerificationCheck.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { isAdminLike, ROLES } from '../../constants/roles.js';

// Medicine Final Check: fulfilment step 11. Every parcel packed with its treatment papers (step 10) waits here for the
// final verification check, done by the PCC the admin chose in Settings ("Final medicine check"). The doctor verifies
// next (step 12).
const day = (v) => (v ? new Date(v).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '-');
const when = (v) => (v ? new Date(v).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '');

function CheckHere({ row, onDone, allowDoctorConfirmation }) {
  const [job, setJob] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => { api.get(`/medicine-jobs/${row.id}`, { skipCache: true }).then(({ data }) => setJob(data.job)).catch((err) => setError(err.response?.data?.message || 'Could not load the job')); }, [row.id]);
  if (!job) return <p className="mt-3 text-sm text-charcoal/60">{error || 'Loading...'}</p>;
  if (job.stages.some((s) => s.key === 'final' && s.state === 'done')) return <DoctorVerificationCheck job={job} allowConfirmation={allowDoctorConfirmation} onSaved={setJob} />;
  if (job.currentKey !== 'final' || job.status !== 'open' || job.hold) return <p className="mt-3 rounded-lg bg-[#FBF7ED] px-3 py-2 text-sm text-charcoal/70">{job.hold ? `On hold: ${job.hold.reason}` : 'This parcel is not at the final check any more.'}</p>;
  return <div className="mt-3 border-t border-cardline pt-4"><FinalCheckForm job={job} documents={job.patientDocuments || []} onDone={onDone} allowDoctorConfirmation={allowDoctorConfirmation} /></div>;
}

export default function MedicineFinalCheck() {
  const { user } = useAuth();
  const [view, setView] = useState('pending');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [openRow, setOpenRow] = useState('');
  const [notice, setNotice] = useState('');
  const load = useCallback(async () => {
    try { const { data: d } = await api.get('/treatment-papers', { params: { kind: 'final', view }, skipCache: true }); setData(d); setError(''); }
    catch (err) { setError(err.response?.data?.message || 'Could not load'); }
  }, [view]);
  useEffect(() => { setData(null); load(); }, [load]);
  useLiveEvent('medicine-job:changed', () => load());
  useLiveEvent('pcc:alarm', () => load());
  const rows = data?.rows || [];
  return (
    <div className="space-y-4">
      <PageHeader icon={ClipboardCheck} title="Medicine Final Check" subtitle="Verify the parcel, packing records and treatment papers. PASS makes the medicine ready; HOLD returns it to Packing-2 for correction." actions={<Button variant="outline" size="sm" onClick={load}><RefreshCw size={15} />Refresh</Button>} />
      {data && isAdminLike(user) && <p className={`rounded-lg px-4 py-3 text-sm ${data.pcc ? 'bg-[#FBF7ED] text-charcoal/75' : 'bg-[#FFF1E6] font-semibold text-[#C2410C]'}`}>{data.pcc ? <>The final check is done by <b>{data.pcc.name}</b>.</> : 'No PCC is chosen yet: no PCC gets these requests.'} <Link to="/admin/settings" className="font-semibold text-sage hover:underline">Change in Settings</Link></p>}
      {data && !data.mine && <p className="rounded-lg bg-[#FBF7ED] px-4 py-3 text-sm text-charcoal/75">{data.pcc ? <>The final check is done by <b>{data.pcc.name}</b> (chosen by the admin).</> : 'The admin has not chosen who does the final check yet.'}</p>}
      <div className="flex flex-wrap gap-2">
        {[['pending', 'To check'], ['done', 'Checked']].map(([key, label]) => <button key={key} type="button" aria-pressed={view === key} onClick={() => setView(key)} className={`rounded-full border px-4 py-1.5 text-sm font-semibold ${view === key ? 'border-sage bg-sage text-white' : 'border-cardline bg-white text-charcoal/70 hover:border-sage/60'}`}>{label}</button>)}
      </div>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      {notice && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800">{notice}</p>}
      {!data ? <p className="text-sm text-charcoal/60">Loading...</p> : !rows.length ? (
        <div className="flex flex-col items-center gap-2 rounded-[14px] border border-dashed border-cardline bg-white p-10 text-center"><Inbox size={22} className="text-charcoal/35" /><p className="text-sm text-charcoal/60">{view === 'pending' ? 'No parcel is waiting for the final check.' : 'No final check done yet.'}</p></div>
      ) : (
        <div className="space-y-3">
          {rows.map((r) => (
            <article key={r.id} className={`rounded-[14px] border bg-white p-4 ${r.alarm && view === 'pending' ? 'border-2 border-[#FCA5A5]' : 'border-[#E8DFCB]'}`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-display text-base font-bold text-charcoal">{r.patientName} <span className="text-sm font-normal text-charcoal/60">{[r.patientCode, `Phase ${r.phase}`].join(' · ')}</span></p>
                  <p className="text-xs text-charcoal/65">{[r.poNumber && `PO ${r.poNumber}`, r.supplyLabel, r.ageBandLabel, r.readyByDate && `ready by ${day(r.readyByDate)}`].filter(Boolean).join(' · ')}</p>
                  {view === 'pending' && r.waitingSince && <p className="mt-1 text-xs text-charcoal/60">Waiting since {when(r.waitingSince)} (parcel packed)</p>}
                  {r.alarm && view === 'pending' && <p className="mt-1 flex items-center gap-1.5 text-xs font-bold text-[#B91C1C]"><BellRing size={13} />Medicine Department rang {when(r.alarm.at)} ({r.alarm.byName}){r.alarm.note ? `: ${r.alarm.note}` : ''}</p>}
                  {view === 'done' && <p className="mt-1 text-xs text-charcoal/65">Checked by {r.doneByName} · {when(r.doneAt)}</p>}
                </div>
                <div className="flex flex-wrap gap-2">
                  {data.mine && <Button size="sm" onClick={() => { setNotice(''); setOpenRow((o) => (o === r.id ? '' : r.id)); }}><ChevronDown size={14} className={openRow === r.id ? 'rotate-180' : ''} />{openRow === r.id ? 'Close' : view === 'pending' ? 'Check here' : 'Doctor verification'}</Button>}
                  <Link to={`/admin/medicine-jobs/${r.id}`}><Button size="sm" variant="outline"><ExternalLink size={14} />{view === 'pending' ? 'Open in fulfilment' : 'View'}</Button></Link>
                </div>
              </div>
              {openRow === r.id && <CheckHere row={r} allowDoctorConfirmation={data.mine && user?.role === ROLES.ASSISTANT_DOCTOR} onDone={(msg) => { setOpenRow(''); setNotice(msg); load(); }} />}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
