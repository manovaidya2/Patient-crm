const puppeteer = require('puppeteer');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// Isolated fixtures; this check never writes to the application database.
async function main() {
  const url = process.argv[2];
  if (!url) throw new Error('Pass the application URL');
  const browser = await puppeteer.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : { channel: 'chrome' }) });
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const user = { id: 'fixture', name: 'Receptionist', role: 'receptionist' };
    await page.evaluateOnNewDocument((user) => { localStorage.setItem('crm_token', 'fixture'); localStorage.setItem('crm_user', JSON.stringify(user)); }, user);
    await page.setRequestInterception(true);
    let saves = 0;
    page.on('request', (request) => {
      const route = new URL(request.url()).pathname;
      if (!route.startsWith('/api/')) return request.continue();
      const headers = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'GET,POST,PATCH,OPTIONS' };
      if (request.method() === 'OPTIONS') return request.respond({ status: 204, headers });
      let data = { success: true };
      if (route.endsWith('/auth/me')) data = { user };
      if (route.includes('/reception-registers/')) {
        if (request.method() === 'POST') saves++;
        data = { columns: [{ key: 'name', label: 'Name', type: 'text', required: true }], rows: [{ _id: 'entry', date: '2026-10-01', values: { name: 'Sample entry' }, createdByName: 'Receptionist', createdAt: '2026-10-01T09:00:00Z', updatedAt: '2026-10-01T09:00:00Z' }], total: 1 };
      }
      request.respond({ status: 200, headers, contentType: 'application/json', body: JSON.stringify(data) });
    });
    const output = path.resolve(__dirname, '../../artifacts/reception-registers');
    fs.mkdirSync(output, { recursive: true });
    for (const width of [1440, 390]) {
      await page.setViewport({ width, height: 900 });
      for (const kind of ['visitors', 'incoming-couriers']) {
        await page.goto(new URL(`/admin/${kind}`, url).href);
        await page.waitForSelector('button[title="Edit entry"]');
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
        await page.screenshot({ path: path.join(output, `${kind}-${width}.png`), fullPage: true });
        await page.evaluate(() => [...document.querySelectorAll('button')].find((button) => button.textContent.includes('Add entry')).click());
        await page.waitForSelector('form input[type="text"]');
        await page.type('form input[type="text"]', 'Test visitor');
        await page.click('form button[type="submit"]');
        await page.waitForFunction(() => !document.querySelector('form input[type="text"]'));
      }
    }
    assert.equal(saves, 4);
    assert.deepEqual(errors, []);
    console.log('Both registers: desktop/mobile layout and entry submission passed (mock API).');
  } finally { await browser.close(); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
