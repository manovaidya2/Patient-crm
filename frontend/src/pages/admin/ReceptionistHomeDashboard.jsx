import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarClock, CheckCircle2, Clock3, RotateCcw } from 'lucide-react';
import { Link } from 'react-router-dom';
import api from '../../api/axios.js';
import Button from '../../components/ui/Button.jsx';
import ReceptionistChecklist from './ReceptionistChecklist.jsx';

const today = () => {
  const date = new Date();
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};

const sameDay = (value, date) => value && new Date(value).toLocaleDateString('en-CA') === date;

const ReceptionistHomeDashboard = () => {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const date = useMemo(today, []);

  const load = useCallback(async () => {
    try {
      setError('');
      const { data } = await api.get('/sales-sheet/appointments', { params: { date }, skipCache: true });
      setRows(data.appointments || []);
    } catch (err) {
      setError(err.response?.data?.message || 'Today\'s appointment summary could not be loaded');
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => { load(); }, [load]);

  const stats = useMemo(() => ({
    total: rows.filter((row) => row.status !== 'rescheduled').length,
    pending: rows.filter((row) => row.status !== 'rescheduled' && !row.acceptedAt).length,
    accepted: rows.filter((row) => row.status !== 'rescheduled' && row.acceptedAt).length,
    rescheduled: rows.filter((row) => sameDay(row.rescheduledAt, date)).length,
  }), [rows, date]);

  const cards = [
    { label: 'Pending acceptance', value: stats.pending, icon: Clock3, tone: 'text-[#9A5B16]', detail: 'Sales appointments waiting for receptionist action' },
    { label: 'Accepted today', value: stats.accepted, icon: CheckCircle2, tone: 'text-sage', detail: 'Appointments accepted from the sales sheet' },
    { label: 'Rescheduled today', value: stats.rescheduled, icon: RotateCcw, tone: 'text-[#8C3B2E]', detail: 'Appointments moved to another date today' },
    { label: 'Today total', value: stats.total, icon: CalendarClock, tone: 'text-charcoal', detail: 'Appointments scheduled for today' },
  ];

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4 border-b border-cardline pb-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-charcoal/50">Receptionist Dashboard</p>
          <h1 className="mt-1 font-display text-2xl font-bold text-charcoal">Today&apos;s Appointment Desk</h1>
          <p className="mt-2 text-sm text-charcoal/55">{new Date(`${date}T12:00:00`).toLocaleDateString('en-IN', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}</p>
        </div>
        <Link to="/admin/appointment-management"><Button><CalendarClock size={16} /> Open appointment management</Button></Link>
      </div>
      {error && <div className="mb-4 border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map(({ label, value, icon: Icon, tone, detail }) => <div key={label} className="rounded-xl border border-cardline bg-offwhite-100 p-4 shadow-sm"><div className="flex items-center justify-between gap-2"><p className="text-xs font-semibold text-charcoal/60">{label}</p><Icon size={18} className={tone} /></div><p className={`mt-3 font-display text-3xl font-bold ${tone}`}>{loading ? '...' : value}</p><p className="mt-1 text-[11px] leading-4 text-charcoal/50">{detail}</p></div>)}
      </div>
      <ReceptionistChecklist compact />
      <div className="mt-5 rounded-xl border border-cardline bg-offwhite-100 p-5 shadow-sm"><p className="text-sm font-semibold text-charcoal">Reception workflow</p><p className="mt-1 text-sm text-charcoal/55">Review pending sales appointments, accept the required ones, and manage accepted appointments from the Appointment Management page.</p><div className="mt-3 flex flex-wrap gap-2"><Link to="/sales"><Button variant="outline">View sales sheet</Button></Link><Link to="/admin/appointment-management"><Button variant="outline">View appointment management</Button></Link></div></div>
    </div>
  );
};

export default ReceptionistHomeDashboard;
