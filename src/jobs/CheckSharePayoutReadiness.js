/**
 * Check Share Payout Readiness Job
 * -------------------------------------------------------------------------
 * Pauses paid sharing on Share Campaigns whose owner no longer has a usable
 * payout method, and tells the creator why.
 *
 * Why this exists
 * ---------------
 * A Share Campaign is a promise to pay. The payout method is checked when the
 * campaign is created and when it is upgraded — but never again. A creator can
 * delete their bank details, let a card expire, or have a method marked
 * `failed` weeks later, and nothing notices. Sharers keep sharing, keep earning
 * rewards, and keep accruing a balance that nobody can settle. Under the
 * trust-based model HonestNeed holds none of that money, so the debt is real
 * and personal to the creator.
 *
 * This job closes that window: it pauses accrual rather than letting the hole
 * get deeper, and gives the creator a clear route back.
 *
 * What it deliberately does NOT do
 * --------------------------------
 * It never downgrades `campaign_type`. The upgrade is one-way: a campaign with
 * accrued `committed_total` has real outstanding obligations to sharers, and
 * reverting the type would strand them. Pausing `is_paid_sharing_active` stops
 * NEW rewards accruing while leaving the existing ledger intact.
 *
 * It also never un-pauses. A creator who fixes their payout method reactivates
 * sharing deliberately, through the normal share-config flow — auto-resuming a
 * money-owing feature behind someone's back is not a decision a cron job
 * should make.
 *
 * Execution: daily. Payout methods do not go stale by the minute, and the
 * notification is one a creator should receive once, not hourly.
 */

const Campaign = require('../models/Campaign');
const PayoutReadinessService = require('../services/PayoutReadinessService');
const NotificationDispatcher = require('../services/NotificationDispatcher');
const winstonLogger = require('../utils/winstonLogger');

class CheckSharePayoutReadinessJob {
  /**
   * @returns {Promise<object>} Job execution summary
   */
  static async run() {
    const startTime = Date.now();

    const results = {
      campaigns_examined: 0,
      owners_checked: 0,
      campaigns_paused: 0,
      creators_notified: 0,
      errors: 0,
    };

    try {
      winstonLogger.info('🚀 CheckSharePayoutReadinessJob: Starting execution');

      // Only campaigns actively accruing rewards can accrue an unpayable debt.
      const campaigns = await Campaign.find({
        campaign_type: 'sharing',
        'share_config.is_paid_sharing_active': true,
        deleted_at: null,
      }).select('campaign_id title creator_id share_config');

      results.campaigns_examined = campaigns.length;
      if (campaigns.length === 0) {
        const duration = Date.now() - startTime;
        winstonLogger.info('✅ CheckSharePayoutReadinessJob: nothing to check', {
          ...results,
          duration_ms: duration,
        });
        return { ...results, duration_ms: duration };
      }

      // One batched lookup rather than a query per campaign — a creator with
      // several live Share Campaigns is checked once.
      const ownerIds = [...new Set(campaigns.map((c) => String(c.creator_id)))];
      const readinessByOwner = await PayoutReadinessService.getReadinessMany(ownerIds);
      results.owners_checked = ownerIds.length;

      for (const campaign of campaigns) {
        try {
          const readiness = readinessByOwner.get(String(campaign.creator_id));

          // Absent entry means the batch lookup failed for this owner. Fail
          // OPEN here: a lookup blip must not pause a healthy campaign and fire
          // an alarming notification at an innocent creator.
          if (!readiness || readiness.ready) continue;

          // Guarded update: only pause if sharing is still active, so a creator
          // who paused it themselves mid-run is not written over.
          const updated = await Campaign.findOneAndUpdate(
            {
              _id: campaign._id,
              'share_config.is_paid_sharing_active': true,
            },
            {
              $set: {
                'share_config.is_paid_sharing_active': false,
                'share_config.last_config_update': new Date(),
              },
            },
            { new: true }
          );

          if (!updated) continue;

          results.campaigns_paused += 1;

          winstonLogger.warn('⚠️ CheckSharePayoutReadinessJob: paused paid sharing', {
            campaign_id: campaign.campaign_id,
            creator_id: String(campaign.creator_id),
            committed_total_cents: campaign.share_config?.committed_total || 0,
          });

          try {
            await NotificationDispatcher.notify({
              userId: campaign.creator_id,
              type: 'share_campaign_payout_method_invalid',
              data: {
                campaign_id: campaign.campaign_id,
                campaign_title: campaign.title,
              },
            });
            results.creators_notified += 1;
          } catch (error) {
            // The pause is the important half; a failed notification must not
            // undo it or abort the run.
            winstonLogger.warn('CheckSharePayoutReadinessJob: notification failed', {
              campaign_id: campaign.campaign_id,
              message: error.message,
            });
          }
        } catch (error) {
          results.errors += 1;
          winstonLogger.warn('CheckSharePayoutReadinessJob: campaign check failed', {
            campaign_id: campaign.campaign_id,
            message: error.message,
          });
        }
      }

      const duration = Date.now() - startTime;
      winstonLogger.info('✅ CheckSharePayoutReadinessJob: Completed', {
        ...results,
        duration_ms: duration,
      });

      return { ...results, duration_ms: duration };
    } catch (error) {
      winstonLogger.error('❌ CheckSharePayoutReadinessJob: Failed', {
        message: error.message,
        stack: error.stack,
      });
      throw error;
    }
  }
}

module.exports = CheckSharePayoutReadinessJob;
