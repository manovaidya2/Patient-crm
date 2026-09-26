const puppeteer = require('puppeteer');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// Isolated UI fixtures: no patient data or database writes are used.
async function main() {
  const browser = await puppeteer.launch({ headless: true, executablePath: process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' });
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const user = { id: 'ui-test', name: 'Receptionist', role: 'receptionist' };
    const entry = { _id: 'entry-1', paperName: 'Blood report', givenTo: 'Dr. Sharma', reason: 'Consultation review', issuedAt: '2026-09-26T08:00:00Z', issuedByName: 'Receptionist', returnedAt: null };
    const record = { id: 'record-1', patientName: 'Sample Patient', patientId: 'PT-101', appointmentId: 'APT-101', documents: [], pdfPageCount: 0, issueHistory: [entry] };
    await page.evaluateOnNewDocument((savedUser) => {
      localStorage.setItem('crm_token', 'ui-test');
      localStorage.setItem('crm_user', JSON.stringify(savedUser));
    }, user);
    await page.setRequestInterception(true);
    page.on('request', (request) => {
      const url = new URL(request.url());
      if (!url.pathname.startsWith('/api/')) return request.continue();
      if (request.method() === 'OPTIONS') return request.respond({ status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS' } });
      const route = url.pathname.replace('/api', '');
      let data = { success: true };
      if (route === '/auth/me') data = { user };
      else if (route === '/record-room/summary') data = { total: 1, pending: entry.returnedAt ? 0 : 1, returned: entry.returnedAt ? 1 : 0, problems: entry.returnCondition === 'problem' ? 1 : 0 };
      else if (route === '/record-room') data = { records: [record], total: 1 };
      else if (route === '/record-room/movements') data = { entries: url.searchParams.get('status') === 'pending' && entry.returnedAt ? [] : [{ recordId: record.id, patientName: record.patientName, patientId: record.patientId, appointmentId: record.appointmentId, entry }], total: url.searchParams.get('status') === 'pending' && entry.returnedAt ? 0 : 1 };
      else if (route.includes('/collect/')) { Object.assign(entry, JSON.parse(request.postData()), { returnedAt: new Date().toISOString(), returnedByName: user.name }); data = { record }; }
      else if (route === '/record-room/record-1') data = { record };
      request.respond({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' }, body: JSON.stringify(data) });
    });
    const output = path.resolve(__dirname, '../../artifacts/record-room');
    fs.mkdirSync(output, { recursive: true });
    await page.setViewport({ width: 1440, height: 1000 });
    await page.goto(`${process.env.RECORD_ROOM_UI_URL || 'http://127.0.0.1:5174'}/admin/record-room`);
    await page.waitForSelector('.rr-table tbody .rr-link');
    assert.equal(await page.$$eval('.rr-stat', (cards) => cards.length), 3);
    assert.equal(await page.$$eval('.rr-stat', (cards) => cards.some((card) => card.textContent.includes('Collected'))), false);
    await page.click('.rr-table button[title="Issue paper"]');
    await page.waitForSelector('.rr-form');
    assert.equal(await page.$eval('.rr-form', (form) => form.textContent.includes('Paper / document name')), false);
    await page.click('.rr-form-footer button[type=button]');
    await page.screenshot({ path: path.join(output, 'patient-records-desktop.png'), fullPage: true });
    await page.click('.rr-stat-amber');
    await page.waitForSelector('.rr-register .rr-pending-row');
    assert.ok(page.url().includes('status=pending'));
    await page.screenshot({ path: path.join(output, 'pending-register-desktop.png'), fullPage: true });
    await page.click('.rr-register .rr-pending-row button');
    await page.waitForSelector('.rr-form select');
    await page.select('.rr-form select', 'problem');
    const required = await page.$eval('.rr-form textarea[required]', (element) => element.required);
    assert.equal(required, true);
    await page.type('.rr-form textarea[required]', 'One page is torn');
    await page.click('.rr-form button[type=submit]');
    await page.waitForFunction(() => !document.querySelector('.rr-form'));
    await page.waitForFunction(() => document.querySelector('.rr-stat-amber strong')?.textContent === '0');
    await page.click('.rr-stat-red');
    await page.waitForSelector('.rr-problem-row');
    assert.equal(await page.$eval('.rr-problem-text', (element) => element.textContent), 'One page is torn');
    await page.setViewport({ width: 390, height: 844 });
    await page.screenshot({ path: path.join(output, 'register-mobile.png'), fullPage: true });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
    assert.deepEqual(errors, []);
    console.log('UI passed: patient list, pending filter, problem collection, updated counts, mobile width. Screenshots:', output);
  } finally { await browser.close(); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
