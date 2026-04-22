const crypto = require('crypto');
const SweepstakesDrawing = require('../models/SweepstakesDrawing');
const SweepstakesSubmission = require('../models/SweepstakesSubmission');
const emailService = require('./emailService');

/**
 * DrawingService
 *
 * Implements weighted random selection for sweepstakes drawings
 * Uses Vose's Alias Method for O(1) fair distribution
 *
 * Algorithm:
 * 1. Collect all submissions with entry counts as weights
 * 2. Normalize probabilities (entry_count / total_entries)
 * 3. Build alias table for O(1) lookup
 * 4. Generate random selection
 * 5. Create drawing record & notify winner
 */

class DrawingService {
  /**
   * Vose's Alias Method Implementation
   *
   * Creates O(1) lookup structure for weighted random selection
   * Guarantees fairness: each entry has exactly equal probability
   *
   * @param {Array<number>} weights - Entry counts for each submission
   * @returns {Object} Alias table with J and q arrays
   *
   * Example: weights = [10, 20, 30] (total 60)
   * Returns structure for fair random selection
   */
  buildAliasTable(weights) {
    const n = weights.length;
    const total = weights.reduce((a, b) => a + b, 0);

    // Normalize weights to probabilities
    const probabilities = weights.map((w) => (w / total) * n);

    // Initialize J (alias) and q (probability) arrays
    const J = new Array(n);
    const q = new Array(n);

    // Separate indices into small and large
    const smaller = [];
    const larger = [];

    for (let i = 0; i < n; i++) {
      q[i] = probabilities[i];
      if (probabilities[i] < 1.0) {
        smaller.push(i);
      } else {
        larger.push(i);
      }
    }

    // Build alias table
    while (smaller.length > 0 && larger.length > 0) {
      const small = smaller.pop();
      const large = larger.pop();

      J[small] = large;
      q[large] = q[large] + q[small] - 1.0;

      if (q[large] < 1.0) {
        smaller.push(large);
      } else {
        larger.push(large);
      }
    }

    // Ensure all large probabilities are exactly 1.0 (handle floating point)
    for (const large of larger) {
      q[large] = 1.0;
    }

    return { J, q, total };
  }

  /**
   * Perform weighted random selection using alias table
   *
   * @param {Object} aliasTable - Result from buildAliasTable
   * @param {string} seed - Random seed for reproducibility
   * @returns {number} Index of selected item
   */
  selectFromAliasTable(aliasTable, seed) {
    const { J, q } = aliasTable;
    const n = J.length;

    // Generate random numbers from seed
    const random = this.seededRandom(seed);

    // Vose selection algorithm
    const i = Math.floor(random() * n); // Random slot
    const j = random(); // Random probability check

    return j < q[i] ? i : J[i];
  }

  /**
   * Seeded random number generator for reproducibility
   *
   * @param {string} seed - Seed string
   * @returns {Function} Random function returning 0-1
   */
  seededRandom(seed) {
    let m_w = 123456789;
    let m_z = 987654321;
    let mask = 0xffffffff;

    // Initialize with seed hash
    const hash = crypto.createHash('sha256').update(seed).digest();
    for (let i = 0; i < 4; i++) {
      m_w = (m_w + hash.readUInt32LE(i)) & mask;
      m_z = (m_z + hash.readUInt32LE((i + 4) % 32)) & mask;
    }

    return function () {
      m_z = (36969 * (m_z & 65535) + (m_z >> 16)) & mask;
      m_w = (18000 * (m_w & 65535) + (m_w >> 16)) & mask;
      let result = ((m_z << 16) + (m_w & 65535)) >>> 0;
      result /= 4294967296;
      return result;
    };
  }

  /**
   * Execute sweepstakes drawing for a period
   *
   * Main method that:
   * 1. Fetches all submissions
   * 2. Validates participants
   * 3. Performs weighted random selection
   * 4. Creates drawing record
   * 5. Notifies winner
   *
   * @param {string} drawingPeriod - Period (YYYY-MM)
   * @param {Object} options - Optional configuration
   * @param {number} options.prizeAmount - Prize in cents (default $500)
   * @param {string} options.executedBy - Admin user ID (if manual)
   * @returns {Promise<Object>} Drawing result
   *
   * Example:
   *   const drawing = await drawingService.executeDrawing('2026-06');
   */
  async executeDrawing(drawingPeriod, options = {}) {
    try {
      console.log(`[DrawingService] Starting drawing for period ${drawingPeriod}`);

      // Check if drawing already exists for this period
      const existingDrawing = await SweepstakesDrawing.findOne({ drawingPeriod }).exec();
      if (existingDrawing && existingDrawing.status !== 'error') {
        throw new Error(`Drawing already exists for period ${drawingPeriod}`);
      }

      // Fetch all valid submissions for period
      const submissions = await SweepstakesSubmission.find({
        drawingPeriod,
        isValid: true,
      }).exec();

      console.log(
        `[DrawingService] Found ${submissions.length} valid submissions for period ${drawingPeriod}`
      );

      // Validate enough entries
      if (submissions.length === 0) {
        console.warn(`[DrawingService] No submissions for period ${drawingPeriod}`);
        return {
          success: false,
          error: 'NO_ENTRIES',
          message: 'No valid entries for drawing',
        };
      }

      // Get entry counts and calculate total
      const weights = submissions.map((sub) => sub.entryCount);
      const totalEntries = weights.reduce((a, b) => a + b, 0);

      console.log(`[DrawingService] Total entries: ${totalEntries} across ${submissions.length} users`);

      // Generate random seed for reproducibility
      const randomSeed = `${drawingPeriod}-${Date.now()}-${Math.random()}`;

      // Build alias table for O(1) selection
      const aliasTable = this.buildAliasTable(weights);

      // Perform weighted random selection
      const selectedIndex = this.selectFromAliasTable(aliasTable, randomSeed);
      const winnerSubmission = submissions[selectedIndex];

      console.log(
        `[DrawingService] Winner selected: ${winnerSubmission.userId} with ${winnerSubmission.entryCount} entries`
      );

      // Calculate winner probability
      const winnerProbability = winnerSubmission.entryCount / totalEntries;

      // Create drawing record
      const prizeAmount = options.prizeAmount || 50000; // $500 in cents
      const claimDeadline = new Date();
      claimDeadline.setDate(claimDeadline.getDate() + 30);

      const drawing = new SweepstakesDrawing({
        drawingPeriod,
        drawingDate: new Date(),
        prizeAmount,
        totalParticipants: submissions.length,
        totalEntries,
        winningUserId: winnerSubmission.userId,
        winningSubmissionId: winnerSubmission._id,
        winnerEntryCount: winnerSubmission.entryCount,
        winnerProbability,
        randomSeed,
        claimDeadline,
        metadata: {
          source: options.executedBy ? 'manual_admin' : 'scheduled_job',
          executedBy: options.executedBy,
        },
      });

      await drawing.save();

      console.log(`[DrawingService] Drawing record created: ${drawing.drawingId}`);

      // Send winner notification (with retry logic)
      const notificationResult = await this.notifyWinner(drawing, winnerSubmission);

      if (notificationResult.success) {
        await drawing.markNotified().save();
        console.log(`[DrawingService] Winner notified successfully`);
      } else {
        console.warn(`[DrawingService] Winner notification failed: ${notificationResult.error}`);
        drawing.recordError(
          'NOTIFICATION_FAILED',
          notificationResult.error,
          notificationResult.stack
        );
        await drawing.save();
      }

      // Emit event
      const eventData = {
        drawingId: drawing.drawingId,
        drawingPeriod,
        winnerUserId: winnerSubmission.userId,
        prizeAmount,
        totalParticipants: submissions.length,
        totalEntries,
      };

      console.log(`[DrawingService] Drawing completed: ${JSON.stringify(eventData)}`);

      return {
        success: true,
        drawingId: drawing.drawingId,
        winnerUserId: winnerSubmission.userId.toString(),
        winnerEntries: winnerSubmission.entryCount,
        prizeAmount,
        totalParticipants: submissions.length,
        totalEntries,
        winnerNotified: notificationResult.success,
      };
    } catch (error) {
      console.error(`[DrawingService] Error executing drawing: ${error.message}`);
      return {
        success: false,
        error: 'DRAWING_EXECUTION_FAILED',
        message: error.message,
        stack: error.stack,
      };
    }
  }

  /**
   * Send winner notification email
   *
   * Includes breakdown of entries and claim instructions
   *
   * @param {Object} drawing - Drawing record
   * @param {Object} submission - Winning submission
   * @returns {Promise<Object>} Notification result
   */
  async notifyWinner(drawing, submission) {
    try {
      // Get user details
      const User = require('../models/User');
      const user = await User.findById(submission.userId).lean().exec();

      if (!user) {
        throw new Error('Winner user not found');
      }

      // Build entry breakdown
      const breakdown = {
        campaigns: submission.entrySources.campaignCreated.count,
        donations: submission.entrySources.donations.count,
        shares: Math.round(submission.entrySources.shares.count * 10) / 10,
        qrScans: submission.entrySources.qrScans.count,
      };

      // Build claim URL
      const claimUrl = `https://honestneed.com/sweepstakes/claim/${drawing.drawingId}`;
      const claimDeadlineDate = drawing.claimDeadline.toLocaleDateString();
      const prizeAmount = (drawing.prizeAmount / 100).toFixed(2);

      // Email template
      const emailContent = {
        to: user.email,
        subject: `🎉 YOU WON $${prizeAmount} in HonestNeed Sweepstakes!`,
        template: 'sweepstakes-winner-notification',
        data: {
          firstName: user.firstName,
          prizeAmount,
          entryBreakdown: breakdown,
          totalEntries: submission.entryCount,
          claimUrl,
          claimDeadline: claimDeadlineDate,
          daysRemaining: drawing.daysUntilDeadline,
          drawingPeriod: drawing.drawingPeriod,
          instructions: `Congratulations! Your ${submission.entryCount} entries won the HonestNeed monthly sweepstakes drawing!`,
        },
      };

      // Send email with retry logic (3 attempts)
      let lastError = null;
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          const result = await emailService.send(emailContent);

          if (result.success) {
            drawing.notificationAttempts = attempt;
            console.log(
              `[DrawingService] Notification sent on attempt ${attempt} for ${user.email}`
            );
            return { success: true };
          }

          lastError = result.error;
        } catch (error) {
          lastError = error.message;
          console.warn(
            `[DrawingService] Notification attempt ${attempt} failed: ${error.message}`
          );

          if (attempt < 3) {
            // Wait before retry (exponential backoff)
            await new Promise((resolve) =>
              setTimeout(resolve, Math.pow(2, attempt) * 1000)
            );
          }
        }
      }

      // All retries failed
      drawing.notificationErrors.push({
        attempt: 3,
        error: lastError,
        timestamp: new Date(),
      });

      throw new Error(`Failed to send notification after 3 attempts: ${lastError}`);
    } catch (error) {
      console.error(`[DrawingService] Error notifying winner: ${error.message}`);
      return {
        success: false,
        error: error.message,
        stack: error.stack,
      };
    }
  }

  /**
   * Mark expired unclaimed prizes
   *
   * Called daily to identify prizes that passed deadline
   *
   * @returns {Promise<Object>} Update result
   */
  async markExpiredPrizes() {
    try {
      const now = new Date();

      const result = await SweepstakesDrawing.updateMany(
        {
          status: 'notified',
          claimDeadline: { $lt: now },
        },
        {
          status: 'unclaimed_expired',
          claimReason: 'deadline_passed',
          updatedAt: now,
        }
      ).exec();

      console.log(
        `[DrawingService] Marked ${result.modifiedCount} prizes as expired`
      );

      return {
        success: true,
        expiredCount: result.modifiedCount,
      };
    } catch (error) {
      console.error(`[DrawingService] Error marking expired prizes: ${error.message}`);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Get drawing result info for user
   *
   * @param {string} drawingId - Drawing ID
   * @returns {Promise<Object>} Drawing info
   */
  async getDrawingInfo(drawingId) {
    try {
      const drawing = await SweepstakesDrawing.findOne({ drawingId })
        .populate('winningUserId', 'firstName email')
        .lean()
        .exec();

      if (!drawing) {
        return {
          success: false,
          error: 'DRAWING_NOT_FOUND',
        };
      }

      return {
        success: true,
        drawing: {
          drawingId: drawing.drawingId,
          period: drawing.drawingPeriod,
          drawingDate: drawing.drawingDate,
          prizeAmount: drawing.prizeAmount,
          winnerName: drawing.winningUserId?.firstName,
          status: drawing.status,
          totalParticipants: drawing.totalParticipants,
          totalEntries: drawing.totalEntries,
          claimDeadline: drawing.claimDeadline,
        },
      };
    } catch (error) {
      console.error(`[DrawingService] Error getting drawing info: ${error.message}`);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Get drawing stats for admin
   *
   * @param {string} drawingPeriod - Period (YYYY-MM)
   * @returns {Promise<Object>} Statistics
   */
  async getDrawingStats(drawingPeriod) {
    try {
      const drawing = await SweepstakesDrawing.findOne({ drawingPeriod })
        .lean()
        .exec();

      if (!drawing) {
        return {
          success: false,
          error: 'NO_DRAWING',
        };
      }

      return {
        success: true,
        stats: {
          drawingId: drawing.drawingId,
          period: drawing.drawingPeriod,
          status: drawing.status,
          prizeAmount: drawing.prizeAmount,
          totalParticipants: drawing.totalParticipants,
          totalEntries: drawing.totalEntries,
          winnerProbability: (drawing.winnerProbability * 100).toFixed(2) + '%',
          notifiedAt: drawing.winnerNotifiedAt,
          claimedAt: drawing.claimedAt,
          daysUntilDeadline: drawing.daysUntilDeadline,
        },
      };
    } catch (error) {
      console.error(`[DrawingService] Error getting drawing stats: ${error.message}`);
      return {
        success: false,
        error: error.message,
      };
    }
  }
}

module.exports = new DrawingService();
