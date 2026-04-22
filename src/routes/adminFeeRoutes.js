const express = require('express');
const AdminFeeController = require('../controllers/AdminFeeController');
const { authenticate, authorize } = require('../middleware/authMiddleware');
const { validateInput } = require('../middleware/validation');

const router = express.Router();

/**
 * Admin Fee Routes
 * Admin-only endpoints for fee tracking and settlement
 */

/**
 * GET /admin/fees/dashboard
 * Get complete fee dashboard with metrics and analytics
 * 
 * @query {string} startDate - Filter start date (ISO 8601)
 * @query {string} endDate - Filter end date (ISO 8601)
 * @query {string} status - Filter by status (pending, verified, unverified)
 * @returns {200} Dashboard data with summary, by status, and top campaigns
 * @returns {403} Admin required
 */
router.get(
  '/admin/fees/dashboard',
  authenticate,
  AdminFeeController.getFeesDashboard
);

/**
 * GET /admin/fees/outstanding
 * Get outstanding fees pending settlement
 * 
 * @returns {200} Outstanding fees summary
 * @returns {403} Admin required
 */
router.get(
  '/admin/fees/outstanding',
  authenticate,
  AdminFeeController.getOutstandingFees
);

/**
 * POST /admin/fees/settle
 * Initiate fee settlement for a period
 * 
 * @body {string} period - Settlement period (format: YYYY-MM)
 * @body {string} reason - Reason for settlement
 * @returns {200} Settlement initiated
 * @returns {400} Invalid period or no fees to settle
 * @returns {403} Admin required
 */
router.post(
  '/admin/fees/settle',
  authenticate,
  validateInput('settlement'),
  AdminFeeController.settleFees
);

/**
 * GET /admin/fees/settlement-history
 * Get history of fee settlements
 * 
 * @query {number} page - Page number (default: 1)
 * @query {number} limit - Results per page (default: 20, max: 100)
 * @returns {200} Settlement history with pagination
 * @returns {403} Admin required
 */
router.get(
  '/admin/fees/settlement-history',
  authenticate,
  AdminFeeController.getSettlementHistory
);

/**
 * GET /admin/fees/report
 * Generate detailed fee report for a period
 * 
 * @query {string} startDate - Report start date (ISO 8601, required)
 * @query {string} endDate - Report end date (ISO 8601, required)
 * @query {string} format - Report format (json, csv) (default: json)
 * @returns {200} Fee report
 * @returns {400} Missing date filters
 * @returns {403} Admin required
 */
router.get(
  '/admin/fees/report',
  authenticate,
  AdminFeeController.generateFeeReport
);

/**
 * GET /admin/fees/audit-trail/:transactionId
 * Get audit trail for a specific fee transaction
 * 
 * @param {string} transactionId - Transaction ID
 * @returns {200} Audit trail with full transaction history
 * @returns {403} Admin required
 * @returns {404} Fee transaction not found
 */
router.get(
  '/admin/fees/audit-trail/:transactionId',
  authenticate,
  AdminFeeController.getFeeAuditTrail
);

/**
 * Error handling middleware for this router
 */
router.use((error, req, res, next) => {
  console.error('Admin Fee Route Error:', error);
  
  if (error.name === 'ValidationError') {
    return res.status(400).json({
      success: false,
      error: 'VALIDATION_FAILED',
      message: error.message
    });
  }
  
  if (error.statusCode === 403) {
    return res.status(403).json({
      success: false,
      error: 'FORBIDDEN',
      message: 'Admin access required'
    });
  }
  
  res.status(500).json({
    success: false,
    error: 'INTERNAL_ERROR',
    message: 'An internal server error occurred'
  });
});

module.exports = router;
