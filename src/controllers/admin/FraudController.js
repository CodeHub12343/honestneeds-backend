/**
 * FraudController (AD-06)
 */

const FraudService = require('../../services/admin/FraudService');
const ShareFraudDetectionService = require('../../services/ShareFraudDetectionService');
const { asyncHandler, ok, parsePagination } = require('./helpers');

const FraudController = {
  getDashboard: asyncHandler(async (req, res) => {
    const data = await FraudService.getDashboard();
    return ok(res, data);
  }),

  // SE-5: Sharer (Share-to-Earn) fraud dashboard — velocity, IP/device clusters,
  // rejection anomalies. Extends the per-transaction checks into admin tooling.
  getSharerDashboard: asyncHandler(async (req, res) => {
    const data = await ShareFraudDetectionService.getSharerFraudDashboard({
      velocityDays: req.query.velocityDays ? parseInt(req.query.velocityDays, 10) : undefined,
      limit: req.query.limit ? parseInt(req.query.limit, 10) : undefined,
    });
    return ok(res, data);
  }),

  // SE-5: Per-sharer drill-down.
  getSharerProfile: asyncHandler(async (req, res) => {
    const data = await ShareFraudDetectionService.getSharerProfile(req.params.userId);
    return ok(res, data);
  }),

  listAlerts: asyncHandler(async (req, res) => {
    const { page, limit } = parsePagination(req.query, 25);
    const data = await FraudService.listAlerts({
      status: req.query.status,
      severity: req.query.severity,
      alertType: req.query.alertType,
      page,
      limit,
    });
    return ok(res, data);
  }),

  actOnAlert: asyncHandler(async (req, res) => {
    const data = await FraudService.actOnAlert(req.params.alertId, req.body.action, {
      adminId: req.adminUser._id,
      notes: req.body?.notes,
      req,
    });
    return ok(res, data);
  }),

  reviewAssessment: asyncHandler(async (req, res) => {
    const data = await FraudService.reviewAssessment(req.params.assessmentId, req.body.decision, {
      adminId: req.adminUser._id,
      notes: req.body?.notes,
      req,
    });
    return ok(res, data);
  }),
};

module.exports = FraudController;
