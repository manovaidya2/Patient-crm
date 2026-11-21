// Digital purchase order as a PDF to download: the same paper the parent signed (patient & phase, components,
// program value & payment, the consent ticked and the signature), A4, Hindi included (Mukta font). Only a signed
// purchase order is downloaded (digitalPoController.downloadPdf); it is made fresh each time, nothing is stored.
const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');
const { imageType } = require('./digitalPo');

const FONT = path.join(__dirname, '../../assets/fonts/Mukta.ttf');
const BOLD = path.join(__dirname, '../../assets/fonts/Mukta-Bold.ttf');
const LOGO = path.join(__dirname, '../../assets/manovaidya-logo.jpg');
const C = { ink: '#273238', muted: '#66756D', brand: '#1F5F4A', dark: '#173F33', line: '#D9E2DC', soft: '#F4F7F3', band: '#EAF3EE', green: '#1F6B41', white: '#FFFFFF' };

const rupees = (value) => `₹ ${Number(value || 0).toLocaleString('en-IN')}`;
const dayText = (day) => (day ? new Date(`${day}T00:00:00Z`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '');
const whenText = (value) => (value ? new Date(value).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' }) : '');
const slug = (value, max = 60) => String(value || '').replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, max);
const pdfFileName = (refNo, patientName) => `Purchase-Order-${slug(refNo, 40) || 'DPO'}-${slug(patientName) || 'patient'}.pdf`;

// The signature as pdfkit takes it (PNG / JPEG). A WebP photo is turned into PNG; anything else is left out.
const pdfImage = async (buffer) => {
  const type = imageType(buffer);
  if (type === 'png' || type === 'jpg') return buffer;
  if (type === 'webp') {
    try { return await require('sharp')(buffer).png().toBuffer(); } catch { return null; }
  }
  return null;
};

// refNo: "DPO-…" (with " · v2" for a later version). signed: { at, signerName, relation, consents, signatureKind }.
async function renderDigitalPoPdf({ refNo, snapshot, signed = null, consentItems = [], signature = null }) {
  const image = signature ? await pdfImage(signature) : null;
  const s = snapshot || {};
  const p = s.patient || {};
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 0, bufferPages: true, info: { Title: `Digital Purchase Order - ${refNo} - ${p.name || ''}`, Author: 'Manovaidya' } });
    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    try {
      doc.registerFont('Regular', FONT);
      doc.registerFont('Bold', BOLD);
      const W = doc.page.width, L = 40, R = W - 40, CW = R - L, TOP = 40, BOTTOM = doc.page.height - 48;
      const t = (value, x, y, w, size = 10, bold = false, align = 'left', fill = C.ink) => doc.font(bold ? 'Bold' : 'Regular').fontSize(size).fillColor(fill).text(String(value ?? ''), x, y, { width: w, align, lineGap: 1 });
      const h = (value, w, size = 10, bold = false) => doc.font(bold ? 'Bold' : 'Regular').fontSize(size).heightOfString(String(value ?? ''), { width: w, lineGap: 1 });
      const hr = (y, color = C.line, width = 0.7, x1 = L, x2 = R) => doc.save().strokeColor(color).lineWidth(width).moveTo(x1, y).lineTo(x2, y).stroke().restore();
      let y = TOP;
      const ensure = (need) => { if (y + need > BOTTOM) { doc.addPage(); y = TOP; } };
      const heading = (n, title) => {
        ensure(48);
        y += 14;
        t(`${n}.  ${title}`, L, y, CW, 12, true, 'left', C.dark);
        y += 19; hr(y); y += 8;
      };

      // Header: logo + title on the left, number and date on the right.
      try { doc.image(LOGO, L, y - 2, { fit: [40, 40] }); } catch { /* no logo: the title stands alone */ }
      t('MANOVAIDYA — PURCHASE ORDER', L + 50, y, CW - 230, 15, true, 'left', C.dark);
      t('Digital · डिजिटल परचेज़ ऑर्डर', L + 50, y + 21, CW - 230, 9.5, false, 'left', C.muted);
      t(refNo, R - 180, y + 2, 180, 10.5, true, 'right');
      t(dayText(s.date), R - 180, y + 18, 180, 9.5, false, 'right', C.muted);
      y += 46; hr(y, C.brand, 1.6); y += 4;

      // 1. Patient & phase: label / value boxes, three to a row.
      heading(1, 'Patient & phase');
      const fields = [['Patient name', p.name], ['Patient ID', p.patientId], ['Program', p.program], ['Age', p.age], ['Phase', p.phase ? `Phase ${p.phase}` : ''], ['Parent / guardian', p.parent], ['Post-counsellor', p.counsellor]];
      const gap = 8, colW = (CW - gap * 2) / 3;
      for (let i = 0; i < fields.length; i += 3) {
        const row = fields.slice(i, i + 3);
        const boxH = Math.max(...row.map(([, value]) => 22 + h(value || '—', colW - 16, 10.5, true)));
        ensure(boxH + gap);
        row.forEach(([label, value], k) => {
          const x = L + k * (colW + gap);
          doc.save().roundedRect(x, y, colW, boxH, 5).fill(C.soft).restore();
          t(label.toUpperCase(), x + 8, y + 6, colW - 16, 7.5, true, 'left', C.muted);
          t(value || '—', x + 8, y + 16, colW - 16, 10.5, true);
        });
        y += boxH + gap;
      }

      // 2. Components and their values.
      heading(2, 'Treatment & support components');
      const valueW = 110, nameW = CW - valueW - 24;
      hr(y);
      for (const item of s.components || []) {
        const rowH = 14 + h(item.name, nameW, 10.5, true) + (item.scope ? h(item.scope, nameW, 9) + 1 : 0);
        ensure(rowH);
        t(item.name, L + 8, y + 7, nameW, 10.5, true);
        if (item.scope) t(item.scope, L + 8, y + 7 + h(item.name, nameW, 10.5, true) + 1, nameW, 9, false, 'left', C.muted);
        if (item.value) t(rupees(item.value), R - valueW - 8, y + 7, valueW, 10.5, true, 'right');
        else t('Included', R - valueW - 8, y + 8, valueW, 9.5, true, 'right', C.brand);
        y += rowH; hr(y);
      }
      if (s.otherComponent) {
        const line = `Other doctor-recommended component: ${s.otherComponent}`;
        const rowH = 14 + h(line, CW - 16, 10);
        ensure(rowH);
        t(line, L + 8, y + 7, CW - 16, 10);
        y += rowH; hr(y);
      }

      // 3. Program value & payment.
      heading(3, 'Program value & payment');
      const money = (label, value, { bold = false, fill = C.ink, band = false, size = 10.5 } = {}) => {
        const rowH = 12 + Math.max(h(label, CW - 200, 10.5, bold), h(value, 170, size, bold));
        ensure(rowH);
        if (band) doc.save().rect(L, y, CW, rowH).fill(C.band).restore();
        t(label, L + 8, y + 6, CW - 200, 10.5, bold, 'left', bold ? C.ink : C.muted);
        t(value, R - 178, y + 6 - (size - 10.5) / 2, 170, size, bold, 'right', fill);
        y += rowH; hr(y, band ? C.brand : C.line, band ? 1.2 : 0.7);
      };
      hr(y);
      money('Selected components value', rupees(s.referenceValue));
      if (s.concession > 0) money('Approved concession', `− ${rupees(s.concession)}`, { fill: C.green });
      money('Approved program fee', rupees(s.approvedFee), { bold: true, band: true, size: 13 });
      if (s.paymentPlan) money('Payment plan', s.paymentPlan);
      for (const part of s.parts || []) {
        const due = part.due !== null && part.due !== undefined ? `   (balance after: ${rupees(part.due)})` : '';
        money(`Part ${part.part}`, `${rupees(part.amount)}${due}`);
      }
      if (s.otherPlan) {
        const line = `Approved plan / note: ${s.otherPlan}`;
        const rowH = 12 + h(line, CW - 16, 10);
        ensure(rowH);
        t(line, L + 8, y + 6, CW - 16, 10);
        y += rowH; hr(y);
      }
      if (s.note) { ensure(26); y += 6; t(s.note, L, y, CW, 8.5, false, 'left', C.muted); y += h(s.note, CW, 8.5) + 2; }

      if (signed) {
        // 4. The consent the parent ticked (English + Hindi), as on the link.
        heading(4, 'Parent acknowledgement & consent');
        const textW = CW - 22;
        for (const item of consentItems) {
          const ticked = (signed.consents || []).includes(item.key);
          const rowH = h(item.en, textW, 10) + h(item.hi, textW, 9) + 8;
          ensure(rowH);
          const bx = L + 2, by = y + 3;
          if (ticked) {
            doc.save().roundedRect(bx, by, 11, 11, 2).fill(C.brand).restore();
            doc.save().strokeColor(C.white).lineWidth(1.6).moveTo(bx + 2.4, by + 5.8).lineTo(bx + 4.7, by + 8.2).lineTo(bx + 8.8, by + 3).stroke().restore();
          } else {
            doc.save().strokeColor(C.muted).lineWidth(0.9).roundedRect(bx, by, 11, 11, 2).stroke().restore();
          }
          t(item.en, L + 22, y, textW, 10);
          t(item.hi, L + 22, y + h(item.en, textW, 10), textW, 9, false, 'left', C.muted);
          y += rowH;
        }

        // 5. Signature: the image, who signed and when.
        heading(5, 'Signature');
        ensure(130);
        const boxW = 270, boxH = 118;
        doc.save().strokeColor(C.line).lineWidth(0.9).roundedRect(L, y, boxW, boxH, 6).stroke().restore();
        let drawn = false;
        if (image) {
          try { doc.image(image, L + 8, y + 8, { fit: [boxW - 16, boxH - 16], align: 'center', valign: 'center' }); drawn = true; } catch { drawn = false; }
        }
        if (!drawn) t('No signature file', L, y + boxH / 2 - 6, boxW, 9.5, false, 'center', C.muted);
        const sx = L + boxW + 20, sw = R - sx;
        let sy = y + 20;
        t(signed.signerName, sx, sy, sw, 13, true); sy += h(signed.signerName, sw, 13, true) + 3;
        const how = `${signed.relation}${signed.signatureKind === 'photo' ? ' · signature photo uploaded' : ' · signed on the screen'}`;
        t(how, sx, sy, sw, 9.5, false, 'left', C.muted); sy += h(how, sw, 9.5) + 3;
        t(`Signed ${whenText(signed.at)} (IST)`, sx, sy, sw, 9.5, false, 'left', C.muted); sy += 16;
        t('Signed digitally on the Manovaidya purchase-order link after ticking every consent point above.', sx, sy, sw, 8.5, false, 'left', C.muted);
        y += boxH + 8;
      }

      // Footer on every page: the number, who signed, the page.
      const range = doc.bufferedPageRange();
      for (let i = 0; i < range.count; i += 1) {
        doc.switchToPage(range.start + i);
        hr(doc.page.height - 36, C.line, 0.6);
        const left = `${refNo} · Digital purchase order${signed ? ` · signed by ${signed.signerName} on ${whenText(signed.at)}` : ''}`;
        t(left, L, doc.page.height - 30, CW - 70, 7.5, false, 'left', C.muted);
        t(`Page ${i + 1} of ${range.count}`, R - 70, doc.page.height - 30, 70, 7.5, false, 'right', C.muted);
      }
      doc.end();
    } catch (error) { doc.destroy(); reject(error); }
  });
}

const readSignature = (dir, file) => {
  const name = file ? path.basename(file) : '';
  const full = name ? path.join(dir, name) : '';
  return full && fs.existsSync(full) ? fs.readFileSync(full) : null;
};

module.exports = { renderDigitalPoPdf, pdfFileName, pdfImage, readSignature };
