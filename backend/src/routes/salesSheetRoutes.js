const express = require('express');
const { protect, authorize } = require('../middleware/auth');
const { ROLES } = require('../constants/roles');
const controller = require('../controllers/salesSheetController');

const router = express.Router();
router.use(protect, authorize(ROLES.ADMIN, ROLES.SALES_TEAM));
router.get('/columns', controller.listColumns);
router.post('/columns', authorize(ROLES.ADMIN), controller.createColumn);
router.patch('/columns/:id', authorize(ROLES.ADMIN), controller.updateColumn);
router.delete('/columns/:id', authorize(ROLES.ADMIN), controller.deleteColumn);
router.get('/appointments', controller.listAppointments);
router.post('/appointments', controller.createAppointment);
router.patch('/appointments/:id', controller.updateAppointment);
router.delete('/appointments/:id', controller.deleteAppointment);
module.exports = router;
