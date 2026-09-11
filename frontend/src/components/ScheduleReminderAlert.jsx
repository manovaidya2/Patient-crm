import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/axios.js';
import { useAuth } from '../context/AuthContext.jsx';
import { ROLES } from '../constants/roles.js';
import Toast from './ui/Toast.jsx';

const REMINDER_ROLES = [ROLES.MANAGER, ROLES.ASSISTANT_DOCTOR, ROLES.PSYCHOLOGIST, ROLES.POST_COUNSELOR];
const POLL_MS = 15000;
const MUTE_MS = 5 * 60 * 1000;
const MAX_TOASTS = 3;

const formatDateTime = (iso) =>
  new Date(iso).toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });

const formatDateOnly = (iso) => {
  const [year, month, day] = String(iso || '').slice(0, 10).split('-').map(Number);
  if (!year || !month || !day) return '';
  return new Date(year, month - 1, day).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
  });
};

const ScheduleReminderAlert = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [toasts, setToasts] = useState([]);
  const mutedRef = useRef(new Map());
  const active = REMINDER_ROLES.includes(user?.role);

  useEffect(() => {
    if (!active) {
      setToasts([]);
      return undefined;
    }

    let cancelled = false;
    const getListPath = (item) => {
      if (item?.type === 'medicine_connect' || user?.role === ROLES.POST_COUNSELOR) return '/admin/patients';
      return user?.role === ROLES.PSYCHOLOGIST ? '/admin/family-sessions' : '/admin/followups';
    };

    const syncToasts = (reminders) => {
      const now = Date.now();
      const liveIds = new Set(reminders.map((item) => String(item.id)));
      mutedRef.current.forEach((until, id) => {
        if (until <= now || !liveIds.has(id)) mutedRef.current.delete(id);
      });

      const pending = reminders.filter((item) => !mutedRef.current.has(String(item.id)));
      const shown = pending.slice(0, MAX_TOASTS);

      const next = shown.map((item) => ({
        id: String(item.id),
        type: 'confirm',
        persist: true,
        title: item.type === 'medicine_connect' ? 'Medicine connect due' : `${item.typeLabel} pending`,
        message: item.type === 'medicine_connect'
          ? `${item.patientName} (${item.stageLabel}) needs medicine connect on ${formatDateOnly(item.dateTime)}.${
              user?.role === ROLES.MANAGER ? ` Assigned to ${item.assignee}.` : ''
            }${item.notes ? ` Issue: ${item.notes}` : ''}`
          : `${item.patientName} (${item.stageLabel}) was scheduled for ${formatDateTime(item.dateTime)}.${
              user?.role === ROLES.MANAGER ? ` Assigned to ${item.assignee}.` : ''
            }`,
        actionLabel: 'Open Patient',
        cancelLabel: 'Remind later',
        onAction: () => navigate(`/admin/patients/${item.patientId}`),
      }));

      const extra = pending.length - shown.length;
      if (extra > 0) {
        next.push({
          id: '__more__',
          type: 'confirm',
          persist: true,
          title: 'More reminders pending',
          message: `${extra} more reminder${extra > 1 ? 's are' : ' is'} pending.`,
          actionLabel: 'View all',
          onAction: () => navigate(getListPath(shown[0])),
        });
      }

      setToasts(next);
    };

    const fetchReminders = async () => {
      try {
        const { data } = await api.get('/schedule/reminders');
        if (!cancelled) syncToasts(data.reminders || []);
      } catch {
        if (!cancelled) setToasts([]);
      }
    };

    fetchReminders();
    const intervalId = window.setInterval(fetchReminders, POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [active, user?.role, navigate]);

  const handleDismiss = (id) => {
    if (id !== '__more__') {
      mutedRef.current.set(String(id), Date.now() + MUTE_MS);
    }
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  };

  if (!active) return null;

  return <Toast toasts={toasts} onDismiss={handleDismiss} />;
};

export default ScheduleReminderAlert;
