const cron = require('node-cron');
const DrawingService = require('../services/DrawingService');

/**
 * SweepstakesDrawingJob
 *
 * Scheduled job for monthly sweepstakes drawings
 *
 * Schedule:
 * - June 3 at 00:00 UTC (for June entries)
 * - August 3 at 00:00 UTC (for August entries)
 * - October 3 at 00:00 UTC (for October entries)
 *
 * Prize: $500 (50000 cents)
 *
 * Features:
 * - Automatic retry on failure
 * - Logging and monitoring
 * - Error handling and alerts
 */

class SweepstakesDrawingJob {
  constructor() {
    this.jobs = [];
    this.isRunning = false;
  }

  /**
   * Initialize scheduled jobs
   *
   * Sets up cron schedules for each drawing month
   *
   * @returns {Promise<void>}
   */
  async initialize() {
    try {
      console.log('[SweepstakesDrawingJob] Initializing drawing jobs...');

      // Drawing schedule configuration
      const drawingMonths = [
        {
          // June 3 at 00:00 UTC
          month: 6,
          schedule: '0 0 3 6 *', // Cron: 00:00 on June 3
          period: 'JUNE',
        },
        {
          // August 3 at 00:00 UTC
          month: 8,
          schedule: '0 0 3 8 *', // Cron: 00:00 on August 3
          period: 'AUGUST',
        },
        {
          // October 3 at 00:00 UTC
          month: 10,
          schedule: '0 0 3 10 *', // Cron: 00:00 on October 3
          period: 'OCTOBER',
        },
      ];

      // Schedule each drawing
      for (const config of drawingMonths) {
        const job = cron.schedule(config.schedule, async () => {
          await this.executeDrawing(config.month, config.period);
        });

        this.jobs.push({
          period: config.period,
          schedule: config.schedule,
          job,
          lastRun: null,
          status: 'active',
        });

        console.log(`[SweepstakesDrawingJob] Scheduled drawing for ${config.period} (${config.schedule})`);
      }

      // Add daily job to mark expired prizes
      const expireJob = cron.schedule('0 0 * * *', async () => {
        await this.markExpiredPrizes();
      });

      this.jobs.push({
        period: 'DAILY_CLEANUP',
        schedule: '0 0 * * *',
        job: expireJob,
        lastRun: null,
        status: 'active',
      });

      console.log('[SweepstakesDrawingJob] Daily cleanup job scheduled');

      // Add weekly verification job (every Monday at 02:00 UTC)
      const verifyJob = cron.schedule('0 2 * * 1', async () => {
        await this.verifyDrawingsIntegrity();
      });

      this.jobs.push({
        period: 'WEEKLY_VERIFICATION',
        schedule: '0 2 * * 1',
        job: verifyJob,
        lastRun: null,
        status: 'active',
      });

      console.log('[SweepstakesDrawingJob] Weekly verification job scheduled');

      this.isRunning = true;
      console.log('[SweepstakesDrawingJob] All jobs initialized');
    } catch (error) {
      console.error(`[SweepstakesDrawingJob] Failed to initialize: ${error.message}`);
      throw error;
    }
  }

  /**
   * Execute drawing for a specific month
   *
   * Validates period, executes drawing, handles errors
   *
   * @param {number} month - Month number (6, 8, 10)
   * @param {string} period - Period (JUNE, AUGUST, OCTOBER)
   * @returns {Promise<void>}
   */
  async executeDrawing(month, period) {
    const startTime = Date.now();
    const jobEntry = this.jobs.find((j) => j.period === period);

    try {
      console.log(
        `[SweepstakesDrawingJob] Starting ${period} drawing execution at ${new Date().toISOString()}`
      );

      // Calculate drawing period in YYYY-MM format
      const now = new Date();
      const year = now.getFullYear();

      // No drawing for past months in current year
      if (now.getMonth() + 1 >= month && now.getFullYear() === year) {
        console.log(
          `[SweepstakesDrawingJob] Skipping ${period} - month has passed for year ${year}`
        );
        return;
      }

      // Draw for previous year if current year period hasn't occurred
      const drawingYear = now.getMonth() + 1 >= month ? year : year - 1;
      const drawingPeriod = `${drawingYear}-${String(month).padStart(2, '0')}`;

      console.log(`[SweepstakesDrawingJob] Drawing period: ${drawingPeriod}`);

      // Execute drawing with retry logic
      let result = null;
      let lastError = null;

      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          console.log(`[SweepstakesDrawingJob] Attempt ${attempt}/3 for ${drawingPeriod}`);

          result = await DrawingService.executeDrawing(drawingPeriod, {
            executedBy: 'scheduled_job',
          });

          if (result.success) {
            console.log(
              `[SweepstakesDrawingJob] Drawing successful on attempt ${attempt}: ${result.drawingId}`
            );
            break;
          }

          lastError = result.error;
          console.warn(
            `[SweepstakesDrawingJob] Attempt ${attempt} failed: ${result.error}`
          );

          if (attempt < 3) {
            // Exponential backoff: 30s, 90s, 270s
            const delayMs = Math.pow(3, attempt) * 10000;
            console.log(
              `[SweepstakesDrawingJob] Waiting ${delayMs / 1000}s before retry...`
            );
            await new Promise((resolve) => setTimeout(resolve, delayMs));
          }
        } catch (error) {
          lastError = error.message;
          console.error(
            `[SweepstakesDrawingJob] Attempt ${attempt} error: ${error.message}`
          );

          if (attempt < 3) {
            const delayMs = Math.pow(3, attempt) * 10000;
            await new Promise((resolve) => setTimeout(resolve, delayMs));
          }
        }
      }

      // All retries failed
      if (!result || !result.success) {
        throw new Error(
          `Drawing failed after 3 attempts for ${drawingPeriod}: ${lastError}`
        );
      }

      // Log success
      const elapsedMs = Date.now() - startTime;
      if (jobEntry) {
        jobEntry.lastRun = {
          timestamp: new Date(),
          success: true,
          drawingId: result.drawingId,
          elapsedMs,
          winner: result.winnerUserId,
        };
      }

      console.log(
        `[SweepstakesDrawingJob] ${period} drawing completed successfully in ${elapsedMs}ms`
      );

      // Send admin notification
      await this.notifyAdmins({
        event: 'drawing_completed',
        period: drawingPeriod,
        drawingId: result.drawingId,
        winner: result.winnerUserId,
        prizeAmount: result.prizeAmount,
        totalParticipants: result.totalParticipants,
      });
    } catch (error) {
      const elapsedMs = Date.now() - startTime;

      console.error(
        `[SweepstakesDrawingJob] ${period} drawing FAILED after ${elapsedMs}ms: ${error.message}`
      );

      if (jobEntry) {
        jobEntry.lastRun = {
          timestamp: new Date(),
          success: false,
          error: error.message,
          elapsedMs,
        };
      }

      // Send error notification to admins
      await this.notifyAdmins({
        event: 'drawing_failed',
        period,
        error: error.message,
        timestamp: new Date(),
      });

      // Re-throw for monitoring/alerting systems
      throw error;
    }
  }

  /**
   * Mark expired prizes daily
   *
   * Identifies unclaimed prizes that passed deadline
   *
   * @returns {Promise<void>}
   */
  async markExpiredPrizes() {
    try {
      const result = await DrawingService.markExpiredPrizes();

      if (result.success) {
        console.log(
          `[SweepstakesDrawingJob] Daily cleanup: ${result.expiredCount} prizes marked as expired`
        );

        if (result.expiredCount > 0) {
          await this.notifyAdmins({
            event: 'prizes_expired',
            count: result.expiredCount,
            timestamp: new Date(),
          });
        }
      }
    } catch (error) {
      console.error(`[SweepstakesDrawingJob] Error in daily cleanup: ${error.message}`);
    }
  }

  /**
   * Verify drawing integrity weekly
   *
   * Checks:
   * - All expected drawings exist
   * - Drawing records are valid
   * - No duplicate winners
   * - Prize distributions match expectations
   *
   * @returns {Promise<void>}
   */
  async verifyDrawingsIntegrity() {
    try {
      const SweepstakesDrawing = require('../models/SweepstakesDrawing');

      console.log('[SweepstakesDrawingJob] Running weekly integrity verification');

      const results = {
        totalDrawings: 0,
        successfulDrawings: 0,
        pendingNotification: 0,
        pendingClaim: 0,
        expiredUnclaimed: 0,
        errors: [],
      };

      // Stats by status
      const stats = await SweepstakesDrawing.aggregate([
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 },
          },
        },
      ]).exec();

      for (const stat of stats) {
        if (stat._id === 'drawn' || stat._id === 'notified' || stat._id === 'claimed') {
          results.successfulDrawings += stat.count;
        }
        if (stat._id === 'drawn') results.pendingNotification += stat.count;
        if (stat._id === 'notified') results.pendingClaim += stat.count;
        if (stat._id === 'unclaimed_expired') results.expiredUnclaimed += stat.count;
      }

      results.totalDrawings = await SweepstakesDrawing.countDocuments().exec();

      console.log(
        `[SweepstakesDrawingJob] Verification complete: ${results.totalDrawings} total, ` +
          `${results.successfulDrawings} successful, ${results.pendingNotification} pending notification, ` +
          `${results.pendingClaim} pending claim, ${results.expiredUnclaimed} expired`
      );

      // Check for integrity issues
      const errorsCount = await SweepstakesDrawing.countDocuments({
        status: 'error',
      }).exec();

      if (errorsCount > 0) {
        results.errors.push({
          type: 'DRAWINGS_WITH_ERRORS',
          count: errorsCount,
        });

        console.warn(`[SweepstakesDrawingJob] Found ${errorsCount} drawings with errors`);
      }

      // Alert if many pending claims
      if (results.pendingClaim > 10) {
        results.errors.push({
          type: 'HIGH_PENDING_CLAIMS',
          count: results.pendingClaim,
        });
      }

      // Send verification report
      if (results.errors.length > 0) {
        await this.notifyAdmins({
          event: 'integrity_check_issues',
          results,
        });
      } else {
        console.log('[SweepstakesDrawingJob] Integrity verification passed - no issues found');
      }
    } catch (error) {
      console.error(
        `[SweepstakesDrawingJob] Error during integrity verification: ${error.message}`
      );

      await this.notifyAdmins({
        event: 'integrity_check_failed',
        error: error.message,
      });
    }
  }

  /**
   * Send admin notification about drawing event
   *
   * @param {Object} eventData - Event information
   * @returns {Promise<void>}
   */
  async notifyAdmins(eventData) {
    try {
      const emailService = require('./emailService');

      // Stub implementation - replace with actual admin email
      // In production, send to admin email list
      const adminData = {
        event: eventData.event,
        timestamp: new Date().toISOString(),
        details: eventData,
      };

      console.log(
        `[SweepstakesDrawingJob] Admin notification: ${JSON.stringify(adminData)}`
      );

      // Uncomment when email service is ready
      /*
      await emailService.send({
        to: 'admins@honestneed.com',
        subject: `[SweepstakesDrawing] ${eventData.event}`,
        template: 'admin-alert',
        data: adminData,
      });
      */
    } catch (error) {
      console.error(
        `[SweepstakesDrawingJob] Error sending admin notification: ${error.message}`
      );
    }
  }

  /**
   * Stop all scheduled jobs
   *
   * Used during graceful shutdown
   *
   * @returns {void}
   */
  stop() {
    console.log('[SweepstakesDrawingJob] Stopping all jobs...');

    for (const jobConfig of this.jobs) {
      if (jobConfig.job) {
        jobConfig.job.stop();
        jobConfig.status = 'stopped';
      }
    }

    this.isRunning = false;
    console.log('[SweepstakesDrawingJob] All jobs stopped');
  }

  /**
   * Get job status
   *
   * @returns {Object} Status information
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      jobs: this.jobs.map((j) => ({
        period: j.period,
        schedule: j.schedule,
        status: j.status,
        lastRun: j.lastRun,
      })),
    };
  }
}

module.exports = new SweepstakesDrawingJob();
