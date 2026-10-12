const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const sharp = require('sharp');
const { optimizeUploadedImage, MAX_RECORD_ROOM_FILE_BYTES } = require('./recordRoomMedia');
const { writeImagesPdf } = require('./simplePdf');

const temporaryDirectory = async () => fs.promises.mkdtemp(path.join(os.tmpdir(), 'record-room-media-'));

test('large Record Room uploads become readable, bounded JPEG images', async (context) => {
  const directory = await temporaryDirectory();
  context.after(() => fs.promises.rm(directory, { recursive: true, force: true }));
  const sourcePath = path.join(directory, 'phone-scan.png');
  await sharp({ create: { width: 3200, height: 4500, channels: 3, background: '#f8f8f5' } })
    .png({ compressionLevel: 0 })
    .toFile(sourcePath);

  const optimized = await optimizeUploadedImage({
    path: sourcePath,
    filename: 'phone-scan.png',
    originalname: 'Patient page.png',
    mimetype: 'image/png',
  });
  const metadata = await sharp(optimized.path).metadata();
  const size = (await fs.promises.stat(optimized.path)).size;

  assert.equal(metadata.format, 'jpeg');
  assert.ok(metadata.width <= 2000);
  assert.ok(metadata.height <= 2800);
  assert.ok(size < MAX_RECORD_ROOM_FILE_BYTES);
  await assert.rejects(fs.promises.access(sourcePath));
});

test('multi-page Record Room PDFs stay below 10 MB', async (context) => {
  const directory = await temporaryDirectory();
  context.after(() => fs.promises.rm(directory, { recursive: true, force: true }));
  const imagePath = path.join(directory, 'detailed-scan.jpg');
  const pixels = crypto.randomBytes(1200 * 1680 * 3);
  await sharp(pixels, { raw: { width: 1200, height: 1680, channels: 3 } })
    .jpeg({ quality: 92 })
    .toFile(imagePath);
  const pdfPath = path.join(directory, 'record.pdf');

  await writeImagesPdf({
    filePath: pdfPath,
    images: Array.from({ length: 12 }, (_, index) => ({
      filePath: imagePath,
      uploadedAt: new Date(2026, 0, index + 1),
      uploadedByName: 'Reception',
    })),
  });

  const size = (await fs.promises.stat(pdfPath)).size;
  assert.ok(size > 0);
  assert.ok(size <= MAX_RECORD_ROOM_FILE_BYTES, `PDF was ${size} bytes`);
});
