const express = require('express');
const DonationController = require('../controllers/DonationController');
const { authenticate, authorize } = require('../middleware/authMiddleware');
const { validateInput } = require('../middleware/validation');
const { donationLimiter, refundLimiter, publicApiLimiter } = require('../middleware/rateLimiter');

const router = express.Router();

/**
 * Donation Routes - Production Ready System
 * All 11 endpoints: create, list, detail, analytics, stats, monthly-breakdown, 
 *                   campaign-donations, receipt, refund, export, history
 * 
 * Route Ordering: General routes first, then campaign routes, then detail/ID routes (to avoid conflicts)
 */

// ============================================================================
// GENERAL ENDPOINTS (must come before :id routes)
// ============================================================================

/**
 * GET /donations/stats
 * Platform-wide donation statistics
 * 
 * @auth Required
 * @returns {200} Platform donation statistics
 */
router.get(
  '/stats',
  authenticate,
  DonationController.getDonationStats
);

/**
 * GET /donations/monthly-breakdown
 * Donation totals grouped by month (time series)
 * 
 * @auth Required
 * @query campaignId - Optional filter by campaign
 * @returns {200} Monthly aggregated donations
 */
router.get(
  '/monthly-breakdown',
  authenticate,
  DonationController.getMonthlyBreakdown
);

/**
 * GET /donations/analytics/dashboard
 * Get comprehensive donation analytics for dashboard
 * 
 * @auth Required
 * @rateLimit 100 requests per 15 minutes per IP (public API rate limit)
 * @query page, limit, timeframe
 * @returns {200} Analytics summary with trends, top campaigns, payment methods
 */
router.get(
  '/analytics/dashboard',
  authenticate,
  publicApiLimiter, // ✅ NEW: Rate limiting for analytics dashboard (high traffic endpoint)
  DonationController.getDonationAnalytics
);

/**
 * GET /donations/export
 * Export all donations (admin only)
 * 
 * @auth Required (admin)
 * @query format (json|csv), campaignId, startDate, endDate
 * @returns {200} Exported data in requested format
 */
router.get(
  '/export',
  authenticate,
  authorize(['admin']),
  DonationController.exportDonations
);

/**
 * GET /donations/history
 * Get current user's donation history
 * 
 * @auth Required
 * @query startDate, endDate, limit
 * @returns {200} User's donation history
 */
router.get(
  '/history',
  authenticate,
  DonationController.getDonationHistory
);

/**
 * GET /donations
 * List donations with filtering and pagination
 * 
 * @auth Required
 * @query page, limit, campaignId, status, paymentMethod, startDate, endDate
 * @returns {200} Paginated donation list
 */
router.get(
  '/',
  authenticate,
  DonationController.listDonations
);

// ============================================================================
// CAMPAIGN ROUTES
// ============================================================================

/**
 * GET /campaigns/:campaignId/donations
 * List all donations for a specific campaign
 * (Creator only - before :id to avoid conflict)
 * 
 * @auth Required
 * @param campaignId - Campaign ID
 * @query page, limit
 * @returns {200} Campaign donations
 */
router.get(
  '/campaigns/:campaignId/donations',
  authenticate,
  DonationController.getCampaignDonations
);

/**
 * GET /campaigns/:campaignId/donations/analytics
 * Get analytics for a specific campaign
 * (Creator only)
 * 
 * @auth Required
 * @param campaignId - Campaign ID
 * @returns {200} Campaign donation analytics
 */
router.get(
  '/campaigns/:campaignId/donations/analytics',
  authenticate,
  DonationController.getCampaignDonationAnalytics
);

// ============================================================================
// DETAIL/ACTION ROUTES (come after general routes)
// ============================================================================

/**
 * POST /donations/:donationId/donate
 * Create a new donation (legacy route)
 * 
 * @auth Required
 * @rateLimit 5 donations per minute per user (prevents spam/abuse)
 * @body {number} amount - Amount in dollars
 * @body {string} paymentMethod - Payment method
 * @body {string} proofUrl - Optional proof URL
 * @returns {201} Donation created with fee breakdown
 */
router.post(
  '/:campaignId/donate',
  authenticate,
  donationLimiter, // ✅ NEW: Rate limiting for donation creation
  validateInput('donation'),
  DonationController.createDonation
);

/**
 * POST /donations/:donationId/refund
 * Refund a donation (creator or admin only)
 * 
 * @auth Required
 * @rateLimit 3 refund requests per hour per user
 * @body {string} reason - Refund reason
 * @body {boolean} notifyDonor - Send notification email (default: true)
 * @returns {200} Refund confirmation
 */
router.post(
  '/:donationId/refund',
  authenticate,
  refundLimiter, // ✅ NEW: Rate limiting for refund requests
  DonationController.refundDonation
);

/**
 * GET /donations/:donationId/receipt
 * Generate/download donation receipt
 * 
 * @auth Required
 * @param donationId - Donation ID
 * @query format (json|pdf - default: json)
 * @returns {200} Receipt data
 */
router.get(
  '/:donationId/receipt',
  authenticate,
  DonationController.getDonationReceipt
);

/**
 * GET /donations/:transactionId
 * Get donation details by transaction ID
 * 
 * @auth Required
 * @param transactionId - Transaction ID
 * @returns {200} Donation details
 * @returns {403} Not donation owner (unless admin)
 * @returns {404} Transaction not found
 */
router.get(
  '/:transactionId',
  authenticate,
  DonationController.getDonation
);

/**
 * POST /donations/:campaignId/donate/:transactionId/mark-sent
 * Mark a donation payment as sent by the supporter
 * 
 * @auth Required
 * @param campaignId - Campaign ID
 * @param transactionId - Transaction ID
 * @returns {200} Donation marked as sent
 * @returns {403} Not donation owner
 * @returns {404} Transaction not found
 */
router.post(
  '/:campaignId/donate/:transactionId/mark-sent',
  authenticate,
  DonationController.markDonationSent
);

// ============================================================================
// ERROR HANDLING MIDDLEWARE
// ============================================================================

/**
 * Error handling middleware for this router
 */
router.use((error, req, res, next) => {
  console.error('Donation Route Error:', error);
  
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
