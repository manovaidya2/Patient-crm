// Photos and screenshots are made smaller in the browser before they are uploaded (quick on a slow connection).
// Same rule as the server (backend/src/utils/uploadCompress.js), so a photo is never compressed twice: under
// 200 KB stays as it is; a JPG within 2200 px and 1.2 MB stays as it is; anything else becomes a JPG with its
// longest side at most 2200 px, quality 0.8. Kept only when it really got smaller. PDFs are compressed on the server.
const MAX_SIDE = 2200;
const QUALITY = 0.8;
const SMALL_BYTES = 200 * 1024;
const HEAVY_JPEG_BYTES = 1200 * 1024;
const TYPES = /^image\/(jpeg|jpg|png|webp)$/i;

// Files this app already compressed (or optimized its own way) - sent as they are.
const done = new WeakSet();
export const markCompressed = (file) => { if (file) done.add(file); return file; };

export async function compressImage(file) {
  if (!(file instanceof File) || done.has(file) || !TYPES.test(file.type) || file.size < SMALL_BYTES || typeof createImageBitmap !== 'function') return file;
  let bitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const jpeg = /jpe?g$/i.test(file.type);
    if (jpeg && Math.max(bitmap.width, bitmap.height) <= MAX_SIDE && file.size <= HEAVY_JPEG_BYTES) return markCompressed(file);
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d', { alpha: false });
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.imageSmoothingQuality = 'high';
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', QUALITY));
    if (!blob || blob.size >= file.size) return markCompressed(file);
    const name = `${file.name.replace(/\.[^.]+$/, '') || 'image'}.jpg`;
    return markCompressed(new File([blob], name, { type: 'image/jpeg', lastModified: file.lastModified }));
  } catch {
    return file; // the server still compresses it
  } finally {
    bitmap?.close?.();
  }
}

// A FormData with every photo in it compressed (other fields and files unchanged, same order).
export async function compressFormData(form) {
  const entries = [...form.entries()];
  if (!entries.some(([, value]) => value instanceof File && TYPES.test(value.type) && !done.has(value))) return form;
  const out = new FormData();
  for (const [key, value] of entries) {
    if (value instanceof File) { const file = await compressImage(value); out.append(key, file, file.name); } else out.append(key, value);
  }
  return out;
}
