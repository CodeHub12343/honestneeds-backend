/**
 * AnalyticsController (AN-02 Platform Analytics, admin-facing)
 */

const AdvancedAnalyticsService = require('../../services/AdvancedAnalyticsService');
const { asyncHandler, ok } = require('./helpers');

const VALID_PERIODS = new Set(['day', 'week', 'month', 'quarter', 'year', 'all']);

const AnalyticsController = {
  getOverview: asyncHandler(async (req, res) => {
    const period = VALID_PERIODS.has(req.query.period) ? req.query.period : 'month';
    const data = await AdvancedAnalyticsService.getPlatformAnalytics({ period });
    return ok(res, data);
  }),

  getRegions: asyncHandler(async (req, res) => {
    const groupBy = ['country', 'state', 'city'].includes(req.query.groupBy)
      ? req.query.groupBy
      : 'state';
    const data = await AdvancedAnalyticsService.getRegionImpactReport({
      groupBy,
      country: req.query.country,
      state: req.query.state,
      limit: req.query.limit,
    });
    return ok(res, data);
  }),
};

module.exports = AnalyticsController;
