const express = require('express');
const multer = require('multer');
const { protect } = require('../middleware/auth');
const { transcribeSpeech } = require('../controllers/speechController');

const router = express.Router();

const uploadAudio = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 12 * 1024 * 1024,
  },
  fileFilter: (req, file, cb) => {
    if (!String(file.mimetype || '').startsWith('audio/')) {
      cb(new Error('Only audio files are allowed'));
      return;
    }
    cb(null, true);
  },
});

router.use(protect);

router.post('/transcribe', uploadAudio.single('audio'), transcribeSpeech);

module.exports = router;
