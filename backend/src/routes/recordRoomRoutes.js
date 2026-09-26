const express = require('express');
const { protect, authorize } = require('../middleware/auth');
const { ROLES } = require('../constants/roles');
const { uploadRecordRoomImages } = require('../middleware/fileUploads');
const controller = require('../controllers/recordRoomController');

const router = express.Router();
router.use(protect, authorize(ROLES.ADMIN, ROLES.RECEPTIONIST));
router.get('/', controller.list);
router.get('/lookup', controller.lookup);
router.get('/summary', controller.summary);
router.get('/movements', controller.movements);
router.get('/:id', controller.detail);
router.post('/', controller.create);
router.post('/:id/documents', uploadRecordRoomImages.array('documents', 30), controller.uploadDocuments);
router.post('/:id/issue', controller.issue);
router.post('/:id/collect/:issueId', controller.collect);

module.exports = router;
