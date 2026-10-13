const express = require('express');
const { protect, authorize } = require('../middleware/auth');
const { ROLES } = require('../constants/roles');
const controller = require('../controllers/receptionistChecklistController');

const router = express.Router();
router.use(protect, authorize(ROLES.ADMIN, ROLES.DOCTOR, ROLES.RECEPTIONIST));
router.get('/receptionists', authorize(ROLES.ADMIN, ROLES.DOCTOR), controller.listReceptionists);
router.get('/items', controller.listItems);
router.get('/daily', controller.listDaily);
router.get('/summary', controller.getSummary);
router.put('/records', authorize(ROLES.RECEPTIONIST), controller.saveRecord);
router.put('/review', authorize(ROLES.ADMIN, ROLES.DOCTOR), controller.reviewRecord);
router.put('/day-review', authorize(ROLES.ADMIN, ROLES.DOCTOR), controller.reviewDay);
router.post('/items', authorize(ROLES.ADMIN), controller.createItem);
router.patch('/items/:id', authorize(ROLES.ADMIN), controller.updateItem);
router.delete('/items/:id', authorize(ROLES.ADMIN), controller.deleteItem);

module.exports = router;
