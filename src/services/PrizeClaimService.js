const SweepstakesDrawing = require('../models/SweepstakesDrawing');
const SweepstakesSubmission = require('../models/SweepstakesSubmission');
const User = require('../models/User');
const PaymentMethod = require('../models/PaymentMethod');
const emailService = require('./emailService');

/**
 * PrizeClaimService
 *
 * Handles prize claiming workflow:
 * 1. Verify winner eligibility (is winner, not claimed, within deadline)
 * 2. Get payment method
 * 3. Record claim
 * 4. Send confirmation email
 * 5. Trigger payment processing
 * 6. Update drawing status
 *
 * Business Rules:
 * - Winner must claim within 30 days
 * - Can only claim once
 * - Must have valid payment method
 * - All claims logged for audit trail
 * - Failed claims trigger admin alert
 */

class PrizeClaimService {
  /**
   * Main claim prize method
   *
   * @param {string} userId - User attempting to claim
   * @param {string} drawingId - Drawing to claim
   * @param {Object} options - Optional configuration
   * @param {string} options.paymentMethodId - Specific payment method
   * @returns {Promise<Object>} Claim result
   */
  async claimPrize(userId, drawingId, options = {}) {
    const auditLog = {
      timestamp: new Date(),
      userId,
      drawingId,
      action: 'CLAIM_ATTEMPT',
      values: {},
    };

    try {
      console.log(`[PrizeClaimService] Claim started: user=${userId}, drawing=${drawingId}`);

      // Step 1: Fetch drawing
      const drawing = await SweepstakesDrawing.findOne({ drawingId })
        .populate('winningUserId', 'email firstName lastName')
        .lean()
        .exec();

      if (!drawing) {
        auditLog.error = 'DRAWING_NOT_FOUND';
        await this.logAudit(auditLog);
        return {
          success: false,
          error: 'DRAWING_NOT_FOUND',
          message: 'Drawing not found',
        };
      }

      // Step 2: Verify user is winner
      if (drawing.winningUserId._id.toString() !== userId.toString()) {
        auditLog.error = 'NOT_WINNER';
        await this.logAudit(auditLog);
        console.warn(`[PrizeClaimService] Non-winner claim attempt: user=${userId}, winner=${drawing.winningUserId._id}`);
        return {
          success: false,
          error: 'NOT_WINNER',
          message: 'You are not the winner of this drawing',
        };
      }

      // Step 3: Verify within claim window
      const now = new Date();
      if (now > drawing.claimDeadline) {
        auditLog.error = 'CLAIM_EXPIRED';
        await this.logAudit(auditLog);
        return {
          success: false,
          error: 'EXPIRED',
          message: `Claim deadline passed on ${drawing.claimDeadline.toDateString()}`,
        };
      }

      // Step 4: Verify not already claimed
      if (drawing.status === 'claimed') {
        auditLog.error = 'ALREADY_CLAIMED';
        await this.logAudit(auditLog);
        return {
          success: false,
          error: 'ALREADY_CLAIMED',
          message: 'Prize already claimed',
        };
      }

      // Step 5: Get payment method
      const paymentResult = await this.getPaymentMethod(userId, options.paymentMethodId);
      if (!paymentResult.success) {
        auditLog.error = 'PAYMENT_METHOD_FAILED';
        await this.logAudit(auditLog);
        return paymentResult;
      }

      const paymentMethod = paymentResult.paymentMethod;

      // Step 6: Update drawing status
      const claimId = `claim-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const claimedAt = now;

      const updateResult = await SweepstakesDrawing.findOneAndUpdate(
        { drawingId },
        {
          $set: {
            status: 'claimed',
            claimedAt,
            claimId,
            paymentMethodUsed: {
              methodId: paymentMethod._id,
              type: paymentMethod.type,
              lastFour: paymentMethod.lastFour,
            },
          },
          $push: {
            claimAuditTrail: {
              timestamp: claimedAt,
              action: 'PRIZE_CLAIMED',
              userId,
              claimId,
            },
          },
        },
        { new: true }
      ).exec();

      if (!updateResult) {
        auditLog.error = 'UPDATE_FAILED';
        await this.logAudit(auditLog);
        return {
          success: false,
          error: 'UPDATE_FAILED',
          message: 'Failed to record claim',
        };
      }

      // Step 7: Send confirmation email
      const emailResult = await this.sendClaimConfirmationEmail(
        drawing.winningUserId,
        drawing,
        claimId
      );

      if (!emailResult.success) {
        console.warn(`[PrizeClaimService] Email send failed: ${emailResult.error}`);
        // Don't fail the claim, just log it
      }

      // Step 8: Log successful claim
      auditLog.action = 'CLAIM_SUCCESS';
      auditLog.values = {
        claimId,
        prizeAmount: drawing.prizeAmount,
        paymentMethod: paymentMethod.type,
      };
      await this.logAudit(auditLog);

      console.log(`[PrizeClaimService] Claim successful: drawing=${drawingId}, claim=${claimId}`);

      return {
        success: true,
        claimId,
        prizeAmount: drawing.prizeAmount,
        claimedAt,
        nextSteps: [
          `Your prize of $${(drawing.prizeAmount / 100).toFixed(2)} will be transferred to your ${paymentMethod.type} ending in ${paymentMethod.lastFour}`,
          'You will receive a confirmation email shortly',
          'Funds typically transfer within 1-3 business days',
        ],
      };
    } catch (error) {
      auditLog.error = 'EXCEPTION';
      auditLog.errorMessage = error.message;
      await this.logAudit(auditLog);

      console.error(`[PrizeClaimService] Error claiming prize: ${error.message}`);
      return {
        success: false,
        error: 'CLAIM_FAILED',
        message: 'An error occurred while claiming your prize',
      };
    }
  }

  /**
   * Get user's payment method
   *
   * @param {string} userId - User ID
   * @param {string} paymentMethodId - Optional specific method
   * @returns {Promise<Object>} Payment method result
   */
  async getPaymentMethod(userId, paymentMethodId) {
    try {
      let paymentMethod;

      if (paymentMethodId) {
        // Use specific payment method
        paymentMethod = await PaymentMethod.findOne({
          _id: paymentMethodId,
          userId,
          isDeleted: false,
        })
          .lean()
          .exec();

        if (!paymentMethod) {
          return {
            success: false,
            error: 'PAYMENT_METHOD_NOT_FOUND',
            message: 'Specified payment method not found',
          };
        }
      } else {
        // Use default payment method
        paymentMethod = await PaymentMethod.findOne({
          userId,
          isDefault: true,
          isDeleted: false,
        })
          .lean()
          .exec();

        if (!paymentMethod) {
          return {
            success: false,
            error: 'NO_PAYMENT_METHOD',
            message: 'No default payment method found. Please set up a payment method.',
          };
        }
      }

      return {
        success: true,
        paymentMethod,
      };
    } catch (error) {
      console.error(`[PrizeClaimService] Error getting payment method: ${error.message}`);
      return {
        success: false,
        error: 'PAYMENT_METHOD_FAILED',
        message: 'Failed to retrieve payment method',
      };
    }
  }

  /**
   * Send claim confirmation email
   *
   * @param {Object} winner - Winner user object
   * @param {Object} drawing - Drawing record
   * @param {string} claimId - Claim ID
   * @returns {Promise<Object>} Email send result
   */
  async sendClaimConfirmationEmail(winner, drawing, claimId) {
    try {
      // Get submission for entry breakdown
      const submission = await SweepstakesSubmission.findById(drawing.winningSubmissionId)
        .lean()
        .exec();

      const breakdown = submission
        ? {
            campaigns: submission.entrySources.campaignCreated.count,
            donations: submission.entrySources.donations.count,
            shares: submission.entrySources.shares.count,
            qrScans: submission.entrySources.qrScans.count,
          }
        : { campaigns: 0, donations: 0, shares: 0, qrScans: 0 };

      const prizeAmount = (drawing.prizeAmount / 100).toFixed(2);

      const emailData = {
        to: winner.email,
        subject: `🎉 Your Prize of $${prizeAmount} Has Been Claimed!`,
        template: 'sweepstakes-claim-confirmation',
        data: {
          firstName: winner.firstName,
          claimId,
          prizeAmount,
          claimedAt: new Date().toLocaleDateString(),
          entryBreakdown: breakdown,
          totalEntries: submission?.entryCount || 0,
          drawingPeriod: drawing.drawingPeriod,
          transferTimeline: '1-3 business days',
          transactionId: claimId,
        },
      };

      const result = await emailService.send(emailData);

      if (result.success) {
        console.log(`[PrizeClaimService] Claim confirmation email sent: ${winner.email}`);
        return { success: true };
      }

      return {
        success: false,
        error: result.error,
        message: 'Failed to send confirmation email',
      };
    } catch (error) {
      console.error(
        `[PrizeClaimService] Error sending confirmation email: ${error.message}`
      );
      return {
        success: false,
        error: 'EMAIL_FAILED',
        message: 'Failed to send confirmation email',
      };
    }
  }

  /**
   * Get past winners list (public, anonymized)
   *
   * @param {Object} options - Query options
   * @returns {Promise<Object>} Winners list
   */
  async getPastWinners(options = {}) {
    try {
      const { page = 1, limit = 10, status = 'claimed' } = options;
      const skip = (page - 1) * limit;

      console.log(`[PrizeClaimService] Fetching past winners: page=${page}, limit=${limit}`);

      // Build query
      const query = { status: 'notified' }; // Only show notified/claimed winners (not scheduled/drawn)

      if (status === 'claimed') {
        query.status = 'claimed';
      }

      // Get total count
      const totalCount = await SweepstakesDrawing.countDocuments(query).exec();

      // Get draws with winner names (populate user)
      const winners = await SweepstakesDrawing.find(query)
        .populate('winningUserId', 'firstName lastName')
        .sort({ drawingDate: -1 })
        .skip(skip)
        .limit(limit)
        .lean()
        .exec();

      // Anonymize: first name + last initial only
      const anonymized = winners.map((winner) => ({
        drawingId: winner.drawingId,
        drawingPeriod: winner.drawingPeriod,
        drawingDate: winner.drawingDate,
        prizeAmount: winner.prizeAmount,
        prizeAmountFormatted: `$${(winner.prizeAmount / 100).toFixed(2)}`,
        winner: {
          // Anonymized name (first name + last initial)
          firstName: winner.winningUserId?.firstName,
          lastInitial: winner.winningUserId?.lastName?.charAt(0),
        },
        status: winner.status,
      }));

      return {
        success: true,
        winners: anonymized,
        totalCount,
        totalPages: Math.ceil(totalCount / limit),
      };
    } catch (error) {
      console.error(`[PrizeClaimService] Error fetching past winners: ${error.message}`);
      return {
        success: false,
        error: 'FETCH_FAILED',
        message: 'Failed to fetch winners list',
      };
    }
  }

  /**
   * Get admin current sweepstakes statistics
   *
   * @returns {Promise<Object>} Current stats
   */
  async getAdminCurrentStats() {
    try {
      console.log(`[PrizeClaimService] Fetching admin current stats`);

      // Get next drawing date
      const nextDrawing = await SweepstakesDrawing.findOne({
        status: 'scheduled',
      })
        .sort({ drawingDate: 1 })
        .lean()
        .exec();

      // Get current drawing period entries
      const currentPeriod = this.getCurrentDrawingPeriod();
      const submissions = await SweepstakesSubmission.find({
        drawingPeriod: currentPeriod,
        isValid: true,
      })
        .lean()
        .exec();

      const totalEntries = submissions.reduce((sum, sub) => sum + sub.entryCount, 0);
      const participantCount = submissions.length;

      // Get top contributors
      const topContributors = submissions
        .sort((a, b) => b.entryCount - a.entryCount)
        .slice(0, 5)
        .map((sub) => ({
          entryCount: sub.entryCount,
          percentage: ((sub.entryCount / totalEntries) * 100).toFixed(2),
        }));

      // Calculate fairness metrics
      const avgEntries = participantCount > 0 ? totalEntries / participantCount : 0;
      const maxEntries = Math.max(...submissions.map((s) => s.entryCount), 0);
      const concentrationRatio = maxEntries / totalEntries;

      return {
        success: true,
        stats: {
          nextDrawing: {
            date: nextDrawing?.drawingDate,
            period: nextDrawing?.drawingPeriod,
            daysUntil: nextDrawing
              ? Math.ceil((nextDrawing.drawingDate - new Date()) / (1000 * 60 * 60 * 24))
              : null,
          },
          currentStats: {
            entries: totalEntries,
            participants: participantCount,
            avgEntriesPerParticipant: avgEntries.toFixed(2),
            maxEntries,
          },
          fairnessMetrics: {
            concentrationRatio: (concentrationRatio * 100).toFixed(2) + '%',
            herfindahlIndex: this.calculateHHI(submissions.map((s) => s.entryCount / totalEntries)),
          },
          topContributors,
        },
      };
    } catch (error) {
      console.error(`[PrizeClaimService] Error fetching admin stats: ${error.message}`);
      return {
        success: false,
        error: 'STATS_FAILED',
        message: 'Failed to fetch current statistics',
      };
    }
  }

  /**
   * Get all drawings (admin only)
   *
   * @param {Object} options - Query options
   * @returns {Promise<Object>} All drawings
   */
  async getAdminAllDrawings(options = {}) {
    try {
      const { page = 1, limit = 25, status = 'all' } = options;
      const skip = (page - 1) * limit;

      console.log(`[PrizeClaimService] Fetching admin drawings: page=${page}`);

      // Build query
      const query = {};
      if (status !== 'all') {
        query.status = status;
      }

      // Get total
      const totalCount = await SweepstakesDrawing.countDocuments(query).exec();

      // Get drawings with full audit trail
      const drawings = await SweepstakesDrawing.find(query)
        .populate('winningUserId', 'firstName lastName email')
        .sort({ drawingDate: -1 })
        .skip(skip)
        .limit(limit)
        .lean()
        .exec();

      // Generate alerts
      const alerts = [];

      for (const drawing of drawings) {
        if (drawing.status === 'notified') {
          const daysUntilDeadline = Math.ceil(
            (drawing.claimDeadline - new Date()) / (1000 * 60 * 60 * 24)
          );

          if (daysUntilDeadline < 0) {
            // Expired
            alerts.push({
              type: 'CLAIM_EXPIRED',
              drawingId: drawing.drawingId,
              message: `Prize claim expired on ${drawing.claimDeadline.toDateString()}`,
              severity: 'warning',
            });
          } else if (daysUntilDeadline < 5) {
            // Expiring soon
            alerts.push({
              type: 'CLAIM_EXPIRING_SOON',
              drawingId: drawing.drawingId,
              message: `Prize claim expires in ${daysUntilDeadline} days`,
              severity: 'info',
            });
          }
        }
      }

      return {
        success: true,
        drawings: drawings.map((d) => ({
          drawingId: d.drawingId,
          period: d.drawingPeriod,
          drawingDate: d.drawingDate,
          prizeAmount: d.prizeAmount,
          totalParticipants: d.totalParticipants,
          totalEntries: d.totalEntries,
          status: d.status,
          winner: {
            userId: d.winningUserId._id,
            name: `${d.winningUserId.firstName} ${d.winningUserId.lastName}`,
            email: d.winningUserId.email,
          },
          winnerEntryCount: d.winnerEntryCount,
          notifiedAt: d.winnerNotifiedAt,
          claimedAt: d.claimedAt,
          claimDeadline: d.claimDeadline,
          randomSeed: d.randomSeed,
        })),
        pagination: {
          page,
          limit,
          totalCount,
          totalPages: Math.ceil(totalCount / limit),
        },
        alerts: alerts.slice(0, 10), // Return top 10 alerts
      };
    } catch (error) {
      console.error(`[PrizeClaimService] Error fetching admin drawings: ${error.message}`);
      return {
        success: false,
        error: 'DRAWINGS_FAILED',
        message: 'Failed to fetch drawings',
      };
    }
  }

  /**
   * Get user's sweepstakes history
   *
   * @param {string} userId - User ID
   * @returns {Promise<Object>} User's history
   */
  async getUserSweepstakesHistory(userId) {
    try {
      const drawings = await SweepstakesDrawing.find({
        winningUserId: userId,
      })
        .sort({ drawingDate: -1 })
        .lean()
        .exec();

      const stats = {
        totalWins: drawings.length,
        totalPrizeAmount: drawings.reduce((sum, d) => sum + d.prizeAmount, 0),
        claimedCount: drawings.filter((d) => d.status === 'claimed').length,
        pendingCount: drawings.filter((d) => d.status === 'notified').length,
        expiredCount: drawings.filter(
          (d) => d.status === 'unclaimed_expired'
        ).length,
      };

      return {
        success: true,
        drawings: drawings.map((d) => ({
          drawingId: d.drawingId,
          period: d.drawingPeriod,
          prizeAmount: d.prizeAmount,
          status: d.status,
          notifiedAt: d.winnerNotifiedAt,
          claimedAt: d.claimedAt,
          claimDeadline: d.claimDeadline,
          daysUntilExpiration:
            d.status === 'notified'
              ? Math.ceil((d.claimDeadline - new Date()) / (1000 * 60 * 60 * 24))
              : null,
        })),
        stats,
      };
    } catch (error) {
      console.error(`[PrizeClaimService] Error fetching user history: ${error.message}`);
      return {
        success: false,
        error: 'HISTORY_FAILED',
        message: 'Failed to fetch your history',
      };
    }
  }

  /**
   * Get claim details for user
   *
   * @param {string} userId - User ID
   * @param {string} drawingId - Drawing ID
   * @returns {Promise<Object>} Claim details
   */
  async getClaimDetails(userId, drawingId) {
    try {
      const drawing = await SweepstakesDrawing.findOne({
        drawingId,
        winningUserId: userId,
      })
        .lean()
        .exec();

      if (!drawing) {
        return {
          success: false,
          error: 'DRAWING_NOT_FOUND',
          message: 'Drawing not found',
        };
      }

      const daysUntilExpiration =
        drawing.status === 'notified'
          ? Math.ceil((drawing.claimDeadline - new Date()) / (1000 * 60 * 60 * 24))
          : null;

      return {
        success: true,
        claim: {
          drawingId: drawing.drawingId,
          drawingPeriod: drawing.drawingPeriod,
          drawingDate: drawing.drawingDate,
          prizeAmount: drawing.prizeAmount,
          prizeFormatted: `$${(drawing.prizeAmount / 100).toFixed(2)}`,
          status: drawing.status,
          claimDeadline: drawing.claimDeadline,
          daysUntilExpiration,
          claimedAt: drawing.claimedAt,
          winnerEntryCount: drawing.winnerEntryCount,
          winnerProbability: (drawing.winnerProbability * 100).toFixed(2) + '%',
        },
      };
    } catch (error) {
      console.error(`[PrizeClaimService] Error getting claim details: ${error.message}`);
      return {
        success: false,
        error: 'DETAILS_FAILED',
        message: 'Failed to retrieve claim details',
      };
    }
  }

  /**
   * Resend claim notification email
   *
   * @param {string} userId - User ID
   * @param {string} drawingId - Drawing ID
   * @returns {Promise<Object>} Resend result
   */
  async resendClaimNotification(userId, drawingId) {
    try {
      const drawing = await SweepstakesDrawing.findOne({
        drawingId,
        winningUserId: userId,
      })
        .populate('winningUserId', 'email firstName lastName')
        .lean()
        .exec();

      if (!drawing) {
        return {
          success: false,
          error: 'DRAWING_NOT_FOUND',
        };
      }

      // Resend notification email
      const emailResult = await this.sendClaimNotificationEmail(drawing);

      if (emailResult.success) {
        return { success: true, message: 'Notification email sent' };
      }

      return emailResult;
    } catch (error) {
      console.error(
        `[PrizeClaimService] Error resending notification: ${error.message}`
      );
      return {
        success: false,
        error: 'RESEND_FAILED',
      };
    }
  }

  /**
   * Send claim notification email (winner announcement)
   *
   * @param {Object} drawing - Drawing record (populated)
   * @returns {Promise<Object>} Email result
   */
  async sendClaimNotificationEmail(drawing) {
    try {
      const submission = await SweepstakesSubmission.findById(drawing.winningSubmissionId)
        .lean()
        .exec();

      const breakdown = submission
        ? {
            campaigns: submission.entrySources.campaignCreated.count,
            donations: submission.entrySources.donations.count,
            shares: submission.entrySources.shares.count,
            qrScans: submission.entrySources.qrScans.count,
          }
        : { campaigns: 0, donations: 0, shares: 0, qrScans: 0 };

      const prizeAmount = (drawing.prizeAmount / 100).toFixed(2);
      const claimUrl = `https://honestneed.com/sweepstakes/claim/${drawing.drawingId}`;

      const emailData = {
        to: drawing.winningUserId.email,
        subject: `🎉 You Won $${prizeAmount} in HonestNeed Sweepstakes!`,
        template: 'sweepstakes-winner-notification',
        data: {
          firstName: drawing.winningUserId.firstName,
          prizeAmount,
          entryBreakdown: breakdown,
          totalEntries: drawing.winnerEntryCount,
          claimUrl,
          claimDeadline: drawing.claimDeadline.toLocaleDateString(),
          daysRemaining: Math.ceil(
            (drawing.claimDeadline - new Date()) / (1000 * 60 * 60 * 24)
          ),
          drawingPeriod: drawing.drawingPeriod,
        },
      };

      const result = await emailService.send(emailData);
      return result;
    } catch (error) {
      console.error(`[PrizeClaimService] Error sending claim notification: ${error.message}`);
      return {
        success: false,
        error: 'EMAIL_FAILED',
      };
    }
  }

  /**
   * Calculate Herfindahl-Hirschman Index (HHI) for fairness
   *
   * HHI = sum of (market share)^2
   * Lower = more fair (max 10000 if monopoly)
   * For entries: sum of (entryCount/total)^2
   *
   * @param {Array<number>} shares - Array of market shares (0-1)
   * @returns {number} HHI value (0-10000)
   */
  calculateHHI(shares) {
    if (shares.length === 0) return 0;
    return shares.reduce((sum, share) => sum + Math.pow(share * 100, 2), 0);
  }

  /**
   * Get current drawing period (YYYY-MM format)
   *
   * @returns {string} Current period
   */
  getCurrentDrawingPeriod() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    return `${year}-${month}`;
  }

  /**
   * Log audit trail entry
   *
   * @param {Object} auditEntry - Audit log entry
   * @returns {Promise<void>}
   */
  async logAudit(auditEntry) {
    try {
      // Log to database or external audit service
      console.log(
        `[AUDIT] ${auditEntry.action}: ${auditEntry.error || 'SUCCESS'} - User: ${auditEntry.userId}`
      );

      // In production, would write to audit collection
      // await AuditLog.create(auditEntry);
    } catch (error) {
      console.error(`[PrizeClaimService] Error logging audit: ${error.message}`);
    }
  }
}

module.exports = new PrizeClaimService();
