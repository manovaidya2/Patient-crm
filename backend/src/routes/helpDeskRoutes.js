const express = require('express');
const { protect, authorize } = require('../middleware/auth');
const { ROLES } = require('../constants/roles');
const controller = require('../controllers/helpDeskController');

const router = express.Router();
router.use(protect, authorize(ROLES.ADMIN, ROLES.RECEPTIONIST));
router.get('/lookup', controller.lookup);
router.get('/', controller.list);
router.post('/', authorize(ROLES.RECEPTIONIST), controller.create);
router.patch('/:id/resolve', authorize(ROLES.RECEPTIONIST), controller.resolve);

module.exports = router;
