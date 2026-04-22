/**
 * ScheduledActivationService.js
 * Manages campaign scheduling and scheduled activation jobs
 * Uses Bull queue for reliable job processing
 */

const Queue = require('bull')
const Campaign = require('../models/Campaign')
const { logger } = require('../utils/logger')

// Create job queue for scheduled activations
const scheduledActivationQueue = new Queue('campaign-scheduled-activation', process.env.REDIS_URL || 'redis://localhost:6379')

/**
 * ScheduledActivationService
 * Handles all scheduled campaign activation operations
 */
class ScheduledActivationService {
  /**
   * Schedule a campaign for future activation
   * @param {String} campaignId - Campaign MongoDB ID
   * @param {Date} scheduledTime - When to activate (must be future)
   * @returns {Promise<Object>} - Campaign with scheduled_activation_at set
   */
  static async scheduleCampaignActivation(campaignId, scheduledTime) {
    try {
      // Validate inputs
      if (!campaignId) throw new Error('Campaign ID required')
      if (!scheduledTime || !(scheduledTime instanceof Date)) {
        throw new Error('Valid Date required for scheduling')
      }
      if (scheduledTime <= new Date()) {
        throw new Error('Scheduled time must be in the future')
      }
      if (scheduledTime > new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)) {
        throw new Error('Cannot schedule more than 1 year in advance')
      }

      // Fetch campaign
      const campaign = await Campaign.findById(campaignId)
      if (!campaign) throw new Error('Campaign not found')
      if (campaign.status !== 'draft') {
        throw new Error('Only draft campaigns can be scheduled')
      }

      // Remove existing scheduled job if one exists
      if (campaign.scheduled_activation_job_id) {
        await this.cancelScheduledActivation(campaignId)
      }

      // Calculate delay from now to scheduled time (in milliseconds)
      const delayMs = scheduledTime.getTime() - Date.now()

      // Add job to Bull queue
      const job = await scheduledActivationQueue.add(
        { campaignId },
        {
          delay: delayMs,
          attempts: 3, // Retry 3 times if fails
          backoff: {
            type: 'exponential',
            delay: 2000, // Start with 2 second backoff
          },
          removeOnComplete: true, // Remove job after successful completion
          removeOnFail: false, // Keep failed jobs for debugging
        }
      )

      // Update campaign with scheduled activation info
      campaign.scheduled_activation_at = scheduledTime
      campaign.scheduled_activation_job_id = job.id.toString()
      await campaign.save()

      logger.info(`Campaign ${campaignId} scheduled for activation at ${scheduledTime.toISOString()}`)

      return {
        success: true,
        data: {
          campaignId,
          scheduledActivationAt: scheduledTime,
          jobId: job.id,
          scheduleId: campaign.scheduled_activation_job_id,
        },
      }
    } catch (error) {
      logger.error('Error scheduling campaign activation:', error)
      throw error
    }
  }

  /**
   * Cancel a scheduled activation
   * @param {String} campaignId - Campaign MongoDB ID
   * @returns {Promise<Object>} - Cancellation result
   */
  static async cancelScheduledActivation(campaignId) {
    try {
      const campaign = await Campaign.findById(campaignId)
      if (!campaign) throw new Error('Campaign not found')

      if (campaign.scheduled_activation_job_id) {
        // Remove job from queue
        const job = await scheduledActivationQueue.getJob(campaign.scheduled_activation_job_id)
        if (job) {
          await job.remove()
          logger.info(`Removed scheduled activation job for campaign ${campaignId}`)
        }

        // Clear campaign fields
        campaign.scheduled_activation_at = null
        campaign.scheduled_activation_job_id = null
        await campaign.save()
      }

      return {
        success: true,
        message: `Scheduled activation cancelled for campaign ${campaignId}`,
      }
    } catch (error) {
      logger.error('Error cancelling scheduled activation:', error)
      throw error
    }
  }

  /**
   * Get scheduled activation details
   * @param {String} campaignId - Campaign MongoDB ID
   * @returns {Promise<Object>} - Scheduled activation info
   */
  static async getScheduledActivation(campaignId) {
    try {
      const campaign = await Campaign.findById(campaignId)
      if (!campaign) throw new Error('Campaign not found')

      if (!campaign.scheduled_activation_at) {
        return { scheduled: false }
      }

      const jobId = campaign.scheduled_activation_job_id
      const job = await scheduledActivationQueue.getJob(jobId)

      return {
        scheduled: true,
        campaignId,
        scheduledActivationAt: campaign.scheduled_activation_at,
        jobId,
        status: job ? 'pending' : 'unknown',
        delayMs: campaign.scheduled_activation_at.getTime() - Date.now(),
      }
    } catch (error) {
      logger.error('Error getting scheduled activation:', error)
      throw error
    }
  }

  /**
   * Get all scheduled campaigns
   * @param {Object} filters - Query filters
   * @returns {Promise<Array>} - List of scheduled campaigns
   */
  static async getScheduledCampaigns(filters = {}) {
    try {
      const query = {
        scheduled_activation_at: { $exists: true, $ne: null },
        is_deleted: false,
      }

      // Apply optional filters
      if (filters.creatorId) {
        query.creator_id = filters.creatorId
      }

      const campaigns = await Campaign.find(query)
        .sort({ scheduled_activation_at: 1 })
        .lean()

      return campaigns.map(c => ({
        campaignId: c._id,
        title: c.title,
        scheduledActivationAt: c.scheduled_activation_at,
        status: 'scheduled',
        delayMs: c.scheduled_activation_at.getTime() - Date.now(),
      }))
    } catch (error) {
      logger.error('Error getting scheduled campaigns:', error)
      throw error
    }
  }

  /**
   * Reschedule an existing activation
   * @param {String} campaignId - Campaign MongoDB ID
   * @param {Date} newScheduledTime - New scheduled time
   * @returns {Promise<Object>} - Updated schedule
   */
  static async rescheduleActivation(campaignId, newScheduledTime) {
    try {
      await this.cancelScheduledActivation(campaignId)
      return await this.scheduleCampaignActivation(campaignId, newScheduledTime)
    } catch (error) {
      logger.error('Error rescheduling activation:', error)
      throw error
    }
  }

  /**
   * Initialize Bull queue processors
   * This should be called once on server startup
   */
  static initializeQueueProcessor() {
    // Process scheduled activation jobs
    scheduledActivationQueue.process(async (job) => {
      try {
        const { campaignId } = job.data
        logger.info(`Processing scheduled activation for campaign ${campaignId}`)

        const campaign = await Campaign.findById(campaignId)
        if (!campaign) {
          throw new Error(`Campaign ${campaignId} not found`)
        }

        if (campaign.status !== 'draft') {
          logger.warn(`Campaign ${campaignId} is not in draft status, skipping activation`)
          return { skipped: true, reason: 'not_in_draft' }
        }

        // Activate campaign
        campaign.status = 'active'
        campaign.published_at = new Date()
        campaign.start_date = new Date()

        // Calculate end date based on duration
        const durationMs = (campaign.duration || 30) * 24 * 60 * 60 * 1000
        campaign.end_date = new Date(Date.now() + durationMs)

        // Clear scheduled fields
        campaign.scheduled_activation_at = null
        campaign.scheduled_activation_job_id = null

        await campaign.save()

        logger.info(`Campaign ${campaignId} activated successfully via scheduled job`)

        // Emit event for notifications (email, etc.)
        // You can integrate with your notification service here
        // await NotificationService.sendCampaignActivatedNotification(campaign)

        return { success: true, campaignId }
      } catch (error) {
        logger.error(`Error processing scheduled activation: ${error.message}`)
        throw error // Bull will retry
      }
    })

    // Handle job completion
    scheduledActivationQueue.on('completed', (job) => {
      logger.info(`Scheduled activation job ${job.id} completed`)
    })

    // Handle job failure
    scheduledActivationQueue.on('failed', (job, err) => {
      logger.error(`Scheduled activation job ${job.id} failed: ${err.message}`)
    })

    logger.info('Scheduled activation queue processor initialized')
  }

  /**
   * Get queue statistics for monitoring
   */
  static async getQueueStats() {
    try {
      const counts = await scheduledActivationQueue.getJobCounts()
      return {
        active: counts.active,
        waiting: counts.waiting,
        completed: counts.completed,
        failed: counts.failed,
        delayed: counts.delayed,
      }
    } catch (error) {
      logger.error('Error getting queue stats:', error)
      return {}
    }
  }
}

// Export queue and service
module.exports = ScheduledActivationService
module.exports.scheduledActivationQueue = scheduledActivationQueue
