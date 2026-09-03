/**
 * CampaignBoostService — COMMUNITY (peer) boosts
 * -------------------------------------------------------------------------
 * ⚠️ Not to be confused with StripeBoostService / BoostController, which handle
 * the creator's own PAID visibility purchase for their own campaign. This
 * service is the free, peer-to-peer signal: one user amplifying ANOTHER user's
 * campaign.
 *
 * The model, chosen for HonestNeed specifically
 * ---------------------------------------------
 * A free, trust-weighted, time-decayed community boost that ranks strictly
 * BELOW paid boosts.
 *
 *   - Free, because HonestNeed does not escrow money (trust-based model) and a
 *     paid peer boost would collide head-on with the $20 pro tier.
 *   - Trust-weighted, because an unweighted counter is a sockpuppet farm.
 *   - Time-decayed, so a campaign cannot coast on old boosts and "trending"
 *     reflects current community energy.
 *   - Below paid boosts, because if a free action outranked the paid product,
 *     this feature would be a revenue regression.
 *
 * Quota: one ranking-effective boost per user per campaign per UTC day —
 * deliberately mirroring the existing "1 tip-eligible share per campaign per
 * day, over-quota is free" rule, so users only have to learn one rule. The
 * quota is enforced by a UNIQUE database index, not an application check, so
 * concurrent double-submits cannot race.
 */

const crypto = require('crypto');

const Campaign = require('../models/Campaign');
const CampaignSupportBoost = require('../models/CampaignSupportBoost');
const User = require('../models/User');
const GamificationService = require('./GamificationService');
const NotificationDispatcher = require('./NotificationDispatcher');
const CampaignEventAnalyticsService = require('./CampaignEventAnalyticsService');
const FeatureFlagService = require('./FeatureFlagService');
const winstonLogger = require('../utils/winstonLogger');

// Trust weights. A boost from an account that clears none of these bars is
// still RECORDED (so analytics stay truthful and the user gets feedback) but
// contributes nothing to ranking — and looks identical from the outside, so a
// farmer gets no signal to optimise against.
const TRUST_WEIGHTS = {
  IDENTITY_VERIFIED: 1.0,
  ESTABLISHED: 0.5, // email-verified and account ≥ MIN_ACCOUNT_AGE_DAYS old
  UNTRUSTED: 0,
};

const MIN_ACCOUNT_AGE_DAYS = 7;

// Half-life-ish constant for the decay curve: weight × e^(−age_days / 7).
const DECAY_TAU_DAYS = 7;

// Cumulative boost counts that earn the owner a milestone notification.
const MILESTONE_THRESHOLDS = [10, 25, 50, 100, 250, 500];

class CampaignBoostService {
  /**
   * Hash an IP/user-agent before storage. These records are retained long-term
   * for ranking; retaining raw IPs for that is not justified.
   */
  static hash(value) {
    if (!value) return null;
    return crypto.createHash('sha256').update(String(value)).digest('hex').slice(0, 32);
  }

  /**
   * How much this user's boost is worth for ranking purposes.
   * @returns {Promise<{weight: number, reason: string|null}>}
   */
  static async resolveTrustWeight(userId) {
    const user = await User.findById(userId).select(
      'created_at blocked deleted_at verification_badges identity_tier'
    );

    if (!user || user.deleted_at || user.blocked) {
      return { weight: TRUST_WEIGHTS.UNTRUSTED, reason: 'fraud_flag' };
    }

    if (user.verification_badges?.identity_verified) {
      return { weight: TRUST_WEIGHTS.IDENTITY_VERIFIED, reason: null };
    }

    const ageDays = (Date.now() - new Date(user.created_at).getTime()) / 86400000;
    if (user.verification_badges?.email_verified && ageDays >= MIN_ACCOUNT_AGE_DAYS) {
      return { weight: TRUST_WEIGHTS.ESTABLISHED, reason: null };
    }

    return { weight: TRUST_WEIGHTS.UNTRUSTED, reason: 'low_trust' };
  }

  /**
   * Decay factor for a boost of a given age.
   */
  static decayFactor(createdAt, now = new Date()) {
    const ageDays = Math.max(0, (now - new Date(createdAt).getTime()) / 86400000);
    return Math.exp(-ageDays / DECAY_TAU_DAYS);
  }

  /**
   * Reasons this campaign cannot be boosted right now.
   */
  static getCampaignIneligibility(campaign) {
    if (!campaign) return { code: 'CAMPAIGN_NOT_FOUND', message: 'Campaign not found.' };
    if (campaign.deleted_at) {
      return { code: 'CAMPAIGN_NOT_ELIGIBLE', message: 'This campaign is no longer available.' };
    }
    if (campaign.status !== 'active') {
      return {
        code: 'CAMPAIGN_NOT_ELIGIBLE',
        message: 'Only active campaigns can be boosted.',
      };
    }
    if (['rejected', 'flagged', 'escalated'].includes(campaign.moderation?.review_status)) {
      return { code: 'CAMPAIGN_NOT_ELIGIBLE', message: 'This campaign is under review.' };
    }
    return null;
  }

  /**
   * Read-only state for the boost button.
   */
  static async getBoostEligibility(campaignIdOrRef, userId) {
    const campaign = await this.resolveCampaign(campaignIdOrRef);
    if (!campaign) {
      throw { code: 'CAMPAIGN_NOT_FOUND', message: 'Campaign not found.', statusCode: 404 };
    }

    const base = {
      campaign_id: campaign.campaign_id,
      community_boost_count: campaign.community_boost_count || 0,
      community_boost_score: campaign.community_boost_score || 0,
    };

    if (!userId) {
      return { ...base, can_boost: false, state: 'unauthenticated' };
    }

    if (String(campaign.creator_id) === String(userId)) {
      // Self-boost is not a thing. Hidden in the UI rather than shown disabled.
      return { ...base, can_boost: false, state: 'self_boost' };
    }

    const ineligible = this.getCampaignIneligibility(campaign);
    if (ineligible) {
      return { ...base, can_boost: false, state: 'ineligible_campaign', reason: ineligible.message };
    }

    const todays = await CampaignSupportBoost.findTodaysBoost(campaign._id, userId);
    if (todays) {
      return {
        ...base,
        can_boost: false,
        state: 'already_boosted_today',
        next_boost_available_at: CampaignSupportBoost.nextBoostAvailableAt(),
      };
    }

    return { ...base, can_boost: true, state: 'available' };
  }

  static async resolveCampaign(idOrRef) {
    const mongoose = require('mongoose');
    if (!idOrRef) return null;
    if (mongoose.Types.ObjectId.isValid(String(idOrRef))) {
      const byId = await Campaign.findById(idOrRef);
      if (byId) return byId;
    }
    return Campaign.findOne({ campaign_id: idOrRef });
  }

  /**
   * Record a community boost.
   *
   * @param {Object} params
   * @param {string} params.campaignId
   * @param {string} params.userId
   * @param {string} [params.source]
   * @param {string} [params.shareId]
   * @param {string} [params.channel]
   * @param {Object} [params.req] - for IP/user-agent hashing
   */
  static async createBoost({ campaignId, userId, source = 'campaign_page', shareId = null, channel = null, req = null }) {
    await FeatureFlagService.assertEnabled(
      'community_boost',
      'Boosting is temporarily unavailable. Please try again later.'
    );

    const campaign = await this.resolveCampaign(campaignId);
    if (!campaign) {
      throw { code: 'CAMPAIGN_NOT_FOUND', message: 'Campaign not found.', statusCode: 404 };
    }

    // Self-boost: rejected outright.
    if (String(campaign.creator_id) === String(userId)) {
      throw {
        code: 'SELF_BOOST_FORBIDDEN',
        message: "You can't boost your own campaign.",
        statusCode: 403,
      };
    }

    const ineligible = this.getCampaignIneligibility(campaign);
    if (ineligible) {
      throw { ...ineligible, statusCode: 400 };
    }

    const { weight, reason } = await this.resolveTrustWeight(userId);
    const countsTowardScore = weight > 0;
    const scoreContribution = countsTowardScore ? weight : 0;
    const now = new Date();

    let boost;
    try {
      boost = await CampaignSupportBoost.create({
        campaign_id: campaign._id,
        owner_id: campaign.creator_id,
        booster_id: userId,
        boost_type: shareId ? 'share' : 'endorse',
        source,
        share_id: shareId,
        channel,
        counts_toward_score: countsTowardScore,
        trust_weight: weight,
        score_contribution: scoreContribution,
        suppressed_reason: countsTowardScore ? null : reason,
        ip_hash: this.hash(req?.ip || req?.headers?.['x-forwarded-for']),
        user_agent_hash: this.hash(req?.headers?.['user-agent']),
        boost_day: CampaignSupportBoost.dayKey(now),
      });
    } catch (error) {
      // The unique {campaign, booster, day} index fired: they already boosted
      // today. Over-quota boosts are accepted-but-free, exactly like shares.
      if (error.code === 11000) {
        const existing = await CampaignSupportBoost.findTodaysBoost(campaign._id, userId, now);
        return {
          boost: existing,
          counted: false,
          code: 'ALREADY_BOOSTED_TODAY',
          message: 'You already boosted this campaign today. Come back tomorrow!',
          campaign: {
            community_boost_count: campaign.community_boost_count || 0,
            community_boost_score: campaign.community_boost_score || 0,
          },
          next_boost_available_at: CampaignSupportBoost.nextBoostAvailableAt(now),
        };
      }
      throw error;
    }

    // Atomic counter update — $inc only, never read-modify-write.
    let updatedCampaign = campaign;
    if (countsTowardScore) {
      updatedCampaign =
        (await Campaign.findByIdAndUpdate(
          campaign._id,
          {
            $inc: { community_boost_count: 1, community_boost_score: scoreContribution },
            $set: { last_community_boost_at: now },
          },
          { new: true }
        )) || campaign;

      await this.recordActivist(campaign._id, userId);
    }

    // XP. Never let a gamification failure break the boost.
    let xpAwarded = 0;
    if (countsTowardScore) {
      try {
        const result = await GamificationService.awardForAction(userId, 'boost_campaign');
        xpAwarded = result?.awarded || result?.amount || 0;
        if (boost) {
          boost.xp_awarded = xpAwarded;
          await boost.save();
        }
      } catch (error) {
        winstonLogger.warn('CampaignBoostService: XP award failed', { message: error.message });
      }
    }

    if (countsTowardScore) {
      await this.notifyOwner(campaign, updatedCampaign, userId, now);
    }

    // Suppressed boosts are recorded too: a rising suppression rate with a
    // low_trust majority is the boost-farming early warning.
    await CampaignEventAnalyticsService.recordBoost({
      campaign,
      boosterId: userId,
      counted: countsTowardScore,
      suppressedReason: countsTowardScore ? null : reason,
      trustWeight: weight,
      source,
      req,
    });

    winstonLogger.info('⚡ CampaignBoostService: community boost recorded', {
      campaign_id: campaign.campaign_id,
      booster_id: String(userId),
      counted: countsTowardScore,
      trust_weight: weight,
    });

    return {
      boost,
      counted: countsTowardScore,
      suppressed_reason: countsTowardScore ? null : reason,
      xp_awarded: xpAwarded,
      campaign: {
        community_boost_count: updatedCampaign.community_boost_count || 0,
        community_boost_score: updatedCampaign.community_boost_score || 0,
      },
      next_boost_available_at: CampaignSupportBoost.nextBoostAvailableAt(now),
    };
  }

  /**
   * Reuse the existing `activists[]` array so boosters appear in the campaign's
   * supporter surfaces alongside sharers and volunteers.
   */
  static async recordActivist(campaignId, userId) {
    try {
      const user = await User.findById(userId).select('display_name');
      await Campaign.updateOne(
        { _id: campaignId, 'activists.user_id': { $ne: userId } },
        {
          $push: {
            activists: {
              user_id: userId,
              user_name: user?.display_name || 'Anonymous',
              action_type: 'advocate',
              impact_score: 1,
              date_joined: new Date(),
            },
          },
        }
      );
    } catch (error) {
      winstonLogger.warn('CampaignBoostService: activist record failed', {
        message: error.message,
      });
    }
  }

  /**
   * Owner notifications, DIGESTED. A trending campaign would otherwise generate
   * hundreds of notifications: first boost lands immediately, then at most one
   * per 24h, plus milestone markers.
   */
  static async notifyOwner(campaignBefore, campaignAfter, boosterId, now) {
    try {
      const count = campaignAfter.community_boost_count || 0;

      if (MILESTONE_THRESHOLDS.includes(count)) {
        await NotificationDispatcher.notify({
          userId: campaignAfter.creator_id,
          type: 'campaign_boost_milestone',
          data: {
            campaign_id: campaignAfter.campaign_id,
            campaign_title: campaignAfter.title,
            boost_count: count,
          },
        });
        return;
      }

      const last = campaignBefore.last_community_boost_at;
      const withinDigestWindow = last && now - new Date(last).getTime() < 86400000;
      if (withinDigestWindow) return;

      const booster = await User.findById(boosterId).select('display_name');
      await NotificationDispatcher.notify({
        userId: campaignAfter.creator_id,
        type: 'campaign_boosted',
        data: {
          campaign_id: campaignAfter.campaign_id,
          campaign_title: campaignAfter.title,
          actor_name: booster?.display_name || 'Someone',
        },
      });
    } catch (error) {
      winstonLogger.warn('CampaignBoostService: owner notification failed', {
        message: error.message,
      });
    }
  }

  /**
   * Public boost stats for a campaign.
   */
  static async getCampaignBoostStats(campaignIdOrRef, { recentLimit = 10 } = {}) {
    const campaign = await this.resolveCampaign(campaignIdOrRef);
    if (!campaign) {
      throw { code: 'CAMPAIGN_NOT_FOUND', message: 'Campaign not found.', statusCode: 404 };
    }

    const recent = await CampaignSupportBoost.find({
      campaign_id: campaign._id,
      counts_toward_score: true,
      revoked_at: null,
    })
      .sort({ created_at: -1 })
      .limit(recentLimit)
      .populate('booster_id', 'display_name avatar_url');

    return {
      campaign_id: campaign.campaign_id,
      community_boost_count: campaign.community_boost_count || 0,
      community_boost_score: campaign.community_boost_score || 0,
      last_community_boost_at: campaign.last_community_boost_at || null,
      recent_boosters: recent.map((b) => ({
        name: b.booster_id?.display_name || 'A supporter',
        avatar_url: b.booster_id?.avatar_url || null,
        boosted_at: b.created_at,
      })),
    };
  }

  /**
   * A user's own boost history.
   */
  static async getUserBoostActivity(userId, { page = 1, limit = 20 } = {}) {
    const skip = (Math.max(1, page) - 1) * limit;
    const [items, total] = await Promise.all([
      CampaignSupportBoost.find({ booster_id: userId })
        .sort({ created_at: -1 })
        .skip(skip)
        .limit(limit)
        .populate('campaign_id', 'campaign_id title image_url status'),
      CampaignSupportBoost.countDocuments({ booster_id: userId }),
    ]);

    return { items, total, page, limit };
  }

  /**
   * Recompute a campaign's decayed score from its surviving boosts. Run
   * nightly; also used after a fraud revocation so a removed boost stops
   * counting immediately.
   */
  static async recomputeScore(campaignId, now = new Date()) {
    const boosts = await CampaignSupportBoost.find({
      campaign_id: campaignId,
      counts_toward_score: true,
      revoked_at: null,
    }).select('trust_weight created_at booster_id');

    // One contribution per distinct booster — their most recent boost — so a
    // single enthusiast cannot outweigh a genuine crowd.
    const bestByBooster = new Map();
    for (const b of boosts) {
      const key = String(b.booster_id);
      const prev = bestByBooster.get(key);
      if (!prev || new Date(b.created_at) > new Date(prev.created_at)) {
        bestByBooster.set(key, b);
      }
    }

    let score = 0;
    for (const b of bestByBooster.values()) {
      score += (b.trust_weight || 0) * this.decayFactor(b.created_at, now);
    }

    const rounded = Math.round(score * 1000) / 1000;
    await Campaign.updateOne(
      { _id: campaignId },
      { $set: { community_boost_score: rounded, community_boost_count: bestByBooster.size } }
    );

    return { score: rounded, distinct_boosters: bestByBooster.size };
  }

  /**
   * Admin remediation: strike a fraudulent boost and recompute the score.
   */
  static async revokeBoost(boostId, { reason = null, adminId = null } = {}) {
    const boost = await CampaignSupportBoost.findById(boostId);
    if (!boost) {
      throw { code: 'BOOST_NOT_FOUND', message: 'Boost not found.', statusCode: 404 };
    }
    if (boost.revoked_at) return { boost, already_revoked: true };

    boost.revoked_at = new Date();
    boost.revoked_reason = reason;
    boost.revoked_by = adminId;
    boost.counts_toward_score = false;
    boost.suppressed_reason = 'fraud_flag';
    await boost.save();

    const recomputed = await this.recomputeScore(boost.campaign_id);

    await CampaignEventAnalyticsService.recordBoostRevoked({
      campaignId: boost.campaign_id,
      adminId,
      boostId: boost._id,
      reason,
    });

    return { boost, already_revoked: false, ...recomputed };
  }
}

module.exports = CampaignBoostService;
module.exports.TRUST_WEIGHTS = TRUST_WEIGHTS;
module.exports.DECAY_TAU_DAYS = DECAY_TAU_DAYS;
module.exports.MILESTONE_THRESHOLDS = MILESTONE_THRESHOLDS;
