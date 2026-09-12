const express = require('express');
const { getReviews, createReview, updateReview, deleteReview, REVIEW_ACCESS_ROLES } = require('../controllers/digitalMarketingController');
const { protect, authorize } = require('../middleware/auth');

const router = express.Router();

router.use(protect, authorize(...REVIEW_ACCESS_ROLES));

router.route('/reviews').get(getReviews).post(createReview);
router.route('/reviews/:id').patch(updateReview).delete(deleteReview);

module.exports = router;
