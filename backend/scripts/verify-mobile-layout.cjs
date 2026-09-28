const puppeteer = require('puppeteer');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// Isolated, populated fixtures. No real API request or write reaches the server.
async function main() {
  const appUrl = process.argv[2] || process.env.UI_TEST_URL;
  if (!appUrl) throw new Error('Pass the app URL: node backend/scripts/verify-mobile-layout.cjs https://your-crm.example.com');
  const browser = await puppeteer.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : { channel: 'chrome' }) });
  const output = path.resolve(__dirname, '../../artifacts/mobile-layout');
  fs.mkdirSync(output, { recursive: true });
  const now = new Date().toISOString();
  const user = { id: 'test-admin', name: 'Test Administrator', role: 'admin', isActive: true };
  const patient = {
    id: 'p1', patientCode: 'PT-12345', patientName: 'Sample Patient With A Longer Name', age: '12 years',
    category: 'autism_adhd', categoryLabel: 'Autism/ADHD', number: '9876543210', alternateNumber: '9876543211',
    guardianName: 'Sample Parent With A Longer Name', createdAt: now, isActive: true, currentStage: 1,
    approvalStatus: 'pending', canApprove: true, canToggleActive: true, pendingPayments: [], activityLog: [],
    stages: Array.from({ length: 6 }, (_, index) => ({
      number: index + 1, status: 'in_progress', statusLabel: 'In progress', totalAmount: 1234567, amountPaid: 234567,
      remainingAmount: 1000000, packageName: 'Comprehensive consultation and medicine package', payments: [],
      followUps: [{ id: 'f1', dateTime: now, status: 'pending', displayStatus: 'upcoming', displayStatusLabel: 'Upcoming', followUpType: 'normal', createdByName: 'Sample Doctor', notes: 'Discuss the treatment and medicine instructions' }], familySessions: [],
      medicineRequests: [{ id: 'm1', status: 'in_process', statusLabel: 'Medicine Preparation In Process', requestedAt: now, medicines: 'Sample medicine and detailed instructions' }], recordScanFiles: [],
    })),
  };
  const record = { id: 'r1', patientName: patient.patientName, patientId: patient.patientCode, appointmentId: 'APT-12345', shelfNumber: 'S-12', fileNumber: 'F-123', documents: [], pdfPageCount: 0, issueHistory: [] };
  const columns = [{ id: 'name', key: 'name', label: 'Patient name', type: 'text', options: [] }];
  const appointment = { id: 'a1', appointmentCode: 'APT-12345', appointmentDate: now.slice(0, 10), entryAt: now, createdByName: user.name, status: 'active', values: { name: patient.patientName }, salesValues: { name: patient.patientName } };
  const defaults = { success: true, rows: [], patients: [], users: [], reminders: [], banks: [], items: [], entries: [], payments: [], categories: [], articles: [], queries: [], records: [], appointments: [], columns: [], reviews: [], doctors: [], psychologists: [], postCounselors: [], callLogs: [], total: 0, pages: 1 };
  const fixtures = {
    '/auth/me': { user }, '/users': { users: [user] },
    '/patients': { patients: [patient], total: 1, pages: 1 }, '/patients/p1': { patient },
    '/patients/pending-approvals': { patients: [patient] },
    '/patients/dashboard-stats': {
      paymentSummary: { totalAmount: 12345678, amountPaid: 2345678, dueAmount: 10000000 },
      bankPaymentSummary: { rows: [{ bankId: 'bank1', bankName: 'Sample Bank - Main Clinic Account', amount: 2345678, count: 123 }] },
      paymentDueLedger: { count: 1, totalDue: 1000000, rows: [{ patientId: 'p1', patientName: patient.patientName, patientCode: patient.patientCode, phase: 1, packageName: patient.stages[0].packageName, totalAmount: 1234567, paidAmount: 234567, dueAmount: 1000000, assignedDoctor: 'Sample Assistant Doctor', postCounselor: 'Sample Counselor' }] },
      lossPoints: { total: 12, rows: [{ key: 'doctor', name: 'Sample Assistant Doctor', total: 12, followUps: 4, familySessions: 4, medicine: 4, latest: [{ type: 'Follow-up', patientName: patient.patientName, patientCode: patient.patientCode, stage: 1, at: now }] }] },
    },
    '/medicine/requests': { rows: [{ patientId: 'p1', patientName: patient.patientName, stage: 1, requestId: 'med1', medicineRequest: { status: 'made', statusLabel: 'Made', medicines: 'Sample medicine instructions', requestedAt: now } }] },
    '/record-room': { records: [record], total: 1 }, '/record-room/r1': { record }, '/record-room/summary': { total: 1, pending: 0, problems: 0 },
    '/sales-sheet/columns': { columns }, '/sales-sheet/management-columns': { columns: [] },
    '/sales-sheet/appointments': { appointments: [appointment] }, '/sales-sheet/management': { appointments: [appointment] },
    '/clinic-inventory': { items: [{ id: 'item1', name: 'Sample clinic supply', category: 'General supplies', unit: 'piece', quantity: 100, minimumStock: 5, createdAt: now, createdByName: user.name }], totals: { items: 1, lowStock: 0 } },
    '/knowledge/categories': { categories: [{ id: 'cat1', name: 'Patient consultation and frequently asked questions', count: 1 }] },
    '/knowledge': { articles: [{ id: 'q1', question: 'How do I arrange a consultation?', answer: 'Contact reception to arrange a consultation.', categoryId: 'cat1' }] },
    '/help-desk': { queries: [{ id: 'q1', patientName: patient.patientName, patientCode: patient.patientCode, issue: 'Appointment consultation query', status: 'open', createdAt: now, history: [] }] },
    '/worksheet': { tabs: [{ id: user.id, name: 'Assistant Doctor', roleLabel: 'Assistant Doctor', count: 1 }], selectedUserId: user.id, columns, rows: [{ id: 'w1', values: { name: patient.patientName }, updatedAt: now }] },
  };
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', (error) => { errors.push(error.message); console.error('PAGE ERROR:', page.url(), error.message); });
    await page.evaluateOnNewDocument((savedUser) => {
      localStorage.setItem('crm_token', 'mobile-layout-test');
      localStorage.setItem('crm_user', JSON.stringify(savedUser));
    }, user);
    await page.setRequestInterception(true);
    page.on('request', (request) => {
      const url = new URL(request.url());
      if (url.pathname.startsWith('/socket.io')) return request.abort();
      if (!url.pathname.startsWith('/api/')) return request.continue();
      const headers = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': '*' };
      if (request.method() === 'OPTIONS') return request.respond({ status: 204, headers });
      const route = url.pathname.replace('/api', '');
      let data = { ...defaults, ...fixtures[route] };
      if (['/schedule/followups', '/schedule/family-sessions'].includes(route)) data.rows = [{ assignee: 'Sample Assistant Doctor', entries: [{ id: 'e1', patientId: 'p1', patientName: patient.patientName, dateTime: now, displayStatus: 'upcoming', displayStatusLabel: 'Upcoming', followUpType: 'normal' }] }];
      request.respond({ status: 200, contentType: 'application/json', headers, body: JSON.stringify(data) });
    });
    const routes = ['/admin', '/admin/patients', '/admin/patients/p1', '/admin/followups', '/admin/family-sessions', '/admin/patient-approvals', '/admin/medicine-requests', '/admin/medicine-made', '/admin/courier', '/admin/courier-delivered', '/admin/medicine-inventory', '/admin/clinic-inventory', '/admin/record-room', '/admin/record-room?record=r1', '/admin/record-room/register', '/admin/appointment-management', '/sales', '/admin/receptionist-checklist', '/admin/patient-queries', '/admin/knowledge-library', '/admin/knowledge-library/cat1', '/admin/worksheet', '/admin/accounts', '/admin/payments', '/admin/team', '/admin/inactive-patients', '/admin/package-not-bought', '/admin/stages/1', '/admin/request-for-advice', '/admin/advice-given', '/admin/accounts/income', '/admin/accounts/expenses', '/admin/approved-payments', '/admin/payment-settings', '/admin/digital-marketing', '/admin/chatgpt'];
    const report = [];
    for (const width of (process.argv[4]?.split(',').map(Number) || [320, 390, 768, 1440])) {
      await page.setViewport({ width, height: 900 });
      for (const route of (process.argv[3]?.split(',') || routes)) {
        await page.goto(new URL(route, appUrl).href, { waitUntil: 'networkidle0' });
        await page.waitForSelector('main');
        const result = await page.evaluate(() => {
          const outside = [...document.querySelectorAll('main *')].filter((element) => {
            const rect = element.getBoundingClientRect();
            if (!rect.width || !rect.height || (rect.right <= innerWidth + 1 && rect.left >= -1)) return false;
            for (let parent = element.parentElement; parent && parent !== document.body; parent = parent.parentElement) {
              const style = getComputedStyle(parent);
              const box = parent.getBoundingClientRect();
              if (['auto', 'scroll'].includes(style.overflowX) && box.right <= innerWidth + 1 && box.left >= -1) return false;
            }
            return true;
          }).map((element) => ({ tag: element.tagName, text: element.textContent.slice(0, 75), className: element.className }));
          return { outside: outside.slice(0, 8), heading: document.querySelector('main h1')?.textContent, fontSize: getComputedStyle(document.querySelector('main h1') || document.body).fontSize };
        });
        report.push({ width, route, ...result });
        if ([390, 1440].includes(width) && ['/admin', '/admin/patients', '/admin/patients/p1', '/admin/appointment-management', '/sales'].includes(route)) {
          await page.screenshot({ path: path.join(output, `${route.replaceAll('/', '-')}-${width}.png`), fullPage: true });
        }
        console.log(width, route, result.outside.length ? JSON.stringify(result.outside) : 'OK');
      }
    }
    for (const width of [320, 390]) {
      await page.setViewport({ width, height: 900 });
      await page.goto(new URL('/admin/patients/p1', appUrl).href, { waitUntil: 'networkidle0' });
      await page.waitForSelector('.patient-details');
      const medicine = await page.$('button[aria-expanded]');
      await medicine.screenshot({ path: path.join(output, `medicine-request-${width}.png`) });
      for (const label of ['Update Request', 'Schedule', 'Mark Done', 'Notes']) {
        const clicked = await page.evaluate((text) => {
          const button = [...document.querySelectorAll('button')].find((element) => element.textContent.trim() === text);
          if (!button) return false;
          button.click();
          return true;
        }, label);
        assert.ok(clicked, `Missing patient action: ${label}`);
        await page.waitForSelector('[role="dialog"]');
        const overflow = await page.$$eval('[role="dialog"] *', (elements) => elements.filter((element) => {
          const rect = element.getBoundingClientRect();
          return rect.width && rect.height && (rect.right > innerWidth + 1 || rect.left < -1);
        }).map((element) => `${element.tagName}: ${element.className}`).slice(0, 5));
        assert.deepEqual(overflow, [], `${label} dialog at ${width}px`);
        if (label === 'Mark Done') await page.screenshot({ path: path.join(output, `completion-form-${width}.png`) });
        await page.click('[role="dialog"] button[aria-label="Close"]');
        await page.waitForFunction(() => !document.querySelector('[role="dialog"]'));
      }
      await page.click('button[aria-label="Edit Age"]');
      await page.waitForSelector('button[aria-label="Save Age"]');
      await page.click('button[aria-label="Cancel editing Age"]');
      await page.click('button[aria-label="Open navigation"]');
      await page.waitForSelector('button[aria-label="Close navigation"]');
      const navigation = await page.$('aside.fixed');
      const box = await navigation.boundingBox();
      assert.ok(box.x >= 0 && box.x + box.width <= width, 'Mobile navigation fits');
      await page.click('button[aria-label="Close navigation"]');
      console.log(width, 'patient dialogs, inline edit and mobile navigation OK');
    }
    fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify({ errors, report }, null, 2));
    assert.deepEqual(errors, [], 'React runtime errors');
    assert.equal(report.filter((row) => row.outside.length).length, 0, 'Unexpected page overflow; see report.json');
    console.log('Passed mobile/tablet/desktop layout checks. Screenshots:', output);
  } finally { await browser.close(); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
