import { useEffect, useState } from 'react';
import { CheckCircle2, Clock3, MessageCircleQuestion, Search, Send, Ticket } from 'lucide-react';
import { Link } from 'react-router-dom';
import api from '../../api/axios.js';
import Button from '../../components/ui/Button.jsx';
import Card from '../../components/ui/Card.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { ROLES } from '../../constants/roles.js';

const emptyForm = { issue: '', askedBy: '', notes: '' };
const formatDate = (value) => value ? new Date(value).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-';
const statusLabel = { open: 'Open', in_progress: 'In progress', resolved: 'Resolved' };

const PatientCard = ({ patient, appointment }) => (
  <div className="rounded-lg border border-sage/30 bg-sage/5 p-4">
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
      {patient ? <><p className="font-semibold text-charcoal">{patient.patientName}</p><Link to={`/admin/patients/${patient.id}`} className="text-sm font-semibold text-sage underline-offset-2 hover:underline">Patient ID: {patient.patientCode}</Link></> : <p className="font-semibold text-charcoal">Appointment details</p>}
      {appointment?.appointmentCode && <Link to="/admin/appointment-management" className="text-sm font-semibold text-sage underline-offset-2 hover:underline">Appointment ID: {appointment.appointmentCode}</Link>}
    </div>
    {patient && <div className="mt-3 grid gap-x-6 gap-y-1 text-sm text-charcoal/70 sm:grid-cols-3"><p><span className="font-semibold">Phone:</span> {patient.number || '-'}</p><p><span className="font-semibold">Category:</span> {patient.category || '-'}</p><p><span className="font-semibold">Reference:</span> <Link to={`/admin/patients/${patient.id}`} className="text-sage hover:underline">Open patient details</Link></p></div>}
    {appointment?.details?.length > 0 && <div className="mt-3 grid gap-x-6 gap-y-2 border-t border-sage/20 pt-3 sm:grid-cols-2">{appointment.details.map((detail) => <p key={detail.label} className="text-sm text-charcoal/70"><span className="font-semibold">{detail.label}:</span> {detail.value}</p>)}</div>}
  </div>
);

const PatientQueries = () => {
  const { user } = useAuth();
  const isReceptionist = user?.role === ROLES.RECEPTIONIST;
  const [identifier, setIdentifier] = useState('');
  const [patient, setPatient] = useState(null);
  const [appointment, setAppointment] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [queries, setQueries] = useState([]);
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [lookingUp, setLookingUp] = useState(false);
  const [saving, setSaving] = useState(false);
  const [resolvingId, setResolvingId] = useState(null);
  const [solution, setSolution] = useState('');
  const [resolutionSentTo, setResolutionSentTo] = useState('');
  const [solutionReference, setSolutionReference] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const loadQueries = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/help-desk', { params: filter === 'all' ? {} : { status: filter } });
      setQueries(data.queries || []);
    } catch (err) { setError(err.response?.data?.message || 'Could not load Help Desk records.'); }
    finally { setLoading(false); }
  };
  useEffect(() => { loadQueries(); }, [filter]);

  const findPatient = async (event) => {
    event.preventDefault();
    if (!identifier.trim()) return;
    setLookingUp(true); setError(''); setSuccess(''); setPatient(null); setAppointment(null);
    try {
      const { data } = await api.get('/help-desk/lookup', { params: { identifier: identifier.trim() } });
      setPatient(data.patient); setAppointment(data.appointment);
    } catch (err) { setError(err.response?.data?.message || 'Patient could not be found.'); }
    finally { setLookingUp(false); }
  };
  const createTicket = async (event) => {
    event.preventDefault();
    setSaving(true); setError(''); setSuccess('');
    try {
      await api.post('/help-desk', { ...form, patientId: patient?.id, appointmentId: appointment?.id, appointmentCode: appointment?.appointmentCode });
      setForm(emptyForm); setPatient(null); setAppointment(null); setIdentifier(''); setSuccess('Help Desk ticket created successfully.'); await loadQueries();
    } catch (err) { setError(err.response?.data?.message || 'Ticket could not be created.'); }
    finally { setSaving(false); }
  };
  const resolveTicket = async (id) => {
    if (!solution.trim()) return;
    setResolvingId(id); setError('');
    try { await api.patch(`/help-desk/${id}/resolve`, { solution, solutionReference, sentTo: resolutionSentTo }); setSolution(''); setSolutionReference(''); setResolutionSentTo(''); setResolvingId(null); await loadQueries(); }
    catch (err) { setError(err.response?.data?.message || 'Solution could not be saved.'); setResolvingId(null); }
  };

  return (
    <div className="mx-auto max-w-[1800px]">
      <div className="mb-5 border-b border-cardline pb-5">
        <p className="text-xs font-semibold uppercase text-charcoal/50">Receptionist Workspace</p>
        <h1 className="mt-1 font-display text-2xl font-bold text-charcoal">Help Desk / Patient Queries</h1>
        <p className="mt-1 text-sm text-charcoal/55">Find a patient by Appointment ID or Patient ID and keep every query and solution recorded.</p>
      </div>
      {error && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
      {success && <div className="mb-4 rounded-lg border border-sage/25 bg-sage/10 px-4 py-3 text-sm text-sage">{success}</div>}
      <div className="space-y-5">
        {isReceptionist && <Card>
          <div className="flex items-center gap-2"><Search size={18} className="text-sage" /><h2 className="font-display text-lg font-bold">Create Help Desk Ticket</h2></div>
          <form onSubmit={findPatient} className="mt-4 flex gap-2"><input value={identifier} onChange={(event) => setIdentifier(event.target.value)} placeholder="Appointment ID or Patient ID" className="min-w-0 flex-1 rounded-lg border border-cardline bg-offwhite-200 px-3 py-2.5 text-sm outline-none focus:border-sage" /><Button type="submit" disabled={lookingUp}>{lookingUp ? 'Finding...' : 'Find'}</Button></form>
          {(patient || appointment) && <form onSubmit={createTicket} className="mt-4 space-y-4 border-t border-cardline pt-4"><PatientCard patient={patient} appointment={appointment} />
            <label className="block"><span className="mb-1.5 block text-sm font-semibold">Issue <span className="text-red-600">*</span></span><textarea required rows={3} value={form.issue} onChange={(event) => setForm({ ...form, issue: event.target.value })} className="w-full rounded-lg border border-cardline bg-offwhite-200 px-3 py-2.5 text-sm outline-none focus:border-sage" placeholder="What problem did the patient report?" /></label>
            <label className="block"><span className="mb-1.5 block text-sm font-semibold">Asked by / reported by</span><input value={form.askedBy} onChange={(event) => setForm({ ...form, askedBy: event.target.value })} className="w-full rounded-lg border border-cardline bg-offwhite-200 px-3 py-2.5 text-sm outline-none focus:border-sage" placeholder="Patient, doctor, team member..." /></label>
            <label className="block"><span className="mb-1.5 block text-sm font-semibold">Internal notes</span><textarea rows={2} value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} className="w-full rounded-lg border border-cardline bg-offwhite-200 px-3 py-2.5 text-sm outline-none focus:border-sage" /></label>
            <Button type="submit" disabled={saving}><Send size={16} /> {saving ? 'Saving...' : 'Create Ticket'}</Button>
          </form>}
        </Card>}
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-2"><Ticket size={18} className="text-sage" /><h2 className="font-display text-lg font-bold">Query Records</h2></div><select value={filter} onChange={(event) => setFilter(event.target.value)} className="rounded-lg border border-cardline bg-offwhite-200 px-3 py-2 text-sm"><option value="all">All tickets</option><option value="open">Open</option><option value="in_progress">In progress</option><option value="resolved">Resolved</option></select></div>
          <div className="mt-4 space-y-3">{loading ? <p className="py-10 text-center text-sm text-charcoal/50">Loading records...</p> : !queries.length ? <p className="rounded-lg border border-cardline bg-offwhite-200 px-4 py-10 text-center text-sm text-charcoal/50">No Help Desk records yet.</p> : queries.map((query) => <div key={query.id} className="rounded-lg border border-cardline bg-offwhite-100 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex flex-wrap items-center gap-2"><p className="font-semibold">{query.patientName}</p><span className="text-xs font-semibold text-sage">{query.patientCode}</span>{query.appointmentCode && <span className="text-xs text-charcoal/55">{query.appointmentCode}</span>}</div><p className="mt-1 text-xs text-charcoal/50">Created by {query.createdByName || '-'} on {formatDate(query.createdAt)}</p></div><span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${query.status === 'resolved' ? 'bg-sage/15 text-sage' : 'bg-[#D9B66F]/25 text-[#8A5A12]'}`}>{query.status === 'resolved' ? <CheckCircle2 size={13} /> : <Clock3 size={13} />}{statusLabel[query.status]}</span></div>
            <div className="mt-3 grid gap-3 text-sm sm:grid-cols-2"><div><p className="text-[11px] font-semibold uppercase text-charcoal/50">Issue</p><p className="mt-1 whitespace-pre-line">{query.issue}</p></div><div><p className="text-[11px] font-semibold uppercase text-charcoal/50">Sent to</p><p className="mt-1">{query.sentTo || '-'}</p></div><div><p className="text-[11px] font-semibold uppercase text-charcoal/50">Asked by</p><p className="mt-1">{query.askedBy || '-'}</p></div><div><p className="text-[11px] font-semibold uppercase text-charcoal/50">Reference</p><p className="mt-1">{query.reference || '-'}</p></div></div>
            {query.notes && <p className="mt-3 border-t border-cardline pt-3 text-sm"><span className="font-semibold">Internal notes:</span> {query.notes}</p>}
            {query.solution && <div className="mt-3 rounded-lg bg-sage/8 p-3 text-sm"><p className="font-semibold text-sage">Solution given to patient</p><p className="mt-1 whitespace-pre-line">{query.solution}</p>{query.solutionReference && <p className="mt-2"><span className="font-semibold">Solution reference:</span> {query.solutionReference}</p>}<p className="mt-2 text-xs text-charcoal/50">Solved by {query.solutionGivenByName || '-'} on {formatDate(query.solutionGivenAt)}</p></div>}
            {isReceptionist && query.status !== 'resolved' && <div className="mt-3 border-t border-cardline pt-3"><p className="mb-2 text-xs font-semibold uppercase text-charcoal/50">Resolution details</p><div className="grid gap-2 sm:grid-cols-2"><input value={resolvingId === query.id ? resolutionSentTo : ''} onChange={(event) => { setResolvingId(query.id); setResolutionSentTo(event.target.value); }} placeholder="Sent to department / person" className="rounded-lg border border-cardline bg-offwhite-200 px-3 py-2.5 text-sm outline-none focus:border-sage" /><input value={resolvingId === query.id ? solutionReference : ''} onChange={(event) => { setResolvingId(query.id); setSolutionReference(event.target.value); }} placeholder="Reference / source" className="rounded-lg border border-cardline bg-offwhite-200 px-3 py-2.5 text-sm outline-none focus:border-sage" /></div><textarea value={resolvingId === query.id ? solution : ''} onChange={(event) => { setResolvingId(query.id); setSolution(event.target.value); }} rows={2} placeholder="Write the solution given to the patient..." className="mt-2 w-full rounded-lg border border-cardline bg-offwhite-200 px-3 py-2.5 text-sm outline-none focus:border-sage" /><div className="mt-2 flex justify-end"><Button size="sm" disabled={!solution.trim() || (resolvingId !== null && resolvingId !== query.id)} onClick={() => resolveTicket(query.id)}><CheckCircle2 size={15} /> Mark Resolved</Button></div></div>}
            <div className="mt-3 border-t border-cardline pt-3"><p className="text-[11px] font-semibold uppercase text-charcoal/50">History</p><div className="mt-2 space-y-1.5">{query.history.map((item) => <p key={item.id} className="text-xs text-charcoal/60">{formatDate(item.createdAt)} · <span className="font-semibold">{item.action}</span> by {item.actorName}{item.note ? `: ${item.note}` : ''}</p>)}</div></div>
          </div>)}</div>
        </Card>
      </div>
    </div>
  );
};

export default PatientQueries;
