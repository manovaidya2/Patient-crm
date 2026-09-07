const express = require('express');
const {
  createAdviceRequest,
  listPatientAdvice,
  listAdviceRequests,
  listAdviceGiven,
  getUnreadAdviceCount,
  respondToAdviceRequest,
  updateAdviceRequest,
  updateAdviceAnswer,
} = require('../controllers/adviceController');
const { protect } = require('../middleware/auth');

const router = express.Router();

router.use(protect);

router.get('/unread-count', getUnreadAdviceCount);
router.get('/requests', listAdviceRequests);
router.get('/given', listAdviceGiven);
router.get('/patients/:patientId', listPatientAdvice);
router.post('/patients/:patientId', createAdviceRequest);
router.patch('/:id/request', updateAdviceRequest);
router.patch('/:id/advice', updateAdviceAnswer);
router.patch('/:id/respond', respondToAdviceRequest);

module.exports = router;
