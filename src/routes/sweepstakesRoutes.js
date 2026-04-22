/**
 * Sweepstakes Routes
 * 
 * Complete production-ready sweepstakes system with 11 endpoints
 * 
 * CRITICAL: Route ordering matters!
 * Static routes MUST come before :id routes to avoid matching conflicts
 * Order: Static endpoints → Detail endpoints → :id routes
 */

const express = require('express');
const router = express.Router();
const SweepstakesController = require('../controllers/SweepstakesController');
const { authenticate, authorize } = require('../middleware/authMiddleware');
const { sweepstakesEligibility, enforceSweepstakesEligibility } = require('../middleware/sweepstakesEligibility');

/**
 * ============================================================================
 * ADMIN ENDPOINTS (must come BEFORE :id parameters)
 * ============================================================================
 */

/**
 * GET /sweepstakes/admin/stats
 * Get admin dashboard statistics
 * 
 * @auth Required (admin)
 * @returns {200} Admin statistics
 */
router.get(
  '/admin/stats',
  authenticate,
  authorize(['admin']),
  SweepstakesController.getAdminStats
);

/**
 * GET /sweepstakes/admin/drawings-history
 * Get all drawings with pagination (admin only)
 * 
 * @auth Required (admin)
 * @query page, limit
 * @returns {200} List of drawings
 */
router.get(
  '/admin/drawings-history',
  authenticate,
  authorize(['admin']),
  SweepstakesController.getDrawingsHistory
);

/**
 * GET /sweepstakes/admin/drawing/:id
 * Get detailed drawing information (admin only)
 * 
 * @auth Required (admin)
 * @param id - Drawing ID
 * @returns {200} Detailed drawing info
 */
router.get(
  '/admin/drawing/:id',
  authenticate,
  authorize(['admin']),
  SweepstakesController.getDrawingDetails
);

/**
 * POST /sweepstakes/admin/drawing/:id/force-draw
 * Force execute a drawing immediately (admin only)
 * 
 * @auth Required (admin)
 * @param id - Drawing ID
 * @returns {200} Drawing execution result
 */
router.post(
  '/admin/drawing/:id/force-draw',
  authenticate,
  authorize(['admin']),
  SweepstakesController.forceDrawing
);

/**
 * PUT /sweepstakes/admin/drawing/:id
 * Update drawing details (admin only)
 * 
 * @auth Required (admin)
 * @param id - Drawing ID
 * @body title, description, prizeAmount, drawDate, winnersCount
 * @returns {200} Updated drawing
 */
router.put(
  '/admin/drawing/:id',
  authenticate,
  authorize(['admin']),
  SweepstakesController.updateDrawing
);

/**
 * DELETE /sweepstakes/admin/drawing/:id
 * Delete a drawing (admin only)
 * 
 * @auth Required (admin)
 * @param id - Drawing ID
 * @returns {200} Deletion confirmation
 */
router.delete(
  '/admin/drawing/:id',
  authenticate,
  authorize(['admin']),
  SweepstakesController.deleteDrawing
);

/**
 * ============================================================================
 * ENTRY-BASED ROUTES (DEPRECATED - Entry tracking system removed)
 * ============================================================================
 * The following routes are disabled as the new simplified sweepstakes
 * system does not track individual entries. Users are randomly selected
 * from the general user pool each month.
 */

/*
// DEPRECATED: GET /sweepstakes/my-entries
// Old route for tracking entry breakdown
router.get(
  '/my-entries',
  authenticate,
  SweepstakesController.getUserEntries
);

// DEPRECATED: GET /sweepstakes/campaigns/:campaignId/entries
// Old route for campaign-specific entry tracking
router.get(
  '/campaigns/:campaignId/entries',
  authenticate,
  SweepstakesController.getCampaignEntries
);
*/

/**
 * ============================================================================
 * STATIC ROUTES (must come BEFORE :id parameters)
 * ============================================================================
 */

/**
 * GET /sweepstakes/my-winnings
 * Get current user's won prizes
 * 
 * @auth Required
 * @query page, limit
 * @returns {200} User's winnings with pagination
 */
router.get(
  '/my-winnings',
  authenticate,
  SweepstakesController.getUserWinnings
);

/**
 * GET /sweepstakes/current-drawing
 * Get the current/active sweepstake drawing
 * 
 * @auth Optional (shows user entry count if authenticated)
 * @returns {200} Current drawing details
 * @returns {404} No active drawing available
 */
router.get(
  '/current-drawing',
  SweepstakesController.getCurrentDrawing
);

/**
 * GET /sweepstakes/notification
 * Get winner notification for current user (if they won last drawing)
 * 
 * @auth Required
 * @returns {200} Winner notification with winnings
 * @returns {404} No winning notification for user
 */
router.get(
  '/notification',
  authenticate,
  (req, res, next) => {
    console.log('🚀 [/notification route] HIT - req.user:', req.user)
    console.log('🚀 [/notification route] Headers auth:', req.headers.authorization ? 'YES' : 'NO')
    console.log('🚀 [/notification route] About to call controller')
    next()
  },
  SweepstakesController.getWinnerNotification
);

/**
 * GET /sweepstakes/past-drawings
 * Get completed/past sweepstake drawings with winners
 * 
 * @auth Optional
 * @query page, limit
 * @returns {200} Paginated list of past drawings
 */
router.get(
  '/past-drawings',
  SweepstakesController.getPastDrawings
);

/**
 * GET /sweepstakes/leaderboard
 * Get current drawing leaderboard (top entries)
 * 
 * @auth Optional
 * @query limit
 * @returns {200} Leaderboard entries sorted by entry count
 */
router.get(
  '/leaderboard',
  SweepstakesController.getLeaderboard
);

/**
 * ============================================================================
 * WINNINGS ROUTES (must come BEFORE :id parameter routes)
 * ============================================================================
 */

/**
 * POST /sweepstakes/winnings/:winningId/claim
 * Claim a won prize with payment method
 * 
 * @auth Required
 * @param winningId - Winning record ID
 * @body paymentMethod - Payment method details
 * @returns {200} Prize claim processed
 * @returns {404} Winning record not found
 * @returns {409} Prize already claimed
 */
router.post(
  '/winnings/:winningId/claim',
  authenticate,
  (req, res, next) => {
    console.log('🏆 [/winnings/claim route] HIT - winningId:', req.params.winningId)
    console.log('🏆 [/winnings/claim route] User:', req.user?.userId)
    console.log('🏆 [/winnings/claim route] Payment method:', req.body.paymentMethod)
    next()
  },
  SweepstakesController.claimPrize
);

/**
 * POST /sweepstakes
 * Create a new sweepstake (admin only)
 * 
 * @auth Required (admin only)
 * @body title, description, prizePool, campaignId, entryEndDate, drawDate, prizes
 * @returns {201} Created sweepstake
 * @returns {400} Missing required fields
 * @returns {403} Insufficient permissions
 */
router.post(
  '/',
  authenticate,
  authorize(['admin']),
  SweepstakesController.createSweepstake
);

/**
 * ============================================================================
 * CAMPAIGN-SPECIFIC ROUTES
 * ============================================================================
 */

/**
 * GET /sweepstakes/campaigns/:campaignId/entries
 * Get current user's sweepstake entry breakdown for a campaign
 * 
 * Returns a breakdown of how many entries the user earned for this campaign:
 * - Campaign creation (1 if they created it)
 * - Donations (count per donation)
 * - Shares (count, where each share = 0.5 entries)
 * 
 * @auth Required (authenticated users)
 * @param campaignId - Campaign ID
 * @returns {200} Entry breakdown { entries: { campaignCreation, donations, shares, total }, currentDrawing }
 * @returns {404} Campaign not found
 */
router.get(
  '/campaigns/:campaignId/entries',
  authenticate,
  SweepstakesController.getCampaignEntries
);

/**
 * ============================================================================
 * ACTION ROUTES (must come BEFORE :id detail route)
 * ============================================================================
 */

/**
 * DEPRECATED - POST /sweepstakes/:id/enter
 * 
 * This endpoint has been disabled as part of sweepstakes system redesign.
 * Old system: Users manually entered sweepstakes by paying entry fees or earning entries through actions
 * New system: Monthly automatic random drawing from all eligible users - no manual entry needed
 * 
 * Users are automatically eligible if they have an active account and meet age/state requirements
 */
/*
router.post(
  '/:id/enter',
  authenticate,
  enforceSweepstakesEligibility,
  SweepstakesController.enterSweepstake
);
*/

/**
 * POST /sweepstakes/:id/claim-prize
 * Claim a won prize from a drawing
 * 
 * @auth Required
 * @param id - Drawing ID where user won
 * @body paymentMethodId (optional)
 * @returns {200} Prize claimed
 * @returns {403} User not a winner
 * @returns {409} Prize already claimed
 * @returns {410} Claim window expired
 */
router.post(
  '/:id/claim-prize',
  authenticate,
  SweepstakesController.claimPrize
);

/**
 * POST /sweepstakes/:id/cancel-claim
 * Cancel a pending prize claim
 * 
 * @auth Required (claim owner or admin)
 * @param id - Claim ID to cancel
 * @body reason (optional)
 * @returns {200} Claim cancelled
 * @returns {403} Not authorized to cancel
 * @returns {409} Claim not in pending state
 */
router.post(
  '/:id/cancel-claim',
  authenticate,
  SweepstakesController.cancelClaim
);

/**
 * ============================================================================
 * DETAIL ROUTE (must come LAST, after all specific routes with :id)
 * ============================================================================
 */

/**
 * GET /sweepstakes/:id
 * Get sweepstake details by ID
 * 
 * @auth Optional (shows user entries if authenticated)
 * @param id - Sweepstake drawing ID
 * @returns {200} Sweepstake details
 * @returns {404} Sweepstake not found
 */
router.get(
  '/:id',
  SweepstakesController.getSweepstakeDetail
);

/**
 * ============================================================================
 * ROOT LIST ROUTE (must come LAST in file)
 * ============================================================================
 */

/**
 * GET /sweepstakes
 * List all available sweepstakes
 * 
 * @auth Optional
 * @query page, limit, status (active|upcoming|ended|all), sortBy
 * @returns {200} Paginated sweepstakes list
 */
router.get(
  '/',
  SweepstakesController.listSweepstakes
);

/**
 * ============================================================================
 * ERROR HANDLING
 * ============================================================================
 */

// Handle invalid methods on sweepstakes routes
router.all('*', (req, res) => {
  res.status(405).json({
    success: false,
    message: `Method ${req.method} not allowed for this endpoint`
  });
});

module.exports = router;
