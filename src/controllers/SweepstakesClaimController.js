const PrizeClaimService = require('../services/PrizeClaimService');
const SweepstakesDrawing = require('../models/SweepstakesDrawing');
const User = require('../models/User');

/**
 * SweepstakesClaimController
 *
 * Handles prize claiming endpoints:
 * - POST /sweepstakes/claim/{drawingId} - Claim prize
 * - GET /sweepstakes/drawings - View past winners
 * - GET /admin/sweepstakes/current - Admin current stats
 * - GET /admin/sweepstakes/drawings - Admin all drawings
 */

class SweepstakesClaimController {
  /**
   * Claim prize endpoint
   *
   * POST /sweepstakes/claim/:drawingId
   *
   * @param {Object} req - Express request
   * @param {string} req.user._id - Authenticated user ID
   * @param {string} req.params.drawingId - Drawing ID to claim
   * @param {string} req.body.paymentMethodId - Optional specific payment method
   * @returns {Promise<Object>} Claim result
   */
  async claimPrize(req, res) {
    try {
      const { drawingId } = req.params;
      const { paymentMethodId } = req.body;
      const userId = req.user._id;

      console.log(`[ClaimController] Claim attempt: user=${userId}, drawing=${drawingId}`);

      // Validate input
      if (!drawingId || !userId) {
        return res.status(400).json({
          success: false,
          error: 'INVALID_INPUT',
          message: 'Drawing ID and user authentication required',
        });
      }

      // Process claim
      const result = await PrizeClaimService.claimPrize(userId, drawingId, {
        paymentMethodId,
      });

      if (!result.success) {
        console.warn(
          `[ClaimController] Claim failed: ${result.error} - ${result.message}`
        );

        const statusCode =
          result.error === 'UNAUTHORIZED' || result.error === 'NOT_WINNER'
            ? 403
            : result.error === 'EXPIRED'
            ? 410
            : result.error === 'ALREADY_CLAIMED'
            ? 409
            : 400;

        return res.status(statusCode).json({
          success: false,
          error: result.error,
          message: result.message,
        });
      }

      console.log(`[ClaimController] Claim successful: drawing=${drawingId}`);

      return res.status(200).json({
        success: true,
        claimId: result.claimId,
        prizeAmount: result.prizeAmount,
        claimedAt: result.claimedAt,
        message: 'Prize claimed successfully',
        nextSteps: result.nextSteps,
      });
    } catch (error) {
      console.error(`[ClaimController] Error claiming prize: ${error.message}`);
      return res.status(500).json({
        success: false,
        error: 'CLAIM_FAILED',
        message: 'An error occurred while claiming your prize',
      });
    }
  }

  /**
   * Get past winners list (public, anonymized)
   *
   * GET /sweepstakes/drawings
   *
   * @param {Object} req - Express request
   * @param {number} req.query.page - Page number (1-indexed)
   * @param {number} req.query.limit - Results per page (max 50)
   * @param {string} req.query.status - Filter by status (claimed, all)
   * @returns {Promise<Object>} Paginated winners list
   */
  async getPastWinners(req, res) {
    try {
      const page = Math.max(1, parseInt(req.query.page) || 1);
      const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 10));
      const status = req.query.status || 'claimed';

      console.log(`[ClaimController] Fetching winners: page=${page}, limit=${limit}, status=${status}`);

      const result = await PrizeClaimService.getPastWinners({
        page,
        limit,
        status,
      });

      if (!result.success) {
        return res.status(400).json({
          success: false,
          error: result.error,
          message: result.message,
        });
      }

      return res.status(200).json({
        success: true,
        winners: result.winners,
        pagination: {
          page,
          limit,
          totalCount: result.totalCount,
          totalPages: result.totalPages,
          hasMore: page < result.totalPages,
        },
      });
    } catch (error) {
      console.error(`[ClaimController] Error fetching winners: ${error.message}`);
      return res.status(500).json({
        success: false,
        error: 'FETCH_FAILED',
        message: 'Failed to fetch winners list',
      });
    }
  }

  /**
   * Get sweepstakes current status (admin only)
   *
   * GET /admin/sweepstakes/current
   *
   * @param {Object} req - Express request
   * @returns {Promise<Object>} Current sweepstakes stats
   */
  async getAdminCurrentStatus(req, res) {
    try {
      // Check admin permission
      if (req.user.role !== 'admin') {
        return res.status(403).json({
          success: false,
          error: 'UNAUTHORIZED',
          message: 'Admin access required',
        });
      }

      console.log(`[ClaimController] Fetching admin current status`);

      const result = await PrizeClaimService.getAdminCurrentStats();

      if (!result.success) {
        return res.status(400).json({
          success: false,
          error: result.error,
          message: result.message,
        });
      }

      return res.status(200).json({
        success: true,
        stats: result.stats,
      });
    } catch (error) {
      console.error(`[ClaimController] Error fetching admin stats: ${error.message}`);
      return res.status(500).json({
        success: false,
        error: 'STATS_FETCH_FAILED',
        message: 'Failed to fetch current status',
      });
    }
  }

  /**
   * Get all drawings (admin only)
   *
   * GET /admin/sweepstakes/drawings
   *
   * @param {Object} req - Express request
   * @param {number} req.query.page - Page number
   * @param {string} req.query.status - Filter by status
   * @returns {Promise<Object>} All drawings with full audit trail
   */
  async getAdminAllDrawings(req, res) {
    try {
      // Check admin permission
      if (req.user.role !== 'admin') {
        return res.status(403).json({
          success: false,
          error: 'UNAUTHORIZED',
          message: 'Admin access required',
        });
      }

      const page = Math.max(1, parseInt(req.query.page) || 1);
      const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 25));
      const status = req.query.status || 'all';

      console.log(
        `[ClaimController] Fetching admin drawings: page=${page}, limit=${limit}, status=${status}`
      );

      const result = await PrizeClaimService.getAdminAllDrawings({
        page,
        limit,
        status,
      });

      if (!result.success) {
        return res.status(400).json({
          success: false,
          error: result.error,
          message: result.message,
        });
      }

      return res.status(200).json({
        success: true,
        drawings: result.drawings,
        pagination: {
          page,
          limit,
          totalCount: result.totalCount,
          totalPages: result.totalPages,
        },
        alerts: result.alerts, // Admin alerts for unclaimed, expired, etc.
      });
    } catch (error) {
      console.error(`[ClaimController] Error fetching admin drawings: ${error.message}`);
      return res.status(500).json({
        success: false,
        error: 'DRAWINGS_FETCH_FAILED',
        message: 'Failed to fetch all drawings',
      });
    }
  }

  /**
   * Get user's sweepstakes history
   *
   * GET /sweepstakes/my-drawings
   *
   * @param {Object} req - Express request
   * @returns {Promise<Object>} User's sweepstakes history
   */
  async getUserSweepstakesHistory(req, res) {
    try {
      const userId = req.user._id;

      console.log(`[ClaimController] Fetching user history: user=${userId}`);

      const result = await PrizeClaimService.getUserSweepstakesHistory(userId);

      if (!result.success) {
        return res.status(400).json({
          success: false,
          error: result.error,
          message: result.message,
        });
      }

      return res.status(200).json({
        success: true,
        drawings: result.drawings,
        stats: result.stats,
      });
    } catch (error) {
      console.error(`[ClaimController] Error fetching user history: ${error.message}`);
      return res.status(500).json({
        success: false,
        error: 'HISTORY_FETCH_FAILED',
        message: 'Failed to fetch your history',
      });
    }
  }

  /**
   * Get claim details
   *
   * GET /sweepstakes/claim/:drawingId
   *
   * @param {Object} req - Express request
   * @returns {Promise<Object>} Claim details
   */
  async getClaimDetails(req, res) {
    try {
      const { drawingId } = req.params;
      const userId = req.user._id;

      console.log(`[ClaimController] Fetching claim details: drawing=${drawingId}, user=${userId}`);

      const result = await PrizeClaimService.getClaimDetails(userId, drawingId);

      if (!result.success) {
        return res.status(400).json({
          success: false,
          error: result.error,
          message: result.message,
        });
      }

      return res.status(200).json({
        success: true,
        claim: result.claim,
      });
    } catch (error) {
      console.error(`[ClaimController] Error fetching claim details: ${error.message}`);
      return res.status(500).json({
        success: false,
        error: 'DETAILS_FETCH_FAILED',
        message: 'Failed to fetch claim details',
      });
    }
  }

  /**
   * Resend claim notification email
   *
   * POST /sweepstakes/resend-notification/:drawingId
   *
   * @param {Object} req - Express request
   * @returns {Promise<Object>} Email send result
   */
  async resendClaimNotification(req, res) {
    try {
      const { drawingId } = req.params;
      const userId = req.user._id;

      console.log(
        `[ClaimController] Resending notification: drawing=${drawingId}, user=${userId}`
      );

      const result = await PrizeClaimService.resendClaimNotification(userId, drawingId);

      if (!result.success) {
        return res.status(400).json({
          success: false,
          error: result.error,
          message: result.message,
        });
      }

      return res.status(200).json({
        success: true,
        message: 'Notification email sent',
      });
    } catch (error) {
      console.error(
        `[ClaimController] Error resending notification: ${error.message}`
      );
      return res.status(500).json({
        success: false,
        error: 'NOTIFICATION_FAILED',
        message: 'Failed to send notification',
      });
    }
  }
}

module.exports = new SweepstakesClaimController();
