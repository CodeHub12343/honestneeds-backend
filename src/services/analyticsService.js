/**
 * Analytics Service
 * Handles campaign metrics tracking, aggregation, and analytics queries
 * 
 * Features:
 * - Real-time metric updates
 * - Progress trending
 * - Cache management
 * - Efficient database queries
 */

const Campaign = require('../models/Campaign');
const CampaignProgress = require('../models/CampaignProgress');
const winstonLogger = require('../utils/winstonLogger');

class AnalyticsService {
  /**
   * Update campaign metrics on events
   * 
   * @param {string} campaignId - Campaign ID or MongoDB _id
   * @param {object} operationOptions - { type, amount?, count?, userId?, method?, channel? }
   * @returns {Promise<object>} Updated campaign metrics
   */
  static async updateMetrics(campaignId, operationOptions = {}) {
    try {
      const { type, amount = 0, count = 1, userId, method, channel } = operationOptions;

      let campaign = await Campaign.findById(campaignId);
      if (!campaign) {
        campaign = await Campaign.findOne({ campaign_id: campaignId });
      }

      if (!campaign) {
        throw new Error('Campaign not found');
      }

      const updates = {};

      // Handle different metric types
      switch (type) {
        case 'donation':
          updates['metrics.total_donations'] = (campaign.metrics?.total_donations || 0) + 1;
          updates['metrics.total_donation_amount'] = (campaign.metrics?.total_donation_amount || 0) + amount;
          
          // Track by method
          if (method) {
            const methodKey = `metrics.donations_by_method.${method}`;
            updates[methodKey] = (campaign.metrics?.donations_by_method?.[method] || 0) + 1;
          }
          
          // Add to unique supporters if userId provided
          if (userId) {
            if (!campaign.metrics.unique_supporters) {
              campaign.metrics.unique_supporters = new Set();
            }
            campaign.metrics.unique_supporters.add(userId.toString());
          }
          break;

        case 'share':
          updates['share_count'] = (campaign.share_count || 0) + 1;
          updates['metrics.shares_free'] = (campaign.metrics?.shares_free || 0) + (method === 'paid' ? 0 : 1);
          updates['metrics.shares_paid'] = (campaign.metrics?.shares_paid || 0) + (method === 'paid' ? 1 : 0);

          // Track by channel
          if (channel) {
            const channelKey = `metrics.shares_by_channel.${channel}`;
            updates[channelKey] = (campaign.metrics?.shares_by_channel?.[channel] || 0) + 1;
          }
          break;

        case 'volunteer':
          updates['metrics.total_volunteers'] = (campaign.metrics?.total_volunteers || 0) + 1;
          
          // Add to unique supporters
          if (userId) {
            if (!campaign.metrics.unique_supporters) {
              campaign.metrics.unique_supporters = new Set();
            }
            campaign.metrics.unique_supporters.add(userId.toString());
          }
          break;

        case 'customer_referral':
          updates['metrics.total_customers_acquired'] = (campaign.metrics?.total_customers_acquired || 0) + 1;
          
          // Add to unique supporters
          if (userId) {
            if (!campaign.metrics.unique_supporters) {
              campaign.metrics.unique_supporters = new Set();
            }
            campaign.metrics.unique_supporters.add(userId.toString());
          }
          break;

        case 'view':
          updates['view_count'] = (campaign.view_count || 0) + 1;
          break;

        default:
          winstonLogger.warn('Unknown metric type', { type, campaignId });
          return campaign;
      }

      // Update last metrics update timestamp
      updates['metrics.last_metrics_update'] = new Date();

      // Update campaign with new metrics
      const updated = await Campaign.findByIdAndUpdate(
        campaign._id,
        { $set: updates },
        { new: true, runValidators: true }
      );

      winstonLogger.info('Campaign metrics updated', {
        campaignId: campaign._id,
        metricType: type,
        updates,
      });

      return updated;
    } catch (error) {
      winstonLogger.error('Error updating metrics', {
        error: error.message,
        campaignId,
        operationOptions,
        stack: error.stack,
      });
      throw error;
    }
  }

  /**
   * Record campaign progress snapshot (daily)
   * 
   * @param {string} campaignId - Campaign ID or MongoDB _id
   * @param {Date} date - Date for snapshot (defaults to today)
   * @returns {Promise<object>} Created progress record
   */
  static async recordProgressSnapshot(campaignId, date = null) {
    try {
      let campaign = await Campaign.findById(campaignId);
      if (!campaign) {
        campaign = await Campaign.findOne({ campaign_id: campaignId });
      }

      if (!campaign) {
        throw new Error('Campaign not found');
      }

      // Use provided date or start of today
      const snapshotDate = date ? new Date(date) : new Date();
      snapshotDate.setUTCHours(0, 0, 0, 0);

      // Create progress record
      const progress = await CampaignProgress.create({
        campaign_id: campaign._id,
        campaign_ref_id: campaign.campaign_id,
        date: snapshotDate,
        donations: {
          total_count: campaign.metrics?.total_donations || 0,
          total_amount: campaign.metrics?.total_donation_amount || 0,
          by_method: campaign.metrics?.donations_by_method || {},
        },
        shares: {
          total_count: campaign.share_count || 0,
          by_channel: campaign.metrics?.shares_by_channel || {},
          paid_shares: campaign.metrics?.shares_paid || 0,
          free_shares: campaign.metrics?.shares_free || 0,
        },
        volunteers: {
          total_count: campaign.metrics?.total_volunteers || 0,
          new_today: 0, // Would need separate tracking for daily new
        },
        customers: {
          total_acquired: campaign.metrics?.total_customers_acquired || 0,
          new_today: 0,
        },
        views: {
          total_count: campaign.view_count || 0,
          new_today: 0,
          unique_visitors: campaign.metrics?.unique_supporters?.size || 0,
        },
        unique_supporters_count: campaign.metrics?.unique_supporters?.size || 0,
      });

      winstonLogger.info('Progress snapshot recorded', {
        campaignId: campaign._id,
        date: snapshotDate,
        progressId: progress._id,
      });

      return progress;
    } catch (error) {
      winstonLogger.error('Error recording progress snapshot', {
        error: error.message,
        campaignId,
        stack: error.stack,
      });
      throw error;
    }
  }

  /**
   * Get campaign analytics (full analytics report)
   * 
   * @param {string} campaignId - Campaign ID or MongoDB _id
   * @param {object} options - { includeProgress, progressDays }
   * @returns {Promise<object>} Analytics report
   */
  static async getAnalytics(campaignId, options = {}) {
    try {
      const { includeProgress = true, progressDays = 30 } = options;

      let campaign = await Campaign.findById(campaignId);
      if (!campaign) {
        campaign = await Campaign.findOne({ campaign_id: campaignId });
      }

      if (!campaign) {
        throw new Error('Campaign not found');
      }

      // Get basic campaign info
      const campaignInfo = {
        _id: campaign._id,
        campaign_id: campaign.campaign_id,
        title: campaign.title,
        status: campaign.status,
        published_at: campaign.published_at,
        created_at: campaign.created_at,
      };

      // Current metrics
      const metrics = {
        total_views: campaign.view_count || 0,
        total_shares: campaign.share_count || 0,
        total_donations: campaign.metrics?.total_donations || 0,
        total_donation_amount: campaign.metrics?.total_donation_amount || 0,
        total_volunteers: campaign.metrics?.total_volunteers || 0,
        total_customers_acquired: campaign.metrics?.total_customers_acquired || 0,
        unique_supporters: campaign.metrics?.unique_supporters?.size || 0,
      };

      // Donations by method
      const donations = {
        total: campaign.metrics?.total_donations || 0,
        total_amount: campaign.metrics?.total_donation_amount || 0,
        by_method: campaign.metrics?.donations_by_method || {},
      };

      // Shares breakdown
      const shares = {
        total: campaign.share_count || 0,
        paid: campaign.metrics?.shares_paid || 0,
        free: campaign.metrics?.shares_free || 0,
        by_channel: campaign.metrics?.shares_by_channel || {},
      };

      // Get progress trend if requested
      let progressTrend = [];
      if (includeProgress && campaign.published_at) {
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - progressDays);

        const progressRecords = await CampaignProgress.findByDateRange(
          campaign._id,
          startDate,
          new Date()
        );

        progressTrend = progressRecords.map(record => record.getTrend());
      }

      const analytics = {
        campaign: campaignInfo,
        metrics,
        donations,
        shares,
        progressTrend,
      };

      return analytics;
    } catch (error) {
      winstonLogger.error('Error getting analytics', {
        error: error.message,
        campaignId,
        stack: error.stack,
      });
      throw error;
    }
  }

  /**
   * Get progress trend for date range
   * 
   * @param {string} campaignId - Campaign ID
   * @param {Date} startDate - Start date
   * @param {Date} endDate - End date
   * @returns {Promise<array>} Trend data
   */
  static async getProgressTrend(campaignId, startDate, endDate) {
    try {
      let campaign = await Campaign.findById(campaignId);
      if (!campaign) {
        campaign = await Campaign.findOne({ campaign_id: campaignId });
      }

      if (!campaign) {
        throw new Error('Campaign not found');
      }

      const progressRecords = await CampaignProgress.findByDateRange(
        campaign._id,
        startDate,
        endDate
      );

      return progressRecords.map(record => record.getTrend());
    } catch (error) {
      winstonLogger.error('Error getting progress trend', {
        error: error.message,
        campaignId,
        stack: error.stack,
      });
      throw error;
    }
  }

  /**
   * Get comparison metrics (current vs past period)
   * 
   * @param {string} campaignId - Campaign ID
   * @param {number} days - Number of days to compare
   * @returns {Promise<object>} Comparison data
   */
  static async getMetricsComparison(campaignId, days = 7) {
    try {
      let campaign = await Campaign.findById(campaignId);
      if (!campaign) {
        campaign = await Campaign.findOne({ campaign_id: campaignId });
      }

      if (!campaign) {
        throw new Error('Campaign not found');
      }

      // Get current period (last N days)
      const currentStart = new Date();
      currentStart.setDate(currentStart.getDate() - days);

      const currentPeriod = await CampaignProgress.findByDateRange(
        campaign._id,
        currentStart,
        new Date()
      );

      // Get previous period (N-2N days)
      const prevStart = new Date(currentStart);
      prevStart.setDate(prevStart.getDate() - days);
      const prevEnd = new Date(currentStart);
      prevEnd.setDate(prevEnd.getDate() - 1);

      const previousPeriod = await CampaignProgress.findByDateRange(
        campaign._id,
        prevStart,
        prevEnd
      );

      // Calculate aggregates
      const currentStats = this.aggregateProgressStats(currentPeriod);
      const previousStats = this.aggregateProgressStats(previousPeriod);

      // Calculate changes (percentage)
      const comparison = {
        current_period: currentStats,
        previous_period: previousStats,
        changes: {
          donations_amount_pct: previousStats.total_amount > 0
            ? ((currentStats.total_amount - previousStats.total_amount) / previousStats.total_amount * 100).toFixed(2)
            : 'N/A',
          shares_count_pct: previousStats.total_shares > 0
            ? ((currentStats.total_shares - previousStats.total_shares) / previousStats.total_shares * 100).toFixed(2)
            : 'N/A',
          views_count_pct: previousStats.total_views > 0
            ? ((currentStats.total_views - previousStats.total_views) / previousStats.total_views * 100).toFixed(2)
            : 'N/A',
        },
      };

      return comparison;
    } catch (error) {
      winstonLogger.error('Error getting metrics comparison', {
        error: error.message,
        campaignId,
        stack: error.stack,
      });
      throw error;
    }
  }

  /**
   * Aggregate progress stats from records
   * 
   * @private
   */
  static aggregateProgressStats(records) {
    return records.reduce(
      (acc, record) => ({
        total_donations: acc.total_donations + (record.donations?.total_count || 0),
        total_amount: acc.total_amount + (record.donations?.total_amount || 0),
        total_shares: acc.total_shares + (record.shares?.total_count || 0),
        total_views: acc.total_views + (record.views?.total_count || 0),
        total_volunteers: acc.total_volunteers + (record.volunteers?.total_count || 0),
        unique_supporters: acc.unique_supporters + (record.unique_supporters_count || 0),
      }),
      {
        total_donations: 0,
        total_amount: 0,
        total_shares: 0,
        total_views: 0,
        total_volunteers: 0,
        unique_supporters: 0,
      }
    );
  }

  /**
   * Get platform-wide dashboard metrics
   * 
   * @param {object} options - { period: 'day'|'week'|'month'|'year', dateRange?: {start, end} }
   * @returns {Promise<object>} Platform metrics
   */
  static async getDashboardMetrics(options = {}) {
    try {
      const { period = 'month', dateRange = null } = options;
      
      // Calculate date range
      let startDate = new Date();
      let endDate = new Date();
      
      if (dateRange && dateRange.start && dateRange.end) {
        startDate = new Date(dateRange.start);
        endDate = new Date(dateRange.end);
      } else {
        switch (period) {
          case 'day':
            startDate.setHours(0, 0, 0, 0);
            break;
          case 'week':
            startDate.setDate(startDate.getDate() - 7);
            break;
          case 'month':
            startDate.setMonth(startDate.getMonth() - 1);
            break;
          case 'year':
            startDate.setFullYear(startDate.getFullYear() - 1);
            break;
        }
      }

      const Donation = require('../models/Donation');
      const User = require('../models/User');

      // Get metrics
      const totalUsers = await User.countDocuments({ deleted_at: null });
      const activeUsers = await User.countDocuments({ 
        deleted_at: null, 
        last_login: { $gte: startDate } 
      });

      const totalCampaigns = await Campaign.countDocuments({ deleted_at: null });
      const activeCampaigns = await Campaign.countDocuments({ 
        status: 'active',
        deleted_at: null 
      });

      const donations = await Donation.aggregate([
        {
          $match: {
            created_at: { $gte: startDate, $lte: endDate },
            status: 'completed'
          }
        },
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            totalAmount: { $sum: '$amount' },
            avgAmount: { $avg: '$amount' }
          }
        }
      ]);

      const totalDonations = donations[0]?.total || 0;
      const totalRevenue = donations[0]?.totalAmount || 0;
      const avgDonation = donations[0]?.avgAmount || 0;

      winstonLogger.info('Dashboard metrics retrieved', {
        period,
        totalUsers,
        activeUsers,
        activeCampaigns,
        totalDonations
      });

      return {
        period,
        dateRange: { start: startDate, end: endDate },
        users: {
          total: totalUsers,
          active: activeUsers,
          growth: null // TODO: Calculate growth
        },
        campaigns: {
          total: totalCampaigns,
          active: activeCampaigns,
          completed: await Campaign.countDocuments({ status: 'completed', deleted_at: null })
        },
        donations: {
          total: totalDonations,
          totalAmount: totalRevenue,
          avgAmount: avgDonation
        },
        volume: {
          newUsersThisPeriod: await User.countDocuments({ created_at: { $gte: startDate }, deleted_at: null }),
          newCampaignsThisPeriod: await Campaign.countDocuments({ created_at: { $gte: startDate }, deleted_at: null })
        }
      };
    } catch (error) {
      winstonLogger.error('Error getting dashboard metrics', {
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * Get campaign performance metrics
   * 
   * @param {object} options - { sort: 'progress'|'donations'|'trending', limit: 10 }
   * @returns {Promise<array>} Campaign performance data
   */
  static async getCampaignPerformance(options = {}) {
    try {
      const { sort = 'donations', limit = 10 } = options;

      let sortField = { 'metrics.total_donation_amount': -1 };
      
      switch (sort) {
        case 'donations':
          sortField = { 'metrics.total_donations': -1 };
          break;
        case 'progress':
          sortField = { completion_percentage: -1 };
          break;
        case 'trending':
          sortField = { view_count: -1, updated_at: -1 };
          break;
      }

      const campaigns = await Campaign.find({ 
        status: 'active', 
        deleted_at: null 
      })
        .select('title description creator_id goal_amount metrics status created_at view_count')
        .populate('creator_id', 'display_name email')
        .sort(sortField)
        .limit(limit);

      return campaigns.map(c => ({
        id: c._id,
        title: c.title,
        creator: c.creator_id?.display_name,
        goalAmount: c.goal_amount,
        collectedAmount: c.metrics?.total_donation_amount || 0,
        donorCount: c.metrics?.total_donations || 0,
        completionPercentage: (c.metrics?.total_donation_amount || 0) / c.goal_amount * 100,
        views: c.view_count || 0,
        createdAt: c.created_at
      }));
    } catch (error) {
      winstonLogger.error('Error getting campaign performance', {
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * Get donation trends over time
   * 
   * @param {object} options - { period: 'day'|'week'|'month', days: 30, groupBy: 'date'|'source' }
   * @returns {Promise<object>} Donation trends data
   */
  static async getDonationTrends(options = {}) {
    try {
      const { period = 'day', days = 30, groupBy = 'date' } = options;
      const Donation = require('../models/Donation');

      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      let grouping = {
        _id: {
          $dateToString: {
            format: '%Y-%m-%d',
            date: '$created_at'
          }
        },
        count: { $sum: 1 },
        amount: { $sum: '$amount' }
      };

      // Trending by source/channel if specified
      if (groupBy === 'source') {
        grouping._id = '$source'; // Assuming donation has 'source' field
      } else if (groupBy === 'method') {
        grouping._id = '$payment_method';
      }

      const trends = await Donation.aggregate([
        {
          $match: {
            created_at: { $gte: startDate },
            status: 'completed'
          }
        },
        {
          $group: grouping
        },
        {
          $sort: { _id: 1 }
        }
      ]);

      // Calculate growth
      const previousStartDate = new Date(startDate);
      previousStartDate.setDate(previousStartDate.getDate() - days);

      const previousTrends = await Donation.aggregate([
        {
          $match: {
            created_at: { $gte: previousStartDate, $lt: startDate },
            status: 'completed'
          }
        },
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            amount: { $sum: '$amount' }
          }
        }
      ]);

      const currentTotal = trends.reduce((sum, t) => sum + t.count, 0);
      const previousTotal = previousTrends[0]?.total || 0;
      const growth = previousTotal > 0 ? ((currentTotal - previousTotal) / previousTotal) * 100 : 0;

      winstonLogger.info('Donation trends retrieved', {
        days,
        currentTotal,
        previousTotal,
        growth
      });

      return {
        period,
        days,
        dateRange: { start: startDate, end: new Date() },
        trends,
        summary: {
          totalDonations: currentTotal,
          totalAmount: trends.reduce((sum, t) => sum + t.amount, 0),
          avgDonation: trends.length > 0 ? trends.reduce((sum, t) => sum + t.amount, 0) / currentTotal : 0,
          growth: growth
        }
      };
    } catch (error) {
      winstonLogger.error('Error getting donation trends', {
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * Get platform revenue breakdown
   * 
   * @param {object} options - { period: 'month'|'year', detailed: false }
   * @returns {Promise<object>} Revenue metrics
   */
  static async getRevenueBreakdown(options = {}) {
    try {
      const { period = 'month', detailed = false } = options;
      const Donation = require('../models/Donation');
      const SettlementLedger = require('../models/SettlementLedger');

      const startDate = new Date();
      if (period === 'month') {
        startDate.setMonth(startDate.getMonth() - 1);
      } else {
        startDate.setFullYear(startDate.getFullYear() - 1);
      }

      // Get gross donations
      const donations = await Donation.aggregate([
        {
          $match: {
            created_at: { $gte: startDate },
            status: 'completed'
          }
        },
        {
          $group: {
            _id: null,
            grossAmount: { $sum: '$amount' },
            count: { $sum: 1 }
          }
        }
      ]);

      const grossAmount = donations[0]?.grossAmount || 0;
      const platformFee = Math.round(grossAmount * 0.20); // 20% fee
      const netAmount = grossAmount - platformFee;

      // Get payouts
      const settlements = await SettlementLedger.aggregate([
        {
          $match: {
            created_at: { $gte: startDate },
            status: 'completed'
          }
        },
        {
          $group: {
            _id: null,
            totalPayouts: { $sum: '$amount' }
          }
        }
      ]);

      const totalPayouts = settlements[0]?.totalPayouts || 0;

      return {
        period,
        dateRange: { start: startDate, end: new Date() },
        revenue: {
          gross: grossAmount,
          platformFees: platformFee,
          net: netAmount,
          totalPayouts: totalPayouts,
          retained: netAmount - totalPayouts
        },
        breakdown: detailed ? {
          bySource: await this._getRevenueBySource(startDate),
          byCreatorType: await this._getRevenueByCreatorType(startDate)
        } : {},
        summary: {
          transactionCount: donations[0]?.count || 0,
          avgTransactionValue: donations[0]?.count > 0 ? grossAmount / donations[0].count : 0
        }
      };
    } catch (error) {
      winstonLogger.error('Error getting revenue breakdown', {
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * Get revenue by source (helper method)
   * @private
   */
  static async _getRevenueBySource(startDate) {
    const Donation = require('../models/Donation');
    
    return await Donation.aggregate([
      {
        $match: {
          created_at: { $gte: startDate },
          status: 'completed'
        }
      },
      {
        $group: {
          _id: '$source',
          amount: { $sum: '$amount' },
          count: { $sum: 1 }
        }
      }
    ]);
  }

  /**
   * Get campaign analytics with fee breakdown and timeline
   * Enhanced method for creator analytics dashboard
   * 
   * @param {string} campaignId - Campaign ID or MongoDB _id
   * @param {object} options - { includeTimeline, includeRecent, timelineLimit }
   * @returns {Promise<object>} Analytics with fees and timeline
   */
  static async getCampaignAnalyticsWithFees(campaignId, options = {}) {
    try {
      const {
        includeTimeline = true,
        includeRecent = true,
        recentLimit = 20,
        timelineLimit = 90,
      } = options;

      let campaign = await Campaign.findById(campaignId);
      if (!campaign) {
        campaign = await Campaign.findOne({ campaign_id: campaignId });
      }

      if (!campaign) {
        throw new Error('Campaign not found');
      }

      // Get all transactions for the campaign
      const transactions = await Transaction.find(
        { campaign_id: campaign._id },
        {
          campaign_id: 1,
          supporter_id: 1,
          amount_cents: 1,
          platform_fee_cents: 1,
          net_amount_cents: 1,
          payment_method: 1,
          status: 1,
          created_at: 1,
        }
      )
        .populate('supporter_id', 'display_name email')
        .lean();

      // Calculate fee breakdown (20% platform fee)
      const totalAmountCents = transactions.reduce((sum, t) => sum + (t.amount_cents || 0), 0);
      const totalFeeCents = Math.round(totalAmountCents * 0.2); // 20% platform fee
      const creatorNetCents = totalAmountCents - totalFeeCents;

      const feeBreakdown = {
        total_raised_cents: totalAmountCents,
        total_raised_dollars: totalAmountCents / 100,
        total_fee_cents: totalFeeCents,
        total_fee_dollars: totalFeeCents / 100,
        creator_net_cents: creatorNetCents,
        creator_net_dollars: creatorNetCents / 100,
        fee_percentage: 20,
      };

      // Build timeline data (daily aggregation)
      let timelineData = [];
      if (includeTimeline && transactions.length > 0) {
        timelineData = await this._buildTimelineData(transactions, timelineLimit);
      }

      // Get recent donations
      let recentDonations = [];
      if (includeRecent && transactions.length > 0) {
        recentDonations = await this._getRecentDonations(transactions, recentLimit);
      }

      // Build response
      const analytics = {
        campaign: {
          _id: campaign._id,
          campaign_id: campaign.campaign_id,
          title: campaign.title,
          status: campaign.status,
          published_at: campaign.published_at,
          created_at: campaign.created_at,
        },
        metrics: {
          total_donations: transactions.length,
          total_donation_amount: totalAmountCents,
          average_donation_cents: transactions.length > 0 ? Math.round(totalAmountCents / transactions.length) : 0,
          unique_supporters: new Set(transactions.map(t => t.supporter_id?.toString())).size,
        },
        fees: feeBreakdown,
        timeline: timelineData,
        recent_donations: recentDonations,
      };

      return analytics;
    } catch (error) {
      winstonLogger.error('Error getting campaign analytics with fees', {
        error: error.message,
        campaignId,
        stack: error.stack,
      });
      throw error;
    }
  }

  /**
   * Build daily timeline aggregation from transactions
   * Groups donations by date and calculates daily metrics
   * 
   * @param {array} transactions - Array of transaction documents
   * @param {number} limit - Maximum days to include
   * @returns {Promise<array>} Timeline data
   * @private
   */
  static async _buildTimelineData(transactions, limit = 90) {
    try {
      const timeline = {};

      // Group transactions by date
      transactions.forEach((transaction) => {
        if (transaction.created_at) {
          // Get date in YYYY-MM-DD format (UTC)
          const dateStr = transaction.created_at.toISOString().split('T')[0];

          if (!timeline[dateStr]) {
            timeline[dateStr] = {
              date: dateStr,
              total_amount_cents: 0,
              total_fee_cents: 0,
              total_net_cents: 0,
              donation_count: 0,
              average_donation_cents: 0,
            };
          }

          timeline[dateStr].total_amount_cents += transaction.amount_cents || 0;
          timeline[dateStr].total_fee_cents += transaction.platform_fee_cents || 0;
          timeline[dateStr].total_net_cents += transaction.net_amount_cents || 0;
          timeline[dateStr].donation_count += 1;
        }
      });

      // Convert to array, calculate averages, and sort by date
      let timelineArray = Object.values(timeline)
        .map((day) => ({
          date: day.date,
          total_amount_cents: day.total_amount_cents,
          total_amount_dollars: day.total_amount_cents / 100,
          total_fee_cents: day.total_fee_cents,
          total_fee_dollars: day.total_fee_cents / 100,
          total_net_cents: day.total_net_cents,
          total_net_dollars: day.total_net_cents / 100,
          donation_count: day.donation_count,
          average_donation_cents: Math.round(day.total_amount_cents / day.donation_count),
          average_donation_dollars: (day.total_amount_cents / day.donation_count / 100).toFixed(2),
        }))
        .sort((a, b) => new Date(a.date) - new Date(b.date))
        .slice(-limit); // Keep only last N days

      return timelineArray;
    } catch (error) {
      winstonLogger.error('Error building timeline data', {
        error: error.message,
        transactionCount: transactions.length,
        stack: error.stack,
      });
      throw error;
    }
  }

  /**
   * Get recent donations with supporter info
   * Returns formatted donation records for UI display
   * 
   * @param {array} transactions - Array of transaction documents
   * @param {number} limit - Number of recent donations to return
   * @returns {Promise<array>} Recent donations
   * @private
   */
  static async _getRecentDonations(transactions, limit = 20) {
    try {
      const recentDonations = transactions
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
        .slice(0, limit)
        .map((transaction) => ({
          id: transaction._id.toString(),
          donor_name: transaction.supporter_id?.display_name || 'Anonymous',
          donor_email: transaction.supporter_id?.email || null,
          amount_cents: transaction.amount_cents,
          amount_dollars: (transaction.amount_cents / 100).toFixed(2),
          fee_cents: transaction.platform_fee_cents,
          fee_dollars: (transaction.platform_fee_cents / 100).toFixed(2),
          net_cents: transaction.net_amount_cents,
          net_dollars: (transaction.net_amount_cents / 100).toFixed(2),
          payment_method: transaction.payment_method,
          status: transaction.status,
          created_at: transaction.created_at,
          created_at_formatted: transaction.created_at.toLocaleString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          }),
        }));

      return recentDonations;
    } catch (error) {
      winstonLogger.error('Error getting recent donations', {
        error: error.message,
        transactionCount: transactions.length,
        stack: error.stack,
      });
      throw error;
    }
  }

  /**
   * Get revenue by creator type (helper method)
   * @private
   */
  static async _getRevenueByCreatorType(startDate) {
    const Donation = require('../models/Donation');
    
    return await Donation.aggregate([
      {
        $match: {
          created_at: { $gte: startDate },
          status: 'completed'
        }
      },
      {
        $lookup: {
          from: 'campaigns',
          localField: 'campaign_id',
          foreignField: '_id',
          as: 'campaign'
        }
      },
      {
        $unwind: '$campaign'
      },
      {
        $group: {
          _id: '$campaign.creator_type',
          amount: { $sum: '$amount' },
          count: { $sum: 1 }
        }
      }
    ]);
  }

  /**
   * Cleanup old progress records (>90 days)
   * Note: MongoDB TTL index handles this automatically
   * 
   * @param {number} retentionDays - Days to retain (default 90)
   * @returns {Promise<object>} Deletion result
   */
  static async cleanupOldProgress(retentionDays = 90) {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

      const result = await CampaignProgress.deleteMany({
        created_at: { $lt: cutoffDate },
      });

      winstonLogger.info('Old progress records cleaned up', {
        deletedCount: result.deletedCount,
      });

      return result;
    } catch (error) {
      winstonLogger.error('Error cleaning up old progress', {
        error: error.message,
        stack: error.stack,
      });
      throw error;
    }
  }
}

module.exports = AnalyticsService;
