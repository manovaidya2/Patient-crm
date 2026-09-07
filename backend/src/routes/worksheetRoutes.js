const express = require('express');
const { getWorksheet, createWorksheetColumn, createManualWorksheetRow } = require('../controllers/worksheetController');
const { protect } = require('../middleware/auth');

const router = express.Router();

router.use(protect);
router.get('/', getWorksheet);
router.post('/columns', createWorksheetColumn);
router.post('/rows', createManualWorksheetRow);

module.exports = router;
