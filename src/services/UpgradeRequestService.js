/**
 * UpgradeRequestService
 * -------------------------------------------------------------------------
 * Owns the owner-initiated "please upgrade my campaign" request.
 *
 * Design:
 *   - This service owns the UpgradeRequest row. It does NOT perform the
 *     upgrade itself — fulfilment hands off to CampaignUpgradeService via
 *     `fulfilUpgradeRequest` so there is one place that mutates
 *     `campaign.campaign_type`.
 *   - Rate limiting: 3 open-or-recent requests per campaign per 24h. The
 *     partial unique index enforces "one OPEN at a time"; this soft limit
 *     stops a creator from opening/cancelling/reopening in a loop to spam
 *     the sponsor feed.
 *   - Spam mitigation: sponsors are notified ONLY if they opted in via
 *     `User.notification_preferences.upgrade_requests !== false`.
 *     Default is on — opt-out, not opt-in — but the preference is checked.
 *
 * NOT stored:
 *   - A reverse index of sponsors who viewed the feed. Impressions are not
 *     a product requirement yet; add via a view-log collection when they are.
 */

const mongoose = require('mongoose');

const Campaign = require('../models/Campaign');
const UpgradeRequest = require('../models/UpgradeRequest');
const User = require('../models/User');
const CampaignUpgradeService = require('./CampaignUpgradeService');
const NotificationDispatcher = require('./NotificationDispatcher');
const AuditLogger = require('./AuditLogger');
const winstonLogger = require('../utils/winstonLogger');

class UpgradeRequestError extends Error {
  constructor(message, statusCode = 400, code = 'UPGRADE_REQUEST_ERROR') {
    super(message);
    this.name = 'UpgradeRequestError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

const SOFT_RATE_LIMIT_PER_DAY = 3;

class UpgradeRequestService {
  /**
   * Create (or 409-reuse) an open request for a campaign.
   *
   * Rules:
   *   - requester must be the campaign owner
   *   - campaign must be currently a Free (`fundraising`) campaign
   *   - at most one open request per campaign (DB-enforced)
   *   - soft limit: ≤ SOFT_RATE_LIMIT_PER_DAY requests in the last 24h on
   *     this campaign (so cancel-reopen loops do not spam sponsors)
   *
   * @param {Object} args
   * @param {string} args.campaignIdOrRef — id or human campaign_id
   * @param {string} args.ownerId          — the signed-in user
   * @param {string} [args.message]        — note to sponsors
   * @param {Object} [args.req]            — express req (audit context)
   */
  static async createRequest({ campaignIdOrRef, ownerId, message = null, req = null }) {
    const campaign = await CampaignUpgradeService.resolveCampaign(campaignIdOrRef);
    if (!campaign) throw new UpgradeRequestError('Campaign not found', 404, 'CAMPAIGN_NOT_FOUND');

    if (String(campaign.creator_id) !== String(ownerId)) {
      throw new UpgradeRequestError('Only the campaign owner can request an upgrade', 403, 'NOT_OWNER');
    }
    if (campaign.campaign_type !== 'fundraising') {
      throw new UpgradeRequestError(
        'This campaign is not a Free Campaign',
        409,
        'NOT_UPGRADEABLE'
      );
    }
    CampaignUpgradeService.assertCampaignEligible(campaign);

    // Soft 24h rate-limit — counts any status so a cancel+reopen pattern is
    // caught too.
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recentCount = await UpgradeRequest.countDocuments({
      campaign_id: campaign._id,
      created_at: { $gte: since },
    });
    if (recentCount >= SOFT_RATE_LIMIT_PER_DAY) {
      throw new UpgradeRequestError(
        `This campaign has already made ${recentCount} upgrade requests today. Try again later.`,
        429,
        'UPGRADE_REQUEST_RATE_LIMIT'
      );
    }

    let doc;
    try {
      doc = await UpgradeRequest.create({
        campaign_id: campaign._id,
        campaign_ref: campaign.campaign_id,
        campaign_title: campaign.title,
        owner_id: campaign.creator_id,
        message: message ? String(message).slice(0, 1000) : null,
        is_veteran: !!campaign.is_veteran_campaign,
      });
    } catch (err) {
      // Duplicate key on the (campaign_id, status='open') partial unique.
      if (err && err.code === 11000) {
        const existing = await UpgradeRequest.findOne({ campaign_id: campaign._id, status: 'open' });
        throw new UpgradeRequestError(
          'An open upgrade request already exists for this campaign',
          409,
          'UPGRADE_REQUEST_EXISTS',
          existing && { existing_id: String(existing._id) }
        );
      }
      throw err;
    }

    await AuditLogger.record({
      req,
      actor: { _id: ownerId },
      action: 'upgrade_request.created',
      entityType: 'UpgradeRequest',
      entityId: doc._id,
      metadata: { campaign_id: campaign.campaign_id },
    });

    // Fire-and-forget sponsor notifications. Never blocks the response.
    this._notifySponsors(doc, campaign).catch((err) =>
      winstonLogger.warn('UpgradeRequestService: sponsor fanout failed', {
        requestId: String(doc._id),
        message: err.message,
      })
    );

    return doc;
  }

  /**
   * Owner cancels their own open request.
   */
  static async cancelRequest({ requestId, ownerId, reason = null, req = null }) {
    const updated = await UpgradeRequest.findOneAndUpdate(
      { _id: requestId, owner_id: ownerId, status: 'open' },
      { $set: { status: 'cancelled', cancelled_at: new Date(), cancel_reason: reason || null } },
      { new: true }
    );
    if (!updated) {
      throw new UpgradeRequestError(
        'Open upgrade request not found for this user',
        404,
        'UPGRADE_REQUEST_NOT_FOUND'
      );
    }
    await AuditLogger.record({
      req,
      actor: { _id: ownerId },
      action: 'upgrade_request.cancelled',
      entityType: 'UpgradeRequest',
      entityId: updated._id,
      metadata: { reason: reason || null },
    });
    return updated;
  }

  /**
   * Public, paginated listing of open community requests for the sponsor feed.
   */
  static async listCommunity({ page = 1, limit = 25, campaignId = null, isVeteran = null } = {}) {
    const query = { status: 'open', expires_at: { $gt: new Date() } };
    if (campaignId) query.campaign_id = new mongoose.Types.ObjectId(campaignId);
    if (isVeteran === true) query.is_veteran = true;
    if (isVeteran === false) query.is_veteran = false;

    const skip = (Math.max(1, page) - 1) * Math.min(Math.max(1, limit), 100);
    const safeLimit = Math.min(Math.max(1, limit), 100);
    const [items, total] = await Promise.all([
      UpgradeRequest.find(query).sort({ created_at: -1 }).skip(skip).limit(safeLimit).lean(),
      UpgradeRequest.countDocuments(query),
    ]);
    return { items, total, page, limit: safeLimit };
  }

  /**
   * Owner's own history (any status).
   */
  static async listMine({ ownerId, page = 1, limit = 25 }) {
    const skip = (Math.max(1, page) - 1) * Math.min(Math.max(1, limit), 100);
    const safeLimit = Math.min(Math.max(1, limit), 100);
    const [items, total] = await Promise.all([
      UpgradeRequest.find({ owner_id: ownerId }).sort({ created_at: -1 }).skip(skip).limit(safeLimit).lean(),
      UpgradeRequest.countDocuments({ owner_id: ownerId }),
    ]);
    return { items, total, page, limit: safeLimit };
  }

  /**
   * Fulfil a request: a sponsor accepts and triggers the upgrade.
   *
   * Atomicity:
   *   1. Guarded `findOneAndUpdate` claims the request (status: open → fulfilled).
   *   2. If that fails, 409 — someone beat this sponsor to it.
   *   3. Only if the claim succeeded do we create the upgrade (CampaignUpgrade
   *      sponsor flow). If that fails, we revert the claim back to 'open' so
   *      the request is not stuck.
   *   4. Idempotency key on the inner `requestUpgrade` is derived from
   *      requestId so a sponsor's retry can't double-charge.
   */
  static async fulfilRequest({ requestId, sponsorId, shareConfig = {}, req = null }) {
    const now = new Date();

    const claimed = await UpgradeRequest.findOneAndUpdate(
      {
        _id: requestId,
        status: 'open',
        expires_at: { $gt: now },
      },
      {
        $set: {
          status: 'fulfilled',
          fulfilled_by_user_id: sponsorId,
          fulfilled_at: now,
        },
      },
      { new: true }
    );
    if (!claimed) {
      throw new UpgradeRequestError(
        'This request is no longer available',
        409,
        'UPGRADE_REQUEST_UNAVAILABLE'
      );
    }

    try {
      const result = await CampaignUpgradeService.requestUpgrade({
        campaignId: claimed.campaign_id,
        actorId: sponsorId,
        initiatorType: 'sponsor',
        shareConfig,
        idempotencyKey: `upgrade_request:${String(claimed._id)}`,
        fromCommunityRequest: true,
      });

      // Link the actual upgrade back to the request.
      const upgradeId =
        (result && result.upgrade && (result.upgrade._id || result.upgrade.id)) ||
        (result && result.upgradeId) ||
        null;
      if (upgradeId) {
        claimed.fulfilled_by_upgrade_id = upgradeId;
        await claimed.save();
      }

      await AuditLogger.record({
        req,
        actor: { _id: sponsorId },
        action: 'upgrade_request.fulfilled',
        entityType: 'UpgradeRequest',
        entityId: claimed._id,
        metadata: {
          campaign_id: claimed.campaign_ref,
          upgrade_id: upgradeId ? String(upgradeId) : null,
        },
      });

      // Owner notification. The underlying service already sends campaign_upgraded
      // when the upgrade completes; this one tells the owner specifically that
      // their public request has been picked up.
      await this._safeNotify({
        userId: claimed.owner_id,
        type: 'upgrade_request_fulfilled',
        data: {
          request_id: String(claimed._id),
          campaign_id: claimed.campaign_ref,
          sponsor_id: String(sponsorId),
        },
      });

      return { request: claimed, upgrade: result };
    } catch (err) {
      // Revert the claim so the request is not permanently stuck. The DB-level
      // partial unique index does not block this write because the row's prior
      // status was 'fulfilled', not 'open'.
      try {
        await UpgradeRequest.updateOne(
          { _id: claimed._id, status: 'fulfilled', fulfilled_by_user_id: sponsorId },
          {
            $set: { status: 'open', fulfilled_by_user_id: null, fulfilled_at: null },
          }
        );
      } catch (revertErr) {
        winstonLogger.error('UpgradeRequestService: revert failed', {
          requestId: String(claimed._id),
          message: revertErr.message,
        });
      }
      throw err;
    }
  }

  /**
   * Expire open requests whose expires_at has passed. Call from a scheduler.
   */
  static async expireLapsed(now = new Date()) {
    const r = await UpgradeRequest.updateMany(
      { status: 'open', expires_at: { $lte: now } },
      { $set: { status: 'expired' } }
    );
    return { expired: r.modifiedCount || 0 };
  }

  // ── Private ───────────────────────────────────────────────────────────

  static async _notifySponsors(doc, campaign) {
    // Candidates: active users who opted in. Keeps the fanout bounded so a
    // single request can't DDoS the platform.
    const PAGE_SIZE = 500;
    const audience = await User.find(
      {
        _id: { $ne: doc.owner_id },
        blocked: { $ne: true },
        deleted_at: null,
        $or: [
          { 'notification_preferences.upgrade_requests': { $exists: false } },
          { 'notification_preferences.upgrade_requests': { $ne: false } },
        ],
      },
      { _id: 1 }
    )
      .limit(PAGE_SIZE)
      .lean();

    if (audience.length === 0) return;

    await NotificationDispatcher.notifyMany(audience.map((u) => u._id), {
      type: 'upgrade_request_received',
      data: {
        request_id: String(doc._id),
        campaign_id: campaign.campaign_id,
        campaign_title: campaign.title,
        is_veteran: !!doc.is_veteran,
        message: doc.message,
      },
    });
  }

  static async _safeNotify(opts) {
    try {
      await NotificationDispatcher.notify(opts);
    } catch (err) {
      winstonLogger.warn('UpgradeRequestService: notification failed', {
        type: opts && opts.type,
        message: err.message,
      });
    }
  }
}

module.exports = UpgradeRequestService;
module.exports.UpgradeRequestError = UpgradeRequestError;
module.exports.SOFT_RATE_LIMIT_PER_DAY = SOFT_RATE_LIMIT_PER_DAY;
