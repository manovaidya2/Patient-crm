const path = require('path');
const PDFDocument = require('pdfkit');
const { validDate } = require('./partPaymentReceipt');
const { BILL_DESCRIPTIONS, calculateFinalBill, toPaise } = require('./finalBillMath');
const fail = (message) => { throw Object.assign(new Error(message), { statusCode: 400 }); };
function text(value, label, max = 80) {
  if (value == null) return '';
  if (typeof value !== 'string' || value.length > max) fail(`${label} must be text up to ${max} characters`);
  return value.trim().replace(/[\r\n\t]+/g, ' ');
}
async function validateFinalBill(input, settings) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) fail('Final bill details are required');
  const d = {};
  for (const field of ['patientName', 'patientCode', 'guardianName', 'age', 'gender', 'issuedBy']) d[field] = text(input[field], field);
  if (!d.patientName) fail('Patient name is required');
  d.date = text(input.date, 'Invoice date', 10);
  if (!validDate(d.date)) fail('Enter a valid invoice date');
  if (!Array.isArray(input.items) || input.items.length !== BILL_DESCRIPTIONS.length) fail('All three invoice lines are required');
  const amount = (value, label) => {
    if (value === '' || value == null) fail(`${label} is required (enter 0 if not applicable)`);
    try { return toPaise(value) / 100; } catch (error) { fail(error.message); }
  };
  d.items = BILL_DESCRIPTIONS.map((description, index) => ({
    description, duration: text(input.items[index]?.duration, 'Date / duration'),
    amount: amount(input.items[index]?.amount, description),
  }));
  if (!Array.isArray(input.payments) || input.payments.length > 100) fail('Up to 100 payment receipt rows are supported');
  d.payments = input.payments.map((row, index) => {
    const date = text(row?.date, `Payment ${index + 1} date`, 10);
    if (!validDate(date)) fail(`Enter a valid date for payment ${index + 1}`);
    const particulars = text(row?.particulars, 'Payment particulars');
    if (!settings.paymentParticulars.includes(particulars)) fail('Payment particulars changed. Refresh dropdown options and select again');
    return { date, particulars, received: amount(row?.received, `Payment ${index + 1} received amount`) };
  });
  d.paymentStatus = text(input.paymentStatus, 'Payment status');
  if (!settings.paymentStatuses.includes(d.paymentStatus)) fail('Select a configured payment status');
  try { Object.assign(d, calculateFinalBill(d.items, d.payments)); } catch (error) { fail(error.message); }
  if (d.paymentStatus === 'FULLY PAID' && (d.outstanding > 0 || d.excessReceived > 0)) fail('FULLY PAID requires received amount to match the total amount');
  if (d.paymentStatus === 'UNPAID' && d.amountReceived > 0) fail('UNPAID cannot have received payments');
  if (d.paymentStatus === 'PARTIALLY PAID' && (d.amountReceived <= 0 || d.outstanding <= 0)) fail('PARTIALLY PAID requires a received amount and outstanding balance');
  return d;
}

function renderFinalBill(number, d) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 40, bufferPages: true, info: { Title: `Final Bill - ${number} - ${d.patientName}`, Author: 'ManoVaidya' } });
    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    try {
      doc.registerFont('Regular', path.join(__dirname, '../../assets/fonts/Mukta.ttf'));
      doc.registerFont('Bold', path.join(__dirname, '../../assets/fonts/Mukta-Bold.ttf'));
      const left = 40, width = doc.page.width - 80, right = left + width;
      const money = (value) => Number(value || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      const date = (value) => value.split('-').reverse().join('/');
      let y = 26;
      const write = (value, x, top, w, size = 10, bold = false, align = 'left') => {
        doc.font(bold ? 'Bold' : 'Regular').fontSize(size).fillColor('#18394e').text(String(value), x, top, { width: w, align });
      };
      const measure = (value, w, size = 10, bold = false) => doc.font(bold ? 'Bold' : 'Regular').fontSize(size).heightOfString(String(value), { width: w });
      const rule = (top) => doc.strokeColor('#879ba8').lineWidth(0.6).moveTo(left, top).lineTo(right, top).stroke();
      const box = (top, h, fill = '#ffffff') => doc.rect(left, top, width, h).fillAndStroke(fill, '#879ba8');
      const page = () => {
        doc.addPage(); y = 36;
        write('ManoVaidya | INVOICE & PAYMENT RECEIPT', left, y, width, 12, true);
        y += 22; write(`${number}  |  ${d.patientName}  |  ${d.patientCode || '-'}`, left, y, width, 9);
        y += measure(`${number}  |  ${d.patientName}  |  ${d.patientCode || '-'}`, width, 9) + 10; rule(y); y += 12;
      };
      const ensure = (h) => { if (y + h > 757) page(); };
      const section = (title) => { ensure(37); write(title, left, y, width, 11.4, true); y += 18; rule(y); y += 6; };
      const row = (values, widths, { bold = false, fill = '#ffffff', minHeight = 27, rightAlignLast = true } = {}) => {
        const height = Math.max(minHeight, ...values.map((v, i) => measure(v, widths[i] - 16, 9.5, bold) + 12));
        box(y, height, fill);
        let x = left;
        values.forEach((value, i) => {
          if (i) doc.moveTo(x, y).lineTo(x, y + height).strokeColor('#879ba8').stroke();
          write(value, x + 8, y + 5, widths[i] - 16, 9.5, bold, rightAlignLast && i === values.length - 1 ? 'right' : 'left');
          x += widths[i];
        });
        y += height;
      };
      doc.font('Bold').fontSize(27).fillColor('#7f42a3').text('ManoVaidya', left, y, { width, align: 'center' });
      y = 61; write('INVOICE & PAYMENT RECEIPT', left, y, width, 13, true, 'center');
      y = 86; write('+91-7823838638   |   manovaidya2@gmail.com   |   www.manovaidya.in', left, y, width, 9, false, 'center');
      y = 103; write('VS Plaza, near Vinayak Hospital, Atta Market, Pocket E, Sector 27, Noida, UP 201301', left, y, width, 8.7, false, 'center');
      y = 118; rule(y); y += 16;
      row([`Invoice No.: ${number}`, `Invoice Date: ${date(d.date)}`], [width * 0.62, width * 0.38], { bold: true, fill: '#eaf1f6', minHeight: 31 });
      y += 13; section('PATIENT DETAILS');
      row([`Patient: ${d.patientName}`, `Patient ID: ${d.patientCode || '-'}`], [width / 2, width / 2], { rightAlignLast: false });
      row([`Age / Gender: ${[d.age, d.gender].filter(Boolean).join(' / ') || '-'}`, `Father / Guardian: ${d.guardianName || '-'}`], [width / 2, width / 2], { rightAlignLast: false });
      y += 14; section('INVOICE DETAILS');
      const itemWidths = [32, 252, 111, width - 395];
      row(['No.', 'Description', 'Date / Duration', 'Amount (Rs.)'], itemWidths, { bold: true, fill: '#eaf1f6' });
      d.items.forEach((item, index) => row([index + 1, item.description, item.duration || '-', money(item.amount)], itemWidths, { minHeight: 32 }));
      row(['TOTAL AMOUNT (INCLUDING CARD CHARGE)', money(d.totalPayable)], [395, width - 395], { bold: true, fill: '#eaf1f6', minHeight: 32 });
      y += 12; section('PAYMENT RECEIPTS');
      const paymentWidths = [113, 282, width - 395];
      const paymentHeader = () => row(['Date', 'Payment Particulars', 'Received (Rs.)'], paymentWidths, { bold: true, fill: '#eaf1f6' });
      paymentHeader();
      d.payments.forEach((payment) => {
        const height = Math.max(27, measure(payment.particulars, 266, 9.5) + 12);
        if (y + height > 720) { page(); section('PAYMENT RECEIPTS (CONTINUED)'); paymentHeader(); }
        row([date(payment.date), payment.particulars, money(payment.received)], paymentWidths, { minHeight: 25 });
      });
      const wordsText = `Amount in Words: ${d.amountInWords} (including card charge).`;
      const statusText = `Payment Status: ${d.paymentStatus}   |   Outstanding: Rs. ${money(d.outstanding)}${d.excessReceived ? `   |   Excess received: Rs. ${money(d.excessReceived)}` : ''}`;
      const issuedText = `Issued By: ${d.issuedBy || 'Billing Desk'}`;
      ensure(32 + measure(statusText, width, 10.6, true) + measure(wordsText, width, 9.5) + measure(issuedText, width, 10.3, true) + 43);
      row(['TOTAL RECEIVED', money(d.amountReceived)], [395, width - 395], { bold: true, fill: '#eaf1f6', minHeight: 32 });
      y += 9; write(statusText, left, y, width, 10.6, true); y += measure(statusText, width, 10.6, true) + 10;
      write(wordsText, left, y, width, 9.5); y += measure(wordsText, width, 9.5) + 13;
      write(issuedText, left, y, width, 10.3, true); y += measure(issuedText, width, 10.3, true) + 7;
      write('This invoice records the stated charges and receipts. It is not a clinical prescription.', left, y, width, 8.7);
      const range = doc.bufferedPageRange();
      for (let i = 0; i < range.count; i++) {
        doc.switchToPage(i);
        write(`${number}  |  Page ${i + 1} of ${range.count}`, left, 782, width, 8, false, 'right');
      }
      doc.end();
    } catch (error) { doc.destroy(); reject(error); }
  });
}
module.exports = { validateFinalBill, renderFinalBill };
