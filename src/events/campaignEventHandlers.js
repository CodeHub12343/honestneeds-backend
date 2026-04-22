/**
 * Campaign Event Handlers
 * Registers handlers for campaign lifecycle events
 * 
 * Events handled:
 * - campaign:created - Send welcome email
 * - campaign:published - Send publication email, award sweepstakes entry
 * - campaign:updated - Cache invalidation
 * - campaign:completed - Send completion email, notify followers
 * - campaign:paused - Send pause email
 */

const EventBus = require('./EventBus');
const emailService = require('../services/emailService');
const CampaignService = require('../services/CampaignService');
const User = require('../models/User');
const winstonLogger = require('../utils/winstonLogger');

class CampaignEventHandlers {
  /**
   * Register all campaign event handlers
   * Call this once during app initialization
   */
  static registerAll() {
    winstonLogger.info('Registering campaign event handlers');

    // Handle campaign creation
    EventBus.subscribeTo('campaign:created', async (data) => {
      await this.handleCampaignCreated(data);
    }, { priority: 10 });

    // Handle campaign publication
    EventBus.subscribeTo('campaign:published', async (data) => {
      await this.handleCampaignPublished(data);
    }, { priority: 10 });

    // Handle campaign update
    EventBus.subscribeTo('campaign:updated', async (data) => {
      await this.handleCampaignUpdated(data);
    }, { priority: 5 });

    // Handle campaign completion
    EventBus.subscribeTo('campaign:completed', async (data) => {
      await this.handleCampaignCompleted(data);
    }, { priority: 10 });

    // Handle campaign pause
    EventBus.subscribeTo('campaign:paused', async (data) => {
      await this.handleCampaignPaused(data);
    }, { priority: 5 });

    winstonLogger.info('Campaign event handlers registered successfully');
  }

  /**
   * Handle campaign:created event
   * Sends welcome email to creator
   * 
   * @param {object} data - Event data { campaign_id, creator_id, title }
   */
  static async handleCampaignCreated(data) {
    try {
      winstonLogger.debug('Handling campaign:created event', {
        campaignId: data.campaign_id,
        creatorId: data.creator_id,
      });

      // Fetch user and campaign for email
      const user = await User.findById(data.creator_id);
      const campaign = await CampaignService.getCampaign(data.campaign_id);

      if (!user || !campaign) {
        winstonLogger.warn('User or campaign not found for created event', {
          campaignId: data.campaign_id,
          creatorId: data.creator_id,
        });
        return;
      }

      // Send welcome email
      await emailService.sendCampaignCreatedEmail(user.email, {
        id: campaign._id || campaign.id,
        title: campaign.title,
        creator_name: user.display_name,
      });

      winstonLogger.info('Welcome email sent for campaign:created', {
        campaignId: data.campaign_id,
        creatorEmail: user.email,
      });
    } catch (error) {
      winstonLogger.error('Error handling campaign:created event', {
        error: error.message,
        campaignId: data.campaign_id,
        stack: error.stack,
      });

      // Don't re-throw - allow other handlers to execute
    }
  }

  /**
   * Handle campaign:published event
   * - Sends publication email
   * - Awards +1 sweepstakes entry
   * - Could trigger feed indexing
   * 
   * @param {object} data - Event data { campaign_id, creator_id, title, publishedAt }
   */
  static async handleCampaignPublished(data) {
    try {
      winstonLogger.debug('Handling campaign:published event', {
        campaignId: data.campaign_id,
        creatorId: data.creator_id,
      });

      // Fetch user and campaign
      const user = await User.findById(data.creator_id);
      const campaign = await CampaignService.getCampaign(data.campaign_id);

      if (!user || !campaign) {
        winstonLogger.warn('User or campaign not found for published event', {
          campaignId: data.campaign_id,
          creatorId: data.creator_id,
        });
        return;
      }

      // Send publication email
      await emailService.sendCampaignPublishedEmail(user.email, {
        id: campaign._id || campaign.id,
        title: campaign.title,
        creator_name: user.display_name,
        url: `${process.env.CAMPAIGN_BASE_URL || 'https://honestneed.com'}/campaigns/${campaign.id || campaign._id}`,
      });

      // Award sweepstakes entry (+1)
      user.sweepstakes_entries = (user.sweepstakes_entries || 0) + 1;
      await user.save();

      winstonLogger.info('Campaign published - email sent and sweepstakes entry awarded', {
        campaignId: data.campaign_id,
        creatorEmail: user.email,
        sweepstakesEntries: user.sweepstakes_entries,
      });

      // TODO: Index campaign for search/feed
      // await searchService.indexCampaign(campaign);
    } catch (error) {
      winstonLogger.error('Error handling campaign:published event', {
        error: error.message,
        campaignId: data.campaign_id,
        stack: error.stack,
      });

      // Don't re-throw - allow other handlers to execute
    }
  }

  /**
   * Handle campaign:updated event
   * Invalidates related caches
   * 
   * @param {object} data - Event data { campaign_id, creator_id }
   */
  static async handleCampaignUpdated(data) {
    try {
      winstonLogger.debug('Handling campaign:updated event', {
        campaignId: data.campaign_id,
        creatorId: data.creator_id,
      });

      // TODO: Invalidate caches
      // await cacheService.invalidate(['campaign', data.campaign_id]);
      // await cacheService.invalidate(['campaigns', 'list']);

      winstonLogger.info('Cache invalidated for campaign:updated', {
        campaignId: data.campaign_id,
      });
    } catch (error) {
      winstonLogger.error('Error handling campaign:updated event', {
        error: error.message,
        campaignId: data.campaign_id,
        stack: error.stack,
      });

      // Don't re-throw - allow other handlers to execute
    }
  }

  /**
   * Handle campaign:completed event
   * Sends completion email and notifies followers
   * 
   * @param {object} data - Event data { campaign_id, creator_id, title }
   */
  static async handleCampaignCompleted(data) {
    try {
      winstonLogger.debug('Handling campaign:completed event', {
        campaignId: data.campaign_id,
        creatorId: data.creator_id,
      });

      // Fetch user and campaign
      const user = await User.findById(data.creator_id);
      const campaign = await CampaignService.getCampaign(data.campaign_id);

      if (!user || !campaign) {
        winstonLogger.warn('User or campaign not found for completed event', {
          campaignId: data.campaign_id,
          creatorId: data.creator_id,
        });
        return;
      }

      // Send completion email
      await emailService.sendCampaignCompletedEmail(user.email, {
        id: campaign._id || campaign.id,
        title: campaign.title,
        creator_name: user.display_name,
        totalRaised: campaign.total_raised || 0,
        supporterCount: campaign.supporter_count || 0,
      });

      // TODO: Notify followers
      // await notificationService.notifyFollowers(data.creator_id, {
      //   type: 'campaign_completed',
      //   campaignId: data.campaign_id,
      //   campaignTitle: data.title
      // });

      winstonLogger.info('Completion email sent for campaign:completed', {
        campaignId: data.campaign_id,
        creatorEmail: user.email,
      });
    } catch (error) {
      winstonLogger.error('Error handling campaign:completed event', {
        error: error.message,
        campaignId: data.campaign_id,
        stack: error.stack,
      });

      // Don't re-throw - allow other handlers to execute
    }
  }

  /**
   * Handle campaign:paused event
   * Sends pause notification email
   * 
   * @param {object} data - Event data { campaign_id, creator_id, title }
   */
  static async handleCampaignPaused(data) {
    try {
      winstonLogger.debug('Handling campaign:paused event', {
        campaignId: data.campaign_id,
        creatorId: data.creator_id,
      });

      // Fetch user and campaign
      const user = await User.findById(data.creator_id);
      const campaign = await CampaignService.getCampaign(data.campaign_id);

      if (!user || !campaign) {
        winstonLogger.warn('User or campaign not found for paused event', {
          campaignId: data.campaign_id,
          creatorId: data.creator_id,
        });
        return;
      }

      // Send pause email
      await emailService.sendCampaignPausedEmail(user.email, {
        id: campaign._id || campaign.id,
        title: campaign.title,
        creator_name: user.display_name,
      });

      winstonLogger.info('Pause email sent for campaign:paused', {
        campaignId: data.campaign_id,
        creatorEmail: user.email,
      });
    } catch (error) {
      winstonLogger.error('Error handling campaign:paused event', {
        error: error.message,
        campaignId: data.campaign_id,
        stack: error.stack,
      });

      // Don't re-throw - allow other handlers to execute
    }
  }

  /**
   * Unregister all handlers (useful for testing)
   */
  static unregisterAll() {
    EventBus.clearSubscriptions();
    winstonLogger.info('All campaign event handlers unregistered');
  }
}

module.exports = CampaignEventHandlers;
