/**
 * Campaign Upgrade Controller
 * -------------------------------------------------------------------------
 * HTTP layer for the Free Campaign → Share Campaign upgrade. All business
 * rules, authorisation and the payout gate live in CampaignUpgradeService —
 * this file only translates HTTP to service calls and back, so every caller
 * (creator, sponsor, admin) is gated identically regardless of which route
 * they arrive through.
 */

const CampaignUpgradeService = require('../services/CampaignUpgradeService');
const UpgradeRequestService = require('../services/UpgradeRequestService');
const winstonLogger = require('../utils/winstonLogger');

/**
 * Translate the project's thrown error shape into a response.
 */
function fail(res, error, context) {
  const statusCode = error?.statusCode || 500;
  if (statusCode >= 500) {
    winstonLogger.error(`❌ campaignUpgradeController.${context} failed`, {
      message: error?.message,
      stack: error?.stack,
    });
  }
  return res.status(statusCode).json({
    success: false,
    code: error?.code || 'UPGRADE_ERROR',
    message: error?.message || 'Something went wrong with the upgrade.',
  });
}

class CampaignUpgradeController {
  /**
   * GET /api/campaigns/:id/upgrade-eligibility
   * Drives the UI. Never authoritative — every mutation re-checks server-side.
   */
  static async getEligibility(req, res) {
    try {
      const data = await CampaignUpgradeService.getEligibility(req.params.id, req.user.userId);
      return res.status(200).json({ success: true, data });
    } catch (error) {
      return fail(res, error, 'getEligibility');
    }
  }

  /**
   * POST /api/campaigns/:id/upgrade
   * Creator upgrades their own campaign.
   */
  static async upgradeOwnCampaign(req, res) {
    try {
      const result = await CampaignUpgradeService.requestUpgrade({
        campaignId: req.params.id,
        actorId: req.user.userId,
        initiatorType: 'creator',
        shareConfig: {
          budget: req.body.budget,
          reward_per_share: req.body.reward_per_share,
          platforms: req.body.platforms,
        },
        payoutConsent: req.body.payout_consent === true,
        paymentMethodId: req.body.payment_method_id || null,
        idempotencyKey: req.body.idempotency_key || req.get('Idempotency-Key') || null,
      });

      return res.status(200).json({
        success: true,
        // A replay reports success without implying a second upgrade happened.
        message: result.already_upgraded
          ? 'This campaign is already a Share Campaign.'
          : 'Your campaign is now a Share Campaign.',
        data: {
          upgrade_id: String(result.upgrade._id),
          already_upgraded: !!result.already_upgraded,
          replayed: !!result.replayed,
          campaign: result.campaign,
        },
      });
    } catch (error) {
      return fail(res, error, 'upgradeOwnCampaign');
    }
  }

  /**
   * POST /api/campaigns/:id/upgrade-requests
   * A qualified supporter asks the owner to upgrade. Never mutates the campaign.
   */
  static async createUpgradeRequest(req, res) {
    try {
      const result = await CampaignUpgradeService.requestUpgrade({
        campaignId: req.params.id,
        actorId: req.user.userId,
        initiatorType: 'sponsor',
        shareConfig: {
          budget: req.body.budget,
          reward_per_share: req.body.reward_per_share,
          platforms: req.body.platforms,
        },
        idempotencyKey: req.body.idempotency_key || req.get('Idempotency-Key') || null,
        reason: req.body.reason || null,
      });

      return res.status(201).json({
        success: true,
        message: 'Your request was sent to the campaign owner for approval.',
        data: { upgrade_id: String(result.upgrade._id), pending: true },
      });
    } catch (error) {
      return fail(res, error, 'createUpgradeRequest');
    }
  }

  /**
   * GET /api/campaigns/:id/upgrade-requests
   */
  static async listCampaignUpgradeRequests(req, res) {
    try {
      const campaign = await CampaignUpgradeService.resolveCampaign(req.params.id);
      if (!campaign) {
        return res
          .status(404)
          .json({ success: false, code: 'CAMPAIGN_NOT_FOUND', message: 'Campaign not found.' });
      }

      const isOwner = String(campaign.creator_id) === String(req.user.userId);
      const filter = { campaignId: campaign._id };
      // A non-owner may only see requests they themselves made.
      if (!isOwner) filter.initiatedBy = req.user.userId;

      const data = await CampaignUpgradeService.listUpgrades(filter, {
        page: parseInt(req.query.page, 10) || 1,
        limit: Math.min(50, parseInt(req.query.limit, 10) || 25),
      });

      return res.status(200).json({ success: true, data });
    } catch (error) {
      return fail(res, error, 'listCampaignUpgradeRequests');
    }
  }

  /**
   * GET /api/campaigns/upgrade-requests/mine
   * The owner's inbox of pending sponsored requests.
   */
  static async listMyUpgradeRequests(req, res) {
    try {
      const data = await CampaignUpgradeService.listUpgrades(
        { ownerId: req.user.userId, status: req.query.status || 'pending_owner_approval' },
        {
          page: parseInt(req.query.page, 10) || 1,
          limit: Math.min(50, parseInt(req.query.limit, 10) || 25),
        }
      );
      return res.status(200).json({ success: true, data });
    } catch (error) {
      return fail(res, error, 'listMyUpgradeRequests');
    }
  }

  /**
   * POST /api/campaigns/upgrade-requests/:upgradeId/approve
   * Owner only. This is where the owner supplies consent + payout method — the
   * two things no sponsor or admin can supply on their behalf.
   */
  static async approveUpgradeRequest(req, res) {
    try {
      const result = await CampaignUpgradeService.approveUpgrade({
        upgradeId: req.params.upgradeId,
        ownerId: req.user.userId,
        shareConfig: {
          budget: req.body.budget,
          reward_per_share: req.body.reward_per_share,
          platforms: req.body.platforms,
        },
        payoutConsent: req.body.payout_consent === true,
        paymentMethodId: req.body.payment_method_id || null,
      });

      return res.status(200).json({
        success: true,
        message: 'Your campaign is now a Share Campaign.',
        data: {
          upgrade_id: String(result.upgrade._id),
          campaign: result.campaign,
        },
      });
    } catch (error) {
      return fail(res, error, 'approveUpgradeRequest');
    }
  }

  /**
   * POST /api/campaigns/upgrade-requests/:upgradeId/reject
   */
  static async rejectUpgradeRequest(req, res) {
    try {
      const result = await CampaignUpgradeService.rejectUpgrade({
        upgradeId: req.params.upgradeId,
        ownerId: req.user.userId,
        reason: req.body.reason || null,
      });
      return res.status(200).json({
        success: true,
        message: 'Request declined.',
        data: { upgrade_id: String(result.upgrade._id) },
      });
    } catch (error) {
      return fail(res, error, 'rejectUpgradeRequest');
    }
  }

  /**
   * POST /api/campaigns/upgrade-requests/:upgradeId/cancel
   */
  static async cancelUpgradeRequest(req, res) {
    try {
      const result = await CampaignUpgradeService.cancelUpgrade({
        upgradeId: req.params.upgradeId,
        actorId: req.user.userId,
      });
      return res.status(200).json({
        success: true,
        message: 'Request cancelled.',
        data: { upgrade_id: String(result.upgrade._id) },
      });
    } catch (error) {
      return fail(res, error, 'cancelUpgradeRequest');
    }
  }
}

// ── Phase 3: owner-initiated upgrade-request controller methods ──────────
// These are mounted alongside the existing sponsor-flow controller methods.
// They surface the OwnerAsksCommunity flow — the reverse direction of the
// sponsor flow — through its own set of routes under /campaigns/upgrade-requests.
Object.assign(CampaignUpgradeController, {
  async createOwnerRequest(req, res) {
    try {
      const doc = await UpgradeRequestService.createRequest({
        campaignIdOrRef: req.params.id,
        ownerId: req.user.userId,
        message: req.body && req.body.message ? String(req.body.message) : null,
        req,
      });
      return res.status(201).json({ success: true, data: doc });
    } catch (error) {
      return fail(res, error, 'createOwnerRequest');
    }
  },

  async listCommunityRequests(req, res) {
    try {
      const page = parseInt(req.query.page, 10) || 1;
      const limit = parseInt(req.query.limit, 10) || 25;
      const campaignId = req.query.campaign_id || null;
      let isVeteran = null;
      if (req.query.is_veteran === 'true') isVeteran = true;
      else if (req.query.is_veteran === 'false') isVeteran = false;
      const data = await UpgradeRequestService.listCommunity({ page, limit, campaignId, isVeteran });
      return res.status(200).json({ success: true, ...data });
    } catch (error) {
      return fail(res, error, 'listCommunityRequests');
    }
  },

  async listMyOwnerRequests(req, res) {
    try {
      const page = parseInt(req.query.page, 10) || 1;
      const limit = parseInt(req.query.limit, 10) || 25;
      const data = await UpgradeRequestService.listMine({ ownerId: req.user.userId, page, limit });
      return res.status(200).json({ success: true, ...data });
    } catch (error) {
      return fail(res, error, 'listMyOwnerRequests');
    }
  },

  async cancelOwnerRequest(req, res) {
    try {
      const doc = await UpgradeRequestService.cancelRequest({
        requestId: req.params.requestId,
        ownerId: req.user.userId,
        reason: req.body && req.body.reason ? String(req.body.reason) : null,
        req,
      });
      return res.status(200).json({ success: true, data: doc });
    } catch (error) {
      return fail(res, error, 'cancelOwnerRequest');
    }
  },

  async fulfilOwnerRequest(req, res) {
    try {
      const result = await UpgradeRequestService.fulfilRequest({
        requestId: req.params.requestId,
        sponsorId: req.user.userId,
        shareConfig: (req.body && req.body.share_config) || {},
        req,
      });
      return res.status(201).json({ success: true, data: result });
    } catch (error) {
      return fail(res, error, 'fulfilOwnerRequest');
    }
  },
});

module.exports = CampaignUpgradeController;
