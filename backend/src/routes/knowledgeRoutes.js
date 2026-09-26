const express = require('express');
const { protect, authorize } = require('../middleware/auth');
const { ROLES } = require('../constants/roles');
const controller = require('../controllers/knowledgeController');

const router = express.Router();
router.use(protect, authorize(ROLES.ADMIN, ROLES.RECEPTIONIST));
router.get('/', controller.list);
router.get('/categories', controller.listCategories);
router.post('/', authorize(ROLES.ADMIN, ROLES.RECEPTIONIST), controller.create);
router.post('/categories', authorize(ROLES.ADMIN), controller.createCategory);
router.delete('/categories/:id', authorize(ROLES.ADMIN), controller.removeCategory);
router.patch('/:id', authorize(ROLES.ADMIN), controller.update);
router.delete('/:id', authorize(ROLES.ADMIN), controller.remove);

module.exports = router;
