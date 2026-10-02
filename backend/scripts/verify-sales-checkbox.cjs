const puppeteer = require('puppeteer');
const assert = require('node:assert/strict');

async function main() {
  const url = process.argv[2];
  if (!url) throw new Error('Pass the application URL');
  const browser = await puppeteer.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : { channel: 'chrome' }) });
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const user = { id: 'staff1', name: 'Sales User', role: 'sales_team' };
    const columns = [{ id: 'reports', label: 'Previous reports available', type: 'checkbox', options: [] }];
    let row = { id: 'row1', appointmentCode: 'APT-CHECK', appointmentDate: '2026-10-02', values: { reports: 'true' }, status: 'active', canEdit: true, createdBy: user.id, createdByName: user.name };
    const saved = [];
    await page.evaluateOnNewDocument((user) => { localStorage.setItem('crm_token', 'fixture'); localStorage.setItem('crm_user', JSON.stringify(user)); }, user);
    await page.setRequestInterception(true);
    page.on('request', (request) => {
      const target = new URL(request.url());
      if (!target.pathname.startsWith('/api/')) return request.continue();
      const headers = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'GET,PATCH,OPTIONS' };
      if (request.method() === 'OPTIONS') return request.respond({ status: 204, headers });
      let data = { success: true };
      if (target.pathname === '/api/auth/me') data = { user };
      if (target.pathname === '/api/enquiries/notifications') data = { items: [], total: 0 };
      if (target.pathname === '/api/sales-sheet/columns') data = { columns };
      if (target.pathname === '/api/sales-sheet/appointments') data = { appointments: [row] };
      if (request.method() === 'PATCH') {
        row = { ...row, values: JSON.parse(request.postData()).values };
        saved.push(row.values.reports); data = { appointment: row };
      }
      request.respond({ status: 200, headers, contentType: 'application/json', body: JSON.stringify(data) });
    });
    await page.goto(new URL('/sales', url).href);
    const waitForCell = async (checked) => {
      await page.waitForSelector('tbody button[title="Edit"]');
      await page.waitForFunction((checked) => {
        const cell = document.querySelector('tbody tr td:nth-child(6)');
        return cell && cell.textContent.includes('\u2713') === checked;
      }, {}, checked);
    };
    await waitForCell(true);
    await page.click('tbody button[title="Edit"]');
    assert.equal(await page.$eval('tbody input[type="checkbox"]', (el) => el.checked), true);
    await page.click('tbody button[title="Save"]');
    await waitForCell(true);
    assert.equal(saved.at(-1), 'true');
    for (const checked of [false, true]) {
      await page.click('tbody button[title="Edit"]');
      await page.click('tbody input[type="checkbox"]');
      await page.click('tbody button[title="Save"]');
      await waitForCell(checked);
      assert.equal(saved.at(-1), String(checked));
    }
    await page.reload(); await waitForCell(true);
    await page.select('select:has(option[value="custom:reports"])', 'custom:reports');
    await page.select('select:has(option[value="true"])', 'true');
    await waitForCell(true);
    await page.select('select:has(option[value="true"])', 'false');
    await page.waitForFunction(() => document.querySelector('tbody')?.textContent.includes('No appointments match this filter'));
    assert.deepEqual(errors, []);
    console.log('Sales checkbox: display, edit/save, uncheck, recheck, reload and checked/unchecked filters passed (mock API).');
  } finally { await browser.close(); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
