const path = require('path');
const PDFDocument = require('pdfkit');

const PAYMENT_MODES = ['cash', 'online', 'card', 'emi', 'other'];
const MONEY_FIELDS = ['consultationFee', 'treatmentAmount', 'adjustment', 'totalPayable', 'amountReceived', 'outstanding', 'cardCharge'];
const fail = (message) => { throw Object.assign(new Error(message), { statusCode: 400 }); };
const cleanText = (value, label, max = 80) => {
  if (value == null) return '';
  if (typeof value !== 'string') fail(`${label} must be text`);
  const result = value.trim().replace(/[\r\n\t]+/g, ' ');
  if (result.length > max) fail(`${label} must be ${max} characters or fewer`);
  return result;
};
const validDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
const money = (value, label) => {
  if (value === '' || value == null) return '';
  if (!['number', 'string'].includes(typeof value) || !/^\d+(\.\d{1,2})?$/.test(String(value)) || !Number.isFinite(Number(value)) || Number(value) > 999999999) fail(`${label}: enter a valid amount with up to two decimal places`);
  return Number(value);
};

function validateReceipt(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) fail('Receipt details are required');
  const d = {};
  for (const key of ['patientName', 'patientCode', 'guardianName', 'age', 'gender', 'purchaseOrder', 'reference', 'cashCollectedBy', 'handedTo', 'time', 'emiProvider', 'helpline']) {
    d[key] = cleanText(input[key], key, ['age', 'gender', 'time'].includes(key) ? 25 : 80);
  }
  if (!d.patientName) fail('Patient name is required');
  d.date = cleanText(input.date, 'Receipt date', 10);
  if (!validDate(d.date)) fail('Enter a valid receipt date');
  if (d.time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(d.time)) fail('Enter a valid payment time');
  for (const key of MONEY_FIELDS) d[key] = money(input[key], key);
  for (const key of ['totalPayable', 'amountReceived', 'outstanding']) if (d[key] === '') fail(`${key} is required (enter 0 where applicable)`);
  if (!Array.isArray(input.paymentModes) || !input.paymentModes.length || input.paymentModes.some((mode) => !PAYMENT_MODES.includes(mode))) fail('Select a payment mode');
  d.paymentModes = [...new Set(input.paymentModes)];
  if (d.paymentModes.includes('cash') && !d.cashCollectedBy) fail('Cash collected by is required for cash payments');
  if (input.instalments != null && (!Array.isArray(input.instalments) || input.instalments.length > 3)) fail('Up to three future instalments are supported');
  d.instalments = Array.from({ length: 3 }, (_, index) => {
    const row = input.instalments?.[index] || {};
    if (typeof row !== 'object' || Array.isArray(row)) fail('Invalid instalment');
    const dueDate = cleanText(row.dueDate, 'Instalment due date', 10);
    if (dueDate && !validDate(dueDate)) fail('Enter a valid instalment due date');
    const status = row.status || '';
    if (!['', 'received', 'pending'].includes(status)) fail('Invalid instalment status');
    return { amount: money(row.amount, 'Instalment amount'), dueDate, status };
  });
  d.poVerified = input.poVerified || 'pending';
  if (!['yes', 'pending'].includes(d.poVerified)) fail('Invalid purchase order verification');
  return d;
}

const formatDate = (date) => date ? date.split('-').reverse().join('/') : '';
const formatMoney = (value) => value === '' || value == null ? '' : Number(value).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const receiptFileName = (number, name) => `Part-payment-receipt-${number}-${name.replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 65) || 'patient'}.pdf`;

function renderReceipt(number, d) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 0, info: { Title: `Part-payment receipt - ${number} - ${d.patientName}`, Author: 'ManoVaidya' } });
    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    try {
      const scale = doc.page.width / 1086;
      const top = (doc.page.height - 1448 * scale) / 2;
      doc.image(path.join(__dirname, '../../assets/receipts/part-payment.jpg'), 0, top, { width: doc.page.width });
      doc.registerFont('Receipt', path.join(__dirname, '../../assets/fonts/Mukta.ttf'));
      doc.font('Receipt');
      // Positions use the source template's pixels, scaled to an A4 print page.
      const write = (value, x, y, width, size = 16) => {
        if (value === '' || value == null) return;
        const text = String(value);
        let fontSize = size * scale;
        doc.fontSize(fontSize);
        while (doc.widthOfString(text) > width * scale && fontSize > 5) doc.fontSize(fontSize -= 0.2);
        doc.fillColor('#152b43').text(text, x * scale, top + y * scale, { width: width * scale, lineBreak: false });
      };
      const check = (x, y) => doc.save().fillColor('#287969').rect((x + 2) * scale, top + (y + 2) * scale, 13 * scale, 13 * scale).fill().restore();
      write(number, 146, 156, 278);
      write(formatDate(d.date), 494, 156, 210);
      write(d.purchaseOrder, 904, 156, 139);
      write(d.patientName, 190, 249, 390);
      write(d.patientCode, 692, 249, 350);
      write([d.age, d.gender].filter(Boolean).join(' / '), 180, 277, 400);
      write(d.guardianName, 750, 277, 292);
      ['consultationFee', 'treatmentAmount', 'adjustment', 'totalPayable', 'amountReceived', 'outstanding'].forEach((key, i) => write(formatMoney(d[key]), 852, 401 + i * 31.3, 188));
      const boxes = { cash: 223, online: 335, card: 455, emi: 700, other: 802 };
      d.paymentModes.forEach((mode) => check(boxes[mode], 612));
      write(d.reference, 287, 642, 481);
      write(formatMoney(d.cardCharge), 952, 642, 85);
      write(d.cashCollectedBy, 202, 675, 212);
      write(d.handedTo, 545, 675, 226);
      write(d.time, 891, 675, 145);
      d.instalments.forEach((row, i) => {
        write(formatMoney(row.amount), 285, 806 + i * 31.3, 236);
        write(formatDate(row.dueDate), 565, 806 + i * 31.3, 190);
        write(row.status ? row.status[0].toUpperCase() + row.status.slice(1) : '', 802, 806 + i * 31.3, 237);
      });
      write(d.emiProvider, 485, 907, 556);
      write(d.helpline, 181, 1353, 242);
      check(d.poVerified === 'yes' ? 894 : 967, 1395);
      doc.end();
    } catch (error) { doc.destroy(); reject(error); }
  });
}

module.exports = { validateReceipt, renderReceipt, receiptFileName, PAYMENT_MODES, validDate };
