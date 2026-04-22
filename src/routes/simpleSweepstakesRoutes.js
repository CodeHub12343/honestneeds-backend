const express = require('express');
const router = express.Router();
const SimpleSweepstakesController = require('../controllers/SimpleSweepstakesController');
const { authenticate, requireAdmin } = require('../middleware/authMiddleware');

/**
 * Simplified Sweepstakes Routes
 * 
 * New System (v2):
 * - Monthly automatic drawing
 * - No manual entry tracking
 * - All eligible users auto-included
 * - Admin selects winner
 * - Winner claims prize
 * 
 * Public Routes (no auth required):
 * - GET /sweepstakes/current - View current drawing
 * 
 * Authenticated Routes:
 * - GET /sweepstakes/:id/winner - Check if user won
 * - POST /sweepstakes/:id/claim - Claim prize
 * 
 * Admin Routes:
 * - POST /admin/sweepstakes - Create monthly drawing
 * - POST /admin/sweepstakes/:id/select-winner - Select winner
 * - GET /admin/sweepstakes/:id/claims - View all claims
 * - PUT /admin/sweepstakes/:id/claims/:claimId/approve - Approve claim
 * - PUT /admin/sweepstakes/:id/claims/:claimId/reject - Reject claim
 */

// ============================================
// PUBLIC ROUTES (specific routes first)
// ============================================

/**
 * GET /sweepstakes/current
 * Get current active sweepstakes drawing
 * 
 * Response:
 * {
 *   success: true,
 *   data: {
 *     id: ObjectId,
 *     month: "2026-04",
 *     title: "April 2026 Monthly Drawing",
 *     description: "...",
 *     prizeAmount: 50000,
 *     prizeAmountDollars: "500.00",
 *     prizeDescription: "Cash Prize",
 *     entryStartDate: Date,
 *     entryEndDate: Date,
 *     drawingDate: Date,
 *     claimDeadline: Date,
 *     status: "active",
 *     isDrawingOpen: true
 *   }
 * }
 * 
 * Errors:
 * - 404: No active sweepstakes
 * - 500: Server error
 */
router.get('/current', SimpleSweepstakesController.getCurrentSweepstakes);

// ============================================
// ADMIN ROUTES (must come before /:id routes)
// ============================================

/**
 * GET /sweepstakes/admin/all
 * Get all sweepstakes (admin only)
 * 
 * @auth Required (admin)
 * 
 * Response:
 * {
 *   success: true,
 *   data: [
 *     {
 *       id: ObjectId,
 *       month: "2026-04",
 *       title: "April 2026 Monthly Drawing",
 *       prizeAmount: 50000,
 *       prizeAmountDollars: "500.00",
 *       status: "active",
 *       winnerId: null
 *     }
 *   ]
 * }
 * 
 * Errors:
 * - 401: Not authenticated
 * - 403: Not admin
 * - 500: Server error
 */
router.get('/admin/all', requireAdmin, SimpleSweepstakesController.getAllSweepstakes);

/**
 * POST /admin/sweepstakes
 * Create a new monthly sweepstakes
 * 
 * @auth Required (admin)
 * 
 * Request body:
 * {
 *   month: "2026-04",
 *   prizeAmount: 50000
 * }
 * 
 * Response:
 * {
 *   success: true,
 *   message: "Sweepstakes created successfully",
 *   data: {
 *     id: ObjectId,
 *     month: "2026-04",
 *     title: "April 2026 Monthly Drawing",
 *     prizeAmount: "500.00",
 *     status: "active"
 *   }
 * }
 * 
 * Errors:
 * - 400: Invalid month format or missing fields
 * - 401: Not admin
 * - 409: Sweepstakes already exists for month
 */
router.post('/admin/sweepstakes', requireAdmin, SimpleSweepstakesController.createSweepstakes);

// ============================================
// AUTHENTICATED ROUTES (/:id routes come last)
// ============================================

/**
 * GET /sweepstakes/:id/winner
 * Check if current user won this drawing
 * 
 * @auth Required
 * @param id - Sweepstakes ID
 * 
 * Response if not drawn:
 * {
 *   success: true,
 *   data: {
 *     drawn: false,
 *     winner: null,
 *     message: "Drawing has not been conducted yet"
 *   }
 * }
 * 
 * Response if user won:
 * {
 *   success: true,
 *   data: {
 *     drawn: true,
 *     winner: true,
 *     prizeAmount: 50000,
 *     prizeAmountDollars: "500.00",
 *     claimDeadline: Date,
 *     claimStatus: null,
 *     canClaim: true
 *   }
 * }
 * 
 * Response if user didn't win:
 * {
 *   success: true,
 *   data: {
 *     drawn: true,
 *     winner: false,
 *     message: "You did not win this drawing"
 *   }
 * }
 */
router.get('/:id/winner', authenticate, SimpleSweepstakesController.checkWinner);

/**
 * POST /sweepstakes/:id/claim
 * Winner claims their prize
 * 
 * @auth Required
 * @param id - Sweepstakes ID
 * 
 * Request body:
 * {
 *   accountName: "John Doe",
 *   accountNumber: "1234567890",
 *   routingNumber: "123456789",
 *   bankName: "Bank of America",
 *   paymentMethod: "bank_transfer" (optional)
 * }
 * 
 * Response:
 * {
 *   success: true,
 *   message: "Prize claim submitted successfully",
 *   data: {
 *     claimId: ObjectId,
 *     status: "pending",
 *     prizeAmount: "500.00",
 *     expiresAt: Date
 *   }
 * }
 * 
 * Errors:
 * - 400: Missing required fields
 * - 401: Not authenticated
 * - 403: Not the winner
 * - 404: Sweepstakes not found
 * - 409: Can't claim (period ended or already claimed)
 */
router.post('/:id/claim', authenticate, SimpleSweepstakesController.claimPrize);

/**
 * POST /:id/select-winner
 * Select winner from eligible users or random
 * 
 * @auth Required (admin)
 * @param id - Sweepstakes ID
 * 
 * Request body (option 1 - manual selection):
 * {
 *   winnerId: ObjectId
 * }
 * 
 * Request body (option 2 - random selection):
 * {
 *   randomSelection: true
 * }
 * 
 * Response:
 * {
 *   success: true,
 *   message: "Winner selected successfully",
 *   data: {
 *     sweepstakesId: ObjectId,
 *     winnerId: ObjectId,
 *     winnerEmail: "winner@example.com",
 *     drawMethod: "random_selection",
 *     prizeAmount: "500.00",
 *     drawnAt: Date
 *   }
 * }
 * 
 * Errors:
 * - 400: No eligible users or invalid user selected
 * - 401: Not admin
 * - 404: Sweepstakes not found
 * - 409: Can't select winner for current status
 */
router.post('/:id/select-winner', requireAdmin, SimpleSweepstakesController.selectWinner);

/**
 * GET /admin/sweepstakes/:id/claims
 * View all claims for a sweepstakes
 * 
 * @auth Required (admin)
 * @param id - Sweepstakes ID
 * 
 * Response:
 * {
 *   success: true,
 *   data: {
 *     sweepstakesId: ObjectId,
 *     month: "2026-04",
 *     prizeAmount: "500.00",
 *     claims: [
 *       {
 *         id: ObjectId,
 *         winnerId: ObjectId,
 *         winnerEmail: "winner@example.com",
 *         winnerName: "John Doe",
 *         prizeAmount: "500.00",
 *         status: "pending",
 *         claimedAt: Date,
 *         approvedAt: null,
 *         rejectionReason: null
 *       }
 *     ]
 *   }
 * }
 */
router.get('/:id/claims', requireAdmin, SimpleSweepstakesController.getClaimsForSweepstakes);

/**
 * PUT /admin/sweepstakes/:id/claims/:claimId/approve
 * Approve a claim for payment
 * 
 * @auth Required (admin)
 * 
 * Request body:
 * {
 *   adminNotes: "Payment processed" (optional)
 * }
 * 
 * Response:
 * {
 *   success: true,
 *   message: "Claim approved successfully",
 *   data: {
 *     claimId: ObjectId,
 *     status: "approved",
 *     approvedAt: Date
 *   }
 * }
 */
router.put('/:id/claims/:claimId/approve', requireAdmin, SimpleSweepstakesController.approveClaim);

/**
 * PUT /admin/sweepstakes/:id/claims/:claimId/reject
 * Reject a claim
 * 
 * @auth Required (admin)
 * 
 * Request body:
 * {
 *   rejectionReason: "Invalid bank details",
 *   adminNotes: "User provided wrong account number" (optional)
 * }
 * 
 * Response:
 * {
 *   success: true,
 *   message: "Claim rejected successfully",
 *   data: {
 *     claimId: ObjectId,
 *     status: "rejected",
 *     rejectionReason: "Invalid bank details"
 *   }
 * }
 */
router.put('/:id/claims/:claimId/reject', requireAdmin, SimpleSweepstakesController.rejectClaim);

module.exports = router;
