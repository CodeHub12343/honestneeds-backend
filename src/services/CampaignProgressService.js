/**
 * Campaign Progress Service
 * Handles daily snapshot aggregation for analytics and trend reporting
 * 
 * Features:
 * - Daily snapshot creation at midnight UTC
 * - Calculates cumulative metrics from transactions
 * - Supports historical trend analysis (up to 90 days)
 * - Automatic cleanup of old snapshots
 * - Event emission for monitoring
 */

const { EventEmitter } = require('events');
const CampaignProgress = require('../models/CampaignProgress');
const Campaign = require('../models/Campaign');
const Transaction = require('../models/Transaction');
const ShareTracking = require('../models/ShareTracking');
const VolunteerAssignment = require('../models/VolunteerAssignment');
const { winstonLogger } = require('../utils/logger');

class CampaignProgressService extends EventEmitter {
  constructor() {
    super();
    this.RETENTION_DAYS = 90;
    this.aggregationRunning = false;
  }

  /**
   * Create daily snapshot for all active campaigns
   * Call at midnight UTC daily via cron job
   * @returns {Promise<Object>} Summary of aggregation results
   */
  async createDailySnapshots() {
    if (this.aggregationRunning) {
      winstonLogger.warn('Snapshot aggregation already in progress, skipping');
      return { status: 'SKIPPED', reason: 'Aggregation already running' };
    }

    this.aggregationRunning = true;
    const startTime = Date.now();

    try {
      winstonLogger.info('Starting daily campaign progress aggregation', {
        timestamp: new Date().toISOString()
      });

      // Get all active campaigns
      const campaigns = await Campaign.find({ status: 'active' })
        .select('_id campaign_id title creator_id')
        .lean();

      if (campaigns.length === 0) {
        winstonLogger.warn('No active campaigns found for snapshot aggregation');
        this.aggregationRunning = false;
        return { status: 'SUCCESS', campaignsProcessed: 0 };
      }

      // Get start of today (midnight UTC)
      const todayStart = new Date();
      todayStart.setUTCHours(0, 0, 0, 0);

      const results = {
        successful: 0,
        failed: 0,
        errors: []
      };

      // Process each campaign
      for (const campaign of campaigns) {
        try {
          await this.aggregateCampaignMetrics(campaign._id, campaign.campaign_id, todayStart);
          results.successful++;
        } catch (error) {
          winstonLogger.error('Failed to aggregate metrics for campaign', {
            campaignId: campaign._id,
            error: error.message
          });
          results.failed++;
          results.errors.push({
            campaignId: campaign._id,
            error: error.message
          });
        }
      }

      const duration = Date.now() - startTime;

      // Log aggregation summary
      winstonLogger.info('Daily campaign progress aggregation completed', {
        successful: results.successful,
        failed: results.failed,
        durationMs: duration,
        totalCampaigns: campaigns.length,
        timestamp: new Date().toISOString()
      });

      // Emit event for monitoring
      this.emit('snapshot:aggregation-complete', {
        successful: results.successful,
        failed: results.failed,
        totalCampaigns: campaigns.length,
        durationMs: duration
      });

      // Clean up old snapshots (> 90 days)
      await this.cleanupOldSnapshots();

      this.aggregationRunning = false;

      return {
        status: 'SUCCESS',
        campaignsProcessed: campaigns.length,
        successful: results.successful,
        failed: results.failed,
        durationMs: duration,
        errors: results.errors
      };
    } catch (error) {
      this.aggregationRunning = false;
      winstonLogger.error('Daily snapshot aggregation failed', {
        error: error.message,
        stack: error.stack
      });

      this.emit('snapshot:aggregation-failed', {
        error: error.message,
        timestamp: new Date().toISOString()
      });

      throw error;
    }
  }

  /**
   * Aggregate metrics for a single campaign
   * @param {ObjectId} campaignId - Campaign MongoDB ID
   * @param {String} campaignRefId - Campaign reference ID
   * @param {Date} date - Date for snapshot (start of day UTC)
   */
  async aggregateCampaignMetrics(campaignId, campaignRefId, date) {
    // Start of today
    const dayStart = new Date(date);
    dayStart.setUTCHours(0, 0, 0, 0);

    // End of today
    const dayEnd = new Date(date);
    dayEnd.setUTCHours(23, 59, 59, 999);

    // Query donations from entire campaign history (cumulative)
    const donations = await Transaction.aggregate([
      {
        $match: {
          campaign_id: campaignId,
          transaction_type: 'donation',
          status: { $in: ['verified', 'pending'] }
        }
      },
      {
        $group: {
          _id: '$payment_method',
          count: { $sum: 1 },
          amount: { $sum: '$amount_cents' }
        }
      }
    ]);

    // Query today's donations for daily count
    const todayDonations = await Transaction.countDocuments({
      campaign_id: campaignId,
      transaction_type: 'donation',
      status: { $in: ['verified', 'pending'] },
      created_at: { $gte: dayStart, $lte: dayEnd }
    });

    // Calculate totals
    let donationTotal = 0;
    const donationsByMethod = {
      paypal: 0,
      stripe: 0,
      bank_transfer: 0,
      other: 0
    };

    donations.forEach(d => {
      donationTotal += d.amount;
      const method = d._id || 'other';
      if (donationsByMethod[method] !== undefined) {
        donationsByMethod[method] = d.amount;
      } else {
        donationsByMethod.other += d.amount;
      }
    });

    // Query shares from entire campaign history (cumulative)
    const shares = await ShareTracking.aggregate([
      {
        $match: { campaign_id: campaignId }
      },
      {
        $group: {
          _id: '$channel',
          count: { $sum: 1 },
          paid_count: {
            $sum: { $cond: ['$is_paid', 1, 0] }
          }
        }
      }
    ]);

    // Query today's shares for daily count
    const todayShares = await ShareTracking.countDocuments({
      campaign_id: campaignId,
      created_at: { $gte: dayStart, $lte: dayEnd }
    });

    // Calculate share totals
    let shareTotal = 0;
    let paidSharesTotal = 0;
    const sharesByChannel = {
      facebook: 0,
      twitter: 0,
      instagram: 0,
      tiktok: 0,
      whatsapp: 0,
      email: 0,
      sms: 0,
      other: 0
    };

    shares.forEach(s => {
      shareTotal += s.count;
      paidSharesTotal += s.paid_count;
      const channel = s._id || 'other';
      if (sharesByChannel[channel] !== undefined) {
        sharesByChannel[channel] = s.count;
      } else {
        sharesByChannel.other += s.count;
      }
    });

    // Query volunteer metrics
    const volunteerMetrics = await VolunteerAssignment.aggregate([
      {
        $match: { campaign_id: campaignId }
      },
      {
        $group: {
          _id: null,
          totalVolunteers: { $sum: 1 },
          totalHours: { $sum: '$hours_worked' }
        }
      }
    ]);

    const volunteerCount = volunteerMetrics[0]?.totalVolunteers || 0;

    // Count new volunteers today
    const todayVolunteers = await VolunteerAssignment.countDocuments({
      campaign_id: campaignId,
      assigned_at: { $gte: dayStart, $lte: dayEnd }
    });

    // Check if snapshot for today exists
    const existingSnapshot = await CampaignProgress.findOne({
      campaign_id: campaignId,
      date: {
        $gte: dayStart,
        $lte: dayEnd
      }
    });

    // Create or update snapshot
    const snapshotData = {
      campaign_id: campaignId,
      campaign_ref_id: campaignRefId,
      date: dayStart,
      donations: {
        total_count: donations.length,
        total_amount: donationTotal,
        by_method: donationsByMethod
      },
      shares: {
        total_count: shareTotal,
        by_channel: sharesByChannel,
        paid_shares: paidSharesTotal,
        free_shares: shareTotal - paidSharesTotal
      },
      volunteers: {
        total_count: volunteerCount,
        new_today: todayVolunteers
      },
      customers: {
        total_acquired: 0, // Can be calculated from referrals if implemented
        new_today: 0
      },
      updated_at: new Date()
    };

    let snapshot;
    if (existingSnapshot) {
      snapshot = await CampaignProgress.findByIdAndUpdate(
        existingSnapshot._id,
        snapshotData,
        { new: true }
      );
    } else {
      snapshot = await CampaignProgress.create(snapshotData);
    }

    return snapshot;
  }

  /**
   * Get campaign progress trend for specified period
   * @param {ObjectId} campaignId - Campaign ID
   * @param {Number} days - Number of days to retrieve (1-90)
   * @returns {Promise<Array>} Array of daily snapshots
   */
  async getCampaignTrend(campaignId, days = 30) {
    // Validate days parameter
    const validDays = Math.min(90, Math.max(1, parseInt(days) || 30));

    // Calculate date range
    const endDate = new Date();
    endDate.setUTCHours(23, 59, 59, 999);

    const startDate = new Date(endDate);
    startDate.setUTCDate(startDate.getUTCDate() - validDays);
    startDate.setUTCHours(0, 0, 0, 0);

    try {
      const snapshots = await CampaignProgress.find({
        campaign_id: campaignId,
        date: {
          $gte: startDate,
          $lte: endDate
        }
      })
        .sort({ date: 1 })
        .lean();

      // Return with calculated cumulative gains
      return snapshots.map((snapshot, index) => ({
        ...snapshot,
        // Calculate daily gains (change from previous day)
        dailyGains: index > 0 ? {
          donations: {
            count: snapshot.donations.total_count - snapshots[index - 1].donations.total_count,
            amount: snapshot.donations.total_amount - snapshots[index - 1].donations.total_amount
          },
          shares: snapshot.shares.total_count - snapshots[index - 1].shares.total_count,
          volunteers: snapshot.volunteers.total_count - snapshots[index - 1].volunteers.total_count
        } : {
          donations: { count: snapshot.donations.total_count, amount: snapshot.donations.total_amount },
          shares: snapshot.shares.total_count,
          volunteers: snapshot.volunteers.total_count
        }
      }));
    } catch (error) {
      winstonLogger.error('Failed to retrieve campaign trend', {
        campaignId,
        days: validDays,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Get cumulative metrics for campaign
   * @param {ObjectId} campaignId - Campaign ID
   * @returns {Promise<Object>} Latest cumulative snapshot
   */
  async getCampaignMetrics(campaignId) {
    try {
      const snapshot = await CampaignProgress.findOne({
        campaign_id: campaignId
      })
        .sort({ date: -1 })
        .lean();

      if (!snapshot) {
        return null;
      }

      return {
        asOfDate: snapshot.date,
        donations: snapshot.donations,
        shares: snapshot.shares,
        volunteers: snapshot.volunteers,
        customers: snapshot.customers
      };
    } catch (error) {
      winstonLogger.error('Failed to retrieve campaign metrics', {
        campaignId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Clean up snapshots older than retention period
   * @private
   */
  async cleanupOldSnapshots() {
    try {
      const cutoffDate = new Date();
      cutoffDate.setUTCDate(cutoffDate.getUTCDate() - this.RETENTION_DAYS);
      cutoffDate.setUTCHours(0, 0, 0, 0);

      const result = await CampaignProgress.deleteMany({
        date: { $lt: cutoffDate }
      });

      if (result.deletedCount > 0) {
        winstonLogger.info('Cleaned up old campaign progress snapshots', {
          deletedCount: result.deletedCount,
          beforeDate: cutoffDate
        });
      }
    } catch (error) {
      winstonLogger.error('Failed to cleanup old snapshots', {
        error: error.message
      });
    }
  }

  /**
   * Manually trigger snapshot for campaign (admin)
   * @param {ObjectId} campaignId - Campaign ID
   */
  async createSnapshot(campaignId) {
    try {
      const campaign = await Campaign.findById(campaignId);
      if (!campaign) {
        throw new Error('Campaign not found');
      }

      const todayStart = new Date();
      todayStart.setUTCHours(0, 0, 0, 0);

      const snapshot = await this.aggregateCampaignMetrics(
        campaignId,
        campaign.campaign_id,
        todayStart
      );

      return snapshot;
    } catch (error) {
      winstonLogger.error('Failed to create manual snapshot', {
        campaignId,
        error: error.message
      });
      throw error;
    }
  }
}

// Export singleton instance
module.exports = new CampaignProgressService();
