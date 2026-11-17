const express = require('express');
const { protect, authorize } = require('../middleware/auth');
const { ROLES } = require('../constants/roles');
const { uploadRecordRoomImages, optimizeRecordRoomImages } = require('../middleware/fileUploads');
const controller = require('../controllers/recordRoomController');

const router = express.Router();
router.use(protect, authorize(ROLES.ADMIN, ROLES.RECEPTIONIST));
router.get('/overdue', authorize(ROLES.ADMIN, ROLES.MANAGER, ROLES.RECEPTIONIST), controller.overdue);
router.get('/', controller.list);
router.get('/lookup', controller.lookup);
router.get('/summary', controller.summary);
router.get('/movements', controller.movements);
router.get('/:id', controller.detail);
router.post('/', controller.create);
router.patch('/:id', authorize(ROLES.ADMIN, ROLES.MANAGER, ROLES.RECEPTIONIST), controller.update);
router.delete('/:id', authorize(ROLES.ADMIN), controller.remove);
router.post('/:id/documents', uploadRecordRoomImages.array('documents', 30), optimizeRecordRoomImages, controller.uploadDocuments);
router.patch('/:id/documents', authorize(ROLES.ADMIN, ROLES.MANAGER, ROLES.RECEPTIONIST), uploadRecordRoomImages.array('documents', 30), optimizeRecordRoomImages, controller.replaceAllDocuments);
router.patch('/:id/documents/:documentId', authorize(ROLES.ADMIN, ROLES.MANAGER, ROLES.RECEPTIONIST), uploadRecordRoomImages.array('documents', 1), optimizeRecordRoomImages, controller.replaceDocument);
router.delete('/:id/documents', authorize(ROLES.ADMIN, ROLES.MANAGER, ROLES.RECEPTIONIST), controller.deleteAllDocuments);
router.delete('/:id/documents/:documentId', authorize(ROLES.ADMIN, ROLES.MANAGER, ROLES.RECEPTIONIST), controller.deleteDocument);
router.post('/:id/issue', controller.issue);
router.post('/:id/collect/:issueId', controller.collect);

module.exports = router;
