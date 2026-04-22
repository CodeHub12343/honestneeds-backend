/**
 * Analytics Controller
 * HTTP handlers for campaign analytics endpoints
 */

const analyticsService = require('../services/analyticsService');
const analyticsCache = require('../utils/analyticsCache');
const Campaign = require('../models/Campaign');
const Transaction = require('../models/Transaction');
const ShareTracking = require('../models/ShareTracking');
const User = require('../models/User');
const QRCode = require('../models/QRCode');
const winstonLogger = require('../utils/winstonLogger');
const QRCodeLib = require('qrcode');

const AnalyticsController = {
  /**
   * Get campaign analytics (creator only)
   * GET /campaigns/:id/analytics
   * 
   * Query Params:
   * - progressDays: Days to include in trend (default 30, max 90)
   * 
   * Returns:
   * {
   *   campaign: { title, status, publishedAt },
   *   metrics: { totalViews, totalShares, totalDonations, ... },
   *   donations: { total, totalAmount, byMethod },
   *   shares: { total, paid, free, byChannel },
   *   progressTrend: [ { day, amount, shareCount, ... } ]
   * }
   * 
   * Cache: 1 hour
   */
  async getAnalytics(req, res, next) {
    try {
      const { id } = req.params;
      const userId = req.user?.id;
      const progressDays = Math.min(90, parseInt(req.query.progressDays) || 30);

      // Verify user is authenticated
      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized: Authentication required to view analytics',
        });
      }

      // Find campaign
      let campaign = await Campaign.findById(id);
      if (!campaign) {
        campaign = await Campaign.findOne({ campaign_id: id });
      }

      if (!campaign) {
        return res.status(404).json({
          success: false,
          message: 'Campaign not found',
        });
      }

      // Check ownership - only creator can view analytics
      if (campaign.creator_id.toString() !== userId.toString()) {
        return res.status(403).json({
          success: false,
          message: 'Forbidden: You do not have permission to view this campaign\'s analytics',
        });
      }

      // Check cache first
      const cacheKey = analyticsCache.generateKey(campaign._id, { progressDays });
      let analytics = analyticsCache.get(cacheKey);

      if (analytics) {
        winstonLogger.info('Analytics served from cache', {
          campaignId: campaign._id,
          userId,
        });

        return res.status(200).json({
          success: true,
          message: 'Campaign analytics retrieved successfully',
          data: analytics,
          cached: true,
        });
      }

      // Not in cache, fetch from database
      const startTime = Date.now();

      // Get standard analytics
      const standardAnalytics = await analyticsService.getAnalytics(campaign._id, {
        includeProgress: true,
        progressDays,
      });

      // Get enhanced analytics with fees and timeline
      const enhancedAnalytics = await analyticsService.getCampaignAnalyticsWithFees(campaign._id, {
        includeTimeline: true,
        includeRecent: true,
        recentLimit: 20,
        timelineLimit: progressDays,
      });

      // Merge both sets of data
      analytics = {
        ...standardAnalytics,
        fees: enhancedAnalytics.fees,
        timeline: enhancedAnalytics.timeline,
        recent_donations: enhancedAnalytics.recent_donations,
      };

      const duration = Date.now() - startTime;

      // Cache the result
      analyticsCache.set(cacheKey, analytics);

      winstonLogger.info('Analytics retrieved from database', {
        campaignId: campaign._id,
        userId,
        durationMs: duration,
        progressDays,
        totalFeesCents: analytics.fees?.total_fee_cents || 0,
        timelineEntries: analytics.timeline?.length || 0,
        recentDonations: analytics.recent_donations?.length || 0,
      });

      // Return with cache timestamp
      res.status(200).json({
        success: true,
        message: 'Campaign analytics retrieved successfully',
        data: analytics,
        cached: false,
        durationMs: duration,
      });
    } catch (error) {
      winstonLogger.error('Analytics retrieval error', {
        error: error.message,
        campaignId: req.params.id,
        userId: req.user?.id,
        stack: error.stack,
      });

      res.status(error.statusCode || 500).json({
        success: false,
        message: error.message || 'Failed to retrieve analytics',
      });
    }
  },

  /**
   * Get progress trend for date range
   * GET /campaigns/:id/analytics/trend
   * 
   * Query Params:
   * - startDate: ISO date string (required)
   * - endDate: ISO date string (required)
   * 
   * Returns: Array of daily trend data
   */
  async getTrend(req, res, next) {
    try {
      const { id } = req.params;
      const { startDate, endDate } = req.query;
      const userId = req.user?.id;

      // Verify authentication
      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized: Authentication required',
        });
      }

      // Validate dates
      if (!startDate || !endDate) {
        return res.status(400).json({
          success: false,
          message: 'Missing required query parameters: startDate, endDate',
        });
      }

      const start = new Date(startDate);
      const end = new Date(endDate);

      if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        return res.status(400).json({
          success: false,
          message: 'Invalid date format. Use ISO 8601 format (YYYY-MM-DD)',
        });
      }

      if (start > end) {
        return res.status(400).json({
          success: false,
          message: 'startDate must be before endDate',
        });
      }

      // Find campaign
      let campaign = await Campaign.findById(id);
      if (!campaign) {
        campaign = await Campaign.findOne({ campaign_id: id });
      }

      if (!campaign) {
        return res.status(404).json({
          success: false,
          message: 'Campaign not found',
        });
      }

      // Check ownership
      if (campaign.creator_id.toString() !== userId.toString()) {
        return res.status(403).json({
          success: false,
          message: 'Forbidden: You cannot access this campaign\'s analytics',
        });
      }

      // Get trend data
      const trend = await analyticsService.getProgressTrend(campaign._id, start, end);

      winstonLogger.info('Progress trend retrieved', {
        campaignId: campaign._id,
        userId,
        dateRange: { start, end },
        dataPoints: trend.length,
      });

      res.status(200).json({
        success: true,
        message: 'Progress trend retrieved successfully',
        data: {
          campaign: {
            _id: campaign._id,
            campaign_id: campaign.campaign_id,
            title: campaign.title,
          },
          dateRange: { start, end },
          trend,
        },
      });
    } catch (error) {
      winstonLogger.error('Trend retrieval error', {
        error: error.message,
        campaignId: req.params.id,
        userId: req.user?.id,
        stack: error.stack,
      });

      res.status(error.statusCode || 500).json({
        success: false,
        message: error.message || 'Failed to retrieve trend',
      });
    }
  },

  /**
   * Get metrics comparison (current vs previous period)
   * GET /campaigns/:id/analytics/comparison
   * 
   * Query Params:
   * - days: Number of days to compare (default 7, max 90)
   * 
   * Returns: Comparison between current and previous N-day period
   */
  async getComparison(req, res, next) {
    try {
      const { id } = req.params;
      const userId = req.user?.id;
      const days = Math.min(90, Math.max(1, parseInt(req.query.days) || 7));

      // Verify authentication
      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized: Authentication required',
        });
      }

      // Find campaign
      let campaign = await Campaign.findById(id);
      if (!campaign) {
        campaign = await Campaign.findOne({ campaign_id: id });
      }

      if (!campaign) {
        return res.status(404).json({
          success: false,
          message: 'Campaign not found',
        });
      }

      // Check ownership
      if (campaign.creator_id.toString() !== userId.toString()) {
        return res.status(403).json({
          success: false,
          message: 'Forbidden: You cannot access this campaign\'s analytics',
        });
      }

      // Get comparison
      const comparison = await analyticsService.getMetricsComparison(campaign._id, days);

      winstonLogger.info('Metrics comparison retrieved', {
        campaignId: campaign._id,
        userId,
        days,
      });

      res.status(200).json({
        success: true,
        message: 'Metrics comparison retrieved successfully',
        data: {
          campaign: {
            _id: campaign._id,
            campaign_id: campaign.campaign_id,
            title: campaign.title,
          },
          comparison,
          days,
        },
      });
    } catch (error) {
      winstonLogger.error('Comparison retrieval error', {
        error: error.message,
        campaignId: req.params.id,
        userId: req.user?.id,
        stack: error.stack,
      });

      res.status(error.statusCode || 500).json({
        success: false,
        message: error.message || 'Failed to retrieve comparison',
      });
    }
  },

  /**
   * Invalidate analytics cache for campaign
   * POST /campaigns/:id/analytics/invalidate
   * 
   * Admin only - clears cached analytics for a campaign
   */
  async invalidateCache(req, res, next) {
    try {
      const { id } = req.params;
      const userId = req.user?.id;
      const userRole = req.user?.role;

      // Verify authentication
      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized: Authentication required',
        });
      }

      // Find campaign
      let campaign = await Campaign.findById(id);
      if (!campaign) {
        campaign = await Campaign.findOne({ campaign_id: id });
      }

      if (!campaign) {
        return res.status(404).json({
          success: false,
          message: 'Campaign not found',
        });
      }

      // Check permission - owner or admin
      const isOwner = campaign.creator_id.toString() === userId.toString();
      const isAdmin = userRole === 'admin';

      if (!isOwner && !isAdmin) {
        return res.status(403).json({
          success: false,
          message: 'Forbidden: Only campaign owner or admin can invalidate cache',
        });
      }

      // Invalidate cache
      const keysDeleted = analyticsCache.invalidate(campaign._id);

      winstonLogger.info('Analytics cache invalidated', {
        campaignId: campaign._id,
        userId,
        keysDeleted,
      });

      res.status(200).json({
        success: true,
        message: 'Analytics cache invalidated successfully',
        data: {
          keysDeleted,
        },
      });
    } catch (error) {
      winstonLogger.error('Cache invalidation error', {
        error: error.message,
        campaignId: req.params.id,
        userId: req.user?.id,
        stack: error.stack,
      });

      res.status(error.statusCode || 500).json({
        success: false,
        message: error.message || 'Failed to invalidate cache',
      });
    }
  },

  /**
   * Get cache statistics (admin only)
   * GET /analytics/cache/stats
   * 
   * Returns: Cache hit rate, size, memory usage
   */
  async getCacheStats(req, res, next) {
    try {
      const userId = req.user?.id;
      const userRole = req.user?.role;

      // Verify admin access
      if (!userId || userRole !== 'admin') {
        return res.status(403).json({
          success: false,
          message: 'Forbidden: Admin access required',
        });
      }

      const stats = analyticsCache.getStats();
      const memoryInfo = analyticsCache.getMemoryInfo();

      res.status(200).json({
        success: true,
        message: 'Cache statistics retrieved',
        data: {
          cache: {
            ...stats,
            ...memoryInfo,
          },
        },
      });
    } catch (error) {
      winstonLogger.error('Cache stats retrieval error', {
        error: error.message,
        stack: error.stack,
      });

      res.status(500).json({
        success: false,
        message: 'Failed to retrieve cache statistics',
      });
    }
  },

  // ============================================
  // QR CODE & ANALYTICS ENDPOINTS (NEW)
  // ============================================

  /**
   * Generate QR code for a campaign
   * POST /qr/generate
   */
  async generateQRCode(req, res) {
    try {
      const userId = req.user.id;
      const { campaign_id, label = 'QR Code' } = req.body;

      // Validate campaign exists
      const campaign = await Campaign.findById(campaign_id);
      if (!campaign) {
        return res.status(404).json({
          success: false,
          message: 'Campaign not found',
          statusCode: 404,
        });
      }

      // Verify ownership (creator or admin)
      if (campaign.creator_id.toString() !== userId && req.user.role !== 'admin') {
        return res.status(403).json({
          success: false,
          message: 'Not authorized to generate QR code for this campaign',
          statusCode: 403,
        });
      }

      // Generate QR code URL
      const campaignUrl = `${process.env.FRONTEND_URL}/campaigns/${campaign_id}`;

      // Generate QR code data (using qrcode library)
      let qrCodeData;
      try {
        qrCodeData = await QRCodeLib.toDataURL(campaignUrl, {
          errorCorrectionLevel: 'H',
          type: 'image/png',
          quality: 0.95,
          margin: 1,
          width: 300,
        });
      } catch (err) {
        winstonLogger.warn('QR code generation failed, using text fallback', { error: err.message });
        qrCodeData = `qr-${campaign_id}-${Date.now()}`;
      }

      // Create QR code record
      const qrCode = new QRCode({
        campaign_id,
        code: qrCodeData,
        url: campaignUrl,
        label,
        created_by: userId,
      });

      await qrCode.save();

      winstonLogger.info('QR code generated', {
        campaignId: campaign_id,
        userId,
        label,
      });

      return res.status(201).json({
        success: true,
        qr_code: {
          id: qrCode._id,
          code: qrCode.code,
          url: qrCode.url,
          label: qrCode.label,
          campaign_id: qrCode.campaign_id,
          created_at: qrCode.created_at,
        },
        message: 'QR code generated successfully',
      });
    } catch (error) {
      winstonLogger.error('Error generating QR code', {
        error: error.message,
        campaignId: req.body.campaign_id,
        userId: req.user.id,
        stack: error.stack,
      });
      return res.status(500).json({
        success: false,
        message: 'Failed to generate QR code',
        statusCode: 500,
      });
    }
  },

  /**
   * Get QR code analytics
   * GET /qr/:id/analytics
   */
  async getQRAnalytics(req, res) {
    try {
      const { id } = req.params;
      const { startDate, endDate } = req.query;

      const qrCode = await QRCode.findById(id);

      if (!qrCode) {
        return res.status(404).json({
          success: false,
          message: 'QR code not found',
          statusCode: 404,
        });
      }

      // Get period statistics if dates provided
      let periodStats = {
        total_scans: qrCode.total_scans,
        total_conversions: qrCode.total_conversions,
        conversion_rate: qrCode.conversion_rate,
      };

      if (startDate && endDate) {
        try {
          const start = new Date(startDate);
          const end = new Date(endDate);

          if (!isNaN(start) && !isNaN(end)) {
            periodStats = qrCode.getScanStatistics(start, end);
            periodStats.conversion_rate = 0;
            if (periodStats.total_scans > 0) {
              periodStats.conversion_rate = parseFloat(
                ((qrCode.conversions.filter((c) => {
                  const cDate = new Date(c.timestamp);
                  return cDate >= start && cDate <= end;
                }).length / periodStats.total_scans) * 100).toFixed(2)
              );
            }
          }
        } catch (err) {
          winstonLogger.warn('Error calculating period statistics', { error: err.message });
        }
      }

      return res.status(200).json({
        success: true,
        analytics: {
          qr_id: id,
          label: qrCode.label,
          url: qrCode.url,
          total_scans: qrCode.total_scans,
          total_conversions: qrCode.total_conversions,
          conversion_rate: qrCode.conversion_rate,
          period_statistics: periodStats,
          created_at: qrCode.created_at,
          status: qrCode.status,
          recent_scans: qrCode.scans.slice(-10),
          recent_conversions: qrCode.conversions.slice(-10),
        },
      });
    } catch (error) {
      winstonLogger.error('Error getting QR analytics', {
        error: error.message,
        qrId: req.params.id,
        stack: error.stack,
      });
      return res.status(500).json({
        success: false,
        message: 'Failed to get QR analytics',
        statusCode: 500,
      });
    }
  },

  /**
   * Generate flyer for campaign
   * GET /campaigns/:id/flyer
   */
  /**
   * Generate campaign flyer with integrated QR code
   * GET /api/analytics/campaigns/:id/flyer
   * 
   * Returns comprehensive flyer data with campaign info, QR code,
   * progress metrics, and download URLs for sharing
   * 
   * @access Protected - Campaign creator or admin
   * @param {string} id - Campaign ID (path parameter)
   * @param {boolean} includeMetrics - Include goals/progress data (optional)
   * @returns {Object} Flyer data with campaign, QR, and sharing info
   */
  async generateFlyer(req, res) {
    try {
      const { id } = req.params;
      const { includeMetrics } = req.query;
      const userId = req.user?.id;

      // Verify campaign exists
      const campaign = await Campaign.findById(id)
        .select('title description image goal_amount status creator_id created_at metrics')
        .lean();

      if (!campaign) {
        winstonLogger.warn('Flyer generation failed: campaign not found', {
          campaignId: id,
          userId,
        });
        return res.status(404).json({
          success: false,
          message: 'Campaign not found',
          error: {
            code: 'CAMPAIGN_NOT_FOUND',
            statusCode: 404,
          },
        });
      }

      // Check authorization (creator or admin)
      if (campaign.creator_id.toString() !== userId && req.user?.role !== 'admin') {
        winstonLogger.warn('Flyer generation denied: unauthorized', {
          campaignId: id,
          userId,
          creatorId: campaign.creator_id,
        });
        return res.status(403).json({
          success: false,
          message: 'Not authorized to generate flyer for this campaign',
          error: {
            code: 'UNAUTHORIZED_FLYER_ACCESS',
            statusCode: 403,
          },
        });
      }

      // Get QR code for campaign (latest one)
      let qrCodeData = null;
      try {
        const qrCodes = await QRCode.find({ campaign_id: id })
          .sort({ created_at: -1 })
          .limit(1)
          .select('code label created_at')
          .lean();
        
        if (qrCodes && qrCodes.length > 0) {
          qrCodeData = qrCodes[0].code; // PNG base64
        } else {
          // Generate new QR code if none exists
          const flyerUrl = `${process.env.FRONTEND_URL}/campaigns/${id}?utm_source=flyer`;
          const QRCodeLib = require('qrcode');
          qrCodeData = await QRCodeLib.toDataURL(flyerUrl, {
            errorCorrectionLevel: 'H',
            type: 'image/png',
            width: 300,
            margin: 1,
          });
        }
      } catch (qrError) {
        winstonLogger.warn('QR code generation failed, proceeding without QR', {
          campaignId: id,
          error: qrError.message,
        });
        // Continue without QR - not a fatal error
      }

      // Calculate progress metrics if requested
      let progressMetrics = null;
      if (includeMetrics === 'true') {
        const raised = campaign.metrics?.total_donation_amount || 0;
        const goal = campaign.goal_amount || 0;
        progressMetrics = {
          goal_amount: goal,
          raised_amount: raised,
          progression_percent: goal > 0 ? Math.min(100, Math.round((raised / goal) * 100)) : 0,
          remaining_amount: Math.max(0, goal - raised),
          total_donors: campaign.metrics?.unique_supporters?.length || 0,
          total_shares: campaign.share_count || 0,
        };
      }

      // Prepare sharing URLs
      const baseUrl = `${process.env.FRONTEND_URL}/campaigns/${id}`;
      const flyerUrl = `${baseUrl}?utm_source=flyer`;
      const shareUrls = {
        facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(flyerUrl)}`,
        twitter: `https://twitter.com/intent/tweet?url=${encodeURIComponent(flyerUrl)}&text=${encodeURIComponent(`Support: ${campaign.title}`)}`,
        linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(flyerUrl)}`,
        email: `mailto:?subject=${encodeURIComponent(campaign.title)}&body=${encodeURIComponent(`Check out this campaign: ${flyerUrl}`)}`,
        whatsapp: `https://wa.me/?text=${encodeURIComponent(`${campaign.title} - ${flyerUrl}`)}`,
      };

      // Compose flyer response
      const flyerData = {
        campaign_id: id,
        campaign_title: campaign.title,
        campaign_description: campaign.description ? campaign.description.substring(0, 300) : 'Support this cause',
        campaign_image: campaign.image || null,
        campaign_status: campaign.status,
        campaign_created_at: campaign.created_at,
        qr_code: qrCodeData,
        flyer_url: flyerUrl,
        download_url: `${process.env.API_URL}/api/analytics/campaigns/${id}/flyer/download`,
        share_urls: shareUrls,
        generated_at: new Date().toISOString(),
      };

      // Add progress metrics if requested
      if (progressMetrics) {
        flyerData.progress = progressMetrics;
      }

      winstonLogger.info('Flyer generated successfully', {
        campaignId: id,
        userId,
        includesQR: !!qrCodeData,
      });

      return res.status(200).json({
        success: true,
        flyer: flyerData,
        message: 'Flyer data generated successfully',
      });
    } catch (error) {
      winstonLogger.error('Error generating flyer', {
        error: error.message,
        campaignId: req.params.id,
        userId: req.user?.id,
        stack: error.stack,
      });
      return res.status(500).json({
        success: false,
        message: 'Failed to generate flyer',
        error: {
          code: 'FLYER_GENERATION_ERROR',
          statusCode: 500,
        },
      });
    }
  },

  /**
   * Get comprehensive share analytics for campaign
   * GET /api/analytics/campaigns/:id/share-analytics
   * 
   * Returns detailed sharing metrics broken down by platform,
   * including engagement, conversions, earnings, and top sharers
   * 
   * @access Protected - Campaign creator or admin
   * @param {string} id - Campaign ID (path parameter)
   * @param {string} period - Time period filter: 'all', 'month', 'week', 'day' (optional)
   * @returns {Object} Platform breakdown, earnings, and top sharers
   */
  async getShareAnalytics(req, res) {
    try {
      const { id } = req.params;
      const { period = 'all' } = req.query;
      const userId = req.user?.id;

      // Verify campaign exists
      const campaign = await Campaign.findById(id)
        .select('title creator_id metrics status created_at')
        .lean();

      if (!campaign) {
        winstonLogger.warn('Share analytics failed: campaign not found', {
          campaignId: id,
          userId,
        });
        return res.status(404).json({
          success: false,
          message: 'Campaign not found',
          error: {
            code: 'CAMPAIGN_NOT_FOUND',
            statusCode: 404,
          },
        });
      }

      // Check authorization (creator or admin)
      if (campaign.creator_id.toString() !== userId && req.user?.role !== 'admin') {
        winstonLogger.warn('Share analytics denied: unauthorized', {
          campaignId: id,
          userId,
          creatorId: campaign.creator_id,
        });
        return res.status(403).json({
          success: false,
          message: 'Not authorized to view analytics for this campaign',
          error: {
            code: 'UNAUTHORIZED_ANALYTICS_ACCESS',
            statusCode: 403,
          },
        });
      }

      // Calculate date filter based on period
      let dateFilter = {};
      const now = new Date();
      if (period !== 'all') {
        let startDate;
        switch (period) {
          case 'day':
            startDate = new Date(now);
            startDate.setHours(0, 0, 0, 0);
            break;
          case 'week':
            startDate = new Date(now);
            startDate.setDate(startDate.getDate() - 7);
            break;
          case 'month':
            startDate = new Date(now);
            startDate.setMonth(startDate.getMonth() - 1);
            break;
          default:
            startDate = new Date(0); // All time
        }
        dateFilter = { created_at: { $gte: startDate } };
      }

      // Get share tracking data for campaign with date filter
      const shareData = await ShareTracking.find({
        campaign_id: id,
        ...dateFilter,
      })
        .lean()
        .exec();

      // Breakdown by platform with comprehensive metrics
      const platformBreakdown = {};
      let totalShares = 0;
      let totalClicks = 0;
      let totalConversions = 0;
      let totalEarnings = 0;

      shareData.forEach((share) => {
        const platform = share.platform || 'unknown';
        if (!platformBreakdown[platform]) {
          platformBreakdown[platform] = {
            platform,
            shares: 0,
            clicks: 0,
            click_rate: 0,
            conversions: 0,
            conversion_rate: 0,
            earnings: 0,
            average_earning_per_share: 0,
          };
        }

        const clicks = share.click_count || 0;
        const conversions = share.conversion_count || 0;
        const earnings = share.earned_amount || 0;

        platformBreakdown[platform].shares += 1;
        platformBreakdown[platform].clicks += clicks;
        platformBreakdown[platform].conversions += conversions;
        platformBreakdown[platform].earnings += earnings;

        totalShares += 1;
        totalClicks += clicks;
        totalConversions += conversions;
        totalEarnings += earnings;
      });

      // Calculate rate metrics
      Object.keys(platformBreakdown).forEach((platform) => {
        const data = platformBreakdown[platform];
        data.click_rate = data.shares > 0 ? ((data.clicks / data.shares) * 100).toFixed(2) : 0;
        data.conversion_rate = data.clicks > 0 ? ((data.conversions / data.clicks) * 100).toFixed(2) : 0;
        data.average_earning_per_share = data.shares > 0 ? (data.earnings / data.shares).toFixed(2) : 0;
      });

      // Get top sharers for this campaign
      const topSharers = await ShareTracking.find({
        campaign_id: id,
        ...dateFilter,
      })
        .sort({ conversion_count: -1, earned_amount: -1 })
        .limit(5)
        .populate('sharer_id', 'display_name profile_picture')
        .select('sharer_id share_count click_count conversion_count earned_amount platform created_at')
        .lean()
        .exec();

      // Calculate overall rates
      const overallStats = {
        total_shares: totalShares,
        total_clicks: totalClicks,
        total_conversions: totalConversions,
        total_earnings: totalEarnings,
        average_click_rate: totalShares > 0 ? ((totalClicks / totalShares) * 100).toFixed(2) : 0,
        average_conversion_rate: totalClicks > 0 ? ((totalConversions / totalClicks) * 100).toFixed(2) : 0,
        average_earning_per_share: totalShares > 0 ? (totalEarnings / totalShares).toFixed(2) : 0,
      };

      // Compose analytics response
      const analyticsResponse = {
        campaign_id: id,
        campaign_title: campaign.title,
        campaign_status: campaign.status,
        period_analyzed: period,
        overall_stats: overallStats,
        platform_breakdown: Object.values(platformBreakdown),
        top_sharers: topSharers.map((s) => ({
          sharer_id: s.sharer_id?._id,
          sharer_name: s.sharer_id?.display_name || 'Unknown',
          sharer_image: s.sharer_id?.profile_picture || null,
          shares: s.share_count || 0,
          clicks: s.click_count || 0,
          conversions: s.conversion_count || 0,
          earnings: s.earned_amount || 0,
          platform: s.platform,
          last_share_date: s.created_at,
        })),
        generated_at: new Date().toISOString(),
      };

      winstonLogger.info('Share analytics retrieved successfully', {
        campaignId: id,
        userId,
        period,
        totalShares,
        totalEarnings,
      });

      return res.status(200).json({
        success: true,
        analytics: analyticsResponse,
        message: 'Share analytics retrieved successfully',
      });
    } catch (error) {
      winstonLogger.error('Error getting share analytics', {
        error: error.message,
        campaignId: req.params.id,
        userId: req.user?.id,
        stack: error.stack,
      });
      return res.status(500).json({
        success: false,
        message: 'Failed to get share analytics',
        error: {
          code: 'SHARE_ANALYTICS_ERROR',
          statusCode: 500,
        },
      });
    }
  },

  /**
   * Get donation analytics for campaign
   * GET /campaigns/:id/donation-analytics
   */
  async getDonationAnalytics(req, res) {
    try {
      const { id } = req.params;
      const userId = req.user.id;

      // Verify campaign and ownership
      const campaign = await Campaign.findById(id);
      if (!campaign) {
        return res.status(404).json({
          success: false,
          message: 'Campaign not found',
          statusCode: 404,
        });
      }

      // Verify creator or admin
      if (campaign.creator_id.toString() !== userId && req.user.role !== 'admin') {
        return res.status(403).json({
          success: false,
          message: 'Not authorized to view analytics for this campaign',
          statusCode: 403,
        });
      }

      // Get donation data
      const donations = await Transaction.find({ campaign_id: id }).lean();

      // Calculate metrics
      const totalDonations = donations.length;
      const totalAmount = donations.reduce((sum, d) => sum + (d.amount || 0), 0);
      const averageDonation = totalDonations > 0 ? Math.round(totalAmount / totalDonations) : 0;

      // Group by date
      const donationsByDate = {};
      donations.forEach((donation) => {
        const date = new Date(donation.created_at).toISOString().split('T')[0];
        if (!donationsByDate[date]) {
          donationsByDate[date] = { date, count: 0, total: 0 };
        }
        donationsByDate[date].count += 1;
        donationsByDate[date].total += donation.amount || 0;
      });

      // Get top donors (but mask email for privacy)
      const topDonors = await Donation.find({ campaign_id: id })
        .sort({ amount: -1 })
        .limit(10)
        .populate('donor_id', 'display_name -email')
        .lean();

      return res.status(200).json({
        success: true,
        analytics: {
          campaign_id: id,
          total_donations: totalDonations,
          total_amount: totalAmount,
          average_donation: averageDonation,
          timeline: Object.values(donationsByDate).sort((a, b) => a.date.localeCompare(b.date)),
          top_donors: topDonors.map((d) => ({
            donor: d.donor_id,
            amount: d.amount,
            date: d.created_at,
            message: d.message ? 'Yes' : 'No',
          })),
        },
      });
    } catch (error) {
      winstonLogger.error('Error getting donation analytics', {
        error: error.message,
        campaignId: req.params.id,
        userId: req.user.id,
        stack: error.stack,
      });
      return res.status(500).json({
        success: false,
        message: 'Failed to get donation analytics',
        statusCode: 500,
      });
    }
  },

  /**
   * Get trending campaigns
   * GET /analytics/trending
   */
  async getTrendingCampaigns(req, res) {
    try {
      const { period = 'week', limit = 10 } = req.query;

      // Calculate date range
      const now = new Date();
      let startDate = new Date();

      switch (period) {
        case 'day':
          startDate.setDate(now.getDate() - 1);
          break;
        case 'month':
          startDate.setMonth(now.getMonth() - 1);
          break;
        case 'week':
        default:
          startDate.setDate(now.getDate() - 7);
          break;
      }

      // Get campaigns with recent donations
      const trendingByDonations = await Donation.aggregate([
        {
          $match: {
            created_at: { $gte: startDate, $lte: now },
          },
        },
        {
          $group: {
            _id: '$campaign_id',
            total_donations: { $sum: 1 },
            total_amount: { $sum: '$amount' },
            avg_donation: { $avg: '$amount' },
          },
        },
        {
          $sort: { total_amount: -1 },
        },
        {
          $limit: parseInt(limit),
        },
        {
          $lookup: {
            from: 'campaigns',
            localField: '_id',
            foreignField: '_id',
            as: 'campaign',
          },
        },
        {
          $unwind: '$campaign',
        },
      ]);

      return res.status(200).json({
        success: true,
        trending: {
          period,
          campaigns: trendingByDonations.map((item) => ({
            campaign_id: item._id,
            campaign_title: item.campaign.title,
            campaign_status: item.campaign.status,
            donations_count: item.total_donations,
            total_amount: item.total_amount,
            average_donation: Math.round(item.avg_donation),
          })),
        },
      });
    } catch (error) {
      winstonLogger.error('Error getting trending campaigns', {
        error: error.message,
        stack: error.stack,
      });
      return res.status(500).json({
        success: false,
        message: 'Failed to get trending campaigns',
        statusCode: 500,
      });
    }
  },

  /**
   * Get user activity (admin only)
   * GET /analytics/user-activity
   */
  async getUserActivity(req, res) {
    try {
      // Verify admin role
      if (req.user.role !== 'admin') {
        return res.status(403).json({
          success: false,
          message: 'Only admins can access user activity analytics',
          statusCode: 403,
        });
      }

      const { period = 'week', limit = 20 } = req.query;

      // Calculate date range
      const now = new Date();
      let startDate = new Date();

      switch (period) {
        case 'day':
          startDate.setDate(now.getDate() - 1);
          break;
        case 'month':
          startDate.setMonth(now.getMonth() - 1);
          break;
        case 'week':
        default:
          startDate.setDate(now.getDate() - 7);
          break;
      }

      // Get user activity metrics
      const newUsers = await User.countDocuments({
        created_at: { $gte: startDate, $lte: now },
      });

      const activeCampaigns = await Campaign.countDocuments({
        created_at: { $gte: startDate, $lte: now },
        status: 'active',
      });

      const totalDonations = await Donation.countDocuments({
        created_at: { $gte: startDate, $lte: now },
      });

      const totalDonationAmount = await Donation.aggregate([
        {
          $match: {
            created_at: { $gte: startDate, $lte: now },
          },
        },
        {
          $group: {
            _id: null,
            total: { $sum: '$amount' },
          },
        },
      ]);

      const activeUsers = await Donation.aggregate([
        {
          $match: {
            created_at: { $gte: startDate, $lte: now },
          },
        },
        {
          $group: {
            _id: '$donor_id',
          },
        },
        {
          $count: 'unique_donors',
        },
      ]);

      return res.status(200).json({
        success: true,
        activity: {
          period,
          timeframe: { start: startDate, end: now },
          metrics: {
            new_users: newUsers,
            active_campaigns: activeCampaigns,
            total_donations: totalDonations,
            total_donation_amount: totalDonationAmount[0]?.total || 0,
            unique_donors: activeUsers[0]?.unique_donors || 0,
          },
        },
      });
    } catch (error) {
      winstonLogger.error('Error getting user activity', {
        error: error.message,
        adminId: req.user.id,
        stack: error.stack,
      });
      return res.status(500).json({
        success: false,
        message: 'Failed to get user activity analytics',
        statusCode: 500,
      });
    }
  },

  /**
   * Export analytics (admin only)
   * GET /analytics/export
   */
  async exportAnalytics(req, res) {
    try {
      // Verify admin role
      if (req.user.role !== 'admin') {
        return res.status(403).json({
          success: false,
          message: 'Only admins can export analytics',
          statusCode: 403,
        });
      }

      const { type = 'all' } = req.query;

      // For MVP, return analytics data as JSON
      const analyticsData = {};

      if (type === 'campaigns' || type === 'all') {
        const campaigns = await Campaign.find().select('title status goal_amount total_donated created_at').lean();
        analyticsData.campaigns = campaigns;
      }

      if (type === 'donations' || type === 'all') {
        const donations = await Donation.find()
          .select('campaign_id donor_id amount status created_at')
          .populate('campaign_id', 'title')
          .populate('donor_id', 'display_name email')
          .lean();
        analyticsData.donations = donations;
      }

      if (type === 'users' || type === 'all') {
        const users = await User.find()
          .select('display_name email role verified blocked created_at')
          .lean();
        analyticsData.users = users;
      }

      // Set response headers for file download
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="analytics-${new Date().toISOString().split('T')[0]}.json"`);

      winstonLogger.info('Analytics exported', {
        adminId: req.user.id,
        type,
      });

      return res.status(200).json({
        success: true,
        exported: true,
        type,
        data: analyticsData,
        timestamp: new Date(),
      });
    } catch (error) {
      winstonLogger.error('Error exporting analytics', {
        error: error.message,
        adminId: req.user.id,
        stack: error.stack,
      });
      return res.status(500).json({
        success: false,
        message: 'Failed to export analytics',
        statusCode: 500,
      });
    }
  },

  /**
   * GET /api/analytics/dashboard
   * Get overall platform metrics
   * @access Public
   */
  async getDashboard(req, res) {
    try {
      const { period = 'month' } = req.query;

      const metrics = await analyticsService.getDashboardMetrics({ period });

      return res.status(200).json({
        success: true,
        message: 'Dashboard metrics retrieved successfully',
        data: metrics,
        statusCode: 200,
      });
    } catch (error) {
      winstonLogger.error('Error getting dashboard metrics', {
        error: error.message,
        stack: error.stack,
      });
      return res.status(500).json({
        success: false,
        message: 'Failed to retrieve dashboard metrics',
        statusCode: 500,
      });
    }
  },

  /**
   * GET /api/analytics/campaign-performance
   * Get campaign performance metrics (trending, top performers, etc.)
   * @access Public
   */
  async getCampaignPerformance(req, res) {
    try {
      const { sort = 'donations', limit = 10 } = req.query;

      const campaigns = await analyticsService.getCampaignPerformance({
        sort,
        limit: Math.min(100, parseInt(limit) || 10)
      });

      return res.status(200).json({
        success: true,
        message: 'Campaign performance metrics retrieved successfully',
        data: {
          campaigns,
          count: campaigns.length
        },
        statusCode: 200,
      });
    } catch (error) {
      winstonLogger.error('Error getting campaign performance', {
        error: error.message,
        stack: error.stack,
      });
      return res.status(500).json({
        success: false,
        message: 'Failed to retrieve campaign performance metrics',
        statusCode: 500,
      });
    }
  },

  /**
   * GET /api/analytics/donation-trends
   * Get donation trends over time
   * @access Public
   */
  async getDonationTrends(req, res) {
    try {
      const { period = 'day', days = 30, groupBy = 'date' } = req.query;

      const trends = await analyticsService.getDonationTrends({
        period,
        days: Math.min(365, parseInt(days) || 30),
        groupBy
      });

      return res.status(200).json({
        success: true,
        message: 'Donation trends retrieved successfully',
        data: trends,
        statusCode: 200,
      });
    } catch (error) {
      winstonLogger.error('Error getting donation trends', {
        error: error.message,
        stack: error.stack,
      });
      return res.status(500).json({
        success: false,
        message: 'Failed to retrieve donation trends',
        statusCode: 500,
      });
    }
  },

  /**
   * GET /api/analytics/revenue
   * Get platform revenue breakdown (admin-only)
   * @access Protected - Admin only
   */
  async getRevenue(req, res) {
    try {
      // Verify admin role
      if (req.user?.role !== 'admin') {
        return res.status(403).json({
          success: false,
          message: 'Forbidden: Admin access required',
          statusCode: 403,
        });
      }

      const { period = 'month', detailed = false } = req.query;

      const revenue = await analyticsService.getRevenueBreakdown({
        period,
        detailed: detailed === 'true' || detailed === true
      });

      return res.status(200).json({
        success: true,
        message: 'Revenue breakdown retrieved successfully',
        data: revenue,
        statusCode: 200,
      });
    } catch (error) {
      winstonLogger.error('Error getting revenue breakdown', {
        error: error.message,
        adminId: req.user?.id,
        stack: error.stack,
      });
      return res.status(500).json({
        success: false,
        message: 'Failed to retrieve revenue breakdown',
        statusCode: 500,
      });
    }
  },

  /**
   * GET /campaigns/:id/analytics/progress
   * Get campaign progress metrics (latest snapshot)
   * 
   * Returns: Most recent cumulative metrics snapshot
   * {
   *   campaign: { _id, campaign_id, title },
   *   metrics: {
   *     donations: { total_count, total_amount, by_method },
   *     shares: { total_count, by_channel },
   *     volunteers: { total_count, total_hours },
   *     customers: { total_acquired },
   *     date: ISO date
   *   }
   * }
   * 
   * @access Protected - Creator only
   */
  async getCampaignProgress(req, res, next) {
    try {
      const CampaignProgressService = require('../services/CampaignProgressService');
      const { id } = req.params;
      const userId = req.user?.id;

      // Verify authentication
      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized: Authentication required',
        });
      }

      // Find campaign
      let campaign = await Campaign.findById(id);
      if (!campaign) {
        campaign = await Campaign.findOne({ campaign_id: id });
      }

      if (!campaign) {
        return res.status(404).json({
          success: false,
          message: 'Campaign not found',
        });
      }

      // Check ownership
      if (campaign.creator_id.toString() !== userId.toString()) {
        return res.status(403).json({
          success: false,
          message: 'Forbidden: You cannot access this campaign\'s analytics',
        });
      }

      // Get latest metrics
      const metrics = await CampaignProgressService.getCampaignMetrics(campaign._id);

      winstonLogger.info('Campaign progress metrics retrieved', {
        campaignId: campaign._id,
        userId,
        hasMetrics: metrics !== null,
      });

      res.status(200).json({
        success: true,
        message: 'Campaign progress metrics retrieved successfully',
        data: {
          campaign: {
            _id: campaign._id,
            campaign_id: campaign.campaign_id,
            title: campaign.campaign_name,
            status: campaign.status,
          },
          metrics: metrics || {
            message: 'No snapshot data available yet. Check back after the daily aggregation runs.',
            donations: { total_count: 0, total_amount: 0, by_method: {} },
            shares: { total_count: 0, by_channel: {} },
            volunteers: { total_count: 0, total_hours: 0 },
            customers: { total_acquired: 0 },
          },
        },
      });
    } catch (error) {
      winstonLogger.error('Campaign progress retrieval error', {
        error: error.message,
        campaignId: req.params.id,
        userId: req.user?.id,
        stack: error.stack,
      });

      res.status(error.statusCode || 500).json({
        success: false,
        message: error.message || 'Failed to retrieve campaign progress',
      });
    }
  },

  /**
   * GET /campaigns/:id/analytics/progress/trend
   * Get campaign progress trend (historical data)
   * 
   * Query Params:
   * - days: Number of days to retrieve (default 30, max 90)
   * 
   * Returns: Array of daily progress snapshots with trend data
   * [
   *   {
   *     date: ISO date,
   *     donations: { total_count, total_amount, by_method },
   *     shares: { total_count, by_channel },
   *     volunteers: { total_count, total_hours },
   *     daily_gains: {
   *       donations: { count_gain, amount_gain },
   *       shares: { count_gain },
   *       volunteers: { count_gain }
   *     }
   *   }
   * ]
   * 
   * @access Protected - Creator only
   */
  async getCampaignProgressTrend(req, res, next) {
    try {
      const CampaignProgressService = require('../services/CampaignProgressService');
      const { id } = req.params;
      const userId = req.user?.id;
      const days = Math.min(90, Math.max(1, parseInt(req.query.days) || 30));

      // Verify authentication
      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized: Authentication required',
        });
      }

      // Find campaign
      let campaign = await Campaign.findById(id);
      if (!campaign) {
        campaign = await Campaign.findOne({ campaign_id: id });
      }

      if (!campaign) {
        return res.status(404).json({
          success: false,
          message: 'Campaign not found',
        });
      }

      // Check ownership
      if (campaign.creator_id.toString() !== userId.toString()) {
        return res.status(403).json({
          success: false,
          message: 'Forbidden: You cannot access this campaign\'s analytics',
        });
      }

      // Get trend data
      const trend = await CampaignProgressService.getCampaignTrend(campaign._id, days);

      winstonLogger.info('Campaign progress trend retrieved', {
        campaignId: campaign._id,
        userId,
        days,
        dataPoints: trend.length,
      });

      res.status(200).json({
        success: true,
        message: 'Campaign progress trend retrieved successfully',
        data: {
          campaign: {
            _id: campaign._id,
            campaign_id: campaign.campaign_id,
            title: campaign.campaign_name,
            status: campaign.status,
          },
          days,
          dataPoints: trend.length,
          trend,
        },
      });
    } catch (error) {
      winstonLogger.error('Campaign progress trend retrieval error', {
        error: error.message,
        campaignId: req.params.id,
        userId: req.user?.id,
        days: req.query.days,
        stack: error.stack,
      });

      res.status(error.statusCode || 500).json({
        success: false,
        message: error.message || 'Failed to retrieve campaign progress trend',
      });
    }
  },

  /**
   * Track QR code scan and award sweepstakes entry
   * POST /api/analytics/qr/scan
   *
   * Handles QR scan events with automatic sweepstakes integration.
   * - Records scan in QRCodeScan model
   * - Awards +1 sweepstakes entry if user authenticated
   * - Updates campaign QR scan metrics
   * - Returns scan confirmation with sweepstakes status
   */
  async trackQRScan(req, res) {
    try {
      const { campaignId, userId, qrCodeId, location } = req.body;

      // Validate required fields
      if (!campaignId) {
        return res.status(400).json({
          success: false,
          message: 'Missing required field: campaignId',
        });
      }

      // Extract IP and user agent (with fallbacks)
      const ipAddress = req.ip || req.connection.remoteAddress || 'unknown';
      const userAgent = req.get('user-agent') || 'unknown';

      // Call ShareService to track scan and award sweepstakes entry
      const ShareService = require('../services/ShareService');
      const scanResult = await ShareService.trackQRScan({
        campaignId,
        userId: userId || null,
        qrCodeId: qrCodeId || null,
        ipAddress,
        userAgent,
        location: location || {},
      });

      // Return success response
      res.status(201).json({
        success: true,
        data: scanResult,
        message: scanResult.message,
      });
    } catch (error) {
      winstonLogger.error('QR scan tracking error', {
        error: error.message,
        campaignId: req.body?.campaignId,
        userId: req.body?.userId,
        stack: error.stack,
      });

      res.status(error.statusCode || 500).json({
        success: false,
        message: error.message || 'Failed to track QR scan',
      });
    }
  },
};

module.exports = AnalyticsController;
