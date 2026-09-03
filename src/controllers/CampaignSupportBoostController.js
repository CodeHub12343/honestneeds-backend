/**
 * Campaign Support Boost Controller
 * -------------------------------------------------------------------------
 * COMMUNITY (peer) boosts — one user amplifying another user's campaign.
 *
 * ⚠️ Separate from BoostController, which sells the creator a PAID Stripe
 * visibility boost for their own campaign. Different model, different routes,
 * different UI language. Do not merge them.
 */

const CampaignBoostService = require('../services/CampaignBoostService');
const winstonLogger = require('../utils/winstonLogger');

function fail(res, error, context) {
  const statusCode = error?.statusCode || 500;
  if (statusCode >= 500) {
    winstonLogger.error(`❌ CampaignSupportBoostController.${context} failed`, {
      message: error?.message,
      stack: error?.stack,
    });
  }
  return res.status(statusCode).json({
    success: false,
    code: error?.code || 'BOOST_ERROR',
    message: error?.message || 'Something went wrong with that boost.',
  });
}

class CampaignSupportBoostController {
  /**
   * GET /api/campaigns/:id/support-boost/eligibility
   */
  static async getEligibility(req, res) {
    try {
      const data = await CampaignBoostService.getBoostEligibility(
        req.params.id,
        req.user?.userId || null
      );
      return res.status(200).json({ success: true, data });
    } catch (error) {
      return fail(res, error, 'getEligibility');
    }
  }

  /**
   * POST /api/campaigns/:id/support-boost
   *
   * Responds 201 for a boost that counted, 200 for an over-quota boost that was
   * recorded but does not affect ranking. Over-quota is NOT an error — it
   * mirrors the "over-quota shares are free" rule sharers already know.
   */
  static async createBoost(req, res) {
    try {
      const result = await CampaignBoostService.createBoost({
        campaignId: req.params.id,
        userId: req.user.userId,
        source: req.body.source || 'campaign_page',
        shareId: req.body.share_id || null,
        channel: req.body.channel || null,
        req,
      });

      return res.status(result.counted ? 201 : 200).json({
        success: true,
        code: result.code || null,
        message:
          result.message ||
          (result.counted
            ? 'Thanks for the boost — this campaign will reach more people.'
            : 'Boost recorded.'),
        data: {
          boost_id: result.boost ? String(result.boost._id) : null,
          counted: result.counted,
          suppressed_reason: result.suppressed_reason || null,
          xp_awarded: result.xp_awarded || 0,
          campaign: result.campaign,
          next_boost_available_at: result.next_boost_available_at,
        },
      });
    } catch (error) {
      return fail(res, error, 'createBoost');
    }
  }

  /**
   * GET /api/campaigns/:id/support-boost/stats  (public)
   */
  static async getStats(req, res) {
    try {
      const data = await CampaignBoostService.getCampaignBoostStats(req.params.id);
      return res.status(200).json({ success: true, data });
    } catch (error) {
      return fail(res, error, 'getStats');
    }
  }

  /**
   * GET /api/campaigns/support-boosts/mine
   */
  static async getMyBoostActivity(req, res) {
    try {
      const data = await CampaignBoostService.getUserBoostActivity(req.user.userId, {
        page: parseInt(req.query.page, 10) || 1,
        limit: Math.min(50, parseInt(req.query.limit, 10) || 20),
      });
      return res.status(200).json({ success: true, data });
    } catch (error) {
      return fail(res, error, 'getMyBoostActivity');
    }
  }
}

module.exports = CampaignSupportBoostController;
