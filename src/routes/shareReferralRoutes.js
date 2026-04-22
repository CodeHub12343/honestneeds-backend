/**
 * @fileoverview Share Referral Routes
 * Handles share campaign participation, earnings tracking, withdrawals, and leaderboards
 * 
 * Routes:
 * 1. POST /share/join - Join Share Campaign
 * 2. POST /share/track - Track Share Event
 * 3. GET /share/:campaignId/status - Get Share Status
 * 4. GET /share/:userId/earnings - Get User Earnings
 * 5. GET /share/history - Get Share History
 * 6. POST /share/withdraw - Withdraw Earnings
 * 7. GET /share/:platform/performance - Get Platform Performance
 * 8. GET /share/leaderboard - Get Leaderboard
 * 
 * @requires express
 * @requires ../middleware/auth
 * @requires ../controllers/ShareReferralController
 */

const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/authMiddleware');
const ShareReferralController = require('../controllers/ShareReferralController');

// ============================================
// PUBLIC ROUTES (No auth required)
// ============================================

/**
 * GET /api/share/leaderboard
 * @description Get global or campaign-specific share leaderboard
 * @access Public
 * @param {string} campaign_id - Filter to specific campaign (optional)
 * @param {string} platform - Filter by platform (optional)
 * @param {number} limit - Leaderboard size (default: 20)
 * @param {number} page - Page number (default: 1)
 * @returns {Object} Leaderboard entries with rankings
 * 
 * @example
 * GET /api/share/leaderboard?campaign_id=507f1f77bcf86cd799439011&limit=10
 * 
 * Response 200:
 * {
 *   "success": true,
 *   "leaderboard": {
 *     "filter": { "type": "campaign", "campaign_id": "507f1f77bcf86cd799439011" },
 *     "total_participants": 150,
 *     "entries": [
 *       {
 *         "rank": 1,
 *         "user_id": "507f1f77bcf86cd799439020",
 *         "user_name": "Top Sharer",
 *         "total_earnings": 25000,
 *         "total_shares": 500,
 *         "total_conversions": 85,
 *         "conversion_rate": 17.0
 *       }
 *     ]
 *   }
 * }
 */
router.get('/leaderboard', ShareReferralController.getShareLeaderboard);

// ============================================
// PROTECTED ROUTES (Authentication required)
// ============================================

/**
 * POST /api/share/join
 * @description Join a share campaign to start earning from shares
 * @access Protected
 * @body {string} campaign_id - Campaign to join
 * @returns {Object} Share tracking record with referral code
 * 
 * @example
 * POST /api/share/join
 * Authorization: Bearer {token}
 * {
 *   "campaign_id": "507f1f77bcf86cd799439011"
 * }
 * 
 * Response 201:
 * {
 *   "success": true,
 *   "share_tracking": {
 *     "id": "507f1f77bcf86cd799439030",
 *     "referral_code": "ABC12XYZ",
 *     "referral_link": "https://honestneed.com/campaigns/507f1f77bcf86cd799439011?ref=ABC12XYZ",
 *     "status": "active",
 *     "total_earnings": 0
 *   }
 * }
 */
router.post('/join', authenticate, ShareReferralController.joinShareCampaign);

/**
 * POST /api/share/track
 * @description Track a share event (when user shares campaign)
 * @access Protected
 * @body {string} campaign_id - Campaign shared
 * @body {string} platform - Platform shared to (facebook, instagram, email, etc.)
 * @body {string} utm_source - UTM tracking source (optional)
 * @returns {Object} Share event record
 * 
 * @example
 * POST /api/share/track
 * Authorization: Bearer {token}
 * {
 *   "campaign_id": "507f1f77bcf86cd799439011",
 *   "platform": "facebook"
 * }
 * 
 * Response 200:
 * {
 *   "success": true,
 *   "share": {
 *     "share_id": "SR-1712345678901-abc123def",
 *     "platform": "facebook",
 *     "timestamp": "2026-04-04T10:00:00Z",
 *     "total_shares": 5
 *   }
 * }
 */
router.post('/track', authenticate, ShareReferralController.trackShare);

/**
 * GET /api/share/:campaignId/status
 * @description Get share status for a specific campaign
 * @access Protected
 * @param {string} campaignId - Campaign ID
 * @returns {Object} Share tracking status, metrics, and referral info
 * 
 * @example
 * GET /api/share/507f1f77bcf86cd799439011/status
 * Authorization: Bearer {token}
 * 
 * Response 200:
 * {
 *   "success": true,
 *   "share_status": {
 *     "campaign_id": "507f1f77bcf86cd799439011",
 *     "status": "active",
 *     "total_shares": 25,
 *     "total_conversions": 4,
 *     "conversion_rate": 16.0,
 *     "total_earnings": 2000,
 *     "pending_earnings": 500,
 *     "withdrawn_earnings": 1500,
 *     "referral_code": "ABC12XYZ",
 *     "referral_link": "https://honestneed.com/campaigns/507f1f77bcf86cd799439011?ref=ABC12XYZ",
 *     "platforms": {
 *       "facebook": {
 *         "shares": 15,
 *         "earnings": 1500,
 *         "conversions": 3,
 *         "conversionRate": 20.0
 *       },
 *       "instagram": {
 *         "shares": 10,
 *         "earnings": 500,
 *         "conversions": 1,
 *         "conversionRate": 10.0
 *       }
 *     },
 *     "joined_at": "2026-04-01T10:00:00Z",
 *     "last_share_at": "2026-04-04T10:00:00Z"
 *   }
 * }
 */
router.get('/:campaignId/status', authenticate, ShareReferralController.getShareStatus);

/**
 * GET /api/share/:userId/earnings
 * @description Get total earnings for user across all campaigns
 * @access Protected (User can view own or admin can view any)
 * @param {string} userId - User ID (use "me" for current user)
 * @query {string} campaign_id - Optional filter to specific campaign
 * @returns {Object} Earnings summary with breakdown by campaign
 * 
 * @example
 * GET /api/share/me/earnings
 * Authorization: Bearer {token}
 * 
 * Response 200:
 * {
 *   "success": true,
 *   "earnings": {
 *     "total_earnings": 15000,
 *     "pending_earnings": 3000,
 *     "withdrawn_earnings": 12000,
 *     "available_withdrawal": 12000,
 *     "total_shares": 300,
 *     "total_conversions": 45,
 *     "overall_conversion_rate": 15.0,
 *     "by_campaign": [
 *       {
 *         "campaign_id": "507f1f77bcf86cd799439011",
 *         "earnings": 8000,
 *         "pending": 1500,
 *         "shares": 150,
 *         "conversions": 25,
 *         "conversion_rate": 16.67
 *       }
 *     ]
 *   }
 * }
 */
router.get('/:userId/earnings', authenticate, ShareReferralController.getUserEarnings);

/**
 * GET /api/share/history
 * @description Get share history with filtering and pagination
 * @access Protected
 * @query {string} campaign_id - Filter by campaign (optional)
 * @query {string} platform - Filter by platform (optional)
 * @query {string} status - Filter by status: completed, pending_verification, verified, all (default: all)
 * @query {number} page - Page number (default: 1)
 * @query {number} limit - Items per page (default: 20)
 * @query {string} startDate - Filter from date (ISO 8601)
 * @query {string} endDate - Filter to date (ISO 8601)
 * @returns {Object} Paginated share history
 * 
 * @example
 * GET /api/share/history?platform=facebook&status=completed&limit=10
 * Authorization: Bearer {token}
 * 
 * Response 200:
 * {
 *   "success": true,
 *   "history": {
 *     "total": 250,
 *     "page": 1,
 *     "limit": 10,
 *     "pages": 25,
 *     "shares": [
 *       {
 *         "share_id": "SR-1712345678901-abc123def",
 *         "campaign": "Help Local Community",
 *         "platform": "facebook",
 *         "earned": 500,
 *         "is_paid": true,
 *         "status": "completed",
 *         "created_at": "2026-04-04T10:00:00Z"
 *       }
 *     ]
 *   }
 * }
 */
router.get('/history', authenticate, ShareReferralController.getShareHistory);

/**
 * POST /api/share/withdraw
 * @description Request withdrawal of earnings
 * @access Protected
 * @body {number} amount - Amount to withdraw (in cents)
 * @body {string} payment_method_id - Payment method to use
 * @body {string} payment_type - Type of payment (bank_transfer, mobile_money, stripe, paypal)
 * @returns {Object} Withdrawal request confirmation
 * 
 * @example
 * POST /api/share/withdraw
 * Authorization: Bearer {token}
 * {
 *   "amount": 5000,
 *   "payment_method_id": "507f1f77bcf86cd799439040",
 *   "payment_type": "bank_transfer"
 * }
 * 
 * Response 201:
 * {
 *   "success": true,
 *   "withdrawal": {
 *     "withdrawal_id": "SW-1712345678901-abc123def",
 *     "amount_requested": 5000,
 *     "status": "pending",
 *     "requested_at": "2026-04-04T10:00:00Z"
 *   }
 * }
 */
router.post('/withdraw', authenticate, ShareReferralController.withdrawEarnings);

/**
 * GET /api/share/:platform/performance
 * @description Get share performance metrics by platform
 * @access Protected
 * @param {string} platform - Platform (facebook, instagram, twitter, email, etc.)
 * @query {string} campaign_id - Optional campaign filter
 * @returns {Object} Platform-specific performance metrics
 * 
 * @example
 * GET /api/share/facebook/performance?campaign_id=507f1f77bcf86cd799439011
 * Authorization: Bearer {token}
 * 
 * Response 200:
 * {
 *   "success": true,
 *   "performance": {
 *     "platform": "facebook",
 *     "total_shares": 150,
 *     "total_earnings": 12000,
 *     "total_conversions": 25,
 *     "conversion_rate": 16.67,
 *     "breakdown": [
 *       {
 *         "share_id": "SR-1712345678901-abc123def",
 *         "campaign": "Help Local Community",
 *         "earned": 500,
 *         "is_paid": true,
 *         "created_at": "2026-04-04T10:00:00Z"
 *       }
 *     ]
 *   }
 * }
 */
router.get('/:platform/performance', authenticate, ShareReferralController.getPlatformPerformance);

module.exports = router;
