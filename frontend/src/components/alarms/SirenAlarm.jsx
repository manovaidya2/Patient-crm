import { useCallback, useEffect, useRef, useState } from 'react';
import { AlarmClock, BellOff, Volume2 } from 'lucide-react';
import api from '../../api/axios.js';
import useLiveEvent from '../../api/useLiveEvent.js';
import Button from '../ui/Button.jsx';

// A loud alarm popup: it rings an emergency siren while `url` returns alarms, on every login, page open / refresh and
// (with `liveEvent`) the moment someone rings it. "Snooze" silences it for 20 minutes; a new ring (live event) wakes it.
// Used for the doctor's pending formulations, for In Transit when the Medicine Department rings, and for a Team Chat
// ring. renderItem(alarm, snooze, recheck): recheck reloads the list (after an alarm is answered).
const SNOOZE_MS = 20 * 60 * 1000;
const POLL_MS = 5 * 60 * 1000;
const readSnooze = (key) => { try { return Number(localStorage.getItem(key) || 0); } catch { return 0; } };
const writeSnooze = (key, until) => { try { if (until) localStorage.setItem(key, String(until)); else localStorage.removeItem(key); } catch { /* private window */ } };
// Logout clears every snooze, so the next login rings again.
export const SNOOZE_PREFIX = 'alarmSnooze:';

// Emergency siren made in the browser (no sound file): a square wave wailing 650 -> 1450 Hz, full volume.
function startSiren() {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return null;
  const ctx = new Ctx();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  const comp = ctx.createDynamicsCompressor();
  osc.type = 'square';
  gain.gain.value = 1;
  osc.connect(gain); gain.connect(comp); comp.connect(ctx.destination);
  const sweep = () => {
    const t = ctx.currentTime;
    osc.frequency.cancelScheduledValues(t);
    for (let i = 0; i < 50; i += 1) {
      osc.frequency.setValueAtTime(650, t + i * 1.2);
      osc.frequency.linearRampToValueAtTime(1450, t + i * 1.2 + 0.6);
      osc.frequency.linearRampToValueAtTime(650, t + i * 1.2 + 1.2);
    }
  };
  sweep();
  osc.start();
  const timer = setInterval(sweep, 55000);
  return { ctx, stop: () => { clearInterval(timer); try { osc.stop(); } catch { /* stopped */ } ctx.close().catch(() => {}); } };
}

export default function SirenAlarm({ user, name, url, title, intro, renderItem, liveEvent = '' }) {
  const [alarms, setAlarms] = useState([]);
  const [ringing, setRinging] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const siren = useRef(null);
  const snoozeTimer = useRef(null);
  const key = `${SNOOZE_PREFIX}${name}:${user?._id || user?.id || ''}`;

  const stopSound = () => { siren.current?.stop(); siren.current = null; };
  const playSound = useCallback(() => {
    if (siren.current) return;
    const s = startSiren();
    if (!s) return;
    siren.current = s;
    // Browsers keep sound off until the page is touched once: then it starts by itself.
    if (s.ctx.state === 'suspended') {
      setBlocked(true);
      const unlock = () => { s.ctx.resume().then(() => setBlocked(false)).catch(() => {}); ['pointerdown', 'keydown'].forEach((e) => document.removeEventListener(e, unlock)); };
      ['pointerdown', 'keydown'].forEach((e) => document.addEventListener(e, unlock));
      s.ctx.resume().then(() => setBlocked(s.ctx.state !== 'running')).catch(() => {});
    }
  }, []);

  const check = useCallback(async () => {
    if (readSnooze(key) > Date.now()) return;
    try {
      const { data } = await api.get(url, { skipCache: true });
      const list = data.alarms || [];
      setAlarms(list);
      if (list.length) { setRinging(true); playSound(); } else { setRinging(false); stopSound(); }
    } catch { /* the alarm is extra: never block the page */ }
  }, [key, url, playSound]);

  useEffect(() => {
    check();
    const poll = setInterval(check, POLL_MS);
    return () => { clearInterval(poll); clearTimeout(snoozeTimer.current); stopSound(); };
  }, [check]);
  // A fresh ring wakes a snoozed alarm.
  useLiveEvent(liveEvent || '__none__', () => { writeSnooze(key, 0); check(); });

  const snooze = () => {
    writeSnooze(key, Date.now() + SNOOZE_MS);
    stopSound(); setRinging(false); setBlocked(false);
    clearTimeout(snoozeTimer.current);
    snoozeTimer.current = setTimeout(check, SNOOZE_MS + 1000);
  };

  if (!ringing || !alarms.length) return null;
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/55 p-4" role="alertdialog" aria-modal="true" aria-labelledby={`${name}-alarm-title`}>
      <div className="w-full max-w-lg rounded-2xl border-4 border-[#DC2626] bg-white p-5 shadow-2xl">
        <div className="flex items-center gap-3">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#DC2626] text-white"><AlarmClock size={26} /></span>
          <div>
            <h2 id={`${name}-alarm-title`} className="text-lg font-extrabold text-[#991B1B]">{title}</h2>
            <p className="text-sm text-charcoal/70">{intro(alarms)}</p>
          </div>
        </div>
        {blocked && <p className="mt-3 flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900"><Volume2 size={16} />Click anywhere to start the alarm sound (the browser keeps sound off until the page is touched).</p>}
        <ul className="mt-3 max-h-64 space-y-1.5 overflow-y-auto">
          {alarms.map((a) => <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[#FCA5A5] bg-[#FEF2F2] px-3 py-2 text-sm">{renderItem(a, snooze, check)}</li>)}
        </ul>
        <div className="mt-4 flex justify-end"><Button variant="outline" onClick={snooze}><BellOff size={15} />Snooze 20 min</Button></div>
      </div>
    </div>
  );
}
