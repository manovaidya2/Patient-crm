import { useCallback, useEffect, useRef } from 'react';
import api from '../../api/axios.js';
import useLiveEvent from '../../api/useLiveEvent.js';
import { RING_EVENT, UNRING_EVENT } from '../ReminderBell.jsx';

// Care Schedule reminders for the PCC a session is given to: the call time's own reminder (from 10 minutes before the
// call, made when the call time is set) and their own reminders. They go on the reminder bell's stack at the top right
// (one card at a time, "1 of N", Next / Open / Remove all / See all — the same stack as every other reminder), not as
// pop-ups one under another. A card comes when its reminder is due (with a short bell), again every 30 minutes while
// it is still due, and leaves by itself once a call is recorded, the reminder is marked done or the session is closed.
// A session has one card (the same key as its line in My Day, so the two never show twice).
const POLL_MS = 30 * 1000;
const REPEAT_MS = 30 * 60 * 1000;

const timeOf = (iso) => new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
const keyOf = (r) => `/admin/care-schedule|${r.sessionId}`;
// What to do now, in a few words: "call in 8 min (11:00 am)" / "call time 11:00 am reached" / "call time 11:00 am passed".
const callText = (iso) => {
  const min = Math.round((new Date(iso).getTime() - Date.now()) / 60000);
  if (min > 0) return `Call in ${min} min (${timeOf(iso)})`;
  if (min > -15) return `Call time ${timeOf(iso)} reached`;
  return `Call time ${timeOf(iso)} passed`;
};
const cardOf = (r) => ({
  key: keyOf(r),
  keep: true,
  page: '/admin/care-schedule',
  href: `/admin/care-schedule/session/${r.sessionId}`,
  due: r.kind === 'call' ? r.callAt || r.at : r.at,
  title: `${r.patientName}${r.patientCode ? ` (${r.patientCode})` : ''}`,
  detail: r.kind === 'call'
    ? `${r.code} · Phase ${r.phase} · ${callText(r.callAt || r.at)} — call the parent, then record it in Call details`
    : `${r.code} · Phase ${r.phase} · Reminder: ${r.note || r.title}`,
});

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
  // When each session's card was last put on the stack (the session id -> time).
  const rung = useRef(new Map());
  const last = useRef(0);

  const load = useCallback(async () => {
    if (Date.now() - last.current < 3000) return;
    last.current = Date.now();
    try {
      const { data } = await api.get('/care/reminders', { skipCache: true });
      const list = data.reminders || [];
      const now = Date.now();
      // One card per session: its call reminder first, else its own reminder.
      const bySession = new Map();
      list.forEach((r) => { const had = bySession.get(r.sessionId); if (!had || (had.kind !== 'call' && r.kind === 'call')) bySession.set(r.sessionId, r); });
      // Done / no longer due: off the stack.
      const gone = [...rung.current.keys()].filter((id) => !bySession.has(id));
      if (gone.length) {
        gone.forEach((id) => rung.current.delete(id));
        window.dispatchEvent(new CustomEvent(UNRING_EVENT, { detail: gone.map((id) => keyOf({ sessionId: id })) }));
      }
      // New, or still due 30 minutes after it was last shown: on the stack again, with the bell.
      const ring = [...bySession.values()].filter((r) => !rung.current.has(r.sessionId) || now - rung.current.get(r.sessionId) >= REPEAT_MS);
      if (ring.length) {
        ring.forEach((r) => rung.current.set(r.sessionId, now));
        window.dispatchEvent(new CustomEvent(RING_EVENT, { detail: ring.map(cardOf) }));
        ding();
      }
    } catch { /* reminders are extra: never block the page */ }
  }, []);

  useEffect(() => {
    load();
    const poll = window.setInterval(load, POLL_MS);
    return () => window.clearInterval(poll);
  }, [load]);
  // A session changed (a call recorded, a reminder done, a new call time): look again at once.
  useLiveEvent('care:changed', () => { last.current = 0; load(); });

  return null;
}
