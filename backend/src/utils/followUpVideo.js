const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const ffmpegPath = require('ffmpeg-static');

const MAX_OUTPUT_BYTES = 30 * 1024 * 1024;
const profiles = [
  { width: 1280, crf: 28, audioBitrate: '64k' },
  { width: 960, crf: 31, audioBitrate: '56k' },
  { width: 854, crf: 34, audioBitrate: '48k' },
];

const runFfmpeg = (args) => new Promise((resolve, reject) => {
  const process = spawn(ffmpegPath, args, { windowsHide: true });
  let errorOutput = '';
  process.stderr.on('data', (chunk) => { errorOutput = `${errorOutput}${chunk}`.slice(-8000); });
  process.on('error', reject);
  process.on('close', (code) => {
    if (code === 0) resolve();
    else reject(new Error(`Video compression failed (${code}): ${errorOutput.slice(-1000)}`));
  });
});

const compressFollowUpVideo = async ({ inputPath, outputPath }) => {
  if (!ffmpegPath) throw new Error('Video compressor is not available');
  await fs.promises.mkdir(path.dirname(outputPath), { recursive: true });
  let smallestPath = '';
  let smallestSize = Infinity;

  try {
    for (let index = 0; index < profiles.length; index += 1) {
      const profile = profiles[index];
      const attemptPath = `${outputPath}.${index}.mp4`;
      await runFfmpeg([
        '-y', '-i', inputPath,
        '-map', '0:v:0', '-map', '0:a?',
        '-vf', `scale='min(${profile.width},iw)':-2`,
        '-c:v', 'libx264', '-preset', 'veryfast', '-crf', String(profile.crf),
        '-pix_fmt', 'yuv420p',
        '-c:a', 'aac', '-b:a', profile.audioBitrate, '-ac', '1',
        '-movflags', '+faststart',
        attemptPath,
      ]);
      const size = (await fs.promises.stat(attemptPath)).size;
      if (size < smallestSize) {
        if (smallestPath) await fs.promises.unlink(smallestPath).catch(() => {});
        smallestPath = attemptPath;
        smallestSize = size;
      } else {
        await fs.promises.unlink(attemptPath).catch(() => {});
      }
      if (size <= MAX_OUTPUT_BYTES) break;
    }
    await fs.promises.unlink(outputPath).catch(() => {});
    await fs.promises.rename(smallestPath, outputPath);
    smallestPath = '';
    return { size: smallestSize };
  } finally {
    if (smallestPath) await fs.promises.unlink(smallestPath).catch(() => {});
  }
};

module.exports = { compressFollowUpVideo, MAX_OUTPUT_BYTES };
