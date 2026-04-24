/**
 * Time Series Analytics Service
 * Aggregates share, donation, and engagement metrics across time periods
 * 
 * Supports: daily, weekly, monthly aggregations
 * Used for: charts, trend analysis, forecasting
 */

const { ShareRecord } = require('../models/Share');
const Transaction = require('../models/Transaction');
const Campaign = require('../models/Campaign');
const { winstonLogger } = require('../utils/logger');

const TimeSeriesAnalyticsService = {
  /**
   * Get time-series share data
   * Aggregates shares by day/week/month
   * 
   * @param {string} campaignId - Campaign ID
   * @param {string} period - 'daily' | 'weekly' | 'monthly'
   * @param {number} days - Number of days to look back (7, 14, 30, 90)
   * @returns {Object} { data: Array, summary: Object }
   */
  async getShareTimeSeries(campaignId, period = 'daily', days = 30) {
    try {
      winstonLogger.info('[TimeSeriesAnalyticsService] Getting share time-series', {
        campaignId,
        period,
        days,
      });

      const campaign = await Campaign.findById(campaignId).lean();
      if (!campaign) throw new Error('Campaign not found');

      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);
      startDate.setHours(0, 0, 0, 0);

      // Build aggregation pipeline
      const pipeline = this._buildTimeSeriesPipeline(
        { campaign_id: campaignId, created_at: { $gte: startDate } },
        period,
        'created_at'
      );

      const timeSeriesData = await ShareRecord.aggregate(pipeline).exec();

      return {
        success: true,
        data: this._formatTimeSeriesData(timeSeriesData, period),
        summary: this._calculateSummary(timeSeriesData),
        period,
        days,
        dateRange: {
          start: startDate,
          end: new Date(),
        },
      };
    } catch (error) {
      winstonLogger.error('[TimeSeriesAnalyticsService] Share time-series failed', { error });
      throw error;
    }
  },

  /**
   * Get time-series donation data
   * Aggregates donations by day/week/month with amounts
   */
  async getDonationTimeSeries(campaignId, period = 'daily', days = 30) {
    try {
      winstonLogger.info('[TimeSeriesAnalyticsService] Getting donation time-series', {
        campaignId,
        period,
        days,
      });

      const campaign = await Campaign.findById(campaignId).lean();
      if (!campaign) throw new Error('Campaign not found');

      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);
      startDate.setHours(0, 0, 0, 0);

      const pipeline = [
        {
          $match: {
            campaign_id: campaignId,
            transaction_type: 'donation',
            status: { $in: ['completed', 'verified', 'approved'] },
            created_at: { $gte: startDate },
          },
        },
        ...this._buildGroupByTimePeriod(period),
        {
          $group: {
            _id: '$datePeriod',
            count: { $sum: 1 },
            totalAmount: { $sum: '$amount_cents' },
            avgAmount: { $avg: '$amount_cents' },
            maxAmount: { $max: '$amount_cents' },
            minAmount: { $min: '$amount_cents' },
          },
        },
        { $sort: { _id: 1 } },
      ];

      const timeSeriesData = await Transaction.aggregate(pipeline).exec();

      return {
        success: true,
        data: this._formatDonationTimeSeries(timeSeriesData, period),
        summary: this._calculateDonationSummary(timeSeriesData),
        period,
        days,
      };
    } catch (error) {
      winstonLogger.error('[TimeSeriesAnalyticsService] Donation time-series failed', { error });
      throw error;
    }
  },

  /**
   * Get time-series engagement data (views, shares, conversions)
   */
  async getEngagementTimeSeries(campaignId, period = 'daily', days = 30) {
    try {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);
      startDate.setHours(0, 0, 0, 0);

      const [shares, donations, conversions] = await Promise.all([
        this.getShareTimeSeries(campaignId, period, days),
        this.getDonationTimeSeries(campaignId, period, days),
        this._getConversionTimeSeries(campaignId, period, days, startDate),
      ]);

      return {
        success: true,
        shares: shares.data,
        donations: donations.data,
        conversions: conversions,
        period,
        days,
      };
    } catch (error) {
      winstonLogger.error('[TimeSeriesAnalyticsService] Engagement time-series failed', { error });
      throw error;
    }
  },

  /**
   * Get supporter-level time-series earnings
   */
  async getSupporterEarningsTimeSeries(supporterId, period = 'daily', days = 30) {
    try {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);
      startDate.setHours(0, 0, 0, 0);

      const pipeline = [
        {
          $match: {
            supporter_id: supporterId,
            is_paid: true,
            created_at: { $gte: startDate },
          },
        },
        ...this._buildGroupByTimePeriod(period),
        {
          $group: {
            _id: '$datePeriod',
            count: { $sum: 1 },
            totalEarnings: { $sum: '$reward_amount' },
            avgReward: { $avg: '$reward_amount' },
            sharesByChannel: {
              $push: '$channel',
            },
          },
        },
        { $sort: { _id: 1 } },
      ];

      const timeSeriesData = await ShareRecord.aggregate(pipeline).exec();

      return {
        success: true,
        data: this._formatEarningsTimeSeries(timeSeriesData, period),
        summary: this._calculateEarningsSummary(timeSeriesData),
        period,
        days,
      };
    } catch (error) {
      winstonLogger.error('[TimeSeriesAnalyticsService] Supporter earnings failed', { error });
      throw error;
    }
  },

  /**
   * Compare metrics across periods (WoW, MoM, YoY)
   */
  async getPeriodComparison(campaignId, metric = 'shares', comparisonType = 'WoW') {
    try {
      let current, previous;
      const today = new Date();

      if (comparisonType === 'WoW') {
        // Week over week
        current = await this.getShareTimeSeries(campaignId, 'daily', 7);
        const prevStart = new Date(today.getTime() - 14 * 24 * 60 * 60 * 1000);
        previous = await this._getShareTimeSeriesCustom(campaignId, prevStart, 7);
      } else if (comparisonType === 'MoM') {
        // Month over month
        current = await this.getShareTimeSeries(campaignId, 'daily', 30);
        const prevStart = new Date(today.getTime() - 60 * 24 * 60 * 60 * 1000);
        previous = await this._getShareTimeSeriesCustom(campaignId, prevStart, 30);
      } else if (comparisonType === 'YoY') {
        // Year over year
        current = await this.getShareTimeSeries(campaignId, 'monthly', 365);
        const prevStart = new Date(today.getFullYear() - 1, today.getMonth(), today.getDate());
        previous = await this._getShareTimeSeriesCustom(campaignId, prevStart, 365);
      }

      const currentSum = current.summary.total || 0;
      const previousSum = previous.summary.total || 0;
      const growth = previousSum > 0 ? ((currentSum - previousSum) / previousSum) * 100 : 0;

      return {
        success: true,
        comparisonType,
        current: {
          period: current.data,
          total: currentSum,
        },
        previous: {
          period: previous,
          total: previousSum,
        },
        growth: growth.toFixed(2),
        changeType: growth >= 0 ? 'positive' : 'negative',
      };
    } catch (error) {
      winstonLogger.error('[TimeSeriesAnalyticsService] Period comparison failed', { error });
      throw error;
    }
  },

  /**
   * PRIVATE METHODS
   */

  _buildTimeSeriesPipeline(match, period, dateField) {
    return [
      { $match: match },
      ...this._buildGroupByTimePeriod(period, dateField),
      {
        $group: {
          _id: '$datePeriod',
          count: { $sum: 1 },
          totalReward: { $sum: '$reward_amount' },
          paidCount: {
            $sum: { $cond: ['$is_paid', 1, 0] },
          },
          channels: { $push: '$channel' },
        },
      },
      { $sort: { _id: 1 } },
    ];
  },

  _buildGroupByTimePeriod(period, dateField = 'created_at') {
    if (period === 'daily') {
      return [
        {
          $group: {
            _id: {
              $dateToString: { format: '%Y-%m-%d', date: `$${dateField}` },
            },
            datePeriod: {
              $dateToString: { format: '%Y-%m-%d', date: `$${dateField}` },
            },
            docs: { $push: '$$ROOT' },
          },
        },
      ];
    } else if (period === 'weekly') {
      return [
        {
          $group: {
            _id: {
              year: { $year: `$${dateField}` },
              week: { $week: `$${dateField}` },
            },
            datePeriod: {
              $dateToString: {
                format: 'Week %V, %Y',
                date: `$${dateField}`,
              },
            },
            docs: { $push: '$$ROOT' },
          },
        },
      ];
    } else {
      // monthly
      return [
        {
          $group: {
            _id: {
              $dateToString: { format: '%Y-%m', date: `$${dateField}` },
            },
            datePeriod: {
              $dateToString: { format: '%B %Y', date: `$${dateField}` },
            },
            docs: { $push: '$$ROOT' },
          },
        },
      ];
    }
  },

  _formatTimeSeriesData(data, period) {
    return data.map((item) => ({
      date: item._id,
      displayDate: item.datePeriod,
      shares: item.count,
      paidShares: item.paidCount,
      totalReward: Math.round(item.totalReward || 0),
      rewardUSD: (item.totalReward || 0) / 100,
      avgReward: item.count > 0 ? Math.round((item.totalReward || 0) / item.count) : 0,
      channels: [...new Set(item.channels || [])],
    }));
  },

  _formatDonationTimeSeries(data, period) {
    return data.map((item) => ({
      date: item._id,
      count: item.count,
      totalAmount: Math.round(item.totalAmount || 0),
      amountUSD: (item.totalAmount || 0) / 100,
      avgAmount: Math.round(item.avgAmount || 0),
      avgAmountUSD: (item.avgAmount || 0) / 100,
      maxAmount: Math.round(item.maxAmount || 0),
      minAmount: Math.round(item.minAmount || 0),
    }));
  },

  _formatEarningsTimeSeries(data, period) {
    return data.map((item) => ({
      date: item._id,
      shares: item.count,
      totalEarnings: Math.round(item.totalEarnings || 0),
      earningsUSD: (item.totalEarnings || 0) / 100,
      avgReward: Math.round(item.avgReward || 0),
      sharesByChannel: this._countChannels(item.sharesByChannel || []),
    }));
  },

  _calculateSummary(data) {
    const totalShares = data.reduce((sum, item) => sum + item.count, 0);
    const totalReward = data.reduce((sum, item) => sum + (item.totalReward || 0), 0);
    const avgPerDay = data.length > 0 ? totalShares / data.length : 0;

    return {
      total: totalShares,
      totalRewardCents: Math.round(totalReward),
      totalRewardUSD: (totalReward / 100).toFixed(2),
      avgPerDay: avgPerDay.toFixed(2),
      dataPoints: data.length,
    };
  },

  _calculateDonationSummary(data) {
    const totalDonations = data.reduce((sum, item) => sum + item.count, 0);
    const totalAmount = data.reduce((sum, item) => sum + (item.totalAmount || 0), 0);
    const avgPerDonation = totalDonations > 0 ? totalAmount / totalDonations : 0;

    return {
      total: totalDonations,
      totalAmountCents: Math.round(totalAmount),
      totalAmountUSD: (totalAmount / 100).toFixed(2),
      avgPerDonation: (avgPerDonation / 100).toFixed(2),
      dataPoints: data.length,
    };
  },

  _calculateEarningsSummary(data) {
    const totalShares = data.reduce((sum, item) => sum + item.count, 0);
    const totalEarnings = data.reduce((sum, item) => sum + (item.totalEarnings || 0), 0);

    return {
      totalShares,
      totalEarnings: Math.round(totalEarnings),
      totalEarningsUSD: (totalEarnings / 100).toFixed(2),
      avgPerShare: totalShares > 0 ? (totalEarnings / totalShares / 100).toFixed(2) : '0',
    };
  },

  _countChannels(channels) {
    return channels.reduce((acc, channel) => {
      acc[channel] = (acc[channel] || 0) + 1;
      return acc;
    }, {});
  },

  async _getConversionTimeSeries(campaignId, period, days, startDate) {
    const pipeline = [
      {
        $match: {
          campaign_id: campaignId,
          conversions: { $gt: 0 },
          created_at: { $gte: startDate },
        },
      },
      ...this._buildGroupByTimePeriod(period),
      {
        $group: {
          _id: '$datePeriod',
          conversions: { $sum: '$conversions' },
          conversionRate: { $avg: '$conversion_rate' },
        },
      },
      { $sort: { _id: 1 } },
    ];

    const result = await ShareRecord.aggregate(pipeline).exec();
    return result.map((item) => ({
      date: item._id,
      conversions: item.conversions,
      conversionRate: (item.conversionRate || 0).toFixed(2),
    }));
  },

  async _getShareTimeSeriesCustom(campaignId, startDate, days) {
    const pipeline = this._buildTimeSeriesPipeline(
      {
        campaign_id: campaignId,
        created_at: { $gte: startDate },
      },
      'daily'
    );

    const data = await ShareRecord.aggregate(pipeline).exec();
    return this._calculateSummary(data);
  },
};

module.exports = TimeSeriesAnalyticsService;
