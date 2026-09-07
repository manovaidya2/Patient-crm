import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import api from '../api/axios.js';
import { useAuth } from '../context/AuthContext.jsx';
import { ROLES } from '../constants/roles.js';

const formatDateTime = (iso) =>
  new Date(iso).toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

const ScheduleReminderAlert = () => {
  const { user } = useAuth();
  const [reminders, setReminders] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchReminders = async () => {
      setLoading(true);
      try {
        const { data } = await api.get('/schedule/reminders');
        setReminders(data.reminders || []);
      } catch {
        setReminders([]);
      } finally {
        setLoading(false);
      }
    };

    fetchReminders();
    const intervalId = window.setInterval(fetchReminders, 15000);
    return () => window.clearInterval(intervalId);
  }, []);

  if (!reminders.length) return null;

  const first = reminders[0];
  const isManager = user?.role === ROLES.MANAGER;

  return (
    <div className="mb-5 rounded-lg border border-[#B42318] bg-[#B42318]/10 p-3.5 text-[#B42318]">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex min-w-0 items-start gap-2.5">
          <AlertTriangle size={19} className="mt-0.5 shrink-0 animate-pulse" />
          <div className="min-w-0">
            <p className="text-sm font-bold">
              {isManager ? 'Total late schedule reminders' : 'Late schedule reminder'}: {reminders.length} item{reminders.length > 1 ? 's' : ''} pending
            </p>
            <p className="mt-1 text-xs text-[#7A1B13]">
              {first.typeLabel} for {first.patientName} was scheduled at {formatDateTime(first.dateTime)}
              {isManager && first.assignee ? ` | Assigned to ${first.assignee}` : ''}.
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {loading && <RefreshCw size={14} className="animate-spin opacity-70" />}
          <Link
            to={`/admin/patients/${first.patientId}`}
            className="rounded-lg bg-[#B42318] px-3 py-2 text-xs font-bold text-white hover:bg-[#971B12]"
          >
            Open Patient
          </Link>
        </div>
      </div>
    </div>
  );
};

export default ScheduleReminderAlert;
