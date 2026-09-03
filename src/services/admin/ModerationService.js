/**
 * ModerationService (AD-02 Campaign Moderation Queue + AD-08 Content Moderation)
 * -------------------------------------------------------------------------
 * AD-02: review queue for campaigns (pending / flagged / escalated) plus the
 *        approve / reject / flag / escalate actions.
 * AD-08: content moderation tools — hide/remove comments and review reported
 *        content.
 *
 * Every state-changing method writes an AuditLog entry via AuditService.
 */

const Campaign = require('../../models/Campaign');
const CampaignComment = require('../../models/CampaignComment');
const User = require('../../models/User');
const AuditService = require('./AuditService');
const PayoutReadinessService = require('../PayoutReadinessService');
const CampaignUpgradeService = require('../CampaignUpgradeService');
const CampaignUpgrade = require('../../models/CampaignUpgrade');
const CampaignSupportBoost = require('../../models/CampaignSupportBoost');
const CampaignBoostService = require('../CampaignBoostService');

class ModerationService {
  // ── AD-02 Campaign moderation queue ──────────────────────────────────

  /**
   * List campaigns in the moderation queue.
   * @param {Object} opts
   * @param {string} [opts.reviewStatus] - pending|flagged|escalated|approved|rejected
   * @param {number} opts.page
   * @param {number} opts.limit
   * @param {string} [opts.sort] - 'oldest'|'newest'|'most_reported'|'highest_risk'
   */
  static async getQueue({ reviewStatus = 'pending', page = 1, limit = 20, sort = 'oldest' }) {
    const skip = (page - 1) * limit;
    const filter = { is_deleted: { $ne: true } };
    if (reviewStatus && reviewStatus !== 'all') {
      filter['moderation.review_status'] = reviewStatus;
    }

    const sortMap = {
      oldest: { created_at: 1 },
      newest: { created_at: -1 },
      most_reported: { 'moderation.report_count': -1 },
      highest_risk: { 'moderation.risk_score': -1 },
    };

    const [campaigns, total] = await Promise.all([
      Campaign.find(filter)
        .sort(sortMap[sort] || sortMap.oldest)
        .skip(skip)
        .limit(limit)
        .populate('creator_id', 'display_name email verified trust_score')
        .lean(),
      Campaign.countDocuments(filter),
    ]);

    return {
      campaigns,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 },
    };
  }

  /** Full detail for review (includes creator trust signals). */
  static async getCampaignForReview(campaignId) {
    const campaign = await Campaign.findById(campaignId)
      .populate('creator_id', 'display_name email verified trust_score verification_badges blocked created_at')
      .lean();
    if (!campaign) {
      const err = new Error('Campaign not found');
      err.statusCode = 404;
      err.code = 'CAMPAIGN_NOT_FOUND';
      throw err;
    }
    return campaign;
  }

  /**
   * Apply a moderation decision to a campaign.
   * @param {string} campaignId
   * @param {string} decision - 'approve'|'reject'|'flag'|'escalate'
   * @param {Object} ctx - { adminId, notes, reason, req }
   */
  static async moderateCampaign(campaignId, decision, { adminId, notes, reason, req } = {}) {
    const campaign = await Campaign.findById(campaignId);
    if (!campaign) {
      const err = new Error('Campaign not found');
      err.statusCode = 404;
      err.code = 'CAMPAIGN_NOT_FOUND';
      throw err;
    }

    const before = {
      review_status: campaign.moderation?.review_status,
      status: campaign.status,
    };

    const now = new Date();
    campaign.moderation = campaign.moderation || {};
    campaign.moderation.reviewed_by = adminId;
    campaign.moderation.reviewed_at = now;
    if (notes) campaign.moderation.review_notes = notes;

    let action;
    switch (decision) {
      case 'approve':
        campaign.moderation.review_status = 'approved';
        campaign.moderation.rejection_reason = null;
        // Approving a draft makes it eligible; we don't auto-publish here —
        // creator controls activation. But a paused-for-review campaign resumes.
        action = 'campaign.approved';
        break;
      case 'reject':
        if (!reason) {
          const err = new Error('A rejection reason is required');
          err.statusCode = 400;
          err.code = 'REASON_REQUIRED';
          throw err;
        }
        campaign.moderation.review_status = 'rejected';
        campaign.moderation.rejection_reason = reason;
        campaign.status = 'rejected';
        action = 'campaign.rejected';
        break;
      case 'flag':
        campaign.moderation.review_status = 'flagged';
        campaign.moderation.flag_reason = reason || notes || 'Flagged for review';
        campaign.moderation.flagged_at = now;
        action = 'campaign.flagged';
        break;
      case 'escalate':
        campaign.moderation.review_status = 'escalated';
        campaign.moderation.flag_reason = reason || notes || 'Escalated for senior review';
        action = 'campaign.escalated';
        break;
      default: {
        const err = new Error(`Unknown moderation decision: ${decision}`);
        err.statusCode = 400;
        err.code = 'INVALID_DECISION';
        throw err;
      }
    }

    await campaign.save();

    await AuditService.record({
      adminId,
      action,
      entityType: 'Campaign',
      entityId: campaign._id,
      description: `Campaign "${campaign.title}" ${decision}d`,
      changes: { before, after: { review_status: campaign.moderation.review_status, status: campaign.status } },
      metadata: { reason, notes },
      req,
    });

    return campaign.toObject ? campaign.toObject() : campaign;
  }

  /**
   * Pause or resume a campaign for trust & safety reasons (separate from the
   * review verdict — controls public visibility immediately).
   * @param {string} campaignId
   * @param {boolean} pause - true to pause, false to resume
   */
  static async setCampaignPaused(campaignId, pause, { adminId, reason, req } = {}) {
    const campaign = await Campaign.findById(campaignId);
    if (!campaign) {
      const err = new Error('Campaign not found');
      err.statusCode = 404;
      err.code = 'CAMPAIGN_NOT_FOUND';
      throw err;
    }
    const before = { status: campaign.status };
    campaign.status = pause ? 'paused' : 'active';
    await campaign.save();

    await AuditService.record({
      adminId,
      action: pause ? 'campaign.paused' : 'campaign.resumed',
      entityType: 'Campaign',
      entityId: campaign._id,
      description: `Campaign "${campaign.title}" ${pause ? 'paused' : 'resumed'} by admin`,
      changes: { before, after: { status: campaign.status } },
      metadata: { reason },
      req,
    });
    return campaign.toObject();
  }

  /**
   * Context an admin needs BEFORE upgrading a campaign to a Share Campaign.
   *
   * Deliberately includes the OWNER's payout readiness, because an admin may
   * not upgrade a campaign whose owner has nowhere to be paid — see
   * upgradeCampaign below. Returns only a credential-free summary of the
   * payment method.
   */
  static async getCampaignUpgradeContext(campaignId) {
    const campaign = await Campaign.findById(campaignId).populate(
      'creator_id',
      'display_name email created_at blocked verification_badges trust_score'
    );
    if (!campaign) {
      const err = new Error('Campaign not found');
      err.statusCode = 404;
      err.code = 'CAMPAIGN_NOT_FOUND';
      throw err;
    }

    const owner = campaign.creator_id;
    const ownerId = owner?._id || campaign.creator_id;

    const [readiness, upgrades] = await Promise.all([
      PayoutReadinessService.getReadiness(ownerId),
      CampaignUpgradeService.listUpgrades({ campaignId: campaign._id }, { limit: 10 }),
    ]);

    const ineligibility = CampaignUpgradeService.getIneligibilityReasons(campaign);

    return {
      campaign: {
        id: String(campaign._id),
        campaign_id: campaign.campaign_id,
        title: campaign.title,
        status: campaign.status,
        campaign_type: campaign.campaign_type,
        original_campaign_type: campaign.upgrade_meta?.original_campaign_type || null,
        created_at: campaign.created_at,
        review_status: campaign.moderation?.review_status || null,
      },
      owner: owner
        ? {
            id: String(ownerId),
            display_name: owner.display_name,
            email: owner.email,
            created_at: owner.created_at,
            blocked: !!owner.blocked,
            identity_verified: !!owner.verification_badges?.identity_verified,
            trust_score: owner.trust_score ?? null,
          }
        : null,
      payout_readiness: {
        ready: readiness.ready,
        level: readiness.level,
        method: readiness.method,
        reason: readiness.reason,
      },
      risk: {
        risk_score: campaign.moderation?.risk_score ?? null,
        report_count: campaign.moderation?.report_count ?? 0,
      },
      // Everything blocking the action, so the UI can disable with a reason
      // rather than letting the admin discover it on submit.
      //
      // The owner's payout method is NOT a blocker here. An admin upgrade lands
      // with paid sharing off, so nothing can be owed to anyone — the payout
      // requirement is enforced later, when paid sharing is actually switched
      // on (ShareConfigService.enablePaidSharing). It is surfaced as a warning
      // so the admin knows the owner still has a step to complete.
      blockers: ineligibility,
      warnings: readiness.ready
        ? []
        : [
            {
              code: 'OWNER_PAYOUT_NOT_READY',
              message:
                'The owner has no payout method yet. The upgrade will go through, but rewards stay off until they add one.',
            },
          ],
      can_upgrade: ineligibility.length === 0,
      upgrade_history: upgrades.items,
    };
  }

  /**
   * AD-02: the Free → Share upgrade audit trail across all campaigns.
   *
   * Every upgrade — creator, sponsor or admin initiated — leaves a
   * CampaignUpgrade record, so this is the single place to answer "who upgraded
   * what, when, and on whose authority". Sponsored requests still awaiting an
   * owner's decision show up here too, which is how an admin spots a creator
   * sitting on a request.
   */
  static async listCampaignUpgrades({ status, initiatorType, page = 1, limit = 25 } = {}) {
    const { items, total } = await CampaignUpgradeService.listUpgrades(
      { status, initiatorType },
      { page, limit }
    );

    // Hydrate the actors so the table can show names rather than ObjectIds.
    const populated = await CampaignUpgrade.populate(items, [
      { path: 'owner_id', select: 'display_name email' },
      { path: 'initiated_by', select: 'display_name email' },
    ]);

    return {
      upgrades: populated,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 },
    };
  }

  /**
   * AD-02: admin upgrades a Free Campaign to a Share Campaign on the owner's
   * behalf.
   *
   * Two things this deliberately does NOT do:
   *   1. It does not override the payout-method requirement. There is no
   *      override permission. Upgrading a campaign whose owner cannot pay
   *      sharers would create the exact broken state this feature exists to
   *      prevent, with HonestNeed's own fingerprints on it.
   *   2. It does not activate paid sharing. Only the owner can accept the
   *      obligation to pay sharers directly, so the campaign lands as a Share
   *      Campaign with paid sharing OFF, and the owner's notification invites
   *      them to review and activate.
   */
  static async upgradeCampaign(campaignId, { adminId, shareConfig, adminNote, idempotencyKey, req } = {}) {
    if (!adminNote || String(adminNote).trim().length < 10) {
      const err = new Error('An admin note of at least 10 characters is required for this action.');
      err.statusCode = 400;
      err.code = 'ADMIN_NOTE_REQUIRED';
      throw err;
    }

    const campaign = await Campaign.findById(campaignId);
    if (!campaign) {
      const err = new Error('Campaign not found');
      err.statusCode = 404;
      err.code = 'CAMPAIGN_NOT_FOUND';
      throw err;
    }

    const before = {
      campaign_type: campaign.campaign_type,
      share_config: campaign.share_config || null,
    };

    const result = await CampaignUpgradeService.requestUpgrade({
      campaignId: campaign._id,
      actorId: adminId,
      initiatorType: 'admin',
      shareConfig: shareConfig || {},
      adminNote,
      idempotencyKey,
    });

    await AuditService.record({
      adminId,
      action: 'campaign.upgrade.admin',
      entityType: 'Campaign',
      entityId: campaign._id,
      description: `Campaign "${campaign.title}" upgraded to a Share Campaign by admin`,
      changes: {
        before,
        after: {
          campaign_type: result.campaign?.campaign_type,
          share_config: result.campaign?.share_config || null,
        },
      },
      metadata: {
        admin_note: adminNote,
        upgrade_id: String(result.upgrade?._id),
        already_upgraded: !!result.already_upgraded,
      },
      req,
    });

    return {
      campaign: result.campaign?.toObject ? result.campaign.toObject() : result.campaign,
      upgrade_id: String(result.upgrade?._id),
      already_upgraded: !!result.already_upgraded,
    };
  }

  /**
   * Community (peer) boosts recorded against a campaign.
   *
   * ⚠️ These are CampaignSupportBoost records — free peer boosts — not the
   * creator's paid Stripe boost (CampaignBoost). Admins use this to inspect a
   * campaign whose ranking looks inflated.
   */
  static async listCampaignSupportBoosts(campaignId, { page = 1, limit = 50 } = {}) {
    const campaign = await Campaign.findById(campaignId).select('campaign_id title community_boost_score community_boost_count');
    if (!campaign) {
      const err = new Error('Campaign not found');
      err.statusCode = 404;
      err.code = 'CAMPAIGN_NOT_FOUND';
      throw err;
    }

    const skip = (page - 1) * limit;
    const [boosts, total] = await Promise.all([
      CampaignSupportBoost.find({ campaign_id: campaignId })
        .sort({ created_at: -1 })
        .skip(skip)
        .limit(limit)
        .populate('booster_id', 'display_name email created_at verification_badges')
        .lean(),
      CampaignSupportBoost.countDocuments({ campaign_id: campaignId }),
    ]);

    return {
      campaign: {
        id: String(campaign._id),
        campaign_id: campaign.campaign_id,
        title: campaign.title,
        community_boost_score: campaign.community_boost_score || 0,
        community_boost_count: campaign.community_boost_count || 0,
      },
      boosts,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 },
    };
  }

  /**
   * Strike a fraudulent community boost.
   *
   * Revoking removes the boost's ranking contribution and recomputes the
   * campaign's score immediately, so a farmed campaign stops benefiting the
   * moment an admin acts rather than at the next nightly decay run. The action
   * is audited like any other privileged change.
   */
  static async revokeSupportBoost(boostId, { adminId, reason, req } = {}) {
    if (!reason || String(reason).trim().length < 5) {
      const err = new Error('A reason is required when revoking a boost.');
      err.statusCode = 400;
      err.code = 'REVOKE_REASON_REQUIRED';
      throw err;
    }

    const result = await CampaignBoostService.revokeBoost(boostId, {
      reason: String(reason).trim(),
      adminId,
    });

    await AuditService.record({
      adminId,
      action: 'campaign.support_boost.revoked',
      entityType: 'Campaign',
      entityId: result.boost.campaign_id,
      description: 'Community boost revoked as fraudulent',
      changes: {
        before: { counts_toward_score: true },
        after: { counts_toward_score: false },
      },
      metadata: {
        boost_id: String(result.boost._id),
        booster_id: String(result.boost.booster_id),
        reason: String(reason).trim(),
        recomputed_score: result.score,
        distinct_boosters: result.distinct_boosters,
      },
      req,
    });

    return result;
  }

  // ── AD-08 Content moderation ──────────────────────────────────────────

  /**
   * List reported / flagged comments for review.
   */
  static async getFlaggedComments({ page = 1, limit = 20, status } = {}) {
    const skip = (page - 1) * limit;
    const filter = { is_deleted: false };
    if (status) {
      filter.status = status;
    } else {
      // Default: anything flagged or with reports.
      filter.$or = [{ status: 'flagged' }, { report_count: { $gt: 0 } }];
    }

    const [comments, total] = await Promise.all([
      CampaignComment.find(filter)
        .sort({ report_count: -1, created_at: -1 })
        .skip(skip)
        .limit(limit)
        .populate('user_id', 'display_name email')
        .populate('campaign_id', 'title campaign_id')
        .lean(),
      CampaignComment.countDocuments(filter),
    ]);

    return {
      comments,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 },
    };
  }

  /**
   * Moderate a comment: hide, unhide, or remove (soft delete).
   * @param {string} commentId
   * @param {string} action - 'hide'|'unhide'|'remove'
   */
  static async moderateComment(commentId, action, { adminId, reason, req } = {}) {
    const comment = await CampaignComment.findById(commentId);
    if (!comment) {
      const err = new Error('Comment not found');
      err.statusCode = 404;
      err.code = 'COMMENT_NOT_FOUND';
      throw err;
    }
    const before = { status: comment.status, is_deleted: comment.is_deleted };

    let auditAction;
    switch (action) {
      case 'hide':
        comment.status = 'hidden';
        auditAction = 'comment.hidden';
        break;
      case 'unhide':
        comment.status = 'visible';
        auditAction = 'comment.unhidden';
        break;
      case 'remove':
        comment.is_deleted = true;
        comment.deleted_at = new Date();
        comment.status = 'hidden';
        auditAction = 'comment.removed';
        break;
      default: {
        const err = new Error(`Unknown comment action: ${action}`);
        err.statusCode = 400;
        err.code = 'INVALID_ACTION';
        throw err;
      }
    }

    await comment.save();

    await AuditService.record({
      adminId,
      action: auditAction,
      entityType: 'Comment',
      entityId: comment._id,
      description: `Comment ${action}d by admin`,
      changes: { before, after: { status: comment.status, is_deleted: comment.is_deleted } },
      metadata: { reason },
      req,
    });

    return comment.toObject();
  }

  /**
   * Increment a campaign's report counter and auto-flag once it crosses a
   * threshold. Intended to be called from the public report endpoint, but
   * exposed here so the admin layer owns the flagging policy.
   */
  static async registerCampaignReport(campaignId, { threshold = 3 } = {}) {
    const campaign = await Campaign.findById(campaignId);
    if (!campaign) return null;
    campaign.moderation = campaign.moderation || {};
    campaign.moderation.report_count = (campaign.moderation.report_count || 0) + 1;
    if (
      campaign.moderation.report_count >= threshold &&
      campaign.moderation.review_status === 'approved'
    ) {
      campaign.moderation.review_status = 'flagged';
      campaign.moderation.flag_reason = `Auto-flagged after ${campaign.moderation.report_count} reports`;
      campaign.moderation.flagged_at = new Date();
    }
    await campaign.save();
    return campaign.moderation;
  }
}

module.exports = ModerationService;
