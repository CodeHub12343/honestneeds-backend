/**
 * Metrics & Analytics Controller
 * HTTP endpoints for comprehensive analytics & reporting
 * 
 * Routes:
 * - GET /analytics/campaigns/:id/time-series
 * - GET /analytics/campaigns/:id/trends
 * - GET /analytics/campaigns/:id/cohorts
 * - GET /analytics/campaigns/:id/predict
 * - GET /analytics/user/trends
 * - GET /analytics/user/cohorts
 * - GET /analytics/export
 */

const TimeSeriesAnalyticsService = require('../services/TimeSeriesAnalyticsService');
const TrendAnalysisService = require('../services/TrendAnalysisService');
const CohortAnalysisService = require('../services/CohortAnalysisService');
const PredictiveAnalyticsService = require('../services/PredictiveAnalyticsService');
const { winstonLogger } = require('../utils/logger');

const MetricsController = {
  /**
   * GET /analytics/campaigns/:id/time-series
   * Time-series data for shares, donations, engagement
   */
  async getTimeSeriesAnalytics(req, res) {
    try {
      const { id: campaignId } = req.params;
      const { period = 'daily', days = 30 } = req.query;

      winstonLogger.info('[MetricsController] Getting time-series analytics', {
        campaignId,
        period,
        days,
      });

      const [shareData, donationData, engagementData] = await Promise.all([
        TimeSeriesAnalyticsService.getShareTimeSeries(campaignId, period, parseInt(days)),
        TimeSeriesAnalyticsService.getDonationTimeSeries(campaignId, period, parseInt(days)),
        TimeSeriesAnalyticsService.getEngagementTimeSeries(campaignId, period, parseInt(days)),
      ]);

      res.status(200).json({
        success: true,
        data: {
          shares: shareData,
          donations: donationData,
          engagement: engagementData,
          period,
          days: parseInt(days),
        },
      });
    } catch (error) {
      winstonLogger.error('[MetricsController] Time-series analytics failed', { error });
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  },

  /**
   * GET /analytics/campaigns/:id/trends
   * Trend analysis (direction, momentum, forecast)
   */
  async getTrendAnalytics(req, res) {
    try {
      const { id: campaignId } = req.params;
      const { days = 30 } = req.query;

      winstonLogger.info('[MetricsController] Getting trend analytics', {
        campaignId,
        days,
      });

      const [campaignTrends, platformTrends, seasonalTrends] = await Promise.all([
        TrendAnalysisService.analyzeCampaignTrends(campaignId, parseInt(days)),
        TrendAnalysisService.getPlatformTrendAnalysis(campaignId, parseInt(days)),
        TrendAnalysisService.getSeasonalTrendAnalysis(campaignId, parseInt(days) * 2),
      ]);

      res.status(200).json({
        success: true,
        data: {
          campaign: campaignTrends,
          byPlatform: platformTrends,
          seasonal: seasonalTrends,
        },
      });
    } catch (error) {
      winstonLogger.error('[MetricsController] Trend analytics failed', { error });
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  },

  /**
   * GET /analytics/campaigns/:id/cohorts
   * Cohort analysis (supporter groups by acquisition period)
   */
  async getCohortAnalytics(req, res) {
    try {
      const { id: campaignId } = req.params;
      const { days = 90 } = req.query;

      winstonLogger.info('[MetricsController] Getting cohort analytics', {
        campaignId,
        days,
      });

      const [campaignCohorts, channelCohorts] = await Promise.all([
        CohortAnalysisService.analyzeCampaignCohorts(campaignId, parseInt(days)),
        CohortAnalysisService.analyzeChannelCohorts(campaignId),
      ]);

      res.status(200).json({
        success: true,
        data: {
          campaign: campaignCohorts,
          byChannel: channelCohorts,
        },
      });
    } catch (error) {
      winstonLogger.error('[MetricsController] Cohort analytics failed', { error });
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  },

  /**
   * GET /analytics/campaigns/:id/predict
   * Predictive analytics (forecast, success probability, budget timeline)
   */
  async getPredictiveAnalytics(req, res) {
    try {
      const { id: campaignId } = req.params;
      const { forecastDays = 14 } = req.query;

      winstonLogger.info('[MetricsController] Getting predictive analytics', {
        campaignId,
        forecastDays,
      });

      const [performance, optimization] = await Promise.all([
        PredictiveAnalyticsService.predictCampaignPerformance(
          campaignId,
          parseInt(forecastDays)
        ),
        PredictiveAnalyticsService.optimizeRewardStrategy(campaignId),
      ]);

      res.status(200).json({
        success: true,
        data: {
          forecast: performance,
          optimization,
        },
      });
    } catch (error) {
      winstonLogger.error('[MetricsController] Predictive analytics failed', { error });
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  },

  /**
   * GET /analytics/user/trends
   * Supporter earnings trends
   */
  async getUserTrendAnalytics(req, res) {
    try {
      const { id: supporterId, days = 30 } = req.query;

      winstonLogger.info('[MetricsController] Getting user trend analytics', {
        supporterId,
        days,
      });

      const trends = await TrendAnalysisService.analyzeSupporterTrends(
        supporterId,
        parseInt(days)
      );

      res.status(200).json({
        success: true,
        data: trends,
      });
    } catch (error) {
      winstonLogger.error('[MetricsController] User trend analytics failed', { error });
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  },

  /**
   * GET /analytics/user/cohorts
   * All supporter acquisition cohorts
   */
  async getUserCohortAnalytics(req, res) {
    try {
      const { days = 180 } = req.query;

      winstonLogger.info('[MetricsController] Getting user cohort analytics', { days });

      const cohorts = await CohortAnalysisService.analyzeAcquisitionCohorts(parseInt(days));

      res.status(200).json({
        success: true,
        data: cohorts,
      });
    } catch (error) {
      winstonLogger.error('[MetricsController] User cohort analytics failed', { error });
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  },

  /**
   * GET /analytics/user/:id/activity-predict
   * Predict individual supporter activity
   */
  async predictSupporterActivity(req, res) {
    try {
      const { id: supporterId } = req.params;
      const { campaignId } = req.query;

      winstonLogger.info('[MetricsController] Predicting supporter activity', {
        supporterId,
        campaignId,
      });

      const activity = await PredictiveAnalyticsService.predictSupporterActivity(
        supporterId,
        campaignId
      );

      res.status(200).json({
        success: true,
        data: activity,
      });
    } catch (error) {
      winstonLogger.error('[MetricsController] Supporter activity prediction failed', { error });
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  },

  /**
   * GET /analytics/campaigns/:id/comprehensive
   * Full analytics dashboard (all metrics)
   */
  async getComprehensiveAnalytics(req, res) {
    try {
      const { id: campaignId } = req.params;
      const { days = 30 } = req.query;

      winstonLogger.info('[MetricsController] Getting comprehensive analytics', {
        campaignId,
        days,
      });

      const [timeSeries, trends, cohorts, predictions] = await Promise.all([
        TimeSeriesAnalyticsService.getShareTimeSeries(campaignId, 'daily', parseInt(days)),
        TrendAnalysisService.analyzeCampaignTrends(campaignId, parseInt(days)),
        CohortAnalysisService.analyzeCampaignCohorts(campaignId, parseInt(days)),
        PredictiveAnalyticsService.predictCampaignPerformance(campaignId, 14),
      ]);

      res.status(200).json({
        success: true,
        data: {
          timeSeries,
          trends,
          cohorts,
          predictions,
          generatedAt: new Date(),
        },
      });
    } catch (error) {
      winstonLogger.error('[MetricsController] Comprehensive analytics failed', { error });
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  },

  /**
   * GET /analytics/export
   * Export analytics data (CSV/JSON)
   */
  async exportAnalytics(req, res) {
    try {
      const { campaignId, format = 'json', days = 30 } = req.query;

      winstonLogger.info('[MetricsController] Exporting analytics', {
        campaignId,
        format,
        days,
      });

      const shareTimeSeries = await TimeSeriesAnalyticsService.getShareTimeSeries(
        campaignId,
        'daily',
        parseInt(days)
      );

      if (format === 'csv') {
        // Convert to CSV
        const csv = this._convertToCSV(shareTimeSeries.data);
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="analytics-${campaignId}.csv"`);
        res.send(csv);
      } else {
        // JSON format
        res.status(200).json({
          success: true,
          data: shareTimeSeries,
          exportedAt: new Date(),
        });
      }
    } catch (error) {
      winstonLogger.error('[MetricsController] Export failed', { error });
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  },

  /**
   * PRIVATE METHODS
   */

  _convertToCSV(data) {
    if (!data || data.length === 0) return '';

    const headers = Object.keys(data[0]);
    const csvHeaders = headers.join(',');
    const csvRows = data
      .map((row) =>
        headers
          .map((header) => {
            const value = row[header];
            // Escape quotes and wrap in quotes if contains comma/newline
            if (typeof value === 'string' && (value.includes(',') || value.includes('\n'))) {
              return `"${value.replace(/"/g, '""')}"`;
            }
            return value;
          })
          .join(',')
      )
      .join('\n');

    return `${csvHeaders}\n${csvRows}`;
  },
};

module.exports = MetricsController;
