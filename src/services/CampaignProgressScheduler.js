/**
 * Campaign Progress Scheduler
 * Schedules daily aggregation of campaign metrics
 * 
 * Runs daily at midnight UTC to create snapshots for analytics
 * Supports manual triggering and monitoring
 */

const node_cron = require('node-cron');
const CampaignProgressService = require('../services/CampaignProgressService');
const { winstonLogger } = require('../utils/logger');

class CampaignProgressScheduler {
  constructor() {
    this.task = null;
    this.isEnabled = false;
    this.lastRun = null;
    this.nextRun = null;
  }

  /**
   * Initialize scheduler
   * Schedule: Daily at 00:00 UTC
   * Pattern: '0 0 * * *' (midnight UTC)
   */
  start() {
    if (this.isEnabled) {
      winstonLogger.warn('Campaign progress scheduler already running');
      return;
    }

    try {
      // Schedule job to run daily at midnight UTC
      // Pattern: minute hour day-of-month month day-of-week
      // '0 0 * * *' = 00:00:00 UTC every day
      this.task = node_cron.schedule('0 0 * * *', async () => {
        await this.executeDailyAggregation();
      });

      this.isEnabled = true;
      this.calculateNextRun();

      winstonLogger.info('Campaign progress scheduler started', {
        schedule: 'Daily at 00:00 UTC',
        nextRun: this.nextRun
      });

      // Emit ready event
      CampaignProgressService.emit('scheduler:started', {
        timestamp: new Date().toISOString(),
        nextRun: this.nextRun
      });
    } catch (error) {
      winstonLogger.error('Failed to start campaign progress scheduler', {
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Stop scheduler
   */
  stop() {
    if (this.task) {
      this.task.stop();
      this.isEnabled = false;
      winstonLogger.info('Campaign progress scheduler stopped');

      CampaignProgressService.emit('scheduler:stopped', {
        timestamp: new Date().toISOString()
      });
    }
  }

  /**
   * Execute daily aggregation
   * Called by cron job at midnight UTC
   * @private
   */
  async executeDailyAggregation() {
    try {
      winstonLogger.info('Executing scheduled daily campaign progress aggregation');

      const result = await CampaignProgressService.createDailySnapshots();

      this.lastRun = new Date();
      this.calculateNextRun();

      winstonLogger.info('Daily aggregation execution completed', {
        result,
        lastRun: this.lastRun,
        nextRun: this.nextRun
      });

      // Emit completion event
      CampaignProgressService.emit('aggregation:completed', {
        result,
        timestamp: this.lastRun,
        nextRun: this.nextRun
      });
    } catch (error) {
      winstonLogger.error('Daily aggregation execution failed', {
        error: error.message,
        timestamp: new Date().toISOString()
      });

      // Emit error event
      CampaignProgressService.emit('aggregation:failed', {
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  }

  /**
   * Manually trigger aggregation (admin/testing)
   * @returns {Promise<Object>} Aggregation result
   */
  async triggerManually() {
    try {
      winstonLogger.info('Manual aggregation triggered');
      const result = await CampaignProgressService.createDailySnapshots();

      this.lastRun = new Date();
      this.calculateNextRun();

      return {
        success: true,
        result,
        executedAt: this.lastRun,
        nextScheduledRun: this.nextRun
      };
    } catch (error) {
      winstonLogger.error('Manual aggregation failed', {
        error: error.message
      });

      return {
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Get scheduler status
   * @returns {Object} Scheduler status info
   */
  getStatus() {
    return {
      enabled: this.isEnabled,
      schedule: 'Daily at 00:00 UTC',
      lastRun: this.lastRun,
      nextRun: this.nextRun,
      isRunning: this.isEnabled && this.task !== null
    };
  }

  /**
   * Calculate next run time
   * @private
   */
  calculateNextRun() {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    tomorrow.setUTCHours(0, 0, 0, 0);

    this.nextRun = tomorrow;
  }
}

// Export singleton instance
const scheduler = new CampaignProgressScheduler();

module.exports = scheduler;
