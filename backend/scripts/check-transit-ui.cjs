// Local UI smoke test with synthetic data. No backend or production requests are sent.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const puppeteer = require('puppeteer');
const { buildTransitCase } = require('../src/utils/transitFlow');

async function main() {
  const base = process.env.TRANSIT_UI_URL || 'http://127.0.0.1:5173';
  const output = path.resolve(__dirname, '../.cache/transit-ui');
  fs.mkdirSync(output, { recursive: true });
  const browser = await puppeteer.launch({ headless: true });
  try {
    for (const role of ['in_transit', 'assistant_doctor', 'receptionist']) {
      const page = await browser.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      const user = { _id: '507f1f77bcf86cd799439012', name: 'Test Staff', role };
      const stage = { number: 1, purchaseOrder: 'PO-1042', totalAmount: 39000, packageName: 'Six month treatment', payments: [{ _id: 'payment1', amount: 39000, approvalStatus: 'approved', date: new Date() }],
        transit: { enteredAt: new Date(), fulfilmentMode: 'courier', expectedReadyDate: new Date(), ...(role === 'assistant_doctor' ? { explanationScheduledAt: new Date(), explanationDoctor: user._id } : {}) },
        medicineExplainDate: new Date(), medicineRequests: [{ requestId: 'request1', status: role === 'assistant_doctor' ? 'sent_to_courier' : 'in_process', medicines: 'Customized formulations', requestedAt: new Date(), readyByDate: new Date(), courier: role === 'assistant_doctor' ? { status: 'delivered', deliveredAt: new Date() } : {} }] };
      const patient = { _id: '507f1f77bcf86cd799439011', patientName: 'Aarav Mehra', patientCode: 'MV-1042', number: '9999999999', guardianName: 'Sunita Mehra', approvalStatus: 'approved', createdAt: new Date(), assignedDoctor: { _id: user._id, name: 'Doctor' } };
      const item = buildTransitCase(patient, stage);
      await page.evaluateOnNewDocument(u => {
        localStorage.setItem('crm_token', 'test-only'); localStorage.setItem('crm_user', JSON.stringify(u));
        window.WebSocket = class { close() {} addEventListener() {} removeEventListener() {} };
      }, user);
      await page.setRequestInterception(true);
      page.on('request', request => {
        const url = new URL(request.url());
        if (url.pathname.startsWith('/api/')) {
          let data = { success: true, items: [], patients: [], reminders: [], rows: [], count: 0, total: 0 };
          if (url.pathname.endsWith('/auth/me')) data = { user };
          else if (url.pathname === '/api/transit' || url.pathname === '/api/transit/explanations') data = { items: [item], counts: { all: 1, medicine: 1 } };
          else if (/\/api\/transit\/[a-f0-9]+\/1$/.test(url.pathname)) data = { item, events: [{ action: 'Medicine preparation started', by: 'Medicine Department', at: new Date() }] };
          else if (url.pathname === '/api/transit/staff') data = { staff: [{ id: user._id, name: 'Doctor', role: 'assistant_doctor' }] };
          return request.respond({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' }, body: JSON.stringify(data) });
        }
        if (url.origin !== base || url.pathname.startsWith('/socket.io')) return request.abort();
        return request.continue();
      });
      for (const width of [1440, 390]) {
        await page.setViewport({ width, height: 1000 });
        const route = role === 'assistant_doctor' ? '/admin/medicine-explanations' : role === 'receptionist' ? '/admin/accounts/consultations' : '/admin/in-transit';
        await page.goto(base + route, { waitUntil: 'networkidle0' });
        await page.waitForSelector('h1');
        if (role !== 'receptionist') await page.waitForFunction(() => document.body.innerText.includes('Aarav Mehra'));
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, role + ' page overflows at ' + width);
        await page.screenshot({ path: path.join(output, role + '-' + width + '.png'), fullPage: true });
        if (role === 'in_transit') {
          if (width < 1000) await page.evaluate(() => [...document.querySelectorAll('button')].find(button => button.innerText.includes('Aarav Mehra')).click());
          await page.evaluate(() => [...document.querySelectorAll('button')].find(button => button.innerText.includes('Schedule dispatch')).click());
          await page.waitForSelector('input[type="datetime-local"]');
          await page.screenshot({ path: path.join(output, 'dispatch-' + width + '.png'), fullPage: true });
          await page.keyboard.press('Escape');
          await page.goto(base + route, { waitUntil: 'networkidle0' });
          await page.click('button[title="Board view"]');
          await page.screenshot({ path: path.join(output, 'board-' + width + '.png'), fullPage: true });
        }
        if (role === 'assistant_doctor') {
          await page.evaluate(() => [...document.querySelectorAll('button')].find(button => button.innerText === 'Complete').click());
          await page.waitForSelector('textarea');
          await page.screenshot({ path: path.join(output, 'explanation-' + width + '.png'), fullPage: true });
        }
      }
      assert.deepEqual(errors, [], role + ' runtime errors');
      console.log(role + ': desktop/mobile render and controls passed');
      await page.close();
    }
    console.log('Screenshots: ' + output);
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
