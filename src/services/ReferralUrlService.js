/**
 * Referral URL Service
 * Generates, encodes, and manages referral tracking URLs
 * Integrates with referral tracking to record clicks and conversions
 */

const crypto = require('crypto');
const querystring = require('querystring');
const winstonLogger = require('../utils/winstonLogger');
const { ShareRecord } = require('../models/Share');
const ReferralTracking = require('../models/ReferralTracking');

class ReferralUrlService {
  /**
   * Generate a referral tracking URL for a share
   * @param {string} campaignId - Campaign MongoDB ID
   * @param {string} referralCode - Unique referral code from share record
   * @param {Object} options - Additional options
   * @returns {string} - Complete referral URL with tracking parameters
   */
  static generateReferralUrl(campaignId, referralCode, options = {}) {
    try {
      const baseUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
      const campaignUrl = `${baseUrl}/campaigns/${campaignId}`;
      
      // Build query parameters
      const params = {
        ref: referralCode,
        ...(options.source && { source: options.source }),
        ...(options.platform && { platform: options.platform }),
        t: Math.floor(Date.now() / 1000), // Timestamp for cache busting
      };

      const queryString = querystring.stringify(params);
      const fullUrl = `${campaignUrl}?${queryString}`;

      winstonLogger.debug('Referral URL generated', {
        campaignId,
        referralCode,
        fullUrl,
      });

      return fullUrl;
    } catch (error) {
      winstonLogger.error('Error generating referral URL', {
        error: error.message,
        campaignId,
        referralCode,
      });
      throw error;
    }
  }

  /**
   * Extract referral code from URL query parameters
   * @param {string} queryRef - Referral code from ?ref= parameter
   * @returns {string} - Cleaned referral code
   */
  static extractReferralCode(queryRef) {
    if (!queryRef) return null;
    // Clean and validate: alphanumeric only
    return queryRef.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  }

  /**
   * Record a referral click (visitor lands on campaign via referral link)
   * @param {Object} params - Parameters object
   * @param {string} params.referralCode - Referral code from URL
   * @param {string} params.campaignId - Campaign ID from URL
   * @param {string} params.visitorId - Authenticated user ID (optional)
   * @param {string} params.ipAddress - Visitor IP address
   * @param {string} params.userAgent - Visitor user agent
   * @returns {Promise<Object>} - Click tracking result with referral info
   */
  static async recordReferralClick(params) {
    const { referralCode, campaignId, visitorId, ipAddress, userAgent } = params;

    try {
      // Clean referral code
      const cleanCode = this.extractReferralCode(referralCode);
      if (!cleanCode) {
        throw {
          code: 'INVALID_REFERRAL_CODE',
          message: 'Invalid referral code format',
          statusCode: 400,
        };
      }

      // Find share record with this referral code
      const shareRecord = await ShareRecord.findOne({
        referral_code: cleanCode,
        campaign_id: campaignId,
      }).populate('supporter_id', '_id email name');

      if (!shareRecord) {
        winstonLogger.warn('Share record not found for referral code', {
          referralCode: cleanCode,
          campaignId,
        });
        // Return graceful response even if share not found (don't block user)
        return {
          success: true,
          message: 'Campaign accessed',
          referralCode: cleanCode,
          shareFound: false,
        };
      }

      // Record the referral visit in ReferralTracking
      let referralTracking = await ReferralTracking.findOne({
        share_id: shareRecord._id,
        campaign_id: campaignId,
        referrer_id: shareRecord.supporter_id,
      });

      if (!referralTracking) {
        // Create new tracking record if doesn't exist
        referralTracking = new ReferralTracking({
          tracking_id: `RT-${Date.now()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`,
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

      // Add this visit to the tracking record
      referralTracking.referral_visits.push({
        visitor_id: visitorId || null,
        visited_at: new Date(),
        ip_address: ipAddress,
        user_agent: userAgent,
      });

      referralTracking.total_visits += 1;

      // Calculate conversion rate if there are conversions
      if (referralTracking.total_conversions > 0) {
        referralTracking.conversion_rate = 
          (referralTracking.total_conversions / referralTracking.total_visits) * 100;
      }

      await referralTracking.save();

      // Update share record click count and stats
      shareRecord.clicks = (shareRecord.clicks || 0) + 1;
      await shareRecord.save();

      winstonLogger.info('Referral click recorded', {
        trackingId: referralTracking.tracking_id,
        shareId: shareRecord._id,
        campaignId,
        referrerId: shareRecord.supporter_id._id,
        totalVisits: referralTracking.total_visits,
        visitorId: visitorId || 'anonymous',
      });

      return {
        success: true,
        message: 'Referral click recorded',
        trackingId: referralTracking.tracking_id,
        shareId: shareRecord._id,
        referrerId: shareRecord.supporter_id._id,
        referrerName: shareRecord.supporter_id.name,
        totalVisits: referralTracking.total_visits,
        totalConversions: referralTracking.total_conversions,
        conversionRate: referralTracking.conversion_rate.toFixed(2),
      };
    } catch (error) {
      winstonLogger.error('Error recording referral click', {
        error: error.message,
        referralCode,
        campaignId,
        visitorId,
      });
      throw error;
    }
  }

  /**
   * Get referral URL statistics
   * @param {string} campaignId - Campaign ID
   * @param {string} referralCode - Referral code
   * @returns {Promise<Object>} - Referral statistics
   */
  static async getReferralStats(campaignId, referralCode) {
    try {
      const cleanCode = this.extractReferralCode(referralCode);

      // Find share record
      const shareRecord = await ShareRecord.findOne({
        referral_code: cleanCode,
        campaign_id: campaignId,
      }).populate('supporter_id', '_id email name');

      if (!shareRecord) {
        throw {
          code: 'SHARE_NOT_FOUND',
          message: 'Share record not found',
          statusCode: 404,
        };
      }

      // Find referral tracking
      const referralTracking = await ReferralTracking.findOne({
        share_id: shareRecord._id,
        campaign_id: campaignId,
        referrer_id: shareRecord.supporter_id._id,
      });

      if (!referralTracking) {
        // No tracking yet, return zeros
        return {
          success: true,
          stats: {
            totalClicks: sharRecord.clicks || 0,
            totalVisits: 0,
            totalConversions: 0,
            conversionRate: 0,
            totalConversionAmount: 0,
            averageDonationAmount: 0,
          },
        };
      }

      // Calculate averages
      const avgDonation =
        referralTracking.total_conversions > 0
          ? Math.round(referralTracking.total_conversion_amount / referralTracking.total_conversions)
          : 0;

      return {
        success: true,
        stats: {
          totalClicks: shareRecord.clicks || 0,
          totalVisits: referralTracking.total_visits,
          totalConversions: referralTracking.total_conversions,
          conversionRate: referralTracking.conversion_rate.toFixed(2),
          totalConversionAmount: referralTracking.total_conversion_amount,
          averageDonationAmount: avgDonation,
          createdAt: shareRecord.created_at,
          lastVisitAt: referralTracking.referral_visits.length > 0 
            ? referralTracking.referral_visits[referralTracking.referral_visits.length - 1].visited_at
            : null,
        },
      };
    } catch (error) {
      winstonLogger.error('Error getting referral stats', {
        error: error.message,
        campaignId,
        referralCode,
      });
      throw error;
    }
  }

  /**
   * Generate short tracking URL (if using URL shortening service)
   * @param {string} longUrl - Long URL to shorten
   * @param {Object} options - Options for shortening service
   * @returns {Promise<string>} - Short URL
   */
  static async generateShortUrl(longUrl, options = {}) {
    try {
      // For now, just return the long URL
      // In production, integrate with TinyURL, Bit.ly, or similar service
      // Example implementation would call external API here

      winstonLogger.debug('URL shortening requested (not yet integrated)', {
        originalUrl: longUrl,
      });

      return longUrl; // Return full URL for now
    } catch (error) {
      winstonLogger.warn('Error shortening URL, returning original', {
        error: error.message,
      });
      return longUrl;
    }
  }

  /**
   * Validate referral URL integrity
   * @param {string} url - URL to validate
   * @param {string} expectedReferralCode - Expected referral code
   * @returns {boolean} - True if valid
   */
  static validateReferralUrl(url, expectedReferralCode) {
    try {
      const urlObj = new URL(url);
      const refParam = urlObj.searchParams.get('ref');

      if (!refParam) return false;

      const cleanCode = this.extractReferralCode(refParam);
      const cleanExpected = this.extractReferralCode(expectedReferralCode);

      return cleanCode === cleanExpected;
    } catch (error) {
      winstonLogger.warn('Error validating referral URL', {
        error: error.message,
      });
      return false;
    }
  }
}

module.exports = ReferralUrlService;
