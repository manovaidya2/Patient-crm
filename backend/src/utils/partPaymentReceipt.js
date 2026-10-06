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
  if (input.paymentModes != null && (!Array.isArray(input.paymentModes) || input.paymentModes.some((mode) => !PAYMENT_MODES.includes(mode)))) fail('Invalid payment mode');
  d.paymentModes = [...new Set(input.paymentModes || [])];
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

const TERMS = [
  ['Medicine Preparation:', 'Customized Ayurvedic formulations are prepared against the approved treatment order. The signed Treatment Consent and accepted Purchase Order officially authorize and confirm initiation of preparation, normally on the same day as PO acceptance. Estimated preparation time is 3-4 working days, subject to weather, formulation requirements and unforeseen circumstances.'],
  ['Cancellation & Refund:', 'Once customized medicine preparation has commenced, cancellation or refund requests solely due to a change of mind will not be accepted. Other concerns will be handled under applicable requirements.'],
  ['Payment & Dispatch:', 'Medicines are dispatched only after preparation is complete and full outstanding payment is received and verified. Dispatch is by courier only from the designated medicine dispensing unit to the registered address; self-pickup is not available.'],
  ['Delivery & Re-dispatch:', 'Courier delivery is estimated at up to 7 days after dispatch authorization, subject to courier operations and unforeseen delays. Incorrect addresses or repeated recipient unavailability may result in additional communicated re-dispatch charges; courier or clinic errors are handled separately.'],
  ['Receipt & Explanation:', 'After receiving the parcel, the patient/guardian should confirm receipt via the assigned helpline. Medicine-use explanation and treatment activation are arranged afterward.'],
  ['Consultation & Sessions:', 'Clinic/enquiry hours: 11:00 AM-6:00 PM; closed Wednesdays and approved holidays. Hours/holiday plan may vary. Consultations by appointment; sessions as scheduled. Up to 4 patient-requested reschedulings per course. Clinic-initiated changes excluded.'],
  ['Enquiry Support:', 'Multiple treatment-related enquiries may be raised via the assigned helpline during working hours. Queries requiring a clinical decision will be escalated to the doctor.'],
  ['Documentation:', 'The signed Treatment Consent and Purchase Order record treatment authorization and agreed payment terms. No separate patient signature is required on this bill.'],
];

function renderColoredReceipt(number, d) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 0, info: { Title: `Part-payment receipt - ${number} - ${d.patientName}`, Author: 'ManoVaidya' } });
    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    try {
      doc.registerFont('Receipt', path.join(__dirname, '../../assets/fonts/Mukta.ttf'));
      doc.registerFont('ReceiptBold', path.join(__dirname, '../../assets/fonts/Mukta-Bold.ttf'));
      const scale = doc.page.width / 1086;
      const sx = (value) => value * scale;
      const brand = '#7B3FA1';
      const ink = '#28465B';
      const headingInk = '#1E3A4E';
      const line = '#78909F';
      const headerFill = '#EAF2F7';
      const paper = '#FFFFFF';
      const left = 32;
      const right = 1054;
      const width = right - left;
      const text = (value, x, y, w, size = 16, bold = false, align = 'left', color = ink, options = {}) => {
        if (value === '' || value == null) return;
        doc.font(bold ? 'ReceiptBold' : 'Receipt').fontSize(sx(size)).fillColor(color)
          .text(String(value), sx(x), sx(y), { width: sx(w), align, lineBreak: options.lineBreak !== false, ...options });
      };
      const rule = (y, x1 = left, x2 = right, thickness = 1.2) => doc.save().strokeColor(line).lineWidth(sx(thickness)).moveTo(sx(x1), sx(y)).lineTo(sx(x2), sx(y)).stroke().restore();
      const rect = (x, y, w, h, fill = paper) => doc.save().rect(sx(x), sx(y), sx(w), sx(h)).fillAndStroke(fill, line).restore();
      const vRule = (x, y, h) => doc.save().strokeColor(line).lineWidth(sx(1)).moveTo(sx(x), sx(y)).lineTo(sx(x), sx(y + h)).stroke().restore();
      const section = (label, y) => {
        text(label, left, y, width, 19, true, 'left', headingInk, { lineBreak: false });
        rule(y + 28);
      };
      const cellText = (value, x, y, w, bold = false, align = 'left') => text(value, x + 14, y + 8, w - 28, 15, bold, align, bold ? headingInk : ink, { lineBreak: false });

      doc.rect(0, 0, doc.page.width, doc.page.height).fill(paper);
      text('ManoVaidya', 0, 7, 1086, 43, true, 'center', brand, { lineBreak: false });
      text('TREATMENT ORDER | PART-PAYMENT BILL & RECEIPT', 0, 70, 1086, 21, true, 'center', headingInk, { lineBreak: false });
      text('+91-7823838638   |   manovaidya2@gmail.com   |   www.manovaidya.in', 0, 105, 1086, 15, false, 'center', ink, { lineBreak: false });
      text('VS Plaza, near Vinayak Hospital, Atta Market, Pocket E, Sector 27, Noida, UP 201301', 0, 127, 1086, 14, false, 'center', ink, { lineBreak: false });
      rule(155, left, right, 1.5);

      const infoY = 174;
      rect(left, infoY, width, 52, headerFill);
      vRule(462, infoY, 52);
      vRule(755, infoY, 52);
      text('Invoice No.:', 49, infoY + 10, 130, 15, true, 'left', headingInk, { lineBreak: false });
      text(number, 174, infoY + 10, 270, 15, false, 'left', ink, { lineBreak: false });
      text('Date:', 480, infoY + 10, 70, 15, true, 'left', headingInk, { lineBreak: false });
      text(formatDate(d.date), 548, infoY + 10, 185, 15, false, 'left', ink, { lineBreak: false });
      text('Purchase Order No.:', 773, infoY + 10, 185, 15, true, 'left', headingInk, { lineBreak: false });
      text(d.purchaseOrder, 949, infoY + 10, 88, 15, false, 'left', ink, { lineBreak: false });

      section('PATIENT DETAILS', 248);
      const patientY = 289;
      rect(left, patientY, width, 82);
      text('Patient Name:', 49, patientY + 12, 145, 16, true, 'left', headingInk, { lineBreak: false });
      text(d.patientName, 191, patientY + 12, 345, 16, false, 'left', ink, { lineBreak: false });
      text('Patient ID:', 600, patientY + 12, 125, 16, true, 'left', headingInk, { lineBreak: false });
      text(d.patientCode || '-', 724, patientY + 12, 310, 16, false, 'left', ink, { lineBreak: false });
      text('Age / Gender:', 49, patientY + 45, 145, 16, true, 'left', headingInk, { lineBreak: false });
      text([d.age, d.gender].filter(Boolean).join(' / ') || '-', 191, patientY + 45, 345, 16, false, 'left', ink, { lineBreak: false });
      text('Father / Guardian:', 600, patientY + 45, 180, 16, true, 'left', headingInk, { lineBreak: false });
      text(d.guardianName || '-', 774, patientY + 45, 260, 16, false, 'left', ink, { lineBreak: false });

      section('BILLING & AGREED PAYMENT SCHEDULE', 394);
      const billingY = 435;
      const amountX = 802;
      const baseRows = [
        ['Consultation Fee (only if charged in this transaction)', d.consultationFee, false],
        ['Customized Ayurvedic treatment / formulation order (as per signed PO)', d.treatmentAmount, false],
        ['Approved adjustment / concession (if applicable)', d.adjustment, false],
        ['Total agreed payable', d.totalPayable, true],
        ['Amount received against this bill', d.amountReceived, false],
      ];
      if (d.cardCharge !== '' && d.cardCharge != null && Number(d.cardCharge) > 0) baseRows.push(['Card charge (3% of paid amount)', d.cardCharge, false]);
      baseRows.push(['Outstanding balance after this payment', d.outstanding, false]);
      const rowHeight = 32;
      rect(left, billingY, width, 38, headerFill);
      vRule(amountX, billingY, 38);
      cellText('Description', left, billingY, amountX - left, true);
      cellText('Amount (Rs.)', amountX, billingY, right - amountX, true);
      baseRows.forEach(([label, amount, bold], index) => {
        const y = billingY + 38 + index * rowHeight;
        rect(left, y, width, rowHeight, bold ? headerFill : paper);
        vRule(amountX, y, rowHeight);
        cellText(label, left, y, amountX - left, bold);
        cellText(`Rs.  ${formatMoney(amount)}`, amountX, y, right - amountX, bold);
      });
      let y = billingY + 38 + baseRows.length * rowHeight + 24;

      section('AGREED FUTURE INSTALMENTS', y);
      y += 41;
      const cols = [left, 267, 552, 770, right];
      rect(left, y, width, 38, headerFill);
      for (const x of cols.slice(1, -1)) vRule(x, y, 38);
      ['Instalment', 'Agreed amount (Rs.)', 'Due date', 'Received / Pending'].forEach((label, index) => cellText(label, cols[index], y, cols[index + 1] - cols[index], true, index ? 'center' : 'left'));
      const instalmentHeight = 32;
      d.instalments.forEach((entry, index) => {
        const rowY = y + 38 + index * instalmentHeight;
        rect(left, rowY, width, instalmentHeight);
        for (const x of cols.slice(1, -1)) vRule(x, rowY, instalmentHeight);
        cellText(index === 2 ? 'Part 3 / Other' : `Part ${index + 1}`, cols[0], rowY, cols[1] - cols[0]);
        cellText(formatMoney(entry.amount), cols[1], rowY, cols[2] - cols[1], false, 'center');
        cellText(formatDate(entry.dueDate), cols[2], rowY, cols[3] - cols[2], false, 'center');
        cellText(entry.status ? entry.status[0].toUpperCase() + entry.status.slice(1) : '', cols[3], rowY, cols[4] - cols[3], false, 'center');
      });
      const emiY = y + 38 + d.instalments.length * instalmentHeight;
      rect(left, emiY, width, 36);
      text('EMI Provider / Application Ref. (if applicable):', 49, emiY + 8, 430, 14.5, true, 'left', headingInk, { lineBreak: false });
      text(d.emiProvider, 470, emiY + 8, 560, 14.5, false, 'left', ink, { lineBreak: false });
      y = emiY + 56;

      section('TERMS & CONDITIONS', y);
      y += 42;
      const termsTop = y;
      const termsHeight = 375;
      rect(left, termsTop, width, termsHeight);
      let termY = termsTop + 13;
      TERMS.forEach(([label, body], index) => {
        text(`${index + 1}. ${label} ${body}`, 50, termY, 980, 13.2, false, 'left', ink, { lineGap: sx(-1.7) });
        termY = doc.y / scale + 2.5;
      });

      const footerY = termsTop + termsHeight + 24;
      text('Patient Helpline:', left + 3, footerY, 150, 16, true, 'left', headingInk, { lineBreak: false });
      text(d.helpline || '', 174, footerY, 250, 16, false, 'left', ink, { lineBreak: false });
      rule(footerY + 24, 174, 425, 0.9);
      text('www.manovaidya.in', 790, footerY, 264, 16, true, 'right', headingInk, { lineBreak: false });
      text('Issued by: Billing Desk', left + 3, footerY + 45, 330, 16, false, 'left', ink, { lineBreak: false });
      text('PO verified:', 796, footerY + 45, 120, 16, false, 'left', ink, { lineBreak: false });
      const check = (x, label, selected) => {
        doc.save().lineWidth(sx(1.2)).rect(sx(x), sx(footerY + 47), sx(17), sx(17));
        selected ? doc.fillAndStroke('#2E8B78', '#2E8B78') : doc.strokeColor(line).stroke();
        doc.restore();
        text(label, x + 26, footerY + 43, 90, 16, false, 'left', ink, { lineBreak: false });
      };
      check(911, 'Yes', d.poVerified === 'yes');
      check(990, 'Pending', d.poVerified !== 'yes');
      doc.end();
    } catch (error) { doc.destroy(); reject(error); }
  });
}

function renderReceipt(number, d, pdfStyle = 'black-white') {
  if (pdfStyle === 'color') return renderColoredReceipt(number, d);
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 0, info: { Title: `Part-payment receipt - ${number} - ${d.patientName}`, Author: 'ManoVaidya' } });
    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    try {
      const hasCardCharge = d.cardCharge !== '' && d.cardCharge != null && Number(d.cardCharge) > 0;
      const lowerOffset = hasCardCharge ? 31 : 0;
      const scale = doc.page.width / 1086;
      const top = (doc.page.height - (1331 + lowerOffset) * scale) / 2;
      doc.image(path.join(__dirname, `../../assets/receipts/part-payment-print${hasCardCharge ? '-card' : ''}.png`), 0, top, { width: doc.page.width });
      doc.registerFont('Receipt', path.join(__dirname, '../../assets/fonts/Mukta.ttf'));
      doc.font('Receipt');
      // Keep the original template positions while rendering all entered values in black.
      const write = (value, x, y, width, size = 16) => {
        if (value === '' || value == null) return;
        const text = String(value);
        let fontSize = size * scale;
        doc.fontSize(fontSize);
        while (doc.widthOfString(text) > width * scale && fontSize > 5) doc.fontSize(fontSize -= 0.2);
        doc.fillColor('#000000').text(text, x * scale, top + y * scale, { width: width * scale, lineBreak: false });
      };
      const check = (x, y) => doc.save().fillColor('#000000').rect((x + 2) * scale, top + (y + 2) * scale, 13 * scale, 13 * scale).fill().restore();
      write(number, 146, 156, 278);
      write(formatDate(d.date), 494, 156, 210);
      write(d.purchaseOrder, 904, 156, 139);
      write(d.patientName, 190, 249, 390);
      write(d.patientCode, 692, 249, 350);
      write([d.age, d.gender].filter(Boolean).join(' / '), 180, 277, 400);
      write(d.guardianName, 750, 277, 292);
      ['consultationFee', 'treatmentAmount', 'adjustment', 'totalPayable', 'amountReceived', 'outstanding'].forEach((key, i) => write(formatMoney(d[key]), 852, 401 + i * 31.3 + (i === 5 ? lowerOffset : 0), 188));
      if (hasCardCharge) {
        doc.font('Helvetica-Bold');
        write('Card charge (3% of paid amount)', 50, 561, 735, 16);
        doc.font('Receipt');
        write(formatMoney(d.cardCharge), 852, 557.5, 188, 16);
      }
      d.instalments.forEach((row, i) => {
        write(formatMoney(row.amount), 285, 689 + lowerOffset + i * 31.3, 236);
        write(formatDate(row.dueDate), 565, 689 + lowerOffset + i * 31.3, 190);
        write(row.status ? row.status[0].toUpperCase() + row.status.slice(1) : '', 802, 689 + lowerOffset + i * 31.3, 237);
      });
      write(d.emiProvider, 485, 790 + lowerOffset, 556);
      write(d.helpline, 181, 1236 + lowerOffset, 242);
      check(d.poVerified === 'yes' ? 894 : 967, 1278 + lowerOffset);
      doc.end();
    } catch (error) { doc.destroy(); reject(error); }
  });
}

module.exports = { validateReceipt, renderReceipt, receiptFileName, PAYMENT_MODES, validDate };
