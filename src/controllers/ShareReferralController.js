/**
 * Share Referral Controller
 * Handles share campaign participation, earnings, withdrawals, and leaderboards
 * 
 * Endpoints:
 * 1. POST /share/join - Join Share Campaign
 * 2. POST /share/track - Track Share Event
 * 3. GET /share/:campaignId/status - Get Share Status for Campaign
 * 4. GET /share/:userId/earnings - Get User Earnings
 * 5. GET /share/history - Get Share History (with filtering)
 * 6. POST /share/withdraw - Withdraw Earnings
 * 7. GET /share/:platform/performance - Get Platform Performance (campaign-specific)
 * 8. GET /share/leaderboard - Get Share Leaderboard
 */

const mongoose = require('mongoose');
const winstonLogger = require('../utils/winstonLogger');
const ShareTracking = require('../models/ShareTracking');
const ShareWithdrawal = require('../models/ShareWithdrawal');
const Campaign = require('../models/Campaign');
const User = require('../models/User');
const { ShareRecord } = require('../models/Share');
const Transaction = require('../models/Transaction');

// Helper: Generate unique IDs
const generateId = (prefix) => `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

// Helper: Generate referral code
const generateReferralCode = () => {
  return Math.random().toString(36).substring(2, 10).toUpperCase();
};

module.exports = {
  /**
   * POST /share/join
   * Join a share campaign - creates tracking record for user
   */
  async joinShareCampaign(req, res) {
    try {
      const userId = req.user.id;
      const { campaign_id } = req.body;

      // Validate input
      if (!campaign_id) {
        return res.status(400).json({
          success: false,
          message: 'Campaign ID is required',
          statusCode: 400,
        });
      }

      // Verify campaign exists
      const campaign = await Campaign.findById(campaign_id);
      if (!campaign) {
        return res.status(404).json({
          success: false,
          message: 'Campaign not found',
          statusCode: 404,
        });
      }

      // Check if already participating
      let shareTracking = await ShareTracking.findOne({
        user_id: userId,
        campaign_id,
      });

      if (shareTracking) {
        return res.status(200).json({
          success: true,
          message: 'Already participating in this campaign',
          share_tracking: {
            id: shareTracking._id,
            referral_code: shareTracking.referral_code,
            referral_link: shareTracking.referral_link,
            status: shareTracking.status,
            total_earnings: shareTracking.total_earnings,
          },
        });
      }

      // Create new share tracking record
      const referralCode = generateReferralCode();
      shareTracking = new ShareTracking({
        tracking_id: generateId('ST'),
        user_id: userId,
        campaign_id,
        referral_code: referralCode,
        referral_link: `${process.env.FRONTEND_URL}/campaigns/${campaign_id}?ref=${referralCode}`,
        status: 'active',
      });

      await shareTracking.save();

      winstonLogger.info('User joined share campaign', {
        userId,
        campaignId: campaign_id,
        trackingId: shareTracking.tracking_id,
      });

      return res.status(201).json({
        success: true,
        message: 'Successfully joined share campaign',
        share_tracking: {
          id: shareTracking._id,
          referral_code: shareTracking.referral_code,
          referral_link: shareTracking.referral_link,
          status: shareTracking.status,
          total_earnings: 0,
        },
      });
    } catch (error) {
      winstonLogger.error('Error joining share campaign', {
        error: error.message,
        userId: req.user?.id,
        campaignId: req.body?.campaign_id,
        stack: error.stack,
      });

      return res.status(500).json({
        success: false,
        message: 'Failed to join share campaign',
        statusCode: 500,
      });
    }
  },

  /**
   * POST /share/track
   * Track a share event - records when user shares campaign
   */
  async trackShare(req, res) {
    try {
      const userId = req.user.id;
      const { campaign_id, platform, utm_source } = req.body;

      // Validate input
      if (!campaign_id || !platform) {
        return res.status(400).json({
          success: false,
          message: 'Campaign ID and platform are required',
          statusCode: 400,
        });
      }

      // Verify campaign exists
      const campaign = await Campaign.findById(campaign_id);
      if (!campaign) {
        return res.status(404).json({
          success: false,
          message: 'Campaign not found',
          statusCode: 404,
        });
      }

      // Get or create share tracking
      let shareTracking = await ShareTracking.findOne({
        user_id: userId,
        campaign_id,
      });

      if (!shareTracking) {
        const referralCode = generateReferralCode();
        shareTracking = new ShareTracking({
          tracking_id: generateId('ST'),
          user_id: userId,
          campaign_id,
          referral_code: referralCode,
          referral_link: `${process.env.FRONTEND_URL}/campaigns/${campaign_id}?ref=${referralCode}`,
          status: 'active',
        });
      }

      // Add share to tracking
      shareTracking.addShare(platform, 0, false);
      await shareTracking.save();

      // Create share record
      const shareRecord = new ShareRecord({
        share_id: generateId('SR'),
        campaign_id,
        supporter_id: userId,
        channel: platform,
        referral_code: shareTracking.referral_code,
        ip_address: req.headers['x-forwarded-for'] || req.connection.remoteAddress,
        user_agent: req.headers['user-agent'],
        status: 'completed',
      });

      await shareRecord.save();

      winstonLogger.info('Share tracked', {
        userId,
        campaignId: campaign_id,
        platform,
        shareId: shareRecord.share_id,
      });

      return res.status(200).json({
        success: true,
        message: 'Share tracked successfully',
        share: {
          share_id: shareRecord.share_id,
          platform,
          timestamp: shareRecord.created_at,
          total_shares: shareTracking.total_shares,
        },
      });
    } catch (error) {
      winstonLogger.error('Error tracking share', {
        error: error.message,
        userId: req.user?.id,
        campaignId: req.body?.campaign_id,
        stack: error.stack,
      });

      return res.status(500).json({
        success: false,
        message: 'Failed to track share',
        statusCode: 500,
      });
    }
  },

  /**
   * GET /share/:campaignId/status
   * Get share status for a specific campaign
   */
  async getShareStatus(req, res) {
    try {
      const userId = req.user.id;
      const { campaignId } = req.params;

      // Verify campaign exists
      const campaign = await Campaign.findById(campaignId);
      if (!campaign) {
        return res.status(404).json({
          success: false,
          message: 'Campaign not found',
          statusCode: 404,
        });
      }

      // Get share tracking
      const shareTracking = await ShareTracking.findOne({
        user_id: userId,
        campaign_id: campaignId,
      }).lean();

      if (!shareTracking) {
        return res.status(200).json({
          success: true,
          message: 'Not yet participating in this campaign',
          share_status: null,
        });
      }

      // Get platform statistics
      const platformStats = shareTracking.getPlatformStatistics ? shareTracking.getPlatformStatistics() : {};

      return res.status(200).json({
        success: true,
        message: 'Share status retrieved',
        share_status: {
          campaign_id: shareTracking.campaign_id,
          status: shareTracking.status,
          total_shares: shareTracking.total_shares,
          total_conversions: shareTracking.total_conversions,
          conversion_rate: shareTracking.conversion_rate,
          total_earnings: shareTracking.total_earnings,
          pending_earnings: shareTracking.pending_earnings,
          withdrawn_earnings: shareTracking.withdrawn_earnings,
          referral_code: shareTracking.referral_code,
          referral_link: shareTracking.referral_link,
          platforms: platformStats,
          joined_at: shareTracking.joined_at,
          last_share_at: shareTracking.last_share_at,
        },
      });
    } catch (error) {
      winstonLogger.error('Error getting share status', {
        error: error.message,
        userId: req.user?.id,
        campaignId: req.params?.campaignId,
        stack: error.stack,
      });

      return res.status(500).json({
        success: false,
        message: 'Failed to get share status',
        statusCode: 500,
      });
    }
  },

  /**
   * GET /share/:userId/earnings
   * Get total earnings for user across all campaigns / specific campaign
   */
  async getUserEarnings(req, res) {
    try {
      const userId = req.params.userId === 'me' ? req.user.id : req.params.userId;
      const { campaign_id } = req.query;

      // Verify user accessing their own earnings (or admin)
      if (userId !== req.user.id && req.user.role !== 'admin') {
        return res.status(403).json({
          success: false,
          message: 'Not authorized to view these earnings',
          statusCode: 403,
        });
      }

      let query = { user_id: userId };
      if (campaign_id) {
        query.campaign_id = campaign_id;
      }

      const shareTrackings = await ShareTracking.find(query).lean();

      // Calculate totals
      let totalEarnings = 0;
      let totalPending = 0;
      let totalWithdrawn = 0;
      let totalShares = 0;
      let totalConversions = 0;

      const campaigns = [];

      for (const tracking of shareTrackings) {
        totalEarnings += tracking.total_earnings || 0;
        totalPending += tracking.pending_earnings || 0;
        totalWithdrawn += tracking.withdrawn_earnings || 0;
        totalShares += tracking.total_shares || 0;
        totalConversions += tracking.total_conversions || 0;

        campaigns.push({
          campaign_id: tracking.campaign_id,
          earnings: tracking.total_earnings,
          pending: tracking.pending_earnings,
          shares: tracking.total_shares,
          conversions: tracking.total_conversions,
          conversion_rate: tracking.conversion_rate,
        });
      }

      return res.status(200).json({
        success: true,
        message: 'User earnings retrieved',
        earnings: {
          total_earnings: totalEarnings,
          pending_earnings: totalPending,
          withdrawn_earnings: totalWithdrawn,
          available_withdrawal: totalEarnings - totalPending, // Can withdraw immediately
          total_shares: totalShares,
          total_conversions: totalConversions,
          overall_conversion_rate: totalShares > 0 ? parseFloat(((totalConversions / totalShares) * 100).toFixed(2)) : 0,
          by_campaign: campaigns,
        },
      });
    } catch (error) {
      winstonLogger.error('Error getting user earnings', {
        error: error.message,
        userId: req.params?.userId,
        stack: error.stack,
      });

      return res.status(500).json({
        success: false,
        message: 'Failed to get earnings',
        statusCode: 500,
      });
    }
  },

  /**
   * GET /share/history
   * Get share history with filtering and pagination
   */
  async getShareHistory(req, res) {
    try {
      const userId = req.user.id;
      const { campaign_id, platform, status = 'all', page = 1, limit = 20, startDate, endDate } = req.query;

      // Build query
      let query = { supporter_id: userId };

      if (campaign_id) {
        query.campaign_id = campaign_id;
      }

      if (platform) {
        query.channel = platform;
      }

      if (status !== 'all') {
        query.status = status;
      }

      // Date range filtering
      if (startDate || endDate) {
        query.created_at = {};
        if (startDate) {
          query.created_at.$gte = new Date(startDate);
        }
        if (endDate) {
          query.created_at.$lte = new Date(endDate);
        }
      }

      // Pagination
      const skip = (parseInt(page) - 1) * parseInt(limit);

      // Get total count
      const total = await ShareRecord.countDocuments(query);

      // Get paginated results
      const shares = await ShareRecord.find(query)
        .sort({ created_at: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .populate('campaign_id', 'title')
        .lean();

      return res.status(200).json({
        success: true,
        message: 'Share history retrieved',
        history: {
          total,
          page: parseInt(page),
          limit: parseInt(limit),
          pages: Math.ceil(total / parseInt(limit)),
          shares: shares.map((s) => ({
            share_id: s.share_id,
            campaign: s.campaign_id?.title,
            platform: s.channel,
            earned: s.reward_amount,
            is_paid: s.is_paid,
            status: s.status,
            created_at: s.created_at,
          })),
        },
      });
    } catch (error) {
      winstonLogger.error('Error getting share history', {
        error: error.message,
        userId: req.user?.id,
        stack: error.stack,
      });

      return res.status(500).json({
        success: false,
        message: 'Failed to get share history',
        statusCode: 500,
      });
    }
  },

  /**
   * POST /share/withdraw
   * Request earnings withdrawal
   */
  async withdrawEarnings(req, res) {
    try {
      const userId = req.user.id;
      const { amount, payment_method_id, payment_type } = req.body;

      // Validate input
      if (!amount || !payment_method_id || !payment_type) {
        return res.status(400).json({
          success: false,
          message: 'Amount, payment method ID, and payment type are required',
          statusCode: 400,
        });
      }

      // Verify user has sufficient earnings
      const totalTracking = await ShareTracking.find({ user_id: userId });
      let totalAvailable = 0;

      for (const tracking of totalTracking) {
        totalAvailable += tracking.total_earnings - tracking.withdrawn_earnings;
      }

      if (parseInt(amount) > totalAvailable) {
        return res.status(400).json({
          success: false,
          message: 'Insufficient available balance for withdrawal',
          statusCode: 400,
        });
      }

      // Create withdrawal request
      const withdrawal = new ShareWithdrawal({
        withdrawal_id: generateId('SW'),
        user_id: userId,
        amount_requested: parseInt(amount),
        payment_method_id,
        payment_type,
        status: 'pending',
      });

      await withdrawal.save();

      winstonLogger.info('Withdrawal requested', {
        userId,
        withdrawalId: withdrawal.withdrawal_id,
        amount: amount,
        paymentType: payment_type,
      });

      return res.status(201).json({
        success: true,
        message: 'Withdrawal request submitted successfully',
        withdrawal: {
          withdrawal_id: withdrawal.withdrawal_id,
          amount_requested: withdrawal.amount_requested,
          status: withdrawal.status,
          requested_at: withdrawal.requested_at,
        },
      });
    } catch (error) {
      winstonLogger.error('Error withdrawing earnings', {
        error: error.message,
        userId: req.user?.id,
        stack: error.stack,
      });

      return res.status(500).json({
        success: false,
        message: 'Failed to process withdrawal request',
        statusCode: 500,
      });
    }
  },

  /**
   * GET /share/:platform/performance
   * Get share performance metrics by platform for a campaign
   */
  async getPlatformPerformance(req, res) {
    try {
      const userId = req.user.id;
      const { platform } = req.params;
      const { campaign_id } = req.query;

      // Validate platform
      const validPlatforms = ['email', 'facebook', 'twitter', 'instagram', 'linkedin', 'sms', 'whatsapp', 'telegram', 'reddit', 'tiktok', 'other'];
      if (!validPlatforms.includes(platform)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid platform',
          statusCode: 400,
        });
      }

      // Build query
      let query = { supporter_id: userId, channel: platform };
      if (campaign_id) {
        query.campaign_id = campaign_id;
      }

      // Get share records
      const shares = await ShareRecord.find(query)
        .sort({ created_at: -1 })
        .populate('campaign_id', 'title')
        .lean();

      // Get corresponding tracking data
      let trackingData = [];
      if (campaign_id) {
        trackingData = await ShareTracking.find({
          user_id: userId,
          campaign_id,
        }).lean();
      } else {
        trackingData = await ShareTracking.find({ user_id: userId }).lean();
      }

      // Calculate metrics
      let totalShares = 0;
      let totalEarnings = 0;
      let totalConversions = 0;

      const platformMetrics = {};

      for (const tracking of trackingData) {
        if (tracking.shares_by_platform?.has?.(platform)) {
          const platformData = tracking.shares_by_platform.get(platform);
          totalShares += platformData.count;
          totalEarnings += platformData.earnings;
          totalConversions += platformData.conversions;
        }
      }

      return res.status(200).json({
        success: true,
        message: 'Platform performance retrieved',
        performance: {
          platform,
          total_shares: totalShares,
          total_earnings: totalEarnings,
          total_conversions: totalConversions,
          conversion_rate: totalShares > 0 ? parseFloat(((totalConversions / totalShares) * 100).toFixed(2)) : 0,
          breakdown: shares.map((s) => ({
            share_id: s.share_id,
            campaign: s.campaign_id?.title,
            earned: s.reward_amount,
            is_paid: s.is_paid,
            created_at: s.created_at,
          })),
        },
      });
    } catch (error) {
      winstonLogger.error('Error getting platform performance', {
        error: error.message,
        userId: req.user?.id,
        platform: req.params?.platform,
        stack: error.stack,
      });

      return res.status(500).json({
        success: false,
        message: 'Failed to get platform performance',
        statusCode: 500,
      });
    }
  },

  /**
   * GET /share/leaderboard
   * Get share leaderboard (global or campaign-specific)
   */
  async getShareLeaderboard(req, res) {
    try {
      const { campaign_id, platform, limit = 20, page = 1 } = req.query;

      let query = {};
      if (campaign_id) {
        query.campaign_id = campaign_id;
      }

      // Get leaderboard
      const skip = (parseInt(page) - 1) * parseInt(limit);
      const leaderboard = await ShareTracking.find(query)
        .sort({ total_earnings: -1, created_at: 1 })
        .skip(skip)
        .limit(parseInt(limit))
        .populate('user_id', 'display_name profile_picture')
        .lean();

      // Get total count
      const total = await ShareTracking.countDocuments(query);

      return res.status(200).json({
        success: true,
        message: 'Leaderboard retrieved',
        leaderboard: {
          filter: campaign_id ? { type: 'campaign', campaign_id } : { type: 'global' },
          total_participants: total,
          page: parseInt(page),
          limit: parseInt(limit),
          entries: leaderboard.map((entry, index) => ({
            rank: skip + index + 1,
            user_id: entry.user_id?._id,
            user_name: entry.user_id?.display_name,
            user_picture: entry.user_id?.profile_picture,
            total_earnings: entry.total_earnings,
            total_shares: entry.total_shares,
            total_conversions: entry.total_conversions,
            conversion_rate: entry.conversion_rate,
          })),
        },
      });
    } catch (error) {
      winstonLogger.error('Error getting leaderboard', {
        error: error.message,
        campaignId: req.query?.campaign_id,
        stack: error.stack,
      });

      return res.status(500).json({
        success: false,
        message: 'Failed to get leaderboard',
        statusCode: 500,
      });
    }
  },
};
