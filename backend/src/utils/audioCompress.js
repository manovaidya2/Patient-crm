const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const ffmpegPath = require('ffmpeg-static');

// Voice recordings kept small: re-encoded to Opus 20 kbps, mono, 16 kHz in WebM (speech stays clear; about
// 150 KB a minute). Best effort - if ffmpeg is missing, fails, or the result is not smaller, the original stays.
const VOICE_ARGS = ['-vn', '-ac', '1', '-ar', '16000', '-c:a', 'libopus', '-b:a', '20k', '-application', 'voip', '-f', 'webm'];

const runFfmpeg = (args) => new Promise((resolve, reject) => {
  const child = spawn(ffmpegPath, args, { windowsHide: true });
  let errorOutput = '';
  child.stderr.on('data', (chunk) => { errorOutput = `${errorOutput}${chunk}`.slice(-4000); });
  child.on('error', reject);
  child.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`Audio compression failed (${code}): ${errorOutput.slice(-500)}`))));
});

// file: a multer file ({ path, filename, mimetype, size }). Returns the file to keep (the compressed one, or the
// original): { path, filename, mimetype, size, compressed }.
const compressVoice = async (file) => {
  const original = { path: file.path, filename: file.filename, mimetype: String(file.mimetype || '').split(';')[0], size: file.size, compressed: false };
  if (!ffmpegPath || !file?.path) return original;
  const dir = path.dirname(file.path);
  const filename = `${path.parse(file.filename).name}-v.webm`;
  const out = path.join(dir, filename);
  try {
    await runFfmpeg(['-y', '-i', file.path, ...VOICE_ARGS, out]);
    const size = (await fs.promises.stat(out)).size;
    if (!size || size >= file.size) { await fs.promises.unlink(out).catch(() => {}); return original; }
    await fs.promises.unlink(file.path).catch(() => {});
    return { path: out, filename, mimetype: 'audio/webm', size, compressed: true };
  } catch (error) {
    console.error(`Voice not compressed, the original is kept: ${error.message}`);
    await fs.promises.unlink(out).catch(() => {});
    return original;
  }
};

module.exports = { compressVoice, VOICE_ARGS };
