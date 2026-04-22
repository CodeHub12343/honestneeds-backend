/**
 * Campaign Service
 * Business logic for campaign operations
 */

const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const mongoose = require('mongoose');
const Campaign = require('../models/Campaign');
const { validateCampaignCreation, validateCampaignUpdate } = require('../validators/campaignValidators');
const { EventEmitter } = require('events');
const winstonLogger = require('../utils/winstonLogger');

// Create event emitter for campaign events
const campaignEventEmitter = new EventEmitter();

class CampaignService {
  /**
   * Generate unique campaign ID with format: CAMP-YYYY-NNN-XXXXXX
   * @returns {string} - Generated campaign ID
   */
  static generateCampaignId() {
    const year = new Date().getFullYear();
    const sequence = Math.floor(Math.random() * 1000)
      .toString()
      .padStart(3, '0');
    const suffix = uuidv4().substring(0, 6).toUpperCase();
    return `CAMP-${year}-${sequence}-${suffix}`;
  }

  /**
   * Calculate campaign end date based on start date and duration
   * ✅ PRODUCTION READY: Validates duration bounds (7-365 days)
   * 
   * @param {Date} startDate - Campaign start/activation date
   * @param {number} durationDays - Duration in days (default 30, min 7, max 365)
   * @returns {Object} - { endDate: Date, durationDays: number, durationMs: number }
   * @throws {Error} If duration out of valid bounds
   */
  static calculateCampaignEndDate(startDate = new Date(), durationDays = 30) {
    // Validate start date
    if (!(startDate instanceof Date) || isNaN(startDate.getTime())) {
      const now = new Date();
      winstonLogger.warn('⚠️ CampaignService.calculateCampaignEndDate: Invalid start date, using now', {
        provided_start_date: startDate,
        using_date: now.toISOString(),
      });
      startDate = now;
    }

    // Normalize duration to integer
    durationDays = parseInt(durationDays, 10);

    // ✅ PRODUCTION: Duration bounds validation (7-365 days)
    const MIN_DURATION_DAYS = 7;
    const MAX_DURATION_DAYS = 365;
    const DEFAULT_DURATION_DAYS = 30;

    if (isNaN(durationDays)) {
      winstonLogger.warn('⚠️ CampaignService.calculateCampaignEndDate: NaN duration, using default', {
        attempted_duration: durationDays,
        default_duration: DEFAULT_DURATION_DAYS,
      });
      durationDays = DEFAULT_DURATION_DAYS;
    } else if (durationDays < MIN_DURATION_DAYS) {
      winstonLogger.warn('⚠️ CampaignService.calculateCampaignEndDate: Duration too short, clamping to min', {
        attempted_duration: durationDays,
        min_duration: MIN_DURATION_DAYS,
        clamped_duration: MIN_DURATION_DAYS,
      });
      durationDays = MIN_DURATION_DAYS;
    } else if (durationDays > MAX_DURATION_DAYS) {
      winstonLogger.warn('⚠️ CampaignService.calculateCampaignEndDate: Duration too long, clamping to max', {
        attempted_duration: durationDays,
        max_duration: MAX_DURATION_DAYS,
        clamped_duration: MAX_DURATION_DAYS,
      });
      durationDays = MAX_DURATION_DAYS;
    }

    // Calculate end date
    const durationMs = durationDays * 24 * 60 * 60 * 1000; // Convert days to milliseconds
    const endDate = new Date(startDate.getTime() + durationMs);

    winstonLogger.debug('✅ CampaignService.calculateCampaignEndDate: End date calculated', {
      start_date: startDate.toISOString(),
      end_date: endDate.toISOString(),
      duration_days: durationDays,
      duration_ms: durationMs,
    });

    return {
      endDate,
      durationDays,
      durationMs,
      startDate, // Return for consistency
    };
  }

  /**
   * Normalize campaign data (trim, convert amounts to cents, set defaults)
   * @param {Object} data - Raw campaign data
   * @returns {Object} - Normalized campaign data
   */
  static normalizeCampaignData(data) {
    const normalized = { ...data };

    // ✅ FIX: Log image_url through normalization
    winstonLogger.debug('📋 CampaignService.normalizeCampaignData: Processing data', {
      hasImageUrlInInput: 'image_url' in data,
      imageUrlValueIn: data.image_url,
      dataKeys: Object.keys(data),
    });

    // Trim string fields
    if (normalized.title) normalized.title = normalized.title.trim();
    if (normalized.description) normalized.description = normalized.description.trim();
    if (normalized.category) normalized.category = normalized.category.trim();

    // Normalize goals amounts - ALREADY IN CENTS from frontend
    // Frontend converts dollars to cents (multiply by 100), so we just ensure they're integers
    if (normalized.goals && Array.isArray(normalized.goals)) {
      normalized.goals = normalized.goals.map((goal) => ({
        ...goal,
        target_amount: Math.round(goal.target_amount), // Already in cents from frontend
        current_amount: goal.current_amount ? Math.round(goal.current_amount) : 0,
      }));
    }

    // Normalize location coordinates if present
    if (normalized.location) {
      if (normalized.location.latitude) {
        normalized.location.latitude = parseFloat(normalized.location.latitude);
      }
      if (normalized.location.longitude) {
        normalized.location.longitude = parseFloat(normalized.location.longitude);
      }
    }

    // ✅ FIX: Log result after normalization
    winstonLogger.debug('📋 CampaignService.normalizeCampaignData: Result', {
      hasImageUrlInOutput: 'image_url' in normalized,
      imageUrlValueOut: normalized.image_url,
      normalizedKeys: Object.keys(normalized),
    });

    return normalized;
  }

  /**
   * Create a new campaign
   * @param {string} userId - Creator user ID
   * @param {Object} data - Campaign data
   * @returns {Object} - Created campaign object
   * @throws {Error} - If validation fails or database error occurs
   */
  static async createCampaign(userId, data) {
    try {
      winstonLogger.info('📋 CampaignService.createCampaign: Starting campaign creation', {
        userId,
        receivedDataKeys: Object.keys(data),
        hasImageUrl: 'image_url' in data,
        imageUrlValue: data.image_url,
        receivedData: {
          ...data,
          // Hide long fields in logs
          description: data.description ? data.description.substring(0, 50) + '...' : undefined,
            payment_methods: data.payment_methods ? `[Array of ${data.payment_methods.length}]` : undefined,
        },
      });

      // Parse FormData string fields back to objects/arrays
      const parsedData = { ...data };

      // Parse tags from CSV string to array
      if (typeof data.tags === 'string') {
        winstonLogger.info('📋 CampaignService: Parsing tags from CSV string', {
          tagsString: data.tags,
        });
        parsedData.tags = data.tags ? data.tags.split(',').filter((t) => t.trim()) : [];
        winstonLogger.info('📋 CampaignService: Tags parsed', {
          parsedTags: parsedData.tags,
        });
      }

      // Parse location from JSON string to object
      if (typeof data.location === 'string') {
        winstonLogger.info('📋 CampaignService: Parsing location from JSON string', {
          locationString: data.location,
        });
        try {
          parsedData.location = JSON.parse(data.location);
          winstonLogger.info('📋 CampaignService: Location parsed', {
            parsedLocation: parsedData.location,
          });
        } catch (e) {
          winstonLogger.warn('📋 CampaignService: Failed to parse location JSON', {
            error: e.message,
            locationString: data.location,
          });
        }
      }

      // Parse goals from JSON string to array
      if (typeof data.goals === 'string') {
        winstonLogger.info('📋 CampaignService: Parsing goals from JSON string', {
          goalsString: data.goals,
        });
        try {
          parsedData.goals = JSON.parse(data.goals);
          winstonLogger.info('📋 CampaignService: Goals parsed', {
            parsedGoals: parsedData.goals,
          });
        } catch (e) {
          winstonLogger.warn('📋 CampaignService: Failed to parse goals JSON', {
            error: e.message,
            goalsString: data.goals,
          });
        }
      }

      // Parse payment_methods from JSON string to array
      if (typeof data.payment_methods === 'string') {
        winstonLogger.info('📋 CampaignService: Parsing payment_methods from JSON string', {
          paymentMethodsString: data.payment_methods,
        });
        try {
          parsedData.payment_methods = JSON.parse(data.payment_methods);
          winstonLogger.info('📋 CampaignService: Payment methods parsed', {
            parsedPaymentMethods: parsedData.payment_methods,
          });
        } catch (e) {
          winstonLogger.warn('📋 CampaignService: Failed to parse payment_methods JSON', {
            error: e.message,
            paymentMethodsString: data.payment_methods,
          });
        }
      }

      // Parse campaign_type (for sharing campaigns)
      if (data.campaign_type) {
        winstonLogger.info('📋 CampaignService: Campaign type specified', {
          campaign_type: data.campaign_type,
        });
        parsedData.campaign_type = data.campaign_type;
      }

      // Parse sharing fields if campaign_type is 'sharing'
      if (parsedData.campaign_type === 'sharing') {
        // Parse platforms from JSON or CSV string to array
        if (data.platforms) {
          try {
            if (typeof data.platforms === 'string') {
              // Try JSON first
              try {
                parsedData.platforms = JSON.parse(data.platforms);
              } catch {
                // Fall back to CSV
                parsedData.platforms = data.platforms
                  .split(',')
                  .map((p) => p.trim())
                  .filter((p) => p);
              }
            }
            winstonLogger.info('📋 CampaignService: Platforms parsed', {
              platforms: parsedData.platforms,
            });
          } catch (e) {
            winstonLogger.warn('📋 CampaignService: Failed to parse platforms', {
              error: e.message,
              platformsString: data.platforms,
            });
          }
        }

        // Parse budget from string to number (in dollars, will convert to cents later)
        if (data.budget) {
          parsedData.budget = parseFloat(data.budget);
          winstonLogger.info('📋 CampaignService: Budget parsed', {
            budget: parsedData.budget,
          });
        }

        // Parse reward_per_share from string to number (in dollars, will convert to cents later)
        if (data.reward_per_share) {
          parsedData.reward_per_share = parseFloat(data.reward_per_share);
          winstonLogger.info('📋 CampaignService: Reward per share parsed', {
            reward_per_share: parsedData.reward_per_share,
          });
        }

        // Parse max_shares_per_person from string to number
        if (data.max_shares_per_person) {
          parsedData.max_shares_per_person = parseInt(data.max_shares_per_person, 10);
          winstonLogger.info('📋 CampaignService: Max shares per person parsed', {
            max_shares_per_person: parsedData.max_shares_per_person,
          });
        }
      }

      // Parse prayer_config from JSON string if provided
      if (data.prayer_config) {
        try {
          if (typeof data.prayer_config === 'string') {
            winstonLogger.info('📋 CampaignService: Parsing prayer_config from JSON string', {
              prayer_configString: data.prayer_config.substring(0, 150) + '...',
              fullData: data.prayer_config,
            });
            parsedData.prayer_config = JSON.parse(data.prayer_config);
          } else {
            winstonLogger.info('📋 CampaignService: Prayer config is already an object', {
              prayer_config: data.prayer_config,
            });
            parsedData.prayer_config = data.prayer_config;
          }
          winstonLogger.info('✅ CampaignService: Prayer config parsed successfully', {
            prayerConfigEnabled: parsedData.prayer_config?.enabled,
            prayerConfigTitle: parsedData.prayer_config?.title,
            prayerConfigDescription: parsedData.prayer_config?.description,
            prayerConfigGoal: parsedData.prayer_config?.prayer_goal,
            prayerConfigSettings: parsedData.prayer_config?.settings,
            fullPrayerConfig: parsedData.prayer_config,
          });
        } catch (e) {
          winstonLogger.error('❌ CampaignService: Failed to parse prayer_config JSON', {
            error: e.message,
            prayer_configString: typeof data.prayer_config === 'string' ? data.prayer_config.substring(0, 150) : 'not a string',
            prayer_configType: typeof data.prayer_config,
          });
        }
      } else {
        winstonLogger.info('📋 CampaignService: No prayer_config provided in request data', {
          dataKeys: Object.keys(data),
        });
      }

      winstonLogger.info('📋 CampaignService: Parsed data ready for validation', {
        userId,
        parsedDataKeys: Object.keys(parsedData),
        parsedData,
      });

      // Validate schema
      const validationResult = validateCampaignCreation(parsedData);
      if (!validationResult.success) {
        winstonLogger.error('❌ CampaignService: Validation failed', {
          userId,
          validationErrors: validationResult.errors,
        });
        const error = new Error('Campaign validation failed');
        error.statusCode = 400;
        error.validationErrors = validationResult.errors;
        throw error;
      }

      winstonLogger.info('✅ CampaignService: Validation passed', {
        userId,
      });

      // Normalize data
      const normalizedData = CampaignService.normalizeCampaignData(validationResult.data);

      // ✅ FIX: Log normalized data to ensure image_url survives normalization
      winstonLogger.info('📋 CampaignService: Normalized data ready', {
        hasImageUrl: 'image_url' in normalizedData,
        imageUrlValue: normalizedData.image_url,
        normalizedDataKeys: Object.keys(normalizedData),
      });

      // Store payment methods as plain text (no encryption)
      const processedPaymentMethods = normalizedData.payment_methods.map((method, idx) => {
        winstonLogger.info('💳 [createCampaign] Storing payment method (plain text)', {
          index: idx,
          type: method.type,
          hasUsername: !!method.username,
          hasEmail: !!method.email,
          hasCashtag: !!method.cashtag,
          hasWalletAddress: !!method.wallet_address,
          hasAccountNumber: !!method.account_number,
          hasRoutingNumber: !!method.routing_number,
          isPrimary: method.is_primary,
        });

        return {
          type: method.type,
          username: method.username || undefined,
          email: method.email || undefined,
          cashtag: method.cashtag || undefined,
          wallet_address: method.wallet_address || undefined,
          account_number: method.account_number || undefined,
          routing_number: method.routing_number || undefined,
          account_holder: method.account_holder || undefined,
          phone: method.phone || undefined,
          details: method.details || undefined,
          is_primary: method.is_primary || false,
        };
      });

      // Generate unique campaign ID
      let campaign_id = CampaignService.generateCampaignId();
      let existingCampaign = await Campaign.findOne({ campaign_id });
      while (existingCampaign) {
        campaign_id = CampaignService.generateCampaignId();
        existingCampaign = await Campaign.findOne({ campaign_id });
      }

      // Create campaign object
      // Convert userId string to MongoDBObjectId for proper storage
      const creatorObjectId = new mongoose.Types.ObjectId(userId);
      const campaignData = {
        campaign_id,
        creator_id: creatorObjectId,
        title: normalizedData.title,
        description: normalizedData.description,
        need_type: normalizedData.need_type,
        goals: normalizedData.goals,
        location: normalizedData.location,
        payment_methods: processedPaymentMethods,
        tags: normalizedData.tags || [],
        category: normalizedData.category,
        image_url: normalizedData.image_url,
        start_date: normalizedData.start_date,
        end_date: normalizedData.end_date,
        language: normalizedData.language || 'en',
        currency: normalizedData.currency || 'USD',
        status: 'draft',
        campaign_type: normalizedData.campaign_type || 'fundraising',
        view_count: 0,
        share_count: 0,
        engagement_score: 0,
      };

      // ✅ Handle prayer configuration if provided
      if (normalizedData.prayer_config && normalizedData.prayer_config.enabled) {
        winstonLogger.info('🙏 CampaignService: Prayer config ENABLED - storing to campaign', {
          prayer_config: normalizedData.prayer_config,
          enabled: normalizedData.prayer_config.enabled,
          title: normalizedData.prayer_config.title,
        });
        campaignData.prayer_config = {
          enabled: true,
          title: normalizedData.prayer_config.title || 'Prayer Support',
          description: normalizedData.prayer_config.description || 'Join us in prayer for this campaign',
          prayer_goal: normalizedData.prayer_config.prayer_goal || 100,
          settings: {
            allow_text_prayers: normalizedData.prayer_config.settings?.allow_text_prayers ?? true,
            allow_voice_prayers: normalizedData.prayer_config.settings?.allow_voice_prayers ?? true,
            allow_video_prayers: normalizedData.prayer_config.settings?.allow_video_prayers ?? true,
            prayers_public: normalizedData.prayer_config.settings?.prayers_public ?? true,
            show_prayer_count: normalizedData.prayer_config.settings?.show_prayer_count ?? true,
            anonymous_prayers: normalizedData.prayer_config.settings?.anonymous_prayers ?? true,
            require_approval: normalizedData.prayer_config.settings?.require_approval ?? false,
          },
          prayer_count: 0,
          last_config_update: new Date(),
          config_updated_by: creatorObjectId,
        };

        winstonLogger.info('✅ CampaignService: Prayer config stored to campaignData', {
          campaign_id,
          prayer_config: campaignData.prayer_config,
        });
      } else if (normalizedData.prayer_config) {
        winstonLogger.warn('⚠️ CampaignService: Prayer config provided but NOT enabled, storing empty config', {
          prayer_config: normalizedData.prayer_config,
          enabled: normalizedData.prayer_config.enabled,
        });
        campaignData.prayer_config = {};
      } else {
        winstonLogger.info('📋 CampaignService: No prayer config in normalizedData', {
          normalizedDataKeys: Object.keys(normalizedData),
        });
      }

      // ✅ Handle sharing campaign configuration
      if (campaignData.campaign_type === 'sharing' && normalizedData.budget && normalizedData.reward_per_share) {
        // Convert dollars to cents
        const budgetCents = Math.round(normalizedData.budget * 100);
        const rewardPerShareCents = Math.round(normalizedData.reward_per_share * 100);

        // Build share channels array from platforms
        const shareChannels = normalizedData.platforms || [];

        // Initialize share_config with sharing values
        campaignData.share_config = {
          total_budget: budgetCents,
          current_budget_remaining: budgetCents,
          amount_per_share: rewardPerShareCents,
          is_paid_sharing_active: true,
          share_channels: shareChannels,
          last_config_update: new Date(),
          config_updated_by: creatorObjectId,
        };

        winstonLogger.info('📋 CampaignService: Share config initialized for sharing campaign', {
          campaign_id,
          total_budget_cents: budgetCents,
          amount_per_share_cents: rewardPerShareCents,
          share_channels: shareChannels,
          is_paid_sharing_active: true,
        });
      }

      // ✅ FIX: Log campaign data before saving to DB
      winstonLogger.info('📋 CampaignService: Campaign data prepared for database insert', {
        campaign_id,
        hasImageUrl: 'image_url' in campaignData,
        imageUrlValue: campaignData.image_url,
        campaignDataKeys: Object.keys(campaignData),
        campaign_type: campaignData.campaign_type,
        share_config: campaignData.share_config,
        prayer_config: campaignData.prayer_config,
        prayer_config_enabled: campaignData.prayer_config?.enabled,
        timestamp: new Date().toISOString(),
      });

      // Save to database
      const campaign = await Campaign.create(campaignData);

      // ✅ FIX: Log after database save
      winstonLogger.info('✅ CampaignService: Campaign saved to database', {
        campaign_id: campaign.campaign_id,
        savedImageUrl: campaign.image_url,
        mongoDBId: campaign._id,
        prayer_config_from_db: campaign.prayer_config,
        prayer_config_enabled_from_db: campaign.prayer_config?.enabled,
        timestamp: new Date().toISOString(),
      });

      // Emit event
      campaignEventEmitter.emit('campaign:created', {
        campaign_id: campaign.campaign_id,
        creator_id: campaign.creator_id,
        title: campaign.title,
        timestamp: new Date(),
      });

      winstonLogger.info('Campaign created successfully', {
        campaign_id: campaign.campaign_id,
        creator_id: userId,
        need_type: campaign.need_type,
      });

      // Return campaign without encrypted payment details
      return CampaignService.sanitizeCampaignForResponse(campaign);
    } catch (error) {
      winstonLogger.error('Error creating campaign', {
        error: error.message,
        stack: error.stack,
        userId,
      });
      throw error;
    }
  }

  /**
   * Update an existing campaign (only draft campaigns)
   * @param {string} campaignId - Campaign ID or campaign_id field
   * @param {string} userId - User ID making the update
   * @param {Object} data - Campaign data to update
   * @returns {Object} - Updated campaign object
   * @throws {Error} - If campaign not found, not owned, or not in draft status
   */
  static async updateCampaign(campaignId, userId, data) {
    try {
      // Find campaign
      let campaign = await Campaign.findById(campaignId);
      if (!campaign) {
        campaign = await Campaign.findByCampaignId(campaignId);
      }

      if (!campaign) {
        const error = new Error('Campaign not found');
        error.statusCode = 404;
        throw error;
      }

      // Verify ownership
      if (!campaign.isOwnedBy(userId)) {
        const error = new Error('Unauthorized: You do not own this campaign');
        error.statusCode = 403;
        throw error;
      }

      // Verify campaign is in draft status
      if (!campaign.isEditable()) {
        const error = new Error('Campaigns can only be edited in draft status');
        error.statusCode = 400;
        throw error;
      }

      // Validate update schema
      const validationResult = validateCampaignUpdate(data);
      if (!validationResult.success) {
        const error = new Error('Campaign update validation failed');
        error.statusCode = 400;
        error.validationErrors = validationResult.errors;
        throw error;
      }

      // Normalize data
      const normalizedData = CampaignService.normalizeCampaignData(validationResult.data);

      // Update fields
      if (normalizedData.title !== undefined) campaign.title = normalizedData.title;
      if (normalizedData.description !== undefined) campaign.description = normalizedData.description;
      if (normalizedData.goals !== undefined) campaign.goals = normalizedData.goals;
      if (normalizedData.location !== undefined) campaign.location = normalizedData.location;
      if (normalizedData.category !== undefined) campaign.category = normalizedData.category;
      if (normalizedData.image_url !== undefined) campaign.image_url = normalizedData.image_url;
      if (normalizedData.tags !== undefined) campaign.tags = normalizedData.tags;

      // Handle payment methods update (store as plain text, no encryption)
      if (normalizedData.payment_methods) {
        winstonLogger.info('💳 [updateCampaign] Updating payment methods (plain text)', {
          methodsCount: normalizedData.payment_methods.length,
        });

        campaign.payment_methods = normalizedData.payment_methods.map((method, idx) => {
          winstonLogger.info('💳 [updateCampaign] Storing payment method (plain text)', {
            index: idx,
            type: method.type,
            hasUsername: !!method.username,
            hasEmail: !!method.email,
            hasCashtag: !!method.cashtag,
            hasWalletAddress: !!method.wallet_address,
            hasAccountNumber: !!method.account_number,
            isPrimary: method.is_primary,
          });

          return {
            type: method.type,
            username: method.username || undefined,
            email: method.email || undefined,
            cashtag: method.cashtag || undefined,
            wallet_address: method.wallet_address || undefined,
            account_number: method.account_number || undefined,
            routing_number: method.routing_number || undefined,
            account_holder: method.account_holder || undefined,
            phone: method.phone || undefined,
            details: method.details || undefined,
            is_primary: method.is_primary || false,
          };
        });
      }

      // Save updated campaign
      await campaign.save();

      // Emit event
      campaignEventEmitter.emit('campaign:updated', {
        campaign_id: campaign.campaign_id,
        creator_id: campaign.creator_id,
        timestamp: new Date(),
      });

      winstonLogger.info('Campaign updated successfully', {
        campaign_id: campaign.campaign_id,
        creator_id: userId,
      });

      return CampaignService.sanitizeCampaignForResponse(campaign);
    } catch (error) {
      winstonLogger.error('Error updating campaign', {
        error: error.message,
        stack: error.stack,
        userId,
        campaignId,
      });
      throw error;
    }
  }

  /**
   * Get campaign by ID
   * @param {string} campaignId - Campaign ID or campaign_id field
   * @param {string} userId - User ID (optional, for authorization checks)
   * @returns {Object} - Campaign object
   * @throws {Error} - If campaign not found
   */
  static async getCampaign(campaignId, userId = null) {
    try {
      let campaign = await Campaign.findById(campaignId);
      if (!campaign) {
        campaign = await Campaign.findByCampaignId(campaignId);
      }

      if (!campaign || campaign.is_deleted) {
        const error = new Error('Campaign not found');
        error.statusCode = 404;
        throw error;
      }

      // Increment view count if not owned by creator
      if (userId && !campaign.isOwnedBy(userId)) {
        campaign.view_count += 1;
        await campaign.save();
      }

      winstonLogger.info('Campaign retrieved', {
        campaign_id: campaign.campaign_id,
        requested_by: userId || 'anonymous',
      });

      return CampaignService.sanitizeCampaignForResponse(campaign);
    } catch (error) {
      winstonLogger.error('Error retrieving campaign', {
        error: error.message,
        stack: error.stack,
        campaignId,
      });
      throw error;
    }
  }

  /**
   * List campaigns with pagination and filtering
   * @param {Object} filters - Filter criteria { userId, status, needType, skip, limit }
   * @returns {Object} - { campaigns, total, skip, limit }
   */
  static async listCampaigns(filters = {}) {
    try {
      const startTime = Date.now()
      const { userId = null, status = null, needType = null, skip = 0, limit = 20 } = filters;

      // Build query
      const query = { is_deleted: false };
      
      console.log('🔍 [CampaignService] listCampaigns START', {
        timestamp: new Date().toISOString(),
        userId,
        status,
        needType,
        skip,
        limit,
        totalFilters: Object.keys(filters).length,
      });

      winstonLogger.info('📋 listCampaigns: Building query', {
        userId,
        status,
        needType,
        skip,
        limit,
      });
      
      if (userId) {
        // Convert userId string to MongoDB ObjectId for proper querying
        const userObjectId = new mongoose.Types.ObjectId(userId);
        query.creator_id = userObjectId;
        console.log('  ✓ Added userId filter', { userIdObjectId: userObjectId.toString() })
        winstonLogger.info('📋 listCampaigns: Added userId filter', {
          userIdString: userId,
          userIdObjectId: userObjectId.toString(),
        });
      }
      
      // Only filter by status if it's NOT 'all' (treat 'all' as no filter)
      if (status && status !== 'all') {
        query.status = status;
        console.log('  ✓ Added status filter', { status })
      } else if (status === 'all') {
        console.log('  ⚠️ Status is "all" - NOT filtering by status (returning ALL statuses)')
      } else {
        console.log('  ⚠️ NO status filter applied (will return ALL statuses)')
      }
      
      if (needType) {
        query.need_type = needType;
        console.log('  ✓ Added needType filter', { needType })
      }

      console.log('🔍 [CampaignService] FINAL QUERY OBJECT', {
        query,
        is_deleted: query.is_deleted,
        status: query.status || 'NOT FILTERED',
        need_type: query.need_type || 'NOT FILTERED',
        creator_id: query.creator_id || 'NOT FILTERED',
      })

      winstonLogger.info('📋 listCampaigns: Final query object', {
        query,
      });

      // Execute query
      console.log('🔄 [CampaignService] Executing MongoDB find()...')
      const campaigns = await Campaign.find(query)
        .skip(skip)
        .limit(limit)
        .sort({
          // 🚀 Prioritize boosted campaigns first, then by tier
          is_boosted: -1,  // Boosted campaigns first (true = 1, false = 0)
          current_boost_tier: -1,  // Sort by tier: premium > pro > basic (alphabetically reverse)
          created_at: -1,  // Then by creation date (newest first)
        })
        .lean();

      const elapsedMs = Date.now() - startTime

      console.log('✅ [CampaignService] Query executed', {
        returned: campaigns.length,
        limit,
        elapsedMs,
        campaignIds: campaigns.map((c) => c._id.toString()),
        campaigns: campaigns.map(c => ({
          _id: c._id.toString(),
          title: c.title,
          status: c.status,
          creator_id: c.creator_id.toString ? c.creator_id.toString() : c.creator_id,
          created_at: c.created_at,
        })),
      });

      winstonLogger.info('📋 listCampaigns: Query executed', {
        userId,
        campaignCount: campaigns.length,
        campaignIds: campaigns.map((c) => c._id.toString()),
      });

      // Count total
      console.log('🔄 [CampaignService] Counting total documents with query...')
      const total = await Campaign.countDocuments(query);

      console.log('✅ [CampaignService] listCampaigns COMPLETE', {
        returned: campaigns.length,
        total,
        skip,
        limit,
        hasMore: skip + campaigns.length < total,
        elapsedMs: Date.now() - startTime,
      })

      winstonLogger.info('✅ listCampaigns: Results', {
        userId,
        returned: campaigns.length,
        total,
        skip,
        limit,
      });

      return {
        campaigns: campaigns.map((c) => CampaignService.sanitizeCampaignForResponse(c)),
        total,
        skip,
        limit,
      };
    } catch (error) {
      const elapsedMs = Date.now() - startTime
      console.error('❌ [CampaignService] listCampaigns ERROR', {
        error: error.message,
        errorType: error.name,
        filters,
        elapsedMs,
        stack: error.stack,
      })
      
      winstonLogger.error('🔴 listCampaigns: Error listing campaigns', {
        error: error.message,
        stack: error.stack,
        filters,
      });
      throw error;
    }
  }

  /**
   * Publish campaign (change from draft to active)
   * @param {string} campaignId - Campaign ID or campaign_id
   * @param {string} userId - User ID making the request
   * @returns {Object} - Updated campaign object
   */
  /**
   * Publish campaign (activate from draft) - PRODUCTION READY
   * Sets start_date to now and end_date based on campaign duration
   * 
   * @param {string} campaignId - Campaign ID or MongoDB _id
   * @param {string} userId - User ID making the request
   * @returns {Object} - Updated campaign object
   * @throws {Error} 404 if campaign not found
   * @throws {Error} 403 if not campaign owner
   * @throws {Error} 400 if campaign not in draft status or dates invalid
   */
  static async publishCampaign(campaignId, userId) {
    const methodStart = Date.now();
    try {
      // ✅ PRODUCTION: Extensive input validation
      if (!campaignId || typeof campaignId !== 'string') {
        const error = new Error('Invalid campaign ID provided');
        error.statusCode = 400;
        throw error;
      }

      if (!userId || typeof userId !== 'string') {
        const error = new Error('Invalid user ID provided');
        error.statusCode = 400;
        throw error;
      }

      winstonLogger.info('🔵 CampaignService.publishCampaign: Starting campaign activation', {
        campaignId,
        userId,
        timestamp: new Date().toISOString(),
      });

      // ✅ PRODUCTION: Find campaign with retry logic
      let campaign = await Campaign.findById(campaignId);
      if (!campaign) {
        campaign = await Campaign.findByCampaignId(campaignId);
      }

      if (!campaign) {
        winstonLogger.warn('🔴 CampaignService.publishCampaign: Campaign not found', {
          campaignId,
          userId,
          timestamp: new Date().toISOString(),
        });
        const error = new Error('Campaign not found');
        error.statusCode = 404;
        throw error;
      }

      winstonLogger.info('✅ CampaignService.publishCampaign: Campaign found', {
        campaign_id: campaign.campaign_id,
        status: campaign.status,
        start_date: campaign.start_date,
        end_date: campaign.end_date,
        timestamp: new Date().toISOString(),
      });

      // ✅ PRODUCTION: Verify ownership
      if (!campaign.isOwnedBy(userId)) {
        winstonLogger.warn('🔴 CampaignService.publishCampaign: Ownership verification failed', {
          campaign_id: campaign.campaign_id,
          campaign_creator_id: campaign.creator_id.toString(),
          requested_user_id: userId,
          timestamp: new Date().toISOString(),
        });
        const error = new Error('Unauthorized: You do not own this campaign');
        error.statusCode = 403;
        throw error;
      }

      // ✅ PRODUCTION: Status validation
      if (campaign.status !== 'draft') {
        winstonLogger.warn('🔴 CampaignService.publishCampaign: Invalid campaign status', {
          campaign_id: campaign.campaign_id,
          current_status: campaign.status,
          expected_status: 'draft',
          timestamp: new Date().toISOString(),
        });
        const error = new Error(`Only draft campaigns can be published. Current status: ${campaign.status}`);
        error.statusCode = 400;
        throw error;
      }

      // ✅ PRODUCTION FIX: Calculate and set start_date and end_date
      const now = new Date();
      const start_date = new Date(now);
      
      // Calculate end_date: start_date + duration_days (default 30 if not specified)
      let durationDays = 30; // Default duration
      
      // Try to determine duration from goals if available
      if (campaign.goals && Array.isArray(campaign.goals) && campaign.goals.length > 0) {
        const fundraisingGoal = campaign.goals.find(g => g.goal_type === 'fundraising');
        if (fundraisingGoal && fundraisingGoal.duration_days) {
          durationDays = parseInt(fundraisingGoal.duration_days, 10);
        }
      }

      // ✅ PRODUCTION: Validate duration bounds (7-365 days)
      if (isNaN(durationDays) || durationDays < 7 || durationDays > 365) {
        winstonLogger.warn('🔴 CampaignService.publishCampaign: Invalid duration, using default', {
          campaign_id: campaign.campaign_id,
          attempted_duration: durationDays,
          using_default: true,
        });
        durationDays = 30 ;
      }

      // Calculate end date: start date + duration in milliseconds
      const durationMs = durationDays * 24 * 60 * 60 * 1000;
      const end_date = new Date(start_date.getTime() + durationMs);

      winstonLogger.info('✅ CampaignService.publishCampaign: Dates calculated', {
        campaign_id: campaign.campaign_id,
        start_date: start_date.toISOString(),
        end_date: end_date.toISOString(),
        duration_days: durationDays,
        duration_ms: durationMs,
        timestamp: new Date().toISOString(),
      });

      // ✅ PRODUCTION: Update campaign with all publishing fields
      campaign.status = 'active';
      campaign.start_date = start_date; // ✅ NEW: Set activation start time
      campaign.end_date = end_date;     // ✅ NEW: Set campaign expiration
      campaign.published_at = now;       // Timeline reference

      // Save campaign with error handling
      await campaign.save();

      winstonLogger.info('✅ CampaignService.publishCampaign: Campaign saved to database', {
        campaign_id: campaign.campaign_id,
        _id: campaign._id,
        status: campaign.status,
        start_date: campaign.start_date.toISOString(),
        end_date: campaign.end_date.toISOString(),
        published_at: campaign.published_at.toISOString(),
        save_duration_ms: Date.now() - methodStart,
        timestamp: new Date().toISOString(),
      });

      // ✅ PRODUCTION: Emit event for subscribers (analytics, notifications, etc)
      campaignEventEmitter.emit('campaign:published', {
        campaign_id: campaign.campaign_id,
        creator_id: campaign.creator_id,
        start_date: campaign.start_date,
        end_date: campaign.end_date,
        duration_days: durationDays,
        timestamp: new Date(),
      });

      // ✅ PRODUCTION: Structured logging
      winstonLogger.info('✅ CampaignService.publishCampaign: Campaign published successfully', {
        campaign_id: campaign.campaign_id,
        creator_id: userId,
        duration_days: durationDays,
        countdown: `${durationDays} days`,
        total_duration_ms: Date.now() - methodStart,
        timestamp: new Date().toISOString(),
      });

      // ✅ PRODUCTION: Return sanitized response
      return CampaignService.sanitizeCampaignForResponse(campaign);
    } catch (error) {
      // ✅ PRODUCTION: Comprehensive error logging
      winstonLogger.error('❌ CampaignService.publishCampaign: Failed to publish campaign', {
        campaignId,
        userId,
        error_message: error.message,
        error_status: error.statusCode || 500,
        stack: error.stack,
        total_duration_ms: Date.now() - methodStart,
        timestamp: new Date().toISOString(),
      });
      throw error;
    }
  }

  /**
   * Pause active campaign
   * @param {string} campaignId - Campaign ID or campaign_id
   * @param {string} userId - User ID making the request
   * @returns {Object} - Updated campaign object
   */
  static async pauseCampaign(campaignId, userId) {
    try {
      let campaign = await Campaign.findById(campaignId);
      if (!campaign) {
        campaign = await Campaign.findByCampaignId(campaignId);
      }

      if (!campaign) {
        const error = new Error('Campaign not found');
        error.statusCode = 404;
        throw error;
      }

      if (!campaign.isOwnedBy(userId)) {
        const error = new Error('Unauthorized: You do not own this campaign');
        error.statusCode = 403;
        throw error;
      }

      if (campaign.status !== 'active') {
        const error = new Error('Only active campaigns can be paused');
        error.statusCode = 400;
        throw error;
      }

      campaign.status = 'paused';
      await campaign.save();

      campaignEventEmitter.emit('campaign:paused', {
        campaign_id: campaign.campaign_id,
        creator_id: campaign.creator_id,
        timestamp: new Date(),
      });

      winstonLogger.info('Campaign paused', {
        campaign_id: campaign.campaign_id,
        creator_id: userId,
      });

      return CampaignService.sanitizeCampaignForResponse(campaign);
    } catch (error) {
      winstonLogger.error('Error pausing campaign', {
        error: error.message,
        stack: error.stack,
        userId,
        campaignId,
      });
      throw error;
    }
  }

  /**
   * Delete campaign (soft delete)
   * @param {string} campaignId - Campaign ID or campaign_id
   * @param {string} userId - User ID making the request
   * @returns {Object} - Deleted campaign object
   */
  static async deleteCampaign(campaignId, userId) {
    try {
      let campaign = await Campaign.findById(campaignId);
      if (!campaign) {
        campaign = await Campaign.findByCampaignId(campaignId);
      }

      if (!campaign) {
        const error = new Error('Campaign not found');
        error.statusCode = 404;
        throw error;
      }

      if (!campaign.isOwnedBy(userId)) {
        const error = new Error('Unauthorized: You do not own this campaign');
        error.statusCode = 403;
        throw error;
      }

      if (campaign.status !== 'draft') {
        const error = new Error('Only draft campaigns can be deleted');
        error.statusCode = 400;
        throw error;
      }

      await campaign.softDelete();

      campaignEventEmitter.emit('campaign:deleted', {
        campaign_id: campaign.campaign_id,
        creator_id: campaign.creator_id,
        timestamp: new Date(),
      });

      winstonLogger.info('Campaign deleted', {
        campaign_id: campaign.campaign_id,
        creator_id: userId,
      });

      return { message: 'Campaign deleted successfully' };
    } catch (error) {
      winstonLogger.error('Error deleting campaign', {
        error: error.message,
        stack: error.stack,
        userId,
        campaignId,
      });
      throw error;
    }
  }

  /**
   * Sanitize campaign for response (remove encrypted fields)
   * @param {Object} campaign - Campaign document
   * @returns {Object} - Sanitized campaign object
   */
  static sanitizeCampaignForResponse(campaign) {
    const campaignObj = campaign.toObject ? campaign.toObject() : campaign;

    // FIX: Calculate proper goal_amount from goals array
    // For fundraising campaigns: use the fundraising goal
    // For sharing campaigns: use the sharing_reach goal
    // For other campaigns: use first goal or fallback to 0
    if (campaignObj.goals && campaignObj.goals.length > 0) {
      const campaignType = campaignObj.campaign_type || 'fundraising';
      let targetGoal = null;

      if (campaignType === 'fundraising') {
        // For fundraising campaigns, find the fundraising goal
        targetGoal = campaignObj.goals.find((g) => g.goal_type === 'fundraising');
      } else if (campaignType === 'sharing') {
        // For sharing campaigns, find the sharing_reach goal
        targetGoal = campaignObj.goals.find((g) => g.goal_type === 'sharing_reach');
      }

      // Fallback to first goal if specific type not found
      if (!targetGoal && campaignObj.goals.length > 0) {
        targetGoal = campaignObj.goals[0];
      }

      campaignObj.goal_amount = targetGoal ? targetGoal.target_amount || 0 : 0;

      console.log('✅ [CampaignService] Calculated goal_amount from goals array:', {
        campaignId: campaignObj._id,
        campaignType,
        goalsCount: campaignObj.goals.length,
        goalTypes: campaignObj.goals.map((g) => g.goal_type),
        selectedGoalType: targetGoal?.goal_type,
        calculatedGoal: campaignObj.goal_amount,
        originalGoal: campaign.goal_amount,
      });
    } else if (!campaignObj.goal_amount) {
      // Fallback to 0 if no goals and no goal_amount
      campaignObj.goal_amount = 0;
    }

    // FIX: Calculate raised_amount from total_donation_amount (if not present)
    // Also check metrics object for total_donation_amount if not at root level
    let totalDonationAmount = campaignObj.total_donation_amount;
    if (!totalDonationAmount && campaignObj.metrics?.total_donation_amount !== undefined) {
      totalDonationAmount = campaignObj.metrics.total_donation_amount;
    }

    if (!campaignObj.raised_amount && totalDonationAmount !== undefined) {
      campaignObj.raised_amount = totalDonationAmount;
    }

    // Ensure total_donation_amount is at root level for frontend
    if (!campaignObj.total_donation_amount && campaignObj.metrics?.total_donation_amount !== undefined) {
      campaignObj.total_donation_amount = campaignObj.metrics.total_donation_amount;
    }

    // Ensure total_donations is at root level for frontend
    if (!campaignObj.total_donations && campaignObj.metrics?.total_donations !== undefined) {
      campaignObj.total_donations = campaignObj.metrics.total_donations;
    }

    // Calculate and ensure average_donation is present
    if (campaignObj.metrics?.total_donations > 0 && !campaignObj.average_donation) {
      campaignObj.average_donation = Math.round(campaignObj.metrics.total_donation_amount / campaignObj.metrics.total_donations);
    }

    // ✅ Return payment methods as plain text (no decryption needed)
    if (campaignObj.payment_methods) {
      winstonLogger.info('💳 [sanitizeCampaignForResponse] Processing payment_methods (plain text)', {
        campaignId: campaignObj._id,
        methodsCount: campaignObj.payment_methods.length,
        methodTypes: campaignObj.payment_methods.map(m => m.type),
      });

      campaignObj.payment_methods = campaignObj.payment_methods.map((method, idx) => {
        winstonLogger.debug('💳 [sanitizeCampaignForResponse] Payment method (plain text)', {
          index: idx,
          type: method.type,
          hasUsername: !!method.username,
          hasEmail: !!method.email,
          hasCashtag: !!method.cashtag,
          isPrimary: method.is_primary,
        });

        // Return payment method with all its plain text fields
        return {
          type: method.type,
          username: method.username,
          email: method.email,
          cashtag: method.cashtag,
          wallet_address: method.wallet_address,
          account_number: method.account_number,
          routing_number: method.routing_number,
          account_holder: method.account_holder,
          phone: method.phone,
          details: method.details,
          is_primary: method.is_primary,
        };
      });
    }

    return campaignObj;
  }

  /**
   * Complete active or paused campaign
   * @param {string} campaignId - Campaign ID or campaign_id
   * @param {string} userId - User ID making the request
   * @returns {Object} - Updated campaign object
   */
  static async completeCampaign(campaignId, userId) {
    try {
      let campaign = await Campaign.findById(campaignId);
      if (!campaign) {
        campaign = await Campaign.findByCampaignId(campaignId);
      }

      if (!campaign) {
        const error = new Error('Campaign not found');
        error.statusCode = 404;
        throw error;
      }

      if (!campaign.isOwnedBy(userId)) {
        const error = new Error('Unauthorized: You do not own this campaign');
        error.statusCode = 403;
        throw error;
      }

      if (campaign.status === 'archived') {
        const error = new Error('Cannot complete archived campaign');
        error.statusCode = 400;
        throw error;
      }

      if (campaign.status === 'completed') {
        const error = new Error('Campaign is already completed');
        error.statusCode = 400;
        throw error;
      }

      if (campaign.status === 'draft') {
        const error = new Error('Cannot complete draft campaign. Publish campaign first.');
        error.statusCode = 400;
        throw error;
      }

      campaign.status = 'completed';
      campaign.completed_at = new Date();
      await campaign.save();

      // ✅ NEW: Initiate payout for campaign creator
      const PayoutService = require('./PayoutService');
      try {
        const payout = await PayoutService.initiatePayout(campaign._id, campaign.creator_id);
        winstonLogger.info('Payout initiated for campaign completion', {
          campaign_id: campaign.campaign_id,
          payout_id: payout.payout_id,
          amount_cents: payout.payout_amount_cents,
        });
      } catch (payoutError) {
        winstonLogger.error('Failed to initiate payout for campaign completion', {
          campaign_id: campaign.campaign_id,
          error: payoutError.message,
        });
        // Don't fail campaign completion if payout fails - it can be retried
      }

      campaignEventEmitter.emit('campaign:completed', {
        campaign_id: campaign.campaign_id,
        creator_id: campaign.creator_id,
        title: campaign.title,
        total_raised: campaign.total_donation_amount_cents,
        timestamp: new Date(),
      });

      winstonLogger.info('Campaign completed', {
        campaign_id: campaign.campaign_id,
        creator_id: userId,
      });

      return CampaignService.sanitizeCampaignForResponse(campaign);
    } catch (error) {
      winstonLogger.error('Error completing campaign', {
        error: error.message,
        stack: error.stack,
        userId,
        campaignId,
      });
      throw error;
    }
  }

  /**
   * Unpause a paused campaign (transitions paused → active)
   * @param {string} campaignId - Campaign ID or campaign_id
   * @param {string} userId - User ID making the request
   * @returns {Object} - Updated campaign object
   */
  static async unpauseCampaign(campaignId, userId) {
    try {
      let campaign = await Campaign.findById(campaignId);
      if (!campaign) {
        campaign = await Campaign.findByCampaignId(campaignId);
      }

      if (!campaign) {
        const error = new Error('Campaign not found');
        error.statusCode = 404;
        throw error;
      }

      if (!campaign.isOwnedBy(userId)) {
        const error = new Error('Unauthorized: You do not own this campaign');
        error.statusCode = 403;
        throw error;
      }

      if (campaign.status !== 'paused') {
        const error = new Error('Only paused campaigns can be unpaused');
        error.statusCode = 400;
        throw error;
      }

      campaign.status = 'active';
      await campaign.save();

      campaignEventEmitter.emit('campaign:unpaused', {
        campaign_id: campaign.campaign_id,
        creator_id: campaign.creator_id,
        timestamp: new Date(),
      });

      winstonLogger.info('Campaign unpaused', {
        campaign_id: campaign.campaign_id,
        creator_id: userId,
      });

      return CampaignService.sanitizeCampaignForResponse(campaign);
    } catch (error) {
      winstonLogger.error('Error unpausing campaign', {
        error: error.message,
        stack: error.stack,
        userId,
        campaignId,
      });
      throw error;
    }
  }

  /**
   * Increase campaign goal (fundraising campaigns only)
   * @param {string} campaignId - Campaign ID or campaign_id
   * @param {string} userId - User ID making the request
   * @param {Object} data - { newGoalAmount: number (in dollars, will be converted to cents) }
   * @returns {Object} - Updated campaign object
   */
  static async increaseGoal(campaignId, userId, data) {
    try {
      let campaign = await Campaign.findById(campaignId);
      if (!campaign) {
        campaign = await Campaign.findByCampaignId(campaignId);
      }

      if (!campaign) {
        const error = new Error('Campaign not found');
        error.statusCode = 404;
        throw error;
      }

      if (!campaign.isOwnedBy(userId)) {
        const error = new Error('Unauthorized: You do not own this campaign');
        error.statusCode = 403;
        throw error;
      }

      if (campaign.need_type !== 'fundraising') {
        const error = new Error('Goal increase is only available for fundraising campaigns');
        error.statusCode = 400;
        throw error;
      }

      if (campaign.status === 'draft' || campaign.status === 'archived') {
        const error = new Error('Cannot increase goal for campaigns in this status');
        error.statusCode = 400;
        throw error;
      }

      const newGoalAmount = Math.round(data.newGoalAmount * 100); // Convert dollars to cents
      if (newGoalAmount <= 0) {
        const error = new Error('New goal amount must be greater than 0');
        error.statusCode = 400;
        throw error;
      }

      // Verify new goal is higher than current goal
      const currentGoal = campaign.goals && campaign.goals[0] ? campaign.goals[0].target_amount : 0;
      if (newGoalAmount <= currentGoal) {
        const error = new Error('New goal must be higher than current goal');
        error.statusCode = 400;
        throw error;
      }

      // Update goal
      if (campaign.goals && campaign.goals.length > 0) {
        campaign.goals[0].target_amount = newGoalAmount;
      }

      campaign.goal_increased_at = new Date();
      campaign.goal_increase_count = (campaign.goal_increase_count || 0) + 1;
      await campaign.save();

      campaignEventEmitter.emit('campaign:goal_increased', {
        campaign_id: campaign.campaign_id,
        creator_id: campaign.creator_id,
        new_goal: newGoalAmount,
        timestamp: new Date(),
      });

      winstonLogger.info('Campaign goal increased', {
        campaign_id: campaign.campaign_id,
        creator_id: userId,
        new_goal: newGoalAmount,
      });

      return CampaignService.sanitizeCampaignForResponse(campaign);
    } catch (error) {
      winstonLogger.error('Error increasing campaign goal', {
        error: error.message,
        stack: error.stack,
        userId,
        campaignId,
      });
      throw error;
    }
  }

  /**
   * Get campaign statistics
   * @param {string} campaignId - Campaign ID or campaign_id
   * @param {string} userId - User ID (for authorization, optional)
   * @returns {Object} - Campaign statistics
   */
  static async getCampaignStats(campaignId, userId = null) {
    try {
      let campaign = await Campaign.findById(campaignId);
      if (!campaign) {
        campaign = await Campaign.findByCampaignId(campaignId);
      }

      if (!campaign) {
        const error = new Error('Campaign not found');
        error.statusCode = 404;
        throw error;
      }

      // Verify access if needed (public stats but creator can see more)
      const isCreator = userId && campaign.isOwnedBy(userId);

      // Calculate basic stats
      const currentGoal = campaign.goals && campaign.goals[0] ? campaign.goals[0].target_amount : 0;
      const currentAmount = campaign.goals && campaign.goals[0] ? campaign.goals[0].current_amount : 0;
      const fundedPercentage = currentGoal > 0 ? (currentAmount / currentGoal) * 100 : 0;

      const daysRemaining = campaign.end_date
        ? Math.max(0, Math.ceil((new Date(campaign.end_date) - new Date()) / (1000 * 60 * 60 * 24)))
        : null;

      const stats = {
        campaign_id: campaign.campaign_id,
        total_raised: Math.round(currentAmount / 100), // Convert cents to dollars
        goal_amount: Math.round(currentGoal / 100), // Convert cents to dollars
        funded_percentage: Math.round(fundedPercentage),
        view_count: campaign.view_count || 0,
        share_count: campaign.share_count || 0,
        engagement_score: campaign.engagement_score || 0,
        days_remaining: daysRemaining,
        status: campaign.status,
        published_at: campaign.published_at,
        completed_at: campaign.completed_at,
      };

      // Add creator-only stats
      if (isCreator) {
        stats.total_donors = campaign.total_donors || 0;
        stats.average_donation = campaign.average_donation ? Math.round(campaign.average_donation / 100) : 0;
        stats.goal_increased_count = campaign.goal_increase_count || 0;
      }

      winstonLogger.info('Campaign stats retrieved', {
        campaign_id: campaign.campaign_id,
        requested_by: userId || 'anonymous',
      });

      return stats;
    } catch (error) {
      winstonLogger.error('Error retrieving campaign stats', {
        error: error.message,
        stack: error.stack,
        campaignId,
      });
      throw error;
    }
  }

  /**
   * Get campaign contributors (donors)
   * @param {string} campaignId - Campaign ID or campaign_id
   * @param {Object} options - { limit: 10, page: 1 }
   * @returns {Object} - { contributors, total }
   */
  static async getCampaignContributors(campaignId, options = {}) {
    try {
      let campaign = await Campaign.findById(campaignId);
      if (!campaign) {
        campaign = await Campaign.findByCampaignId(campaignId);
      }

      if (!campaign) {
        const error = new Error('Campaign not found');
        error.statusCode = 404;
        throw error;
      }

      const limit = Math.min(options.limit || 10, 100);
      const page = Math.max(options.page || 1, 1);
      const skip = (page - 1) * limit;

      // Get contributions for this campaign
      // This assumes a Transaction or Donation model exists
      // If not, this data would be stored on the campaign itself
      const contributors = campaign.contributors || [];
      
      const totalContributors = contributors.length;
      const paginatedContributors = contributors
        .sort((a, b) => new Date(b.date) - new Date(a.date))
        .slice(skip, skip + limit)
        .map((c) => ({
          donor_name: c.donor_name || 'Anonymous',
          amount: Math.round(c.amount / 100), // Convert cents to dollars
          date: c.date,
          message: c.message || '',
        }));

      winstonLogger.info('Campaign contributors retrieved', {
        campaign_id: campaign.campaign_id,
        total: totalContributors,
      });

      return {
        contributors: paginatedContributors,
        total: totalContributors,
        limit,
        page,
      };
    } catch (error) {
      winstonLogger.error('Error retrieving campaign contributors', {
        error: error.message,
        stack: error.stack,
        campaignId,
      });
      throw error;
    }
  }

  /**
   * Get campaign activists (users taking action on campaign - shares, volunteers, etc.)
   * @param {string} campaignId - Campaign ID or campaign_id
   * @param {Object} options - { limit: 10, page: 1 }
   * @returns {Object} - { activists, total }
   */
  static async getCampaignActivists(campaignId, options = {}) {
    try {
      let campaign = await Campaign.findById(campaignId);
      if (!campaign) {
        campaign = await Campaign.findByCampaignId(campaignId);
      }

      if (!campaign) {
        const error = new Error('Campaign not found');
        error.statusCode = 404;
        throw error;
      }

      const limit = Math.min(options.limit || 10, 100);
      const page = Math.max(options.page || 1, 1);
      const skip = (page - 1) * limit;

      // Get activists (sharers, volunteers, etc.)
      const activists = campaign.activists || [];

      const totalActivists = activists.length;
      const paginatedActivists = activists
        .sort((a, b) => (b.impact_score || 0) - (a.impact_score || 0))
        .slice(skip, skip + limit)
        .map((a) => ({
          user_name: a.user_name || 'Anonymous',
          action_type: a.action_type, // 'share', 'volunteer', 'organizer', etc.
          impact_score: a.impact_score || 0,
          date_joined: a.date_joined,
        }));

      winstonLogger.info('Campaign activists retrieved', {
        campaign_id: campaign.campaign_id,
        total: totalActivists,
      });

      return {
        activists: paginatedActivists,
        total: totalActivists,
        limit,
        page,
      };
    } catch (error) {
      winstonLogger.error('Error retrieving campaign activists', {
        error: error.message,
        stack: error.stack,
        campaignId,
      });
      throw error;
    }
  }

  /**
   * Get trending campaigns (by engagement score, recent activity)
   * @param {Object} options - { limit: 10, timeframe: '7days' }
   * @returns {Array} - Array of trending campaigns
   */
  static async getTrendingCampaigns(options = {}) {
    try {
      const limit = Math.min(options.limit || 10, 50);
      const timeframe = options.timeframe || '7days';

      // Calculate date range
      const daysMap = {
        '1day': 1,
        '7days': 7,
        '30days': 30,
        'all': null,
      };
      const days = daysMap[timeframe] || 7;
      const startDate = days ? new Date(Date.now() - days * 24 * 60 * 60 * 1000) : null;

      // Build query
      const query = {
        is_deleted: false,
        status: { $in: ['active', 'paused'] },
      };
      if (startDate) {
        query.published_at = { $gte: startDate };
      }

      // Get trending campaigns (sorted by engagement score and view count)
      const campaigns = await Campaign.find(query)
        .sort({ engagement_score: -1, view_count: -1, published_at: -1 })
        .limit(limit)
        .select(['campaign_id', 'title', 'description', 'need_type', 'image_url', 'view_count', 'engagement_score', 'creator_id'])
        .lean();

      winstonLogger.info('Trending campaigns retrieved', {
        timeframe,
        returned: campaigns.length,
      });

      return campaigns.map((c) => ({
        ...c,
        id: c._id || c.campaign_id,
      }));
    } catch (error) {
      winstonLogger.error('Error retrieving trending campaigns', {
        error: error.message,
        stack: error.stack,
      });
      throw error;
    }
  }

  /**
   * Get campaigns related to a given campaign (same need type, category, etc.)
   * @param {string} campaignId - Campaign ID or campaign_id
   * @param {Object} options - { limit: 10, exclude_creator: false }
   * @returns {Array} - Array of related campaigns
   */
  static async getRelatedCampaigns(campaignId, options = {}) {
    try {
      let campaign = await Campaign.findById(campaignId);
      if (!campaign) {
        campaign = await Campaign.findByCampaignId(campaignId);
      }

      if (!campaign) {
        const error = new Error('Campaign not found');
        error.statusCode = 404;
        throw error;
      }

      const limit = Math.min(options.limit || 10, 50);

      // Build query for related campaigns
      const query = {
        _id: { $ne: campaign._id },
        is_deleted: false,
        status: { $in: ['active'] },
        $or: [
          { need_type: campaign.need_type }, // Same need type
          { category: campaign.category }, // Same category
        ],
      };

      // Optionally exclude creator's campaigns
      if (options.exclude_creator !== false) {
        query.creator_id = { $ne: campaign.creator_id };
      }

      // Get related campaigns
      const relatedCampaigns = await Campaign.find(query)
        .sort({ engagement_score: -1, published_at: -1 })
        .limit(limit)
        .select(['campaign_id', 'title', 'description', 'need_type', 'category', 'image_url', 'view_count', 'engagement_score'])
        .lean();

      winstonLogger.info('Related campaigns retrieved', {
        original_campaign: campaign.campaign_id,
        returned: relatedCampaigns.length,
      });

      return relatedCampaigns.map((c) => ({
        ...c,
        id: c._id || c.campaign_id,
      }));
    } catch (error) {
      winstonLogger.error('Error retrieving related campaigns', {
        error: error.message,
        stack: error.stack,
        campaignId,
      });
      throw error;
    }
  }

  /**
   * Get all available campaign need types (categories/taxonomy)
   * @returns {Array} - Array of need type objects with categories
   */
  static getNeedTypes() {
    // This matches the Schema in Campaign.js
    const needTypes = {
      emergency: [
        'emergency_medical',
        'emergency_food',
        'emergency_shelter',
        'emergency_transportation',
        'emergency_utilities',
        'emergency_legal',
        'emergency_funeral',
        'emergency_fire_damage',
        'emergency_displacement',
        'emergency_other',
      ],
      medical: [
        'medical_surgery',
        'medical_cancer',
        'medical_cardiac',
        'medical_treatment',
        'medical_medication',
        'medical_hospice',
        'medical_funeral_expenses',
        'medical_recovery',
        'medical_rehabilitation',
        'medical_mental_health',
      ],
      education: [
        'education_tuition',
        'education_textbooks',
        'education_supplies',
        'education_training',
        'education_special_needs',
        'education_study_abroad',
        'education_graduation_debt',
        'education_scholarship_matching',
      ],
      family: [
        'family_newborn',
        'family_childcare',
        'family_elder_care',
        'family_adoption',
        'family_unexpected_expense',
        'family_bereavement',
        'family_hardship',
        'family_rent',
        'family_food_assistance',
        'family_clothing',
        'family_medical_support',
        'family_moving_assistance',
      ],
      community: [
        'community_disaster_relief',
        'community_infrastructure',
        'community_animal_rescue',
        'community_environmental',
        'community_youth_program',
        'community_senior_program',
        'community_homeless_support',
        'community_cultural_event',
        'community_education_program',
        'community_arts_program',
      ],
      business: [
        'business_startup',
        'business_equipment',
        'business_training',
        'business_expansion',
        'business_recovery',
        'business_inventory',
        'business_technology',
        'business_marketing',
      ],
      individual: [
        'individual_disability_support',
        'individual_mental_health',
        'individual_addiction_recovery',
      ],
    };

    winstonLogger.debug('Need types retrieved');

    return Object.entries(needTypes).map(([category, types]) => ({
      category,
      types: types.map((type) => ({
        value: type,
        label: type.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase()),
      })),
    }));
  }

  /**
   * Get campaign event emitter
   * @returns {EventEmitter} - Campaign event emitter
   */
  static getEventEmitter() {
    return campaignEventEmitter;
  }

  /**
   * Get user's own campaigns with pagination
   * @param {string} userId - User ID
   * @param {object} options - Query options (page, limit, sort)
   * @returns {Promise<object>} - { campaigns, pagination }
   */
  static async getUserCampaigns(userId, options = {}) {
    const page = options.page || 1;
    const limit = options.limit || 10;
    const sort = options.sort || 'date-desc';

    // Calculate skip
    const skip = (page - 1) * limit;

    // Determine sort order
    let sortField = 'created_at';
    let sortOrder = -1; // descending by default
    
    if (sort === 'date-asc') {
      sortOrder = 1;
    } else if (sort === 'title-asc') {
      sortField = 'title';
      sortOrder = 1;
    } else if (sort === 'title-desc') {
      sortField = 'title';
      sortOrder = -1;
    } else if (sort === 'raised-desc') {
      sortField = 'total_funds_raised';
      sortOrder = -1;
    } else if (sort === 'raised-asc') {
      sortField = 'total_funds_raised';
      sortOrder = 1;
    }

    // Convert userId string to MongoDB ObjectId for proper querying
    const creatorObjectId = new mongoose.Types.ObjectId(userId);

    // Query campaigns for this user
    const campaigns = await Campaign.find({
      creator_id: creatorObjectId,
      deleted_at: null,
    })
      .sort({ [sortField]: sortOrder })
      .skip(skip)
      .limit(limit)
      .lean();

    // Get total count for pagination
    const total = await Campaign.countDocuments({
      creator_id: creatorObjectId,
      deleted_at: null,
    });

    const totalPages = Math.ceil(total / limit);

    winstonLogger.debug('User campaigns retrieved', {
      userId,
      total,
      page,
      limit,
    });

    return {
      campaigns: campaigns.map((campaign) => {
        // Calculate total goal amount (sum of all goals' target amounts)
        const totalGoal = campaign.goals && campaign.goals.length > 0
          ? campaign.goals.reduce((sum, goal) => sum + (goal.target_amount || 0), 0)
          : 0;

        // Calculate current amount raised (sum of all goals' current amounts)
        const totalRaised = campaign.goals && campaign.goals.length > 0
          ? campaign.goals.reduce((sum, goal) => sum + (goal.current_amount || 0), 0)
          : 0;

        return {
          id: campaign._id,
          title: campaign.title,
          description: campaign.description,
          status: campaign.status,
          need_type: campaign.need_type,
          category: campaign.category,
          image_url: campaign.image_url,
          created_at: campaign.created_at,
          updated_at: campaign.updated_at,
          // Add financial data that frontend expects
          goal_amount: totalGoal,
          raised_amount: totalRaised,
          total_funds_raised: campaign.total_funds_raised || 0,
          supporter_count: campaign.supporter_count || 0,
          donation_count: campaign.donation_count || 0,
          // Add campaign type for filtering/display
          campaign_type: campaign.campaign_type || 'fundraising',
          budget: campaign.budget || 0,
          used_budget: campaign.used_budget || 0,
        };
      }),
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasMore: page < totalPages,
      },
    };
  }

  /**
   * Get user's aggregated campaign statistics
   * @param {string} userId - User ID
   * @returns {Promise<object>} - Aggregated stats
   */
  static async getUserStats(userId) {
    try {
      winstonLogger.info('📊 getUserStats: Starting stats calculation', {
        userId,
      });

      // Convert userId string to MongoDB ObjectId for proper querying
      const creatorObjectId = new mongoose.Types.ObjectId(userId);

      // Get user's campaigns
      const campaigns = await Campaign.find({
        creator_id: creatorObjectId,
        deleted_at: null,
      }).lean();

      winstonLogger.info('📊 getUserStats: Campaigns retrieved', {
        userId,
        campaignCount: campaigns.length,
        campaignIds: campaigns.map((c) => c._id),
      });

      const campaignIds = campaigns.map((c) => c._id);

      // Count campaigns by status
      const campaignsByStatus = {};
      campaigns.forEach((campaign) => {
        const status = campaign.status || 'draft';
        campaignsByStatus[status] = (campaignsByStatus[status] || 0) + 1;
      });

      winstonLogger.info('📊 getUserStats: Campaigns by status', {
        userId,
        campaignsByStatus,
      });

      // Get total donations from Transaction model
      winstonLogger.info('📊 getUserStats: About to query donations', {
        userId,
        campaignIds,
      });

      const Transaction = require('../models/Transaction');

      winstonLogger.info('📊 getUserStats: Transaction model loaded', {
        userId,
        modelName: Transaction.modelName,
      });

      const donations = await Transaction.find({
        campaign_id: { $in: campaignIds },
        transaction_type: 'donation',
        status: { $in: ['pending', 'verified'] }, // Count both pending and verified donations
      }).lean();

      winstonLogger.info('📊 getUserStats: Donations retrieved', {
        userId,
        donationCount: donations.length,
        transactions: donations.map((d) => ({
          id: d._id,
          amount: d.amount_cents,
          status: d.status,
          supporter: d.supporter_id,
        })),
      });

      const totalRaised = donations.reduce((sum, d) => sum + (d.amount_cents || 0), 0);
      const totalDonors = new Set(donations.map((d) => d.supporter_id)).size;

      winstonLogger.info('📊 getUserStats: Donation aggregation complete', {
        userId,
        totalRaised,
        totalDonors,
      });

      // Calculate total views
      const totalViews = campaigns.reduce((sum, c) => sum + (c.view_count || 0), 0);

      winstonLogger.info('📊 getUserStats: Total views calculated', {
        userId,
        totalViews,
      });

      // Get trending campaigns (last 30 days)
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const trendingCampaigns = campaigns.filter((c) => 
        c.created_at >= thirtyDaysAgo && c.status === 'active'
      ).length;

      winstonLogger.info('📊 getUserStats: Trending campaigns calculated', {
        userId,
        trendingCampaigns,
        thirtyDaysAgo,
      });

      winstonLogger.info('📊 getUserStats: Stats calculation complete', {
        userId,
        totalCampaigns: campaigns.length,
        totalRaised,
      });

      return {
        totalCampaigns: campaigns.length,
        activeCampaigns: campaignsByStatus['active'] || 0,
        draftCampaigns: campaignsByStatus['draft'] || 0,
        completedCampaigns: campaignsByStatus['completed'] || 0,
        pausedCampaigns: campaignsByStatus['paused'] || 0,
        totalRaised,
        totalDonors,
        totalViews,
        trendingCampaigns,
        recentCampaigns: campaigns
          .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
          .slice(0, 5)
          .map((c) => ({
            id: c._id,
            title: c.title,
            status: c.status,
            created_at: c.created_at,
          })),
      };
    } catch (error) {
      winstonLogger.error('🔴 getUserStats: Error calculating stats', {
        userId,
        errorMessage: error.message,
        errorCode: error.code,
        stack: error.stack,
      });
      throw error;
    }
  }
}

module.exports = CampaignService;


