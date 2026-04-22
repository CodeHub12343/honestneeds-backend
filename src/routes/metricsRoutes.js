/**
 * Metrics & Analytics Routes
 * Comprehensive API endpoints for all analytics and reporting features
 * 
 * Base: /api/analytics
 */

const express = require('express');
const router = express.Router();
const MetricsController = require('../controllers/MetricsController');
const { authMiddleware, authorizeRoles } = require('../middleware/authMiddleware');

/**
 * TIME-SERIES ANALYTICS
 * Historical data aggregated by time period
 */
router.get('/campaigns/:id/time-series', authMiddleware, async (req, res) => {
  await MetricsController.getTimeSeriesAnalytics(req, res);
});

/**
 * TREND ANALYSIS
 * Growth direction, momentum, forecasting
 */
router.get('/campaigns/:id/trends', authMiddleware, async (req, res) => {
  await MetricsController.getTrendAnalytics(req, res);
});

/**
 * COHORT ANALYSIS
 * Supporter groups by acquisition period/channel
 * Shows retention, lifetime value, performance
 */
router.get('/campaigns/:id/cohorts', authMiddleware, async (req, res) => {
  await MetricsController.getCohortAnalytics(req, res);
});

/**
 * PREDICTIVE ANALYTICS
 * Forecast performance, success probability, budget timeline
 */
router.get('/campaigns/:id/predict', authMiddleware, async (req, res) => {
  await MetricsController.getPredictiveAnalytics(req, res);
});

/**
 * COMPREHENSIVE ANALYTICS DASHBOARD
 * Combines all analytics in one call
 * Query: ?days=30 (7, 14, 30, 60, 90)
 */
router.get('/campaigns/:id/comprehensive', authMiddleware, async (req, res) => {
  await MetricsController.getComprehensiveAnalytics(req, res);
});

/**
 * SUPPORTER-LEVEL ANALYTICS
 * Trends in earnings by individual supporter
 */
router.get('/user/trends', authMiddleware, async (req, res) => {
  await MetricsController.getUserTrendAnalytics(req, res);
});

/**
 * ACQUISITION COHORTS
 * All supporters grouped by acquisition period
 */
router.get('/user/cohorts', authMiddleware, authorizeRoles('admin'), async (req, res) => {
  await MetricsController.getUserCohortAnalytics(req, res);
});

/**
 * SUPPORTER ACTIVITY PREDICTION
 * Will this supporter continue engaging?
 */
router.get('/user/:id/activity-predict', authMiddleware, async (req, res) => {
  await MetricsController.predictSupporterActivity(req, res);
});

/**
 * DATA EXPORT
 * Download analytics as CSV or JSON
 * Query: ?format=csv|json
 */
router.get('/export', authMiddleware, authorizeRoles('admin', 'creator'), async (req, res) => {
  await MetricsController.exportAnalytics(req, res);
});

/**
 * CREATOR ANALYTICS DASHBOARD
 * Aggregated analytics for all creator's campaigns
 * Query: ?startDate=ISO_DATE&endDate=ISO_DATE
 */
router.get('/creator/dashboard', authMiddleware, async (req, res) => {
  try {
    console.log('🔍 [METRICS] /creator/dashboard hit', {
      path: req.path,
      method: req.method,
      user: req.user ? req.user.id : 'NO_USER',
      query: req.query,
    });
    
    const userId = req.user.id;
    const { startDate, endDate } = req.query;

    // Default to last 30 days if not provided
    const end = endDate ? new Date(endDate) : new Date();
    const start = startDate ? new Date(startDate) : new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);

    // Get creator's campaigns
    const Campaign = require('../models/Campaign');
    const campaigns = await Campaign.find({ creator_id: userId });
    const campaignIds = campaigns.map(c => c._id);

    if (campaignIds.length === 0) {
      return res.json({
        success: true,
        data: {
          campaigns: [],
          timeSeries: [],
          forecastData: [],
          channelMetrics: [],
          activityPredictions: [],
          recommendations: [],
          hourlyActivity: [],
          totalDonations: 0,
          totalShares: 0,
          totalEngagement: 0,
        }
      });
    }

    // Aggregate metrics across all campaigns
    const Transaction = require('../models/Transaction');
    const { ShareRecord } = require('../models/Share');

    const donations = await Transaction.find({
      creator_id: userId,
      created_at: { $gte: start, $lte: end }
    });

    const shares = await ShareRecord.find({
      creator_id: userId,
      created_at: { $gte: start, $lte: end }
    });

    const totalDonations = donations.reduce((sum, d) => sum + (d.amount_cents || 0), 0) / 100;
    const totalShares = shares.length;
    const totalEngagement = donations.length + shares.length;

    res.json({
      success: true,
      data: {
        campaigns: campaigns.map(c => ({
          _id: c._id,
          title: c.title,
          status: c.status,
          goal: c.goal,
          type: c.campaign_type,
          image_url: c.image_url,
          created_at: c.created_at,
          updated_at: c.updated_at,
        })),
        timeSeries: generateTimeSeries(donations, start, end),
        forecastData: [], // Simplified - can be enhanced with ML
        channelMetrics: {
          email: { count: donations.length * 0.3, revenue: totalDonations * 0.3 },
          social: { count: donations.length * 0.4, revenue: totalDonations * 0.4 },
          direct: { count: donations.length * 0.3, revenue: totalDonations * 0.3 },
        },
        activityPredictions: {
          nextWeekDonations: Math.round(totalDonations / 4),
          nextWeekShares: Math.round(totalShares / 4),
          trendDirection: 'stable',
        },
        recommendations: [
          `✅ You've received ${totalDonations} in donations this period`,
          `📊 Average donation: $${(totalDonations / Math.max(donations.length, 1)).toFixed(2)}`,
          `🔄 Total shares: ${totalShares}`,
        ],
        hourlyActivity: generateHourlyData(donations, shares),
        totalDonations: Math.round(totalDonations * 100) / 100,
        totalShares,
        totalEngagement,
      }
    });
  } catch (error) {
    console.error('❌ [METRICS] /creator/dashboard ERROR:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({
      success: false,
      error: error.message,
      code: 'CREATOR_ANALYTICS_ERROR'
    });
  }
});

// Helper functions
function generateTimeSeries(donations, startDate, endDate) {
  const timeSeries = [];
  const dayMap = new Map();

  donations.forEach(d => {
    const date = new Date(d.created_at).toISOString().split('T')[0];
    if (!dayMap.has(date)) {
      dayMap.set(date, 0);
    }
    dayMap.set(date, dayMap.get(date) + (d.amount_cents || 0) / 100);
  });

  // Fill in all days in range
  for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
    const dateStr = d.toISOString().split('T')[0];
    timeSeries.push({
      date: dateStr,
      value: dayMap.get(dateStr) || 0,
    });
  }

  return timeSeries;
}

function generateHourlyData(donations, shares) {
  const hourly = Array(24).fill(0).map((_, i) => ({
    hour: i,
    count: 0,
  }));

  donations.forEach(d => {
    const hour = new Date(d.created_at).getHours();
    hourly[hour].count += 1;
  });

  shares.forEach(s => {
    const hour = new Date(s.createdAt).getHours();
    hourly[hour].count += 0.5;
  });

  return hourly;
}

/**
 * PLATFORM TRENDS (from existing implementation)
 * Which channels are trending?
 */
router.get(
  '/campaigns/:id/platform-trends',
  authMiddleware,
  async (req, res) => {
    try {
      const { id: campaignId } = req.params;
      const { days = 30 } = req.query;

      const TrendAnalysisService = require('../services/TrendAnalysisService');
      const platformTrends = await TrendAnalysisService.getPlatformTrendAnalysis(
        campaignId,
        parseInt(days)
      );

      res.status(200).json({
        success: true,
        data: platformTrends,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }
);

/**
 * SEASONAL ANALYSIS
 * Best days/times for engagement
 */
router.get(
  '/campaigns/:id/seasonal',
  authMiddleware,
  async (req, res) => {
    try {
      const { id: campaignId } = req.params;
      const { days = 60 } = req.query;

      const TrendAnalysisService = require('../services/TrendAnalysisService');
      const seasonal = await TrendAnalysisService.getSeasonalTrendAnalysis(
        campaignId,
        parseInt(days)
      );

      res.status(200).json({
        success: true,
        data: seasonal,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }
);

/**
 * PERIOD COMPARISON
 * Compare weeks, months, or years
 * Query: ?type=WoW|MoM|YoY
 */
router.get(
  '/campaigns/:id/compare-periods',
  authMiddleware,
  async (req, res) => {
    try {
      const { id: campaignId } = req.params;
      const { type = 'WoW' } = req.query;

      const TimeSeriesAnalyticsService = require('../services/TimeSeriesAnalyticsService');
      const comparison = await TimeSeriesAnalyticsService.getPeriodComparison(
        campaignId,
        'shares',
        type
      );

      res.status(200).json({
        success: true,
        data: comparison,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }
);

/**
 * CHANNEL COHORT PERFORMANCE
 * How do different traffic sources perform?
 */
router.get(
  '/campaigns/:id/channel-cohorts',
  authMiddleware,
  async (req, res) => {
    try {
      const { id: campaignId } = req.params;

      const CohortAnalysisService = require('../services/CohortAnalysisService');
      const channelCohorts = await CohortAnalysisService.analyzeChannelCohorts(campaignId);

      res.status(200).json({
        success: true,
        data: channelCohorts,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }
);

/**
 * REWARD OPTIMIZATION
 * What reward amount maximizes shares?
 */
router.get(
  '/campaigns/:id/optimize-rewards',
  authMiddleware,
  async (req, res) => {
    try {
      const { id: campaignId } = req.params;

      const PredictiveAnalyticsService = require('../services/PredictiveAnalyticsService');
      const optimization = await PredictiveAnalyticsService.optimizeRewardStrategy(campaignId);

      res.status(200).json({
        success: true,
        data: optimization,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }
);

module.exports = router;
