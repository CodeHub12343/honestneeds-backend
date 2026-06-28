/**
 * Campaign Milestone Service (CA-19)
 * Detects when a campaign crosses progress thresholds and records milestones.
 *
 * Safe to call repeatedly (idempotent): duplicate auto-milestones are prevented
 * by a unique index, and any duplicate-key races are swallowed.
 */

const mongoose = require('mongoose');
const Campaign = require('../models/Campaign');
const CampaignMilestone = require('../models/CampaignMilestone');
const winstonLogger = require('../utils/winstonLogger');
const { generateShortenedId } = require('../utils/idGenerator');

// Default percentage thresholds that trigger a celebration
const DEFAULT_THRESHOLDS = [25, 50, 75, 100];

const THRESHOLD_COPY = {
  25: { emoji: '🌱', title: 'Quarter of the way there!' },
  50: { emoji: '⭐', title: 'Halfway to the goal!' },
  75: { emoji: '🔥', title: 'Three-quarters funded!' },
  100: { emoji: '🎉', title: 'Goal reached — thank you!' },
};

const generateMilestoneId = () => `mst_${generateShortenedId()}`;

/**
 * Compute the current value/goal for each meter on a campaign.
 * Returns a map: { funding: {value, goal}, sharing: {...}, prayer: {...}, donors: {...} }
 */
function computeMeters(campaign) {
  const meters = {};

  // Funding — sum across fundraising goals
  const fundraisingGoals = (campaign.goals || []).filter((g) => g.goal_type === 'fundraising');
  if (fundraisingGoals.length > 0) {
    const value = fundraisingGoals.reduce((s, g) => s + (g.current_amount || 0), 0);
    const goal = fundraisingGoals.reduce((s, g) => s + (g.target_amount || 0), 0);
    if (goal > 0) meters.funding = { value, goal };
  }

  // Sharing — share goal reach
  const sharingGoals = (campaign.goals || []).filter((g) => g.goal_type === 'sharing_reach');
  if (sharingGoals.length > 0) {
    const goal = sharingGoals.reduce((s, g) => s + (g.target_amount || 0), 0);
    if (goal > 0) meters.sharing = { value: campaign.share_count || 0, goal };
  }

  // Prayer — prayer goal
  if (campaign.prayer_config?.enabled && campaign.prayer_config?.prayer_goal > 0) {
    meters.prayer = {
      value: campaign.prayer_metrics?.total_prayers || campaign.prayer_config?.prayer_count || 0,
      goal: campaign.prayer_config.prayer_goal,
    };
  }

  return meters;
}

const CampaignMilestoneService = {
  computeMeters,
  DEFAULT_THRESHOLDS,

  /**
   * Evaluate a campaign's meters and create any newly-crossed milestones.
   * @param {String|ObjectId|Object} campaignOrId - campaign doc or id
   * @returns {Promise<Array>} newly created milestone documents
   */
  async checkAndCreateMilestones(campaignOrId) {
    try {
      let campaign = campaignOrId;
      if (typeof campaignOrId === 'string' || campaignOrId instanceof mongoose.Types.ObjectId) {
        campaign = await Campaign.findById(campaignOrId);
      }
      if (!campaign) return [];

      const meters = computeMeters(campaign);
      const created = [];
      const newlyCelebrated = [];

      for (const [meterType, { value, goal }] of Object.entries(meters)) {
        if (!goal || goal <= 0) continue;
        const pct = Math.floor((value / goal) * 100);

        for (const threshold of DEFAULT_THRESHOLDS) {
          if (pct < threshold) continue;

          // Skip if already recorded for this meter+threshold
          const exists = await CampaignMilestone.findOne({
            campaign_id: campaign._id,
            meter_type: meterType,
            percentage: threshold,
            source: 'auto',
          }).lean();
          if (exists) continue;

          const copy = THRESHOLD_COPY[threshold] || { emoji: '🎉', title: `${threshold}% reached!` };
          try {
            const milestone = await CampaignMilestone.create({
              milestone_id: generateMilestoneId(),
              campaign_id: campaign._id,
              meter_type: meterType,
              percentage: threshold,
              value_at_reached: value,
              goal_at_reached: goal,
              title: `${copy.title}`,
              message: `${campaign.title} reached ${threshold}% of its ${meterType} goal.`,
              source: 'auto',
              celebration_emoji: copy.emoji,
            });
            created.push(milestone);
            if (meterType === 'funding') newlyCelebrated.push(threshold);
          } catch (err) {
            // Duplicate key from a concurrent write — safe to ignore
            if (err.code !== 11000) {
              winstonLogger.warn('Milestone create failed', { error: err.message, meterType, threshold });
            }
          }
        }
      }

      // Keep the denormalized funding markers in sync on the campaign
      if (newlyCelebrated.length > 0) {
        await Campaign.updateOne(
          { _id: campaign._id },
          { $addToSet: { milestones_celebrated: { $each: newlyCelebrated } } }
        );
      }

      if (created.length > 0) {
        winstonLogger.info('Campaign milestones created', {
          campaignId: campaign._id.toString(),
          count: created.length,
          thresholds: created.map((m) => `${m.meter_type}:${m.percentage}`),
        });
      }

      return created;
    } catch (error) {
      winstonLogger.error('checkAndCreateMilestones error', { error: error.message, stack: error.stack });
      return [];
    }
  },

  /**
   * List milestones for a campaign (newest first).
   */
  async listMilestones(campaignId, { limit = 50 } = {}) {
    return CampaignMilestone.find({ campaign_id: campaignId })
      .sort({ reached_at: -1 })
      .limit(Math.min(limit, 200))
      .lean();
  },

  /**
   * Create a custom (manual) milestone for a campaign.
   */
  async createCustomMilestone(campaignId, { title, message, celebration_emoji }) {
    return CampaignMilestone.create({
      milestone_id: generateMilestoneId(),
      campaign_id: campaignId,
      meter_type: 'custom',
      title,
      message,
      source: 'manual',
      celebration_emoji: celebration_emoji || '🎉',
    });
  },
};

module.exports = CampaignMilestoneService;
