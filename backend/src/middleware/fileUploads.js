const multer = require('multer');
const path = require('path');
const fs = require('fs');

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

module.exports = {
  uploadStageRecord: createUpload('records'),
  uploadPrescription: createUpload('prescriptions'),
  uploadMedicineImage: createUpload('medicine', { imagesOnly: true }),
  uploadCourierImage: createUpload('courier', { imagesOnly: true }),
  uploadCallRecording: createUpload('recording', {
    allowedTypes: callRecordingMimeTypes,
    maxFileSize: 100 * 1024 * 1024,
  }),
};
