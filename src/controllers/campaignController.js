/**
 * Campaign Controller
 * HTTP request handlers for campaign endpoints (Day 3-4)
 * 
 * Endpoints:
 * - POST /campaigns - Create campaign
 * - GET /campaigns - List campaigns with pagination
 * - GET /campaigns/:id - Get campaign detail
 * - PUT /campaigns/:id - Update campaign
 * - DELETE /campaigns/:id - Delete (soft-delete)
 */

const CampaignService = require('../services/CampaignService');
const SweepstakesService = require('../services/SweepstakesService');
const User = require('../models/User');
const winstonLogger = require('../utils/winstonLogger');

const CampaignController = {
  /**
   * Create a new campaign
   * POST /campaigns
   * 
   * Body: { title, description, need_type, goals, location, payment_methods, tags, category, image_url }
   * Returns: 201 with campaign object
   */
  async create(req, res, next) {
    try {
      // Extract userId from JWT (set by auth middleware)
      winstonLogger.info('📥 Campaign Create Handler: Request received', {
        method: req.method,
        path: req.path,
        hasReqUser: !!req.user,
        reqUserKeys: req.user ? Object.keys(req.user) : [],
        reqUser: req.user,
      });

      // ✅ FIX: Add detailed request body logging including image_url
      winstonLogger.info('📥 Campaign Create Handler: Request body and file details', {
        bodyKeys: Object.keys(req.body),
        hasImageUrl: 'image_url' in req.body,
        imageUrlValue: req.body.image_url,
        hasReqFile: !!req.file,
        reqFileFields: req.file ? Object.keys(req.file) : [],
        reqFilePath: req.file?.path,
        contentType: req.headers['content-type'],
        timestamp: new Date().toISOString(),
      });

      const userId = req.user?.id;

      winstonLogger.info('🔍 Campaign Create Handler: Checking userId', {
        userId,
        'req.user': req.user,
        'req.user.id': req.user?.id,
        'req.user.userId': req.user?.userId,
        userIdExists: !!userId,
      });

      if (!userId) {
        winstonLogger.warn('❌ Campaign Create Handler: Missing userId', {
          reqUser: req.user,
          'req.user?.id': req.user?.id,
          'req.user?.userId': req.user?.userId,
        });

        return res.status(401).json({
          success: false,
          message: 'Unauthorized: User ID is required',
        });
      }

      winstonLogger.info('✅ Campaign Create Handler: UserId found, creating campaign', {
        userId,
      });

      // ✅ Validate sharing campaign fields if campaign_type is 'sharing'
      if (req.body.campaign_type === 'sharing') {
        const { platforms, budget, reward_per_share } = req.body;
        const errors = [];

        if (!platforms) {
          errors.push('platforms is required for sharing campaigns');
        } else {
          let platformsArray = [];
          try {
            if (typeof platforms === 'string') {
              try {
                platformsArray = JSON.parse(platforms);
              } catch {
                platformsArray = platforms.split(',').map((p) => p.trim()).filter((p) => p);
              }
            } else {
              platformsArray = platforms;
            }
            if (!Array.isArray(platformsArray) || platformsArray.length === 0) {
              errors.push('platforms must be a non-empty array');
            } else if (platformsArray.length > 8) {
              errors.push('Cannot select more than 8 platforms');
            }
          } catch (e) {
            errors.push(`Failed to parse platforms: ${e.message}`);
          }
        }

        if (!budget) {
          errors.push('budget is required for sharing campaigns');
        } else {
          const budgetNum = parseFloat(budget);
          if (isNaN(budgetNum) || budgetNum < 10 || budgetNum > 1000000) {
            errors.push('budget must be between $10 and $1,000,000');
          }
        }

        if (!reward_per_share) {
          errors.push('reward_per_share is required for sharing campaigns');
        } else {
          const rewardNum = parseFloat(reward_per_share);
          if (isNaN(rewardNum) || rewardNum < 0.1 || rewardNum > 100) {
            errors.push('reward_per_share must be between $0.10 and $100');
          }
        }

        if (errors.length > 0) {
          winstonLogger.warn('❌ Campaign Create Handler: Sharing campaign validation failed', {
            userId,
            errors,
          });
          return res.status(400).json({
            success: false,
            message: 'Sharing campaign validation failed',
            validationErrors: errors,
          });
        }

        winstonLogger.info('✅ Campaign Create Handler: Sharing campaign validation passed', {
          userId,
          platforms: req.body.platforms,
          budget: req.body.budget,
          reward_per_share: req.body.reward_per_share,
        });
      }

      // ✅ CLOUDINARY: Extract image URL from Cloudinary upload
      if (req.file?.image_url) {
        req.body.image_url = req.file.image_url;
        req.body.image_public_id = req.file.image_public_id;
        winstonLogger.info('☁️ CampaignController: Cloudinary image URL attached', {
          image_url: req.file.image_url.substring(0, 100),
          image_public_id: req.file.image_public_id,
        });
      } else if (req.file === null || req.uploadError) {
        // Cloudinary upload was attempted but failed
        winstonLogger.error('❌ CampaignController: Cloudinary upload failed, cannot create campaign', {
          uploadError: req.uploadError,
          hasFile: !!req.file,
        });
        return res.status(400).json({
          success: false,
          message: 'Campaign image upload to Cloudinary failed',
          error: req.uploadError || 'Image upload failed',
          code: 'IMAGE_UPLOAD_FAILED',
        });
      }

      // ✅ LOG ALL FIELDS IN REQ.BODY BEFORE SERVICE CALL
      winstonLogger.info('📋 CampaignController: req.body fields about to send to service', {
        allBodyKeys: Object.keys(req.body),
        hasImageUrl: 'image_url' in req.body,
        bodyFieldsCheckList: {
          has_title: 'title' in req.body,
          has_prayer_config: 'prayer_config' in req.body,
          prayer_config_value: req.body.prayer_config,
          prayer_config_type: typeof req.body.prayer_config,
        },
        fullReqBody: req.body,
      });

      // Extract body and call service
      const campaign = await CampaignService.createCampaign(userId, req.body);

      // Sweepstakes entry recording disabled - using new simplified sweepstakes system
      // No entries are tracked for individual actions anymore

      // Return 201 Created with campaign object
      // Frontend expects { id, campaign } structure
      res.status(201).json({
        success: true,
        message: 'Campaign created successfully',
        id: campaign._id,
        campaign: campaign,
      });
    } catch (error) {
      winstonLogger.error('Campaign creation handler error', {
        error: error.message,
        userId: req.user?.id,
        stack: error.stack,
      });

      // Handle validation errors
      if (error.statusCode === 400) {
        return res.status(400).json({
          success: false,
          message: error.message,
          validationErrors: error.validationErrors,
        });
      }

      // Handle other errors
      res.status(error.statusCode || 500).json({
        success: false,
        message: error.message || 'Failed to create campaign',
      });
    }
  },

  /**
   * List campaigns with pagination and filtering
   * GET /campaigns?page=1&limit=20&needTypes=emergency_medical,food&status=active
   * 
   * Query Params:
   * - page: Page number (default 1, required for pagination)
   * - limit: Items per page (default 20, max 100)
   * - needTypes/needType: Filter by need type(s) - comma separated or single value (optional)
   * - status: Filter by status (optional)
   * - userId: Filter by creator (optional)
   * - search: Search in title/description (optional)
   * - sort: Sort field ('trending', 'newest', 'oldest' - default 'trending') (optional)
   * 
   * Returns: { campaigns, totalCount, page, hasMore }
   */
  async list(req, res, next) {
    try {
      // Parse query parameters
      const page = Math.max(1, parseInt(req.query.page) || 1);
      const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
      
      // Support both needTypes (plural) and needType (singular) for backwards compatibility
      let needType = req.query.needTypes || req.query.needType || null;
      // Convert comma-separated string to array if needed
      if (typeof needType === 'string' && needType.includes(',')) {
        needType = needType.split(',').map((t) => t.trim());
      }
      
      const status = req.query.status || null;
      const userId = req.query.userId || null;
      const search = req.query.search || null;
      const sort = req.query.sort || 'trending';

      // Calculate skip for database query
      const skip = (page - 1) * limit;

      // Build MongoDB query filters
      const filters = {
        userId,
        status,
        needType,
        search,
        sort,
        skip,
        limit,
      };

      console.log('\n📥 [Backend] Campaign LIST REQUEST RECEIVED', {
        timestamp: new Date().toISOString(),
        page,
        limit,
        skip,
        statusFilter: status,
        needTypeFilter: needType,
        searchFilter: search,
        userIdFilter: userId,
        sortBy: sort,
        allQueryParams: req.query,
      })

      winstonLogger.info('📥 Campaign list: Request received', {
        page,
        limit,
        hasUserId: !!userId,
        needType,
        status,
        search,
        sort,
      });

      // Call service with filters
      const result = await CampaignService.listCampaigns(filters);

      console.log('✅ [Backend] Campaign LIST RESULTS FROM SERVICE', {
        campaignCount: result.campaigns?.length || 0,
        total: result.total,
        page,
        limit,
        campaigns: result.campaigns?.map(c => ({
          _id: c._id,
          title: c.title,
          status: c.status,
          creator_id: c.creator_id,
          created_at: c.created_at,
        })),
      })

      winstonLogger.info('✅ Campaign list: Service returned', {
        userId,
        campaignCount: result.campaigns?.length || 0,
        total: result.total,
        page,
        limit,
      });

      // Calculate pagination metadata
      const totalCount = result.total;
      const totalPages = Math.ceil(totalCount / limit);
      const hasMore = page < totalPages;

      // Return with proper pagination format
      console.log('📤 [Backend] Campaign LIST RESPONSE SENDING', {
        statusCode: 200,
        totalCampaigns: totalCount,
        returnedCount: result.campaigns?.length || 0,
        page,
        totalPages,
        hasMore,
      })

      res.status(200).json({
        success: true,
        message: 'Campaigns retrieved successfully',
        data: result.campaigns,
        pagination: {
          page,
          limit,
          totalCount,
          totalPages,
          hasMore,
        },
      });
    } catch (error) {
      console.error('❌ [Backend] Campaign LIST ERROR', {
        error: error.message,
        errorType: error.name,
        query: req.query,
        stack: error.stack,
      })

      winstonLogger.error('Campaign list handler error', {
        error: error.message,
        query: req.query,
        stack: error.stack,
      });

      res.status(500).json({
        success: false,
        message: error.message || 'Failed to list campaigns',
      });
    }
  },

  /**
   * Get campaign detail
   * GET /campaigns/:id
   * 
   * Path Params:
   * - id: Campaign ID (MongoDB _id or campaign_id)
   * 
   * Returns: 200 with full campaign object
   * Throws: 404 if not found
   */
  async getDetail(req, res, next) {
    try {
      const { id } = req.params;
      const userId = req.user?.id; // Optional, for view tracking

      // Call service to get campaign
      const campaign = await CampaignService.getCampaign(id, userId);

      // Return 200 with full campaign data
      res.status(200).json({
        success: true,
        message: 'Campaign retrieved successfully',
        data: campaign,
      });
    } catch (error) {
      winstonLogger.error('Campaign detail handler error', {
        error: error.message,
        campaignId: req.params.id,
        userId: req.user?.id,
        stack: error.stack,
      });

      // Handle not found
      if (error.statusCode === 404) {
        return res.status(404).json({
          success: false,
          message: error.message,
        });
      }

      res.status(error.statusCode || 500).json({
        success: false,
        message: error.message || 'Failed to retrieve campaign',
      });
    }
  },

  /**
   * Update campaign
   * PUT /campaigns/:id
   * 
   * Path Params:
   * - id: Campaign ID
   * 
   * Body: Partial update (title, description, goals, payment_methods, etc.)
   * Returns: 200 with updated campaign object
   * Throws: 403 if not owner, 404 if not found, 400 if validation fails
   */
  async update(req, res, next) {
    try {
      const { id } = req.params;
      const userId = req.user?.id;

      // Verify userId is present
      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized: User ID is required',
        });
      }

      // Call service to update campaign
      const campaign = await CampaignService.updateCampaign(id, userId, req.body);

      // Return 200 with updated campaign
      res.status(200).json({
        success: true,
        message: 'Campaign updated successfully',
        data: campaign,
      });
    } catch (error) {
      winstonLogger.error('Campaign update handler error', {
        error: error.message,
        campaignId: req.params.id,
        userId: req.user?.id,
        stack: error.stack,
      });

      // Handle validation errors (400)
      if (error.statusCode === 400) {
        return res.status(400).json({
          success: false,
          message: error.message,
          validationErrors: error.validationErrors,
        });
      }

      // Handle forbidden - not owner (403)
      if (error.statusCode === 403) {
        return res.status(403).json({
          success: false,
          message: error.message,
        });
      }

      // Handle not found (404)
      if (error.statusCode === 404) {
        return res.status(404).json({
          success: false,
          message: error.message,
        });
      }

      res.status(error.statusCode || 500).json({
        success: false,
        message: error.message || 'Failed to update campaign',
      });
    }
  },

  /**
   * Delete campaign (soft delete)
   * DELETE /campaigns/:id
   * 
   * Path Params:
   * - id: Campaign ID
   * 
   * Returns: 204 No Content
   * Throws: 403 if not owner, 404 if not found
   * 
   * Note: Sets status = 'archived' / is_deleted = true
   */
  async delete(req, res, next) {
    try {
      const { id } = req.params;
      const userId = req.user?.id;

      // Verify userId is present
      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized: User ID is required',
        });
      }

      // Call service to delete campaign
      await CampaignService.deleteCampaign(id, userId);

      winstonLogger.info('Campaign deleted successfully', {
        campaignId: id,
        userId,
      });

      // Return 204 No Content
      res.status(204).send();
    } catch (error) {
      winstonLogger.error('Campaign delete handler error', {
        error: error.message,
        campaignId: req.params.id,
        userId: req.user?.id,
        stack: error.stack,
      });

      // Handle forbidden - not owner (403)
      if (error.statusCode === 403) {
        return res.status(403).json({
          success: false,
          message: error.message,
        });
      }

      // Handle not found (404)
      if (error.statusCode === 404) {
        return res.status(404).json({
          success: false,
          message: error.message,
        });
      }

      res.status(error.statusCode || 500).json({
        success: false,
        message: error.message || 'Failed to update campaign',
      });
    }
  },

  /**
   * Delete campaign (soft delete)
   * DELETE /campaigns/:id
   * 
   * Path Params:
   * - id: Campaign ID
   * 
   * Returns: 204 No Content
   * Throws: 403 if not owner, 404 if not found
   * 
   * Note: Sets status = 'archived' / is_deleted = true
   */
  async deleteCampaign(req, res, next) {
    try {
      const { id } = req.params;
      const userId = req.user?.id;

      // Verify userId is present
      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized: User ID is required',
        });
      }

      // Call service to delete campaign
      await CampaignService.deleteCampaign(id, userId);

      winstonLogger.info('Campaign deleted successfully', {
        campaignId: id,
        userId,
      });

      // Return 204 No Content
      res.status(204).send();
    } catch (error) {
      winstonLogger.error('Campaign delete handler error', {
        error: error.message,
        campaignId: req.params.id,
        userId: req.user?.id,
        stack: error.stack,
      });

      // Handle forbidden - not owner (403)
      if (error.statusCode === 403) {
        return res.status(403).json({
          success: false,
          message: error.message,
        });
      }

      // Handle not found (404)
      if (error.statusCode === 404) {
        return res.status(404).json({
          success: false,
          message: error.message,
        });
      }

      res.status(error.statusCode || 500).json({
        success: false,
        message: error.message || 'Failed to delete campaign',
      });
    }
  },

  /**
   * Publish campaign (activate from draft)
   * POST /campaigns/:id/publish
   * 
   * Path Params:
   * - id: Campaign ID
   * 
   * Returns: 200 with published campaign
   * Throws: 403 if not owner, 404 if not found, 400 if not draft or incomplete
   */
  async publish(req, res, next) {
    try {
      const { id } = req.params;
      const userId = req.user?.id;

      // Verify userId is present
      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized: User ID is required',
        });
      }

      // Call service to publish campaign
      const campaign = await CampaignService.publishCampaign(id, userId);

      // Return 200 with campaign
      res.status(200).json({
        success: true,
        message: 'Campaign published successfully',
        data: campaign,
      });
    } catch (error) {
      winstonLogger.error('Campaign publish handler error', {
        error: error.message,
        campaignId: req.params.id,
        userId: req.user?.id,
        stack: error.stack,
      });

      // Handle validation errors (400)
      if (error.statusCode === 400) {
        return res.status(400).json({
          success: false,
          message: error.message,
          validationErrors: error.validationErrors,
        });
      }

      // Handle forbidden - not owner (403)
      if (error.statusCode === 403) {
        return res.status(403).json({
          success: false,
          message: error.message,
        });
      }

      // Handle not found (404)
      if (error.statusCode === 404) {
        return res.status(404).json({
          success: false,
          message: error.message,
        });
      }

      res.status(error.statusCode || 500).json({
        success: false,
        message: error.message || 'Failed to publish campaign',
      });
    }
  },

  /**
   * Pause active campaign
   * POST /campaigns/:id/pause
   * 
   * Path Params:
   * - id: Campaign ID
   * 
   * Returns: 200 with paused campaign
   * Throws: 403 if not owner, 404 if not found, 400 if not active
   */
  async pause(req, res, next) {
    try {
      const { id } = req.params;
      const userId = req.user?.id;

      // Verify userId is present
      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized: User ID is required',
        });
      }

      // Call service to pause campaign
      const campaign = await CampaignService.pauseCampaign(id, userId);

      // Return 200 with campaign
      res.status(200).json({
        success: true,
        message: 'Campaign paused successfully',
        data: campaign,
      });
    } catch (error) {
      winstonLogger.error('Campaign pause handler error', {
        error: error.message,
        campaignId: req.params.id,
        userId: req.user?.id,
        stack: error.stack,
      });

      // Handle validation errors (400)
      if (error.statusCode === 400) {
        return res.status(400).json({
          success: false,
          message: error.message,
        });
      }

      // Handle forbidden - not owner (403)
      if (error.statusCode === 403) {
        return res.status(403).json({
          success: false,
          message: error.message,
        });
      }

      // Handle not found (404)
      if (error.statusCode === 404) {
        return res.status(404).json({
          success: false,
          message: error.message,
        });
      }

      res.status(error.statusCode || 500).json({
        success: false,
        message: error.message || 'Failed to pause campaign',
      });
    }
  },

  /**
   * Complete active or paused campaign
   * POST /campaigns/:id/complete
   * 
   * Path Params:
   * - id: Campaign ID
   * 
   * Returns: 200 with completed campaign
   * Throws: 403 if not owner, 404 if not found, 400 if not active/paused
   */
  async complete(req, res, next) {
    try {
      const { id } = req.params;
      const userId = req.user?.id;

      // Verify userId is present
      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized: User ID is required',
        });
      }

      // Call service to complete campaign
      const campaign = await CampaignService.completeCampaign(id, userId);

      // Return 200 with campaign
      res.status(200).json({
        success: true,
        message: 'Campaign completed successfully',
        data: campaign,
      });
    } catch (error) {
      winstonLogger.error('Campaign complete handler error', {
        error: error.message,
        campaignId: req.params.id,
        userId: req.user?.id,
        stack: error.stack,
      });

      // Handle validation errors (400)
      if (error.statusCode === 400) {
        return res.status(400).json({
          success: false,
          message: error.message,
        });
      }

      // Handle forbidden - not owner (403)
      if (error.statusCode === 403) {
        return res.status(403).json({
          success: false,
          message: error.message,
        });
      }

      // Handle not found (404)
      if (error.statusCode === 404) {
        return res.status(404).json({
          success: false,
          message: error.message,
        });
      }

      res.status(error.statusCode || 500).json({
        success: false,
        message: error.message || 'Failed to complete campaign',
      });
    }
  },

  /**
   * Unpause a paused campaign
   * POST /campaigns/:id/unpause
   * 
   * Path Params:
   * - id: Campaign ID
   * 
   * Returns: 200 with unpaused campaign
   * Throws: 403 if not owner, 404 if not found, 400 if not paused
   */
  async unpause(req, res, next) {
    try {
      const { id } = req.params;
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized: User ID is required',
        });
      }

      const campaign = await CampaignService.unpauseCampaign(id, userId);

      res.status(200).json({
        success: true,
        message: 'Campaign unpaused successfully',
        data: campaign,
      });
    } catch (error) {
      winstonLogger.error('Campaign unpause handler error', {
        error: error.message,
        campaignId: req.params.id,
        userId: req.user?.id,
        stack: error.stack,
      });

      if (error.statusCode === 400) {
        return res.status(400).json({
          success: false,
          message: error.message,
        });
      }

      if (error.statusCode === 403) {
        return res.status(403).json({
          success: false,
          message: error.message,
        });
      }

      if (error.statusCode === 404) {
        return res.status(404).json({
          success: false,
          message: error.message,
        });
      }

      res.status(error.statusCode || 500).json({
        success: false,
        message: error.message || 'Failed to unpause campaign',
      });
    }
  },

  /**
   * Increase campaign goal (fundraising campaigns only)
   * POST /campaigns/:id/increase-goal
   * 
   * Path Params:
   * - id: Campaign ID
   * 
   * Body: { newGoalAmount: number (in dollars) }
   * Returns: 200 with updated campaign
   * Throws: 403 if not owner, 404 if not found, 400 if not fundraising or goal not higher
   */
  async increaseGoal(req, res, next) {
    try {
      const { id } = req.params;
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized: User ID is required',
        });
      }

      const { newGoalAmount } = req.body;

      if (!newGoalAmount || typeof newGoalAmount !== 'number') {
        return res.status(400).json({
          success: false,
          message: 'Invalid request: newGoalAmount is required and must be a number',
        });
      }

      const campaign = await CampaignService.increaseGoal(id, userId, { newGoalAmount });

      res.status(200).json({
        success: true,
        message: 'Campaign goal increased successfully',
        data: campaign,
      });
    } catch (error) {
      winstonLogger.error('Campaign increase goal handler error', {
        error: error.message,
        campaignId: req.params.id,
        userId: req.user?.id,
        stack: error.stack,
      });

      if (error.statusCode === 400) {
        return res.status(400).json({
          success: false,
          message: error.message,
        });
      }

      if (error.statusCode === 403) {
        return res.status(403).json({
          success: false,
          message: error.message,
        });
      }

      if (error.statusCode === 404) {
        return res.status(404).json({
          success: false,
          message: error.message,
        });
      }

      res.status(error.statusCode || 500).json({
        success: false,
        message: error.message || 'Failed to increase campaign goal',
      });
    }
  },

  /**
   * Get campaign statistics
   * GET /campaigns/:id/stats
   * 
   * Path Params:
   * - id: Campaign ID
   * 
   * Returns: 200 with campaign statistics
   */
  async getStats(req, res, next) {
    try {
      const { id } = req.params;
      const userId = req.user?.id;

      const stats = await CampaignService.getCampaignStats(id, userId);

      res.status(200).json({
        success: true,
        message: 'Campaign statistics retrieved successfully',
        data: stats,
      });
    } catch (error) {
      winstonLogger.error('Campaign stats handler error', {
        error: error.message,
        campaignId: req.params.id,
        userId: req.user?.id,
        stack: error.stack,
      });

      if (error.statusCode === 404) {
        return res.status(404).json({
          success: false,
          message: error.message,
        });
      }

      res.status(error.statusCode || 500).json({
        success: false,
        message: error.message || 'Failed to retrieve campaign statistics',
      });
    }
  },

  /**
   * Get campaign contributors
   * GET /campaigns/:id/contributors?page=1&limit=10
   * 
   * Path Params:
   * - id: Campaign ID
   * 
   * Query Params:
   * - page: Page number (default 1)
   * - limit: Items per page (default 10, max 100)
   * 
   * Returns: 200 with contributors list
   */
  async getContributors(req, res, next) {
    try {
      const { id } = req.params;
      const page = Math.max(1, parseInt(req.query.page) || 1);
      const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 10));

      const result = await CampaignService.getCampaignContributors(id, { page, limit });

      res.status(200).json({
        success: true,
        message: 'Campaign contributors retrieved successfully',
        data: result.contributors,
        pagination: {
          page,
          limit,
          total: result.total,
        },
      });
    } catch (error) {
      winstonLogger.error('Campaign contributors handler error', {
        error: error.message,
        campaignId: req.params.id,
        stack: error.stack,
      });

      if (error.statusCode === 404) {
        return res.status(404).json({
          success: false,
          message: error.message,
        });
      }

      res.status(error.statusCode || 500).json({
        success: false,
        message: error.message || 'Failed to retrieve campaign contributors',
      });
    }
  },

  /**
   * Get campaign activists
   * GET /campaigns/:id/activists?page=1&limit=10
   * 
   * Path Params:
   * - id: Campaign ID
   * 
   * Query Params:
   * - page: Page number (default 1)
   * - limit: Items per page (default 10, max 100)
   * 
   * Returns: 200 with activists list
   */
  async getActivists(req, res, next) {
    try {
      const { id } = req.params;
      const page = Math.max(1, parseInt(req.query.page) || 1);
      const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 10));

      const result = await CampaignService.getCampaignActivists(id, { page, limit });

      res.status(200).json({
        success: true,
        message: 'Campaign activists retrieved successfully',
        data: result.activists,
        pagination: {
          page,
          limit,
          total: result.total,
        },
      });
    } catch (error) {
      winstonLogger.error('Campaign activists handler error', {
        error: error.message,
        campaignId: req.params.id,
        stack: error.stack,
      });

      if (error.statusCode === 404) {
        return res.status(404).json({
          success: false,
          message: error.message,
        });
      }

      res.status(error.statusCode || 500).json({
        success: false,
        message: error.message || 'Failed to retrieve campaign activists',
      });
    }
  },

  /**
   * Get trending campaigns
   * GET /campaigns/trending?limit=10&timeframe=7days
   * 
   * Query Params:
   * - limit: Number of campaigns (default 10, max 50)
   * - timeframe: Time period (1day, 7days, 30days, all - default 7days)
   * 
   * Returns: 200 with trending campaigns
   */
  async getTrending(req, res, next) {
    try {
      const limit = Math.min(parseInt(req.query.limit) || 10, 50);
      const timeframe = req.query.timeframe || '7days';

      const campaigns = await CampaignService.getTrendingCampaigns({ limit, timeframe });

      res.status(200).json({
        success: true,
        message: 'Trending campaigns retrieved successfully',
        data: campaigns,
      });
    } catch (error) {
      winstonLogger.error('Trending campaigns handler error', {
        error: error.message,
        query: req.query,
        stack: error.stack,
      });

      res.status(error.statusCode || 500).json({
        success: false,
        message: error.message || 'Failed to retrieve trending campaigns',
      });
    }
  },

  /**
   * Get related campaigns
   * GET /campaigns/:id/related?limit=10
   * 
   * Path Params:
   * - id: Campaign ID
   * 
   * Query Params:
   * - limit: Number of related campaigns (default 10, max 50)
   * 
   * Returns: 200 with related campaigns
   */
  async getRelated(req, res, next) {
    try {
      const { id } = req.params;
      const limit = Math.min(parseInt(req.query.limit) || 10, 50);

      const campaigns = await CampaignService.getRelatedCampaigns(id, { limit });

      res.status(200).json({
        success: true,
        message: 'Related campaigns retrieved successfully',
        data: campaigns,
      });
    } catch (error) {
      winstonLogger.error('Related campaigns handler error', {
        error: error.message,
        campaignId: req.params.id,
        stack: error.stack,
      });

      if (error.statusCode === 404) {
        return res.status(404).json({
          success: false,
          message: error.message,
        });
      }

      res.status(error.statusCode || 500).json({
        success: false,
        message: error.message || 'Failed to retrieve related campaigns',
      });
    }
  },

  /**
   * Get campaign need types (taxonomy)
   * GET /campaigns/need-types
   * 
   * Returns: 200 with array of need type categories
   */
  getNeedTypes(req, res) {
    try {
      const needTypes = CampaignService.getNeedTypes();

      res.status(200).json({
        success: true,
        message: 'Campaign need types retrieved successfully',
        data: needTypes,
      });
    } catch (error) {
      winstonLogger.error('Need types handler error', {
        error: error.message,
        stack: error.stack,
      });

      res.status(error.statusCode || 500).json({
        success: false,
        message: error.message || 'Failed to retrieve need types',
      });
    }
  },

  /**
   * Get campaign analytics
   * GET /campaigns/:id/analytics
   * 
   * Returns detailed analytics including donations, shares, views, engagement
   * Response: 200 with comprehensive analytics object
   * Throws: 404 if campaign not found
   */
  async getAnalytics(req, res, next) {
    try {
      const { id } = req.params;
      const startTime = Date.now();
      
      console.log('\n📊 [Backend] Analytics Request Started', {
        campaignId: id,
        timestamp: new Date().toISOString(),
        method: req.method,
        path: req.path,
      });

      const CampaignAnalyticsService = require('../services/CampaignAnalyticsService');

      // Log service call initiation
      console.log('🔄 [Backend] Fetching analytics from service', {
        campaignId: id,
        service: 'CampaignAnalyticsService.getCampaignAnalytics',
      });

      // Get comprehensive analytics
      const analytics = await CampaignAnalyticsService.getCampaignAnalytics(id);

      const elapsedTime = Date.now() - startTime;

      // Log successful response preparation
      console.log('✅ [Backend] Analytics data retrieved successfully', {
        campaignId: id,
        analyticsKeys: Object.keys(analytics || {}),
        totalDonations: analytics?.totalDonations || 0,
        totalRaised: analytics?.totalRaised || 0,
        uniqueDonors: analytics?.uniqueDonors || 0,
        totalShares: analytics?.totalShares || 0,
        donationsByDatePoints: analytics?.donationsByDate?.length || 0,
        shareChannels: Object.keys(analytics?.sharesByChannel || {}).length,
        lastUpdated: analytics?.lastUpdated,
        elapsedTime: `${elapsedTime}ms`,
      });

      res.status(200).json({
        success: true,
        message: 'Campaign analytics retrieved successfully',
        data: analytics,
      });

      // Log response sent
      console.log('📤 [Backend] Analytics response sent', {
        campaignId: id,
        statusCode: 200,
        responseSize: JSON.stringify(analytics || {}).length,
        elapsedTime: `${elapsedTime}ms`,
      });
    } catch (error) {
      const elapsedTime = Date.now() - Date.now();

      console.error('❌ [Backend] Analytics request failed', {
        campaignId: req.params.id,
        error: error.message,
        errorType: error.name,
        stack: error.stack,
        elapsedTime: `${elapsedTime}ms`,
      });

      winstonLogger.error('Campaign analytics handler error', {
        error: error.message,
        campaignId: req.params.id,
        stack: error.stack,
      });

      if (error.message.includes('not found')) {
        console.warn('⚠️ [Backend] Campaign not found for analytics', {
          campaignId: req.params.id,
        });
        return res.status(404).json({
          success: false,
          message: 'Campaign not found',
        });
      }

      res.status(error.statusCode || 500).json({
        success: false,
        message: error.message || 'Failed to retrieve campaign analytics',
      });
    }
  },

  /**
   * Get user's own campaigns
   * GET /campaigns/my-campaigns
   * Query: page (default 1), limit (default 10), sort (default 'date-desc')
   * 
   * Returns campaigns created by authenticated user
   * Auth: Required
   */
  async getUserCampaigns(req, res, next) {
    try {
      const userId = req.user?.id;
      
      winstonLogger.info('📥 getUserCampaigns: Request received', {
        userId,
        query: req.query,
        hasUser: !!req.user,
      });
      
      if (!userId) {
        winstonLogger.warn('❌ getUserCampaigns: Missing userId', {
          reqUser: req.user,
        });
        return res.status(401).json({
          success: false,
          message: 'Unauthorized: User ID is required',
        });
      }

      const page = Math.max(1, parseInt(req.query.page) || 1);
      const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 10));
      const sort = req.query.sort || 'date-desc';

      winstonLogger.info('📋 getUserCampaigns: Calling service', {
        userId,
        page,
        limit,
        sort,
      });

      // Call service to get user's campaigns
      const result = await CampaignService.getUserCampaigns(userId, {
        page,
        limit,
        sort,
      });

      winstonLogger.info('✅ getUserCampaigns: Service returned', {
        userId,
        campaignCount: result.campaigns?.length || 0,
        total: result.pagination?.total || 0,
      });

      res.status(200).json({
        success: true,
        message: 'User campaigns retrieved successfully',
        campaigns: result.campaigns,
        total: result.pagination?.total,
        pages: Math.ceil((result.pagination?.total || 0) / limit),
        pagination: result.pagination,
      });
    } catch (error) {
      winstonLogger.error('❌ Get user campaigns handler error', {
        error: error.message,
        userId: req.user?.id,
        stack: error.stack,
      });

      res.status(error.statusCode || 500).json({
        success: false,
        message: error.message || 'Failed to retrieve user campaigns',
      });
    }
  },

  /**
   * Get user's aggregated campaign statistics
   * GET /campaigns/my-stats
   * 
   * Returns aggregated stats for all campaigns created by user
   * Auth: Required
   */
  async getUserStats(req, res, next) {
    try {
      const userId = req.user?.id;
      
      winstonLogger.info('📥 getUserStats: Request received', {
        userId,
        hasUser: !!req.user,
        userKeys: req.user ? Object.keys(req.user) : [],
      });
      
      if (!userId) {
        winstonLogger.warn('❌ getUserStats: Missing userId', {
          reqUser: req.user,
        });
        return res.status(401).json({
          success: false,
          message: 'Unauthorized: User ID is required',
        });
      }

      winstonLogger.info('📋 getUserStats: Calling service', {
        userId,
      });

      // Call service to get user's aggregated stats
      const stats = await CampaignService.getUserStats(userId);

      winstonLogger.info('✅ getUserStats: Service returned', {
        userId,
        statsKeys: Object.keys(stats),
        totalCampaigns: stats.totalCampaigns,
        stats,
      });

      res.status(200).json({
        success: true,
        message: 'User campaign statistics retrieved successfully',
        data: stats,
      });
    } catch (error) {
      winstonLogger.error('Get user stats handler error', {
        error: error.message,
        userId: req.user?.id,
        stack: error.stack,
      });

      res.status(error.statusCode || 500).json({
        success: false,
        message: error.message || 'Failed to retrieve user statistics',
      });
    }
  },

  /**
   * GET /campaigns/:id/share-earnings
   * Get share earnings for a specific campaign (Feature 9)
   * Returns earnings breakdown by platform and verification status
   * 
   * Path Params:
   *   - id: Campaign ID
   * 
   * Query Params:
   *   - campaignId: (optional, alternative to path param) Campaign ID
   * 
   * Response: 200 OK
   * {
   *   success: true,
   *   data: {
   *     campaignId: string,
   *     totalEarningsCents: number,
   *     totalEarningsDollars: number,
   *     pendingEarningsCents: number,
   *     pendingEarningsDollars: number,
   *     verifiedEarningsCents: number,
   *     verifiedEarningsDollars: number,
   *     totalShares: number,
   *     verifiedShares: number,
   *     pendingShares: number,
   *     rejectedShares: number,
   *     earningsByPlatform: {
   *       [platform]: {
   *         shares: number,
   *         earningsCents: number,
   *         earningsDollars: number
   *       }
   *     },
   *     estimatedMonthlyEarnings: {
   *       earningsCents: number,
   *       earningsDollars: number,
   *       shareCount: number
   *     }
   *   }
   * }
   * 
   * Auth: Not required (public data)
   */
  async getCampaignShareEarnings(req, res) {
    try {
      const campaignId = req.params.id || req.query.campaignId;

      if (!campaignId) {
        return res.status(400).json({
          success: false,
          message: 'Campaign ID is required',
        });
      }

      winstonLogger.info('📊 getCampaignShareEarnings: Fetching earnings for campaign', {
        campaignId,
      });

      // Query shares grouped by status and platform
      const Share = require('../models/Share');
      const shareEarnings = await Share.aggregate([
        {
          $match: {
            campaign_id: require('mongoose').Types.ObjectId.isValid(campaignId)
              ? require('mongoose').Types.ObjectId(campaignId)
              : campaignId,
            is_paid: true, // Only paid shares
          },
        },
        {
          $facet: {
            // Total earnings by status
            byStatus: [
              {
                $group: {
                  _id: '$status',
                  count: { $sum: 1 },
                  earnings: { $sum: '$reward_amount' },
                },
              },
            ],
            // Earnings by platform
            byPlatform: [
              {
                $group: {
                  _id: '$channel',
                  count: { $sum: 1 },
                  earnings: { $sum: '$reward_amount' },
                },
              },
            ],
            // Overall stats
            totalStats: [
              {
                $group: {
                  _id: null,
                  total_shares: { $sum: 1 },
                  total_earnings: { $sum: '$reward_amount' },
                },
              },
            ],
          },
        },
      ]);

      const earnings = shareEarnings[0];

      // Calculate breakdowns
      const byStatusMap = {};
      const byPlatformMap = {};
      let totalEarnings = 0;
      let totalShares = 0;

      // Process by status
      earnings.byStatus.forEach((item) => {
        byStatusMap[item._id] = {
          count: item.count,
          earnings: item.earnings,
        };
        totalEarnings += item.earnings;
        totalShares += item.count;
      });

      // Process by platform
      earnings.byPlatform.forEach((item) => {
        byPlatformMap[item._id] = {
          shares: item.count,
          earningsCents: item.earnings,
          earningsDollars: (item.earnings / 100).toFixed(2),
        };
      });

      // Estimate monthly based on recent velocity (last 30 days)
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const recentShares = await Share.countDocuments({
        campaign_id: require('mongoose').Types.ObjectId.isValid(campaignId)
          ? require('mongoose').Types.ObjectId(campaignId)
          : campaignId,
        is_paid: true,
        created_at: { $gte: thirtyDaysAgo },
      });

      // Get average reward per share
      const avgRewardPerShare = totalShares > 0 ? totalEarnings / totalShares : 0;
      const estimatedMonthlyEarnings =
        recentShares > 0
          ? Math.round((recentShares / 30) * avgRewardPerShare * 30)
          : totalEarnings;

      res.status(200).json({
        success: true,
        data: {
          campaignId: campaignId.toString(),
          totalEarningsCents: totalEarnings,
          totalEarningsDollars: (totalEarnings / 100).toFixed(2),
          pendingEarningsCents: byStatusMap.pending_verification?.earnings || 0,
          pendingEarningsDollars: (
            (byStatusMap.pending_verification?.earnings || 0) / 100
          ).toFixed(2),
          verifiedEarningsCents: byStatusMap.verified?.earnings || 0,
          verifiedEarningsDollars: (
            (byStatusMap.verified?.earnings || 0) / 100
          ).toFixed(2),
          totalShares: totalShares,
          verifiedShares: byStatusMap.verified?.count || 0,
          pendingShares: byStatusMap.pending_verification?.count || 0,
          rejectedShares: byStatusMap.rejected?.count || 0,
          earningsByPlatform: byPlatformMap,
          estimatedMonthlyEarnings: {
            earningsCents: estimatedMonthlyEarnings,
            earningsDollars: (estimatedMonthlyEarnings / 100).toFixed(2),
            shareCount: recentShares,
          },
        },
      });
    } catch (error) {
      winstonLogger.error('getCampaignShareEarnings error', {
        campaignId: req.params.id,
        error: error.message,
        stack: error.stack,
      });

      res.status(500).json({
        success: false,
        message: 'Failed to retrieve campaign share earnings',
        error: error.message,
      });
    }
  },

  /**
   * GET /campaigns/:id/share-earning-potential
   * Get earning opportunity for a sharing campaign (Feature 9)
   * Shows remaining budget, reward per share, max possible earnings
   * 
   * Path Params:
   *   - id: Campaign ID (sharing campaign)
   * 
   * Response: 200 OK
   * {
   *   success: true,
   *   data: {
   *     campaignId: string,
   *     rewardPerShareCents: number,
   *     rewardPerShareDollars: number,
   *     totalBudgetCents: number,
   *     totalBudgetDollars: number,
   *     remainingBudgetCents: number,
   *     remainingBudgetDollars: number,
   *     maxPossibleShares: number,
   *     alreadyRewarded: number,
   *     sharesRemaining: number
   *   }
   * }
   * 
   * Auth: Not required
   * Errors:
   *   - 404: Campaign not found
   *   - 409: Campaign is not a sharing campaign
   */
  async getCampaignShareEarningPotential(req, res) {
    try {
      const campaignId = req.params.id || req.query.campaignId;

      if (!campaignId) {
        return res.status(400).json({
          success: false,
          message: 'Campaign ID is required',
        });
      }

      winstonLogger.info('💰 getCampaignShareEarningPotential: Fetching earning potential', {
        campaignId,
      });

      const Campaign = require('../models/Campaign');
      const Share = require('../models/Share');
      const mongoose = require('mongoose');

      const campaign = await Campaign.findOne({
        $or: [
          { _id: mongoose.Types.ObjectId.isValid(campaignId) ? campaignId : null },
          { campaign_id: campaignId },
        ],
      });

      if (!campaign) {
        return res.status(404).json({
          success: false,
          message: 'Campaign not found',
        });
      }

      if (campaign.campaign_type !== 'sharing') {
        return res.status(409).json({
          success: false,
          message: 'Campaign is not a sharing campaign',
        });
      }

      // Get share config
      const shareConfig = campaign.share_config || {};
      const totalBudgetCents = shareConfig.total_budget || 0;
      const rewardPerShareCents = shareConfig.amount_per_share || 0;

      // Count already rewarded shares
      const alreadyRewarded = await Share.countDocuments({
        campaign_id: campaign._id,
        is_paid: true,
        status: { $in: ['verified', 'completed'] },
      });

      // Calculate remaining
      const spentCents = alreadyRewarded * rewardPerShareCents;
      const remainingBudgetCents = Math.max(0, totalBudgetCents - spentCents);
      const maxPossibleShares =
        rewardPerShareCents > 0
          ? Math.floor(totalBudgetCents / rewardPerShareCents)
          : 0;
      const sharesRemaining = Math.max(0, maxPossibleShares - alreadyRewarded);

      res.status(200).json({
        success: true,
        data: {
          campaignId: campaign._id.toString(),
          rewardPerShareCents: rewardPerShareCents,
          rewardPerShareDollars: (rewardPerShareCents / 100).toFixed(2),
          totalBudgetCents: totalBudgetCents,
          totalBudgetDollars: (totalBudgetCents / 100).toFixed(2),
          remainingBudgetCents: remainingBudgetCents,
          remainingBudgetDollars: (remainingBudgetCents / 100).toFixed(2),
          maxPossibleShares: maxPossibleShares,
          alreadyRewarded: alreadyRewarded,
          sharesRemaining: sharesRemaining,
        },
      });
    } catch (error) {
      winstonLogger.error('getCampaignShareEarningPotential error', {
        campaignId: req.params.id,
        error: error.message,
        stack: error.stack,
      });

      res.status(500).json({
        success: false,
        message: 'Failed to retrieve campaign share earning potential',
        error: error.message,
      });
    }
  },

  /**
   * GET /campaigns/:id/share-leaderboard
   * Get top sharers for a specific campaign (Feature 9)
   * Shows who has earned the most from this campaign
   * 
   * Path Params:
   *   - id: Campaign ID (sharing campaign)
   * 
   * Query Params:
   *   - limit: number (default 10, max 100)
   *   - includeUnverified: boolean (default false, only show verified earnings)
   * 
   * Response: 200 OK
   * {
   *   success: true,
   *   data: {
   *     campaignId: string,
   *     campaignTitle: string,
   *     leaderboard: [
   *       {
   *         position: 1,
   *         supporterId: string,
   *         supporterName: string,
   *         totalShares: number,
   *         totalEarningsCents: number,
   *         totalEarningsDollars: string,
   *         topPlatform: string,
   *         profileImage: string
   *       }
   *     ]
   *   }
   * }
   * 
   * Auth: Not required
   */
  async getCampaignShareLeaderboard(req, res) {
    try {
      const campaignId = req.params.id || req.query.campaignId;
      const limit = Math.min(parseInt(req.query.limit) || 10, 100);
      const includeUnverified = req.query.includeUnverified === 'true';

      if (!campaignId) {
        return res.status(400).json({
          success: false,
          message: 'Campaign ID is required',
        });
      }

      winstonLogger.info('🏆 getCampaignShareLeaderboard: Fetching leaderboard', {
        campaignId,
        limit,
      });

      const Campaign = require('../models/Campaign');
      const Share = require('../models/Share');
      const mongoose = require('mongoose');

      const campaign = await Campaign.findOne({
        $or: [
          { _id: mongoose.Types.ObjectId.isValid(campaignId) ? campaignId : null },
          { campaign_id: campaignId },
        ],
      });

      if (!campaign) {
        return res.status(404).json({
          success: false,
          message: 'Campaign not found',
        });
      }

      // Get top sharers
      const statusFilter = includeUnverified
        ? { $in: ['verified', 'pending_verification', 'completed'] }
        : { $in: ['verified', 'completed'] };

      const leaderboard = await Share.aggregate([
        {
          $match: {
            campaign_id: mongoose.Types.ObjectId(campaign._id),
            is_paid: true,
            status: statusFilter,
          },
        },
        {
          $group: {
            _id: '$supporter_id',
            totalShares: { $sum: 1 },
            totalEarnings: { $sum: '$reward_amount' },
            topPlatform: { $first: '$channel' },
            platformBreakdown: {
              $push: {
                channel: '$channel',
                count: 1,
              },
            },
          },
        },
        {
          $sort: { totalEarnings: -1 },
        },
        {
          $limit: limit,
        },
        {
          $lookup: {
            from: 'users',
            localField: '_id',
            foreignField: '_id',
            as: 'supporter',
          },
        },
        {
          $unwind: {
            path: '$supporter',
            preserveNullAndEmptyArrays: true,
          },
        },
        {
          $project: {
            _id: 0,
            supporterId: '$_id',
            supporterName: { $ifNull: ['$supporter.name', 'Anonymous'] },
            profileImage: { $ifNull: ['$supporter.profile_image_url', null] },
            totalShares: 1,
            totalEarnings: 1,
            topPlatform: 1,
          },
        },
      ]);

      // Add position
      const leaderboardWithPosition = leaderboard.map((item, index) => ({
        position: index + 1,
        ...item,
        totalEarningsCents: item.totalEarnings,
        totalEarningsDollars: (item.totalEarnings / 100).toFixed(2),
        totalEarnings: undefined, // Remove the cents version
      }));

      res.status(200).json({
        success: true,
        data: {
          campaignId: campaign._id.toString(),
          campaignTitle: campaign.title,
          leaderboard: leaderboardWithPosition,
        },
      });
    } catch (error) {
      winstonLogger.error('getCampaignShareLeaderboard error', {
        campaignId: req.params.id,
        error: error.message,
        stack: error.stack,
      });

      res.status(500).json({
        success: false,
        message: 'Failed to retrieve campaign share leaderboard',
        error: error.message,
      });
    }
  },

  /**
   * Batch Pause Campaigns
   * POST /campaigns/batch/pause
   * 
   * Body: { campaignIds: [string] }
   * Returns: 200 with { success: true, updated: number, failed: number, results: [...] }
   */
  async batchPauseCampaigns(req, res, next) {
    try {
      const { campaignIds } = req.body;
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized: User ID is required',
        });
      }

      if (!Array.isArray(campaignIds) || campaignIds.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'campaignIds must be a non-empty array',
        });
      }

      if (campaignIds.length > 100) {
        return res.status(400).json({
          success: false,
          message: 'Cannot process more than 100 campaigns at once',
        });
      }

      const results = [];
      let successful = 0;

      for (const campaignId of campaignIds) {
        try {
          const campaign = await CampaignService.pauseCampaign(campaignId, userId);
          successful++;
          results.push({
            campaignId,
            success: true,
            status: campaign.status,
          });
        } catch (error) {
          results.push({
            campaignId,
            success: false,
            error: error.message,
          });
        }
      }

      winstonLogger.info('Batch pause campaigns completed', {
        userId,
        totalRequested: campaignIds.length,
        successful,
        failed: campaignIds.length - successful,
      });

      res.status(200).json({
        success: true,
        updated: successful,
        failed: campaignIds.length - successful,
        results,
      });
    } catch (error) {
      winstonLogger.error('Batch pause campaigns error', {
        error: error.message,
        userId: req.user?.id,
        stack: error.stack,
      });

      res.status(500).json({
        success: false,
        message: error.message || 'Failed to pause campaigns',
      });
    }
  },

  /**
   * Batch Resume (Unpause) Campaigns
   * POST /campaigns/batch/resume
   * 
   * Body: { campaignIds: [string] }
   * Returns: 200 with { success: true, updated: number, failed: number, results: [...] }
   */
  async batchResumeCampaigns(req, res, next) {
    try {
      const { campaignIds } = req.body;
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized: User ID is required',
        });
      }

      if (!Array.isArray(campaignIds) || campaignIds.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'campaignIds must be a non-empty array',
        });
      }

      if (campaignIds.length > 100) {
        return res.status(400).json({
          success: false,
          message: 'Cannot process more than 100 campaigns at once',
        });
      }

      const results = [];
      let successful = 0;

      for (const campaignId of campaignIds) {
        try {
          const campaign = await CampaignService.unpauseCampaign(campaignId, userId);
          successful++;
          results.push({
            campaignId,
            success: true,
            status: campaign.status,
          });
        } catch (error) {
          results.push({
            campaignId,
            success: false,
            error: error.message,
          });
        }
      }

      winstonLogger.info('Batch resume campaigns completed', {
        userId,
        totalRequested: campaignIds.length,
        successful,
        failed: campaignIds.length - successful,
      });

      res.status(200).json({
        success: true,
        updated: successful,
        failed: campaignIds.length - successful,
        results,
      });
    } catch (error) {
      winstonLogger.error('Batch resume campaigns error', {
        error: error.message,
        userId: req.user?.id,
        stack: error.stack,
      });

      res.status(500).json({
        success: false,
        message: error.message || 'Failed to resume campaigns',
      });
    }
  },

  /**
   * Batch Complete Campaigns
   * POST /campaigns/batch/complete
   * 
   * Body: { campaignIds: [string] }
   * Returns: 200 with { success: true, updated: number, failed: number, results: [...] }
   */
  async batchCompleteCampaigns(req, res, next) {
    try {
      const { campaignIds } = req.body;
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized: User ID is required',
        });
      }

      if (!Array.isArray(campaignIds) || campaignIds.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'campaignIds must be a non-empty array',
        });
      }

      if (campaignIds.length > 100) {
        return res.status(400).json({
          success: false,
          message: 'Cannot process more than 100 campaigns at once',
        });
      }

      const results = [];
      let successful = 0;

      for (const campaignId of campaignIds) {
        try {
          const campaign = await CampaignService.completeCampaign(campaignId, userId);
          successful++;
          results.push({
            campaignId,
            success: true,
            status: campaign.status,
          });
        } catch (error) {
          results.push({
            campaignId,
            success: false,
            error: error.message,
          });
        }
      }

      winstonLogger.info('Batch complete campaigns completed', {
        userId,
        totalRequested: campaignIds.length,
        successful,
        failed: campaignIds.length - successful,
      });

      res.status(200).json({
        success: true,
        updated: successful,
        failed: campaignIds.length - successful,
        results,
      });
    } catch (error) {
      winstonLogger.error('Batch complete campaigns error', {
        error: error.message,
        userId: req.user?.id,
        stack: error.stack,
      });

      res.status(500).json({
        success: false,
        message: error.message || 'Failed to complete campaigns',
      });
    }
  },

  /**
   * Batch Activate (Publish) Campaigns
   * POST /campaigns/batch/activate
   * 
   * Body: { campaignIds: [string] }
   * Returns: 200 with { success: true, updated: number, failed: number, results: [...] }
   */
  async batchActivateCampaigns(req, res, next) {
    try {
      const { campaignIds } = req.body;
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized: User ID is required',
        });
      }

      if (!Array.isArray(campaignIds) || campaignIds.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'campaignIds must be a non-empty array',
        });
      }

      if (campaignIds.length > 100) {
        return res.status(400).json({
          success: false,
          message: 'Cannot process more than 100 campaigns at once',
        });
      }

      const results = [];
      let successful = 0;

      for (const campaignId of campaignIds) {
        try {
          const campaign = await CampaignService.publishCampaign(campaignId, userId);
          successful++;
          results.push({
            campaignId,
            success: true,
            status: campaign.status,
          });
        } catch (error) {
          results.push({
            campaignId,
            success: false,
            error: error.message,
          });
        }
      }

      winstonLogger.info('Batch activate campaigns completed', {
        userId,
        totalRequested: campaignIds.length,
        successful,
        failed: campaignIds.length - successful,
      });

      res.status(200).json({
        success: true,
        updated: successful,
        failed: campaignIds.length - successful,
        results,
      });
    } catch (error) {
      winstonLogger.error('Batch activate campaigns error', {
        error: error.message,
        userId: req.user?.id,
        stack: error.stack,
      });

      res.status(500).json({
        success: false,
        message: error.message || 'Failed to activate campaigns',
      });
    }
  },

  /**
   * Batch Delete Campaigns
   * POST /campaigns/batch/delete
   * 
   * Body: { campaignIds: [string] }
   * Returns: 200 with { success: true, updated: number, failed: number, results: [...] }
   * Note: Soft delete - sets is_deleted=true, only draft campaigns can be deleted
   */
  async batchDeleteCampaigns(req, res, next) {
    try {
      const { campaignIds } = req.body;
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized: User ID is required',
        });
      }

      if (!Array.isArray(campaignIds) || campaignIds.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'campaignIds must be a non-empty array',
        });
      }

      if (campaignIds.length > 100) {
        return res.status(400).json({
          success: false,
          message: 'Cannot process more than 100 campaigns at once',
        });
      }

      const results = [];
      let successful = 0;

      for (const campaignId of campaignIds) {
        try {
          await CampaignService.deleteCampaign(campaignId, userId);
          successful++;
          results.push({
            campaignId,
            success: true,
          });
        } catch (error) {
          results.push({
            campaignId,
            success: false,
            error: error.message,
          });
        }
      }

      winstonLogger.info('Batch delete campaigns completed', {
        userId,
        totalRequested: campaignIds.length,
        successful,
        failed: campaignIds.length - successful,
      });

      res.status(200).json({
        success: true,
        updated: successful,
        failed: campaignIds.length - successful,
        results,
      });
    } catch (error) {
      winstonLogger.error('Batch delete campaigns error', {
        error: error.message,
        userId: req.user?.id,
        stack: error.stack,
      });

      res.status(500).json({
        success: false,
        message: error.message || 'Failed to delete campaigns',
      });
    }
  },

  /**
   * Get QR code analytics for a campaign
   * GET /campaigns/:id/qr-analytics
   *
   * Returns aggregated QR scan analytics for all QR codes in the campaign
   * Response: 200 with QR analytics object
   * Throws: 404 if campaign not found
   */
  async getQRAnalytics(req, res, next) {
    try {
      const { id } = req.params;
      const mongoose = require('mongoose');

      winstonLogger.info('📊 getQRAnalytics: Request received', {
        campaignId: id,
      });

      const QRCode = require('../models/QRCode');
      const Campaign = require('../models/Campaign');

      // Verify campaign exists
      const campaign = await Campaign.findById(id);
      if (!campaign) {
        return res.status(404).json({
          success: false,
          message: 'Campaign not found',
        });
      }

      // Aggregate QR scan data for this campaign
      const qrStats = await QRCode.aggregate([
        {
          $match: {
            campaign_id: new mongoose.Types.ObjectId(id),
            status: 'active',
          },
        },
        {
          $group: {
            _id: null,
            totalScans: { $sum: '$total_scans' },
            totalConversions: { $sum: '$total_conversions' },
            qrCodesCount: { $sum: 1 },
            scansByLocation: {
              $push: {
                $map: {
                  input: '$scans',
                  as: 'scan',
                  in: '$$scan.location',
                },
              },
            },
          },
        },
      ]);

      // Calculate location breakdown
      const locationCounts = {};
      if (qrStats.length > 0 && qrStats[0].scansByLocation) {
        qrStats[0].scansByLocation.flat().forEach((location) => {
          if (location) {
            locationCounts[location] = (locationCounts[location] || 0) + 1;
          }
        });
      }

      // Find top location
      let topLocation = null;
      if (Object.keys(locationCounts).length > 0) {
        const topLocationName = Object.keys(locationCounts).reduce((a, b) =>
          locationCounts[a] > locationCounts[b] ? a : b
        );
        topLocation = {
          name: topLocationName,
          scans: locationCounts[topLocationName],
        };
      }

      // Calculate weekly/monthly stats (simplified - last 7/30 days)
      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

      const weeklyStats = await QRCode.aggregate([
        {
          $match: {
            campaign_id: new mongoose.Types.ObjectId(id),
            status: 'active',
          },
        },
        {
          $unwind: '$scans',
        },
        {
          $match: {
            'scans.timestamp': { $gte: weekAgo },
          },
        },
        {
          $group: {
            _id: null,
            scansThisWeek: { $sum: 1 },
          },
        },
      ]);

      const monthlyStats = await QRCode.aggregate([
        {
          $match: {
            campaign_id: new mongoose.Types.ObjectId(id),
            status: 'active',
          },
        },
        {
          $unwind: '$scans',
        },
        {
          $match: {
            'scans.timestamp': { $gte: monthAgo },
          },
        },
        {
          $group: {
            _id: null,
            scansThisMonth: { $sum: 1 },
          },
        },
      ]);

      const stats = qrStats[0] || {
        totalScans: 0,
        totalConversions: 0,
        qrCodesCount: 0,
      };

      const analytics = {
        campaignId: id,
        totalScans: stats.totalScans || 0,
        scansByLocation: locationCounts,
        scansThisWeek: weeklyStats[0]?.scansThisWeek || 0,
        scansThisMonth: monthlyStats[0]?.scansThisMonth || 0,
        topLocation,
        lastScannedAt: stats.lastScannedAt,
      };

      winstonLogger.info('✅ getQRAnalytics: Analytics retrieved', {
        campaignId: id,
        totalScans: analytics.totalScans,
        topLocation: analytics.topLocation?.name,
      });

      res.status(200).json({
        success: true,
        message: 'QR analytics retrieved successfully',
        data: analytics,
      });
    } catch (error) {
      winstonLogger.error('getQRAnalytics handler error', {
        error: error.message,
        campaignId: req.params.id,
        stack: error.stack,
      });

      if (error.statusCode === 404) {
        return res.status(404).json({
          success: false,
          message: error.message,
        });
      }

      res.status(error.statusCode || 500).json({
        success: false,
        message: error.message || 'Failed to retrieve QR analytics',
      });
    }
  },

  /**
   * Get store impressions for a campaign
   * GET /campaigns/:id/store-impressions
   *
   * Returns store-level impression data for campaign QR codes
   * Response: 200 with store impressions array
   * Throws: 404 if campaign not found
   */
  async getStoreImpressions(req, res, next) {
    try {
      const { id } = req.params;

      winstonLogger.info('🏪 getStoreImpressions: Request received', {
        campaignId: id,
      });

      const QRCode = require('../models/QRCode');
      const Campaign = require('../models/Campaign');

      // Verify campaign exists
      const campaign = await Campaign.findById(id);
      if (!campaign) {
        return res.status(404).json({
          success: false,
          message: 'Campaign not found',
        });
      }

      // For now, return mock data since we don't have a dedicated store impressions model
      // In a real implementation, this would aggregate from a StoreImpressions or similar model
      const mockImpressions = [
        // This is placeholder data - in production this would come from actual store tracking
      ];

      winstonLogger.info('✅ getStoreImpressions: Impressions retrieved', {
        campaignId: id,
        impressionCount: mockImpressions.length,
      });

      res.status(200).json({
        success: true,
        message: 'Store impressions retrieved successfully',
        data: mockImpressions,
      });
    } catch (error) {
      winstonLogger.error('getStoreImpressions handler error', {
        error: error.message,
        campaignId: req.params.id,
        stack: error.stack,
      });

      if (error.statusCode === 404) {
        return res.status(404).json({
          success: false,
          message: error.message,
        });
      }

      res.status(error.statusCode || 500).json({
        success: false,
        message: error.message || 'Failed to retrieve store impressions',
      });
    }
  },

};

module.exports = CampaignController;
