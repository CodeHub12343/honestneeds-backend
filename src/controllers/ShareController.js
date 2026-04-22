/**
 * Share Controller
 * Handles share-related endpoints
 */

const ShareService = require('../services/ShareService');
const ShareConfigService = require('../services/ShareConfigService');
const ReferralTrackingService = require('../services/ReferralTrackingService');
const Campaign = require('../models/Campaign');
const { ShareRecord, ShareBudgetReload } = require('../models/Share');

class ShareController {
  /**
   * POST /campaigns/:campaignId/share
   * Record a share for a campaign
   * Can be called with either:
   * - req.validatedShare.platform (from campaignRoutes validation)
   * - req.body.channel (from shareRoutes)
   *
   * @param {Object} req - Express request
   * @param {string} req.params.campaignId - Campaign MongoDB ID
   * @param {string} req.body.channel - Share channel (email, facebook, etc.) OR
   * @param {Object} req.validatedShare - Validated share data {platform, message?, rewardPerShare?}
   * @returns {201} Share result with shareId, isPaid, rewardAmount
   */
  static async recordShare(req, res) {
    try {
      const { campaignId } = req.params;
      
      // Support both field names: 'platform' (from campaign routes) or 'channel' (from share routes)
      let channel = null;
      if (req.validatedShare && req.validatedShare.platform) {
        channel = req.validatedShare.platform;
      } else if (req.body.channel) {
        channel = req.body.channel;
      } else if (req.body.platform) {
        channel = req.body.platform;
      }
      
      const supporterId = req.user._id;

      // Get IP address
      const ipAddress = req.headers['x-forwarded-for'] || req.connection.remoteAddress || req.socket.remoteAddress || '';

      // Validate input
      if (!channel) {
        return res.status(400).json({
          success: false,
          error: 'MISSING_REQUIRED_FIELDS',
          message: 'Channel/platform is required',
        });
      }

      // Call service
      const result = await ShareService.recordShare({
        campaignId,
        supporterId,
        channel,
        ipAddress,
        userAgent: req.headers['user-agent'],
        location: {
          country: req.headers['cf-ipcountry'] || null,
        },
      });

      return res.status(201).json({
        success: true,
        ...result,
      });
    } catch (error) {
      const statusCode = error.statusCode || 500;
      const errorCode = error.code || 'INTERNAL_ERROR';
      const message = error.message || 'Failed to record share';

      return res.status(statusCode).json({
        success: false,
        error: errorCode,
        message,
      });
    }
  }

  /**
   * GET /campaigns/:campaignId/shares
   * Get all shares for a campaign (paginated)
   *
   * @param {Object} req - Express request
   * @param {string} req.params.campaignId - Campaign MongoDB ID
   * @param {number} req.query.page - Page number (default: 1)
   * @param {number} req.query.limit - Items per page (default: 20)
   * @returns {200} Paginated shares list
   */
  static async getSharesByCampaign(req, res) {
    try {
      const { campaignId } = req.params;
      const { page = 1, limit = 20 } = req.query;

      // Verify campaign exists
      const campaign = await Campaign.findById(campaignId);
      if (!campaign) {
        return res.status(404).json({
          success: false,
          error: 'CAMPAIGN_NOT_FOUND',
          message: 'Campaign does not exist',
        });
      }

      const result = await ShareService.getSharesByCampaign(campaignId, { page, limit });

      return res.status(200).json({
        success: true,
        ...result,
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        error: 'INTERNAL_ERROR',
        message: error.message || 'Failed to fetch shares',
      });
    }
  }

  /**
   * GET /user/shares
   * Get all shares created by authenticated user
   *
   * @param {Object} req - Express request
   * @param {number} req.query.page - Page number (default: 1)
   * @param {number} req.query.limit - Items per page (default: 20)
   * @returns {200} Paginated shares list
   */
  static async getMyShares(req, res) {
    try {
      const supporterId = req.user._id;
      const { page = 1, limit = 20 } = req.query;

      const result = await ShareService.getSharesBySupporter(supporterId, { page, limit });

      return res.status(200).json({
        success: true,
        ...result,
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        error: 'INTERNAL_ERROR',
        message: error.message || 'Failed to fetch shares',
      });
    }
  }

  /**
   * GET /campaigns/:campaignId/shares/stats
   * Get share statistics for a campaign
   *
   * @param {Object} req - Express request
   * @param {string} req.params.campaignId - Campaign MongoDB ID
   * @returns {200} Share statistics
   */
  static async getShareStats(req, res) {
    try {
      const { campaignId } = req.params;

      const result = await ShareService.getShareStats(campaignId);

      return res.status(200).json({
        success: true,
        ...result,
      });
    } catch (error) {
      const statusCode = error.statusCode || 500;
      const errorCode = error.code || 'INTERNAL_ERROR';

      return res.status(statusCode).json({
        success: false,
        error: errorCode,
        message: error.message || 'Failed to fetch share statistics',
      });
    }
  }

  /**
   * POST /campaigns/:campaignId/reload-share
   * Request share budget reload
   *
   * @param {Object} req - Express request
   * @param {string} req.params.campaignId - Campaign MongoDB ID
   * @param {number} req.body.amount - Amount in cents
   * @param {string} req.body.paymentMethod - Payment method
   * @returns {201} Reload request result
   */
  static async requestShareBudgetReload(req, res) {
    try {
      const { campaignId } = req.params;
      const { amount, paymentMethod } = req.body;
      const creatorId = req.user._id;

      // Validate input
      if (!amount || !paymentMethod) {
        return res.status(400).json({
          success: false,
          error: 'MISSING_REQUIRED_FIELDS',
          message: 'Amount and payment method are required',
        });
      }

      // Validate amount format
      if (typeof amount !== 'number' || amount <= 0) {
        return res.status(400).json({
          success: false,
          error: 'INVALID_AMOUNT',
          message: 'Amount must be a positive number (in cents)',
        });
      }

      const result = await ShareService.requestShareBudgetReload({
        campaignId,
        creatorId,
        amount: Math.round(amount), // Ensure it's an integer
        paymentMethod,
      });

      return res.status(201).json({
        success: true,
        ...result,
      });
    } catch (error) {
      const statusCode = error.statusCode || 500;
      const errorCode = error.code || 'INTERNAL_ERROR';

      return res.status(statusCode).json({
        success: false,
        error: errorCode,
        message: error.message || 'Failed to request budget reload',
      });
    }
  }

  /**
   * POST /admin/reload-share/:reloadId/verify
   * Admin: Approve share budget reload
   *
   * @param {Object} req - Express request
   * @param {string} req.params.reloadId - Reload request ID
   * @returns {200} Approval result
   */
  static async verifyShareBudgetReload(req, res) {
    try {
      const { reloadId } = req.params;
      const adminId = req.user._id;

      // Verify admin role
      if (req.user.role !== 'admin') {
        return res.status(403).json({
          success: false,
          error: 'FORBIDDEN',
          message: 'Only admins can verify reload requests',
        });
      }

      const result = await ShareService.verifyShareBudgetReload({
        reloadId,
        adminId,
      });

      return res.status(200).json({
        success: true,
        ...result,
      });
    } catch (error) {
      const statusCode = error.statusCode || 500;
      const errorCode = error.code || 'INTERNAL_ERROR';

      return res.status(statusCode).json({
        success: false,
        error: errorCode,
        message: error.message || 'Failed to verify reload',
      });
    }
  }

  /**
   * POST /admin/reload-share/:reloadId/reject
   * Admin: Reject share budget reload
   *
   * @param {Object} req - Express request
   * @param {string} req.params.reloadId - Reload request ID
   * @param {string} req.body.reason - Rejection reason
   * @returns {200} Rejection result
   */
  static async rejectShareBudgetReload(req, res) {
    try {
      const { reloadId } = req.params;
      const { reason } = req.body;
      const adminId = req.user._id;

      // Verify admin role
      if (req.user.role !== 'admin') {
        return res.status(403).json({
          success: false,
          error: 'FORBIDDEN',
          message: 'Only admins can reject reload requests',
        });
      }

      const result = await ShareService.rejectShareBudgetReload({
        reloadId,
        adminId,
        reason,
      });

      return res.status(200).json({
        success: true,
        ...result,
      });
    } catch (error) {
      const statusCode = error.statusCode || 500;
      const errorCode = error.code || 'INTERNAL_ERROR';

      return res.status(statusCode).json({
        success: false,
        error: errorCode,
        message: error.message || 'Failed to reject reload',
      });
    }
  }

  /**
   * GET /admin/reload-share
   * Admin: List pending reload requests
   *
   * @param {Object} req - Express request
   * @param {number} req.query.page - Page number (default: 1)
   * @param {number} req.query.limit - Items per page (default: 20)
   * @param {string} req.query.status - Filter by status (optional)
   * @returns {200} Paginated reload requests
   */
  static async listShareBudgetReloads(req, res) {
    try {
      // Verify admin role
      if (req.user.role !== 'admin') {
        return res.status(403).json({
          success: false,
          error: 'FORBIDDEN',
          message: 'Only admins can access this endpoint',
        });
      }

      const { page = 1, limit = 20, status = 'pending' } = req.query;
      const skip = (page - 1) * limit;

      // Build query
      const query = {};
      if (status) {
        query.status = status;
      }

      // Fetch reload requests
      const reloads = await ShareBudgetReload.find(query)
        .sort({ created_at: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .populate('campaign_id', 'campaign_id title')
        .populate('creator_id', 'name email');

      const total = await ShareBudgetReload.countDocuments(query);

      return res.status(200).json({
        success: true,
        data: reloads,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit),
        },
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        error: 'INTERNAL_ERROR',
        message: error.message || 'Failed to fetch reload requests',
      });
    }
  }

  /**
   * GET /admin/reload-share/:reloadId
   * Admin: Get details of a reload request
   *
   * @param {Object} req - Express request
   * @param {string} req.params.reloadId - Reload request ID
   * @returns {200} Reload request details
   */
  static async getShareBudgetReloadDetails(req, res) {
    try {
      // Verify admin role
      if (req.user.role !== 'admin') {
        return res.status(403).json({
          success: false,
          error: 'FORBIDDEN',
          message: 'Only admins can access this endpoint',
        });
      }

      const { reloadId } = req.params;

      const reload = await ShareBudgetReload.findOne({ reload_id: reloadId })
        .populate('campaign_id', 'campaign_id title')
        .populate('creator_id', 'name email');

      if (!reload) {
        return res.status(404).json({
          success: false,
          error: 'RELOAD_NOT_FOUND',
          message: 'Reload request does not exist',
        });
      }

      return res.status(200).json({
        success: true,
        data: reload,
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        error: 'INTERNAL_ERROR',
        message: error.message || 'Failed to fetch reload details',
      });
    }
  }

  /**
   * PUT /campaigns/:campaignId/share-config
   * Update share configuration for a campaign
   *
   * @param {Object} req - Express request
   * @param {string} req.params.campaignId - Campaign MongoDB ID
   * @param {number} req.body.totalBudget - Total budget in cents (optional)
   * @param {number} req.body.amountPerShare - Amount per share in cents (optional)
   * @param {Array} req.body.shareChannels - Array of allowed channels (optional)
   * @returns {200} Updated configuration
   */
  static async updateShareConfig(req, res) {
    try {
      const { campaignId } = req.params;
      const { totalBudget, amountPerShare, shareChannels } = req.body;
      const creatorId = req.user._id;

      // Validate at least one param
      if (totalBudget === undefined && amountPerShare === undefined && shareChannels === undefined) {
        return res.status(400).json({
          success: false,
          error: 'MISSING_CONFIG_FIELDS',
          message: 'At least one field (totalBudget, amountPerShare, shareChannels) is required',
        });
      }

      const result = await ShareConfigService.updateShareConfig({
        campaignId,
        creatorId,
        totalBudget,
        amountPerShare,
        shareChannels,
      });

      return res.status(200).json({
        success: true,
        ...result,
      });
    } catch (error) {
      const statusCode = error.statusCode || 500;
      const errorCode = error.code || 'INTERNAL_ERROR';

      return res.status(statusCode).json({
        success: false,
        error: errorCode,
        message: error.message || 'Failed to update share configuration',
      });
    }
  }

  /**
   * GET /campaigns/:campaignId/share-config
   * Get share configuration for a campaign
   *
   * @param {Object} req - Express request
   * @param {string} req.params.campaignId - Campaign MongoDB ID
   * @returns {200} Current configuration
   */
  static async getShareConfig(req, res) {
    try {
      const { campaignId } = req.params;

      const result = await ShareConfigService.getShareConfig(campaignId);

      return res.status(200).json({
        success: true,
        ...result,
      });
    } catch (error) {
      const statusCode = error.statusCode || 500;
      const errorCode = error.code || 'INTERNAL_ERROR';

      return res.status(statusCode).json({
        success: false,
        error: errorCode,
        message: error.message || 'Failed to fetch share configuration',
      });
    }
  }

  /**
   * POST /campaigns/:campaignId/referral/visit
   * Record a referral visit (when visitor clicks ?ref link)
   *
   * @param {Object} req - Express request
   * @param {string} req.params.campaignId - Campaign MongoDB ID
   * @param {string} req.body.shareId - Share ID from ?ref parameter
   * @param {string} req.body.referrerId - Referrer User ID
   * @returns {201} Referral tracking result
   */
  static async recordReferralVisit(req, res) {
    try {
      const { campaignId } = req.params;
      const { shareId, referrerId } = req.body;
      const visitorId = req.user ? req.user._id : null;

      // Validate input
      if (!shareId || !referrerId) {
        return res.status(400).json({
          success: false,
          error: 'MISSING_REQUIRED_FIELDS',
          message: 'shareId and referrerId are required',
        });
      }

      // Get IP address
      const ipAddress = req.headers['x-forwarded-for'] || req.connection.remoteAddress || '';

      const result = await ReferralTrackingService.recordReferralVisit({
        shareId,
        campaignId,
        referrerId,
        visitorId,
        ipAddress,
        userAgent: req.headers['user-agent'],
      });

      return res.status(201).json({
        success: true,
        ...result,
      });
    } catch (error) {
      const statusCode = error.statusCode || 500;
      const errorCode = error.code || 'INTERNAL_ERROR';

      return res.status(statusCode).json({
        success: false,
        error: errorCode,
        message: error.message || 'Failed to record referral visit',
      });
    }
  }

  /**
   * GET /campaigns/:campaignId/referrals
   * Get referral analytics for a campaign
   *
   * @param {Object} req - Express request
   * @param {string} req.params.campaignId - Campaign MongoDB ID
   * @param {string} req.query.sortBy - Sort order (default: -total_conversions)
   * @param {number} req.query.limit - Results limit (default: 50)
   * @returns {200} Referral analytics
   */
  static async getCampaignReferralAnalytics(req, res) {
    try {
      const { campaignId } = req.params;
      const { sortBy = '-total_conversions', limit = 50 } = req.query;

      const result = await ReferralTrackingService.getCampaignReferralAnalytics(
        campaignId,
        { sortBy, limit }
      );

      return res.status(200).json({
        success: true,
        ...result,
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        error: 'INTERNAL_ERROR',
        message: error.message || 'Failed to fetch referral analytics',
      });
    }
  }

  /**
   * GET /user/referral-performance
   * Get authenticated user's referral performance
   *
   * @param {Object} req - Express request
   * @param {number} req.query.page - Page number (default: 1)
   * @param {number} req.query.limit - Items per page (default: 20)
   * @returns {200} Referral performance data
   */
  static async getSupporterReferralPerformance(req, res) {
    try {
      const referrerId = req.user._id;
      const { page = 1, limit = 20 } = req.query;

      const result = await ReferralTrackingService.getSupporterReferralPerformance(
        referrerId,
        { page, limit }
      );

      return res.status(200).json({
        success: true,
        ...result,
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        error: 'INTERNAL_ERROR',
        message: error.message || 'Failed to fetch referral performance',
      });
    }
  }

  /**
   * GET /sharer/earnings/available
   * Get available earnings for authenticated user (sharer/supporter)
   * Returns wallet-like balance data for withdrawal requests
   * 
   * @param {Object} req - Express request (must have authenticated user)
   * @returns {200} { balance_cents, available_cents, pending_cents, reserved_cents, total_earned_cents, currency }
   */
  static async getAvailableEarnings(req, res) {
    try {
      const userId = req.user._id;

      if (!userId) {
        return res.status(401).json({
          success: false,
          error: 'UNAUTHORIZED',
          message: 'User authentication required',
        });
      }

      const earnings = await ShareService.getUserAvailableEarnings(userId);

      return res.status(200).json({
        success: true,
        data: {
          balance_cents: earnings.available_cents || 0,
          available_cents: earnings.available_cents || 0,
          pending_cents: earnings.pending_cents || 0,
          reserved_cents: earnings.reserved_cents || 0,
          total_earned_cents: earnings.total_earned_cents || 0,
          currency: 'USD',
        },
      });
    } catch (error) {
      console.error('❌ [ShareController] getAvailableEarnings error:', error);
      return res.status(500).json({
        success: false,
        error: 'INTERNAL_ERROR',
        message: error.message || 'Failed to fetch available earnings',
      });
    }
  }

  /**
   * POST /share/join
   * Join share program for a campaign (alias for recordShare)
   */
  static async joinShareProgram(req, res) {
    try {
      const { campaignId, platform } = req.body;
      const userId = req.user._id;

      if (!campaignId || !platform) {
        return res.status(400).json({
          success: false,
          error: 'MISSING_REQUIRED_FIELDS',
          message: 'Campaign ID and platform required'
        });
      }

      const result = await ShareService.recordShare({
        campaignId,
        supporterId: userId,
        channel: platform,
        ipAddress: req.headers['x-forwarded-for'] || req.ip,
        userAgent: req.headers['user-agent'],
        location: { country: req.headers['cf-ipcountry'] || null }
      });

      res.status(201).json({
        success: true,
        data: {
          status: 'joined',
          earnings: result.data?.reward_amount || 0,
          message: 'Successfully joined share program'
        }
      });
    } catch (error) {
      const statusCode = error.statusCode || 500;
      res.status(statusCode).json({
        success: false,
        error: error.code || 'ERROR',
        message: error.message
      });
    }
  }

  /**
   * POST /share/track
   * Track a share event
   */
  static async trackShareEvent(req, res) {
    try {
      const { campaignId, platform, eventType } = req.body;
      const userId = req.user._id;

      if (!campaignId || !platform) {
        return res.status(400).json({
          success: false,
          error: 'MISSING_REQUIRED_FIELDS',
          message: 'Campaign ID and platform required'
        });
      }

      const result = await ShareService.recordShare({
        campaignId,
        supporterId: userId,
        channel: platform,
        ipAddress: req.headers['x-forwarded-for'] || req.ip,
        userAgent: req.headers['user-agent'],
        location: { country: req.headers['cf-ipcountry'] || null }
      });

      res.status(201).json({
        success: true,
        data: {
          eventType: eventType || 'share',
          tracked: true,
          timestamp: new Date()
        }
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'TRACK_FAILED',
        message: 'Failed to track share event'
      });
    }
  }

  /**
   * GET /share/:campaignId/status
   * Get current share status for a campaign
   */
  static async getShareStatus(req, res) {
    try {
      const { campaignId } = req.params;
      const userId = req.user._id;

      const shares = await ShareRecord.find({
        campaign_id: campaignId,
        supporter_id: userId
      });

      const stats = {
        shares: shares.length,
        clicks: shares.filter(s => s.status === 'completed').length,
        conversions: shares.filter(s => s.is_paid).length,
        earnings: shares.reduce((sum, s) => sum + (s.reward_amount || 0), 0)
      };

      res.json({
        success: true,
        data: stats
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'STATUS_ERROR',
        message: 'Failed to get share status'
      });
    }
  }

  /**
   * GET /share/:userId/earnings
   * Get user's total earnings from shares
   */
  static async getUserEarnings(req, res) {
    try {
      const { userId } = req.params;
      const requestingUserId = req.user._id;

      // Users can only see own earnings unless admin
      if (userId !== requestingUserId.toString() && !req.user.roles?.includes('admin')) {
        return res.status(403).json({
          success: false,
          error: 'UNAUTHORIZED',
          message: 'Can only view your own earnings'
        });
      }

      const result = await ShareService.getUserEarnings(userId);
      res.json(result);
    } catch (error) {
      const statusCode = error.statusCode || 500;
      res.status(statusCode).json({
        success: false,
        error: error.code || 'EARNINGS_ERROR',
        message: error.message
      });
    }
  }

  /**
   * GET /share/history
   * Get user's share activity history
   */
  static async getShareHistory(req, res) {
    try {
      const userId = req.user._id;
      const { page = 1, limit = 20, startDate, endDate } = req.query;

      const result = await ShareService.getShareHistory(userId, {
        page,
        limit,
        startDate,
        endDate
      });

      res.json(result);
    } catch (error) {
      const statusCode = error.statusCode || 500;
      res.status(statusCode).json({
        success: false,
        error: error.code || 'HISTORY_ERROR',
        message: error.message
      });
    }
  }

  /**
   * POST /share/withdraw
   * Request withdrawal of share earnings
   */
  static async requestWithdrawal(req, res) {
    try {
      const { amount, method } = req.body;
      const userId = req.user._id;

      if (!amount || !method) {
        return res.status(400).json({
          success: false,
          error: 'MISSING_REQUIRED_FIELDS',
          message: 'Amount and method required'
        });
      }

      // Amount should be in cents
      if (!Number.isInteger(amount) || amount < 1000) { // Minimum $10
        return res.status(400).json({
          success: false,
          error: 'INVALID_AMOUNT',
          message: 'Minimum withdrawal is 1000 cents ($10)'
        });
      }

      const result = await ShareService.processWithdrawal(userId, amount, method);
      res.status(201).json(result);
    } catch (error) {
      const statusCode = error.statusCode || 500;
      res.status(statusCode).json({
        success: false,
        error: error.code || 'WITHDRAWAL_ERROR',
        message: error.message
      });
    }
  }

  /**
   * GET /share/:platform/performance
   * Get performance stats for a specific platform
   */
  static async getPlatformPerformance(req, res) {
    try {
      const { platform } = req.params;
      const userId = req.user._id;

      const result = await ShareService.getPlatformPerformance(userId);
      
      if (platform && platform !== 'all') {
        const platformData = result.data.platforms.find(p => p.platform === platform);
        if (!platformData) {
          return res.status(404).json({
            success: false,
            error: 'PLATFORM_NOT_FOUND',
            message: `No data for platform: ${platform}`
          });
        }
        return res.json({
          success: true,
          data: platformData
        });
      }

      res.json(result);
    } catch (error) {
      const statusCode = error.statusCode || 500;
      res.status(statusCode).json({
        success: false,
        error: error.code || 'PERFORMANCE_ERROR',
        message: error.message
      });
    }
  }

  /**
   * GET /share/leaderboard
   * Get top sharers leaderboard
   */
  static async getLeaderboard(req, res) {
    try {
      const { limit = 10, timeframe = 'all' } = req.query;

      const result = await ShareService.getLeaderboard({ limit, timeframe });
      res.json(result);
    } catch (error) {
      const statusCode = error.statusCode || 500;
      res.status(statusCode).json({
        success: false,
        error: error.code || 'LEADERBOARD_ERROR',
        message: error.message
      });
    }
  }

  /**
   * GET /share/referral-link
   * Generate a unique referral link
   */
  static async generateReferralLink(req, res) {
    try {
      const { campaignId } = req.query;
      const userId = req.user._id;

      if (!campaignId) {
        return res.status(400).json({
          success: false,
          error: 'MISSING_CAMPAIGN_ID',
          message: 'Campaign ID required'
        });
      }

      const result = await ShareService.generateReferralLink(userId, campaignId);
      res.json(result);
    } catch (error) {
      const statusCode = error.statusCode || 500;
      res.status(statusCode).json({
        success: false,
        error: error.code || 'REFERRAL_ERROR',
        message: error.message
      });
    }
  }

  /**
   * POST /share/bulk-track
   * Track multiple share events at once
   */
  static async bulkTrackEvents(req, res) {
    try {
      const { events } = req.body;
      const userId = req.user._id;

      if (!Array.isArray(events) || events.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'INVALID_EVENTS',
          message: 'Events array required and must not be empty'
        });
      }

      const result = await ShareService.bulkTrackShareEvents(userId, events);
      res.status(201).json(result);
    } catch (error) {
      const statusCode = error.statusCode || 500;
      res.status(statusCode).json({
        success: false,
        error: error.code || 'BULK_TRACK_ERROR',
        message: error.message
      });
    }
  }

  /**
   * GET /share/:id/details
   * Get detailed share information
   */
  static async getShareDetails(req, res) {
    try {
      const { id } = req.params;
      const userId = req.user._id;
      const isAdmin = req.user.roles?.includes('admin') || false;

      const result = await ShareService.getShareDetails(id, userId, isAdmin);
      res.json(result);
    } catch (error) {
      const statusCode = error.statusCode || 500;
      res.status(statusCode).json({
        success: false,
        error: error.code || 'DETAILS_ERROR',
        message: error.message
      });
    }
  }

  /**
   * DELETE /share/:id
   * Delete a share record
   */
  static async deleteShare(req, res) {
    try {
      const { id } = req.params;
      const userId = req.user._id;

      const result = await ShareService.deleteShare(id, userId);
      res.json(result);
    } catch (error) {
      const statusCode = error.statusCode || 500;
      res.status(statusCode).json({
        success: false,
        error: error.code || 'DELETE_ERROR',
        message: error.message
      });
    }
  }

  /**
   * GET /campaigns/:campaignId/share-metrics
   * Get comprehensive share metrics for a campaign
   */
  static async getShareMetrics(req, res) {
    try {
      const { campaignId } = req.params;
      const { timeframe = 'all', includeBreakdown = true } = req.query;

      // Validate campaign exists
      const campaign = await Campaign.findById(campaignId);
      if (!campaign) {
        return res.status(404).json({
          success: false,
          error: 'CAMPAIGN_NOT_FOUND',
          message: 'Campaign does not exist'
        });
      }

      // Get share metrics from service
      const result = await ShareService.getShareMetrics(campaignId, {
        timeframe,
        includeBreakdown: includeBreakdown === true || includeBreakdown === 'true'
      });

      return res.status(200).json({
        success: true,
        data: result
      });
    } catch (error) {
      const statusCode = error.statusCode || 500;
      return res.status(statusCode).json({
        success: false,
        error: error.code || 'METRICS_ERROR',
        message: error.message || 'Failed to fetch share metrics'
      });
    }
  }

  /**
   * POST /campaigns/:campaignId/track-qr-scan
   * Track a QR code scan with location data
   */
  static async trackQRScan(req, res) {
    try {
      const { campaignId } = req.params;
      const { qrCodeId, latitude, longitude, deviceType = 'unknown', notes } = req.body;

      // Get client IP
      const ipAddress = req.headers['x-forwarded-for'] || req.connection.remoteAddress || req.socket.remoteAddress || '';

      // Validate campaign exists
      const campaign = await Campaign.findById(campaignId);
      if (!campaign) {
        return res.status(404).json({
          success: false,
          error: 'CAMPAIGN_NOT_FOUND',
          message: 'Campaign does not exist'
        });
      }

      // Track the scan
      const result = await ShareService.trackQRScan({
        campaignId,
        qrCodeId,
        latitude,
        longitude,
        deviceType,
        ipAddress,
        userAgent: req.headers['user-agent'],
        location: req.headers['cf-ipcountry'] || null,
        notes,
        userId: req.user?._id || null
      });

      return res.status(201).json({
        success: true,
        data: result
      });
    } catch (error) {
      const statusCode = error.statusCode || 500;
      return res.status(statusCode).json({
        success: false,
        error: error.code || 'QR_SCAN_ERROR',
        message: error.message || 'Failed to track QR scan'
      });
    }
  }

  /**
   * POST /referrals/:referralToken/click
   * Record a click on a referral link
   */
  static async recordQRClick(req, res) {
    try {
      const { referralToken } = req.params;

      // Get client IP and device info
      const ipAddress = req.headers['x-forwarded-for'] || req.connection.remoteAddress || req.socket.remoteAddress || '';
      const userAgent = req.headers['user-agent'];

      // Record the click
      const result = await ShareService.recordReferralClick({
        token: referralToken,
        ipAddress,
        userAgent,
        location: req.headers['cf-ipcountry'] || null,
        referrer: req.get('referer') || null,
        userId: req.user?._id || null
      });

      return res.status(201).json({
        success: true,
        data: result
      });
    } catch (error) {
      const statusCode = error.statusCode || 500;
      return res.status(statusCode).json({
        success: false,
        error: error.code || 'REFERRAL_CLICK_ERROR',
        message: error.message || 'Failed to record referral click'
      });
    }
  }

  /**
   * GET /shares
   * List user's share history
   */
  static async listUserShares(req, res) {
    try {
      const userId = req.user._id;
      const { page = 1, limit = 20, campaignId, platform, sortBy = 'createdAt', sortOrder = 'desc' } = req.query;

      const result = await ShareService.listUserShares(userId, {
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
        campaignId,
        platform,
        sortBy,
        sortOrder
      });

      return res.status(200).json({
        success: true,
        data: result.data,
        pagination: result.pagination
      });
    } catch (error) {
      const statusCode = error.statusCode || 500;
      return res.status(statusCode).json({
        success: false,
        error: error.code || 'LIST_SHARES_ERROR',
        message: error.message || 'Failed to fetch user shares'
      });
    }
  }

  /**
   * GET /shares/stats
   * Get platform-wide sharing statistics
   */
  static async getPlatformShareStats(req, res) {
    try {
      const { timeframe = 'month', groupBy = 'platform', minShares = 0 } = req.query;

      const result = await ShareService.getPlatformShareStats({
        timeframe,
        groupBy,
        minShares: parseInt(minShares, 10)
      });

      return res.status(200).json({
        success: true,
        data: result
      });
    } catch (error) {
      const statusCode = error.statusCode || 500;
      return res.status(statusCode).json({
        success: false,
        error: error.code || 'STATS_ERROR',
        message: error.message || 'Failed to fetch share statistics'
      });
    }
  }

  /**
   * GET /referrals/history
   * Get user's referral history
   */
  static async getReferralHistory(req, res) {
    try {
      const userId = req.user._id;
      const { page = 1, limit = 20, campaignId, status, minClicks = 0 } = req.query;

      const result = await ShareService.getReferralHistory(userId, {
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
        campaignId,
        status,
        minClicks: parseInt(minClicks, 10)
      });

      return res.status(200).json({
        success: true,
        data: result.data,
        pagination: result.pagination
      });
    } catch (error) {
      const statusCode = error.statusCode || 500;
      return res.status(statusCode).json({
        success: false,
        error: error.code || 'REFERRAL_HISTORY_ERROR',
        message: error.message || 'Failed to fetch referral history'
      });
    }
  }

  /**
   * POST /campaigns/:campaignId/referral/click
   * Record a referral click - called when visitor lands on campaign via referral link
   * Can be called with or without authentication
   *
   * @param {Object} req - Express request
   * @param {string} req.params.campaignId - Campaign MongoDB ID
   * @param {string} req.body.ref - Referral code from ?ref query parameter
   * @param {string} req.query.ref - Alternative: referral code from query string (for redirects)
   * @returns {200} Click tracking result
   */
  static async recordReferralClick(req, res) {
    try {
      const { campaignId } = req.params;
      const ReferralUrlService = require('../services/ReferralUrlService');

      // Get referral code from body or query
      let referralCode = req.body.ref || req.query.ref;
      
      if (!referralCode) {
        // Not an error - just a regular campaign visit, not from a referral
        return res.status(200).json({
          success: true,
          message: 'Campaign visited',
          isReferral: false,
        });
      }

      // Get visitor information
      const visitorId = req.user?._id || null;
      const ipAddress = req.headers['x-forwarded-for'] || req.connection.remoteAddress || req.socket.remoteAddress || '';
      const userAgent = req.headers['user-agent'] || '';

      // Record the click
      const result = await ReferralUrlService.recordReferralClick({
        referralCode,
        campaignId,
        visitorId,
        ipAddress,
        userAgent,
      });

      return res.status(200).json({
        success: true,
        ...result,
        isReferral: result.shareFound,
      });
    } catch (error) {
      const statusCode = error.statusCode || 500;
      const errorCode = error.code || 'INTERNAL_ERROR';

      // Don't block user on tracking errors
      return res.status(statusCode).json({
        success: false,
        error: errorCode,
        message: error.message || 'Error recording referral click',
      });
    }
  }

  /**
   * GET /campaigns/:campaignId/referral/stats/:referralCode
   * Get referral statistics for a specific share's referral link
   *
   * @param {Object} req - Express request
   * @param {string} req.params.campaignId - Campaign MongoDB ID
   * @param {string} req.params.referralCode - Referral code to get stats for
   * @returns {200} Referral statistics
   */
  static async getReferralStats(req, res) {
    try {
      const { campaignId, referralCode } = req.params;
      const ReferralUrlService = require('../services/ReferralUrlService');

      const result = await ReferralUrlService.getReferralStats(campaignId, referralCode);

      return res.status(200).json({
        success: true,
        ...result,
      });
    } catch (error) {
      const statusCode = error.statusCode || 500;
      const errorCode = error.code || 'INTERNAL_ERROR';

      return res.status(statusCode).json({
        success: false,
        error: errorCode,
        message: error.message || 'Failed to fetch referral statistics',
      });
    }
  }

  /**
   * ADMIN VERIFICATION ENDPOINTS
   */

  /**
   * GET /admin/shares/pending
   * Get pending shares for admin review
   *
   * @param {Object} req - Express request
   * @param {string} req.query.status - Status filter (pending_verification, rejected, appealed)
   * @param {string} req.query.campaignId - Campaign filter (optional)
   * @param {number} req.query.page - Page number (default: 1)
   * @param {number} req.query.limit - Items per page (default: 20)
   * @returns {200} Paginated pending shares for review
   */
  static async getPendingSharesForReview(req, res) {
    try {
      // Check admin role
      if (req.user.role !== 'admin') {
        return res.status(403).json({
          success: false,
          error: 'FORBIDDEN',
          message: 'Only admins can access this endpoint',
        });
      }

      const ShareVerificationService = require('../services/ShareVerificationService');
      const result = await ShareVerificationService.getPendingShares(req.query);

      return res.status(200).json(result);
    } catch (error) {
      const statusCode = error.statusCode || 500;
      const errorCode = error.code || 'INTERNAL_ERROR';

      return res.status(statusCode).json({
        success: false,
        error: errorCode,
        message: error.message || 'Failed to fetch pending shares',
      });
    }
  }

  /**
   * GET /admin/shares/:shareId
   * Get detailed share information for admin review
   *
   * @param {Object} req - Express request
   * @param {string} req.params.shareId - Share ID (ObjectId or share_id)
   * @returns {200} Detailed share record
   */
  static async getShareForReview(req, res) {
    try {
      // Check admin role
      if (req.user.role !== 'admin') {
        return res.status(403).json({
          success: false,
          error: 'FORBIDDEN',
          message: 'Only admins can access this endpoint',
        });
      }

      const ShareVerificationService = require('../services/ShareVerificationService');
      const result = await ShareVerificationService.getShareDetail(req.params.shareId);

      return res.status(200).json(result);
    } catch (error) {
      const statusCode = error.statusCode || 500;
      const errorCode = error.code || 'INTERNAL_ERROR';

      return res.status(statusCode).json({
        success: false,
        error: errorCode,
        message: error.message || 'Failed to fetch share details',
      });
    }
  }

  /**
   * POST /admin/shares/:shareId/verify
   * Verify (approve) a share
   *
   * @param {Object} req - Express request
   * @param {string} req.params.shareId - Share ID (ObjectId or share_id)
   * @returns {200} Updated share record
   */
  static async verifyShare(req, res) {
    try {
      // Check admin role
      if (req.user.role !== 'admin') {
        return res.status(403).json({
          success: false,
          error: 'FORBIDDEN',
          message: 'Only admins can verify shares',
        });
      }

      const ShareVerificationService = require('../services/ShareVerificationService');
      const result = await ShareVerificationService.verifyShare(
        req.params.shareId,
        req.user._id
      );

      return res.status(200).json(result);
    } catch (error) {
      const statusCode = error.statusCode || 500;
      const errorCode = error.code || 'INTERNAL_ERROR';

      return res.status(statusCode).json({
        success: false,
        error: errorCode,
        message: error.message || 'Failed to verify share',
      });
    }
  }

  /**
   * POST /admin/shares/:shareId/reject
   * Reject a share with reason
   *
   * @param {Object} req - Express request
   * @param {string} req.params.shareId - Share ID (ObjectId or share_id)
   * @param {string} req.body.reason - Rejection reason (required)
   * @returns {200} Updated share record
   */
  static async rejectShare(req, res) {
    try {
      // Check admin role
      if (req.user.role !== 'admin') {
        return res.status(403).json({
          success: false,
          error: 'FORBIDDEN',
          message: 'Only admins can reject shares',
        });
      }

      const { reason } = req.body;

      if (!reason) {
        return res.status(400).json({
          success: false,
          error: 'MISSING_REQUIRED_FIELDS',
          message: 'Rejection reason is required',
        });
      }

      const ShareVerificationService = require('../services/ShareVerificationService');
      const result = await ShareVerificationService.rejectShare(
        req.params.shareId,
        req.user._id,
        reason
      );

      return res.status(200).json(result);
    } catch (error) {
      const statusCode = error.statusCode || 500;
      const errorCode = error.code || 'INTERNAL_ERROR';

      return res.status(statusCode).json({
        success: false,
        error: errorCode,
        message: error.message || 'Failed to reject share',
      });
    }
  }

  /**
   * POST /shares/:shareId/appeal
   * Submit appeal for rejected share (supported user endpoint)
   *
   * @param {Object} req - Express request (authenticated)
   * @param {string} req.params.shareId - Share ID (ObjectId or share_id)
   * @param {string} req.body.appealReason - Appeal reason/explanation
   * @returns {200} Updated share record
   */
  static async submitShareAppeal(req, res) {
    try {
      const { shareId } = req.params;
      const { appealReason } = req.body;
      const supporterId = req.user._id;

      if (!appealReason) {
        return res.status(400).json({
          success: false,
          error: 'MISSING_REQUIRED_FIELDS',
          message: 'Appeal reason is required',
        });
      }

      const ShareVerificationService = require('../services/ShareVerificationService');
      const result = await ShareVerificationService.submitAppeal(
        shareId,
        supporterId,
        appealReason
      );

      return res.status(200).json(result);
    } catch (error) {
      const statusCode = error.statusCode || 500;
      const errorCode = error.code || 'INTERNAL_ERROR';

      return res.status(statusCode).json({
        success: false,
        error: errorCode,
        message: error.message || 'Failed to submit appeal',
      });
    }
  }

  /**
   * POST /admin/shares/:shareId/appeal/review
   * Review and decide on a share appeal (admin only)
   *
   * @param {Object} req - Express request
   * @param {string} req.params.shareId - Share ID (ObjectId or share_id)
   * @param {boolean} req.body.approved - Whether appeal is approved
   * @param {string} req.body.reviewReason - Reason for the decision
   * @returns {200} Updated share record
   */
  static async reviewShareAppeal(req, res) {
    try {
      // Check admin role
      if (req.user.role !== 'admin') {
        return res.status(403).json({
          success: false,
          error: 'FORBIDDEN',
          message: 'Only admins can review appeals',
        });
      }

      const { shareId } = req.params;
      const { approved, reviewReason } = req.body;

      if (typeof approved !== 'boolean' || !reviewReason) {
        return res.status(400).json({
          success: false,
          error: 'MISSING_REQUIRED_FIELDS',
          message: 'approved (boolean) and reviewReason are required',
        });
      }

      const ShareVerificationService = require('../services/ShareVerificationService');
      const result = await ShareVerificationService.reviewAppeal(
        shareId,
        req.user._id,
        approved,
        reviewReason
      );

      return res.status(200).json(result);
    } catch (error) {
      const statusCode = error.statusCode || 500;
      const errorCode = error.code || 'INTERNAL_ERROR';

      return res.status(statusCode).json({
        success: false,
        error: errorCode,
        message: error.message || 'Failed to review appeal',
      });
    }
  }

  /**
   * POST /campaigns/:campaignId/conversion
   * Record a conversion from a referral link
   * Called when visitor completes action (donation, signup, etc) via referral link
   * 
   * @param {Object} req - Express request
   * @param {string} req.params.campaignId - Campaign ID (from URL)
   * @param {string} req.body.ref - Referral code (from ?ref parameter)
   * @param {string} req.body.conversionType - Type: 'donation', 'signup', 'form_submission', 'purchase'
   * @param {number} req.body.conversionValue - Revenue in cents (0 if non-monetary)
   * @returns {200} Conversion result with attribution
   */
  static async recordConversion(req, res) {
    try {
      const ConversionTrackingService = require('../services/ConversionTrackingService');
      const { campaignId } = req.params;
      const { ref: referralCode, conversionType = 'donation', conversionValue = 0, metadata = {} } = req.body;

      // Validate required fields
      if (!referralCode) {
        return res.status(400).json({
          success: false,
          error: 'MISSING_REFERRAL_CODE',
          message: 'Referral code (ref parameter) is required',
        });
      }

      if (!campaignId) {
        return res.status(400).json({
          success: false,
          error: 'MISSING_CAMPAIGN_ID',
          message: 'Campaign ID is required',
        });
      }

      // Record conversion
      const result = await ConversionTrackingService.recordConversion({
        referralCode,
        campaignId,
        visitorId: req.user?._id || null,
        conversionType,
        conversionValue,
        ipAddress: req.headers['x-forwarded-for'] || req.connection.remoteAddress || 'unknown',
        userAgent: req.get('user-agent') || 'unknown',
        metadata,
      });

      if (!result.success) {
        return res.status(500).json(result);
      }

      return res.status(200).json(result);
    } catch (error) {
      const winstonLogger = require('../utils/winstonLogger');
      winstonLogger.error('❌ ShareController.recordConversion error', {
        error: error.message,
        campaignId: req.params.campaignId,
        userId: req.user?._id,
      });

      return res.status(500).json({
        success: false,
        error: 'CONVERSION_RECORDING_FAILED',
        message: error.message || 'Failed to record conversion',
      });
    }
  }

  /**
   * GET /campaigns/:campaignId/analytics/conversions
   * Get conversion analytics for a campaign
   * 
   * @param {Object} req - Express request
   * @param {string} req.params.campaignId - Campaign ID
   * @returns {200} Campaign conversion analytics
   */
  static async getCampaignConversionAnalytics(req, res) {
    try {
      const ConversionTrackingService = require('../services/ConversionTrackingService');
      const { campaignId } = req.params;

      const result = await ConversionTrackingService.getCampaignConversionAnalytics(campaignId);

      if (!result.success) {
        return res.status(404).json(result);
      }

      return res.status(200).json(result);
    } catch (error) {
      const winstonLogger = require('../utils/winstonLogger');
      winstonLogger.error('❌ ShareController.getCampaignConversionAnalytics error', {
        error: error.message,
        campaignId: req.params.campaignId,
      });

      return res.status(500).json({
        success: false,
        error: 'ANALYTICS_ERROR',
        message:error.message || 'Failed to fetch conversion analytics',
      });
    }
  }

  /**
   * GET /user/conversion-analytics
   * Get conversion analytics for supporter (aggregated across all shares)
   * 
   * @param {Object} req - Express request (must be authenticated)
   * @returns {200} Supporter conversion analytics
   */
  static async getSupporterConversionAnalytics(req, res) {
    try {
      const ConversionTrackingService = require('../services/ConversionTrackingService');
      const supporterId = req.user._id;

      const result = await ConversionTrackingService.getSupporterConversionAnalytics(supporterId);

      if (!result.success) {
        return res.status(500).json(result);
      }

      return res.status(200).json(result);
    } catch (error) {
      const winstonLogger = require('../utils/winstonLogger');
      winstonLogger.error('❌ ShareController.getSupporterConversionAnalytics error', {
        error: error.message,
        userId: req.user?._id,
      });

      return res.status(500).json({
        success: false,
        error: 'ANALYTICS_ERROR',
        message: error.message || 'Failed to fetch conversion analytics',
      });
    }
  }

  /**
   * GET /shares/:shareId/analytics
   * Get detailed conversion analytics for a specific share
   * 
   * @param {Object} req - Express request
   * @param {string} req.params.shareId - Share ID (format: SHARE-YYYY-XXXXXX)
   * @returns {200} Share conversion analytics
   */
  static async getShareConversionAnalytics(req, res) {
    try {
      const ConversionTrackingService = require('../services/ConversionTrackingService');
      const { shareId } = req.params;

      const result = await ConversionTrackingService.getShareConversionAnalytics(shareId);

      if (!result.success) {
        return res.status(404).json(result);
      }

      return res.status(200).json(result);
    } catch (error) {
      const winstonLogger = require('../utils/winstonLogger');
      winstonLogger.error('❌ ShareController.getShareConversionAnalytics error', {
        error: error.message,
        shareId: req.params.shareId,
      });

      return res.status(500).json({
        success: false,
        error: 'ANALYTICS_ERROR',
        message: error.message || 'Failed to fetch share analytics',
      });
    }
  }

  /**
   * POST /share-payouts/request
   * Request withdrawal/payout of earned share rewards (Feature 9)
   * Creates a payout request that requires admin verification
   * 
   * Body:
   *   - amountCents: number (amount in cents to withdraw)
   *   - paymentMethod: string (enum: bank_transfer, paypal, stripe, check)
   *   - accountDetails: object (bank account, PayPal email, etc.)
   *   - purpose?: string (optional, merchant categorization)
   * 
   * Response: 201 Created
   * {
   *   success: true,
   *   data: {
   *     payoutId: string,
   *     userId: string,
   *     amountCents: number,
   *     amountDollars: string,
   *     paymentMethod: string,
   *     status: 'pending',
   *     requestedAt: ISO string,
   *     estimatedPayoutDate: ISO string
   *   }
   * }
   * 
   * Errors:
   *   - 400: Invalid amount or payment method
   *   - 401: Unauthorized
   *   - 409: Insufficient earnings or payout already pending
   * 
   * Auth: Required
   */
  static async requestSharePayout(req, res) {
    try {
      const winstonLogger = require('../utils/winstonLogger');
      const PayoutService = require('../services/PayoutService');
      const PaymentMethod = require('../models/PaymentMethod');
      const userId = req.user?._id;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized: User ID is required',
        });
      }

      const { amountCents, paymentMethod, accountDetails, purpose } = req.body;

      // Validate input
      if (!amountCents || amountCents <= 0) {
        return res.status(400).json({
          success: false,
          message: 'Amount must be greater than 0',
        });
      }

      if (!paymentMethod) {
        return res.status(400).json({
          success: false,
          message: 'Payment method is required',
        });
      }

      const validMethods = ['bank_transfer', 'paypal', 'stripe', 'check', 'check_mail'];
      if (!validMethods.includes(paymentMethod)) {
        return res.status(400).json({
          success: false,
          message: `Invalid payment method. Allowed: ${validMethods.join(', ')}`,
        });
      }

      if (!accountDetails || Object.keys(accountDetails).length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Account details are required for payout',
        });
      }

      winstonLogger.info('💸 requestSharePayout: Processing payout request', {
        userId,
        amountCents,
        paymentMethod,
      });

      // Check if user has sufficient earnings
      const ShareService = require('../services/ShareService');
      const userEarnings = await ShareService.getUserEarnings(userId);

      const availableEarnings = userEarnings.data?.verified_earnings_cents || 0;
      if (availableEarnings < amountCents) {
        return res.status(409).json({
          success: false,
          message: `Insufficient earnings. Available: $${(availableEarnings / 100).toFixed(2)}`,
          availableEarningsCents: availableEarnings,
          availableEarningsDollars: (availableEarnings / 100).toFixed(2),
        });
      }

      // Create or find payment method
      let paymentMethodId;
      try {
        // First, try to find existing payment method of this type
        let existingPaymentMethod = await PaymentMethod.findOne({
          user_id: userId,
          type: paymentMethod,
          status: 'active',
        });

        if (existingPaymentMethod) {
          winstonLogger.info('✓ Using existing payment method', {
            paymentMethodId: existingPaymentMethod._id,
            type: paymentMethod,
          });
          paymentMethodId = existingPaymentMethod._id;
        } else {
          // Create new payment method from account details
          const newPaymentMethod = await PaymentMethod.create({
            user_id: userId,
            type: paymentMethod,
            provider: 'manual',
            status: 'active',
            verification_status: 'verified',
            // Bank transfer fields
            bank_account_holder: accountDetails.accountHolder || null,
            bank_name: accountDetails.bankName || null,
            bank_account_type: accountDetails.accountType || null,
            bank_account_last_four: accountDetails.last4 || null,
            bank_routing_number_last_four: accountDetails.routingNumberLast4 || null,
            // Mobile money fields
            mobile_money_provider: accountDetails.mobileProvider || null,
            mobile_number: accountDetails.mobileNumber || null,
            mobile_country_code: accountDetails.countryCode || null,
            // Stripe fields
            stripe_payment_method_id: accountDetails.stripePaymentMethodId || null,
            card_last_four: accountDetails.cardLast4 || null,
            card_brand: accountDetails.cardBrand || null,
            // PayPal
            stripe_customer_id: accountDetails.paypalEmail || null,
          });

          winstonLogger.info('✓ Created new payment method', {
            paymentMethodId: newPaymentMethod._id,
            type: paymentMethod,
          });
          paymentMethodId = newPaymentMethod._id;
        }
      } catch (paymentMethodError) {
        winstonLogger.error('❌ Error creating/finding payment method', {
          error: paymentMethodError.message,
          userId,
          paymentMethod,
        });
        throw paymentMethodError;
      }

      // Create payout request with payment method ID
      try {
        const result = await PayoutService.createPayoutRequest({
          userId,
          amountCents,
          paymentMethodId,
        });

        winstonLogger.info('✅ requestSharePayout: Payout request created', {
          userId,
          withdrawalId: result.withdrawal_id,
          amountCents,
          paymentMethodId,
        });

        // Estimate payout date (3-5 business days)
        const estimatedPayoutDate = new Date();
        estimatedPayoutDate.setDate(estimatedPayoutDate.getDate() + (paymentMethod === 'check_mail' ? 7 : 5));

        return res.status(201).json({
          success: true,
          message: 'Payout request submitted successfully',
          data: {
            payoutId: result.withdrawal_id,
            userId: userId.toString(),
            amountCents: amountCents,
            amountDollars: (amountCents / 100).toFixed(2),
            paymentMethod: paymentMethod,
            status: 'pending',
            requestedAt: new Date().toISOString(),
            estimatedPayoutDate: estimatedPayoutDate.toISOString(),
            message: `Your payout request of $${(amountCents / 100).toFixed(2)} has been submitted for processing`,
          },
        });
      } catch (serviceError) {
        winstonLogger.error('❌ requestSharePayout: Service error', {
          userId,
          error: serviceError.message,
          stack: serviceError.stack,
        });

        return res.status(500).json({
          success: false,
          message: 'Failed to create payout request',
          error: serviceError.message,
        });
      }
    } catch (error) {
      const winstonLogger = require('../utils/winstonLogger');
      winstonLogger.error('❌ ShareController.requestSharePayout error', {
        userId: req.user?._id,
        error: error.message,
        stack: error.stack,
      });

      return res.status(500).json({
        success: false,
        message: 'Failed to process payout request',
        error: error.message,
      });
    }
  }
}

module.exports = ShareController;
