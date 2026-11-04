const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const ffmpegPath = require('ffmpeg-static');
const { compressVoice } = require('./audioCompress');

test('a voice recording is stored as small mono Opus; a broken file keeps the original', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'voice-'));
  try {
    const input = path.join(dir, 'rec.webm');
    // 10 s of stereo 128 kbps audio, like a browser recording at default settings.
    spawnSync(ffmpegPath, ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'sine=frequency=220:duration=10', '-ac', '2', '-ar', '48000', '-c:a', 'libopus', '-b:a', '128k', input]);
    const before = fs.statSync(input).size;
    const kept = await compressVoice({ path: input, filename: 'rec.webm', mimetype: 'audio/webm;codecs=opus', size: before });
    assert.equal(kept.compressed, true);
    assert.equal(kept.mimetype, 'audio/webm');
    assert.ok(kept.size < before / 2, `compressed ${kept.size} from ${before}`);
    assert.equal(fs.existsSync(input), false, 'the big original is removed');
    assert.equal(fs.existsSync(kept.path), true);

    const broken = path.join(dir, 'broken.webm');
    fs.writeFileSync(broken, 'not audio');
    const same = await compressVoice({ path: broken, filename: 'broken.webm', mimetype: 'audio/webm', size: 9 });
    assert.equal(same.compressed, false);
    assert.equal(same.filename, 'broken.webm');
    assert.equal(fs.existsSync(broken), true);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
