/**
 * Share Routes
 * API routes for share recording, budget management, and admin verification
 */

const express = require('express');
const ShareController = require('../controllers/ShareController');
const { authMiddleware } = require('../middleware/authMiddleware');

const router = express.Router();

/**
 * Share Recording Routes
 */

// POST /campaigns/:campaignId/share - Record a share
router.post('/campaigns/:campaignId/share', authMiddleware, ShareController.recordShare);

// GET /campaigns/:campaignId/shares - Get shares for campaign
router.get('/campaigns/:campaignId/shares', ShareController.getSharesByCampaign);

// GET /campaigns/:campaignId/shares/stats - Get share statistics
router.get('/campaigns/:campaignId/shares/stats', ShareController.getShareStats);

// GET /user/shares - Get shares created by authenticated user
router.get('/user/shares', authMiddleware, ShareController.getMyShares);

/**
 * Share Configuration Routes
 */

// PUT /campaigns/:campaignId/share-config - Update share configuration
router.put('/campaigns/:campaignId/share-config', authMiddleware, ShareController.updateShareConfig);

// GET /campaigns/:campaignId/share-config - Get share configuration
router.get('/campaigns/:campaignId/share-config', ShareController.getShareConfig);

/**
 * Referral Tracking Routes
 */

// ✅ NEW: POST /campaigns/:campaignId/referral/click - Record referral click (visitor lands on campaign)
// Can be called with or without authentication
router.post('/campaigns/:campaignId/referral/click', ShareController.recordReferralClick);

// ✅ NEW: GET /campaigns/:campaignId/referral/stats/:referralCode - Get stats for a referral link
router.get('/campaigns/:campaignId/referral/stats/:referralCode', ShareController.getReferralStats);

// POST /campaigns/:campaignId/referral/visit - Record referral visit
router.post('/campaigns/:campaignId/referral/visit', ShareController.recordReferralVisit);

// GET /campaigns/:campaignId/referrals - Get campaign referral analytics
router.get('/campaigns/:campaignId/referrals', ShareController.getCampaignReferralAnalytics);

// GET /user/referral-performance - Get supporter's referral performance
router.get('/user/referral-performance', authMiddleware, ShareController.getSupporterReferralPerformance);

/**
 * Sharer Earnings Routes
 */

// GET /sharer/earnings/available - Get available earnings for withdrawal
// Returns: { balance_cents, available_cents, pending_cents, total_earned_cents, currency }
router.get('/sharer/earnings/available', authMiddleware, ShareController.getAvailableEarnings);

/**
 * Share Budget Routes
 */

// POST /campaigns/:campaignId/reload-share - Request budget reload
router.post('/campaigns/:campaignId/reload-share', authMiddleware, ShareController.requestShareBudgetReload);

/**
 * Share Verification Routes (Admin)
 */

// GET /admin/shares/pending - List pending shares for admin review (admin only)
router.get('/admin/shares/pending', authMiddleware, ShareController.getPendingSharesForReview);

// GET /admin/shares/:shareId - Get share details for admin review (admin only)
router.get('/admin/shares/:shareId', authMiddleware, ShareController.getShareForReview);

// POST /admin/shares/:shareId/verify - Verify (approve) a share (admin only)
router.post('/admin/shares/:shareId/verify', authMiddleware, ShareController.verifyShare);

// POST /admin/shares/:shareId/reject - Reject a share with reason (admin only)
router.post('/admin/shares/:shareId/reject', authMiddleware, ShareController.rejectShare);

/**
 * Share Appeal Routes
 */

// POST /shares/:shareId/appeal - Submit appeal for rejected share (supporter)
router.post('/shares/:shareId/appeal', authMiddleware, ShareController.submitShareAppeal);

// POST /admin/shares/:shareId/appeal/review - Review and decide on appeal (admin only)
router.post('/admin/shares/:shareId/appeal/review', authMiddleware, ShareController.reviewShareAppeal);

/**
 * ===== CONVERSION TRACKING ROUTES =====
 * Complete referral + conversion attribution pipeline
 */

// POST /campaigns/:campaignId/conversion - Record a conversion (visitor completes action)
// Called when visitor who came from referral link completes action
router.post('/campaigns/:campaignId/conversion', ShareController.recordConversion);

// GET /campaigns/:campaignId/analytics/conversions - Campaign conversion analytics
// Shows aggregate conversion metrics for all shares in campaign
router.get('/campaigns/:campaignId/analytics/conversions', authMiddleware, ShareController.getCampaignConversionAnalytics);

// GET /shares/:shareId/analytics - Individual share conversion analytics
// Shows clicks, conversions, conversion rate for specific share
router.get('/shares/:shareId/analytics', ShareController.getShareConversionAnalytics);

// GET /user/conversion-analytics - Supporter's conversion analytics
// Aggregated across all shares, grouped by campaign and channel
router.get('/user/conversion-analytics', authMiddleware, ShareController.getSupporterConversionAnalytics);

/**
 * Share Payout Routes (Feature 9)
 */

/**
 * POST /share-payouts/request
 * Request withdrawal/payout of earned share rewards
 * Body: { amountCents, paymentMethod, accountDetails, purpose? }
 * Response: 201 Created with payout request details
 * Auth: Required
 */
router.post('/payouts/request', authMiddleware, ShareController.requestSharePayout);

/**
 * Admin Reload Routes
 */

// GET /admin/reload-share - List reload requests
router.get('/admin/reload-share', authMiddleware, ShareController.listShareBudgetReloads);

// GET /admin/reload-share/:reloadId - Get reload details
router.get('/admin/reload-share/:reloadId', authMiddleware, ShareController.getShareBudgetReloadDetails);

// POST /admin/reload-share/:reloadId/verify - Approve reload
router.post('/admin/reload-share/:reloadId/verify', authMiddleware, ShareController.verifyShareBudgetReload);

// POST /admin/reload-share/:reloadId/reject - Reject reload
router.post('/admin/reload-share/:reloadId/reject', authMiddleware, ShareController.rejectShareBudgetReload);

module.exports = router;
