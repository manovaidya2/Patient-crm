const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');
const fontkit = require('fontkit');
let puppeteer = null;
try {
  puppeteer = require('puppeteer-core');
} catch (error) {
  puppeteer = null;
}

const fontPath = 'C:\\Windows\\Fonts\\Nirmala.ttc';
const page = { margin: 28, width: 595.28, height: 841.89 };
const colors = {
  ink: '#273238',
  muted: '#657B6C',
  sand: '#EFE3CF',
  line: '#777777',
};

const browserCandidates = [
  process.env.PDF_BROWSER_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
].filter(Boolean);

const findBrowserPath = () => browserCandidates.find((candidate) => fs.existsSync(candidate));

const writeHtmlPdf = async ({ filePath, html }) => {
  if (!puppeteer) throw new Error('puppeteer-core is not installed');
  const executablePath = findBrowserPath();
  if (!executablePath) throw new Error('Chrome or Edge executable was not found');

  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const browser = await puppeteer.launch({
    executablePath,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });

  try {
    const pageInstance = await browser.newPage();
    await pageInstance.setViewport({ width: 1240, height: 1754, deviceScaleFactor: 1 });
    await pageInstance.setContent(html, { waitUntil: ['load', 'networkidle0'] });
    await pageInstance.emulateMediaType('screen');
    await pageInstance.pdf({
      path: filePath,
      format: 'A4',
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: '10mm', right: '8mm', bottom: '10mm', left: '8mm' },
    });
  } finally {
    await browser.close();
  }
};

const normalizeText = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();

const collectValueParts = (value) => {
  if (!value) return [];
  if (typeof value !== 'object') return [normalizeText(value)].filter(Boolean);

  const parts = [];
  ['method', 'compliance', 'note'].forEach((key) => {
    if (!value[key]) return;
    const nested = collectValueParts(value[key]).join(' | ');
    if (nested) parts.push(nested);
  });

  const checked = Object.entries(value.checks || {})
    .filter(([, isChecked]) => isChecked)
    .map(([name]) => `✓ ${name}`);
  if (checked.length) parts.push(checked.join('  '));

  const blanks = Object.entries(value.blanks || {})
    .filter(([, blankValue]) => blankValue)
    .map(([, blankValue]) => normalizeText(blankValue));
  if (blanks.length) parts.push(blanks.join(' | '));

  if (value.note && typeof value.note !== 'object') parts.push(normalizeText(value.note));
  return parts.filter(Boolean);
};

const formatValue = (value) => collectValueParts(value).join(' | ') || '';

const ensurePage = (doc, neededHeight) => {
  if (doc.y + neededHeight <= page.height - page.margin) return;
  doc.addPage();
  doc.rect(page.margin, page.margin, page.width - page.margin * 2, page.height - page.margin * 2).stroke(colors.line);
  doc.y = page.margin + 12;
};

const textHeight = (doc, text, width, size = 8) => {
  doc.font('Main').fontSize(size);
  return doc.heightOfString(text || ' ', { width });
};

const drawCellText = (doc, text, x, y, width, height, options = {}) => {
  const previousX = doc.x;
  const previousY = doc.y;
  doc
    .font(options.bold ? 'MainBold' : 'Main')
    .fontSize(options.size || 8)
    .fillColor(options.color || colors.ink)
    .text(text || '-', x + 5, y + 5, {
      width: width - 10,
      height: height - 8,
      ellipsis: true,
    });
  doc.x = previousX;
  doc.y = previousY;
};

const drawSectionHeader = (doc, title) => {
  ensurePage(doc, 26);
  const x = page.margin;
  const width = page.width - page.margin * 2;
  const y = doc.y;
  doc.rect(x, y, width, 19).fill(colors.ink);
  doc.fillColor('#FFFFFF').font('MainBold').fontSize(9).text(title, x + 6, y + 5, { width: width - 12 });
  doc.y = y + 19;
};

const drawMeta = (doc, metaRows) => {
  const x = page.margin;
  const width = page.width - page.margin * 2;
  const meta = metaRows.join(' | ');
  const height = Math.max(34, textHeight(doc, meta, width - 12, 8) + 14);
  ensurePage(doc, height);
  doc.rect(x, doc.y, width, height).fillAndStroke(colors.sand, colors.line);
  drawCellText(doc, meta, x, doc.y, width, height, { bold: true, size: 8 });
  doc.y += height;
};

const drawHeader = (doc, title, subtitle) => {
  const x = page.margin;
  const width = page.width - page.margin * 2;
  const y = doc.y;
  doc.rect(x, page.margin, width, page.height - page.margin * 2).stroke(colors.line);
  doc.rect(x, y, width, 56).fill(colors.ink);
  doc.fillColor('#FFFFFF').font('MainBold').fontSize(10).text('MANOVAIDYA', x + 10, y + 8);
  doc.fontSize(15).text(title, x + 10, y + 23, { width: width - 20 });
  if (subtitle) {
    doc.font('Main').fontSize(8).fillColor('#EDEDED').text(subtitle, x + 10, y + 43, { width: width - 20 });
  }
  doc.y = y + 56;
};

const drawSectionATable = (doc, fields) => {
  const x = page.margin;
  const widths = [122, 168, 92, 149];
  const headers = ['बिंदु', 'तय तरीका / मात्रा', 'पालन', 'Miss / बाधा / नोट'];
  ensurePage(doc, 24);
  let y = doc.y;
  let cursorX = x;
  headers.forEach((header, index) => {
    doc.rect(cursorX, y, widths[index], 20).fillAndStroke(colors.sand, colors.line);
    drawCellText(doc, header, cursorX, y, widths[index], 20, { bold: true, size: 8 });
    cursorX += widths[index];
  });
  doc.y += 20;

  Object.entries(fields || {}).forEach(([label, value]) => {
    const method = formatValue(value?.method);
    const compliance = formatValue(value?.compliance);
    const note = formatValue(value?.note);
    const rowHeight = Math.max(
      32,
      textHeight(doc, label, widths[0] - 10, 8) + 12,
      textHeight(doc, method, widths[1] - 10, 8) + 12,
      textHeight(doc, compliance, widths[2] - 10, 8) + 12,
      textHeight(doc, note, widths[3] - 10, 8) + 12
    );
    ensurePage(doc, rowHeight + 2);
    y = doc.y;
    cursorX = x;
    [label, method || '____', compliance || '____', note || '____'].forEach((cell, index) => {
      doc.rect(cursorX, y, widths[index], rowHeight).stroke(colors.line);
      drawCellText(doc, cell, cursorX, y, widths[index], rowHeight, { bold: index === 0, size: 8 });
      cursorX += widths[index];
    });
    doc.y += rowHeight;
  });
};

const drawTwoColumnTable = (doc, fields) => {
  const x = page.margin;
  const widths = [178, page.width - page.margin * 2 - 178];
  ensurePage(doc, 22);
  let y = doc.y;
  ['क्या दर्ज करना है?', 'भरें'].forEach((header, index) => {
    const cellX = x + widths.slice(0, index).reduce((sum, item) => sum + item, 0);
    doc.rect(cellX, y, widths[index], 20).fillAndStroke(colors.sand, colors.line);
    drawCellText(doc, header, cellX, y, widths[index], 20, { bold: true, size: 8 });
  });
  doc.y += 20;

  Object.entries(fields || {}).forEach(([label, value]) => {
    const filled = formatValue(value) || '____________________________';
    const rowHeight = Math.max(28, textHeight(doc, label, widths[0] - 10, 8) + 12, textHeight(doc, filled, widths[1] - 10, 8) + 12);
    ensurePage(doc, rowHeight + 2);
    y = doc.y;
    doc.rect(x, y, widths[0], rowHeight).stroke(colors.line);
    doc.rect(x + widths[0], y, widths[1], rowHeight).stroke(colors.line);
    drawCellText(doc, label, x, y, widths[0], rowHeight, { bold: true, size: 8 });
    drawCellText(doc, filled, x + widths[0], y, widths[1], rowHeight, { size: 8 });
    doc.y += rowHeight;
  });
};

const drawLineRows = (doc, fields) => {
  const x = page.margin;
  const width = page.width - page.margin * 2;
  Object.entries(fields || {}).forEach(([label, value]) => {
    const filled = formatValue(value) || '____________________________';
    const text = `${label}  ${filled}`;
    const rowHeight = Math.max(24, textHeight(doc, text, width - 12, 8) + 12);
    ensurePage(doc, rowHeight + 2);
    doc.rect(x, doc.y, width, rowHeight).stroke(colors.line);
    drawCellText(doc, text, x, doc.y, width, rowHeight, { size: 8 });
    doc.y += rowHeight;
  });
};

const drawNotes = (doc, fields) => {
  const value = fields?.Notes || '';
  const x = page.margin;
  const width = page.width - page.margin * 2;
  drawSectionHeader(doc, 'Additional Notes / अतिरिक्त नोट');
  const height = Math.max(70, textHeight(doc, value, width - 12, 8) + 22);
  ensurePage(doc, height);
  doc.rect(x, doc.y, width, height).stroke(colors.line);
  drawCellText(doc, value || '-', x, doc.y, width, height, { size: 8 });
  doc.y += height;
};

const writeTextPdf = async ({ filePath, title, metaRows = [], formData = {}, html }) => {
  if (html) {
    try {
      await writeHtmlPdf({ filePath, html });
      return;
    } catch (error) {
      console.warn(`HTML PDF render failed, falling back to drawn PDF: ${error.message}`);
    }
  }

  fs.mkdirSync(path.dirname(filePath), { recursive: true });

  const doc = new PDFDocument({ size: 'A4', margin: page.margin, bufferPages: true, autoFirstPage: false });
  const stream = fs.createWriteStream(filePath);
  doc.pipe(stream);
  doc.addPage();

  if (fs.existsSync(fontPath)) {
    const collection = fontkit.openSync(fontPath);
    const regular = collection.fonts?.find((font) => font.fullName === 'Nirmala UI') || collection.fonts?.[0];
    const bold = collection.fonts?.find((font) => font.fullName === 'Nirmala UI Bold') || regular;
    doc.registerFont('Main', regular);
    doc.registerFont('MainBold', bold);
  } else {
    doc.registerFont('Main', 'Helvetica');
    doc.registerFont('MainBold', 'Helvetica-Bold');
  }
  doc.font('Main');

  drawHeader(
    doc,
    title,
    title.includes('FOLLOW-UP') ? 'Back Slide | Therapy | Caregiver Compliance | New Problem Check | Action & Accountability' : 'पालन, मिसिंग और बदलाव की चेकलिस्ट'
  );
  drawMeta(doc, metaRows);

  Object.entries(formData || {}).forEach(([section, fields]) => {
    if (section.startsWith('Additional Notes')) {
      drawNotes(doc, fields);
      return;
    }

    drawSectionHeader(doc, section);
    if (section.startsWith('A.')) drawSectionATable(doc, fields);
    else if (section.startsWith('B.')) drawTwoColumnTable(doc, fields);
    else drawLineRows(doc, fields);
  });

  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i += 1) {
    doc.switchToPage(i);
    doc.font('Main').fontSize(7).fillColor(colors.muted).text(`Page ${i + 1} of ${range.count}`, page.width - 90, page.height - 22);
  }

  doc.end();

  return new Promise((resolve, reject) => {
    stream.on('finish', resolve);
    stream.on('error', reject);
  });
};

module.exports = { writeTextPdf };
