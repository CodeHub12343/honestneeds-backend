const express = require('express');
const TransactionController = require('../controllers/TransactionController');
const { authenticate, authorize } = require('../middleware/authMiddleware');
const { validateInput } = require('../middleware/validation');

const router = express.Router();

/**
 * Transaction Donation Routes
 * Public routes for users to record donations
 */

/**
 * POST /donations/:campaignId
 * Record a new donation for a campaign
 * 
 * @param {string} campaignId - Campaign MongoDB ID
 * @body {number} amount - Donation amount in dollars (1-10000)
 * @body {string} payment_method - Payment method (paypal, stripe, etc)
 * @body {string} proof_url - Optional proof URL
 * @returns {201} Transaction created
 * @returns {400} Invalid input
 * @returns {409} Campaign not active
 */
router.post(
  '/donations/:campaignId',
  authenticate,
  validateInput('donation'),
  TransactionController.recordDonation
);

/**
 * Transaction Query Routes
 * User-specific routes for viewing transactions
 */

/**
 * GET /transactions
 * Get user's transaction history with pagination
 * 
 * @query {number} page - Page number (default: 1)
 * @query {number} limit - Results per page (max: 50, default: 10)
 * @returns {200} Array of transactions
 * @returns {400} Invalid pagination
 */
router.get(
  '/transactions',
  authenticate,
  TransactionController.getUserTransactions
);

/**
 * Admin Transaction Routes
 * Protected routes for admin transaction management
 */

/**
 * GET /admin/transactions
 * Get all transactions (admin only)
 * 
 * @query {number} page - Page number (default: 1)
 * @query {number} limit - Results per page (max: 100, default: 20)
 * @query {string} status - Filter by status (pending, verified, failed, refunded)
 * @query {string} campaign_id - Filter by campaign
 * @query {string} start_date - ISO date filter
 * @query {string} end_date - ISO date filter
 * @returns {200} Array of transactions
 * @returns {401} Unauthorized
 * @returns {403} Forbidden (not admin)
 * @returns {400} Invalid query parameters
 */
router.get(
  '/admin/transactions',
  authenticate,
  authorize('admin'),
  TransactionController.getAllTransactions
);

/**
 * GET /admin/transactions/:id
 * Get single transaction details (admin only)
 * 
 * @param {string} id - Transaction MongoDB ID
 * @returns {200} Transaction details with full audit trail
 * @returns {401} Unauthorized
 * @returns {403} Forbidden
 * @returns {404} Transaction not found
 */
router.get(
  '/admin/transactions/:id',
  authenticate,
  authorize('admin'),
  TransactionController.getTransaction
);

/**
 * POST /admin/transactions/:id/verify
 * Verify a pending transaction (admin only)
 * Transitions transaction from pending to verified
 * 
 * @param {string} id - Transaction MongoDB ID
 * @returns {200} Verified transaction
 * @returns {401} Unauthorized
 * @returns {403} Forbidden
 * @returns {404} Transaction not found
 * @returns {409} Cannot verify non-pending transaction
 */
router.post(
  '/admin/transactions/:id/verify',
  authenticate,
  authorize('admin'),
  TransactionController.verifyTransaction
);

/**
 * POST /admin/transactions/:id/reject
 * Reject a pending transaction (admin only)
 * Transitions transaction from pending to failed
 * Reverts campaign metrics and sweepstakes entries
 * 
 * @param {string} id - Transaction MongoDB ID
 * @body {string} reason - Rejection reason (required)
 * @returns {200} Rejected transaction
 * @returns {400} Missing rejection reason
 * @returns {401} Unauthorized
 * @returns {403} Forbidden
 * @returns {404} Transaction not found
 * @returns {409} Cannot reject non-pending transaction
 */
router.post(
  '/admin/transactions/:id/reject',
  authenticate,
  authorize('admin'),
  validateInput('rejection'),
  TransactionController.rejectTransaction
);

/**
 * GET /admin/transactions/stats/:campaignId
 * Get transaction statistics for a campaign (admin only)
 * 
 * @param {string} campaignId - Campaign MongoDB ID
 * @returns {200} Statistics object with totals and breakdown by status
 * @returns {401} Unauthorized
 * @returns {403} Forbidden
 * @returns {404} Campaign not found
 */
router.get(
  '/admin/transactions/stats/:campaignId',
  authenticate,
  authorize('admin'),
  TransactionController.getTransactionStats
);

/**
 * Settlement Routes
 * Admin-only endpoints for initiating fee settlements
 */

/**
 * GET /admin/settlements
 * Get settlement history and ledger (admin only)
 * 
 * @query {number} page - Page number (default: 1)
 * @query {number} limit - Results per page (default: 20, max: 100)
 * @query {string} status - Filter by status (pending, completed, failed)
 * @query {string} startDate - Filter by date range (ISO 8601)
 * @query {string} endDate - Filter by date range (ISO 8601)
 * @returns {200} Settlement ledger entries with pagination
 * @returns {401} Unauthorized
 * @returns {403} Forbidden (not admin)
 */
router.get(
  '/admin/settlements',
  authenticate,
  authorize('admin'),
  async (req, res) => {
    try {
      const FeeTrackingService = require('../services/FeeTrackingService');
      const { page = 1, limit = 20, status, startDate, endDate } = req.query;

      // Enforce limit maximum
      const actualLimit = Math.min(parseInt(limit), 100);

      const result = await FeeTrackingService.getSettlementHistory({
        page: parseInt(page),
        limit: actualLimit,
        status,
        startDate,
        endDate
      });

      if (!result.success) {
        return res.status(500).json({
          success: false,
          error: 'FETCH_FAILED',
          message: 'Failed to fetch settlement history'
        });
      }

      res.status(200).json({
        success: true,
        message: 'Settlement history retrieved',
        ...result.data
      });
    } catch (error) {
      console.error('Get settlements error:', error);
      res.status(500).json({
        success: false,
        error: 'INTERNAL_ERROR',
        message: 'Failed to retrieve settlement history'
      });
    }
  }
);

/**
 * POST /admin/settlements
 * Process and initiate a fee settlement for a period (admin only)
 * This endpoint triggers the settlement of verified fees for the specified period
 * 
 * @param {string} period - Settlement period in format YYYY-MM (e.g., "2026-03")
 * @param {string} reason - Optional reason/note for settlement
 * @param {string} payout_method - Payout method: 'manual', 'stripe', 'bank_transfer', 'other' (default: 'manual')
 * @param {object} payout_details - Optional payout details (account_id, reference_number, bank_account)
 * 
 * @returns {200} Settlement initiated successfully
 * @returns {400} Invalid period format or no fees to settle
 * @returns {401} Unauthorized
 * @returns {403} Forbidden (not admin)
 * @returns {409} Conflict (settlement already exists for period)
 * 
 * @example
 * POST /admin/settlements
 * Authorization: Bearer {adminToken}
 * Content-Type: application/json
 * {
 *   "period": "2026-03",
 *   "reason": "Monthly settlement",
 *   "payout_method": "stripe",
 *   "payout_details": {
 *     "account_id": "stripe_acct_123",
 *     "reference_number": "SETTLE-2026-03-001"
 *   }
 * }
 * 
 * Response 200:
 * {
 *   "success": true,
 *   "message": "Settlement processed successfully for 2026-03",
 *   "data": {
 *     "settlement_id": "507f1f77bcf86cd799439011",
 *     "period": "2026-03",
 *     "total_settled_dollars": "150.00",
 *     "fee_count": 12,
 *     "settled_at": "2026-04-05T14:30:00Z"
 *   }
 * }
 */
router.post(
  '/admin/settlements',
  authenticate,
  authorize('admin'),
  validateInput('settlement'),
  async (req, res) => {
    try {
      const FeeTrackingService = require('../services/FeeTrackingService');
      const { period, reason, payout_method = 'manual', payout_details } = req.body;

      // Validate period format
      if (!period || !/^\d{4}-\d{2}$/.test(period)) {
        return res.status(400).json({
          success: false,
          error: 'INVALID_PERIOD',
          message: 'Period must be in format YYYY-MM (e.g., 2026-03)',
          statusCode: 400
        });
      }

      // Validate payout_method if provided
      const validPayoutMethods = ['manual', 'stripe', 'bank_transfer', 'other'];
      if (payout_method && !validPayoutMethods.includes(payout_method)) {
        return res.status(400).json({
          success: false,
          error: 'INVALID_PAYOUT_METHOD',
          message: `Payout method must be one of: ${validPayoutMethods.join(', ')}`,
          statusCode: 400
        });
      }

      // Check if settlement already exists for this period
      const SettlementLedger = require('../models/SettlementLedger');
      const existingSettlement = await SettlementLedger.findOne({ period });
      
      if (existingSettlement) {
        return res.status(409).json({
          success: false,
          error: 'SETTLEMENT_EXISTS',
          message: `Settlement already exists for period ${period}`,
          statusCode: 409,
          data: {
            period,
            existing_settlement_id: existingSettlement._id,
            settled_at: existingSettlement.settled_at,
            status: existingSettlement.status
          }
        });
      }

      // Initiate settlement
      const result = await FeeTrackingService.settleFees({
        adminId: req.user.id,
        period,
        reason: reason || `Settlement for ${period}`,
        payout_method,
        payout_details
      });

      if (!result.success) {
        // Check if error is "no fees to settle"
        if (result.error === 'NO_FEES_TO_SETTLE') {
          return res.status(400).json({
            success: false,
            error: 'NO_FEES_AVAILABLE',
            message: `No verified fees found for period ${period} to settle`,
            statusCode: 400
          });
        }

        return res.status(500).json({
          success: false,
          error: result.error || 'SETTLEMENT_FAILED',
          message: result.message || 'Failed to process settlement',
          statusCode: 500
        });
      }

      // Log settlement action
      const winstonLogger = require('../utils/winstonLogger');
      winstonLogger.info('Settlement processed', {
        adminId: req.user.id,
        period,
        total_settled_cents: result.data.total_settled_cents,
        fee_count: result.data.fee_count,
        payout_method,
        settlement_id: result.data.settlement_id
      });

      res.status(200).json({
        success: true,
        message: `Settlement processed successfully for ${period}`,
        data: result.data,
        statusCode: 200
      });
    } catch (error) {
      console.error('Process settlement error:', error);
      const winstonLogger = require('../utils/winstonLogger');
      winstonLogger.error('Settlement processing failed', {
        error: error.message,
        adminId: req.user.id,
        period: req.body.period,
        stack: error.stack
      });

      res.status(500).json({
        success: false,
        error: 'SETTLEMENT_FAILED',
        message: 'Failed to process settlement',
        statusCode: 500
      });
    }
  }
);

/**
 * GET /admin/settlements/:settlementId
 * Get details of a specific settlement (admin only)
 * 
 * @param {string} settlementId - Settlement ledger ID
 * @returns {200} Settlement details with full ledger entries
 * @returns {401} Unauthorized
 * @returns {403} Forbidden
 * @returns {404} Settlement not found
 */
router.get(
  '/admin/settlements/:settlementId',
  authenticate,
  authorize('admin'),
  async (req, res) => {
    try {
      const SettlementLedger = require('../models/SettlementLedger');
      const settlement = await SettlementLedger.findById(req.params.settlementId)
        .populate('settled_by_admin_id', 'email display_name');

      if (!settlement) {
        return res.status(404).json({
          success: false,
          error: 'NOT_FOUND',
          message: 'Settlement not found',
          statusCode: 404
        });
      }

      res.status(200).json({
        success: true,
        data: {
          id: settlement._id,
          period: settlement.period,
          total_settled_dollars: (settlement.total_fees_cents / 100).toFixed(2),
          total_settled_cents: settlement.total_fees_cents,
          fee_count: settlement.fee_count,
          status: settlement.status,
          payout_method: settlement.payout_method,
          payout_details: settlement.payout_details,
          settled_by: settlement.settled_by_admin_id?.email,
          reason: settlement.reason,
          settled_at: settlement.settled_at,
          verified_at: settlement.verified_at,
          ledger_entries: settlement.ledger_entries
        },
        statusCode: 200
      });
    } catch (error) {
      console.error('Get settlement details error:', error);
      res.status(500).json({
        success: false,
        error: 'INTERNAL_ERROR',
        message: 'Failed to retrieve settlement details',
        statusCode: 500
      });
    }
  }
);

/**
 * Error handling middleware for this router
 */
router.use((error, req, res, next) => {
  console.error('Transaction Route Error:', error);
  
  // Handle validation errors
  if (error.name === 'ValidationError') {
    return res.status(400).json({
      success: false,
      error: 'VALIDATION_FAILED',
      message: error.message,
      details: error.details
    });
  }
  
  // Handle authorization errors
  if (error.name === 'AuthorizationError') {
    return res.status(403).json({
      success: false,
      error: 'FORBIDDEN',
      message: error.message
    });
  }
  
  // Handle not found errors
  if (error.statusCode === 404) {
    return res.status(404).json({
      success: false,
      error: 'NOT_FOUND',
      message: error.message
    });
  }
  
  // Default to 500 error
  res.status(500).json({
    success: false,
    error: 'INTERNAL_ERROR',
    message: 'An internal server error occurred'
  });
});

module.exports = router;
