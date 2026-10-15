const express = require('express');
const router = express.Router();
const { authMiddleware, optionalAuthMiddleware } = require('../middleware/authMiddleware');
const FeatureSpotlightController = require('../controllers/FeatureSpotlightController');

// Public but auth-aware: anonymous visitors get the 'any'/'anonymous' slice,
// signed-in viewers get their personalised list with dismissals applied.
router.get('/', optionalAuthMiddleware, FeatureSpotlightController.list);
router.post('/:key/dismiss', authMiddleware, FeatureSpotlightController.dismiss);

module.exports = router;
