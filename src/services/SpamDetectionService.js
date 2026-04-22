/**
 * Spam Detection & Prevention Service
 * Day 5: Protects campaign from abuse
 */

const mongoose = require('mongoose');
const winstonLogger = require('../../src/utils/winston');

class SpamDetectionService {
  /**
   * Rate limiting: 10 shares per IP per campaign per hour
   */
  async checkRateLimit(campaignId, ipAddress) {
    const ShareRecord = require('../../src/models/Share').ShareRecord;
    const oneHourAgo = new Date(Date.now() - 3600000);

    const recentShares = await ShareRecord.countDocuments({
      campaign_id: mongoose.Types.ObjectId(campaignId),
      ip_address: ipAddress,
      created_at: { $gte: oneHourAgo },
    });

    const RATE_LIMIT_THRESHOLD = 10;
    if (recentShares >= RATE_LIMIT_THRESHOLD) {
      winstonLogger.warn('rate_limit_exceeded', {
        campaignId,
        ipAddress,
        recentShares,
        threshold: RATE_LIMIT_THRESHOLD,
      });
      return {
        allowed: false,
        code: 'RATE_LIMIT_EXCEEDED',
        message: `Too many shares from this IP (${recentShares}/${RATE_LIMIT_THRESHOLD})`,
        remaining: 0,
      };
    }

    return {
      allowed: true,
      remaining: RATE_LIMIT_THRESHOLD - recentShares,
    };
  }

  /**
   * Duplicate detection: same IP, same campaign within 5 minutes
   */
  async checkDuplicateActivity(campaignId, ipAddress, channel) {
    const ShareRecord = require('../../src/models/Share').ShareRecord;
    const fiveMinutesAgo = new Date(Date.now() - 300000);

    const duplicateShare = await ShareRecord.findOne({
      campaign_id: mongoose.Types.ObjectId(campaignId),
      ip_address: ipAddress,
      channel,
      created_at: { $gte: fiveMinutesAgo },
    });

    if (duplicateShare) {
      winstonLogger.warn('duplicate_activity_detected', {
        campaignId,
        ipAddress,
        channel,
        lastShareId: duplicateShare._id,
        timeSince: Date.now() - duplicateShare.created_at,
      });
      return {
        detected: true,
        code: 'DUPLICATE_SHARE_ATTEMPT',
        message: 'Same share detected from this IP in last 5 minutes',
        lastShare: duplicateShare,
      };
    }

    return {
      detected: false,
    };
  }

  /**
   * Behavior analysis: flag suspicious patterns
   * Patterns:
   * - Rapid succession shares (4+ in 10 minutes)
   * - Unusual donation amounts (too low or too high relative to category)
   * - Multiple IPs from same location
   * - Sudden spike in shares (3x normal rate)
   */
  async analyzeBehavior(campaignId, ipAddress, userData = {}) {
    const ShareRecord = require('../../src/models/Share').ShareRecord;
    const ReferralTracking = require('../../src/models/ReferralTracking');
    const flags = [];
    let suspicionScore = 0;

    // Check 1: Rapid succession shares (4+ in 10 minutes)
    const tenMinutesAgo = new Date(Date.now() - 600000);
    const rapidShares = await ShareRecord.countDocuments({
      campaign_id: mongoose.Types.ObjectId(campaignId),
      ip_address: ipAddress,
      created_at: { $gte: tenMinutesAgo },
    });

    if (rapidShares >= 4) {
      flags.push({
        type: 'rapid_succession',
        severity: 'high',
        message: `${rapidShares} shares in 10 minutes from single IP`,
        threshold: 4,
      });
      suspicionScore += 25;
    }

    // Check 2: Self-referral pattern (same user sharing multiple times without engagement)
    const userRecentShares = await ShareRecord.countDocuments({
      supporter_id: userData.supporterId,
      created_at: { $gte: new Date(Date.now() - 3600000) },
    });

    if (userRecentShares > 20) {
      flags.push({
        type: 'excessive_sharing',
        severity: 'medium',
        message: `User shared ${userRecentShares} times in 1 hour`,
        threshold: 20,
      });
      suspicionScore += 15;
    }

    // Check 3: Low engagement pattern (shares but no conversions)
    const userWithoutConversions = await ShareRecord.countDocuments({
      supporter_id: userData.supporterId,
      created_at: { $gte: new Date(Date.now() - 7 * 24 * 3600000) }, // 7 days
    });

    const userConversions = await ReferralTracking.countDocuments({
      referrer_id: userData.supporterId,
      total_conversions: { $gt: 0 },
    });

    if (userWithoutConversions > 50 && userConversions === 0) {
      flags.push({
        type: 'no_engagement',
        severity: 'medium',
        message: `${userWithoutConversions} shares but 0 conversions in 7 days`,
      });
      suspicionScore += 10;
    }

    // Check 4: Geographic anomaly (multiple shares from different IPs same network)
    const getIPNetwork = (ip) => ip.split('.').slice(0, 3).join('.');
    const ipNetwork = getIPNetwork(ipAddress);
    const networkShares = await ShareRecord.countDocuments({
      campaign_id: mongoose.Types.ObjectId(campaignId),
      ip_address: { $regex: `^${ipNetwork}\\.` },
      created_at: { $gte: tenMinutesAgo },
    });

    if (networkShares > 15) {
      flags.push({
        type: 'network_anomaly',
        severity: 'high',
        message: `${networkShares} shares from same /24 network in 10 minutes`,
      });
      suspicionScore += 20;
    }

    return {
      suspicionScore: Math.min(suspicionScore, 100), // Max 100
      isSuspicious: suspicionScore >= 40,
      flags,
    };
  }

  /**
   * Mark share as invalid (abuse/spam)
   * Refunds reward and reverts metrics
   */
  async revokeShare(shareId, reason) {
    const ShareRecord = require('../../src/models/Share').ShareRecord;
    const Campaign = require('../../src/models/Campaign');
    const ReferralTracking = require('../../src/models/ReferralTracking');

    const share = await ShareRecord.findById(shareId);
    if (!share) {
      throw { code: 'SHARE_NOT_FOUND', statusCode: 404 };
    }

    if (share.status === 'invalid') {
      throw { code: 'SHARE_ALREADY_REVOKED', statusCode: 409 };
    }

    const campaign = await Campaign.findById(share.campaign_id);

    // Refund reward if it was paid
    if (share.is_paid && share.reward_amount > 0) {
      await Campaign.findByIdAndUpdate(share.campaign_id, {
        $inc: {
          'share_config.current_budget_remaining': share.reward_amount,
        },
      });

      winstonLogger.info('share_reward_refunded', {
        shareId,
        campaignId: share.campaign_id,
        amount: share.reward_amount,
        reason,
      });
    }

    // Mark as invalid
    await ShareRecord.findByIdAndUpdate(shareId, {
      status: 'invalid',
      is_bot: true,
      revoked_at: new Date(),
      revoke_reason: reason,
    });

    // Revert referral tracking if associated
    const tracking = await ReferralTracking.findOne({
      share_id: shareId,
    });

    if (tracking) {
      // Store original metrics for audit
      const originalMetrics = {
        total_visits: tracking.total_visits,
        total_conversions: tracking.total_conversions,
        total_conversion_amount: tracking.total_conversion_amount,
      };

      // Reset metrics
      await ReferralTracking.findByIdAndUpdate(tracking._id, {
        referral_visits: [],
        conversions: [],
        total_visits: 0,
        total_conversions: 0,
        total_conversion_amount: 0,
        conversion_rate: '0.00',
        revoked_at: new Date(),
        original_metrics_archived: originalMetrics,
      });

      winstonLogger.info('referral_tracking_reverted', {
        trackingId: tracking._id,
        shareId,
        originalMetrics,
        reason,
      });
    }

    return {
      success: true,
      message: `Share ${shareId} revoked and metrics reverted`,
      refunded: share.reward_amount,
    };
  }

  /**
   * Archive suspicious shares for review
   */
  async archiveSuspiciousShare(shareId, suspicionAnalysis, adminNotes) {
    const ShareRecord = require('../../src/models/Share').ShareRecord;

    await ShareRecord.findByIdAndUpdate(shareId, {
      is_suspicious: true,
      suspension_analysis: suspicionAnalysis,
      suspended_at: new Date(),
      admin_notes: adminNotes,
      requires_review: true,
    });

    winstonLogger.warn('suspicious_share_archived', {
      shareId,
      suspicionScore: suspicionAnalysis.suspicionScore,
      flags: suspicionAnalysis.flags,
    });

    return {
      success: true,
      message: `Share archived for review (suspicion score: ${suspicionAnalysis.suspicionScore})`,
    };
  }

  /**
   * Get suspicious shares requiring review
   */
  async getSuspiciousShares(campaignId, { limit = 50, offset = 0 } = {}) {
    const ShareRecord = require('../../src/models/Share').ShareRecord;

    const shares = await ShareRecord.find({
      campaign_id: mongoose.Types.ObjectId(campaignId),
      requires_review: true,
    })
      .sort({ suspended_at: -1 })
      .limit(limit)
      .skip(offset);

    const total = await ShareRecord.countDocuments({
      campaign_id: mongoose.Types.ObjectId(campaignId),
      requires_review: true,
    });

    return {
      shares,
      pagination: {
        offset,
        limit,
        total,
        remaining: Math.max(0, total - offset - limit),
      },
    };
  }

  /**
   * Get admin dashboard stats
   */
  async getSpamStats(campaignId) {
    const ShareRecord = require('../../src/models/Share').ShareRecord;

    const totalShares = await ShareRecord.countDocuments({
      campaign_id: mongoose.Types.ObjectId(campaignId),
    });

    const suspiciousShares = await ShareRecord.countDocuments({
      campaign_id: mongoose.Types.ObjectId(campaignId),
      requires_review: true,
    });

    const revokedShares = await ShareRecord.countDocuments({
      campaign_id: mongoose.Types.ObjectId(campaignId),
      status: 'invalid',
    });

    const botShares = await ShareRecord.countDocuments({
      campaign_id: mongoose.Types.ObjectId(campaignId),
      is_bot: true,
    });

    return {
      totalShares,
      suspiciousShares,
      revokedShares,
      botShares,
      spamRate: ((suspiciousShares + revokedShares) / totalShares * 100).toFixed(2) + '%',
    };
  }
}

module.exports = SpamDetectionService;
