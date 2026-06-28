/**
 * HopeMeterService
 *
 * Aggregates the "soft impact" gamification surfaces that don't warrant their
 * own model:
 *   - RG-06 Prayer Power Meter     campaign prayer progress + tap-to-pray (RG-16)
 *   - RG-12 Milestone Celebrations recent celebratory events feed
 *   - RG-14 Hope Meter             user + campaign composite impact score
 *   - RG-15 Transformation Journey user impact timeline
 *   - RG-17 Swipe-to-Help feed     a swipeable queue of campaigns needing help
 *   - RG-19 Miracle Mode           activate/deactivate emergency rallying
 *
 * Prayer submission itself is owned by the existing PrayerService; this service
 * provides the gamified read/aggregation layer over it.
 */

const mongoose = require('mongoose');
const Campaign = require('../models/Campaign');
const GamificationEvent = require('../models/GamificationEvent');
const GamificationService = require('./GamificationService');
const EventBus = require('../events/EventBus');
const { HOPE_METER } = require('../config/gamification');
const winstonLogger = require('../utils/winstonLogger');

class HopeMeterService {
  // ── RG-06 Prayer Power Meter ──────────────────────────────────────────
  /**
   * Prayer "power meter" for a campaign: progress toward its prayer goal plus a
   * normalized 0-100 power value for the animated meter.
   */
  static async getPrayerPowerMeter(campaignId) {
    const campaign = await Campaign.findById(campaignId)
      .select('prayer_config prayer_metrics title')
      .lean();
    if (!campaign) return null;

    const count = campaign.prayer_metrics?.total_prayers || campaign.prayer_config?.prayer_count || 0;
    const goal = campaign.prayer_config?.prayer_goal || 100;
    const unique = (campaign.prayer_metrics?.unique_supporters_prayed || []).length;

    return {
      campaign_id: campaign._id,
      prayer_count: count,
      unique_supporters: unique,
      goal,
      percent: Math.min(100, Math.round((count / goal) * 100)),
      power_level: this._powerLevel(count),
    };
  }

  static _powerLevel(count) {
    if (count >= 1000) return 'supernova';
    if (count >= 500) return 'blazing';
    if (count >= 100) return 'strong';
    if (count >= 25) return 'growing';
    return 'kindled';
  }

  // ── RG-14 Hope Meter ──────────────────────────────────────────────────
  /** Composite user hope score + raw dimensions (recomputed & cached). */
  static async getUserHopeMeter(userId, opts = {}) {
    const result = await GamificationService.recomputeHopeScore(userId, opts);
    if (!result) return null;
    return {
      user_id: userId,
      hope_score: result.score,
      dimensions: result.dimensions,
      weights: HOPE_METER.weights,
    };
  }

  /**
   * Campaign-level hope meter: blends funding, prayers and shares into a single
   * multi-dimensional impact display.
   */
  static async getCampaignHopeMeter(campaignId) {
    const campaign = await Campaign.findById(campaignId)
      .select('funding_goals prayer_metrics prayer_config share_metrics donation_summary title raised_amount goal_amount')
      .lean();
    if (!campaign) return null;

    const prayers = campaign.prayer_metrics?.total_prayers || 0;
    const shares = campaign.share_metrics?.total_shares || 0;

    return {
      campaign_id: campaign._id,
      dimensions: {
        prayers,
        shares,
      },
      prayer_meter: await this.getPrayerPowerMeter(campaignId),
    };
  }

  // ── RG-15 Transformation Journey ──────────────────────────────────────
  /**
   * A user's impact timeline: their milestone-worthy gamification events in
   * chronological order, suitable for a journey visualization.
   */
  static async getJourney(userId, limit = 50) {
    const events = await GamificationEvent.find({
      user_id: userId,
      type: { $in: ['level_up', 'badge_earned', 'streak_milestone', 'golden_ticket', 'mission_complete', 'treasure_find'] },
    })
      .sort({ created_at: -1 })
      .limit(Math.min(limit, 200))
      .lean();

    return events.map((e) => ({
      type: e.type,
      action: e.action,
      xp: e.xp_awarded,
      meta: e.meta,
      at: e.created_at,
    }));
  }

  // ── RG-12 Milestone Celebrations feed ─────────────────────────────────
  /**
   * Recent celebratory events across a user (or platform) for the confetti /
   * celebration feed. These are the "moments worth animating".
   */
  static async getCelebrations(userId = null, limit = 20) {
    const query = {
      type: { $in: ['level_up', 'badge_earned', 'streak_milestone', 'golden_ticket', 'mission_complete'] },
    };
    if (userId) query.user_id = userId;

    return GamificationEvent.find(query)
      .sort({ created_at: -1 })
      .limit(Math.min(limit, 100))
      .lean();
  }

  // ── RG-17 Swipe-to-Help feed ──────────────────────────────────────────
  /**
   * A swipeable queue of active campaigns the user can quickly help (share /
   * pray / donate). Excludes campaigns the user already created. Lightweight
   * projection tuned for a TikTok-style card stack.
   */
  static async getSwipeFeed(userId, opts = {}) {
    const limit = Math.min(Math.max(parseInt(opts.limit) || 10, 1), 30);
    const query = { status: 'active', is_deleted: { $ne: true } };
    if (userId) query.creator_id = { $ne: userId };
    if (opts.city) query['location.city'] = opts.city;

    // Prioritize miracle-mode and recently active campaigns.
    const campaigns = await Campaign.find(query)
      .select('title summary description image_url video location funding_goals miracle_mode prayer_metrics share_metrics creator_id need_type created_at')
      .sort({ 'miracle_mode.active': -1, created_at: -1 })
      .limit(limit)
      .lean();

    return campaigns.map((c) => ({
      id: c._id,
      title: c.title,
      summary: c.summary || (c.description || '').slice(0, 200),
      image_url: c.image_url,
      video: c.video || null,
      city: c.location?.city || null,
      need_type: c.need_type,
      miracle_mode: !!c.miracle_mode?.active,
      prayers: c.prayer_metrics?.total_prayers || 0,
      shares: c.share_metrics?.total_shares || 0,
    }));
  }

  // ── RG-19 Miracle Mode ────────────────────────────────────────────────
  /**
   * Activate emergency rallying for a campaign. Only the creator or an admin
   * should reach here (enforced by the controller). Emits an event so feeds /
   * notifications can react.
   */
  static async activateMiracleMode(campaignId, actorId, { reason, durationHours } = {}) {
    const campaign = await Campaign.findById(campaignId);
    if (!campaign || campaign.is_deleted) throw new Error('Campaign not found');

    const now = new Date();
    campaign.miracle_mode = {
      active: true,
      reason: reason ? String(reason).slice(0, 500) : null,
      activated_at: now,
      activated_by: actorId,
      expires_at: durationHours ? new Date(now.getTime() + durationHours * 36e5) : null,
    };
    await campaign.save();

    EventBus.emit('campaign:miracle_mode', {
      campaign_id: campaign._id,
      creator_id: campaign.creator_id,
      reason: campaign.miracle_mode.reason,
    });

    winstonLogger.info('✨ Miracle mode activated', { campaignId: campaign._id.toString(), actorId: actorId?.toString() });
    return campaign.miracle_mode;
  }

  static async deactivateMiracleMode(campaignId) {
    const campaign = await Campaign.findById(campaignId);
    if (!campaign) throw new Error('Campaign not found');
    campaign.miracle_mode = { active: false, reason: null, activated_at: null, activated_by: null, expires_at: null };
    await campaign.save();
    return campaign.miracle_mode;
  }

  /** Active miracle-mode campaigns (for a rally banner / feed). */
  static async getMiracleCampaigns(limit = 20) {
    const now = new Date();
    return Campaign.find({
      'miracle_mode.active': true,
      status: 'active',
      $or: [{ 'miracle_mode.expires_at': null }, { 'miracle_mode.expires_at': { $gt: now } }],
    })
      .select('title summary image_url miracle_mode location funding_goals')
      .sort({ 'miracle_mode.activated_at': -1 })
      .limit(Math.min(limit, 50))
      .lean();
  }
}

module.exports = HopeMeterService;
