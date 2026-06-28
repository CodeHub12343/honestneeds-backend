/**
 * Admin Routes (AD-01 .. AD-10)
 * -------------------------------------------------------------------------
 * Single entry point for the admin API, mounted at /api/admin.
 *
 * Every route is protected by:
 *   authMiddleware  -> verifies JWT, sets req.user
 *   requireAdmin    -> confirms active admin, loads req.adminUser + permissions
 *   requirePermission(P) -> enforces the granular capability for the route
 *
 * Feature map:
 *   AD-01 Dashboard               GET  /dashboard, /dashboard/timeseries
 *   AD-02 Campaign moderation     /moderation/campaigns*
 *   AD-03 User management         /users*, /reports*
 *   AD-04 Financial oversight     /finance/overview, /finance/transactions*
 *   AD-05 ID+ verification queue  /verifications*
 *   AD-06 Fraud detection         /fraud*
 *   AD-07 Platform configuration  /config*, /broadcasts*
 *   AD-08 Content moderation      /moderation/comments*
 *   AD-09 Audit log access        /audit*
 *   AD-10 Financial reports       /finance/reports, /finance/reconcile
 */

const express = require('express');

const { authMiddleware } = require('../../middleware/authMiddleware');
const { requireAdmin, requirePermission } = require('../../middleware/adminAuth');
const { PERMISSIONS, ROLES } = require('../../config/adminRoles');

const DashboardController = require('../../controllers/admin/DashboardController');
const ModerationController = require('../../controllers/admin/ModerationController');
const UserAdminController = require('../../controllers/admin/UserAdminController');
const FinanceController = require('../../controllers/admin/FinanceController');
const VerificationController = require('../../controllers/admin/VerificationController');
const FraudController = require('../../controllers/admin/FraudController');
const ConfigController = require('../../controllers/admin/ConfigController');
const AuditController = require('../../controllers/admin/AuditController');
const AnalyticsController = require('../../controllers/admin/AnalyticsController');
const AIAdminController = require('../../controllers/admin/AIAdminController');

const router = express.Router();

// Global guard for the entire admin surface.
router.use(authMiddleware, requireAdmin);

// Who am I + my effective permissions (handy for the admin SPA).
router.get('/me', (req, res) => {
  res.json({
    success: true,
    data: {
      id: req.adminUser._id,
      email: req.adminUser.email,
      display_name: req.adminUser.display_name,
      admin_roles: req.adminUser.admin_roles || [],
      permissions: req.adminPermissions.has('*') ? ['*'] : Array.from(req.adminPermissions),
    },
  });
});

// Catalogue of assignable admin roles (for the role-management UI).
router.get('/roles', requirePermission(PERMISSIONS.ADMIN_TEAM_MANAGE), (req, res) => {
  res.json({ success: true, data: Object.values(ROLES) });
});

// ── AD-01 Dashboard ─────────────────────────────────────────────────────
router.get('/dashboard', requirePermission(PERMISSIONS.DASHBOARD_VIEW), DashboardController.getOverview);
router.get('/dashboard/timeseries', requirePermission(PERMISSIONS.DASHBOARD_VIEW), DashboardController.getTimeSeries);

// ── AN-02 Platform analytics ─────────────────────────────────────────────
router.get('/analytics', requirePermission(PERMISSIONS.ANALYTICS_VIEW), AnalyticsController.getOverview);
router.get('/analytics/regions', requirePermission(PERMISSIONS.ANALYTICS_VIEW), AnalyticsController.getRegions);

// ── AD-02 Campaign moderation queue ─────────────────────────────────────
router.get('/moderation/campaigns', requirePermission(PERMISSIONS.CAMPAIGN_MODERATION_VIEW), ModerationController.getCampaignQueue);
router.get('/moderation/campaigns/:campaignId', requirePermission(PERMISSIONS.CAMPAIGN_MODERATION_VIEW), ModerationController.getCampaignForReview);
router.post('/moderation/campaigns/:campaignId/decision', requirePermission(PERMISSIONS.CAMPAIGN_MODERATION_ACT), ModerationController.moderateCampaign);
router.post('/moderation/campaigns/:campaignId/pause', requirePermission(PERMISSIONS.CAMPAIGN_MODERATION_ACT), ModerationController.pauseCampaign);
router.post('/moderation/campaigns/:campaignId/resume', requirePermission(PERMISSIONS.CAMPAIGN_MODERATION_ACT), ModerationController.resumeCampaign);

// ── AD-08 Content moderation (comments) ─────────────────────────────────
router.get('/moderation/comments', requirePermission(PERMISSIONS.CONTENT_MODERATION_VIEW), ModerationController.getFlaggedComments);
router.post('/moderation/comments/:commentId/action', requirePermission(PERMISSIONS.CONTENT_MODERATION_ACT), ModerationController.moderateComment);

// ── AD-03 User management ───────────────────────────────────────────────
router.get('/users', requirePermission(PERMISSIONS.USER_VIEW), UserAdminController.listUsers);
router.get('/users/:userId', requirePermission(PERMISSIONS.USER_VIEW), UserAdminController.getUserDetail);
router.get('/users/:userId/export', requirePermission(PERMISSIONS.USER_VIEW), UserAdminController.exportUserData);
router.patch('/users/:userId/verify', requirePermission(PERMISSIONS.USER_MANAGE), UserAdminController.verifyUser);
router.patch('/users/:userId/reject-verification', requirePermission(PERMISSIONS.USER_MANAGE), UserAdminController.rejectVerification);
router.patch('/users/:userId/block', requirePermission(PERMISSIONS.USER_MANAGE), UserAdminController.blockUser);
router.patch('/users/:userId/unblock', requirePermission(PERMISSIONS.USER_MANAGE), UserAdminController.unblockUser);
router.patch('/users/:userId/restore', requirePermission(PERMISSIONS.USER_MANAGE), UserAdminController.restoreUser);
router.patch('/users/:userId/role', requirePermission(PERMISSIONS.ADMIN_TEAM_MANAGE), UserAdminController.updateRole);
router.delete('/users/:userId', requirePermission(PERMISSIONS.USER_DELETE), UserAdminController.deleteUser);

// Abuse reports (part of AD-03 / AD-08 trust workflow).
router.get('/reports', requirePermission(PERMISSIONS.USER_VIEW), UserAdminController.listReports);
router.patch('/reports/:reportId/resolve', requirePermission(PERMISSIONS.USER_MANAGE), UserAdminController.resolveReport);
router.patch('/reports/:reportId/dismiss', requirePermission(PERMISSIONS.USER_MANAGE), UserAdminController.dismissReport);

// ── AD-04 Financial oversight ───────────────────────────────────────────
router.get('/finance/overview', requirePermission(PERMISSIONS.FINANCE_VIEW), FinanceController.getOverview);
router.get('/finance/transactions', requirePermission(PERMISSIONS.FINANCE_VIEW), FinanceController.listTransactions);
router.post('/finance/transactions/:transactionId/refund', requirePermission(PERMISSIONS.FINANCE_ACT), FinanceController.refundTransaction);

// ── AD-10 Financial reports & reconciliation ────────────────────────────
router.get('/finance/reports', requirePermission(PERMISSIONS.FINANCE_REPORTS), FinanceController.getPeriodReport);
router.get('/finance/reconcile', requirePermission(PERMISSIONS.FINANCE_REPORTS), FinanceController.reconcile);

// ── AD-05 ID+ verification queue ────────────────────────────────────────
router.get('/verifications', requirePermission(PERMISSIONS.VERIFICATION_VIEW), VerificationController.getQueue);
router.get('/verifications/:submissionId', requirePermission(PERMISSIONS.VERIFICATION_VIEW), VerificationController.getSubmission);
router.post('/verifications/:submissionId/approve', requirePermission(PERMISSIONS.VERIFICATION_ACT), VerificationController.approve);
router.post('/verifications/:submissionId/reject', requirePermission(PERMISSIONS.VERIFICATION_ACT), VerificationController.reject);
router.post('/verifications/:submissionId/request-info', requirePermission(PERMISSIONS.VERIFICATION_ACT), VerificationController.requestMoreInfo);

// ── AD-06 Fraud detection dashboard ─────────────────────────────────────
router.get('/fraud', requirePermission(PERMISSIONS.FRAUD_VIEW), FraudController.getDashboard);
// SE-5 Sharer (Share-to-Earn) fraud dashboard + per-sharer drill-down.
router.get('/fraud/sharers', requirePermission(PERMISSIONS.FRAUD_VIEW), FraudController.getSharerDashboard);
router.get('/fraud/sharers/:userId', requirePermission(PERMISSIONS.FRAUD_VIEW), FraudController.getSharerProfile);
router.get('/fraud/alerts', requirePermission(PERMISSIONS.FRAUD_VIEW), FraudController.listAlerts);
router.post('/fraud/alerts/:alertId/action', requirePermission(PERMISSIONS.FRAUD_ACT), FraudController.actOnAlert);
router.post('/fraud/assessments/:assessmentId/review', requirePermission(PERMISSIONS.FRAUD_ACT), FraudController.reviewAssessment);

// ── AD-07 Platform configuration ────────────────────────────────────────
router.get('/config', requirePermission(PERMISSIONS.CONFIG_VIEW), ConfigController.getAll);
router.get('/config/:key', requirePermission(PERMISSIONS.CONFIG_VIEW), ConfigController.getByKey);
router.put('/config/:key', requirePermission(PERMISSIONS.CONFIG_MANAGE), ConfigController.updateByKey);
router.get('/broadcasts', requirePermission(PERMISSIONS.CONFIG_VIEW), ConfigController.listBroadcasts);
router.post('/broadcasts', requirePermission(PERMISSIONS.CONFIG_MANAGE), ConfigController.createBroadcast);

// ── AI subsystem oversight (usage, cost, generation log) ────────────────
router.get('/ai/overview', requirePermission(PERMISSIONS.AI_VIEW), AIAdminController.getOverview);
router.get('/ai/timeseries', requirePermission(PERMISSIONS.AI_VIEW), AIAdminController.getTimeseries);
router.get('/ai/logs', requirePermission(PERMISSIONS.AI_VIEW), AIAdminController.getLogs);
router.get('/ai/features', requirePermission(PERMISSIONS.AI_VIEW), AIAdminController.listFeatures);

// ── AD-09 Audit log access ──────────────────────────────────────────────
router.get('/audit', requirePermission(PERMISSIONS.AUDIT_VIEW), AuditController.query);
router.get('/audit/statistics', requirePermission(PERMISSIONS.AUDIT_VIEW), AuditController.getStatistics);
router.get('/audit/entity/:entityType/:entityId', requirePermission(PERMISSIONS.AUDIT_VIEW), AuditController.getEntityTrail);

module.exports = router;
