const express = require('express');
const { protect, authorize } = require('../middleware/auth');
const { ROLES } = require('../constants/roles');
const controller = require('../controllers/knowledgeController');

const router = express.Router();
router.use(protect, authorize(ROLES.ADMIN, ROLES.RECEPTIONIST));
router.get('/', controller.list);
router.post('/', controller.create);
router.patch('/:id', controller.update);
router.delete('/:id', controller.remove);

module.exports = router;
