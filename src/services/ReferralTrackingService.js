/**
 * Referral Tracking Service
 * Manages referral tracking, conversions, and analytics
 */

const { v4: uuidv4 } = require('uuid');
const ReferralTracking = require('../models/ReferralTracking');
const Campaign = require('../models/Campaign');
const { ShareRecord } = require('../models/Share');
const User = require('../models/User');
const winstonLogger = require('../utils/winstonLogger');

class ReferralTrackingService {
  /**
   * Record a referral visit
   * @param {Object} params - Parameters object
   * @param {string} params.shareId - Share record ID
   * @param {string} params.campaignId - Campaign ID
   * @param {string} params.referrerId - Referrer User ID
   * @param {string} params.visitorId - Visitor User ID (optional, null if not logged in)
   * @param {string} params.ipAddress - Visitor IP address
   * @param {string} params.userAgent - User agent string
   * @returns {Promise<Object>} - Referral tracking result
   */
  static async recordReferralVisit(params) {
    const { shareId, campaignId, referrerId, visitorId, ipAddress, userAgent } = params;

    try {
      // Verify share exists
      const share = await ShareRecord.findById(shareId);
      if (!share) {
        throw {
          code: 'SHARE_NOT_FOUND',
          message: 'Share record not found',
          statusCode: 404,
        };
      }

      // Verify campaign exists
      const campaign = await Campaign.findById(campaignId);
      if (!campaign) {
        throw {
          code: 'CAMPAIGN_NOT_FOUND',
          message: 'Campaign not found',
          statusCode: 404,
        };
      }

      // Find or create referral tracking record
      let referralTracking = await ReferralTracking.findOne({
        share_id: shareId,
        campaign_id: campaignId,
        referrer_id: referrerId,
      });

      if (!referralTracking) {
        const trackingId = `REF-${Date.now()}-${uuidv4().substring(0, 8)}`;
        referralTracking = new ReferralTracking({
          tracking_id: trackingId,
          campaign_id: campaignId,
          share_id: shareId,
          referrer_id: referrerId,
          referral_visits: [],
          conversions: [],
          total_visits: 0,
          total_conversions: 0,
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
      await referralTracking.save();

      winstonLogger.info('Referral visit recorded', {
        trackingId: referralTracking.tracking_id,
        shareId,
        campaignId,
        totalVisits: referralTracking.total_visits,
      });

      return {
        success: true,
        trackingId: referralTracking.tracking_id,
        totalVisits: referralTracking.total_visits,
      };
    } catch (error) {
      winstonLogger.error('Error recording referral visit', {
        error: error.message,
        shareId,
        campaignId,
        referrerId,
      });

      throw error;
    }
  }

  /**
   * Record a referral conversion (donation from referral visitor)
   * @param {Object} params - Parameters object
   * @param {string} params.shareId - Share ID that generated referral
   * @param {string} params.campaignId - Campaign ID
   * @param {string} params.referrerId - Original referrer ID
   * @param {string} params.donorId - Donor who made donation
   * @param {string} params.donationId - Donation record ID
   * @param {number} params.donationAmount - Amount donated (in cents)
   * @returns {Promise<Object>} - Conversion tracking result
   */
  static async recordConversion(params) {
    const { shareId, campaignId, referrerId, donorId, donationId, donationAmount } = params;

    try {
      // Find referral tracking record
      let referralTracking = await ReferralTracking.findOne({
        share_id: shareId,
        campaign_id: campaignId,
        referrer_id: referrerId,
      });

      // If doesn't exist but we have the info, create it
      if (!referralTracking) {
        const trackingId = `REF-${Date.now()}-${uuidv4().substring(0, 8)}`;
        referralTracking = new ReferralTracking({
          tracking_id: trackingId,
          campaign_id: campaignId,
          share_id: shareId,
          referrer_id: referrerId,
          referral_visits: [],
          conversions: [],
          total_visits: 1, // Assume at least one visit
        });
      }

      // Check if already converted (prevent duplicates)
      const existingConversion = referralTracking.conversions.find(
        c => c.donation_id && c.donation_id.toString() === donationId
      );

      if (existingConversion) {
        throw {
          code: 'DUPLICATE_CONVERSION',
          message: 'Conversion already recorded for this donation',
          statusCode: 409,
        };
      }

      // Add conversion
      referralTracking.conversions.push({
        converted_by_id: donorId,
        donation_id: donationId,
        donation_amount: donationAmount,
        converted_at: new Date(),
        reward_pending: true,
        reward_amount: 0, // Will be calculated based on share amount
      });

      referralTracking.total_conversions += 1;
      referralTracking.total_conversion_amount += donationAmount;
      referralTracking.markModified('conversions');
      await referralTracking.save();

      winstonLogger.info('Referral conversion recorded', {
        trackingId: referralTracking.tracking_id,
        shareId,
        conversionCount: referralTracking.total_conversions,
        totalAmount: referralTracking.total_conversion_amount,
      });

      return {
        success: true,
        trackingId: referralTracking.tracking_id,
        totalConversions: referralTracking.total_conversions,
        totalConversionAmount: referralTracking.total_conversion_amount,
        conversionRate: referralTracking.conversion_rate.toFixed(2),
        message: 'Conversion recorded successfully',
      };
    } catch (error) {
      winstonLogger.error('Error recording conversion', {
        error: error.message,
        shareId,
        donationId,
        referrerId,
      });

      throw error;
    }
  }

  /**
   * Get referral analytics for a campaign
   * @param {string} campaignId - Campaign ID
   * @param {Object} options - Query options {sortBy, limit}
   * @returns {Promise<Object>} - Referral analytics
   */
  static async getCampaignReferralAnalytics(campaignId, options = {}) {
    try {
      const { sortBy = '-total_conversions', limit = 50 } = options;

      // Get all referral records for campaign
      const referrals = await ReferralTracking.find({ campaign_id: campaignId })
        .populate('referrer_id', 'name email')
        .populate('share_id', 'channel created_at')
        .sort(sortBy)
        .limit(parseInt(limit));

      // Calculate aggregates
      const totalReferrals = referrals.length;
      const totalVisits = referrals.reduce((sum, r) => sum + r.total_visits, 0);
      const totalConversions = referrals.reduce((sum, r) => sum + r.total_conversions, 0);
      const totalConversionAmount = referrals.reduce((sum, r) => sum + r.total_conversion_amount, 0);
      const averageConversionRate = totalReferrals > 0 ? referrals.reduce((sum, r) => sum + r.conversion_rate, 0) / totalReferrals : 0;

      // Top performers
      const topPerformers = referrals
        .filter(r => r.total_conversions > 0)
        .sort((a, b) => b.conversion_rate - a.conversion_rate)
        .slice(0, 5);

      return {
        success: true,
        analytics: {
          totalReferrals,
          totalVisits,
          totalConversions,
          totalConversionAmount,
          averageConversionRate: averageConversionRate.toFixed(2),
          overallConversionRate: totalVisits > 0 ? ((totalConversions / totalVisits) * 100).toFixed(2) : 0,
          topPerformers: topPerformers.map(r => ({
            referrerId: r.referrer_id._id,
            referrerName: r.referrer_id.name,
            channel: r.share_id?.channel,
            visits: r.total_visits,
            conversions: r.total_conversions,
            conversionRate: r.conversion_rate.toFixed(2),
            totalConversionAmount: r.total_conversion_amount,
          })),
          allReferrals: referrals.map(r => ({
            trackingId: r.tracking_id,
            referrerId: r.referrer_id._id,
            referrerName: r.referrer_id.name,
            channel: r.share_id?.channel,
            visits: r.total_visits,
            conversions: r.total_conversions,
            conversionRate: r.conversion_rate.toFixed(2),
            totalConversionAmount: r.total_conversion_amount,
          })),
        },
      };
    } catch (error) {
      winstonLogger.error('Error fetching referral analytics', {
        error: error.message,
        campaignId,
      });

      throw error;
    }
  }

  /**
   * Get referral details for a specific share
   * @param {string} shareId - Share ID
   * @returns {Promise<Object>} - Detailed referral information
   */
  static async getShareReferralDetails(shareId) {
    try {
      const referrals = await ReferralTracking.find({ share_id: shareId })
        .populate('referrer_id', 'name email')
        .populate('conversions.converted_by_id', 'name email');

      if (referrals.length === 0) {
        return {
          success: true,
          details: {
            shareId,
            totalReferrals: 0,
            totalVisits: 0,
            totalConversions: 0,
            referrals: [],
          },
        };
      }

      // Aggregate data
      const totalVisits = referrals.reduce((sum, r) => sum + r.total_visits, 0);
      const totalConversions = referrals.reduce((sum, r) => sum + r.total_conversions, 0);

      return {
        success: true,
        details: {
          shareId,
          totalReferrals: referrals.length,
          totalVisits,
          totalConversions,
          conversionRate: totalVisits > 0 ? ((totalConversions / totalVisits) * 100).toFixed(2) : 0,
          referrals: referrals.map(r => ({
            trackingId: r.tracking_id,
            referrer: {
              id: r.referrer_id._id,
              name: r.referrer_id.name,
              email: r.referrer_id.email,
            },
            visits: r.total_visits,
            conversions: r.total_conversions,
            conversionRate: r.conversion_rate.toFixed(2),
            visitors: r.referral_visits.map(v => ({
              visitedAt: v.visited_at,
              visitorId: v.visitor_id,
            })),
          })),
        },
      };
    } catch (error) {
      winstonLogger.error('Error fetching share referral details', {
        error: error.message,
        shareId,
      });

      throw error;
    }
  }

  /**
   * Get supporter's referral performance
   * @param {string} referrerId - Referrer User ID
   * @param {Object} options - Query options {page, limit}
   * @returns {Promise<Object>} - Supporter referral summaries
   */
  static async getSupporterReferralPerformance(referrerId, options = {}) {
    try {
      // Get all referrals for this supporter (no pagination for now, get full data)
      const allReferrals = await ReferralTracking.find({ referrer_id: referrerId })
        .populate('campaign_id', 'title')
        .populate('share_id', 'channel');

      // Calculate totals from all referrals
      const totalReferrals = allReferrals.length;
      const totalConversions = allReferrals.reduce((sum, r) => sum + (r.total_conversions || 0), 0);
      const totalRewardEarned = allReferrals.reduce((sum, r) => sum + (r.total_conversion_amount || 0), 0);
      const conversionRate = totalReferrals > 0 ? (totalConversions / totalReferrals) : 0;

      // Calculate shares by channel
      const sharesByChannel = {};
      allReferrals.forEach(r => {
        const channel = r.share_id?.channel || 'other';
        sharesByChannel[channel] = (sharesByChannel[channel] || 0) + 1;
      });

      // Find top performing campaign
      let topPerformingCampaign = null;
      if (allReferrals.length > 0) {
        const campaignStats = {};
        allReferrals.forEach(r => {
          const campaignId = r.campaign_id?._id?.toString() || '';
          if (!campaignStats[campaignId]) {
            campaignStats[campaignId] = {
              campaignId,
              campaignTitle: r.campaign_id?.title || 'Unknown Campaign',
              shares: 0,
              referrals: 0,
              revenue: 0,
            };
          }
          campaignStats[campaignId].shares += 1;
          campaignStats[campaignId].referrals += r.total_conversions || 0;
          campaignStats[campaignId].revenue += r.total_conversion_amount || 0;
        });

        // Get the campaign with most revenue
        topPerformingCampaign = Object.values(campaignStats).reduce((best, current) => {
          return current.revenue > (best?.revenue || 0) ? current : best;
        });
      }

      return {
        totalReferrals,
        totalConversions,
        conversionRate: parseFloat(conversionRate.toFixed(2)),
        totalRewardEarned,
        sharesByChannel,
        ...(topPerformingCampaign && { topPerformingCampaign }),
      };
    } catch (error) {
      winstonLogger.error('Error fetching supporter referral performance', {
        error: error.message,
        referrerId,
      });

      throw error;
    }
  }

  /**
   * Mark conversion reward as paid
   * @param {string} trackingId - Referral tracking ID
   * @param {number} donationIndex - Index of conversion in conversions array
   * @param {number} rewardAmount - Reward amount in cents
   * @returns {Promise<Object>} - Result
   */
  static async markRewardPaid(trackingId, donationIndex, rewardAmount) {
    try {
      const referralTracking = await ReferralTracking.findOne({ tracking_id: trackingId });
      if (!referralTracking) {
        throw {
          code: 'REFERRAL_TRACKING_NOT_FOUND',
          message: 'Referral tracking record not found',
          statusCode: 404,
        };
      }

      if (donationIndex < 0 || donationIndex >= referralTracking.conversions.length) {
        throw {
          code: 'INVALID_CONVERSION_INDEX',
          message: 'Conversion index out of range',
          statusCode: 400,
        };
      }

      referralTracking.conversions[donationIndex].reward_pending = false;
      referralTracking.conversions[donationIndex].reward_amount = rewardAmount;
      referralTracking.markModified('conversions');
      await referralTracking.save();

      winstonLogger.info('Reward marked as paid', {
        trackingId,
        rewardAmount,
      });

      return {
        success: true,
        message: 'Reward marked as paid',
      };
    } catch (error) {
      winstonLogger.error('Error marking reward as paid', {
        error: error.message,
        trackingId,
      });

      throw error;
    }
  }
}

module.exports = ReferralTrackingService;
