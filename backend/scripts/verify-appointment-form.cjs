const puppeteer = require('puppeteer');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
async function main() {
  const url = process.argv[2];
  if (!url) throw new Error('Pass the application URL');
  const browser = await puppeteer.launch({ headless: true, protocolTimeout: 60000, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : { channel: 'chrome' }) });
  try {
    const page = await browser.newPage(); const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const id = '507f1f77bcf86cd799439011';
    const user = { id, name: 'Receptionist', role: 'receptionist' };
    const salesColumns = [{ id: '507f1f77bcf86cd799439012', label: 'Patient Name', type: 'text', options: [] }, { id: '507f1f77bcf86cd799439013', label: 'Previous reports available', type: 'checkbox', options: [] }, { id: '507f1f77bcf86cd799439014', label: 'Advance Consultation Amount', type: 'number', options: [] }];
    const columns = [{ id: '507f1f77bcf86cd799439015', label: 'Arrival Status', type: 'select', options: ['Arrived', 'Waiting'] }, { id: '507f1f77bcf86cd799439016', label: 'Patient Id', type: 'text', options: [] }];
    const row = { id, appointmentCode: 'APT-FORM', appointmentDate: '2026-10-02', createdByName: 'Sales member', salesValues: { [salesColumns[0].id]: 'Sample Patient', [salesColumns[1].id]: 'true', [salesColumns[2].id]: '99' }, values: { [columns[0].id]: 'Waiting' } };
    const form = { ...row, canEdit: true, salesColumns, columns, receipts: [{ _id: 'advance', collectionStage: 'advance', amount: 99, status: 'pending', date: '2026-10-02', recordedByName: 'Sales member', files: [] }], banks: [], consultationFee: 599 };
    let fieldWrites = 0, receiptWrites = 0, created = 0, salesCreateBody;
    await page.evaluateOnNewDocument((user) => { localStorage.setItem('crm_token', 'fixture'); localStorage.setItem('crm_user', JSON.stringify(user)); }, user);
    await page.setRequestInterception(true);
    page.on('request', (request) => {
      const target = new URL(request.url());
      if (!target.pathname.startsWith('/api/')) return request.continue();
      const headers = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'GET,POST,PATCH,OPTIONS' };
      if (request.method() === 'OPTIONS') return request.respond({ status: 204, headers });
      const route = target.pathname.replace('/api', ''); let data = { success: true };
      if (route === '/auth/me') data = { user };
      if (route === '/enquiries/notifications') data = { items: [], total: 0 };
      if (route === '/sales-sheet/columns') data = { columns: salesColumns };
      if (route === '/sales-sheet/management-columns') data = { columns };
      if (route === '/sales-sheet/layout') data = { columns: [] };
      if (route === '/sales-sheet/management') {
        if (request.method() === 'POST') { created++; data = { appointment: row }; }
        else data = { appointments: [row] };
      }
      if (route === '/sales-sheet/appointments') {
        if (request.method() === 'POST') { created++; salesCreateBody = JSON.parse(request.postData()); data = { appointment: row }; }
        else data = { appointments: [{ ...row, values: row.salesValues, createdBy: id, canEdit: true, status: 'active' }] };
      }
      if (route === `/sales-sheet/forms/management/${id}`) data = form;
      if (route === `/sales-sheet/forms/sales/${id}`) data = { ...form, columns: [] };
      if (route.endsWith('/field')) {
        const body = JSON.parse(request.postData()); fieldWrites++;
        assert.equal(body.previousValue, 'Waiting'); assert.equal(body.value, 'Arrived');
        form.values[body.columnId] = body.value; data = { value: body.value };
      }
      if (route.endsWith('/receipts')) { receiptWrites++; form.receipts.push({ _id: `receipt-${receiptWrites}`, collectionStage: route.includes('/sales/') ? 'advance' : 'reception', amount: route.includes('/sales/') ? 99 : 500, status: 'pending', date: '2026-10-02', recordedByName: user.name, files: [] }); }
      request.respond({ status: 200, headers, contentType: 'application/json', body: JSON.stringify(data) });
    });
    const clickText = async (text) => {
      await page.waitForFunction((text) => [...document.querySelectorAll('button')].some((el) => el.textContent.trim() === text), {}, text);
      await page.evaluate((text) => [...document.querySelectorAll('button')].find((el) => el.textContent.trim() === text).click(), text);
    };
    await page.setViewport({ width: 1440, height: 1000 });
    await page.goto(new URL('/admin/appointment-management', url).href);
    await page.waitForFunction(() => document.querySelector('tbody')?.textContent.includes('APT-FORM'));
    await clickText('Open appointment');
    await page.waitForSelector('button[aria-label="Edit Arrival Status"]');
    await page.click('button[aria-label="Edit Arrival Status"]');
    await page.select('select[aria-label="Arrival Status"]', 'Arrived');
    await clickText('Save');
    await page.waitForFunction(() => document.querySelector('[role="dialog"]')?.textContent.includes('Arrived') && !document.querySelector('select[aria-label="Arrival Status"]'));
    assert.equal(fieldWrites, 1);
    await clickText('Sales details');
    assert.ok(await page.$eval('[role="dialog"]', (el) => el.textContent.includes('Sample Patient') && el.textContent.includes('Yes')));
    await clickText('Consultation payments');
    await clickText('Record reception payment');
    const amount = await page.$('input[type="number"]'); await amount.type('500');
    await clickText('Save receipt');
    await page.waitForFunction(() => document.querySelectorAll('[role="dialog"] tbody tr').length === 2);
    assert.equal(receiptWrites, 1);
    assert.ok(await page.$eval('[role="dialog"]', (el) => el.textContent.includes('Rs 500')));
    const output = path.resolve(__dirname, '../../artifacts/appointment-form'); fs.mkdirSync(output, { recursive: true });
    await page.screenshot({ path: path.join(output, 'desktop-payments.png'), fullPage: true });
    await page.setViewport({ width: 390, height: 844 });
    await page.screenshot({ path: path.join(output, 'mobile-payments.png'), fullPage: true });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await page.click('button[aria-label="Close"]');
    await clickText('Add appointment');
    await page.waitForSelector('select[aria-label="Arrival Status"]');
    await page.select('select[aria-label="Arrival Status"]', 'Waiting');
    await clickText('Sales details'); await page.type('input[aria-label="Patient Name"]', 'New Patient');
    await clickText('Create appointment');
    await page.waitForSelector('button[aria-label="Edit Arrival Status"]');
    assert.equal(created, 1);
    await page.goto(new URL('/sales', url).href);
    await page.waitForFunction(() => document.querySelector('tbody')?.textContent.includes('APT-FORM'));
    await page.type('input[aria-label="Search sales appointments"]', 'no-such-patient');
    await page.waitForFunction(() => document.querySelector('tbody')?.textContent.includes('No appointments match'));
    await page.click('input[aria-label="Search sales appointments"]'); await page.keyboard.down('Control'); await page.keyboard.press('A'); await page.keyboard.up('Control'); await page.keyboard.press('Backspace');
    await clickText('Open appointment');
    await page.waitForSelector('button[aria-label="Edit Patient Name"]');
    assert.ok(await page.$eval('[role="dialog"]', (el) => el.textContent.includes('Sample Patient')));
    await page.click('button[aria-label="Close"]');
    await clickText('Add appointment');
    await page.waitForSelector('input[aria-label="Patient Name"]');
    await page.type('input[aria-label="Patient Name"]', 'New Sales Patient');
    await clickText('Consultation payments');
    await page.type('input[placeholder="Enter total amount to collect"]', '599');
    await clickText('Save & record advance');
    await page.waitForFunction(() => document.querySelector('[role="dialog"]')?.textContent.includes('Sales advance receipt'));
    await page.type('[role="dialog"] form input[type="number"]', '99');
    await clickText('Save receipt');
    await page.waitForFunction(() => document.querySelectorAll('[role="dialog"] tbody tr').length === 3);
    assert.equal(created, 2); assert.equal(receiptWrites, 2); assert.equal(salesCreateBody.consultationFee, '599');
    await page.screenshot({ path: path.join(output, 'mobile-sales-advance.png'), fullPage: true });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    assert.deepEqual(errors, []);
    console.log('Sales/reception forms: search, saved fields, total consultation fee, create-to-advance flow, reception receipt and mobile layout passed (mock API).');
  } finally { await browser.close(); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
