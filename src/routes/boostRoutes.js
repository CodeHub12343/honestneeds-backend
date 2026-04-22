const express = require('express');
const { authMiddleware } = require('../middleware/authMiddleware');
const BoostController = require('../controllers/BoostController');

const router = express.Router();

/**
 * Boost Routes
 * All routes are protected with authMiddleware
 */

// Public routes
/**
 * GET /api/boosts/tiers
 * Get available boost tier options
 */
router.get('/tiers', BoostController.getBoostTiers);

// Protected routes (require authentication)
/**
 * POST /api/boosts/create-session
 * Create Stripe checkout session for boost purchase
 * Body: { campaign_id, tier }
 */
router.post(
  '/create-session',
  authMiddleware,
  BoostController.createCheckoutSession
);

/**
 * GET /api/boosts/campaign/:campaign_id
 * Get active boost for specific campaign
 */
router.get('/campaign/:campaign_id', BoostController.getCampaignBoost);

/**
 * GET /api/boosts/my-boosts
 * Get all boosts for authenticated creator
 * Query: page, limit
 */
router.get('/my-boosts', authMiddleware, BoostController.getCreatorBoosts);

/**
 * POST /api/boosts/:boost_id/extend
 * Extend active boost for additional 30 days
 */
router.post(
  '/:boost_id/extend',
  authMiddleware,
  BoostController.extendBoost
);

/**
 * POST /api/boosts/:boost_id/cancel
 * Cancel active boost
 * Body: { reason? }
 */
router.post(
  '/:boost_id/cancel',
  authMiddleware,
  BoostController.cancelBoost
);

/**
 * POST /api/boosts/:boost_id/update-stats
 * Update boost statistics (admin-protected in production)
 * Body: { views, engagement, conversions }
 */
router.post(
  '/:boost_id/update-stats',
  authMiddleware,
  BoostController.updateBoostStats
);

/**
 * GET /api/boosts/session/:session_id/status
 * Get Stripe session status
 */
router.get(
  '/session/:session_id/status',
  BoostController.getSessionStatus
);

module.exports = router;
