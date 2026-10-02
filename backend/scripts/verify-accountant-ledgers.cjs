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
    const user = { id: '507f1f77bcf86cd799439011', name: 'Accountant', role: 'accountant' };
    const patient = { _id: user.id, patientName: 'Sample Patient', patientCode: 'PT-101' };
    let receipt = { _id: '507f1f77bcf86cd799439012', patientId: patient._id, patientName: patient.patientName, patientCode: patient.patientCode, appointmentCode: 'APT-101', kind: 'consultation', amount: 600, date: new Date().toISOString(), status: 'pending', paymentMode: 'cash', recordedByName: 'Receptionist', notes: 'Consultation received in full', refunded: 0, files: [], refunds: [] };
    let created = 0, approved = 0;
    const requests = [];
    await page.evaluateOnNewDocument((user) => { localStorage.setItem('crm_token', 'fixture'); localStorage.setItem('crm_user', JSON.stringify(user)); }, user);
    await page.setRequestInterception(true);
    page.on('request', (request) => {
      const target = new URL(request.url());
      if (!target.pathname.startsWith('/api/')) return request.continue();
      const headers = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'GET,POST,PATCH,OPTIONS' };
      if (request.method() === 'OPTIONS') return request.respond({ status: 204, headers });
      const route = target.pathname.replace('/api', ''); requests.push(target);
      let data = { success: true };
      if (route === '/auth/me') data = { user };
      if (route === '/enquiries/notifications') data = { items: [], total: 0 };
      if (route === '/accounts/ledger') {
        const status = target.searchParams.get('status');
        const search = target.searchParams.get('search');
        const rows = (status === 'all' || status === receipt.status) && (!search || receipt.patientName.toLowerCase().includes(search.toLowerCase())) ? [receipt] : [];
        data = { rows, summary: { count: rows.length, approved: receipt.status === 'approved' ? 600 : 0, pending: receipt.status === 'pending' ? 600 : 0, refunded: 0 }, pages: 1 };
      }
      if (route === '/accounts/ledger/references') data = { appointments: [{ _id: user.id, appointmentCode: 'APT-101', appointmentDate: '2026-10-02' }], patients: [patient] };
      if (route === '/accounts/ledger/banks') data = { banks: [] };
      if (route === '/accounts/consultation-receipts' && request.method() === 'POST') { created++; data = { receipt }; }
      if (route.startsWith('/accounts/consultation-receipts/') && request.method() === 'PATCH') { assert.equal(JSON.parse(request.postData()).action, 'approve'); approved++; receipt = { ...receipt, status: 'approved', approvedByName: user.name, approvedAt: new Date().toISOString() }; data = { receipt }; }
      if (route.startsWith('/sales-sheet/')) data = { columns: [], appointments: [] };
      request.respond({ status: 200, headers, contentType: 'application/json', body: JSON.stringify(data) });
    });
    const output = path.resolve(__dirname, '../../artifacts/accountant-ledgers'); fs.mkdirSync(output, { recursive: true });
    await page.setViewport({ width: 1440, height: 1000 });
    await page.goto(new URL('/admin/accounts/consultations', url).href);
    await page.waitForSelector('button[aria-label="View payment for Sample Patient"]');
    await page.screenshot({ path: path.join(output, 'desktop.png'), fullPage: true });
    await page.type('input[aria-label="Search payments"]', 'missing');
    await page.waitForFunction(() => document.querySelector('tbody')?.textContent.includes('No payments'));
    await page.$eval('input[aria-label="Search payments"]', (el) => { const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; setter.call(el, ''); el.dispatchEvent(new Event('input', { bubbles: true })); });
    await page.waitForSelector('button[aria-label="View payment for Sample Patient"]');
    const clickText = async (text) => page.evaluate((text) => [...document.querySelectorAll('button')].find((button) => button.textContent.trim() === text).click(), text);
    await clickText('Consultation payment');
    await page.type('input[aria-label="Search appointment ID"]', 'APT');
    await page.waitForFunction(() => [...document.querySelectorAll('button')].some((b) => b.textContent.includes('APT-101 |')));
    await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent.includes('APT-101 |')).click());
    await page.type('input[aria-label="Search patient"]', 'Sample');
    await page.waitForFunction(() => [...document.querySelectorAll('button')].some((b) => b.textContent.includes('Sample Patient |')));
    await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent.includes('Sample Patient |')).click());
    await page.type('form input[type="number"]', '600');
    await page.click('form button[type="submit"]');
    await page.waitForFunction(() => !document.querySelector('form'));
    assert.equal(created, 1);
    await page.waitForSelector('button[aria-label="View payment for Sample Patient"]');
    await page.click('button[aria-label="View payment for Sample Patient"]');
    await clickText('Approve payment'); await clickText('Confirm');
    await page.waitForFunction(() => !document.querySelector('[role="dialog"]'));
    assert.equal(approved, 1);
    await page.goto(new URL('/admin/payments', url).href);
    await page.waitForSelector('select[aria-label="Payment status"]');
    assert.equal(await page.$eval('select[aria-label="Payment status"]', (el) => el.value), 'pending');
    assert.equal(await page.$eval('select[aria-label="Period"]', (el) => el.value), 'all');
    receipt = { ...receipt, kind: 'treatment', stage: 1, transactionId: '663864822579', utr: 'BANK-REFERENCE-123', reference: 'BANK-REFERENCE-123', paymentMode: 'online' };
    await page.goto(new URL('/admin/approved-payments', url).href);
    await page.waitForSelector('button[aria-label="View payment for Sample Patient"]');
    assert.equal(await page.$('select[aria-label="Payment status"]'), null);
    await page.setViewport({ width: 390, height: 844 });
    await page.screenshot({ path: path.join(output, 'mobile.png'), fullPage: true });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'mobile page should not overflow');
    await page.click('button[aria-label="View payment for Sample Patient"]');
    const details = await page.$eval('[role="dialog"]', (el) => el.textContent);
    assert.ok(details.includes('663864822579'));
    assert.ok(details.includes('BANK-REFERENCE-123'));
    assert.ok(!details.includes(receipt._id), 'MongoDB ID must not be displayed as a transaction ID');
    assert.ok(!details.includes('Cancelled by'), 'irrelevant cancellation fields should be hidden');
    await page.screenshot({ path: path.join(output, 'mobile-details.png'), fullPage: true });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await page.goto(new URL('/admin/appointment-management', url).href);
    await page.waitForFunction(() => document.body.textContent.includes('Appointment Management'));
    assert.equal(await page.evaluate(() => [...document.querySelectorAll('button')].some((b) => b.textContent.includes('Add appointment'))), false);
    assert.deepEqual(errors, []);
    console.log('Mocked accountant UI: receipt create/approve, search, payment pages, read-only appointment access and mobile layout passed.');
  } finally { await browser.close(); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
