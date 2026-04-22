/**
 * Conversion Tracking Service
 * 
 * Handles complete conversion attribution pipeline:
 * 1. Record referral clicks (visitor arrives via share link)
 * 2. Track conversion events (visitor completes action: donation, signup, etc)
 * 3. Attribute revenue to original sharer
 * 4. Calculate conversion metrics and rates
 * 
 * Flow:
 *   Supporter gets referral_code: "343DF47C"
 *   ↓
 *   Share link: domain.com/campaigns/:id?ref=343DF47C
 *   ↓
 *   Visitor clicks link → Backend records click via referralMiddleware
 *   ↓
 *   Visitor completes action → ConversionTrackingService.recordConversion()
 *   ↓
 *   ShareRecord updated: conversions++, related_transaction added
 *   ↓
 *   ReferralTracking updated with revenue
 *   ↓
 *   Sharer's earnings updated (if reward eligible)
 */

const mongoose = require('mongoose');
const winstonLogger = require('../utils/winstonLogger');
const { ShareRecord } = require('../models/Share');
const ReferralTracking = require('../models/ReferralTracking');
const Campaign = require('../models/Campaign');
const Transaction = require('../models/Transaction');
const User = require('../models/User');

class ConversionTrackingService {
  /**
   * Record a conversion event (visitor completed action via referral link)
   * Called when: donation, signup, form submission, purchase, etc.
   *
   * @param {Object} params - Conversion parameters
   * @param {string} params.referralCode - Referral code from URL (?ref=343DF47C)
   * @param {string} params.campaignId - Campaign ID (from URL path)
   * @param {ObjectId} params.visitorId - User who completed action (may be null/anonymous)
   * @param {string} params.conversionType - Type: 'donation', 'signup', 'form_submission', 'purchase'
   * @param {number} params.conversionValue - Revenue in cents (0 if not monetary)
   * @param {string} params.ipAddress - Visitor IP for fraud detection
   * @param {string} params.userAgent - Visitor user agent
   * @param {Object} params.metadata - Additional contextual data
   * @returns {Promise<Object>} - Conversion result with attribution
   */
  static async recordConversion(params) {
    const {
      referralCode,
      campaignId,
      visitorId,
      conversionType = 'donation',
      conversionValue = 0,
      ipAddress,
      userAgent,
      metadata = {},
    } = params;

    try {
      winstonLogger.info('🔄 ConversionTrackingService.recordConversion: Starting conversion', {
        referralCode: referralCode?.substring(0, 10),
        campaignId,
        visitorId,
        conversionType,
        conversionValue,
        conversionDollars: (conversionValue / 100).toFixed(2),
      });

      // ===== STEP 1: Validate Referral Code & Find Share =====

      if (!referralCode) {
        winstonLogger.warn('⚠️ ConversionTrackingService: No referral code provided', {
          campaignId,
          visitorId,
          conversionType,
        });
        return {
          success: true,
          conversion_recorded: false,
          attributed: false,
          reason: 'No referral code - organic traffic',
        };
      }

      // Clean referral code (alphanumeric only, uppercase)
      const cleanCode = referralCode.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();

      // Find share record with this referral code
      const shareRecord = await ShareRecord.findOne({
        referral_code: cleanCode,
        campaign_id: campaignId,
      }).populate('supporter_id', '_id email name avatar');

      if (!shareRecord) {
        winstonLogger.warn('⚠️ ConversionTrackingService: Share record not found for referral code', {
          referralCode: cleanCode,
          campaignId,
        });
        return {
          success: true,
          conversion_recorded: false,
          attributed: false,
          reason: 'Share record not found',
        };
      }

      winstonLogger.info('✅ ConversionTrackingService: Share record found', {
        shareId: shareRecord.share_id,
        supporterId: shareRecord.supporter_id._id,
        channel: shareRecord.channel,
      });

      // ===== STEP 2: Verify Campaign =====

      const campaign = await Campaign.findById(campaignId);
      if (!campaign) {
        winstonLogger.error('❌ ConversionTrackingService: Campaign not found', {
          campaignId,
        });
        return {
          success: false,
          error: 'CAMPAIGN_NOT_FOUND',
          message: 'Campaign not found',
        };
      }

      // ===== STEP 3: Validate Conversion Type =====

      const validConversionTypes = ['donation', 'signup', 'form_submission', 'purchase'];
      if (!validConversionTypes.includes(conversionType)) {
        winstonLogger.warn('⚠️ ConversionTrackingService: Invalid conversion type', {
          conversionType,
        });
        return {
          success: false,
          error: 'INVALID_CONVERSION_TYPE',
          message: `Valid types: ${validConversionTypes.join(', ')}`,
        };
      }

      // ===== STEP 4: Update ShareRecord =====

      // Increment conversion count
      if (!shareRecord.conversions) {
        shareRecord.conversions = 0;
      }
      shareRecord.conversions += 1;

      // Track conversion details
      if (!shareRecord.conversion_details) {
        shareRecord.conversion_details = [];
      }

      shareRecord.conversion_details.push({
        conversion_id: `CONV-${Date.now()}-${Math.random().toString(36).substr(2, 8).toUpperCase()}`,
        conversion_type: conversionType,
        conversion_value: conversionValue,
        visitor_id: visitorId || null,
        ip_address: ipAddress,
        user_agent: userAgent,
        metadata,
        recorded_at: new Date(),
      });

      // Cap conversion details to last 1000 (prevent array bloat)
      if (shareRecord.conversion_details.length > 1000) {
        shareRecord.conversion_details = shareRecord.conversion_details.slice(-1000);
      }

      // Calculate total conversion value
      const totalConversionValue = shareRecord.conversion_details.reduce(
        (sum, conv) => sum + (conv.conversion_value || 0),
        0
      );

      shareRecord.total_conversion_value = totalConversionValue;
      shareRecord.updated_at = new Date();

      await shareRecord.save();

      winstonLogger.info('✅ ConversionTrackingService: ShareRecord updated', {
        shareId: shareRecord.share_id,
        totalConversions: shareRecord.conversions,
        totalValue: totalConversionValue,
      });

      // ===== STEP 5: Update ReferralTracking =====

      let referralTracking = await ReferralTracking.findOne({
        share_id: shareRecord._id,
        campaign_id: campaignId,
        referrer_id: shareRecord.supporter_id._id,
      });

      if (!referralTracking) {
        // Create new tracking if doesn't exist
        referralTracking = new ReferralTracking({
          tracking_id: `RT-${Date.now()}-${Math.random().toString(36).substr(2, 8).toUpperCase()}`,
          campaign_id: campaignId,
          share_id: shareRecord._id,
          referrer_id: shareRecord.supporter_id._id,
          referral_visits: [],
          conversions: [],
          total_visits: 0,
          total_conversions: 0,
          total_conversion_amount: 0,
          conversion_rate: 0,
          is_active: true,
        });
      }

      // Add conversion to tracking
      referralTracking.conversions.push({
        conversion_id: shareRecord.conversion_details[shareRecord.conversion_details.length - 1].conversion_id,
        conversion_type: conversionType,
        conversion_value: conversionValue,
        visitor_id: visitorId || null,
        converted_at: new Date(),
        ip_address: ipAddress,
        metadata,
      });

      // Update conversion totals
      referralTracking.total_conversions += 1;
      referralTracking.total_conversion_amount += conversionValue;

      // Recalculate conversion rate
      if (referralTracking.total_visits > 0) {
        referralTracking.conversion_rate =
          (referralTracking.total_conversions / referralTracking.total_visits) * 100;
      }

      referralTracking.updated_at = new Date();
      referralTracking.markModified('conversions');

      await referralTracking.save();

      winstonLogger.info('✅ ConversionTrackingService: ReferralTracking updated', {
        trackingId: referralTracking.tracking_id,
        totalConversions: referralTracking.total_conversions,
        conversionRate: referralTracking.conversion_rate.toFixed(2),
        totalValue: referralTracking.total_conversion_amount,
      });

      // ===== STEP 6: Check Reward Eligibility (Optional) =====

      // If conversion has revenue, check if sharer is eligible for conversion bonus
      let rewardApplied = false;
      let rewardAmount = 0;

      if (
        conversionValue > 0 &&
        campaign.campaign_type === 'sharing' &&
        campaign.share_config?.is_paid_sharing_active
      ) {
        // Check if campaign has conversion bonus configured
        const conversionBonus = campaign.share_config.conversion_bonus_percent || 0; // e.g., 5% of conversion value

        if (conversionBonus > 0) {
          rewardAmount = Math.round((conversionValue * conversionBonus) / 100);

          // Check budget availability
          const remainingBudget = campaign.share_config.total_budget -
            (campaign.share_config.total_reward_distributed || 0);

          if (remainingBudget >= rewardAmount) {
            // Apply reward
            if (!campaign.share_config.total_reward_distributed) {
              campaign.share_config.total_reward_distributed = 0;
            }

            campaign.share_config.total_reward_distributed += rewardAmount;
            rewardApplied = true;

            winstonLogger.info('💰 ConversionTrackingService: Conversion reward applied', {
              shareId: shareRecord.share_id,
              rewardAmount,
              rewardPercent: conversionBonus,
              conversionValue,
            });
          } else {
            winstonLogger.warn('⚠️ ConversionTrackingService: Insufficient budget for conversion reward', {
              shareId: shareRecord.share_id,
              requiredReward: rewardAmount,
              remainingBudget,
            });
          }
        }
      }

      // ===== STEP 7: Update Campaign Metrics =====

      if (!campaign.metrics) {
        campaign.metrics = {};
      }

      if (!campaign.metrics.conversions) {
        campaign.metrics.conversions = 0;
      }

      campaign.metrics.conversions += 1;
      campaign.metrics.total_conversion_value = (campaign.metrics.total_conversion_value || 0) + conversionValue;

      // Calculate campaign conversion rate
      if (campaign.metrics.shares > 0) {
        campaign.metrics.conversion_rate = (campaign.metrics.conversions / campaign.metrics.shares) * 100;
      }

      campaign.updated_at = new Date();
      await campaign.save();

      winstonLogger.info('✅ ConversionTrackingService: Campaign metrics updated', {
        campaignId,
        totalConversions: campaign.metrics.conversions,
        conversionRate: campaign.metrics.conversion_rate?.toFixed(2) || 'N/A',
      });

      // ===== RETURN RESULT =====

      return {
        success: true,
        conversion_recorded: true,
        attributed: true,
        data: {
          referral_code: cleanCode,
          share_id: shareRecord.share_id,
          campaign_id: campaignId,
          sharer_id: shareRecord.supporter_id._id,
          sharer_name: shareRecord.supporter_id.name,
          conversion_type: conversionType,
          conversion_value: conversionValue,
          total_share_conversions: shareRecord.conversions,
          total_share_conversion_value: shareRecord.total_conversion_value,
          reward_applied: rewardApplied,
          reward_amount: rewardAmount,
          referral_tracking_stats: {
            tracking_id: referralTracking.tracking_id,
            total_conversions: referralTracking.total_conversions,
            total_conversion_amount: referralTracking.total_conversion_amount,
            conversion_rate: referralTracking.conversion_rate.toFixed(2),
            average_conversion_value: referralTracking.total_conversions > 0
              ? Math.round(referralTracking.total_conversion_amount / referralTracking.total_conversions)
              : 0,
          },
        },
      };
    } catch (error) {
      winstonLogger.error('❌ ConversionTrackingService.recordConversion error', {
        error: error.message,
        referralCode: params.referralCode?.substring(0, 10),
        campaignId: params.campaignId,
        visitorId: params.visitorId,
        stack: error.stack,
      });

      return {
        success: false,
        error: 'CONVERSION_TRACKING_ERROR',
        message: error.message,
      };
    }
  }

  /**
   * Record a click event (visitor lands on campaign via referral link)
   * Called by referralMiddleware when referral code detected in URL
   *
   * @param {Object} params - Click parameters
   * @param {string} params.referralCode - Referral code from URL
   * @param {string} params.campaignId - Campaign ID
   * @param {ObjectId} params.visitorId - Authenticated user ID (optional)
   * @param {string} params.ipAddress - Visitor IP
   * @param {string} params.userAgent - Visitor user agent
   * @returns {Promise<Object>} - Tracking result
   */
  static async recordClick(params) {
    const { referralCode, campaignId, visitorId, ipAddress, userAgent } = params;

    try {
      if (!referralCode || !campaignId) {
        return {
          success: true,
          click_recorded: false,
          reason: 'Missing required parameters',
        };
      }

      // Clean referral code
      const cleanCode = referralCode.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();

      // Find share record
      const shareRecord = await ShareRecord.findOne({
        referral_code: cleanCode,
        campaign_id: campaignId,
      }).populate('supporter_id', '_id email name');

      if (!shareRecord) {
        winstonLogger.warn('⚠️ ConversionTrackingService: Share not found for click', {
          referralCode: cleanCode,
          campaignId,
        });
        return {
          success: true,
          click_recorded: false,
          reason: 'Share record not found',
        };
      }

      // Update ShareRecord click count
      shareRecord.clicks = (shareRecord.clicks || 0) + 1;
      shareRecord.last_clicked_at = new Date();
      await shareRecord.save();

      // Update ReferralTracking
      let referralTracking = await ReferralTracking.findOne({
        share_id: shareRecord._id,
        campaign_id: campaignId,
        referrer_id: shareRecord.supporter_id._id,
      });

      if (!referralTracking) {
        referralTracking = new ReferralTracking({
          tracking_id: `RT-${Date.now()}-${Math.random().toString(36).substr(2, 8).toUpperCase()}`,
          campaign_id: campaignId,
          share_id: shareRecord._id,
          referrer_id: shareRecord.supporter_id._id,
          referral_visits: [],
          conversions: [],
          total_visits: 0,
          total_conversions: 0,
          total_conversion_amount: 0,
          conversion_rate: 0,
          is_active: true,
        });
      }

      // Add visit
      referralTracking.referral_visits.push({
        visitor_id: visitorId || null,
        visited_at: new Date(),
        ip_address: ipAddress,
        user_agent: userAgent,
      });

      referralTracking.total_visits += 1;

      // Recalculate conversion rate
      if (referralTracking.total_conversions > 0) {
        referralTracking.conversion_rate =
          (referralTracking.total_conversions / referralTracking.total_visits) * 100;
      }

      referralTracking.updated_at = new Date();
      referralTracking.markModified('referral_visits');

      await referralTracking.save();

      winstonLogger.debug('✅ ConversionTrackingService: Click recorded', {
        shareId: shareRecord._id,
        referralCode: cleanCode,
        totalClicks: shareRecord.clicks,
        totalVisits: referralTracking.total_visits,
      });

      return {
        success: true,
        click_recorded: true,
        data: {
          tracking_id: referralTracking.tracking_id,
          share_id: shareRecord.share_id,
          total_clicks: shareRecord.clicks,
          total_visits: referralTracking.total_visits,
          total_conversions: referralTracking.total_conversions,
          conversion_rate: referralTracking.conversion_rate.toFixed(2),
        },
      };
    } catch (error) {
      winstonLogger.error('❌ ConversionTrackingService.recordClick error', {
        error: error.message,
        referralCode: params.referralCode?.substring(0, 10),
        campaignId: params.campaignId,
        visitorId: params.visitorId,
      });

      return {
        success: false,
        error: 'CLICK_TRACKING_ERROR',
        message: error.message,
      };
    }
  }

  /**
   * Get conversion analytics for a specific share
   *
   * @param {string} shareId - Share ID
   * @returns {Promise<Object>} - Conversion analytics
   */
  static async getShareConversionAnalytics(shareId) {
    try {
      const shareRecord = await ShareRecord.findOne({ share_id: shareId }).populate(
        'campaign_id supporter_id',
        '_id title sharrer_id name'
      );

      if (!shareRecord) {
        return {
          success: false,
          error: 'SHARE_NOT_FOUND',
        };
      }

      const referralTracking = await ReferralTracking.findOne({
        share_id: shareRecord._id,
      });

      if (!referralTracking) {
        return {
          success: true,
          data: {
            share_id: shareRecord.share_id,
            total_clicks: shareRecord.clicks || 0,
            total_conversions: 0,
            total_conversion_value: 0,
            conversion_rate: 0,
            clicks_to_conversion: 0,
            average_conversion_value: 0,
          },
        };
      }

      return {
        success: true,
        data: {
          share_id: shareRecord.share_id,
          campaign_id: shareRecord.campaign_id?._id,
          campaign_title: shareRecord.campaign_id?.title,
          sharer_id: shareRecord.supporter_id?._id,
          sharer_name: shareRecord.supporter_id?.name,
          channel: shareRecord.channel,
          total_clicks: shareRecord.clicks || 0,
          total_conversions: shareRecord.conversions || 0,
          total_visits: referralTracking.total_visits,
          total_conversion_value: referralTracking.total_conversion_amount,
          conversion_rate: referralTracking.conversion_rate.toFixed(2),
          clicks_to_conversion: shareRecord.clicks > 0
            ? Math.round((shareRecord.conversions / shareRecord.clicks) * 100) / 100
            : 0,
          average_conversion_value: shareRecord.conversions > 0
            ? Math.round(referralTracking.total_conversion_amount / shareRecord.conversions)
            : 0,
          last_clicked_at: shareRecord.last_clicked_at,
          created_at: shareRecord.created_at,
          updated_at: shareRecord.updated_at,
        },
      };
    } catch (error) {
      winstonLogger.error('❌ ConversionTrackingService.getShareConversionAnalytics error', {
        error: error.message,
        shareId,
      });

      return {
        success: false,
        error: 'ANALYTICS_ERROR',
        message: error.message,
      };
    }
  }

  /**
   * Get conversion analytics aggregated by campaign
   *
   * @param {string} campaignId - Campaign ID
   * @returns {Promise<Object>} - Campaign conversion analytics
   */
  static async getCampaignConversionAnalytics(campaignId) {
    try {
      const campaign = await Campaign.findById(campaignId);
      if (!campaign) {
        return {
          success: false,
          error: 'CAMPAIGN_NOT_FOUND',
        };
      }

      const shares = await ShareRecord.find({ campaign_id: campaignId });

      const totalClicks = shares.reduce((sum, s) => sum + (s.clicks || 0), 0);
      const totalConversions = shares.reduce((sum, s) => sum + (s.conversions || 0), 0);
      const totalConversionValue = shares.reduce((sum, s) => sum + (s.total_conversion_value || 0), 0);

      // Get conversion breakdown by channel
      const conversionByChannel = {};
      shares.forEach((share) => {
        const channel = share.channel;
        if (!conversionByChannel[channel]) {
          conversionByChannel[channel] = {
            total_clicks: 0,
            total_conversions: 0,
            total_value: 0,
            share_count: 0,
          };
        }
        conversionByChannel[channel].total_clicks += share.clicks || 0;
        conversionByChannel[channel].total_conversions += share.conversions || 0;
        conversionByChannel[channel].total_value += share.total_conversion_value || 0;
        conversionByChannel[channel].share_count += 1;
      });

      return {
        success: true,
        data: {
          campaign_id: campaignId,
          campaign_title: campaign.title,
          total_shares: shares.length,
          total_clicks: totalClicks,
          total_conversions: totalConversions,
          total_conversion_value: totalConversionValue,
          conversion_rate: shares.length > 0 ? (totalConversions / shares.length) * 100 : 0,
          average_conversion_value: totalConversions > 0
            ? Math.round(totalConversionValue / totalConversions)
            : 0,
          clicks_to_conversion_ratio: totalClicks > 0
            ? Math.round((totalConversions / totalClicks) * 100) / 100
            : 0,
          by_channel: conversionByChannel,
          top_converter: shares.reduce(
            (prev, current) =>
              (current.conversions || 0) > (prev.conversions || 0) ? current : prev,
            shares[0]
          ) || null,
        },
      };
    } catch (error) {
      winstonLogger.error('❌ ConversionTrackingService.getCampaignConversionAnalytics error', {
        error: error.message,
        campaignId,
      });

      return {
        success: false,
        error: 'ANALYTICS_ERROR',
        message: error.message,
      };
    }
  }

  /**
   * Get conversion analytics for a specific supporter
   *
   * @param {ObjectId} supporterId - Supporter ID
   * @returns {Promise<Object>} - Supporter conversion analytics
   */
  static async getSupporterConversionAnalytics(supporterId) {
    try {
      const shares = await ShareRecord.find({ supporter_id: supporterId });

      if (shares.length === 0) {
        return {
          success: true,
          data: {
            supporter_id: supporterId,
            total_shares: 0,
            total_clicks: 0,
            total_conversions: 0,
            total_conversion_value: 0,
            conversion_rate: 0,
            average_conversion_value: 0,
            by_campaign: [],
            by_channel: {},
          },
        };
      }

      const totalClicks = shares.reduce((sum, s) => sum + (s.clicks || 0), 0);
      const totalConversions = shares.reduce((sum, s) => sum + (s.conversions || 0), 0);
      const totalConversionValue = shares.reduce((sum, s) => sum + (s.total_conversion_value || 0), 0);

      // Group by campaign
      const byCampaign = {};
      const byChannel = {};

      for (const share of shares) {
        const campaignId = share.campaign_id.toString();
        const channel = share.channel;

        if (!byCampaign[campaignId]) {
          byCampaign[campaignId] = {
            campaign_id: share.campaign_id,
            total_clicks: 0,
            total_conversions: 0,
            total_value: 0,
            share_count: 0,
          };
        }

        if (!byChannel[channel]) {
          byChannel[channel] = {
            total_clicks: 0,
            total_conversions: 0,
            total_value: 0,
            share_count: 0,
          };
        }

        byCampaign[campaignId].total_clicks += share.clicks || 0;
        byCampaign[campaignId].total_conversions += share.conversions || 0;
        byCampaign[campaignId].total_value += share.total_conversion_value || 0;
        byCampaign[campaignId].share_count += 1;

        byChannel[channel].total_clicks += share.clicks || 0;
        byChannel[channel].total_conversions += share.conversions || 0;
        byChannel[channel].total_value += share.total_conversion_value || 0;
        byChannel[channel].share_count += 1;
      }

      return {
        success: true,
        data: {
          supporter_id: supporterId,
          total_shares: shares.length,
          total_clicks: totalClicks,
          total_conversions: totalConversions,
          total_conversion_value: totalConversionValue,
          conversion_rate: shares.length > 0 ? (totalConversions / shares.length) * 100 : 0,
          average_conversion_value: totalConversions > 0
            ? Math.round(totalConversionValue / totalConversions)
            : 0,
          clicks_to_conversion_ratio: totalClicks > 0
            ? Math.round((totalConversions / totalClicks) * 100) / 100
            : 0,
          by_campaign: Object.values(byCampaign),
          by_channel: byChannel,
        },
      };
    } catch (error) {
      winstonLogger.error('❌ ConversionTrackingService.getSupporterConversionAnalytics error', {
        error: error.message,
        supporterId,
      });

      return {
        success: false,
        error: 'ANALYTICS_ERROR',
        message: error.message,
      };
    }
  }
}

module.exports = ConversionTrackingService;
