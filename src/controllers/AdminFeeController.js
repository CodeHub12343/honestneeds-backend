const FeeTrackingService = require('../services/FeeTrackingService');
const mongoose = require('mongoose');

/**
 * Admin Fee Controller
 * Handles admin fee dashboard, settlement, and analytics
 */
class AdminFeeController {
  /**
   * GET /admin/fees/dashboard
   * Get complete fee dashboard data for admin
   */
  static async getFeesDashboard(req, res) {
    try {
      const { startDate, endDate, status } = req.query;

      // Validate admin
      if (!req.isAdmin) {
        return res.status(403).json({
          success: false,
          error: 'FORBIDDEN',
          message: 'Only admins can access fee dashboard'
        });
      }

      const dashboardData = await FeeTrackingService.getFeesDashboard({
        startDate,
        endDate,
        status
      });

      if (!dashboardData.success) {
        return res.status(500).json({
          success: false,
          error: 'DASHBOARD_FAILED',
          message: 'Failed to load dashboard'
        });
      }

      res.status(200).json(dashboardData);
    } catch (error) {
      console.error('Get fees dashboard error:', error);
      res.status(500).json({
        success: false,
        error: 'INTERNAL_ERROR',
        message: 'Internal server error'
      });
    }
  }

  /**
   * GET /admin/fees/outstanding
   * Get outstanding fees pending settlement
   */
  static async getOutstandingFees(req, res) {
    try {
      // Validate admin
      if (!req.isAdmin) {
        return res.status(403).json({
          success: false,
          error: 'FORBIDDEN',
          message: 'Only admins can access fee data'
        });
      }

      const result = await FeeTrackingService.getOutstandingFees();

      if (!result.success) {
        return res.status(500).json({
          success: false,
          error: 'FETCH_FAILED',
          message: 'Failed to fetch outstanding fees'
        });
      }

      res.status(200).json(result);
    } catch (error) {
      console.error('Get outstanding fees error:', error);
      res.status(500).json({
        success: false,
        error: 'INTERNAL_ERROR',
        message: 'Internal server error'
      });
    }
  }

  /**
   * POST /admin/fees/settle
   * Initiate fee settlement for a period
   *
   * @param {Object} req.body
   * @param {string} period - Period in format "YYYY-MM" (e.g., "2024-06")
   * @param {string} reason - Reason for settlement
   */
  static async settleFees(req, res) {
    try {
      // Validate admin
      if (!req.isAdmin) {
        return res.status(403).json({
          success: false,
          error: 'FORBIDDEN',
          message: 'Only admins can settle fees'
        });
      }

      const { period, reason } = req.body;

      // Validate input
      if (!period) {
        return res.status(400).json({
          success: false,
          error: 'MISSING_PERIOD',
          message: 'Period is required (format: YYYY-MM)'
        });
      }

      // Validate period format
      if (!/^\d{4}-\d{2}$/.test(period)) {
        return res.status(400).json({
          success: false,
          error: 'INVALID_PERIOD_FORMAT',
          message: 'Period must be in format YYYY-MM'
        });
      }

      const result = await FeeTrackingService.settleFees({
        adminId: req.user._id,
        period,
        reason: reason || 'Manual settlement'
      });

      if (!result.success) {
        return res.status(400).json({
          success: false,
          error: result.error,
          message: result.message
        });
      }

      res.status(200).json({
        success: true,
        data: result.data,
        message: `Successfully settled fees for ${period}`
      });
    } catch (error) {
      console.error('Settle fees error:', error);
      res.status(500).json({
        success: false,
        error: 'SETTLEMENT_FAILED',
        message: 'Failed to settle fees'
      });
    }
  }

  /**
   * GET /admin/fees/settlement-history
   * Get history of fee settlements
   */
  static async getSettlementHistory(req, res) {
    try {
      // Validate admin
      if (!req.isAdmin) {
        return res.status(403).json({
          success: false,
          error: 'FORBIDDEN',
          message: 'Only admins can view settlement history'
        });
      }

      const { page = 1, limit = 20 } = req.query;

      // Enforce limit maximum
      const actualLimit = Math.min(parseInt(limit), 100);

      const result = await FeeTrackingService.getSettlementHistory({
        page: parseInt(page),
        limit: actualLimit
      });

      if (!result.success) {
        return res.status(500).json({
          success: false,
          error: 'FETCH_FAILED',
          message: 'Failed to fetch settlement history'
        });
      }

      res.status(200).json(result);
    } catch (error) {
      console.error('Get settlement history error:', error);
      res.status(500).json({
        success: false,
        error: 'INTERNAL_ERROR',
        message: 'Internal server error'
      });
    }
  }

  /**
   * GET /admin/fees/report
   * Generate detailed fee report for a period
   */
  static async generateFeeReport(req, res) {
    try {
      // Validate admin
      if (!req.isAdmin) {
        return res.status(403).json({
          success: false,
          error: 'FORBIDDEN',
          message: 'Only admins can generate reports'
        });
      }

      const { startDate, endDate, format = 'json' } = req.query;

      if (!startDate || !endDate) {
        return res.status(400).json({
          success: false,
          error: 'MISSING_DATES',
          message: 'startDate and endDate are required'
        });
      }

      // Get dashboard data for period
      const dashboardData = await FeeTrackingService.getFeesDashboard({
        startDate,
        endDate
      });

      if (!dashboardData.success) {
        return res.status(500).json({
          success: false,
          error: 'REPORT_FAILED',
          message: 'Failed to generate report'
        });
      }

      // Format report based on request
      if (format === 'csv') {
        return res.status(200)
          .header('Content-Type', 'text/csv')
          .header('Content-Disposition', 'attachment; filename="fee-report.csv"')
          .send(this._formatAsCSV(dashboardData));
      }

      res.status(200).json({
        success: true,
        data: dashboardData.data,
        report_period: { start: startDate, end: endDate },
        generated_at: new Date()
      });
    } catch (error) {
      console.error('Generate fee report error:', error);
      res.status(500).json({
        success: false,
        error: 'INTERNAL_ERROR',
        message: 'Internal server error'
      });
    }
  }

  /**
   * GET /admin/fees/audit-trail/:transactionId
   * Get audit trail for a specific fee transaction
   */
  static async getFeeAuditTrail(req, res) {
    try {
      // Validate admin
      if (!req.isAdmin) {
        return res.status(403).json({
          success: false,
          error: 'FORBIDDEN',
          message: 'Only admins can view audit trails'
        });
      }

      const { transactionId } = req.params;

      const FeeTransaction = require('../models/FeeTransaction');
      const feeTransaction = await FeeTransaction.findOne({ transaction_id: transactionId });

      if (!feeTransaction) {
        return res.status(404).json({
          success: false,
          error: 'NOT_FOUND',
          message: 'Fee transaction not found'
        });
      }

      res.status(200).json({
        success: true,
        data: {
          transaction_id: feeTransaction.transaction_id,
          campaign_id: feeTransaction.campaign_id,
          gross_amount_dollars: (feeTransaction.gross_amount_cents / 100).toFixed(2),
          platform_fee_dollars: (feeTransaction.platform_fee_cents / 100).toFixed(2),
          status: feeTransaction.status,
          created_at: feeTransaction.created_at,
          verified_at: feeTransaction.verified_at,
          settled_at: feeTransaction.settled_at,
          audit_trail: feeTransaction.notes || []
        }
      });
    } catch (error) {
      console.error('Get fee audit trail error:', error);
      res.status(500).json({
        success: false,
        error: 'INTERNAL_ERROR',
        message: 'Internal server error'
      });
    }
  }

  /**
   * Format dashboard data as CSV
   * @private
   */
  static _formatAsCSV(dashboardData) {
    const { summary, by_status, top_campaigns } = dashboardData.data;
    let csv = 'Fee Report\n\n';

    csv += 'SUMMARY\n';
    csv += 'Total Fees Collected,$' + summary.total_fees_collected_dollars + '\n';
    csv += 'Total Gross Amount,$' + summary.total_gross_amount_dollars + '\n';
    csv += 'Total Transactions,' + summary.total_transactions + '\n';
    csv += 'Average Donation,' + (summary.average_donation_cents / 100).toFixed(2) + '\n\n';

    csv += 'BY STATUS\n';
    csv += 'Pending,$' + by_status.pending_dollars + ' (' + by_status.pending_count + ' transactions)\n';
    csv += 'Verified,$' + by_status.verified_dollars + ' (' + by_status.verified_count + ' transactions)\n';
    csv += 'Unverified,$' + by_status.unverified_dollars + ' (' + by_status.unverified_count + ' transactions)\n\n';

    csv += 'TOP CAMPAIGNS\n';
    csv += 'Campaign,Fees,Gross,Donations\n';
    top_campaigns.forEach(campaign => {
      csv += `"${campaign.title}","$${campaign.total_fees_dollars}","$${campaign.total_gross_dollars}",${campaign.donation_count}\n`;
    });

    return csv;
  }
}

module.exports = AdminFeeController;
