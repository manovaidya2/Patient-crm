import { useEffect, useRef, useState } from 'react';
import { Bell, CalendarClock, Clock, ExternalLink, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import api from '../api/axios.js';
import { useAuth } from '../context/AuthContext.jsx';
import { ROLES } from '../constants/roles.js';

const ACTIVE_ROLES = [ROLES.MANAGER, ROLES.ASSISTANT_DOCTOR, ROLES.PSYCHOLOGIST];

const formatDateTime = (iso) =>
  new Date(iso).toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });

const ReminderDropdown = ({ className = '' }) => {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [reminders, setReminders] = useState([]);
  const wrapperRef = useRef(null);
  const active = ACTIVE_ROLES.includes(user?.role);

  useEffect(() => {
    if (!active) return undefined;

    let cancelled = false;
    const fetchReminders = async () => {
      try {
        const { data } = await api.get('/schedule/reminders', { params: { window: '24h' } });
        if (!cancelled) setReminders(data.reminders || []);
      } catch {
        if (!cancelled) setReminders([]);
      }
    };

    fetchReminders();
    const intervalId = window.setInterval(fetchReminders, 15000);
    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [active]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (!wrapperRef.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (!active) return null;

  const lateCount = reminders.filter((item) => item.reminderKind === 'late').length;
  const count = reminders.length;

  return (
    <div ref={wrapperRef} className={`relative z-40 inline-flex ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className={`relative inline-flex h-11 w-11 items-center justify-center rounded-2xl border shadow-sm transition ${
          lateCount > 0
            ? 'border-[#B42318]/40 bg-[#B42318] text-white'
            : 'border-cardline bg-offwhite-100 text-sage hover:bg-sage-muted/20'
        }`}
        title="24 hour reminders"
        aria-label="Open 24 hour reminders"
      >
        <Bell size={18} />
        {count > 0 && (
          <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-[#D9B66F] px-1.5 py-0.5 text-[10px] font-bold text-teal-950">
            {count > 99 ? '99+' : count}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-3 w-[calc(100vw-2rem)] max-w-md overflow-hidden rounded-3xl border border-cardline bg-offwhite-100 shadow-card sm:w-[28rem]">
          <div className="flex items-center justify-between gap-3 border-b border-cardline px-4 py-3">
            <div>
              <p className="text-sm font-bold text-charcoal">24 hour reminders</p>
              <p className="text-xs text-charcoal/50">{lateCount} late, {Math.max(count - lateCount, 0)} upcoming</p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="inline-flex h-8 w-8 items-center justify-center rounded-xl text-charcoal/45 hover:bg-sage-muted/20 hover:text-charcoal"
              aria-label="Close reminders"
              title="Close"
            >
              <X size={16} />
            </button>
          </div>

          <div className="max-h-[420px] overflow-y-auto p-2">
            {reminders.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-charcoal/50">No reminders in the next 24 hours.</div>
            ) : (
              reminders.map((item) => (
                <Link
                  key={item.id}
                  to={`/admin/patients/${item.patientId}`}
                  onClick={() => setOpen(false)}
                  className="mb-2 block rounded-2xl border border-cardline bg-offwhite-200/70 px-3.5 py-3 text-charcoal transition hover:border-sage/35 hover:bg-sage-muted/15"
                >
                  <div className="flex items-start gap-3">
                    <span className={`mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${
                      item.reminderKind === 'late' ? 'bg-[#B42318]/10 text-[#B42318]' : 'bg-sage-muted/25 text-sage'
                    }`}>
                      {item.reminderKind === 'late' ? <Clock size={16} /> : <CalendarClock size={16} />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-bold">{item.typeLabel} - {item.patientName}</p>
                        <ExternalLink size={13} className="mt-0.5 shrink-0 text-charcoal/35" />
                      </div>
                      <p className="mt-1 text-xs text-charcoal/55">
                        {item.stageLabel} | {formatDateTime(item.dateTime)}
                      </p>
                      <p className="mt-1 text-xs text-charcoal/55">Assigned to {item.assignee}</p>
                    </div>
                  </div>
                </Link>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default ReminderDropdown;
