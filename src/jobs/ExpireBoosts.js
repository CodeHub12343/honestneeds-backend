/**
 * Expire Boosts Job
 * Scheduled job that deactivates expired campaign boosts and reconciles the
 * boost-ranking flags on the Campaign documents.
 *
 * Why this exists:
 * - Campaign listings sort by Campaign.is_boosted / current_boost_tier
 *   (see CampaignService.listCampaigns). Those flags are set when a boost is
 *   activated, but nothing ever cleared them once the boost's end_date passed,
 *   so boosted campaigns ranked at the top forever. This job closes that gap.
 *
 * Execution:
 * - Runs hourly.
 * - Step 1: flip CampaignBoost.is_active=false for active boosts past end_date.
 * - Step 2: for every affected campaign, recompute its boost flags from the
 *   boosts that are still active, so a campaign with a remaining valid boost
 *   keeps its (highest) tier and only truly-expired campaigns are demoted.
 */

const CampaignBoost = require('../models/CampaignBoost');
const winstonLogger = require('../utils/winstonLogger');

class ExpireBoostsJob {
  /**
   * Run the job - deactivate expired boosts and reconcile campaign flags.
   *
   * @returns {Promise<object>} Job execution summary
   */
  static async run() {
    const startTime = Date.now();

    try {
      winstonLogger.info('🚀 ExpireBoostsJob: Starting execution');

      const now = new Date();

      // Step 1: find boosts that are still flagged active but have expired.
      const expiredBoosts = await CampaignBoost.find({
        is_active: true,
        end_date: { $lte: now },
      }).select('_id campaign_id');

      const affectedCampaignIds = [
        ...new Set(expiredBoosts.map((b) => b.campaign_id.toString())),
      ];

      if (expiredBoosts.length > 0) {
        await CampaignBoost.updateMany(
          { _id: { $in: expiredBoosts.map((b) => b._id) } },
          { $set: { is_active: false } }
        );
      }

      winstonLogger.info('📊 ExpireBoostsJob: Deactivated expired boosts', {
        expired_boosts: expiredBoosts.length,
        affected_campaigns: affectedCampaignIds.length,
        now: now.toISOString(),
      });

      // Step 2: reconcile flags on each affected campaign from the boosts that
      // remain valid (shared logic with the cancel path).
      const results = {
        expired_boosts: expiredBoosts.length,
        campaigns_demoted: 0,
        campaigns_still_boosted: 0,
        duration_ms: 0,
      };

      for (const campaignId of affectedCampaignIds) {
        try {
          const flags = await CampaignBoost.reconcileCampaignFlags(campaignId);
          if (flags.is_boosted) results.campaigns_still_boosted += 1;
          else results.campaigns_demoted += 1;
        } catch (error) {
          winstonLogger.error('❌ ExpireBoostsJob: Failed to reconcile campaign', {
            campaign_id: campaignId,
            error: error.message,
            stack: error.stack,
          });
        }
      }

      results.duration_ms = Date.now() - startTime;

      winstonLogger.info('✨ ExpireBoostsJob: Execution complete', {
        ...results,
        duration_seconds: (results.duration_ms / 1000).toFixed(2),
      });

      return results;
    } catch (error) {
      winstonLogger.error('💥 ExpireBoostsJob: Execution failed', {
        error: error.message,
        stack: error.stack,
        duration_ms: Date.now() - startTime,
      });
      throw error;
    }
  }

  /**
   * Manual trigger for testing.
   *
   * @returns {Promise<object>} Job results
   */
  static async runManual() {
    winstonLogger.info('🧪 ExpireBoostsJob: Manual execution triggered');
    return this.run();
  }
}

module.exports = ExpireBoostsJob;
