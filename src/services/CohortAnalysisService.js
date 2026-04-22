/**
 * Cohort Analysis Service
 * Analyzes supporter cohorts by acquisition channel and time period
 * 
 * Cohort: Group of supporters who first shared/donated in the same time period
 * Analysis: How do different cohorts perform over time?
 * 
 * Metrics:
 * - Retention rate by cohort
 * - Lifetime value by cohort
 * - Channel effectiveness
 * - Seasonality of cohort acquisition
 */

const { ShareRecord } = require('../models/Share');
const Transaction = require('../models/Transaction');
const User = require('../models/User');
const Campaign = require('../models/Campaign');
const { winstonLogger } = require('../utils/logger');

const CohortAnalysisService = {
  /**
   * Analyze campaign supporter cohorts
   * Groups supporters by their first activity date
   * Tracks retention and performance over time
   */
  async analyzeCampaignCohorts(campaignId, lookbackDays = 90) {
    try {
      winstonLogger.info('[CohortAnalysisService] Analyzing campaign cohorts', {
        campaignId,
        lookbackDays,
      });

      const startDate = new Date();
      startDate.setDate(startDate.getDate() - lookbackDays);

      // Get all supporters for campaign
      const supporters = await this._getCampaignSupporters(campaignId, startDate);

      // Group into cohorts by week of first activity
      const cohorts = this._groupIntoCohorts(supporters, 'weekly');

      // Calculate metrics for each cohort
      const cohortMetrics = await Promise.all(
        cohorts.map(async (cohort) => {
          const retention = await this._calculateCohortRetention(
            cohort.supporterIds,
            campaignId
          );
          const lifetime = this._calculateCohortValue(cohort.shares);
          const channels = this._getChannelDistribution(cohort.shares);

          return {
            cohortName: cohort.cohortName,
            cohortDate: cohort.cohortDate,
            size: cohort.supporterIds.length,
            acquisition: {
              firstActive: cohort.cohortDate,
              size: cohort.supporterIds.length,
              primaryChannel: channels[0]?.channel || 'unknown',
            },
            retention: {
              day7: retention.day7,
              day30: retention.day30,
              day60: retention.day60,
              rate: retention.retentionRate,
            },
            lifetime: {
              totalShares: lifetime.totalShares,
              totalEarnings: lifetime.totalEarnings,
              earningsUSD: lifetime.earningsUSD,
              avgPerSupporter: lifetime.avgPerSupporter,
            },
            channelBreakdown: channels,
          };
        })
      );

      // Sort by cohort date descending (newest first)
      cohortMetrics.sort((a, b) => new Date(b.cohortDate) - new Date(a.cohortDate));

      return {
        success: true,
        campaignId,
        lookbackDays,
        cohortCount: cohortMetrics.length,
        cohorts: cohortMetrics,
        summary: this._generateCohortSummary(cohortMetrics),
      };
    } catch (error) {
      winstonLogger.error('[CohortAnalysisService] Campaign cohort analysis failed', { error });
      throw error;
    }
  },

  /**
   * Analyze all supporter cohorts (across all campaigns)
   * How do supporters acquired in different periods perform?
   */
  async analyzeAcquisitionCohorts(lookbackDays = 180) {
    try {
      winstonLogger.info('[CohortAnalysisService] Analyzing acquisition cohorts', {
        lookbackDays,
      });

      const startDate = new Date();
      startDate.setDate(startDate.getDate() - lookbackDays);

      // Get all supporters with their first share date
      const pipeline = [
        {
          $match: {
            created_at: { $gte: startDate },
            is_paid: true,
          },
        },
        {
          $group: {
            _id: '$supporter_id',
            firstShareDate: { $min: '$created_at' },
            totalShares: { $sum: 1 },
            totalEarnings: { $sum: '$reward_amount' },
            campaigns: { $addToSet: '$campaign_id' },
            channels: { $push: '$channel' },
          },
        },
        {
          $sort: { firstShareDate: 1 },
        },
      ];

      const supporters = await ShareRecord.aggregate(pipeline).exec();

      // Group into cohorts by month of first share
      const cohorts = this._groupIntoCohorts(supporters, 'monthly');

      // Calculate cohort metrics
      const cohortMetrics = cohorts.map((cohort) => {
        const supporterIds = cohort.supporters.map((s) => s._id);
        const totalShares = cohort.supporters.reduce(
          (sum, s) => sum + s.totalShares,
          0
        );
        const totalEarnings = cohort.supporters.reduce(
          (sum, s) => sum + s.totalEarnings,
          0
        );

        return {
          cohortName: cohort.cohortName,
          cohortDate: cohort.cohortDate,
          size: supporterIds.length,
          metrics: {
            totalShares,
            totalEarnings: Math.round(totalEarnings),
            totalEarningsUSD: (totalEarnings / 100).toFixed(2),
            avgSharesPerSupporter: (totalShares / supporterIds.length).toFixed(2),
            avgEarningsPerSupporter: ((totalEarnings / supporterIds.length) / 100).toFixed(2),
            campaignsPerSupporter: (
              cohort.supporters.reduce((sum, s) => sum + s.campaigns.length, 0) /
              supporterIds.length
            ).toFixed(2),
          },
          channels: this._getChannelStats(cohort.supporters),
          retention: {
            activeLast7Days: cohort.supporters.filter((s) => {
              const lastActivity = new Date();
              lastActivity.setDate(lastActivity.getDate() - 7);
              return s.firstShareDate >= lastActivity;
            }).length,
            activeLast30Days: cohort.supporters.filter((s) => {
              const lastActivity = new Date();
              lastActivity.setDate(lastActivity.getDate() - 30);
              return s.firstShareDate >= lastActivity;
            }).length,
          },
        };
      });

      return {
        success: true,
        lookbackDays,
        cohortCount: cohortMetrics.length,
        cohorts: cohortMetrics,
        summary: {
          totalSupporters: supporters.length,
          totalShares: supporters.reduce((sum, s) => sum + s.totalShares, 0),
          totalEarnings: Math.round(
            supporters.reduce((sum, s) => sum + s.totalEarnings, 0)
          ),
          bestCohort: cohortMetrics.reduce((best, current) =>
            current.size > best.size ? current : best
          ),
        },
      };
    } catch (error) {
      winstonLogger.error('[CohortAnalysisService] Acquisition cohort analysis failed', {
        error,
      });
      throw error;
    }
  },

  /**
   * Channel-based cohort analysis
   * How do supporters acquired via different channels perform?
   */
  async analyzeChannelCohorts(campaignId) {
    try {
      const pipeline = [
        {
          $match: { campaign_id: campaignId },
        },
        {
          $group: {
            _id: {
              channel: '$channel',
              supporterId: '$supporter_id',
            },
            firstShare: { $min: '$created_at' },
            shares: { $sum: 1 },
            earnings: { $sum: '$reward_amount' },
          },
        },
        {
          $group: {
            _id: '$_id.channel',
            supporters: { $sum: 1 },
            totalShares: { $sum: '$shares' },
            totalEarnings: { $sum: '$earnings' },
            avgSharesPerSupporter: { $avg: '$shares' },
            avgEarningsPerSupporter: { $avg: '$earnings' },
          },
        },
        { $sort: { totalEarnings: -1 } },
      ];

      const channelCohorts = await ShareRecord.aggregate(pipeline).exec();

      return {
        success: true,
        campaignId,
        channelCohorts: channelCohorts.map((cohort) => ({
          channel: cohort._id,
          supporters: cohort.supporters,
          totalShares: cohort.totalShares,
          totalEarnings: Math.round(cohort.totalEarnings),
          earningsUSD: (cohort.totalEarnings / 100).toFixed(2),
          avgSharesPerSupporter: cohort.avgSharesPerSupporter.toFixed(2),
          avgEarningsPerSupporter: (cohort.avgEarningsPerSupporter / 100).toFixed(2),
          roi: 'high', // Could calculate based on promotion spend
        })),
      };
    } catch (error) {
      winstonLogger.error('[CohortAnalysisService] Channel cohort analysis failed', { error });
      throw error;
    }
  },

  /**
   * PRIVATE METHODS
   */

  async _getCampaignSupporters(campaignId, startDate) {
    const pipeline = [
      {
        $match: {
          campaign_id: campaignId,
          created_at: { $gte: startDate },
        },
      },
      {
        $group: {
          _id: '$supporter_id',
          firstShareDate: { $min: '$created_at' },
          totalShares: { $sum: 1 },
          totalEarnings: { $sum: '$reward_amount' },
          channels: { $push: '$channel' },
        },
      },
      {
        $sort: { firstShareDate: 1 },
      },
    ];

    return await ShareRecord.aggregate(pipeline).exec();
  },

  _groupIntoCohorts(items, period = 'weekly') {
    const cohortMap = {};

    items.forEach((item) => {
      const date = new Date(item.firstShareDate || item.cohortDate);
      let cohortKey;
      let cohortName;

      if (period === 'weekly') {
        const weekStart = new Date(date);
        weekStart.setDate(date.getDate() - date.getDay());
        cohortKey = weekStart.toISOString().split('T')[0];
        cohortName = `Week of ${cohortKey}`;
      } else if (period === 'monthly') {
        cohortKey = date.toISOString().slice(0, 7);
        cohortName = date.toLocaleString('en-US', { month: 'long', year: 'numeric' });
      } else {
        cohortKey = date.toISOString().split('T')[0];
        cohortName = date.toISOString().split('T')[0];
      }

      if (!cohortMap[cohortKey]) {
        cohortMap[cohortKey] = {
          cohortName,
          cohortDate: cohortKey,
          supporterIds: [],
          supporters: [],
          shares: [],
        };
      }

      cohortMap[cohortKey].supporterIds.push(item._id);
      cohortMap[cohortKey].supporters.push(item);
      cohortMap[cohortKey].shares.push({
        supporterId: item._id,
        shares: item.totalShares,
        earnings: item.totalEarnings,
        channels: item.channels,
      });
    });

    return Object.values(cohortMap);
  },

  async _calculateCohortRetention(supporterIds, campaignId) {
    const now = new Date();
    const day7Ago = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const day30Ago = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const day60Ago = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);

    const active7 = await ShareRecord.countDocuments({
      supporter_id: { $in: supporterIds },
      campaign_id: campaignId,
      created_at: { $gte: day7Ago },
    });

    const active30 = await ShareRecord.countDocuments({
      supporter_id: { $in: supporterIds },
      campaign_id: campaignId,
      created_at: { $gte: day30Ago },
    });

    const active60 = await ShareRecord.countDocuments({
      supporter_id: { $in: supporterIds },
      campaign_id: campaignId,
      created_at: { $gte: day60Ago },
    });

    const size = supporterIds.length;

    return {
      day7: `${((active7 / size) * 100).toFixed(1)}%`,
      day30: `${((active30 / size) * 100).toFixed(1)}%`,
      day60: `${((active60 / size) * 100).toFixed(1)}%`,
      retentionRate: `${(
        ((active7 + active30 + active60) / (size * 3)) *
        100
      ).toFixed(1)}%`,
    };
  },

  _calculateCohortValue(shares) {
    const totalShares = shares.reduce((sum, s) => sum + s.shares, 0);
    const totalEarnings = shares.reduce((sum, s) => sum + s.earnings, 0);
    const size = shares.length;

    return {
      totalShares,
      totalEarnings: Math.round(totalEarnings),
      earningsUSD: (totalEarnings / 100).toFixed(2),
      avgPerSupporter: (totalEarnings / size / 100).toFixed(2),
    };
  },

  _getChannelDistribution(shares) {
    const channelMap = {};

    shares.forEach((share) => {
      share.channels.forEach((channel) => {
        channelMap[channel] = (channelMap[channel] || 0) + 1;
      });
    });

    return Object.entries(channelMap)
      .map(([channel, count]) => ({ channel, count }))
      .sort((a, b) => b.count - a.count);
  },

  _getChannelStats(supporters) {
    const stats = {};

    supporters.forEach((supporter) => {
      supporter.channels.forEach((channel) => {
        if (!stats[channel]) {
          stats[channel] = { count: 0, earnings: 0 };
        }
        stats[channel].count += 1;
        stats[channel].earnings += supporter.totalEarnings;
      });
    });

    return Object.entries(stats)
      .map(([channel, data]) => ({
        channel,
        uses: data.count,
        earnings: Math.round(data.earnings),
        earningsUSD: (data.earnings / 100).toFixed(2),
      }))
      .sort((a, b) => b.earnings - a.earnings);
  },

  _generateCohortSummary(cohortMetrics) {
    if (cohortMetrics.length === 0) return {};

    const bestCohort = cohortMetrics.reduce((best, current) =>
      current.lifetime.totalEarnings > best.lifetime.totalEarnings
        ? current
        : best
    );

    const avgRetention = (
      cohortMetrics.reduce((sum, c) => {
        const rate = parseFloat(c.retention.rate) || 0;
        return sum + rate;
      }, 0) / cohortMetrics.length
    ).toFixed(1);

    return {
      totalCohorts: cohortMetrics.length,
      bestCohort: bestCohort.cohortName,
      bestCohortEarnings: bestCohort.lifetime.earningsUSD,
      avgRetentionRate: `${avgRetention}%`,
      recommendation:
        avgRetention > 70
          ? '✅ Strong retention across cohorts'
          : '⚠️ Consider improving engagement strategies',
    };
  },
};

module.exports = CohortAnalysisService;
