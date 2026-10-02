const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const Model = require('../models/ClinicInventory');
const { asyncHandler } = require('../middleware/errorHandler');
const root = path.resolve(__dirname, '../../uploads/clinic-inventory');
const legacyRoot = path.resolve(__dirname, '../../privateUploads/clinic-inventory');
function detectType(buffer) {
  if (buffer.subarray(0, 5).toString('ascii') === '%PDF-') return { mime: 'application/pdf', extension: '.pdf' };
  if (buffer.length >= 3 && buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255) return { mime: 'image/jpeg', extension: '.jpg' };
  if (buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return { mime: 'image/png', extension: '.png' };
  return null;
}
const upload = asyncHandler(async (req, res) => {
  if (!req.file) return res.status(400).json({ message: 'Choose a PDF, JPG or PNG file' });
  const type = detectType(req.file.buffer);
  if (!type) return res.status(400).json({ message: 'Only PDF, JPG or PNG files are supported' });
  const item = await Model.findOne({ _id: req.params.id, deletedAt: null });
  if (!item) return res.status(404).json({ message: 'Clinic inventory item not found' });
  const filename = `${crypto.randomUUID()}${type.extension}`;
  await fs.mkdir(root, { recursive: true });
  await fs.writeFile(path.join(root, filename), req.file.buffer, { flag: 'wx' });
  item.softCopy = { filename, originalName: path.basename(req.file.originalname).slice(0, 200), mimeType: type.mime, uploadedAt: new Date(), uploadedByName: req.user.name };
  try { await item.save(); }
  catch (error) { await fs.unlink(path.join(root, filename)).catch(() => {}); if (error.name === 'VersionError') { error.statusCode = 409; error.message = 'Item changed. Refresh and upload again.'; } throw error; }
  // Retain replaced files for recovery; only the current copy is exposed through the API.
  res.status(201).json({ success: true });
});
const view = asyncHandler(async (req, res, next) => {
  const item = await Model.findOne({ _id: req.params.id, deletedAt: null }).select('softCopy');
  const file = item?.softCopy;
  if (!file?.filename) return res.status(404).json({ message: 'Soft copy not found' });
  if (path.basename(file.filename) !== file.filename) return res.status(404).json({ message: 'Soft copy not found' });
  // Older deployments may still have files in the previous storage directory.
  try { await fs.access(path.join(root, file.filename)); }
  catch (error) {
    if (error.code !== 'ENOENT') throw error;
    await fs.mkdir(root, { recursive: true });
    try { await fs.copyFile(path.join(legacyRoot, file.filename), path.join(root, file.filename), fs.constants.COPYFILE_EXCL); }
    catch (copyError) { if (copyError.code !== 'EEXIST') throw copyError; }
  }
  res.set({ 'Content-Type': file.mimeType, 'Content-Disposition': 'inline', 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' });
  res.sendFile(file.filename, { root }, (error) => { if (error) next(error); });
});
module.exports = { upload, view, detectType };
