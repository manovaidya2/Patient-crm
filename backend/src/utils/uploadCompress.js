const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { spawn } = require('child_process');
const ffmpegPath = require('ffmpeg-static');
const sharp = require('sharp');
const { PDFDocument, PDFName, PDFNumber, PDFRawStream, PDFDict, PDFArray } = require('pdf-lib');

// Every uploaded image / PDF is stored compressed: smaller files, quick to open on a slow link, still clear to read.
// Best effort: whatever cannot be compressed, or would not get smaller, is kept as uploaded.
//
// Images (JPG / PNG / WebP): longest side at most 2200 px (an A4 page stays ~190 dpi - every word readable), JPEG
// quality 80. A small image (under 200 KB) is left as it is, and so is a JPG already within these limits (the app
// compresses photos in the browser before sending them - they are not compressed twice).
const MAX_SIDE = 2200;
const QUALITY = 80;
const SMALL_BYTES = 200 * 1024;
const HEAVY_JPEG_BYTES = 1200 * 1024;
const IMAGE_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];

// Same rule as the browser (frontend/src/utils/compressImage.js).
const needsCompression = ({ type, size, width, height }) => {
  if (size < SMALL_BYTES) return false;
  if (!/jpe?g$/.test(type)) return true;
  return Math.max(width || 0, height || 0) > MAX_SIDE || size > HEAVY_JPEG_BYTES;
};

const toJpeg = (input, { rotate = true, gray = false, raw } = {}) => {
  let image = sharp(input, raw ? { raw } : { failOn: 'none' });
  if (rotate) image = image.rotate();
  image = image.resize({ width: MAX_SIDE, height: MAX_SIDE, fit: 'inside', withoutEnlargement: true }).flatten({ background: '#ffffff' });
  if (gray) image = image.toColourspace('b-w');
  return image.jpeg({ quality: QUALITY, mozjpeg: true, chromaSubsampling: '4:2:0' }).toBuffer({ resolveWithObject: true });
};

// Buffer in, { buffer, mimetype } out - or null to keep the original.
const compressImageBuffer = async (input, mimetype) => {
  const meta = await sharp(input, { failOn: 'none' }).metadata();
  if ((meta.pages || 1) > 1) return null; // animated WebP: keep it
  // EXIF orientation 5-8 swaps the sides; the size check uses the shown size.
  const swapped = (meta.orientation || 1) >= 5;
  const shown = { width: swapped ? meta.height : meta.width, height: swapped ? meta.width : meta.height };
  if (!needsCompression({ type: mimetype, size: input.length, ...shown })) return null;
  const { data } = await toJpeg(input);
  return data.length < input.length ? { buffer: data, mimetype: 'image/jpeg' } : null;
};

// ---- PDFs: the pictures inside (scanned pages, photos) are what make them heavy. Each big JPEG picture is
// re-encoded to the same limits; big uncompressed-style (Flate) RGB / grey pictures too. Text, vector drawing and
// everything else in the PDF stays exactly as it was. Signed or encrypted PDFs are never touched.
const name = (dict, key) => { const v = dict.get(PDFName.of(key)); return v instanceof PDFName ? v.asString() : null; };
const lookup = (context, value) => (value ? context.lookup(value) : value);

const imageChannels = (context, colorSpace) => {
  const space = lookup(context, colorSpace);
  if (space instanceof PDFName) return { DeviceRGB: 3, DeviceGray: 1 }[space.asString().slice(1)] || 0;
  if (space instanceof PDFArray && space.size() === 2 && lookup(context, space.get(0))?.asString?.() === '/ICCBased') {
    const icc = lookup(context, space.get(1));
    const n = icc?.dict?.get(PDFName.of('N'));
    return n instanceof PDFNumber && [1, 3].includes(n.asNumber()) ? n.asNumber() : 0;
  }
  return 0;
};

const isSigned = (context) => context.enumerateIndirectObjects().some(([, obj]) => {
  const dict = obj instanceof PDFDict ? obj : obj?.dict;
  return dict instanceof PDFDict && (name(dict, 'Type') === '/Sig' || name(dict, 'FT') === '/Sig');
});

const singleFilter = (dict) => {
  const filter = dict.get(PDFName.of('Filter'));
  if (filter instanceof PDFName) return filter.asString();
  if (filter instanceof PDFArray && filter.size() === 1) return filter.get(0)?.asString?.() || null;
  return filter ? 'many' : null;
};

// Flate pictures are often stored with PNG row filters (DecodeParms /Predictor 10-15): undo them to plain pixels.
const unfilterPng = (data, rowBytes, bpp, rows) => {
  const out = Buffer.alloc(rowBytes * rows);
  for (let y = 0; y < rows; y += 1) {
    const type = data[y * (rowBytes + 1)];
    const src = y * (rowBytes + 1) + 1;
    const at = y * rowBytes;
    for (let x = 0; x < rowBytes; x += 1) {
      const left = x >= bpp ? out[at + x - bpp] : 0;
      const up = y ? out[at - rowBytes + x] : 0;
      const upLeft = y && x >= bpp ? out[at - rowBytes + x - bpp] : 0;
      let add = 0;
      if (type === 1) add = left;
      else if (type === 2) add = up;
      else if (type === 3) add = (left + up) >> 1;
      else if (type === 4) { const p = left + up - upLeft; const pa = Math.abs(p - left); const pb = Math.abs(p - up); const pc = Math.abs(p - upLeft); add = pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft; } else if (type !== 0) throw new Error('Unknown PNG row filter');
      out[at + x] = (data[src + x] + add) & 255;
    }
  }
  return out;
};
const flatePixels = (context, dict, contents, { width, height, channels }) => {
  const inflated = zlib.inflateSync(Buffer.from(contents));
  const parms = lookup(context, dict.get(PDFName.of('DecodeParms')));
  const predictor = parms instanceof PDFDict ? (parms.get(PDFName.of('Predictor'))?.asNumber?.() || 1) : 1;
  if (parms && !(parms instanceof PDFDict)) return null;
  if (predictor === 1) return inflated.length === width * height * channels ? inflated : null;
  if (predictor < 10) return null; // TIFF predictor: leave it
  const colors = parms.get(PDFName.of('Colors'))?.asNumber?.() || 1;
  const bpc = parms.get(PDFName.of('BitsPerComponent'))?.asNumber?.() || 8;
  const columns = parms.get(PDFName.of('Columns'))?.asNumber?.() || 1;
  if (colors !== channels || bpc !== 8 || columns !== width || inflated.length < (width * channels + 1) * height) return null;
  return unfilterPng(inflated, width * channels, channels, height);
};

const compressPdfImage = async (context, stream) => {
  const { dict } = stream;
  if (name(dict, 'Subtype') !== '/Image' || dict.get(PDFName.of('ImageMask'))?.asBoolean?.()) return null;
  if (dict.get(PDFName.of('Mask')) || dict.get(PDFName.of('Decode'))) return null;
  const channels = imageChannels(context, dict.get(PDFName.of('ColorSpace')));
  const width = dict.get(PDFName.of('Width'))?.asNumber?.();
  const height = dict.get(PDFName.of('Height'))?.asNumber?.();
  const bits = dict.get(PDFName.of('BitsPerComponent'))?.asNumber?.();
  if (!channels || !width || !height || bits !== 8) return null;
  const contents = stream.getContents();
  if (contents.length < SMALL_BYTES) return null;
  const filter = singleFilter(dict);
  let output;
  if (filter === '/DCTDecode') {
    if (Math.max(width, height) <= MAX_SIDE && contents.length <= HEAVY_JPEG_BYTES) return null;
    output = await toJpeg(Buffer.from(contents), { rotate: false, gray: channels === 1 });
  } else if (filter === '/FlateDecode') {
    const pixels = flatePixels(context, dict, contents, { width, height, channels });
    if (!pixels) return null;
    output = await toJpeg(pixels, { rotate: false, gray: channels === 1, raw: { width, height, channels } });
  } else return null;
  const { data, info } = output;
  if (data.length >= contents.length * 0.9) return null;
  dict.set(PDFName.of('Filter'), PDFName.of('DCTDecode'));
  dict.delete(PDFName.of('DecodeParms'));
  dict.set(PDFName.of('Width'), PDFNumber.of(info.width));
  dict.set(PDFName.of('Height'), PDFNumber.of(info.height));
  dict.set(PDFName.of('BitsPerComponent'), PDFNumber.of(8));
  return PDFRawStream.of(dict, new Uint8Array(data));
};

// Buffer in, a smaller PDF buffer out - or null to keep the original.
const compressPdfBuffer = async (input) => {
  if (input.length < SMALL_BYTES) return null;
  const pdf = await PDFDocument.load(input, { updateMetadata: false });
  const { context } = pdf;
  if (isSigned(context)) return null;
  let changed = 0;
  for (const [ref, obj] of context.enumerateIndirectObjects()) {
    if (!(obj instanceof PDFRawStream)) continue;
    try {
      const smaller = await compressPdfImage(context, obj);
      if (smaller) { context.assign(ref, smaller); changed += 1; }
    } catch { /* this picture stays as it was */ }
  }
  if (!changed) return null;
  const output = Buffer.from(await pdf.save({ useObjectStreams: true }));
  return output.length < input.length * 0.95 ? output : null;
};

// ---- Audio and video (server side, ffmpeg). Audio: Opus 16 kbps mono in WebM - a voice or phone call stays clear,
// about 120 KB a minute (a 9-minute call: about 4 seconds). Video: H.264 (longest side 1280 px, CRF 28) with AAC 64 kbps mono audio in MP4 - plays in every
// browser and phone, usually 5-10x smaller than a phone recording. Kept only when the result is smaller.
const AUDIO_EXT = /\.(mp3|wav|m4a|aac|ogg|oga|opus|amr|3gp|webm|wma|flac)$/i;
const SMALL_MEDIA_BYTES = 100 * 1024;
const AUDIO_ARGS = ['-vn', '-ac', '1', '-ar', '16000', '-c:a', 'libopus', '-b:a', '16k', '-compression_level', '3', '-application', 'voip', '-f', 'webm'];
const VIDEO_ARGS = ['-map', '0:v:0', '-map', '0:a?', '-vf', "scale='if(gt(iw,ih),min(1280,iw),-2)':'if(gt(iw,ih),-2,min(1280,ih))'",
  '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '28', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '64k', '-ac', '1', '-movflags', '+faststart', '-f', 'mp4'];

const runFfmpeg = (args) => new Promise((resolve, reject) => {
  if (!ffmpegPath) { reject(new Error('ffmpeg is not available')); return; }
  const child = spawn(ffmpegPath, args, { windowsHide: true });
  let errorOutput = '';
  child.stderr.on('data', (chunk) => { errorOutput = `${errorOutput}${chunk}`.slice(-4000); });
  child.on('error', reject);
  child.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg failed (${code}): ${errorOutput.slice(-400)}`))));
});

const typeOf = (file) => String(file.mimetype || '').split(';')[0].trim().toLowerCase();
const isPdf = (file) => typeOf(file) === 'application/pdf';
const isImage = (file) => IMAGE_TYPES.includes(typeOf(file));
const isVideo = (file) => typeOf(file).startsWith('video/') && typeOf(file) !== 'video/webm';
// A browser recording is often 'video/webm' with sound only, and call systems send 'application/octet-stream'.
const isAudio = (file) => typeOf(file).startsWith('audio/') || (['video/webm', 'application/octet-stream'].includes(typeOf(file)) && AUDIO_EXT.test(file.originalname || ''));
const renamed = (original, ext) => `${path.parse(original || 'file').name || 'file'}${ext}`;

// A disk file re-encoded by ffmpeg; returns the new { path, filename, size } or null to keep the original.
const encodeMedia = async (file, args, ext) => {
  if (!file.path || file.size < SMALL_MEDIA_BYTES) return null;
  const parsed = path.parse(file.path);
  const filename = `${parsed.name}-c${ext}`;
  const target = path.join(parsed.dir, filename);
  try {
    await runFfmpeg(['-y', '-i', file.path, ...args, target]);
    const size = (await fs.promises.stat(target)).size;
    if (!size || size >= file.size) { await fs.promises.unlink(target).catch(() => {}); return null; }
    return { path: target, filename, size };
  } catch (error) {
    await fs.promises.unlink(target).catch(() => {});
    throw error;
  }
};

const compressMediaFile = async (file, { audioOnly = false } = {}) => {
  const video = !audioOnly && isVideo(file);
  const out = await encodeMedia(file, video ? VIDEO_ARGS : AUDIO_ARGS, video ? '.mp4' : '.webm');
  if (!out) { file.checked = true; return file; }
  await fs.promises.unlink(file.path).catch(() => {});
  return Object.assign(file, { ...out, mimetype: video ? 'video/mp4' : 'audio/webm', originalname: renamed(file.originalname, video ? '.mp4' : '.webm'), compressed: true, checked: true });
};

const jpgName = (original) => renamed(original || 'image', '.jpg');

// A multer file (disk or memory storage), changed in place to the compressed copy. Never throws. `checked`: the
// file was looked at (compressed, or already small enough); `compressed`: it was replaced by a smaller copy.
// `media: false` leaves audio / video alone (for uploads that compress them their own way); `media: 'audio'` treats
// every audio / video / unknown-type file as sound (call recordings).
const compressUploadedFile = async (file, { media = true } = {}) => {
  if (!file) return file;
  const audioOnly = media === 'audio';
  const mediaFile = Boolean(media) && !file.buffer && (isAudio(file) || isVideo(file) || (audioOnly && ['video/webm', 'application/octet-stream'].includes(typeOf(file))));
  if (!mediaFile && !isPdf(file) && !isImage(file)) return file;
  try {
    if (mediaFile) return await compressMediaFile(file, { audioOnly });
    const input = file.buffer || await fs.promises.readFile(file.path);
    const result = isPdf(file) ? await compressPdfBuffer(input).then((buffer) => buffer && { buffer, mimetype: 'application/pdf' }) : await compressImageBuffer(input, typeOf(file));
    if (!result) { file.checked = true; return file; }
    const toJpg = result.mimetype !== typeOf(file);
    if (file.buffer) {
      Object.assign(file, { buffer: result.buffer, size: result.buffer.length, mimetype: result.mimetype, compressed: true, checked: true, ...(toJpg ? { originalname: jpgName(file.originalname) } : {}) });
      return file;
    }
    const parsed = path.parse(file.path);
    const filename = `${parsed.name}-c${toJpg ? '.jpg' : parsed.ext}`;
    const target = path.join(parsed.dir, filename);
    await fs.promises.writeFile(target, result.buffer);
    await fs.promises.unlink(file.path).catch(() => {});
    Object.assign(file, { path: target, filename, size: result.buffer.length, mimetype: result.mimetype, compressed: true, checked: true, ...(toJpg ? { originalname: jpgName(file.originalname) } : {}) });
  } catch (error) {
    console.error(`Upload not compressed, the original is kept (${file.originalname}): ${error.message}`);
  }
  return file;
};

const uploadedFiles = (req) => [
  ...(req.file ? [req.file] : []),
  ...(Array.isArray(req.files) ? req.files : Object.values(req.files || {}).flat()),
];

// Express middleware: compresses every image / PDF / audio / video multer put on the request (3 at a time), before
// the controller stores it - only the compressed copy is kept.
const compressUploads = (options = {}) => async (req, res, next) => {
  const files = uploadedFiles(req);
  let cursor = 0;
  const worker = async () => { while (cursor < files.length) { const file = files[cursor]; cursor += 1; await compressUploadedFile(file, options); } };
  await Promise.all(Array.from({ length: Math.min(3, files.length) }, worker));
  next();
};

// A multer instance whose .single / .array / .fields / .any also compress what they received.
const withCompression = (upload, options = {}) => {
  const compress = compressUploads(options);
  const chain = (middleware) => (req, res, next) => middleware(req, res, (error) => (error ? next(error) : compress(req, res, next)));
  const wrapped = Object.create(upload);
  ['single', 'array', 'fields', 'any'].forEach((method) => { wrapped[method] = (...args) => chain(upload[method](...args)); });
  return wrapped;
};

// A file the server saved itself (a downloaded call recording): compressed in place, the same way.
const compressSavedFile = async (filePath, { mimetype = 'application/octet-stream', originalname = path.basename(filePath), media = 'audio' } = {}) => {
  const size = (await fs.promises.stat(filePath)).size;
  return compressUploadedFile({ path: filePath, filename: path.basename(filePath), mimetype, originalname, size }, { media });
};

module.exports = { compressUploads, compressUploadedFile, compressSavedFile, compressImageBuffer, compressPdfBuffer, needsCompression, withCompression, MAX_SIDE, AUDIO_ARGS, VIDEO_ARGS };
