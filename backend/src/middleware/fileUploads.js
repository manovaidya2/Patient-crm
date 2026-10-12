const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { optimizeUploadedImage } = require('../utils/recordRoomMedia');

const allowedMimeTypes = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];

const callRecordingMimeTypes = [
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
  'audio/x-wav',
  'audio/webm',
  'audio/aac',
  'audio/ogg',
  'audio/mp4',
  'video/mp4',
  'video/webm',
  'application/octet-stream',
];

const createUpload = (folder, { imagesOnly = false, allowedTypes = null, maxFileSize = 10 * 1024 * 1024 } = {}) => {
  const uploadDir = path.join(__dirname, '../../uploads', folder);
  fs.mkdirSync(uploadDir, { recursive: true });

  const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname);
      const safeName = `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
      cb(null, safeName);
    },
  });

  const fileFilter = (req, file, cb) => {
    const allowed = allowedTypes
      ? allowedTypes.includes(file.mimetype)
      : imagesOnly
        ? file.mimetype.startsWith('image/')
        : allowedMimeTypes.includes(file.mimetype);
    if (allowed) {
      cb(null, true);
    } else {
      cb(
        new Error(
          allowedTypes
            ? 'Only audio or video call recordings are allowed'
            : imagesOnly
              ? 'Only image files are allowed'
              : 'Only images, PDF, or Word documents are allowed'
        )
      );
    }
  };

  return multer({
    storage,
    fileFilter,
    limits: { fileSize: maxFileSize },
  });
};

const removeUploadedFiles = async (files) => Promise.all((files || []).map((file) => fs.promises.unlink(file.path).catch(() => {})));
const optimizeRecordRoomImages = async (req, res, next) => {
  const files = req.files || [];
  const optimized = [];
  let cursor = 0;
  const worker = async () => {
    while (cursor < files.length) {
      const index = cursor;
      cursor += 1;
      optimized[index] = await optimizeUploadedImage(files[index]);
    }
  };
  try {
    const results = await Promise.allSettled(Array.from({ length: Math.min(3, files.length) }, worker));
    const failed = results.find((result) => result.status === 'rejected');
    if (failed) throw failed.reason;
    req.files = optimized;
    next();
  } catch (error) {
    await removeUploadedFiles([...files, ...optimized.filter(Boolean)]);
    error.statusCode = 400;
    error.message = 'One of the images could not be optimized. Use a clear JPG or PNG image.';
    next(error);
  }
};

module.exports = {
  uploadStageRecord: createUpload('records'),
  uploadConsultationFeeProof: createUpload('consultation-fees'),
  uploadRecordRoomImages: createUpload('records', { imagesOnly: true }),
  optimizeRecordRoomImages,
  uploadPrescription: createUpload('prescriptions'),
  uploadMedicineImage: createUpload('medicine', { imagesOnly: true }),
  uploadCourierImage: createUpload('courier', { imagesOnly: true }),
  uploadScheduleCompletion: createUpload('schedule'),
  uploadCallRecording: createUpload('recording', {
    allowedTypes: callRecordingMimeTypes,
    maxFileSize: 100 * 1024 * 1024,
  }),
};
