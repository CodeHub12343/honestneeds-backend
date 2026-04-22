/**
 * Campaign Validators
 * Validates campaign data and completeness for publishing
 */

const winstonLogger = require('../utils/winstonLogger');

const CampaignValidators = {
  /**
   * Check if campaign is complete and ready to publish
   * 
   * @param {object} campaign - Campaign object to validate
   * @returns {object} { isComplete, errors, warnings }
   */
  validateCampaignComplete(campaign) {
    const errors = [];
    const warnings = [];

    if (!campaign) {
      return {
        isComplete: false,
        errors: ['Campaign not found'],
        warnings: [],
      };
    }

    // Check if already published
    if (campaign.status === 'active' || campaign.status === 'completed') {
      return {
        isComplete: false,
        errors: ['Campaign is already published'],
        warnings: [],
      };
    }

    // Check if status is draft
    if (campaign.status !== 'draft') {
      return {
        isComplete: false,
        errors: [`Campaign status must be 'draft', got '${campaign.status}'`],
        warnings: [],
      };
    }

    // Required text fields
    if (!campaign.title || campaign.title.trim().length === 0) {
      errors.push('Campaign title is required');
    } else if (campaign.title.trim().length < 5) {
      errors.push('Campaign title must be at least 5 characters');
    }

    if (!campaign.description || campaign.description.trim().length === 0) {
      errors.push('Campaign description is required');
    } else if (campaign.description.trim().length < 20) {
      errors.push('Campaign description must be at least 20 characters');
    }

    // Check for goals/needs (at least 1 required)
    const goals = campaign.goals || [];
    if (!Array.isArray(goals) || goals.length === 0) {
      errors.push('Campaign must have at least 1 goal');
    }

    // Validate goal structure
    goals.forEach((goal, index) => {
      if (!goal.title || !goal.title.trim()) {
        errors.push(`Goal ${index + 1}: Title is required`);
      }
      if (!goal.amount || goal.amount <= 0) {
        errors.push(`Goal ${index + 1}: Amount must be greater than 0`);
      }
    });

    // Check for payment methods (at least 1 primary required)
    const paymentMethods = campaign.payment_methods || [];
    if (!Array.isArray(paymentMethods) || paymentMethods.length === 0) {
      errors.push('Campaign must have at least 1 payment method');
    }

    // Check for primary payment method
    const hasPrimary = paymentMethods.some(pm => pm.is_primary === true);
    if (!hasPrimary && paymentMethods.length > 0) {
      errors.push('Campaign must have a primary payment method');
    }

    // Check location
    if (!campaign.location) {
      errors.push('Campaign location is required');
    } else {
      if (!campaign.location.city || !campaign.location.state) {
        errors.push('Campaign location must include city and state');
      }
    }

    // Check category/need type
    if (!campaign.category && !campaign.need_type) {
      errors.push('Campaign category or need type is required');
    }

    // Check for image (warning only)
    if (!campaign.image_url && !campaign.image) {
      warnings.push('Campaign does not have an image (recommended for better performance)');
    }

    // Return validation result
    const isComplete = errors.length === 0;

    winstonLogger.debug('Campaign completeness validated', {
      campaignId: campaign._id || campaign.id,
      isComplete,
      errorCount: errors.length,
      warningCount: warnings.length,
    });

    return {
      isComplete,
      errors,
      warnings,
    };
  },

  /**
   * Check if campaign can be paused
   * 
   * @param {object} campaign - Campaign to check
   * @returns {object} { canPause, reason }
   */
  validateCanPause(campaign) {
    if (!campaign) {
      return {
        canPause: false,
        reason: 'Campaign not found',
      };
    }

    // Can only pause active campaigns
    if (campaign.status !== 'active') {
      return {
        canPause: false,
        reason: `Cannot pause campaign with status '${campaign.status}'. Only active campaigns can be paused.`,
      };
    }

    return {
      canPause: true,
      reason: null,
    };
  },

  /**
   * Check if campaign can be completed
   * 
   * @param {object} campaign - Campaign to check
   * @returns {object} { canComplete, reason }
   */
  validateCanComplete(campaign) {
    if (!campaign) {
      return {
        canComplete: false,
        reason: 'Campaign not found',
      };
    }

    // Cannot complete archived campaigns
    if (campaign.status === 'archived') {
      return {
        canComplete: false,
        reason: 'Cannot complete archived campaign',
      };
    }

    // Cannot complete already completed campaigns
    if (campaign.status === 'completed') {
      return {
        canComplete: false,
        reason: 'Campaign is already completed',
      };
    }

    // Cannot complete draft campaigns
    if (campaign.status === 'draft') {
      return {
        canComplete: false,
        reason: 'Cannot complete draft campaign. Publish campaign first.',
      };
    }

    // Can complete active and paused campaigns
    if (campaign.status === 'active' || campaign.status === 'paused') {
      return {
        canComplete: true,
        reason: null,
      };
    }

    return {
      canComplete: false,
      reason: `Cannot complete campaign with status '${campaign.status}'`,
    };
  },

  /**
   * Validate status transition
   * 
   * @param {string} currentStatus - Current campaign status
   * @param {string} targetStatus - Target campaign status
   * @returns {object} { isValid, reason }
   */
  validateStatusTransition(currentStatus, targetStatus) {
    // Define valid transitions
    const validTransitions = {
      draft: ['active', 'archived'],
      active: ['paused', 'completed', 'archived'],
      paused: ['active', 'completed', 'archived'],
      completed: ['archived'],
      archived: [],
    };

    if (!validTransitions[currentStatus]) {
      return {
        isValid: false,
        reason: `Unknown current status: ${currentStatus}`,
      };
    }

    const allowed = validTransitions[currentStatus];
    if (!allowed.includes(targetStatus)) {
      return {
        isValid: false,
        reason: `Cannot transition from '${currentStatus}' to '${targetStatus}'. Valid transitions: ${allowed.join(', ')}`,
      };
    }

    return {
      isValid: true,
      reason: null,
    };
  },

  /**
   * Validate campaign can be published
   * 
   * @param {object} campaign - Campaign to publish
   * @returns {object} { canPublish, errors, warnings }
   */
  validateCanPublish(campaign) {
    if (!campaign) {
      return {
        canPublish: false,
        errors: ['Campaign not found'],
        warnings: [],
      };
    }

    if (campaign.status !== 'draft') {
      return {
        canPublish: false,
        errors: [`Campaign is not in draft status. Current status: ${campaign.status}`],
        warnings: [],
      };
    }

    // Check completeness
    const completeness = this.validateCampaignComplete(campaign);
    
    return {
      canPublish: completeness.isComplete,
      errors: completeness.errors,
      warnings: completeness.warnings,
    };
  },

  /**
   * Check if campaign has been published before
   * 
   * @param {object} campaign - Campaign to check
   * @returns {boolean} True if campaign has been published
   */
  hasBeenPublished(campaign) {
    return !!(campaign.publishedAt || campaign.published_at);
  },

  /**
   * Get campaign status display name
   * 
   * @param {string} status - Campaign status
   * @returns {string} Display name
   */
  getStatusDisplayName(status) {
    const displayNames = {
      draft: 'Draft',
      active: 'Active',
      paused: 'Paused',
      completed: 'Completed',
      archived: 'Archived',
    };

    return displayNames[status] || status;
  },

  /**
   * Check if campaign can be edited
   * 
   * @param {object} campaign - Campaign to check
   * @returns {boolean} True if campaign can be edited
   */
  canEdit(campaign) {
    // Only draft campaigns can be edited
    return campaign.status === 'draft';
  },

  /**
   * Check if campaign can be deleted
   * 
   * @param {object} campaign - Campaign to check
   * @returns {boolean} True if campaign can be deleted
   */
  canDelete(campaign) {
    // Draft campaigns can always be deleted
    // Active and paused campaigns can be archived instead
    return campaign.status === 'draft';
  },

  /**
   * Get available actions for campaign status
   * 
   * @param {object} campaign - Campaign object
   * @returns {object} Available actions by status
   */
  getAvailableActions(campaign) {
    if (!campaign) {
      return {};
    }

    const actions = {
      edit: this.canEdit(campaign),
      publish: campaign.status === 'draft',
      pause: campaign.status === 'active',
      resume: campaign.status === 'paused',
      complete: campaign.status === 'active' || campaign.status === 'paused',
      delete: this.canDelete(campaign),
      archive: campaign.status !== 'archived' && campaign.status !== 'completed',
    };

    return actions;
  },
};

module.exports = CampaignValidators;
