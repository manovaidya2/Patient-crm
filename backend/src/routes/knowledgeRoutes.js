const express = require('express');
const { protect, authorize } = require('../middleware/auth');
const { ROLES, GENERAL_CRM_ROLES } = require('../constants/roles');
const controller = require('../controllers/knowledgeController');

const router = express.Router();
router.use(protect, authorize(...GENERAL_CRM_ROLES));
router.use(require('../middleware/errorHandler').asyncHandler(async (req, res, next) => {
  await require('../utils/knowledgeMigration')();
  next();
}));
router.get('/', controller.list);
router.get('/categories', controller.listCategories);
router.post('/', controller.create);
router.post('/categories', authorize(ROLES.ADMIN), controller.createCategory);
router.delete('/categories/:id', authorize(ROLES.ADMIN), controller.removeCategory);
router.patch('/:id', authorize(ROLES.ADMIN), controller.update);
router.delete('/:id', authorize(ROLES.ADMIN), controller.remove);

module.exports = router;
