/**
 * AdminDashboardService
 *
 * Core business logic for admin dashboard functionality including platform monitoring,
 * campaign moderation, transaction verification, and audit trail management.
 */

const winstonLogger = require('../utils/winstonLogger');
const logger = winstonLogger;

class AdminDashboardService {
  /**
   * Get comprehensive platform health overview
   * Aggregates metrics for today, week, or month
   *
   * @param {string} period - "today" | "week" | "month"
   * @returns {Promise<Object>} Dashboard data
   */
  static async getDashboardOverview(period = 'today') {
    try {
      // Calculate date range
      const now = new Date();
      let startDate;

      switch (period) {
        case 'today':
          startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
          break;
        case 'week':
          startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          break;
        case 'month':
          startDate = new Date(now.getFullYear(), now.getMonth(), 1);
          break;
        default:
          startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      }

      const endDate = now;

      // 1. Platform health metrics
      const Campaign = require('../models/Campaign');
      const Transaction = require('../models/Transaction');
      const User = require('../models/User');
      const SweepstakesDrawing = require('../models/SweepstakesDrawing');

      const activeCampaigns = await Campaign.countDocuments({
        status: 'active',
        deletedAt: null
      });

      const transactions = await Transaction.find({
        createdAt: { $gte: startDate, $lte: endDate },
        deletedAt: null
      });

      const dailyTransactionVolume = transactions.length;
      const platformFees = transactions.reduce((total, tx) => {
        const feePercent = 0.05; // 5% platform fee
        return total + Math.round(tx.amount * feePercent);
      }, 0);

      // Uptime: retrieve from monitoring service or database
      // For now, return standard 99.5%
      const uptime = 99.5;

      // Active users in period
      const activeUsers = await User.countDocuments({
        lastActiveAt: { $gte: startDate },
        deletedAt: null
      });

      // 2. Recent events
      const newCampaigns = await Campaign.find({
        createdAt: { $gte: new Date(now.getTime() - 24 * 60 * 60 * 1000) },
        deletedAt: null
      })
        .select('_id title creatorId createdAt')
        .limit(10);

      const largeDonations = await Transaction.find({
        type: 'donation',
        amount: { $gte: 50000 }, // $500+
        createdAt: { $gte: new Date(now.getTime() - 24 * 60 * 60 * 1000) },
        deletedAt: null
      })
        .select('_id amount campaignId supporterId')
        .limit(10);

      // Suspicious activities - transactions marked suspicious
      const suspiciousActivities = await Transaction.find({
        isSuspicious: true,
        flaggedAt: { $gte: startDate },
        deletedAt: null
      })
        .select('_id type description flaggedAt')
        .limit(10);

      // New users last 24h
      const newUsers = await User.find({
        createdAt: { $gte: new Date(now.getTime() - 24 * 60 * 60 * 1000) },
        deletedAt: null
      })
        .select('_id email createdAt')
        .limit(10);

      // 3. Alerts
      const nextDrawing = await SweepstakesDrawing.findOne({
        status: 'scheduled',
        drawingDate: { $gte: now }
      }).sort({ drawingDate: 1 });

      const unclaimedPrizes = await SweepstakesDrawing.countDocuments({
        status: 'notified',
        claimDeadline: { $lt: now }
      });

      const failedEmails = await SweepstakesDrawing.countDocuments({
        'claimAuditTrail': {
          $elemMatch: {
            action: 'email_failed'
          }
        }
      });

      const pendingTransactions = await Transaction.countDocuments({
        status: 'pending',
        deletedAt: null
      });

      return {
        platformHealth: {
          activeCampaigns,
          dailyTransactionVolume,
          platformFees,
          uptime,
          activeUsers
        },
        recentEvents: {
          newCampaigns,
          largeDonations,
          suspiciousActivities,
          newUsers
        },
        alerts: {
          sweepstakes: nextDrawing ? {
            nextDrawing: nextDrawing.drawingDate,
            daysUntil: Math.ceil((nextDrawing.drawingDate - now) / (24 * 60 * 60 * 1000))
          } : null,
          issues: [
            { type: 'unclaimed_prizes', count: unclaimedPrizes, severity: unclaimedPrizes > 0 ? 'warning' : 'info' },
            { type: 'failed_emails', count: failedEmails, severity: failedEmails > 0 ? 'warning' : 'info' }
          ].filter(i => i.count > 0),
          actionsNeeded: [
            { action: 'verify_pending_transactions', count: pendingTransactions, priority: pendingTransactions > 0 ? 'high' : 'low' }
          ]
        }
      };
    } catch (error) {
      logger.error('[AdminService] Error getting dashboard overview', error);
      throw error;
    }
  }

  /**
   * Get campaigns for moderation view
   *
   * @param {Object} filters - Filter criteria
   * @param {Object} options - Pagination and sort options
   * @returns {Promise<Object>} Campaigns with pagination
   */
  static async getCampaignsForModeration(filters, options) {
    try {
      const Campaign = require('../models/Campaign');

      // Build mongo query
      const query = { deletedAt: null };

      if (filters.status) query.status = filters.status;
      if (filters.needType) query.needType = filters.needType;
      if (filters.isFlagged) query.isFlagged = filters.isFlagged;

      const skip = (options.page - 1) * options.limit;
      const sort = {};
      sort[options.sort] = options.order;

      const [campaigns, total] = await Promise.all([
        Campaign.find(query)
          .sort(sort)
          .skip(skip)
          .limit(options.limit),
        Campaign.countDocuments(query)
      ]);

      // Enrich campaigns with action availability
      const enriched = campaigns.map(campaign => ({
        id: campaign._id,
        title: campaign.title,
        description: campaign.description,
        status: campaign.status,
        creatorId: campaign.creatorId,
        targetAmount: campaign.targetAmount,
        currentAmount: campaign.currentAmount,
        supporters: campaign.supporters || [],
        createdAt: campaign.createdAt,
        isFlagged: campaign.isFlagged || false,
        flagReasons: campaign.flagReasons || [],
        canFlag: campaign.status !== 'suspended',
        canSuspend: campaign.status === 'active',
        canEdit: campaign.status === 'draft',
        canDelete: campaign.status === 'draft'
      }));

      return {
        campaigns: enriched,
        pagination: {
          page: options.page,
          limit: options.limit,
          total,
          pages: Math.ceil(total / options.limit)
        }
      };
    } catch (error) {
      logger.error('[AdminService] Error getting campaigns for moderation', error);
      throw error;
    }
  }

  /**
   * Get transactions for verification view
   *
   * @param {Object} filters - Filter criteria
   * @param {Object} options - Pagination options
   * @returns {Promise<Object>} Transactions with pagination and summary
   */
  static async getTransactionsForVerification(filters, options) {
    try {
      const Transaction = require('../models/Transaction');

      const query = { deletedAt: null };

      if (filters.status) query.status = filters.status;
      if (filters.campaignId) query.campaignId = filters.campaignId;
      if (filters.supporterId) query.supporterId = filters.supporterId;
      if (filters.isSuspicious) query.isSuspicious = filters.isSuspicious;

      if (filters.minAmount || filters.maxAmount) {
        query.amount = {};
        if (filters.minAmount) query.amount.$gte = filters.minAmount;
        if (filters.maxAmount) query.amount.$lte = filters.maxAmount;
      }

      const skip = (options.page - 1) * options.limit;

      const [transactions, total] = await Promise.all([
        Transaction.find(query)
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(options.limit),
        Transaction.countDocuments(query)
      ]);

      // Enrich with action availability
      const enriched = transactions.map(tx => ({
        id: tx._id,
        campaignId: tx.campaignId,
        supporterId: tx.supporterId,
        amount: tx.amount,
        type: tx.type,
        status: tx.status,
        createdAt: tx.createdAt,
        isSuspicious: tx.isSuspicious || false,
        riskScore: tx.riskScore || 0,
        verifiedBy: tx.verifiedBy,
        verifiedAt: tx.verifiedAt,
        canVerify: tx.status === 'pending',
        canReject: tx.status === 'pending',
        canUndo: tx.status === 'verified'
      }));

      // Calculate summary
      const summary = {
        totalAmount: transactions.reduce((sum, tx) => sum + tx.amount, 0),
        verifiedAmount: transactions
          .filter(tx => tx.status === 'verified')
          .reduce((sum, tx) => sum + tx.amount, 0),
        suspiciousCount: transactions.filter(tx => tx.isSuspicious).length,
        failedCount: transactions.filter(tx => tx.status === 'rejected').length
      };

      return {
        transactions: enriched,
        pagination: {
          page: options.page,
          limit: options.limit,
          total,
          pages: Math.ceil(total / options.limit)
        },
        summary
      };
    } catch (error) {
      logger.error('[AdminService] Error getting transactions for verification', error);
      throw error;
    }
  }

  /**
   * Get immutable audit logs
   *
   * @param {Object} filters - Filter criteria
   * @param {Object} options - Pagination options
   * @returns {Promise<Object>} Audit logs with pagination and summary
   */
  static async getAuditLogs(filters, options) {
    try {
      const AdminAuditLog = require('../models/AdminAuditLog');

      const query = {};

      if (filters.adminId) query.adminId = filters.adminId;
      if (filters.action) query.action = filters.action;
      if (filters.targetId) query.targetId = filters.targetId;

      if (filters.dateRange) {
        query.timestamp = {};
        if (filters.dateRange.start) query.timestamp.$gte = filters.dateRange.start;
        if (filters.dateRange.end) query.timestamp.$lte = filters.dateRange.end;
      }

      const skip = (options.page - 1) * options.limit;

      const [logs, total] = await Promise.all([
        AdminAuditLog.find(query)
          .sort({ timestamp: -1 })
          .skip(skip)
          .limit(options.limit),
        AdminAuditLog.countDocuments(query)
      ]);

      // Count actions by type for summary
      const actionBreakdown = {};
      logs.forEach(log => {
        actionBreakdown[log.action] = (actionBreakdown[log.action] || 0) + 1;
      });

      return {
        logs,
        pagination: {
          page: options.page,
          limit: options.limit,
          total,
          pages: Math.ceil(total / options.limit)
        },
        summary: {
          totalActions: total,
          actionBreakdown
        }
      };
    } catch (error) {
      logger.error('[AdminService] Error getting audit logs', error);
      throw error;
    }
  }

  /**
   * Flag campaign for review
   *
   * @param {string} campaignId - Campaign ID to flag
   * @param {Object} flagData - Flag details
   * @returns {Promise<Object>} Updated campaign
   */
  static async flagCampaign(campaignId, flagData) {
    try {
      const Campaign = require('../models/Campaign');

      const campaign = await Campaign.findByIdAndUpdate(
        campaignId,
        {
          $set: {
            isFlagged: true,
            flagReasons: flagData.reasons,
            flagNotes: flagData.notes,
            flaggedBy: flagData.flaggedBy,
            flaggedAt: flagData.flaggedAt
          }
        },
        { new: true }
      );

      logger.info('[AdminService] Campaign flagged', { campaignId, reasons: flagData.reasons });
      return campaign;
    } catch (error) {
      logger.error('[AdminService] Error flagging campaign', error);
      throw error;
    }
  }

  /**
   * Suspend campaign (prevent new donations/shares)
   *
   * @param {string} campaignId - Campaign ID to suspend
   * @param {Object} suspensionData - Suspension details
   * @returns {Promise<Object>} Updated campaign
   */
  static async suspendCampaign(campaignId, suspensionData) {
    try {
      const Campaign = require('../models/Campaign');

      // Calculate suspension end date if duration provided
      const suspensionEnd = suspensionData.duration
        ? new Date(Date.now() + suspensionData.duration * 60 * 60 * 1000)
        : null;

      const campaign = await Campaign.findByIdAndUpdate(
        campaignId,
        {
          $set: {
            status: 'suspended',
            suspensionReason: suspensionData.reason,
            suspendedBy: suspensionData.suspendedBy,
            suspendedAt: suspensionData.suspendedAt,
            suspensionEnd
          }
        },
        { new: true }
      );

      logger.info('[AdminService] Campaign suspended', { campaignId, reason: suspensionData.reason });
      return campaign;
    } catch (error) {
      logger.error('[AdminService] Error suspending campaign', error);
      throw error;
    }
  }

  /**
   * Verify transaction (approve for processing)
   *
   * @param {string} transactionId - Transaction ID
   * @param {Object} verificationData - Verification details
   * @returns {Promise<Object>} Updated transaction
   */
  static async verifyTransaction(transactionId, verificationData) {
    try {
      const Transaction = require('../models/Transaction');

      const transaction = await Transaction.findByIdAndUpdate(
        transactionId,
        {
          $set: {
            status: 'verified',
            verifiedBy: verificationData.verifiedBy,
            verifiedAt: verificationData.verifiedAt,
            verificationNotes: verificationData.notes,
            isSuspicious: false,
            riskScore: 0
          }
        },
        { new: true }
      );

      logger.info('[AdminService] Transaction verified', { transactionId });
      return transaction;
    } catch (error) {
      logger.error('[AdminService] Error verifying transaction', error);
      throw error;
    }
  }

  /**
   * Reject transaction (mark as fraud/suspicious)
   *
   * @param {string} transactionId - Transaction ID
   * @param {Object} rejectionData - Rejection details
   * @returns {Promise<Object>} Updated transaction
   */
  static async rejectTransaction(transactionId, rejectionData) {
    try {
      const Transaction = require('../models/Transaction');

      const transaction = await Transaction.findByIdAndUpdate(
        transactionId,
        {
          $set: {
            status: 'rejected',
            rejectionReason: rejectionData.reason,
            rejectionNotes: rejectionData.notes,
            rejectedBy: rejectionData.rejectedBy,
            rejectedAt: rejectionData.rejectedAt,
            isSuspicious: true,
            shouldRefund: rejectionData.refund
          }
        },
        { new: true }
      );

      // If refund requested, mark for processing
      if (rejectionData.refund) {
        // Trigger refund workflow (delegate to payment service)
        logger.info('[AdminService] Refund requested for rejected transaction', { transactionId });
      }

      logger.info('[AdminService] Transaction rejected', { transactionId, reason: rejectionData.reason });
      return transaction;
    } catch (error) {
      logger.error('[AdminService] Error rejecting transaction', error);
      throw error;
    }
  }

  /**
   * Log admin action to immutable audit trail
   *
   * @param {Object} logData - Audit log data
   * @returns {Promise<Object>} Created log entry
   */
  static async logAuditTrail(logData) {
    try {
      const AdminAuditLog = require('../models/AdminAuditLog');
      const User = require('../models/User');

      // Get admin name for logging
      const admin = await User.findById(logData.adminId).select('firstName lastName email');

      const log = new AdminAuditLog({
        adminId: logData.adminId,
        adminName: admin ? `${admin.firstName} ${admin.lastName}` : 'Unknown',
        adminEmail: admin ? admin.email : '',
        action: logData.action,
        targetType: logData.targetType,
        targetId: logData.targetId,
        details: logData.details,
        timestamp: new Date(),
        ipAddress: logData.ipAddress,
        userAgent: logData.userAgent,
        // Immutable flag - cannot be modified or deleted
        isImmutable: true
      });

      await log.save();

      logger.info('[AdminService] Audit log recorded', {
        action: logData.action,
        targetType: logData.targetType,
        targetId: logData.targetId
      });

      return log;
    } catch (error) {
      logger.error('[AdminService] Error logging audit trail', error);
      throw error;
    }
  }

  /**
   * Export transactions to CSV format
   *
   * @param {Object} filters - Filter criteria for export
   * @returns {Promise<string>} CSV string
   */
  static async exportTransactionsToCSV(filters) {
    try {
      const Transaction = require('../models/Transaction');

      const query = { deletedAt: null };
      if (filters.status) query.status = filters.status;
      if (filters.startDate || filters.endDate) {
        query.createdAt = {};
        if (filters.startDate) query.createdAt.$gte = filters.startDate;
        if (filters.endDate) query.createdAt.$lte = filters.endDate;
      }

      const transactions = await Transaction.find(query).sort({ createdAt: -1 });

      // Build CSV header
      const headers = [
        'Transaction ID',
        'Campaign ID',
        'Supporter ID',
        'Amount (cents)',
        'Amount (dollars)',
        'Type',
        'Status',
        'Verified By',
        'Verified At',
        'Created At',
        'Is Suspicious'
      ];

      // Build CSV rows
      const rows = transactions.map(tx => [
        tx._id.toString(),
        tx.campaignId.toString(),
        tx.supporterId.toString(),
        tx.amount,
        (tx.amount / 100).toFixed(2),
        tx.type,
        tx.status,
        tx.verifiedBy ? tx.verifiedBy.toString() : '',
        tx.verifiedAt ? tx.verifiedAt.toISOString() : '',
        tx.createdAt.toISOString(),
        tx.isSuspicious ? 'Yes' : 'No'
      ]);

      // Combine headers and rows
      const csv = [
        headers.join(','),
        ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
      ].join('\n');

      return csv;
    } catch (error) {
      logger.error('[AdminService] Error exporting transactions to CSV', error);
      throw error;
    }
  }
}

module.exports = AdminDashboardService;
