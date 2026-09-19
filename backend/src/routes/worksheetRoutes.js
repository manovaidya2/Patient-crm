const express = require('express');
const multer = require('multer');
const {
  getWorksheet,
  createWorksheetColumn,
  updateWorksheetColumn,
  deleteWorksheetColumn,
  createManualWorksheetRow,
  updateWorksheetRow,
  deleteWorksheetRow,
  importWorksheet,
} = require('../controllers/worksheetController');
const { protect } = require('../middleware/auth');

const router = express.Router();

// Sheets are parsed straight from memory; nothing is written to disk.
const uploadSheet = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

router.use(protect);
router.get('/', getWorksheet);
router.post('/columns', createWorksheetColumn);
router.put('/columns/:id', updateWorksheetColumn);
router.delete('/columns/:id', deleteWorksheetColumn);
router.post('/rows', createManualWorksheetRow);
router.put('/rows/:id', updateWorksheetRow);
router.delete('/rows/:id', deleteWorksheetRow);
router.post('/import', uploadSheet.single('file'), importWorksheet);

module.exports = router;
