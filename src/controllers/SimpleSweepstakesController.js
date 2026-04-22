const Sweepstakes = require('../models/Sweepstakes');
const WinnerClaim = require('../models/WinnerClaim');
const User = require('../models/User');
const { winstonLogger } = require('../utils/logger');

/**
 * SimpleSweepstakesController - New simplified sweepstakes system
 * 
 * Monthly random drawing system:
 * - No manual entry - all eligible users auto-included
 * - Admin selects winner and amount
 * - Winner claims prize
 * 
 * Eligible users:
 * - Age 18+
 * - Not from restricted states (FL, NY, IL)
 * - Active account status
 */
class SimpleSweepstakesController {
  /**
   * PUBLIC: GET /sweepstakes/current
   * Get current active sweepstakes drawing
   * 
   * @returns {Object} Current sweepstakes or null if none active
   */
  async getCurrentSweepstakes(req, res) {
    try {
      winstonLogger.info('🎯 [getSweepstakes] Fetching current sweepstakes');

      const sweepstakes = await Sweepstakes.getCurrentSweepstakes();

      if (!sweepstakes) {
        winstonLogger.info('ℹ️ [getSweepstakes] No active sweepstakes found');
        return res.status(404).json({
          success: false,
          message: 'No active sweepstakes at this time',
        });
      }

      winstonLogger.info('✅ [getSweepstakes] Current sweepstakes retrieved', {
        month: sweepstakes.month,
        prizeAmount: sweepstakes.prizeAmountDollars,
      });

      return res.json({
        success: true,
        data: {
          id: sweepstakes._id,
          month: sweepstakes.month,
          title: sweepstakes.title,
          description: sweepstakes.description,
          prizeAmount: sweepstakes.prizeAmount,
          prizeAmountDollars: sweepstakes.prizeAmountDollars,
          prizeDescription: sweepstakes.prizeDescription,
          entryStartDate: sweepstakes.entryStartDate,
          entryEndDate: sweepstakes.entryEndDate,
          drawingDate: sweepstakes.drawingDate,
          claimDeadline: sweepstakes.claimDeadline,
          status: sweepstakes.status,
          isDrawingOpen: sweepstakes.isDrawingOpen(),
        },
      });
    } catch (error) {
      winstonLogger.error('❌ [getSweepstakes] Error fetching current sweepstakes', {
        error: error.message,
      });
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch sweepstakes',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined,
      });
    }
  }

  /**
   * ADMIN: GET /sweepstakes/admin/all
   * Get all sweepstakes (admin only)
   * 
   * @auth Required (admin)
   * @returns {Array} All sweepstakes
   */
  async getAllSweepstakes(req, res) {
    try {
      winstonLogger.info('📋 [getAllSweepstakes] Admin fetching all sweepstakes');

      const sweepstakes = await Sweepstakes.find().sort({ month: -1 });

      winstonLogger.info('✅ [getAllSweepstakes] All sweepstakes retrieved', {
        count: sweepstakes.length,
      });

      return res.json({
        success: true,
        data: sweepstakes.map((s) => ({
          id: s._id,
          month: s.month,
          title: s.title,
          description: s.description,
          prizeAmount: s.prizeAmount,
          prizeAmountDollars: s.prizeAmountDollars,
          prizeDescription: s.prizeDescription,
          entryStartDate: s.entryStartDate,
          entryEndDate: s.entryEndDate,
          drawingDate: s.drawingDate,
          claimDeadline: s.claimDeadline,
          status: s.status,
          winnerId: s.winnerId,
          isDrawingOpen: s.isDrawingOpen(),
        })),
      });
    } catch (error) {
      winstonLogger.error('❌ [getAllSweepstakes] Error fetching all sweepstakes', {
        error: error.message,
      });
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch sweepstakes',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined,
      });
    }
  }

  /**
   * PUBLIC: GET /sweepstakes/:id/winner
   * Check if current user won the drawing
   * Returns null if not drawn yet, false if not winner, winner info if they won
   * 
   * @auth Required
   * @param {string} id - Sweepstakes ID
   */
  async checkWinner(req, res) {
    try {
      const { id } = req.params;
      const userId = req.user?.userId;

      winstonLogger.info('🔍 [checkWinner] Checking if user won', { sweepstakesId: id, userId });

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Authentication required',
        });
      }

      const sweepstakes = await Sweepstakes.findById(id);
      if (!sweepstakes) {
        return res.status(404).json({
          success: false,
          message: 'Sweepstakes not found',
        });
      }

      // Check if drawing has been conducted
      if (!sweepstakes.winnerId) {
        winstonLogger.info('ℹ️ [checkWinner] Drawing not yet conducted', { sweepstakesId: id });
        return res.json({
          success: true,
          data: {
            drawn: false,
            winner: null,
            message: 'Drawing has not been conducted yet',
          },
        });
      }

      const isWinner = sweepstakes.winnerId.toString() === userId;

      if (isWinner) {
        // Check if claim already exists
        const existingClaim = await WinnerClaim.findActiveClaim(sweepstakes._id, userId);

        winstonLogger.info('🎉 [checkWinner] User is the winner!', { sweepstakesId: id, userId });

        return res.json({
          success: true,
          data: {
            drawn: true,
            winner: true,
            prizeAmount: sweepstakes.prizeAmount,
            prizeAmountDollars: sweepstakes.prizeAmountDollars,
            claimDeadline: sweepstakes.claimDeadline,
            claimStatus: existingClaim?.status || null,
            canClaim: sweepstakes.canWinnerClaim() && !existingClaim,
          },
        });
      }

      winstonLogger.info('ℹ️ [checkWinner] User did not win this drawing', { sweepstakesId: id, userId });

      return res.json({
        success: true,
        data: {
          drawn: true,
          winner: false,
          message: 'You did not win this drawing',
        },
      });
    } catch (error) {
      winstonLogger.error('❌ [checkWinner] Error checking winner', {
        error: error.message,
        sweepstakesId: req.params.id,
      });
      return res.status(500).json({
        success: false,
        message: 'Failed to check winner',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined,
      });
    }
  }

  /**
   * PUBLIC: POST /sweepstakes/:id/claim
   * Winner claims their prize
   * 
   * @auth Required
   * @param {string} id - Sweepstakes ID
   * @body {Object} paymentDetails - { accountName, accountNumber, routingNumber, bankName }
   */
  async claimPrize(req, res) {
    try {
      const { id } = req.params;
      const userId = req.user?.userId;
      const { accountName, accountNumber, routingNumber, bankName, paymentMethod } = req.body;

      winstonLogger.info('💰 [claimPrize] Prize claim initiated', { sweepstakesId: id, userId });

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Authentication required',
        });
      }

      // Validate payment details
      if (!accountName || !accountNumber || !routingNumber || !bankName) {
        return res.status(400).json({
          success: false,
          message: 'All payment details are required',
        });
      }

      // Find sweepstakes
      const sweepstakes = await Sweepstakes.findById(id);
      if (!sweepstakes) {
        return res.status(404).json({
          success: false,
          message: 'Sweepstakes not found',
        });
      }

      // Verify user is the winner
      if (!sweepstakes.winnerId || sweepstakes.winnerId.toString() !== userId) {
        return res.status(403).json({
          success: false,
          message: 'You are not the winner of this drawing',
        });
      }

      // Verify can claim
      if (!sweepstakes.canWinnerClaim()) {
        return res.status(409).json({
          success: false,
          message: 'Claim period has ended or drawing not completed',
        });
      }

      // Check for existing claim
      const existingClaim = await WinnerClaim.findActiveClaim(sweepstakes._id, userId);
      if (existingClaim) {
        return res.status(409).json({
          success: false,
          message: `Claim already exists with status: ${existingClaim.status}`,
          claimStatus: existingClaim.status,
        });
      }

      // Fetch user to get their email
      const User = require('../models/User');
      const user = await User.findById(userId).select('email first_name last_name');
      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found',
        });
      }

      // Create new claim
      const claim = await WinnerClaim.createClaim(sweepstakes, {
        _id: userId,
        email: user.email,
      });

      // Update claim with payment details
      claim.paymentMethod = paymentMethod || 'bank_transfer';
      claim.paymentDetails = {
        accountName,
        accountNumber: accountNumber.slice(-4), // Store last 4 digits only
        routingNumber,
        bankName,
      };

      await claim.save();

      winstonLogger.info('✅ [claimPrize] Prize claim created successfully', {
        sweepstakesId: id,
        userId,
        claimId: claim._id,
      });

      return res.status(201).json({
        success: true,
        message: 'Prize claim submitted successfully',
        data: {
          claimId: claim._id,
          status: claim.status,
          prizeAmount: claim.prizeAmountDollars,
          expiresAt: claim.expiresAt,
        },
      });
    } catch (error) {
      winstonLogger.error('❌ [claimPrize] Error claiming prize', {
        error: error.message,
        sweepstakesId: req.params.id,
      });
      return res.status(500).json({
        success: false,
        message: 'Failed to claim prize',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined,
      });
    }
  }

  /**
   * ADMIN: POST /admin/sweepstakes
   * Create a new monthly sweepstakes
   * 
   * @auth Required (admin)
   * @body {Object} { month, prizeAmount }
   * @param {string} month - Format: "2026-04"
   * @param {number} prizeAmount - Prize in cents (e.g., 50000 for $500)
   */
  async createSweepstakes(req, res) {
    try {
      const { month, prizeAmount } = req.body;

      winstonLogger.info('🆕 [createSweepstakes] Admin creating sweepstakes', { month, prizeAmount });

      if (!month || !prizeAmount) {
        return res.status(400).json({
          success: false,
          message: 'Month and prize amount are required',
        });
      }

      // Validate month format
      if (!/^\d{4}-\d{2}$/.test(month)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid month format. Use YYYY-MM',
        });
      }

      // Check if sweepstakes for this month already exists
      const existing = await Sweepstakes.getByMonth(month);
      if (existing) {
        return res.status(409).json({
          success: false,
          message: `Sweepstakes already exists for ${month}`,
        });
      }

      // Create monthly sweepstakes
      const sweepstakes = await Sweepstakes.createMonthly(month, prizeAmount);

      winstonLogger.info('✅ [createSweepstakes] Sweepstakes created successfully', {
        month,
        prizeAmount: sweepstakes.prizeAmountDollars,
      });

      return res.status(201).json({
        success: true,
        message: 'Sweepstakes created successfully',
        data: {
          id: sweepstakes._id,
          month: sweepstakes.month,
          title: sweepstakes.title,
          prizeAmount: sweepstakes.prizeAmountDollars,
          status: sweepstakes.status,
        },
      });
    } catch (error) {
      winstonLogger.error('❌ [createSweepstakes] Error creating sweepstakes', {
        error: error.message,
      });
      return res.status(500).json({
        success: false,
        message: 'Failed to create sweepstakes',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined,
      });
    }
  }

  /**
   * ADMIN: POST /admin/sweepstakes/:id/select-winner
   * Select winner and amount from eligible users
   * 
   * @auth Required (admin)
   * @param {string} id - Sweepstakes ID
   * @body {Object} { winnerId } or { randomSelection: true }
   */
  async selectWinner(req, res) {
    try {
      const { id } = req.params;
      const { winnerId, randomSelection } = req.body;

      winstonLogger.info('🎲 [selectWinner] Admin selecting winner', { sweepstakesId: id });

      const sweepstakes = await Sweepstakes.findById(id);
      if (!sweepstakes) {
        return res.status(404).json({
          success: false,
          message: 'Sweepstakes not found',
        });
      }

      if (sweepstakes.status !== 'drawing' && sweepstakes.status !== 'active') {
        return res.status(409).json({
          success: false,
          message: `Cannot select winner for ${sweepstakes.status} sweepstakes`,
        });
      }

      let selectedWinnerId;

      if (randomSelection) {
        // Get all eligible users
        const eligibleUsers = await User.find({
          $expr: {
            $gte: [
              {
                $subtract: [new Date(), '$date_of_birth'],
              },
              31536000000 * 18, // 18 years in milliseconds
            ],
          },
          state: { $nin: ['FL', 'NY', 'IL'] },
          status: 'active',
        });

        if (eligibleUsers.length === 0) {
          return res.status(400).json({
            success: false,
            message: 'No eligible users available for drawing',
          });
        }

        const randomIndex = Math.floor(Math.random() * eligibleUsers.length);
        selectedWinnerId = eligibleUsers[randomIndex]._id;

        sweepstakes.drawMethod = 'random_selection';
        sweepstakes.eligibleParticipants = eligibleUsers.length;
      } else if (winnerId) {
        // Verify user exists and is eligible
        const user = await User.findById(winnerId);
        if (!user) {
          return res.status(404).json({
            success: false,
            message: 'Selected user not found',
          });
        }

        // Verify eligibility
        const age = Math.floor(
          (new Date() - new Date(user.date_of_birth)) / (1000 * 60 * 60 * 24 * 365.25)
        );
        if (age < 18) {
          return res.status(400).json({
            success: false,
            message: 'Selected user is underage',
          });
        }

        if (['FL', 'NY', 'IL'].includes(user.state)) {
          return res.status(400).json({
            success: false,
            message: 'Selected user is from restricted state',
          });
        }

        selectedWinnerId = winnerId;
        sweepstakes.drawMethod = 'manual_selection';
      } else {
        return res.status(400).json({
          success: false,
          message: 'Must provide either winnerId or randomSelection flag',
        });
      }

      // Update sweepstakes
      sweepstakes.winnerId = selectedWinnerId;
      sweepstakes.status = 'completed';
      sweepstakes.drawnAt = new Date();
      sweepstakes.drawnByAdmin = req.user?.adminId; // From auth middleware

      await sweepstakes.save();

      const winner = await User.findById(selectedWinnerId);

      winstonLogger.info('✅ [selectWinner] Winner selected successfully', {
        sweepstakesId: id,
        winnerId: selectedWinnerId,
        drawMethod: sweepstakes.drawMethod,
      });

      return res.json({
        success: true,
        message: 'Winner selected successfully',
        data: {
          sweepstakesId: sweepstakes._id,
          winnerId: selectedWinnerId,
          winnerEmail: winner?.email,
          drawMethod: sweepstakes.drawMethod,
          prizeAmount: sweepstakes.prizeAmountDollars,
          drawnAt: sweepstakes.drawnAt,
        },
      });
    } catch (error) {
      winstonLogger.error('❌ [selectWinner] Error selecting winner', {
        error: error.message,
        sweepstakesId: req.params.id,
      });
      return res.status(500).json({
        success: false,
        message: 'Failed to select winner',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined,
      });
    }
  }

  /**
   * ADMIN: GET /admin/sweepstakes/:id/claims
   * View all claims for a sweepstakes
   * 
   * @auth Required (admin)
   * @param {string} id - Sweepstakes ID
   */
  async getClaimsForSweepstakes(req, res) {
    try {
      const { id } = req.params;

      winstonLogger.info('📋 [getClaimsForSweepstakes] Fetching claims', { sweepstakesId: id });

      const sweepstakes = await Sweepstakes.findById(id);
      if (!sweepstakes) {
        return res.status(404).json({
          success: false,
          message: 'Sweepstakes not found',
        });
      }

      const claims = await WinnerClaim.find({ sweepstakesId: id })
        .populate('winnerId', 'email first_name last_name')
        .sort({ createdAt: -1 });

      winstonLogger.info('✅ [getClaimsForSweepstakes] Claims retrieved', {
        sweepstakesId: id,
        claimCount: claims.length,
      });

      return res.json({
        success: true,
        data: {
          sweepstakesId: id,
          month: sweepstakes.month,
          prizeAmount: sweepstakes.prizeAmountDollars,
          claims: claims.map((claim) => ({
            id: claim._id,
            winnerId: claim.winnerId._id,
            winnerEmail: claim.winnerEmail,
            winnerName: `${claim.winnerId.first_name} ${claim.winnerId.last_name}`,
            prizeAmount: claim.prizeAmountDollars,
            status: claim.status,
            claimedAt: claim.claimedAt,
            approvedAt: claim.approvedAt,
            rejectionReason: claim.rejectionReason,
            paymentMethod: claim.paymentMethod,
            paymentDetails: claim.paymentDetails,
          })),
        },
      });
    } catch (error) {
      winstonLogger.error('❌ [getClaimsForSweepstakes] Error fetching claims', {
        error: error.message,
        sweepstakesId: req.params.id,
      });
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch claims',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined,
      });
    }
  }

  /**
   * ADMIN: PUT /admin/sweepstakes/:id/claims/:claimId/approve
   * Approve a prize claim for payment
   * 
   * @auth Required (admin)
   */
  async approveClaim(req, res) {
    try {
      const { id: sweepstakesId, claimId } = req.params;
      const { adminNotes } = req.body;

      winstonLogger.info('✅ [approveClaim] Admin approving claim', { claimId });

      const claim = await WinnerClaim.findById(claimId);
      if (!claim) {
        return res.status(404).json({
          success: false,
          message: 'Claim not found',
        });
      }

      if (claim.status !== 'pending') {
        return res.status(409).json({
          success: false,
          message: `Cannot approve claim with status: ${claim.status}`,
        });
      }

      claim.status = 'approved';
      claim.approvedAt = new Date();
      claim.approvedByAdmin = req.user?.adminId;
      if (adminNotes) claim.adminNotes = adminNotes;

      await claim.save();

      winstonLogger.info('✅ [approveClaim] Claim approved successfully', { claimId });

      return res.json({
        success: true,
        message: 'Claim approved successfully',
        data: {
          claimId: claim._id,
          status: claim.status,
          approvedAt: claim.approvedAt,
        },
      });
    } catch (error) {
      winstonLogger.error('❌ [approveClaim] Error approving claim', {
        error: error.message,
        claimId: req.params.claimId,
      });
      return res.status(500).json({
        success: false,
        message: 'Failed to approve claim',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined,
      });
    }
  }

  /**
   * ADMIN: PUT /admin/sweepstakes/:id/claims/:claimId/reject
   * Reject a prize claim
   * 
   * @auth Required (admin)
   */
  async rejectClaim(req, res) {
    try {
      const { claimId } = req.params;
      const { rejectionReason, adminNotes } = req.body;

      winstonLogger.info('❌ [rejectClaim] Admin rejecting claim', { claimId });

      if (!rejectionReason) {
        return res.status(400).json({
          success: false,
          message: 'Rejection reason is required',
        });
      }

      const claim = await WinnerClaim.findById(claimId);
      if (!claim) {
        return res.status(404).json({
          success: false,
          message: 'Claim not found',
        });
      }

      if (claim.status !== 'pending') {
        return res.status(409).json({
          success: false,
          message: `Cannot reject claim with status: ${claim.status}`,
        });
      }

      claim.status = 'rejected';
      claim.rejectionReason = rejectionReason;
      if (adminNotes) claim.adminNotes = adminNotes;

      await claim.save();

      winstonLogger.info('✅ [rejectClaim] Claim rejected successfully', { claimId });

      return res.json({
        success: true,
        message: 'Claim rejected successfully',
        data: {
          claimId: claim._id,
          status: claim.status,
          rejectionReason: claim.rejectionReason,
        },
      });
    } catch (error) {
      winstonLogger.error('❌ [rejectClaim] Error rejecting claim', {
        error: error.message,
        claimId: req.params.claimId,
      });
      return res.status(500).json({
        success: false,
        message: 'Failed to reject claim',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined,
      });
    }
  }
}

module.exports = new SimpleSweepstakesController();
