const path = require('path');
const PDFDocument = require('pdfkit');
const { validDate } = require('./partPaymentReceipt');
const { toPaise, amountInWords } = require('./finalBillMath');

const PAYMENT_MODES = ['cash', 'online', 'card'];
const MODE_LABELS = { cash: 'Cash', online: 'Online', card: 'Card' };
const fail = (message) => { throw Object.assign(new Error(message), { statusCode: 400 }); };
function text(value, label, max = 80) {
  if (value == null) return '';
  if (typeof value !== 'string' || value.length > max) fail(`${label} must be text up to ${max} characters`);
  return value.trim().replace(/[\r\n\t]+/g, ' ');
}

function validateConsultationBill(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) fail('Consultation bill details are required');
  const d = {};
  for (const field of ['patientName', 'patientCode', 'guardianName', 'age', 'gender', 'issuedBy', 'reference']) d[field] = text(input[field], field);
  if (!d.patientName) fail('Patient name is required');
  d.date = text(input.date, 'Invoice date', 10);
  if (!validDate(d.date)) fail('Enter a valid invoice date');
  d.consultationDate = text(input.consultationDate, 'Consultation date', 10);
  if (d.consultationDate && !validDate(d.consultationDate)) fail('Enter a valid consultation date');
  d.paymentDate = text(input.paymentDate, 'Payment date', 10) || d.date;
  if (!validDate(d.paymentDate)) fail('Enter a valid payment date');
  d.paymentMode = text(input.paymentMode, 'Payment mode', 10);
  if (!PAYMENT_MODES.includes(d.paymentMode)) fail('Select a valid payment mode');
  try {
    const paise = toPaise(input.amount);
    if (paise <= 0) fail('Consultation fee must be greater than 0');
    d.amount = paise / 100;
  } catch (error) { fail(error.message); }
  d.amountReceived = d.amount;
  d.outstanding = 0;
  d.amountInWords = amountInWords(d.amount);
  return d;
}

function renderConsultationBill(number, d, pdfStyle = 'black-white') {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 0, info: { Title: `Consultation Invoice - ${number} - ${d.patientName}`, Author: 'ManoVaidya' } });
    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    try {
      const color = pdfStyle === 'color';
      const c = color
        ? { ink: '#28465B', muted: '#5B7285', brand: '#7B3FA1', head: '#1E3A4E', headText: '#FFFFFF', line: '#C9D5DE', band: '#F3F7FA' }
        : { ink: '#000000', muted: '#444444', brand: '#000000', head: '#222222', headText: '#FFFFFF', line: '#999999', band: '#F2F2F2' };
      doc.registerFont('Regular', path.join(__dirname, '../../assets/fonts/Mukta.ttf'));
      doc.registerFont('Bold', path.join(__dirname, '../../assets/fonts/Mukta-Bold.ttf'));
      const W = doc.page.width, L = 48, R = W - 48, CW = R - L;
      const money = (v) => Number(v || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      const date = (v) => (v ? v.split('-').reverse().join('/') : '-');
      const t = (value, x, y, w, size = 10, bold = false, align = 'left', fill = c.ink) => doc.font(bold ? 'Bold' : 'Regular').fontSize(size).fillColor(fill).text(String(value), x, y, { width: w, align });
      const h = (value, w, size = 10, bold = false) => doc.font(bold ? 'Bold' : 'Regular').fontSize(size).heightOfString(String(value), { width: w });
      const hr = (y, x1 = L, x2 = R, col = c.line) => doc.save().strokeColor(col).lineWidth(0.7).moveTo(x1, y).lineTo(x2, y).stroke().restore();

      // Header: brand on the left, INVOICE and clinic on the right
      t('ManoVaidya', L, 44, 280, 34, true, 'left', c.brand);
      t('Ayurvedic Clinic', L, 84, 280, 11, false, 'left', c.muted);
      t('INVOICE', W / 2, 44, W / 2 - 48, 30, false, 'right', c.ink);
      t('ManoVaidya Clinic', W / 2, 82, W / 2 - 48, 10.5, true, 'right');
      t('VS Plaza, near Vinayak Hospital, Atta Market,', W / 2, 97, W / 2 - 48, 9, false, 'right', c.muted);
      t('Pocket E, Sector 27, Noida, UP 201301', W / 2, 109, W / 2 - 48, 9, false, 'right', c.muted);
      t('+91-7823838638  |  manovaidya2@gmail.com  |  www.manovaidya.in', W / 2 - 100, 123, W / 2 + 52, 9, false, 'right', c.muted);
      hr(148);

      // Bill to (left) and invoice meta (right)
      let y = 205;
      t('Bill to', L, y, 200, 9, false, 'left', c.muted);
      t(d.patientName, L, y + 14, 270, 12, true);
      let ly = y + 14 + h(d.patientName, 270, 12, true) + 2;
      for (const line of [d.patientCode && `Patient ID: ${d.patientCode}`, d.guardianName && `Father / Guardian: ${d.guardianName}`, [d.age, d.gender].filter(Boolean).join(' / ') && `Age / Gender: ${[d.age, d.gender].filter(Boolean).join(' / ')}`].filter(Boolean)) {
        t(line, L, ly, 270, 9.5, false, 'left', c.muted); ly += 13;
      }
      const mx = 330, mw = R - mx;
      const meta = [['Invoice Number:', number], ['Invoice Date:', date(d.date)], ['Payment Date:', date(d.paymentDate)], ['Payment Mode:', MODE_LABELS[d.paymentMode]]];
      meta.forEach(([k, v], i) => { t(k, mx, y + i * 15, 110, 9.5, true); t(v, mx + 110, y + i * 15, mw - 110, 9.5, false, 'right'); });
      const dueY = y + meta.length * 15 + 2;
      doc.rect(mx, dueY, mw, 22).fill(c.band);
      t('Amount Due (INR):', mx + 6, dueY + 5, 110, 9.5, true); t('Rs. 0.00', mx + 110, dueY + 5, mw - 116, 9.5, true, 'right');
      y = Math.max(ly, dueY + 22) + 48;

      // Items table
      const col = { item: L + 12, qty: L + CW * 0.56, price: L + CW * 0.70, amount: L + CW * 0.84 };
      doc.rect(L, y, CW, 26).fill(c.head);
      t('Items', col.item, y + 7, 200, 9.5, true, 'left', c.headText);
      t('Quantity', col.qty - 20, y + 7, 70, 9.5, true, 'center', c.headText);
      t('Price', col.price - 10, y + 7, 80, 9.5, true, 'right', c.headText);
      t('Amount', col.amount, y + 7, R - col.amount - 12, 9.5, true, 'right', c.headText);
      y += 26;
      t('Consultation Fee', col.item, y + 12, 250, 10, true);
      t(d.consultationDate ? `Consultation on ${date(d.consultationDate)}` : 'Doctor consultation', col.item, y + 26, 250, 9, false, 'left', c.muted);
      t('1', col.qty - 20, y + 12, 70, 10, false, 'center');
      t(money(d.amount), col.price - 10, y + 12, 80, 10, false, 'right');
      t(money(d.amount), col.amount, y + 12, R - col.amount - 12, 10, false, 'right');
      y += 66; hr(y);

      // Totals
      const lx = L + CW * 0.56, vw = R - lx;
      const total = (label, value, bold = false) => { t(label, lx, y + 9, vw * 0.55, 9.5, bold); t(value, lx + vw * 0.55, y + 9, vw * 0.45 - 12, 9.5, bold, 'right'); y += 28; };
      total('Total:', money(d.amount), true);
      total('Amount Paid:', money(d.amount));
      hr(y, lx, R);
      total('Balance Due (INR):', money(0), true);

      y += 30;
      const reference = d.reference ? `Payment reference: ${d.reference}` : '';
      for (const [text, size, bold, fill] of [[`Amount in words: ${d.amountInWords}.`, 9.5, false, c.ink], [reference, 9.5, false, c.ink], [`Issued by: ${d.issuedBy || 'Billing Desk'}`, 10, true, c.ink]]) {
        if (!text) continue;
        t(text, L, y, CW, size, bold, 'left', fill); y += h(text, CW, size, bold) + 12;
      }
      y += 40; hr(y); y += 12;
      t('This invoice records the consultation fee received. It is not a clinical prescription.  |  Thank you for choosing ManoVaidya.', L, y, CW, 8.5, false, 'center', c.muted);
      doc.end();
    } catch (error) { doc.destroy(); reject(error); }
  });
}

module.exports = { validateConsultationBill, renderConsultationBill, PAYMENT_MODES };
