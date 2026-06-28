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
