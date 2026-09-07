const express = require('express');
const { createUser, getUsers, updateUser, deleteUser, getAssistantDoctors, getPsychologists } = require('../controllers/userController');
const { protect, authorize } = require('../middleware/auth');

const router = express.Router();

router.use(protect);

// Used to populate the "Assigned Doctor" dropdown — not full Team Members access
router.get('/assistant-doctors', authorize('admin', 'manager', 'post_counselor'), getAssistantDoctors);
router.get('/psychologists', authorize('admin', 'manager', 'post_counselor'), getPsychologists);

// Everything else stays admin-only
router.use(authorize('admin'));
router.route('/').post(createUser).get(getUsers);
router.route('/:id').patch(updateUser).delete(deleteUser);

module.exports = router;
