/**
 * AdminDashboardController
 *
 * Handles all admin dashboard endpoints for monitoring, moderation, and financial tracking.
 * Provides comprehensive platform overview, campaign moderation tools, transaction verification,
 * and complete audit trail access for compliance.
 *
 * Endpoints:
 * - GET /admin/dashboard - Platform health overview
 * - GET /admin/campaigns - Campaign moderation and flagging
 * - GET /admin/transactions - Financial transaction verification
 * - GET /admin/audit-logs - Complete audit trail
 * - POST /admin/campaigns/:id/flag - Flag campaign for review
 * - POST /admin/campaigns/:id/suspend - Suspend campaign
 * - POST /admin/transactions/:id/verify - Verify transaction
 * - POST /admin/transactions/:id/reject - Reject suspicious transaction
 */

const winstonLogger = require('../utils/winstonLogger');
const logger = winstonLogger;
const AdminDashboardService = require('../services/AdminDashboardService');

class AdminDashboardController {
  /**
   * GET /admin/dashboard
   * Returns comprehensive platform health overview
   *
   * Query params:
   * - period: "today" | "week" | "month" (default: "today")
   *
   * Returns:
   * {
   *   platformHealth: {
   *     activeCampaigns: number,
   *     dailyTransactionVolume: number,
   *     platformFees: number,
   *     uptime: number (percentage),
   *     activeUsers: number
   *   },
   *   recentEvents: {
   *     newCampaigns: [{id, title, creatorId, createdAt}],
   *     largeDonations: [{id, amount, campaignId, donorId}],
   *     suspiciousActivities: [{id, type, description, flaggedAt}],
   *     newUsers: [{id, email, createdAt}]
   *   },
   *   alerts: {
   *     sweepstakes: {nextDrawing: date, daysUntil: number},
   *     issues: [{type, count, severity}],
   *     actionsNeeded: [{action, count, priority}]
   *   }
   * }
   */
  static async getDashboard(req, res) {
    try {
      logger.info('[AdminDashboard] GET dashboard');

      const { period = 'today' } = req.query;

      // Validate period parameter
      const validPeriods = ['today', 'week', 'month'];
      if (!validPeriods.includes(period)) {
        return res.status(400).json({
          success: false,
          error: 'INVALID_PERIOD',
          message: `Period must be one of: ${validPeriods.join(', ')}`
        });
      }

      const dashboard = await AdminDashboardService.getDashboardOverview(period);

      logger.info('[AdminDashboard] Dashboard retrieved successfully');
      return res.json({
        success: true,
        data: dashboard
      });
    } catch (error) {
      logger.error('[AdminDashboard] Error retrieving dashboard', error);
      return res.status(500).json({
        success: false,
        error: 'DASHBOARD_ERROR',
        message: 'Failed to retrieve dashboard'
      });
    }
  }

  /**
   * GET /admin/campaigns
   * Returns paginated list of campaigns with moderation tools
   *
   * Query params:
   * - page: number (default: 1)
   * - limit: number (default: 20, max: 100)
   * - status: "draft" | "active" | "paused" | "completed" | "suspended"
   * - needType: string
   * - flagged: boolean (true = show flagged only)
   * - sort: "createdAt" | "supporters" | "amount" (default: "createdAt")
   * - order: "asc" | "desc"
   *
   * Returns:
   * {
   *   campaigns: [
   *     {
   *       id, title, description, status, creatorId, targetAmount,
   *       currentAmount, supporters, createdAt, isFlagged, flagReasons,
   *       canFlag, canSuspend, canEdit, canDelete
   *     }
   *   ],
   *   pagination: {page, limit, total, pages}
   * }
   */
  static async getCampaigns(req, res) {
    try {
      logger.info('[AdminDashboard] GET campaigns');

      const {
        page = 1,
        limit = 20,
        status,
        needType,
        flagged = false,
        sort = 'createdAt',
        order = 'desc'
      } = req.query;

      // Validate pagination
      const pageNum = Math.max(1, parseInt(page) || 1);
      const limitNum = Math.min(100, Math.max(1, parseInt(limit) || 20));

      // Build filter
      const filters = {};
      if (status) filters.status = status;
      if (needType) filters.needType = needType;
      if (flagged === 'true') filters.isFlagged = true;

      // Validate sort
      const validSorts = ['createdAt', 'supporters', 'amount'];
      const sortField = validSorts.includes(sort) ? sort : 'createdAt';
      const sortOrder = order === 'asc' ? 1 : -1;

      const result = await AdminDashboardService.getCampaignsForModeration(
        filters,
        { page: pageNum, limit: limitNum, sort: sortField, order: sortOrder }
      );

      logger.info('[AdminDashboard] Campaigns retrieved', { count: result.campaigns.length });
      return res.json({
        success: true,
        data: result.campaigns,
        pagination: result.pagination
      });
    } catch (error) {
      logger.error('[AdminDashboard] Error retrieving campaigns', error);
      return res.status(500).json({
        success: false,
        error: 'CAMPAIGNS_ERROR',
        message: 'Failed to retrieve campaigns'
      });
    }
  }

  /**
   * GET /admin/transactions
   * Returns paginated list of transactions with verification tools
   *
   * Query params:
   * - page: number (default: 1)
   * - limit: number (default: 20)
   * - status: "pending" | "verified" | "rejected" | "completed"
   * - campaign: campaignId (filter by campaign)
   * - supporter: userId (filter by supporter)
   * - minAmount: number
   * - maxAmount: number
   * - suspicious: boolean
   *
   * Returns:
   * {
   *   transactions: [
   *     {
   *       id, campaignId, supporterId, amount, type, status,
   *       createdAt, isSuspicious, riskScore, verifiedBy, verifiedAt,
   *       canVerify, canReject, canUndo
   *     }
   *   ],
   *   pagination: {page, limit, total, pages},
   *   summary: {
   *     totalAmount, verifiedAmount, suspiciousCount, failedCount
   *   }
   * }
   */
  static async getTransactions(req, res) {
    try {
      logger.info('[AdminDashboard] GET transactions');

      const {
        page = 1,
        limit = 20,
        status,
        campaign,
        supporter,
        minAmount,
        maxAmount,
        suspicious = false
      } = req.query;

      const pageNum = Math.max(1, parseInt(page) || 1);
      const limitNum = Math.min(100, Math.max(1, parseInt(limit) || 20));

      // Build filter
      const filters = {};
      if (status) filters.status = status;
      if (campaign) filters.campaignId = campaign;
      if (supporter) filters.supporterId = supporter;
      if (suspicious === 'true') filters.isSuspicious = true;
      if (minAmount) filters.minAmount = parseInt(minAmount);
      if (maxAmount) filters.maxAmount = parseInt(maxAmount);

      const result = await AdminDashboardService.getTransactionsForVerification(
        filters,
        { page: pageNum, limit: limitNum }
      );

      logger.info('[AdminDashboard] Transactions retrieved', { count: result.transactions.length });
      return res.json({
        success: true,
        data: result.transactions,
        pagination: result.pagination,
        summary: result.summary
      });
    } catch (error) {
      logger.error('[AdminDashboard] Error retrieving transactions', error);
      return res.status(500).json({
        success: false,
        error: 'TRANSACTIONS_ERROR',
        message: 'Failed to retrieve transactions'
      });
    }
  }

  /**
   * GET /admin/audit-logs
   * Returns immutable audit trail of all admin actions
   *
   * Query params:
   * - page: number (default: 1)
   * - limit: number (default: 50)
   * - admin: userId
   * - action: string (flag, suspend, verify, reject, etc.)
   * - target: id (campaign, transaction, or user id)
   * - startDate: ISO date
   * - endDate: ISO date
   *
   * Returns:
   * {
   *   logs: [
   *     {
   *       id, adminId, adminName, action, targetType, targetId,
   *       details, timestamp, ipAddress, userAgent
   *     }
   *   ],
   *   pagination: {page, limit, total, pages},
   *   summary: {totalActions, actionBreakdown}
   * }
   */
  static async getAuditLogs(req, res) {
    try {
      logger.info('[AdminDashboard] GET audit-logs');

      const {
        page = 1,
        limit = 50,
        admin,
        action,
        target,
        startDate,
        endDate
      } = req.query;

      const pageNum = Math.max(1, parseInt(page) || 1);
      const limitNum = Math.min(200, Math.max(1, parseInt(limit) || 50));

      // Build filter
      const filters = {};
      if (admin) filters.adminId = admin;
      if (action) filters.action = action;
      if (target) filters.targetId = target;
      if (startDate || endDate) {
        filters.dateRange = {};
        if (startDate) {
          try {
            filters.dateRange.start = new Date(startDate);
          } catch (e) {
            return res.status(400).json({
              success: false,
              error: 'INVALID_DATE',
              message: 'Invalid startDate format'
            });
          }
        }
        if (endDate) {
          try {
            filters.dateRange.end = new Date(endDate);
          } catch (e) {
            return res.status(400).json({
              success: false,
              error: 'INVALID_DATE',
              message: 'Invalid endDate format'
            });
          }
        }
      }

      const result = await AdminDashboardService.getAuditLogs(
        filters,
        { page: pageNum, limit: limitNum }
      );

      logger.info('[AdminDashboard] Audit logs retrieved', { count: result.logs.length });
      return res.json({
        success: true,
        data: result.logs,
        pagination: result.pagination,
        summary: result.summary
      });
    } catch (error) {
      logger.error('[AdminDashboard] Error retrieving audit logs', error);
      return res.status(500).json({
        success: false,
        error: 'AUDIT_LOGS_ERROR',
        message: 'Failed to retrieve audit logs'
      });
    }
  }

  /**
   * POST /admin/campaigns/:id/flag
   * Flag campaign for review
   *
   * Body:
   * {
   *   reasons: string[] (e.g., ["suspicious_donor", "misleading_description"]),
   *   notes: string (admin notes)
   * }
   *
   * Returns: {success: true, campaign}
   */
  static async flagCampaign(req, res) {
    try {
      logger.info('[AdminDashboard] POST flag campaign', { campaignId: req.params.id });

      const { id } = req.params;
      const { reasons, notes } = req.body;

      // Validate input
      if (!reasons || !Array.isArray(reasons) || reasons.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'INVALID_REASONS',
          message: 'Reasons must be non-empty array'
        });
      }

      const campaign = await AdminDashboardService.flagCampaign(id, {
        reasons,
        notes,
        flaggedBy: req.user.id,
        flaggedAt: new Date()
      });

      if (!campaign) {
        return res.status(404).json({
          success: false,
          error: 'CAMPAIGN_NOT_FOUND',
          message: 'Campaign not found'
        });
      }

      // Log action to audit trail
      await AdminDashboardService.logAuditTrail({
        adminId: req.user.id,
        action: 'flag_campaign',
        targetType: 'campaign',
        targetId: id,
        details: { reasons, notes },
        ipAddress: req.ip,
        userAgent: req.get('user-agent')
      });

      logger.info('[AdminDashboard] Campaign flagged', { campaignId: id });
      return res.json({
        success: true,
        data: campaign
      });
    } catch (error) {
      logger.error('[AdminDashboard] Error flagging campaign', error);
      return res.status(500).json({
        success: false,
        error: 'FLAG_ERROR',
        message: 'Failed to flag campaign'
      });
    }
  }

  /**
   * POST /admin/campaigns/:id/suspend
   * Suspend campaign (prevent new donations/shares)
   *
   * Body:
   * {
   *   reason: string,
   *   duration: number (hours, null = indefinite)
   * }
   *
   * Returns: {success: true, campaign}
   */
  static async suspendCampaign(req, res) {
    try {
      logger.info('[AdminDashboard] POST suspend campaign', { campaignId: req.params.id });

      const { id } = req.params;
      const { reason, duration } = req.body;

      if (!reason) {
        return res.status(400).json({
          success: false,
          error: 'REASON_REQUIRED',
          message: 'Suspension reason required'
        });
      }

      const campaign = await AdminDashboardService.suspendCampaign(id, {
        reason,
        duration,
        suspendedBy: req.user.id,
        suspendedAt: new Date()
      });

      if (!campaign) {
        return res.status(404).json({
          success: false,
          error: 'CAMPAIGN_NOT_FOUND',
          message: 'Campaign not found'
        });
      }

      // Log action
      await AdminDashboardService.logAuditTrail({
        adminId: req.user.id,
        action: 'suspend_campaign',
        targetType: 'campaign',
        targetId: id,
        details: { reason, duration },
        ipAddress: req.ip,
        userAgent: req.get('user-agent')
      });

      logger.info('[AdminDashboard] Campaign suspended', { campaignId: id });
      return res.json({
        success: true,
        data: campaign
      });
    } catch (error) {
      logger.error('[AdminDashboard] Error suspending campaign', error);
      return res.status(500).json({
        success: false,
        error: 'SUSPEND_ERROR',
        message: 'Failed to suspend campaign'
      });
    }
  }

  /**
   * POST /admin/transactions/:id/verify
   * Mark transaction as verified (approved for processing)
   *
   * Body:
   * {
   *   notes: string (optional)
   * }
   *
   * Returns: {success: true, transaction}
   */
  static async verifyTransaction(req, res) {
    try {
      logger.info('[AdminDashboard] POST verify transaction', { transactionId: req.params.id });

      const { id } = req.params;
      const { notes } = req.body;

      const transaction = await AdminDashboardService.verifyTransaction(id, {
        verifiedBy: req.user.id,
        verifiedAt: new Date(),
        notes
      });

      if (!transaction) {
        return res.status(404).json({
          success: false,
          error: 'TRANSACTION_NOT_FOUND',
          message: 'Transaction not found'
        });
      }

      // Log action
      await AdminDashboardService.logAuditTrail({
        adminId: req.user.id,
        action: 'verify_transaction',
        targetType: 'transaction',
        targetId: id,
        details: { notes },
        ipAddress: req.ip,
        userAgent: req.get('user-agent')
      });

      logger.info('[AdminDashboard] Transaction verified', { transactionId: id });
      return res.json({
        success: true,
        data: transaction
      });
    } catch (error) {
      logger.error('[AdminDashboard] Error verifying transaction', error);
      return res.status(500).json({
        success: false,
        error: 'VERIFY_ERROR',
        message: 'Failed to verify transaction'
      });
    }
  }

  /**
   * POST /admin/transactions/:id/reject
   * Mark transaction as rejected (fraud/suspicious)
   *
   * Body:
   * {
   *   reason: string (required),
   *   notes: string (optional),
   *   refund: boolean (default: true)
   * }
   *
   * Returns: {success: true, transaction}
   */
  static async rejectTransaction(req, res) {
    try {
      logger.info('[AdminDashboard] POST reject transaction', { transactionId: req.params.id });

      const { id } = req.params;
      const { reason, notes, refund = true } = req.body;

      if (!reason) {
        return res.status(400).json({
          success: false,
          error: 'REASON_REQUIRED',
          message: 'Rejection reason required'
        });
      }

      const transaction = await AdminDashboardService.rejectTransaction(id, {
        reason,
        notes,
        refund,
        rejectedBy: req.user.id,
        rejectedAt: new Date()
      });

      if (!transaction) {
        return res.status(404).json({
          success: false,
          error: 'TRANSACTION_NOT_FOUND',
          message: 'Transaction not found'
        });
      }

      // Log action
      await AdminDashboardService.logAuditTrail({
        adminId: req.user.id,
        action: 'reject_transaction',
        targetType: 'transaction',
        targetId: id,
        details: { reason, notes, refund },
        ipAddress: req.ip,
        userAgent: req.get('user-agent')
      });

      logger.info('[AdminDashboard] Transaction rejected', { transactionId: id });
      return res.json({
        success: true,
        data: transaction
      });
    } catch (error) {
      logger.error('[AdminDashboard] Error rejecting transaction', error);
      return res.status(500).json({
        success: false,
        error: 'REJECT_ERROR',
        message: 'Failed to reject transaction'
      });
    }
  }

  /**
   * POST /admin/export/transactions
   * Export transactions to CSV for accounting/audit
   *
   * Query params:
   * - status: transaction status filter
   * - startDate: start date
   * - endDate: end date
   *
   * Returns: CSV file
   */
  static async exportTransactions(req, res) {
    try {
      logger.info('[AdminDashboard] POST export transactions');

      const { status, startDate, endDate } = req.query;

      const filters = {};
      if (status) filters.status = status;
      if (startDate) filters.startDate = new Date(startDate);
      if (endDate) filters.endDate = new Date(endDate);

      const csv = await AdminDashboardService.exportTransactionsToCSV(filters);

      // Log action
      await AdminDashboardService.logAuditTrail({
        adminId: req.user.id,
        action: 'export_transactions',
        targetType: 'system',
        targetId: 'export',
        details: { filters },
        ipAddress: req.ip,
        userAgent: req.get('user-agent')
      });

      res.setHeader('Content-Type', 'text/csv;charset=utf-8;');
      res.setHeader('Content-Disposition', `attachment;filename=transactions_${new Date().toISOString()}.csv`);
      return res.send(csv);
    } catch (error) {
      logger.error('[AdminDashboard] Error exporting transactions', error);
      return res.status(500).json({
        success: false,
        error: 'EXPORT_ERROR',
        message: 'Failed to export transactions'
      });
    }
  }
}

module.exports = AdminDashboardController;
