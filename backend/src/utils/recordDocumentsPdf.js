const fs = require('fs');
const os = require('os');
const path = require('path');
const { randomUUID } = require('crypto');
const { PDFDocument } = require('pdf-lib');
const { writeImagesPdf } = require('./simplePdf');

// Keep original PDF pages and their order alongside the scanned images.
const writeRecordDocumentsPdf = async ({ filePath, documents }) => {
  if (!documents.some((doc) => /\.pdf$/i.test(doc.filePath))) {
    await writeImagesPdf({ filePath, images: documents });
    return documents.length;
  }
  const directory = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'record-documents-'));
  const temporaryFiles = [];
  const outputPath = `${filePath}.${randomUUID()}.tmp`;
  try {
    const merged = await PDFDocument.create();
    const append = async (pdfPath) => {
      let source;
      try { source = await PDFDocument.load(await fs.promises.readFile(pdfPath)); }
      catch { throw Object.assign(new Error('Could not read the PDF. Upload a valid PDF without password protection.'), { statusCode: 400 }); }
      if (!source.getPageCount()) throw Object.assign(new Error('The uploaded PDF has no pages.'), { statusCode: 400 });
      for (const page of await merged.copyPages(source, source.getPageIndices())) merged.addPage(page);
    };
    let images = [];
    const flushImages = async () => {
      if (!images.length) return;
      const imagePdf = path.join(directory, `${temporaryFiles.length}.pdf`);
      temporaryFiles.push(imagePdf);
      await writeImagesPdf({ filePath: imagePdf, images });
      await append(imagePdf);
      images = [];
    };
    for (const document of documents) {
      if (/\.pdf$/i.test(document.filePath)) { await flushImages(); await append(document.filePath); }
      else images.push(document);
    }
    await flushImages();
    await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
    await fs.promises.writeFile(outputPath, await merged.save());
    await fs.promises.rename(outputPath, filePath);
    return merged.getPageCount();
  } finally {
    await Promise.all([...temporaryFiles, outputPath].map((target) => fs.promises.unlink(target).catch(() => {})));
    await fs.promises.rmdir(directory);
  }
};

module.exports = { writeRecordDocumentsPdf };
