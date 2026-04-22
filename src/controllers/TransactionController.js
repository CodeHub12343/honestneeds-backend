/**
 * Transaction Controller
 * Handles HTTP endpoints for donation recording and admin verification
 */

const TransactionService = require('../services/TransactionService');
const Transaction = require('../models/Transaction');
const Campaign = require('../models/Campaign');

/**
 * POST /donations/:campaignId
 * Record a donation for a campaign
 */
async function recordDonation(req, res) {
  try {
    const { campaignId } = req.params;
    const userId = req.user?.id; // From auth middleware
    const { amount, payment_method, proof_url } = req.body;

    // Validate input
    if (!amount) {
      return res.status(400).json({ error: 'Amount is required' });
    }

    if (!payment_method) {
      return res.status(400).json({ error: 'Payment method is required' });
    }

    // Record donation
    const result = await TransactionService.recordDonation(
      campaignId,
      userId,
      parseFloat(amount),
      payment_method,
      {
        proofUrl: proof_url,
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
      }
    );

    return res.status(201).json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('recordDonation error:', error.message);

    // Determine status code based on error
    let statusCode = 500;
    if (
      error.message.includes('AMOUNT_INVALID') ||
      error.message.includes('PAYMENT_METHOD') ||
      error.message.includes('NOT_FOUND')
    ) {
      statusCode = 400;
    } else if (error.message.includes('NOT_ACTIVE') || error.message.includes('NOT_ALLOWED')) {
      statusCode = 409;
    } else if (error.message.includes('UNAUTHORIZED')) {
      statusCode = 403;
    }

    return res.status(statusCode).json({
      success: false,
      error: error.message,
    });
  }
}

/**
 * GET /transactions
 * Get user's transactions (paginated)
 */
async function getUserTransactions(req, res) {
  try {
    const userId = req.user?.id; // From auth middleware
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;

    if (page < 1 || limit < 1 || limit > 100) {
      return res.status(400).json({
        error: 'Invalid pagination parameters',
      });
    }

    const result = await TransactionService.getUserTransactions(userId, page, limit);

    return res.status(200).json({
      success: true,
      data: result.transactions,
      pagination: result.pagination,
    });
  } catch (error) {
    console.error('getUserTransactions error:', error.message);
    return res.status(500).json({
      success: false,
      error: 'Failed to retrieve transactions',
    });
  }
}

/**
 * GET /admin/transactions
 * Get all transactions (admin only, paginated)
 */
async function getAllTransactions(req, res) {
  try {
    const adminId = req.user?.id; // From auth middleware
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const status = req.query.status;
    const campaign_id = req.query.campaign_id;
    const start_date = req.query.start_date;
    const end_date = req.query.end_date;

    if (page < 1 || limit < 1 || limit > 100) {
      return res.status(400).json({
        error: 'Invalid pagination parameters',
      });
    }

    // Validate status if provided
    if (status && !['pending', 'verified', 'failed', 'refunded'].includes(status)) {
      return res.status(400).json({
        error: 'Invalid status',
      });
    }

    const result = await TransactionService.getAllTransactions(adminId, {
      page,
      limit,
      status,
      campaign_id,
      start_date,
      end_date,
    });

    return res.status(200).json({
      success: true,
      data: result.transactions,
      pagination: result.pagination,
      filters: result.filters,
    });
  } catch (error) {
    console.error('getAllTransactions error:', error.message);

    if (error.message.includes('UNAUTHORIZED')) {
      return res.status(403).json({
        success: false,
        error: error.message,
      });
    }

    return res.status(500).json({
      success: false,
      error: 'Failed to retrieve transactions',
    });
  }
}

/**
 * POST /admin/transactions/:id/verify
 * Verify a transaction (admin only)
 */
async function verifyTransaction(req, res) {
  try {
    const { id: transactionId } = req.params;
    const adminId = req.user?.id; // From auth middleware

    if (!transactionId) {
      return res.status(400).json({
        error: 'Transaction ID is required',
      });
    }

    const result = await TransactionService.verifyTransaction(transactionId, adminId);

    return res.status(200).json({
      success: true,
      data: result,
      message: 'Transaction verified successfully',
    });
  } catch (error) {
    console.error('verifyTransaction error:', error.message);

    let statusCode = 500;
    if (
      error.message.includes('NOT_FOUND') ||
      error.message.includes('INVALID_STATE')
    ) {
      statusCode = 400;
    } else if (error.message.includes('UNAUTHORIZED')) {
      statusCode = 403;
    }

    return res.status(statusCode).json({
      success: false,
      error: error.message,
    });
  }
}

/**
 * POST /admin/transactions/:id/reject
 * Reject a transaction (admin only)
 */
async function rejectTransaction(req, res) {
  try {
    const { id: transactionId } = req.params;
    const adminId = req.user?.id; // From auth middleware
    const { reason } = req.body;

    if (!transactionId) {
      return res.status(400).json({
        error: 'Transaction ID is required',
      });
    }

    if (!reason || reason.trim().length === 0) {
      return res.status(400).json({
        error: 'Rejection reason is required',
      });
    }

    const result = await TransactionService.rejectTransaction(
      transactionId,
      adminId,
      reason
    );

    return res.status(200).json({
      success: true,
      data: result,
      message: 'Transaction rejected successfully',
    });
  } catch (error) {
    console.error('rejectTransaction error:', error.message);

    let statusCode = 500;
    if (
      error.message.includes('NOT_FOUND') ||
      error.message.includes('INVALID_STATE') ||
      error.message.includes('REASON_REQUIRED')
    ) {
      statusCode = 400;
    } else if (error.message.includes('UNAUTHORIZED')) {
      statusCode = 403;
    }

    return res.status(statusCode).json({
      success: false,
      error: error.message,
    });
  }
}

/**
 * GET /admin/transactions/:id
 * Get transaction details (admin)
 */
async function getTransaction(req, res) {
  try {
    const { id: transactionId } = req.params;
    const adminId = req.user?.id;

    if (!transactionId) {
      return res.status(400).json({
        error: 'Transaction ID is required',
      });
    }

    const transaction = await TransactionService.getTransaction(transactionId);

    return res.status(200).json({
      success: true,
      data: transaction,
    });
  } catch (error) {
    console.error('getTransaction error:', error.message);

    if (error.message.includes('NOT_FOUND')) {
      return res.status(404).json({
        success: false,
        error: error.message,
      });
    }

    return res.status(500).json({
      success: false,
      error: 'Failed to retrieve transaction',
    });
  }
}

/**
 * GET /admin/transactions/stats/:campaignId
 * Get transaction statistics for a campaign
 */
async function getTransactionStats(req, res) {
  try {
    const { campaignId } = req.params;
    const adminId = req.user?.id;

    if (!campaignId) {
      return res.status(400).json({
        error: 'Campaign ID is required',
      });
    }

    const stats = await TransactionService.getTransactionStats(campaignId);

    return res.status(200).json({
      success: true,
      data: stats,
    });
  } catch (error) {
    console.error('getTransactionStats error:', error.message);
    return res.status(500).json({
      success: false,
      error: 'Failed to retrieve statistics',
    });
  }
}

module.exports = {
  recordDonation,
  getUserTransactions,
  getAllTransactions,
  verifyTransaction,
  rejectTransaction,
  getTransaction,
  getTransactionStats,
};
