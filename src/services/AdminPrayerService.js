/**
 * Admin Prayer Service
 * Handles admin operations for prayer moderation, blocking, and analytics
 * Note: This is a stub implementation. Full functionality can be added as needed.
 */

const Prayer = require('../models/Prayer');
const User = require('../models/User');
const { logger } = require('../utils/logger');
const { Parser } = require('json2csv');

class AdminPrayerService {
  /**
   * Get moderation queue with filters
   */
  static async getModerationQueue(options = {}) {
    try {
      const {
        status = [],
        report_count_min = 0,
        sortBy = 'created_at',
        sortOrder = -1,
        limit = 50,
        offset = 0,
        campaignId,
        creatorId,
      } = options;

      let query = {};

      // Filter by status
      if (status.length > 0) {
        query.status = { $in: status };
      }

      // Filter by report count
      if (report_count_min > 0) {
        query.report_count = { $gte: report_count_min };
      }

      // Filter by campaign
      if (campaignId) {
        query.campaign_id = campaignId;
      }

      // Filter by creator
      if (creatorId) {
        query.creator_id = creatorId;
      }

      const sort = {};
      sort[sortBy] = sortOrder;

      const total = await Prayer.countDocuments(query);
      const prayers = await Prayer.find(query)
        .sort(sort)
        .limit(limit)
        .skip(offset)
        .lean();

      logger.info(`📋 [AdminPrayerService] Got ${prayers.length} prayers from queue`);

      return {
        data: prayers,
        total,
        limit,
        offset,
      };
    } catch (error) {
      logger.error(`❌ [AdminPrayerService] getModerationQueue error: ${error.message}`);
      throw error;
    }
  }

  /**
   * Bulk approve prayers
   */
  static async bulkApprovePrayers(prayerIds, adminId) {
    try {
      const result = await Prayer.updateMany(
        { _id: { $in: prayerIds } },
        {
          $set: {
            status: 'approved',
            approved_by: adminId,
            approved_at: new Date(),
          },
        }
      );

      logger.info(`✅ [AdminPrayerService] Approved ${result.modifiedCount} prayers`);

      return {
        approved: result.modifiedCount,
        failed: prayerIds.length - result.modifiedCount,
      };
    } catch (error) {
      logger.error(`❌ [AdminPrayerService] bulkApprovePrayers error: ${error.message}`);
      throw error;
    }
  }

  /**
   * Bulk reject prayers
   */
  static async bulkRejectPrayers(prayerIds, reason, adminId) {
    try {
      const result = await Prayer.updateMany(
        { _id: { $in: prayerIds } },
        {
          $set: {
            status: 'rejected',
            rejection_reason: reason,
            rejected_by: adminId,
            rejected_at: new Date(),
          },
        }
      );

      logger.info(`❌ [AdminPrayerService] Rejected ${result.modifiedCount} prayers`);

      return {
        rejected: result.modifiedCount,
        failed: prayerIds.length - result.modifiedCount,
      };
    } catch (error) {
      logger.error(`❌ [AdminPrayerService] bulkRejectPrayers error: ${error.message}`);
      throw error;
    }
  }

  /**
   * Bulk flag prayers for manual review
   */
  static async bulkFlagPrayers(prayerIds, reason = '') {
    try {
      const result = await Prayer.updateMany(
        { _id: { $in: prayerIds } },
        {
          $set: {
            status: 'flagged',
            flag_reason: reason,
            flagged_at: new Date(),
          },
        }
      );

      logger.info(`🚩 [AdminPrayerService] Flagged ${result.modifiedCount} prayers`);

      return {
        flagged: result.modifiedCount,
        failed: prayerIds.length - result.modifiedCount,
      };
    } catch (error) {
      logger.error(`❌ [AdminPrayerService] bulkFlagPrayers error: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get spam detection dashboard data
   */
  static async getSpamDetectionData() {
    try {
      const totalPrayers = await Prayer.countDocuments();
      const flaggedPrayers = await Prayer.countDocuments({ status: 'flagged' });
      const reportedPrayers = await Prayer.countDocuments({
        report_count: { $gt: 0 },
      });

      const recentPrayers = await Prayer.find({ status: 'flagged' })
        .sort({ created_at: -1 })
        .limit(20)
        .lean();

      logger.info('📊 [AdminPrayerService] Fetched spam detection data');

      return {
        totalPrayers,
        flaggedPrayers,
        reportedPrayers,
        recentFlags: recentPrayers,
        stats: {
          flagPercentage: ((flaggedPrayers / totalPrayers) * 100).toFixed(2),
          reportedPercentage: ((reportedPrayers / totalPrayers) * 100).toFixed(2),
        },
      };
    } catch (error) {
      logger.error(`❌ [AdminPrayerService] getSpamDetectionData error: ${error.message}`);
      throw error;
    }
  }

  /**
   * Block user from submitting prayers
   */
  static async blockUser(userId, reason, durationDays = 30) {
    try {
      const unblockDate = new Date();
      unblockDate.setDate(unblockDate.getDate() + durationDays);

      const result = await User.findByIdAndUpdate(
        userId,
        {
          $set: {
            prayer_blocked: true,
            prayer_block_reason: reason,
            prayer_block_until: unblockDate,
          },
        },
        { new: true }
      );

      logger.info(`🚫 [AdminPrayerService] Blocked user ${userId} from prayers until ${unblockDate}`);

      return {
        userId,
        blocked: true,
        unblockDate,
        reason,
      };
    } catch (error) {
      logger.error(`❌ [AdminPrayerService] blockUser error: ${error.message}`);
      throw error;
    }
  }

  /**
   * Unblock user from prayers
   */
  static async unblockUser(userId) {
    try {
      const result = await User.findByIdAndUpdate(
        userId,
        {
          $set: {
            prayer_blocked: false,
            prayer_block_reason: null,
            prayer_block_until: null,
          },
        },
        { new: true }
      );

      logger.info(`✅ [AdminPrayerService] Unblocked user ${userId}`);

      return {
        userId,
        blocked: false,
      };
    } catch (error) {
      logger.error(`❌ [AdminPrayerService] unblockUser error: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get compliance report
   */
  static async getComplianceReport(dateRange = 'week') {
    try {
      const now = new Date();
      let from = new Date();

      switch (dateRange) {
        case 'day':
          from.setDate(from.getDate() - 1);
          break;
        case 'week':
          from.setDate(from.getDate() - 7);
          break;
        case 'month':
          from.setMonth(from.getMonth() - 1);
          break;
        case 'year':
          from.setFullYear(from.getFullYear() - 1);
          break;
        default:
          from.setDate(from.getDate() - 7);
      }

      const totalPrayers = await Prayer.countDocuments({
        created_at: { $gte: from, $lte: now },
      });

      const approvedPrayers = await Prayer.countDocuments({
        status: 'approved',
        created_at: { $gte: from, $lte: now },
      });

      const rejectedPrayers = await Prayer.countDocuments({
        status: 'rejected',
        created_at: { $gte: from, $lte: now },
      });

      const flaggedPrayers = await Prayer.countDocuments({
        status: 'flagged',
        created_at: { $gte: from, $lte: now },
      });

      logger.info(`📋 [AdminPrayerService] Generated compliance report for ${dateRange}`);

      return {
        dateRange,
        from,
        to: now,
        totalPrayers,
        approvedPrayers,
        rejectedPrayers,
        flaggedPrayers,
        pendingPrayers: totalPrayers - approvedPrayers - rejectedPrayers - flaggedPrayers,
        stats: {
          approvalRate: ((approvedPrayers / totalPrayers) * 100).toFixed(2),
          rejectionRate: ((rejectedPrayers / totalPrayers) * 100).toFixed(2),
          flagRate: ((flaggedPrayers / totalPrayers) * 100).toFixed(2),
        },
      };
    } catch (error) {
      logger.error(`❌ [AdminPrayerService] getComplianceReport error: ${error.message}`);
      throw error;
    }
  }

  /**
   * Export prayers for compliance
   */
  static async exportPrayersForCompliance(dateRange = 'month', format = 'json') {
    try {
      const now = new Date();
      let from = new Date();

      switch (dateRange) {
        case 'week':
          from.setDate(from.getDate() - 7);
          break;
        case 'month':
          from.setMonth(from.getMonth() - 1);
          break;
        case 'year':
          from.setFullYear(from.getFullYear() - 1);
          break;
        default:
          from.setMonth(from.getMonth() - 1);
      }

      const prayers = await Prayer.find({
        created_at: { $gte: from, $lte: now },
      })
        .select('prayer_id campaign_id supporter_id type content status created_at')
        .lean();

      logger.info(`📤 [AdminPrayerService] Exporting ${prayers.length} prayers as ${format}`);

      if (format === 'csv') {
        const parser = new Parser();
        return parser.parse(prayers);
      }

      return {
        format: 'json',
        dateRange,
        from,
        to: now,
        count: prayers.length,
        data: prayers,
      };
    } catch (error) {
      logger.error(`❌ [AdminPrayerService] exportPrayersForCompliance error: ${error.message}`);
      throw error;
    }
  }
}

module.exports = AdminPrayerService;
