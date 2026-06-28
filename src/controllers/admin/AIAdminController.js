/**
 * AIAdminController (admin oversight of the AI subsystem, AI-01..AI-12)
 */

const AIAdminService = require('../../services/admin/AIAdminService');
const { asyncHandler, ok, parsePagination } = require('./helpers');

const AIAdminController = {
  getOverview: asyncHandler(async (req, res) => {
    const days = Math.min(90, Math.max(1, parseInt(req.query.days, 10) || 30));
    const data = await AIAdminService.getOverview({ days });
    return ok(res, data);
  }),

  getTimeseries: asyncHandler(async (req, res) => {
    const days = Math.min(90, Math.max(1, parseInt(req.query.days, 10) || 30));
    const data = await AIAdminService.getTimeseries({ days });
    return ok(res, data);
  }),

  getLogs: asyncHandler(async (req, res) => {
    const { page, limit } = parsePagination(req.query, 20, 100);
    const data = await AIAdminService.getLogs({
      page,
      limit,
      feature: req.query.feature,
      success: req.query.success,
      kind: req.query.kind,
    });
    return ok(res, data);
  }),

  listFeatures: asyncHandler(async (req, res) => {
    const data = await AIAdminService.listFeatures();
    return ok(res, data);
  }),
};

module.exports = AIAdminController;
