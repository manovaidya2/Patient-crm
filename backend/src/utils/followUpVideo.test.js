const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const ffmpegPath = require('ffmpeg-static');
const { compressFollowUpVideo } = require('./followUpVideo');

const runFfmpeg = (args) => new Promise((resolve, reject) => {
  const child = spawn(ffmpegPath, args, { windowsHide: true });
  let stderr = '';
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  child.on('error', reject);
  child.on('close', (code) => {
    if (code === 0) resolve();
    else reject(new Error(stderr));
  });
});

test('compresses a video into a playable browser MP4', { timeout: 30000 }, async (t) => {
  const directory = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'followup-video-'));
  t.after(() => fs.promises.rm(directory, { recursive: true, force: true }));
  const source = path.join(directory, 'source.mp4');
  const output = path.join(directory, 'compressed.mp4');

  await runFfmpeg([
    '-y',
    '-f', 'lavfi',
    '-i', 'testsrc=size=640x360:rate=24',
    '-f', 'lavfi',
    '-i', 'sine=frequency=800:sample_rate=44100',
    '-t', '1',
    '-c:v', 'libx264',
    '-pix_fmt', 'yuv420p',
    '-c:a', 'aac',
    source,
  ]);

  const result = await compressFollowUpVideo({ inputPath: source, outputPath: output });
  const stat = await fs.promises.stat(output);
  const header = await fs.promises.readFile(output);

  assert.equal(result.size, stat.size);
  assert.ok(stat.size > 0);
  assert.equal(header.subarray(4, 8).toString('ascii'), 'ftyp');
  await runFfmpeg(['-v', 'error', '-i', output, '-f', 'null', '-']);
});
