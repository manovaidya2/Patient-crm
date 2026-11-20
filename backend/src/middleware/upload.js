const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { withCompression } = require('../utils/uploadCompress');

const uploadDir = path.join(__dirname, '../../uploads/payments');
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
  if (file.mimetype.startsWith('image/')) {
    cb(null, true);
  } else {
    cb(new Error('Only image files are allowed for payment screenshots'));
  }
};

// Screenshots / photos are stored compressed (utils/uploadCompress).
const uploadPaymentScreenshot = withCompression(multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
}));

module.exports = { uploadPaymentScreenshot };