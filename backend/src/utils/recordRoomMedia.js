const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const MAX_RECORD_ROOM_FILE_BYTES = 10 * 1024 * 1024;
const STORED_IMAGE_TARGET_BYTES = Math.floor(9.5 * 1024 * 1024);

const renderJpeg = (input, profile) => sharp(input, { failOn: 'warning' })
  .rotate()
  .resize({
    width: profile.width,
    height: profile.height,
    fit: 'inside',
    withoutEnlargement: true,
  })
  .flatten({ background: '#ffffff' })
  .jpeg({ quality: profile.quality, mozjpeg: true, chromaSubsampling: '4:2:0' })
  .toBuffer();

const compressImageBuffer = async (input, targetBytes = STORED_IMAGE_TARGET_BYTES) => {
  const targetKb = targetBytes / 1024;
  let profile = targetKb >= 700
    ? { width: 2000, height: 2800, quality: 82 }
    : targetKb >= 350
      ? { width: 1800, height: 2520, quality: 78 }
      : targetKb >= 180
        ? { width: 1550, height: 2170, quality: 72 }
        : targetKb >= 90
          ? { width: 1250, height: 1750, quality: 64 }
          : { width: 900, height: 1260, quality: 52 };
  let smallest;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const output = await renderJpeg(input, profile);
    if (!smallest || output.length < smallest.length) smallest = output;
    if (output.length <= targetBytes) return output;
    const sizeRatio = Math.sqrt(targetBytes / output.length);
    const dimensionRatio = Math.max(0.62, Math.min(0.9, sizeRatio * 0.96));
    profile = {
      width: Math.max(420, Math.floor(profile.width * dimensionRatio)),
      height: Math.max(588, Math.floor(profile.height * dimensionRatio)),
      quality: Math.max(28, profile.quality - 8),
    };
  }
  return smallest;
};

const optimizeUploadedImage = async (file) => {
  const sourcePath = file.path;
  const parsed = path.parse(sourcePath);
  const outputPath = path.join(parsed.dir, `${parsed.name}-optimized.jpg`);
  try {
    const output = await compressImageBuffer(sourcePath, STORED_IMAGE_TARGET_BYTES);
    if (output.length > MAX_RECORD_ROOM_FILE_BYTES) throw new Error('Image could not be compressed below 10 MB');
    await fs.promises.writeFile(outputPath, output);
    await fs.promises.unlink(sourcePath);
    return {
      ...file,
      path: outputPath,
      filename: path.basename(outputPath),
      mimetype: 'image/jpeg',
      size: output.length,
    };
  } catch (error) {
    await fs.promises.unlink(outputPath).catch(() => {});
    throw error;
  }
};

const compressImageForPdf = (filePath, targetBytes) => compressImageBuffer(filePath, targetBytes);

module.exports = {
  MAX_RECORD_ROOM_FILE_BYTES,
  STORED_IMAGE_TARGET_BYTES,
  compressImageBuffer,
  compressImageForPdf,
  optimizeUploadedImage,
};
