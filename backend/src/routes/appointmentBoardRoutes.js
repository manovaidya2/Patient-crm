const express = require('express');
const { protect } = require('../middleware/auth');
const controller = require('../controllers/appointmentBoardController');

// The "Appointments" page: everyone signed in can see it; the controller checks who releases (Reception) and who ticks
// the history (the PCC the patient was released to).
const router = express.Router();
router.use(protect);
router.get('/', controller.listBoard);
router.post('/:id/release', controller.releasePatient);
router.post('/:id/history', controller.markHistory);

module.exports = router;
