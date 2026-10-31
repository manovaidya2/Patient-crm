// Orders the app's GET requests so the screen the person is looking at always loads first.
//
// Lanes:  0 page (the open page's own data)  ·  1 alerts (notifications, reminders)  ·  2 nav (sidebar badges)
//         3 background (Team pending, prefetch of other pages)
// Lanes 1-3 wait until the page has had its turn: no page request in flight for GRACE ms, or MAX_WAIT ms after the
// last navigation at the latest. They then run two at a time, lowest lane first. Prefetch pauses in a hidden tab.
const PRIORITY = { page: 0, alerts: 1, nav: 2, background: 3 };
const LANE_RULES = [
  [/^\/(enquiries\/notifications|team-chat\/unread|tasks\/my-day|schedule\/reminders|transit\/reminders|advice\/unread-count)/, 1],
  [/^\/tasks\/counts/, 2],
  [/^\/tasks\/team/, 3],
];
export const laneOf = (url, config = {}) => (config.priority in PRIORITY ? PRIORITY[config.priority] : LANE_RULES.find(([re]) => re.test(String(url)))?.[1] ?? 0);

const GRACE = 250;
const MAX_WAIT = 2000;
const CONCURRENCY = 2;
let pageInFlight = 0;
let lastPage = 0;
let gateUntil = 0;
let active = 0;
let seq = 0;
let timer = null;
const queue = [];

// Called on every route change (and once at start): the new page's requests go first again.
export const markNavigation = () => { lastPage = Date.now(); gateUntil = lastPage + MAX_WAIT; };
markNavigation();

const gateOpen = () => Date.now() > gateUntil || (pageInFlight === 0 && Date.now() - lastPage > GRACE);
const hidden = () => typeof document !== 'undefined' && document.visibilityState === 'hidden';

const pump = () => {
  if (timer) { clearTimeout(timer); timer = null; }
  queue.sort((a, b) => a.lane - b.lane || a.seq - b.seq);
  while (active < CONCURRENCY && queue.length && gateOpen()) {
    const next = queue.findIndex((task) => !(task.lane === 3 && hidden()));
    if (next < 0) break;
    const [task] = queue.splice(next, 1);
    active += 1;
    Promise.resolve().then(task.run).then(task.resolve, task.reject).finally(() => { active -= 1; pump(); });
  }
  if (queue.length && !timer) timer = setTimeout(pump, 150);
};

export const schedule = (url, config, run) => {
  if (laneOf(url, config) === 0) {
    pageInFlight += 1; lastPage = Date.now();
    return Promise.resolve().then(run).finally(() => { pageInFlight -= 1; lastPage = Date.now(); pump(); });
  }
  return new Promise((resolve, reject) => { queue.push({ lane: laneOf(url, config), seq: seq++, run, resolve, reject }); pump(); });
};
