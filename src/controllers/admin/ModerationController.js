/**
 * ModerationController (AD-02 + AD-08)
 */

const ModerationService = require('../../services/admin/ModerationService');
const { asyncHandler, ok, parsePagination } = require('./helpers');

const ModerationController = {
  // ── AD-02 Campaign queue ────────────────────────────────────────────
  getCampaignQueue: asyncHandler(async (req, res) => {
    const { page, limit } = parsePagination(req.query);
    const data = await ModerationService.getQueue({
      reviewStatus: req.query.status || 'pending',
      sort: req.query.sort || 'oldest',
      page,
      limit,
    });
    return ok(res, data);
  }),

  getCampaignForReview: asyncHandler(async (req, res) => {
    const data = await ModerationService.getCampaignForReview(req.params.campaignId);
    return ok(res, data);
  }),

  moderateCampaign: asyncHandler(async (req, res) => {
    const { decision, notes, reason } = req.body;
    const data = await ModerationService.moderateCampaign(req.params.campaignId, decision, {
      adminId: req.adminUser._id,
      notes,
      reason,
      req,
    });
    return ok(res, data);
  }),

  pauseCampaign: asyncHandler(async (req, res) => {
    const data = await ModerationService.setCampaignPaused(req.params.campaignId, true, {
      adminId: req.adminUser._id,
      reason: req.body?.reason,
      req,
    });
    return ok(res, data);
  }),

  resumeCampaign: asyncHandler(async (req, res) => {
    const data = await ModerationService.setCampaignPaused(req.params.campaignId, false, {
      adminId: req.adminUser._id,
      reason: req.body?.reason,
      req,
    });
    return ok(res, data);
  }),

  // ── AD-08 Content moderation ────────────────────────────────────────
  getFlaggedComments: asyncHandler(async (req, res) => {
    const { page, limit } = parsePagination(req.query);
    const data = await ModerationService.getFlaggedComments({
      page,
      limit,
      status: req.query.status,
    });
    return ok(res, data);
  }),

  moderateComment: asyncHandler(async (req, res) => {
    const data = await ModerationService.moderateComment(req.params.commentId, req.body.action, {
      adminId: req.adminUser._id,
      reason: req.body?.reason,
      req,
    });
    return ok(res, data);
  }),
};

module.exports = ModerationController;
