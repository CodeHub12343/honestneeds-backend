/**
 * DashboardController (AD-01)
 */

const DashboardService = require('../../services/admin/DashboardService');
const { asyncHandler, ok } = require('./helpers');

const DashboardController = {
  getOverview: asyncHandler(async (req, res) => {
    const windowDays = Math.min(365, Math.max(1, parseInt(req.query.windowDays, 10) || 30));
    const data = await DashboardService.getOverview({ windowDays });
    return ok(res, data);
  }),

  getTimeSeries: asyncHandler(async (req, res) => {
    const days = Math.min(365, Math.max(1, parseInt(req.query.days, 10) || 30));
    const data = await DashboardService.getTimeSeries(days);
    return ok(res, data);
  }),
};

module.exports = DashboardController;
