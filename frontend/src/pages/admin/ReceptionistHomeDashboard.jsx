import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarClock, ChevronLeft, ChevronRight, Phone, RefreshCw } from 'lucide-react';
import { Link } from 'react-router-dom';
import api from '../../api/axios.js';
import Button from '../../components/ui/Button.jsx';
import Badge from '../../components/ui/Badge.jsx';
import { PageHeader, Section, StatRow, StatTile } from '../../components/ui/Layout.jsx';
import ReceptionistChecklist from './ReceptionistChecklist.jsx';

const today = () => {
  const date = new Date();
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};
const shiftDate = (value, days) => { const d = new Date(`${value}T12:00:00`); d.setDate(d.getDate() + days); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
const sameDay = (value, date) => value && new Date(value).toLocaleDateString('en-CA') === date;
const money = (n) => `Rs ${Number(n || 0).toLocaleString('en-IN')}`;
const clock = (t) => { if (!t) return ''; const [h, m] = String(t).split(':').map(Number); if (Number.isNaN(h)) return t; return `${((h + 11) % 12) + 1}:${String(m || 0).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`; };

// How each card is labelled in its lane.
const STATE = {
  pending_acceptance: ['Pending acceptance', 'action'],
  accepted: ['Accepted · expected', 'teal'],
  arriving: ['Arriving', 'amber'],
  arrived: ['Arrived · fill registration', 'orange'],
  registration_saved: ['Registration saved', 'green'],
  post_counselling: ['Sent to post counselling', 'purple'],
  not_coming: ['Not coming', 'inactive'],
  rescheduled: ['Rescheduled', 'amber'],
};
const LANES = [
  ['toAccept', 'To accept', 'From the sales sheet, not accepted yet'],
  ['expected', 'Expected', 'Accepted, not arrived yet'],
  ['inClinic', 'In clinic', 'Arrived · registration and doctor'],
  ['done', 'Done today', 'Sent on, not coming or rescheduled'],
];

// Reception home: today's appointments as lanes (from the sales sheet and appointment management), the day's numbers,
// and the reception checklist.
const ReceptionistHomeDashboard = () => {
  const [date, setDate] = useState(today);
  const [rows, setRows] = useState([]);
  const [desk, setDesk] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      setError('');
      const [{ data }, { data: deskData }] = await Promise.all([
        api.get('/sales-sheet/appointments', { params: { date }, skipCache: true }),
        api.get('/reception/desk', { params: { date }, skipCache: true }),
      ]);
      setRows(data.appointments || []);
      setDesk(deskData);
    } catch (err) {
      setError(err.response?.data?.message || 'Today\'s appointment summary could not be loaded');
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => { setLoading(true); load(); const t = setInterval(load, 60000); return () => clearInterval(t); }, [load]);

  const stats = useMemo(() => ({
    total: rows.filter((row) => row.status !== 'rescheduled').length,
    pending: rows.filter((row) => row.status !== 'rescheduled' && !row.acceptedAt).length,
    accepted: rows.filter((row) => row.status !== 'rescheduled' && row.acceptedAt).length,
    rescheduled: rows.filter((row) => sameDay(row.rescheduledAt, date)).length,
  }), [rows, date]);
  const totals = desk?.totals || {};
  const isToday = date === today();
  const v = (n) => (loading ? '...' : n);

  return (
    <div className="space-y-4">
      <PageHeader
        icon={CalendarClock}
        eyebrow={`Receptionist Dashboard · ${new Date(`${date}T12:00:00`).toLocaleDateString('en-IN', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}`}
        title={isToday ? "Today's desk" : 'Appointment desk'}
        subtitle="Accept sales appointments, mark arrivals, register and send to post counselling."
        actions={<>
          <div className="inline-flex items-center gap-1">
            <Button size="sm" variant="outline" aria-label="Previous day" onClick={() => setDate((d) => shiftDate(d, -1))}><ChevronLeft size={15} /></Button>
            <Button size="sm" variant="outline" onClick={() => setDate(today())}>Today</Button>
            <Button size="sm" variant="outline" aria-label="Next day" onClick={() => setDate((d) => shiftDate(d, 1))}><ChevronRight size={15} /></Button>
          </div>
          <Button size="sm" variant="outline" onClick={load} aria-label="Refresh"><RefreshCw size={14} /></Button>
          <Link to="/sales"><Button size="sm" variant="outline">View sales sheet</Button></Link>
          <Link to="/admin/appointment-management"><Button size="sm"><CalendarClock size={15} /> Open appointment management</Button></Link>
        </>}
      />
      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      <StatRow min={150}>
        <StatTile label="Pending acceptance" value={v(stats.pending)} hint="Sales appointments waiting for you" tone={stats.pending ? 'orange' : 'plain'} />
        <StatTile label="Accepted today" value={v(stats.accepted)} hint="Accepted from the sales sheet" />
        <StatTile label="In clinic" value={v(totals.inClinic ?? 0)} hint={`${totals.sentToPostCounselling || 0} sent to post counselling`} />
        <StatTile label="Rescheduled today" value={v(stats.rescheduled)} hint={`${totals.notComing || 0} not coming`} />
        <StatTile label="Today total" value={v(stats.total)} hint="Appointments scheduled" />
        <StatTile label="Collected" value={v(money(totals.collected))} hint={totals.toVerify ? `${totals.toVerify} receipt(s) to verify` : 'Consultation receipts'} tone={totals.toVerify ? 'orange' : 'plain'} />
      </StatRow>

      <div className="grid items-start gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
        {LANES.map(([key, title, hint]) => {
          const list = desk?.lanes?.[key] || [];
          const hot = (key === 'toAccept' || key === 'inClinic') && list.length > 0;
          return (
            <section key={key} aria-label={title} className="flex min-w-0 flex-col gap-2">
              <div className="flex items-center justify-between px-1">
                <div><h2 className="font-display text-[13px] font-bold text-charcoal">{title}</h2><p className="text-[11px] text-charcoal/50">{hint}</p></div>
                <Badge tone={hot ? 'orange' : 'default'}>{list.length}</Badge>
              </div>
              {list.length === 0 && <p className="rounded-xl border border-dashed border-cardline px-3 py-4 text-center text-xs text-charcoal/45">{loading ? 'Loading...' : 'Nobody here'}</p>}
              {list.map((c) => {
                const [label, tone] = STATE[c.state] || [c.state, 'default'];
                const mine = ['pending_acceptance', 'arrived'].includes(c.state);
                return (
                  <article key={c.id} className={`rounded-xl border p-3 ${mine ? 'border-2 border-[#FDBA74] bg-[#FFF7ED]' : key === 'done' ? 'border-[#E8DFCB] bg-[#FBF7ED]' : 'border-[#E8DFCB] bg-white'}`}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-display text-[12px] font-extrabold text-charcoal/60">{c.arrivalTime ? `Arrived ${clock(c.arrivalTime)}` : clock(c.time) || 'No time'}</span>
                      <Badge tone={tone}>{label}</Badge>
                    </div>
                    <p className="mt-1 text-[13px] font-bold text-charcoal">{c.name}{c.age ? <span className="font-normal text-charcoal/60"> · {c.age}</span> : ''}</p>
                    <p className="text-[11.5px] text-charcoal/60">{[c.guardian, c.city, c.category].filter(Boolean).join(' · ')}</p>
                    <p className="text-[11px] text-charcoal/45">{[c.code, c.patientId && `ID ${c.patientId}`, c.bookedBy && `by ${c.bookedBy}`, c.acceptedBy && `accepted by ${c.acceptedBy}`, c.note].filter(Boolean).join(' · ')}</p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <Link to={c.href} className={`inline-flex items-center rounded-lg px-2.5 py-1.5 text-xs font-bold ${mine ? 'bg-[#F97316] text-white' : 'border border-cardline bg-white text-charcoal'}`}>{c.state === 'pending_acceptance' ? 'Review & accept' : c.state === 'arrived' ? 'Open registration' : 'Open'}</Link>
                      {c.phone && <a href={`tel:${c.phone}`} className="inline-flex items-center gap-1 rounded-lg border border-cardline bg-white px-2.5 py-1.5 text-xs font-bold text-charcoal"><Phone size={12} />Call</a>}
                    </div>
                  </article>
                );
              })}
            </section>
          );
        })}
      </div>

      <ReceptionistChecklist compact />
      <Section title="Reception workflow">
        <p className="text-sm text-charcoal/60">Review pending sales appointments, accept the required ones, and manage accepted appointments from the Appointment Management page.</p>
        <div className="mt-3 flex flex-wrap gap-2"><Link to="/sales"><Button variant="outline">View sales sheet</Button></Link><Link to="/admin/appointment-management"><Button variant="outline">View appointment management</Button></Link></div>
      </Section>
    </div>
  );
};

export default ReceptionistHomeDashboard;
