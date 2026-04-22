const SweepstakesSubmission = require('../models/SweepstakesSubmission');

/**
 * SweepstakesRepository
 * 
 * Data access layer for sweepstakes submissions
 * Handles all database operations with proper indexing for performance
 */

class SweepstakesRepository {
  /**
   * Find sweep submission for user in a specific period
   *
   * @param {string} userId - User ID
   * @param {string} drawingPeriod - Drawing period (YYYY-MM)
   * @returns {Promise<Object|null>} Submission object or null
   *
   * Example:
   *   const submission = await repo.findSubmission('user-123', '2026-06');
   */
  async findSubmission(userId, drawingPeriod) {
    try {
      const submission = await SweepstakesSubmission.findOne({
        userId,
        drawingPeriod,
      })
        .lean()
        .exec();

      return submission;
    } catch (error) {
      console.error(
        `[SweepstakesRepository] Error finding submission for ${userId}: ${error.message}`
      );
      throw error;
    }
  }

  /**
   * Create new sweepstakes submission
   *
   * @param {Object} data - Submission data
   * @param {string} data.userId - User ID
   * @param {string} data.drawingPeriod - Drawing period (YYYY-MM)
   * @returns {Promise<Object>} Created submission
   *
   * Example:
   *   const submission = await repo.createSubmission({
   *     userId: 'user-123',
   *     drawingPeriod: '2026-06',
   *     entryCount: 0
   *   });
   */
  async createSubmission(data) {
    try {
      const submission = new SweepstakesSubmission({
        userId: data.userId,
        drawingPeriod: data.drawingPeriod,
        entryCount: data.entryCount || 0,
        entrySources: {
          campaignCreated: { count: 0, claimed: false },
          donations: { count: 0, totalAmount: 0, donationIds: [] },
          shares: { count: 0, sharesRecorded: 0, shareIds: [] },
          qrScans: { count: 0 },
        },
        entryHistory: [],
        validationFlags: [],
      });

      await submission.save();

      console.log(`[SweepstakesRepository] Created submission for ${data.userId}`);
      return submission.toObject();
    } catch (error) {
      console.error(
        `[SweepstakesRepository] Error creating submission: ${error.message}`
      );
      throw error;
    }
  }

  /**
   * Update sweepstakes submission
   *
   * @param {string} submissionId - Submission ID
   * @param {Object} updates - Fields to update
   * @returns {Promise<Object>} Updated submission
   *
   * Example:
   *   const updated = await repo.updateSubmission(submissionId, {
   *     entryCount: 42,
   *     updatedAt: new Date()
   *   });
   */
  async updateSubmission(submissionId, updates) {
    try {
      const submission = await SweepstakesSubmission.findByIdAndUpdate(
        submissionId,
        { ...updates, updatedAt: new Date() },
        { new: true, runValidators: true }
      ).exec();

      if (!submission) {
        throw new Error('Submission not found');
      }

      console.log(
        `[SweepstakesRepository] Updated submission ${submissionId}`
      );
      return submission.toObject();
    } catch (error) {
      console.error(
        `[SweepstakesRepository] Error updating submission: ${error.message}`
      );
      throw error;
    }
  }

  /**
   * Find all submissions for a drawing period
   *
   * @param {string} drawingPeriod - Drawing period (YYYY-MM)
   * @param {Object} options - Query options
   * @param {number} options.limit - Limit results
   * @param {number} options.skip - Skip results
   * @param {boolean} options.validOnly - Only valid submissions
   * @returns {Promise<Array>} Array of submissions
   *
   * Example:
   *   const submissions = await repo.findSubmissionsByPeriod('2026-06', {
   *     validOnly: true,
   *     limit: 100,
   *     skip: 0
   *   });
   */
  async findSubmissionsByPeriod(drawingPeriod, options = {}) {
    try {
      const query = { drawingPeriod };

      if (options.validOnly === true) {
        query.isValid = true;
      }

      const submissions = await SweepstakesSubmission.find(query)
        .limit(options.limit || 0)
        .skip(options.skip || 0)
        .sort({ entryCount: -1 })
        .lean()
        .exec();

      return submissions;
    } catch (error) {
      console.error(
        `[SweepstakesRepository] Error finding submissions for period ${drawingPeriod}: ${error.message}`
      );
      throw error;
    }
  }

  /**
   * Count total entries for a drawing period
   *
   * @param {string} drawingPeriod - Drawing period (YYYY-MM)
   * @param {Object} options - Query options
   * @param {boolean} options.validOnly - Only count valid entries
   * @returns {Promise<Object>} Entry counts and statistics
   *
   * Example:
   *   const stats = await repo.countEntriesByPeriod('2026-06', {
   *     validOnly: true
   *   });
   *   // Returns: {
   *   //   totalEntries: 5432,
   *   //   totalParticipants: 234,
   *   //   averageEntries: 23.2,
   *   //   maxEntries: 145
   *   // }
   */
  async countEntriesByPeriod(drawingPeriod, options = {}) {
    try {
      const query = { drawingPeriod };

      if (options.validOnly === true) {
        query.isValid = true;
      }

      const result = await SweepstakesSubmission.aggregate([
        { $match: query },
        {
          $group: {
            _id: null,
            totalEntries: { $sum: '$entryCount' },
            totalParticipants: { $sum: 1 },
            averageEntries: { $avg: '$entryCount' },
            maxEntries: { $max: '$entryCount' },
            minEntries: { $min: '$entryCount' },
          },
        },
      ]).exec();

      if (result.length === 0) {
        return {
          totalEntries: 0,
          totalParticipants: 0,
          averageEntries: 0,
          maxEntries: 0,
          minEntries: 0,
        };
      }

      return {
        totalEntries: result[0].totalEntries || 0,
        totalParticipants: result[0].totalParticipants || 0,
        averageEntries: Math.round(result[0].averageEntries * 100) / 100,
        maxEntries: result[0].maxEntries || 0,
        minEntries: result[0].minEntries || 0,
      };
    } catch (error) {
      console.error(
        `[SweepstakesRepository] Error counting entries for period ${drawingPeriod}: ${error.message}`
      );
      throw error;
    }
  }

  /**
   * Get top participants by entry count
   *
   * @param {string} drawingPeriod - Drawing period (YYYY-MM)
   * @param {number} limit - Number of top participants to return
   * @returns {Promise<Array>} Array of top participants
   *
   * Example:
   *   const topParticipants = await repo.getTopParticipants('2026-06', 10);
   */
  async getTopParticipants(drawingPeriod, limit = 10) {
    try {
      const participants = await SweepstakesSubmission.find({
        drawingPeriod,
        isValid: true,
      })
        .limit(limit)
        .sort({ entryCount: -1 })
        .select('userId entryCount breakdown')
        .lean()
        .exec();

      return participants;
    } catch (error) {
      console.error(
        `[SweepstakesRepository] Error getting top participants: ${error.message}`
      );
      throw error;
    }
  }

  /**
   * Get user's entry breakdown across all periods
   *
   * @param {string} userId - User ID
   * @returns {Promise<Array>} Array of submissions by period
   *
   * Example:
   *   const history = await repo.getUserEntryHistory('user-123');
   */
  async getUserEntryHistory(userId) {
    try {
      const history = await SweepstakesSubmission.find({ userId })
        .sort({ drawingPeriod: -1 })
        .select('drawingPeriod entryCount breakdown createdAt')
        .lean()
        .exec();

      return history;
    } catch (error) {
      console.error(
        `[SweepstakesRepository] Error getting user entry history: ${error.message}`
      );
      throw error;
    }
  }

  /**
   * Bulk update submissions (for admin/maintenance)
   *
   * @param {string} drawingPeriod - Drawing period (YYYY-MM)
   * @param {Object} updates - Fields to update
   * @param {Object} filter - Additional filter conditions
   * @returns {Promise<Object>} Update result
   *
   * Example:
   *   const result = await repo.bulkUpdateSubmissions('2026-06', {
   *     submittedAt: new Date()
   *   }, { isValid: true });
   */
  async bulkUpdateSubmissions(drawingPeriod, updates, filter = {}) {
    try {
      const query = { drawingPeriod, ...filter };

      const result = await SweepstakesSubmission.updateMany(query, updates).exec();

      console.log(
        `[SweepstakesRepository] Bulk updated ${result.modifiedCount} submissions`
      );
      return result;
    } catch (error) {
      console.error(
        `[SweepstakesRepository] Error bulk updating submissions: ${error.message}`
      );
      throw error;
    }
  }

  /**
   * Clear entries for a user (admin only)
   *
   * @param {string} userId - User ID
   * @param {string} drawingPeriod - Drawing period (YYYY-MM)
   * @returns {Promise<Object>} Deleted submission
   *
   * Example:
   *   const deleted = await repo.clearUserEntries('user-123', '2026-06');
   */
  async clearUserEntries(userId, drawingPeriod) {
    try {
      const deleted = await SweepstakesSubmission.findOneAndDelete({
        userId,
        drawingPeriod,
      }).exec();

      if (!deleted) {
        throw new Error('Submission not found');
      }

      console.log(
        `[SweepstakesRepository] Cleared entries for ${userId} in ${drawingPeriod}`
      );
      return deleted.toObject();
    } catch (error) {
      console.error(
        `[SweepstakesRepository] Error clearing user entries: ${error.message}`
      );
      throw error;
    }
  }

  /**
   * Check if user already claimed campaign bonus
   *
   * @param {string} userId - User ID
   * @param {string} drawingPeriod - Drawing period (YYYY-MM)
   * @returns {Promise<boolean>} True if already claimed
   *
   * Example:
   *   const claimed = await repo.hasCampaignBonus('user-123', '2026-06');
   */
  async hasCampaignBonus(userId, drawingPeriod) {
    try {
      const submission = await SweepstakesSubmission.findOne({
        userId,
        drawingPeriod,
        'entrySources.campaignCreated.claimed': true,
      })
        .lean()
        .exec();

      return !!submission;
    } catch (error) {
      console.error(
        `[SweepstakesRepository] Error checking campaign bonus: ${error.message}`
      );
      throw error;
    }
  }

  /**
   * Get flagged/invalid submissions for review
   *
   * @param {string} drawingPeriod - Drawing period (YYYY-MM)
   * @param {Object} options - Filter options
   * @returns {Promise<Array>} Array of flagged submissions
   *
   * Example:
   *   const flagged = await repo.getFlaggedSubmissions('2026-06');
   */
  async getFlaggedSubmissions(drawingPeriod, options = {}) {
    try {
      const query = {
        drawingPeriod,
        isValid: false,
      };

      const flagged = await SweepstakesSubmission.find(query)
        .limit(options.limit || 100)
        .skip(options.skip || 0)
        .sort({ updatedAt: -1 })
        .lean()
        .exec();

      return flagged;
    } catch (error) {
      console.error(
        `[SweepstakesRepository] Error getting flagged submissions: ${error.message}`
      );
      throw error;
    }
  }
}

module.exports = new SweepstakesRepository();
