// A short two-tone "ding" for reminders (not the emergency siren): made in the browser, no sound file. playChime(n)
// rings n dings one after another (one per reminder, at most 10). Browsers keep sound off until the page is touched
// once; then the waiting dings play. Two calls within a few seconds play once. `onPlay` runs when the dings really
// play (at once, or after that first touch), so what goes with the sound shows at the same moment.
let ctx = null;
let lastAt = 0;
let waiting = false;

const MAX_DINGS = 10;
const GAP = 0.75; // seconds between two dings
let pendingTimes = 1;
let pendingPlay = null;
const ding = (start = 0) => {
  const t = ctx.currentTime + start;
  [[880, 0], [1320, 0.18]].forEach(([freq, at]) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, t + at);
    gain.gain.exponentialRampToValueAtTime(0.6, t + at + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + at + 0.35);
    osc.connect(gain); gain.connect(ctx.destination);
    osc.start(t + at); osc.stop(t + at + 0.4);
  });
};

const dings = (times, onPlay) => { for (let i = 0; i < times; i += 1) ding(i * GAP); onPlay?.(); };

export function playChime(count = 1, onPlay = null) {
  const times = Math.max(1, Math.min(MAX_DINGS, Math.round(Number(count) || 1)));
  const now = Date.now();
  if (now - lastAt < 4000) return;
  lastAt = now;
  pendingTimes = times;
  pendingPlay = onPlay;
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) { onPlay?.(); return; }
  try { ctx = ctx || new Ctx(); } catch { onPlay?.(); return; }
  if (ctx.state !== 'suspended') { dings(times, onPlay); return; }
  if (waiting) return;
  waiting = true;
  const unlock = () => {
    ['pointerdown', 'keydown'].forEach((e) => document.removeEventListener(e, unlock));
    waiting = false;
    ctx.resume().then(() => dings(pendingTimes, pendingPlay)).catch(() => pendingPlay?.());
  };
  ['pointerdown', 'keydown'].forEach((e) => document.addEventListener(e, unlock));
}
