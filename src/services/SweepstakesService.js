const sweepstakesRepository = require('../repositories/SweepstakesRepository');
const SweepstakesSubmission = require('../models/SweepstakesSubmission');

/**
 * SweepstakesService
 *
 * Main service for managing sweepstakes entries
 * Handles:
 * - Entry recording and tracking
 * - Period management
 * - Deduplication and fraud prevention
 * - Entry validation
 *
 * Entry allocation rules:
 * - Campaign created: +1 (once per user per period)
 * - Donation: +1 per donation (any amount)
 * - Share: +0.5 per share recorded
 * - QR scan: +1 per scan
 */

class SweepstakesService {
  /**
   * Add entry to sweepstakes submission
   *
   * Implements the core entry tracking logic with source-specific rules
   *
   * @param {string} userId - User ID
   * @param {string} entrySource - Type of entry (campaign_created, donation, share, qr_scan)
   * @param {Object} metadata - Additional data
   * @param {string} metadata.campaignId - For campaign_created source
   * @param {number} metadata.donationAmount - For donation source (in cents)
   * @param {string} metadata.donationId - For donation source
   * @param {string} metadata.shareId - For share source
   * @param {number} metadata.shareCount - For share source
   * @param {Object} userModel - User model for validation
   * @returns {Promise<Object>} Result: { entryCount, totalEntries, success, error }
   *
   * Example:
   *   const result = await sweepstakesService.addEntry(
   *     'user-123',
   *     'donation',
   *     {
   *       donationAmount: 5000,
   *       donationId: 'donation-456'
   *     },
   *     User
   *   );
   */
  async addEntry(userId, entrySource, metadata = {}, userModel) {
    try {
      console.log('🎯 [SweepstakesService.addEntry] START', {
        userId,
        entrySource,
        hasUserModel: !!userModel,
        metadata
      });

      // Validate user model provided
      if (!userModel) {
        console.error('❌ [SweepstakesService.addEntry] User model not provided');
        throw new Error('User model required for entry validation');
      }

      // CRITICAL: Server-side compliance check BEFORE adding entry
      // This enforces age/state restrictions at entry time
      console.log('🔍 [SweepstakesService.addEntry] Fetching user:', userId);
      const user = await userModel.findById(userId);
      if (!user) {
        console.error('❌ [SweepstakesService.addEntry] User not found:', userId);
        throw new Error('User not found');
      }

      console.log('✅ [SweepstakesService.addEntry] User found:', {
        userId: user._id,
        dateOfBirth: user.dateOfBirth ? 'YES' : 'NO',
        state: user.state || 'MISSING',
        status: user.status || 'MISSING'
      });

      // Age validation (18+)
      if (user.dateOfBirth) {
        const birthDate = new Date(user.dateOfBirth);
        const today = new Date();
        const age = today.getFullYear() - birthDate.getFullYear();
        const monthDiff = today.getMonth() - birthDate.getMonth();
        const actualAge = monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())
          ? age - 1
          : age;

        console.log('📅 [SweepstakesService.addEntry] Age check:', { actualAge });

        if (actualAge < 18) {
          console.log(`❌ [SweepstakesService.addEntry] Entry rejected: User ${userId} is underage (${actualAge})`);
          return {
            entryCount: 0,
            totalEntries: 0,
            success: false,
            error: 'UNDERAGE_INELIGIBLE',
            message: `User must be 18+ years old to participate (age: ${actualAge})`,
          };
        }
        console.log('✅ [SweepstakesService.addEntry] Age check passed:', { actualAge });
      } else {
        console.log(`❌ [SweepstakesService.addEntry] Entry rejected: User ${userId} missing date of birth`);
        return {
          entryCount: 0,
          totalEntries: 0,
          success: false,
          error: 'MISSING_DOB',
          message: 'Date of birth required for sweepstakes participation',
        };
      }

      // State validation (FL, NY, IL restricted)
      const restrictedStates = ['Florida', 'New York', 'Illinois'];
      console.log('🗺️ [SweepstakesService.addEntry] State check:', { userState: user.state });

      if (user.state && restrictedStates.includes(user.state)) {
        console.log(`❌ [SweepstakesService.addEntry] Entry rejected: User ${userId} in restricted state ${user.state}`);
        return {
          entryCount: 0,
          totalEntries: 0,
          success: false,
          error: 'GEO_RESTRICTED',
          message: `Sweepstakes not available in ${user.state}`,
        };
      }

      if (!user.state) {
        console.log(`❌ [SweepstakesService.addEntry] Entry rejected: User ${userId} missing state information`);
        return {
          entryCount: 0,
          totalEntries: 0,
          success: false,
          error: 'MISSING_STATE',
          message: 'State information required for sweepstakes participation',
        };
      }

      console.log('✅ [SweepstakesService.addEntry] State check passed:', { userState: user.state });

      // Account status validation (active/verified only)
      const validStatuses = ['active', 'verified'];
      console.log('👤 [SweepstakesService.addEntry] Account status check:', { userStatus: user.status });

      if (!validStatuses.includes(user.status)) {
        console.log(`❌ [SweepstakesService.addEntry] Entry rejected: User ${userId} account status ${user.status}`);
        return {
          entryCount: 0,
          totalEntries: 0,
          success: false,
          error: 'ACCOUNT_INACTIVE',
          message: `Account must be active to participate (status: ${user.status})`,
        };
      }

      console.log('✅ [SweepstakesService.addEntry] Account status check passed:', { userStatus: user.status });

      // Get current drawing period
      console.log('📅 [SweepstakesService.addEntry] Getting current drawing period...');
      const currentPeriod = SweepstakesSubmission.getCurrentDrawingPeriod();
      console.log('✅ [SweepstakesService.addEntry] Current period:', { currentPeriod });

      // Find or create submission for user in current period
      console.log('🔍 [SweepstakesService.addEntry] Finding submission for user in period:', { userId, currentPeriod });
      let submission = await sweepstakesRepository.findSubmission(
        userId,
        currentPeriod
      );

      if (!submission) {
        console.log('📝 [SweepstakesService.addEntry] Creating new submission:', { userId, currentPeriod });
        submission = await sweepstakesRepository.createSubmission({
          userId,
          drawingPeriod: currentPeriod,
          entryCount: 0,
        });
        console.log('✅ [SweepstakesService.addEntry] Submission created:', { submissionId: submission._id });
      } else {
        console.log('✅ [SweepstakesService.addEntry] Submission found:', { submissionId: submission._id, currentEntries: submission.entryCount });
      }

      // Update submission with fresh data for modification
      console.log('🔄 [SweepstakesService.addEntry] Loading submission document for modification...');
      let submissionDoc = await SweepstakesSubmission.findById(
        submission._id
      ).exec();

      if (!submissionDoc) {
        console.error('❌ [SweepstakesService.addEntry] Failed to load submission document:', submission._id);
        throw new Error('Failed to load submission for update');
      }

      console.log('✅ [SweepstakesService.addEntry] Submission document loaded');

      // Calculate entry amount based on source
      let entryAmount = 0;
      let sourceData = {};

      switch (entrySource) {
        case 'campaign_created':
          console.log('🎯 [SweepstakesService.addEntry] Processing campaign_created entry');
          // Rule: Campaign created = +1 entry ONCE per user per period
          if (submissionDoc.entrySources.campaignCreated.claimed === true) {
            console.log(
              `❌ [SweepstakesService] User ${userId} already claimed campaign bonus`
            );
            return {
              entryCount: submissionDoc.entryCount,
              totalEntries: submissionDoc.entryCount,
              success: false,
              error: 'CAMPAIGN_BONUS_ALREADY_CLAIMED',
              message: 'Campaign creation bonus already claimed this period',
            };
          }

          entryAmount = 1;
          submissionDoc.entrySources.campaignCreated.count = 1;
          submissionDoc.entrySources.campaignCreated.claimed = true;
          submissionDoc.entrySources.campaignCreated.claimedAt = new Date();
          sourceData = { campaignId: metadata.campaignId };

          console.log(
            `✅ [SweepstakesService] Campaign created entry: +${entryAmount} for ${userId}`
          );
          break;

        case 'donation':
          // Rule: Donation = +1 entry per donation, regardless of amount
          entryAmount = 1;
          submissionDoc.entrySources.donations.count += 1;
          submissionDoc.entrySources.donations.totalAmount +=
            metadata.donationAmount || 0;

          if (metadata.donationId) {
            submissionDoc.entrySources.donations.donationIds.push(
              metadata.donationId
            );
          }

          sourceData = {
            donationAmount: metadata.donationAmount || 0,
            donationId: metadata.donationId,
          };

          console.log(
            `[SweepstakesService] Donation entry: +${entryAmount} for ${userId} ($${(
              metadata.donationAmount || 0
            ) / 100})`
          );
          break;

        case 'share':
          // Rule: Share = +0.5 entry per share recorded
          const shareCount = metadata.shareCount || 1;
          entryAmount = shareCount * 0.5;
          submissionDoc.entrySources.shares.sharesRecorded += shareCount;
          submissionDoc.entrySources.shares.count += entryAmount;

          if (metadata.shareId) {
            submissionDoc.entrySources.shares.shareIds.push(metadata.shareId);
          }

          sourceData = {
            shareCount,
            shareId: metadata.shareId,
          };

          console.log(
            `[SweepstakesService] Share entry: +${entryAmount} (${shareCount} shares) for ${userId}`
          );
          break;

        case 'qr_scan':
          // Rule: QR scan = +1 entry per scan
          entryAmount = 1;
          submissionDoc.entrySources.qrScans.count += 1;
          sourceData = { campaignId: metadata.campaignId };

          console.log(
            `[SweepstakesService] QR scan entry: +${entryAmount} for ${userId}`
          );
          break;

        default:
          throw new Error(`Invalid entry source: ${entrySource}`);
      }

      // Add to entry count
      submissionDoc.entryCount += entryAmount;

      console.log('➕ [SweepstakesService.addEntry] Entry count updated:', {
        entrySource,
        entryAmount,
        newTotal: submissionDoc.entryCount,
        userId
      });

      // Add to entry history (audit trail)
      submissionDoc.entryHistory.push({
        source: entrySource,
        amount: entryAmount,
        sourceId: metadata.donationId || metadata.shareId || null,
        recordedAt: new Date(),
        metadata: sourceData,
      });

      console.log('📝 [SweepstakesService.addEntry] Entry history updated');

      // Check for suspicious activity (limit to reasonable max)
      if (submissionDoc.entryCount > 1000) {
        console.log(
          `⚠️ [SweepstakesService] Excessive entries detected for ${userId}: ${submissionDoc.entryCount}`
        );

        submissionDoc.isValid = false;
        submissionDoc.validationFlags.push({
          flag: 'excessive_entries',
          detectedAt: new Date(),
          reason: `Entry count exceeded limit: ${submissionDoc.entryCount}`,
        });
      }

      // Save updated submission
      console.log('💾 [SweepstakesService.addEntry] Saving submission to database...');
      await submissionDoc.save();
      console.log('✅ [SweepstakesService.addEntry] Submission saved successfully');

      const result = {
        entryCount: submissionDoc.entryCount,
        totalEntries: submissionDoc.entryCount,
        success: true,
        breakdown: {
          campaignCreated: submissionDoc.entrySources.campaignCreated.count,
          donations: submissionDoc.entrySources.donations.count,
          shares: submissionDoc.entrySources.shares.count,
          qrScans: submissionDoc.entrySources.qrScans.count,
        },
      };

      console.log('✅ [SweepstakesService.addEntry] Returning success result:', result);
      return result;

    } catch (error) {
      console.error(
        `❌ [SweepstakesService.addEntry] Error adding entry: ${error.message}`,
        { stack: error.stack, userId, entrySource }
      );
      return {
        success: false,
        error: 'ADD_ENTRY_FAILED',
        message: error.message,
      };
    }
  }

  /**
   * Validate sweepstakes submission
   *
   * Checks:
   * - User account is active (not suspended/deleted)
   * - User age 18+ (enforced at signup, stored in dateOfBirth)
   * - User not from restricted states (geo-blocking)
   * - Entry count is reasonable (no obvious cheating)
   *
   * @param {string} userId - User ID
   * @param {string} drawingPeriod - Drawing period (YYYY-MM)
   * @param {Object} userModel - User model
   * @returns {Promise<Object>} Validation result
   *
   * Example:
   *   const validation = await sweepstakesService.validateSubmission(
   *     'user-123',
   *     '2026-06',
   *     User
   *   );
   */
  async validateSubmission(userId, drawingPeriod, userModel) {
    try {
      // Get submission
      const submission = await SweepstakesSubmission.findOne({
        userId,
        drawingPeriod,
      }).exec();

      if (!submission) {
        return {
          valid: false,
          error: 'SUBMISSION_NOT_FOUND',
          flags: [],
        };
      }

      // Validate using model method
      await submission.validate(userModel);

      return {
        valid: submission.isValid,
        flags: submission.validationFlags,
        entryCount: submission.entryCount,
      };
    } catch (error) {
      console.error(
        `[SweepstakesService] Error validating submission: ${error.message}`
      );
      return {
        valid: false,
        error: 'VALIDATION_FAILED',
        message: error.message,
        flags: [],
      };
    }
  }

  /**
   * Get current submission for user
   *
   * Returns the user's current sweepstakes submission with all details
   *
   * @param {string} userId - User ID
   * @returns {Promise<Object>} Submission data or null
   *
   * Example:
   *   const submission = await sweepstakesService.getCurrentSubmission('user-123');
   */
  async getCurrentSubmission(userId) {
    try {
      const currentPeriod = SweepstakesSubmission.getCurrentDrawingPeriod();

      const submission = await sweepstakesRepository.findSubmission(
        userId,
        currentPeriod
      );

      if (!submission) {
        return null;
      }

      return {
        entryCount: submission.entryCount,
        period: submission.drawingPeriod,
        breakdown: {
          campaignCreated: submission.entrySources.campaignCreated.count,
          donations: submission.entrySources.donations.count,
          shares: submission.entrySources.shares.count,
          qrScans: submission.entrySources.qrScans.count,
        },
        isValid: submission.isValid,
        updatedAt: submission.updatedAt,
      };
    } catch (error) {
      console.error(
        `[SweepstakesService] Error getting submission: ${error.message}`
      );
      throw error;
    }
  }

  /**
   * Get drawing statistics for a period
   *
   * Returns aggregate statistics for all participants in a period
   *
   * @param {string} drawingPeriod - Drawing period (YYYY-MM)
   * @returns {Promise<Object>} Statistics
   *
   * Example:
   *   const stats = await sweepstakesService.getDrawingStats('2026-06');
   */
  async getDrawingStats(drawingPeriod) {
    try {
      const stats = await sweepstakesRepository.countEntriesByPeriod(
        drawingPeriod,
        { validOnly: true }
      );

      const topParticipants = await sweepstakesRepository.getTopParticipants(
        drawingPeriod,
        5
      );

      return {
        period: drawingPeriod,
        ...stats,
        topParticipants: topParticipants.map((p) => ({
          userId: p.userId,
          entryCount: p.entryCount,
          breakdown: p.breakdown,
        })),
      };
    } catch (error) {
      console.error(
        `[SweepstakesService] Error getting drawing stats: ${error.message}`
      );
      throw error;
    }
  }

  /**
   * Check if user is eligible for sweepstakes entry
   *
   * Quick validation check without modifying data
   *
   * @param {string} userId - User ID
   * @param {Object} userModel - User model
   * @returns {Promise<Object>} Eligibility result { eligible, reason }
   *
   * Example:
   *   const eligible = await sweepstakesService.checkEligibility('user-123', User);
   */
  async checkEligibility(userId, userModel) {
    try {
      const user = await userModel.findById(userId).lean().exec();

      if (!user) {
        return {
          eligible: false,
          reason: 'USER_NOT_FOUND',
        };
      }

      if (user.status === 'suspended' || user.status === 'deleted') {
        return {
          eligible: false,
          reason: 'ACCOUNT_SUSPENDED',
        };
      }

      // Age check
      if (user.dateOfBirth) {
        const age = new Date().getFullYear() - user.dateOfBirth.getFullYear();
        if (age < 18) {
          return {
            eligible: false,
            reason: 'UNDERAGE',
            age,
          };
        }
      }

      // Geo-check
      if (user.state && ['Florida', 'New York', 'Illinois'].includes(user.state)) {
        return {
          eligible: false,
          reason: 'GEO_RESTRICTED',
          state: user.state,
        };
      }

      return {
        eligible: true,
      };
    } catch (error) {
      console.error(
        `[SweepstakesService] Error checking eligibility: ${error.message}`
      );
      return {
        eligible: false,
        reason: 'ERROR',
        error: error.message,
      };
    }
  }

  /**
   * Get user entry history across all periods
   *
   * @param {string} userId - User ID
   * @returns {Promise<Array>} Array of submissions by period
   *
   * Example:
   *   const history = await sweepstakesService.getUserHistory('user-123');
   */
  async getUserHistory(userId) {
    try {
      return await sweepstakesRepository.getUserEntryHistory(userId);
    } catch (error) {
      console.error(
        `[SweepstakesService] Error getting user history: ${error.message}`
      );
      throw error;
    }
  }

  /**
   * Get period leaderboard (top participants)
   *
   * @param {string} drawingPeriod - Drawing period (YYYY-MM)
   * @param {number} limit - Number of top participants
   * @returns {Promise<Array>} Leaderboard entries
   *
   * Example:
   *   const leaderboard = await sweepstakesService.getLeaderboard('2026-06', 10);
   */
  async getLeaderboard(drawingPeriod, limit = 10) {
    try {
      const topParticipants = await sweepstakesRepository.getTopParticipants(
        drawingPeriod,
        limit
      );

      return topParticipants.map((p, index) => ({
        rank: index + 1,
        userId: p.userId,
        entryCount: p.entryCount,
        breakdown: p.breakdown,
      }));
    } catch (error) {
      console.error(
        `[SweepstakesService] Error getting leaderboard: ${error.message}`
      );
      throw error;
    }
  }

  /**
   * Submit entries for drawing (lock in submission)
   *
   * Once submitted, entries cannot be modified for that period
   *
   * @param {string} userId - User ID
   * @param {string} drawingPeriod - Drawing period (YYYY-MM)
   * @returns {Promise<Object>} Submitted submission
   *
   * Example:
   *   const submitted = await sweepstakesService.submitForDrawing('user-123', '2026-06');
   */
  async submitForDrawing(userId, drawingPeriod) {
    try {
      const submission = await SweepstakesSubmission.findOneAndUpdate(
        { userId, drawingPeriod },
        {
          submittedAt: new Date(),
          $set: { 'updatedAt': new Date() }
        },
        { new: true }
      ).exec();

      if (!submission) {
        throw new Error('Submission not found');
      }

      console.log(`[SweepstakesService] Submitted entries for ${userId}`);

      return {
        success: true,
        entryCount: submission.entryCount,
        submittedAt: submission.submittedAt,
      };
    } catch (error) {
      console.error(
        `[SweepstakesService] Error submitting for drawing: ${error.message}`
      );
      return {
        success: false,
        error: error.message,
      };
    }
  }
}

module.exports = new SweepstakesService();
