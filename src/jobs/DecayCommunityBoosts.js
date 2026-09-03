/**
 * Decay Community Boosts Job
 * -------------------------------------------------------------------------
 * Recomputes `Campaign.community_boost_score` for campaigns that have peer
 * boosts, applying the time-decay curve.
 *
 * Why this exists:
 * - `community_boost_score` is incremented atomically when a boost lands, but
 *   nothing would ever reduce it. Without decay, a campaign that was boosted
 *   heavily once would sit near the top of "trending" forever — the same defect
 *   ExpireBoosts was written to fix for PAID boosts, and the reason "trending"
 *   would stop meaning anything.
 * - Recomputing from the surviving boost records (rather than decrementing) also
 *   makes the score self-healing: a boost revoked for fraud stops counting the
 *   next time this runs, even if the revocation path missed a recompute.
 *
 * Execution:
 * - Runs daily. Decay is measured in days, so anything more frequent is churn.
 * - Only touches campaigns with a non-zero score or a recent boost, so the cost
 *   scales with real activity rather than with the size of the campaign table.
 *
 * Note: this is the COMMUNITY (peer) boost score. Paid boosts are handled
 * separately by ExpireBoosts and are unaffected by this job.
 */

const Campaign = require('../models/Campaign');
const CampaignBoostService = require('../services/CampaignBoostService');
const winstonLogger = require('../utils/winstonLogger');

class DecayCommunityBoostsJob {
  /**
   * @returns {Promise<object>} Job execution summary
   */
  static async run() {
    const startTime = Date.now();

    const results = {
      campaigns_examined: 0,
      campaigns_updated: 0,
      campaigns_zeroed: 0,
      errors: 0,
    };

    try {
      winstonLogger.info('🚀 DecayCommunityBoostsJob: Starting execution');

      const candidates = await Campaign.find({
        $or: [
          { community_boost_score: { $gt: 0 } },
          { last_community_boost_at: { $ne: null } },
        ],
      }).select('_id campaign_id community_boost_score');

      results.campaigns_examined = candidates.length;

      for (const campaign of candidates) {
        try {
          const previous = campaign.community_boost_score || 0;
          const { score } = await CampaignBoostService.recomputeScore(campaign._id);

          if (score !== previous) results.campaigns_updated += 1;
          if (previous > 0 && score === 0) results.campaigns_zeroed += 1;
        } catch (error) {
          results.errors += 1;
          winstonLogger.warn('DecayCommunityBoostsJob: campaign recompute failed', {
            campaign_id: campaign.campaign_id,
            message: error.message,
          });
        }
      }

      const duration = Date.now() - startTime;
      winstonLogger.info('✅ DecayCommunityBoostsJob: Completed', { ...results, duration_ms: duration });

      return { ...results, duration_ms: duration };
    } catch (error) {
      winstonLogger.error('❌ DecayCommunityBoostsJob: Failed', {
        message: error.message,
        stack: error.stack,
      });
      throw error;
    }
  }
}

module.exports = DecayCommunityBoostsJob;
