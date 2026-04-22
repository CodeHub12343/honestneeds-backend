const CampaignBoost = require('../models/CampaignBoost');
const Campaign = require('../models/Campaign');
const User = require('../models/User');
const StripeBoostService = require('../services/StripeBoostService');
const { winstonLogger } = require('../utils/logger');

/**
 * Boost Controller
 * Handles all campaign boost operations
 */

class BoostController {
  /**
   * GET /api/boosts/tiers
   * Get available boost tier options
   */
  async getBoostTiers(req, res) {
    try {
      const tiers = StripeBoostService.getBoostTiers();

      return res.status(200).json({
        success: true,
        data: {
          tiers,
          message: 'Available boost options',
        },
      });
    } catch (error) {
      winstonLogger.error('Error getting boost tiers', {
        error: error.message,
      });

      return res.status(500).json({
        success: false,
        message: 'Failed to fetch boost tiers',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined,
      });
    }
  }

  /**
   * POST /api/boosts/create-session
   * Create Stripe checkout session for boost purchase
   *
   * @body campaignId, tier
   */
  async createCheckoutSession(req, res) {
    try {
      const { campaign_id, tier } = req.body;
      const creator_id = req.user.id;
      const baseUrl = process.env.FRONTEND_URL || 'http://localhost:3000';

      // Log incoming request
      console.log('[BoostController] createCheckoutSession request:', {
        campaign_id,
        tier,
        creator_id,
        body: req.body,
      });

      // Validate inputs
      if (!campaign_id || !tier) {
        return res.status(400).json({
          success: false,
          message: 'Missing required fields: campaign_id, tier',
        });
      }

      // Verify campaign exists and belongs to user
      const campaign = await Campaign.findById(campaign_id);

      if (!campaign) {
        return res.status(404).json({
          success: false,
          message: 'Campaign not found',
        });
      }

      if (campaign.creator_id.toString() !== creator_id) {
        return res.status(403).json({
          success: false,
          message: 'You do not have permission to boost this campaign',
        });
      }

      // Get user email for Stripe
      const user = await User.findById(creator_id).select('email');
      if (!user || !user.email) {
        return res.status(400).json({
          success: false,
          message: 'User email not found',
        });
      }

      // Create session
      const sessionData = await StripeBoostService.createCheckoutSession(
        campaign_id,
        creator_id,
        tier,
        baseUrl,
        user.email
      );

      // If free tier
      if (sessionData.isFree) {
        // Create free boost record
        const tierData = StripeBoostService.BOOST_TIERS.free;
        const endDate = new Date();
        endDate.setDate(endDate.getDate() + tierData.duration_days);

        const freeBoost = new CampaignBoost({
          campaign_id,
          creator_id,
          tier: 'free',
          visibility_weight: 1,
          price_cents: 0,
          duration_days: 30,
          end_date: endDate,
          payment_status: 'completed',
          is_active: true,
        });

        await freeBoost.save();

        winstonLogger.info('Free boost created', {
          boostId: freeBoost._id,
          campaignId: campaign_id,
        });

        return res.status(200).json({
          success: true,
          data: {
            boost_id: freeBoost._id,
            tier: 'free',
            visibility_weight: 1,
            message: 'Free boost activated',
          },
        });
      }

      // Stripe paid boost
      return res.status(200).json({
        success: true,
        data: {
          checkout_session_id: sessionData.checkout_session_id,
          checkout_url: sessionData.checkout_url,
          tier: sessionData.tier,
          message: 'Checkout session created',
        },
      });
    } catch (error) {
      console.error('[BoostController] Error details:', {
        message: error?.message,
        type: error?.type,
        code: error?.code,
        stack: error?.stack,
        fullError: error,
      });

      winstonLogger.error('Error creating checkout session', {
        message: error?.message,
        stack: error?.stack,
        type: error?.type,
        code: error?.code,
        userId: req.user?.id,
        campaignId: req.body?.campaign_id,
        tier: req.body?.tier,
      });

      return res.status(500).json({
        success: false,
        message: 'Failed to create checkout session',
        error: process.env.NODE_ENV === 'development' ? {
          message: error?.message,
          type: error?.type,
          code: error?.code,
          stack: error?.stack,
        } : undefined,
      });
    }
  }

  /**
   * GET /api/boosts/campaign/:campaignId
   * Get boost info for a specific campaign
   */
  async getCampaignBoost(req, res) {
    try {
      const { campaign_id } = req.params;

      const boost = await CampaignBoost.findOne({
        campaign_id,
        is_active: true,
        end_date: { $gt: new Date() },
        payment_status: 'completed',
      }).lean();

      if (!boost) {
        return res.status(200).json({
          success: true,
          data: {
            has_active_boost: false,
            boost: null,
          },
        });
      }

      return res.status(200).json({
        success: true,
        data: {
          has_active_boost: true,
          boost: {
            _id: boost._id,
            tier: boost.tier,
            visibility_weight: boost.visibility_weight,
            days_remaining: Math.ceil(
              (boost.end_date - new Date()) / (1000 * 60 * 60 * 24)
            ),
            percentage_complete:
              Math.round(
                ((boost.duration_days -
                  Math.ceil(
                    (boost.end_date - new Date()) / (1000 * 60 * 60 * 24)
                  )) /
                  boost.duration_days) *
                  100
              ) || 0,
            start_date: boost.start_date,
            end_date: boost.end_date,
            stats: {
              views: boost.views_with_boost,
              engagement: boost.engagement_with_boost,
              conversions: boost.conversions_with_boost,
              roi: boost.roi_percentage,
            },
          },
        },
      });
    } catch (error) {
      winstonLogger.error('Error getting campaign boost', {
        error: error.message,
        campaignId: req.params.campaign_id,
      });

      return res.status(500).json({
        success: false,
        message: 'Failed to fetch boost information',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined,
      });
    }
  }

  /**
   * GET /api/boosts/my-boosts
   * Get all active boosts for creator
   */
  async getCreatorBoosts(req, res) {
    try {
      const creator_id = req.user.id;
      const { page = 1, limit = 10 } = req.query;

      const skip = (page - 1) * limit;

      const boosts = await CampaignBoost.find({
        creator_id,
        payment_status: 'completed',
      })
        .sort({ created_at: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean();

      const total = await CampaignBoost.countDocuments({
        creator_id,
        payment_status: 'completed',
      });

      const boostsData = boosts.map((boost) => ({
        _id: boost._id,
        campaign_id: boost.campaign_id,
        tier: boost.tier,
        visibility_weight: boost.visibility_weight,
        is_active: boost.is_active,
        days_remaining: boost.is_active
          ? Math.ceil((boost.end_date - new Date()) / (1000 * 60 * 60 * 24))
          : 0,
        price: `$${(boost.price_cents / 100).toFixed(2)}`,
        created_at: boost.created_at,
        stats: {
          views: boost.views_with_boost,
          engagement: boost.engagement_with_boost,
          conversions: boost.conversions_with_boost,
          roi: boost.roi_percentage,
        },
      }));

      return res.status(200).json({
        success: true,
        data: {
          boosts: boostsData,
          pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total,
            pages: Math.ceil(total / limit),
          },
        },
      });
    } catch (error) {
      winstonLogger.error('Error getting creator boosts', {
        error: error.message,
        userId: req.user?.id,
      });

      return res.status(500).json({
        success: false,
        message: 'Failed to fetch your boosts',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined,
      });
    }
  }

  /**
   * POST /api/boosts/:boostId/extend
   * Extend an active boost for additional 30 days
   */
  async extendBoost(req, res) {
    try {
      const { boost_id } = req.params;
      const creator_id = req.user.id;

      const boost = await CampaignBoost.findById(boost_id);

      if (!boost) {
        return res.status(404).json({
          success: false,
          message: 'Boost not found',
        });
      }

      if (boost.creator_id.toString() !== creator_id) {
        return res.status(403).json({
          success: false,
          message: 'You do not have permission to extend this boost',
        });
      }

      // Extend end date by 30 days
      const newEndDate = new Date(boost.end_date);
      newEndDate.setDate(newEndDate.getDate() + 30);

      boost.end_date = newEndDate;
      boost.renewal_count += 1;
      await boost.save();

      winstonLogger.info('Boost extended', {
        boostId: boost._id,
        campaignId: boost.campaign_id,
      });

      return res.status(200).json({
        success: true,
        data: {
          boost_id: boost._id,
          new_end_date: newEndDate,
          new_days_remaining: 30,
          message: 'Boost extended for 30 days',
        },
      });
    } catch (error) {
      winstonLogger.error('Error extending boost', {
        error: error.message,
        boostId: req.params.boost_id,
      });

      return res.status(500).json({
        success: false,
        message: 'Failed to extend boost',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined,
      });
    }
  }

  /**
   * POST /api/boosts/:boostId/cancel
   * Cancel an active boost (no refund)
   */
  async cancelBoost(req, res) {
    try {
      const { boost_id } = req.params;
      const creator_id = req.user.id;
      const { reason } = req.body;

      const boost = await CampaignBoost.findById(boost_id);

      if (!boost) {
        return res.status(404).json({
          success: false,
          message: 'Boost not found',
        });
      }

      if (boost.creator_id.toString() !== creator_id) {
        return res.status(403).json({
          success: false,
          message: 'You do not have permission to cancel this boost',
        });
      }

      boost.is_active = false;
      boost.cancelled_at = new Date();
      boost.cancellation_reason = reason || 'user_cancelled';
      await boost.save();

      winstonLogger.info('Boost cancelled', {
        boostId: boost._id,
        campaignId: boost.campaign_id,
      });

      return res.status(200).json({
        success: true,
        message: 'Boost cancelled successfully',
        data: { boost_id: boost._id },
      });
    } catch (error) {
      winstonLogger.error('Error cancelling boost', {
        error: error.message,
        boostId: req.params.boost_id,
      });

      return res.status(500).json({
        success: false,
        message: 'Failed to cancel boost',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined,
      });
    }
  }

  /**
   * POST /api/boosts/:boostId/update-stats
   * Update boost statistics (admin/internal)
   */
  async updateBoostStats(req, res) {
    try {
      const { boost_id } = req.params;
      const { views, engagement, conversions } = req.body;

      const boost = await CampaignBoost.findById(boost_id);

      if (!boost) {
        return res.status(404).json({
          success: false,
          message: 'Boost not found',
        });
      }

      await boost.updateStats(views, engagement, conversions);

      return res.status(200).json({
        success: true,
        data: {
          boost_id: boost._id,
          stats: {
            views: boost.views_with_boost,
            engagement: boost.engagement_with_boost,
            conversions: boost.conversions_with_boost,
            roi: boost.roi_percentage,
          },
        },
      });
    } catch (error) {
      winstonLogger.error('Error updating boost stats', {
        error: error.message,
        boostId: req.params.boost_id,
      });

      return res.status(500).json({
        success: false,
        message: 'Failed to update boost stats',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined,
      });
    }
  }

  /**
   * GET /api/boosts/session/:sessionId/status
   * Get status of a Stripe checkout session
   */
  async getSessionStatus(req, res) {
    try {
      const { session_id } = req.params;

      const status = await StripeBoostService.getSessionStatus(session_id);

      return res.status(200).json({
        success: true,
        data: status,
      });
    } catch (error) {
      winstonLogger.error('Error getting session status', {
        error: error.message,
        sessionId: req.params.session_id,
      });

      return res.status(500).json({
        success: false,
        message: 'Failed to fetch session status',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined,
      });
    }
  }
}

module.exports = new BoostController();
