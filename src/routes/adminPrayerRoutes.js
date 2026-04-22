const express = require('express')
const AdminPrayerController = require('../controllers/AdminPrayerController')
const { authenticate, authorize } = require('../middleware/authMiddleware')

const router = express.Router()

/**
 * Admin Prayer Routes
 * All routes require admin authentication
 * 10 endpoints for prayer moderation, blocking, and analytics
 */

// Middleware: Apply authentication and admin check to all routes
router.use(authenticate)
router.use(authorize(['admin']))

/**
 * MODERATION QUEUE ENDPOINTS
 */

/**
 * GET /admin/prayers/moderation-queue
 * Get paginated list of prayers pending moderation
 *
 * @query {string[]} status - Filter by status (submitted|flagged|rejected|approved)
 * @query {number} report_count_min - Minimum report count to show
 * @query {string} sortBy - Sort field (created_at|report_count|type)
 * @query {number} sortOrder - 1 for asc, -1 for desc
 * @query {number} limit - Results per page (max 200)
 * @query {number} offset - Pagination offset
 * @query {string} campaignId - Filter by campaign
 * @query {string} creatorId - Filter by creator
 * @query {string} dateFrom - Filter from date (ISO 8601)
 * @query {string} dateTo - Filter to date (ISO 8601)
 */
router.get('/moderation-queue', AdminPrayerController.getModerationQueue)

/**
 * BULK ACTIONS
 */

/**
 * POST /admin/prayers/bulk-approve
 * Approve multiple prayers at once
 *
 * @body {string[]} prayerIds - Array of prayer IDs
 */
router.post('/bulk-approve', AdminPrayerController.bulkApprovePrayers)

/**
 * POST /admin/prayers/bulk-reject
 * Reject multiple prayers with reason
 *
 * @body {string[]} prayerIds - Array of prayer IDs
 * @body {string} reason - Rejection reason
 */
router.post('/bulk-reject', AdminPrayerController.bulkRejectPrayers)

/**
 * POST /admin/prayers/bulk-flag
 * Flag multiple prayers for manual review
 *
 * @body {string[]} prayerIds - Array of prayer IDs
 * @body {string} reason - Flag reason
 */
router.post('/bulk-flag', AdminPrayerController.bulkFlagPrayers)

/**
 * SPAM DETECTION & ANALYTICS
 */

/**
 * GET /admin/prayers/spam-detection
 * Get spam detection dashboard with high-report prayers and spam patterns
 */
router.get('/spam-detection', AdminPrayerController.getSpamDetectionData)

/**
 * GET /admin/prayers/analytics
 * Get prayer analytics (counts, breakdowns, trends)
 */
router.get('/analytics', AdminPrayerController.getPrayerAnalytics)

/**
 * COMPLIANCE & EXPORT
 */

/**
 * GET /admin/prayers/compliance-report
 * Generate compliance report
 *
 * @query {string} dateRange - week|month|year
 */
router.get('/compliance-report', AdminPrayerController.getComplianceReport)

/**
 * GET /admin/prayers/export
 * Export prayers for compliance
 *
 * @query {string} dateRange - week|month|year
 * @query {string} format - json|csv
 */
router.get('/export', AdminPrayerController.exportPrayers)

/**
 * USER BLOCKING
 */

/**
 * POST /admin/users/:userId/block-prayer
 * Block user from submitting prayers
 *
 * @param {string} userId - User ID
 * @body {string} reason - Block reason
 * @body {number} durationDays - Block duration (default: 30)
 */
router.post(
  '/users/:userId/block-prayer',
  AdminPrayerController.blockUserFromPrayers
)

/**
 * DELETE /admin/users/:userId/unblock-prayer
 * Unblock user from prayers
 *
 * @param {string} userId - User ID
 */
router.delete(
  '/users/:userId/unblock-prayer',
  AdminPrayerController.unblockUserFromPrayers
)

/**
 * TESTING ENDPOINT
 */

/**
 * POST /admin/prayers/check-profanity
 * Test profanity detection (admin only)
 *
 * @body {string} content - Content to check
 */
router.post('/check-profanity', AdminPrayerController.checkProfanity)

module.exports = router
