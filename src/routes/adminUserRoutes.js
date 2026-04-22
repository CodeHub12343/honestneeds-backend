/**
 * Admin User Management Routes
 *
 * All routes require:
 * - Authentication (valid JWT token)
 * - Admin role authorization
 *
 * Routes:
 * ✓ GET    /statistics                           - Get admin dashboard statistics
 * ✓ GET    /reports                              - List all user reports with filters
 * ✓ POST   /reports                              - Submit abuse report (public endpoint)
 * ✓ PATCH  /reports/:reportId/resolve            - Resolve/dismiss a report
 * ✓ GET    /users/:userId/reports                - Get reports for specific user
 * ✓ PATCH  /users/:userId/verify                 - Mark user as verified
 * ✓ PATCH  /users/:userId/reject-verification    - Reject user verification
 * ✓ PATCH  /users/:userId/block                  - Block user account
 * ✓ PATCH  /users/:userId/unblock                - Unblock user account
 * ✓ GET    /users/:userId/export                 - Export user data (GDPR)
 * ✓ DELETE /users/:userId                        - Delete user account
 * ✓ GET    /users/:userId                        - Get user details
 * ✓ GET    /users                                - List all users with filters (MUST BE LAST)
 */

const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/authMiddleware');
const AdminUserController = require('../controllers/AdminUserController');

// Middleware: All admin routes require authentication + admin role
router.use(authenticate);
router.use(authorize(['admin']));

/**
 * STATISTICS ENDPOINT
 * Must come before :userId routes to avoid param conflicts
 */

/**
 * GET /admin/users/statistics
 * Get admin dashboard statistics
 *
 * Query Parameters: None
 *
 * Response (200):
 * {
 *   "success": true,
 *   "data": {
 *     "users": {
 *       "total": 1250,
 *       "verified": 950,
 *       "blocked": 15,
 *       "admins": 5,
 *       "creators": 180,
 *       "regular": 1065
 *     },
 *     "reports": {
 *       "total": 45,
 *       "open": 8,
 *       "critical": 2,
 *       "pending_action": 10
 *     },
 *     "activity": {
 *       "new_users_today": 12
 *     }
 *   }
 * }
 */
router.get('/statistics', AdminUserController.getUserStatistics);

/**
 * REPORT MANAGEMENT ENDPOINTS
 * Must come before :userId routes
 */

/**
 * GET /admin/reports
 * List all user reports with comprehensive filtering
 *
 * Query Parameters:
 * - page (number, default: 1, min: 1)
 * - limit (number, default: 20, max: 100)
 * - status (string, enum: open|investigating|resolved|dismissed)
 * - severity (string, enum: low|medium|high|critical)
 * - sortBy (string, default: 'created_at', options: created_at|severity|updated_at)
 *
 * Example: GET /admin/reports?page=1&limit=20&status=open&severity=critical
 *
 * Response (200): Paginated reports array
 */
router.get('/reports', AdminUserController.listReports);

/**
 * POST /admin/reports
 * Submit abuse report against a user (PUBLIC - any authenticated user)
 * Authorization: authenticate only (not admin-only)
 *
 * Request Body:
 * {
 *   "reported_user_id": "user_id (required)",
 *   "reason": "scam_fraud|harassment|inappropriate_content|violence|hate_speech|fake_profile|sexual_content|spam|impersonation (required)",
 *   "description": "detailed description (20-5000 chars, required)",
 *   "evidence_urls": ["url1", "url2"] (optional)
 * }
 *
 * Response (201): Created report object
 */
router.post('/reports', AdminUserController.submitReport);

/**
 * REPORT RESOLUTION ENDPOINT
 */

/**
 * PATCH /admin/reports/:reportId/resolve
 * Resolve or dismiss a report with action taken
 *
 * URL Parameters:
 * - reportId (string, required)
 *
 * Request Body:
 * {
 *   "status": "resolved|dismissed (required)",
 *   "action_taken": "none|warning|blocked|deleted|other (optional)",
 *   "resolution_notes": "admin notes (optional)"
 * }
 *
 * Response (200): Updated report object
 */
router.patch('/reports/:reportId/resolve', AdminUserController.resolveReport);

/**
 * USER-SPECIFIC ACTION ENDPOINTS
 * All include :userId parameter - placed before GET :userId to avoid routing conflicts
 */

/**
 * GET /admin/users/:userId/reports
 * Get all abuse reports filed against a specific user
 *
 * URL Parameters:
 * - userId (string, required)
 *
 * Query Parameters:
 * - page (number, default: 1)
 * - limit (number, default: 10, max: 50)
 * - status (string, enum: open|investigating|resolved|dismissed)
 *
 * Response (200): Paginated reports array for user
 */
router.get('/users/:userId/reports', AdminUserController.getUserReports);

/**
 * PATCH /admin/users/:userId/verify
 * Verify/approve a user account (KYC completed)
 *
 * URL Parameters:
 * - userId (string, required)
 *
 * Request Body: {} (empty)
 *
 * Response (200): Updated user object with verified: true
 */
router.patch('/users/:userId/verify', AdminUserController.verifyUser);

/**
 * PATCH /admin/users/:userId/reject-verification
 * Reject user verification request and require resubmission
 *
 * URL Parameters:
 * - userId (string, required)
 *
 * Request Body:
 * {
 *   "reason": "rejection reason string (required)"
 * }
 *
 * Response (200): Updated user object with verified: false
 *
 * Note: User is notified of rejection reason
 */
router.patch('/users/:userId/reject-verification', AdminUserController.rejectVerification);

/**
 * PATCH /admin/users/:userId/block
 * Block user account (suspend from platform activities)
 *
 * URL Parameters:
 * - userId (string, required)
 *
 * Request Body:
 * {
 *   "reason": "reason for blocking (required)"
 * }
 *
 * Response (200): Updated user with blocked: true, blocked_at, blocked_by
 *
 * Restrictions:
 * - Cannot block other administrators
 * - Blocked users cannot create campaigns, make donations, submit reports
 * - Block is recorded with admin ID, timestamp, and reason
 */
router.patch('/users/:userId/block', AdminUserController.blockUser);

/**
 * PATCH /admin/users/:userId/unblock
 * Unblock a previously blocked user
 *
 * URL Parameters:
 * - userId (string, required)
 *
 * Request Body: {} (empty)
 *
 * Response (200): Updated user with blocked: false
 *
 * Note: User regains full platform access
 */
router.patch('/users/:userId/unblock', AdminUserController.unblockUser);

/**
 * GET /admin/users/:userId/export
 * Export user data in JSON or CSV format (GDPR compliance)
 *
 * URL Parameters:
 * - userId (string, required)
 *
 * Query Parameters:
 * - format (string, enum: json|csv, default: json)
 *
 * Response (200): User data file
 * - Content-Type: application/json or text/csv
 * - Content-Disposition: attachment (download file)
 *
 * Includes:
 * - User profile and personal data
 * - Associated reports (filed and received)
 * - Export metadata (timestamp, exported_by)
 *
 * Note: Downloads as user-{userId}-export.{json|csv}
 */
router.get('/users/:userId/export', AdminUserController.exportUserData);

/**
 * DELETE /admin/users/:userId
 * Delete/remove user account
 *
 * URL Parameters:
 * - userId (string, required)
 *
 * Request Body:
 * {
 *   "reason": "deletion reason (required)",
 *   "hard_delete": false (boolean, optional, default: false)
 * }
 *
 * Response (200): Deletion confirmation
 *
 * Soft Delete (default):
 * - User marked with deleted_at timestamp
 * - Data preserved for GDPR/archival
 * - User cannot login
 * - Blocked if user has active campaigns
 *
 * Hard Delete (hard_delete: true):
 * - User completely removed from database
 * - Cannot be recovered
 * - Use only for spam/security incidents
 * - Cascade deletes user's reports
 */
router.delete('/users/:userId', AdminUserController.deleteUser);

/**
 * GET /admin/users/:userId
 * Get detailed information about a specific user
 *
 * URL Parameters:
 * - userId (string, required)
 *
 * Response (200):
 * {
 *   "success": true,
 *   "data": {
 *     "_id": "user_id",
 *     "email": "user@example.com",
 *     "display_name": "User Name",
 *     "verified": true,
 *     "blocked": false,
 *     "role": "creator",
 *     "stats": {
 *       "campaigns_created": 5,
 *       "donations_made": 12,
 *       "total_donated": 50000 (in cents)
 *     },
 *     "reports_count": 2,
 *     "created_at": "2024-01-15T10:30:00Z",
 *     "updated_at": "2024-01-20T15:45:00Z"
 *   }
 * }
 *
 * Includes: Full profile, stats, and count of reports against user
 */
router.get('/users/:userId', AdminUserController.getUserDetail);

/**
 * GET /admin/users
 * List all platform users with advanced filtering (MUST BE LAST)
 *
 * Query Parameters:
 * - page (number, default: 1, min: 1)
 * - limit (number, default: 20, max: 100)
 * - search (string, searches email and display_name with case-insensitive regex)
 * - role (string, enum: user|creator|admin)
 * - verified (string, enum: true|false)
 * - status (string, enum: active|blocked|deleted)
 * - sortBy (string, default: 'created_at', options: email|created_at|login_count|donations_made)
 *
 * Examples:
 * - GET /admin/users?page=1&limit=50
 * - GET /admin/users?search=john&role=creator&verified=false
 * - GET /admin/users?status=blocked
 * - GET /admin/users?sortBy=donations_made
 *
 * Response (200):
 * {
 *   "success": true,
 *   "data": {
 *     "users": [ {...}, {...} ],
 *     "pagination": {
 *       "page": 1,
 *       "limit": 20,
 *       "total": 1250,
 *       "totalPages": 63,
 *       "hasMore": true
 *     }
 *   }
 * }
 *
 * Note: Endpoint MUST be last to avoid conflict with /:userId routes
 */
router.get('/users', AdminUserController.listUsers);

module.exports = router;
