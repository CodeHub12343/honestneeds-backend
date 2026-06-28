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
// DEPRECATED (trust-based model, 2026-06-22): the $100 fundraising-goal floor for
// enabling share rewards was dropped so activation matches the wizard creation
// path exactly (reward set + budget covers one reward). Kept for reference only;
// `getFundraisingGoalCents` remains available as a helper.
// const MIN_GOAL_TO_ENABLE_REWARDS_CENTS = 10000;

class ShareConfigService {
  /**
   * U-5 funding indicator for a share_config. Tells the UI whether sharer
   * rewards are actually backed by funded money or still just a declared plan.
   * @param {Object} config - campaign.share_config
   * @returns {'funded'|'pending_funding'|'depleted'|'inactive'}
   */
  static getFundingStatus(config = {}) {
    // Trust-based model: status reflects the declared liability pool, not escrow.
    //   inactive  — no reward set yet
    //   exhausted — pool can't cover one more reward
    //   active    — covered and turned on
    //   paused    — covered but creator turned it off
    const remaining = config.committed_budget_remaining || 0;
    const perShare = config.amount_per_share || 0;
    if (!perShare) return 'inactive';
    if (remaining < perShare) return 'exhausted';
    return config.is_paid_sharing_active ? 'active' : 'paused';
  }

  /**
   * Total fundraising target (in cents) across a campaign's fundraising goals.
   * @param {Object} campaign
   * @returns {number}
   */
  static getFundraisingGoalCents(campaign) {
    return (campaign.goals || [])
      .filter((g) => g.goal_type === 'fundraising')
      .reduce((sum, g) => sum + (g.target_amount || 0), 0);
  }

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

      // Initialize current config (trust-based fields)
      const currentConfig = campaign.share_config || {
        total_budget: 0,
        committed_budget_remaining: 0,
        committed_total: 0,
        amount_per_share: 0,
        is_paid_sharing_active: false,
        share_channels: [],
      };

      // Back-compat: derive trust fields for legacy (escrow-era) configs.
      if (currentConfig.committed_total === undefined) currentConfig.committed_total = 0;
      if (currentConfig.committed_budget_remaining === undefined) {
        currentConfig.committed_budget_remaining = Math.max(
          0,
          (currentConfig.total_budget || 0) - (currentConfig.committed_total || 0)
        );
      }

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

        // Check max increase per update (fat-finger guard, not an escrow gate)
        if (budgetDifference > MAX_CONFIG_UPDATE_INCREASE) {
          throw {
            code: 'BUDGET_INCREASE_EXCEEDED',
            message: `Maximum budget increase per update is $${(MAX_CONFIG_UPDATE_INCREASE / 100).toFixed(2)}. Requested increase: $${(budgetDifference / 100).toFixed(2)}`,
            statusCode: 400,
          };
        }

        // Trust-based: `total_budget` IS the active declared reward pool. Setting
        // it directly resizes the liability counter — committed_budget_remaining
        // = declared pool minus rewards already accrued (committed_total). No
        // escrow, no reload required.
        currentConfig.total_budget = totalBudget;
        currentConfig.committed_budget_remaining = Math.max(
          0,
          totalBudget - (currentConfig.committed_total || 0)
        );
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

        // Activation is computed centrally below (trust-based), once all fields
        // are applied — so a combined budget + reward update resolves correctly.
        currentConfig.amount_per_share = amountPerShare;
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

      // Trust-based activation (single source of truth): paid sharing is live
      // whenever a reward is set AND the declared pool covers at least one
      // reward. Auto-pauses when exhausted. This is the SAME condition the wizard
      // creation path uses, so all entry points agree (no goal floor, no escrow).
      currentConfig.is_paid_sharing_active =
        currentConfig.amount_per_share > 0 &&
        currentConfig.committed_budget_remaining >= currentConfig.amount_per_share;

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
          committedBudgetRemaining: currentConfig.committed_budget_remaining,
          committedTotal: currentConfig.committed_total || 0,
          amountPerShare: currentConfig.amount_per_share,
          isPaidSharingActive: currentConfig.is_paid_sharing_active,
          fundingStatus: ShareConfigService.getFundingStatus(currentConfig),
          shareChannels: currentConfig.share_channels,
          // Back-compat aliases (legacy escrow field names → trust values).
          declaredBudget: currentConfig.total_budget,
          fundedBudgetAllocated: currentConfig.total_budget,
          currentBudgetRemaining: currentConfig.committed_budget_remaining,
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
        committed_budget_remaining: 0,
        committed_total: 0,
        amount_per_share: 0,
        is_paid_sharing_active: false,
        share_channels: [],
      };

      // Derive the liability counter for legacy (escrow-era) configs.
      const committedRemaining =
        config.committed_budget_remaining !== undefined
          ? config.committed_budget_remaining
          : Math.max(0, (config.total_budget || 0) - (config.committed_total || 0));

      return {
        success: true,
        config: {
          totalBudget: config.total_budget,
          committedBudgetRemaining: committedRemaining,
          committedTotal: config.committed_total || 0,
          amountPerShare: config.amount_per_share,
          isPaidSharingActive: config.is_paid_sharing_active,
          fundingStatus: ShareConfigService.getFundingStatus({
            ...(typeof config.toObject === 'function' ? config.toObject() : config),
            committed_budget_remaining: committedRemaining,
          }),
          shareChannels: config.share_channels,
          lastConfigUpdate: config.last_config_update,
          configUpdatedBy: config.config_updated_by,
          // Back-compat aliases (legacy escrow field names → trust values).
          declaredBudget: config.total_budget,
          fundedBudgetAllocated: config.total_budget,
          currentBudgetRemaining: committedRemaining,
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

      if (!config.amount_per_share || config.amount_per_share <= 0) {
        throw {
          code: 'INVALID_AMOUNT_PER_SHARE',
          message: 'Cannot enable paid sharing without amount per share specified',
          statusCode: 400,
        };
      }

      // Trust-based: require the DECLARED pool to cover at least one reward — no
      // escrow / reload needed. Derive the liability counter for legacy configs.
      const committedRemaining =
        config.committed_budget_remaining !== undefined
          ? config.committed_budget_remaining
          : Math.max(0, (config.total_budget || 0) - (config.committed_total || 0));
      if (committedRemaining < config.amount_per_share) {
        throw {
          code: 'INSUFFICIENT_BUDGET',
          message:
            'Your declared reward budget cannot cover a single reward. Increase the budget to enable paid sharing.',
          statusCode: 400,
        };
      }

      // Persist the derived liability counter so subsequent reads are consistent.
      campaign.share_config.committed_budget_remaining = committedRemaining;
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
