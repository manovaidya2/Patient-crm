const puppeteer = require('puppeteer');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
async function main() {
  const url = process.argv[2];
  if (!url) throw new Error('Pass the application URL');
  const browser = await puppeteer.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : { channel: 'chrome' }) });
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const user = { id: 'staff1', name: 'Receptionist', role: 'receptionist' };
    const users = [{ ...user }, { id: 'staff2', name: 'Assistant Doctor', role: 'assistant_doctor' }];
    let entry = { id: 'e1', patientName: 'Sample Patient', patientReference: 'PT-101', subject: 'Medicine timing', description: 'Patient asked about medicine timing.', status: 'open', createdByName: user.name, assignedTo: user.id, assignedToName: user.name, assignedToRole: user.role, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), history: [], actions: ['start', 'forward', 'resolve', 'comment'] };
    let alerts = [{ id: 'n1', enquiryId: 'e1', message: 'Enquiry assigned to you', createdAt: new Date().toISOString() }];
    let created = 0; let forwarded = 0;
    await page.evaluateOnNewDocument((user) => { localStorage.setItem('crm_token', 'fixture'); localStorage.setItem('crm_user', JSON.stringify(user)); }, user);
    await page.setRequestInterception(true);
    page.on('request', (request) => {
      const target = new URL(request.url());
      if (!target.pathname.startsWith('/api/')) return request.continue();
      const headers = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS' };
      if (request.method() === 'OPTIONS') return request.respond({ status: 204, headers });
      const route = target.pathname.replace('/api', '');
      let data = { success: true };
      if (route === '/auth/me') data = { user };
      if (route === '/enquiries/staff') data = { users };
      if (route === '/enquiries/notifications') data = { items: alerts, total: alerts.length };
      if (route === '/enquiries' && request.method() === 'GET') data = { rows: [entry], total: 1 };
      if (route === '/enquiries' && request.method() === 'POST') { created++; entry = { ...entry, ...JSON.parse(request.postData()) }; data = { enquiry: entry }; }
      if (route === '/enquiries/e1') data = { enquiry: entry };
      if (route === '/enquiries/e1/read') alerts = [];
      if (route === '/enquiries/e1/actions') {
        const body = JSON.parse(request.postData());
        assert.equal(body.action, 'forward'); assert.equal(body.assignedTo, 'staff2');
        forwarded++;
        entry = { ...entry, assignedTo: 'staff2', assignedToName: 'Assistant Doctor', assignedToRole: 'assistant_doctor', actions: ['comment'], history: [{ _id: 'h1', action: 'Forwarded / escalated', note: body.note, actorName: user.name, assigneeName: 'Assistant Doctor', status: 'open', createdAt: new Date().toISOString() }] };
        data = { enquiry: entry };
      }
      request.respond({ status: 200, headers, contentType: 'application/json', body: JSON.stringify(data) });
    });
    const output = path.resolve(__dirname, '../../artifacts/enquiries'); fs.mkdirSync(output, { recursive: true });
    await page.setViewport({ width: 1440, height: 1000 });
    await page.goto(new URL('/admin/enquiries', url).href);
    await page.waitForFunction(() => document.querySelector('tbody')?.textContent.includes('Medicine timing'));
    await page.click('button[aria-label="Enquiry notifications"]');
    await page.waitForFunction(() => document.body.textContent.includes('Enquiry assigned to you'));
    await page.click('button[aria-label="Close notifications"]');
    await page.evaluate(() => [...document.querySelectorAll('button')].find((button) => button.textContent.includes('New enquiry')).click());
    await page.waitForSelector('form input');
    const fields = await page.$$('form input');
    await fields[0].type('Sample Patient'); await fields[1].type('PT-101'); await fields[2].type('Medicine timing');
    await page.select('form select', 'staff1'); await page.type('form textarea', 'Patient needs advice');
    await page.click('form button[type="submit"]');
    await page.waitForSelector('select[aria-label="Enquiry action"]');
    await page.select('select[aria-label="Enquiry action"]', 'forward');
    await page.select('select[aria-label="Assign enquiry to"]', 'staff2');
    await page.type('textarea[aria-label="Reason or update"]', 'Please explain the medicine schedule');
    await page.click('form button[type="submit"]');
    await page.waitForFunction(() => document.body.textContent.includes('Forwarded / escalated'));
    await page.screenshot({ path: path.join(output, 'desktop-timeline.png'), fullPage: true });
    await page.setViewport({ width: 390, height: 844 });
    await page.screenshot({ path: path.join(output, 'mobile-timeline.png'), fullPage: true });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await page.click('button[aria-label="Close"]');
    await page.screenshot({ path: path.join(output, 'mobile-list.png'), fullPage: true });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    assert.equal(created, 1); assert.equal(forwarded, 1); assert.deepEqual(errors, []);
    console.log('Create, forward, timeline, notification bell and mobile layout passed (mock API).');
  } finally { await browser.close(); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
