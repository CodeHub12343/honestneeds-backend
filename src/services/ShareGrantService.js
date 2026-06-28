/**
 * ShareGrantService
 *
 * Implements the client's daily share-limit rule and the "request another share"
 * flow (2026-06):
 *
 *  - A sharer earns a tip from only ONE reward-eligible share per campaign per
 *    UTC day (the BASE allowance), plus one extra reward-eligible share for each
 *    creator-APPROVED ShareGrant on that day.
 *  - Over-quota same-day shares are still recorded, but as FREE shares
 *    (reward_eligible:false) — they keep driving traffic without paying out.
 *  - To unlock another tip-eligible share the same day, the sharer asks the
 *    creator (with a reason); the creator approves/denies.
 *
 * This service owns all the quota math so ShareService.recordShare,
 * ShareController and the frontend share a single source of truth. It depends
 * only on models (never on ShareService) to avoid a require cycle.
 */

const ShareGrant = require('../models/ShareGrant');
const { ShareRecord } = require('../models/Share');
const Campaign = require('../models/Campaign');
const winstonLogger = require('../utils/winstonLogger');

// Base number of tip-eligible shares per campaign per user per day, before any
// creator-granted extras. The client's rule is "one time a day".
const BASE_DAILY_REWARD_SHARES = 1;

class ShareGrantService {
  /**
   * Midnight (UTC) of the day containing `date`. The daily window is [start, start+24h).
   * @param {Date} [date=new Date()]
   * @returns {Date}
   */
  static startOfUtcDay(date = new Date()) {
    const d = new Date(date);
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0));
  }

  /**
   * Compute the current daily tip-eligibility status for a (campaign, user).
   *
   * @param {string|ObjectId} campaignId
   * @param {string|ObjectId} userId
   * @param {Date} [now]
   * @returns {Promise<{
   *   reward_eligible_used: number,   // tip-eligible shares already made today
   *   base_quota: number,             // 1
   *   granted_slots: number,          // approved/consumed grants today
   *   quota: number,                  // base + granted_slots
   *   next_share_reward_eligible: boolean, // would the NEXT share earn a tip?
   *   remaining_reward_shares: number,
   *   has_pending_request: boolean,   // an undecided extra-share request exists
   *   for_date: Date
   * }>}
   */
  static async getDailyStatus(campaignId, userId, now = new Date()) {
    const dayStart = this.startOfUtcDay(now);
    const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

    const [rewardEligibleUsed, grantedSlots, pendingCount] = await Promise.all([
      ShareRecord.countDocuments({
        campaign_id: campaignId,
        supporter_id: userId,
        reward_eligible: true,
        created_at: { $gte: dayStart, $lt: dayEnd },
      }),
      // Slots the creator opened for today: approved (unused) + consumed (used).
      ShareGrant.countDocuments({
        campaign_id: campaignId,
        requester_id: userId,
        for_date: dayStart,
        status: { $in: ['approved', 'consumed'] },
      }),
      ShareGrant.countDocuments({
        campaign_id: campaignId,
        requester_id: userId,
        for_date: dayStart,
        status: 'pending',
      }),
    ]);

    const quota = BASE_DAILY_REWARD_SHARES + grantedSlots;
    const remaining = Math.max(0, quota - rewardEligibleUsed);

    return {
      reward_eligible_used: rewardEligibleUsed,
      base_quota: BASE_DAILY_REWARD_SHARES,
      granted_slots: grantedSlots,
      quota,
      next_share_reward_eligible: rewardEligibleUsed < quota,
      remaining_reward_shares: remaining,
      has_pending_request: pendingCount > 0,
      for_date: dayStart,
    };
  }

  /**
   * Decide whether the share being recorded RIGHT NOW should be tip-eligible,
   * and atomically consume a creator grant if this eligible share is beyond the
   * base 1/day allowance. Call this from inside recordShare BEFORE saving the
   * share record.
   *
   * @returns {Promise<{ reward_eligible: boolean, consumed_grant_id: ObjectId|null, status: object }>}
   */
  static async evaluateForRecord(campaignId, userId, now = new Date()) {
    const status = await this.getDailyStatus(campaignId, userId, now);

    if (!status.next_share_reward_eligible) {
      return { reward_eligible: false, consumed_grant_id: null, status };
    }

    // Eligible. If this is beyond the base allowance, it is backed by a grant —
    // claim one approved (unused) grant atomically so two concurrent shares can't
    // double-spend the same slot.
    let consumedGrantId = null;
    if (status.reward_eligible_used >= status.base_quota) {
      const grant = await ShareGrant.findOneAndUpdate(
        {
          campaign_id: campaignId,
          requester_id: userId,
          for_date: status.for_date,
          status: 'approved',
        },
        { $set: { status: 'consumed', consumed_at: now, updated_at: now } },
        { sort: { reviewed_at: 1 }, new: true }
      );
      if (!grant) {
        // Race: the only granted slot was just consumed by a concurrent share.
        // Fall back to free so we never pay beyond the quota.
        return { reward_eligible: false, consumed_grant_id: null, status };
      }
      consumedGrantId = grant._id;
    }

    return { reward_eligible: true, consumed_grant_id: consumedGrantId, status };
  }

  /**
   * Sharer asks the creator to allow another tip-eligible share today.
   *
   * @param {Object} p
   * @param {string|ObjectId} p.campaignId
   * @param {string|ObjectId} p.requesterId
   * @param {string} p.reason
   * @param {string} [p.channel]
   */
  static async requestExtraShare({ campaignId, requesterId, reason, channel = null }) {
    if (!reason || !reason.trim()) {
      throw { code: 'MISSING_REASON', message: 'Please say why you want to share again.', statusCode: 400 };
    }

    const campaign = await Campaign.findById(campaignId).select('creator_id title status');
    if (!campaign) {
      throw { code: 'CAMPAIGN_NOT_FOUND', message: 'Campaign does not exist', statusCode: 404 };
    }
    if (campaign.creator_id.toString() === requesterId.toString()) {
      throw { code: 'OWN_CAMPAIGN', message: 'You do not need a grant to share your own campaign.', statusCode: 400 };
    }

    const dayStart = this.startOfUtcDay();

    // One outstanding request per (campaign, user, day) — avoid inbox spam.
    const existingPending = await ShareGrant.findOne({
      campaign_id: campaignId,
      requester_id: requesterId,
      for_date: dayStart,
      status: 'pending',
    });
    if (existingPending) {
      throw {
        code: 'REQUEST_ALREADY_PENDING',
        message: 'You already have a pending request for this campaign today. Wait for the creator to respond.',
        statusCode: 409,
      };
    }

    const grant = await ShareGrant.create({
      campaign_id: campaignId,
      requester_id: requesterId,
      creator_id: campaign.creator_id,
      reason: reason.trim(),
      requested_channel: channel || null,
      status: 'pending',
      for_date: dayStart,
    });

    // Notify the creator (best-effort).
    this._notify(campaign.creator_id, 'share_extra_requested', {
      campaign_id: campaignId,
      campaign_title: campaign.title,
      request_id: grant.request_id,
      reason: grant.reason,
    }, {
      title: '🔁 Extra-share request',
      message: `A sharer asked to share "${campaign.title}" again today: "${grant.reason}"`,
      action_url: `/sharers-payouts/${campaignId}`,
      icon_emoji: '🔁',
      color: 'info',
    });

    return this._serialize(grant);
  }

  /**
   * Creator approves or denies an extra-share request.
   *
   * @param {Object} p
   * @param {string} p.requestId - ShareGrant.request_id OR _id
   * @param {string|ObjectId} p.reviewerId - must be the campaign creator
   * @param {boolean} p.approved
   * @param {string} [p.note]
   */
  static async reviewExtraShare({ requestId, reviewerId, approved, note = null }) {
    const grant = await this._findByAnyId(requestId);
    if (!grant) {
      throw { code: 'REQUEST_NOT_FOUND', message: 'Share request not found', statusCode: 404 };
    }
    if (grant.creator_id.toString() !== reviewerId.toString()) {
      throw { code: 'FORBIDDEN', message: 'Only the campaign creator can review this request.', statusCode: 403 };
    }
    if (grant.status !== 'pending') {
      throw {
        code: 'ALREADY_REVIEWED',
        message: `This request was already ${grant.status}.`,
        statusCode: 409,
      };
    }

    grant.status = approved ? 'approved' : 'denied';
    grant.reviewed_by = reviewerId;
    grant.reviewed_at = new Date();
    grant.review_note = note || null;
    await grant.save();

    const campaign = await Campaign.findById(grant.campaign_id).select('title');
    const title = campaign?.title || 'the campaign';

    this._notify(grant.requester_id, approved ? 'share_extra_approved' : 'share_extra_denied', {
      campaign_id: grant.campaign_id,
      campaign_title: title,
      request_id: grant.request_id,
      reason: note || undefined,
    }, approved
      ? {
          title: '✅ Extra share approved',
          message: `You can share "${title}" one more time today for a tip.`,
          action_url: `/campaigns/${grant.campaign_id}`,
          icon_emoji: '✅',
          color: 'success',
        }
      : {
          title: '🚫 Extra share not approved',
          message: `The creator declined another tip-eligible share of "${title}" today${note ? `: "${note}"` : ''}. You can still share it for free.`,
          action_url: `/campaigns/${grant.campaign_id}`,
          icon_emoji: '🚫',
          color: 'warning',
        });

    return this._serialize(grant);
  }

  /**
   * Creator inbox: extra-share requests for a campaign (default: pending).
   */
  static async listForCampaign(campaignId, { status = 'pending', page = 1, limit = 20 } = {}) {
    const query = { campaign_id: campaignId };
    if (status && status !== 'all') query.status = status;

    const skip = (Number(page) - 1) * Number(limit);
    const [items, total] = await Promise.all([
      ShareGrant.find(query)
        .sort({ created_at: -1 })
        .skip(skip)
        .limit(Number(limit))
        .populate('requester_id', 'name email avatar_url')
        .lean(),
      ShareGrant.countDocuments(query),
    ]);

    return {
      items: items.map((g) => this._serialize(g)),
      pagination: { page: Number(page), limit: Number(limit), total, pages: Math.ceil(total / limit) },
    };
  }

  /**
   * Sharer's own extra-share requests.
   */
  static async listForUser(userId, { status = 'all', page = 1, limit = 20 } = {}) {
    const query = { requester_id: userId };
    if (status && status !== 'all') query.status = status;

    const skip = (Number(page) - 1) * Number(limit);
    const [items, total] = await Promise.all([
      ShareGrant.find(query)
        .sort({ created_at: -1 })
        .skip(skip)
        .limit(Number(limit))
        .populate('campaign_id', 'title image_url')
        .lean(),
      ShareGrant.countDocuments(query),
    ]);

    return {
      items: items.map((g) => this._serialize(g)),
      pagination: { page: Number(page), limit: Number(limit), total, pages: Math.ceil(total / limit) },
    };
  }

  // ── helpers ──────────────────────────────────────────────────────────────

  static async _findByAnyId(requestId) {
    if (/^[0-9a-fA-F]{24}$/.test(String(requestId))) {
      const byObjId = await ShareGrant.findById(requestId);
      if (byObjId) return byObjId;
    }
    return ShareGrant.findOne({ request_id: requestId });
  }

  static _serialize(g) {
    const requester = g.requester_id && typeof g.requester_id === 'object' && g.requester_id.name
      ? { id: g.requester_id._id, name: g.requester_id.name, email: g.requester_id.email, avatar_url: g.requester_id.avatar_url }
      : { id: g.requester_id };
    const campaign = g.campaign_id && typeof g.campaign_id === 'object' && g.campaign_id.title
      ? { id: g.campaign_id._id, title: g.campaign_id.title, image_url: g.campaign_id.image_url }
      : { id: g.campaign_id };

    return {
      request_id: g.request_id,
      campaign: campaign,
      requester: requester,
      creator_id: g.creator_id,
      reason: g.reason,
      requested_channel: g.requested_channel || null,
      status: g.status,
      for_date: g.for_date,
      review_note: g.review_note || null,
      reviewed_at: g.reviewed_at || null,
      consumed_at: g.consumed_at || null,
      created_at: g.created_at,
    };
  }

  static _notify(userId, type, data, overrides) {
    // Best-effort: a notification failure must never break the share flow.
    try {
      const NotificationDispatcher = require('./NotificationDispatcher');
      Promise.resolve(NotificationDispatcher.notify({ userId, type, data, overrides })).catch((err) => {
        winstonLogger.error('ShareGrantService notify failed (non-fatal)', { error: err.message, type });
      });
    } catch (err) {
      winstonLogger.error('ShareGrantService notify threw (non-fatal)', { error: err.message, type });
    }
  }
}

module.exports = ShareGrantService;
