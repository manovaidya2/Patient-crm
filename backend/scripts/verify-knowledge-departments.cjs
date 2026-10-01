const puppeteer = require('puppeteer');
const assert = require('node:assert/strict');
async function main() {
  const url = process.argv[2];
  if (!url) throw new Error('Pass the application URL');
  const browser = await puppeteer.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : { channel: 'chrome' }) });
  try {
    for (const role of ['admin', 'psychologist', 'assistant_doctor', 'medicine_department', 'dispatch_courier', 'sales_team', 'accountant', 'receptionist', 'post_counselor', 'manager', 'doctor', 'digital_marketing']) {
      const page = await browser.newPage();
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      const user = { id: 'fixture', name: 'Test User', role };
      await page.evaluateOnNewDocument((user) => { localStorage.setItem('crm_token', 'fixture'); localStorage.setItem('crm_user', JSON.stringify(user)); }, user);
      await page.setRequestInterception(true);
      const seen = [];
      page.on('request', (request) => {
        const target = new URL(request.url());
        if (!target.pathname.startsWith('/api/')) return request.continue();
        const headers = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' };
        if (request.method() === 'OPTIONS') return request.respond({ status: 204, headers });
        let data = { success: true };
        if (target.pathname.endsWith('/auth/me')) data = { user };
        if (target.pathname.includes('/knowledge')) {
          seen.push(target.searchParams.get('department'));
          data = target.pathname.endsWith('/categories') ? { categories: [{ id: 'cat1', name: 'Department topic', count: 1 }] } : { articles: [{ id: 'q1', question: 'Example question', answer: 'Example answer', categoryId: 'cat1' }] };
        }
        request.respond({ status: 200, headers, contentType: 'application/json', body: JSON.stringify(data) });
      });
      await page.setViewport({ width: 390, height: 844 });
      await page.goto(new URL('/admin/knowledge-library', url).href);
      await page.waitForSelector('button[title="Open category"]');
      const expected = role === 'admin' ? 'receptionist' : role === 'psychologist' ? 'assistant_doctor' : role;
      assert.ok(seen.every((value) => value === expected));
      if (role === 'admin') {
        await page.select('select[aria-label="Knowledge department"]', 'medicine_department');
        await page.waitForFunction(() => location.search.includes('medicine_department'));
        await page.waitForSelector('button[title="Open category"]');
      } else assert.equal(await page.$('select[aria-label="Knowledge department"]'), null);
      await page.click('button[title="Open category"]');
      await page.waitForFunction(() => document.body.textContent.includes('Example question'));
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      if (role !== 'admin') assert.equal(await page.$('button[title="Edit question"]'), null);
      assert.deepEqual(errors, []);
      await page.close();
    }
    console.log('All 12 roles: library/category navigation, department scope and mobile layout passed (mock API).');
  } finally { await browser.close(); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
