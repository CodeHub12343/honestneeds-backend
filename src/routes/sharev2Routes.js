/**
 * Share/Referral Routes - Production Ready
 * All 12 endpoints for sharing, referral tracking, and earnings management
 * 
 * Endpoints:
 * 1. POST /share/join - Join share program
 * 2. POST /share/track - Track share event
 * 3. GET /share/:campaignId/status - Campaign share status
 * 4. GET /share/:userId/earnings - User earnings
 * 5. GET /share/history - User share history
 * 6. POST /share/withdraw - Withdraw earnings
 * 7. GET /share/:platform/performance - Platform performance
 * 8. GET /share/leaderboard - Top sharers leaderboard
 * 9. GET /share/referral-link - Generate referral link
 * 10. POST /share/bulk-track - Bulk track events
 * 11. GET /share/:id/details - Share details
 * 12. DELETE /share/:id - Delete share
 */

const express = require('express');
const router = express.Router();
const ShareController = require('../controllers/ShareController');
const { authMiddleware } = require('../middleware/authMiddleware');

// ============================================================================
// GENERAL ENDPOINTS (must come before :id routes to avoid conflicts)
// ============================================================================

/**
 * ENDPOINT 8: GET /share/leaderboard
 * Get top sharers leaderboard
 * Query params: limit (default 10), timeframe (all|month|week)
 * Access: Public or authenticated
 */
router.get(
  '/leaderboard',
  authMiddleware,
  ShareController.getLeaderboard.bind(ShareController)
);

/**
 * ENDPOINT 5: GET /share/history
 * Get user's share activity history
 * Query params: page, limit, startDate, endDate
 * Access: Authenticated
 */
router.get(
  '/history',
  authMiddleware,
  ShareController.getShareHistory.bind(ShareController)
);

/**
 * ENDPOINT 9: GET /share/referral-link
 * Generate unique referral link for campaigns
 * Query params: campaignId
 * Access: Authenticated
 */
router.get(
  '/referral-link',
  authMiddleware,
  ShareController.generateReferralLink.bind(ShareController)
);

/**
 * ENDPOINT 7: GET /share/:platform/performance
 * Get performance stats by platform (must be before generic :id route)
 * Path params: platform = 'facebook' | 'instagram' | 'twitter' | 'all'
 * Access: Authenticated
 */
router.get(
  '/:platform/performance',
  authMiddleware,
  ShareController.getPlatformPerformance.bind(ShareController)
);

// ============================================================================
// MAIN ENDPOINTS
// ============================================================================

/**
 * ENDPOINT 1: POST /share/join
 * Join share program for a campaign
 * Body: {campaignId, platform}
 * Access: Authenticated
 */
router.post(
  '/join',
  authMiddleware,
  ShareController.joinShareProgram.bind(ShareController)
);

/**
 * ENDPOINT 2: POST /share/track
 * Track a share event
 * Body: {campaignId, platform, eventType?}
 * Access: Authenticated
 */
router.post(
  '/track',
  authMiddleware,
  ShareController.trackShareEvent.bind(ShareController)
);

/**
 * ENDPOINT 10: POST /share/bulk-track
 * Track multiple share events at once
 * Body: {events: [{campaignId, channel, timestamp?}...]}
 * Access: Authenticated
 */
router.post(
  '/bulk-track',
  authMiddleware,
  ShareController.bulkTrackEvents.bind(ShareController)
);

/**
 * ENDPOINT 6: POST /share/withdraw
 * Request withdrawal of earnings
 * Body: {amount (in cents), method ('stripe'|'bank'|'paypal')}
 * Access: Authenticated
 */
router.post(
  '/withdraw',
  authMiddleware,
  ShareController.requestWithdrawal.bind(ShareController)
);

/**
 * ENDPOINT 3: GET /share/:campaignId/status
 * Get current share status for a campaign
 * Path params: campaignId
 * Access: Authenticated
 */
router.get(
  '/:campaignId/status',
  authMiddleware,
  ShareController.getShareStatus.bind(ShareController)
);

/**
 * ENDPOINT 4: GET /share/:userId/earnings
 * Get user's total earnings from shares
 * Path params: userId
 * Access: Authenticated (own user or admin)
 */
router.get(
  '/:userId/earnings',
  authMiddleware,
  ShareController.getUserEarnings.bind(ShareController)
);

// ============================================================================
// DETAIL/ACTION ROUTES (come after main routes)
// ============================================================================

/**
 * ENDPOINT 11: GET /share/:id/details
 * Get detailed share information including conversion rates
 * Path params: id (share record ID)
 * Access: Authenticated (owner or admin)
 */
router.get(
  '/:id/details',
  authMiddleware,
  ShareController.getShareDetails.bind(ShareController)
);

/**
 * ENDPOINT 12: DELETE /share/:id
 * Delete a share record (only if unpaid)
 * Path params: id (share record ID)
 * Access: Authenticated (owner only)
 */
router.delete(
  '/:id',
  authMiddleware,
  ShareController.deleteShare.bind(ShareController)
);

// ============================================================================
// ERROR HANDLING MIDDLEWARE
// ============================================================================

router.use((error, req, res, next) => {
  console.error('Share Route Error:', error);
  
  if (error.name === 'ValidationError') {
    return res.status(400).json({
      success: false,
      error: 'VALIDATION_FAILED',
      message: error.message
    });
  }
  
  if (error.statusCode === 404) {
    return res.status(404).json({
      success: false,
      error: 'NOT_FOUND',
      message: error.message
    });
  }

  if (error.statusCode === 403) {
    return res.status(403).json({
      success: false,
      error: 'FORBIDDEN',
      message: error.message
    });
  }
  
  res.status(500).json({
    success: false,
    error: 'INTERNAL_ERROR',
    message: 'An internal server error occurred'
  });
});

module.exports = router;
