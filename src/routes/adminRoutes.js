const express = require('express');
const AdminController = require('../controllers/AdminController');
const { authenticate, authorize } = require('../middleware/authMiddleware');
const adminValidators = require('../validators/adminValidators');

const router = express.Router();

/**
 * Admin Routes
 * All routes require admin authentication and authorization
 * 17 total endpoints for complete admin management
 */

// Middleware: Apply authentication and admin check to all routes
router.use(authenticate);
router.use(authorize('admin'));

/**
 * USER MANAGEMENT ROUTES
 * 7 endpoints for user moderation
 */

/**
 * GET /admin/users
 * List all users with optional filters
 *
 * @query {number} page - Page number (default: 1)
 * @query {number} limit - Items per page (default: 20, max: 100)
 * @query {string} status - Filter by status (verified|unverified|blocked)
 * @query {string} sortBy - Sort field (created_at|name|email|is_verified)
 *
 * @example Request:
 * GET /admin/users?page=1&limit=10&status=verified&sortBy=created_at
 *
 * @example Response:
 * {
 *   "success": true,
 *   "data": {
 *     "users": [...],
 *     "pagination": {
 *       "total": 250,
 *       "pages": 13,
 *       "current": 1,
 *       "limit": 20
 *     }
 *   }
 * }
 */
router.get(
  '/users',
  adminValidators.validateListUsers,
  AdminController.listUsers
);

/**
 * GET /admin/users/:userId
 * Get user details with statistics
 *
 * @param {string} userId - User ID (MongoDB ObjectId)
 *
 * @example Response:
 * {
 *   "success": true,
 *   "data": {
 *     "_id": "...",
 *     "name": "John Doe",
 *     "email": "john@example.com",
 *     "is_verified": true,
 *     "is_blocked": false,
 *     "report_count": 2,
 *     "campaign_count": 5,
 *     "donation_count": 15
 *   }
 * }
 *
 * @error 404 - User not found
 */
router.get(
  '/users/:userId',
  AdminController.getUserDetail
);

/**
 * PATCH /admin/users/:userId/verify
 * Verify/approve user account
 *
 * @param {string} userId - User ID
 * @body {object} metadata - Optional metadata
 *
 * @example Response:
 * {
 *   "success": true,
 *   "data": { "is_verified": true, "verified_at": "2024-01-15T10:30:00Z" },
 *   "message": "User verified successfully"
 * }
 */
router.patch(
  '/users/:userId/verify',
  adminValidators.validateVerifyUser,
  AdminController.verifyUser
);

/**
 * PATCH /admin/users/:userId/reject-verification
 * Reject user verification attempt
 *
 * @param {string} userId - User ID
 * @body {string} reason - Rejection reason (optional)
 *
 * @example Response:
 * {
 *   "success": true,
 *   "data": { "is_verified": false },
 *   "message": "User verification rejected"
 * }
 */
router.patch(
  '/users/:userId/reject-verification',
  adminValidators.validateRejectUserVerification,
  AdminController.rejectUserVerification
);

/**
 * PATCH /admin/users/:userId/block
 * Block user account (soft block)
 *
 * @param {string} userId - User ID
 * @body {string} reason - Block reason (required)
 *
 * @example Response:
 * {
 *   "success": true,
 *   "data": { "is_blocked": true, "blocked_at": "2024-01-15T10:30:00Z" },
 *   "message": "User blocked successfully"
 * }
 *
 * @error 400 - Missing block reason
 */
router.patch(
  '/users/:userId/block',
  adminValidators.validateBlockUser,
  AdminController.blockUser
);

/**
 * PATCH /admin/users/:userId/unblock
 * Unblock user account
 *
 * @param {string} userId - User ID
 *
 * @example Response:
 * {
 *   "success": true,
 *   "data": { "is_blocked": false },
 *   "message": "User unblocked successfully"
 * }
 */
router.patch(
  '/users/:userId/unblock',
  AdminController.unblockUser
);

/**
 * DELETE /admin/users/:userId
 * Delete user (soft delete - marks for deletion)
 *
 * @param {string} userId - User ID
 * @body {string} reason - Deletion reason (optional)
 *
 * @example Response:
 * {
 *   "success": true,
 *   "data": { "deleted_at": "2024-01-15T10:30:00Z" },
 *   "message": "User deleted successfully"
 * }
 */
router.delete(
  '/users/:userId',
  adminValidators.validateDeleteUser,
  AdminController.deleteUser
);

/**
 * CAMPAIGN MANAGEMENT ROUTES
 * 3 endpoints for campaign moderation
 */

/**
 * GET /admin/campaigns
 * List all campaigns with optional filters
 *
 * @query {number} page - Page number (default: 1)
 * @query {number} limit - Items per page (default: 20)
 * @query {string} status - Filter by status (draft|active|paused|completed|rejected)
 * @query {string} sortBy - Sort field (created_at|title|goal_amount|donations_count)
 *
 * @example Request:
 * GET /admin/campaigns?page=1&status=active&sortBy=created_at
 *
 * @example Response:
 * {
 *   "success": true,
 *   "data": {
 *     "campaigns": [...],
 *     "pagination": { "total": 185, "pages": 10, "current": 1, "limit": 20 }
 *   }
 * }
 */
router.get(
  '/campaigns',
  adminValidators.validateListCampaigns,
  AdminController.listCampaigns
);

/**
 * GET /admin/campaigns/:campaignId
 * Get campaign details with statistics
 *
 * @param {string} campaignId - Campaign ID
 *
 * @example Response:
 * {
 *   "success": true,
 *   "data": {
 *     "_id": "...",
 *     "title": "Build Community Center",
 *     "goal_amount": 50000,
 *     "donations_count": 120,
 *     "transaction_count": 125,
 *     "creator_id": { "name": "Jane Doe" }
 *   }
 * }
 *
 * @error 404 - Campaign not found
 */
router.get(
  '/campaigns/:campaignId',
  AdminController.getCampaignDetail
);

/**
 * PATCH /admin/campaigns/:campaignId/approve
 * Approve and activate campaign
 *
 * @param {string} campaignId - Campaign ID
 * @body {string} notes - Admin notes (optional)
 *
 * @example Response:
 * {
 *   "success": true,
 *   "data": { "status": "active", "approved_at": "2024-01-15T10:30:00Z" },
 *   "message": "Campaign approved successfully"
 * }
 */
router.patch(
  '/campaigns/:campaignId/approve',
  adminValidators.validateApproveCampaign,
  AdminController.approveCampaign
);

/**
 * PATCH /admin/campaigns/:campaignId/reject
 * Reject campaign
 *
 * @param {string} campaignId - Campaign ID
 * @body {string} reason - Rejection reason (required)
 *
 * @example Response:
 * {
 *   "success": true,
 *   "data": { "status": "rejected" },
 *   "message": "Campaign rejected successfully"
 * }
 *
 * @error 400 - Missing rejection reason
 */
router.patch(
  '/campaigns/:campaignId/reject',
  adminValidators.validateRejectCampaign,
  AdminController.rejectCampaign
);

/**
 * REPORT MANAGEMENT ROUTES
 * 2 endpoints for handling user reports
 */

/**
 * GET /admin/reports
 * List all abuse/safety reports
 *
 * @query {number} page - Page number (default: 1)
 * @query {number} limit - Items per page (default: 50)
 * @query {string} status - Filter by status (open|investigating|resolved|dismissed)
 *
 * @example Request:
 * GET /admin/reports?status=open&page=1
 *
 * @example Response:
 * {
 *   "success": true,
 *   "data": {
 *     "reports": [...],
 *     "pagination": { "total": 45, "pages": 1, "current": 1, "limit": 50 }
 *   }
 * }
 */
router.get(
  '/reports',
  adminValidators.validateListReports,
  AdminController.listReports
);

/**
 * POST /admin/reports/:reportId/resolve
 * Mark report as resolved and take action
 *
 * @param {string} reportId - Report ID
 * @body {string} resolution - Resolution details (required)
 * @body {string} actionTaken - Action taken (none|warning|blocked|deleted|other)
 *
 * @example Request:
 * POST /admin/reports/123/resolve
 * {
 *   "resolution": "Verified harassment activity. User warned and sent guidelines.",
 *   "actionTaken": "warning"
 * }
 *
 * @example Response:
 * {
 *   "success": true,
 *   "data": { "status": "resolved", "action_taken": "warning" },
 *   "message": "Report resolved successfully"
 * }
 *
 * @error 400 - Missing resolution text
 */
router.post(
  '/reports/:reportId/resolve',
  adminValidators.validateResolveReport,
  AdminController.resolveReport
);

/**
 * POST /admin/reports/:reportId/dismiss
 * Dismiss report (not a violation)
 *
 * @param {string} reportId - Report ID
 * @body {string} reason - Dismissal reason (optional)
 *
 * @example Response:
 * {
 *   "success": true,
 *   "data": { "status": "dismissed" },
 *   "message": "Report dismissed successfully"
 * }
 */
router.post(
  '/reports/:reportId/dismiss',
  adminValidators.validateDismissReport,
  AdminController.dismissReport
);

/**
 * DONATIONS ENDPOINT
 * 1 endpoint for donation tracking
 */

/**
 * GET /admin/donations
 * List all donations with filters
 *
 * @query {number} page - Page number (default: 1)
 * @query {number} limit - Items per page (default: 50)
 * @query {string} status - Filter by status (completed|pending|failed|refunded)
 * @query {string} campaignId - Filter by campaign ID
 *
 * @example Request:
 * GET /admin/donations?status=completed&limit=30
 *
 * @example Response:
 * {
 *   "success": true,
 *   "data": {
 *     "donations": [...],
 *     "pagination": { ... }
 *   }
 * }
 */
router.get(
  '/donations',
  adminValidators.validateListDonations,
  AdminController.listDonations
);

/**
 * ANALYTICS ROUTES
 * 2 endpoints for insights and monitoring
 */

/**
 * GET /admin/dashboard
 * Get comprehensive admin dashboard statistics
 *
 * @example Response:
 * {
 *   "success": true,
 *   "data": {
 *     "users": { "total": 1250, "verified": 980, "blocked": 15 },
 *     "campaigns": { "total": 185, "active": 45, "completed": 89 },
 *     "reports": { "open": 12, "investigating": 8, "resolved": 125 },
 *     "transactions": { "total": 3400, "revenue": 125000 }
 *   }
 * }
 */
router.get(
  '/dashboard',
  AdminController.getDashboardStatistics
);

/**
 * GET /admin/logs
 * Get audit logs of all admin actions
 *
 * @query {number} page - Page number (default: 1)
 * @query {number} limit - Items per page (default: 50)
 * @query {string} actionType - Filter by action type
 * @query {string} adminId - Filter by admin ID
 *
 * @example Request:
 * GET /admin/logs?actionType=user_blocked&page=1
 *
 * @example Response:
 * {
 *   "success": true,
 *   "data": {
 *     "logs": [...],
 *     "pagination": { ... }
 *   }
 * }
 */
router.get(
  '/logs',
  adminValidators.validateAuditLogs,
  AdminController.getAuditLogs
);

/**
 * SETTINGS ROUTES
 * 2 endpoints for platform configuration
 */

/**
 * GET /admin/settings
 * Get all platform settings
 *
 * @example Response:
 * {
 *   "success": true,
 *   "data": [
 *     { "key": "platform_general", "value": {...} },
 *     { "key": "moderation_rules", "value": {...} }
 *   ]
 * }
 */
router.get(
  '/settings',
  AdminController.getSettings
);

/**
 * POST /admin/settings
 * Update platform settings
 *
 * @body {string} key - Setting key (required)
 * @body {any} value - Setting value (required)
 *
 * @example Request:
 * POST /admin/settings
 * {
 *   "key": "moderation_rules",
 *   "value": { "maxReportsPerDay": 100, "autoBlockThreshold": 5 }
 * }
 *
 * @example Response:
 * {
 *   "success": true,
 *   "data": { "key": "moderation_rules", "value": {...} },
 *   "message": "Settings updated successfully"
 * }
 *
 * @error 400 - Missing key or value
 */
router.post(
  '/settings',
  adminValidators.validateUpdateSettings,
  AdminController.updateSettings
);

/**
 * BROADCAST NOTIFICATION ROUTES
 * 2 endpoints for platform-wide notifications
 */

/**
 * POST /admin/notifications/broadcast
 * Create and schedule broadcast notification
 *
 * @body {string} title - Notification title (required, 5-150 chars)
 * @body {string} message - Notification message (required, 10-2000 chars)
 * @body {string} type - Notification type (alert|announcement|system|warning|info)
 * @body {array} targetSegments - Target user segments (default: all_users)
 * @body {date} scheduledFor - When to send (default: now)
 * @body {object} action - Optional action button
 *
 * @example Request:
 * POST /admin/notifications/broadcast
 * {
 *   "title": "Important Security Update",
 *   "message": "Please update your password for security.",
 *   "type": "warning",
 *   "targetSegments": ["all_users"],
 *   "scheduledFor": "2024-01-20T10:00:00Z"
 * }
 *
 * @example Response:
 * {
 *   "success": true,
 *   "data": {
 *     "_id": "...",
 *     "title": "Important Security Update",
 *     "status": "scheduled"
 *   },
 *   "message": "Broadcast notification created successfully"
 * }
 *
 * @error 400 - Missing title or message
 */
router.post(
  '/notifications/broadcast',
  adminValidators.validateCreateBroadcastNotification,
  AdminController.createBroadcastNotification
);

/**
 * GET /admin/notifications
 * Get broadcast notifications
 *
 * @query {number} page - Page number (default: 1)
 * @query {number} limit - Items per page (default: 20)
 * @query {string} status - Filter by status
 *
 * @example Request:
 * GET /admin/notifications?status=sent&page=1
 *
 * @example Response:
 * {
 *   "success": true,
 *   "data": [...]
 * }
 */
router.get(
  '/notifications',
  adminValidators.validateGetBroadcastNotifications,
  AdminController.getBroadcastNotifications
);

/**
 * ACTIVITY FEED ROUTES
 * 1 endpoint for activity monitoring
 */

/**
 * GET /admin/activity-feed
 * Get recent platform activities
 *
 * @query {number} page - Page number (default: 1)
 * @query {number} limit - Items per page (default: 50)
 * @query {string} activity_type - Filter by activity type
 * @query {string} user_id - Filter by user ID
 *
 * @example Request:
 * GET /admin/activity-feed?page=1&limit=50
 *
 * @example Response:
 * {
 *   "success": true,
 *   "data": {
 *     "activities": [...],
 *     "pagination": { "total": 1250, "pages": 25, "current": 1, "limit": 50 }
 *   }
 * }
 */
router.get(
  '/activity-feed',
  adminValidators.validateActivityFeed,
  AdminController.getActivityFeed
);

/**
 * ALERTS ROUTES
 * 4 endpoints for alert management
 */

/**
 * GET /admin/alerts
 * Get system alerts
 *
 * @query {number} page - Page number (default: 1)
 * @query {number} limit - Items per page (default: 50)
 * @query {string} status - Filter by status (open|investigating|resolved|dismissed)
 * @query {string} severity - Filter by severity (low|medium|high|critical)
 *
 * @example Request:
 * GET /admin/alerts?status=open&severity=critical
 *
 * @example Response:
 * {
 *   "success": true,
 *   "data": {
 *     "alerts": [...],
 *     "statistics": { "open": 5, "investigating": 3, "resolved": 45 },
 *     "pagination": { ... }
 *   }
 * }
 */
router.get(
  '/alerts',
  adminValidators.validateGetAlerts,
  AdminController.getAlerts
);

/**
 * POST /admin/alerts/:alertId/resolve
 * Mark alert as resolved
 *
 * @param {string} alertId - Alert ID
 * @body {string} notes - Resolution notes (optional)
 *
 * @example Response:
 * {
 *   "success": true,
 *   "data": { "status": "resolved", "resolution_notes": "..." },
 *   "message": "Alert resolved successfully"
 * }
 */
router.post(
  '/alerts/:alertId/resolve',
  adminValidators.validateResolveAlert,
  AdminController.resolveAlert
);

/**
 * POST /admin/alerts/:alertId/dismiss
 * Dismiss alert as not a violation
 *
 * @param {string} alertId - Alert ID
 * @body {string} reason - Dismissal reason (optional)
 *
 * @example Response:
 * {
 *   "success": true,
 *   "data": { "status": "dismissed" },
 *   "message": "Alert dismissed successfully"
 * }
 */
router.post(
  '/alerts/:alertId/dismiss',
  adminValidators.validateDismissAlert,
  AdminController.dismissAlert
);

/**
 * POST /admin/alerts/:alertId/assign
 * Assign alert to admin for investigation
 *
 * @param {string} alertId - Alert ID
 *
 * @example Response:
 * {
 *   "success": true,
 *   "data": { "status": "investigating", "assigned_to": "..." },
 *   "message": "Alert assigned successfully"
 * }
 */
router.post(
  '/alerts/:alertId/assign',
  AdminController.assignAlert
);

/**
 * CATEGORIES ROUTES
 * 4 endpoints for category management
 */

/**
 * GET /admin/categories
 * List all campaign categories
 *
 * @query {number} page - Page number (default: 1)
 * @query {number} limit - Items per page (default: 50)
 * @query {string} is_active - Filter by active status
 * @query {string} is_featured - Filter by featured status
 *
 * @example Request:
 * GET /admin/categories?page=1&is_active=true
 *
 * @example Response:
 * {
 *   "success": true,
 *   "data": {
 *     "categories": [...],
 *     "pagination": { ... }
 *   }
 * }
 */
router.get(
  '/categories',
  adminValidators.validateListCategories,
  AdminController.listCategories
);

/**
 * POST /admin/categories
 * Create new category
 *
 * @body {string} name - Category name (required)
 * @body {string} description - Category description
 * @body {string} icon - Icon URL or emoji
 * @body {string} color - Hex color code
 * @body {boolean} is_featured - Feature category
 *
 * @example Request:
 * POST /admin/categories
 * {
 *   "name": "Health & Wellness",
 *   "description": "Health-related campaigns",
 *   "color": "#FF5733"
 * }
 *
 * @example Response:
 * {
 *   "success": true,
 *   "data": { "_id": "...", "name": "Health & Wellness", ... },
 *   "message": "Category created successfully"
 * }
 */
router.post(
  '/categories',
  adminValidators.validateCreateCategory,
  AdminController.createCategory
);

/**
 * PATCH /admin/categories/:categoryId
 * Update category
 *
 * @param {string} categoryId - Category ID
 * @body {object} - Category fields to update
 *
 * @example Response:
 * {
 *   "success": true,
 *   "data": { ... },
 *   "message": "Category updated successfully"
 * }
 *
 * @error 404 - Category not found
 */
router.patch(
  '/categories/:categoryId',
  adminValidators.validateUpdateCategory,
  AdminController.updateCategory
);

/**
 * DELETE /admin/categories/:categoryId
 * Delete category (soft delete)
 *
 * @param {string} categoryId - Category ID
 *
 * @example Response:
 * {
 *   "success": true,
 *   "data": { "is_active": false },
 *   "message": "Category deleted successfully"
 * }
 */
router.delete(
  '/categories/:categoryId',
  AdminController.deleteCategory
);

/**
 * CONTENT MANAGEMENT ROUTES
 * 6 endpoints for CMS content
 */

/**
 * GET /admin/content
 * List all platform content
 *
 * @query {number} page - Page number (default: 1)
 * @query {number} limit - Items per page (default: 50)
 * @query {string} is_published - Filter by published status
 * @query {string} language - Language code (default: en)
 *
 * @example Request:
 * GET /admin/content?language=en&is_published=true
 *
 * @example Response:
 * {
 *   "success": true,
 *   "data": {
 *     "content": [...],
 *     "pagination": { ... }
 *   }
 * }
 */
router.get(
  '/content',
  adminValidators.validateListContent,
  AdminController.listPlatformContent
);

/**
 * GET /admin/content/:type
 * Get content by type
 *
 * @param {string} type - Content type (manifesto|about_us|terms_of_service|privacy_policy|etc)
 * @query {string} language - Language code (default: en)
 *
 * @example Request:
 * GET /admin/content/manifesto?language=en
 *
 * @example Response:
 * {
 *   "success": true,
 *   "data": {
 *     "_id": "...",
 *     "content_type": "manifesto",
 *     "title": "...",
 *     "content": "...",
 *     "is_published": true
 *   }
 * }
 *
 * @error 404 - Content not found
 */
router.get(
  '/content/:type',
  AdminController.getPlatformContent
);

/**
 * POST /admin/content/:type
 * Create or update content
 *
 * @param {string} type - Content type
 * @body {string} title - Content title (required)
 * @body {string} content - HTML content (required)
 * @body {object} seo - SEO metadata
 * @body {string} language - Language code (default: en)
 *
 * @example Request:
 * POST /admin/content/manifesto
 * {
 *   "title": "Our Mission",
 *   "content": "<p>We believe...</p>",
 *   "seo": {
 *     "meta_title": "Our Mission",
 *     "meta_description": "..."
 *   }
 * }
 *
 * @example Response:
 * {
 *   "success": true,
 *   "data": { ... },
 *   "message": "Content saved successfully"
 * }
 */
router.post(
  '/content/:type',
  adminValidators.validateSaveContent,
  AdminController.savePlatformContent
);

/**
 * POST /admin/content/:contentId/publish
 * Publish content
 *
 * @param {string} contentId - Content ID
 *
 * @example Response:
 * {
 *   "success": true,
 *   "data": { "is_published": true, "publish_date": "..." },
 *   "message": "Content published successfully"
 * }
 */
router.post(
  '/content/:contentId/publish',
  AdminController.publishContent
);

/**
 * POST /admin/content/:contentId/unpublish
 * Unpublish content
 *
 * @param {string} contentId - Content ID
 *
 * @example Response:
 * {
 *   "success": true,
 *   "data": { "is_published": false },
 *   "message": "Content unpublished successfully"
 * }
 */
router.post(
  '/content/:contentId/unpublish',
  AdminController.unpublishContent
);

/**
 * DELETE /admin/content/:contentId
 * Delete content
 *
 * @param {string} contentId - Content ID
 *
 * @example Response:
 * {
 *   "success": true,
 *   "data": { ... },
 *   "message": "Content deleted successfully"
 * }
 */
router.delete(
  '/content/:contentId',
  AdminController.deleteContent
);

module.exports = router;
