import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../api/axios.js';
import useLiveEvent from '../../api/useLiveEvent.js';
import Toast from '../ui/Toast.jsx';

// Care Schedule reminders for the PCC a session is given to, on every page: the call time's own reminder (from 10
// minutes before the call, made when the call time is set) and their own reminders. Each pops up until a call is
// recorded, it is marked done or the session is closed; "Remind later" hides it for 5 minutes. A short bell rings when
// a new one comes.
const POLL_MS = 30 * 1000;
const MUTE_MS = 5 * 60 * 1000;
const MAX_CARDS = 3;
const MUTE_KEY = 'careReminderMute';

const readMutes = () => { try { return new Map(Object.entries(JSON.parse(localStorage.getItem(MUTE_KEY) || '{}'))); } catch { return new Map(); } };
const writeMutes = (mutes) => { try { localStorage.setItem(MUTE_KEY, JSON.stringify(Object.fromEntries(mutes))); } catch { /* private window */ } };
const timeOf = (iso) => new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
// "in 8 min (11:00 am)" / "now (11:00 am)" / "11:00 am — 5 min late"
const callWhen = (iso) => {
  const min = Math.round((new Date(iso).getTime() - Date.now()) / 60000);
  if (min > 0) return `in ${min} min (${timeOf(iso)})`;
  if (min === 0) return `now (${timeOf(iso)})`;
  return `${timeOf(iso)} — ${-min} min late`;
};

// Two soft bell strikes, made in the browser (no sound file). Browsers keep sound off until the page was touched once.
let audio = null;
const ding = () => {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    if (!audio) audio = new Ctx();
    if (audio.state === 'suspended') audio.resume().catch(() => {});
    const t = audio.currentTime + 0.05;
    [0, 0.3].forEach((offset) => {
      const osc = audio.createOscillator(); const gain = audio.createGain();
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.0001, t + offset);
      gain.gain.exponentialRampToValueAtTime(0.25, t + offset + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + offset + 0.25);
      osc.connect(gain); gain.connect(audio.destination);
      osc.start(t + offset); osc.stop(t + offset + 0.27);
    });
  } catch { /* sound is extra */ }
};

export default function CareCallReminders() {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [, setTick] = useState(0);
  const mutes = useRef(readMutes());
  const seen = useRef(new Set());
  const last = useRef(0);

  const load = useCallback(async () => {
    if (Date.now() - last.current < 3000) return;
    last.current = Date.now();
    try {
      const { data } = await api.get('/care/reminders', { skipCache: true });
      const list = data.reminders || [];
      const now = Date.now();
      mutes.current.forEach((until, id) => { if (until <= now || !list.some((r) => r.id === id)) mutes.current.delete(id); });
      writeMutes(mutes.current);
      if (list.some((r) => !seen.current.has(r.id) && !mutes.current.has(r.id))) ding();
      list.forEach((r) => seen.current.add(r.id));
      setItems(list);
    } catch { /* reminders are extra: never block the page */ }
  }, []);

  useEffect(() => {
    load();
    const poll = window.setInterval(load, POLL_MS);
    // Re-draw every 30 s so "in 8 min" stays right and a "Remind later" that ran out shows the card again.
    const clock = window.setInterval(() => setTick((n) => n + 1), POLL_MS);
    return () => { window.clearInterval(poll); window.clearInterval(clock); };
  }, [load]);
  // A session changed (a call recorded, a reminder done, a new call time): look again at once.
  useLiveEvent('care:changed', () => { last.current = 0; load(); });

  const now = Date.now();
  const open = items.filter((r) => !(mutes.current.get(r.id) > now));
  const toasts = open.slice(0, MAX_CARDS).map((r) => ({
    id: r.id,
    type: 'confirm',
    persist: true,
    title: r.kind === 'call' ? `Call ${callWhen(r.callAt || r.at)} — ${r.code}` : `Reminder — ${r.code}`,
    message: r.kind === 'call'
      ? `${r.patientName}${r.patientCode ? ` (${r.patientCode})` : ''} · Phase ${r.phase} · ${r.title}. Parent को call करना है — call के बाद Call details में record करें।`
      : `${r.patientName}${r.patientCode ? ` (${r.patientCode})` : ''} · ${r.title}: ${r.note}`,
    actionLabel: 'Open',
    cancelLabel: 'Remind later',
    onAction: () => navigate(`/admin/care-schedule/session/${r.sessionId}`),
  }));
  if (open.length > MAX_CARDS) {
    toasts.push({
      id: '__more__', type: 'confirm', persist: true, title: 'More reminders',
      message: `${open.length - MAX_CARDS} more Care Schedule reminder${open.length - MAX_CARDS > 1 ? 's' : ''} due.`,
      actionLabel: 'View all', cancelLabel: 'Remind all later',
      onAction: () => navigate('/admin/care-schedule'),
    });
  }

  const dismiss = (id) => {
    const until = Date.now() + MUTE_MS;
    (id === '__more__' ? open.slice(MAX_CARDS) : [{ id }]).forEach((r) => mutes.current.set(r.id, until));
    writeMutes(mutes.current);
    setTick((n) => n + 1);
  };

  return <Toast toasts={toasts} onDismiss={dismiss} />;
}
