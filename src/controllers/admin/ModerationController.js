/**
 * ModerationController (AD-02 + AD-08)
 */

const ModerationService = require('../../services/admin/ModerationService');
const CampaignEventAnalyticsService = require('../../services/CampaignEventAnalyticsService');
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

  // ── AD-02 Free Campaign → Share Campaign upgrade ────────────────────
  getCampaignUpgradeContext: asyncHandler(async (req, res) => {
    const data = await ModerationService.getCampaignUpgradeContext(req.params.campaignId);
    return ok(res, data);
  }),

  listCampaignUpgrades: asyncHandler(async (req, res) => {
    const { page, limit } = parsePagination(req.query)
    const data = await ModerationService.listCampaignUpgrades({
      status: req.query.status && req.query.status !== 'all' ? req.query.status : undefined,
      initiatorType:
        req.query.initiator_type && req.query.initiator_type !== 'all'
          ? req.query.initiator_type
          : undefined,
      page,
      limit,
    });
    return ok(res, data);
  }),

  upgradeCampaign: asyncHandler(async (req, res) => {
    const data = await ModerationService.upgradeCampaign(req.params.campaignId, {
      adminId: req.adminUser._id,
      shareConfig: {
        budget: req.body?.budget,
        reward_per_share: req.body?.reward_per_share,
        platforms: req.body?.platforms,
      },
      adminNote: req.body?.admin_note,
      idempotencyKey: req.body?.idempotency_key || req.get('Idempotency-Key') || null,
      req,
    });
    return ok(res, data);
  }),

  // ── Upgrade funnel + boost analytics ────────────────────────────────
  getCampaignUpgradeStats: asyncHandler(async (req, res) => {
    const { start_date, end_date } = req.query;
    const [funnel, boosts] = await Promise.all([
      CampaignEventAnalyticsService.getUpgradeFunnel({ startDate: start_date, endDate: end_date }),
      CampaignEventAnalyticsService.getBoostStats({ startDate: start_date, endDate: end_date }),
    ]);
    return ok(res, { funnel, boosts });
  }),

  // ── Community boost fraud remediation ───────────────────────────────
  listCampaignSupportBoosts: asyncHandler(async (req, res) => {
    const { page, limit } = parsePagination(req.query)
    const data = await ModerationService.listCampaignSupportBoosts(req.params.campaignId, {
      page,
      limit,
    });
    return ok(res, data);
  }),

  revokeSupportBoost: asyncHandler(async (req, res) => {
    const data = await ModerationService.revokeSupportBoost(req.params.boostId, {
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
