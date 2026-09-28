const puppeteer = require('puppeteer');
const assert = require('node:assert/strict');

// All API calls are intercepted: this test never reads or changes real patients.
async function main() {
  const browser = await puppeteer.launch({ headless: true, executablePath: process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 1000 });
    const errors = [];
    const counts = new Map();
    let version = 1;
    const user = { id: 'cache-test', name: 'Test Admin', role: 'admin' };
    page.on('pageerror', (error) => errors.push(error.message));
    await page.evaluateOnNewDocument((savedUser) => {
      localStorage.setItem('crm_token', 'cache-test');
      localStorage.setItem('crm_user', JSON.stringify(savedUser));
    }, user);
    await page.setRequestInterception(true);
    page.on('request', async (request) => {
      const url = new URL(request.url());
      if (!url.pathname.startsWith('/api/')) return request.continue();
      const headers = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'GET,PATCH,OPTIONS' };
      if (request.method() === 'OPTIONS') return request.respond({ status: 204, headers });
      const route = url.pathname.replace('/api', '');
      counts.set(route, (counts.get(route) || 0) + 1);
      let data = { success: true, rows: [], patients: [], users: [], reminders: [], total: 0, pages: 1 };
      if (route === '/auth/me') data = { user };
      if (route === '/medicine/requests') data.rows = [{ patientId: 'p1', patientName: `Medicine Patient ${version}`, stage: 1, requestId: 'r1', medicineRequest: { status: 'made', statusLabel: 'Made', medicines: 'Test medicine', requestedAt: new Date().toISOString() } }];
      if (route.startsWith('/schedule/') && route !== '/schedule/reminders') data.rows = [{ assignee: 'Test Doctor', counts: { upcoming: 1, late: 0, done: 0, done_late: 0, cancelled: 0 }, entries: [{ id: 'e1', patientId: 'p1', patientName: 'Schedule Patient', stageNumber: 1, dateTime: new Date().toISOString(), displayStatus: 'upcoming', followUpType: 'normal' }] }];
      if (route === '/patients') data = { patients: [{ id: 'p1', patientName: 'List Patient', patientCode: 'P1', createdAt: new Date().toISOString() }], pages: 1, total: 1 };
      if (request.method() === 'GET' && route !== '/auth/me') await new Promise((resolve) => setTimeout(resolve, 250));
      await request.respond({ status: 200, contentType: 'application/json', headers, body: JSON.stringify(data) });
    });
    await page.goto(`${process.env.CACHE_UI_URL || 'http://127.0.0.1:5174'}/admin/medicine-requests`);
    await page.waitForFunction(() => document.querySelector('main')?.textContent.includes('Medicine Patient 1'));
    const navigate = async (path, text, heading) => {
      await page.click(`a[href="${path}"]`);
      await page.waitForFunction((value, title) => document.querySelector('main')?.textContent.includes(value)
        && (!title || document.querySelector('main h1')?.textContent === title), {}, text, heading);
    };
    await navigate('/admin/medicine-made', 'Medicine Patient 1', 'Medicine Made');
    const medicineCalls = counts.get('/medicine/requests');
    await navigate('/admin/medicine-requests', 'Medicine Patient 1', 'New Medicine Requests');
    assert.equal(counts.get('/medicine/requests'), medicineCalls, 'revisit should not refetch fresh data');
    version = 2;
    await page.evaluate(async () => {
      const { default: api } = await import('/src/api/axios.js');
      await api.patch('/medicine/requests/p1/stages/1', {});
    });
    assert.equal(await page.evaluate(() => document.querySelector('main').textContent.includes('Medicine Patient 1')), true, 'keep rows while refresh is pending');
    await page.waitForFunction(() => document.querySelector('main').textContent.includes('Medicine Patient 2'));
    await navigate('/admin/followups', 'Test Doctor', 'Follow Ups');
    await navigate('/admin/family-sessions', 'Test Doctor', 'Family Sessions');
    const followupCalls = counts.get('/schedule/followups');
    await navigate('/admin/followups', 'Test Doctor', 'Follow Ups');
    assert.equal(counts.get('/schedule/followups'), followupCalls);
    await navigate('/admin/patients', 'List Patient');
    await navigate('/admin/patient-approvals', 'Patient Approvals');
    const patientCalls = counts.get('/patients');
    await navigate('/admin/patients', 'List Patient');
    assert.equal(counts.get('/patients'), patientCalls);
    await page.setViewport({ width: 390, height: 844 });
    assert.deepEqual(errors, []);
    console.log('Passed: medicine, schedules, patient-list revisits; write invalidation; background refresh keeps visible rows; no React errors.');
  } finally { await browser.close(); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
