/**
 * Complete Expired Campaigns Job
 * Scheduled job that runs daily to complete campaigns past their end date
 * 
 * Execution:
 * - Runs daily at midnight UTC
 * - Finds all active campaigns where end_date has passed
 * - Completes each campaign (triggering payout)
 * - Logs results and errors
 */

const mongoose = require('mongoose');
const Campaign = require('../models/Campaign');
const CampaignService = require('../services/CampaignService');
const winstonLogger = require('../utils/winstonLogger');

class CompleteExpiredCampaignsJob {
  /**
   * Run the job - find and complete expired campaigns
   * 
   * @returns {Promise<object>} Job execution summary
   */
  static async run() {
    const startTime = Date.now();

    try {
      winstonLogger.info('🚀 CompleteExpiredCampaignsJob: Starting execution');

      // Find all active campaigns where end_date has passed
      const now = new Date();
      const expiredCampaigns = await Campaign.find({
        status: 'active',
        end_date: { $lte: now },
        locked: false,
      }).sort({ end_date: 1 });

      winstonLogger.info('📊 CompleteExpiredCampaignsJob: Found expired campaigns', {
        count: expiredCampaigns.length,
        now: now.toISOString(),
      });

      const results = {
        total_found: expiredCampaigns.length,
        completed: 0,
        failed: 0,
        skipped: 0,
        errors: [],
        duration_ms: 0,
      };

      // Process each expired campaign
      for (const campaign of expiredCampaigns) {
        try {
          winstonLogger.info('⏰ CompleteExpiredCampaignsJob: Processing campaign', {
            campaign_id: campaign.campaign_id,
            campaign_title: campaign.title,
            end_date: campaign.end_date,
            days_past_end: Math.floor((now - campaign.end_date) / (1000 * 60 * 60 * 24)),
          });

          // Complete the campaign
          const completed = await CampaignService.completeCampaign(
            campaign._id.toString(),
            campaign.creator_id.toString()
          );

          winstonLogger.info('✅ CompleteExpiredCampaignsJob: Campaign completed', {
            campaign_id: campaign.campaign_id,
            campaign_title: campaign.title,
            status: completed.status,
          });

          results.completed += 1;
        } catch (error) {
          winstonLogger.error('❌ CompleteExpiredCampaignsJob: Failed to complete campaign', {
            campaign_id: campaign.campaign_id,
            campaign_title: campaign.title,
            error: error.message,
            stack: error.stack,
          });

          results.failed += 1;
          results.errors.push({
            campaign_id: campaign.campaign_id,
            campaign_title: campaign.title,
            error: error.message,
          });
        }
      }

      const duration = Date.now() - startTime;
      results.duration_ms = duration;

      winstonLogger.info('✨ CompleteExpiredCampaignsJob: Execution complete', {
        ...results,
        duration_seconds: (duration / 1000).toFixed(2),
      });

      return results;
    } catch (error) {
      const duration = Date.now() - startTime;

      winstonLogger.error('💥 CompleteExpiredCampaignsJob: Execution failed', {
        error: error.message,
        stack: error.stack,
        duration_ms: duration,
      });

      throw error;
    }
  }

  /**
   * Manual trigger for testing
   * Used in development/testing environments
   *
   * @returns {Promise<object>} Job results
   */
  static async runManual() {
    winstonLogger.info('🧪 CompleteExpiredCampaignsJob: Manual execution triggered');
    return this.run();
  }

  /**
   * Get statistics on campaigns pending completion
   * 
   * @returns {Promise<object>} Statistics
   */
  static async getPendingStats() {
    try {
      const now = new Date();
      const pendingExpiry = await Campaign.find({
        status: 'active',
        end_date: { $lte: now },
        locked: false,
      });

      const wilExpireSoon = await Campaign.find({
        status: 'active',
        end_date: {
          $gt: now,
          $lte: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000), // Next 7 days
        },
      });

      return {
        pending_expiry_now: pendingExpiry.length,
        pending_expiry_soon: wilExpireSoon.length,
        total_at_risk: pendingExpiry.length + wilExpireSoon.length,
        details: {
          expired: pendingExpiry.map(c => ({
            campaign_id: c.campaign_id,
            title: c.title,
            end_date: c.end_date,
            days_past: Math.floor((now - c.end_date) / (1000 * 60 * 60 * 24)),
          })),
          expiring_soon: wilExpireSoon.map(c => ({
            campaign_id: c.campaign_id,
            title: c.title,
            end_date: c.end_date,
            days_until: Math.ceil((c.end_date - now) / (1000 * 60 * 60 * 24)),
          })),
        },
      };
    } catch (error) {
      winstonLogger.error('Error getting pending stats', {
        error: error.message,
        stack: error.stack,
      });
      throw error;
    }
  }
}

module.exports = CompleteExpiredCampaignsJob;
