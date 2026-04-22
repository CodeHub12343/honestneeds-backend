/**
 * Share Configuration Service
 * Manages share budget configuration and settings
 */

const Campaign = require('../models/Campaign');
const User = require('../models/User');
const winstonLogger = require('../utils/winstonLogger');

const MAX_CONFIG_UPDATE_INCREASE = 1000000; // $10,000 in cents
const CONFIG_UPDATE_RATE_LIMIT_WINDOW = 3600000; // 1 hour in ms
const VALID_CHANNELS = ['email', 'facebook', 'twitter', 'instagram', 'linkedin', 'sms', 'whatsapp', 'telegram', 'reddit', 'tiktok', 'other'];

class ShareConfigService {
  /**
   * Update share configuration for a campaign
   * @param {Object} params - Parameters object
   * @param {string} params.campaignId - Campaign ID
   * @param {string} params.creatorId - Creator User ID
   * @param {number} params.totalBudget - Total budget in cents (optional)
   * @param {number} params.amountPerShare - Amount per share in cents (optional)
   * @param {Array} params.shareChannels - Array of allowed channels (optional)
   * @returns {Promise<Object>} - Updated config result
   */
  static async updateShareConfig(params) {
    const { campaignId, creatorId, totalBudget, amountPerShare, shareChannels } = params;

    try {
      // Fetch campaign
      const campaign = await Campaign.findById(campaignId);
      if (!campaign) {
        throw {
          code: 'CAMPAIGN_NOT_FOUND',
          message: 'Campaign does not exist',
          statusCode: 404,
        };
      }

      // Verify creator owns campaign
      if (campaign.creator_id.toString() !== creatorId.toString()) {
        throw {
          code: 'UNAUTHORIZED',
          message: 'Only campaign creator can update share configuration',
          statusCode: 403,
        };
      }

      // Verify campaign is active
      if (campaign.status !== 'active') {
        throw {
          code: 'CAMPAIGN_NOT_ACTIVE',
          message: `Campaign is ${campaign.status}, configuration can only be updated for active campaigns`,
          statusCode: 409,
        };
      }

      // Check rate limiting: 1 update per hour
      if (campaign.share_config.last_config_update) {
        const timeSinceLastUpdate = Date.now() - campaign.share_config.last_config_update.getTime();
        if (timeSinceLastUpdate < CONFIG_UPDATE_RATE_LIMIT_WINDOW) {
          throw {
            code: 'CONFIG_UPDATE_RATE_LIMITED',
            message: `Configuration can only be updated once per hour. Try again in ${Math.ceil((CONFIG_UPDATE_RATE_LIMIT_WINDOW - timeSinceLastUpdate) / 1000)} seconds`,
            statusCode: 429,
          };
        }
      }

      // Initialize current config
      const currentConfig = campaign.share_config || {
        total_budget: 0,
        current_budget_remaining: 0,
        amount_per_share: 0,
        is_paid_sharing_active: false,
        share_channels: [],
      };

      // Validate and apply totalBudget changes
      if (totalBudget !== undefined) {
        if (typeof totalBudget !== 'number' || totalBudget < 0) {
          throw {
            code: 'INVALID_TOTAL_BUDGET',
            message: 'Total budget must be a non-negative number (in cents)',
            statusCode: 400,
          };
        }

        // Calculate increase/decrease
        const budgetDifference = totalBudget - (currentConfig.total_budget || 0);

        // Check max increase per update
        if (budgetDifference > MAX_CONFIG_UPDATE_INCREASE) {
          throw {
            code: 'BUDGET_INCREASE_EXCEEDED',
            message: `Maximum budget increase per update is $100.00 (${MAX_CONFIG_UPDATE_INCREASE} cents). Requested increase: $${(budgetDifference / 100).toFixed(2)}`,
            statusCode: 400,
          };
        }

        // If budget decreased below current remaining, adjust remaining
        if (totalBudget < currentConfig.current_budget_remaining) {
          currentConfig.current_budget_remaining = totalBudget;
        } else if (budgetDifference > 0) {
          // If budget increased, add difference to remaining
          currentConfig.current_budget_remaining += budgetDifference;
        }

        currentConfig.total_budget = totalBudget;
      }

      // Validate and apply amountPerShare
      if (amountPerShare !== undefined) {
        if (typeof amountPerShare !== 'number' || amountPerShare < 0) {
          throw {
            code: 'INVALID_AMOUNT_PER_SHARE',
            message: 'Amount per share must be a non-negative number (in cents)',
            statusCode: 400,
          };
        }

        // Max $100 per share
        if (amountPerShare > 10000) {
          throw {
            code: 'AMOUNT_PER_SHARE_EXCEEDED',
            message: 'Maximum amount per share is $100.00 (10000 cents). Requested: $' + (amountPerShare / 100).toFixed(2),
            statusCode: 400,
          };
        }

        currentConfig.amount_per_share = amountPerShare;

        // If amount per share is 0, disable paid sharing
        if (amountPerShare === 0) {
          currentConfig.is_paid_sharing_active = false;
        }
        // If amount per share > 0 and there's budget, enable paid sharing
        else if (currentConfig.current_budget_remaining > 0 && currentConfig.total_budget > 0) {
          currentConfig.is_paid_sharing_active = true;
        }
      }

      // Validate and apply shareChannels
      if (shareChannels !== undefined) {
        if (!Array.isArray(shareChannels) || shareChannels.length === 0) {
          throw {
            code: 'INVALID_SHARE_CHANNELS',
            message: 'Share channels must be a non-empty array',
            statusCode: 400,
          };
        }

        // Validate all channels are valid
        const invalidChannels = shareChannels.filter(ch => !VALID_CHANNELS.includes(ch));
        if (invalidChannels.length > 0) {
          throw {
            code: 'INVALID_SHARE_CHANNELS',
            message: `Invalid channels: ${invalidChannels.join(', ')}. Valid channels are: ${VALID_CHANNELS.join(', ')}`,
            statusCode: 400,
          };
        }

        currentConfig.share_channels = shareChannels;
      }

      // Ensure auto-disable if budget reaches 0
      if (currentConfig.current_budget_remaining <= 0) {
        currentConfig.is_paid_sharing_active = false;
      }

      // Update timestamps
      currentConfig.last_config_update = new Date();
      currentConfig.config_updated_by = creatorId;

      // Save campaign
      campaign.share_config = currentConfig;
      await campaign.save();

      winstonLogger.info('Share configuration updated', {
        campaignId,
        creatorId,
        totalBudget: currentConfig.total_budget,
        amountPerShare: currentConfig.amount_per_share,
        isPaidSharingActive: currentConfig.is_paid_sharing_active,
      });

      return {
        success: true,
        config: {
          totalBudget: currentConfig.total_budget,
          currentBudgetRemaining: currentConfig.current_budget_remaining,
          amountPerShare: currentConfig.amount_per_share,
          isPaidSharingActive: currentConfig.is_paid_sharing_active,
          shareChannels: currentConfig.share_channels,
        },
        message: 'Share configuration updated successfully',
      };
    } catch (error) {
      winstonLogger.error('Error updating share configuration', {
        error: error.message,
        campaignId,
        creatorId,
      });

      throw error;
    }
  }

  /**
   * Get current share configuration for a campaign
   * @param {string} campaignId - Campaign ID
   * @returns {Promise<Object>} - Current configuration
   */
  static async getShareConfig(campaignId) {
    try {
      const campaign = await Campaign.findById(campaignId);
      if (!campaign) {
        throw {
          code: 'CAMPAIGN_NOT_FOUND',
          message: 'Campaign does not exist',
          statusCode: 404,
        };
      }

      const config = campaign.share_config || {
        total_budget: 0,
        current_budget_remaining: 0,
        amount_per_share: 0,
        is_paid_sharing_active: false,
        share_channels: [],
      };

      return {
        success: true,
        config: {
          totalBudget: config.total_budget,
          currentBudgetRemaining: config.current_budget_remaining,
          amountPerShare: config.amount_per_share,
          isPaidSharingActive: config.is_paid_sharing_active,
          shareChannels: config.share_channels,
          lastConfigUpdate: config.last_config_update,
          configUpdatedBy: config.config_updated_by,
        },
      };
    } catch (error) {
      winstonLogger.error('Error fetching share configuration', {
        error: error.message,
        campaignId,
      });

      throw error;
    }
  }

  /**
   * Enable paid sharing for a campaign
   * @param {string} campaignId - Campaign ID
   * @param {string} creatorId - Creator User ID
   * @returns {Promise<Object>} - Result
   */
  static async enablePaidSharing(campaignId, creatorId) {
    try {
      const campaign = await Campaign.findById(campaignId);
      if (!campaign) {
        throw {
          code: 'CAMPAIGN_NOT_FOUND',
          message: 'Campaign does not exist',
          statusCode: 404,
        };
      }

      if (campaign.creator_id.toString() !== creatorId.toString()) {
        throw {
          code: 'UNAUTHORIZED',
          message: 'Only campaign creator can enable paid sharing',
          statusCode: 403,
        };
      }

      const config = campaign.share_config || {};

      // Can only enable if conditions met
      if (!config.total_budget || config.total_budget <= 0) {
        throw {
          code: 'INSUFFICIENT_BUDGET',
          message: 'Cannot enable paid sharing without budget allocation',
          statusCode: 400,
        };
      }

      if (!config.amount_per_share || config.amount_per_share <= 0) {
        throw {
          code: 'INVALID_AMOUNT_PER_SHARE',
          message: 'Cannot enable paid sharing without amount per share specified',
          statusCode: 400,
        };
      }

      campaign.share_config.is_paid_sharing_active = true;
      campaign.share_config.last_config_update = new Date();
      await campaign.save();

      winstonLogger.info('Paid sharing enabled', {
        campaignId,
        creatorId,
      });

      return {
        success: true,
        message: 'Paid sharing enabled successfully',
        isPaidSharingActive: true,
      };
    } catch (error) {
      winstonLogger.error('Error enabling paid sharing', {
        error: error.message,
        campaignId,
        creatorId,
      });

      throw error;
    }
  }

  /**
   * Disable paid sharing for a campaign
   * @param {string} campaignId - Campaign ID
   * @param {string} creatorId - Creator User ID
   * @returns {Promise<Object>} - Result
   */
  static async disablePaidSharing(campaignId, creatorId) {
    try {
      const campaign = await Campaign.findById(campaignId);
      if (!campaign) {
        throw {
          code: 'CAMPAIGN_NOT_FOUND',
          message: 'Campaign does not exist',
          statusCode: 404,
        };
      }

      if (campaign.creator_id.toString() !== creatorId.toString()) {
        throw {
          code: 'UNAUTHORIZED',
          message: 'Only campaign creator can disable paid sharing',
          statusCode: 403,
        };
      }

      campaign.share_config.is_paid_sharing_active = false;
      campaign.share_config.last_config_update = new Date();
      await campaign.save();

      winstonLogger.info('Paid sharing disabled', {
        campaignId,
        creatorId,
      });

      return {
        success: true,
        message: 'Paid sharing disabled successfully',
        isPaidSharingActive: false,
      };
    } catch (error) {
      winstonLogger.error('Error disabling paid sharing', {
        error: error.message,
        campaignId,
        creatorId,
      });

      throw error;
    }
  }
}

module.exports = ShareConfigService;
