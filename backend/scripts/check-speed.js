// Measures, from wherever it runs, how fast the database link is and how long the heavy pending lists take.
//   cd backend && node scripts/check-speed.js
// Reads MONGO_URI from .env (or the environment). Prints a few lines and exits.
require('dotenv').config();
const mongoose = require('mongoose');

const ms = (t) => `${Date.now() - t} ms`;
const line = (label, value) => console.log(`${label.padEnd(44, '.')} ${value}`);

(async () => {
  let t = Date.now();
  await mongoose.connect(process.env.MONGO_URI || process.env.MONGODB_URI, { serverSelectionTimeoutMS: 30000 });
  line('Connect to database', ms(t));
  const host = mongoose.connection.host || '';
  line('Database host', host.replace(/^([^.]*\.[^.]*).*$/, '$1…'));

  const Patient = require('../src/models/Patient');
  const User = require('../src/models/User');
  for (let i = 0; i < 3; i += 1) { t = Date.now(); await User.findOne().select('_id').lean(); line(`Tiny query (round trip) #${i + 1}`, ms(t)); }

  t = Date.now();
  const docs = await Patient.find({}).select('stages.medicineRequest stages.medicineRequests').lean();
  const bytes = Buffer.byteLength(JSON.stringify(docs));
  const seconds = (Date.now() - t) / 1000;
  line(`Bulk read: ${(bytes / 1024).toFixed(0)} KB of patient requests`, `${ms(t)}  (~${(bytes / 1024 / Math.max(seconds, 0.001)).toFixed(0)} KB/s)`);

  const { getTaskCounts } = require('../src/controllers/taskCountController');
  const { getMyDay } = require('../src/controllers/myDayController');
  const { listJobs } = require('../src/controllers/medicineJobController');
  const admin = await User.findOne({ role: 'admin' }).lean();
  const call = (handler, query = {}) => new Promise((resolve, reject) => {
    handler({ user: admin, query, params: {}, body: {}, app: { get: () => null } }, { status() { return this; }, json: resolve }, reject);
  });
  for (const [label, handler, query] of [['Sidebar counts (cold)', getTaskCounts], ['Sidebar counts (cached)', getTaskCounts], ['My day (cold)', getMyDay], ['My day (cached)', getMyDay], ['Fulfilment queue, first 12 (cold)', listJobs, { status: 'open', limit: 12 }], ['Fulfilment queue, all (cached)', listJobs, { status: 'open' }]]) {
    t = Date.now(); await call(handler, query); line(label, ms(t));
  }
  console.log('\nGuide: tiny query < 50 ms and bulk read > 1000 KB/s is a good link; cached lists should be under 100 ms.');
  process.exit(0);
})().catch((error) => { console.error('Failed:', error.message); process.exit(1); });
