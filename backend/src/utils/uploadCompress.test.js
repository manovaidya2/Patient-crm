const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const sharp = require('sharp');
const { PDFDocument, PDFName } = require('pdf-lib');
const { compressImageBuffer, compressPdfBuffer, compressUploads, withCompression, needsCompression } = require('./uploadCompress');

// A noisy photo-like picture (noise does not compress, like a real camera photo).
const photo = (width, height, format = 'png') => sharp(require('crypto').randomBytes(width * height * 3), { raw: { width, height, channels: 3 } })[format]({ quality: 98 }).toBuffer();

test('a big PNG becomes a JPEG within 2200 px; small images and JPEGs already within the limits stay as they are', async () => {
  const big = await photo(3000, 1500);
  const out = await compressImageBuffer(big, 'image/png');
  assert.equal(out.mimetype, 'image/jpeg');
  assert.ok(out.buffer.length < big.length);
  const meta = await sharp(out.buffer).metadata();
  assert.deepEqual([meta.format, meta.width, meta.height], ['jpeg', 2200, 1100]);
  assert.equal(await compressImageBuffer(await sharp({ create: { width: 300, height: 300, channels: 3, background: '#fff' } }).png().toBuffer(), 'image/png'), null);
  assert.equal(needsCompression({ type: 'image/jpeg', size: 500 * 1024, width: 2000, height: 1500 }), false);
  assert.equal(needsCompression({ type: 'image/jpeg', size: 500 * 1024, width: 4000, height: 3000 }), true);
  assert.equal(needsCompression({ type: 'image/png', size: 300 * 1024, width: 800, height: 600 }), true);
});

test('a PDF with a big scanned photo inside gets smaller, keeps its pages and stays readable; a signed PDF is not touched', async () => {
  const scan = await photo(3200, 4200, 'jpeg');
  const pdf = await PDFDocument.create();
  const image = await pdf.embedJpg(scan);
  pdf.addPage([595, 842]).drawImage(image, { x: 0, y: 0, width: 595, height: 842 });
  pdf.addPage([595, 842]).drawText('Page two text');
  const bytes = Buffer.from(await pdf.save());
  const out = await compressPdfBuffer(bytes);
  assert.ok(out && out.length < bytes.length * 0.7, `${out?.length} vs ${bytes.length}`);
  const reloaded = await PDFDocument.load(out);
  assert.equal(reloaded.getPageCount(), 2);
  const pictures = reloaded.context.enumerateIndirectObjects().map(([, o]) => o).filter((o) => o.dict?.get(PDFName.of('Subtype'))?.asString?.() === '/Image');
  assert.equal(pictures.length, 1);
  const meta = await sharp(Buffer.from(pictures[0].getContents())).metadata();
  assert.equal(Math.max(meta.width, meta.height), 2200);
  assert.equal(pictures[0].dict.get(PDFName.of('Height')).asNumber(), meta.height);

  const signed = await PDFDocument.load(bytes);
  signed.context.register(signed.context.obj({ Type: 'Sig', Filter: 'Adobe.PPKLite' }));
  assert.equal(await compressPdfBuffer(Buffer.from(await signed.save())), null);
  assert.equal(await compressPdfBuffer(Buffer.from('not a pdf'.repeat(40000))).catch(() => 'threw'), 'threw');
});

test('the upload middleware replaces disk and memory files with the compressed copy and keeps what it cannot compress', async (t) => {
  const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'upload-compress-'));
  t.after(() => fs.promises.rm(dir, { recursive: true, force: true }));
  const big = await photo(2600, 2600);
  const diskPath = path.join(dir, '111-photo.png');
  await fs.promises.writeFile(diskPath, big);
  const brokenPath = path.join(dir, '222-broken.pdf');
  await fs.promises.writeFile(brokenPath, Buffer.alloc(300 * 1024, 1));
  const req = {
    files: {
      photoA: [{ path: diskPath, filename: '111-photo.png', originalname: 'Bottle photo.PNG', mimetype: 'image/png', size: big.length }],
      paper_0: [{ path: brokenPath, filename: '222-broken.pdf', originalname: 'scan.pdf', mimetype: 'application/pdf', size: 300 * 1024 }],
    },
  };
  await new Promise((resolve) => compressUploads()(req, {}, resolve));
  const [disk] = req.files.photoA;
  assert.deepEqual([disk.filename, disk.originalname, disk.mimetype, disk.compressed], ['111-photo-c.jpg', 'Bottle photo.jpg', 'image/jpeg', true]);
  assert.equal((await fs.promises.stat(disk.path)).size, disk.size);
  await assert.rejects(fs.promises.access(diskPath));
  assert.equal(req.files.paper_0[0].filename, '222-broken.pdf');
  await fs.promises.access(brokenPath);

  const memory = { file: { buffer: big, originalname: 'copy.png', mimetype: 'image/png', size: big.length } };
  await new Promise((resolve) => compressUploads()(memory, {}, resolve));
  assert.deepEqual([memory.file.mimetype, memory.file.originalname, memory.file.buffer.length < big.length], ['image/jpeg', 'copy.jpg', true]);

  // The wrapped multer instance keeps its own settings and runs the compression after receiving.
  const fake = { limits: { fileSize: 5 }, single: () => (rq, rs, cb) => { rq.file = { buffer: big, originalname: 'x.png', mimetype: 'image/png', size: big.length }; cb(); } };
  const wrapped = withCompression(fake);
  assert.equal(wrapped.limits.fileSize, 5);
  const rq = {};
  await new Promise((resolve) => wrapped.single('file')(rq, {}, resolve));
  assert.equal(rq.file.mimetype, 'image/jpeg');
});

test('a Flate picture stored with PNG row filters (Predictor 15) is decoded right before it becomes a JPEG', async () => {
  const zlib = require('zlib');
  const [width, height] = [1500, 1200];
  const raw = Buffer.alloc(width * height * 3);
  for (let i = 0; i < raw.length; i += 1) raw[i] = ((i % (width * 3)) / 12 + Math.floor(i / (width * 3)) / 6 + (i * 2654435761 % 23)) & 255;
  // Every PNG row filter in turn: None, Sub, Up, Average, Paeth.
  const rowBytes = width * 3;
  const filtered = Buffer.alloc((rowBytes + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const type = y % 5;
    filtered[y * (rowBytes + 1)] = type;
    for (let x = 0; x < rowBytes; x += 1) {
      const at = y * rowBytes + x;
      const left = x >= 3 ? raw[at - 3] : 0; const up = y ? raw[at - rowBytes] : 0; const upLeft = y && x >= 3 ? raw[at - rowBytes - 3] : 0;
      const p = left + up - upLeft; const pa = Math.abs(p - left); const pb = Math.abs(p - up); const pc = Math.abs(p - upLeft);
      const pred = [0, left, up, (left + up) >> 1, pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft][type];
      filtered[y * (rowBytes + 1) + 1 + x] = (raw[at] - pred) & 255;
    }
  }
  const pdf = await PDFDocument.create();
  pdf.addPage([300, 240]);
  pdf.context.register(pdf.context.stream(zlib.deflateSync(filtered), { Type: 'XObject', Subtype: 'Image', Width: width, Height: height, ColorSpace: 'DeviceRGB', BitsPerComponent: 8, Filter: 'FlateDecode', DecodeParms: { Predictor: 15, Colors: 3, BitsPerComponent: 8, Columns: width } }));
  const bytes = Buffer.from(await pdf.save());
  const out = await compressPdfBuffer(bytes);
  assert.ok(out && out.length < bytes.length);
  const reloaded = await PDFDocument.load(out);
  const [picture] = reloaded.context.enumerateIndirectObjects().map(([, o]) => o).filter((o) => o.dict?.get(PDFName.of('Subtype'))?.asString?.() === '/Image');
  assert.equal(picture.dict.get(PDFName.of('Filter')).asString(), '/DCTDecode');
  assert.equal(picture.dict.get(PDFName.of('DecodeParms')), undefined);
  const pixels = await sharp(Buffer.from(picture.getContents())).raw().toBuffer();
  let diff = 0;
  for (let i = 0; i < raw.length; i += 97) diff += Math.abs(pixels[i] - raw[i]);
  assert.ok(diff / Math.ceil(raw.length / 97) < 12, 'picture kept its pixels');
});

test('audio becomes a small Opus WebM and video a smaller MP4; uploads that compress them their own way are left alone', async (t) => {
  const { spawnSync } = require('child_process');
  const ffmpeg = require('ffmpeg-static');
  const { compressUploadedFile, compressSavedFile } = require('./uploadCompress');
  const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'upload-media-'));
  t.after(() => fs.promises.rm(dir, { recursive: true, force: true }));
  const make = (name, args) => { const target = path.join(dir, name); spawnSync(ffmpeg, ['-y', ...args, target], { windowsHide: true }); return target; };
  const wav = make('111-call.wav', ['-f', 'lavfi', '-i', 'sine=frequency=440:duration=20', '-ac', '2', '-ar', '44100']);
  const mov = make('222-clip.mov', ['-f', 'lavfi', '-i', 'testsrc2=size=1920x1080:rate=30:duration=4', '-f', 'lavfi', '-i', 'sine=duration=4', '-c:v', 'mjpeg', '-q:v', '3', '-c:a', 'pcm_s16le', '-shortest']);
  const disk = (p, mimetype) => ({ path: p, filename: path.basename(p), originalname: `Patient ${path.basename(p)}`, mimetype, size: fs.statSync(p).size });

  const audio = await compressUploadedFile(disk(wav, 'audio/wav'));
  assert.deepEqual([audio.mimetype, audio.filename, audio.originalname, audio.compressed], ['audio/webm', '111-call-c.webm', 'Patient 111-call.webm', true]);
  assert.ok(audio.size < 200 * 1024);
  await assert.rejects(fs.promises.access(wav));

  const video = disk(mov, 'video/quicktime');
  const before = video.size;
  await compressUploadedFile(video);
  assert.deepEqual([video.mimetype, video.filename, video.compressed], ['video/mp4', '222-clip-c.mp4', true]);
  assert.ok(video.size < before);
  const probe = spawnSync(ffmpeg, ['-i', video.path], { encoding: 'utf8' }).stderr;
  assert.match(probe, /h264/);
  assert.match(probe, /1280x720/);

  const own = make('333-voice.wav', ['-f', 'lavfi', '-i', 'sine=duration=10']);
  const kept = await compressUploadedFile(disk(own, 'audio/wav'), { media: false });
  assert.equal(kept.filename, '333-voice.wav');

  // A call recording the server downloaded itself, with an unknown type: compressed as sound.
  const saved = await compressSavedFile(own, { originalname: 'recording.mp3' });
  assert.deepEqual([saved.mimetype, saved.filename, saved.originalname], ['audio/webm', '333-voice-c.webm', 'recording.webm']);
});
