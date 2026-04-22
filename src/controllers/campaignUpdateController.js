/**
 * Campaign Update Controller
 * HTTP request handlers for campaign progress updates
 * 
 * Endpoints:
 * - POST /campaigns/:campaignId/updates - Create update
 * - GET /campaigns/:campaignId/updates - List updates  
 * - PATCH /campaigns/:campaignId/updates/:updateId - Edit update
 * - DELETE /campaigns/:campaignId/updates/:updateId - Delete update
 * - POST /campaigns/:campaignId/updates/:updateId/record-engagement - Record interaction
 */

const CampaignUpdate = require('../models/CampaignUpdate');
const Campaign = require('../models/Campaign');
const winstonLogger = require('../utils/winstonLogger');
const { generateShortenedId } = require('../utils/idGenerator');

/**
 * Generate unique update ID
 */
const generateUpdateId = () => `upd_${generateShortenedId()}`;

const CampaignUpdateController = {
  /**
   * Create campaign update
   * POST /campaigns/:campaignId/updates
   */
  async createUpdate(req, res, next) {
    try {
      const { campaignId, id } = req.params;
      const finalCampaignId = campaignId || id;
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized: User ID is required',
        });
      }

      // Verify campaign exists and user is owner
      const campaign = await Campaign.findById(finalCampaignId);
      if (!campaign) {
        return res.status(404).json({
          success: false,
          message: 'Campaign not found',
        });
      }

      if (campaign.creator_id.toString() !== userId.toString()) {
        return res.status(403).json({
          success: false,
          message: 'Forbidden: Only campaign creator can post updates',
        });
      }

      // Create update
      const updateId = generateUpdateId();
      const newUpdate = new CampaignUpdate({
        update_id: updateId,
        campaign_id: finalCampaignId,
        creator_id: userId,
        title: req.body.title,
        content: req.body.content,
        media_urls: req.body.media_urls || [],
        update_type: req.body.update_type || 'general_update',
        sentiment: req.body.sentiment || 'neutral',
        status: 'published',
      });

      const savedUpdate = await newUpdate.save();

      winstonLogger.info('Campaign update created', {
        updateId: updateId,
        campaignId: finalCampaignId,
        creatorId: userId,
      });

      res.status(201).json({
        success: true,
        message: 'Campaign update created successfully',
        data: savedUpdate,
      });
    } catch (error) {
      winstonLogger.error('Campaign update creation error', {
        campaignId: req.params.campaignId || req.params.id,
        userId: req.user?.id,
        error: error.message,
      });

      res.status(500).json({
        success: false,
        message: error.message || 'Failed to create campaign update',
      });
    }
  },

  /**
   * List campaign updates with pagination
   * GET /campaigns/:campaignId/updates?page=1&limit=10&sort=newest
   */
  async listUpdates(req, res, next) {
    try {
      const { campaignId, id } = req.params;
      const finalCampaignId = campaignId || id;
      const { page = 1, limit = 10, sort = 'newest', type, status } = req.query;

      winstonLogger.info('📋 listUpdates: Request received', {
        campaignId,
        id,
        finalCampaignId,
        paramsKeys: Object.keys(req.params),
        allParams: req.params,
        page,
        limit,
        sort,
      });

      // Validate campaignId is provided
      if (!finalCampaignId) {
        winstonLogger.warn('⚠️ listUpdates: Missing campaignId parameter', {
          params: req.params,
          campaignId,
          id,
        });
        return res.status(400).json({
          success: false,
          message: 'Campaign ID is required',
        });
      }

      // Verify campaign exists - using either campaignId or id
      let campaign;
      try {
        campaign = await Campaign.findById(finalCampaignId);
      } catch (dbError) {
        winstonLogger.warn('⚠️ listUpdates: Database query error', {
          campaignId: finalCampaignId,
          error: dbError.message,
        });
        return res.status(400).json({
          success: false,
          message: 'Invalid Campaign ID format',
        });
      }

      if (!campaign) {
        winstonLogger.warn('⚠️ listUpdates: Campaign not found', {
          campaignId: finalCampaignId,
          searchedId: finalCampaignId,
        });
        return res.status(404).json({
          success: false,
          message: 'Campaign not found',
        });
      }

      winstonLogger.info('✅ listUpdates: Campaign found', {
        campaignId: finalCampaignId,
        campaignTitle: campaign.title,
      });

      // Build filter
      const filter = {
        campaign_id: finalCampaignId,
        is_deleted: false,
      };

      if (type) {
        filter.update_type = type;
      }
      if (status) {
        filter.status = status;
      } else {
        filter.status = 'published'; // Only published by default
      }

      // Build sort
      let sortOption = { created_at: -1 }; // Newest by default
      if (sort === 'oldest') {
        sortOption = { created_at: 1 };
      } else if (sort === 'most_viewed') {
        sortOption = { 'engagement.view_count': -1 };
      } else if (sort === 'most_shared') {
        sortOption = { 'engagement.share_count': -1 };
      }

      // Calculate pagination
      const pageNum = parseInt(page) || 1;
      const limitNum = Math.min(parseInt(limit) || 10, 100);
      const skip = (pageNum - 1) * limitNum;

      // Get updates
      const updates = await CampaignUpdate.find(filter)
        .sort(sortOption)
        .skip(skip)
        .limit(limitNum)
        .lean();

      // Get total count
      const total = await CampaignUpdate.countDocuments(filter);

      winstonLogger.info('✅ listUpdates: Updates retrieved', {
        campaignId: finalCampaignId,
        updateCount: updates.length,
        totalCount: total,
        pageNum,
        limitNum,
      });

      res.status(200).json({
        success: true,
        message: 'Campaign updates retrieved successfully',
        data: {
          updates,
          pagination: {
            page: pageNum,
            limit: limitNum,
            total,
            totalPages: Math.ceil(total / limitNum),
            hasMore: pageNum < Math.ceil(total / limitNum),
          },
        },
      });
    } catch (error) {
      winstonLogger.error('Campaign updates listing error', {
        campaignId: req.params.campaignId,
        error: error.message,
        stack: error.stack,
      });

      res.status(500).json({
        success: false,
        message: error.message || 'Failed to retrieve campaign updates',
      });
    }
  },

  /**
   * Get single campaign update
   * GET /campaigns/:campaignId/updates/:updateId
   */
  async getUpdate(req, res, next) {
    try {
      const { campaignId, updateId } = req.params;
      const userId = req.user?.id;

      const update = await CampaignUpdate.findOne({
        _id: updateId,
        campaign_id: campaignId,
        is_deleted: false,
      });

      if (!update) {
        return res.status(404).json({
          success: false,
          message: 'Campaign update not found',
        });
      }

      // Increment view count if user is not the creator
      if (userId && userId.toString() !== update.creator_id.toString()) {
        await CampaignUpdate.incrementViewCount(updateId, userId);
      }

      res.status(200).json({
        success: true,
        message: 'Campaign update retrieved successfully',
        data: update,
      });
    } catch (error) {
      winstonLogger.error('Campaign update retrieval error', {
        campaignId: req.params.campaignId,
        updateId: req.params.updateId,
        error: error.message,
      });

      res.status(500).json({
        success: false,
        message: error.message || 'Failed to retrieve campaign update',
      });
    }
  },

  /**
   * Update campaign update (edit)
   * PATCH /campaigns/:campaignId/updates/:updateId
   */
  async updateUpdate(req, res, next) {
    try {
      const { campaignId, updateId } = req.params;
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized: User ID is required',
        });
      }

      const update = await CampaignUpdate.findOne({
        _id: updateId,
        campaign_id: campaignId,
        is_deleted: false,
      });

      if (!update) {
        return res.status(404).json({
          success: false,
          message: 'Campaign update not found',
        });
      }

      // Verify user is the creator
      if (update.creator_id.toString() !== userId.toString()) {
        return res.status(403).json({
          success: false,
          message: 'Forbidden: Only update creator can edit',
        });
      }

      // Update fields
      if (req.body.title !== undefined) update.title = req.body.title;
      if (req.body.content !== undefined) update.content = req.body.content;
      if (req.body.media_urls !== undefined) update.media_urls = req.body.media_urls;
      if (req.body.update_type !== undefined) update.update_type = req.body.update_type;
      if (req.body.sentiment !== undefined) update.sentiment = req.body.sentiment;
      if (req.body.status !== undefined) update.status = req.body.status;

      const savedUpdate = await update.save();

      winstonLogger.info('Campaign update edited', {
        updateId: updateId,
        campaignId: campaignId,
        creatorId: userId,
      });

      res.status(200).json({
        success: true,
        message: 'Campaign update updated successfully',
        data: savedUpdate,
      });
    } catch (error) {
      winstonLogger.error('Campaign update edit error', {
        campaignId: req.params.campaignId,
        updateId: req.params.updateId,
        userId: req.user?.id,
        error: error.message,
      });

      res.status(500).json({
        success: false,
        message: error.message || 'Failed to update campaign update',
      });
    }
  },

  /**
   * Delete campaign update (soft delete)
   * DELETE /campaigns/:campaignId/updates/:updateId
   */
  async deleteUpdate(req, res, next) {
    try {
      const { campaignId, updateId } = req.params;
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized: User ID is required',
        });
      }

      const update = await CampaignUpdate.findOne({
        _id: updateId,
        campaign_id: campaignId,
        is_deleted: false,
      });

      if (!update) {
        return res.status(404).json({
          success: false,
          message: 'Campaign update not found',
        });
      }

      // Verify user is the creator
      if (update.creator_id.toString() !== userId.toString()) {
        return res.status(403).json({
          success: false,
          message: 'Forbidden: Only update creator can delete',
        });
      }

      await update.softDelete();

      winstonLogger.info('Campaign update deleted', {
        updateId: updateId,
        campaignId: campaignId,
        creatorId: userId,
      });

      res.status(204).send();
    } catch (error) {
      winstonLogger.error('Campaign update deletion error', {
        campaignId: req.params.campaignId,
        updateId: req.params.updateId,
        userId: req.user?.id,
        error: error.message,
      });

      res.status(500).json({
        success: false,
        message: error.message || 'Failed to delete campaign update',
      });
    }
  },

  /**
   * Record user engagement with update
   * POST /campaigns/:campaignId/updates/:updateId/engagement
   */
  async recordEngagement(req, res, next) {
    try {
      const { campaignId, updateId } = req.params;
      const { action } = req.body;

      const update = await CampaignUpdate.findOne({
        _id: updateId,
        campaign_id: campaignId,
        is_deleted: false,
      });

      if (!update) {
        return res.status(404).json({
          success: false,
          message: 'Campaign update not found',
        });
      }

      // Map action to metric
      const metricMap = {
        view: 'view_count',
        share: 'share_count',
        like: 'like_count',
        comment: 'comment_count',
      };

      const metric = metricMap[action];
      if (!metric) {
        return res.status(400).json({
          success: false,
          message: 'Invalid engagement action',
        });
      }

      const updatedUpdate = await CampaignUpdate.incrementEngagement(updateId, metric);

      res.status(200).json({
        success: true,
        message: `${action} recorded successfully`,
        data: updatedUpdate,
      });
    } catch (error) {
      winstonLogger.error('Campaign update engagement error', {
        campaignId: req.params.campaignId,
        updateId: req.params.updateId,
        error: error.message,
      });

      res.status(500).json({
        success: false,
        message: error.message || 'Failed to record engagement',
      });
    }
  },
};

module.exports = CampaignUpdateController;
